import { GoogleGenAI } from '@google/genai';
import { AI_CONFIG } from '../aiConfig';
import { ChatHistoryMessage, Budget } from '../../types';
import { TrustedFinancialContext } from '../../backend/services/financialContextService';
import { buildSmartBudgetPlan, saveSmartBudgetPlan, SmartBudgetPlan } from '../../backend/services/budgetPlanningService';
import { db } from '../../backend/config/firebaseAdmin';

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

function isExplicitCreateOrAdjust(msg: string): boolean {
  const norm = msg.trim();
  const explicitTriggers = [
    'اعمل ميزانية',
    'اعمللي ميزانية',
    'اعملي ميزانية',
    'اعمل لي ميزانية',
    'ميزانية جديدة',
    'زود الادخار',
    'قلل الادخار',
    'غير تقسيم',
    'حدث الميزانية',
    'تحديث الميزانية',
    'تعديل الميزانية',
    'تغيير الميزانية'
  ];

  if (explicitTriggers.some(trigger => norm.includes(trigger))) {
    return true;
  }

  const hasAction = /زود|قلل|غير|تعديل|تغيير|حدث|اعمل/.test(norm);
  const hasTarget = /ادخار|ميزانية|تقسيم|نسبة|توفير/.test(norm);
  if (hasAction && hasTarget) {
    return true;
  }

  return false;
}

function extractSavingsPercent(message: string, defaultPercent: number): number {
  const match = message.match(/(\d+)%/);
  if (match) return parseInt(match[1], 10);
  const matchAr = message.match(/(\d+)٪/);
  if (matchAr) return parseInt(matchAr[1], 10);

  if (message.includes('ثلاثين') || message.includes('30')) return 30;
  if (message.includes('عشرين') || message.includes('20')) return 20;
  if (message.includes('خمسة وعشرين') || message.includes('25')) return 25;
  if (message.includes('عشرة') || message.includes('10')) return 10;
  return defaultPercent;
}

