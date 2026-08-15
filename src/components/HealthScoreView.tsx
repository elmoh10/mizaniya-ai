import React from 'react';
import { HealthScoreBreakdown, Challenge } from '../types';
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
  challenges?: Challenge[];
  smartInsights?: any;
}

export const HealthScoreView: React.FC<HealthScoreViewProps> = ({
  healthScore,
  lang,
  challenges = [],
  smartInsights,
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


      {healthScore.recommendations?.length > 0 && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
          <h3 className="font-bold text-base text-slate-900 dark:text-white">
            {isAr ? 'خطوات لتحسين المؤشر' : 'How to improve your score'}
          </h3>
          <div className="space-y-2">
            {healthScore.recommendations.map((r, idx) => (
              <div key={idx} className="flex gap-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                <span className="font-black text-emerald-500">{idx + 1}.</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {smartInsights && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">{isAr ? 'ذكاء الإنفاق الاستباقي' : 'Proactive Spending Intelligence'}</h3>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><div className="text-slate-500">{isAr ? 'المتاح الآمن يوميًا' : 'Safe daily spend'}</div><div className="font-black text-emerald-500 mt-1">{Number(smartInsights.safeDaily || 0).toLocaleString()} ج.م</div></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><div className="text-slate-500">{isAr ? 'أيام السيولة' : 'Cash runway'}</div><div className="font-black text-cyan-500 mt-1">{smartInsights.runwayDays ?? '—'} {isAr ? 'يوم' : 'days'}</div></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><div className="text-slate-500">{isAr ? 'مقارنة بالشهر السابق' : 'vs previous month'}</div><div className={`font-black mt-1 ${Number(smartInsights.monthChangePercent || 0) > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>{smartInsights.monthChangePercent == null ? '—' : `${smartInsights.monthChangePercent > 0 ? '+' : ''}${smartInsights.monthChangePercent}%`}</div></div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><div className="text-slate-500">{isAr ? 'عجز السيولة المتوقع' : 'Cash crunch date'}</div><div className="font-black text-amber-500 mt-1">{smartInsights.estimatedCashCrunchDate || (isAr ? 'غير متوقع' : 'Not expected')}</div></div>
            </div>
            {(smartInsights.recommendations || []).slice(0,4).map((r:string,i:number)=><div key={i} className="text-xs text-slate-600 dark:text-slate-300 flex gap-2"><span className="text-emerald-500 font-black">{i+1}.</span><span>{r}</span></div>)}
          </div>
          <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h3 className="font-bold text-base text-slate-900 dark:text-white">{isAr ? 'المصروفات غير المعتادة' : 'Spending Anomalies'}</h3>
            {(smartInsights.anomalies || []).length === 0 ? <div className="text-xs text-slate-500 p-4 text-center">{isAr ? 'لم يتم اكتشاف مصروفات غير معتادة هذا الشهر.' : 'No unusual spending detected this month.'}</div> : (smartInsights.anomalies || []).map((a:any)=><div key={a.id} className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20"><div className="flex justify-between gap-2 text-xs font-bold"><span>{a.title}</span><span className="text-amber-500">{Number(a.amount).toLocaleString()} ج.م</span></div><div className="text-[11px] text-slate-500 mt-1">{isAr ? a.reasonAr : a.reason}</div></div>)}
          </div>
        </div>
      )}

      {/* Active Gamified Challenges */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-500" />
          <span>{isAr ? 'التحديات المالية النشطة' : 'Active Financial Challenges'}</span>
        </h3>

        {challenges.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-500">
            {isAr ? 'سيتم إنشاء تحديات تلقائية بعد توفر بيانات صرف وميزانية كافية.' : 'Challenges will appear automatically when enough spending and budget data is available.'}
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {challenges.map((c) => (
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
        )}
      </div>
    </div>
  );
};
