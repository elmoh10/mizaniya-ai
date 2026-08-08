import { GoogleGenAI, Type } from '@google/genai';
import { BUDGET_AGENT_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';
import { ChatHistoryMessage } from '../../types';
import { TrustedFinancialContext } from '../../backend/services/financialContextService';

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

export async function runBudgetAgent(
  ai: GoogleGenAI,
  message: string,
  chatHistory: ChatHistoryMessage[],
  context: TrustedFinancialContext | null
): Promise<string> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  const salary = context?.salary || 0;
  if (!salary || salary <= 0) {
    return 'برجاء تحديد قيمة الراتب الشهري أولاً في إعدادات ملفك المالي لحساب الميزانية التلقائية.';
  }

  const contextData = {
    salary,
    savedBudget: context?.currentBudget || null,
    familyMembersCount: context?.userProfile?.familyMembersCount || 1,
    unpaidBillsTotal: context?.unpaidBillsTotal || 0,
    monthlyInstallments: context?.monthlyInstallments || 0,
    categorySpending: context?.categorySpending || {},
  };

  const isCreateBudget =
    message.includes('اعمل ميزانية') ||
    message.includes('خطط ميزانية') ||
    message.includes('ميزانية جديدة') ||
    message.includes('اعملي ميزانية') ||
    message.includes('تقسيم المرتب') ||
    message.includes('تقسيم ميزانية') ||
    (message.includes('ميزانية') && chatHistory.length === 0);

  let toolResultText = '';
  if (isCreateBudget) {
    const budgetResult = await generateAIBudget(ai, {
      salary,
      savingsTargetPercent: context?.currentBudget?.targetSavingsPercent || 20,
      familyMembersCount: context?.userProfile?.familyMembersCount || 1,
      fixedInstallments: context?.monthlyInstallments || 0,
    });
    if (budgetResult.success) {
      toolResultText = `[أداة الميزانية التلقائية قامت بالحسابات التالية المقترحة]:
- إجمالي الراتب: ${budgetResult.totalSalary} ج.م
- الادخار المقتطع: ${budgetResult.allocatedSavings} ج.م
- التقسيم المقترح:
${(budgetResult.categories || []).map(c => `  * ${c.name}: ${c.amount} ج.م (${c.percentage}%)`).join('\n')}
- نصيحة الأداة: ${budgetResult.aiAdvice}`;
    }
  }

  const systemInstruction = `
أنت "وكيل ميزانية AI" المتخصص في بناء وهيكلة وتعديل الميزانيات الديناميكية الشهرية في مصر.
تجيب بلهجة مصرية عامية ودودة وبسيطة ومقنعة جداً.

البيانات الحقيقية المسجلة حالياً:
${JSON.stringify(contextData, null, 2)}

${toolResultText ? `إليك الميزانية التلقائية التي تم حسابها لتوها لتقديمها للمستخدم:\n${toolResultText}\n` : ''}

[قواعد صارمة لإدارة الجلسة والرد]:
1. إذا كانت النية هي إنشاء ميزانية جديدة (CREATE_BUDGET)، استخدم بيانات أداة الميزانية التلقائية المرفقة أعلاه تماماً واعرضها بأسلوبك الودود المعتاد دون تغيير الأرقام.
2. إذا كانت النية هي شرح أو نقاش ميزانية تم عرضها سابقاً في المحادثة (EXPLAIN_BUDGET / FOLLOW_UP / "لو عملنا كده هنحقق ايه؟"):
   - [هام جداً]: لا تقم أبداً بإعادة حساب أو توليد ميزانية جديدة بأرقام مختلفة!
   - استخدم تفاصيل الميزانية الأخيرة المذكورة في تاريخ المحادثة (chatHistory).
   - اشرح المنافع الفوائد والأهداف التي يمكن تحقيقها بناءً على تلك الميزانية السابقة. مثال: "لو التزمنا بالخطة دي هتوفر 2,200 جنيه شهرياً، يعني حوالي 26,400 جنيه في السنة قبل أي تغيير في دخلك أو مصاريفك."
3. إذا طلب المستخدم تعديل الميزانية (ADJUST_BUDGET) (مثال: "قلل الترفيه لـ500" أو "زود الادخار لـ30%"):
   - قم بتعديل هذا البند فقط في الميزانية السابقة واعرض الأرقام الجديدة المتوازنة بناءً على رغبته، مع الحفاظ على إجمالي الراتب ثابتاً.
4. التحدث بالعامية المصرية الودودة والعملية.
5. لا تخترع أو تفترض أي بيانات غير حقيقية أو غير مسجلة.
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

    return response.text ? response.text.trim() : 'عذراً، حدث خطأ أثناء معالجة الميزانية.';
  } catch (err) {
    console.error('runBudgetAgent Error:', err);
    return 'عذراً، خدمة وكيل الميزانية غير متاحة حالياً.';
  }
}

