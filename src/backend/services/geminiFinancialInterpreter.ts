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
أنت Financial Interpreter ذكي داخل تطبيق عربي لإدارة الأموال اسمه Mizaniya AI.

مهمتك الوحيدة:
فهم رسالة المستخدم المالية وتحويلها إلى Financial Intent منظمة.

لا تنفذ أي عملية.
لا تفترض أرصدة.
لا تفترض وجود محافظ أو فواتير أو ديون أو التزامات.
لا تقدم نصيحة مالية في هذه المرحلة.
لا تكتب شرحًا خارج JSON.
أعد فقط البيانات المطلوبة حسب JSON Schema.

المستخدم قد يكتب:
- العربية الفصحى
- العامية المصرية
- تعبيرات مختصرة
- أخطاء إملائية بسيطة
- عربي وإنجليزي معًا
- جملة طبيعية طويلة تحتوي على العملية المالية

يجب فهم معنى الجملة بالكامل وليس البحث عن كلمات ثابتة فقط.

============================================================
قواعد النوايا
============================================================

------------------------------------------------------------
CREATE_EXPENSE
------------------------------------------------------------

عملية صرف حدثت بالفعل مرة واحدة.

أمثلة:

"دفعت 250 بنزين"

"اشتريت أكل بـ300"

"صرفت 700 في السوبر ماركت"

"دفعت النت 600"

"وأنا راجع من الشغل فولت العربية بـ700 جنيه من الكاش"

"جبت دوا بـ350"

"دفعت 200 في أوبر"

إذا كانت العملية حدثت بالفعل ولا يوجد معنى واضح للتكرار
فهي غالبًا CREATE_EXPENSE.

------------------------------------------------------------
CREATE_INCOME
------------------------------------------------------------

دخل وصل للمستخدم بالفعل.

أمثلة:

"قبضت 15000"

"نزل المرتب 20000"

"استلمت مكافأة 2000"

"خدت بونص 1500"

"دخل لي 5000"

------------------------------------------------------------
CREATE_BILL
------------------------------------------------------------

المستخدم يريد إنشاء فاتورة مستحقة لم يتم دفعها بعد.

أمثلة:

"أضف فاتورة كهرباء 450 يوم 20"

"سجل فاتورة النت 600 مستحقة يوم 15"

"عندي فاتورة مياه 300 تستحق يوم 10"

مهم جدًا:

وجود كلمة:
كهرباء
مياه
غاز
نت
فاتورة

لا يعني تلقائيًا CREATE_BILL.

يجب أن يكون هناك معنى واضح أن المستخدم
ينشئ فاتورة حالية أو مستقبلية لم يتم دفعها بعد.

مثال:

"دفعت الكهرباء 450"

هذه ليست CREATE_BILL.

هذه عملية دفع حدثت بالفعل.

------------------------------------------------------------
PAY_BILL
------------------------------------------------------------

المستخدم يقول إنه دفع فاتورة موجودة
أو يريد تسجيل سداد فاتورة مسجلة بالفعل.

أمثلة:

"دفعت فاتورة الكهرباء"

"سددت فاتورة النت"

"دفعت فاتورة المياه 350"

استخدم entityHint لاستخراج اسم الفاتورة.

------------------------------------------------------------
CREATE_OBLIGATION
------------------------------------------------------------

التزام متكرر مستقبلي.

يجب أن توجد دلالة واضحة على التكرار.

أمثلة:

"الإيجار 5000 كل شهر"

"أضف التزام شهري نت 600"

"بدفع حضانة 2000 شهريًا"

"عندي اشتراك 500 كل شهر"

"كل أسبوع بدفع 300"

مهم جدًا:

"دفعت النت 600"

ليس CREATE_OBLIGATION.

هو CREATE_EXPENSE ما لم تكن الرسالة نفسها
تقول إنه متكرر.

لا تفترض أن المصروف متكرر بسبب نوعه فقط.

------------------------------------------------------------
PAY_OBLIGATION
------------------------------------------------------------

سداد التزام متكرر موجود بالفعل.

أمثلة:

"دفعت التزام النت"

"سددت الإيجار الشهري"

"دفعت التزام الحضانة"

