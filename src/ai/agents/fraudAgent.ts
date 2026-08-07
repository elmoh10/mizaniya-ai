import { GoogleGenAI, Type } from '@google/genai';
import { FRAUD_AGENT_PROMPT } from '../prompts';

export interface FraudAnalysisResult {
  isSuspicious: boolean;
  riskScore: number; // 0 to 100
  reasonAr: string;
  recommendationAr: string;
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
  const modelName = 'gemini-3.6-flash';

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
      return JSON.parse(response.text.trim()) as FraudAnalysisResult;
    }
  } catch (err) {
    console.error('Fraud Agent Error:', err);
  }

  const isHigh = transactionData.amount > transactionData.avgCategorySpend * 2.5;
  return {
    isSuspicious: isHigh,
    riskScore: isHigh ? 65 : 15,
    reasonAr: isHigh
      ? `المبلغ (${transactionData.amount} ج.م) يتجاوز متوسط إنفاقك المعتاد في فئة ${transactionData.category} بنسبة أكثر من 250%!`
      : 'معاملة طبيعية وتتماشى مع النمط المالي للمستخدم.',
    recommendationAr: isHigh
      ? 'يرجى مراجعة إيصال الشراء مع التاجر للتأكد من عدم وجود رسوم خدمة إضافية أو خصم مضاعف عبر InstaPay.'
      : 'لا يوجد إجراء مطلوب.',
  };
}
