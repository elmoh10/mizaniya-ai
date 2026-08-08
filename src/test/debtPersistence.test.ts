import { vi, describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

// Mock firebase-admin completely before any other imports
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  getApps: vi.fn(() => [{}]),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(),
}));

const mockDeleteField = 'MOCK_DELETE';
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
  FieldValue: {
    serverTimestamp: vi.fn(() => 'MOCK_TIMESTAMP'),
    delete: vi.fn(() => mockDeleteField),
  },
}));

// Use vi.hoisted to declare mocked objects cleanly so they are available in hoisted vi.mock
const {
  mockCollection,
  mockDoc,
  mockAdd,
  mockSet,
  mockUpdate,
  mockGet,
  mockRunTransaction,
  mockTransaction,
} = vi.hoisted(() => {
  const mockAdd = vi.fn().mockResolvedValue({ id: 'mock-debt-id-123' });
  const mockSet = vi.fn();
  const mockUpdate = vi.fn();
  const mockGet = vi.fn();
  const mockCollection = vi.fn().mockReturnThis();
  const mockDoc = vi.fn().mockReturnThis();

  const mockTransaction = {
    get: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  };

  const mockRunTransaction = vi.fn(async (cb) => {
    return cb(mockTransaction);
  });

  return {
    mockCollection,
    mockDoc,
    mockAdd,
    mockSet,
    mockUpdate,
    mockGet,
    mockRunTransaction,
    mockTransaction,
  };
});

vi.mock('../backend/config/firebaseAdmin', () => {
  return {
    db: {
      collection: mockCollection,
      doc: mockDoc,
      add: mockAdd,
      set: mockSet,
      update: mockUpdate,
      get: mockGet,
      runTransaction: mockRunTransaction,
    }
  };
});

// Import the mocked db so we can inspect its mock functions directly inside the test cases
import { db } from '../backend/config/firebaseAdmin';
import { createDebt, debtInputSchema } from '../backend/services/debtService';
import { runDebtAgent, analyzeDebtStrategy } from '../ai/agents/debtAgent';

