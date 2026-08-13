import React from 'react';
import { Bell, CheckCheck, X, AlertTriangle, Info, ShieldAlert } from 'lucide-react';

export interface AppNotification {
  id: string;
  severity: 'critical' | 'warning' | 'info' | string;
  titleAr: string;
  messageAr: string;
  actionAr?: string;
  isRead?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
  lang: 'ar' | 'en';
}

export const NotificationsPanel: React.FC<Props> = ({ open, onClose, notifications, onRead, onReadAll, lang }) => {
  if (!open) return null;
  const isAr = lang === 'ar';
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm flex items-start justify-end p-4 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden" onClick={e => e.stopPropagation()} dir={isAr ? 'rtl' : 'ltr'}>
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2"><Bell className="w-5 h-5 text-emerald-500"/><h3 className="font-extrabold">{isAr ? 'التنبيهات الذكية' : 'Smart Notifications'}</h3></div>
          <div className="flex gap-2">
            <button onClick={onReadAll} className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600" title={isAr ? 'تحديد الكل كمقروء' : 'Mark all read'}><CheckCheck className="w-4 h-4"/></button>
            <button onClick={onClose} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800"><X className="w-4 h-4"/></button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-3 space-y-2">
          {!notifications.length && <div className="p-8 text-center text-sm text-slate-500">{isAr ? 'لا توجد تنبيهات نشطة حاليًا.' : 'No active notifications.'}</div>}
          {notifications.map(n => {
            const Icon = n.severity === 'critical' ? ShieldAlert : n.severity === 'warning' ? AlertTriangle : Info;
            return <button key={n.id} onClick={() => onRead(n.id)} className={`w-full text-start p-4 rounded-2xl border transition ${n.isRead ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-800 opacity-75' : 'bg-emerald-500/5 border-emerald-500/25'}`}>
              <div className="flex gap-3"><Icon className={`w-5 h-5 shrink-0 ${n.severity === 'critical' ? 'text-rose-500' : n.severity === 'warning' ? 'text-amber-500' : 'text-cyan-500'}`}/><div><div className="font-bold text-sm">{n.titleAr}</div><div className="text-xs text-slate-500 mt-1 leading-5">{n.messageAr}</div>{n.actionAr && <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-semibold">{n.actionAr}</div>}</div></div>
            </button>;
          })}
        </div>
      </div>
    </div>
  );
};
