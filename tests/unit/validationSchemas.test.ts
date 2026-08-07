import { describe, it, expect } from 'vitest';
import { aiChatSchema, ocrAnalyzeSchema, voiceCommandSchema, walletCreateSchema, transactionCreateSchema } from '../../src/backend/validators/schemas';

describe('Zod Validation Schemas', () => {
  it('validates aiChatSchema correctly', () => {
    const valid = aiChatSchema.safeParse({ message: 'صرفت 150 جنيه في كارفور' });
    expect(valid.success).toBe(true);

    const invalid = aiChatSchema.safeParse({ message: '' });
    expect(invalid.success).toBe(false);
  });

  it('validates ocrAnalyzeSchema correctly', () => {
    const valid = ocrAnalyzeSchema.safeParse({ base64Image: 'abc123data' });
    expect(valid.success).toBe(true);

    const invalid = ocrAnalyzeSchema.safeParse({ base64Image: '' });
    expect(invalid.success).toBe(false);
  });

  it('validates voiceCommandSchema correctly', () => {
    const valid = voiceCommandSchema.safeParse({ spokenText: 'دفع 200 جنيه بنزين' });
    expect(valid.success).toBe(true);

    const invalid = voiceCommandSchema.safeParse({});
    expect(invalid.success).toBe(false);
  });

  it('validates walletCreateSchema correctly', () => {
    const valid = walletCreateSchema.safeParse({
      name: 'CIB Bank Account',
      type: 'bank',
      balance: 1000,
    });
    expect(valid.success).toBe(true);

    const invalid = walletCreateSchema.safeParse({
      name: 'Test',
      type: 'invalid_type',
    });
    expect(invalid.success).toBe(false);
  });

  it('validates transactionCreateSchema correctly', () => {
    const valid = transactionCreateSchema.safeParse({
      title: 'Groceries',
      amount: 450,
      type: 'expense',
      category: 'Food & Groceries',
      walletId: 'wallet_123',
    });
    expect(valid.success).toBe(true);

    const invalid = transactionCreateSchema.safeParse({
      title: 'Groceries',
      amount: -100, // Negative amount invalid
      type: 'expense',
      category: 'Food & Groceries',
      walletId: 'wallet_123',
    });
    expect(invalid.success).toBe(false);
  });
});
