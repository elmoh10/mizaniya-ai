import { Router } from 'express';
import { ZodError } from 'zod';

import {
  handleAIChat,
  handleAnalyzeReceipt,
  handleParseVoiceCommand,
} from '../controllers/aiController';

import {
  authMiddleware,
  requireAdmin,
  AuthenticatedRequest,
} from '../middlewares/authMiddleware';

import { rateLimiter } from '../middlewares/rateLimiter';
import { idempotencyMiddleware } from '../middlewares/idempotencyMiddleware';

import {
  getWalletsForUser,
  createWalletForUser,
  ensureDefaultWalletForUser,
} from '../services/walletService';

import { transactionRepository } from '../repositories/transactionRepository';

import {
  budgetRepository,
  goalRepository,
  billRepository,
  subscriptionRepository,
} from '../repositories/budgetAndGoalRepositories';

import { installmentRepository } from '../repositories/installmentRepository';
import { profileRepository } from '../repositories/profileRepository';

import { getTrustedFinancialContext } from '../services/financialContextService';

import {
  executeBillPayment,
  executeDebtPayment,
} from '../services/financialExecutionService';

import {
  buildSmartBudgetPlan,
  saveSmartBudgetPlan,
} from '../services/budgetPlanningService';

import {
  createDebt,
  getDebt,
  archiveDebt,
  getDebtPayments,
} from '../services/debtService';

import {
  createObligation,
  getObligations,
  updateObligation,
  pauseObligation,
  resumeObligation,
  deleteObligation,
  completeObligation,
  archiveObligation,
} from '../services/obligationService';

// ============================================================
// Gemini Financial Interpreter
// ============================================================

import {
  interpretFinancialMessageWithGemini,
} from '../services/geminiFinancialInterpreter';

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

// ============================================================
// Mark Current Budget As Stale
// ============================================================

async function markBudgetStale(
  userId: string
): Promise<void> {
  try {
    const monthKey =
      new Date()
        .toISOString()
        .slice(0, 7);

    const budgetDocRef =
      db
        .collection('users')
        .doc(userId)
        .collection('budgets')
        .doc(monthKey);

    const doc =
      await budgetDocRef.get();

    if (doc.exists) {
      await budgetDocRef.set(
        {
          isStale: true,
        },
        {
          merge: true,
        }
      );
    }
  } catch (err) {
    console.error(
      'Error marking budget as stale:',
      err
    );
  }
}

// ============================================================
// Global API Middleware
// ============================================================

router.use(
  authMiddleware as any
);

router.use(
  rateLimiter(
    100,
    60000
  )
);

// ============================================================
// Profile & Onboarding Routes
// ============================================================

router.post(
  '/profile/onboarding',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const userEmail =
        req.user!.email || '';

      const parseResult =
        profileOnboardingSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid onboarding payload',

            details:
              parseResult.error.format(),
          });
      }

      const profile =
        await profileRepository.createProfileOnboarding(
          userId,
          userEmail,
          parseResult.data
        );

      const defaultWallet =
        await ensureDefaultWalletForUser(
          userId
        );

      return res
        .status(201)
        .json({
          success: true,
          profile,
          defaultWallet,
        });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to complete profile onboarding',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Get Profile
// ============================================================

