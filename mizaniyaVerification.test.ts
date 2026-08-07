import { describe, it, expect, vi } from 'vitest';

// In-Memory Firestore Mock for Repository Testing
const store = new Map<string, any>();

vi.mock('../../src/backend/config/firebaseAdmin', () => {
  const createDocRef = (colPath: string, docId?: string) => {
    const id = docId || `id_${Math.random().toString(36).substring(2, 9)}`;
    const fullPath = `${colPath}/${id}`;

    return {
      id,
      get: async () => ({
        exists: store.has(fullPath),
        data: () => store.get(fullPath),
      }),
      set: async (data: any, opts?: any) => {
        const existing = opts?.merge ? store.get(fullPath) || {} : {};
        store.set(fullPath, { ...existing, ...data });
      },
      update: async (data: any) => {
        const existing = store.get(fullPath) || {};
        store.set(fullPath, { ...existing, ...data });
      },
      delete: async () => {
        store.delete(fullPath);
      },
    };
  };

  const createCollectionRef = (colPath: string) => ({
    doc: (docId?: string) => createDocRef(colPath, docId),
    get: async () => {
      const docs: any[] = [];
      const prefix = `${colPath}/`;
      for (const [key, val] of store.entries()) {
        if (key.startsWith(prefix) && !key.substring(prefix.length).includes('/')) {
          docs.push({
            id: val.id || key.split('/').pop(),
            data: () => val,
          });
        }
      }
      return {
        empty: docs.length === 0,
        docs,
      };
    },
  });

  const mockDb = {
    collection: (colName: string) => ({
      doc: (docId: string) => ({
        collection: (subColName: string) => createCollectionRef(`users/${docId}/${subColName}`),
      }),
    }),
    runTransaction: async (cb: any) => {
      const mockTx = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: any) => ref.set(data),
        update: (ref: any, data: any) => ref.update(data),
      };
      return cb(mockTx);
    },
  };

  return {
    db: mockDb,
    admin: {},
  };
});

import { buildCoachContents } from '../../src/ai/agents/coachAgent';
import { handleAIChat } from '../../src/backend/controllers/aiController';
import {
  aiChatSchema,
  goalCreateSchema,
  billCreateSchema,
  subscriptionCreateSchema,
} from '../../src/backend/validators/schemas';
import {
  GoalRepository,
  BillRepository,
  SubscriptionRepository,
} from '../../src/backend/repositories/budgetAndGoalRepositories';
import { walletRepository } from '../../src/backend/repositories/walletRepository';

describe('1. Valid AI Chat Request Construction', () => {
  it('buildCoachContents formats contents with strictly valid role and parts array', () => {
    const prompt = 'كيف أوزع راتبي 15000 جنيه؟';
    const history = [
      { sender: 'user', text: 'مرحباً' },
      { sender: 'ai', text: 'أهلاً بك في ميزانية AI' },
      { sender: 'invalid', text: null }, // Should be filtered out
    ];

    const contents = buildCoachContents(prompt, history as any);

    expect(Array.isArray(contents)).toBe(true);
    expect(contents.length).toBeGreaterThan(0);

    contents.forEach((item) => {
      expect(item).toHaveProperty('role');
      expect(['user', 'model']).toContain(item.role);
      expect(item).toHaveProperty('parts');
      expect(Array.isArray(item.parts)).toBe(true);
      expect(item.parts.length).toBeGreaterThan(0);

      item.parts.forEach((part: any) => {
        expect(part).toHaveProperty('text');
        expect(typeof part.text).toBe('string');
        expect(part.text.trim().length).toBeGreaterThan(0);
        expect(part.data).toBeUndefined(); // Guarantee no invalid data field
      });
    });

    // Final item must be the current user prompt
    const lastItem = contents[contents.length - 1];
    expect(lastItem.role).toBe('user');
    expect(lastItem.parts[0].text).toContain(prompt);
  });
});

describe('2. Empty AI Prompt Rejection', () => {
  it('rejects empty message in aiChatSchema', () => {
    const emptyResult = aiChatSchema.safeParse({ message: '   ', intent: 'coach_chat' });
    expect(emptyResult.success).toBe(false);

    const missingResult = aiChatSchema.safeParse({ message: '', intent: 'coach_chat' });
    expect(missingResult.success).toBe(false);
  });

  it('handleAIChat responds with 400 when prompt is empty or whitespace', async () => {
    const req: any = {
      body: { message: '   ', intent: 'coach_chat' },
      user: { uid: 'test_user_123' },
    };
    const res: any = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    await handleAIChat(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'المحتوى المدخل غير صالح أو فارغ' })
    );
  });
});

