import { Router, Request, Response } from 'express';
import { createHash, randomInt } from 'crypto';
import { db } from '../config/firebaseAdmin';
import { getTrustedFinancialContext } from '../services/financialContextService';

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

function formatMoney(value: number): string {
  const safeValue = Number.isFinite(value) ? value : 0;

  return new Intl.NumberFormat('ar-EG', {
    maximumFractionDigits: 2,
  }).format(safeValue);
}

function normalizeArabicText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ًٌٍَُِّْ]/g, '')
    .replace(/[؟?!.,،]/g, '')
    .trim();
}

async function getLinkedUserId(
  telegramUserId: number
): Promise<string | null> {
  const linkDoc = await db
    .collection('telegram_links')
    .doc(String(telegramUserId))
    .get();

  if (!linkDoc.exists) {
    return null;
  }

  const data = linkDoc.data();

  if (!data || data.active !== true || !data.uid) {
    return null;
  }

  return String(data.uid);
}

// ============================================================
// Read-Only Financial Assistant
// ============================================================

async function handleFinancialQuery(
  userId: string,
  text: string
): Promise<string> {
  const normalized = normalizeArabicText(text);

  const context = await getTrustedFinancialContext(userId);

  // ========================================================
  // Salary
  // ========================================================

  if (
    normalized.includes('مرتبي') ||
    normalized.includes('راتبي') ||
    normalized.includes('الراتب') ||
    normalized.includes('المرتب')
  ) {
    return `💵 مرتبك الشهري المسجل في Mizaniya AI:

${formatMoney(context.salary || 0)} ج.م`;
  }

  // ========================================================
  // Wallet Balance
  // ========================================================

  if (
    normalized.includes('رصيدي') ||
    normalized.includes('الرصيد') ||
    normalized.includes('معايا كام') ||
    normalized.includes('معي كام')
  ) {
    return `💰 إجمالي رصيد المحافظ المسجل حاليًا:

${formatMoney(context.totalWalletBalance || 0)} ج.م`;
  }

  // ========================================================
  // Current Month Spending
  // ========================================================

  if (
    normalized.includes('صرفت كام') ||
    normalized.includes('صرفي كام') ||
    normalized.includes('مصروفاتي') ||
    normalized.includes('المصروفات') ||
    normalized.includes('صرف الشهر')
  ) {
    const currentMonthPrefix = new Date()
      .toISOString()
      .slice(0, 7);

    const currentMonthExpenses =
      context.recentTransactions
        .filter(
          (tx) =>
            tx.type === 'expense' &&
            String(tx.date || '').startsWith(
              currentMonthPrefix
            )
        )
        .reduce(
          (total, tx) =>
            total + Number(tx.amount || 0),
          0
        );

    return `📊 مصروفاتك المسجلة خلال الشهر الحالي:

${formatMoney(currentMonthExpenses)} ج.م`;
  }

  // ========================================================
  // Debts
  // ========================================================

  if (
    normalized.includes('ديوني') ||
    normalized.includes('الديون') ||
    normalized.includes('عليا ديون') ||
    normalized.includes('علي ديون') ||
    normalized.includes('مديون')
  ) {
    return `💳 إجمالي الديون المتبقية عليك:

${formatMoney(context.totalDebtRemaining || 0)} ج.م

المدفوعات الشهرية المرتبطة بالديون:
${formatMoney(context.monthlyDebtPayments || 0)} ج.م`;
  }

  // ========================================================
  // Obligations
  // ========================================================

  if (
    normalized.includes('التزامات') ||
    normalized.includes('التزاماتي') ||
    normalized.includes('الاقساط') ||
    normalized.includes('اقساطي')
  ) {
    const installments =
      Number(
        context.monthlyInstallmentObligation || 0
      );

    const unpaidBills =
      Number(context.unpaidBillsTotal || 0);

    const total =
      installments + unpaidBills;

    return `📌 التزاماتك المالية الحالية:

الأقساط الشهرية:
${formatMoney(installments)} ج.م

الفواتير غير المدفوعة:
${formatMoney(unpaidBills)} ج.م

إجمالي الالتزامات:
${formatMoney(total)} ج.م`;
  }

  // ========================================================
  // Budget
  // ========================================================

  if (
    normalized.includes('الميزانيه') ||
    normalized.includes('ميزانيتي') ||
    normalized.includes('فاضل كام') ||
    normalized.includes('متبقي كام')
  ) {
    if (!context.currentBudget) {
      return `📊 مفيش ميزانية محفوظة للشهر الحالي حتى الآن.

افتح قسم الميزانية في Mizaniya AI واعمل حساب للميزانية أولاً.`;
    }

    const budget: any =
      context.currentBudget;

    let remaining = 0;

    if (
      typeof budget.projectedEndOfMonthBalance ===
      'number'
    ) {
      remaining =
        budget.projectedEndOfMonthBalance;
    } else {
      const currentMonthPrefix = new Date()
        .toISOString()
        .slice(0, 7);

      const expenses =
        context.recentTransactions
          .filter(
            (tx) =>
              tx.type === 'expense' &&
              String(tx.date || '').startsWith(
                currentMonthPrefix
              )
          )
          .reduce(
            (sum, tx) =>
              sum + Number(tx.amount || 0),
            0
          );

      remaining =
        Number(context.salary || 0) -
        expenses -
        Number(
          context.monthlyInstallmentObligation ||
            0
        ) -
        Number(context.unpaidBillsTotal || 0);
    }

    return `📊 ملخص ميزانيتك الحالية:

💵 الراتب:
${formatMoney(context.salary || 0)} ج.م

✅ المتبقي المتوقع:
${formatMoney(remaining)} ج.م`;
  }

  // ========================================================
  // Help
  // ========================================================

  if (
    normalized === '/help' ||
    normalized.includes('مساعده') ||
    normalized.includes('تقدر تعمل ايه')
  ) {
    return `🤖 أقدر حاليًا أقرأ بيانات حساب Mizaniya AI بتاعك.

جرب تسألني:

💰 رصيدي كام؟
💵 مرتبي كام؟
📊 صرفت كام الشهر ده؟
💳 عليا ديون كام؟
📌 عندي التزامات بكام؟
🎯 فاضل من الميزانية كام؟

قريبًا هنضيف تنفيذ المعاملات مباشرة من Telegram.`;
  }

  return `🤖 حساب Telegram بتاعك مربوط بنجاح بـ Mizaniya AI.

أنا حاليًا في وضع القراءة الآمن.

جرب تسألني مثلًا:

• رصيدي كام؟
• مرتبي كام؟
• صرفت كام الشهر ده؟
• عليا ديون كام؟
• عندي التزامات بكام؟
• فاضل من الميزانية كام؟

اكتب /help لعرض الأوامر المتاحة.`;
}

