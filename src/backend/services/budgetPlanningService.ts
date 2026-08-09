import { GoogleGenAI, Type } from '@google/genai';
import { TrustedFinancialContext, getObligationAmountDueForMonth } from './financialContextService';
import { CategoryType, CategoryBudget } from '../../types';
import { db } from '../config/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

export interface SmartBudgetCategory {
  categoryKey: CategoryType;
  categoryAr: string;
  allocatedAmount: number;
  spentAmount: number;
  remainingAmount: number;
  percentageOfFlexiblePool: number;
  status: 'SAFE' | 'WARNING' | 'HIGH' | 'EXCEEDED';
}

export interface SmartBudgetPlan {
  monthKey: string;
  salary: number;
  alreadySpent: number;
  unpaidBills: number;
  outstandingDebtPayments: number;
  outstandingObligations: number;
  totalCommittedRemaining: number;
  availableBeforeSavings: number;
  savingsTargetAmount: number;
  savingsAlreadyAchieved: number;
  remainingSavingsTarget: number;
  flexibleSpendingPool: number;
  remainingAfterCommitmentsAndSavings: number;
  projectedEndOfMonthBalance: number;
  projectedMonthEndBalance: number;
  commitmentRatio: number;
  savingsFeasibility: 'COMFORTABLE' | 'TIGHT' | 'NOT_FEASIBLE';
  categories: SmartBudgetCategory[];
  warnings: string[];
  aiAdvice: string;
  safeToSpend: number;
  requestedSavingsTargetAmount: number;
  recommendedSavingsTargetAmount: number;
}

let aiClient: GoogleGenAI | null = null;
const AI_REQUEST_TIMEOUT_MS = 20000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: any = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error('AI Request timeout'));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function getAIClient(customClient?: GoogleGenAI | null): GoogleGenAI | null {
  if (customClient) return customClient;
  if (!aiClient && process.env.GEMINI_API_KEY) {
    try {
      aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    } catch (err) {
      console.error('Failed to initialize GoogleGenAI client:', err);
    }
  }
  return aiClient;
}

const DEFAULT_FLEXIBLE_ALLOCATIONS: Record<string, number> = {
  'Food & Groceries': 40,
  'Transport & Ride Apps': 15,
  'Shopping & Entertainment': 15,
  'Health & Education': 15,
  'Family & Allowances': 15,
};

const CATEGORY_NAMES_AR: Record<CategoryType, string> = {
  'Food & Groceries': 'الأكل والسوبرماركت',
  'Housing & Utilities': 'السكن والمرافق',
  'Bills & Subscriptions': 'الفواتير والاشتراكات',
  'Transport & Ride Apps': 'المواصلات وسيارات الأجرة',
  'Installments & Debt': 'الأقساط والديون',
  'Health & Education': 'الصحة والتعليم',
  'Family & Allowances': 'العائلة والالتزامات الشخصية',
  'Shopping & Entertainment': 'التسوق والترفيه',
  'Emergency & Savings': 'الطوارئ والادخار',
  'Income & Salary': 'الدخل والمرتب',
};

function validateAIFlexibleAllocations(parsed: any, flexibleSpendingPool: number): Record<string, number> | null {
  if (!parsed || typeof parsed !== 'object') return null;

  const requiredKeys = [
    'Food & Groceries',
    'Transport & Ride Apps',
    'Health & Education',
    'Family & Allowances',
    'Shopping & Entertainment'
  ];

  for (const key of requiredKeys) {
    if (typeof parsed[key] !== 'number' || parsed[key] < 0) {
      return null;
    }
  }

  const sum = requiredKeys.reduce((acc, k) => acc + parsed[k], 0);
  if (Math.abs(sum - 100) > 2) {
    return null;
  }

  const allocations: Record<string, number> = {};
  let allocatedSum = 0;
  
  for (let i = 0; i < requiredKeys.length; i++) {
    const key = requiredKeys[i];
    const pct = parsed[key];
    if (i === requiredKeys.length - 1) {
      allocations[key] = Math.max(0, flexibleSpendingPool - allocatedSum);
    } else {
      const amt = Math.round(flexibleSpendingPool * (pct / 100));
      allocations[key] = amt;
      allocatedSum += amt;
    }
  }

  return allocations;
}