describe('3. Creating Goal, Bill, and Subscription Schemas & Persistence', () => {
  it('validates goal creation schema', () => {
    const goalData = {
      title: 'شراء سيارة جديدة',
      titleAr: 'شراء سيارة جديدة',
      targetAmount: 300000,
      currentAmount: 50000,
      deadline: '2027-12-31',
      category: 'Vehicle',
    };

    const result = goalCreateSchema.safeParse(goalData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('شراء سيارة جديدة');
      expect(result.data.targetAmount).toBe(300000);
    }
  });

  it('validates bill creation schema', () => {
    const billData = {
      title: 'فاتورة الكهرباء',
      titleAr: 'فاتورة الكهرباء',
      biller: 'شركة جنوب القاهرة',
      amount: 650,
      dueDate: '2026-09-01',
      paymentMethod: 'Fawry',
      fawryCode: '984120531',
    };

    const result = billCreateSchema.safeParse(billData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.amount).toBe(650);
      expect(result.data.fawryCode).toBe('984120531');
    }
  });

  it('validates subscription creation schema', () => {
    const subData = {
      name: 'اشتراك شاهد VIP',
      provider: 'Shahid',
      amount: 120,
      currency: 'EGP',
      cycle: 'monthly',
      nextDueDate: '2026-09-15',
      paymentMethod: 'Visa/Mastercard',
    };

    const result = subscriptionCreateSchema.safeParse(subData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('اشتراك شاهد VIP');
      expect(result.data.cycle).toBe('monthly');
    }
  });

  it('creates and saves goal, bill, and subscription via repositories', async () => {
    const userId = 'user_test_create_123';
    const goalRepo = new GoalRepository();
    const billRepo = new BillRepository();
    const subRepo = new SubscriptionRepository();

    const goal = await goalRepo.saveGoal(userId, {
      id: '',
      title: 'ادخار طوارئ',
      targetAmount: 50000,
      currentAmount: 10000,
      category: 'Emergency',
    });
    expect(goal.id).toBeDefined();
    expect(goal.title).toBe('ادخار طوارئ');

    const bill = await billRepo.saveBill(userId, {
      id: '',
      title: 'فاتورة الإنترنت',
      biller: 'WE',
      amount: 400,
      dueDate: '2026-08-30',
      paymentMethod: 'InstaPay',
      isPaid: false,
    });
    expect(bill.id).toBeDefined();
    expect(bill.amount).toBe(400);

    const sub = await subRepo.saveSubscription(userId, {
      id: '',
      name: 'Netflix Premium',
      provider: 'Netflix',
      amount: 250,
      currency: 'EGP',
      cycle: 'monthly',
      nextDueDate: '2026-09-01',
      paymentMethod: 'Visa/Mastercard',
    });
    expect(sub.id).toBeDefined();
    expect(sub.name).toBe('Netflix Premium');
  });
});

describe('4. User Isolation Security Tests', () => {
  it('strictly isolates user data across different user IDs in repositories', async () => {
    const userA = 'user_isolation_A';
    const userB = 'user_isolation_B';

    const goalRepo = new GoalRepository();
    const billRepo = new BillRepository();
    const subRepo = new SubscriptionRepository();

    // Seed data for User A
    await walletRepository.ensureDefaultWallet(userA);
    await goalRepo.saveGoal(userA, { id: '', title: 'هدف A', targetAmount: 1000, currentAmount: 0, category: 'General' });
    await billRepo.saveBill(userA, { id: '', title: 'فاتورة A', biller: 'WE', amount: 100, dueDate: '2026-09-01', paymentMethod: 'InstaPay', isPaid: false });
    await subRepo.saveSubscription(userA, { id: '', name: 'اشتراك A', amount: 50, currency: 'EGP', cycle: 'monthly', nextDueDate: '2026-09-01', paymentMethod: 'Card', provider: 'Test' });

    // Seed data for User B
    await walletRepository.ensureDefaultWallet(userB);
    await goalRepo.saveGoal(userB, { id: '', title: 'هدف B', targetAmount: 2000, currentAmount: 0, category: 'General' });

    // Fetch for User A
    const walletsA = await walletRepository.getWallets(userA);
    const goalsA = await goalRepo.getGoals(userA);
    const billsA = await billRepo.getBills(userA);
    const subsA = await subRepo.getSubscriptions(userA);

    // Fetch for User B
    const goalsB = await goalRepo.getGoals(userB);
    const billsB = await billRepo.getBills(userB);
    const subsB = await subRepo.getSubscriptions(userB);

    // Assertions for User A
    expect(walletsA.length).toBeGreaterThan(0);
    expect(goalsA.some((g) => g.title === 'هدف A')).toBe(true);
    expect(goalsA.some((g) => g.title === 'هدف B')).toBe(false);
    expect(billsA.some((b) => b.title === 'فاتورة A')).toBe(true);
    expect(subsA.some((s) => s.name === 'اشتراك A')).toBe(true);

    // Assertions for User B (No cross-contamination)
    expect(goalsB.some((g) => g.title === 'هدف B')).toBe(true);
    expect(goalsB.some((g) => g.title === 'هدف A')).toBe(false);
    expect(billsB.some((b) => b.title === 'فاتورة A')).toBe(false);
    expect(subsB.some((s) => s.name === 'اشتراك A')).toBe(false);
  });
});
