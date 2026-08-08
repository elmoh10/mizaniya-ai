import { GoogleGenAI, Type } from '@google/genai';
import { SAVINGS_AGENT_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';
import { ChatHistoryMessage } from '../../types';
import { TrustedFinancialContext } from '../../backend/services/financialContextService';

export interface GoldSavingsAdvice {
  success?: boolean;
  errorCode?: string;
  requiresRetry?: boolean;
  recommendedAllocationGoldPercent?: number;
  recommendedCertificatesPercent?: number;
  goldGramsToBuy?: number;
  expectedAnnualHedgePercent?: number;
  adviceSummaryAr?: string;
}

export async function getSavingsHedgeStrategy(
  ai: GoogleGenAI,
  monthlySavingsAmount: number,
  goldGramPriceEgp?: number
): Promise<GoldSavingsAdvice> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  const goldPriceInfo = goldGramPriceEgp ? `\n• سعر جرام الذهب عيار 21 اليوم: ${goldGramPriceEgp} ج.م` : '';

  const prompt = `
احسب أفضل توزيع لحفظ القوة الشرائية لمبلغ الادخار الشهري (${monthlySavingsAmount} ج.م) في مصر:${goldPriceInfo}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: SAVINGS_AGENT_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            recommendedAllocationGoldPercent: { type: Type.NUMBER },
            recommendedCertificatesPercent: { type: Type.NUMBER },
            goldGramsToBuy: { type: Type.NUMBER },
            expectedAnnualHedgePercent: { type: Type.NUMBER },
            adviceSummaryAr: { type: Type.STRING },
          },
          required: [
            'recommendedAllocationGoldPercent',
            'recommendedCertificatesPercent',
            'goldGramsToBuy',
            'expectedAnnualHedgePercent',
            'adviceSummaryAr',
          ],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      return { success: true, ...parsed };
    }
  } catch (err) {
    console.error('Savings Agent Error:', err);
  }

  return {
    success: false,
    errorCode: 'AI_UNAVAILABLE',
    requiresRetry: true,
  };
}

export async function runSavingsAgent(
  ai: GoogleGenAI,
  message: string,
  chatHistory: ChatHistoryMessage[],
  context: TrustedFinancialContext | null
): Promise<string> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  const contextData = {
    salary: context?.salary || 0,
    availableBalance: context?.availableBalance || 0,
    totalWalletBalance: context?.totalWalletBalance || 0,
    monthlySurplus: context?.monthlySurplus || 0,
    categorySpending: context?.categorySpending || {},
    recentTransactionsCount: context?.recentTransactions?.length || 0,
    unpaidBillsTotal: context?.unpaidBillsTotal || 0,
    monthlyInstallments: context?.monthlyInstallments || 0,
  };

  const systemInstruction = `
أنت "وكيل التحوط والادخار" (Savings & Gold Agent) - المستشار المالي الشخصي المتخصص في الادخار وحماية القوة الشرائية في مصر.
تجيب بلهجة مصرية عامية ودودة ومبسطة وعملية جداً.

البيانات المالية الحقيقية والنهائية للمستخدم هي:
${JSON.stringify(contextData, null, 2)}

[قواعد صارمة لتحديد نوايا المستخدم والرد عليها]:

1. نية التوفير لمبلغ مستهدف (SAVE_TARGET): (مثال: "عاوز أوفر 2000 جنيه الشهر ده" أو "أحوش 3000 جنيه ازاي؟")
   - يجب إجراء تقييم جدوى (Feasibility Assessment): قارن المبلغ المستهدف بالمرتب والالتزامات الحالية لمعرفة هل هو واقعي أم لا.
   - احسب بدقة واعرض للمستخدم:
     * المبلغ المطلوب توفيره أسبوعياً (المبلغ المستهدف تقسيم 4)
     * المبلغ المطلوب توفيره يومياً (المبلغ المستهدف تقسيم 30)
   - اذكر الرصيد الفعلي المتاح حالياً (availableBalance).
   - اعرض فئات الإنفاق الحقيقية لديه من البيانات واقترح بنود محددة لتقليلها (مثلاً تقليل الترفيه أو السوبرماركت بناءً على المبالغ الحقيقية المسجلة في categorySpending).
   - [قانون]: لا تقترح شراء ذهب أو شهادات بنكية أبداً في هذه النية إلا إذا سألك المستخدم صراحة عن كيفية استثمار أو حفظ تلك المدخرات.

2. نية تقليل مصاريف فئة معينة (CATEGORY_REDUCTION): (مثال: "ازاي أوفر 2000 جنيه من مصاريف السوبرماركت؟" أو "أقلل مصاريف الترفيه")
   - افحص فئة الإنفاق المطلوبة في categorySpending (مثال: السوبرماركت يطابق 'Food & Groceries' أو 'Shopping & Entertainment').
   - إذا كان المبلغ المطلوب توفيره أكبر من إجمالي الإنفاق الفعلي المسجل في هذه الفئة هذا الشهر، يجب أن ترفض ذلك بوضوح تام وتوضح له الأرقام الحقيقية.
     مثال: "أنت مسجل 200 جنيه بس سوبرماركت الشهر ده، فمينفعش نوفر 2000 من البند ده لوحده. نحتاج نشوف بنود تانية."
   - اقترح بنوداً بديلة أو إضافية واقعية لتقليلها بناءً على الأرقام الحقيقية المتوفرة في فئات الإنفاق لديه.
   - [قانون]: لا تقترح الذهب أو الشهادات في هذه النية أبداً.

3. نية الاستثمار وحفظ القوة الشرائية (INVESTMENT): (مثال: "أحوش فلوسي في ذهب ولا شهادة؟" أو "أستثمر في الذهب ازاي")
   - في هذه الحالة فقط، اشرح للمستخدم خيارات التحوط من التضخم (الذهب عيار 21 والشهادات البنكية عالية العائد).
   - يمكنك اقتراح توزيع محدد (مثال: نسبة في الذهب ونسبة في الشهادات).

4. أسئلة المتابعة وفهم الضمائر (FOLLOW_UP): (مثال: "طب لو قللت الأكل بره؟" أو "ليه؟" أو "يعني كده تمام؟")
   - افهم السؤال بناءً على سياق المحادثة السابقة والقرارات التي تم اتخاذها للتو. لا تقم بإعادة الحسابات من الصفر بل واصل النقاش بذكاء ودون تكرار.

[قواعد عامة]:
- لا تخترع أو تفترض أي أرقام أو فئات مصاريف وهمية غير مسجلة. إذا لم تتوفر بيانات كافية (مثلاً الراتب صفر أو لا توجد مصاريف)، صرح بذلك بوضوح وود ومصداقية كاملة.
- تجنب تماماً الحديث بلغة خشبية أو رسمية مفرطة؛ اللهجة المصرية العامية الودودة والعملية هي الأساس.
`;

  const contents = [
    ...chatHistory.map(h => ({
      role: h.role,
      parts: [{ text: h.text }]
    })),
    {
      role: 'user' as const,
      parts: [{ text: message }]
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction,
      }
    });

    return response.text ? response.text.trim() : 'عذراً، حدث خطأ أثناء معالجة طلبك.';
  } catch (err) {
    console.error('runSavingsAgent Error:', err);
    return 'عذراً، خدمة وكيل الادخار غير متاحة حالياً بسبب خطأ فني.';
  }
}

