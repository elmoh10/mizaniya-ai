import React, { useState } from 'react';
import { Bill, Subscription, PaymentMethod } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
import { apiClient } from '../services/apiClient';
import {
  CalendarCheck,
  Zap,
  Flame,
  PhoneCall,
  Tv,
  PlaySquare,
  Dumbbell,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  Plus,
  Sparkles,
  X,
  AlertTriangle,
} from 'lucide-react';

interface BillsViewProps {
  bills: Bill[];
  subscriptions: Subscription[];
  onPayBill: (billId: string) => void;
  lang: 'ar' | 'en';
  onRefreshBills?: () => void;
  onRefreshSubscriptions?: () => void;
}

export const BillsView: React.FC<BillsViewProps> = ({
  bills,
  subscriptions,
  onPayBill,
  lang,
  onRefreshBills,
  onRefreshSubscriptions,
}) => {
  const isAr = lang === 'ar';
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Modals state
  const [activeModal, setActiveModal] = useState<'bill' | 'subscription' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Bill Form Fields
  const [billTitle, setBillTitle] = useState('');
  const [biller, setBiller] = useState('كهرباء / غاز / مياه');
  const [billAmount, setBillAmount] = useState('');
  const [billDueDate, setBillDueDate] = useState('');
  const [billPaymentMethod, setBillPaymentMethod] = useState<PaymentMethod>('InstaPay');
  const [fawryCode, setFawryCode] = useState('');
  const [isPaid, setIsPaid] = useState(false);

  // Subscription Form Fields
  const [subName, setSubName] = useState('');
  const [subProvider, setSubProvider] = useState('');
  const [subAmount, setSubAmount] = useState('');
  const [subCycle, setSubCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [subNextDueDate, setSubNextDueDate] = useState('');
  const [subPaymentMethod, setSubPaymentMethod] = useState<PaymentMethod>('Visa/Mastercard');

  const handleCopyFawry = (code?: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const amountNum = parseFloat(billAmount);
    if (!billTitle.trim() || isNaN(amountNum) || amountNum <= 0) {
      setStatusMsg({
        type: 'error',
        text: isAr ? 'يرجى إدخال اسم الفاتورة ومبلغ أكبر من 0.' : 'Please enter a valid bill title and amount.',
      });
      return;
    }

    const defaultDue = new Date().toISOString().split('T')[0];

    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/bills', {
        title: billTitle.trim(),
        titleAr: billTitle.trim(),
        biller: biller.trim() || 'جهات المرافق',
        amount: amountNum,
        dueDate: billDueDate || defaultDue,
        isPaid,
        paymentMethod: billPaymentMethod,
        fawryCode: fawryCode.trim() || undefined,
        icon: 'Zap',
        urgency: 'medium',
      });

      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: isAr ? 'تم إضافة الفاتورة بنجاح!' : 'Bill added successfully!',
        });
        setBillTitle('');
        setBillAmount('');
        setFawryCode('');
        setIsPaid(false);
        setTimeout(() => {
          setActiveModal(null);
          setStatusMsg(null);
          if (onRefreshBills) onRefreshBills();
        }, 1200);
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || (isAr ? 'فشل في إضافة الفاتورة.' : 'Failed to add bill.'),
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

  const handleCreateSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const amountNum = parseFloat(subAmount);
    if (!subName.trim() || isNaN(amountNum) || amountNum <= 0) {
      setStatusMsg({
        type: 'error',
        text: isAr ? 'يرجى إدخال اسم الاشتراك ومبلغ أكبر من 0.' : 'Please enter a valid subscription name and amount.',
      });
      return;
    }

    const defaultDue = new Date().toISOString().split('T')[0];

    setIsSubmitting(true);
    try {
      const res = await apiClient.post('/subscriptions', {
        name: subName.trim(),
        provider: subProvider.trim() || 'خدمة رقمية',
        amount: amountNum,
        currency: 'EGP',
        cycle: subCycle,
        nextDueDate: subNextDueDate || defaultDue,
        paymentMethod: subPaymentMethod,
        category: 'Bills & Subscriptions',
        autoPay: true,
        icon: 'Tv',
        status: 'active',
      });

      if (res.success) {
        setStatusMsg({
          type: 'success',
          text: isAr ? 'تم إضافة الاشتراك بنجاح!' : 'Subscription added successfully!',
        });
        setSubName('');
        setSubProvider('');
        setSubAmount('');
        setTimeout(() => {
          setActiveModal(null);
          setStatusMsg(null);
          if (onRefreshSubscriptions) onRefreshSubscriptions();
        }, 1200);
      } else {
        setStatusMsg({
          type: 'error',
          text: res.error || (isAr ? 'فشل في إضافة الاشتراك.' : 'Failed to add subscription.'),
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

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
      {/* Banner Message */}
      {statusMsg && !activeModal && (
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
            <CalendarCheck className="w-7 h-7 text-indigo-600" />
            <span>{isAr ? 'مركز الفواتير والاشتراكات الذكي' : 'Bills & Subscriptions Center'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'تتبع فواتير الكهرباء والغاز والإنترنت والأقساط ودفعها بضغطة زر عبر فوري وإنستا باي'
              : 'Track & pay electricity, gas, internet, and subscriptions'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={() => {
              setStatusMsg(null);
              setActiveModal('bill');
            }}
            className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? '+ إضافة فاتورة' : '+ Add Bill'}</span>
          </button>

          <button
            onClick={() => {
              setStatusMsg(null);
              setActiveModal('subscription');
            }}
            className="px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? '+ إضافة اشتراك' : '+ Add Subscription'}</span>
          </button>
        </div>
      </div>

      {/* 1. Egyptian Utility Bills Section */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <span>{isAr ? 'فواتير المرافق والتزامات الشهر' : 'Monthly Utility Bills'}</span>
        </h3>

        {bills.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <Zap className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {isAr ? 'لا توجد فواتير مضافة حالياً' : 'No bills added yet'}
            </p>
            <p className="text-xs text-slate-400">
              {isAr ? 'اضغط على "+ إضافة فاتورة" للبدء في تنظيم الفواتير' : 'Click "+ Add Bill" to organize your utility bills'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {bills.map((b) => (
              <div
                key={b.id}
                className={`p-5 rounded-2xl bg-white dark:bg-slate-900 border ${
                  b.isPaid
                    ? 'border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/20'
                    : 'border-slate-200 dark:border-slate-800'
                } shadow-sm space-y-4`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {b.biller}
                    </span>
                    <h4 className="font-bold text-sm text-slate-900 dark:text-white mt-0.5">
                      {isAr ? b.titleAr || b.title : b.title}
                    </h4>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-indigo-600">
                    <Zap className="w-5 h-5" />
                  </div>
                </div>

                <div className="flex items-baseline justify-between">
                  <span className="text-xl font-black text-slate-900 dark:text-white">
                    {formatCurrency(b.amount, 'EGP', lang)}
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    {isAr ? `تاريخ الاستحقاق: ${b.dueDate}` : `Due: ${b.dueDate}`}
                  </span>
                </div>

                {b.fawryCode && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">{isAr ? 'كود دفع فوري:' : 'Fawry Code:'}</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">{b.fawryCode}</span>
                    </div>
                    <button
                      onClick={() => handleCopyFawry(b.fawryCode)}
                      className="p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200"
                    >
                      {copiedCode === b.fawryCode ? (
                        <Check className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}

                <button
                  onClick={() => onPayBill(b.id)}
                  disabled={b.isPaid}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs shadow transition flex items-center justify-center gap-2 ${
                    b.isPaid
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  }`}
                >
                  {b.isPaid ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isAr ? 'تم الدفع بنجاح' : 'Paid Successfully'}</span>
                    </>
                  ) : (
                    <span>{isAr ? 'دفع فوراً بـ InstaPay / فوري' : 'Pay via InstaPay / Fawry'}</span>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Subscriptions Tracker */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Tv className="w-5 h-5 text-emerald-600" />
          <span>{isAr ? 'الاشتراكات المكتشفة والمضافة' : 'Subscriptions'}</span>
        </h3>

        {subscriptions.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
            <Tv className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
              {isAr ? 'لا توجد اشتراكات مضافة حالياً' : 'No subscriptions added yet'}
            </p>
            <p className="text-xs text-slate-400">
              {isAr ? 'اضغط على "+ إضافة اشتراك" لتتبع الاشتراكات الشهرية' : 'Click "+ Add Subscription" to track your monthly streaming & services'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {subscriptions.map((s) => (
              <div
                key={s.id}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between"
              >
                <div className="space-y-1">
                  <h4 className="font-bold text-sm text-slate-900 dark:text-white">
                    {s.name}
                  </h4>
                  <span className="text-xs text-slate-500 block">
                    {s.provider} • {s.paymentMethod}
                  </span>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded font-bold">
                    {isAr ? `تجديد: ${s.nextDueDate}` : `Renews: ${s.nextDueDate}`}
                  </span>
                </div>

                <div className="text-left font-black text-sm text-slate-900 dark:text-white">
                  {formatCurrency(s.amount, 'EGP', lang)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Bill Modal */}
      {activeModal === 'bill' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                <span>{isAr ? 'إضافة فاتورة جديدة' : 'Add New Bill'}</span>
              </h3>
              <button
                onClick={() => setActiveModal(null)}
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

            <form onSubmit={handleCreateBill} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'عنوان الفاتورة *' : 'Bill Title *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'فاتورة الكهرباء، فاتورة إنترنت WE' : 'e.g. Electricity Bill, WE Fiber'}
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'الجهة / المزود' : 'Biller / Provider'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'جنوب القاهرة، المصرية للاتصالات' : 'e.g. WE, Gasco'}
                    value={biller}
                    onChange={(e) => setBiller(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'المبلغ (ج.م) *' : 'Amount (EGP) *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="450"
                    value={billAmount}
                    onChange={(e) => setBillAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </label>
                  <input
                    type="date"
                    value={billDueDate}
                    onChange={(e) => setBillDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'وسيلة الدفع' : 'Payment Method'}
                  </label>
                  <select
                    value={billPaymentMethod}
                    onChange={(e) => setBillPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="InstaPay">InstaPay</option>
                    <option value="Fawry">Fawry</option>
                    <option value="Vodafone Cash">Vodafone Cash</option>
                    <option value="CIB Bank">CIB Bank</option>
                    <option value="Cash">Cash</option>
                    <option value="Visa/Mastercard">Visa/Mastercard</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'كود دفع فوري (اختياري)' : 'Fawry Code (Optional)'}
                </label>
                <input
                  type="text"
                  placeholder="982341052"
                  value={fawryCode}
                  onChange={(e) => setFawryCode(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="isPaidCheck"
                  checked={isPaid}
                  onChange={(e) => setIsPaid(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="isPaidCheck" className="font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  {isAr ? 'تم سداد الفاتورة بالفعل' : 'Already Paid'}
                </label>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="w-1/2 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-1/2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold shadow-md transition disabled:opacity-50"
                >
                  {isSubmitting
                    ? isAr
                      ? 'جاري الحفظ...'
                      : 'Saving...'
                    : isAr
                    ? 'حفظ الفاتورة'
                    : 'Save Bill'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Subscription Modal */}
      {activeModal === 'subscription' && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl relative animate-fadeIn">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Tv className="w-5 h-5 text-emerald-600" />
                <span>{isAr ? 'إضافة اشتراك جديد' : 'Add New Subscription'}</span>
              </h3>
              <button
                onClick={() => setActiveModal(null)}
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

            <form onSubmit={handleCreateSubscription} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'اسم الاشتراك *' : 'Subscription Name *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={isAr ? 'اشتراك نتفليكس، شاهد، جيم' : 'e.g., Netflix, Shahid, Gym'}
                  value={subName}
                  onChange={(e) => setSubName(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'المزود / الشركة' : 'Provider / Vendor'}
                  </label>
                  <input
                    type="text"
                    placeholder={isAr ? 'Netflix, Spotify' : 'Netflix, Spotify'}
                    value={subProvider}
                    onChange={(e) => setSubProvider(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'المبلغ (ج.م) *' : 'Amount (EGP) *'}
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    placeholder="250"
                    value={subAmount}
                    onChange={(e) => setSubAmount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'دورة التجديد' : 'Billing Cycle'}
                  </label>
                  <select
                    value={subCycle}
                    onChange={(e) => setSubCycle(e.target.value as 'monthly' | 'yearly')}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <option value="monthly">{isAr ? 'شهري' : 'Monthly'}</option>
                    <option value="yearly">{isAr ? 'سنوي' : 'Yearly'}</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    {isAr ? 'تاريخ التجديد القادم' : 'Next Renewal Date'}
                  </label>
                  <input
                    type="date"
                    value={subNextDueDate}
                    onChange={(e) => setSubNextDueDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {isAr ? 'وسيلة الخصم' : 'Payment Method'}
                </label>
                <select
                  value={subPaymentMethod}
                  onChange={(e) => setSubPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="Visa/Mastercard">Visa / Mastercard</option>
                  <option value="Vodafone Cash">Vodafone Cash</option>
                  <option value="InstaPay">InstaPay</option>
                  <option value="CIB Bank">CIB Bank</option>
                  <option value="Valu">Valu</option>
                </select>
              </div>

              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
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
                    ? 'حفظ الاشتراك'
                    : 'Save Subscription'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

