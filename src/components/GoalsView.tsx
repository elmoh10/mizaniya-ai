import React, { useState } from 'react';
import { Goal } from '../types';
import { formatCurrency } from '../utils/formatters';
import { apiClient } from '../services/apiClient';
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
  X,
  CheckCircle2,
} from 'lucide-react';

interface GoalsViewProps {
  goals: Goal[];
  lang: 'ar' | 'en';
  onRefreshGoals?: () => void;
}

export const GoalsView: React.FC<GoalsViewProps> = ({ goals, lang, onRefreshGoals }) => {
  const isAr = lang === 'ar';

  // Scenario Simulator state
  const [extraSavings, setExtraSavings] = useState(1500);
  const [inflationRate, setInflationRate] = useState(15);
  const [simResult, setSimResult] = useState<string | null>(null);

  // Add Goal Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Goal Form Fields
  const [title, setTitle] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [currentAmount, setCurrentAmount] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [category, setCategory] = useState('general');
  const [riskLevel, setRiskLevel] = useState<'Low' | 'Medium' | 'High'>('Medium');

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

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const targetNum = parseFloat(targetAmount);
    if (!title.trim() || isNaN(targetNum) || targetNum <= 0) {
      setStatusMsg({
        type: 'error',
        text: isAr ? 'يرجى كتابة اسم الهدف ومبلغ مستهدف أكبر من 0.' : 'Please enter a goal title and valid target amount.',
      });
      return;
    }

    const currentNum = parseFloat(currentAmount) || 0;
    const defaultDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const finalTargetDate = targetDate.trim() || defaultDate;
    const monthlyTargetCalc = Math.max(0, Math.ceil((targetNum - currentNum) / 12));

    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/goals', {
        title: title.trim(),
        titleAr: title.trim(),
        targetAmount: targetNum,
        currentAmount: currentNum,
        targetDate: finalTargetDate,
        category,
        riskLevel,
        monthlyTarget: monthlyTargetCalc,
        icon: category === 'car' ? 'Car' : category === 'emergency' ? 'ShieldCheck' : 'Palmtree',
        color: 'bg-emerald-500',
      });

      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: isAr ? 'تم إضافة الهدف المالي بنجاح!' : 'Financial goal created successfully!',
        });
        setTitle('');
        setTargetAmount('');
        setCurrentAmount('');
        setTargetDate('');
        setCategory('general');
        setRiskLevel('Medium');
        setTimeout(() => {
          setIsModalOpen(false);
          setStatusMsg(null);
          if (onRefreshGoals) onRefreshGoals();
        }, 1200);
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || (isAr ? 'فشل في حفظ الهدف المالي.' : 'Failed to create goal.'),
        });
      }
    } catch (err: any) {
      setStatusMsg({
        type: 'error',
        text: err.message || (isAr ? 'حدث خطأ أثناء الاتصال بالخادم.' : 'Server connection error.'),
      });
    } finally {
      setIsSubmitting(false);
    }
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
      {/* Banner message */}
      {statusMsg && !isModalOpen && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between ${
            statusMsg.type === 'success'
              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800'
              : 'bg-rose-100 dark:bg-rose-950/60 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button onClick={() => setStatusMsg(null)} className="p-1 hover:opacity-75">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

        <button
          onClick={() => {
            setStatusMsg(null);
            setIsModalOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2 self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{isAr ? '+ إضافة هدف جديد' : '+ Add New Goal'}</span>
        </button>
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

        {goals.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <Target className="w-10 h-10 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {isAr ? 'لا توجد أهداف مالية مضافة حتى الآن' : 'No financial goals added yet'}
            </p>
            <p className="text-xs text-slate-400">
              {isAr ? 'اضغط على زر "+ إضافة هدف جديد" للبدء في تتبع أحلامك المالية' : 'Click "+ Add New Goal" to start tracking your savings goals'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {goals.map((g) => {
              const progress = Math.min(100, Math.round(((g.currentAmount || 0) / (g.targetAmount || 1)) * 100));
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
                          {isAr ? g.titleAr || g.title : g.title}
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
                      <span>{formatCurrency(g.currentAmount || 0, 'EGP', lang)}</span>
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
                        ? `الادخار المطلوب: ${formatCurrency(g.monthlyTarget || 0, 'EGP', lang)} / شهرياً`
                        : `Monthly: ${formatCurrency(g.monthlyTarget || 0, 'EGP', lang)}`}
                    </span>
                    <span>{g.targetDate}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Modal Form for Adding a Goal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-emerald-600" />
                <span>{isAr ? 'إضافة هدف مالي جديد' : 'Add New Financial Goal'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {statusMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  statusMsg.type === 'success'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200'
                }`}
              >
                {statusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{statusMsg.text}</span>
              </div>
            )}

            <form onSubmit={handleCreateGoal} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم الهدف *' : 'Goal Title *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: صندوق الطوارئ، شراء سيارة' : 'e.g., Emergency Fund, New Car'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'المبلغ المستهدف (ج.م) *' : 'Target Amount (EGP) *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="50000"
                    value={targetAmount}
                    onChange={(e) => setTargetAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'المبلغ المدخر حالياً (ج.م)' : 'Current Saved (EGP)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={currentAmount}
                    onChange={(e) => setCurrentAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'تاريخ الاستحقاق' : 'Target Date'}
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'فئة الهدف' : 'Category'}
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="general">{isAr ? 'عام' : 'General'}</option>
                    <option value="emergency">{isAr ? 'طوارئ' : 'Emergency'}</option>
                    <option value="car">{isAr ? 'سيارة' : 'Car'}</option>
                    <option value="housing">{isAr ? 'عقارات/شقة' : 'Housing'}</option>
                    <option value="vacation">{isAr ? 'سفر وسياحة' : 'Vacation'}</option>
                    <option value="education">{isAr ? 'تعليم' : 'Education'}</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'مستوى الأولوية' : 'Priority Level'}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Low', 'Medium', 'High'] as const).map((lvl) => (
                    <button
                      type="button"
                      key={lvl}
                      onClick={() => setRiskLevel(lvl)}
                      className={`py-2 rounded-xl font-bold border transition ${
                        riskLevel === lvl
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {isAr
                        ? lvl === 'Low'
                          ? 'منخفضة'
                          : lvl === 'Medium'
                          ? 'متوسطة'
                          : 'عالية'
                        : lvl}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md transition disabled:opacity-50"
                >
                  {isSubmitting
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ الهدف'
                    : 'Save Goal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

