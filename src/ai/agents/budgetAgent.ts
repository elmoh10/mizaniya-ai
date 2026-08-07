import { GoogleGenAI, Type } from '@google/genai';
import { BUDGET_AGENT_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';

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
  success?: boolean;
  errorCode?: string;
  requiresRetry?: boolean;
  totalSalary?: number;
  allocatedSavings?: number;
  categories?: BudgetCategoryAllocation[];
  aiAdvice?: string;
}

export async function generateAIBudget(
  ai: GoogleGenAI,
  req: BudgetGenerationRequest
): Promise<GeneratedBudgetResult> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

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
      return { success: true, ...data };
    }
  } catch (err) {
    console.error('Error generating AI budget:', err);
  }

  return {
    success: false,
    errorCode: 'AI_UNAVAILABLE',
    requiresRetry: true,
  };
}
