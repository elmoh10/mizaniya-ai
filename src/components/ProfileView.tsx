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
  const [currency, setCurrency] = useState<Currency>('EGP');
  const [language, setLanguage] = useState<'ar' | 'en'>(lang);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchProfile();
  }, []);

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
        setSuccessMsg(isAr ? 'تم حفظ بيانات الملف الشخصي بنجاح!' : 'Profile updated successfully!');
        if (onProfileUpdated) onProfileUpdated();
      } else {
        setErrorMsg(res.error || (isAr ? 'فشلت عملية حفظ البيانات' : 'Failed to save profile'));
      }
    } catch (err: any) {
      setErrorMsg(err.message || (isAr ? 'حدث خطأ أثناء حفظ الملف الشخصي' : 'Error updating profile'));
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="py-12 text-center text-slate-400 space-y-2">
        <User className="w-8 h-8 mx-auto animate-bounce text-emerald-500" />
        <p className="text-xs font-bold">{isAr ? 'جاري تحميل الملف الشخصي...' : 'Loading profile...'}</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Title */}
      <div className="p-6 rounded-3xl bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 text-white shadow-xl border border-emerald-800/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-400">
            <User className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black">{isAr ? 'الملف الشخصي والحساب' : 'User Profile'}</h2>
            <p className="text-xs text-emerald-200/80">
              {isAr ? 'إدارة بيانات الحساب والعملة الأساسية وتفاصيل الدخل.' : 'Manage account settings and currency.'}
            </p>
          </div>
        </div>
        <div className="p-2.5 rounded-xl bg-white/10 text-emerald-300 flex items-center gap-1.5 text-xs font-bold">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>{isAr ? 'حساب موثق' : 'Verified'}</span>
        </div>
      </div>

      {/* Form Box */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4">
          {/* Read only Email */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              <span>{isAr ? 'البريد الإلكتروني (للعرض فقط)' : 'Email (Read Only)'}</span>
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
              <span>{isAr ? 'اسم المستخدم / الاسم الظاهر' : 'Display Name'}</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={isAr ? 'أدخل اسمك...' : 'Enter your name'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Salary */}
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>{isAr ? 'الراتب الشهري / الدخل الأساسي' : 'Monthly Salary'}</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={salary}
              onChange={(e) => setSalary(e.target.value)}
              placeholder="0.00"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Currency & Language */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                <span>{isAr ? 'العملة الأساسية' : 'Default Currency'}</span>
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium text-xs focus:outline-none"
              >
                <option value="EGP">جنيه مصري (EGP)</option>
                <option value="USD">دولار أمريكي (USD)</option>
                <option value="SAR">ريال سعودي (SAR)</option>
                <option value="EUR">يورو (EUR)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-500" />
                <span>{isAr ? 'اللغة المفضلة' : 'Language'}</span>
              </label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as 'ar' | 'en')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white font-medium text-xs focus:outline-none"
              >
                <option value="ar">العربية (Arabic)</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-lg transition flex items-center justify-center gap-2 mt-4"
          >
            <Save className="w-4 h-4" />
            <span>{loading ? (isAr ? 'جاري الحفظ...' : 'Saving...') : isAr ? 'حفظ التغييرات' : 'Save Changes'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
