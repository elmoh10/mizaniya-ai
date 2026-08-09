import React, { useState, useEffect } from 'react';
import { UserProfile, Currency } from '../types';
import { apiClient } from '../services/apiClient';
import {
  User,
  Mail,
  Coins,
  Globe,
  DollarSign,
  Save,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  Send,
  Link2,
  Loader2,
} from 'lucide-react';

interface ProfileViewProps {
  userEmail: string;
  lang: 'ar' | 'en';
  onProfileUpdated?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userEmail,
  lang,
  onProfileUpdated,
}) => {
  const isAr = lang === 'ar';

  const [displayName, setDisplayName] = useState('');
  const [salary, setSalary] = useState('');
  const [currency, setCurrency] = useState('EGP');
  const [language, setLanguage] = useState<'ar' | 'en'>(lang);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ============================================================
  // Telegram Linking State
  // ============================================================

  const [telegramCode, setTelegramCode] = useState('');
  const [telegramLoading, setTelegramLoading] = useState(false);
  const [telegramSuccess, setTelegramSuccess] = useState<string | null>(null);
  const [telegramError, setTelegramError] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  // ============================================================
  // Load Profile
  // ============================================================

  const fetchProfile = async () => {
    setFetching(true);

    try {
      const res = await apiClient.get('/profile');

      if (res.success && res.profile) {
        const p: UserProfile = res.profile;

        setDisplayName(p.displayName || '');
        setSalary(p.salary ? String(p.salary) : '0');
        setCurrency(p.currency || 'EGP');
        setLanguage(p.language || 'ar');
      }
    } catch (err: any) {
      console.error('Fetch profile error:', err);
    } finally {
      setFetching(false);
    }
  };

  // ============================================================
  // Save Profile
  // ============================================================

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const payload = {
        displayName: displayName.trim() || undefined,
        salary: parseFloat(salary) || 0,
        currency,
        language,
      };

      const res = await apiClient.patch('/profile', payload);

      if (res.success) {
        setSuccessMsg(
          isAr
            ? 'تم حفظ بيانات الملف الشخصي بنجاح!'
            : 'Profile updated successfully!'
        );

        if (onProfileUpdated) {
          onProfileUpdated();
        }
      } else {
        setErrorMsg(
          res.error ||
            (isAr
              ? 'فشلت عملية حفظ البيانات'
              : 'Failed to save profile')
        );
      }
    } catch (err: any) {
      setErrorMsg(
        err.message ||
          (isAr
            ? 'حدث خطأ أثناء حفظ الملف الشخصي'
            : 'Error updating profile')
      );
    } finally {
      setLoading(false);
    }
  };

  // ============================================================
  // Telegram Linking
  // ============================================================

  const handleTelegramLink = async (e: React.FormEvent) => {
    e.preventDefault();

    setTelegramSuccess(null);
    setTelegramError(null);

    const normalizedCode = telegramCode.replace(/\D/g, '');

    if (!/^\d{6}$/.test(normalizedCode)) {
      setTelegramError(
        isAr
          ? 'من فضلك أدخل كود الربط المكوّن من 6 أرقام.'
          : 'Please enter the 6-digit Telegram linking code.'
      );

      return;
    }

    setTelegramLoading(true);

    try {
      const res = await apiClient.post('/telegram/link', {
        code: normalizedCode,
      });

      if (res.success) {
        setTelegramSuccess(
          res.message ||
            (isAr
              ? 'تم ربط حساب Telegram بحساب ميزانية AI بنجاح.'
              : 'Telegram account linked successfully.')
        );

        setTelegramCode('');
      } else {
        setTelegramError(
          res.error ||
            (isAr
              ? 'تعذر ربط حساب Telegram.'
              : 'Failed to link Telegram account.')
        );
      }
    } catch (err: any) {
      setTelegramError(
        err?.message ||
          (isAr
            ? 'حدث خطأ أثناء ربط حساب Telegram.'
            : 'An error occurred while linking Telegram.')
      );
    } finally {
      setTelegramLoading(false);
    }
  };

  // ============================================================
  // Loading
  // ============================================================

  if (fetching) {
    return (
      <div className="flex items-center justify-center min-h-[300px] text-slate-500 dark:text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin me-2" />

        <span className="text-sm font-medium">
          {isAr
            ? 'جاري تحميل الملف الشخصي...'
            : 'Loading profile...'}
        </span>
      </div>
    );
  }

  return (
    <div
      className="max-w-4xl mx-auto space-y-6"
      dir={isAr ? 'rtl' : 'ltr'}
    >
      {/* ===================================================== */}
      {/* Page Header */}
      {/* ===================================================== */}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <User className="w-5 h-5 text-emerald-600" />

            <h1 className="text-xl font-black text-slate-900 dark:text-white">
              {isAr
                ? 'الملف الشخصي والحساب'
                : 'User Profile'}
            </h1>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isAr
              ? 'إدارة بيانات الحساب والعملة الأساسية وتفاصيل الدخل والتكاملات.'
              : 'Manage account settings, currency, income and integrations.'}
          </p>
        </div>

        <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
          <ShieldCheck className="w-4 h-4" />

          <span>
            {isAr
              ? 'حساب موثق'
              : 'Verified'}
          </span>
        </div>
      </div>

      {/* ===================================================== */}
      {/* Profile Form */}
      {/* ===================================================== */}

      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />

            <span>
              {successMsg}
            </span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />

            <span>
              {errorMsg}
            </span>
          </div>
        )}

        <form
          onSubmit={handleSaveProfile}
          className="space-y-4"
        >
          {/* Email */}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />

              <span>
                {isAr
                  ? 'البريد الإلكتروني (للعرض فقط)'
                  : 'Email (Read Only)'}
              </span>
            </label>

            <input
              type="email"
              disabled
              value={userEmail}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 text-slate-500 dark:text-slate-400 font-mono text-xs cursor-not-allowed"
            />
          </div>

          {/* Display Name */}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-emerald-600" />

              <span>
                {isAr
                  ? 'اسم المستخدم / الاسم الظاهر'
                  : 'Display Name'}
              </span>
            </label>

            <input
              type="text"
              value={displayName}
              onChange={(e) =>
                setDisplayName(e.target.value)
              }
              placeholder={
                isAr
                  ? 'أدخل اسمك...'
                  : 'Enter your name'
              }
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Salary */}

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />

              <span>
                {isAr
                  ? 'الراتب الشهري / الدخل الأساسي'
                  : 'Monthly Salary'}
              </span>
            </label>

            <input
              type="number"
              step="0.01"
              min="0"
              value={salary}
              onChange={(e) =>
                setSalary(e.target.value)
              }
              placeholder="0.00"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Currency & Language */}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-500" />

                <span>
                  {isAr
                    ? 'العملة الأساسية'
                    : 'Default Currency'}
                </span>
              </label>

              <select
                value={currency}
                onChange={(e) =>
                  setCurrency(
                    e.target.value as Currency
                  )
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium text-xs focus:outline-none"
              >
                <option value="EGP">
                  جنيه مصري (EGP)
                </option>

                <option value="USD">
                  دولار أمريكي (USD)
                </option>

                <option value="SAR">
                  ريال سعودي (SAR)
                </option>

                <option value="EUR">
                  يورو (EUR)
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-500" />

                <span>
                  {isAr
                    ? 'اللغة المفضلة'
                    : 'Language'}
                </span>
              </label>

              <select
                value={language}
                onChange={(e) =>
                  setLanguage(
                    e.target.value as
                      | 'ar'
                      | 'en'
                  )
                }
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium text-xs focus:outline-none"
              >
                <option value="ar">
                  العربية (Arabic)
                </option>

                <option value="en">
                  English
                </option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 mt-4"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}

            <span>
              {loading
                ? isAr
                  ? 'جاري الحفظ...'
                  : 'Saving...'
                : isAr
                  ? 'حفظ التغييرات'
                  : 'Save Changes'}
            </span>
          </button>
        </form>
      </div>

      {/* ===================================================== */}
      {/* Telegram Integration */}
      {/* ===================================================== */}

      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 shrink-0 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
            <Send className="w-5 h-5 text-sky-500" />
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr
                  ? 'ربط Telegram'
                  : 'Connect Telegram'}
              </h2>

              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                Mizaniya AI
              </span>
            </div>

            <p className="mt-1 text-xs leading-6 text-slate-500 dark:text-slate-400">
              {isAr
                ? 'اربط حساب Telegram بحسابك حتى يتمكن بوت ميزانية AI من الوصول الآمن إلى بياناتك المالية وتنفيذ أوامرك.'
                : 'Connect Telegram so the Mizaniya AI bot can securely access your account and process your financial requests.'}
            </p>
          </div>
        </div>

        <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
            {isAr
              ? 'طريقة الربط:'
              : 'How to connect:'}
          </p>

          <p className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
            {isAr
              ? 'افتح بوت @mizaniyaaibot على Telegram واكتب /link. سيظهر لك كود من 6 أرقام صالح لمدة 10 دقائق. اكتب الكود بالأسفل.'
              : 'Open @mizaniyaaibot on Telegram and send /link. You will receive a 6-digit code valid for 10 minutes. Enter it below.'}
          </p>
        </div>

        {telegramSuccess && (
          <div className="mt-4 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />

            <span>
              {telegramSuccess}
            </span>
          </div>
        )}

        {telegramError && (
          <div className="mt-4 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />

            <span>
              {telegramError}
            </span>
          </div>
        )}

        <form
          onSubmit={handleTelegramLink}
          className="mt-5"
        >
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
            <Link2 className="w-3.5 h-3.5 text-sky-500" />

            <span>
              {isAr
                ? 'كود ربط Telegram'
                : 'Telegram Link Code'}
            </span>
          </label>

          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={telegramCode}
              onChange={(e) => {
                const value =
                  e.target.value
                    .replace(/\D/g, '')
                    .slice(0, 6);

                setTelegramCode(value);
                setTelegramError(null);
                setTelegramSuccess(null);
              }}
              placeholder="000000"
              className="flex-1 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-center tracking-[0.5em] font-black text-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
            />

            <button
              type="submit"
              disabled={
                telegramLoading ||
                telegramCode.length !== 6
              }
              className="px-6 py-3 rounded-xl bg-sky-600 hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2"
            >
              {telegramLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}

              <span>
                {telegramLoading
                  ? isAr
                    ? 'جاري الربط...'
                    : 'Connecting...'
                  : isAr
                    ? 'ربط Telegram'
                    : 'Connect Telegram'}
              </span>
            </button>
          </div>
        </form>

        <div className="mt-4 flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />

          <p>
            {isAr
              ? 'يتم استخدام الكود مرة واحدة فقط، ولا يحتاج البوت إلى كلمة مرور حسابك.'
              : 'The linking code can only be used once. The bot never needs your account password.'}
          </p>
        </div>
      </div>
    </div>
  );
};