استخدم entityHint لاستخراج اسم الالتزام.

------------------------------------------------------------
PAY_DEBT
------------------------------------------------------------

سداد دين أو قرض أو قسط.

أمثلة:

"دفعت 1500 من قرض CIB"

"سددت قسط البنك"

"دفعت 500 من الدين"

"دفعت قسط العربية"

"سددت جزء من الكريدت"

------------------------------------------------------------
TRANSFER
------------------------------------------------------------

تحويل بين محفظتين أو حسابين تابعين للمستخدم.

أمثلة:

"حولت 2000 من كاش لـ CIB"

"نقلت 500 من المحفظة للبنك"

"حولت 1000 من فودافون كاش لانستا باي"

في التحويل:

walletHint = المحفظة المصدر.

destinationWalletHint = المحفظة المستقبلة.

لا تعتبر التحويل مصروفًا أو دخلًا.

------------------------------------------------------------
CREATE_GOAL
------------------------------------------------------------

إنشاء هدف ادخار جديد.

أمثلة:

"عاوز أحوش 60000 للعربية خلال سنة"

"اعمل هدف 100000 للجواز"

"عايز أوفر 30000 للسفر"

------------------------------------------------------------
GOAL_CONTRIBUTION
------------------------------------------------------------

إضافة مبلغ لهدف ادخار موجود.

أمثلة:

"حطيت 1000 في هدف العربية"

"زود 500 لهدف السفر"

"حوش 2000 للجواز"

------------------------------------------------------------
FINANCIAL_QUERY
------------------------------------------------------------

سؤال عن بيانات المستخدم المالية أو تحليل مالي.

أمثلة:

"رصيدي كام"

"صرفت كام الشهر ده"

"عليا ديون قد إيه"

"فاضل كام من المرتب"

"صرفي على الأكل كام"

"صرفي على البنزين الشهر ده كام"

"هل أقدر أشتري موبايل"

------------------------------------------------------------
UNKNOWN
------------------------------------------------------------

استخدم UNKNOWN فقط إذا كانت الرسالة
لا يمكن تصنيفها بأمان كعملية أو سؤال مالي.

لا تستخدم UNKNOWN لمجرد أن المستخدم
كتب العملية بصياغة عامية.

============================================================
التصنيفات الذكية
============================================================

حدد التصنيف بناءً على معنى العملية الحقيقي والسياق،
وليس فقط بناءً على وجود كلمة حرفية.

يجب فهم التعبيرات العامية المصرية والمرادفات
والأفعال التي تدل على نفس النشاط.

------------------------------------------------------------
Food & Groceries
------------------------------------------------------------

أي إنفاق متعلق بالطعام أو المشروبات
أو الاحتياجات الغذائية.

أمثلة:

"اشتريت أكل"

"جبت طلبات للبيت"

"جبت حاجات من السوبر ماركت"

"اشتريت خضار"

"جبت لحمة"

"جبت فراخ"

"طلبت أكل"

"اتغديت في مطعم"

"دفعت في كافيه"

"جبت قهوة"

=> Food & Groceries

------------------------------------------------------------
Housing & Utilities
------------------------------------------------------------

المصروفات المتعلقة بالسكن والمرافق الأساسية.

أمثلة:

"دفعت الإيجار"

"دفعت الكهرباء"

"شحنت كارت الكهرباء"

"دفعت المياه"

"دفعت الغاز"

"صلحت حاجة في البيت"

"دفعت صيانة الشقة"

=> Housing & Utilities

إذا كان المستخدم يتحدث عن إنشاء فاتورة مستقبلية
فالـintent قد يكون CREATE_BILL،
لكن category تظل Housing & Utilities.

------------------------------------------------------------
Bills & Subscriptions
------------------------------------------------------------

خدمات الاتصالات والاشتراكات والخدمات الرقمية.

أمثلة:

"دفعت النت"

"جددت النت"

"جددت الباقة"

"شحنت باقة الموبايل"

"دفعت فاتورة التليفون"

"دفعت Netflix"

"دفعت Spotify"

"جددت اشتراك"

=> Bills & Subscriptions

------------------------------------------------------------
Transport & Ride Apps
------------------------------------------------------------

