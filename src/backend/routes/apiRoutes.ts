import { Router } from 'express';
import { createHash } from 'crypto';
import { ZodError } from 'zod';
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
import { buildSmartBudgetPlan, saveSmartBudgetPlan } from '../services/budgetPlanningService';
import {
  createDebt,
  getDebt,
  recordDebtPayment,
  archiveDebt,
  getDebtPayments
} from '../services/debtService';
import {
  createObligation,
  getObligations,
  updateObligation,
  pauseObligation,
  resumeObligation,
  deleteObligation,
  completeObligation,
  archiveObligation
} from '../services/obligationService';
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

async function markBudgetStale(userId: string): Promise<void> {
  try {
    const monthKey = new Date().toISOString().slice(0, 7);
    const budgetDocRef = db.collection('users').doc(userId).collection('budgets').doc(monthKey);
    const doc = await budgetDocRef.get();
    if (doc.exists) {
      await budgetDocRef.set({ isStale: true }, { merge: true });
    }
  } catch (err) {
    console.error('Error marking budget as stale:', err);
  }
}

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
    const { savingsTargetPercent = 20 } = req.body;

    let context = await getTrustedFinancialContext(userId);

    if (!context.salary || context.salary <= 0) {
      return res.status(200).json({
        success: false,
        status: 'NEEDS_USER_DATA',
        code: 'NEEDS_USER_DATA',
        message: 'برجاء تحديد الراتب الشهري أولاً في إعدادات ملفك المالي لحساب الميزانية التلقائية.',
        missingField: 'salary',
      });
    }

    const plan = await buildSmartBudgetPlan(context, savingsTargetPercent);

    // Save the smart budget plan using our shared helper
    const firestoreBudget = await saveSmartBudgetPlan(userId, plan, savingsTargetPercent);

    function getCategoryColor(cat: string): string {
      switch (cat) {
        case 'Food & Groceries': return '#10B981';
        case 'Housing & Utilities': return '#0EA5E9';
        case 'Transport & Ride Apps': return '#F59E0B';
        case 'Installments & Debt': return '#F43F5E';
        case 'Health & Education': return '#3B82F6';
        case 'Family & Allowances': return '#6366F1';
        case 'Shopping & Entertainment': return '#8B5CF6';
        case 'Emergency & Savings': return '#14B8A6';
        default: return '#6B7280';
      }
    }

    function getCategoryIconName(cat: string): string {
      switch (cat) {
        case 'Food & Groceries': return 'ShoppingBag';
        case 'Housing & Utilities': return 'Home';
        case 'Transport & Ride Apps': return 'Car';
        case 'Installments & Debt': return 'CreditCard';
        case 'Health & Education': return 'HeartPulse';
        case 'Family & Allowances': return 'UserCheck';
        case 'Shopping & Entertainment': return 'Coffee';
        case 'Emergency & Savings': return 'TrendingUp';
        default: return 'ShieldAlert';
      }
    }

    const categoriesMappedForResponse = plan.categories.map((cat) => ({
      categoryKey: cat.categoryKey,
      category: cat.categoryKey,
      categoryAr: cat.categoryAr,
      name: cat.categoryAr,
      allocatedAmount: cat.allocatedAmount,
      amount: cat.allocatedAmount,
      spentAmount: cat.spentAmount,
      remainingAmount: cat.remainingAmount,
      percentageOfFlexiblePool: cat.percentageOfFlexiblePool,
      status: cat.status,
      color: getCategoryColor(cat.categoryKey),
      icon: getCategoryIconName(cat.categoryKey),
    }));

    const responseBudget = { ...firestoreBudget };
    if (responseBudget.generatedAt && typeof (responseBudget.generatedAt as any).toDate === 'function') {
      responseBudget.generatedAt = (responseBudget.generatedAt as any).toDate().toISOString() as any;
    }
    if (responseBudget.lastCalculatedAt && typeof (responseBudget.lastCalculatedAt as any).toDate === 'function') {
      responseBudget.lastCalculatedAt = (responseBudget.lastCalculatedAt as any).toDate().toISOString() as any;
    }

    res.json({
      success: true,
      data: {
        ...responseBudget,
        categories: categoriesMappedForResponse,
      },
    });
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
    await markBudgetStale(userId);
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
    await markBudgetStale(userId);
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
    await markBudgetStale(userId);
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
    await markBudgetStale(userId);
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
    await markBudgetStale(userId);
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
    
    if (budget) {
      function getCategoryColor(cat: string): string {
        switch (cat) {
          case 'Food & Groceries': return '#10B981';
          case 'Housing & Utilities': return '#0EA5E9';
          case 'Transport & Ride Apps': return '#F59E0B';
          case 'Installments & Debt': return '#F43F5E';
          case 'Health & Education': return '#3B82F6';
          case 'Family & Allowances': return '#6366F1';
          case 'Shopping & Entertainment': return '#8B5CF6';
          case 'Emergency & Savings': return '#14B8A6';
          default: return '#6B7280';
        }
      }

      function getCategoryIconName(cat: string): string {
        switch (cat) {
          case 'Food & Groceries': return 'ShoppingBag';
          case 'Housing & Utilities': return 'Home';
          case 'Transport & Ride Apps': return 'Car';
          case 'Installments & Debt': return 'CreditCard';
          case 'Health & Education': return 'HeartPulse';
          case 'Family & Allowances': return 'UserCheck';
          case 'Shopping & Entertainment': return 'Coffee';
          case 'Emergency & Savings': return 'TrendingUp';
          default: return 'ShieldAlert';
        }
      }

      const responseBudget: any = { ...budget };
      if (responseBudget.generatedAt && typeof (responseBudget.generatedAt as any).toDate === 'function') {
        responseBudget.generatedAt = (responseBudget.generatedAt as any).toDate().toISOString() as any;
      }
      if (responseBudget.lastCalculatedAt && typeof (responseBudget.lastCalculatedAt as any).toDate === 'function') {
        responseBudget.lastCalculatedAt = (responseBudget.lastCalculatedAt as any).toDate().toISOString() as any;
      }

      const responseCategories = (responseBudget.categories || []).map((cat: any) => {
        const catKey = cat.categoryKey || cat.category || '';
        return {
          categoryKey: catKey,
          category: catKey,
          categoryAr: cat.categoryAr,
          name: cat.categoryAr,
          allocatedAmount: cat.allocatedAmount,
          amount: cat.allocatedAmount,
          spentAmount: cat.spentAmount || 0,
          remainingAmount: typeof cat.remainingAmount === 'number' ? cat.remainingAmount : (cat.allocatedAmount - (cat.spentAmount || 0)),
          percentageOfFlexiblePool: cat.percentageOfFlexiblePool || 0,
          status: cat.status || 'SAFE',
          color: cat.color || getCategoryColor(catKey),
          icon: cat.icon || getCategoryIconName(catKey),
        };
      });

      responseBudget.categories = responseCategories;

      res.json({
        success: true,
        budget: responseBudget
      });
    } else {
      res.json({ success: true, budget: null });
    }
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
          instapayDirectSync: false,
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

