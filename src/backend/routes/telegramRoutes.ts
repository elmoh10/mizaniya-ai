import { Router, Request, Response } from 'express';
import { createHash, randomInt } from 'crypto';

import { db } from '../config/firebaseAdmin';
import { getTrustedFinancialContext } from '../services/financialContextService';
import { transactionRepository } from '../repositories/transactionRepository';
import { getWalletsForUser } from '../services/walletService';
import { transactionCreateSchema } from '../validators/schemas';
import { recordDebtPayment } from '../services/debtService';
import { CategoryType } from '../../types';

const router = Router();

const LINK_CODE_EXPIRY_MINUTES = 10;
const PENDING_TX_EXPIRY_MINUTES = 10;

// ============================================================
// Telegram Helpers
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

// ============================================================
// Telegram Account Link Lookup
// ============================================================

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
// Budget Staleness
// ============================================================

async function markBudgetStale(
  userId: string
): Promise<void> {
  try {
    const monthKey = new Date()
      .toISOString()
      .slice(0, 7);

    const budgetDocRef = db
      .collection('users')
      .doc(userId)
      .collection('budgets')
      .doc(monthKey);

    const doc = await budgetDocRef.get();

    if (doc.exists) {
      await budgetDocRef.set(
        {
          isStale: true,
        },
        {
          merge: true,
        }
      );
    }
  } catch (error) {
    console.error(
      'Telegram markBudgetStale error:',
      error
    );
  }
}

// ============================================================
// Wallet Selection
// ============================================================

async function getPrimaryWallet(userId: string) {
  const wallets =
    await getWalletsForUser(userId);

  if (!wallets.length) {
    return null;
  }

  return (
    wallets.find(
      (wallet) =>
        wallet.isPrimary === true
    ) || wallets[0]
  );
}

// ============================================================
// Expense Category Detection
// ============================================================

function detectExpenseCategory(
  text: string
): CategoryType {
  const normalized =
    normalizeArabicText(text);

  if (
    normalized.includes('بنزين') ||
    normalized.includes('سولار') ||
    normalized.includes('اوبر') ||
    normalized.includes('كريم') ||
    normalized.includes('مواصلات') ||
    normalized.includes('تاكسي') ||
    normalized.includes('ركنه') ||
    normalized.includes('باركينج')
  ) {
    return 'Transport & Ride Apps';
  }

  if (
    normalized.includes('اكل') ||
    normalized.includes('مطعم') ||
    normalized.includes('سوبر ماركت') ||
    normalized.includes('بقاله') ||
    normalized.includes('قهوه') ||
    normalized.includes('كافيه') ||
    normalized.includes('غدا') ||
    normalized.includes('فطار') ||
    normalized.includes('عشا')
  ) {
    return 'Food & Groceries';
  }

  if (
    normalized.includes('انترنت') ||
    normalized.includes('نت') ||
    normalized.includes('اشتراك') ||
    normalized.includes('نتفلكس') ||
    normalized.includes('شاهد')
  ) {
    return 'Bills & Subscriptions';
  }

  if (
    normalized.includes('كهربا') ||
    normalized.includes('كهرباء') ||
    normalized.includes('مياه') ||
    normalized.includes('غاز') ||
    normalized.includes('ايجار') ||
    normalized.includes('صيانه البيت')
  ) {
    return 'Housing & Utilities';
  }

  if (
    normalized.includes('دواء') ||
    normalized.includes('صيدليه') ||
    normalized.includes('صيدلية') ||
    normalized.includes('دكتور') ||
    normalized.includes('كشف') ||
    normalized.includes('مستشفى') ||
    normalized.includes('مدرسه') ||
    normalized.includes('مدرسة') ||
    normalized.includes('تعليم') ||
    normalized.includes('كورس')
  ) {
    return 'Health & Education';
  }

  if (
    normalized.includes('مصروف البيت') ||
    normalized.includes('الاولاد') ||
    normalized.includes('الأولاد') ||
    normalized.includes('العيله') ||
    normalized.includes('العائلة')
  ) {
    return 'Family & Allowances';
  }

  if (
    normalized.includes('قسط') ||
    normalized.includes('دين')
  ) {
    return 'Installments & Debt';
  }

  if (
    normalized.includes('ادخار') ||
    normalized.includes('تحويش') ||
    normalized.includes('حوش')
  ) {
    return 'Emergency & Savings';
  }

  return 'Shopping & Entertainment';
}

