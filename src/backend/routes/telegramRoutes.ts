import { Router, Request, Response } from 'express';
import { createHash, randomInt } from 'crypto';

import { db } from '../config/firebaseAdmin';

import {
  getTrustedFinancialContext,
  getObligationAmountDueForMonth,
} from '../services/financialContextService';

import { transactionRepository } from '../repositories/transactionRepository';
import { billRepository } from '../repositories/budgetAndGoalRepositories';
import { getWalletsForUser } from '../services/walletService';
import { transactionCreateSchema, billCreateSchema } from '../validators/schemas';
import { recordDebtPayment } from '../services/debtService';
import { createObligation } from '../services/obligationService';
import { routeFinancialIntent } from '../services/financialIntentRouter';
import { matchFinancialContext } from '../services/financialContextMatcher';

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
// Telegram Account Link
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
// Budget Stale Flag
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
// Category Detection
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
    normalized.includes('العيله') ||
    normalized.includes('العائله')
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
// Obligation Payment Parser
// ============================================================

function extractObligationPaymentCandidate(
  text: string
): {
  amount: number;
  searchText: string;
} | null {
  const normalized =
    normalizeArabicText(text);

  const hasPaymentWord =
    normalized.includes('دفعت') ||
    normalized.includes('سددت') ||
    normalized.includes('سداد');

  const hasObligationWord =
    normalized.includes('التزام') ||
    normalized.includes('التزامات');

  if (
    !hasPaymentWord ||
    !hasObligationWord
  ) {
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
          /دفعت|سددت|سداد|التزام|التزامات|من/gi,
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
// Bill Helpers & Parsers
// ============================================================

function buildDueDateFromDay(day: number): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth();

  const safeDay = Math.max(1, Math.min(31, Math.trunc(day)));
  const lastDayThisMonth = new Date(year, month + 1, 0).getDate();
  let candidateDay = Math.min(safeDay, lastDayThisMonth);
  let candidate = new Date(year, month, candidateDay);
  const today = new Date(year, month, now.getDate());

  // If that due day already passed, use next month.
  if (candidate < today) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
    const lastDayNextMonth = new Date(year, month + 1, 0).getDate();
    candidateDay = Math.min(safeDay, lastDayNextMonth);
    candidate = new Date(year, month, candidateDay);
  }

  return `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, '0')}-${String(candidate.getDate()).padStart(2, '0')}`;
}

