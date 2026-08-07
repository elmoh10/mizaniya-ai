import { GoogleGenAI, Type } from '@google/genai';

export interface ParsedReceiptData {
  success: boolean;
  merchantName?: string;
  totalAmount?: number;
  category?: string;
  items?: { name: string; price: number }[];
  date?: string;
  confidenceScore?: number;
  requiresConfirmation?: boolean;
  requiresManualEntry?: boolean;
  errorCode?: string;
  errorDetails?: string;
}

export async function parseReceiptImageWithGemini(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<ParsedReceiptData> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return {
      success: false,
      errorCode: 'GEMINI_KEY_MISSING',
      requiresManualEntry: true,
      errorDetails: 'Gemini API key is not configured on the server.',
    };
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });

  const prompt = `
اقرأ فاتورة أو إيصال الشراء المرفق واستخرج البيانات التالية بدقة:
- اسم المحل/التاجر
- المبلغ الإجمالي (جنيه مصري EGP)
- التاريخ
- المنتجات والمشتريات
- تصنيف المعاملة (Food & Groceries, Housing & Utilities, Installments & Debt, Transport & Ride Apps, Shopping & Entertainment, Emergency & Savings)
- نسبة الثقة (من 0 إلى 1)
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchantName: { type: Type.STRING },
            totalAmount: { type: Type.NUMBER },
            category: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                },
                required: ['name', 'price'],
              },
            },
            date: { type: Type.STRING },
            confidenceScore: { type: Type.NUMBER },
          },
          required: ['merchantName', 'totalAmount', 'category', 'date'],
        },
      },
    });

    if (response.text) {
      const parsed = JSON.parse(response.text.trim());
      const confidenceScore = parsed.confidenceScore ?? 0.85;

      return {
        success: true,
        merchantName: parsed.merchantName,
        totalAmount: parsed.totalAmount,
        category: parsed.category,
        items: parsed.items || [],
        date: parsed.date,
        confidenceScore,
        requiresConfirmation: confidenceScore < 0.8,
      };
    }
  } catch (err: any) {
    console.error('OCR Processing Error:', err.message);
    return {
      success: false,
      errorCode: 'OCR_FAILED',
      requiresManualEntry: true,
      errorDetails: err.message,
    };
  }

  return {
    success: false,
    errorCode: 'OCR_EMPTY_RESPONSE',
    requiresManualEntry: true,
  };
}
