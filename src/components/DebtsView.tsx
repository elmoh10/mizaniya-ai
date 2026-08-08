import React, { useState, useEffect } from 'react';
import { Debt, Obligation, PaymentMethod, Currency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { apiClient } from '../services/apiClient';
import {
  Coins,
  Plus,
  TrendingDown,
  Calendar,
  Percent,
  CheckCircle2,
  AlertTriangle,
  X,
  CreditCard,
  User,
  Landmark,
  Pause,
  Play,
  Trash2,
  History,
  DollarSign,
  Info,
  CalendarDays,
  FileText
} from 'lucide-react';

interface DebtsViewProps {
  lang: 'ar' | 'en';
  onRefreshData?: () => Promise<void> | void;
}

export const DebtsView: React.FC<DebtsViewProps> = ({ lang, onRefreshData }) => {
  const isAr = lang === 'ar';

  // Core Data State
  const [debts, setDebts] = useState<Debt[]>([]);
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [summary, setSummary] = useState({
    totalDebtRemaining: 0,
    monthlyDebtPayments: 0,
    monthlyObligations: 0,
    debtToIncomeRatio: 0,
    salary: 0,
  });

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'debts' | 'obligations'>('debts');

  // Modals Visibility
  const [showAddDebtModal, setShowAddDebtModal] = useState(false);
  const [showAddObligationModal, setShowAddObligationModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState<Debt | null>(null);
  const [showHistoryModal, setShowHistoryModal] = useState<Debt | null>(null);
  const [selectedDebtPayments, setSelectedDebtPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);

  // Form States - Add Debt
  const [debtCreditorName, setDebtCreditorName] = useState('');
  const [debtOriginalAmount, setDebtOriginalAmount] = useState('');
  const [debtRemainingAmount, setDebtRemainingAmount] = useState('');
  const [debtType, setDebtType] = useState<'PERSONAL' | 'BANK' | 'CREDIT_CARD' | 'INSTALLMENT' | 'OTHER'>('PERSONAL');
  const [debtInterestRate, setDebtInterestRate] = useState('0');
  const [debtMinimumPayment, setDebtMinimumPayment] = useState('');
  const [debtDueDate, setDebtDueDate] = useState('');

  // Form States - Add Obligation
  const [obName, setObName] = useState('');
  const [obAmount, setObAmount] = useState('');
  const [obCategory, setObCategory] = useState('Housing & Utilities');
  const [obDueDate, setObDueDate] = useState('1'); // Day of the month
  const [obFrequency, setObFrequency] = useState<'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM'>('MONTHLY');
  const [obNotes, setObNotes] = useState('');

  // Form States - Record Payment
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('InstaPay');
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));

  // Fetch all debts, obligations & financial context summaries
  const loadDebtsAndObligations = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Fetch debts (runs financial context underneath)
      const debtsRes = await apiClient.get('/debts');
      // 2. Fetch obligations
      const obRes = await apiClient.get('/obligations');
      // 3. Fetch full context to get DTI and salary
      const contextRes = await apiClient.get('/financial-context');

      if (!debtsRes.success || !obRes.success || !contextRes.success) {
        throw new Error(isAr ? 'تعذر تحميل بيانات الديون والالتزامات' : 'Failed to load debts and obligations');
      }

      setDebts(debtsRes.debts || []);
      setObligations(obRes.obligations || []);

      if (contextRes.context) {
        const ctx = contextRes.context;
        setSummary({
          totalDebtRemaining: ctx.totalDebtRemaining || 0,
          monthlyDebtPayments: ctx.monthlyDebtPayments || 0,
          monthlyObligations: ctx.monthlyObligations || 0,
          debtToIncomeRatio: ctx.debtToIncomeRatio || 0,
          salary: ctx.salary || 0,
        });
      }
    } catch (err: any) {
      console.error('Error loading debts view:', err);
      setErrorMsg(isAr ? 'تعذر تحميل بيانات الديون والالتزامات' : 'Failed to load debts & obligations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDebtsAndObligations();
  }, []);

  const triggerRefresh = async () => {
    await loadDebtsAndObligations();
    if (onRefreshData) {
      await onRefreshData();
    }
  };

  // Create New Debt Action
  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!debtCreditorName.trim() || !debtOriginalAmount) {
      setErrorMsg(isAr ? 'برجاء ملء الحقول الإلزامية اسم الدائن والمبلغ الأصلي.' : 'Please fill required fields: creditor and original amount.');
      return;
    }

    const orig = parseFloat(debtOriginalAmount);
    const rem = parseFloat(debtRemainingAmount) || orig;

    if (orig <= 0 || rem < 0) {
      setErrorMsg(isAr ? 'المبالغ المدخلة يجب أن تكون قيم موجبة.' : 'Amounts must be positive.');
      return;
    }

    try {
      const payload = {
        creditorName: debtCreditorName.trim(),
        amountOriginal: orig,
        remainingAmount: rem,
        type: debtType,
        interestRate: parseFloat(debtInterestRate) || 0,
        minimumPayment: parseFloat(debtMinimumPayment) || 0,
        dueDate: debtDueDate || undefined,
      };

      const res = await apiClient.post('/debts', payload);
      if (res.success) {
        setSuccessMsg(isAr ? 'تم إضافة الدين بنجاح وجاري تحديث الخطط المالية!' : 'Debt created successfully and plans updated!');
        setDebtCreditorName('');
        setDebtOriginalAmount('');
        setDebtRemainingAmount('');
        setDebtInterestRate('0');
        setDebtMinimumPayment('');
        setDebtDueDate('');
        setShowAddDebtModal(false);
        await triggerRefresh();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrorMsg(res.error || (isAr ? 'فشلت إضافة الدين.' : 'Failed to add debt.'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred.');
    }
  };

  // Create New Obligation Action
  const handleAddObligation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!obName.trim() || !obAmount) {
      setErrorMsg(isAr ? 'برجاء ملء اسم الالتزام ومبلغ الالتزام.' : 'Please fill in name and amount.');
      return;
    }

    const amt = parseFloat(obAmount);
    if (amt <= 0) {
      setErrorMsg(isAr ? 'المبلغ يجب أن يكون أكبر من صفر.' : 'Amount must be greater than zero.');
      return;
    }

    try {
      const payload = {
        name: obName.trim(),
        amount: amt,
        category: obCategory,
        dueDate: obDueDate,
        frequency: obFrequency,
        notes: obNotes.trim() || undefined,
      };

      const res = await apiClient.post('/obligations', payload);
      if (res.success) {
        setSuccessMsg(isAr ? 'تم تسجيل الالتزام الشهري المكرر بنجاح!' : 'Recurring monthly obligation saved!');
        setObName('');
        setObAmount('');
        setObNotes('');
        setObDueDate('1');
        setShowAddObligationModal(false);
        await triggerRefresh();
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setErrorMsg(res.error || (isAr ? 'فشل تسجيل الالتزام.' : 'Failed to add obligation.'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred.');
    }
  };

  // Record Payment against Debt
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showPayModal || !payAmount) return;

    const amt = parseFloat(payAmount);
    if (amt <= 0) {
      setErrorMsg(isAr ? 'المبلغ المدفوع يجب أن يكون أكبر من صفر.' : 'Payment amount must be positive.');
      return;
    }

    try {
      const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : `pay-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const res = await apiClient.post(`/debts/${showPayModal.id}/pay`, {
        amount: amt,
        paymentMethod: payMethod,
        date: payDate,
      }, {
        'X-Idempotency-Key': idempotencyKey,
      });

      if (res.success) {
        setSuccessMsg(
          isAr
            ? `تم تسجيل دفعة بقيمة ${formatCurrency(amt, 'EGP', lang)} بنجاح! المتبقي حالياً: ${formatCurrency(res.remainingAmount, 'EGP', lang)}`
            : `Logged payment of ${formatCurrency(amt, 'EGP', lang)}! Remaining: ${formatCurrency(res.remainingAmount, 'EGP', lang)}`
        );
        setPayAmount('');
        setShowPayModal(null);
        await triggerRefresh();
        setTimeout(() => setSuccessMsg(null), 4000);
      } else {
        setErrorMsg(res.error || (isAr ? 'فشل تسجيل دفعة السداد.' : 'Failed to record payment.'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred.');
    }
  };

  // Fetch payments list for history modal
  const handleViewHistory = async (debt: Debt) => {
    setShowHistoryModal(debt);
    setLoadingPayments(true);
    setSelectedDebtPayments([]);
    try {
      const res = await apiClient.get(`/debts/${debt.id}/payments`);
      if (res.success) {
        setSelectedDebtPayments(res.payments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingPayments(false);
    }
  };

  // Obligation Actions: Pause, Resume, Delete
  const handlePauseOb = async (id: string) => {
    try {
      const res = await apiClient.post(`/obligations/${id}/pause`);
      if (res.success) {
        setSuccessMsg(isAr ? 'تم إيقاف الالتزام مؤقتاً بنجاح' : 'Obligation paused successfully');
        await triggerRefresh();
        setTimeout(() => setSuccessMsg(null), 2000);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleResumeOb = async (id: string) => {
    try {
      const res = await apiClient.post(`/obligations/${id}/resume`);
      if (res.success) {
        setSuccessMsg(isAr ? 'تم تنشيط الالتزام بنجاح' : 'Obligation resumed successfully');
        await triggerRefresh();
        setTimeout(() => setSuccessMsg(null), 2000);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDeleteOb = async (id: string) => {
    if (!window.confirm(isAr ? 'هل أنت متأكد من حذف هذا الالتزام المالي بشكل نهائي؟' : 'Are you sure you want to delete this commitment?')) return;
    try {
      const res = await apiClient.delete(`/obligations/${id}`);
      if (res.success) {
        setSuccessMsg(isAr ? 'تم حذف الالتزام بنجاح' : 'Obligation deleted');
        await triggerRefresh();
        setTimeout(() => setSuccessMsg(null), 2000);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Archive finished debt
  const handleArchiveDebt = async (id: string) => {
    try {
      const res = await apiClient.post(`/debts/${id}/archive`);
      if (res.success) {
        setSuccessMsg(isAr ? 'تم أرشفة الدين المدفوع بالكامل بنجاح' : 'Paid-off debt archived successfully');
        await triggerRefresh();
        setTimeout(() => setSuccessMsg(null), 2000);
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  // Utility badge styling helpers
  const getDebtTypeLabel = (type: string) => {
    switch (type) {
      case 'PERSONAL': return isAr ? 'دين شخصي / عائلي' : 'Personal/Family';
      case 'BANK': return isAr ? 'قرض بنكي' : 'Bank Loan';
      case 'CREDIT_CARD': return isAr ? 'بطاقة ائتمان' : 'Credit Card';
      case 'INSTALLMENT': return isAr ? 'قسط مشتريات' : 'Purchase Installment';
      default: return isAr ? 'آخر' : 'Other';
    }
  };

  const getObCategoryLabel = (cat: string) => {
    switch (cat) {
      case 'Housing & Utilities': return isAr ? 'سكن ومرافق (كهرباء/غاز)' : 'Housing & Utilities';
      case 'Bills & Subscriptions': return isAr ? 'فواتير واشتراكات' : 'Bills & Subscriptions';
      case 'Transport & Ride Apps': return isAr ? 'مواصلات وبنزين' : 'Transport & Ride Apps';
      case 'Installments & Debt': return isAr ? 'أقساط والتزامات ديون' : 'Installments & Debt';
      case 'Health & Education': return isAr ? 'تعليم وصحة' : 'Health & Education';
      default: return cat;
    }
  };

  const dtiIsHigh = summary.debtToIncomeRatio > 40;

  if (loading && debts.length === 0 && obligations.length === 0 && !errorMsg) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] p-8 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-3xl space-y-4 shadow-sm animate-pulse">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-emerald-500 border-t-transparent" />
        <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
          {isAr ? 'جاري تحميل الدفتر المالي من الخادم...' : 'Fetching financial ledger...'}
        </p>
      </div>
    );
  }

  if (errorMsg && debts.length === 0 && obligations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] p-8 bg-white dark:bg-slate-900 border border-red-500/10 dark:border-red-900/20 rounded-3xl space-y-5 text-center shadow-sm">
        <div className="p-4 rounded-full bg-red-500/10 text-red-500">
          <AlertTriangle className="w-10 h-10 shrink-0 animate-bounce" />
        </div>
        <div className="space-y-1.5">
          <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
            {isAr ? 'تعذر تحميل بيانات الديون والالتزامات' : 'Unable to load debts & obligations'}
          </h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mx-auto leading-relaxed">
            {isAr 
              ? 'حدث خطأ أثناء محاولة جلب بيانات المديونيات الحقيقية والالتزامات المتكررة من الخادم. يرجى إعادة المحاولة أو التحقق من اتصالك بالإنترنت.'
              : 'An error occurred while connecting to the server. Please check your connection and try again.'}
          </p>
        </div>
        <button
          onClick={loadDebtsAndObligations}
          className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-black text-xs transition shadow-lg shadow-red-600/15"
        >
          {isAr ? 'إعادة المحاولة' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dynamic Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white border border-slate-700/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <Coins className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-black">{isAr ? 'الديون والالتزامات المالية' : 'Debts & Obligations'}</h1>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl">
            {isAr
              ? 'تابع ديونك الشخصية، أرصدة بطاقات الائتمان، والأقساط بالإضافة إلى التزاماتك الشهرية المتكررة. يتكامل هذا النظام مع مستشار الميزانية AI لتقديم حلول سداد ذكية.'
              : 'Keep track of personal debts, bank loans, card balances, and recurring monthly commitments.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowAddDebtModal(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/10"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة دين / قسط' : 'Add Debt / Installment'}</span>
          </button>
          <button
            onClick={() => setShowAddObligationModal(true)}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/10"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة التزام شهري' : 'Add commitment'}</span>
          </button>
        </div>
      </div>

      {/* Action Notifications */}
      {successMsg && (
        <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2.5 text-xs animate-fade-in">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-between text-xs animate-fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-500/10 rounded-lg text-red-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Metrics Panel */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
              {isAr ? 'إجمالي الديون المتبقية' : 'Total Outstanding Debt'}
            </span>
            <span className="text-2xl font-black text-slate-800 dark:text-slate-100 block">
              {formatCurrency(summary.totalDebtRemaining, 'EGP', lang)}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2.5 border-t border-slate-100 dark:border-slate-800/60 pt-2 flex items-center gap-1">
            <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
            {isAr ? 'مستحق الدفع تدريجياً' : 'Owed over active installment periods'}
          </p>
        </div>

        {/* Metric 2 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
              {isAr ? 'مجموع الأقساط الشهرية' : 'Monthly Debt Minimums'}
            </span>
            <span className="text-2xl font-black text-slate-800 dark:text-slate-100 block">
              {formatCurrency(summary.monthlyDebtPayments, 'EGP', lang)}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2.5 border-t border-slate-100 dark:border-slate-800/60 pt-2">
            {isAr ? 'تخصم شهرياً من السيولة المتوفرة' : 'Charged on monthly budget calculations'}
          </p>
        </div>

        {/* Metric 3 */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
              {isAr ? 'الالتزامات المكررة الشهريّة' : 'Recurring Commitments'}
            </span>
            <span className="text-2xl font-black text-slate-800 dark:text-slate-100 block">
              {formatCurrency(summary.monthlyObligations, 'EGP', lang)}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2.5 border-t border-slate-100 dark:border-slate-800/60 pt-2 flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5 text-indigo-500" />
            {isAr ? 'مشتمل على الفواتير، الإيجار والاشتراكات' : 'Includes rent, utilities, educational fees'}
          </p>
        </div>

        {/* Metric 4 - DTI Gauge */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-5 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {isAr ? 'نسبة عبء المديونية (DTI)' : 'Debt-to-Income (DTI) Ratio'}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              dtiIsHigh ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'
            }`}>
              {summary.debtToIncomeRatio}%
            </span>
          </div>

          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mb-2.5">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                dtiIsHigh ? 'bg-red-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, summary.debtToIncomeRatio)}%` }}
            />
          </div>

          <div className="flex items-center gap-1 text-[10px]">
            <Info className={`w-3.5 h-3.5 shrink-0 ${dtiIsHigh ? 'text-red-500' : 'text-emerald-500'}`} />
            <p className="text-slate-500 dark:text-slate-400 leading-tight">
              {dtiIsHigh
                ? (isAr ? 'عالية (تتخطى 40% من دخلك المتاح)' : 'High (exceeds safe 40% threshold)')
                : (isAr ? 'نطاق صحي وآمن ماليّاً' : 'Healthy and within safe limits')}
            </p>
          </div>
        </div>
      </div>

      {/* Empty State vs. Loaded content */}
      {debts.length === 0 && obligations.length === 0 ? (
        <div className="text-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-10 rounded-3xl shadow-sm space-y-5 flex flex-col items-center justify-center min-h-[300px]">
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-full text-slate-400 dark:text-slate-500">
            <Coins className="w-12 h-12" />
          </div>
          <div className="space-y-1.5 max-w-sm mx-auto">
            <h3 className="text-base font-black text-slate-800 dark:text-slate-100">
              {isAr ? 'لا توجد ديون أو التزامات مسجلة حالياً' : 'No debts or obligations registered'}
            </h3>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              {isAr 
                ? 'دفترك المالي خالٍ من أي أقساط أو ديون مستحقة أو التزامات متكررة شهرياً. قم بتسجيل التزاماتك الأولى لتفعيل الحسابات المالية التلقائية.'
                : 'Your financial profile is clear of any debts or active recurring commitments.'}
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <button
              onClick={() => setShowAddDebtModal(true)}
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition shadow-lg shadow-emerald-500/10"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة دين' : 'Add Debt'}</span>
            </button>
            <button
              onClick={() => setShowAddObligationModal(true)}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center gap-2 transition shadow-lg shadow-indigo-600/10"
            >
              <Plus className="w-4 h-4" />
              <span>{isAr ? 'إضافة التزام شهري' : 'Add commitment'}</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Tabs Navigation */}
          <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab('debts')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition ${
            activeTab === 'debts'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          {isAr ? 'ديون وأقساط مستحقة' : 'Outstanding Debts & Installments'}
        </button>
        <button
          onClick={() => setActiveTab('obligations')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition ${
            activeTab === 'obligations'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-extrabold'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          {isAr ? 'الالتزامات المتكررة والاشتراكات' : 'Monthly Recurring Commitments'}
        </button>
      </div>

      {/* Loading Block */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-500 border-t-transparent mx-auto" />
          <p className="text-xs">{isAr ? 'جاري تحميل الدفتر المالي...' : 'Fetching financial ledger...'}</p>
        </div>
      ) : activeTab === 'debts' ? (
        /* ================= DEBTS TAB ================= */
        <div className="space-y-4">
          {debts.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl">
              <Coins className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{isAr ? 'دفتر ديونك خالي!' : 'No outstanding debts!'}</h3>
              <p className="text-xs text-slate-400 mb-4">{isAr ? 'لا يوجد أي ديون، قروض أو مشتريات بالتقسيط مسجلة حالياً.' : 'Your financial profile shows zero debts.'}</p>
              <button
                onClick={() => setShowAddDebtModal(true)}
                className="px-4 py-2 rounded-xl border border-dashed border-emerald-500/50 hover:bg-emerald-500/10 text-emerald-500 font-bold text-xs transition"
              >
                {isAr ? 'سجل أول مديونية / قسط شراء' : 'Record your first debt'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {debts.map((debt) => {
                const percentPaid = Math.round(((debt.amountOriginal - debt.remainingAmount) / debt.amountOriginal) * 100);
                const isPaidOff = debt.status === 'PAID' || debt.remainingAmount === 0;

                return (
                  <div
                    key={debt.id}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between ${
                      isPaidOff
                        ? 'border-slate-100 dark:border-slate-800/40 opacity-75'
                        : 'border-slate-200/80 dark:border-slate-850 hover:shadow-md'
                    }`}
                  >
                    <div>
                      {/* Name & Type */}
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">{debt.creditorName}</h4>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{getDebtTypeLabel(debt.type)}</span>
                        </div>

                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-black ${
                          isPaidOff
                            ? 'bg-emerald-500/10 text-emerald-500'
                            : debt.status === 'OVERDUE'
                            ? 'bg-rose-500/10 text-rose-500'
                            : 'bg-indigo-500/10 text-indigo-500'
                        }`}>
                          {isPaidOff
                            ? (isAr ? 'مدفوع بالكامل' : 'PAID OFF')
                            : debt.status === 'OVERDUE'
                            ? (isAr ? 'متأخر السداد' : 'OVERDUE')
                            : (isAr ? 'نشط' : 'ACTIVE')}
                        </span>
                      </div>

                      {/* Amounts Display */}
                      <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/55 p-3 rounded-xl mb-4">
                        <div>
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">{isAr ? 'المتبقي' : 'Remaining'}</span>
                          <span className={`text-sm font-black ${isPaidOff ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                            {formatCurrency(debt.remainingAmount, 'EGP', lang)}
                          </span>
                        </div>
                        <div className="border-r border-slate-200/60 dark:border-slate-700/60 pr-3">
                          <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">{isAr ? 'المبلغ الأصلي' : 'Original'}</span>
                          <span className="text-sm font-bold text-slate-600 dark:text-slate-400">
                            {formatCurrency(debt.amountOriginal, 'EGP', lang)}
                          </span>
                        </div>
                      </div>

                      {/* Payment/Interest Specifics */}
                      <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mb-4">
                        <div className="flex justify-between items-center">
                          <span>{isAr ? 'القسط الأدنى المطلوب:' : 'Minimum Payment:'}</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {debt.minimumPayment > 0 ? formatCurrency(debt.minimumPayment, 'EGP', lang) : (isAr ? 'مرن' : 'Flexible')}
                          </span>
                        </div>
                        {debt.interestRate > 0 && (
                          <div className="flex justify-between items-center">
                            <span>{isAr ? 'نسبة الفائدة السنوية:' : 'Interest Rate:'}</span>
                            <span className="font-bold text-rose-500 flex items-center gap-0.5">
                              <Percent className="w-3.5 h-3.5" />
                              {debt.interestRate}%
                            </span>
                          </div>
                        )}
                        {debt.dueDate && (
                          <div className="flex justify-between items-center text-[11px] text-slate-400">
                            <span>{isAr ? 'تاريخ السداد القادم:' : 'Next Due Date:'}</span>
                            <span>{debt.dueDate}</span>
                          </div>
                        )}
                      </div>

                      {/* Progress Bar */}
                      {!isPaidOff && (
                        <div className="space-y-1 mb-4">
                          <div className="flex justify-between text-[9px] text-slate-400 font-bold">
                            <span>{isAr ? 'نسبة المسدد' : 'Paid amount'}</span>
                            <span>{percentPaid}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                              style={{ width: `${percentPaid}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Operational Buttons */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center gap-2">
                      {!isPaidOff ? (
                        <button
                          onClick={() => {
                            setPayAmount('');
                            setShowPayModal(debt);
                          }}
                          className="flex-1 py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-extrabold text-xs flex items-center justify-center gap-1.5 transition"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>{isAr ? 'سداد دفعة' : 'Record payment'}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleArchiveDebt(debt.id)}
                          className="flex-1 py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800/50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs flex items-center justify-center gap-1 transition"
                        >
                          {isAr ? 'أرشفة المديونية' : 'Archive Record'}
                        </button>
                      )}

                      <button
                        onClick={() => handleViewHistory(debt)}
                        className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/40 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white transition"
                        title={isAr ? 'سجل السداد المالي' : 'Payment Logs'}
                      >
                        <History className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* ================= OBLIGATIONS TAB ================= */
        <div className="space-y-4">
          {obligations.length === 0 ? (
            <div className="text-center p-12 bg-white dark:bg-slate-900 border border-slate-150 dark:border-slate-800/80 rounded-2xl">
              <CalendarDays className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">{isAr ? 'لا توجد التزامات متكررة' : 'No commitments saved'}</h3>
              <p className="text-xs text-slate-400 mb-4">{isAr ? 'سجل الإيجارات، فواتير الاتصالات، رسوم المدارس أو الاشتراكات لتقدير أدق لميزانيتك التلقائية.' : 'Add recurring rent, gas/power, or standard subscription fees.'}</p>
              <button
                onClick={() => setShowAddObligationModal(true)}
                className="px-4 py-2 rounded-xl border border-dashed border-indigo-500/50 hover:bg-indigo-500/10 text-indigo-500 font-bold text-xs transition"
              >
                {isAr ? 'إضافة التزام شهري أول' : 'Register recurring cost'}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {obligations.map((ob) => {
                const isPaused = ob.status === 'PAUSED';

                return (
                  <div
                    key={ob.id}
                    className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm transition-all flex flex-col justify-between ${
                      isPaused
                        ? 'border-slate-100 dark:border-slate-800/40 opacity-70'
                        : 'border-slate-200/80 dark:border-slate-850 hover:shadow-md'
                    }`}
                  >
                    <div>
                      {/* Name & Badge */}
                      <div className="flex items-start justify-between mb-3.5">
                        <div>
                          <h4 className="font-extrabold text-slate-800 dark:text-slate-200 text-sm">{ob.name}</h4>
                          <span className="text-[10px] text-slate-400 block mt-0.5">{getObCategoryLabel(ob.category)}</span>
                        </div>

                        <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold ${
                          isPaused
                            ? 'bg-amber-500/10 text-amber-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {isPaused ? (isAr ? 'متوقف مؤقتاً' : 'PAUSED') : (isAr ? 'نشط' : 'ACTIVE')}
                        </span>
                      </div>

                      {/* Cost details */}
                      <div className="bg-slate-50 dark:bg-slate-800/55 p-3 rounded-xl mb-4">
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold block mb-0.5">{isAr ? 'القيمة المتكررة شهرياً' : 'Monthly cost'}</span>
                        <span className="text-xl font-black text-slate-800 dark:text-slate-100">
                          {formatCurrency(ob.amount, 'EGP', lang)}
                        </span>
                      </div>

                      {/* Due Info */}
                      <div className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 mb-4">
                        <div className="flex justify-between items-center">
                          <span>{isAr ? 'يوم السداد الشهري:' : 'Payment Due Day:'}</span>
                          <span className="font-bold text-slate-700 dark:text-slate-300">
                            {isAr ? `يوم ${ob.dueDate} في الشهر` : `Day ${ob.dueDate} monthly`}
                          </span>
                        </div>
                        {ob.notes && (
                          <div className="flex items-start gap-1.5 text-[11px] text-slate-400 mt-2 bg-slate-50/50 dark:bg-slate-800/20 p-2 rounded-lg">
                            <FileText className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                            <span className="italic">{ob.notes}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {isPaused ? (
                          <button
                            onClick={() => handleResumeOb(ob.id)}
                            className="py-1.5 px-3 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 text-xs font-bold flex items-center gap-1 transition"
                          >
                            <Play className="w-3 h-3" />
                            <span>{isAr ? 'تنشيط' : 'Resume'}</span>
                          </button>
                        ) : (
                          <button
                            onClick={() => handlePauseOb(ob.id)}
                            className="py-1.5 px-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-500 text-xs font-bold flex items-center gap-1 transition"
                          >
                            <Pause className="w-3 h-3" />
                            <span>{isAr ? 'إيقاف مؤقت' : 'Pause'}</span>
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => handleDeleteOb(ob.id)}
                        className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-500 transition"
                        title={isAr ? 'حذف الالتزام' : 'Delete commitment'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
        </>
      )}

      {/* ================= MODAL: ADD DEBT ================= */}
      {showAddDebtModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 relative overflow-y-auto max-h-[90vh]">
            <button
              onClick={() => setShowAddDebtModal(false)}
              className="absolute top-4 left-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-500" />
              <span>{isAr ? 'تسجيل دين أو مديونية شراء جديدة' : 'Add New Debt'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-5">{isAr ? 'تأكد من إدخال مبالغ دقيقة ليقوم المستشار AI بتوجيه خطتك المالية.' : 'Provide precise amounts for better financial coaching.'}</p>

            <form onSubmit={handleAddDebt} className="space-y-4">
              {/* Creditor Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'اسم الدائن / جهة التمويل *' : 'Creditor Name *'}</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: أختي، البنك الأهلي، بطاقة فيزا CIB، ValU' : 'e.g. Sister, Bank, Credit Card'}
                  value={debtCreditorName}
                  onChange={(e) => setDebtCreditorName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Original & Remaining Amounts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'المبلغ الأصلي للدين *' : 'Original Amount *'}</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={debtOriginalAmount}
                    onChange={(e) => {
                      setDebtOriginalAmount(e.target.value);
                      if (!debtRemainingAmount) setDebtRemainingAmount(e.target.value);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'المبلغ المتبقي حالياً (اختياري)' : 'Remaining Amount (Optional)'}</label>
                  <input
                    type="number"
                    placeholder={isAr ? 'اتركه فارغاً ليتساوى مع الأصلي' : 'Defaults to original'}
                    value={debtRemainingAmount}
                    onChange={(e) => setDebtRemainingAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Type Selection */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'تصنيف الدين *' : 'Debt Type *'}</label>
                <select
                  value={debtType}
                  onChange={(e: any) => setDebtType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="PERSONAL">{isAr ? 'دين شخصي / عائلي' : 'Personal / Family Debt'}</option>
                  <option value="BANK">{isAr ? 'قرض بنكي / تمويل مباشر' : 'Bank Loan / Direct Finance'}</option>
                  <option value="CREDIT_CARD">{isAr ? 'رصيد مستحق لبطاقة ائتمان' : 'Credit Card Outstanding'}</option>
                  <option value="INSTALLMENT">{isAr ? 'قسط شراء (فاليو، مشتريات إلخ)' : 'Purchase Installment (valU, etc.)'}</option>
                  <option value="OTHER">{isAr ? 'جهة أخرى' : 'Other'}</option>
                </select>
              </div>

              {/* Minimum payment & Interest Rate */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'الحد الأدنى للقسط الشهري *' : 'Monthly Minimum Payment *'}</label>
                  <input
                    type="number"
                    required
                    placeholder="0.00"
                    value={debtMinimumPayment}
                    onChange={(e) => setDebtMinimumPayment(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'نسبة الفائدة السنوية %' : 'Annual Interest %'}</label>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={debtInterestRate}
                    onChange={(e) => setDebtInterestRate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Next Due Date */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'تاريخ السداد القادم (اختياري)' : 'Next Due Date (Optional)'}</label>
                <input
                  type="date"
                  value={debtDueDate}
                  onChange={(e) => setDebtDueDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Save Button */}
              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition"
                >
                  {isAr ? 'تأكيد وحفظ الدين' : 'Confirm & Save Debt'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDebtModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold text-xs transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: ADD OBLIGATION ================= */}
      {showAddObligationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 relative overflow-y-auto max-h-[90vh]">
            <button
              onClick={() => setShowAddObligationModal(false)}
              className="absolute top-4 left-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-500" />
              <span>{isAr ? 'تسجيل التزام أو اشتراك متكرر جديد' : 'Add Monthly Commitment'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-5">{isAr ? 'الالتزامات مثل إيجار السكن وفاتورة الإنترنت تختلف عن مديونية القروض.' : 'Commitments such as rent, utility, and telecom bills differ from outstanding loan debts.'}</p>

            <form onSubmit={handleAddObligation} className="space-y-4">
              {/* Obligation Name */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'اسم الالتزام أو الخدمة *' : 'Commitment Name *'}</label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'مثال: إيجار شقة الدقي، اشتراك نت WE، رسوم مدرسة الأولاد' : 'e.g. Apartment rent, Fiber subscription'}
                  value={obName}
                  onChange={(e) => setObName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'التكلفة شهرياً *' : 'Monthly Cost *'}</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  value={obAmount}
                  onChange={(e) => setObAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'الفئة والتصنيف *' : 'Category *'}</label>
                <select
                  value={obCategory}
                  onChange={(e) => setObCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                >
                  <option value="Housing & Utilities">{isAr ? 'سكن ومرافق عامة (غاز/مياه/كهرباء)' : 'Housing & Utilities'}</option>
                  <option value="Bills & Subscriptions">{isAr ? 'فواتير واشتراكات مكررة (اتصالات/نت)' : 'Bills & Subscriptions'}</option>
                  <option value="Transport & Ride Apps">{isAr ? 'مواصلات واستهلاك بنزين' : 'Transport & Gas'}</option>
                  <option value="Installments & Debt">{isAr ? 'أقساط والتزامات ديون' : 'Installments & Debt'}</option>
                  <option value="Health & Education">{isAr ? 'صحة وتعليم وأقساط مدارس' : 'Health & Education'}</option>
                </select>
              </div>

              {/* Due Day & Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'يوم الاستحقاق في الشهر (1-31)' : 'Due day of month (1-31)'}</label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    required
                    value={obDueDate}
                    onChange={(e) => setObDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'دورية الاستحقاق' : 'Frequency'}</label>
                  <select
                    value={obFrequency}
                    onChange={(e: any) => setObFrequency(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="WEEKLY">{isAr ? 'أسبوعياً' : 'Weekly'}</option>
                    <option value="MONTHLY">{isAr ? 'شهرياً' : 'Monthly'}</option>
                    <option value="QUARTERLY">{isAr ? 'ربع سنوي' : 'Quarterly'}</option>
                    <option value="YEARLY">{isAr ? 'سنوياً' : 'Yearly'}</option>
                    <option value="CUSTOM">{isAr ? 'مخصص' : 'Custom'}</option>
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'ملاحظات وتفاصيل إضافية' : 'Notes'}</label>
                <textarea
                  rows={2}
                  placeholder={isAr ? 'اكتب أي تفاصيل أخرى ترغب في تذكرها...' : 'Any details you want to add...'}
                  value={obNotes}
                  onChange={(e) => setObNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Save Button */}
              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs transition"
                >
                  {isAr ? 'تأكيد وحفظ الالتزام' : 'Save Commitment'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddObligationModal(false)}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold text-xs transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: RECORD DEBT PAYMENT ================= */}
      {showPayModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 relative">
            <button
              onClick={() => setShowPayModal(null)}
              className="absolute top-4 left-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-emerald-500" />
              <span>{isAr ? 'تسجيل دفعة سداد جديدة' : 'Record Payment'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {isAr
                ? `تسجيل سداد لصالح: ${showPayModal.creditorName} | المتبقي حالياً: ${formatCurrency(showPayModal.remainingAmount, 'EGP', lang)}`
                : `Recording payment for: ${showPayModal.creditorName} | Remaining: ${formatCurrency(showPayModal.remainingAmount, 'EGP', lang)}`}
            </p>

            <form onSubmit={handleRecordPayment} className="space-y-4">
              {/* Payment Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'المبلغ المدفوع (جنيه مصري) *' : 'Amount paid (EGP) *'}</label>
                <input
                  type="number"
                  required
                  placeholder="0.00"
                  max={showPayModal.remainingAmount}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'وسيلة الدفع *' : 'Payment Method *'}</label>
                <select
                  value={payMethod}
                  onChange={(e: any) => setPayMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                >
                  <option value="InstaPay">إنستا باي / InstaPay</option>
                  <option value="Vodafone Cash">فودافون كاش / Vodafone Cash</option>
                  <option value="CIB Bank">حساب بنك CIB</option>
                  <option value="Cash">كاش / نقدًا</option>
                  <option value="Fawry">فوري / Fawry</option>
                  <option value="Visa/Mastercard">بطاقة ائتمان</option>
                </select>
              </div>

              {/* Payment Date */}
              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">{isAr ? 'تاريخ السداد *' : 'Payment Date *'}</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-850 bg-slate-50 dark:bg-slate-800/40 text-slate-800 dark:text-slate-100 text-xs focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                />
              </div>

              {/* Save */}
              <div className="pt-4 flex gap-3">
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-extrabold text-xs transition"
                >
                  {isAr ? 'حفظ الدفعة وتعديل الرصيد' : 'Save Payment Record'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowPayModal(null)}
                  className="flex-1 py-3 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold text-xs transition"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL: PAYMENT LOGS HISTORY ================= */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/65 backdrop-blur-sm animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl p-6 relative">
            <button
              onClick={() => setShowHistoryModal(null)}
              className="absolute top-4 left-4 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-400 dark:text-slate-500 transition"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-500" />
              <span>{isAr ? 'سجل دفعات المديونية' : 'Payment History Logs'}</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              {isAr
                ? `قائمة المبالغ المسددة لصالح: ${showHistoryModal.creditorName}`
                : `All recorded payments for: ${showHistoryModal.creditorName}`}
            </p>

            <div className="max-h-[300px] overflow-y-auto space-y-2 mt-4 pr-1">
              {loadingPayments ? (
                <div className="p-8 text-center text-slate-400 text-xs">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-emerald-500 border-t-transparent mx-auto mb-2" />
                  <p>{isAr ? 'جاري جلب السجل من الخادم...' : 'Loading history...'}</p>
                </div>
              ) : selectedDebtPayments.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs italic bg-slate-50 dark:bg-slate-800/30 rounded-xl">
                  {isAr ? 'لا توجد أي دفعات مسجلة لهذا الدين بعد.' : 'No recorded payments found.'}
                </div>
              ) : (
                selectedDebtPayments.map((pay, idx) => (
                  <div
                    key={pay.id || idx}
                    className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/50"
                  >
                    <div>
                      <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                        +{formatCurrency(pay.amount, 'EGP', lang)}
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        {pay.paymentMethod || (isAr ? 'وسيلة دفع غير محددة' : 'Unspecified method')}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block font-bold">
                        {pay.date}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/60 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHistoryModal(null)}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs transition"
              >
                {isAr ? 'إغلاق السجل' : 'Close Logs'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DebtsView;