describe('Safe Debt Persistence and Strategy Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. User declares debt: candidate created, zero Firestore debt writes.
  it('1. should save the validated candidate to trusted state, but create zero debt documents', async () => {
    const mockAi = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            intent: 'CREATE_CANDIDATE',
            candidate: {
              amountOriginal: 10000,
              remainingAmount: 10000,
              creditorName: 'أختي',
              type: 'PERSONAL',
              interestRate: 0,
              minimumPayment: 0,
            },
            answer: 'تمام، ده دين شخصي بقيمة 10,000 جنيه لأختك ولسه مش مسجل. تحب أسجله؟',
          }),
        }),
      },
    } as any;

    // Load candidate document: empty at start
    mockGet.mockResolvedValue({
      exists: false,
    });

    const answer = await runDebtAgent(mockAi, 'عليا 10000 جنيه دين لاختي', [], null, 'test-user-id');

    expect(answer).toContain('تحب أسجله');
    
    // Check that we wrote to the trusted state
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingDebtCandidate: {
          amountOriginal: 10000,
          remainingAmount: 10000,
          creditorName: 'أختي',
          type: 'PERSONAL',
          interestRate: 0,
          minimumPayment: 0,
        },
      }),
      { merge: true }
    );

    // Verify zero debt document creations
    const debtCalls = mockCollection.mock.calls.filter((call: any) => call[0] === 'debts');
    expect(debtCalls.length).toBe(0);
  });

  // 2. User says "ايوه سجله" -> backend detects confirmation without Gemini, exactly one debt created.
  it('2. should detect confirmation deterministically and call transaction to create exactly one debt', async () => {
    const mockAi = {
      models: {
        generateContent: vi.fn(), // Gemini must NOT be called for this branch!
      },
    } as any;

    // Load candidate document: has pending candidate
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        pendingDebtCandidate: {
          amountOriginal: 10000,
          remainingAmount: 10000,
          creditorName: 'أختي',
          type: 'PERSONAL',
          interestRate: 0,
          minimumPayment: 0,
        },
      }),
    });

    // Mock transaction get
    mockTransaction.get.mockResolvedValue({
      exists: true,
      data: () => ({
        pendingDebtCandidate: {
          amountOriginal: 10000,
          remainingAmount: 10000,
          creditorName: 'أختي',
          type: 'PERSONAL',
          interestRate: 0,
          minimumPayment: 0,
        },
      }),
    });

    const answer = await runDebtAgent(mockAi, 'ايوه سجله', [], null, 'test-user-id');

    expect(answer).toContain('تم تسجيل الدين بنجاح');
    expect(mockAi.models.generateContent).not.toHaveBeenCalled();

    // Exactly one set call on transaction (creating the debt)
    expect(mockTransaction.set).toHaveBeenCalledTimes(1);
    expect(mockTransaction.set).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        amountOriginal: 10000,
        remainingAmount: 10000,
        creditorName: 'أختي',
        type: 'PERSONAL',
        interestRate: 0,
        minimumPayment: 0,
        status: 'ACTIVE',
      })
    );

    // Exactly one update call on transaction deleting the pending candidate
    expect(mockTransaction.update).toHaveBeenCalledTimes(1);
    expect(mockTransaction.update).toHaveBeenCalledWith(
      expect.anything(),
      { pendingDebtCandidate: mockDeleteField }
    );
  });

  // 3 & 4. Ambiguous confirmation phrases "تمام" / "ماشي" must NOT persist debt
  it('3 & 4. should not persist debt for ambiguous messages like "تمام" or "ماشي"', async () => {
    const mockAi = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            intent: 'OTHER',
            answer: 'فهمت كلامك، بس تحب أسجل الدين ده فعلاً؟',
          }),
        }),
      },
    } as any;

    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        pendingDebtCandidate: {
          amountOriginal: 10000,
          remainingAmount: 10000,
          creditorName: 'أختي',
          type: 'PERSONAL',
          interestRate: 0,
          minimumPayment: 0,
        },
      }),
    });

    // Send "تمام"
    let answer = await runDebtAgent(mockAi, 'تمام', [], null, 'test-user-id');
    expect(answer).not.toContain('تم تسجيل الدين بنجاح');
    expect(mockTransaction.set).not.toHaveBeenCalled();

    // Send "ماشي"
    answer = await runDebtAgent(mockAi, 'ماشي', [], null, 'test-user-id');
    expect(answer).not.toContain('تم تسجيل الدين بنجاح');
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  // 5. Malformed Gemini candidate -> candidate rejected before Firestore pending-state write.
  it('5. should reject malformed candidate from Gemini before any Firestore pending-state write', async () => {
    const mockAi = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            intent: 'CREATE_CANDIDATE',
            candidate: {
              amountOriginal: -100, // Invalid: negative
              remainingAmount: 100,
              creditorName: 'أ', // Invalid: length < 2
              type: 'PERSONAL',
              interestRate: 0,
              minimumPayment: 0,
            },
            answer: 'تمام هسجل دين بسالب 100 ج.م',
          }),
        }),
      },
    } as any;

    mockGet.mockResolvedValue({
      exists: false,
    });

    const answer = await runDebtAgent(mockAi, 'عليا دين سالب 100 لـ أ', [], null, 'test-user-id');

    expect(answer).toContain('البيانات المستخرجة غير صالحة');
    // Ensure we NEVER wrote to the database
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  // 6. Two concurrent confirmation requests -> exactly one debt document.
  it('6. should use transactions to ensure concurrent confirmation requests result in exactly one debt creation', async () => {
    const mockAi = {
      models: {
        generateContent: vi.fn(),
      },
    } as any;

    // Simulate both concurrent requests finding candidate in their initial db.get call (before entering transaction)
    mockGet.mockResolvedValue({
      exists: true,
      data: () => ({
        pendingDebtCandidate: {
          amountOriginal: 10000,
          remainingAmount: 10000,
          creditorName: 'أختي',
          type: 'PERSONAL',
          interestRate: 0,
          minimumPayment: 0,
        },
      }),
    });

    // In the transaction, the first request gets the candidate, but the second request gets empty (atomic isolation)
    mockTransaction.get.mockResolvedValueOnce({
      exists: true,
      data: () => ({
        pendingDebtCandidate: {
          amountOriginal: 10000,
          remainingAmount: 10000,
          creditorName: 'أختي',
          type: 'PERSONAL',
          interestRate: 0,
          minimumPayment: 0,
        },
      }),
    });

    mockTransaction.get.mockResolvedValueOnce({
      exists: false, // Second transaction reads it after the first transaction deleted it
    });

    // First request
    const answer1 = await runDebtAgent(mockAi, 'ايوه سجله', [], null, 'test-user-id');
    expect(answer1).toContain('تم تسجيل الدين بنجاح');
    expect(mockTransaction.set).toHaveBeenCalledTimes(1);

    // Reset mock transaction call counts for precise testing of the second concurrent call
    mockTransaction.set.mockClear();

    // Second request
    const answer2 = await runDebtAgent(mockAi, 'ايوه سجله', [], null, 'test-user-id');
    expect(answer2).toContain('لا يوجد دين معلق للتسجيل');
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });

  // 7. Legacy Gemini output claiming CONFIRM_CANDIDATE -> cannot cause persistence.
  it('7. should completely ignore legacy Gemini output intents trying to trigger confirmation', async () => {
    const mockAi = {
      models: {
        generateContent: vi.fn().mockResolvedValue({
          text: JSON.stringify({
            intent: 'CONFIRM_CANDIDATE',
            answer: 'مرحباً، تم التسجيل بنجاح في مخيلة النموذج!',
          }),
        }),
      },
    } as any;

    mockGet.mockResolvedValue({
      exists: false,
    });

    // When the message is non-confirming (normal question)
    const answer = await runDebtAgent(mockAi, 'مين أحسن طريقة للسداد؟', [], null, 'test-user-id');

    expect(answer).toContain('التسجيل بنجاح في مخيلة النموذج');
    // Transaction set should never be called
    expect(mockTransaction.set).not.toHaveBeenCalled();
  });
});
