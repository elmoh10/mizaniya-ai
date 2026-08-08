import { GoogleGenAI } from '@google/genai';
import { EGYPTIAN_FINANCIAL_COACH_PROMPT } from '../prompts';
import { AI_CONFIG } from '../aiConfig';
import { ChatHistoryMessage } from '../../types';

export function redactApiKey(input: string): string {
  if (!input) return '';
  return input.replace(/AIzaSy[A-Za-z0-9_-]{33}/g, '[REDACTED_KEY]');
}

export function extractMessageText(msg: any): string | null {
  if (!msg) return null;
  if (typeof msg.text === 'string' && msg.text.trim().length > 0) {
    return msg.text.trim();
  }
  if (Array.isArray(msg.parts) && msg.parts.length > 0) {
    const firstPart = msg.parts[0];
    if (typeof firstPart === 'string' && firstPart.trim().length > 0) {
      return firstPart.trim();
    }
    if (firstPart && typeof firstPart.text === 'string' && firstPart.text.trim().length > 0) {
      return firstPart.text.trim();
    }
  }
  if (typeof msg.content === 'string' && msg.content.trim().length > 0) {
    return msg.content.trim();
  }
  return null;
}

export function normalizeChatHistory(chatHistory: ChatHistoryMessage[]): ChatHistoryMessage[] {
  if (!Array.isArray(chatHistory)) return [];

  const normalized: ChatHistoryMessage[] = [];

  // 1. Extract, sanitize and merge consecutive roles
  for (const msg of chatHistory) {
    const text = extractMessageText(msg);
    if (!text) continue;

    const role = msg.role === 'model' ? 'model' : 'user';
    if (normalized.length > 0 && normalized[normalized.length - 1].role === role) {
      normalized[normalized.length - 1].text += '\n' + text;
    } else {
      normalized.push({ role, text });
    }
  }

  // 2. Remove leading model messages so history begins with 'user'
  while (normalized.length > 0 && normalized[0].role === 'model') {
    normalized.shift();
  }

  // 3. Limit history to the most recent relevant turns (e.g. 10 messages)
  const MAX_HISTORY_TURNS = 10;
  if (normalized.length > MAX_HISTORY_TURNS) {
    const sliced = normalized.slice(-MAX_HISTORY_TURNS);
    while (sliced.length > 0 && sliced[0].role === 'model') {
      sliced.shift();
    }
    return sliced;
  }

  return normalized;
}

