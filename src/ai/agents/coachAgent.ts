import { GoogleGenAI } from '@google/genai';
import { EGYPTIAN_FINANCIAL_COACH_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export async function askFinancialCoach(
  ai: GoogleGenAI,
  userMessage: string,
  chatHistory: ChatMessage[] = [],
  contextData?: Record<string, any>
): Promise<string> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  const bankText = contextData?.bank ? contextData.bank : 'غير محدد (غير متاح البيانات)';
  const contextPrompt = contextData
    ? `[معلومات مالية للمستخدم من الخادم الموثوق]: الراتب الشهري: ${contextData.salary || 0} ج.م، رصيد المحافظ: ${contextData.totalWalletBalance || 0} ج.م، إجمالي الأقساط والديون: ${contextData.debtsTotal || 0} ج.م، البنك الأساسي: ${bankText}.\n`
    : '';

  const contents = [
    ...chatHistory.map((msg) => ({
      role: msg.role,
      parts: [{ text: msg.text }],
    })),
    {
      role: 'user',
      parts: [{ text: contextPrompt + userMessage }],
    },
  ];

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: EGYPTIAN_FINANCIAL_COACH_PROMPT,
        temperature: 0.7,
      },
    });

    return response.text || 'عذراً، حدث خطأ أثناء معالجة طلبك مع الكوتش المالي.';
  } catch (err) {
    console.error('Coach Agent Error:', err);
    return 'خدمة الذكاء الاصطناعي غير متاحة حالياً، يرجى إعادة المحاولة لاحقاً.';
  }
}
