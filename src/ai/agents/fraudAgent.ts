import { GoogleGenAI, Type } from '@google/genai';
import { FRAUD_AGENT_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';

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
