import { describe, it, expect, vi } from 'vitest';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../../src/backend/middlewares/authMiddleware';
import {
  aiChatSchema,
  walletCreateSchema,
  transactionCreateSchema,
  budgetSetSchema,
  billCreateSchema,
} from '../../src/backend/validators/schemas';

describe('API Auth & Admin Authorization Tests', () => {
  it('rejects unauthenticated requests without authorization header', async () => {
    const req: any = { headers: {} };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    await authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.any(String) }));
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects non-admin users calling admin endpoints', () => {
    const req: any = { user: { uid: 'user_123', role: 'user', admin: false } };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'Access denied. Admin rights required.' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('allows admin users through requireAdmin middleware', () => {
    const req: any = { user: { uid: 'admin_123', role: 'admin', admin: true } };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();

    requireAdmin(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('AI Intent Routing & Validation', () => {
  it('accepts valid AI intents (coach_chat, auto_budget, debt_plan, fraud_check, savings_hedge)', () => {
    const validIntents = ['coach_chat', 'auto_budget', 'debt_plan', 'fraud_check', 'savings_hedge'];

    validIntents.forEach((intent) => {
      const result = aiChatSchema.safeParse({ message: 'Hello AI', intent });
      expect(result.success).toBe(true);
    });
  });

  it('rejects invalid intent strings (e.g. budget_chat, savings_chat, debt_chat)', () => {
    const invalidIntents = ['budget_chat', 'savings_chat', 'debt_chat', 'fraud_chat', 'invalid_intent'];

    invalidIntents.forEach((intent) => {
      const result = aiChatSchema.safeParse({ message: 'Hello AI', intent });
      expect(result.success).toBe(false);
    });
  });

  it('does not accept userContext.salary from client input', () => {
    const result = aiChatSchema.safeParse({
      message: 'Hello AI',
      intent: 'coach_chat',
      userContext: { salary: 50000 },
    });
    // userContext is stripped/ignored or absent from schema
    expect((result as any).data?.userContext).toBeUndefined();
  });
});

describe('Financial Schemas & Validation', () => {
  it('validates budget payload strictly', () => {
    const validBudget = {
      id: '2026-08',
      monthKey: '2026-08',
      month: 'أغسطس',
      year: 2026,
      totalIncome: 25000,
      targetSavingsPercent: 20,
      categories: [
        {
          category: 'Food & Groceries',
          categoryAr: 'الأكل والشرب',
          allocatedAmount: 8000,
          spentAmount: 2000,
          color: '#10B981',
          icon: 'ShoppingBag',
        },
      ],
    };

    const result = budgetSetSchema.safeParse(validBudget);
    expect(result.success).toBe(true);
  });

  it('validates wallet creation schema', () => {
    const validWallet = {
      name: 'Vodafone Cash',
      nameAr: 'فودافون كاش',
      type: 'wallet',
      balance: 1500,
      currency: 'EGP',
    };

    const result = walletCreateSchema.safeParse(validWallet);
    expect(result.success).toBe(true);
  });

  it('validates bill creation and payment status', () => {
    const validBill = {
      title: 'Electricity Bill',
      titleAr: 'فاتورة الكهرباء',
      biller: 'شركة جنوب القاهرة',
      amount: 450,
      dueDate: '2026-08-25',
      paymentMethod: 'Fawry',
    };

    const result = billCreateSchema.safeParse(validBill);
    expect(result.success).toBe(true);
  });
});
