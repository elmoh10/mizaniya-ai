import { describe, it, expect } from 'vitest';
import { parseReceiptImageWithGemini } from '../../src/backend/services/ocrService';
import { parseVoiceCommandExpense } from '../../src/backend/services/voiceService';

describe('OCR & Voice Services Fallback Behavior', () => {
  it('returns structured error when Gemini API key is missing for OCR', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await parseReceiptImageWithGemini('fakebase64string');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('GEMINI_KEY_MISSING');
    expect(result.requiresManualEntry).toBe(true);

    process.env.GEMINI_API_KEY = originalKey;
  });

  it('returns structured error when Gemini API key is missing for Voice', async () => {
    const originalKey = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;

    const result = await parseVoiceCommandExpense('صرفت 200 جنيه كارفور');

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('GEMINI_KEY_MISSING');
    expect(result.requiresConfirmation).toBe(true);

    process.env.GEMINI_API_KEY = originalKey;
  });
});