// Financial Context Route
router.get('/financial-context', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const context = await getTrustedFinancialContext(userId);
    res.json({ success: true, context });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch financial context', details: err.message });
  }
});

// Helper to map errors to appropriate HTTP status codes and responses
function mapErrorToResponse(res: any, err: any, defaultMessage: string) {
  if (
    err &&
    (err instanceof ZodError ||
      err.name === 'ZodError' ||
      err.constructor?.name === 'ZodError' ||
      Array.isArray(err.issues) ||
      Array.isArray(err.errors))
  ) {
    return res.status(400).json({ error: 'Validation failed', details: err.issues || err.errors || err.message });
  }

  const errMsg = err?.message || '';
  const errCode = err?.code || '';

  // 1. Not Found => 404
  if (
    err?.statusCode === 404 ||
    errMsg.includes('not found') ||
    errMsg.includes('not-found') ||
    errMsg.includes('غير موجود') ||
    errCode === 5 ||
    errCode === 'NOT_FOUND'
  ) {
    return res.status(404).json({ error: errMsg || 'Resource not found' });
  }

  // 2. Conflict => 409
  if (
    err?.statusCode === 409 ||
    errMsg.includes('conflict') ||
    errMsg.includes('already exists') ||
    errCode === 6 ||
    errCode === 'ALREADY_EXISTS'
  ) {
    return res.status(409).json({ error: errMsg || 'Conflict occurred' });
  }

  // 3. Bad Request => 400
  if (
    err?.statusCode === 400 ||
    errMsg.includes('bad request') ||
    errMsg.includes('invalid') ||
    errMsg.includes('must be') ||
    errMsg.includes('مبلغ') ||
    errMsg.includes('مفتاح')
  ) {
    return res.status(400).json({ error: errMsg || 'Bad request' });
  }

  // 4. Unexpected => 500
  const status = err?.statusCode || 500;
  return res.status(status).json({ error: errMsg || defaultMessage });
}

