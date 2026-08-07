import React, { useState } from 'react';
import { Wallet, Currency } from '../types';
import { formatCurrency } from '../utils/formatters';
import { apiClient } from '../services/apiClient';
import {
  Wallet as WalletIcon,
  Plus,
  Landmark,
  CreditCard,
  PiggyBank,
  Coins,
  X,
  CheckCircle2,
  AlertCircle,
  Building2,
} from 'lucide-react';

interface WalletsViewProps {
  wallets: Wallet[];
  onRefreshWallets: () => Promise<void> | void;
  lang: 'ar' | 'en';
}

export const WalletsView: React.FC<WalletsViewProps> = ({
  wallets,
  onRefreshWallets,
  lang,
}) => {
  const isAr = lang === 'ar';

  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<'cash' | 'bank' | 'card' | 'savings'>('cash');
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [initialBalance, setInitialBalance] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const getTypeLabel = (t: string) => {
    switch (t) {
      case 'cash':
        return isAr ? 'كاش / نقدي' : 'Cash';
      case 'bank':
        return isAr ? 'حساب بنكي' : 'Bank Account';
      case 'card':
        return isAr ? 'بطاقة ائتمان/خصم' : 'Card';
      case 'savings':
        return isAr ? 'حساب ادخار' : 'Savings Account';
      case 'wallet':
        return isAr ? 'محفظة إلكترونية' : 'E-Wallet';
      case 'credit':
        return isAr ? 'بطاقة ائتمانية' : 'Credit Card';
      default:
        return t;
    }
  };

  const getTypeIcon = (t: string) => {
    switch (t) {
      case 'bank':
        return Landmark;
      case 'card':
      case 'credit':
        return CreditCard;
      case 'savings':
        return PiggyBank;
      case 'wallet':
        return Building2;
      case 'cash':
      default:
        return Coins;
    }
  };

  const handleCreateWallet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const payload = {
        name: name.trim(),
        nameAr: name.trim(),
        type,
        currency,
        balance: parseFloat(initialBalance) || 0,
        accountNumber: accountNumber.trim() || undefined,
        icon: type === 'bank' ? 'Landmark' : type === 'card' ? 'CreditCard' : type === 'savings' ? 'PiggyBank' : 'Wallet',
        color: type === 'bank' ? 'bg-blue-600' : type === 'savings' ? 'bg-amber-600' : 'bg-emerald-600',
      };

      const res = await apiClient.post('/wallets', payload);
      if (res.success) {
        setSuccessMsg(isAr ? 'تمت إضافة المحفظة بنجاح!' : 'Wallet created successfully!');
        setName('');
        setInitialBalance('');
        setAccountNumber('');
        await onRefreshWallets();
        setTimeout(() => {
          setShowAddModal(false);
          setSuccessMsg(null);
        }, 1200);
      } else {
        setErrorMsg(res.error || (isAr ? 'فشلت عملية إضافة المحفظة' : 'Failed to create wallet'));
      }
    } catch (err: any) {
      console.error('Create wallet error:', err);
      setErrorMsg(err.message || (isAr ? 'حدث خطأ أثناء الاتصال بالخادم' : 'Error connecting to server'));
    } finally {
      setLoading(false);
    }
  };

  const totalBalance = wallets.reduce((acc, w) => acc + (w.balance || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-xl border border-emerald-800/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <WalletIcon className="w-6 h-6 text-emerald-400" />
            <h2 className="text-2xl font-black">{isAr ? 'إدارة المحافظ والسيولة' : 'Wallets & Liquidity'}</h2>
          </div>
          <p className="text-xs text-emerald-200/80">
            {isAr
              ? 'تابع أرصدة محافظك النقدية والحسابات البنكية ومحفظة فودافون كاش وإنستا باي في مكان واحد.'
              : 'Track cash balances, bank accounts, and e-wallets safely.'}
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white/10 backdrop-blur-md p-3.5 rounded-2xl border border-white/10 shrink-0">
          <div>
            <span className="text-[11px] text-emerald-300 block font-bold">{isAr ? 'إجمالي السيولة' : 'Total Liquidity'}</span>
            <span className="text-xl font-black text-white">{formatCurrency(totalBalance, 'EGP', lang)}</span>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-2 transition shadow-lg"
          >
            <Plus className="w-4 h-4" />
            <span>{isAr ? 'إضافة محفظة' : 'Add Wallet'}</span>
          </button>
        </div>
      </div>

      {/* Wallets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {wallets.length === 0 ? (
          <div className="col-span-full py-12 text-center text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <WalletIcon className="w-12 h-12 mx-auto text-slate-500 opacity-50" />
            <p className="text-sm font-medium">{isAr ? 'لا توجد محافظ مسجلة حالياً' : 'No wallets found'}</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs hover:bg-emerald-500 transition"
            >
              {isAr ? 'إنشاء أول محفظة الآن' : 'Create First Wallet'}
            </button>
          </div>
        ) : (
          wallets.map((wallet) => {
            const IconComp = getTypeIcon(wallet.type);
            return (
              <div
                key={wallet.id}
                className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-emerald-500/50 transition space-y-4 flex flex-col justify-between"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl text-white ${wallet.color || 'bg-emerald-600'} shadow-md`}>
                      <IconComp className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-slate-900 dark:text-white">{wallet.name}</h3>
                      <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 mt-0.5">
                        {getTypeLabel(wallet.type)}
                      </span>
                    </div>
                  </div>
                  {wallet.isPrimary && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                      {isAr ? 'افتراضية' : 'Default'}
                    </span>
                  )}
                </div>

                {wallet.accountNumber && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono dir-ltr">
                    Acc: **** {wallet.accountNumber.slice(-4)}
                  </p>
                )}

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{isAr ? 'الرصيد المتاح' : 'Available Balance'}</span>
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(wallet.balance, wallet.currency || 'EGP', lang)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* --- ADD WALLET MODAL --- */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative space-y-4">
            <button
              onClick={() => {
                setShowAddModal(false);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="absolute top-4 left-4 p-1 rounded-lg text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-emerald-600" />
              <span>{isAr ? 'إضافة محفظة مالية جديدة' : 'Add New Wallet'}</span>
            </h3>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {successMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-500 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            <form onSubmit={handleCreateWallet} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  {isAr ? 'اسم المحفظة / الحساب' : 'Wallet Name'}
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={isAr ? 'مثال: حساب البنك الأهلي، كاش الجيب...' : 'e.g. CIB Account'}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    {isAr ? 'نوع المحفظة' : 'Type'}
                  </label>
                  <select
                    value={type}
                    onChange={(e) => setType(e.target.value as any)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none"
                  >
                    <option value="cash">{isAr ? 'كاش (نقدي)' : 'Cash'}</option>
                    <option value="bank">{isAr ? 'حساب بنكي' : 'Bank Account'}</option>
                    <option value="card">{isAr ? 'بطاقة ائتمان/خصم' : 'Card'}</option>
                    <option value="savings">{isAr ? 'حساب ادخار' : 'Savings'}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    {isAr ? 'العملة' : 'Currency'}
                  </label>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value as Currency)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium focus:outline-none"
                  >
                    <option value="EGP">جنيه مصري (EGP)</option>
                    <option value="USD">دولار أمريكي (USD)</option>
                    <option value="SAR">ريال سعودي (SAR)</option>
                    <option value="EUR">يورو (EUR)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                  {isAr ? 'الرصيد الافتتاحي' : 'Initial Balance'}
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={initialBalance}
                  onChange={(e) => setInitialBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {(type === 'bank' || type === 'card') && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-bold mb-1">
                    {isAr ? 'رقم الحساب / البطاقة (اختياري)' : 'Account Number (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    placeholder="**** 1234"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-mono focus:outline-none"
                  />
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold shadow-lg transition mt-2"
              >
                {loading ? (isAr ? 'جاري الحفظ...' : 'Saving...') : isAr ? 'حفظ المحفظة' : 'Save Wallet'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
