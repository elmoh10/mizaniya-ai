import { GoogleGenAI, Type } from '@google/genai';
import { SAVINGS_AGENT_PROMPT } from '../prompts';

export interface GoldSavingsAdvice {
  recommendedAllocationGoldPercent: number;
  recommendedCertificatesPercent: number;
  goldGramsToBuy: number;
  expectedAnnualHedgePercent: number;
  adviceSummaryAr: string;
}

export async function getSavingsHedgeStrategy(
  ai: GoogleGenAI,
  monthlySavingsAmount: number,
  goldGramPriceEgp: number = 3850
): Promise<GoldSavingsAdvice> {
  const modelName = 'gemini-3.6-flash';

  const prompt = `
احسب أفضل توزيع لحفظ القوة الشرائية لمبلغ الادخار الشهري (${monthlySavingsAmount} ج.م) في مصر:
• سعر جرام الذهب عيار 21 المتوقع اليوم: ${goldGramPriceEgp} ج.م
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
      return JSON.parse(response.text.trim()) as GoldSavingsAdvice;
    }
  } catch (err) {
    console.error('Savings Agent Error:', err);
  }

  const goldAlloc = Math.round(monthlySavingsAmount * 0.6);
  const grams = Math.round((goldAlloc / goldGramPriceEgp) * 100) / 100;

  return {
    recommendedAllocationGoldPercent: 60,
    recommendedCertificatesPercent: 40,
    goldGramsToBuy: grams,
    expectedAnnualHedgePercent: 28,
    adviceSummaryAr: `يُنصح بوضع 60% من الفائض الشهري في شراء سبائك ذهب (حوالي ${grams} جرام شهرياً)، والـ 40% المتبقية في أوعية توفير يومية عالية العائد لمواجهة التضخم.`,
  };
}
