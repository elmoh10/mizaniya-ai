import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

import {
  walletCreateSchema,
  profileOnboardingSchema,
  profileUpdateSchema,
  transactionCreateSchema,
} from '../../src/backend/validators/schemas';

describe('Wallet and Profile Unit Tests', () => {
  // ============================================================
  // Default Wallet & Onboarding Validation
  // ============================================================

  describe('Default Wallet & Onboarding Validation', () => {
    it('validates onboarding payload and default values', () => {
      const input = {
        displayName: 'هشام محمد',
        salary: 25000,
        currency: 'EGP',
        language: 'ar',
      };

      const result = profileOnboardingSchema.safeParse(input);

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.displayName).toBe('هشام محمد');
        expect(result.data.salary).toBe(25000);
        expect(result.data.currency).toBe('EGP');
        expect(result.data.language).toBe('ar');
      }
    });

    it('validates default wallet schema parameters (name: "كاش", type: "cash", currency: "EGP", balance: 0)', () => {
      const defaultWalletPayload = {
        name: 'كاش',
        nameAr: 'كاش',
        type: 'cash',
        currency: 'EGP',
        balance: 0,
      };

      const result = walletCreateSchema.safeParse(
        defaultWalletPayload
      );

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.name).toBe('كاش');
        expect(result.data.type).toBe('cash');
        expect(result.data.currency).toBe('EGP');
        expect(result.data.balance).toBe(0);
      }
    });

    it('supports wallet creation for types: cash, bank, card, savings', () => {
      const walletTypes = [
        'cash',
        'bank',
        'card',
        'savings',
      ] as const;

      walletTypes.forEach((type) => {
        const payload = {
          name: `محفظة ${type}`,
          type,
          currency: 'EGP',
          balance: 1000,
        };

        const result = walletCreateSchema.safeParse(
          payload
        );

        expect(result.success).toBe(true);
      });
    });
  });

  // ============================================================
  // Transaction Validation with Wallet ID
  // ============================================================

  describe('Transaction Validation with Wallet ID', () => {
    it('requires walletId when creating a transaction', () => {
      const invalidTx = {
        title: 'شراء مشتريات',
        amount: 350,
        currency: 'EGP',
        type: 'expense',
        category: 'Food & Groceries',
        paymentMethod: 'Cash',
        date: '2026-08-07',
      };

      const result = transactionCreateSchema.safeParse(
        invalidTx
      );

      expect(result.success).toBe(false);

      if (!result.success) {
        const hasWalletError =
          result.error.issues.some((issue) =>
            issue.path.includes('walletId')
          );

        expect(hasWalletError).toBe(true);
      }
    });

    it('accepts transaction when valid walletId is supplied', () => {
      const validTx = {
        title: 'شراء مشتريات كازيون',
        amount: 350,
        currency: 'EGP',
        type: 'expense',
        category: 'Food & Groceries',
        walletId: 'default_cash_wallet',
        paymentMethod: 'Cash',
        date: '2026-08-07',
      };

      const result = transactionCreateSchema.safeParse(
        validTx
      );

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.walletId).toBe(
          'default_cash_wallet'
        );

        expect(result.data.amount).toBe(350);
      }
    });
  });

  // ============================================================
  // Profile Update Validation
  // ============================================================

  describe('Profile Update Validation', () => {
    it('validates editable profile fields', () => {
      const updatePayload = {
        displayName: 'هشام علي',
        salary: 30000,
        currency: 'USD',
        language: 'en',
      };

      const result = profileUpdateSchema.safeParse(
        updatePayload
      );

      expect(result.success).toBe(true);

      if (result.success) {
        expect(result.data.displayName).toBe(
          'هشام علي'
        );

        expect(result.data.salary).toBe(30000);

        expect(result.data.currency).toBe(
          'USD'
        );

        expect(result.data.language).toBe(
          'en'
        );
      }
    });
  });

  // ============================================================
  // Default Wallet Implementation Guardrails
  // ============================================================

  describe('Default Wallet Implementation Guardrails', () => {
    it('uses a deterministic default wallet id inside a Firestore transaction', () => {
      const source = fs.readFileSync(
        path.join(
          process.cwd(),
          'src/backend/repositories/walletRepository.ts'
        ),
        'utf8'
      );

      expect(source).toContain(
        "const defaultWalletId = 'default_cash_wallet'"
      );

      expect(source).toContain(
        'db.runTransaction'
      );

      expect(source).toContain(
        "name: 'كاش'"
      );

      expect(source).toContain(
        "type: 'cash'"
      );

      expect(source).toContain(
        "currency: 'EGP'"
      );
    });

    it('ensures the default wallet from onboarding and zero-wallet listing paths', () => {
      const routes = fs.readFileSync(
        path.join(
          process.cwd(),
          'src/backend/routes/apiRoutes.ts'
        ),
        'utf8'
      );

      // --------------------------------------------------------
      // Detect ensureDefaultWalletForUser(userId)
      //
      // Supports:
      //
      // ensureDefaultWalletForUser(userId)
      //
      // AND:
      //
      // ensureDefaultWalletForUser(
      //   userId
      // )
      // --------------------------------------------------------

      const calls =
        routes.match(
          /ensureDefaultWalletForUser\s*\(\s*userId\s*\)/g
        ) || [];

      expect(
        calls.length
      ).toBeGreaterThanOrEqual(2);

      // --------------------------------------------------------
      // Ensure onboarding route exists
      // Supports single/double quotes and whitespace/newlines
      // --------------------------------------------------------

      expect(routes).toMatch(
        /router\.post\s*\(\s*['"]\/profile\/onboarding['"]/
      );

      // --------------------------------------------------------
      // Ensure wallets listing route exists
      // --------------------------------------------------------

      expect(routes).toMatch(
        /router\.get\s*\(\s*['"]\/wallets['"]/
      );
    });
  });
});
