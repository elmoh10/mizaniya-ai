import React from 'react';
import { Users, Lock, ShieldAlert } from 'lucide-react';

interface FamilyViewProps {
  lang: 'ar' | 'en';
  enabled?: boolean;
}

export const FamilyView: React.FC<FamilyViewProps> = ({ lang, enabled = false }) => {
  const isAr = lang === 'ar';

  if (!enabled) {
    return (
      <div className="p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm text-center space-y-4 my-8" dir="rtl">
        <div className="w-16 h-16 bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto text-amber-500">
          <Lock className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white">
          {isAr ? 'الميزانية العائلية قيد التطوير والترخيص' : 'Family Wallet is Coming Soon'}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
          {isAr
            ? 'ميزة مشاركة المحافظ والمصروفات مع أفراد العائلة والأبناء معطلة حالياً بحسب إعدادات النظام وستكون متاحة فور اكتمال تراخيص البنك المركزي.'
            : 'Family budget sharing is currently disabled under remote configuration and will be enabled upon regulatory approval.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-7 h-7 text-indigo-600" />
            <span>{isAr ? 'حساب إدارة الميزانية العائلية' : 'Family Finance & Shared Wallet'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'إدارة مصروف المنزل، حدود مصروف الأبناء، والتحكم في صلاحيات العائلة'
              : 'Household budget management, children allowances, and permissions'}
          </p>
        </div>
      </div>

      <div className="p-12 text-center text-slate-400 border border-dashed border-slate-300 dark:border-slate-800 rounded-3xl">
        <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-bold">{isAr ? 'لا يوجد أفراد عائلة مضافين حالياً' : 'No family members added yet'}</p>
      </div>
    </div>
  );
};