router.get(
  '/profile',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const profile =
        await profileRepository.getProfile(
          userId
        );

      return res.json({
        success: true,
        profile,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch user profile',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Update Profile
// ============================================================

router.patch(
  '/profile',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const parseResult =
        profileUpdateSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid profile update payload',

            details:
              parseResult.error.format(),
          });
      }

      const updatedProfile =
        await profileRepository.updateProfile(
          userId,
          parseResult.data
        );

      return res.json({
        success: true,
        profile:
          updatedProfile,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to update user profile',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Delete Profile
// ============================================================

router.delete(
  '/profile',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      await profileRepository.deleteProfileAndAllUserData(
        userId
      );

      return res.json({
        success: true,

        message:
          'User profile and all associated data deleted cleanly.',
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to delete user profile',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Existing AI Routes
// ============================================================

router.post(
  '/ai/chat',
  handleAIChat as any
);

router.post(
  '/ai/analyze-receipt',
  handleAnalyzeReceipt as any
);

router.post(
  '/ai/parse-voice',
  handleParseVoiceCommand as any
);

// ============================================================
// Gemini Financial Interpreter
//
// POST /api/v1/ai/interpret-financial-message
//
// IMPORTANT:
// Gemini only interprets.
// It does NOT write to Firestore.
// It does NOT move money.
// ============================================================

router.post(
  '/ai/interpret-financial-message',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const message =
        String(
          req.body?.message ||
          ''
        ).trim();

      if (!message) {
        return res
          .status(400)
          .json({
            success: false,

            error:
              'message is required',
          });
      }

      if (message.length > 2000) {
        return res
          .status(400)
          .json({
            success: false,

            error:
              'message is too long',
          });
      }

      const interpretation =
        await interpretFinancialMessageWithGemini(
          message
        );

      return res.json({
        success: true,

        interpretation,
      });
    } catch (err: any) {
      console.error(
        'Financial Interpreter API error:',
        err
      );

      return res
        .status(500)
        .json({
          success: false,

          error:
            'Failed to interpret financial message',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Generate AI Budget
// ============================================================

router.post(
  '/ai/generate-budget',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const {
        savingsTargetPercent = 20,
      } = req.body;

      const context =
        await getTrustedFinancialContext(
          userId
        );

      if (
        !context.salary ||
        context.salary <= 0
      ) {
        return res
          .status(200)
          .json({
            success: false,

            status:
              'NEEDS_USER_DATA',

            code:
              'NEEDS_USER_DATA',

            message:
              'برجاء تحديد الراتب الشهري أولاً في إعدادات ملفك المالي لحساب الميزانية التلقائية.',

            missingField:
              'salary',
          });
      }

      const plan =
        await buildSmartBudgetPlan(
          context,
          savingsTargetPercent
        );

      const firestoreBudget =
        await saveSmartBudgetPlan(
          userId,
          plan,
          savingsTargetPercent
        );

      function getCategoryColor(
        cat: string
      ): string {
        switch (cat) {
          case 'Food & Groceries':
            return '#10B981';

          case 'Housing & Utilities':
            return '#0EA5E9';

          case 'Transport & Ride Apps':
            return '#F59E0B';

          case 'Installments & Debt':
            return '#F43F5E';

          case 'Health & Education':
            return '#3B82F6';

          case 'Family & Allowances':
            return '#6366F1';

          case 'Shopping & Entertainment':
            return '#8B5CF6';

          case 'Emergency & Savings':
            return '#14B8A6';

          default:
            return '#6B7280';
        }
      }

      function getCategoryIconName(
        cat: string
      ): string {
        switch (cat) {
          case 'Food & Groceries':
            return 'ShoppingBag';

          case 'Housing & Utilities':
            return 'Home';

          case 'Transport & Ride Apps':
            return 'Car';

          case 'Installments & Debt':
            return 'CreditCard';

          case 'Health & Education':
            return 'HeartPulse';

          case 'Family & Allowances':
            return 'UserCheck';

          case 'Shopping & Entertainment':
            return 'Coffee';

          case 'Emergency & Savings':
            return 'TrendingUp';

          default:
            return 'ShieldAlert';
        }
      }

      const categoriesMappedForResponse =
        plan.categories.map(
          (cat) => ({
            categoryKey:
              cat.categoryKey,

            category:
              cat.categoryKey,

            categoryAr:
              cat.categoryAr,

            name:
              cat.categoryAr,

            allocatedAmount:
              cat.allocatedAmount,

            amount:
              cat.allocatedAmount,

            spentAmount:
              cat.spentAmount,

            remainingAmount:
              cat.remainingAmount,

            percentageOfFlexiblePool:
              cat.percentageOfFlexiblePool,

            status:
              cat.status,

            color:
              getCategoryColor(
                cat.categoryKey
              ),

            icon:
              getCategoryIconName(
                cat.categoryKey
              ),
          })
        );

      const responseBudget: any = {
        ...firestoreBudget,
      };

      if (
        responseBudget.generatedAt &&
        typeof responseBudget.generatedAt
          .toDate === 'function'
      ) {
        responseBudget.generatedAt =
          responseBudget.generatedAt
            .toDate()
            .toISOString();
      }

      if (
        responseBudget.lastCalculatedAt &&
        typeof responseBudget.lastCalculatedAt
          .toDate === 'function'
      ) {
        responseBudget.lastCalculatedAt =
          responseBudget.lastCalculatedAt
            .toDate()
            .toISOString();
      }

      return res.json({
        success: true,

        data: {
          ...responseBudget,

          categories:
            categoriesMappedForResponse,
        },
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to generate budget',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Financial Health Score
// ============================================================

router.get(
  '/financial-health',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const context =
        await getTrustedFinancialContext(
          userId
        );

      if (
        context.salary <= 0 &&
        context.recentTransactions
          .length === 0 &&
        context.wallets.length === 0
      ) {
        return res.json({
          success: true,

          status:
            'INSUFFICIENT_DATA',

          score:
            null,
        });
      }

      const salary =
        context.salary;

      const currentMonthPrefix =
        new Date()
          .toISOString()
          .slice(0, 7);

      const currentMonthExpenses =
        context.recentTransactions
          .filter(
            (tx) =>
              tx.type ===
                'expense' &&
              (
                tx.date ||
                ''
              ).startsWith(
                currentMonthPrefix
              )
          )
          .reduce(
            (acc, tx) =>
              acc +
              (
                tx.amount ||
                0
              ),
            0
          );

      const incomeStabilityScore =
        context
          .historicalIncomeStability
          .calculatedScore;

      const totalMonthlyObligations =
        context.monthlyInstallmentObligation +
        context.unpaidBillsTotal;

      const savingsRateScore =
        salary > 0
          ? Math.max(
              0,
              Math.min(
                100,
                Math.round(
                  (
                    (
                      salary -
                      currentMonthExpenses -
                      totalMonthlyObligations
                    ) /
                    salary
                  ) *
                    100 *
                    2
                )
              )
            )
          : 50;

      const debtRatioScore =
        salary > 0
          ? Math.max(
              0,
              Math.min(
                100,
                100 -
                  Math.round(
                    (
                      context.monthlyInstallmentObligation /
                      salary
                    ) *
                      100
                  )
              )
            )
          : 50;

      const budgetDisciplineScore =
        context.currentBudget
          ? Math.min(
              100,
              Math.max(
                30,
                100 -
                  Math.round(
                    (
                      currentMonthExpenses /
                      (
                        context
                          .currentBudget
                          .totalIncome ||
                        salary ||
                        1
                      )
                    ) *
                      50
                  )
              )
            )
          : 60;

      const emergencyFundScore =
        Math.min(
          100,
          Math.round(
            (
              context.totalWalletBalance /
              (
                (
                  currentMonthExpenses ||
                  salary / 2 ||
                  1
                ) *
                3
              )
            ) *
              100
          )
        );

      const overallScore =
        Math.round(
          (
            incomeStabilityScore +
            savingsRateScore +
            debtRatioScore +
            budgetDisciplineScore +
            emergencyFundScore
          ) /
            5
        );

      const recommendations:
        string[] = [];

      if (
        savingsRateScore <
        70
      ) {
        recommendations.push(
          'قم بزيادة تحويلات الادخار في بداية الشهر للحفاظ على نسبة الادخار.'
        );
      }

      if (
        emergencyFundScore <
        60
      ) {
        recommendations.push(
          'خصّص نسبة من الفائض الشهري لبناء صندوق طوارئ يغطي 3 أشهر على الأقل.'
        );
      }

      if (
        debtRatioScore <
        70
      ) {
        recommendations.push(
          'استخدم استراتيجية سداد الأقساط ذات الفائدة الأعلى لخفض التزاماتك الشهريّة.'
        );
      }

      if (
        recommendations.length ===
        0
      ) {
        recommendations.push(
          'وضعك المالي متزن وممتاز! واصل الالتزام بالخطة الحالية.'
        );
      }

      return res.json({
        success: true,

        status:
          'CALCULATED',

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
      return res
        .status(500)
        .json({
          error:
            'Failed to calculate financial health score',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Wallet Routes
// ============================================================

router.get(
  '/wallets',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      let wallets =
        await getWalletsForUser(
          userId
        );

      if (
        wallets.length === 0
      ) {
        const defaultWallet =
          await ensureDefaultWalletForUser(
            userId
          );

        wallets = [
          defaultWallet,
        ];
      }

      return res.json({
        success: true,
        wallets,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch wallets',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/wallets',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const parseResult =
        walletCreateSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid wallet data',

            details:
              parseResult.error.format(),
          });
      }

      const wallet =
        await createWalletForUser(
          userId,
          parseResult.data
        );

      await markBudgetStale(
        userId
      );

      return res
        .status(201)
        .json({
          success: true,
          wallet,
        });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to create wallet',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/wallets/sync-instapay',
  async (
    _req: AuthenticatedRequest,
    res
  ) => {
    return res.json({
      success: true,

      status:
        'COMING_SOON',

      message:
        'خدمة ربط إنستا باي المباشرة تحت التطوير التجريبي قريباً فور اعتماد تراخيص البنك المركزي. يمكنك تسجيل معاملاتك عبر إدخال الصوت أو مسح الفواتير.',

      syncedAt:
        new Date()
          .toISOString(),

      count:
        0,
    });
  }
);

// ============================================================
// Installments
// ============================================================

router.get(
  '/installments',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const installments =
        await installmentRepository.getInstallments(
          userId
        );

      return res.json({
        success: true,
        installments,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch installments',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/installments',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const parseResult =
        installmentCreateSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid installment payload',

            details:
              parseResult.error.format(),
          });
      }

      const installment =
        await installmentRepository.saveInstallment(
          userId,
          parseResult.data as any
        );

      await markBudgetStale(
        userId
      );

      return res
        .status(201)
        .json({
          success: true,
          installment,
        });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to save installment',

          details:
            err.message,
        });
    }
  }
);

router.delete(
  '/installments/:id',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const success =
        await installmentRepository.deleteInstallment(
          userId,
          req.params.id
        );

      if (!success) {
        return res
          .status(404)
          .json({
            error:
              'Installment not found',
          });
      }

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        id:
          req.params.id,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to delete installment',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Transactions
// ============================================================

router.get(
  '/transactions',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const transactions =
        await transactionRepository.getTransactions(
          userId
        );

      return res.json({
        success: true,
        transactions,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch transactions',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/transactions',
  idempotencyMiddleware as any,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const parseResult =
        transactionCreateSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        const walletIssue =
          parseResult.error.issues.find(
            (issue) =>
              issue.path.includes(
                'walletId'
              )
          );

        if (walletIssue) {
          return res
            .status(400)
            .json({
              error:
                'يرجى اختيار محفظة معتمدة أو إنشاء محفظة أولاً من قسم المحافظ.',

              details:
                parseResult.error.format(),
            });
        }

        return res
          .status(400)
          .json({
            error:
              'بيانات المعاملة غير مكتملة أو غير صالحة. يرجى التأكد من المبالغ والتفاصيل.',

            details:
              parseResult.error.format(),
          });
      }

      const transaction =
        await transactionRepository.createTransaction(
          userId,
          parseResult.data
        );

      await markBudgetStale(
        userId
      );

      return res
        .status(201)
        .json({
          success: true,
          transaction,
        });
    } catch (err: any) {
      const errMsg =
        err.message || '';

      if (
        errMsg.includes(
          'not found'
        ) ||
        errMsg.includes(
          'Source wallet'
        )
      ) {
        return res
          .status(400)
          .json({
            error:
              'المحفظة المحددة غير موجودة، يرجى التأكد من اختيار محفظة صحيحة أو إضافة محفظة جديدة من قسم المحافظ.',

            details:
              err.message,
          });
      }

      return res
        .status(500)
        .json({
          error:
            'فشل في تسجيل المعاملة على الخادم',

          details:
            err.message,
        });
    }
  }
);

router.delete(
  '/transactions/:id',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const txId =
        req.params.id;

      const success =
        await transactionRepository.deleteTransaction(
          userId,
          txId
        );

      if (!success) {
        return res
          .status(404)
          .json({
            error:
              'Transaction not found',
          });
      }

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        id:
          txId,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to delete transaction',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Budget Routes
// ============================================================

router.get(
  '/budgets/current',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const monthKey =
        new Date()
          .toISOString()
          .slice(0, 7);

      const budget =
        await budgetRepository.getBudget(
          userId,
          monthKey
        );

      if (!budget) {
        return res.json({
          success: true,
          budget: null,
        });
      }

      function getCategoryColor(
        cat: string
      ): string {
        switch (cat) {
          case 'Food & Groceries':
            return '#10B981';

          case 'Housing & Utilities':
            return '#0EA5E9';

          case 'Transport & Ride Apps':
            return '#F59E0B';

          case 'Installments & Debt':
            return '#F43F5E';

          case 'Health & Education':
            return '#3B82F6';

          case 'Family & Allowances':
            return '#6366F1';

          case 'Shopping & Entertainment':
            return '#8B5CF6';

          case 'Emergency & Savings':
            return '#14B8A6';

          default:
            return '#6B7280';
        }
      }

      function getCategoryIconName(
        cat: string
      ): string {
        switch (cat) {
          case 'Food & Groceries':
            return 'ShoppingBag';

          case 'Housing & Utilities':
            return 'Home';

          case 'Transport & Ride Apps':
            return 'Car';

          case 'Installments & Debt':
            return 'CreditCard';

          case 'Health & Education':
            return 'HeartPulse';

          case 'Family & Allowances':
            return 'UserCheck';

          case 'Shopping & Entertainment':
            return 'Coffee';

          case 'Emergency & Savings':
            return 'TrendingUp';

          default:
            return 'ShieldAlert';
        }
      }

      const responseBudget:
        any = {
          ...budget,
        };

      if (
        responseBudget.generatedAt &&
        typeof responseBudget.generatedAt
          .toDate === 'function'
      ) {
        responseBudget.generatedAt =
          responseBudget.generatedAt
            .toDate()
            .toISOString();
      }

      if (
        responseBudget.lastCalculatedAt &&
        typeof responseBudget.lastCalculatedAt
          .toDate === 'function'
      ) {
        responseBudget.lastCalculatedAt =
          responseBudget.lastCalculatedAt
            .toDate()
            .toISOString();
      }

      responseBudget.categories =
        (
          responseBudget.categories ||
          []
        ).map(
          (cat: any) => {
            const catKey =
              cat.categoryKey ||
              cat.category ||
              '';

            return {
              categoryKey:
                catKey,

              category:
                catKey,

              categoryAr:
                cat.categoryAr,

              name:
                cat.categoryAr,

              allocatedAmount:
                cat.allocatedAmount,

              amount:
                cat.allocatedAmount,

              spentAmount:
                cat.spentAmount ||
                0,

              remainingAmount:
                typeof cat.remainingAmount ===
                'number'
                  ? cat.remainingAmount
                  : (
                      cat.allocatedAmount -
                      (
                        cat.spentAmount ||
                        0
                      )
                    ),

              percentageOfFlexiblePool:
                cat.percentageOfFlexiblePool ||
                0,

              status:
                cat.status ||
                'SAFE',

              color:
                cat.color ||
                getCategoryColor(
                  catKey
                ),

              icon:
                cat.icon ||
                getCategoryIconName(
                  catKey
                ),
            };
          }
        );

      return res.json({
        success: true,
        budget:
          responseBudget,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch current budget',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/budgets',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const parseResult =
        budgetSetSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid budget payload',

            details:
              parseResult.error.format(),
          });
      }

      const budget =
        await budgetRepository.setBudget(
          userId,
          parseResult.data as any
        );

      return res.json({
        success: true,
        budget,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to save budget',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Goals
// ============================================================

router.get(
  '/goals',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const goals =
        await goalRepository.getGoals(
          userId
        );

      return res.json({
        success: true,
        goals,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch goals',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/goals',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const parseResult =
        goalCreateSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid goal payload',

            details:
              parseResult.error.format(),
          });
      }

      const goal =
        await goalRepository.saveGoal(
          userId,
          parseResult.data as any
        );

      return res
        .status(201)
        .json({
          success: true,
          goal,
        });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to save goal',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Bills
// ============================================================

router.get(
  '/bills',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const bills =
        await billRepository.getBills(
          userId
        );

      return res.json({
        success: true,
        bills,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch bills',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/bills',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const parseResult =
        billCreateSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid bill payload',

            details:
              parseResult.error.format(),
          });
      }

      const bill =
        await billRepository.saveBill(
          userId,
          parseResult.data as any
        );

      return res
        .status(201)
        .json({
          success: true,
          bill,
        });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to save bill',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/bills/:id/pay',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId = req.user!.uid;
      const billId = req.params.id;

      const idempotencyKey =
        req.header('X-Idempotency-Key') ||
        req.header('x-idempotency-key') ||
        undefined;

      const result = await executeBillPayment(
        userId,
        {
          billId,
          walletId: req.body?.walletId,
          paymentMethod: req.body?.paymentMethod,
          date: req.body?.date,
          idempotencyKey,
          source: 'api',
        }
      );

      await markBudgetStale(userId);

      return res.json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to pay bill'
      );
    }
  }
);

// ============================================================
// Subscriptions
// ============================================================

router.get(
  '/subscriptions',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const subscriptions =
        await subscriptionRepository.getSubscriptions(
          userId
        );

      return res.json({
        success: true,
        subscriptions,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch subscriptions',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/subscriptions',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const parseResult =
        subscriptionCreateSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid subscription payload',

            details:
              parseResult.error.format(),
          });
      }

      const subscription =
        await subscriptionRepository.saveSubscription(
          userId,
          parseResult.data as any
        );

      return res
        .status(201)
        .json({
          success: true,
          subscription,
        });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to save subscription',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// System Feature Flags
// ============================================================

router.get(
  '/system-config',
  async (
    _req: AuthenticatedRequest,
    res
  ) => {
    try {
      const doc =
        await db
          .collection(
            'system_config'
          )
          .doc('flags')
          .get();

      if (!doc.exists) {
        return res.json({
          success: true,

          flags: {
            voiceAssistant:
              true,

            emergencyMode:
              true,

            familyWallet:
              false,

            ocrReceiptScanner:
              true,

            aiAutoBudget:
              true,

            geminiProRouting:
              true,

            whatsappIntegration:
              false,

            instapayDirectSync:
              false,
          },
        });
      }

      return res.json({
        success: true,
        flags:
          doc.data(),
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch system config',

          details:
            err.message,
        });
    }
  }
);

router.post(
  '/system-config',
  requireAdmin as any,
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const parseResult =
        systemConfigSchema.safeParse(
          req.body
        );

      if (!parseResult.success) {
        return res
          .status(400)
          .json({
            error:
              'Invalid system config payload',

            details:
              parseResult.error.format(),
          });
      }

      await db
        .collection(
          'system_config'
        )
        .doc('flags')
        .set(
          parseResult.data.flags,
          {
            merge: true,
          }
        );

      return res.json({
        success: true,

        flags:
          parseResult.data.flags,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to update system config',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Admin Metrics
// ============================================================

router.get(
  '/admin/metrics',
  requireAdmin as any,
  (
    _req,
    res
  ) => {
    return res.json({
      success: false,

      error:
        'Data unavailable',

      message:
        'Real-time admin telemetry pipeline is currently unconfigured in this environment.',
    });
  }
);

// ============================================================
// Financial Context
// ============================================================

router.get(
  '/financial-context',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const context =
        await getTrustedFinancialContext(
          userId
        );

      return res.json({
        success: true,
        context,
      });
    } catch (err: any) {
      return res
        .status(500)
        .json({
          error:
            'Failed to fetch financial context',

          details:
            err.message,
        });
    }
  }
);

// ============================================================
// Error Mapper
// ============================================================

function mapErrorToResponse(
  res: any,
  err: any,
  defaultMessage: string
) {
  if (
    err &&
    (
      err instanceof ZodError ||
      err.name ===
        'ZodError' ||
      err.constructor?.name ===
        'ZodError' ||
      Array.isArray(
        err.issues
      ) ||
      Array.isArray(
        err.errors
      )
    )
  ) {
    return res
      .status(400)
      .json({
        error:
          'Validation failed',

        details:
          err.issues ||
          err.errors ||
          err.message,
      });
  }

  const errMsg =
    err?.message || '';

  const errCode =
    err?.code || '';

  // Not Found
  if (
    err?.statusCode === 404 ||
    errMsg.includes(
      'not found'
    ) ||
    errMsg.includes(
      'not-found'
    ) ||
    errMsg.includes(
      'غير موجود'
    ) ||
    errCode === 5 ||
    errCode ===
      'NOT_FOUND'
  ) {
    return res
      .status(404)
      .json({
        error:
          errMsg ||
          'Resource not found',
      });
  }

  // Conflict
  if (
    err?.statusCode === 409 ||
    errMsg.includes(
      'conflict'
    ) ||
    errMsg.includes(
      'already exists'
    ) ||
    errCode === 6 ||
    errCode ===
      'ALREADY_EXISTS'
  ) {
    return res
      .status(409)
      .json({
        error:
          errMsg ||
          'Conflict occurred',
      });
  }

  // Bad Request
  if (
    err?.statusCode === 400 ||
    errMsg.includes(
      'bad request'
    ) ||
    errMsg.includes(
      'invalid'
    ) ||
    errMsg.includes(
      'must be'
    ) ||
    errMsg.includes(
      'مبلغ'
    ) ||
    errMsg.includes(
      'مفتاح'
    )
  ) {
    return res
      .status(400)
      .json({
        error:
          errMsg ||
          'Bad request',
      });
  }

  const status =
    err?.statusCode ||
    500;

  return res
    .status(status)
    .json({
      error:
        errMsg ||
        defaultMessage,
    });
}

// ============================================================
// Debts
// ============================================================

router.get(
  '/debts',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const context =
        await getTrustedFinancialContext(
          userId
        );

      return res.json({
        success: true,

        debts:
          context.debts ||
          [],

        totalDebtRemaining:
          context.totalDebtRemaining,

        monthlyDebtPayments:
          context.monthlyDebtPayments,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to fetch debts'
      );
    }
  }
);

router.post(
  '/debts',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const debt =
        await createDebt(
          userId,
          req.body
        );

      await markBudgetStale(
        userId
      );

      return res
        .status(201)
        .json({
          success: true,
          debt,
        });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to create debt'
      );
    }
  }
);

router.get(
  '/debts/:id',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const debt =
        await getDebt(
          userId,
          req.params.id
        );

      if (!debt) {
        return res
          .status(404)
          .json({
            error:
              'Debt not found',
          });
      }

      return res.json({
        success: true,
        debt,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to fetch debt'
      );
    }
  }
);

router.post(
  '/debts/:id/pay',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const idempotencyKey =
        req.header(
          'X-Idempotency-Key'
        ) ||
        req.header(
          'x-idempotency-key'
        );

      if (!idempotencyKey) {
        return res
          .status(400)
          .json({
            error:
              'مفتاح عدم التكرار مطلوب X-Idempotency-Key',
          });
      }

      const {
        amount,
        paymentMethod,
        date,
      } = req.body;

      if (
        amount ===
        undefined
      ) {
        return res
          .status(400)
          .json({
            error:
              'مبلغ الدفع مطلوب',
          });
      }

      const result =
        await executeDebtPayment(
          userId,
          {
            debtId: req.params.id,
            amount: Number(amount),
            walletId: req.body?.walletId,
            paymentMethod,
            date,
            idempotencyKey,
            source: 'api',
          }
        );

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        ...result,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to record debt payment'
      );
    }
  }
);

router.post(
  '/debts/:id/archive',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      await archiveDebt(
        userId,
        req.params.id
      );

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        id:
          req.params.id,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to archive debt'
      );
    }
  }
);

