import React, { useMemo, useState } from 'react';
import { Transaction, Budget } from '../types';
import { formatCurrency } from '../utils/formatters';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Check,
  TrendingUp,
  TrendingDown,
  WalletCards,
  Activity,
} from 'lucide-react';

interface ReportsViewProps {
  transactions: Transaction[];
  budget: Budget;
  smartInsights?: any;
  lang: 'ar' | 'en';
}

const escapeHtml = (value: unknown) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

function downloadBlob(content: BlobPart, type: string, fileName: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  transactions,
  budget,
  smartInsights,
  lang,
}) => {
  const isAr = lang === 'ar';
  const [downloadedFormat, setDownloadedFormat] = useState<string | null>(null);

  const monthKey = budget.monthKey || `${budget.year}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const monthlyTransactions = useMemo(
    () => transactions.filter((t) => !t.isDeleted && String(t.date || '').startsWith(monthKey)),
    [transactions, monthKey]
  );

  const totals = useMemo(() => {
    const income = monthlyTransactions.filter((t) => t.type === 'income').reduce((s, t) => s + Number(t.amount || 0), 0);
    const expenses = monthlyTransactions.filter((t) => t.type === 'expense').reduce((s, t) => s + Number(t.amount || 0), 0);
    return {
      income,
      expenses,
      net: income - expenses,
      savingsRate: income > 0 ? Math.round(((income - expenses) / income) * 100) : 0,
    };
  }, [monthlyTransactions]);

  const categoryTotals = useMemo<Record<string, number>>(() => {
    const totalsMap: Record<string, number> = {};
    monthlyTransactions.forEach((t) => {
      if (t.type === 'expense') {
        const category = String(t.category || (isAr ? 'غير مصنف' : 'Uncategorized'));
        totalsMap[category] = (totalsMap[category] || 0) + Number(t.amount || 0);
      }
    });
    return totalsMap;
  }, [monthlyTransactions, isAr]);

  const categoryEntries = useMemo<Array<[string, number]>>(() =>
    Object.entries(categoryTotals).map(([category, total]) => [category, Number(total || 0)]),
    [categoryTotals]
  );
  const maxCategory = Math.max(1, ...categoryEntries.map(([, total]) => total));
  const reportName = `mizaniya-report-${monthKey}`;

  const markDone = (format: string) => {
    setDownloadedFormat(format);
    setTimeout(() => setDownloadedFormat(null), 3000);
  };

  const handleCsvExport = () => {
    const rows = [
      ['Date', 'Type', 'Title', 'Category', 'Amount', 'Currency', 'Payment Method', 'Notes'],
      ...monthlyTransactions.map((t) => [t.date, t.type, t.title, t.category, t.amount, t.currency, t.paymentMethod, t.notes || '']),
    ];
    const csv = '\ufeff' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
    downloadBlob(csv, 'text/csv;charset=utf-8;', `${reportName}.csv`);
    markDone('CSV');
  };

  const handleExcelExport = () => {
    const bodyRows = monthlyTransactions.map((t) => `
      <tr>
        <td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.type)}</td><td>${escapeHtml(t.title)}</td>
        <td>${escapeHtml(t.category)}</td><td>${Number(t.amount || 0)}</td><td>${escapeHtml(t.currency)}</td>
        <td>${escapeHtml(t.paymentMethod)}</td><td>${escapeHtml(t.notes || '')}</td>
      </tr>`).join('');
    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>
      <table border="1"><thead><tr><th>Date</th><th>Type</th><th>Title</th><th>Category</th><th>Amount</th><th>Currency</th><th>Payment Method</th><th>Notes</th></tr></thead><tbody>${bodyRows}</tbody></table>
    </body></html>`;
    downloadBlob('\ufeff' + html, 'application/vnd.ms-excel;charset=utf-8;', `${reportName}.xls`);
    markDone('Excel');
  };

  const handlePdfExport = () => {
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) {
      alert(isAr ? 'اسمح بالنوافذ المنبثقة لطباعة التقرير كـ PDF.' : 'Allow pop-ups to print the report as PDF.');
      return;
    }
    const rows = monthlyTransactions.map((t) => `
      <tr><td>${escapeHtml(t.date)}</td><td>${escapeHtml(t.title)}</td><td>${escapeHtml(t.category)}</td><td>${Number(t.amount || 0).toLocaleString()}</td><td>${escapeHtml(t.type)}</td></tr>`).join('');
    win.document.write(`<!doctype html><html dir="${isAr ? 'rtl' : 'ltr'}"><head><meta charset="utf-8"><title>${reportName}</title>
      <style>body{font-family:Arial,sans-serif;padding:28px;color:#111}h1{margin:0 0 8px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.box{border:1px solid #ddd;border-radius:10px;padding:12px}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border:1px solid #ddd;padding:8px;font-size:12px}th{background:#f3f4f6}@media print{button{display:none}}</style>
      </head><body><h1>${isAr ? 'تقرير ميزانية AI المالي' : 'Mizaniya AI Financial Report'}</h1><div>${escapeHtml(monthKey)}</div>
      <div class="summary"><div class="box">${isAr ? 'الدخل' : 'Income'}: ${totals.income.toLocaleString()}</div><div class="box">${isAr ? 'المصروفات' : 'Expenses'}: ${totals.expenses.toLocaleString()}</div><div class="box">${isAr ? 'الصافي' : 'Net'}: ${totals.net.toLocaleString()}</div></div>
      <table><thead><tr><th>${isAr ? 'التاريخ' : 'Date'}</th><th>${isAr ? 'الوصف' : 'Title'}</th><th>${isAr ? 'الفئة' : 'Category'}</th><th>${isAr ? 'المبلغ' : 'Amount'}</th><th>${isAr ? 'النوع' : 'Type'}</th></tr></thead><tbody>${rows}</tbody></table>
      <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
    win.document.close();
    markDone('PDF');
  };

  const monthLabel = new Date(`${monthKey}-01T12:00:00`).toLocaleDateString(isAr ? 'ar-EG' : 'en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-6 pb-20 lg:pb-8 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-emerald-600" />
            <span>{isAr ? 'التقارير المالية وتصدير البيانات' : 'Financial Reports & Export'}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isAr ? `تقرير فعلي للعمليات المسجلة خلال ${monthLabel}` : `Live report for ${monthLabel}`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handlePdfExport} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow transition"><FileText className="w-4 h-4" /><span>PDF</span></button>
          <button onClick={handleExcelExport} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow transition"><FileSpreadsheet className="w-4 h-4" /><span>Excel</span></button>
          <button onClick={handleCsvExport} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs shadow transition"><Download className="w-4 h-4" /><span>CSV</span></button>
        </div>
      </div>

      {downloadedFormat && <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-bold flex items-center gap-2"><Check className="w-4 h-4 text-emerald-600" /><span>{isAr ? `تم تجهيز تقرير ${downloadedFormat} من بياناتك الفعلية.` : `${downloadedFormat} report generated from live data.`}</span></div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><TrendingUp className="w-5 h-5 text-emerald-500 mb-2"/><div className="text-[11px] text-slate-500">{isAr?'الدخل':'Income'}</div><div className="font-black text-lg">{formatCurrency(totals.income,'EGP',lang)}</div></div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><TrendingDown className="w-5 h-5 text-rose-500 mb-2"/><div className="text-[11px] text-slate-500">{isAr?'المصروفات':'Expenses'}</div><div className="font-black text-lg">{formatCurrency(totals.expenses,'EGP',lang)}</div></div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><WalletCards className="w-5 h-5 text-cyan-500 mb-2"/><div className="text-[11px] text-slate-500">{isAr?'صافي التدفق':'Net Cash Flow'}</div><div className={`font-black text-lg ${totals.net>=0?'text-emerald-500':'text-rose-500'}`}>{formatCurrency(totals.net,'EGP',lang)}</div></div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"><Activity className="w-5 h-5 text-amber-500 mb-2"/><div className="text-[11px] text-slate-500">{isAr?'توقع نهاية الشهر':'Month-end Forecast'}</div><div className="font-black text-lg">{formatCurrency(Number(smartInsights?.projectedMonthEndBalance || 0),'EGP',lang)}</div></div>
      </div>


      {smartInsights?.scenarios && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-base text-slate-900 dark:text-white">{isAr ? 'سيناريوهات نهاية الشهر' : 'Month-end Scenarios'}</h3>
              <p className="text-[11px] text-slate-500 mt-1">{isAr ? 'مقارنة حسابية بين خفض الصرف، استمرار النمط الحالي، وسيناريو ضغط أعلى.' : 'Calculated comparison of optimized, baseline and stress spending.'}</p>
            </div>
            {smartInsights.estimatedCashCrunchDate && <span className="text-[11px] px-3 py-1.5 rounded-full bg-rose-500/10 text-rose-500 font-bold">{isAr ? `عجز محتمل: ${smartInsights.estimatedCashCrunchDate}` : `Possible crunch: ${smartInsights.estimatedCashCrunchDate}`}</span>}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20"><div className="text-xs text-emerald-500 font-bold">{isAr?'لو خفضت الصرف':'Optimized'}</div><div className="text-xl font-black mt-1">{formatCurrency(Number(smartInsights.scenarios.optimized||0),'EGP',lang)}</div></div>
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20"><div className="text-xs text-amber-500 font-bold">{isAr?'النمط الحالي':'Baseline'}</div><div className="text-xl font-black mt-1">{formatCurrency(Number(smartInsights.scenarios.baseline||0),'EGP',lang)}</div></div>
            <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20"><div className="text-xs text-rose-500 font-bold">{isAr?'ضغط مصروفات +20%':'Stress +20%'}</div><div className="text-xl font-black mt-1">{formatCurrency(Number(smartInsights.scenarios.stress||0),'EGP',lang)}</div></div>
          </div>
          {smartInsights.runwayDays !== null && smartInsights.runwayDays !== undefined && <div className="text-xs text-slate-500">{isAr ? `مدة السيولة التقديرية بالمعدل الحالي: ${smartInsights.runwayDays} يوم.` : `Estimated cash runway at current burn: ${smartInsights.runwayDays} days.`}</div>}
        </div>
      )}

      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex justify-between items-center"><h3 className="font-bold text-base text-slate-900 dark:text-white">{isAr ? `توزيع المصروفات — ${monthLabel}` : `Category Expense Distribution — ${monthLabel}`}</h3><span className="text-xs text-slate-500">{monthlyTransactions.length} {isAr?'عملية':'transactions'}</span></div>
        {categoryEntries.length === 0 ? <div className="py-8 text-center text-xs text-slate-500">{isAr?'لا توجد مصروفات مسجلة في هذا الشهر.':'No expenses recorded for this month.'}</div> : <div className="space-y-3">
          {categoryEntries.slice().sort((a, b) => b[1] - a[1]).map(([cat, total]) => <div key={cat} className="space-y-1"><div className="flex justify-between text-xs font-bold"><span className="text-slate-900 dark:text-white">{cat}</span><span className="text-emerald-600">{formatCurrency(total,'EGP',lang)}</span></div><div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden"><div className="bg-emerald-500 h-full rounded-full" style={{width:`${Math.max(3,Math.round((total/maxCategory)*100))}%`}}/></div></div>)}
        </div>}
      </div>
    </div>
  );
};
