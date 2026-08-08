import { GoogleGenAI } from '@google/genai';
import { askFinancialCoach } from './agents/coachAgent';
import { generateAIBudget, runBudgetAgent } from './agents/budgetAgent';
import { analyzeDebtStrategy, InstallmentDebt, runDebtAgent } from './agents/debtAgent';
import { detectTransactionFraud, runFraudAgent } from './agents/fraudAgent';
import { getSavingsHedgeStrategy, runSavingsAgent } from './agents/savingsAgent';
import { getTrustedFinancialContext } from '../backend/services/financialContextService';
import { ChatHistoryMessage } from '../types';
import { AI_CONFIG } from './aiConfig';

export function detectDataQuery(message: string): boolean {
  const msg = message.toLowerCase();
  
  // Exclude advisory/planning queries first
  if (
    msg.includes('قسملي') || 
    msg.includes('تقسيم') || 
    msg.includes('توزيع') || 
    msg.includes('أوفر') || 
    msg.includes('ادخر') || 
    msg.includes('خطط') || 
    msg.includes('خطة') || 
    msg.includes('نصيحة') || 
    msg.includes('استثمار') || 
    msg.includes('أشتري') || 
    msg.includes('اشتري') ||
    msg.includes('شراء')
  ) {
    return false;
  }

  const keywords = [
    'مرتبي', 'مرتبى', 'بقبض', 'الدخل',
    'مصاريفي', 'مصاريفى', 'صرفت', 'صرفي', 'صرفى', 'إنفاقي', 'إنفاقى', 'المصاريف',
    'المتبقي', 'المتبقى', 'المتبقيه', 'الباقي', 'الباقى', 'باقي', 'باقى', 'معايا كام', 'فاضل كام',
    'رصيد', 'محفظة', 'المحفظة', 'فاتورة', 'فاتوره', 'فواتير', 'قسط', 'أقساط', 'اقساط', 'ديون', 'مستحقات'
  ];

  return keywords.some(kw => msg.includes(kw));
}

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
      const answer = await runBudgetAgent(
        ai,
        req.message || 'اعمل ميزانية',
        req.chatHistory || [],
        context
      );
      return {
        success: true,
        answer,
      };
    }

    case 'debt_plan': {
      const answer = await runDebtAgent(
        ai,
        req.message || 'عايز خطة سداد ديوني',
        req.chatHistory || [],
        context,
        req.userId
      );
      return {
        success: true,
        answer,
      };
    }

    case 'fraud_check': {
      const answer = await runFraudAgent(
        ai,
        req.message || 'افحص العمليات المشبوهة الأخيرة',
        req.chatHistory || [],
        context
      );
      return {
        success: true,
        answer,
      };
    }

    case 'savings_hedge': {
      const answer = await runSavingsAgent(
        ai,
        req.message || 'عايز أوفر فلوس',
        req.chatHistory || [],
        context
      );
      return {
        success: true,
        answer,
      };
    }

    case 'coach_chat':
    default: {
      const isDataQuery = req.message ? detectDataQuery(req.message) : false;

      if (isDataQuery && context) {
        const hasTransactions = context.dataStatus?.transactionsAvailable;
        const currentMonthTxs = context.recentTransactions.filter((tx) => {
          const monthKey = new Date().toISOString().slice(0, 7);
          return (tx.date || '').startsWith(monthKey);
        });

        // Construct normalized context data for Gemini
        const contextDataJson = JSON.stringify({
          monthlyIncome: context.monthlyIncome || 0,
          monthlyExpenses: context.monthlyExpenses || 0,
          monthlyBills: context.monthlyBills || 0,
          monthlyInstallments: context.monthlyInstallments || 0,
          monthlySavings: context.monthlySavings || 0,
          availableBalance: context.availableBalance || 0,
          walletBalances: context.walletBalances || [],
          categorySpending: context.categorySpending || {},
          activeGoals: context.activeGoals || [],
          activeInstallments: context.activeInstallmentsList || [],
          dataStatus: {
            incomeAvailable: context.salary > 0,
            transactionsAvailable: currentMonthTxs.length > 0
          }
        }, null, 2);

        const dataQueryPrompt = `
أنت "كوتش ميزانية AI" مستشارك المالي الذكي. تجيب بلهجة مصرية عامية ودودة وبسيطة وواقعية جداً.
المستخدم يسألك سؤال استعلام مباشر عن أرقامه المالية الحقيقية المسجلة في النظام.

إليك البيانات الحقيقية والنهائية والمحسوبة بالكامل من قاعدة بياناتنا الآمنة لهذا الشهر:
${contextDataJson}

[القوانين الصارمة للرد - التزم بها حرفياً]:
1. ممنوع منعاً باتاً وبشكل قاطع اختراع، تخمين، تقدير أو افتراض أي أرقام أو فئات مصاريف أو فواتير وهمية أو غير موجودة في البيانات أعلاه.
2. استخدم الأرقام المذكورة في البيانات أعلاه حصرياً للرد بدقة على تساؤل المستخدم.
3. بخصوص المصاريف والمعاملات: إذا كانت المعاملات غير متوفرة أو قيمتها صفر (مثلاً transactionsAvailable: false أو المصاريف صفر)، قل للمستخدم بوضوح تام بلهجة مصرية ودودة: "مرتبك المسجل هو ${context.salary} ج.م، لكن لسه معنديش معاملات كفاية أحسب مصاريف الشهر بدقة." واشرح له كيف يضيف معاملاته وفواتيره لتكتمل حساباته. لا تقم بافتراض مصاريف وهمية أو تزييف أي أرقام من عندك!
4. لا تقم أبداً باقتراح خطط تقسيم ميزانية افتراضية (مثل 50/30/20) إذا كان السؤال موجهاً للاستعلام عن البيانات الحالية ("مرتبي كام ومصاريفي كام والمتبقي كام؟"). أجب فقط وبدقة عن البيانات الحقيقية الموجودة.
5. تكلم بالعامية المصرية الودودة والعملية.

السؤال: ${req.message}
`;

        try {
          const response = await ai.models.generateContent({
            model: AI_CONFIG.DEFAULT_MODEL,
            contents: dataQueryPrompt,
          });
          const answerText = response.text ? response.text.trim() : '';
          if (answerText) {
            return {
              success: true,
              answer: answerText,
            };
          }
        } catch (err) {
          console.error('Supervisor Data Query Gemini Error:', err);
        }
      }

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
          ...context, // Pass the entire context!
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
