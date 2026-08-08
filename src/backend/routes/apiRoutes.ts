import { Router } from 'express';
import {
  handleAIChat,
  handleAnalyzeReceipt,
  handleParseVoiceCommand,
} from '../controllers/aiController';
import { authMiddleware, requireAdmin, AuthenticatedRequest } from '../middlewares/authMiddleware';
import { rateLimiter } from '../middlewares/rateLimiter';
import { idempotencyMiddleware } from '../middlewares/idempotencyMiddleware';
import { getWalletsForUser, createWalletForUser, ensureDefaultWalletForUser } from '../services/walletService';
import { transactionRepository } from '../repositories/transactionRepository';
import { budgetRepository, goalRepository, billRepository, subscriptionRepository } from '../repositories/budgetAndGoalRepositories';
import { installmentRepository } from '../repositories/installmentRepository';
import { profileRepository } from '../repositories/profileRepository';
import { getTrustedFinancialContext } from '../services/financialContextService';
import {
  walletCreateSchema,
  transactionCreateSchema,
  budgetSetSchema,
  goalCreateSchema,
  billCreateSchema,
  subscriptionCreateSchema,
  installmentCreateSchema,
  profileOnboardingSchema,
  profileUpdateSchema,
  systemConfigSchema,
} from '../validators/schemas';
import { routeAgentQuery } from '../../ai/supervisor';
import { db } from '../config/firebaseAdmin';

const router = Router();

// Apply auth middleware and rate limiting
router.use(authMiddleware as any);
router.use(rateLimiter(100, 60000));

// Profile & Onboarding Routes
router.post('/profile/onboarding', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const userEmail = req.user!.email || '';
    const parseResult = profileOnboardingSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid onboarding payload', details: parseResult.error.format() });
    }

    const profile = await profileRepository.createProfileOnboarding(userId, userEmail, parseResult.data);
    const defaultWallet = await ensureDefaultWalletForUser(userId);
    res.status(201).json({ success: true, profile, defaultWallet });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to complete profile onboarding', details: err.message });
  }
});

router.get('/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const profile = await profileRepository.getProfile(userId);
    res.json({ success: true, profile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch user profile', details: err.message });
  }
});

router.patch('/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const parseResult = profileUpdateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid profile update payload', details: parseResult.error.format() });
    }

    const updatedProfile = await profileRepository.updateProfile(userId, parseResult.data);
    res.json({ success: true, profile: updatedProfile });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update user profile', details: err.message });
  }
});

router.delete('/profile', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    await profileRepository.deleteProfileAndAllUserData(userId);
    res.json({ success: true, message: 'User profile and all associated data deleted cleanly.' });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete user profile', details: err.message });
  }
});

// AI Routes
router.post('/ai/chat', handleAIChat as any);
router.post('/ai/analyze-receipt', handleAnalyzeReceipt as any);
router.post('/ai/parse-voice', handleParseVoiceCommand as any);

router.post('/ai/generate-budget', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const { savingsTargetPercent } = req.body;

    const context = await getTrustedFinancialContext(userId);
    if (!context.salary || context.salary <= 0) {
      return res.status(200).json({
        success: false,
        status: 'NEEDS_USER_DATA',
        code: 'NEEDS_USER_DATA',
        message: 'برجاء تحديد الراتب الشهري أولاً في إعدادات ملفك المالي لحساب الميزانية التلقائية.',
        missingField: 'salary',
      });
    }

    const result = await routeAgentQuery({
      userId,
      intent: 'auto_budget',
      savingsTargetPercent,
    });

    const budgetData = result.success ? result.data : null;

    if (budgetData && budgetData.categories) {
      // Aggregate real current month spent totals from Firestore transactions
      const userTransactions = await transactionRepository.getTransactions(userId, 200);
      const currentMonthPrefix = new Date().toISOString().slice(0, 7);
      const categorySpentMap: Record<string, number> = {};

      userTransactions.forEach((tx) => {
        if (tx.type === 'expense' && tx.date.startsWith(currentMonthPrefix)) {
          categorySpentMap[tx.category] = (categorySpentMap[tx.category] || 0) + tx.amount;
        }
      });

      budgetData.categories = budgetData.categories.map((cat: any) => ({
        ...cat,
        spentAmount: categorySpentMap[cat.category] || categorySpentMap[cat.name] || 0,
      }));
    }

    res.json({ success: result.success, data: budgetData || result });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to generate budget', details: err.message });
  }
});