// Debts Routes
router.get('/debts', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const context = await getTrustedFinancialContext(userId);
    res.json({
      success: true,
      debts: context.debts || [],
      totalDebtRemaining: context.totalDebtRemaining,
      monthlyDebtPayments: context.monthlyDebtPayments
    });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to fetch debts');
  }
});

router.post('/debts', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const debt = await createDebt(userId, req.body);
    await markBudgetStale(userId);
    res.status(201).json({ success: true, debt });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to create debt');
  }
});

router.get('/debts/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const debt = await getDebt(userId, req.params.id);
    if (!debt) return res.status(404).json({ error: 'Debt not found' });
    res.json({ success: true, debt });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to fetch debt');
  }
});

router.post('/debts/:id/pay', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const idempotencyKey = req.header('X-Idempotency-Key') || req.header('x-idempotency-key');

    if (!idempotencyKey) {
      return res.status(400).json({ error: 'مفتاح عدم التكرار مطلوب X-Idempotency-Key' });
    }

    const { amount, paymentMethod, date } = req.body;

    if (amount === undefined) {
      return res.status(400).json({ error: 'مبلغ الدفع مطلوب' });
    }

    const result = await recordDebtPayment(
      userId,
      req.params.id,
      amount,
      paymentMethod,
      date,
      idempotencyKey
    );

    await markBudgetStale(userId);

    res.json({ success: true, ...result });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to record debt payment');
  }
});

router.post('/debts/:id/archive', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    await archiveDebt(userId, req.params.id);
    await markBudgetStale(userId);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to archive debt');
  }
});

router.get('/debts/:id/payments', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const payments = await getDebtPayments(userId, req.params.id);
    res.json({ success: true, payments });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to fetch debt payments');
  }
});

// Obligations Routes
router.get('/obligations', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const obligations = await getObligations(userId);
    res.json({ success: true, obligations });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to fetch obligations');
  }
});

router.post('/obligations', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const obligation = await createObligation(userId, req.body);
    await markBudgetStale(userId);
    res.status(201).json({ success: true, obligation });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to create obligation');
  }
});

router.patch('/obligations/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const obligation = await updateObligation(userId, req.params.id, req.body);
    await markBudgetStale(userId);
    res.json({ success: true, obligation });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to update obligation');
  }
});

router.post('/obligations/:id/pause', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    await pauseObligation(userId, req.params.id);
    await markBudgetStale(userId);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to pause obligation');
  }
});

router.post('/obligations/:id/resume', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    await resumeObligation(userId, req.params.id);
    await markBudgetStale(userId);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to resume obligation');
  }
});

router.post('/obligations/:id/complete', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    await completeObligation(userId, req.params.id);
    await markBudgetStale(userId);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to complete obligation');
  }
});

router.post('/obligations/:id/archive', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    await archiveObligation(userId, req.params.id);
    await markBudgetStale(userId);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to archive obligation');
  }
});

