import { GoogleGenAI } from '@google/genai';
import { askFinancialCoach } from './agents/coachAgent';
import { generateAIBudget } from './agents/budgetAgent';
import { analyzeDebtStrategy, InstallmentDebt } from './agents/debtAgent';
import { detectTransactionFraud } from './agents/fraudAgent';
import { getSavingsHedgeStrategy } from './agents/savingsAgent';
import { getTrustedFinancialContext } from '../backend/services/financialContextService';
import { ChatHistoryMessage } from '../types';

export interface SupervisorRequest {
  userId?: string;
  intent: 'coach_chat' | 'auto_budget' | 'debt_plan' | 'fraud_check' | 'savings_hedge';
  message?: string;
  chatHistory?: ChatHistoryMessage[];
  savingsTargetPercent?: number;
  transactionData?: any;
}

export interface SupervisorResult {
  success: boolean;
  answer: string;
  data?: any;
  errorCode?: string;
}

export async function routeAgentQuery(req: SupervisorRequest): Promise<SupervisorResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: apiKey || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const context = req.userId ? await getTrustedFinancialContext(req.userId) : null;

  switch (req.intent) {
    case 'auto_budget': {
      const salary = context?.salary || 0;
      if (!salary || salary <= 0) {
        return {
          success: false,
          errorCode: 'NEEDS_USER_DATA',
          answer: 'برجاء تحديد قيمة الراتب الشهري أولاً في إعدادات ملفك المالي لحساب الميزانية التلقائية.',
        };
      }
      const budgetResult = await generateAIBudget(ai, {
        salary,
        savingsTargetPercent: req.savingsTargetPercent || 20,
        familyMembersCount: context?.userProfile?.familyMembersCount || 1,
      });

      if (!budgetResult.success) {
        return {
          success: false,
          errorCode: budgetResult.errorCode || 'AI_UNAVAILABLE',
          answer: 'خدمة الميزانية التلقائية غير متاحة حالياً، يرجى إعادة المحاولة.',
          data: budgetResult,
        };
      }

      const categoriesText = (budgetResult.categories || [])
        .map((c: any) => `• ${c.name}: ${c.amount} ج.م (${c.percentage}%)`)
        .join('\n');
      const answer = `ميزانيتك الشهرية جاهزة يا فندم! بناءً على مرتبك بقيمة ${budgetResult.totalSalary} ج.م، وزعنا الميزانية كالآتي:
- الادخار المستهدف: ${budgetResult.allocatedSavings} ج.م بنسبة (${req.savingsTargetPercent || 20}%).
- التقسيم المقترح للمصاريف:
${categoriesText}

نصيحة الكوتش:
${budgetResult.aiAdvice}`;

      return {
        success: true,
        answer,
        data: budgetResult,
      };
    }

    case 'debt_plan': {
      const activeInstallments = context?.activeInstallments || [];
      if (activeInstallments.length === 0) {
        return {
          success: false,
          errorCode: 'NEEDS_USER_DATA',
          answer: 'لا توجد ديون أو أقساط مسجلة لحساب خطة السداد.',
        };
      }

      const debtsForAgent: InstallmentDebt[] = activeInstallments.map((inst) => ({
        title: inst.titleAr || inst.title,
        provider: inst.provider || 'بنك / جهة تمويل',
        remainingAmount: inst.remainingAmount,
        monthlyAmount: inst.monthlyPayment || 0,
        interestRate: inst.interestRate || 0,
      }));

      const debtResult = await analyzeDebtStrategy(
        ai,
        debtsForAgent,
        context?.monthlySurplus || 0
      );

      if (!debtResult.success) {
        return {
          success: false,
          errorCode: debtResult.errorCode || 'AI_UNAVAILABLE',
          answer: 'خدمة خطة سداد الديون غير متاحة حالياً، يرجى إعادة المحاولة.',
          data: debtResult,
        };
      }

      const snowballText = (debtResult.snowballOrder || []).join(' ➔ ');
      const stepsText = (debtResult.actionStepsAr || [])
        .map((step: string) => `• ${step}`)
        .join('\n');
      const answer = `أهلاً بك! جهزتلك خطة ذكية للتخلص من الديون في أسرع وقت:
- الترتيب المقترح لسداد الديون (طريقة كرة الثلج): ${snowballText}.
- القسط الشهري الإضافي المقترح لسداد أسرع: ${debtResult.recommendedMonthlyPayment} ج.م.
- إجمالي الفوائد المتوقع توفيرها: ${debtResult.totalInterestSavedEstimated} ج.م.
- المدة المتوقعة للتخلص تماماً من الديون: ${debtResult.monthsToDebtFree} شهراً.

الخطوات الأساسية اللي محتاج تبدأ بيها:
${stepsText}`;

      return {
        success: true,
        answer,
        data: debtResult,
      };
    }

    case 'fraud_check': {
      const txData = req.transactionData || context?.recentTransactions[0];
      if (!txData) {
        return {
          success: false,
          errorCode: 'NEEDS_USER_DATA',
          answer: 'برجاء تزويد بيانات المعاملة لفحص الشبهات.',
        };
      }
      const fraudResult = await detectTransactionFraud(ai, txData);

      if (!fraudResult.success) {
        return {
          success: false,
          errorCode: fraudResult.errorCode || 'AI_UNAVAILABLE',
          answer: 'خدمة فحص الشبهات والخصم المكرر غير متاحة حالياً، يرجى إعادة المحاولة.',
          data: fraudResult,
        };
      }

      const answer = `فحصتلك آخر معاملة للتأكد من وجود أي شبهات أو خصم مكرر، ودي النتيجة:
- مستوى الخطورة/الشبهة: ${fraudResult.riskScore}% (${fraudResult.isSuspicious ? 'عملية مشبوهة أو مكررة' : 'آمنة ولا يوجد شبهة'}).
- السبب بالتفصيل: ${fraudResult.reasonAr}
- التوصية الأمنية: ${fraudResult.recommendationAr}`;

      return {
        success: true,
        answer,
        data: fraudResult,
      };
    }

    case 'savings_hedge': {
      const surplus = context?.monthlySurplus || 0;
      if (surplus <= 0) {
        return {
          success: false,
          errorCode: 'NEEDS_USER_DATA',
          answer: 'برجاء إدخال أو تسجيل الفائض الشهري المتاح للادخار أولاً في إعدادات ملفك المالي.',
        };
      }
      const savingsResult = await getSavingsHedgeStrategy(ai, surplus);

      if (!savingsResult.success) {
        return {
          success: false,
          errorCode: savingsResult.errorCode || 'AI_UNAVAILABLE',
          answer: 'خدمة التحوط والادخار غير متاحة حالياً، يرجى إعادة المحاولة.',
          data: savingsResult,
        };
      }

      const answer = `بناءً على الفائض الشهري المتاح للادخار (${surplus} ج.م)، ده التوزيع المقترح لحماية فلوسك من التضخم:
- الاستثمار في الذهب: بنسبة ${savingsResult.recommendedAllocationGoldPercent}% (يُنصح بشراء حوالي ${savingsResult.goldGramsToBuy} جرام ذهب شهرياً).
- شهادات الادخار البنكية: بنسبة ${savingsResult.recommendedCertificatesPercent}%.
- العائد السنوي المتوقع للتحوط: ${savingsResult.expectedAnnualHedgePercent}%.

نصيحة الاستثمار:
${savingsResult.adviceSummaryAr}`;

      return {
        success: true,
        answer,
        data: savingsResult,
      };
    }

    case 'coach_chat':
    default: {
      const primaryBank = context?.userProfile?.primaryBank || null;
      const coachResult = await askFinancialCoach(
        ai,
        req.message || 'كيف أحمي مرتبِي من زيادة الأسعار في مصر هذا الشهر؟',
        req.chatHistory || [],
        {
          salary: context?.salary || 0,
          totalWalletBalance: context?.totalWalletBalance || 0,
          debtsTotal: context?.debtsTotal || 0,
          bank: primaryBank,
        }
      );

      if (!coachResult.success) {
        return {
          success: false,
          errorCode: coachResult.errorCode || 'AI_UNAVAILABLE',
          answer: coachResult.answer || 'خدمة الذكاء الاصطناعي غير متاحة حالياً، يرجى إعادة المحاولة.',
        };
      }

      return {
        success: true,
        answer: coachResult.answer,
      };
    }
  }
}
