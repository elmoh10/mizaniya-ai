import { Router, Request, Response } from 'express';
import { createHash, randomInt } from 'crypto';
import { db } from '../config/firebaseAdmin';
import { getTrustedFinancialContext } from '../services/financialContextService';
import { transactionRepository } from '../repositories/transactionRepository';
import { getWalletsForUser } from '../services/walletService';
import { transactionCreateSchema } from '../validators/schemas';
import { CategoryType } from '../../types';

const router = Router();

const LINK_CODE_EXPIRY_MINUTES = 10;
const PENDING_TX_EXPIRY_MINUTES = 10;

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

function detectExpenseCategory(text: string): CategoryType {
  const normalized = normalizeArabicText(text);

  if (
    normalized.includes('بنزين') ||
    normalized.includes('سولار') ||
    normalized.includes('اوبر') ||
    normalized.includes('كريم') ||
    normalized.includes('مواصلات') ||
    normalized.includes('تاكسي')
  ) {
    return 'Transport & Ride Apps';
  }

  if (
    normalized.includes('اكل') ||
    normalized.includes('مطعم') ||
    normalized.includes('سوبر ماركت') ||
    normalized.includes('بقاله') ||
    normalized.includes('قهوه') ||
    normalized.includes('كافيه')
  ) {
    return 'Food & Groceries';
  }

  if (
    normalized.includes('كهربا') ||
    normalized.includes('مياه') ||
    normalized.includes('غاز') ||
    normalized.includes('ايجار') ||
    normalized.includes('فاتوره')
  ) {
    return 'Housing & Utilities';
  }

  if (
    normalized.includes('دواء') ||
    normalized.includes('صيدليه') ||
    normalized.includes('دكتور') ||
    normalized.includes('كشف') ||
    normalized.includes('تعليم') ||
    normalized.includes('مدرسه')
  ) {
    return 'Health & Education';
  }

  if (
    normalized.includes('هدوم') ||
    normalized.includes('ملابس') ||
    normalized.includes('تسوق') ||
    normalized.includes('سينما') ||
    normalized.includes('ترفيه')
  ) {
    return 'Shopping & Entertainment';
  }

  if (
    normalized.includes('قسط') ||
    normalized.includes('دين')
  ) {
    return 'Installments & Debt';
  }

  return 'Shopping & Entertainment';
}

function extractExpenseCandidate(
  text: string
): {
  amount: number;
  title: string;
  category: CategoryType;
} | null {
  const normalized = normalizeArabicText(text);

  const hasExpenseIntent =
    normalized.includes('سجل') ||
    normalized.includes('سجلت') ||
    normalized.includes('دفعت') ||
    normalized.includes('صرفت');

  if (!hasExpenseIntent) {
    return null;
  }

  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/);

  if (!amountMatch) {
    return null;
  }

  const amount = Number(
    amountMatch[1].replace(',', '.')
  );

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  let title = text
    .replace(amountMatch[0], '')
    .replace(/جنيه|جنية|جنيها|ج\.م/gi, '')
    .replace(/سجل|سجلت|دفعت|صرفت/gi, '')
    .trim();

  if (!title) {
    title = 'مصروف من Telegram';
  }

  return {
    amount,
    title,
    category: detectExpenseCategory(text),
  };
}

function getArabicCategoryName(category: CategoryType): string {
  switch (category) {
    case 'Food & Groceries':
      return 'الطعام والبقالة';
    case 'Housing & Utilities':
      return 'السكن والمرافق';
    case 'Bills & Subscriptions':
      return 'الفواتير والاشتراكات';
    case 'Transport & Ride Apps':
      return 'المواصلات والتنقل';
    case 'Installments & Debt':
      return 'الأقساط والديون';
    case 'Health & Education':
      return 'الصحة والتعليم';
    case 'Family & Allowances':
      return 'العائلة والمصروفات';
    case 'Shopping & Entertainment':
      return 'التسوق والترفيه';
    case 'Emergency & Savings':
      return 'الطوارئ والادخار';
    case 'Income & Salary':
      return 'الدخل والراتب';
    default:
      return category;
  }
}

async function markBudgetStale(userId: string): Promise<void> {
  try {
    const monthKey = new Date().toISOString().slice(0, 7);

    const budgetDocRef = db
      .collection('users')
      .doc(userId)
      .collection('budgets')
      .doc(monthKey);

    const doc = await budgetDocRef.get();

    if (doc.exists) {
      await budgetDocRef.set(
        { isStale: true },
        { merge: true }
      );
    }
  } catch (error) {
    console.error('Telegram markBudgetStale error:', error);
  }
}