async function getAIFlexibleAllocations(flexibleSpendingPool: number, customClient?: GoogleGenAI | null): Promise<Record<string, number> | null> {
  const ai = getAIClient(customClient);
  if (!ai || flexibleSpendingPool <= 0) return null;

  const prompt = `
نقوم بتوزيع ميزانية مرنة في مصر بقيمة إجمالية ${flexibleSpendingPool} ج.م.
اقترح نسب مئوية لتوزيع هذا المبلغ على الفئات المرنة الخمسة التالية بحيث يكون المجموع الكلي للنسب يساوي 100% تماماً:
- "Food & Groceries"
- "Transport & Ride Apps"
- "Health & Education"
- "Family & Allowances"
- "Shopping & Entertainment"

يجب أن تكون الاستجابة عبارة عن كائن JSON مباشر يحتوي على الفئات والنسب فقط كأرقام. مثال:
{
  "Food & Groceries": 40,
  "Transport & Ride Apps": 15,
  "Health & Education": 15,
  "Family & Allowances": 15,
  "Shopping & Entertainment": 15
}
  `;

  try {
    const responsePromise = ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            'Food & Groceries': { type: Type.NUMBER },
            'Transport & Ride Apps': { type: Type.NUMBER },
            'Health & Education': { type: Type.NUMBER },
            'Family & Allowances': { type: Type.NUMBER },
            'Shopping & Entertainment': { type: Type.NUMBER },
          },
          required: [
            'Food & Groceries',
            'Transport & Ride Apps',
            'Health & Education',
            'Family & Allowances',
            'Shopping & Entertainment',
          ],
        },
      },
    }).then(res => res.text ? JSON.parse(res.text.trim()) : null);

    const parsed = await withTimeout(responsePromise, AI_REQUEST_TIMEOUT_MS);
    return validateAIFlexibleAllocations(parsed, flexibleSpendingPool);
  } catch (err) {
    console.error('Error getting AI flexible allocations:', err);
    return null;
  }
}

async function generateAICoachAdvice(plan: Omit<SmartBudgetPlan, 'aiAdvice'>, customClient?: GoogleGenAI | null): Promise<string> {
  const ai = getAIClient(customClient);
  if (!ai) {
    return 'تعذر تحميل نصيحة الكوتش حالياً، لكن الميزانية والحسابات تم إنشاؤها بنجاح.';
  }

  const prompt = `
أنت "كوتش مالي مصري" ذكي وودود جداً. تراجع خطة الميزانية التالية لمستخدم في مصر، وتقدم له نصيحة مخصصة ومبتكرة (في 2-3 جمل قصيرة بلهجة مصرية عامية ممتازة):

تفاصيل الميزانية:
- الراتب: ${plan.salary} ج.م
- المصروف حتى الآن: ${plan.alreadySpent} ج.م
- الالتزامات المتبقية: ${plan.totalCommittedRemaining} ج.م
- هدف الادخار: ${plan.savingsTargetAmount} ج.م (الحالة: ${plan.savingsFeasibility === 'NOT_FEASIBLE' ? 'غير ممكن وتم تعديله' : 'ممكن'})
- الإنفاق المرن المتاح: ${plan.flexibleSpendingPool} ج.م
- رصيد نهاية الشهر المتوقع: ${plan.projectedEndOfMonthBalance} ج.م
- نسبة الالتزام: ${plan.commitmentRatio}%
- تحذيرات الميزانية: ${plan.warnings.join(' | ') || 'لا يوجد تحذيرات'}

قدم نصيحة مشجعة وعملية جداً بالعامية المصرية الودودة، ركز فيها على الاستهلاك والتوفير والتحكم بمصاريفك، دون اقتراح أي نوع من أنواع الاستثمار الإلزامية مثل الذهب أو البورصة أو شهادات الادخار.
  `;

  try {
    const advicePromise = ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
    }).then(res => res.text ? res.text.trim() : '');

    const advice = await withTimeout(advicePromise, AI_REQUEST_TIMEOUT_MS);
    return advice || 'بناءً على حساباتنا، خطتك متوازنة تماماً هذا الشهر. التزم بتقسيم الإنفاق المرن لتحقيق كامل أهدافك.';
  } catch (err) {
    console.error('Error generating AI coach advice for budget:', err);
    return 'تعذر تحميل نصيحة الكوتش حالياً، لكن الميزانية والحسابات تم إنشاؤها بنجاح.';
  }
}