router.delete('/obligations/:id', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    await deleteObligation(userId, req.params.id);
    await markBudgetStale(userId);
    res.json({ success: true, id: req.params.id });
  } catch (err: any) {
    mapErrorToResponse(res, err, 'Failed to delete obligation');
  }
});

// ============================================================
// Telegram Account Linking
// POST /api/v1/telegram/link
// Protected by Firebase Authentication
// ============================================================

router.post('/telegram/link', async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user!.uid;
    const rawCode = String(req.body?.code || '').trim();

    if (!/^\d{6}$/.test(rawCode)) {
      return res.status(400).json({
        success: false,
        error: 'كود الربط يجب أن يكون مكوّنًا من 6 أرقام.',
      });
    }

    const codeHash = createHash('sha256')
      .update(rawCode)
      .digest('hex');

    const codeRef = db
      .collection('telegram_link_codes')
      .doc(codeHash);

    await db.runTransaction(async (transaction) => {
      const codeSnapshot = await transaction.get(codeRef);

      if (!codeSnapshot.exists) {
        throw new Error('TELEGRAM_LINK_CODE_NOT_FOUND');
      }

      const codeData = codeSnapshot.data();

      if (!codeData) {
        throw new Error('TELEGRAM_LINK_CODE_NOT_FOUND');
      }

      if (codeData.used === true) {
        throw new Error('TELEGRAM_LINK_CODE_ALREADY_USED');
      }

      if (
        typeof codeData.expiresAt !== 'number' ||
        Date.now() > codeData.expiresAt
      ) {
        throw new Error('TELEGRAM_LINK_CODE_EXPIRED');
      }

      if (!codeData.telegramUserId || !codeData.chatId) {
        throw new Error('TELEGRAM_LINK_CODE_INVALID');
      }

      const telegramUserId = String(codeData.telegramUserId);

      const telegramLinkRef = db
        .collection('telegram_links')
        .doc(telegramUserId);

      const userTelegramRef = db
        .collection('users')
        .doc(userId)
        .collection('integrations')
        .doc('telegram');

      const linkedAt = Date.now();

      transaction.set(telegramLinkRef, {
        uid: userId,
        telegramUserId: codeData.telegramUserId,
        chatId: codeData.chatId,
        telegramUsername: codeData.telegramUsername || null,
        telegramFirstName: codeData.telegramFirstName || null,
        telegramLastName: codeData.telegramLastName || null,
        active: true,
        linkedAt,
      });

      transaction.set(
        userTelegramRef,
        {
          telegramUserId: codeData.telegramUserId,
          chatId: codeData.chatId,
          telegramUsername: codeData.telegramUsername || null,
          telegramFirstName: codeData.telegramFirstName || null,
          telegramLastName: codeData.telegramLastName || null,
          active: true,
          linkedAt,
        },
        {
          merge: true,
        }
      );

      transaction.update(codeRef, {
        used: true,
        usedAt: linkedAt,
        linkedUid: userId,
      });
    });

    return res.status(200).json({
      success: true,
      message: 'تم ربط حساب Telegram بحساب Mizaniya AI بنجاح.',
    });
  } catch (error: any) {
    console.error('Telegram account linking error:', error);

    switch (error?.message) {
      case 'TELEGRAM_LINK_CODE_NOT_FOUND':
        return res.status(400).json({
          success: false,
          error: 'كود الربط غير صحيح. اطلب كود جديد من Telegram.',
        });

      case 'TELEGRAM_LINK_CODE_ALREADY_USED':
        return res.status(409).json({
          success: false,
          error: 'تم استخدام كود الربط ده بالفعل.',
        });

      case 'TELEGRAM_LINK_CODE_EXPIRED':
        return res.status(400).json({
          success: false,
          error: 'انتهت صلاحية الكود. اكتب /link في Telegram للحصول على كود جديد.',
        });

      case 'TELEGRAM_LINK_CODE_INVALID':
        return res.status(400).json({
          success: false,
          error: 'بيانات كود الربط غير صالحة.',
        });

      default:
        return res.status(500).json({
          success: false,
          error: 'تعذر ربط حساب Telegram حاليًا.',
        });
    }
  }
});

export default router;
