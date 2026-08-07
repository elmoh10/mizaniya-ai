import React, { useState } from 'react';
import { Bill, Subscription, PaymentMethod } from '../types';
import { formatCurrency, formatDate } from '../utils/formatters';
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
} from 'lucide-react';

interface BillsViewProps {
  bills: Bill[];
  subscriptions: Subscription[];
  onPayBill: (billId: string) => void;
  lang: 'ar' | 'en';
}

export const BillsView: React.FC<BillsViewProps> = ({
  bills,
  subscriptions,
  onPayBill,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopyFawry = (code?: string) => {
    if (!code) return;
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
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
      </div>

      {/* 1. Egyptian Utility Bills Section */}
      <div className="space-y-4">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <span>{isAr ? 'فواتير المرافق والتزامات الشهر' : 'Monthly Utility Bills'}</span>
        </h3>

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
                    {isAr ? b.titleAr : b.title}
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
      </div>

      {/* 2. Subscriptions Tracker */}
      <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
        <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Tv className="w-5 h-5 text-emerald-600" />
          <span>{isAr ? 'الاشتراكات المكتشفة تلقائياً' : 'Auto-Detected Subscriptions'}</span>
        </h3>

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
      </div>
    </div>
  );
};