async function getPrimaryWallet(userId: string) {
  const wallets = await getWalletsForUser(userId);

  if (!wallets.length) {
    return null;
  }

  return (
    wallets.find((wallet) => wallet.isPrimary === true) ||
    wallets[0]
  );
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

  if (
    normalized.includes('مرتبي') ||
    normalized.includes('راتبي') ||
    normalized.includes('الراتب') ||
    normalized.includes('المرتب')
  ) {
    return `💵 مرتبك الشهري المسجل في Mizaniya AI:

${formatMoney(context.salary || 0)} ج.م`;
  }

  if (
    normalized.includes('رصيدي') ||
    normalized.includes('الرصيد') ||
    normalized.includes('معايا كام') ||
    normalized.includes('معي كام')
  ) {
    return `💰 إجمالي رصيد المحافظ المسجل حاليًا:

${formatMoney(context.totalWalletBalance || 0)} ج.م`;
  }

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

  if (
    normalized.includes('التزامات') ||
    normalized.includes('التزاماتي') ||
    normalized.includes('الاقساط') ||
    normalized.includes('اقساطي')
  ) {
    const installments = Number(
      context.monthlyInstallmentObligation || 0
    );

    const unpaidBills = Number(
      context.unpaidBillsTotal || 0
    );

    const total = installments + unpaidBills;

    return `📌 التزاماتك المالية الحالية:

الأقساط الشهرية:
${formatMoney(installments)} ج.م

الفواتير غير المدفوعة:
${formatMoney(unpaidBills)} ج.م

إجمالي الالتزامات:
${formatMoney(total)} ج.م`;
  }

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

    const budget: any = context.currentBudget;

    let remaining = 0;

    if (
      typeof budget.projectedEndOfMonthBalance ===
      'number'
    ) {
      remaining = budget.projectedEndOfMonthBalance;
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
          context.monthlyInstallmentObligation || 0
        ) -
        Number(context.unpaidBillsTotal || 0);
    }

    return `📊 ملخص ميزانيتك الحالية:

💵 الراتب:
${formatMoney(context.salary || 0)} ج.م

✅ المتبقي المتوقع:
${formatMoney(remaining)} ج.م`;
  }

  if (
    normalized === '/help' ||
    normalized.includes('مساعده') ||
    normalized.includes('تقدر تعمل ايه')
  ) {
    return `🤖 أقدر حاليًا:

💰 أقرأ رصيدك
💵 أقرأ مرتبك
📊 أحسب مصروفات الشهر
💳 أراجع ديونك
📌 أراجع التزاماتك
🎯 أقرأ ميزانيتك

وكمان تقدر تسجل مصروف جديد مثل:

سجل 150 جنيه بنزين

وسأطلب منك التأكيد قبل الحفظ.`;
  }

  return `🤖 حساب Telegram بتاعك مربوط بنجاح بـ Mizaniya AI.

جرب تسألني مثلًا:

• رصيدي كام؟
• مرتبي كام؟
• صرفت كام الشهر ده؟
• عليا ديون كام؟
• عندي التزامات بكام؟
• فاضل من الميزانية كام؟

أو سجل مصروف مثل:
سجل 150 جنيه بنزين`;
}