function getArabicCategoryName(
  category: CategoryType
): string {
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

// ============================================================
// Expense Parser
// ============================================================

function extractExpenseCandidate(
  text: string
): {
  amount: number;
  title: string;
  category: CategoryType;
} | null {
  const normalized =
    normalizeArabicText(text);

  const hasExpenseIntent =
    normalized.includes('سجل') ||
    normalized.includes('سجلت') ||
    normalized.includes('دفعت') ||
    normalized.includes('صرفت') ||
    normalized.includes('اشتريت');

  if (!hasExpenseIntent) {
    return null;
  }

  const amountMatch =
    text.match(/(\d+(?:[.,]\d+)?)/);

  if (!amountMatch) {
    return null;
  }

  const amount = Number(
    amountMatch[1].replace(',', '.')
  );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  let title = text
    .replace(amountMatch[0], '')
    .replace(
      /جنيه|جنية|جنيها|ج\.م/gi,
      ''
    )
    .replace(
      /سجل|سجلت|دفعت|صرفت|اشتريت/gi,
      ''
    )
    .trim();

  if (!title) {
    title = 'مصروف من Telegram';
  }

  return {
    amount,
    title,
    category:
      detectExpenseCategory(text),
  };
}

// ============================================================
// Income Parser
// ============================================================

function extractIncomeCandidate(
  text: string
): {
  amount: number;
  title: string;
  category: CategoryType;
} | null {
  const normalized =
    normalizeArabicText(text);

  const hasIncomeIntent =
    normalized.includes('قبضت') ||
    normalized.includes('استلمت') ||
    normalized.includes('دخل') ||
    normalized.includes('ايراد') ||
    normalized.includes('مكافاه') ||
    normalized.includes('بونص') ||
    normalized.includes('راتب نزل') ||
    normalized.includes('مرتب نزل');

  if (!hasIncomeIntent) {
    return null;
  }

  const amountMatch =
    text.match(/(\d+(?:[.,]\d+)?)/);

  if (!amountMatch) {
    return null;
  }

  const amount = Number(
    amountMatch[1].replace(',', '.')
  );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  let title = text
    .replace(amountMatch[0], '')
    .replace(
      /جنيه|جنية|جنيها|ج\.م/gi,
      ''
    )
    .replace(
      /قبضت|استلمت|سجل دخل|دخل|ايراد|إيراد/gi,
      ''
    )
    .trim();

  if (!title) {
    title = 'دخل من Telegram';
  }

  return {
    amount,
    title,
    category: 'Income & Salary',
  };
}

// ============================================================
// Debt Payment Parser
// ============================================================

function extractDebtPaymentCandidate(
  text: string
): {
  amount: number;
  searchText: string;
} | null {
  const normalized =
    normalizeArabicText(text);

  const hasDebtPaymentIntent =
    (
      normalized.includes('دفعت') ||
      normalized.includes('سددت') ||
      normalized.includes('سداد')
    ) &&
    (
      normalized.includes('دين') ||
      normalized.includes('قسط') ||
      normalized.includes('مديونيه')
    );

  if (!hasDebtPaymentIntent) {
    return null;
  }

  const amountMatch =
    text.match(/(\d+(?:[.,]\d+)?)/);

  if (!amountMatch) {
    return null;
  }

  const amount = Number(
    amountMatch[1].replace(',', '.')
  );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return null;
  }

  const searchText =
    normalizeArabicText(
      text
        .replace(amountMatch[0], '')
        .replace(
          /جنيه|جنية|جنيها|ج\.م/gi,
          ''
        )
        .replace(
          /دفعت|سددت|سداد|دين|قسط|مديونية|مديونيه|من/gi,
          ''
        )
        .trim()
    );

  return {
    amount,
    searchText,
  };
}

// ============================================================
// Read-Only Financial Queries
// ============================================================

