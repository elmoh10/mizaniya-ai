import { z } from 'zod';
import { CategoryType } from '../../types';

// ============================================================
// Types
// ============================================================

export type GeminiFinancialIntent =
  | 'CREATE_EXPENSE'
  | 'CREATE_INCOME'
  | 'CREATE_BILL'
  | 'PAY_BILL'
  | 'CREATE_OBLIGATION'
  | 'PAY_OBLIGATION'
  | 'PAY_DEBT'
  | 'TRANSFER'
  | 'CREATE_GOAL'
  | 'GOAL_CONTRIBUTION'
  | 'FINANCIAL_QUERY'
  | 'UNKNOWN';

export interface GeminiFinancialInterpretation {
  intent: GeminiFinancialIntent;

  amount?: number;

  title?: string;

  category?: CategoryType;

  walletHint?: string;

  destinationWalletHint?: string;

  entityHint?: string;

  dueDay?: number;

  frequency?:
    | 'WEEKLY'
    | 'MONTHLY'
    | 'QUARTERLY'
    | 'YEARLY';

  confidence: number;

  requiresClarification: boolean;

  clarificationQuestion?: string;

  originalText: string;

  source: 'GEMINI';
}

// ============================================================
// Runtime Validation
// ============================================================

const interpretationSchema = z.object({
  intent: z.enum([
    'CREATE_EXPENSE',
    'CREATE_INCOME',
    'CREATE_BILL',
    'PAY_BILL',
    'CREATE_OBLIGATION',
    'PAY_OBLIGATION',
    'PAY_DEBT',
    'TRANSFER',
    'CREATE_GOAL',
    'GOAL_CONTRIBUTION',
    'FINANCIAL_QUERY',
    'UNKNOWN',
  ]),

  amount: z
    .number()
    .positive()
    .optional(),

  title: z
    .string()
    .trim()
    .min(1)
    .optional(),

  category: z
    .enum([
      'Food & Groceries',
      'Housing & Utilities',
      'Bills & Subscriptions',
      'Transport & Ride Apps',
      'Installments & Debt',
      'Health & Education',
      'Family & Allowances',
      'Shopping & Entertainment',
      'Emergency & Savings',
      'Income & Salary',
    ])
    .optional(),

  walletHint: z
    .string()
    .trim()
    .optional(),

  destinationWalletHint: z
    .string()
    .trim()
    .optional(),

  entityHint: z
    .string()
    .trim()
    .optional(),

  dueDay: z
    .number()
    .int()
    .min(1)
    .max(31)
    .optional(),

  frequency: z
    .enum([
      'WEEKLY',
      'MONTHLY',
      'QUARTERLY',
      'YEARLY',
    ])
    .optional(),

  confidence: z
    .number()
    .min(0)
    .max(1),

  requiresClarification: z
    .boolean(),

  clarificationQuestion: z
    .string()
    .trim()
    .optional(),
});

// ============================================================
// Gemini Response JSON Schema
// ============================================================

const responseJsonSchema = {
  type: 'object',

  properties: {
    intent: {
      type: 'string',
      enum: [
        'CREATE_EXPENSE',
        'CREATE_INCOME',
        'CREATE_BILL',
        'PAY_BILL',
        'CREATE_OBLIGATION',
        'PAY_OBLIGATION',
        'PAY_DEBT',
        'TRANSFER',
        'CREATE_GOAL',
        'GOAL_CONTRIBUTION',
        'FINANCIAL_QUERY',
        'UNKNOWN',
      ],
    },

    amount: {
      type: 'number',
    },

    title: {
      type: 'string',
    },

    category: {
      type: 'string',
      enum: [
        'Food & Groceries',
        'Housing & Utilities',
        'Bills & Subscriptions',
        'Transport & Ride Apps',
        'Installments & Debt',
        'Health & Education',
        'Family & Allowances',
        'Shopping & Entertainment',
        'Emergency & Savings',
        'Income & Salary',
      ],
    },

    walletHint: {
      type: 'string',
    },

    destinationWalletHint: {
      type: 'string',
    },

    entityHint: {
      type: 'string',
    },

    dueDay: {
      type: 'integer',
      minimum: 1,
      maximum: 31,
    },

    frequency: {
      type: 'string',
      enum: [
        'WEEKLY',
        'MONTHLY',
        'QUARTERLY',
        'YEARLY',
      ],
    },

    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
    },

    requiresClarification: {
      type: 'boolean',
    },

    clarificationQuestion: {
      type: 'string',
    },
  },

  required: [
    'intent',
    'confidence',
    'requiresClarification',
  ],

  additionalProperties: false,
};