// ============================================================
// Telegram Webhook
// POST /telegram/webhook
// ============================================================

router.post(
  '/webhook',
  async (req: Request, res: Response) => {
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
      const telegramUserId =
        message.from?.id;

      const text =
        message.text?.trim();

      if (
        !chatId ||
        !telegramUserId
      ) {
        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      // ========================================================
      // /start
      // ========================================================

      if (text === '/start') {
        const linkedUserId =
          await getLinkedUserId(
            telegramUserId
          );

        if (linkedUserId) {
          await sendTelegramMessage(
            chatId,
            `أهلاً بيك في ميزانية AI 🤖💚

حساب Telegram بتاعك مربوط بالفعل بحساب Mizaniya AI ✅

تقدر دلوقتي تسألني:

💰 رصيدي كام؟
💵 مرتبي كام؟
📊 صرفت كام الشهر ده؟
💳 عليا ديون كام؟
📌 عندي التزامات بكام؟
🎯 فاضل من الميزانية كام؟

اكتب /help للمساعدة.`
          );
        } else {
          await sendTelegramMessage(
            chatId,
            `أهلاً بيك في ميزانية AI 🤖💚

أنا المساعد المالي الذكي الخاص بيك.

علشان أقدر أوصل لميزانيتك ومصاريفك وديونك بأمان، لازم تربط حساب Telegram بحساب Mizaniya AI.

اكتب:
/link

وهطلع لك كود ربط مؤقت 🔐`
          );
        }

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      // ========================================================
      // /link
      // ========================================================

      if (text === '/link') {
        const existingUserId =
          await getLinkedUserId(
            telegramUserId
          );

        if (existingUserId) {
          await sendTelegramMessage(
            chatId,
            `✅ حساب Telegram ده مربوط بالفعل بحساب Mizaniya AI.

مش محتاج تعمل Link مرة تانية.

تقدر تبدأ باستخدام البوت مباشرة.

جرب:
رصيدي كام؟`
          );

          return res.status(200).json({
            success: true,
            received: true,
          });
        }

        const code =
          generateLinkCode();

        const codeHash =
          hashLinkCode(code);

        const now = Date.now();

        const expiresAt =
          now +
          LINK_CODE_EXPIRY_MINUTES *
            60 *
            1000;

        const oldCodesSnapshot =
          await db
            .collection(
              'telegram_link_codes'
            )
            .where(
              'telegramUserId',
              '==',
              telegramUserId
            )
            .where(
              'used',
              '==',
              false
            )
            .get();

        const batch =
          db.batch();

        oldCodesSnapshot.docs.forEach(
          (doc) => {
            batch.delete(doc.ref);
          }
        );

        if (
          !oldCodesSnapshot.empty
        ) {
          await batch.commit();
        }

        await db
          .collection(
            'telegram_link_codes'
          )
          .doc(codeHash)
          .set({
            telegramUserId,
            chatId,

            telegramUsername:
              message.from?.username ||
              null,

            telegramFirstName:
              message.from?.first_name ||
              null,

            telegramLastName:
              message.from?.last_name ||
              null,

            used: false,

            createdAt: now,
            expiresAt,
          });

        await sendTelegramMessage(
          chatId,
          `🔐 كود ربط حساب Mizaniya AI:

${code}

الكود صالح لمدة ${LINK_CODE_EXPIRY_MINUTES} دقائق فقط.

افتح موقع Mizaniya AI وسجّل دخولك، وبعدها اكتب الكود في قسم ربط Telegram.

⚠️ ما تبعتش الكود لأي شخص.`
        );

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      // ========================================================
      // Check Account Link
      // ========================================================

      const linkedUserId =
        await getLinkedUserId(
          telegramUserId
        );

      if (!linkedUserId) {
        await sendTelegramMessage(
          chatId,
          `🔐 حساب Telegram بتاعك مش مربوط بحساب Mizaniya AI حتى الآن.

اكتب:
/link

وبعدها أدخل الكود داخل صفحة الملف الشخصي في Mizaniya AI.`
        );

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      // ========================================================
      // Financial Read-Only Queries
      // ========================================================

      if (text) {
        try {
          const reply =
            await handleFinancialQuery(
              linkedUserId,
              text
            );

          await sendTelegramMessage(
            chatId,
            reply
          );
        } catch (financialError) {
          console.error(
            'Telegram financial query error:',
            financialError
          );

          await sendTelegramMessage(
            chatId,
            `⚠️ حصلت مشكلة مؤقتة أثناء قراءة بياناتك المالية.

حاول مرة تانية بعد لحظات.`
          );
        }
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

      return res.status(200).json({
        success: false,
        error: error.message,
      });
    }
  }
);

// ============================================================
// Setup Webhook
// POST /telegram/setup
// ============================================================

router.post(
  '/setup',
  async (
    _req: Request,
    res: Response
  ) => {
    try {
      const token =
        process.env
          .TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(500).json({
          success: false,
          error:
            'TELEGRAM_BOT_TOKEN is not configured',
        });
      }

      const webhookUrl =
        'https://mizaniyaai.online/telegram/webhook';

      const telegramResponse =
        await fetch(
          `https://api.telegram.org/bot${token}/setWebhook`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              url: webhookUrl,

              drop_pending_updates:
                true,

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
        .status(
          telegramResponse.ok
            ? 200
            : 500
        )
        .json({
          success:
            telegramResponse.ok,

          telegram:
            telegramData,

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
  }
);

// ============================================================
// Webhook Info
// GET /telegram/info
// ============================================================

router.get(
  '/info',
  async (
    _req: Request,
    res: Response
  ) => {
    try {
      const token =
        process.env
          .TELEGRAM_BOT_TOKEN;

      if (!token) {
        return res.status(500).json({
          success: false,
          error:
            'TELEGRAM_BOT_TOKEN is not configured',
        });
      }

      const telegramResponse =
        await fetch(
          `https://api.telegram.org/bot${token}/getWebhookInfo`
        );

      const telegramData =
        await telegramResponse.json();

      return res
        .status(
          telegramResponse.ok
            ? 200
            : 500
        )
        .json({
          success:
            telegramResponse.ok,

          telegram:
            telegramData,
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
  }
);

// ============================================================
// Health Check
// GET /telegram/health
// ============================================================

router.get(
  '/health',
  (
    _req: Request,
    res: Response
  ) => {
    return res.status(200).json({
      success: true,
      service:
        'Mizaniya AI Telegram Bot',
      status: 'ready',
    });
  }
);

export default router;