// Financial Health Score Route (Calculated from Real Firestore Data)
router.get('/financial-health', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const context = await getTrustedFinancialContext(userId);

    if (context.salary <= 0 && context.recentTransactions.length === 0 && context.wallets.length === 0) {
      return res.json({
        success: true,
        status: 'INSUFFICIENT_DATA',
        score: null,
      });
    }

    const salary = context.salary;
    const currentMonthPrefix = new Date().toISOString().slice(0, 7);
    const currentMonthExpenses = context.recentTransactions
      .filter((tx) => tx.type === 'expense' && (tx.date || '').startsWith(currentMonthPrefix))
      .reduce((acc, tx) => acc + (tx.amount || 0), 0);

    const incomeStabilityScore = context.historicalIncomeStability.calculatedScore;

    const totalMonthlyObligations = context.monthlyInstallmentObligation + context.unpaidBillsTotal;
    const savingsRateScore = salary > 0
      ? Math.max(0, Math.min(100, Math.round(((salary - currentMonthExpenses - totalMonthlyObligations) / salary) * 100 * 2)))
      : 50;

    const debtRatioScore = salary > 0
      ? Math.max(0, Math.min(100, 100 - Math.round((context.monthlyInstallmentObligation / salary) * 100)))
      : 50;

    const budgetDisciplineScore = context.currentBudget
      ? Math.min(100, Math.max(30, 100 - Math.round((currentMonthExpenses / (context.currentBudget.totalIncome || salary || 1)) * 50)))
      : 60;

    const emergencyFundScore = Math.min(
      100,
      Math.round((context.totalWalletBalance / ((currentMonthExpenses || salary / 2 || 1) * 3)) * 100)
    );

    const overallScore = Math.round(
      (incomeStabilityScore + savingsRateScore + debtRatioScore + budgetDisciplineScore + emergencyFundScore) / 5
    );

    const recommendations: string[] = [];
    if (savingsRateScore < 70) {
      recommendations.push('قم بزيادة تحويلات الادخار في بداية الشهر للحفاظ على نسبة الادخار.');
    }
    if (emergencyFundScore < 60) {
      recommendations.push('خصّص نسبة من الفائض الشهري لبناء صندوق طوارئ يغطي 3 أشهر على الأقل.');
    }
    if (debtRatioScore < 70) {
      recommendations.push('استخدم استراتيجية سداد الأقساط ذات الفائدة الأعلى لخفض التزاماتك الشهريّة.');
    }
    if (recommendations.length === 0) {
      recommendations.push('وضعك المالي متزن وممتاز! واصل الالتزام بالخطة الحالية.');
    }

    res.json({
      success: true,
      status: 'CALCULATED',
      score: {
        overallScore,
        savingsRateScore,
        debtRatioScore,
        budgetDisciplineScore,
        emergencyFundScore,
        incomeStabilityScore,
        recommendations,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to calculate financial health score', details: err.message });
  }
});

// Wallet Routes
router.get('/wallets', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    let wallets = await getWalletsForUser(userId);
    if (wallets.length === 0) {
      const defaultWallet = await ensureDefaultWalletForUser(userId);
      wallets = [defaultWallet];
    }
    res.json({ success: true, wallets });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch wallets', details: err.message });
  }
});

router.post('/wallets', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const parseResult = walletCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid wallet data', details: parseResult.error.format() });
    }

    const wallet = await createWalletForUser(userId, parseResult.data);
    res.status(201).json({ success: true, wallet });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to create wallet', details: err.message });
  }
});

router.post('/wallets/sync-instapay', async (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    status: 'COMING_SOON',
    message: 'خدمة ربط إنستا باي المباشرة تحت التطوير التجريبي قريباً فور اعتماد تراخيص البنك المركزي. يمكنك تسجيل معاملاتك عبر إدخال الصوت أو مسح الفواتير.',
    syncedAt: new Date().toISOString(),
    count: 0,
  });
});

// Installments & Debt Routes
router.get('/installments', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const installments = await installmentRepository.getInstallments(userId);
    res.json({ success: true, installments });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch installments', details: err.message });
  }
});

router.post('/installments', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const parseResult = installmentCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid installment payload', details: parseResult.error.format() });
    }

    const installment = await installmentRepository.saveInstallment(userId, parseResult.data as any);
    res.status(201).json({ success: true, installment });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save installment', details: err.message });
  }
});

router.delete('/installments/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const success = await installmentRepository.deleteInstallment(userId, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Installment not found' });
    }
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete installment', details: err.message });
  }
});

// Transaction Routes
router.get('/transactions', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const transactions = await transactionRepository.getTransactions(userId);
    res.json({ success: true, transactions });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch transactions', details: err.message });
  }
});