// ============================================================
// Prompt
// ============================================================

function buildFinancialInterpreterPrompt(
  message: string
): string {
  return `
أنت Financial Interpreter داخل تطبيق عربي لإدارة الأموال اسمه Mizaniya AI.

مهمتك الوحيدة:
فهم رسالة المستخدم وتحويلها إلى Financial Intent منظمة.

لا تنفذ أي عملية.
لا تفترض أرصدة.
لا تفترض وجود محافظ أو فواتير أو ديون.
لا تقدم نصيحة مالية.
لا تكتب شرحًا.
أعد فقط البيانات المطلوبة حسب الـJSON Schema.

المستخدم قد يكتب بالعربية الفصحى أو العامية المصرية أو الإنجليزية المختلطة.

============================================================
قواعد النوايا
============================================================

CREATE_EXPENSE:
عملية صرف حدثت بالفعل مرة واحدة.

أمثلة:
"دفعت 250 بنزين"
"اشتريت أكل بـ300"
"صرفت 700 في السوبر ماركت"
"دفعت النت 600"

CREATE_INCOME:
دخل وصل للمستخدم بالفعل.

أمثلة:
"قبضت 15000"
"نزل المرتب"
"استلمت مكافأة 2000"

CREATE_BILL:
المستخدم يريد إنشاء فاتورة مستحقة لم تُدفع بعد.

أمثلة:
"أضف فاتورة كهرباء 450 يوم 20"
"سجل فاتورة النت 600 مستحقة يوم 15"

مهم:
وجود كلمة كهرباء أو نت وحدها لا يعني CREATE_BILL.
يجب أن يكون هناك معنى واضح لإنشاء فاتورة مستقبلية أو مستحقة.

PAY_BILL:
المستخدم يقول إنه دفع فاتورة موجودة أو يريد تسجيل سدادها.

أمثلة:
"دفعت فاتورة الكهرباء"
"سددت فاتورة النت 600"

CREATE_OBLIGATION:
التزام متكرر مستقبلي.

يجب أن توجد دلالة واضحة على التكرار.

أمثلة:
"الإيجار 5000 كل شهر"
"أضف التزام شهري نت 600"
"بدفع حضانة 2000 شهريًا"

مهم جدًا:
"دفعت النت 600" ليس CREATE_OBLIGATION.
هو CREATE_EXPENSE ما لم تكن الرسالة نفسها تقول إنه متكرر.

PAY_OBLIGATION:
سداد التزام متكرر موجود بالفعل.

أمثلة:
"دفعت التزام النت"
"سددت الإيجار الشهري"

PAY_DEBT:
سداد دين أو قرض أو قسط.

أمثلة:
"دفعت 1500 من قرض CIB"
"سددت قسط البنك"
"دفعت 500 من الدين"

TRANSFER:
تحويل بين محفظتين أو حسابين تابعين للمستخدم.

أمثلة:
"حولت 2000 من كاش لـ CIB"
"نقلت 500 من المحفظة للبنك"

CREATE_GOAL:
إنشاء هدف ادخار جديد.

مثال:
"عاوز أحوش 60000 للعربية خلال سنة"

GOAL_CONTRIBUTION:
إضافة مبلغ لهدف ادخار موجود.

مثال:
"حطيت 1000 في هدف العربية"

FINANCIAL_QUERY:
سؤال عن بيانات المستخدم المالية.

أمثلة:
"رصيدي كام"
"صرفت كام الشهر ده"
"عليا ديون قد إيه"
"هل أقدر أشتري موبايل"

UNKNOWN:
لو الرسالة لا يمكن تصنيفها بأمان.

============================================================
التصنيفات
============================================================

Food & Groceries:
أكل، مطاعم، سوبر ماركت، قهوة، بقالة.

Housing & Utilities:
إيجار، كهرباء، مياه، غاز، صيانة المنزل.

Bills & Subscriptions:
إنترنت، موبايل، اشتراكات رقمية، فواتير خدمات.

Transport & Ride Apps:
بنزين، مواصلات، أوبر، كريم، تاكسي.

Installments & Debt:
قروض، أقساط، ديون، كريدت كارد.

Health & Education:
صيدلية، دكتور، علاج، مدرسة، جامعة، كورسات.

Family & Allowances:
مصروف الأسرة والأطفال.

Shopping & Entertainment:
ملابس، ترفيه، مشتريات عامة.

Emergency & Savings:
ادخار وتحويش.

Income & Salary:
مرتب، دخل، مكافآت.

============================================================
walletHint
============================================================

لو المستخدم ذكر وسيلة/محفظة بوضوح استخرجها كما قالها تقريبًا.

مثال:
"دفعت 300 من كاش"
walletHint = "كاش"

"دفعت 300 من فودافون كاش"
walletHint = "فودافون كاش"

"قبضت 5000 على CIB"
walletHint = "CIB"

لا تخترع walletHint إذا لم يذكر المستخدم محفظة.

============================================================
entityHint
============================================================

استخدم entityHint للكيان الذي يجب مطابقته مع البيانات المسجلة.

مثال:
"دفعت فاتورة النت"
entityHint = "النت"

"دفعت 500 من دين CIB"
entityHint = "CIB"

"دفعت التزام الحضانة"
entityHint = "الحضانة"

============================================================
TRANSFER
============================================================

في التحويل:

walletHint = المحفظة المصدر.
destinationWalletHint = المحفظة المستقبلة.

============================================================
Clarification
============================================================

requiresClarification = true فقط إذا كانت الرسالة غير كافية فعلاً لاتخاذ قرار.

مثال:
"دفعت من البنك"

لا يوجد مبلغ:
requiresClarification = true
clarificationQuestion = "دفعت كام؟"

لكن:
"دفعت 300 بنزين"

واضحة:
requiresClarification = false

============================================================
مهم جدًا
============================================================

لا تعتبر المصروف العادي التزامًا متكررًا.

لا تعتبر فاتورة مدفوعة فاتورة جديدة.

لا تعتبر اسم بنك في "دين CIB" محفظة تلقائيًا.

لا تخترع قيمة amount.

لا تخترع dueDay.

لا تخترع frequency.

لو المعلومة غير موجودة اترك الحقل غير موجود.

الرسالة:

"${message}"
`;
}

