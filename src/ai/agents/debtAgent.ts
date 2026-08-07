import { GoogleGenAI, Type } from '@google/genai';
import { DEBT_AGENT_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';

export interface InstallmentDebt {
  title: string;
  provider: string; // ValU, B.Tech, CIB Credit Card, etc.
  remainingAmount: number;
  monthlyAmount: number;
  interestRate: number;
}

export interface DebtStrategyPlan {
  success?: boolean;
  errorCode?: string;
  requiresRetry?: boolean;
  snowballOrder?: string[];
  recommendedMonthlyPayment?: number;
  totalInterestSavedEstimated?: number;
  monthsToDebtFree?: number;
  actionStepsAr?: string[];
}

export async function analyzeDebtStrategy(
  ai: GoogleGenAI,
  debts: InstallmentDebt[],
  monthlySurplus: number
): Promise<DebtStrategyPlan> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  const prompt = `
حلل الأقساط والديون التالية وقم بإعداد خطة سداد ذكية في مصر:
• الميزانية الشهرية المتاحة لسداد الديون والزيادات: ${monthlySurplus} ج.م
• قائمة الأقساط والديون:
${JSON.stringify(debts, null, 2)}
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: DEBT_AGENT_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            snowballOrder: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            recommendedMonthlyPayment: { type: Type.NUMBER },
            totalInterestSavedEstimated: { type: Type.NUMBER },
            monthsToDebtFree: { type: Type.NUMBER },
            actionStepsAr: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'snowballOrder',
            'recommendedMonthlyPayment',
            'totalInterestSavedEstimated',
            'monthsToDebtFree',
            'actionStepsAr',
          ],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      return { success: true, ...parsed };
    }
  } catch (err) {
    console.error('Debt Agent Error:', err);
  }

  return {
    success: false,
    errorCode: 'AI_UNAVAILABLE',
    requiresRetry: true,
  };
}
