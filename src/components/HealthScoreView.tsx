import React from 'react';
import { HealthScoreBreakdown } from '../types';
import { initialChallenges } from '../data/initialData';
import {
  HeartPulse,
  Award,
  UtensilsCrossed,
  Coffee,
  PiggyBank,
  Info,
} from 'lucide-react';

interface HealthScoreViewProps {
  healthScore: HealthScoreBreakdown | null;
  lang: 'ar' | 'en';
}

export const HealthScoreView: React.FC<HealthScoreViewProps> = ({
  healthScore,
  lang,
}) => {
  const isAr = lang === 'ar';

  if (!healthScore) {
    return (
      <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
              <HeartPulse className="w-7 h-7 text-emerald-600" />
              <span>{isAr ? 'مؤشر الصحة المالية والتحديات' : 'Financial Health & Challenges'}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {isAr
                ? 'تقييم ذكي متواصل من 0 إلى 100 يعتمد على بياناتك الحقيقية المسجلة'
                : 'Dynamic 0-100 financial health score calculated from real data'}
            </p>
          </div>
        </div>

        <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <Info className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              {isAr ? 'بيانات مالية غير كافية لحساب المؤشر' : 'Insufficient Financial Data'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {isAr
                ? 'لم نتمكن من حساب مؤشر الصحة المالية بعد. قم بإضافة معاملاتك الشهرية، محافظك المالية، أو خطة الميزانية البدء بالتحليل التلقائي.'
                : 'Add transactions, wallets, and budget details to start generating your real financial health score.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const dimensions = [
    { nameAr: 'استقرار الدخل والراتب', nameEn: 'Income Stability', score: healthScore.incomeStabilityScore },
    { nameAr: 'معدل الادخار الشهري', nameEn: 'Savings Rate', score: healthScore.savingsRateScore },
    { nameAr: 'نسبة الديون والأقساط', nameEn: 'Debt Ratio', score: healthScore.debtRatioScore },
    { nameAr: 'الالتزام بالميزانية الذكية', nameEn: 'Budget Discipline', score: healthScore.budgetDisciplineScore },
    { nameAr: 'جاهزية صندوق الطوارئ', nameEn: 'Emergency Fund', score: healthScore.emergencyFundScore },
  ];

  const getChallengeIcon = (iconName: string) => {
    switch (iconName) {
      case 'UtensilsCrossed':
        return <UtensilsCrossed className="w-5 h-5 text-emerald-500" />;
      case 'Coffee':
        return <Coffee className="w-5 h-5 text-amber-500" />;
      default:
        return <PiggyBank className="w-5 h-5 text-indigo-500" />;
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <HeartPulse className="w-7 h-7 text-emerald-600" />
            <span>{isAr ? 'مؤشر الصحة المالية والتحديات' : 'Financial Health & Challenges'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'تقييم ذكي متواصل يعتمد على بياناتك الحقيقية المسجلة في الخادم'
              : 'Dynamic 0-100 financial health score from verified server calculations'}
          </p>
        </div>
      </div>

      {/* Main Score Hero Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-emerald-900 via-slate-900 to-teal-950 text-white shadow-xl border border-emerald-800/50 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-6">
          <div className="relative w-28 h-28 flex items-center justify-center rounded-full bg-emerald-600 font-black text-4xl shadow-2xl shadow-emerald-500/40 text-white ring-4 ring-emerald-400/30">
            {healthScore.overallScore}
            <span className="text-sm font-bold text-emerald-200">%</span>
          </div>

          <div className="space-y-1">
            <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30">
              {isAr ? 'مؤشر حسابي حقيقي' : 'Calculated Score'}
            </span>
            <h3 className="text-xl font-bold">
              {isAr ? 'تقييم وضعك المالي الحقيقي' : 'Real Financial Assessment'}
            </h3>
            <p className="text-xs text-slate-300 max-w-md">
              {isAr
                ? 'مستند إلى تحليل معاملاتك الفعلية والرصيد المتاح والأقساط المسجلة.'
                : 'Based on actual registered transactions, balances, and bill obligations.'}
            </p>
          </div>
        </div>
      </div>

      {/* Breakdown Dimensions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dimensions.map((dim, idx) => (
          <div
            key={idx}
            className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2"
          >
            <div className="flex justify-between items-center text-xs font-bold text-slate-900 dark:text-white">
              <span>{isAr ? dim.nameAr : dim.nameEn}</span>
              <span className="text-emerald-600 font-black">{dim.score}%</span>
            </div>

            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                style={{ width: `${dim.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Active Gamified Challenges */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          <span>{isAr ? 'التحديات المالية النشطة' : 'Active Financial Challenges'}</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {initialChallenges.map((c) => (
            <div
              key={c.id}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                    {getChallengeIcon(c.badgeIcon)}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                      {isAr ? c.titleAr : c.title}
                    </h4>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                      +{c.rewardPoints} {isAr ? 'نقطة مكافأة' : 'Pts'}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">{c.description}</p>

              <div>
                <div className="flex justify-between text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  <span>{isAr ? 'التقدم:' : 'Progress:'}</span>
                  <span>{c.currentProgressPercent}%</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-amber-500 h-full rounded-full"
                    style={{ width: `${c.currentProgressPercent}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