export function buildCoachContents(
  userMessage: string,
  chatHistory: ChatHistoryMessage[] = [],
  contextData?: Record<string, any>
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> {
  const trimmedUserMsg = (userMessage || '').trim();
  if (!trimmedUserMsg) {
    throw new Error('EMPTY_PROMPT');
  }

  let contextPrompt = '';
  if (contextData) {
    const bankText = contextData.bank ? contextData.bank : 'غير محدد (غير متاح البيانات)';
    
    // Build deterministic context payload for grounding
    const contextPayload = {
      monthlyIncome: contextData.monthlyIncome || contextData.salary || 0,
      monthlyExpenses: contextData.monthlyExpenses || 0,
      monthlyBills: contextData.monthlyBills || 0,
      monthlyInstallments: contextData.monthlyInstallments || 0,
      monthlySavings: contextData.monthlySavings || 0,
      availableBalance: contextData.availableBalance || 0,
      walletBalances: contextData.walletBalances || [],
      categorySpending: contextData.categorySpending || {},
      activeGoals: contextData.activeGoals || [],
      activeInstallments: contextData.activeInstallmentsList || contextData.activeInstallments || [],
      dataStatus: contextData.dataStatus || {
        incomeAvailable: (contextData.monthlyIncome || contextData.salary || 0) > 0,
        transactionsAvailable: (contextData.recentTransactions || []).length > 0
      }
    };

    contextPrompt = `
[معلومات مالية حقيقية للمستخدم من الخادم الآمن والبيانات الحقيقية]:
${JSON.stringify(contextPayload, null, 2)}
البنك الأساسي: ${bankText}

[قواعد صارمة جداً لحماية البيانات والمصداقية]:
1. ممنوع تماماً اختراع، أو تخمين، أو افتراض أي رقم يخص (الراتب، المصاريف، الفواتير، الأقساط، المدخرات، أو رصيد المحفظة).
2. يجب دائماً استخدام قيم الأرقام من الكائن المذكور أعلاه حصرياً عند الرد على أسئلة المستخدم الخاصة بحسابه أو أرقامه.
3. إذا كانت المعاملات غير متوفرة أو قيمتها صفر (مثلاً dataStatus.transactionsAvailable كاذبة/false)، قل للمستخدم بوضوح بلهجة مصرية ودودة: "مرتبك المسجل هو \${contextPayload.monthlyIncome} ج.م، لكن لسه معنديش معاملات كفاية أحسب مصاريف الشهر بدقة." واشرح له كيف يضيف معاملاته لتكتمل الحسابات. لا تفترض مبالغ مجهولة أو ميزانية افتراضية من عندك عند سؤالك عن أرقامه الحالية!
4. إذا طلب المستخدم توفير مبلغ معين (مثلاً "عاوز أوفر 2000 جنيه الشهر ده"):
   - انظر للفائض الفعلي المتاح له (availableBalance).
   - حدد هل المبلغ المطلوب واقعي ومتاح ادخاره أم لا بناءً على (monthlyIncome - monthlyExpenses - الألتزامات).
   - احسب الادخار الأسبوعي المطلوب (المبلغ المطلوب / 4) والادخار اليومي المطلوب (المبلغ المطلوب / 30).
   - اقترح تقليص فئات مصاريف محددة تظهر في تفصيل المصاريف المذكور في (categorySpending).
   - ممنوع منعاً باتاً وبشكل قاطع تلقائياً اقتراح أو التوصية بشراء الذهب أو الشهادات أو الاستثمارات أو تخمين عوائد استثمارية، إلا إذا سألك المستخدم صراحةً عن الاستثمار والادخار بالذهب والشهادات!
5. إذا سألك المستخدم "هل أقدر أشتري لابتوب بـ X ج.م؟" أو ما شابه:
   - أجب بناءً على الأرقام الحقيقية المذكورة في رصيد محفظته والالتزامات النشطة.
   - لا تخترع أو تفترض أي مبالغ إضافية.
\n`;
  }

  let finalPrompt = (contextPrompt + trimmedUserMsg).trim();
  if (!finalPrompt) {
    throw new Error('EMPTY_PROMPT');
  }

  // Normalize history
  const normalizedHistory = normalizeChatHistory(chatHistory);

  const sanitizedContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  // If the last message in normalized history is 'user', merge it with finalPrompt
  const mergedHistory = [...normalizedHistory];
  if (mergedHistory.length > 0 && mergedHistory[mergedHistory.length - 1].role === 'user') {
    const lastUserTurn = mergedHistory.pop()!;
    finalPrompt = `${lastUserTurn.text}\n${finalPrompt}`;
  }

  // Push history turns
  for (const turn of mergedHistory) {
    sanitizedContents.push({
      role: turn.role,
      parts: [{ text: turn.text }],
    });
  }

  // Push the final user prompt
  sanitizedContents.push({
    role: 'user',
    parts: [{ text: finalPrompt }],
  });

  return sanitizedContents;
}

export async function askFinancialCoach(
  ai: GoogleGenAI,
  userMessage: string,
  chatHistory: ChatHistoryMessage[] = [],
  contextData?: Record<string, any>
): Promise<{ success: boolean; answer: string; errorCode?: string }> {
  const modelName = AI_CONFIG.DEFAULT_MODEL;

  let contents;
  try {
    contents = buildCoachContents(userMessage, chatHistory, contextData);
  } catch (err: any) {
    if (err.message === 'EMPTY_PROMPT') {
      return {
        success: false,
        errorCode: 'EMPTY_PROMPT',
        answer: 'رسالة السؤال فارغة، يرجى كتابة استفسارك المالي.',
      };
    }
    throw err;
  }

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents,
      config: {
        systemInstruction: EGYPTIAN_FINANCIAL_COACH_PROMPT,
      },
    });

    const replyText = response.text ? response.text.trim() : '';
    if (!replyText) {
      return {
        success: false,
        errorCode: 'AI_UNAVAILABLE',
        answer: 'خدمة الذكاء الاصطناعي غير متاحة حالياً، يرجى إعادة المحاولة لاحقاً.',
      };
    }

    return {
      success: true,
      answer: replyText,
    };
  } catch (err: any) {
    const safeErrorMsg = redactApiKey(err?.message || 'Unknown Gemini error');
    console.error('Coach Agent Gemini Error Details:', {
      model: modelName,
      status: err?.status || err?.statusCode || 'Unknown',
      errorCode: err?.code || err?.status || 'Unknown',
      requestId: err?.requestId || 'Unknown',
      message: safeErrorMsg,
    });
    return {
      success: false,
      errorCode: 'AI_UNAVAILABLE',
      answer: 'خدمة الذكاء الاصطناعي غير متاحة حالياً، يرجى إعادة المحاولة لاحقاً.',
    };
  }
}

