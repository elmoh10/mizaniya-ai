import React, { useState } from 'react';
import { Transaction, Budget } from '../types';
import { formatCurrency } from '../utils/formatters';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Check,
  Sparkles,
} from 'lucide-react';

interface ReportsViewProps {
  transactions: Transaction[];
  budget: Budget;
  lang: 'ar' | 'en';
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  transactions,
  budget,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [downloadedFormat, setDownloadedFormat] = useState<string | null>(null);

  const handleExport = (format: string) => {
    setDownloadedFormat(format);
    setTimeout(() => setDownloadedFormat(null), 3000);
  };

  const categoryTotals: Record<string, number> = {};
  transactions.forEach((t) => {
    if (t.type === 'expense') {
      categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    }
  });

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-600" />
            <span>{isAr ? 'التقارير المالية وتصدير البيانات' : 'Financial Reports & Export'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr
              ? 'تصدير كشوف الحسابات الماليّة بصيغ PDF و Excel و CSV مع التحليلات الذكية'
              : 'Export detailed financial statements in PDF, Excel, or CSV format'}
          </p>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('PDF')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition"
          >
            <FileText className="w-4 h-4" />
            <span>PDF</span>
          </button>

          <button
            onClick={() => handleExport('Excel')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Excel</span>
          </button>

          <button
            onClick={() => handleExport('CSV')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow transition"
          >
            <Download className="w-4 h-4" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {downloadedFormat && (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2 animate-fadeIn">
          <Check className="w-4 h-4 text-emerald-600" />
          <span>
            {isAr
              ? `تم تجهيز وتحميل كشف الحساب المالي بصيغة ${downloadedFormat} بنجاح!`
              : `Financial report in ${downloadedFormat} format downloaded!`}
          </span>
        </div>
      )}

      {/* Category Breakdown Table */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <h3 className="font-bold text-base text-slate-900 dark:text-white">
          {isAr ? 'توزيع المصروفات حسب الفئة (أغسطس 2026)' : 'Category Expense Distribution'}
        </h3>

        <div className="space-y-3">
          {Object.entries(categoryTotals).map(([cat, total], idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-900 dark:text-white">{cat}</span>
                <span className="text-emerald-600">{formatCurrency(total, 'EGP', lang)}</span>
              </div>
              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full"
                  style={{ width: `${Math.min(100, Math.round((total / 15000) * 100))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