async function handleFinancialQuery(
  userId: string,
  text: string
): Promise<string> {
  const normalized =
    normalizeArabicText(text);

  const context =
    await getTrustedFinancialContext(
      userId
    );

  // Salary
  if (
    normalized.includes('مرتبي') ||
    normalized.includes('راتبي') ||
    normalized.includes('الراتب') ||
    normalized.includes('المرتب')
  ) {
    return `💵 مرتبك الشهري المسجل في Mizaniya AI:

${formatMoney(context.salary || 0)} ج.م`;
  }

  // Wallet balance
  if (
    normalized.includes('رصيدي') ||
    normalized.includes('الرصيد') ||
    normalized.includes('معايا كام') ||
    normalized.includes('معي كام')
  ) {
    return `💰 إجمالي رصيد المحافظ المسجل حاليًا:

${formatMoney(context.totalWalletBalance || 0)} ج.م`;
  }

  // Current month spending
  if (
    normalized.includes('صرفت كام') ||
    normalized.includes('صرفي كام') ||
    normalized.includes('مصروفاتي') ||
    normalized.includes('المصروفات') ||
    normalized.includes('صرف الشهر')
  ) {
    const currentMonthPrefix =
      new Date()
        .toISOString()
        .slice(0, 7);

    const currentMonthExpenses =
      context.recentTransactions
        .filter(
          (tx) =>
            tx.type === 'expense' &&
            String(
              tx.date || ''
            ).startsWith(
              currentMonthPrefix
            )
        )
        .reduce(
          (total, tx) =>
            total +
            Number(tx.amount || 0),
          0
        );

    return `📊 مصروفاتك المسجلة خلال الشهر الحالي:

${formatMoney(currentMonthExpenses)} ج.م`;
  }

  // Debts
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

  // Obligations
  if (
    normalized.includes('التزامات') ||
    normalized.includes('التزاماتي') ||
    normalized.includes('الاقساط') ||
    normalized.includes('اقساطي')
  ) {
    const installments = Number(
      context.monthlyInstallmentObligation ||
        0
    );

    const unpaidBills = Number(
      context.unpaidBillsTotal || 0
    );

    const obligations = Number(
      context.monthlyObligations || 0
    );

    const total =
      installments +
      unpaidBills +
      obligations;

    return `📌 التزاماتك المالية الحالية:

💳 الأقساط والديون الشهرية:
${formatMoney(installments)} ج.م

🧾 الفواتير غير المدفوعة:
${formatMoney(unpaidBills)} ج.م

📅 الالتزامات الشهرية:
${formatMoney(obligations)} ج.م

إجمالي الالتزامات:
${formatMoney(total)} ج.م`;
  }

  // Budget
  if (
    normalized.includes('الميزانيه') ||
    normalized.includes('ميزانيتي') ||
    normalized.includes('فاضل كام') ||
    normalized.includes('متبقي كام') ||
    normalized.includes('اصرف كام')
  ) {
    if (!context.currentBudget) {
      return `📊 مفيش ميزانية محفوظة للشهر الحالي حتى الآن.

افتح قسم الميزانية في Mizaniya AI واعمل حساب للميزانية أولاً.`;
    }

    return `📊 ملخص ميزانيتك الحالية:

💵 الراتب:
${formatMoney(context.salary || 0)} ج.م

💸 المصروفات:
${formatMoney(context.monthlyExpenses || 0)} ج.م

📌 الالتزامات المتبقية:
${formatMoney(context.outstandingMonthlyCommitments || 0)} ج.م

🐷 الادخار المتبقي:
${formatMoney(context.remainingSavingsTarget || 0)} ج.م

✅ المتاح للإنفاق الآمن:
${formatMoney(context.safeToSpend || 0)} ج.م`;
  }

  // Help
  if (
    normalized === '/help' ||
    normalized.includes('مساعده') ||
    normalized.includes('تقدر تعمل ايه')
  ) {
    return `🤖 أقدر حاليًا أساعدك في:

📊 الاستعلام:
• رصيدي كام؟
• مرتبي كام؟
• صرفت كام الشهر ده؟
• عليا ديون كام؟
• عندي التزامات بكام؟
• فاضل من الميزانية كام؟

💸 تسجيل مصروف:
سجل 150 جنيه بنزين

💵 تسجيل دخل:
قبضت 500 جنيه مكافأة

💳 سداد دين:
دفعت 500 جنيه من دين البنك

كل عملية مالية لازم تؤكدها قبل التنفيذ.`;
  }

  return `🤖 أنا متصل بحساب Mizaniya AI بتاعك.

جرب مثلًا:

رصيدي كام؟
صرفت كام الشهر ده؟
فاضل من الميزانية كام؟

أو تسجيل مصروف:
سجل 150 جنيه بنزين

أو تسجيل دخل:
قبضت 500 جنيه مكافأة

أو سداد دين:
دفعت 500 جنيه من دين البنك`;
}