// ============================================================
// Telegram Webhook
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

    if (text === '/start') {
      const linkedUserId =
        await getLinkedUserId(telegramUserId);

      if (linkedUserId) {
        await sendTelegramMessage(
          chatId,
          `أهلاً بيك في ميزانية AI 🤖💚

حسابك مربوط بالفعل ✅

تقدر تسألني عن رصيدك وميزانيتك وديونك،
أو تقول مثلًا:

سجل 150 جنيه بنزين`
        );
      } else {
        await sendTelegramMessage(
          chatId,
          `أهلاً بيك في ميزانية AI 🤖💚

علشان أقدر أوصل لبياناتك لازم تربط حسابك.

اكتب:
/link`
        );
      }

      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    if (text === '/link') {
      const existingUserId =
        await getLinkedUserId(telegramUserId);

      if (existingUserId) {
        await sendTelegramMessage(
          chatId,
          `✅ حساب Telegram ده مربوط بالفعل بحساب Mizaniya AI.`
        );

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      const code = generateLinkCode();
      const codeHash = hashLinkCode(code);
      const now = Date.now();

      const expiresAt =
        now +
        LINK_CODE_EXPIRY_MINUTES * 60 * 1000;

      const oldCodesSnapshot = await db
        .collection('telegram_link_codes')
        .where(
          'telegramUserId',
          '==',
          telegramUserId
        )
        .where('used', '==', false)
        .get();

      const batch = db.batch();

      oldCodesSnapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });

      if (!oldCodesSnapshot.empty) {
        await batch.commit();
      }

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

الكود صالح لمدة ${LINK_CODE_EXPIRY_MINUTES} دقائق فقط.`
      );

      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    const linkedUserId =
      await getLinkedUserId(telegramUserId);

    if (!linkedUserId) {
      await sendTelegramMessage(
        chatId,
        `🔐 حسابك غير مربوط.

اكتب:
/link`
      );

      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    const normalized = normalizeArabicText(text || '');

    // ========================================================
    // Confirm Pending Expense
    // ========================================================

    if (
      normalized === 'تاكيد' ||
      normalized === 'تأكيد' ||
      normalized === 'ايوه' ||
      normalized === 'ايوه سجل' ||
      normalized === 'ايوه سجله'
    ) {
      const pendingRef = db
        .collection('telegram_pending_transactions')
        .doc(String(telegramUserId));

      const pendingDoc = await pendingRef.get();

      if (!pendingDoc.exists) {
        await sendTelegramMessage(
          chatId,
          'مفيش معاملة منتظرة للتأكيد.'
        );

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      const pending = pendingDoc.data();

      if (
        !pending ||
        pending.used === true ||
        Date.now() > Number(pending.expiresAt || 0)
      ) {
        await pendingRef.delete();

        await sendTelegramMessage(
          chatId,
          'المعاملة المنتظرة انتهت صلاحيتها. ابعتها من جديد.'
        );

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      const parsed = transactionCreateSchema.safeParse(
        pending.transaction
      );

      if (!parsed.success) {
        await pendingRef.delete();

        await sendTelegramMessage(
          chatId,
          'تعذر تسجيل المعاملة لأن بياناتها غير مكتملة.'
        );

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      await transactionRepository.createTransaction(
        linkedUserId,
        parsed.data
      );

      await markBudgetStale(linkedUserId);

      await pendingRef.delete();

      await sendTelegramMessage(
        chatId,
        `✅ تم تسجيل المصروف بنجاح.

💰 المبلغ: ${formatMoney(parsed.data.amount)} ج.م
📝 الوصف: ${parsed.data.title}
📂 التصنيف: ${getArabicCategoryName(parsed.data.category)}`
      );

      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    // ========================================================
    // Cancel Pending Expense
    // ========================================================

    if (
      normalized === 'الغاء' ||
      normalized === 'إلغاء' ||
      normalized === 'لا' ||
      normalized === 'متسجلش'
    ) {
      const pendingRef = db
        .collection('telegram_pending_transactions')
        .doc(String(telegramUserId));

      await pendingRef.delete();

      await sendTelegramMessage(
        chatId,
        '❌ تم إلغاء المعاملة.'
      );

      return res.status(200).json({
        success: true,
        received: true,
      });
    }

    // ========================================================
    // Detect New Expense
    // ========================================================

    if (text) {
      const expenseCandidate =
        extractExpenseCandidate(text);

      if (expenseCandidate) {
        const wallet = await getPrimaryWallet(
          linkedUserId
        );

        if (!wallet) {
          await sendTelegramMessage(
            chatId,
            `⚠️ مفيش محفظة متاحة في حسابك.

افتح Mizaniya AI وأنشئ محفظة الأول.`
          );

          return res.status(200).json({
            success: true,
            received: true,
          });
        }

        const transactionPayload = {
          title: expenseCandidate.title,
          amount: expenseCandidate.amount,
          currency: wallet.currency || 'EGP',
          type: 'expense' as const,
          category: expenseCandidate.category,
          walletId: wallet.id,
          paymentMethod: 'Cash' as const,
          date: new Date()
            .toISOString()
            .split('T')[0],
          notes: 'تم التسجيل من Telegram',
          aiTag: 'telegram-expense',
        };

        const validation =
          transactionCreateSchema.safeParse(
            transactionPayload
          );

        if (!validation.success) {
          console.error(
            'Telegram candidate validation failed:',
            validation.error.format()
          );

          await sendTelegramMessage(
            chatId,
            'تعذر تجهيز المعاملة للتسجيل.'
          );

          return res.status(200).json({
            success: true,
            received: true,
          });
        }

        const now = Date.now();

        await db
          .collection(
            'telegram_pending_transactions'
          )
          .doc(String(telegramUserId))
          .set({
            userId: linkedUserId,
            telegramUserId,
            chatId,
            transaction: validation.data,
            used: false,
            createdAt: now,
            expiresAt:
              now +
              PENDING_TX_EXPIRY_MINUTES *
                60 *
                1000,
          });

        await sendTelegramMessage(
          chatId,
          `🧾 مصروف جديد جاهز للتسجيل:

💰 المبلغ:
${formatMoney(expenseCandidate.amount)} ج.م

📝 الوصف:
${expenseCandidate.title}

📂 التصنيف:
${getArabicCategoryName(expenseCandidate.category)}

👛 المحفظة:
${wallet.nameAr || wallet.name}

هل تريد تسجيل المعاملة؟

اكتب:
تأكيد

أو:
إلغاء`
        );

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      const reply = await handleFinancialQuery(
        linkedUserId,
        text
      );

      await sendTelegramMessage(
        chatId,
        reply
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

    return res.status(200).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// Setup Webhook
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
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// Webhook Info
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
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================
// Health Check
// ============================================================

router.get('/health', (_req: Request, res: Response) => {
  return res.status(200).json({
    success: true,
    service: 'Mizaniya AI Telegram Bot',
    status: 'ready',
  });
});

export default router;
