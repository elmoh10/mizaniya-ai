import { GoogleGenAI } from '@google/genai';
import { askFinancialCoach, ChatMessage } from './agents/coachAgent';
import { generateAIBudget } from './agents/budgetAgent';
import { analyzeDebtStrategy, InstallmentDebt } from './agents/debtAgent';
import { detectTransactionFraud } from './agents/fraudAgent';
import { getSavingsHedgeStrategy } from './agents/savingsAgent';
import { getTrustedFinancialContext } from '../backend/services/financialContextService';

export interface SupervisorRequest {
  userId?: string;
  intent: 'coach_chat' | 'auto_budget' | 'debt_plan' | 'fraud_check' | 'savings_hedge';
  message?: string;
  chatHistory?: ChatMessage[];
  savingsTargetPercent?: number;
  transactionData?: any;
}

export async function routeAgentQuery(req: SupervisorRequest): Promise<any> {
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
          status: 'NEEDS_USER_DATA',
          message: 'برجاء تحديد قيمة الراتب الشهري أولاً في إعدادات ملفك المالي لحساب الميزانية التلقائية.',
          missingField: 'salary',
        };
      }
      return await generateAIBudget(ai, {
        salary,
        savingsTargetPercent: req.savingsTargetPercent || 20,
        familyMembersCount: context?.userProfile?.familyMembersCount || 1,
      });
    }

    case 'debt_plan': {
      const activeInstallments = context?.activeInstallments || [];
      if (activeInstallments.length === 0) {
        return {
          status: 'NEEDS_USER_DATA',
          message: 'لا توجد ديون أو أقساط مسجلة لحساب خطة السداد.',
          missingField: 'debts',
        };
      }

      const debtsForAgent: InstallmentDebt[] = activeInstallments.map((inst) => ({
        title: inst.titleAr || inst.title,
        provider: inst.provider || 'بنك / جهة تمويل',
        remainingAmount: inst.remainingAmount,
        monthlyAmount: inst.monthlyPayment || 0,
        interestRate: inst.interestRate || 0,
      }));

      return await analyzeDebtStrategy(
        ai,
        debtsForAgent,
        context?.monthlySurplus || 0
      );
    }

    case 'fraud_check': {
      const txData = req.transactionData || context?.recentTransactions[0];
      if (!txData) {
        return {
          status: 'NEEDS_USER_DATA',
          message: 'برجاء تزويد بيانات المعاملة بفحص الشبهات.',
          missingField: 'transactionData',
        };
      }
      return await detectTransactionFraud(ai, txData);
    }

    case 'savings_hedge': {
      const surplus = context?.monthlySurplus || 0;
      if (surplus <= 0) {
        return {
          status: 'NEEDS_USER_DATA',
          message: 'برجاء إدخال أو تسجيل الفائض الشهري المتاح للادخار.',
          missingField: 'monthlySurplus',
        };
      }
      return await getSavingsHedgeStrategy(ai, surplus);
    }

    case 'coach_chat':
    default: {
      const primaryBank = context?.userProfile?.primaryBank || null;
      const answer = await askFinancialCoach(
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
      return { answer };
    }
  }
}
