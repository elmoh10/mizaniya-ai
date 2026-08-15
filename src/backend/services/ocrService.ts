import { GoogleGenAI, Type } from '@google/genai';
import { AI_CONFIG } from '../../ai/aiConfig';

export interface ParsedReceiptData {
  success: boolean;
  merchantName?: string;
  totalAmount?: number;
  category?: string;
  items?: { name: string; quantity?: number; unitPrice?: number; price: number }[];
  date?: string;
  subtotal?: number;
  taxAmount?: number;
  discountAmount?: number;
  currency?: string;
  paymentMethod?: string;
  receiptNumber?: string;
  confidenceScore?: number;
  requiresConfirmation?: boolean;
  requiresManualEntry?: boolean;
  errorCode?: string;
  errorDetails?: string;
}

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit

export async function parseReceiptImageWithGemini(
  base64Image: string,
  mimeType: string = 'image/jpeg'
): Promise<ParsedReceiptData> {
  const normalizedMime = (mimeType || 'image/jpeg').toLowerCase().trim();

  // 1. Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(normalizedMime)) {
    return {
      success: false,
      errorCode: 'INVALID_MIME_TYPE',
      requiresManualEntry: true,
      errorDetails: `Unsupported file type '${mimeType}'. Allowed types are: image/jpeg, image/png, image/webp.`,
    };
  }

  // 2. Validate payload presence
  if (!base64Image || typeof base64Image !== 'string' || base64Image.trim().length === 0) {
    return {
      success: false,
      errorCode: 'INVALID_BASE64_PAYLOAD',
      requiresManualEntry: true,
      errorDetails: 'Empty or missing image data payload.',
    };
  }

  // 3. Estimate size (base64 size ~ 4/3 of binary size)
  const cleanBase64 = base64Image.replace(/^data:image\/\w+;base64,/, '').trim();
  const estimatedSizeBytes = Math.ceil((cleanBase64.length * 3) / 4);

  if (estimatedSizeBytes > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      errorCode: 'FILE_TOO_LARGE',
      requiresManualEntry: true,
      errorDetails: `File size (${(estimatedSizeBytes / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed limit of 5MB.`,
    };
  }

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
- المنتجات والمشتريات، ولكل منتج: الاسم، الكمية إن وجدت، سعر الوحدة إن وجد، وإجمالي سعر السطر
- الإجمالي قبل الضريبة/الخصم إن كان ظاهرًا
- قيمة الضريبة إن كانت ظاهرة
- قيمة الخصم إن كانت ظاهرة
- رقم الفاتورة/الإيصال إن كان ظاهرًا
- وسيلة الدفع إن كانت ظاهرة (Cash, InstaPay, Vodafone Cash, Visa/Mastercard, Fawry)
- العملة، والافتراضي EGP إذا كانت الفاتورة مصرية
- تصنيف المعاملة (Food & Groceries, Housing & Utilities, Installments & Debt, Transport & Ride Apps, Shopping & Entertainment, Emergency & Savings)
- نسبة الثقة (من 0 إلى 1)
`;

  try {
    const response = await ai.models.generateContent({
      model: AI_CONFIG.DEFAULT_MODEL,
      contents: {
        parts: [
          { inlineData: { data: cleanBase64, mimeType: normalizedMime } },
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
                  quantity: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER },
                  price: { type: Type.NUMBER },
                },
                required: ['name', 'price'],
              },
            },
            date: { type: Type.STRING },
            subtotal: { type: Type.NUMBER },
            taxAmount: { type: Type.NUMBER },
            discountAmount: { type: Type.NUMBER },
            currency: { type: Type.STRING },
            paymentMethod: { type: Type.STRING },
            receiptNumber: { type: Type.STRING },
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
        subtotal: parsed.subtotal,
        taxAmount: parsed.taxAmount,
        discountAmount: parsed.discountAmount,
        currency: parsed.currency || 'EGP',
        paymentMethod: parsed.paymentMethod,
        receiptNumber: parsed.receiptNumber,
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