export async function buildDeterministicBudgetPlan(
  context: TrustedFinancialContext,
  savingsTargetPercent: number
): Promise<SmartBudgetPlan> {
  const monthKey = new Date().toISOString().slice(0, 7);
  const salary = context.salary || 0;
  const alreadySpent = context.monthlyExpenses || 0;
  const unpaidBills = context.unpaidBillsThisMonthTotal || 0;

  // 1. Calculate outstanding payments (Debts + Legacy active installments without double counting)
  let outstandingDebtPayments = 0;
  const processedDebtIds = new Set<string>();

  const debts = context.debts || [];
  for (const debt of debts) {
    const minPay = Number(debt.minimumPayment || 0);
    if (minPay <= 0) continue;

    processedDebtIds.add(debt.id);

    const paymentsThisMonth = (context.recentTransactions || [])
      .filter((tx) => tx.relatedDebtId === debt.id && (tx.date || '').startsWith(monthKey) && tx.type === 'expense')
      .reduce((acc, tx) => acc + (tx.amount || 0), 0);
    outstandingDebtPayments += Math.max(0, minPay - paymentsThisMonth);
  }

  const legacyInstallments = context.activeInstallments || context.installments || [];
  for (const inst of legacyInstallments) {
    const statusVal = (inst.status || '').toUpperCase();
    if (statusVal !== 'ACTIVE') continue;

    const monthlyPay = Number(inst.monthlyPayment || 0);
    if (monthlyPay <= 0) continue;

    if (inst.debtId && processedDebtIds.has(inst.debtId)) {
      continue;
    }

    const paymentsThisMonth = (context.recentTransactions || [])
      .filter((tx) => {
        const dateMatch = (tx.date || '').startsWith(monthKey);
        const typeMatch = tx.type === 'expense';
        if (!dateMatch || !typeMatch) return false;

        if (tx.relatedInstallmentId === inst.id) return true;
        if (inst.debtId && tx.relatedDebtId === inst.debtId) return true;
        return false;
      })
      .reduce((acc, tx) => acc + (tx.amount || 0), 0);

    outstandingDebtPayments += Math.max(0, monthlyPay - paymentsThisMonth);
  }

  const warnings: string[] = [];

  let outstandingObligations = 0;
  for (const ob of (context.obligations || [])) {
    const dueInfo = getObligationAmountDueForMonth(ob, monthKey);
    if (dueInfo.warning) {
      warnings.push(dueInfo.warning);
    }
    const dueAmount = dueInfo.amount;
    if (dueAmount <= 0) continue;

    const paymentsThisMonth = (context.recentTransactions || [])
      .filter((tx) => tx.relatedObligationId === ob.id && (tx.date || '').startsWith(monthKey) && tx.type === 'expense')
      .reduce((acc, tx) => acc + (tx.amount || 0), 0);
    outstandingObligations += Math.max(0, dueAmount - paymentsThisMonth);
  }

  const totalCommittedRemaining = unpaidBills + outstandingDebtPayments + outstandingObligations;
  const availableBeforeSavings = Math.max(0, salary - alreadySpent - totalCommittedRemaining);

  // Requirement 2: Savings Target amounts
  const requestedSavingsTargetAmount = Math.round(salary * (savingsTargetPercent / 100));
  const savingsAlreadyAchieved = context.monthlySavings || 0;
  const initialRemainingSavingsTarget = Math.max(0, requestedSavingsTargetAmount - savingsAlreadyAchieved);

  let savingsFeasibility: 'COMFORTABLE' | 'TIGHT' | 'NOT_FEASIBLE' = 'COMFORTABLE';
  let finalRemainingSavingsTarget = initialRemainingSavingsTarget;

  if (initialRemainingSavingsTarget > availableBeforeSavings) {
    savingsFeasibility = 'NOT_FEASIBLE';
    finalRemainingSavingsTarget = Math.round(Math.max(0, availableBeforeSavings * 0.2));
  } else if (initialRemainingSavingsTarget / (availableBeforeSavings || 1) > 0.7) {
    savingsFeasibility = 'TIGHT';
  } else {
    savingsFeasibility = 'COMFORTABLE';
  }

  const recommendedSavingsTargetAmount = savingsFeasibility === 'NOT_FEASIBLE'
    ? (savingsAlreadyAchieved + finalRemainingSavingsTarget)
    : requestedSavingsTargetAmount;

  const remainingSavingsTarget = finalRemainingSavingsTarget;

  const flexibleSpendingPool = Math.max(0, availableBeforeSavings - remainingSavingsTarget);

  // Requirement 6: Dynamic Month-End Projection based on Spending Velocity
  const remainingAfterCommitmentsAndSavings = Math.max(0, availableBeforeSavings - remainingSavingsTarget);

  const now = new Date();
  const currentDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysRemaining = Math.max(0, daysInMonth - currentDay);
  const dailyVelocity = alreadySpent / Math.max(1, currentDay);
  const projectedRemainingExpenses = Math.round(dailyVelocity * daysRemaining);
  const projectedMonthEndBalance = Math.max(0, remainingAfterCommitmentsAndSavings - projectedRemainingExpenses);
  const projectedEndOfMonthBalance = projectedMonthEndBalance;

  const commitmentRatio = Math.round(((unpaidBills + outstandingDebtPayments + outstandingObligations) / (salary || 1)) * 100);
  const safeToSpend = flexibleSpendingPool;

  const flexibleAllocations: Record<string, number> = {};
  let allocatedSum = 0;
  const requiredKeys = Object.keys(DEFAULT_FLEXIBLE_ALLOCATIONS);
  for (let i = 0; i < requiredKeys.length; i++) {
    const key = requiredKeys[i];
    const pct = DEFAULT_FLEXIBLE_ALLOCATIONS[key];
    if (i === requiredKeys.length - 1) {
      flexibleAllocations[key] = Math.max(0, flexibleSpendingPool - allocatedSum);
    } else {
      const amt = Math.round(flexibleSpendingPool * (pct / 100));
      flexibleAllocations[key] = amt;
      allocatedSum += amt;
    }
  }

  // 3. Build Category allocations
  const categories: SmartBudgetCategory[] = [];

  const addCategory = (key: CategoryType, allocated: number, spent: number, isFlexible: boolean) => {
    const remaining = allocated - spent;
    const percentage = flexibleSpendingPool > 0 && isFlexible ? Math.round((allocated / flexibleSpendingPool) * 100) : 0;
    let status: 'SAFE' | 'WARNING' | 'HIGH' | 'EXCEEDED' = 'SAFE';
    if (spent > allocated) {
      status = 'EXCEEDED';
    } else if (spent >= allocated * 0.90) {
      status = 'HIGH';
    } else if (spent >= allocated * 0.75) {
      status = 'WARNING';
    }

    categories.push({
      categoryKey: key,
      categoryAr: CATEGORY_NAMES_AR[key],
      allocatedAmount: allocated,
      spentAmount: spent,
      remainingAmount: remaining,
      percentageOfFlexiblePool: percentage,
      status,
    });
  };

  // Add Flexible Categories
  const flexibleKeys: CategoryType[] = [
    'Food & Groceries',
    'Transport & Ride Apps',
    'Health & Education',
    'Family & Allowances',
    'Shopping & Entertainment',
  ];

  for (const key of flexibleKeys) {
    const allocated = flexibleAllocations[key] || 0;
    const spent = context.categorySpending[key] || 0;
    addCategory(key, allocated, spent, true);
  }

  // Add Committed Categories
  const spentDebt = context.categorySpending['Installments & Debt'] || 0;
  addCategory('Installments & Debt', spentDebt + outstandingDebtPayments, spentDebt, false);

  const spentHousing = context.categorySpending['Housing & Utilities'] || 0;
  addCategory('Housing & Utilities', spentHousing + unpaidBills + outstandingObligations, spentHousing, false);

  addCategory('Emergency & Savings', savingsAlreadyAchieved + remainingSavingsTarget, savingsAlreadyAchieved, false);

  // 4. Generate warnings
  if (commitmentRatio > 40) {
    warnings.push(`التزاماتك الشهرية المتبقية بتستهلك ${commitmentRatio}% من مرتبك.`);
  }
  if (savingsFeasibility === 'NOT_FEASIBLE') {
    warnings.push(`هدف التوفير الحالي بنسبة ${savingsTargetPercent}% غير واقعي مع التزاماتك الحالية.`);
  }

  categories.forEach(cat => {
    if (cat.spentAmount > cat.allocatedAmount) {
      warnings.push(`لقد تجاوزت الميزانية المخصصة لفئة ${cat.categoryAr}!`);
    } else if (cat.spentAmount >= cat.allocatedAmount * 0.90) {
      const percent = Math.round((cat.spentAmount / (cat.allocatedAmount || 1)) * 100);
      warnings.push(`مصاريف فئة ${cat.categoryAr} وصلت لـ ${percent}% من الحد المخصص (مرتفع جداً).`);
    } else if (cat.spentAmount >= cat.allocatedAmount * 0.75) {
      const percent = Math.round((cat.spentAmount / (cat.allocatedAmount || 1)) * 100);
      warnings.push(`مصاريف فئة ${cat.categoryAr} وصلت لـ ${percent}% من الحد المخصص.`);
    }
  });

  return {
    monthKey,
    salary,
    alreadySpent,
    unpaidBills,
    outstandingDebtPayments,
    outstandingObligations,
    totalCommittedRemaining,
    availableBeforeSavings,
    savingsTargetAmount: recommendedSavingsTargetAmount,
    savingsAlreadyAchieved,
    remainingSavingsTarget,
    flexibleSpendingPool,
    remainingAfterCommitmentsAndSavings,
    projectedEndOfMonthBalance,
    projectedMonthEndBalance,
    commitmentRatio,
    savingsFeasibility,
    categories,
    warnings,
    safeToSpend,
    requestedSavingsTargetAmount,
    recommendedSavingsTargetAmount,
    aiAdvice: 'بناءً على حساباتنا المخصصة، خطتك متوازنة تماماً هذا الشهر. التزم بتقسيم الإنفاق المرن لتحقيق كامل أهدافك.',
  };
}

