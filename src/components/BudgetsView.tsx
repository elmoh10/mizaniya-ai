import React, { useEffect, useState } from 'react';
import { Budget } from '../types';
import { formatCurrency } from '../utils/formatters';
import { apiClient } from '../services/apiClient';
import {
  Sparkles,
  RefreshCw,
  ShoppingBag,
  Home,
  CreditCard,
  Car,
  Coffee,
  ShieldAlert,
  AlertTriangle,
  Wallet,
  CheckCircle2,
  AlertCircle,
  PiggyBank,
} from 'lucide-react';

interface BudgetsViewProps {
  budget: Budget;
  onUpdateBudget: (newBudget: Budget) => void;
  lang: 'ar' | 'en';
  onNavigateTab?: (tab: string) => void;
}

export const BudgetsView: React.FC<BudgetsViewProps> = ({
  budget,
  onUpdateBudget,
  lang,
  onNavigateTab,
}) => {
  const isAr = lang === 'ar';

  // ============================================================
  // Budget States
  // ============================================================

  const [savingsPercent, setSavingsPercent] = useState(
    budget.targetSavingsPercent ||
      budget.savingsTargetPercent ||
      20
  );

  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Canonical salary from trusted backend financial context
  const [profileSalary, setProfileSalary] = useState<number | null>(
    null
  );

  const [
    isLoadingFinancialContext,
    setIsLoadingFinancialContext,
  ] = useState(true);

  // ============================================================
  // Load Trusted Financial Context
  // ============================================================

  const loadFinancialContext = async () => {
    try {
      const res = await apiClient.get('/financial-context');

      if (res.success && res.context) {
        setProfileSalary(
          Number(res.context.salary || 0)
        );
      } else {
        setProfileSalary(0);
      }
    } catch (err) {
      console.error(
        'Failed to load financial context:',
        err
      );

      setProfileSalary(0);
    } finally {
      setIsLoadingFinancialContext(false);
    }
  };

  useEffect(() => {
    loadFinancialContext();
  }, []);

  // ============================================================
  // Smart Budget Snapshot
  // ============================================================

  const bAny = budget as any;

  // Trusted profile salary is canonical.
  // Budget salary values remain fallback only.
  const salary =
    profileSalary ??
    Number(
      bAny.salary ||
        budget.totalSalary ||
        budget.totalIncome ||
        0
    );

  const alreadySpent =
    Number(bAny.alreadySpent || 0);

  const unpaidBills =
    Number(bAny.unpaidBills || 0);

  const outstandingDebtPayments =
    Number(bAny.outstandingDebtPayments || 0);

  const outstandingObligations =
    Number(bAny.outstandingObligations || 0);

  const totalCommittedRemaining =
    Number(bAny.totalCommittedRemaining || 0);

  const savingsTargetAmount =
    Number(
      bAny.savingsTargetAmount ||
        budget.allocatedSavings ||
        Math.round(
          salary *
            (savingsPercent / 100)
        )
    );

  const savingsAlreadyAchieved =
    Number(bAny.savingsAlreadyAchieved || 0);

  const remainingSavingsTarget =
    bAny.remainingSavingsTarget !== undefined
      ? Number(bAny.remainingSavingsTarget)
      : Math.max(
          0,
          savingsTargetAmount -
            savingsAlreadyAchieved
        );

  const safeToSpend =
    bAny.safeToSpend !== undefined
      ? Number(bAny.safeToSpend)
      : Math.max(
          0,
          salary -
            alreadySpent -
            totalCommittedRemaining -
            remainingSavingsTarget
        );

  const aiAdvice =
    bAny.aiAdvice || '';

  const warnings: string[] =
    Array.isArray(bAny.warnings)
      ? bAny.warnings
      : [];

  // ============================================================
  // Generate / Recalculate Smart Budget
  // ============================================================

  const handleGenerateAutoBudget = async () => {
    setErrorMsg(null);
    setIsGenerating(true);

    try {
      const res = await apiClient.post(
        '/ai/generate-budget',
        {
          savingsTargetPercent:
            savingsPercent,
        }
      );

      if (!res.success || !res.data) {
        throw new Error(
          res.error ||
            'Failed to generate budget'
        );
      }

      onUpdateBudget(res.data);

      // Re-read canonical financial context after generation.
      await loadFinancialContext();
    } catch (err: any) {
      console.error(
        'Failed to auto generate budget:',
        err
      );

      setErrorMsg(
        isAr
          ? 'فشل إنشاء الميزانية بالذكاء الاصطناعي.'
          : 'Failed to generate budget via AI.'
      );
    } finally {
      setIsGenerating(false);
    }
  };

  // ============================================================
  // Loading Trusted Financial Context
  // ============================================================

  if (isLoadingFinancialContext) {
    return (
      <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4 max-w-lg mx-auto shadow-sm mt-12">
        <RefreshCw className="w-8 h-8 text-emerald-500 mx-auto animate-spin" />

        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
          {isAr
            ? 'جاري تحميل بياناتك المالية...'
            : 'Loading your financial data...'}
        </p>
      </div>
    );
  }

  // ============================================================
  // No Salary State
  // ============================================================

  if (salary <= 0) {
    return (
      <div className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4 max-w-lg mx-auto shadow-sm mt-12 animate-fadeIn text-slate-800 dark:text-slate-100">
        <AlertCircle className="w-12 h-12 text-rose-500 mx-auto" />

        <h3 className="text-lg font-black">
          {isAr
            ? 'حدد مرتبك الشهري أولاً'
            : 'Please set your monthly salary first'}
        </h3>

        <p className="text-xs text-slate-500 dark:text-slate-400">
          {isAr
            ? 'يتطلب حساب الميزانية وجود مرتب شهري مسجل في ملفك المالي لكي نضمن لك خطة ادخار آمنة ودقيقة.'
            : 'Calculating a budget requires a registered monthly salary in your financial profile.'}
        </p>

        <button
          onClick={() =>
            onNavigateTab?.('profile')
          }
          className="px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition"
        >
          {isAr
            ? 'تحديث البيانات المالية'
            : 'Update Financial Profile'}
        </button>
      </div>
    );
  }

  // ============================================================
  // Category Icon
  // ============================================================

  const getCategoryIcon = (
    catName: string
  ) => {
    switch (catName) {
      case 'Food & Groceries':
        return (
          <ShoppingBag className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
        );

      case 'Housing & Utilities':
        return (
          <Home className="w-5 h-5 text-sky-500 dark:text-sky-400" />
        );

      case 'Installments & Debt':
        return (
          <CreditCard className="w-5 h-5 text-rose-500 dark:text-rose-400" />
        );

      case 'Transport & Ride Apps':
        return (
          <Car className="w-5 h-5 text-amber-500 dark:text-amber-400" />
        );

      case 'Shopping & Entertainment':
        return (
          <Coffee className="w-5 h-5 text-purple-500 dark:text-purple-400" />
        );

      case 'Emergency & Savings':
        return (
          <PiggyBank className="w-5 h-5 text-teal-500 dark:text-teal-400" />
        );

      default:
        return (
          <ShieldAlert className="w-5 h-5 text-slate-500 dark:text-slate-400" />
        );
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn text-slate-800 dark:text-slate-100">

      {/* ===================================================== */}
      {/* Staleness Warning */}
      {/* ===================================================== */}

      {bAny.isStale && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 animate-bounce" />

            <div>
              <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                {isAr
                  ? 'بياناتك المالية اتغيرت من آخر مرة تم إنشاء الميزانية'
                  : 'Your financial facts have changed since the budget was last generated.'}
              </p>

              <p className="text-[10px] text-amber-600 dark:text-amber-400">
                {isAr
                  ? 'هناك تغييرات جديدة في معاملاتك أو ديونك أو فواتيرك.'
                  : 'There are new changes in your transactions, debts, or bills.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleGenerateAutoBudget}
            disabled={isGenerating}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs transition shrink-0 disabled:opacity-50 shadow-sm h-9"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                isGenerating
                  ? 'animate-spin'
                  : ''
              }`}
            />

            <span>
              {isAr
                ? 'تحديث الميزانية'
                : 'Recalculate Budget'}
            </span>
          </button>
        </div>
      )}

      {/* ===================================================== */}
      {/* Top Budget Control Panel */}
      {/* ===================================================== */}

      <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">

          <div>
            <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-semibold mb-1">
              <Sparkles className="w-4 h-4 animate-pulse" />

              <span>
                {isAr
                  ? 'كوتش الميزانية التلقائي والمستدام'
                  : 'Smart Autonomous Budget Engine'}
              </span>
            </div>

            <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
              {isAr
                ? `ميزانية شهر ${
                    budget.month || ''
                  } ${budget.year || ''}`
                : `Budget for ${
                    budget.month || ''
                  } ${budget.year || ''}`}
            </h2>

            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isAr
                ? 'ميزانية مبنية على الحسابات الرياضية الحقيقية لمرتبك والتزاماتك لتفادي الاستدانة'
                : '100% mathematically accurate budget derived from your real-time obligations'}
            </p>
          </div>

          <button
            onClick={handleGenerateAutoBudget}
            disabled={isGenerating}
            className="flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition disabled:opacity-50 h-11"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                isGenerating
                  ? 'animate-spin'
                  : ''
              }`}
            />

            <span>
              {isAr
                ? 'إعادة حساب الميزانية الفورية'
                : 'Recalculate Budget'}
            </span>
          </button>
        </div>

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ================================================= */}
        {/* Salary + Savings Slider */}
        {/* ================================================= */}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-slate-200 dark:border-slate-800 text-xs">

          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1.5 font-bold">
              {isAr
                ? 'إجمالي المرتب الشهري المسجل (EGP) - للقراءة فقط'
                : 'Canonical Monthly Salary (Read-Only)'}
            </label>

            <div className="w-full h-11 px-4 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-bold text-sm flex items-center shadow-inner">
              {formatCurrency(
                salary,
                'EGP',
                lang
              )}
            </div>
          </div>

          <div>
            <label className="block text-slate-500 dark:text-slate-400 mb-1.5 font-bold">
              {isAr
                ? `نسبة الادخار المستهدفة: ${savingsPercent}%`
                : `Savings Target Percent: ${savingsPercent}%`}
            </label>

            <div className="flex items-center gap-3 h-11">
              <input
                type="range"
                min="5"
                max="40"
                step="5"
                value={savingsPercent}
                onChange={(e) =>
                  setSavingsPercent(
                    parseInt(
                      e.target.value,
                      10
                    )
                  )
                }
                className="w-full accent-emerald-600 dark:accent-emerald-400 cursor-pointer"
              />

              <span className="font-bold text-sm bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg">
                {savingsPercent}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* AI Advice */}
      {/* ===================================================== */}

      {aiAdvice && (
        <div className="p-5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40 space-y-2">

          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-400 font-bold text-xs">
            <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />

            <span>
              {isAr
                ? 'نصيحة الكوتش المالي المساعد'
                : 'Financial Coach Advice'}
            </span>
          </div>

          <p className="text-sm text-emerald-900 dark:text-emerald-300 leading-relaxed font-medium">
            {aiAdvice}
          </p>
        </div>
      )}

      {/* ===================================================== */}
      {/* Warnings */}
      {/* ===================================================== */}

      {warnings.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50 space-y-2">

          <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-black text-xs">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />

            <span>
              {isAr
                ? 'تنبيهات ماليّة هامة'
                : 'Important Budget Warnings'}
            </span>
          </div>

          <ul className="list-disc list-inside text-xs text-amber-900 dark:text-amber-300 space-y-1 font-semibold">
            {warnings.map(
              (
                warn: string,
                idx: number
              ) => (
                <li key={idx}>
                  {warn}
                </li>
              )
            )}
          </ul>
        </div>
      )}

      {/* ===================================================== */}
      {/* Financial Analytics */}
      {/* ===================================================== */}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Safe to Spend */}

        <div className="p-6 rounded-2xl bg-emerald-900 text-white shadow-md border border-emerald-800 relative overflow-hidden flex flex-col justify-between min-h-[170px]">

          <div className="absolute right-0 bottom-0 translate-x-4 translate-y-4 opacity-5">
            <Wallet className="w-40 h-40" />
          </div>

          <div className="space-y-1">

            <div className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold tracking-wider uppercase">
              <Wallet className="w-4 h-4 text-emerald-300" />

              <span>
                {isAr
                  ? 'الكاش المتاح للإنفاق الآمن'
                  : 'Safe-to-Spend Balance'}
              </span>
            </div>

            <h3 className="text-4xl font-black text-white">
              {formatCurrency(
                safeToSpend,
                'EGP',
                lang
              )}
            </h3>
          </div>

          <p className="text-xs text-emerald-100 font-medium leading-relaxed max-w-md mt-4">
            {isAr
              ? 'هذا الكاش متاح ومصرح لك بإنفاقه كليّاً بمجرد خصم الالتزامات الشهرية والادخار المستهدف دون المساس بسلامتك الماليّة.'
              : 'This cash is fully authorized for flexible spending. Your obligations and target savings are already secured.'}
          </p>
        </div>

        {/* Smart Summary */}

        <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">

          <h4 className="font-bold text-xs text-slate-400 uppercase tracking-wider mb-4">
            {isAr
              ? 'ملخص التدفق المالي الذكي'
              : 'Smart Cash Flow Summary'}
          </h4>

          <div className="grid grid-cols-2 gap-4 text-xs font-bold">

            <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900">
              <span className="text-slate-400 block mb-1 font-semibold">
                {isAr
                  ? 'المرتب الفعلي'
                  : 'Canonical Salary'}
              </span>

              <span className="text-sm text-slate-800 dark:text-slate-200">
                {formatCurrency(
                  salary,
                  'EGP',
                  lang
                )}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900">
              <span className="text-slate-400 block mb-1 font-semibold">
                {isAr
                  ? 'المصروف هذا الشهر'
                  : 'Expenses Paid'}
              </span>

              <span className="text-sm text-amber-600">
                {formatCurrency(
                  alreadySpent,
                  'EGP',
                  lang
                )}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900">
              <span className="text-slate-400 block mb-1 font-semibold">
                {isAr
                  ? 'الالتزامات المتبقية'
                  : 'Committed Remaining'}
              </span>

              <span className="text-sm text-rose-500">
                {formatCurrency(
                  totalCommittedRemaining,
                  'EGP',
                  lang
                )}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900">
              <span className="text-slate-400 block mb-1 font-semibold">
                {isAr
                  ? 'الادخار المتبقي'
                  : 'Savings Goal'}
              </span>

              <span className="text-sm text-teal-500">
                {formatCurrency(
                  remainingSavingsTarget,
                  'EGP',
                  lang
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* Commitments */}
      {/* ===================================================== */}

      <div className="p-6 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">

        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            {isAr
              ? 'تفاصيل وجدولة الالتزامات الشهرية المتبقية'
              : 'Monthly Commitments Schedule'}
          </h3>

          <p className="text-xs text-slate-500">
            {isAr
              ? 'قائمة الاستقطاعات الحتمية والديون والفواتير غير المدفوعة لهذا الشهر'
              : 'List of deterministic payments, debts, and bills remaining'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Unpaid Bills */}

          <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-900 flex items-center justify-between">

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">
                {isAr
                  ? 'فواتير غير مدفوعة'
                  : 'Unpaid Bills'}
              </span>

              <span className="text-sm font-bold block">
                {formatCurrency(
                  unpaidBills,
                  'EGP',
                  lang
                )}
              </span>
            </div>

            {unpaidBills === 0 ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                {isAr
                  ? 'مستحق'
                  : 'Due'}
              </span>
            )}
          </div>

          {/* Debt Payments */}

          <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-900 flex items-center justify-between">

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">
                {isAr
                  ? 'أقساط ديون متبقية'
                  : 'Debt Installments'}
              </span>

              <span className="text-sm font-bold block">
                {formatCurrency(
                  outstandingDebtPayments,
                  'EGP',
                  lang
                )}
              </span>
            </div>

            {outstandingDebtPayments ===
            0 ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                {isAr
                  ? 'نشط'
                  : 'Active'}
              </span>
            )}
          </div>

          {/* Obligations */}

          <div className="p-4 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-900 flex items-center justify-between">

            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-400 block uppercase">
                {isAr
                  ? 'التزامات شخصية مستحقة'
                  : 'Monthly Obligations'}
              </span>

              <span className="text-sm font-bold block">
                {formatCurrency(
                  outstandingObligations,
                  'EGP',
                  lang
                )}
              </span>
            </div>

            {outstandingObligations ===
            0 ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            ) : (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-300">
                {isAr
                  ? 'مستحق'
                  : 'Due'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ===================================================== */}
      {/* Budget Categories */}
      {/* ===================================================== */}

      <div className="space-y-4">

        <div>
          <h3 className="font-bold text-sm text-slate-900 dark:text-white">
            {isAr
              ? 'تقسيم ميزانية المصروفات المرنة والادخار'
              : 'Flexible Spending & Savings Allocation'}
          </h3>

          <p className="text-xs text-slate-500">
            {isAr
              ? 'كيفية توزيع الجزء المرن المتبقي من الراتب على فئات المعيشة'
              : 'Detailed visual progress breakdown for each budget category'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(budget.categories || []).map(
            (cat: any, idx: number) => {
              const allocatedAmount =
                Number(
                  cat.allocatedAmount ||
                    cat.amount ||
                    0
                );

              const spentAmount =
                Number(
                  cat.spentAmount || 0
                );

              const percentUsed =
                Math.min(
                  100,
                  Math.round(
                    (spentAmount /
                      (allocatedAmount ||
                        1)) *
                      100
                  )
                );

              const isOverbudget =
                spentAmount >
                allocatedAmount;

              const categoryKey =
                cat.categoryKey ||
                cat.category ||
                '';

              return (
                <div
                  key={
                    cat.categoryKey ||
                    cat.category ||
                    idx
                  }
                  className="p-4 rounded-2xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-900 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">

                    <div className="flex items-center gap-3">

                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800/80">
                        {getCategoryIcon(
                          categoryKey
                        )}
                      </div>

                      <div>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">

                          <span>
                            {isAr
                              ? cat.categoryAr ||
                                cat.name ||
                                categoryKey
                              : categoryKey}
                          </span>

                          {cat.status ===
                            'HIGH' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-rose-100 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
                              {isAr
                                ? 'قريب من النفاد'
                                : 'High'}
                            </span>
                          )}

                          {cat.status ===
                            'WARNING' && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                              {isAr
                                ? 'تحذير'
                                : 'Warning'}
                            </span>
                          )}
                        </h4>

                        <span className="text-[11px] text-slate-500 block">
                          {isAr
                            ? `الحد المخصص: ${formatCurrency(
                                allocatedAmount,
                                'EGP',
                                lang
                              )}`
                            : `Allocated limit: ${formatCurrency(
                                allocatedAmount,
                                'EGP',
                                lang
                              )}`}
                        </span>
                      </div>
                    </div>

                    <div className="text-left font-bold text-sm">

                      <span
                        className={
                          isOverbudget
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-900 dark:text-white'
                        }
                      >
                        {formatCurrency(
                          spentAmount,
                          'EGP',
                          lang
                        )}
                      </span>

                      <span className="text-xs text-slate-400 block font-semibold">
                        {percentUsed}%
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}

                  <div className="w-full bg-slate-100 dark:bg-slate-900 h-2.5 rounded-full overflow-hidden">

                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        isOverbudget
                          ? 'bg-rose-600'
                          : cat.status ===
                                'HIGH' ||
                              percentUsed >=
                                90
                            ? 'bg-rose-400'
                            : cat.status ===
                                  'WARNING' ||
                                percentUsed >=
                                  75
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                      }`}
                      style={{
                        width: `${percentUsed}%`,
                      }}
                    />
                  </div>

                  {isOverbudget && (
                    <div className="p-2 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900/40 text-[10px] text-rose-800 dark:text-rose-400 font-bold flex items-center gap-1.5">

                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />

                      <span>
                        {isAr
                          ? 'لقد تجاوزت ميزانية الفئة! يرجى التحكم في الصرف.'
                          : 'Overbudget! Control your spending in this category.'}
                      </span>
                    </div>
                  )}
                </div>
              );
            }
          )}
        </div>
      </div>
    </div>
  );
};