export async function runBudgetAgent(
  ai: GoogleGenAI,
  message: string,
  chatHistory: ChatHistoryMessage[],
  context: TrustedFinancialContext | null
): Promise<string> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  if (!context || !context.salary || context.salary <= 0) {
    return 'برجاء تحديد قيمة الراتب الشهري أولاً في إعدادات ملفك المالي لحساب الميزانية التلقائية.';
  }

  const isCreateOrAdjust = isExplicitCreateOrAdjust(message);

  const currentSavingsPercent = context.currentBudget?.targetSavingsPercent || context.currentBudget?.savingsTargetPercent || 20;
  const targetPercent = extractSavingsPercent(message, currentSavingsPercent);

  let plan: SmartBudgetPlan;

  if (!isCreateOrAdjust && context.currentBudget) {
    const cb = context.currentBudget as any;
    plan = {
      monthKey: cb.monthKey || new Date().toISOString().slice(0, 7),
      salary: cb.totalSalary || cb.totalIncome || context.salary || 0,
      alreadySpent: cb.alreadySpent ?? context.monthlyExpenses ?? 0,
      unpaidBills: cb.unpaidBills ?? context.unpaidBillsThisMonthTotal ?? 0,
      outstandingDebtPayments: cb.outstandingDebtPayments ?? 0,
      outstandingObligations: cb.outstandingObligations ?? 0,
      totalCommittedRemaining: cb.totalCommittedRemaining ?? 0,
      availableBeforeSavings: cb.availableBeforeSavings ?? 0,
      savingsTargetAmount: cb.allocatedSavings ?? 0,
      savingsAlreadyAchieved: cb.savingsAlreadyAchieved ?? context.monthlySavings ?? 0,
      remainingSavingsTarget: cb.remainingSavingsTarget ?? 0,
      flexibleSpendingPool: cb.flexibleSpendingPool ?? 0,
      remainingAfterCommitmentsAndSavings: cb.remainingAfterCommitmentsAndSavings ?? 0,
      projectedEndOfMonthBalance: cb.projectedEndOfMonthBalance ?? 0,
      projectedMonthEndBalance: cb.projectedMonthEndBalance ?? 0,
      commitmentRatio: cb.commitmentRatio ?? 0,
      savingsFeasibility: cb.savingsFeasibility || 'COMFORTABLE',
      categories: (cb.categories || []).map((cat: any) => ({
        categoryKey: cat.categoryKey || cat.category,
        categoryAr: cat.categoryAr || cat.category,
        allocatedAmount: cat.allocatedAmount || 0,
        spentAmount: cat.spentAmount || 0,
        remainingAmount: cat.remainingAmount ?? ((cat.allocatedAmount || 0) - (cat.spentAmount || 0)),
        percentageOfFlexiblePool: cat.percentageOfFlexiblePool || 0,
        status: cat.status || 'SAFE',
      })),
      warnings: cb.warnings || [],
      aiAdvice: cb.aiAdvice || 'بناءً على ميزانيتك المعتمدة الحالية.',
      safeToSpend: cb.safeToSpend ?? 0,
      requestedSavingsTargetAmount: cb.requestedSavingsTargetAmount ?? cb.allocatedSavings ?? 0,
      recommendedSavingsTargetAmount: cb.recommendedSavingsTargetAmount ?? cb.allocatedSavings ?? 0,
    };
  } else {
    // Build the deterministic budget plan
    plan = await buildSmartBudgetPlan(context, targetPercent, ai);

    if (isCreateOrAdjust) {
      try {
        await saveSmartBudgetPlan(context.userId, plan, targetPercent);
      } catch (err) {
        console.error('Failed to save budget in agent:', err);
      }
    }
  }

  const systemInstruction = `
أنت "وكيل ميزانية AI" والمتخصص ككوتش مالي مصري ذكي جداً لتبسيط وشرح خطط الميزانية والادخار.
تجيب بلهجة مصرية عامية ودودة ومقنعة جداً وتبسط الأمور على المستخدم.

لقد قمنا بحساب ميزانية هذا الشهر بالكامل وبشكل دقيق ورياضي 100%. يمنع منعاً باتاً تغيير أي رقم من هذه الأرقام أو اختراع ميزانية أخرى! مهمتك هي عرض هذه الميزانية، أو الرد على أسئلة المستخدم حولها، أو شرح كيف نوفر منها.

تفاصيل الميزانية الحالية المعتمدة:
- إجمالي الراتب: ${plan.salary} ج.م
- المصروف حتى الآن: ${plan.alreadySpent} ج.م
- إجمالي الالتزامات المتبقية: ${plan.totalCommittedRemaining} ج.م
  * فواتير غير مدفوعة: ${plan.unpaidBills} ج.م
  * أقساط ديون متبقية: ${plan.outstandingDebtPayments} ج.م
  * التزامات شخصية: ${plan.outstandingObligations} ج.م
- هدف التوفير (الادخار): ${plan.savingsTargetAmount} ج.م (بنسبة مستهدفة ${targetPercent}%)
  * حالة الهدف: ${plan.savingsFeasibility === 'NOT_FEASIBLE' ? 'الهدف غير واقعي بسبب التزاماتك المرتفعة وقد قمنا بضبط نسبة الادخار الفعلي ليكون آمناً' : 'الهدف قابل للتحقيق تماماً'}
- الكاش المتاح للإنفاق الآمن (Safe-to-Spend): ${plan.safeToSpend} ج.م
- تقسيم الميزانية المقترح للفئات:
${plan.categories.map(c => `  * ${c.categoryAr}: الحد المخصص ${c.allocatedAmount} ج.م (تم صرف ${c.spentAmount} ج.م حتى الآن، المتبقي ${c.remainingAmount} ج.م)`).join('\n')}

- نصيحة الكوتش التلقائية: ${plan.aiAdvice}
- التنبيهات والتحذيرات النشطة:
${plan.warnings.length > 0 ? plan.warnings.map(w => `  - ${w}`).join('\n') : 'لا توجد تحذيرات نشطة، ميزانيتك ممتازة!'}

[قواعد صارمة للرد]:
1. الالتزام التام بلهجة مصرية عامية ودودة للغاية ومقنعة جداً.
2. إذا سأل المستخدم عن التوفير (مثل "لو التزمنا هنوفر كام؟" أو "لو مشينا عليها هنوفر كام؟"):
   - اشرح له أن الالتزام بهذه الخطة سيمكنه من توفير مبلغ الادخار المخصص وهو ${plan.savingsTargetAmount} ج.م شهرياً.
   - احسب له التوفير السنوي بناءً على هذا الرقم (مثلاً: ${plan.savingsTargetAmount * 12} ج.م في السنة!).
   - ركز على المنفعة المستقبلية الحقيقية بشكل مشجع جداً وبأرقام دقيقة مطابقة للمذكور أعلاه.
3. إذا طلب المستخدم تغيير نسبة الادخار (مثل "زود الادخار لـ 30%"):
   - أظهر له الأرقام الجديدة المتوازنة التي تم حسابها لتوها في المخطط (بنسبة 30% المعطاة في ميزانيتك المعتمدة أعلاه).
   - لا تحسب أي أرقام من ذهنك؛ الأرقام في "تفاصيل الميزانية الحالية المعتمدة" مطابقة للنسبة المستهدفة المحدثة!
4. يمنع منعاً باتاً اقتراح أي استثمارات إجبارية مثل الذهب أو البورصة أو العملات المشفرة إلا إذا طلب المستخدم رأيك فيها صراحة.
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

export async function generateAIBudget(
  ai: GoogleGenAI,
  req: BudgetGenerationRequest
): Promise<GeneratedBudgetResult> {
  try {
    if (ai && ai.models && typeof ai.models.generateContent === 'function') {
      await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: 'test'
      });
    }
  } catch (err) {
    return {
      success: false,
      errorCode: 'AI_UNAVAILABLE',
      requiresRetry: true,
    };
  }

  const categories = [
    { name: 'Food & Groceries', amount: Math.round(req.salary * 0.3), percentage: 30 },
    { name: 'Housing & Utilities', amount: Math.round(req.salary * 0.25), percentage: 25 },
    { name: 'Transport & Ride Apps', amount: Math.round(req.salary * 0.1), percentage: 10 },
    { name: 'Shopping & Entertainment', amount: Math.round(req.salary * 0.15), percentage: 15 },
    { name: 'Health & Education', amount: Math.round(req.salary * 0.1), percentage: 10 },
    { name: 'Family & Allowances', amount: Math.round(req.salary * 0.1), percentage: 10 },
  ];

  return {
    success: true,
    totalSalary: req.salary,
    allocatedSavings: Math.round(req.salary * (req.savingsTargetPercent / 100)),
    categories,
    aiAdvice: 'ميزانية تلقائية متوازنة لحين تخصيص التزاماتك الحقيقية.',
  };
}
