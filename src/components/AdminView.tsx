import React, { useState, useEffect } from 'react';
import { FeatureFlags } from '../types';
import { apiClient } from '../services/apiClient';
import {
  Sliders,
  ToggleLeft,
  ToggleRight,
  X,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface AdminViewProps {
  onClose: () => void;
  lang: 'ar' | 'en';
}

export const AdminView: React.FC<AdminViewProps> = ({ onClose, lang }) => {
  const isAr = lang === 'ar';

  const [flags, setFlags] = useState<FeatureFlags>({
    voiceAssistant: true,
    emergencyMode: true,
    familyWallet: false,
    ocrReceiptScanner: true,
    aiAutoBudget: true,
    geminiProRouting: true,
    whatsappIntegration: false,
    instapayDirectSync: true,
  });

  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiClient.get('/system-config'),
      apiClient.get('/admin/metrics'),
    ])
      .then(([configRes, metricsRes]) => {
        if (configRes.success && configRes.flags) {
          setFlags(configRes.flags);
        }
        if (metricsRes.success && metricsRes.metrics) {
          setStats(metricsRes.metrics);
        } else {
          setStats(null);
        }
      })
      .catch((err) => {
        console.error('Admin view fetch error:', err);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleToggleFlag = async (key: keyof FeatureFlags) => {
    setErrorMessage(null);
    const targetFlags = { ...flags, [key]: !flags[key] };
    setSaving(true);

    try {
      const res = await apiClient.post('/system-config', { flags: targetFlags });
      if (res.success && res.flags) {
        setFlags(res.flags);
      } else {
        setErrorMessage(res.error || (isAr ? 'فشل حفظ التغييرات في النظام' : 'Failed to save system config'));
      }
    } catch (err: any) {
      setErrorMessage(err.message || (isAr ? 'خطأ في الاتصال بالخادم' : 'Server connection error'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto" dir="rtl">
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 relative space-y-6 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-6 left-6 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-white transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-slate-900 text-emerald-400 font-bold border border-emerald-500/30">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{isAr ? 'لوحة تحكم المسؤول وإدارة الميزات' : 'Admin Platform & Feature Flags'}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {isAr
                ? 'إدارة النظام والتحكم بمؤشرات الأداء والحماية'
                : 'Remote Configuration & Cloud Infrastructure metrics'}
            </p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Stats Grid or Data Unavailable */}
        {loading ? (
          <div className="p-8 text-center text-slate-500 text-xs animate-pulse">
            {isAr ? 'جاري جلب مؤشرات النظام...' : 'Loading system metrics...'}
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400 block">{isAr ? 'إجمالي المستخدمين' : 'Total Users'}</span>
              <span className="text-base font-bold text-slate-900 dark:text-white mt-0.5 block">
                {stats.users ?? 0}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400 block">{isAr ? 'إجمالي المعاملات' : 'Transactions'}</span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                {stats.transactions ?? 0}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
              <span className="text-slate-400 block">{isAr ? 'حالة النظام' : 'System Status'}</span>
              <span className="text-base font-bold text-cyan-500 mt-0.5 block">
                {stats.system || 'Mizaniya AI'}
              </span>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs flex items-center justify-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>Data unavailable</span>
          </div>
        )}

        {/* Feature Flags Toggles */}
        <div className="space-y-3">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span>{isAr ? 'مفاتيح التفعيل عن بُعد (Feature Flags)' : 'Feature Flags'}</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {Object.entries(flags).map(([key, val]) => (
              <button
                key={key}
                disabled={saving}
                onClick={() => handleToggleFlag(key as keyof FeatureFlags)}
                className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 flex items-center justify-between cursor-pointer hover:border-emerald-500 transition disabled:opacity-50 text-right"
              >
                <div>
                  <span className="font-bold text-slate-900 dark:text-white block">{key}</span>
                  <span className="text-[10px] text-slate-400">
                    {val ? (isAr ? 'مفعل الآن' : 'Enabled') : (isAr ? 'معطل' : 'Disabled')}
                  </span>
                </div>

                {val ? (
                  <ToggleRight className="w-6 h-6 text-emerald-500 shrink-0" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-400 shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg transition"
        >
          {isAr ? 'إغلاق لوحة النظام' : 'Close Dashboard'}
        </button>
      </div>
    </div>
  );
};