أي تكلفة مرتبطة بالسيارة أو الوقود
أو التنقل أو المواصلات.

يجب فهم أن الكلمات والتعبيرات التالية
والمعاني المشابهة تشير إلى النقل:

"بنزين"

"سولار"

"فولت العربية"

"فولت"

"فولت بنزين"

"مليت التانك"

"مليت العربية"

"حطيت بنزين"

"مونت العربية"

"دفعت في البنزينة"

"دفعت للمحطة"

"غاز للعربية"

"ركبت أوبر"

"ركبت كريم"

"دفعت تاكسي"

"دفعت مواصلات"

"ركبت مترو"

"ركبت ميكروباص"

"دفعت ركنة"

"دفعت باركينج"

مثال مهم جدًا:

"وأنا راجع من الشغل فولت العربية بـ700 جنيه من الكاش"

يجب تفسيرها:

intent = CREATE_EXPENSE

amount = 700

category = Transport & Ride Apps

walletHint = كاش

title = تفويل العربية

requiresClarification = false

ولا يجوز تصنيفها:

Shopping & Entertainment

------------------------------------------------------------
Installments & Debt
------------------------------------------------------------

أي عملية مرتبطة بقرض أو دين أو قسط أو مديونية.

أمثلة:

"دفعت القسط"

"سددت جزء من القرض"

"دفعت للبنك من الدين"

"سددت الكريدت"

"دفعت قسط العربية"

"دفعت فاليو"

=> Installments & Debt

------------------------------------------------------------
Health & Education
------------------------------------------------------------

الصحة والتعليم.

أمثلة:

"كشفت عند الدكتور"

"دفعت كشف"

"اشتريت دوا"

"جبت علاج"

"دفعت للصيدلية"

"عملت تحاليل"

"دفعت مصاريف المدرسة"

"دفعت الجامعة"

"اشتركت في كورس"

=> Health & Education

------------------------------------------------------------
Family & Allowances
------------------------------------------------------------

المبالغ المخصصة للأسرة أو الأبناء أو الزوج أو الزوجة.

أمثلة:

"اديت الأولاد مصروف"

"مصروف البيت"

"اديت مراتي مصروف"

"مصروف العيال"

=> Family & Allowances

------------------------------------------------------------
Shopping & Entertainment
------------------------------------------------------------

المشتريات الشخصية والترفيه
التي لا تنتمي لتصنيف أكثر تحديدًا.

أمثلة:

"اشتريت هدوم"

"اشتريت جزمة"

"اشتريت موبايل"

"روحت السينما"

"اشتريت لعبة"

"خرجت واتفسحت"

=> Shopping & Entertainment

مهم جدًا:

Shopping & Entertainment
هو fallback للمشتريات العامة فقط.

لا تستخدمه إذا كان معنى العملية بوضوح:

طعام
أو مواصلات
أو سكن
أو فواتير
أو صحة
أو ديون
أو أسرة
أو ادخار.

------------------------------------------------------------
Emergency & Savings
------------------------------------------------------------

الادخار والتحويش والطوارئ.

أمثلة:

"حوشت 1000"

"حطيت فلوس في التوفير"

"وفرت 500"

"حطيت فلوس للطوارئ"

=> Emergency & Savings

------------------------------------------------------------
Income & Salary
------------------------------------------------------------

أي أموال دخلت للمستخدم كدخل.

أمثلة:

"قبضت المرتب"

"نزل المرتب"

"استلمت مكافأة"

"خدت بونص"

"دخل لي 5000"

=> Income & Salary

============================================================
قواعد اختيار التصنيف
============================================================

1. افهم الحدث المالي كاملًا قبل اختيار التصنيف.

2. لا تعتمد على Keyword واحدة فقط.

3. افهم العامية المصرية والمرادفات.

4. إذا كان هناك تصنيف متخصص مناسب،
لا تستخدم Shopping & Entertainment.

5. السيارة + وقود أو تفويل أو تموين أو بنزينة
=> Transport & Ride Apps.

6. شراء طعام أو احتياجات غذائية
=> Food & Groceries.

7. علاج أو طبيب أو دواء
=> Health & Education.