router.post('/transactions', idempotencyMiddleware as any, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const parseResult = transactionCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      const walletIssue = parseResult.error.issues.find((issue) => issue.path.includes('walletId'));
      if (walletIssue) {
        return res.status(400).json({
          error: 'يرجى اختيار محفظة معتمدة أو إنشاء محفظة أولاً من قسم المحافظ.',
          details: parseResult.error.format(),
        });
      }
      return res.status(400).json({
        error: 'بيانات المعاملة غير مكتملة أو غير صالحة. يرجى التأكد من المبالغ والتفاصيل.',
        details: parseResult.error.format(),
      });
    }

    const transaction = await transactionRepository.createTransaction(userId, parseResult.data);
    res.status(201).json({ success: true, transaction });
  } catch (err: any) {
    const errMsg = err.message || '';
    if (errMsg.includes('not found') || errMsg.includes('Source wallet')) {
      return res.status(400).json({
        error: 'المحفظة المحددة غير موجودة، يرجى التأكد من اختيار محفظة صحيحة أو إضافة محفظة جديدة من قسم المحافظ.',
        details: err.message,
      });
    }
    res.status(500).json({ error: 'فشل في تسجيل المعاملة على الخادم', details: err.message });
  }
});

router.delete('/transactions/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const txId = req.params.id;
    const success = await transactionRepository.deleteTransaction(userId, txId);
    if (!success) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json({ success: true, id: txId });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to delete transaction', details: err.message });
  }
});

// Budget Routes
router.get('/budgets/current', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const monthKey = new Date().toISOString().slice(0, 7);
    const budget = await budgetRepository.getBudget(userId, monthKey);
    res.json({ success: true, budget });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch current budget', details: err.message });
  }
});

router.post('/budgets', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const parseResult = budgetSetSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid budget payload', details: parseResult.error.format() });
    }

    const budget = await budgetRepository.setBudget(userId, parseResult.data as any);
    res.json({ success: true, budget });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save budget', details: err.message });
  }
});

// Goal Routes
router.get('/goals', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const goals = await goalRepository.getGoals(userId);
    res.json({ success: true, goals });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch goals', details: err.message });
  }
});

router.post('/goals', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const parseResult = goalCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid goal payload', details: parseResult.error.format() });
    }

    const goal = await goalRepository.saveGoal(userId, parseResult.data as any);
    res.status(201).json({ success: true, goal });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save goal', details: err.message });
  }
});

// Bill Routes
router.get('/bills', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const bills = await billRepository.getBills(userId);
    res.json({ success: true, bills });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch bills', details: err.message });
  }
});

router.post('/bills', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const parseResult = billCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid bill payload', details: parseResult.error.format() });
    }

    const bill = await billRepository.saveBill(userId, parseResult.data as any);
    res.status(201).json({ success: true, bill });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save bill', details: err.message });
  }
});

router.post('/bills/:id/pay', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const billId = req.params.id;
    const updatedBill = await billRepository.payBill(userId, billId);
    if (!updatedBill) {
      return res.status(404).json({ error: 'Bill not found' });
    }
    res.json({ success: true, bill: updatedBill });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to mark bill as paid', details: err.message });
  }
});

// Subscription Routes
router.get('/subscriptions', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const subscriptions = await subscriptionRepository.getSubscriptions(userId);
    res.json({ success: true, subscriptions });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch subscriptions', details: err.message });
  }
});

router.post('/subscriptions', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const parseResult = subscriptionCreateSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid subscription payload', details: parseResult.error.format() });
    }

    const subscription = await subscriptionRepository.saveSubscription(userId, parseResult.data as any);
    res.status(201).json({ success: true, subscription });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to save subscription', details: err.message });
  }
});

// System Feature Flags Config Routes
router.get('/system-config', async (req: AuthenticatedRequest, res) => {
  try {
    const doc = await db.collection('system_config').doc('flags').get();
    if (!doc.exists) {
      return res.json({
        success: true,
        flags: {
          voiceAssistant: true,
          emergencyMode: true,
          familyWallet: false,
          ocrReceiptScanner: true,
          aiAutoBudget: true,
          geminiProRouting: true,
          whatsappIntegration: false,
          instapayDirectSync: false, // Default false per Beta Gate
        },
      });
    }
    res.json({ success: true, flags: doc.data() });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch system config', details: err.message });
  }
});

router.post('/system-config', requireAdmin as any, async (req: AuthenticatedRequest, res) => {
  try {
    const parseResult = systemConfigSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid system config payload', details: parseResult.error.format() });
    }

    await db.collection('system_config').doc('flags').set(parseResult.data.flags, { merge: true });
    res.json({ success: true, flags: parseResult.data.flags });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to update system config', details: err.message });
  }
});

// Admin Metrics Route
router.get('/admin/metrics', requireAdmin as any, (req, res) => {
  res.json({
    success: false,
    error: 'Data unavailable',
    message: 'Real-time admin telemetry pipeline is currently unconfigured in this environment.',
  });
});

export default router;
