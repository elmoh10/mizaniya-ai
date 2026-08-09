import { Router, Request, Response } from 'express';

const router = Router();

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
    const text = message.text?.trim();

    if (!chatId) {
      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    if (text === '/start') {
      await sendTelegramMessage(
        chatId,
        `أهلاً بيك في ميزانية AI 🤖💚

أنا المساعد المالي الذكي الخاص بيك.

قريباً هتقدر من خلالي:
💰 تسجل مصروفاتك
📊 تعرف المتبقي من مرتبك
🎯 تتابع ميزانيتك
💳 تراجع ديونك والتزاماتك
🧠 تتكلم مع المستشار المالي AI

البوت متصل بنجاح بمنصة ميزانية AI ✅`
      );
    } else if (text) {
      await sendTelegramMessage(
        chatId,
        `وصلتني رسالتك ✅

قلتلي:
"${text}"

الاتصال بين Telegram و Mizaniya AI شغال بنجاح 🤖`
      );
    }

    return res.status(200).json({
      success: true,
      received: true,
    });
  } catch (error: any) {
    console.error('Telegram webhook error:', error);

    // Return 200 to avoid Telegram retry storms during early development
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
          allowed_updates: ['message', 'callback_query'],
        }),
      }
    );

    const telegramData = await telegramResponse.json();

    return res.status(
      telegramResponse.ok ? 200 : 500
    ).json({
      success: telegramResponse.ok,
      telegram: telegramData,
      webhookUrl,
    });
  } catch (error: any) {
    console.error('Telegram setup error:', error);

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

    const telegramData = await telegramResponse.json();

    return res.status(
      telegramResponse.ok ? 200 : 500
    ).json({
      success: telegramResponse.ok,
      telegram: telegramData,
    });
  } catch (error: any) {
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

router.get('/health', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    service: 'Mizaniya AI Telegram Bot',
    status: 'ready',
  });
});

export default router;