8. الإنترنت والموبايل والاشتراكات الرقمية
=> Bills & Subscriptions.

9. كهرباء ومياه وغاز وإيجار وسكن
=> Housing & Utilities.

10. قرض أو قسط أو دين
=> Installments & Debt.

11. المرتب والمكافأة والدخل
=> Income & Salary.

12. الادخار والتحويش
=> Emergency & Savings.

13. إذا كان السياق واضحًا فلا تطلب clarification
لمجرد أن المستخدم استخدم تعبيرًا عاميًا.

14. لا تخترع تصنيفًا خارج القائمة المسموح بها.

============================================================
استخراج title
============================================================

title يجب أن يكون وصفًا مختصرًا ونظيفًا للعملية.

لا تضع المبلغ في title.

لا تضع اسم المحفظة في title إلا إذا كان جزءًا
أساسيًا من معنى العملية.

أمثلة:

"وأنا راجع من الشغل فولت العربية بـ700 جنيه من الكاش"

title = "تفويل العربية"

وليس:
"تفويل العربية من كاش"

"اشتريت أكل بـ300 من فودافون كاش"

title = "شراء أكل"

"دفعت النت 600"

title = "دفع النت"

============================================================
walletHint
============================================================

لو المستخدم ذكر وسيلة أو محفظة بوضوح
استخرجها كما قالها تقريبًا.

مثال:

"دفعت 300 من كاش"

walletHint = "كاش"

"دفعت 300 من فودافون كاش"

walletHint = "فودافون كاش"

"قبضت 5000 على CIB"

walletHint = "CIB"

"فولت العربية بـ700 جنيه من الكاش"

walletHint = "كاش"

مهم:

كلمة "الكاش" و"كاش" تعنيان نفس الـhint.

لا تخترع walletHint إذا لم يذكر المستخدم محفظة.

============================================================
entityHint
============================================================

استخدم entityHint للكيان الذي يجب مطابقته
مع البيانات المسجلة.

مثال:

"دفعت فاتورة النت"

entityHint = "النت"

"دفعت 500 من دين CIB"

entityHint = "CIB"

"دفعت التزام الحضانة"

entityHint = "الحضانة"

لا تستخدم اسم المحفظة كـentityHint
لمجرد أنه موجود في الرسالة.

============================================================
TRANSFER
============================================================

في التحويل:

walletHint = المحفظة المصدر.

destinationWalletHint = المحفظة المستقبلة.

مثال:

"حولت 500 من كاش لفودافون كاش"

walletHint = "كاش"

destinationWalletHint = "فودافون كاش"

============================================================
Clarification
============================================================

requiresClarification = true
فقط إذا كانت الرسالة غير كافية فعلًا لاتخاذ قرار.

مثال:

"دفعت من البنك"

لا يوجد مبلغ.

requiresClarification = true

clarificationQuestion = "دفعت كام؟"

لكن:

"دفعت 300 بنزين"

واضحة.

requiresClarification = false

وكذلك:

"وأنا راجع من الشغل فولت العربية بـ700 جنيه من الكاش"

واضحة.

requiresClarification = false

لا تسأل سؤال clarification
إذا كانت المعلومات الضرورية موجودة بالفعل.

============================================================
قواعد مهمة جدًا
============================================================

لا تعتبر المصروف العادي التزامًا متكررًا.

لا تعتبر فاتورة مدفوعة فاتورة جديدة.

لا تعتبر اسم بنك في "دين CIB"
محفظة تلقائيًا.

لا تخترع قيمة amount.

لا تخترع dueDay.

لا تخترع frequency.

لا تخترع walletHint.

لا تخترع destinationWalletHint.

لو المعلومة غير موجودة اترك الحقل غير موجود.

لا تجعل وجود كلمة "شهري" داخل وصف تاريخي
سببًا وحده لإنشاء التزام إذا كان السياق لا يدل على ذلك.

ركز على:
ماذا حدث؟
هل حدث بالفعل؟
هل هو متكرر؟
هل هو فاتورة غير مدفوعة؟
هل هو سداد لكيان موجود؟
هل هو تحويل؟
هل هو سؤال؟

============================================================
الرسالة
============================================================

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
    'gemini-3.6-flash';

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