function extractCreateBillCandidate(
  text: string
): {
  title: string;
  amount: number;
  dueDate: string;
} | null {
  const normalized = normalizeArabicText(text);

  const hasBillWord =
    normalized.includes('فاتوره');

  const hasCreateWord =
    normalized.includes('اضف') ||
    normalized.includes('سجل') ||
    normalized.includes('انشئ') ||
    normalized.includes('اعمل');

  const hasPaymentWord =
    normalized.includes('دفعت') ||
    normalized.includes('سددت') ||
    normalized.includes('سداد');

  if (!hasBillWord || !hasCreateWord || hasPaymentWord) {
    return null;
  }

  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/);
  if (!amountMatch) {
    return null;
  }

  const amount = Number(amountMatch[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const explicitDateMatch = text.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  const dueDayMatch = text.match(/(?:يوم|بتاريخ|استحقاق|مستحق(?:ة)?(?:\s+يوم)?)\s*(\d{1,2})\b/i);

  let dueDate: string;

  if (explicitDateMatch) {
    const year = Number(explicitDateMatch[1]);
    const month = Math.max(1, Math.min(12, Number(explicitDateMatch[2])));
    const day = Math.max(1, Math.min(31, Number(explicitDateMatch[3])));
    const lastDay = new Date(year, month, 0).getDate();

    dueDate = `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
  } else if (dueDayMatch) {
    dueDate = buildDueDateFromDay(Number(dueDayMatch[1]));
  } else {
    dueDate = new Date().toISOString().split('T')[0];
  }

  let title = text
    .replace(amountMatch[0], '')
    .replace(/\b20\d{2}-\d{1,2}-\d{1,2}\b/g, '')
    .replace(/(?:يوم|بتاريخ|استحقاق|مستحق(?:ة)?(?:\s+يوم)?)\s*\d{1,2}\b/gi, '')
    .replace(/جنيه|جنية|جنيها|جنيهًا|ج\.م/gi, '')
    .replace(/أضف|اضف|إضافة|اضافة|سجل|أنشئ|انشئ|اعمل/gi, '')
    .replace(/فاتورة|فاتوره/gi, '')
    .replace(/بقيمة|بقيمه|بمبلغ|قيمتها|مبلغها/gi, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (title.length < 2) {
    title = 'فاتورة';
  }

  return {
    title,
    amount,
    dueDate,
  };
}

function extractBillPaymentCandidate(
  text: string
): {
  searchText: string;
  amount?: number;
} | null {
  const normalized = normalizeArabicText(text);

  const hasPaymentIntent =
    normalized.includes('دفعت') ||
    normalized.includes('سددت') ||
    normalized.includes('سداد');

  const hasBillWord = normalized.includes('فاتوره');

  if (!hasPaymentIntent || !hasBillWord) {
    return null;
  }

  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/);
  const amount = amountMatch
    ? Number(amountMatch[1].replace(',', '.'))
    : undefined;

  let searchSource = text;

  if (amountMatch) {
    searchSource = searchSource.replace(amountMatch[0], '');
  }

  const searchText = normalizeArabicText(
    searchSource
      .replace(/جنيه|جنية|جنيها|جنيهًا|ج\.م/gi, '')
      .replace(/دفعت|سددت|سداد|فاتورة|فاتوره|من/gi, '')
      .replace(/\s+/g, ' ')
      .trim()
  );

  return {
    searchText,
    amount:
      amount !== undefined && Number.isFinite(amount) && amount > 0
        ? amount
        : undefined,
  };
}

// ============================================================
// Create Recurring Obligation Parser
// ============================================================

function extractCreateObligationCandidate(
  text: string
): {
  name: string;
  amount: number;
  frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';
} | null {
  const normalized = normalizeArabicText(text);

  const hasCreateIntent =
    normalized.includes('اضف التزام') ||
    normalized.includes('سجل التزام') ||
    normalized.includes('اعمل التزام') ||
    normalized.includes('انشئ التزام') ||
    normalized.includes('عندي التزام');

  const hasRecurringMeaning =
    normalized.includes('شهري') ||
    normalized.includes('كل شهر') ||
    normalized.includes('اسبوعي') ||
    normalized.includes('كل اسبوع') ||
    normalized.includes('ربع سنوي') ||
    normalized.includes('كل 3 شهور') ||
    normalized.includes('كل ثلاث شهور') ||
    normalized.includes('سنوي') ||
    normalized.includes('كل سنه');

  if (!hasCreateIntent || !hasRecurringMeaning) {
    return null;
  }

  const amountMatch = text.match(/(\d+(?:[.,]\d+)?)/);

  if (!amountMatch) {
    return null;
  }

  const amount = Number(amountMatch[1].replace(',', '.'));

  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  let frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' = 'MONTHLY';

  if (
    normalized.includes('اسبوعي') ||
    normalized.includes('كل اسبوع')
  ) {
    frequency = 'WEEKLY';
  } else if (
    normalized.includes('ربع سنوي') ||
    normalized.includes('كل 3 شهور') ||
    normalized.includes('كل ثلاث شهور')
  ) {
    frequency = 'QUARTERLY';
  } else if (
    normalized.includes('سنوي') ||
    normalized.includes('كل سنه')
  ) {
    frequency = 'YEARLY';
  }

  let name = text
    .replace(amountMatch[0], '')
    .replace(/جنيه|جنية|جنيها|ج\.م/gi, '')
    .replace(/أضف|اضف|سجل|اعمل|أنشئ|انشئ|عندي/gi, '')
    .replace(/التزام|التزامات/gi, '')
    .replace(/شهري|شهريا|كل شهر/gi, '')
    .replace(/أسبوعي|اسبوعي|كل أسبوع|كل اسبوع/gi, '')
    .replace(/ربع سنوي|كل 3 شهور|كل ثلاث شهور/gi, '')
    .replace(/سنوي|سنويا|كل سنة|كل سنه/gi, '')
    .replace(/بقيمة|بقيمه|بمبلغ|قيمته|مبلغه/gi, '')
    .trim();

  name = name.replace(/\s+/g, ' ').trim();

  if (name.length < 2) {
    return null;
  }

  return {
    name,
    amount,
    frequency,
  };
}

function getArabicFrequencyName(
  frequency: 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
): string {
  switch (frequency) {
    case 'WEEKLY':
      return 'أسبوعي';
    case 'QUARTERLY':
      return 'ربع سنوي';
    case 'YEARLY':
      return 'سنوي';
    case 'MONTHLY':
    default:
      return 'شهري';
  }
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

  // Wallet
  if (
    normalized.includes('رصيدي') ||
    normalized.includes('الرصيد') ||
    normalized.includes('معايا كام') ||
    normalized.includes('معي كام')
  ) {
    return `💰 إجمالي رصيد المحافظ المسجل حاليًا:

${formatMoney(context.totalWalletBalance || 0)} ج.م`;
  }

  // Expenses
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
    const installments =
      Number(
        context.monthlyInstallmentObligation ||
          0
      );

    const unpaidBills =
      Number(
        context.unpaidBillsTotal || 0
      );

    const obligations =
      Number(
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
    normalized.includes(
      'تقدر تعمل ايه'
    )
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
دفعت 500 جنيه من دين CIB

🧾 إضافة فاتورة:
أضف فاتورة كهرباء 450 جنيه يوم 20

🧾 سداد فاتورة:
دفعت فاتورة الكهرباء

📅 سداد التزام:
دفعت 300 جنيه من التزام الإنترنت

➕ إنشاء التزام متكرر:
أضف التزام شهري نت 600 جنيه

كل عملية مالية لازم تؤكدها قبل التنفيذ.`;
  }

  return `🤖 أنا متصل بحساب Mizaniya AI بتاعك.

جرب مثلًا:

رصيدي كام؟
صرفت كام الشهر ده؟
فاضل من الميزانية كام؟

💸 مصروف:
سجل 150 جنيه بنزين

💵 دخل:
قبضت 500 جنيه مكافأة

💳 سداد دين:
دفعت 500 جنيه من دين CIB

🧾 إضافة فاتورة:
أضف فاتورة كهرباء 450 جنيه يوم 20

🧾 سداد فاتورة:
دفعت فاتورة الكهرباء

📅 سداد التزام:
دفعت 300 جنيه من التزام الإنترنت

➕ إنشاء التزام متكرر:
أضف التزام شهري نت 600 جنيه`;
}

// ============================================================
// Telegram Webhook
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
        return res
          .status(200)
          .json({
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
        return res
          .status(200)
          .json({
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

حساب Telegram بتاعك مربوط بالفعل ✅

تقدر تستعلم عن بياناتك، تسجل مصروف ودخل، وتسدد دين أو التزام.

اكتب:
/help`
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

اكتب /help لمعرفة الأوامر.`
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

        const now =
          Date.now();

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
              message.from
                ?.username ||
              null,

            telegramFirstName:
              message.from
                ?.first_name ||
              null,

            telegramLastName:
              message.from
                ?.last_name ||
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
      // Ensure Linked Account
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
      // DEBUG - Verify latest Telegram router deployment
      // ========================================================

      if (normalized === 'billtest') {
        await sendTelegramMessage(
          chatId,
          '✅ BILL ROUTER V3 شغال'
        );

        return res.status(200).json({
          success: true,
          received: true,
        });
      }

      // ========================================================
      // Confirm Pending Action
      // ========================================================

      if (
        normalized === 'تاكيد' ||
        normalized === 'ايوه' ||
        normalized ===
          'ايوه سجل' ||
        normalized ===
          'ايوه سجله' ||
        normalized === 'موافق'
      ) {
        const pendingRef =
          db
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
              pending.expiresAt ||
                0
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
        // Confirm Create Bill
        // ======================================================

        if (
          pending.actionType ===
          'create_bill'
        ) {
          const title = String(pending.billTitle || '').trim();
          const amount = Number(pending.amount || 0);
          const dueDate = String(pending.dueDate || '').trim();

          const parsedBill = billCreateSchema.safeParse({
            title,
            titleAr: title,
            biller: pending.biller || title,
            amount,
            dueDate,
            isPaid: false,
            paymentMethod: 'Cash',
            icon: 'ReceiptText',
            urgency: pending.urgency || 'medium',
            notes: 'تم إنشاء الفاتورة من Telegram',
          });

          if (!parsedBill.success) {
            console.error(
              'Telegram create bill validation failed:',
              parsedBill.error.format()
            );

            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              'تعذر إنشاء الفاتورة لأن بياناتها غير صالحة.'
            );

            return res.status(200).json({
              success: true,
              received: true,
            });
          }

          const existingBills = await billRepository.getBills(linkedUserId);
          const duplicate = existingBills.find((bill: any) =>
            !bill.isPaid &&
            normalizeArabicText(String(bill.titleAr || bill.title || '')) ===
              normalizeArabicText(title) &&
            Number(bill.amount || 0) === amount &&
            String(bill.dueDate || '') === dueDate
          );

          if (duplicate) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              `⚠️ الفاتورة دي موجودة بالفعل وغير مدفوعة:\n\n🧾 ${title}\n💰 ${formatMoney(amount)} ج.م\n📅 ${dueDate}\n\nلم يتم إنشاء فاتورة مكررة.`
            );

            return res.status(200).json({
              success: true,
              received: true,
            });
          }

          const createdBill = await billRepository.saveBill(
            linkedUserId,
            parsedBill.data as any
          );

          await markBudgetStale(linkedUserId);
          await pendingRef.delete();

          await sendTelegramMessage(
            chatId,
            `✅ تم إنشاء الفاتورة بنجاح.\n\n🧾 الفاتورة:\n${createdBill.titleAr || createdBill.title}\n\n💰 المبلغ:\n${formatMoney(createdBill.amount)} ج.م\n\n📅 تاريخ الاستحقاق:\n${createdBill.dueDate}\n\n⚠️ لم يتم خصم أي مبلغ من المحفظة لأن الفاتورة لم تُدفع بعد.\n\nرقم الفاتورة:\n${createdBill.id}`
          );

          return res.status(200).json({
            success: true,
            received: true,
          });
        }

        // ======================================================
        // Confirm Bill Payment
        // ======================================================

        if (
          pending.actionType ===
          'bill_payment'
        ) {
          const billId = String(pending.billId || '');
          const walletId = String(pending.walletId || '');

          if (!billId || !walletId) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              'تعذر سداد الفاتورة لأن بيانات العملية غير صالحة.'
            );

            return res.status(200).json({
              success: true,
              received: true,
            });
          }

          const bills = await billRepository.getBills(linkedUserId);
          const bill = bills.find((item: any) => item.id === billId);

          if (!bill) {
            await pendingRef.delete();
            await sendTelegramMessage(chatId, '⚠️ الفاتورة لم تعد موجودة.');
            return res.status(200).json({ success: true, received: true });
          }

          if (bill.isPaid) {
            await pendingRef.delete();
            await sendTelegramMessage(chatId, '✅ الفاتورة مدفوعة بالفعل.');
            return res.status(200).json({ success: true, received: true });
          }

          const amount = Number(bill.amount || 0);

          if (!Number.isFinite(amount) || amount <= 0) {
            await pendingRef.delete();
            await sendTelegramMessage(chatId, '⚠️ مبلغ الفاتورة غير صالح.');
            return res.status(200).json({ success: true, received: true });
          }

          const transactionPayload = {
            title: `سداد فاتورة ${bill.titleAr || bill.title}`,
            amount,
            currency: pending.walletCurrency || 'EGP',
            type: 'expense' as const,
            category: 'Bills & Subscriptions' as const,
            walletId,
            paymentMethod: 'Cash' as const,
            date: new Date().toISOString().split('T')[0],
            merchant: bill.biller || undefined,
            notes: `تم سداد الفاتورة من Telegram - Bill ID: ${bill.id}`,
            aiTag: 'telegram-bill-payment',
          };

          const validation = transactionCreateSchema.safeParse(transactionPayload);

          if (!validation.success) {
            console.error(
              'Telegram bill payment validation failed:',
              validation.error.format()
            );

            await pendingRef.delete();
            await sendTelegramMessage(chatId, 'تعذر تسجيل سداد الفاتورة.');
            return res.status(200).json({ success: true, received: true });
          }

          const transaction = await transactionRepository.createTransaction(
            linkedUserId,
            validation.data
          );

          const paidBill = await billRepository.payBill(linkedUserId, billId);

          if (!paidBill) {
            // The transaction has already been created at this point. This should
            // only happen if the bill disappeared between the live read and write.
            console.error('Bill disappeared after transaction creation:', billId);
          }

          await markBudgetStale(linkedUserId);
          await pendingRef.delete();

          await sendTelegramMessage(
            chatId,
            `✅ تم سداد الفاتورة بنجاح.\n\n🧾 الفاتورة:\n${bill.titleAr || bill.title}\n\n💰 المبلغ:\n${formatMoney(amount)} ج.م\n\n👛 تم الخصم من:\n${pending.walletName || 'المحفظة'}\n\n✅ تم تعليم الفاتورة كمدفوعة\n📊 وتم تحديث الميزانية\n\nرقم المعاملة:\n${transaction.id}`
          );

          return res.status(200).json({
            success: true,
            received: true,
          });
        }

        // ======================================================
        // Confirm Create Recurring Obligation
        // ======================================================

        if (
          pending.actionType ===
          'create_obligation'
        ) {
          const obligationName =
            String(pending.obligationName || '').trim();

          const amount =
            Number(pending.amount || 0);

          const frequency =
            String(pending.frequency || 'MONTHLY') as
              'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY';

          if (
            obligationName.length < 2 ||
            !Number.isFinite(amount) ||
            amount <= 0 ||
            !['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'].includes(frequency)
          ) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              'تعذر إنشاء الالتزام لأن بيانات العملية غير صالحة.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const contextBefore =
            await getTrustedFinancialContext(
              linkedUserId
            );

          const duplicate = (
            contextBefore.obligations || []
          ).find((ob: any) => {
            const sameName =
              normalizeArabicText(String(ob.name || '')) ===
              normalizeArabicText(obligationName);

            const sameFrequency =
              String(ob.frequency || 'MONTHLY').toUpperCase() === frequency;

            const active =
              ob.status === 'ACTIVE' ||
              ob.status === 'active';

            return sameName && sameFrequency && active;
          });

          if (duplicate) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              `⚠️ عندك بالفعل التزام نشط بنفس الاسم والتكرار:

📌 ${obligationName}
🔁 ${getArabicFrequencyName(frequency)}
💰 ${formatMoney(Number(duplicate.amount || 0))} ج.م

لم يتم إنشاء التزام مكرر.`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const today = new Date()
            .toISOString()
            .split('T')[0];

          const created =
            await createObligation(
              linkedUserId,
              {
                name: obligationName,
                amount,
                category:
                  pending.category ||
                  detectExpenseCategory(obligationName),
                dueDate:
                  pending.dueDate || today,
                frequency,
                notes:
                  'تم إنشاء الالتزام من Telegram',
              }
            );

          await markBudgetStale(
            linkedUserId
          );

          await pendingRef.delete();

          await sendTelegramMessage(
            chatId,
            `✅ تم إنشاء الالتزام بنجاح.

📌 الالتزام:
${obligationName}

💰 المبلغ:
${formatMoney(amount)} ج.م

🔁 التكرار:
${getArabicFrequencyName(frequency)}

📅 تاريخ البداية/الاستحقاق:
${today}

رقم الالتزام:
${created.id}`
          );

          return res
            .status(200)
            .json({
              success: true,
              received: true,
            });
        }

        // ======================================================
        // Confirm Obligation Payment
        // ======================================================

        if (
          pending.actionType ===
          'obligation_payment'
        ) {
          const obligationId =
            String(
              pending.obligationId ||
                ''
            );

          const amount =
            Number(
              pending.amount || 0
            );

          const walletId =
            String(
              pending.walletId ||
                ''
            );

          if (
            !obligationId ||
            !walletId ||
            !Number.isFinite(
              amount
            ) ||
            amount <= 0
          ) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              'تعذر تنفيذ سداد الالتزام لأن بيانات العملية غير صالحة.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          // Re-read live data
          const contextBefore =
            await getTrustedFinancialContext(
              linkedUserId
            );

          const obligation = (
            contextBefore.obligations ||
            []
          ).find(
            (ob: any) =>
              ob.id ===
              obligationId
          );

          if (!obligation) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              '⚠️ الالتزام لم يعد موجودًا في حسابك.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          if (
            obligation.status !==
              'ACTIVE' &&
            obligation.status !==
              'active'
          ) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              '⚠️ الالتزام لم يعد نشطًا.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const monthKey =
            new Date()
              .toISOString()
              .slice(0, 7);

          const dueInfo =
            getObligationAmountDueForMonth(
              obligation,
              monthKey
            );

          const currentDue =
            Number(
              dueInfo.amount || 0
            );

          const currentlyPaid =
            contextBefore
              .recentTransactions
              .filter(
                (tx) =>
                  tx.type ===
                    'expense' &&
                  tx.relatedObligationId ===
                    obligationId &&
                  String(
                    tx.date || ''
                  ).startsWith(
                    monthKey
                  )
              )
              .reduce(
                (sum, tx) =>
                  sum +
                  Number(
                    tx.amount || 0
                  ),
                0
              );

          const remainingNow =
            Math.max(
              0,
              currentDue -
                currentlyPaid
            );

          if (
            remainingNow <= 0
          ) {
            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              '✅ الالتزام مدفوع بالكامل بالفعل لهذا الشهر.'
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
              `⚠️ قيمة الالتزام اتغيرت قبل التأكيد.

المتبقي حاليًا:
${formatMoney(
  remainingNow
)} ج.م

ابعت عملية السداد من جديد.`
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
                `سداد ${obligation.name}`,

              amount,

              currency:
                pending.walletCurrency ||
                'EGP',

              type:
                'expense' as const,

              category:
                'Bills & Subscriptions' as const,

              walletId,

              paymentMethod:
                'Cash' as const,

              date:
                new Date()
                  .toISOString()
                  .split('T')[0],

              notes:
                'تم سداد الالتزام من Telegram',

              aiTag:
                'telegram-obligation-payment',

              relatedObligationId:
                obligationId,
            };

          const validation =
            transactionCreateSchema.safeParse(
              transactionPayload
            );

          if (
            !validation.success
          ) {
            console.error(
              'Telegram obligation validation failed:',
              validation.error.format()
            );

            await pendingRef.delete();

            await sendTelegramMessage(
              chatId,
              'تعذر تسجيل سداد الالتزام.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          await transactionRepository.createTransaction(
            linkedUserId,
            validation.data
          );

          await markBudgetStale(
            linkedUserId
          );

          await pendingRef.delete();

          const remainingAfter =
            Math.max(
              0,
              remainingNow -
                amount
            );

          await sendTelegramMessage(
            chatId,
            `✅ تم تسجيل سداد الالتزام بنجاح.

📌 الالتزام:
${obligation.name}

💰 المدفوع:
${formatMoney(amount)} ج.م

📉 المتبقي لهذا الشهر:
${formatMoney(
  remainingAfter
)} ج.م

👛 تم خصم المبلغ من:
${pending.walletName || 'المحفظة'}

📊 وتم تحديث الميزانية تلقائيًا.`
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
            !Number.isFinite(
              amount
            ) ||
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

          const contextBefore =
            await getTrustedFinancialContext(
              linkedUserId
            );

          const currentDebt = (
            contextBefore.debts ||
            []
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
              currentDebt
                .remainingAmount ||
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
${formatMoney(
  remainingNow
)} ج.م

ابعت عملية السداد من جديد.`
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
            contextAfter.debts ||
            []
          ).find(
            (debt: any) =>
              debt.id === debtId
          );

          const remainingAfter =
            Number(
              updatedDebt
                ?.remainingAmount ||
                0
            );

          await sendTelegramMessage(
            chatId,
            `✅ تم تسجيل سداد الدين بنجاح.

🏦 الدين:
${pending.creditorName || 'دين'}

💰 المبلغ المدفوع:
${formatMoney(amount)} ج.م

📉 المتبقي على الدين:
${formatMoney(
  remainingAfter
)} ج.م

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
        // Confirm Income / Expense
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
${formatMoney(
  parsed.data.amount
)} ج.م

📝 الوصف:
${parsed.data.title}

📂 التصنيف:
${getArabicCategoryName(
  parsed.data.category
)}

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
      // Cancel Pending Action
      // ========================================================

      if (
        normalized === 'الغاء' ||
        normalized === 'لا' ||
        normalized ===
          'متسجلش' ||
        normalized ===
          'مش موافق'
      ) {
        const pendingRef =
          db
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
        // Smart Financial Intent Router V1
        // ======================================================

        const smartIntent = routeFinancialIntent(text);
        let billPaymentFallsBackToExpense = false;

        console.log(
          'Telegram financial intent:',
          JSON.stringify(smartIntent)
        );

        // ======================================================
        // 1. Create Bill FIRST
        // ======================================================

        const createBillCandidate =
          smartIntent.intent === 'CREATE_BILL'
            ? extractCreateBillCandidate(text)
            : null;

        if (createBillCandidate) {
          const now = Date.now();

          await db
            .collection('telegram_pending_transactions')
            .doc(String(telegramUserId))
            .set({
              userId: linkedUserId,
              telegramUserId,
              chatId,
              actionType: 'create_bill',
              billTitle: createBillCandidate.title,
              biller: createBillCandidate.title,
              amount: createBillCandidate.amount,
              dueDate: createBillCandidate.dueDate,
              urgency: 'medium',
              used: false,
              createdAt: now,
              expiresAt:
                now +
                PENDING_TX_EXPIRY_MINUTES * 60 * 1000,
            });

          await sendTelegramMessage(
            chatId,
            `🧾 فاتورة جديدة جاهزة للإضافة:\n\n📌 الفاتورة:\n${createBillCandidate.title}\n\n💰 المبلغ:\n${formatMoney(createBillCandidate.amount)} ج.م\n\n📅 تاريخ الاستحقاق:\n${createBillCandidate.dueDate}\n\n⚠️ إنشاء الفاتورة لا يخصم أي مبلغ من المحفظة.\n\nهل تريد إنشاء الفاتورة؟\n\nاكتب:\nتأكيد\n\nأو:\nإلغاء`
          );

          return res.status(200).json({
            success: true,
            received: true,
          });
        }

        // ======================================================
        // 2. Bill Payment
        // ======================================================

        const billPaymentCandidate =
          smartIntent.intent === 'PAY_BILL'
            ? extractBillPaymentCandidate(text)
            : null;

        if (billPaymentCandidate) {
          const bills = await billRepository.getBills(linkedUserId);
          const unpaidBills = bills.filter((bill: any) => !bill.isPaid);

          const matchingBills = unpaidBills.filter((bill: any) => {
            const title = normalizeArabicText(
              String(bill.titleAr || bill.title || '')
            );
            const biller = normalizeArabicText(String(bill.biller || ''));
            const search = billPaymentCandidate.searchText;

            if (!search) {
              return unpaidBills.length === 1;
            }

            return (
              title.includes(search) ||
              search.includes(title) ||
              biller.includes(search) ||
              (biller && search.includes(biller))
            );
          });

          // If the user said "دفعت فاتورة ..." but there is no stored Bill,
          // preserve the old safe behavior and treat it as a normal expense.
          billPaymentFallsBackToExpense = matchingBills.length === 0;

          // No matching stored bill: let normal expense handling continue.
          if (matchingBills.length === 1) {
            const selectedBill: any = matchingBills[0];
            const billAmount = Number(selectedBill.amount || 0);

            if (
              billPaymentCandidate.amount !== undefined &&
              Math.abs(billPaymentCandidate.amount - billAmount) > 0.01
            ) {
              await sendTelegramMessage(
                chatId,
                `⚠️ المبلغ اللي كتبته مختلف عن قيمة الفاتورة المسجلة.\n\n🧾 الفاتورة:\n${selectedBill.titleAr || selectedBill.title}\n\n💰 القيمة المسجلة:\n${formatMoney(billAmount)} ج.م\n\n💵 المبلغ المكتوب:\n${formatMoney(billPaymentCandidate.amount)} ج.م\n\nلو عايز تسدد الفاتورة المسجلة ابعت:\nدفعت فاتورة ${selectedBill.titleAr || selectedBill.title}`
              );

              return res.status(200).json({
                success: true,
                received: true,
              });
            }

            const wallet = await getPrimaryWallet(linkedUserId);

            if (!wallet) {
              await sendTelegramMessage(
                chatId,
                '⚠️ مفيش محفظة متاحة في حسابك. أنشئ محفظة من Mizaniya AI الأول.'
              );
              return res.status(200).json({ success: true, received: true });
            }

            const now = Date.now();

            await db
              .collection('telegram_pending_transactions')
              .doc(String(telegramUserId))
              .set({
                userId: linkedUserId,
                telegramUserId,
                chatId,
                actionType: 'bill_payment',
                billId: selectedBill.id,
                billTitle: selectedBill.titleAr || selectedBill.title,
                amount: billAmount,
                walletId: wallet.id,
                walletName: wallet.nameAr || wallet.name,
                walletCurrency: wallet.currency || 'EGP',
                used: false,
                createdAt: now,
                expiresAt:
                  now +
                  PENDING_TX_EXPIRY_MINUTES * 60 * 1000,
              });

            await sendTelegramMessage(
              chatId,
              `🧾 سداد فاتورة جاهز للتأكيد:\n\n📌 الفاتورة:\n${selectedBill.titleAr || selectedBill.title}\n\n💰 المبلغ:\n${formatMoney(billAmount)} ج.م\n\n📅 الاستحقاق:\n${selectedBill.dueDate || '-'}\n\n👛 المحفظة:\n${wallet.nameAr || wallet.name}\n\nبعد التأكيد سيتم:\n✅ تسجيل المصروف\n✅ خصم المبلغ من المحفظة\n✅ تعليم الفاتورة كمدفوعة\n✅ تحديث الميزانية\n\nاكتب:\nتأكيد\n\nأو:\nإلغاء`
            );

            return res.status(200).json({
              success: true,
              received: true,
            });
          }

          if (matchingBills.length > 1) {
            const list = matchingBills
              .map(
                (bill: any, index: number) =>
                  `${index + 1}. ${bill.titleAr || bill.title} — ${formatMoney(Number(bill.amount || 0))} ج.م — ${bill.dueDate || '-'}`
              )
              .join('\n');

            await sendTelegramMessage(
              chatId,
              `🧾 لقيت أكتر من فاتورة غير مدفوعة مطابقة:\n\n${list}\n\nاكتب اسم الفاتورة بشكل أوضح.`
            );

            return res.status(200).json({
              success: true,
              received: true,
            });
          }
        }

        // ======================================================
        // Contextual Matching V2
        // Handles natural phrases such as: "دفعت النت 600"
        // before they fall through to a normal expense.
        // ======================================================

        if (
          smartIntent.intent === 'CREATE_EXPENSE' &&
          Number(smartIntent.amount || 0) > 0
        ) {
          const contextualMatch =
            await matchFinancialContext(
              linkedUserId,
              text
            );

          console.log(
            'Telegram contextual match:',
            JSON.stringify({
              type: contextualMatch.type,
              confidence: contextualMatch.confidence,
              billId: contextualMatch.bill?.id,
              obligationId: contextualMatch.obligation?.id,
            })
          );

          // ------------------------------------------------------
          // Ambiguous: both a Bill and an Obligation match.
          // Never guess which one the user meant.
          // ------------------------------------------------------

          if (
            contextualMatch.type === 'AMBIGUOUS'
          ) {
            const bill = contextualMatch.bill;
            const obligation =
              contextualMatch.obligation;

            await sendTelegramMessage(
              chatId,
              `⚠️ لقيت أكتر من حاجة مرتبطة بالرسالة دي ومش هختار من نفسي.

${
                bill
                  ? `🧾 فاتورة: ${
                      bill.titleAr ||
                      bill.title ||
                      'فاتورة'
                    } — ${formatMoney(
                      Number(
                        bill.amount || 0
                      )
                    )} ج.م\n`
                  : ''
              }${
                obligation
                  ? `📅 التزام: ${
                      obligation.name ||
                      'التزام'
                    } — ${formatMoney(
                      Number(
                        obligation.amount ||
                          0
                      )
                    )} ج.م\n`
                  : ''
              }
اكتب بشكل أوضح، مثلًا:

دفعت فاتورة النت

أو:

دفعت 600 جنيه من التزام النت`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          // ------------------------------------------------------
          // Natural-language Bill Payment
          // Example: "دفعت النت 600"
          // ------------------------------------------------------

          if (
            contextualMatch.type === 'BILL' &&
            contextualMatch.bill &&
            contextualMatch.confidence >= 0.55
          ) {
            const selectedBill: any =
              contextualMatch.bill;

            const billAmount = Number(
              selectedBill.amount || 0
            );

            const typedAmount = Number(
              smartIntent.amount || 0
            );

            if (
              !Number.isFinite(billAmount) ||
              billAmount <= 0
            ) {
              await sendTelegramMessage(
                chatId,
                '⚠️ الفاتورة المطابقة موجودة لكن مبلغها غير صالح.'
              );

              return res
                .status(200)
                .json({
                  success: true,
                  received: true,
                });
            }

            if (
              Math.abs(
                typedAmount - billAmount
              ) > 0.01
            ) {
              await sendTelegramMessage(
                chatId,
                `⚠️ لقيت فاتورة مطابقة، لكن المبلغ اللي كتبته مختلف عن قيمتها.

🧾 الفاتورة:
${
  selectedBill.titleAr ||
  selectedBill.title ||
  'فاتورة'
}

💰 القيمة المسجلة:
${formatMoney(billAmount)} ج.م

💵 المبلغ اللي كتبته:
${formatMoney(typedAmount)} ج.م

لو تقصد سداد الفاتورة المسجلة ابعت:
دفعت فاتورة ${
  selectedBill.titleAr ||
  selectedBill.title ||
  ''
}`
              );

              return res
                .status(200)
                .json({
                  success: true,
                  received: true,
                });
            }

            const wallet =
              await getPrimaryWallet(
                linkedUserId
              );

            if (!wallet) {
              await sendTelegramMessage(
                chatId,
                '⚠️ مفيش محفظة متاحة في حسابك. أنشئ محفظة من Mizaniya AI الأول.'
              );

              return res
                .status(200)
                .json({
                  success: true,
                  received: true,
                });
            }

            const now = Date.now();

            await db
              .collection(
                'telegram_pending_transactions'
              )
              .doc(
                String(telegramUserId)
              )
              .set({
                userId: linkedUserId,
                telegramUserId,
                chatId,
                actionType:
                  'bill_payment',
                billId:
                  selectedBill.id,
                billTitle:
                  selectedBill.titleAr ||
                  selectedBill.title,
                amount: billAmount,
                walletId: wallet.id,
                walletName:
                  wallet.nameAr ||
                  wallet.name,
                walletCurrency:
                  wallet.currency ||
                  'EGP',
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
              `🧠 فهمت إنك غالبًا تقصد سداد فاتورة موجودة عندك.

🧾 الفاتورة:
${
  selectedBill.titleAr ||
  selectedBill.title
}

💰 المبلغ:
${formatMoney(billAmount)} ج.م

👛 المحفظة:
${wallet.nameAr || wallet.name}

بعد التأكيد سيتم:
✅ تسجيل المصروف
✅ خصم المبلغ من المحفظة
✅ تعليم الفاتورة كمدفوعة
✅ تحديث الميزانية

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

          // ------------------------------------------------------
          // Natural-language Obligation Payment
          // Example: "دفعت النت 600"
          // ------------------------------------------------------

          if (
            contextualMatch.type ===
              'OBLIGATION' &&
            contextualMatch.obligation &&
            contextualMatch.confidence >= 0.55
          ) {
            const selectedObligation: any =
              contextualMatch.obligation;

            const amount = Number(
              smartIntent.amount || 0
            );

            const context =
              await getTrustedFinancialContext(
                linkedUserId
              );

            const monthKey =
              new Date()
                .toISOString()
                .slice(0, 7);

            const dueInfo =
              getObligationAmountDueForMonth(
                selectedObligation,
                monthKey
              );

            const dueThisMonth = Number(
              dueInfo.amount || 0
            );

            if (dueThisMonth <= 0) {
              await sendTelegramMessage(
                chatId,
                `📅 لقيت التزام "${
                  selectedObligation.name ||
                  'التزام'
                }"، لكنه غير مستحق خلال الشهر الحالي.`
              );

              return res
                .status(200)
                .json({
                  success: true,
                  received: true,
                });
            }

            const paidThisMonth =
              context.recentTransactions
                .filter(
                  (tx) =>
                    tx.type ===
                      'expense' &&
                    tx.relatedObligationId ===
                      selectedObligation.id &&
                    String(
                      tx.date || ''
                    ).startsWith(
                      monthKey
                    )
                )
                .reduce(
                  (sum, tx) =>
                    sum +
                    Number(
                      tx.amount || 0
                    ),
                  0
                );

            const remainingThisMonth =
              Math.max(
                0,
                dueThisMonth -
                  paidThisMonth
              );

            if (
              remainingThisMonth <= 0
            ) {
              await sendTelegramMessage(
                chatId,
                `✅ الالتزام "${
                  selectedObligation.name ||
                  'التزام'
                }" مدفوع بالكامل للشهر الحالي.`
              );

              return res
                .status(200)
                .json({
                  success: true,
                  received: true,
                });
            }

            if (
              amount > remainingThisMonth
            ) {
              await sendTelegramMessage(
                chatId,
                `⚠️ فهمت إن الرسالة مرتبطة بالتزام "${
                  selectedObligation.name ||
                  'التزام'
                }"، لكن مبلغ السداد أكبر من المتبقي لهذا الشهر.

💰 المتبقي:
${formatMoney(
  remainingThisMonth
)} ج.م

💵 المبلغ المكتوب:
${formatMoney(amount)} ج.م`
              );

              return res
                .status(200)
                .json({
                  success: true,
                  received: true,
                });
            }

            const wallet =
              await getPrimaryWallet(
                linkedUserId
              );

            if (!wallet) {
              await sendTelegramMessage(
                chatId,
                `⚠️ مفيش محفظة متاحة في حسابك.

أنشئ محفظة من Mizaniya AI الأول.`
              );

              return res
                .status(200)
                .json({
                  success: true,
                  received: true,
                });
            }

            const now = Date.now();

            await db
              .collection(
                'telegram_pending_transactions'
              )
              .doc(
                String(telegramUserId)
              )
              .set({
                userId: linkedUserId,
                telegramUserId,
                chatId,
                actionType:
                  'obligation_payment',
                obligationId:
                  selectedObligation.id,
                obligationName:
                  selectedObligation.name,
                amount,
                dueThisMonth,
                paidThisMonth,
                remainingBefore:
                  remainingThisMonth,
                walletId: wallet.id,
                walletName:
                  wallet.nameAr ||
                  wallet.name,
                walletCurrency:
                  wallet.currency ||
                  'EGP',
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
              `🧠 لقيت التزام متكرر مطابق للرسالة دي.

📅 الالتزام:
${selectedObligation.name}

💰 مبلغ السداد:
${formatMoney(amount)} ج.م

📉 المتبقي قبل السداد:
${formatMoney(
  remainingThisMonth
)} ج.م

✅ المتبقي بعد السداد:
${formatMoney(
  Math.max(
    0,
    remainingThisMonth - amount
  )
)} ج.م

👛 المحفظة:
${wallet.nameAr || wallet.name}

هل تريد تسجيله كسداد للالتزام؟

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
        }

        // ======================================================
        // 3. Create Recurring Obligation
        // ======================================================

        const createObligationCandidate =
          smartIntent.intent === 'CREATE_OBLIGATION'
            ? extractCreateObligationCandidate(
                text
              )
            : null;

        if (createObligationCandidate) {
          const now = Date.now();

          const today = new Date()
            .toISOString()
            .split('T')[0];

          const category =
            detectExpenseCategory(
              createObligationCandidate.name
            );

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
                'create_obligation',

              obligationName:
                createObligationCandidate.name,

              amount:
                createObligationCandidate.amount,

              frequency:
                createObligationCandidate.frequency,

              category,

              dueDate:
                today,

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
            `📅 التزام متكرر جديد جاهز للإضافة:

📌 الالتزام:
${createObligationCandidate.name}

💰 المبلغ:
${formatMoney(createObligationCandidate.amount)} ج.م

🔁 التكرار:
${getArabicFrequencyName(createObligationCandidate.frequency)}

📂 الفئة:
${getArabicCategoryName(category)}

⚠️ ده التزام متكرر، مش مصروف لحظي.
لن يتم خصم أي مبلغ من المحفظة الآن.

هل تريد إنشاء الالتزام؟

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
        // 2. Obligation Payment
        // ======================================================

        const obligationPaymentCandidate =
          smartIntent.intent === 'PAY_OBLIGATION'
            ? extractObligationPaymentCandidate(
                text
              )
            : null;

        if (
          obligationPaymentCandidate
        ) {
          const context =
            await getTrustedFinancialContext(
              linkedUserId
            );

          const activeObligations =
            (
              context.obligations ||
              []
            ).filter(
              (ob: any) =>
                ob.status ===
                  'ACTIVE' ||
                ob.status ===
                  'active'
            );

          if (
            activeObligations.length ===
            0
          ) {
            await sendTelegramMessage(
              chatId,
              '📅 مفيش التزامات شهرية نشطة مسجلة حاليًا.'
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          let selectedObligation: any =
            null;

          if (
            activeObligations.length ===
            1
          ) {
            selectedObligation =
              activeObligations[0];
          } else {
            const search =
              obligationPaymentCandidate.searchText;

            if (search) {
              selectedObligation =
                activeObligations.find(
                  (ob: any) => {
                    const name =
                      normalizeArabicText(
                        String(
                          ob.name ||
                            ''
                        )
                      );

                    if (!name) {
                      return false;
                    }

                    return (
                      name.includes(
                        search
                      ) ||
                      search.includes(
                        name
                      )
                    );
                  }
                ) || null;
            }
          }

          if (
            !selectedObligation
          ) {
            const obligationList =
              activeObligations
                .map(
                  (
                    ob: any,
                    index: number
                  ) =>
                    `${index + 1}. ${
                      ob.name ||
                      'التزام بدون اسم'
                    } — ${formatMoney(
                      Number(
                        ob.amount ||
                          0
                      )
                    )} ج.م`
                )
                .join('\n');

            await sendTelegramMessage(
              chatId,
              `📅 عندك أكتر من التزام ومش قدرت أحدد تقصد أنهي واحد.

الالتزامات الحالية:

${obligationList}

اكتب اسم الالتزام بشكل أوضح، مثال:

دفعت 500 جنيه من التزام الإنترنت`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const monthKey =
            new Date()
              .toISOString()
              .slice(0, 7);

          const dueInfo =
            getObligationAmountDueForMonth(
              selectedObligation,
              monthKey
            );

          const dueThisMonth =
            Number(
              dueInfo.amount || 0
            );

          if (
            dueThisMonth <= 0
          ) {
            await sendTelegramMessage(
              chatId,
              `📅 الالتزام "${
                selectedObligation.name
              }" غير مستحق خلال الشهر الحالي.`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const paidThisMonth =
            context
              .recentTransactions
              .filter(
                (tx) =>
                  tx.type ===
                    'expense' &&
                  tx.relatedObligationId ===
                    selectedObligation.id &&
                  String(
                    tx.date || ''
                  ).startsWith(
                    monthKey
                  )
              )
              .reduce(
                (sum, tx) =>
                  sum +
                  Number(
                    tx.amount || 0
                  ),
                0
              );

          const remainingThisMonth =
            Math.max(
              0,
              dueThisMonth -
                paidThisMonth
            );

          if (
            remainingThisMonth <=
            0
          ) {
            await sendTelegramMessage(
              chatId,
              `✅ الالتزام "${
                selectedObligation.name
              }" مدفوع بالكامل للشهر الحالي.`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          if (
            obligationPaymentCandidate.amount >
            remainingThisMonth
          ) {
            await sendTelegramMessage(
              chatId,
              `⚠️ مبلغ السداد أكبر من المتبقي على الالتزام هذا الشهر.

📅 الالتزام:
${selectedObligation.name}

💰 المطلوب المتبقي:
${formatMoney(
  remainingThisMonth
)} ج.م

💵 المبلغ اللي كتبته:
${formatMoney(
  obligationPaymentCandidate.amount
)} ج.م`
            );

            return res
              .status(200)
              .json({
                success: true,
                received: true,
              });
          }

          const wallet =
            await getPrimaryWallet(
              linkedUserId
            );

          if (!wallet) {
            await sendTelegramMessage(
              chatId,
              `⚠️ مفيش محفظة متاحة في حسابك.

أنشئ محفظة من Mizaniya AI الأول.`
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
                'obligation_payment',

              obligationId:
                selectedObligation.id,

              obligationName:
                selectedObligation.name,

              amount:
                obligationPaymentCandidate.amount,

              dueThisMonth,

              paidThisMonth,

              remainingBefore:
                remainingThisMonth,

              walletId:
                wallet.id,

              walletName:
                wallet.nameAr ||
                wallet.name,

              walletCurrency:
                wallet.currency ||
                'EGP',

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
            `📅 سداد التزام جاهز للتأكيد:

📌 الالتزام:
${selectedObligation.name}

💰 مبلغ السداد:
${formatMoney(
  obligationPaymentCandidate.amount
)} ج.م

📉 المتبقي قبل السداد:
${formatMoney(
  remainingThisMonth
)} ج.م

✅ المتبقي بعد السداد:
${formatMoney(
  Math.max(
    0,
    remainingThisMonth -
      obligationPaymentCandidate.amount
  )
)} ج.م

👛 المحفظة:
${wallet.nameAr || wallet.name}

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
        // 3. Debt Payment
        // ======================================================

        const debtPaymentCandidate =
          smartIntent.intent === 'PAY_DEBT'
            ? extractDebtPaymentCandidate(
                text
              )
            : null;

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
              '💳 مفيش ديون نشطة مسجلة حاليًا.'
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

مثال:

دفعت 500 جنيه من دين CIB`
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

📉 المتبقي:
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
${selectedDebt.creditorName || 'دين'}

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
        // 4. Income
        // ======================================================

        const incomeCandidate =
          smartIntent.intent === 'CREATE_INCOME'
            ? extractIncomeCandidate(
                text
              )
            : null;

        if (incomeCandidate) {
          const wallet =
            await getPrimaryWallet(
              linkedUserId
            );

          if (!wallet) {
            await sendTelegramMessage(
              chatId,
              `⚠️ مفيش محفظة متاحة في حسابك.

أنشئ محفظة من Mizaniya AI الأول.`
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
${formatMoney(
  incomeCandidate.amount
)} ج.م

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
        // 5. Expense
        // ======================================================

        const expenseCandidate =
          smartIntent.intent === 'CREATE_EXPENSE' ||
          billPaymentFallsBackToExpense
            ? extractExpenseCandidate(
                text
              )
            : null;

        if (expenseCandidate) {
          const wallet =
            await getPrimaryWallet(
              linkedUserId
            );

          if (!wallet) {
            await sendTelegramMessage(
              chatId,
              `⚠️ مفيش محفظة متاحة في حسابك.

أنشئ محفظة من Mizaniya AI الأول.`
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
${formatMoney(
  expenseCandidate.amount
)} ج.م

📝 الوصف:
${expenseCandidate.title}

📂 التصنيف:
${getArabicCategoryName(
  expenseCandidate.category
)}

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
        // 6. Normal Read Query
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

      // Prevent Telegram retry storms
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
// Setup Telegram Webhook
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
