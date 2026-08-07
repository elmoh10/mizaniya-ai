import { GoogleGenAI, Type } from '@google/genai';
import { SAVINGS_AGENT_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';

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