// ============================================================
// Extract Response Text
// ============================================================

function extractGeminiText(
  payload: any
): string {
  const parts =
    payload?.candidates?.[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return '';
  }

  return parts
    .map(
      (part: any) =>
        typeof part?.text === 'string'
          ? part.text
          : ''
    )
    .join('')
    .trim();
}

// ============================================================
// Gemini Interpreter
// ============================================================

export async function interpretFinancialMessageWithGemini(
  message: string
): Promise<GeminiFinancialInterpretation> {
  const apiKey =
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured'
    );
  }

  const model =
    process.env.GEMINI_FINANCIAL_MODEL ||
    'gemini-2.5-flash';

  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      model
    )}:generateContent`;

  const response =
    await fetch(endpoint, {
      method: 'POST',

      headers: {
        'Content-Type':
          'application/json',

        'x-goog-api-key':
          apiKey,
      },

      body: JSON.stringify({
        contents: [
          {
            role: 'user',

            parts: [
              {
                text:
                  buildFinancialInterpreterPrompt(
                    message
                  ),
              },
            ],
          },
        ],

        generationConfig: {
          temperature: 0.1,

          responseMimeType:
            'application/json',

          responseJsonSchema,
        },
      }),
    });

  if (!response.ok) {
    const errorText =
      await response.text();

    throw new Error(
      `Gemini Financial Interpreter failed: ${response.status} ${errorText}`
    );
  }

  const payload =
    await response.json();

  const responseText =
    extractGeminiText(
      payload
    );

  if (!responseText) {
    throw new Error(
      'Gemini returned an empty Financial Interpreter response'
    );
  }

  let parsedJson: unknown;

  try {
    parsedJson =
      JSON.parse(
        responseText
      );
  } catch {
    console.error(
      'Gemini Financial Interpreter invalid JSON:',
      responseText
    );

    throw new Error(
      'Gemini returned invalid JSON'
    );
  }

  const validation =
    interpretationSchema.safeParse(
      parsedJson
    );

  if (!validation.success) {
    console.error(
      'Gemini Financial Interpreter schema validation failed:',
      validation.error.format()
    );

    throw new Error(
      'Gemini Financial Interpreter response failed validation'
    );
  }

  return {
    ...validation.data,
    originalText:
      message,
    source:
      'GEMINI',
  };
}

// ============================================================
// Safe Wrapper
// ============================================================

export async function tryInterpretFinancialMessageWithGemini(
  message: string
): Promise<GeminiFinancialInterpretation | null> {
  try {
    return await interpretFinancialMessageWithGemini(
      message
    );
  } catch (error) {
    console.error(
      'Gemini Financial Interpreter error:',
      error
    );

    return null;
  }
}
