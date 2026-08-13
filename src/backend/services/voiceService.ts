import { GoogleGenAI, Type } from '@google/genai';
import { AI_CONFIG } from '../../ai/aiConfig';

export interface VoiceExpenseParseResult {
  success: boolean;
  title?: string;
  titleAr?: string;
  amount?: number;
  category?: string;
  walletName?: string;
  type?: 'expense' | 'income';
  confidenceScore?: number;
  requiresConfirmation?: boolean;
  errorCode?: string;
  errorDetails?: string;
}

export async function parseVoiceCommandExpense(
  spokenText: string
): Promise<VoiceExpenseParseResult> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      errorCode: 'GEMINI_KEY_MISSING',
      requiresConfirmation: true,
      errorDetails: 'Gemini API key missing on server.',
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });

  const prompt = `
المستخدم ينطق جملة بالعامية المصرية لتسجيل مصروف أو دخل: "${spokenText}".
استخرج البيانات التالية بدقة وحولها لهيكل JSON:
- عنوان المعاملة باللغة الإنجليزية والعربية
- القيمة العدديّة للجنيهات المصرية EGP
- الفئة المستهدفة (Food & Groceries, Housing & Utilities, Installments & Debt, Transport & Ride Apps, Shopping & Entertainment, Emergency & Savings)
- اسم المحفظة المستهدفة (InstaPay, CIB, Vodafone Cash, Cash)
- نوع المعاملة (expense أو income)
- درجة الثقة (من 0 إلى 1)
`;

  try {
    const response = await ai.models.generateContent({
      model: AI_CONFIG.DEFAULT_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            titleAr: { type: Type.STRING },
            amount: { type: Type.NUMBER },
            category: { type: Type.STRING },
            walletName: { type: Type.STRING },
            type: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER },
          },
          required: ['title', 'titleAr', 'amount', 'category', 'type'],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      const confidenceScore = parsed.confidenceScore ?? 0.9;

      return {
        success: true,
        title: parsed.title,
        titleAr: parsed.titleAr,
        amount: parsed.amount,
        category: parsed.category,
        walletName: parsed.walletName || 'InstaPay',
        type: parsed.type === 'income' ? 'income' : 'expense',
        confidenceScore,
        requiresConfirmation: confidenceScore < 0.8,
      };
    }
  } catch (err: any) {
    console.error('Voice Expense Parsing Error:', err.message);
    return {
      success: false,
      errorCode: 'VOICE_PARSE_FAILED',
      requiresConfirmation: true,
      errorDetails: err.message,
    };
  }

  return {
    success: false,
    errorCode: 'VOICE_EMPTY_RESPONSE',
    requiresConfirmation: true,
  };
}


export interface AudioTranscriptionResult {
  success: boolean;
  text?: string;
  errorCode?: string;
  errorDetails?: string;
}

export async function transcribeAudioWithGemini(
  base64Audio: string,
  mimeType: string = 'audio/ogg'
): Promise<AudioTranscriptionResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      errorCode: 'GEMINI_KEY_MISSING',
      errorDetails: 'Gemini API key missing on server.',
    };
  }

  const cleanBase64 = String(base64Audio || '').trim();
  if (!cleanBase64) {
    return {
      success: false,
      errorCode: 'EMPTY_AUDIO',
      errorDetails: 'Audio payload is empty.',
    };
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const response = await ai.models.generateContent({
      model: AI_CONFIG.DEFAULT_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              data: cleanBase64,
              mimeType: mimeType || 'audio/ogg',
            },
          },
          {
            text: `حوّل الرسالة الصوتية إلى نص كما قاله المستخدم بدقة. الرسالة غالباً باللهجة المصرية وقد تحتوي على مبلغ مالي أو اسم محفظة أو فاتورة. أرجع النص المنطوق فقط بدون شرح أو علامات اقتباس.`,
          },
        ],
      },
    });

    const text = String(response.text || '').trim();
    if (!text) {
      return {
        success: false,
        errorCode: 'EMPTY_TRANSCRIPTION',
        errorDetails: 'Gemini returned an empty transcription.',
      };
    }

    return { success: true, text };
  } catch (err: any) {
    console.error('Telegram audio transcription error:', err?.message || err);
    return {
      success: false,
      errorCode: 'AUDIO_TRANSCRIPTION_FAILED',
      errorDetails: err?.message || 'Unknown transcription error',
    };
  }
}
