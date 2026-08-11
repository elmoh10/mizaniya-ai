import { CategoryType } from '../../types';

export type FinancialIntent =
  | 'CREATE_EXPENSE'
  | 'CREATE_INCOME'
  | 'CREATE_BILL'
  | 'PAY_BILL'
  | 'CREATE_OBLIGATION'
  | 'PAY_OBLIGATION'
  | 'PAY_DEBT'
  | 'TRANSFER'
  | 'FINANCIAL_QUERY'
  | 'UNKNOWN';

export interface FinancialIntentResult {
  intent: FinancialIntent;

  amount?: number;

  title?: string;

  category?: CategoryType;

  dueDay?: number;

  frequency?:
    | 'WEEKLY'
    | 'MONTHLY'
    | 'QUARTERLY'
    | 'YEARLY';

  confidence: number;

  originalText: string;
}

// ============================================================
// Arabic Normalization
// ============================================================

function normalizeArabicText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[؟?!،,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// Extract Amount
// ============================================================

function extractAmount(text: string): number | undefined {
  const matches = text.match(/\d+(?:[.,]\d+)?/g);

  if (!matches || matches.length === 0) {
    return undefined;
  }

  for (const match of matches) {
    const amount = Number(
      match.replace(',', '.')
    );

    if (
      Number.isFinite(amount) &&
      amount > 0
    ) {
      return amount;
    }
  }

  return undefined;
}

// ============================================================
// Due Day
// ============================================================

function extractDueDay(
  text: string
): number | undefined {
  const normalized =
    normalizeArabicText(text);

  const patterns = [
    /يوم\s+(\d{1,2})/,
    /يوم(\d{1,2})/,
    /بتاريخ\s+(\d{1,2})/,
    /ميعاد\s+(\d{1,2})/,
  ];

  for (const pattern of patterns) {
    const match =
      normalized.match(pattern);

    if (!match) continue;

    const day = Number(match[1]);

    if (day >= 1 && day <= 31) {
      return day;
    }
  }

  return undefined;
}

// ============================================================
// Recurring Frequency
// ============================================================

function extractFrequency(
  text: string
):
  | 'WEEKLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY'
  | undefined {
  const normalized =
    normalizeArabicText(text);

  if (
    normalized.includes('كل اسبوع') ||
    normalized.includes('اسبوعي')
  ) {
    return 'WEEKLY';
  }

  if (
    normalized.includes('كل شهر') ||
    normalized.includes('شهري') ||
    normalized.includes('شهريا')
  ) {
    return 'MONTHLY';
  }

  if (
    normalized.includes('كل 3 شهور') ||
    normalized.includes('كل ثلاث شهور') ||
    normalized.includes('ربع سنوي')
  ) {
    return 'QUARTERLY';
  }

  if (
    normalized.includes('كل سنه') ||
    normalized.includes('كل سنة') ||
    normalized.includes('سنوي') ||
    normalized.includes('سنويا')
  ) {
    return 'YEARLY';
  }

  return undefined;
}

// ============================================================
// Category Detection
// ============================================================

export function detectFinancialCategory(
  text: string
): CategoryType {
  const normalized =
    normalizeArabicText(text);

  // Food
  if (
    normalized.includes('اكل') ||
    normalized.includes('مطعم') ||
    normalized.includes('سوبر ماركت') ||
    normalized.includes('بقاله') ||
    normalized.includes('خضار') ||
    normalized.includes('لحمه') ||
    normalized.includes('فراخ') ||
    normalized.includes('قهوه') ||
    normalized.includes('كافيه')
  ) {
    return 'Food & Groceries';
  }

  // Housing
  if (
    normalized.includes('ايجار') ||
    normalized.includes('كهرباء') ||
    normalized.includes('مياه') ||
    normalized.includes('غاز') ||
    normalized.includes('صيانه البيت')
  ) {
    return 'Housing & Utilities';
  }

  // Bills
  if (
    normalized.includes('فاتوره') ||
    normalized.includes('فاتورة') ||
    normalized.includes('انترنت') ||
    normalized.includes('نت') ||
    normalized.includes('موبايل') ||
    normalized.includes('تليفون') ||
    normalized.includes('اشتراك')
  ) {
    return 'Bills & Subscriptions';
  }

  // Transport
  if (
    normalized.includes('بنزين') ||
    normalized.includes('سولار') ||
    normalized.includes('اوبر') ||
    normalized.includes('كريم') ||
    normalized.includes('مواصلات') ||
    normalized.includes('تاكسي') ||
    normalized.includes('مترو')
  ) {
    return 'Transport & Ride Apps';
  }

  // Debt
  if (
    normalized.includes('قسط') ||
    normalized.includes('دين') ||
    normalized.includes('قرض') ||
    normalized.includes('فيزا') ||
    normalized.includes('كريدت') ||
    normalized.includes('valu') ||
    normalized.includes('فاليو')
  ) {
    return 'Installments & Debt';
  }

  // Health
  if (
    normalized.includes('دكتور') ||
    normalized.includes('صيدليه') ||
    normalized.includes('دواء') ||
    normalized.includes('علاج') ||
    normalized.includes('مستشفي') ||
    normalized.includes('مدرسه') ||
    normalized.includes('جامعه') ||
    normalized.includes('كورس')
  ) {
    return 'Health & Education';
  }

  // Family
  if (
    normalized.includes('مصروف البيت') ||
    normalized.includes('مصروف الاولاد') ||
    normalized.includes('مصروف العيال') ||
    normalized.includes('مصروف الزوجه') ||
    normalized.includes('مصروف زوجتي')
  ) {
    return 'Family & Allowances';
  }

  // Savings
  if (
    normalized.includes('ادخار') ||
    normalized.includes('تحويش') ||
    normalized.includes('حوش') ||
    normalized.includes('وفر')
  ) {
    return 'Emergency & Savings';
  }

  // Income
  if (
    normalized.includes('مرتب') ||
    normalized.includes('راتب') ||
    normalized.includes('قبضت') ||
    normalized.includes('دخل') ||
    normalized.includes('مكافاه') ||
    normalized.includes('بونص')
  ) {
    return 'Income & Salary';
  }

  return 'Shopping & Entertainment';
}

// ============================================================
// Remove Financial Words To Generate Title
// ============================================================

function extractTitle(
  text: string,
  amount?: number
): string {
  let result = text;

  if (amount !== undefined) {
    result = result.replace(
      new RegExp(
        String(amount).replace('.', '\\.'),
        'g'
      ),
      ''
    );
  }

  result = result
    .replace(
      /جنيه|جنية|جنيها|ج\.م/gi,
      ''
    )
    .replace(
      /اضف|أضف|سجل|سجلت|دفعت|اشتريت|صرفت|قبضت|استلمت|اعمل|انشئ|أنشئ/gi,
      ''
    )
    .replace(
      /فاتوره|فاتورة|التزام|شهري|شهريا|اسبوعي|أسبوعي|سنوي|سنويا/gi,
      ''
    )
    .replace(
      /بمبلغ|بقيمة|بقيمه|قيمته|مبلغه/gi,
      ''
    )
    .replace(
      /يوم\s+\d{1,2}/gi,
      ''
    )
    .replace(/\s+/g, ' ')
    .trim();

  return result || 'عملية مالية';
}

// ============================================================
// Main Router
// ============================================================

export function routeFinancialIntent(
  text: string
): FinancialIntentResult {
  const normalized =
    normalizeArabicText(text);

  const amount =
    extractAmount(text);

  const dueDay =
    extractDueDay(text);

  const frequency =
    extractFrequency(text);

  const category =
    detectFinancialCategory(text);

  // ==========================================================
  // CREATE BILL
  // ==========================================================

  const hasBillWord =
    normalized.includes('فاتوره') ||
    normalized.includes('فاتورة');

  const hasCreateWord =
    normalized.includes('اضف') ||
    normalized.includes('سجل') ||
    normalized.includes('انشئ') ||
    normalized.includes('اعمل');

  if (
    hasBillWord &&
    hasCreateWord &&
    amount
  ) {
    return {
      intent: 'CREATE_BILL',
      amount,
      title: extractTitle(
        text,
        amount
      ),
      category,
      dueDay,
      confidence: 0.99,
      originalText: text,
    };
  }

  // ==========================================================
  // PAY BILL
  // ==========================================================

  if (
    hasBillWord &&
    (
      normalized.includes('دفعت') ||
      normalized.includes('سددت')
    )
  ) {
    return {
      intent: 'PAY_BILL',
      amount,
      title: extractTitle(
        text,
        amount
      ),
      category,
      confidence: 0.98,
      originalText: text,
    };
  }

  // ==========================================================
  // CREATE RECURRING OBLIGATION
  // ==========================================================

  if (
    frequency &&
    amount &&
    (
      normalized.includes('التزام') ||
      normalized.includes('عندي') ||
      normalized.includes('اضف') ||
      normalized.includes('سجل')
    )
  ) {
    return {
      intent: 'CREATE_OBLIGATION',
      amount,
      title: extractTitle(
        text,
        amount
      ),
      category,
      frequency,
      dueDay,
      confidence: 0.97,
      originalText: text,
    };
  }

  // ==========================================================
  // PAY DEBT / INSTALLMENT
  // ==========================================================

  if (
    (
      normalized.includes('دفعت') ||
      normalized.includes('سددت')
    ) &&
    (
      normalized.includes('قسط') ||
      normalized.includes('دين') ||
      normalized.includes('قرض')
    )
  ) {
    return {
      intent: 'PAY_DEBT',
      amount,
      title: extractTitle(
        text,
        amount
      ),
      category:
        'Installments & Debt',
      confidence: 0.97,
      originalText: text,
    };
  }

  // ==========================================================
  // PAY RECURRING OBLIGATION
  // ==========================================================

  if (
    (
      normalized.includes('دفعت') ||
      normalized.includes('سددت')
    ) &&
    normalized.includes('التزام')
  ) {
    return {
      intent: 'PAY_OBLIGATION',
      amount,
      title: extractTitle(
        text,
        amount
      ),
      category,
      confidence: 0.96,
      originalText: text,
    };
  }

  // ==========================================================
  // INCOME
  // ==========================================================

  if (
    amount &&
    (
      normalized.includes('قبضت') ||
      normalized.includes('استلمت') ||
      normalized.includes('دخل لي') ||
      normalized.includes('دخلتلي') ||
      normalized.includes('مكافاه') ||
      normalized.includes('بونص')
    )
  ) {
    return {
      intent: 'CREATE_INCOME',
      amount,
      title: extractTitle(
        text,
        amount
      ),
      category:
        'Income & Salary',
      confidence: 0.98,
      originalText: text,
    };
  }

  // ==========================================================
  // TRANSFER
  // ==========================================================

  if (
    amount &&
    (
      normalized.includes('حولت') ||
      normalized.includes('تحويل')
    ) &&
    normalized.includes('من') &&
    normalized.includes('الي')
  ) {
    return {
      intent: 'TRANSFER',
      amount,
      title: extractTitle(
        text,
        amount
      ),
      category:
        'Emergency & Savings',
      confidence: 0.90,
      originalText: text,
    };
  }

  // ==========================================================
  // NORMAL EXPENSE
  // ==========================================================

  if (
    amount &&
    (
      normalized.includes('دفعت') ||
      normalized.includes('اشتريت') ||
      normalized.includes('صرفت') ||
      normalized.includes('خصمت') ||
      normalized.includes('دفعتله') ||
      normalized.includes('دفعت لها')
    )
  ) {
    return {
      intent: 'CREATE_EXPENSE',
      amount,
      title: extractTitle(
        text,
        amount
      ),
      category,
      confidence: 0.95,
      originalText: text,
    };
  }

  // ==========================================================
  // FINANCIAL QUERY
  // ==========================================================

  if (
    normalized.includes('كام') ||
    normalized.includes('ايه') ||
    normalized.includes('قد ايه') ||
    normalized.includes('رصيدي') ||
    normalized.includes('مصروفاتي') ||
    normalized.includes('ديوني') ||
    normalized.includes('التزاماتي')
  ) {
    return {
      intent: 'FINANCIAL_QUERY',
      confidence: 0.80,
      originalText: text,
    };
  }

  return {
    intent: 'UNKNOWN',
    confidence: 0,
    originalText: text,
  };
}
