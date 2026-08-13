import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { analyzeDebtStrategy } from '../../src/ai/agents/debtAgent';
import { getSavingsHedgeStrategy } from '../../src/ai/agents/savingsAgent';
import { generateAIBudget } from '../../src/ai/agents/budgetAgent';
import { detectTransactionFraud } from '../../src/ai/agents/fraudAgent';
import { rateLimiter } from '../../src/backend/middlewares/rateLimiter';
import { idempotencyMiddleware } from '../../src/backend/middlewares/idempotencyMiddleware';
import { routeAgentQuery } from '../../src/ai/supervisor';

describe('P0 Pre-Staging Hardening - Firestore Rules Security Audit', () => {
  it('verifies that firestore.rules explicitly denies direct client writes for financial subcollections', () => {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    const financialCollections = [
      'wallets',
      'transactions',
      'budgets',
      'goals',
      'bills',
      'installments',
    ];

    financialCollections.forEach((col) => {
      const matchPattern = new RegExp(`match /${col}/\\{[^}]+\\}\\s*\\{[^}]*allow write: if false;`, 's');
      expect(rulesContent).toMatch(matchPattern);
    });
  });

  it('verifies that profile document deletion is denied in firestore.rules', () => {
    const rulesPath = path.join(process.cwd(), 'firestore.rules');
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    expect(rulesContent).toContain('allow delete: if false;');
  });
});

describe('P0 Hardening - AI Agents Error Resilience (No Fabricated Fallbacks)', () => {
  const failingAiMock: any = {
    models: {
      generateContent: vi.fn().mockRejectedValue(new Error('Gemini API quota exceeded')),
    },
  };

  it('debtAgent returns AI_UNAVAILABLE error without fabricated interest/months on AI failure', async () => {
    const result = await analyzeDebtStrategy(failingAiMock, [{
      title: 'ValU Installment',
      provider: 'ValU',
      remainingAmount: 5000,
      monthlyAmount: 500,
      interestRate: 0.15,
    }], 1000);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('AI_UNAVAILABLE');
    expect(result.requiresRetry).toBe(true);
    expect((result as any).totalInterestSavedEstimated).toBeUndefined();
    expect((result as any).monthsToDebtFree).toBeUndefined();
  });

  it('savingsAgent returns AI_UNAVAILABLE error without fake 60/40 or 28% return on AI failure', async () => {
    const result = await getSavingsHedgeStrategy(failingAiMock, 2000, 3850);

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('AI_UNAVAILABLE');
    expect(result.requiresRetry).toBe(true);
    expect((result as any).recommendedAllocationGoldPercent).toBeUndefined();
    expect((result as any).expectedAnnualHedgePercent).toBeUndefined();
  });

  it('budgetAgent returns AI_UNAVAILABLE error on AI failure', async () => {
    const result = await generateAIBudget(failingAiMock, { salary: 15000, savingsTargetPercent: 20 });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('AI_UNAVAILABLE');
    expect(result.requiresRetry).toBe(true);
  });

  it('fraudAgent returns AI_UNAVAILABLE error on AI failure', async () => {
    const result = await detectTransactionFraud(failingAiMock, {
      amount: 1000,
      merchant: 'Jumia',
      category: 'Shopping',
      time: '12:00',
      walletType: 'Credit Card',
      avgCategorySpend: 200,
    });

    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('AI_UNAVAILABLE');
    expect(result.requiresRetry).toBe(true);
  });
});

describe('P0 Hardening - Redis & Rate Limiter / Idempotency Failures in Production', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('rateLimiter returns 503 SERVICE_UNAVAILABLE when Redis is missing in production', async () => {
    const middleware = rateLimiter(60, 60000, 'api');
    const req: any = { ip: '127.0.0.1', header: () => null };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'SERVICE_UNAVAILABLE',
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('idempotencyMiddleware returns 503 SERVICE_UNAVAILABLE when Redis is missing in production and header is set', async () => {
    const req: any = {
      header: (name: string) => (name.toLowerCase() === 'idempotency-key' ? 'test-key-123' : null),
      path: '/api/v1/transactions',
      user: { uid: 'user_prod_1' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    const next = vi.fn();

    await idempotencyMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'SERVICE_UNAVAILABLE',
    }));
    expect(next).not.toHaveBeenCalled();
  });
});


describe('P0 Hardening - Telegram Webhook Security Guardrails', () => {
  it('requires a Telegram webhook secret and verifies the Telegram secret header', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/routes/telegramRoutes.ts'),
      'utf8'
    );

    expect(source).toContain("const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'");
    expect(source).toContain('TELEGRAM_WEBHOOK_SECRET');
    expect(source).toContain('timingSafeEqual');
    expect(source).toContain('verifyTelegramWebhookRequest(req, res)');
    expect(source).toContain('secret_token:');
  });

  it('protects Telegram setup and info endpoints with Firebase admin authentication', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/routes/telegramRoutes.ts'),
      'utf8'
    );

    expect(source).toMatch(
      /router\.post\s*\(\s*['"]\/setup['"]\s*,\s*authMiddleware as any\s*,\s*requireAdmin as any/
    );

    expect(source).toMatch(
      /router\.get\s*\(\s*['"]\/info['"]\s*,\s*authMiddleware as any\s*,\s*requireAdmin as any/
    );
  });

  it('requires Telegram security configuration in production environment validation', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/config/env.ts'),
      'utf8'
    );

    expect(source).toContain("'TELEGRAM_BOT_TOKEN'");
    expect(source).toContain("'TELEGRAM_WEBHOOK_SECRET'");
  });

  it('does not log the full raw Telegram update payload', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/routes/telegramRoutes.ts'),
      'utf8'
    );

    expect(source).not.toContain("JSON.stringify(update)");
    expect(source).toContain("updateType:");
  });
});

describe('P0 Hardening - Telegram Webhook Security Guardrails', () => {
  it('requires a Telegram webhook secret and verifies the Telegram secret header', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/routes/telegramRoutes.ts'),
      'utf8'
    );

    expect(source).toContain("const TELEGRAM_SECRET_HEADER = 'x-telegram-bot-api-secret-token'");
    expect(source).toContain('TELEGRAM_WEBHOOK_SECRET');
    expect(source).toContain('timingSafeEqual');
    expect(source).toContain('verifyTelegramWebhookRequest(req, res)');
    expect(source).toContain('secret_token:');
  });

  it('protects Telegram setup and info endpoints with Firebase admin authentication', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/routes/telegramRoutes.ts'),
      'utf8'
    );

    expect(source).toMatch(
      /router\.post\s*\(\s*['"]\/setup['"]\s*,\s*authMiddleware as any\s*,\s*requireAdmin as any/
    );

    expect(source).toMatch(
      /router\.get\s*\(\s*['"]\/info['"]\s*,\s*authMiddleware as any\s*,\s*requireAdmin as any/
    );
  });

  it('requires Telegram security configuration in production environment validation', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/config/env.ts'),
      'utf8'
    );

    expect(source).toContain("'TELEGRAM_BOT_TOKEN'");
    expect(source).toContain("'TELEGRAM_WEBHOOK_SECRET'");
  });

  it('does not log the full raw Telegram update payload', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/routes/telegramRoutes.ts'),
      'utf8'
    );

    expect(source).not.toContain('JSON.stringify(update)');
    expect(source).toContain('updateType:');
  });
});
