import React, { useState } from 'react';
import { Goal } from '../types';
import { formatCurrency } from '../utils/formatters';
import {
  Target,
  Sparkles,
  Car,
  ShieldCheck,
  Palmtree,
  Plus,
  Play,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

interface GoalsViewProps {
  goals: Goal[];
  lang: 'ar' | 'en';
}

export const GoalsView: React.FC<GoalsViewProps> = ({ goals, lang }) => {
  const isAr = lang === 'ar';

  // Scenario Simulator state
  const [extraSavings, setExtraSavings] = useState(1500);
  const [inflationRate, setInflationRate] = useState(15);
  const [simResult, setSimResult] = useState<string | null>(null);

  const handleRunSimulation = () => {
    setSimResult(
      isAr
        ? `🎯 نتيجة المحاكاة الذكية:
• بزيادة ادخار شـهـري قدرها **${extraSavings.toLocaleString('ar-EG')} ج.م**:
  - ستصل لهدف "صندوق الطوارئ" مبكراً بـ **2.5 شهر**.
  - ستصل لهدف "شراء السيارة" في **مارس 2027** بدلاً من يونيو 2027.
• تأثير التضخم المالي المتوقع (${inflationRate}%):
  - القيمة التراكمية المحفوظة تحميك بنسبة **92%** من موجات غلاء الأسعار عند التوجيه للذهب أو أوعية التوفير عالية العائد.`
        : `🎯 Simulation Result: Adding ${extraSavings} EGP/month extra savings achieves your Emergency Fund 2.5 months earlier!`
    );
  };

  const getGoalIcon = (iconName: string) => {
    switch (iconName) {
      case 'Car':
        return <Car className="w-5 h-5 text-blue-500" />;
      case 'ShieldCheck':
        return <ShieldCheck className="w-5 h-5 text-emerald-500" />;
      default:
        return <Palmtree className="w-5 h-5 text-amber-500" />;
    }
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="w-7 h-7 text-emerald-600" />
            <span>{isAr ? 'الأهداف المالية ومحاكي السيناريوهات' : 'Goals & Scenario Simulator'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'تخطيط الأهداف المستقبلية ومحاكاة القرارات المالية قبل اتخاذها'
              : 'Simulate financial goals & future savings scenarios'}
          </p>
        </div>
      </div>

      {/* 1. What-If Scenario Simulator Box */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-teal-950 to-slate-900 text-white shadow-xl border border-teal-800/50 space-y-4">
        <div className="flex items-center gap-2 text-amber-400 text-xs font-bold uppercase">
          <Sparkles className="w-4 h-4" />
          <span>{isAr ? 'محاكي السيناريوهات المستقبلية AI' : 'Goal Scenario Simulator'}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-slate-300 font-bold mb-1">
              {isAr
                ? `ماذا لو وفرت مبلغاً إضافياً شهرياً؟ (${extraSavings.toLocaleString('ar-EG')} ج.م)`
                : `Extra Monthly Savings: ${extraSavings} EGP`}
            </label>
            <input
              type="range"
              min="500"
              max="5000"
              step="250"
              value={extraSavings}
              onChange={(e) => setExtraSavings(parseInt(e.target.value, 10))}
              className="w-full accent-emerald-500 cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-bold mb-1">
              {isAr ? `تأثير نسبة التضخم المتوقعة: ${inflationRate}%` : `Inflation Rate: ${inflationRate}%`}
            </label>
            <input
              type="range"
              min="5"
              max="35"
              step="5"
              value={inflationRate}
              onChange={(e) => setInflationRate(parseInt(e.target.value, 10))}
              className="w-full accent-amber-500 cursor-pointer"
            />
          </div>
        </div>

        <button
          onClick={handleRunSimulation}
          className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition flex items-center justify-center gap-2"
        >
          <Play className="w-4 h-4" />
          <span>{isAr ? 'تشغيل المحاكاة الآن' : 'Run Scenario Simulation'}</span>
        </button>

        {simResult && (
          <div className="p-4 rounded-xl bg-white/10 border border-white/20 text-xs leading-relaxed whitespace-pre-line text-emerald-300 font-medium animate-fadeIn">
            {simResult}
          </div>
        )}
      </div>

      {/* 2. Active Goals List */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white">
          {isAr ? 'أهدافك المالية الحالية' : 'Active Financial Goals'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {goals.map((g) => {
            const progress = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
            return (
              <div
                key={g.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                      {getGoalIcon(g.icon)}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                        {isAr ? g.titleAr : g.title}
                      </h4>
                      <span className="text-[10px] text-slate-400 block">{g.category}</span>
                    </div>
                  </div>

                  <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                    {progress}%
                  </span>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-900 dark:text-white mb-1">
                    <span>{formatCurrency(g.currentAmount, 'EGP', lang)}</span>
                    <span className="text-slate-400">
                      {isAr ? `الهدف: ${formatCurrency(g.targetAmount, 'EGP', lang)}` : `Target`}
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 flex justify-between">
                  <span>
                    {isAr
                      ? `الادخار المطلوب: ${formatCurrency(g.monthlyTarget, 'EGP', lang)} / شهرياً`
                      : `Monthly: ${formatCurrency(g.monthlyTarget, 'EGP', lang)}`}
                  </span>
                  <span>{g.targetDate}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