// ============================================================
// Telegram Webhook
// POST /telegram/webhook
// ============================================================

router.post(
  '/webhook',
  async (
    req: Request,
    res: Response
  ) => {
    try {
      const update = req.body;

      console.log(
        'Telegram update received:',
        JSON.stringify(update)
      );

      const message =
        update?.message;

      if (!message) {
        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      const chatId =
        message.chat?.id;

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

تقدر تستعلم عن بياناتك، وتسجل مصروف أو دخل، وتسدد دين.

اكتب /help للمساعدة.`
          );
        } else {
          await sendTelegramMessage(
            chatId,
            `أهلاً بيك في ميزانية AI 🤖💚

علشان أقدر أوصل لبياناتك المالية بأمان لازم تربط حساب Telegram بحساب Mizaniya AI.

اكتب:
/link`
          );
        }

        return res
          .status(200)
          .json({
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

مش محتاج تعمل ربط مرة تانية.

اكتب /help لمعرفة الأوامر المتاحة.`
          );

          return res
            .status(200)
            .json({
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

        const batch = db.batch();

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

افتح موقع Mizaniya AI وسجّل دخولك، وبعدها أدخل الكود في قسم ربط Telegram.

⚠️ ما تبعتش الكود لأي شخص.`
        );

        return res
          .status(200)
          .json({
            success: true,
            received: true,
          });
      }

      // ========================================================
      // Ensure Account Is Linked
      // ========================================================

      const linkedUserId =
        await getLinkedUserId(
          telegramUserId
        );

      if (!linkedUserId) {
        await sendTelegramMessage(
          chatId,
          `🔐 حساب Telegram بتاعك مش مربوط بحساب Mizaniya AI.

اكتب:
/link`
        );

        return res
          .status(200)
          .json({
            success: true,
            received: true,
          });
      }

      const normalized =
        normalizeArabicText(
          text || ''
        );

      // ========================================================
      // CONFIRM Pending Action
      // ========================================================

      if (
        normalized === 'تاكيد' ||
        normalized === 'ايوه' ||
        normalized === 'ايوه سجل' ||
        normalized === 'ايوه سجله' ||
        normalized === 'موافق'
      ) {
        const pendingRef = db
          .collection(
            'telegram_pending_transactions'
          )
          .doc(
            String(
              telegramUserId
            )
          );

        const pendingDoc =
          await pendingRef.get();

        if (
          !pendingDoc.exists
        ) {
          await sendTelegramMessage(
            chatId,
            'مفيش عملية منتظرة للتأكيد.'
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        const pending =
          pendingDoc.data();

        if (
          !pending ||
          pending.used === true ||
          Date.now() >
            Number(
              pending.expiresAt || 0
            )
        ) {
          await pendingRef.delete();

          await sendTelegramMessage(
            chatId,
            `⏰ العملية المنتظرة انتهت صلاحيتها.

ابعتها من جديد.`
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        // ======================================================
        // Confirm Debt Payment
        // ======================================================

        if (
          pending.actionType ===
          'debt_payment'
        ) {
          const debtId =
            String(
              pending.debtId || ''
            );

          const amount =
            Number(
              pending.amount || 0
            );

          if (
            !debtId ||
            !Number.isFinite(amount) ||
            amount <= 0
          ) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              'تعذر تنفيذ سداد الدين لأن بيانات العملية غير صالحة.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          // Re-read debt before payment to avoid using stale amount
          const contextBefore =
            await getTrustedFinancialContext(
              linkedUserId
            );

          const currentDebt = (
            contextBefore.debts || []
          ).find(
            (debt: any) =>
              debt.id === debtId
          );

          if (!currentDebt) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              '⚠️ الدين لم يعد موجودًا في حسابك.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const remainingNow =
            Number(
              currentDebt.remainingAmount ||
                0
            );

          if (
            remainingNow <= 0
          ) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              '✅ الدين ده مسدد بالفعل.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          if (
            amount >
            remainingNow
          ) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              `⚠️ قيمة الدين اتغيرت قبل التأكيد.

المتبقي حاليًا:
${formatMoney(remainingNow)} ج.م

ابعت عملية السداد من جديد بالقيمة الصحيحة.`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const date =
            new Date()
              .toISOString()
              .split('T')[0];

          const idempotencyKey =
            `telegram-debt-${telegramUserId}-${pending.createdAt}`;

          await recordDebtPayment(
            linkedUserId,
            debtId,
            amount,
            'Cash',
            date,
            idempotencyKey
          );

          await markBudgetStale(
            linkedUserId
          );

          await pendingRef.delete();

          const contextAfter =
            await getTrustedFinancialContext(
              linkedUserId
            );

          const updatedDebt = (
            contextAfter.debts || []
          ).find(
            (debt: any) =>
              debt.id === debtId
          );

          const remainingAfter =
            Number(
              updatedDebt
                ?.remainingAmount || 0
            );

          await sendTelegramMessage(
            chatId,
            `✅ تم تسجيل سداد الدين بنجاح.

🏦 الدين:
${pending.creditorName || 'دين'}

💰 المبلغ المدفوع:
${formatMoney(amount)} ج.م

📉 المتبقي على الدين:
${formatMoney(remainingAfter)} ج.م

📊 تم تحديث بيانات الدين والميزانية.`
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        // ======================================================
        // Confirm Normal Income / Expense
        // ======================================================

        const parsed =
          transactionCreateSchema.safeParse(
            pending.transaction
          );

        if (!parsed.success) {
          console.error(
            'Telegram pending transaction validation error:',
            parsed.error.format()
          );

          await pendingRef.delete();

          await sendTelegramMessage(
            chatId,
            'تعذر تسجيل المعاملة لأن بياناتها غير مكتملة.'
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        const transaction =
          await transactionRepository.createTransaction(
            linkedUserId,
            parsed.data
          );

        await markBudgetStale(
          linkedUserId
        );

        await pendingRef.delete();

        const isIncome =
          parsed.data.type ===
          'income';

        await sendTelegramMessage(
          chatId,
          `${
            isIncome
              ? '✅ تم تسجيل الدخل بنجاح.'
              : '✅ تم تسجيل المصروف بنجاح.'
          }

💰 المبلغ:
${formatMoney(parsed.data.amount)} ج.م

📝 الوصف:
${parsed.data.title}

📂 التصنيف:
${getArabicCategoryName(parsed.data.category)}

👛 ${
            isIncome
              ? 'تمت إضافة المبلغ إلى المحفظة.'
              : 'تم خصم المبلغ من المحفظة.'
          }

رقم المعاملة:
${transaction.id}`
        );

        return res
          .status(200)
          .json({
            success: true,
            received: true,
          });
      }

      // ========================================================
      // CANCEL Pending Action
      // ========================================================

      if (
        normalized === 'الغاء' ||
        normalized === 'لا' ||
        normalized ===
          'متسجلش' ||
        normalized ===
          'مش موافق'
      ) {
        const pendingRef = db
          .collection(
            'telegram_pending_transactions'
          )
          .doc(
            String(
              telegramUserId
            )
          );

        const pendingDoc =
          await pendingRef.get();

        if (
          !pendingDoc.exists
        ) {
          await sendTelegramMessage(
            chatId,
            'مفيش عملية منتظرة للإلغاء.'
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        await pendingRef.delete();

        await sendTelegramMessage(
          chatId,
          '❌ تم إلغاء العملية.'
        );

        return res
          .status(200)
          .json({
            success: true,
            received: true,
          });
      }

      // ========================================================
      // Message Processing
      // ========================================================

      if (text) {

        // ======================================================
        // 1. Detect Debt Payment FIRST
        // ======================================================

        const debtPaymentCandidate =
          extractDebtPaymentCandidate(
            text
          );

        if (
          debtPaymentCandidate
        ) {
          const context =
            await getTrustedFinancialContext(
              linkedUserId
            );

          const activeDebts = (
            context.debts || []
          ).filter(
            (debt: any) =>
              debt.status ===
                'ACTIVE' ||
              debt.status ===
                'active' ||
              debt.status ===
                'OVERDUE' ||
              debt.status ===
                'overdue' ||
              debt.status ===
                'PAUSED' ||
              debt.status ===
                'paused'
          );

          if (
            activeDebts.length ===
            0
          ) {
            await sendTelegramMessage(
              chatId,
              '💳 مفيش ديون نشطة مسجلة حاليًا في حسابك.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          let selectedDebt: any =
            null;

          // One active debt -> automatic selection
          if (
            activeDebts.length ===
            1
          ) {
            selectedDebt =
              activeDebts[0];
          } else {
            const search =
              debtPaymentCandidate.searchText;

            if (search) {
              selectedDebt =
                activeDebts.find(
                  (debt: any) => {
                    const creditor =
                      normalizeArabicText(
                        String(
                          debt.creditorName ||
                            ''
                        )
                      );

                    if (
                      !creditor
                    ) {
                      return false;
                    }

                    return (
                      creditor.includes(
                        search
                      ) ||
                      search.includes(
                        creditor
                      )
                    );
                  }
                ) || null;
            }
          }

          if (!selectedDebt) {
            const debtList =
              activeDebts
                .map(
                  (
                    debt: any,
                    index: number
                  ) =>
                    `${index + 1}. ${
                      debt.creditorName ||
                      'دين بدون اسم'
                    } — ${formatMoney(
                      Number(
                        debt.remainingAmount ||
                          0
                      )
                    )} ج.م`
                )
                .join('\n');

            await sendTelegramMessage(
              chatId,
              `💳 عندك أكتر من دين ومش قدرت أحدد تقصد أنهي واحد.

الديون الحالية:

${debtList}

اكتب اسم الجهة بشكل أوضح، مثال:

دفعت 500 جنيه من دين البنك الأهلي`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const remainingAmount =
            Number(
              selectedDebt
                .remainingAmount ||
                0
            );

          if (
            remainingAmount <= 0
          ) {
            await sendTelegramMessage(
              chatId,
              '✅ الدين المحدد مسدد بالفعل.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          if (
            debtPaymentCandidate.amount >
            remainingAmount
          ) {
            await sendTelegramMessage(
              chatId,
              `⚠️ مبلغ السداد أكبر من المتبقي على الدين.

💰 مبلغ السداد:
${formatMoney(
  debtPaymentCandidate.amount
)} ج.م

📉 المتبقي على الدين:
${formatMoney(
  remainingAmount
)} ج.م`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const now =
            Date.now();

          await db
            .collection(
              'telegram_pending_transactions'
            )
            .doc(
              String(
                telegramUserId
              )
            )
            .set({
              userId:
                linkedUserId,

              telegramUserId,

              chatId,

              actionType:
                'debt_payment',

              debtId:
                selectedDebt.id,

              creditorName:
                selectedDebt
                  .creditorName ||
                'دين',

              amount:
                debtPaymentCandidate.amount,

              remainingBefore:
                remainingAmount,

              used: false,

              createdAt:
                now,

              expiresAt:
                now +
                PENDING_TX_EXPIRY_MINUTES *
                  60 *
                  1000,
            });

          await sendTelegramMessage(
            chatId,
            `💳 سداد دين جاهز للتأكيد:

🏦 الدين:
${
  selectedDebt.creditorName ||
  'دين'
}

💰 مبلغ السداد:
${formatMoney(
  debtPaymentCandidate.amount
)} ج.م

📉 المتبقي الحالي:
${formatMoney(
  remainingAmount
)} ج.م

✅ المتبقي بعد السداد:
${formatMoney(
  Math.max(
    0,
    remainingAmount -
      debtPaymentCandidate.amount
  )
)} ج.م

هل تريد تنفيذ السداد؟

اكتب:
تأكيد

أو:
إلغاء`
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        // ======================================================
        // 2. Detect Income
        // ======================================================

        const incomeCandidate =
          extractIncomeCandidate(
            text
          );

        if (incomeCandidate) {
          const wallet =
            await getPrimaryWallet(
              linkedUserId
            );

          if (!wallet) {
            await sendTelegramMessage(
              chatId,
              `⚠️ مفيش محفظة متاحة في حسابك.

افتح Mizaniya AI وأنشئ محفظة الأول.`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const transactionPayload =
            {
              title:
                incomeCandidate.title,

              amount:
                incomeCandidate.amount,

              currency:
                wallet.currency ||
                'EGP',

              type:
                'income' as const,

              category:
                'Income & Salary' as const,

              walletId:
                wallet.id,

              paymentMethod:
                'Cash' as const,

              date:
                new Date()
                  .toISOString()
                  .split('T')[0],

              notes:
                'تم تسجيل الدخل من Telegram',

              aiTag:
                'telegram-income',
            };

          const validation =
            transactionCreateSchema.safeParse(
              transactionPayload
            );

          if (
            !validation.success
          ) {
            console.error(
              'Telegram income validation failed:',
              validation.error.format()
            );

            await sendTelegramMessage(
              chatId,
              'تعذر تجهيز الدخل للتسجيل.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const now =
            Date.now();

          await db
            .collection(
              'telegram_pending_transactions'
            )
            .doc(
              String(
                telegramUserId
              )
            )
            .set({
              userId:
                linkedUserId,

              telegramUserId,

              chatId,

              actionType:
                'transaction',

              transaction:
                validation.data,

              used: false,

              createdAt:
                now,

              expiresAt:
                now +
                PENDING_TX_EXPIRY_MINUTES *
                  60 *
                  1000,
            });

          await sendTelegramMessage(
            chatId,
            `💵 دخل جديد جاهز للتسجيل:

💰 المبلغ:
${formatMoney(incomeCandidate.amount)} ج.م

📝 الوصف:
${incomeCandidate.title}

📂 التصنيف:
الدخل والراتب

👛 المحفظة:
${wallet.nameAr || wallet.name}

هل تريد تسجيل الدخل؟

اكتب:
تأكيد

أو:
إلغاء`
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        // ======================================================
        // 3. Detect Expense
        // ======================================================

        const expenseCandidate =
          extractExpenseCandidate(
            text
          );

        if (expenseCandidate) {
          const wallet =
            await getPrimaryWallet(
              linkedUserId
            );

          if (!wallet) {
            await sendTelegramMessage(
              chatId,
              `⚠️ مفيش محفظة متاحة في حسابك.

افتح Mizaniya AI وأنشئ محفظة الأول.`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const transactionPayload =
            {
              title:
                expenseCandidate.title,

              amount:
                expenseCandidate.amount,

              currency:
                wallet.currency ||
                'EGP',

              type:
                'expense' as const,

              category:
                expenseCandidate.category,

              walletId:
                wallet.id,

              paymentMethod:
                'Cash' as const,

              date:
                new Date()
                  .toISOString()
                  .split('T')[0],

              notes:
                'تم تسجيل المصروف من Telegram',

              aiTag:
                'telegram-expense',
            };

          const validation =
            transactionCreateSchema.safeParse(
              transactionPayload
            );

          if (
            !validation.success
          ) {
            console.error(
              'Telegram expense validation failed:',
              validation.error.format()
            );

            await sendTelegramMessage(
              chatId,
              'تعذر تجهيز المصروف للتسجيل.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const now =
            Date.now();

          await db
            .collection(
              'telegram_pending_transactions'
            )
            .doc(
              String(
                telegramUserId
              )
            )
            .set({
              userId:
                linkedUserId,

              telegramUserId,

              chatId,

              actionType:
                'transaction',

              transaction:
                validation.data,

              used: false,

              createdAt:
                now,

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

هل تريد تسجيل المصروف؟

اكتب:
تأكيد

أو:
إلغاء`
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        // ======================================================
        // 4. Normal Read Query
        // ======================================================

        const reply =
          await handleFinancialQuery(
            linkedUserId,
            text
          );

        await sendTelegramMessage(
          chatId,
          reply
        );
      }

      return res
        .status(200)
        .json({
          success: true,
          received: true,
        });
    } catch (error: any) {
      console.error(
        'Telegram webhook error:',
        error
      );

      // Return 200 to Telegram to avoid retry storms.
      return res
        .status(200)
        .json({
          success: false,
          error: error.message,
        });
    }
  }
);

// ============================================================
// Telegram Webhook Setup
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
        return res
          .status(500)
          .json({
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

      return res
        .status(500)
        .json({
          success: false,
          error:
            error.message,
        });
    }
  }
);

// ============================================================
// Telegram Webhook Info
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
        return res
          .status(500)
          .json({
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

      return res
        .status(500)
        .json({
          success: false,
          error:
            error.message,
        });
    }
  }
);

// ============================================================
// Telegram Health
// GET /telegram/health
// ============================================================

router.get(
  '/health',
  (
    _req: Request,
    res: Response
  ) => {
    return res
      .status(200)
      .json({
        success: true,
        service:
          'Mizaniya AI Telegram Bot',
        status: 'ready',
      });
  }
);

export default router;