export async function enhanceBudgetPlanWithAI(plan: SmartBudgetPlan, customClient?: GoogleGenAI | null): Promise<SmartBudgetPlan> {
  const enhancedPlan = { ...plan };

  try {
    const aiAllocations = await getAIFlexibleAllocations(plan.flexibleSpendingPool, customClient);
    if (aiAllocations) {
      const updatedCategories = plan.categories.map((cat) => {
        const isFlexible = [
          'Food & Groceries',
          'Transport & Ride Apps',
          'Health & Education',
          'Family & Allowances',
          'Shopping & Entertainment',
        ].includes(cat.categoryKey);

        if (isFlexible) {
          const allocated = aiAllocations[cat.categoryKey] || 0;
          const spent = cat.spentAmount;
          const remaining = allocated - spent;
          const percentage = plan.flexibleSpendingPool > 0 ? Math.round((allocated / plan.flexibleSpendingPool) * 100) : 0;
          let status: 'SAFE' | 'WARNING' | 'HIGH' | 'EXCEEDED' = 'SAFE';
          if (spent > allocated) {
            status = 'EXCEEDED';
          } else if (spent >= allocated * 0.90) {
            status = 'HIGH';
          } else if (spent >= allocated * 0.75) {
            status = 'WARNING';
          }

          return {
            ...cat,
            allocatedAmount: allocated,
            remainingAmount: remaining,
            percentageOfFlexiblePool: percentage,
            status,
          };
        }
        return cat;
      });

      enhancedPlan.categories = updatedCategories;

      const warnings: string[] = [];
      if (plan.commitmentRatio > 40) {
        warnings.push(`التزاماتك الشهرية المتبقية بتستهلك ${plan.commitmentRatio}% من مرتبك.`);
      }
      if (plan.savingsFeasibility === 'NOT_FEASIBLE') {
        warnings.push(`هدف التوفير الحالي بنسبة ${plan.requestedSavingsTargetAmount / (plan.salary || 1) * 100}% غير واقعي مع التزاماتك الحالية.`);
      }

      updatedCategories.forEach(cat => {
        if (cat.spentAmount > cat.allocatedAmount) {
          warnings.push(`لقد تجاوزت الميزانية المخصصة لفئة ${cat.categoryAr}!`);
        } else if (cat.spentAmount >= cat.allocatedAmount * 0.90) {
          const percent = Math.round((cat.spentAmount / (cat.allocatedAmount || 1)) * 100);
          warnings.push(`مصاريف فئة ${cat.categoryAr} وصلت لـ ${percent}% من الحد المخصص (مرتفع جداً).`);
        } else if (cat.spentAmount >= cat.allocatedAmount * 0.75) {
          const percent = Math.round((cat.spentAmount / (cat.allocatedAmount || 1)) * 100);
          warnings.push(`مصاريف فئة ${cat.categoryAr} وصلت لـ ${percent}% من الحد المخصص.`);
        }
      });

      enhancedPlan.warnings = warnings;
    }
  } catch (err) {
    console.error('Error enhancing plan with AI allocations:', err);
  }

  try {
    const advice = await generateAICoachAdvice(enhancedPlan, customClient);
    if (advice) {
      enhancedPlan.aiAdvice = advice;
    }
  } catch (err) {
    console.error('Error enhancing plan with AI advice:', err);
  }

  return enhancedPlan;
}

