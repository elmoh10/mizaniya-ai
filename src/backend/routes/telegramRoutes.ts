import { Router, Request, Response } from 'express';
import { createHash, randomInt } from 'crypto';
import { db } from '../config/firebaseAdmin';

const router = Router();

const LINK_CODE_EXPIRY_MINUTES = 10;

// ============================================================
// Helpers
// ============================================================

async function sendTelegramMessage(
  chatId: number,
  text: string
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const response = await fetch(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Telegram sendMessage failed: ${response.status} ${errorText}`
    );
  }
}

function generateLinkCode(): string {
  return randomInt(100000, 1000000).toString();
}

function hashLinkCode(code: string): string {
  return createHash('sha256')
    .update(code)
    .digest('hex');
}

// ============================================================
// Telegram Webhook
// POST /telegram/webhook
// ============================================================

router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const update = req.body;

    console.log(
      'Telegram update received:',
      JSON.stringify(update)
    );

    const message = update?.message;

    if (!message) {
      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    const chatId = message.chat?.id;
    const telegramUserId = message.from?.id;
    const text = message.text?.trim();

    if (!chatId || !telegramUserId) {
      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    // ========================================================
    // /start
    // ========================================================

    if (text === '/start') {
      await sendTelegramMessage(
        chatId,
        `أهلاً بيك في ميزانية AI 🤖💚

أنا المساعد المالي الذكي الخاص بيك.

علشان أقدر أوصل لميزانيتك ومصاريفك وديونك بأمان، لازم تربط حساب Telegram بحساب Mizaniya AI.

اكتب:
/link

وهطلع لك كود ربط مؤقت 🔐`
      );

      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    // ========================================================
    // /link
    // ========================================================

    if (text === '/link') {
      const code = generateLinkCode();
      const codeHash = hashLinkCode(code);

      const now = Date.now();
      const expiresAt =
        now + LINK_CODE_EXPIRY_MINUTES * 60 * 1000;

      // Delete old pending link codes for this Telegram user
      const oldCodesSnapshot = await db
        .collection('telegram_link_codes')
        .where('telegramUserId', '==', telegramUserId)
        .where('used', '==', false)
        .get();

      const batch = db.batch();

      oldCodesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      if (!oldCodesSnapshot.empty) {
        await batch.commit();
      }

      // Store hashed code only.
      // The plain 6-digit code is sent to Telegram but never stored.
      await db
        .collection('telegram_link_codes')
        .doc(codeHash)
        .set({
          telegramUserId,
          chatId,

          telegramUsername:
            message.from?.username || null,

          telegramFirstName:
            message.from?.first_name || null,

          telegramLastName:
            message.from?.last_name || null,

          used: false,

          createdAt: now,
          expiresAt,
        });

      await sendTelegramMessage(
        chatId,
        `🔐 كود ربط حساب Mizaniya AI:

${code}

الكود صالح لمدة ${LINK_CODE_EXPIRY_MINUTES} دقائق فقط.

افتح موقع Mizaniya AI وسجّل دخولك، وبعدها هنستخدم الكود ده لربط حسابك.

⚠️ ما تبعتش الكود لأي شخص.`
      );

      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    // ========================================================
    // Temporary response for other messages
    // ========================================================

    if (text) {
      await sendTelegramMessage(
        chatId,
        `وصلتني رسالتك ✅

لكن حساب Telegram بتاعك لازم يتربط بحساب Mizaniya AI الأول.

اكتب:
/link`
      );
    }

    return res.status(200).json({
      success: true,
      received: true,
    });
  } catch (error: any) {
    console.error(
      'Telegram webhook error:',
      error
    );

    // Return 200 during Telegram processing to prevent retry storms.
    return res.status(200).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// Setup Webhook
// POST /telegram/setup
// ============================================================

router.post('/setup', async (_req: Request, res: Response) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured',
      });
    }

    const webhookUrl =
      'https://mizaniyaai.online/telegram/webhook';

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/setWebhook`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: webhookUrl,
          drop_pending_updates: true,
          allowed_updates: [
            'message',
            'callback_query',
          ],
        }),
      }
    );

    const telegramData =
      await telegramResponse.json();

    return res
      .status(telegramResponse.ok ? 200 : 500)
      .json({
        success: telegramResponse.ok,
        telegram: telegramData,
        webhookUrl,
      });
  } catch (error: any) {
    console.error(
      'Telegram setup error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// Webhook Info
// GET /telegram/info
// ============================================================

router.get('/info', async (_req: Request, res: Response) => {
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      return res.status(500).json({
        success: false,
        error: 'TELEGRAM_BOT_TOKEN is not configured',
      });
    }

    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${token}/getWebhookInfo`
    );

    const telegramData =
      await telegramResponse.json();

    return res
      .status(telegramResponse.ok ? 200 : 500)
      .json({
        success: telegramResponse.ok,
        telegram: telegramData,
      });
  } catch (error: any) {
    console.error(
      'Telegram getWebhookInfo error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// Health Check
// GET /telegram/health
// ============================================================

router.get(
  '/health',
  (_req: Request, res: Response) => {
    return res.status(200).json({
      success: true,
      service: 'Mizaniya AI Telegram Bot',
      status: 'ready',
    });
  }
);

export default router;
