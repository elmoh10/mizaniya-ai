import { GoogleGenAI, Type } from '@google/genai';
import { DEBT_AGENT_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';
import { ChatHistoryMessage } from '../../types';
import { TrustedFinancialContext } from '../../backend/services/financialContextService';
import { db } from '../../backend/config/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { debtInputSchema } from '../../backend/services/debtService';

export interface InstallmentDebt {
  title: string;
  provider: string; // ValU, B.Tech, CIB Credit Card, etc.
  remainingAmount: number;
  monthlyAmount: number;
  interestRate: number;
}

export interface DebtStrategyPlan {
  success?: boolean;
  errorCode?: string;
  requiresRetry?: boolean;
  snowballOrder?: string[];
  recommendedMonthlyPayment?: number;
  totalInterestSavedEstimated?: number;
  monthsToDebtFree?: number;
  actionStepsAr?: string[];
}

export function isExplicitDebtConfirmation(message: string): boolean {
  const normalized = message.trim().replace(/\s+/g, ' ');
  const confirmationPhrases = [
    'ايوه سجله',
    'أيوه سجله',
    'سجله',
    'سجل الدين',
    'تمام سجله',
    'موافق سجله',
    'سجل ده',
    'ايوه سجل ده',
    'أيوه سجل ده',
  ];
  return confirmationPhrases.some(phrase => normalized.includes(phrase));
}

export function isExplicitDebtRejection(message: string): boolean {
  const normalized = message.trim().replace(/\s+/g, ' ');
  const rejectionPhrases = [
    'لا خلاص',
    'بلاش تسجله',
    'لا متسجلوش',
    'لا متسجلش',
    'بلاش سجل',
    'إلغاء',
    'الغاء',
  ];
  return rejectionPhrases.some(phrase => normalized.includes(phrase));
}

export async function analyzeDebtStrategy(
  ai: GoogleGenAI,
  debts: InstallmentDebt[],
  monthlySurplus: number
): Promise<DebtStrategyPlan> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  const prompt = `
حلل الأقساط والديون التالية وقم بإعداد خطة سداد ذكية في مصر:
• الميزانية الشهرية المتاحة لسداد الديون والزيادات: ${monthlySurplus} ج.م
• قائمة الأقساط والديون:
${JSON.stringify(debts, null, 2)}

[قواعد هامة جداً]:
1. لا تقل أبداً أن طريقة كرة الثلج (Snowball) تقلل الفوائد بالتعريف.
2. كرة الثلج (Snowball) تركز على سداد أصغر الديون والالتزامات أولاً لزيادة الدافع النفسي والاستمرارية.
3. كرة الانهيار الجليدي (Avalanche) تركز على الديون ذات الفائدة الأعلى أولاً، وهي الطريقة التي تقلل التكلفة الإجمالية للفوائد وتوفر المال.
4. إذا كانت هناك ديون تحتوي على نسب فوائد (interestRate > 0)، قم بتوضيح الترتيب لكلتا الطريقتين (كرة الثلج وكرة الانهيار الجليدي) وقارن بينهما بوضوح، مع توضيح أي طريقة توفر فوائد أكثر.
5. يجب أن تتضمن الخطوات (actionStepsAr) مقارنة واضحة وتوصية بناءً على رغبة المستخدم (الدعم النفسي مقابل توفير المال).
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: DEBT_AGENT_PROMPT,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            snowballOrder: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            recommendedMonthlyPayment: { type: Type.NUMBER },
            totalInterestSavedEstimated: { type: Type.NUMBER },
            monthsToDebtFree: { type: Type.NUMBER },
            actionStepsAr: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: [
            'snowballOrder',
            'recommendedMonthlyPayment',
            'totalInterestSavedEstimated',
            'monthsToDebtFree',
            'actionStepsAr',
          ],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      return { success: true, ...parsed };
    }
  } catch (err) {
    console.error('Debt Agent Error:', err);
  }

  return {
    success: false,
    errorCode: 'AI_UNAVAILABLE',
    requiresRetry: true,
  };
}

export async function runDebtAgent(
  ai: GoogleGenAI,
  message: string,
  chatHistory: ChatHistoryMessage[],
  context: TrustedFinancialContext | null,
  userId?: string
): Promise<string> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  // STEP 1: LOAD CANDIDATE & CHECK FOR EXPLICIT DETERMINISTIC BACKEND CONFIRMATION/REJECTION
  if (userId) {
    const convRef = db.collection('users').doc(userId).collection('ai_conversations').doc('debt');
    const convDoc = await convRef.get();
    const pendingCandidate = convDoc.exists ? convDoc.data()?.pendingDebtCandidate : null;

    if (pendingCandidate) {
      if (isExplicitDebtConfirmation(message)) {
        // Atomic consumption via Firestore Transaction to guarantee idempotency and protect from duplicate writes.
        try {
          const txResult = await db.runTransaction(async (transaction) => {
            const freshDoc = await transaction.get(convRef);
            const freshCandidate = freshDoc.exists ? freshDoc.data()?.pendingDebtCandidate : null;
            if (!freshCandidate) {
              return { success: false, reason: 'no_candidate' };
            }

            // Validate using Zod schema to ensure field safety
            const validated = debtInputSchema.parse(freshCandidate);

            const debtsCol = db.collection('users').doc(userId).collection('debts');
            const newDebtRef = debtsCol.doc();

            transaction.set(newDebtRef, {
              ...validated,
              status: 'ACTIVE',
              createdAt: FieldValue.serverTimestamp(),
              updatedAt: FieldValue.serverTimestamp(),
            });

            transaction.update(convRef, {
              pendingDebtCandidate: FieldValue.delete()
            });

            return { success: true, creditorName: validated.creditorName, amount: validated.amountOriginal };
          });

          if (txResult.success) {
            return `تم تسجيل الدين بنجاح! تم تسجيل دين لصالح ${txResult.creditorName} بقيمة ${txResult.amount} ج.م.`;
          } else {
            return 'لا يوجد دين معلق للتسجيل حالياً. يمكنك كتابة تفاصيل الدين الجديد (مثال: عليا 10,000 جنيه دين لصاحبي) وسأقوم بتجهيزه لك.';
          }
        } catch (err: any) {
          console.error('Transaction failed/Validation error:', err);
          return `عذراً، لم نتمكن من تسجيل الدين بسبب خطأ في البيانات: ${err.message || err}`;
        }
      }

      if (isExplicitDebtRejection(message)) {
        await convRef.update({ pendingDebtCandidate: FieldValue.delete() });
        return 'تمام يا فندم، تم إلغاء تسجيل الدين وحذف الطلب المعلق بنجاح.';
      }
    } else {
      // If no candidate exists but user issues confirmation phrases, return graceful deterministic response.
      if (isExplicitDebtConfirmation(message)) {
        return 'لا يوجد دين معلق للتسجيل حالياً. يمكنك كتابة تفاصيل الدين الجديد (مثال: عليا 10,000 جنيه دين لصاحبي) وسأقوم بتجهيزه لك.';
      }
    }
  }

  // STEP 2: CONVERSATIONAL CONTEXT PREPARATION FOR GEMINI
  const installmentsList = (context?.activeInstallments || []).map(i => ({
    title: i.titleAr || i.title,
    provider: i.provider || 'عام',
    remainingAmount: i.remainingAmount,
    monthlyAmount: i.monthlyPayment || 0,
    interestRate: i.interestRate || 0,
  }));

  const debtsList = (context?.debts || []).filter(d => d.status === 'ACTIVE' || d.status === 'active' || d.status === 'OVERDUE' || d.status === 'PAUSED').map(d => ({
    title: `دين لـ ${d.creditorName}`,
    provider: d.type || 'PERSONAL',
    remainingAmount: d.remainingAmount,
    monthlyAmount: d.minimumPayment || 0,
    interestRate: d.interestRate || 0,
  }));

  const obligationsList = (context?.obligations || []).filter((o: any) => o.status === 'ACTIVE' || o.status === 'active').map((o: any) => ({
    name: o.name,
    amount: o.amount,
    category: o.category,
    dueDate: o.dueDate,
  }));

  const contextData = {
    salary: context?.salary || 0,
    monthlySurplus: context?.monthlySurplus || 0,
    installments: installmentsList,
    debts: debtsList,
    obligations: obligationsList,
    totalDebtsCount: installmentsList.length + debtsList.length,
    totalObligationsCount: obligationsList.length,
    monthlyDebtPayments: context?.monthlyDebtPayments || 0,
    monthlyObligations: context?.monthlyObligations || 0,
    debtToIncomeRatio: context?.debtToIncomeRatio || 0,
  };

  const isPlanRequested =
    message.includes('خطة سداد') ||
    message.includes('طريقة سداد') ||
    message.includes('جدول سداد') ||
    message.includes('سداد الديون') ||
    message.includes('خطة الديون') ||
    message.includes('خطط الديون') ||
    message.includes('سداد الأقساط');

  let planResultText = '';
  if (isPlanRequested && context) {
    const combinedDebtsList = [
      ...installmentsList,
      ...debtsList.map(d => ({
        title: d.title,
        provider: d.provider,
        remainingAmount: d.remainingAmount,
        monthlyAmount: d.monthlyAmount,
        interestRate: d.interestRate,
      }))
    ];

    if (combinedDebtsList.length > 0) {
      const plan = await analyzeDebtStrategy(ai, combinedDebtsList, context.monthlySurplus || 0);
      if (plan && plan.success) {
        planResultText = `[أداة تحليل خطة السداد قامت بالحسابات التالية المقترحة]:
- الترتيب المقترح لسداد الديون (طريقة كرة الثلج): ${(plan.snowballOrder || []).join(' ➔ ')}.
- القسط الشهري الإضافي المقترح لسداد أسرع: ${plan.recommendedMonthlyPayment} ج.م.
- إجمالي الفوائد المتوقع توفيرها: ${plan.totalInterestSavedEstimated} ج.م.
- المدة المتوقعة للتخلص تماماً من الديون: ${plan.monthsToDebtFree} شهراً.
- الخطوات المقترحة:
${(plan.actionStepsAr || []).map(step => `  * ${step}`).join('\n')}`;
      }
    } else {
      planResultText = `[لا توجد أي ديون أو أقساط مسجلة حالياً لحساب خطة السداد]`;
    }
  }

  const systemInstruction = `
أنت "وكيل إدارة الأقساط والديون والالتزامات" (Debt Strategy Agent) - الخبير المتخصص في تنظيم وهيكلة سداد الديون والالتزامات في مصر.
تجيب بلهجة مصرية عامية ودودة وبسيطة وعملية جداً.

البيانات المالية الحقيقية والمسجلة للعميل حالياً هي:
${JSON.stringify(contextData, null, 2)}

${planResultText ? `إليك نتائج أداة حساب خطة السداد التي تم توليدها للمستخدم:\n${planResultText}\n` : ''}

[قواعد هامة جداً حول طرق السداد]:
- يجب التفرقة بوضوح بين الديون (outstanding debts) التي تحتوي على مبلغ متبقي (remainingAmount) وقسط أدنى، والالتزامات الشهرية المكررة (monthly obligations) مثل الإيجار والاشتراكات التي تدفع شهرياً وليس لها إجمالي متبقي.
- لا تقل أبداً أن طريقة كرة الثلج (Snowball) تقلل الفوائد بالتعريف. كرة الثلج تركز على الجانب النفسي والتحفيز بسداد أصغر دين أولاً.
- طريقة الانهيار الجليدي (Avalanche) تركز على سداد أعلى فائدة أولاً وهي التي تقلل الفوائد وتوفر المال.
- قارن بين الطريقتين بوضوح تام إذا وجد ديون بها فوائد في قائمة الديون.

[قواعد تصنيف النوايا والرد]:
1. نية إدخال دين جديد (CREATE_CANDIDATE): (مثال: "عليا 10000 جنيه دين لاختي" أو "أنا مديون بـ 5000")
   - استخرج تفاصيل الدين في حقل candidate بالقيم المستخرجة.
   - الرد (answer) يجب أن يكون بصيغة: "تمام، ده دين شخصي بقيمة 10,000 جنيه لصالح أختك ولسه مش مسجل. تحب أسجله؟"

2. نية عرض الديون (VIEW_DEBTS) أو خطة السداد (PAYOFF_PLAN):
   - اعرض الديون المسجلة أو خطة السداد بوضوح تام بناءً على البيانات. اعرض أيضاً الالتزامات الشهرية (obligations) كقسم منفصل لتوضيح الصورة الكاملة للالتزامات والديون.

3. أي نقاش آخر أو متابعة (OTHER).
`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        ...chatHistory.map(h => ({
          role: h.role,
          parts: [{ text: h.text }]
        })),
        {
          role: 'user' as const,
          parts: [{ text: message }]
        }
      ],
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              enum: ['CREATE_CANDIDATE', 'VIEW_DEBTS', 'PAYOFF_PLAN', 'OTHER'],
            },
            candidate: {
              type: Type.OBJECT,
              properties: {
                amountOriginal: { type: Type.NUMBER },
                remainingAmount: { type: Type.NUMBER },
                creditorName: { type: Type.STRING },
                type: { type: Type.STRING, enum: ['PERSONAL', 'BANK', 'CREDIT_CARD', 'INSTALLMENT', 'OTHER'] },
                interestRate: { type: Type.NUMBER },
                minimumPayment: { type: Type.NUMBER },
              },
              required: ['amountOriginal', 'remainingAmount', 'creditorName', 'type', 'interestRate', 'minimumPayment'],
            },
            answer: { type: Type.STRING },
          },
          required: ['intent', 'answer'],
        },
      }
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      const intent = parsed.intent;
      const finalAnswer = parsed.answer || '';

      if (userId && intent === 'CREATE_CANDIDATE' && parsed.candidate) {
        // Validate candidate using Zod before saving to pending state
        try {
          const validatedCandidate = debtInputSchema.parse(parsed.candidate);
          const convRef = db.collection('users').doc(userId).collection('ai_conversations').doc('debt');
          await convRef.set({ pendingDebtCandidate: validatedCandidate }, { merge: true });
        } catch (validationErr: any) {
          console.error('Candidate validation failed before saving to trusted state:', validationErr);
          return `عذراً، البيانات المستخرجة غير صالحة: ${validationErr.errors ? validationErr.errors.map((e: any) => e.message).join('، ') : validationErr.message}. برجاء تحديد تفاصيل الدين بوضوح.`;
        }
      }

      return finalAnswer;
    }
  } catch (err) {
    console.error('runDebtAgent Error:', err);
  }

  return 'عذراً، خدمة وكيل إدارة الديون غير متاحة حالياً.';
}
