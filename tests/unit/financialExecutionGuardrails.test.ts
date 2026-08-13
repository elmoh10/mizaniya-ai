import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('P0 Atomic Financial Execution Guardrails', () => {
  it('keeps bill and debt payments in a shared atomic execution service', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/services/financialExecutionService.ts'),
      'utf8'
    );

    expect(source).toContain('export async function executeBillPayment');
    expect(source).toContain('export async function executeDebtPayment');
    expect(source.match(/db\.runTransaction/g)?.length || 0).toBeGreaterThanOrEqual(2);
    expect(source).toContain("collection('transactions')");
    expect(source).toContain("collection('wallets')");
    expect(source).toContain("collection('bills')");
    expect(source).toContain("collection('debts')");
    expect(source).toContain('relatedDebtId');
    expect(source).toContain('relatedBillId');
  });

  it('routes API bill and debt payments through the atomic service', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/routes/apiRoutes.ts'),
      'utf8'
    );

    expect(source).toContain('executeBillPayment');
    expect(source).toContain('executeDebtPayment');
    expect(source).toContain("'/bills/:id/pay'");
    expect(source).toContain("'/debts/:id/pay'");
  });

  it('routes Telegram bill and debt confirmations through the atomic service', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/backend/routes/telegramRoutes.ts'),
      'utf8'
    );

    expect(source).toContain('Confirm Bill Payment - Atomic');
    expect(source).toContain('Confirm Debt Payment - Atomic');
    expect(source).toContain('executeBillPayment');
    expect(source).toContain('executeDebtPayment');
    expect(source).toContain('TELEGRAM_WEBHOOK_SECRET');
  });
});