router.get(
  '/debts/:id/payments',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const payments =
        await getDebtPayments(
          userId,
          req.params.id
        );

      return res.json({
        success: true,
        payments,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to fetch debt payments'
      );
    }
  }
);

// ============================================================
// Obligations
// ============================================================

router.get(
  '/obligations',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const obligations =
        await getObligations(
          userId
        );

      return res.json({
        success: true,
        obligations,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to fetch obligations'
      );
    }
  }
);

router.post(
  '/obligations',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const obligation =
        await createObligation(
          userId,
          req.body
        );

      await markBudgetStale(
        userId
      );

      return res
        .status(201)
        .json({
          success: true,
          obligation,
        });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to create obligation'
      );
    }
  }
);

router.patch(
  '/obligations/:id',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      const obligation =
        await updateObligation(
          userId,
          req.params.id,
          req.body
        );

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        obligation,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to update obligation'
      );
    }
  }
);

router.post(
  '/obligations/:id/pause',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      await pauseObligation(
        userId,
        req.params.id
      );

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        id:
          req.params.id,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to pause obligation'
      );
    }
  }
);

router.post(
  '/obligations/:id/resume',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      await resumeObligation(
        userId,
        req.params.id
      );

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        id:
          req.params.id,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to resume obligation'
      );
    }
  }
);

router.post(
  '/obligations/:id/complete',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      await completeObligation(
        userId,
        req.params.id
      );

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        id:
          req.params.id,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to complete obligation'
      );
    }
  }
);

router.post(
  '/obligations/:id/archive',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      await archiveObligation(
        userId,
        req.params.id
      );

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        id:
          req.params.id,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to archive obligation'
      );
    }
  }
);

router.delete(
  '/obligations/:id',
  async (
    req: AuthenticatedRequest,
    res
  ) => {
    try {
      const userId =
        req.user!.uid;

      await deleteObligation(
        userId,
        req.params.id
      );

      await markBudgetStale(
        userId
      );

      return res.json({
        success: true,
        id:
          req.params.id,
      });
    } catch (err: any) {
      return mapErrorToResponse(
        res,
        err,
        'Failed to delete obligation'
      );
    }
  }
);

// ============================================================
// Export
// ============================================================

export default router;
