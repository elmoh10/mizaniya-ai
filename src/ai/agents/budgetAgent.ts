import { GoogleGenAI, Type } from '@google/genai';
import { BUDGET_AGENT_PROMPT } from '../prompts';

export interface BudgetGenerationRequest {
  salary: number;
  savingsTargetPercent: number;
  fixedInstallments?: number;
  familyMembersCount?: number;
}

export interface BudgetCategoryAllocation {
  name: string;
  amount: number;
  percentage: number;
}

export interface GeneratedBudgetResult {
  totalSalary: number;
  allocatedSavings: number;
  categories: BudgetCategoryAllocation[];
  aiAdvice: string;
}

export async function generateAIBudget(
  ai: GoogleGenAI,
  req: BudgetGenerationRequest
): Promise<GeneratedBudgetResult> {
  const modelName = 'gemini-3.6-flash';

  const prompt = `
قم بحساب وبناء ميزانية شهريّة متوازنة في مصر:
• إجمالي الراتب: ${req.salary} جنيه مصري
• نسبة الادخار المستهدفة: ${req.savingsTargetPercent}%
• إجمالي الأقساط الثابتة: ${req.fixedInstallments || 0} جنيه مصري
• عدد أفراد العائلة: ${req.familyMembersCount || 1}

أرجع إجابة صريحة وصحيحة بأسلوب JSON المطابق للمخطط.
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: BUDGET_AGENT_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            totalSalary: { type: Type.NUMBER },
            allocatedSavings: { type: Type.NUMBER },
            categories: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  amount: { type: Type.NUMBER },
                  percentage: { type: Type.NUMBER },
                },
                required: ['name', 'amount', 'percentage'],
              },
            },
            aiAdvice: { type: Type.STRING },
          },
          required: ['totalSalary', 'allocatedSavings', 'categories', 'aiAdvice'],
        },
      },
    });

    if (response.text) {
      const data = JSON.parse(response.text.trim());
      return data as GeneratedBudgetResult;
    }
  } catch (err) {
    console.error('Error generating AI budget:', err);
  }

  // Fallback calculations if API call encounters an error
  const savings = Math.round((req.salary * req.savingsTargetPercent) / 100);
  const remaining = req.salary - savings;

  return {
    totalSalary: req.salary,
    allocatedSavings: savings,
    categories: [
      { name: 'الأكل والشوبينج والتموين', amount: Math.round(remaining * 0.45), percentage: 45 },
      { name: 'الفواتير والكهرباء والإنترنت', amount: Math.round(remaining * 0.20), percentage: 20 },
      { name: 'الأقساط والمصاريف الثابتة', amount: Math.round(remaining * 0.15), percentage: 15 },
      { name: 'المواصلات والمشاوير', amount: Math.round(remaining * 0.10), percentage: 10 },
      { name: 'الترفيه والطوارئ', amount: Math.round(remaining * 0.10), percentage: 10 },
    ],
    aiAdvice: 'تم توزيع ميزانيتك تلقائياً للتحوط ضد زيادة الأسعار مع الاهتمام بخصم الادخار أولاً.',
  };
}
