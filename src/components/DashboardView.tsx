import React from 'react';
import {
  Wallet,
  Transaction,
  Budget,
  Goal,
  Bill,
  HealthScoreBreakdown,
  InsightTimelineItem,
} from '../types';
import { formatCurrency, formatDate, getCategoryColor } from '../utils/formatters';
import {
  Wallet as WalletIcon,
  Zap,
  Smartphone,
  Banknote,
  Building2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  HeartPulse,
  CalendarCheck,
  Scan,
  Volume2,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';

interface DashboardViewProps {
  wallets: Wallet[];
  transactions: Transaction[];
  budget: Budget;
  goals: Goal[];
  bills: Bill[];
  healthScore: HealthScoreBreakdown | null;
  timeline: InsightTimelineItem[];
  lang: 'ar' | 'en';
  onNavigateTab: (tab: any) => void;
  onOpenVoice: () => void;
  onOpenScan: () => void;
  voiceEnabled?: boolean;
  ocrEnabled?: boolean;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  wallets,
  transactions,
  budget,
  goals,
  bills,
  healthScore,
  timeline,
  lang,
  onNavigateTab,
  onOpenVoice,
  onOpenScan,
  voiceEnabled = true,
  ocrEnabled = true,
}) => {
  const isAr = lang === 'ar';

  const totalBalance = wallets.reduce((acc, w) => acc + w.balance, 0);
  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((acc, t) => acc + t.amount, 0);
  const totalExpenses = transactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, t) => acc + t.amount, 0);

  const getWalletIcon = (iconName: string) => {
    switch (iconName) {
      case 'Building2':
        return <Building2 className="w-5 h-5 text-blue-500" />;
      case 'Zap':
        return <Zap className="w-5 h-5 text-emerald-500" />;
      case 'Smartphone':
        return <Smartphone className="w-5 h-5 text-red-500" />;
      default:
        return <Banknote className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
      {/* 1. Hero Summary Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 text-white p-6 sm:p-8 shadow-xl border border-emerald-900/50">
        <div className="absolute -top-12 -left-12 w-56 h-56 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-2">
              <Sparkles className="w-4 h-4 animate-spin-slow" />
              <span>{isAr ? 'إجمالي الأصول السيالة المتاحة (مصر)' : 'Total Liquid Capital'}</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              {formatCurrency(totalBalance, 'EGP', lang)}
            </h2>
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1.5">
              <span>{isAr ? 'حسابات بنكية ومحفظة إنستا باي وكاش' : 'CIB, InstaPay, Vodafone Cash & Pocket'}</span>
            </p>
          </div>

          {/* Quick AI Voice & Receipt Actions */}
          <div className="flex items-center gap-3">
            {ocrEnabled && <button
              onClick={onOpenScan}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition transform hover:-translate-y-0.5"
            >
              <Scan className="w-4 h-4" />
              <span>{isAr ? 'مسح فاتورة OCR' : 'Scan Receipt'}</span>
            </button>}
            {voiceEnabled && <button
              onClick={onOpenVoice}
              className="flex-1 md:flex-initial flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm backdrop-blur-md border border-white/20 transition transform hover:-translate-y-0.5"
            >
              <Volume2 className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span>{isAr ? 'أمر صوتی' : 'Voice Input'}</span>
            </button>}
          </div>
        </div>

        {/* Stats Row */}
        <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[11px] text-slate-400 block">{isAr ? 'الدخل هذا الشهر' : 'Month Income'}</span>
            <span className="text-base font-bold text-emerald-400 flex items-center gap-1 mt-1">
              <TrendingUp className="w-4 h-4" />
              {formatCurrency(totalIncome, 'EGP', lang)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[11px] text-slate-400 block">{isAr ? 'المصروفات الحالية' : 'Month Expense'}</span>
            <span className="text-base font-bold text-rose-400 flex items-center gap-1 mt-1">
              <TrendingDown className="w-4 h-4" />
              {formatCurrency(totalExpenses, 'EGP', lang)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[11px] text-slate-400 block">{isAr ? 'الميزانية المتبقية' : 'Budget Remaining'}</span>
            <span className="text-base font-bold text-cyan-400 mt-1 block">
              {formatCurrency(budget.totalIncome - totalExpenses, 'EGP', lang)}
            </span>
          </div>

          <div className="p-3 rounded-xl bg-white/5 border border-white/10">
            <span className="text-[11px] text-slate-400 block">{isAr ? 'الادخار المخصص' : 'Target Savings'}</span>
            <span className="text-base font-bold text-amber-400 mt-1 block">
              {formatCurrency(budget.allocatedSavings, 'EGP', lang)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Wallets Grid & Health Score Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Egyptian Wallets Cards */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <WalletIcon className="w-5 h-5 text-emerald-600" />
              <span>{isAr ? 'محافظك الحالية في مصر' : 'Egyptian Accounts & Wallets'}</span>
            </h3>
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 flex items-center gap-1"
            >
              <span>{isAr ? 'إدارة المحافظ' : 'Manage'}</span>
              {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {wallets.map((w) => (
              <div
                key={w.id}
                className="p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                    {getWalletIcon(w.icon)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {isAr ? w.nameAr : w.name}
                    </h4>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {w.accountNumber || w.type}
                    </span>
                  </div>
                </div>
                <div className="text-left font-bold text-sm text-slate-900 dark:text-white">
                  {formatCurrency(w.balance, 'EGP', lang)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Health Score Widget */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 via-teal-500/5 to-transparent border border-emerald-500/20 dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartPulse className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {isAr ? 'مؤشر الصحة المالية' : 'Health Score'}
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('health')}
              className="text-xs font-bold text-emerald-600 hover:underline"
            >
              {isAr ? 'التفاصيل' : 'Details'}
            </button>
          </div>

          {healthScore ? (
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 flex items-center justify-center rounded-full bg-emerald-600 text-white font-black text-2xl shadow-lg shadow-emerald-600/30">
                {healthScore.overallScore}
                <span className="text-xs font-normal text-emerald-200">%</span>
              </div>
              <div className="space-y-1">
                <span className="inline-block px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {isAr ? 'مؤشر حسابي حي' : 'Live Score'}
                </span>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {healthScore.recommendations[0]}
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-slate-500 dark:text-slate-400 space-y-1">
              <p className="font-bold">{isAr ? 'بيانات غير كافية' : 'Insufficient Data'}</p>
              <p>{isAr ? 'أضف معاملات لحساب المؤشر' : 'Add data to view score'}</p>
            </div>
          )}
        </div>
      </div>

      {/* 3. Cash Flow Forecast & Upcoming Bills Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Cash Flow Forecast Box */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-500" />
              <h3 className="font-bold text-base text-slate-900 dark:text-white">
                {isAr ? 'محاكي التنبؤ بالتدفق النقدي (مصر)' : 'Cash Flow Forecast Engine'}
              </h3>
            </div>
            <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold px-2 py-0.5 rounded-full">
              توقع AI
            </span>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 space-y-3">
            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {isAr
                ? '📊 يتوقع المساعد المالي استقرار سيولتك الشهرية لتغطية التزامات الفواتير والأقساط المسجلة في حسابك.'
                : '📊 Liquidity expected safe for upcoming bill obligations.'}
            </p>

            <div className="w-full bg-slate-200 dark:bg-slate-700 h-2.5 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-emerald-500 via-teal-500 to-amber-500 h-full w-[76%]" />
            </div>
          </div>
        </div>

        {/* Upcoming Bills & Subscriptions Quick Box */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarCheck className="w-5 h-5 text-indigo-600" />
              <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                {isAr ? 'الفواتير القادمة' : 'Upcoming Bills'}
              </h3>
            </div>
            <button
              onClick={() => onNavigateTab('bills')}
              className="text-xs font-bold text-indigo-600 hover:underline"
            >
              {isAr ? 'عرض الكل' : 'View All'}
            </button>
          </div>

          <div className="space-y-2.5">
            {bills.slice(0, 2).map((b) => (
              <div
                key={b.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between"
              >
                <div>
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                    {isAr ? b.titleAr : b.title}
                  </h4>
                  <span className="text-[10px] text-slate-500">
                    {isAr ? `تاريخ الاستحقاق: ${b.dueDate}` : `Due: ${b.dueDate}`}
                  </span>
                </div>
                <div className="text-left">
                  <span className="font-bold text-xs text-rose-600 dark:text-rose-400 block">
                    {formatCurrency(b.amount, 'EGP', lang)}
                  </span>
                  <span className="text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 px-1.5 py-0.5 rounded font-bold">
                    فوري / InstaPay
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. AI Insights Timeline & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Timeline */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-600" />
              <span>{isAr ? 'سجل الملاحظات والذكاء المالي' : 'AI Insights Timeline'}</span>
            </h3>
            <span className="text-xs text-slate-400">{isAr ? 'تحديث حي' : 'Live Feed'}</span>
          </div>

          <div className="space-y-3">
            {timeline.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-xl border ${item.color} space-y-1 transition hover:scale-[1.01]`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">
                    {isAr ? item.titleAr : item.title}
                  </span>
                  <span className="text-[10px] opacity-80">{item.date}</span>
                </div>
                <p className="text-xs opacity-90 leading-relaxed">
                  {isAr ? item.descriptionAr : item.description}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Transactions List */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-rose-500" />
              <span>{isAr ? 'أحدث المعاملات المسجلة' : 'Recent Transactions'}</span>
            </h3>
            <button
              onClick={() => onNavigateTab('transactions')}
              className="text-xs font-bold text-emerald-600 hover:underline"
            >
              {isAr ? 'عرض الكل' : 'View All'}
            </button>
          </div>

          <div className="space-y-2.5">
            {transactions.slice(0, 4).map((t) => (
              <div
                key={t.id}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 flex items-center justify-between"
              >
                <div className="space-y-0.5">
                  <h4 className="font-bold text-xs text-slate-900 dark:text-white">
                    {t.title}
                  </h4>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{t.merchant || t.paymentMethod}</span>
                    <span>•</span>
                    <span className={`px-1.5 py-0.5 rounded ${getCategoryColor(t.category)}`}>
                      {t.category}
                    </span>
                  </div>
                </div>

                <div className="text-left">
                  <span
                    className={`font-bold text-xs ${
                      t.type === 'income' ? 'text-emerald-600' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {t.type === 'income' ? '+' : '-'}
                    {formatCurrency(t.amount, 'EGP', lang)}
                  </span>
                  <span className="text-[10px] text-slate-400 block">{formatDate(t.date, lang)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