export async function buildSmartBudgetPlan(
  context: TrustedFinancialContext,
  savingsTargetPercent: number,
  customClient?: GoogleGenAI | null
): Promise<SmartBudgetPlan> {
  const plan = await buildDeterministicBudgetPlan(context, savingsTargetPercent);
  try {
    return await enhanceBudgetPlanWithAI(plan, customClient);
  } catch (err) {
    console.error('Failed to enhance budget with AI, returning deterministic fallback:', err);
    return plan;
  }
}

export async function saveSmartBudgetPlan(
  userId: string,
  plan: SmartBudgetPlan,
  savingsTargetPercent: number
): Promise<any> {
  const budgetId = plan.monthKey;
  const monthsAr = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const currentMonthIndex = new Date().getMonth();
  const monthArName = monthsAr[currentMonthIndex];
  const currentYear = new Date().getFullYear();

  function getCategoryColor(cat: string): string {
    switch (cat) {
      case 'Food & Groceries': return '#10B981';
      case 'Housing & Utilities': return '#0EA5E9';
      case 'Transport & Ride Apps': return '#F59E0B';
      case 'Installments & Debt': return '#F43F5E';
      case 'Health & Education': return '#3B82F6';
      case 'Family & Allowances': return '#6366F1';
      case 'Shopping & Entertainment': return '#8B5CF6';
      case 'Emergency & Savings': return '#14B8A6';
      default: return '#6B7280';
    }
  }

  function getCategoryIconName(cat: string): string {
    switch (cat) {
      case 'Food & Groceries': return 'ShoppingBag';
      case 'Housing & Utilities': return 'Home';
      case 'Transport & Ride Apps': return 'Car';
      case 'Installments & Debt': return 'CreditCard';
      case 'Health & Education': return 'HeartPulse';
      case 'Family & Allowances': return 'UserCheck';
      case 'Shopping & Entertainment': return 'Coffee';
      case 'Emergency & Savings': return 'TrendingUp';
      default: return 'ShieldAlert';
    }
  }

  const firestoreBudget = {
    id: budgetId,
    monthKey: budgetId,
    month: monthArName,
    year: currentYear,
    
    // Core snapshot fields
    totalIncome: plan.salary,
    totalSalary: plan.salary,
    salarySnapshot: plan.salary,
    targetSavingsPercent: savingsTargetPercent,
    savingsTargetPercent,
    allocatedSavings: plan.recommendedSavingsTargetAmount,
    requestedSavingsTargetAmount: plan.requestedSavingsTargetAmount,
    recommendedSavingsTargetAmount: plan.recommendedSavingsTargetAmount,
    alreadySpent: plan.alreadySpent,
    unpaidBills: plan.unpaidBills,
    outstandingDebtPayments: plan.outstandingDebtPayments,
    outstandingObligations: plan.outstandingObligations,
    totalCommittedRemaining: plan.totalCommittedRemaining,
    availableBeforeSavings: plan.availableBeforeSavings,
    savingsAlreadyAchieved: plan.savingsAlreadyAchieved,
    remainingSavingsTarget: plan.remainingSavingsTarget,
    flexibleSpendingPool: plan.flexibleSpendingPool,
    remainingAfterCommitmentsAndSavings: plan.remainingAfterCommitmentsAndSavings,
    projectedEndOfMonthBalance: plan.projectedEndOfMonthBalance,
    projectedMonthEndBalance: plan.projectedMonthEndBalance,
    commitmentRatio: plan.commitmentRatio,
    savingsFeasibility: plan.savingsFeasibility,
    warnings: plan.warnings,
    aiAdvice: plan.aiAdvice,
    safeToSpend: plan.safeToSpend,
    
    categories: plan.categories.map((cat) => ({
      category: cat.categoryKey,
      categoryKey: cat.categoryKey,
      categoryAr: cat.categoryAr,
      allocatedAmount: cat.allocatedAmount,
      spentAmount: cat.spentAmount,
      remainingAmount: cat.remainingAmount,
      percentageOfFlexiblePool: cat.percentageOfFlexiblePool,
      status: cat.status,
      color: getCategoryColor(cat.categoryKey),
      icon: getCategoryIconName(cat.categoryKey),
    })),
    
    isStale: false,
    generatedAt: FieldValue.serverTimestamp(),
    lastCalculatedAt: FieldValue.serverTimestamp(),
    autoGenerated: true,
  };

  await db.collection('users').doc(userId).collection('budgets').doc(budgetId).set(firestoreBudget, { merge: true });
  return firestoreBudget;
}
