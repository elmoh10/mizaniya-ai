import React from 'react';
import { Wallet, Bill, HealthScoreBreakdown } from '../types';
import { formatCurrency } from '../utils/formatters';
import { AppWindow, Zap, HeartPulse } from 'lucide-react';

interface WidgetsViewProps {
  wallets: Wallet[];
  bills: Bill[];
  healthScore: HealthScoreBreakdown | null;
  lang: 'ar' | 'en';
}

export const WidgetsView: React.FC<WidgetsViewProps> = ({
  wallets,
  bills,
  healthScore,
  lang,
}) => {
  const isAr = lang === 'ar';
  const totalBalance = wallets.reduce((acc, w) => acc + w.balance, 0);

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
          <AppWindow className="w-7 h-7 text-indigo-600" />
          <span>{isAr ? 'ويدجت الشاشة الرئيسية (Android & iOS)' : 'Home Screen Widgets'}</span>
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {isAr
            ? 'معاينة ويدجت المشروبات والفواتير السريعة لشاشة الهاتف الذكي'
            : 'Preview mobile home screen widgets for instant financial tracking'}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Widget 1: Quick Balance Widget */}
        <div className="p-5 rounded-3xl bg-slate-900 text-white shadow-xl border border-slate-800 space-y-3 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-bold flex items-center gap-1">
              🇪🇬 ميزانية AI
            </span>
            <span>الرصيد السيال</span>
          </div>

          <div className="text-2xl font-black text-emerald-400">
            {formatCurrency(totalBalance, 'EGP', lang)}
          </div>

          <div className="flex justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-800">
            <span>CIB: {formatCurrency(wallets[0]?.balance || 0, 'EGP', lang)}</span>
            <span>InstaPay: {formatCurrency(wallets[1]?.balance || 0, 'EGP', lang)}</span>
          </div>
        </div>

        {/* Widget 2: Health Score Widget */}
        <div className="p-5 rounded-3xl bg-gradient-to-tr from-emerald-950 to-slate-900 text-white shadow-xl border border-emerald-800/50 space-y-3">
          <div className="flex items-center justify-between text-xs text-emerald-400 font-bold">
            <span className="flex items-center gap-1">
              <HeartPulse className="w-4 h-4" />
              مؤشر الصحة
            </span>
            <span className="text-xl font-black">{healthScore ? `${healthScore.overallScore}%` : '--'}</span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {healthScore
              ? healthScore.recommendations[0]
              : 'قم بتسجيل معاملاتك لحساب مؤشر الصحة المالية من بياناتك الموثوقة.'}
          </p>
        </div>

        {/* Widget 3: Quick Bill Widget */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl space-y-3">
          <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
            <span className="flex items-center gap-1 text-indigo-600">
              <Zap className="w-4 h-4" />
              الفاتورة القادمة
            </span>
            <span className="text-rose-600">
              {bills.length > 0 ? formatCurrency(bills[0].amount, 'EGP', lang) : 'لا يوجد'}
            </span>
          </div>

          <p className="text-xs text-slate-500">
            {bills.length > 0
              ? `${bills[0].titleAr || bills[0].title} - استحقاق ${bills[0].dueDate}`
              : 'جميع الفواتير والالتزامات الحالية مسددة.'}
          </p>
        </div>
      </div>
    </div>
  );
};
