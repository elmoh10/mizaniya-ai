import { GoogleGenAI, Type } from '@google/genai';
import { FRAUD_AGENT_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';
import { ChatHistoryMessage } from '../../types';
import { TrustedFinancialContext } from '../../backend/services/financialContextService';

export interface FraudAnalysisResult {
  success?: boolean;
  errorCode?: string;
  requiresRetry?: boolean;
  isSuspicious?: boolean;
  riskScore?: number; // 0 to 100
  reasonAr?: string;
  recommendationAr?: string;
}

export async function detectTransactionFraud(
  ai: GoogleGenAI,
  transactionData: {
    amount: number;
    merchant: string;
    category: string;
    time: string;
    walletType: string;
    avgCategorySpend: number;
  }
): Promise<FraudAnalysisResult> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  const prompt = `
افحص المعاملة التالية وحدد ما إذا كانت تتضمن عملية مريبة أو خصماً مكرراً أو مصاريف خفية:
${JSON.stringify(transactionData, null, 2)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: FRAUD_AGENT_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isSuspicious: { type: Type.BOOLEAN },
            riskScore: { type: Type.NUMBER },
            reasonAr: { type: Type.STRING },
            recommendationAr: { type: Type.STRING },
          },
          required: ['isSuspicious', 'riskScore', 'reasonAr', 'recommendationAr'],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      return { success: true, ...parsed };
    }
  } catch (err) {
    console.error('Fraud Agent Error:', err);
  }

  return {
    success: false,
    errorCode: 'AI_UNAVAILABLE',
    requiresRetry: true,
  };
}

export async function runFraudAgent(
  ai: GoogleGenAI,
  message: string,
  chatHistory: ChatHistoryMessage[],
  context: TrustedFinancialContext | null
): Promise<string> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  const expenses = (context?.recentTransactions || [])
    .filter(tx => tx.type === 'expense')
    .slice(0, 10)
    .map(tx => ({
      id: tx.id,
      amount: tx.amount,
      merchant: tx.merchant || tx.title || 'جهة غير معروفة',
      category: tx.category || 'غير مصنف',
      date: tx.date || '',
    }));

  const contextData = {
    recentExpenses: expenses,
    walletBalances: context?.walletBalances || [],
  };

  const isRecheckRequested =
    message.includes('إعادة فحص') ||
    message.includes('أعد الفحص') ||
    message.includes('recheck') ||
    message.includes('افحص تاني') ||
    message.includes('افحص ثاني');

  const isCheckTxRequested =
    (message.includes('افحص العملية') ||
     message.includes('عملية غريبة') ||
     message.includes('معاملة مريبة') ||
     message.includes('افحص اخر معاملة') ||
     message.includes('اخر عملية') ||
     isRecheckRequested) &&
    !message.includes('كده تمام') &&
    !message.includes('تمام كده');

  let toolResultText = '';
  if (isCheckTxRequested && expenses.length > 0) {
    const latestTx = expenses[0];
    const checkResult = await detectTransactionFraud(ai, {
      amount: latestTx.amount,
      merchant: latestTx.merchant,
      category: latestTx.category,
      time: latestTx.date,
      walletType: 'EGP',
      avgCategorySpend: (context?.categorySpending && context.categorySpending[latestTx.category]) || latestTx.amount,
    });

    if (checkResult.success) {
      toolResultText = `[أداة كشف الاحتيال فحصت العملية الأخيرة]:
- العملية المفحوصة: ${latestTx.amount} ج.م لدى ${latestTx.merchant} (${latestTx.category}) بتاريخ ${latestTx.date}
- نسبة الاشتباه بالاحتيال: ${checkResult.riskScore}%
- النتيجة: ${checkResult.isSuspicious ? '⚠️ مشبوهة وبها مخاطرة عالية!' : '✅ آمنة وطبيعية'}
- الأسباب: ${checkResult.reasonAr}
- التوصية: ${checkResult.recommendationAr}`;
    }
  }

  const systemInstruction = `
أنت "وكيل كشف الاحتيال والأمان المالي" (Fraud & Financial Security Agent) في مصر.
تجيب بلهجة مصرية عامية ودودة وبسيطة وحذرة للغاية. مهمتك هي حماية العميل من النصب الإلكتروني، الاختراق، وفحص عملياته المشبوهة.

العمليات الأخيرة الحقيقية الخاصة بالعميل:
${JSON.stringify(contextData, null, 2)}

${toolResultText ? `إليك نتائج أداة كشف الاحتيال التي تم تشغيلها لتوها لتقديمها للمستخدم:\n${toolResultText}\n` : ''}

[قواعد صارمة لتصنيف النوايا والرد]:
1. فحص عملية معينة (CHECK_TRANSACTION) أو إعادة فحصها (RECHECK):
   - إذا تم تشغيل أداة كشف الاحتيال (المرفقة أعلاه)، اشرح النتيجة بلهجة مصرية واضحة وحذرة جداً للمستخدم، ونبهه للخطوات الأمنية.
   - إذا لم يتم تشغيل الأداة ولكن المستخدم طلب فحص معاملة معينة بالاسم أو القيمة، ابحث عنها في العمليات الأخيرة واعرض تحليلك لها.

2. التثقيف ضد أساليب النصب الشائعة في مصر (LEARN_SCAMS): (مثل: فودافون كاش، إنستاباي، تحديث بيانات البنك)
   - اشرح الأسلوب بأسلوب واقعي وودود وحذّر.
   - أمثلة شهيرة:
     * نصب إنستاباي (طلب تحويل وهمي أو روابط دفع عشوائية).
     * فودافون كاش (رسائل تم تحويل مبلغ بالخطأ ومطالبة بإرجاعه).
     * مكالمات موظفي البنك المزيفين (تحديث بيانات بطاقة البنك وطلب رقم OTP).

3. الإبلاغ أو الاستشارة في حالة التعرض للنصب (REPORT_FRAUD):
   - قدم له خطوات فورية لحماية حساباته:
     * الاتصال بخدمة عملاء البنك فوراً لوقف البطاقات.
     * إبلاغ مباحث الإنترنت (رقم 108 أو عبر الخط الساخن).
     * تغيير كلمات المرور وتفعيل التحقق بخطوتين.

4. نقاش عام ومتابعة (FOLLOW_UP) وفهم الضمائر المتصلة (مثل: "طب والعملية اللي قبلها؟" أو "طب أعمل إيه؟"):
   - أجب بدقة وعناية على أسئلة الأمان المالي مع الحفاظ على لهجة مصرية عامية وقيم توجيهية موثوقة بنسبة 100%.

[قوانين عامة]:
- لا تخترع عمليات أو حوادث نصب وهمية حدثت للمستخدم نفسه لم يسجلها النظام أو يذكرها بنفسه.
- التحدث باللهجة المصرية العامية الودودة البسيطة والحذرة.
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

    return response.text ? response.text.trim() : 'عذراً، حدث خطأ أثناء فحص الاحتيال.';
  } catch (err) {
    console.error('runFraudAgent Error:', err);
    return 'عذراً، خدمة وكيل الأمان المالي غير متاحة حالياً.';
  }
}

