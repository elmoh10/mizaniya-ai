# Mizaniya AI — vNext Analytics & Reports Batch

This batch builds on the vNext Admin Completion baseline.

## Added
- Dynamic financial challenges generated from verified transaction/budget data.
- `/api/v1/challenges` endpoint.
- Financial Health page now shows live challenges and actionable recommendations.
- Advanced forecast scenarios in Smart Financial Insights:
  - optimized spending
  - baseline spending
  - stress (+20%) spending
  - estimated cash runway days
  - possible cash-crunch date
- Reports page upgraded from placeholder export buttons to real exports:
  - CSV download
  - Excel-compatible XLS download
  - printable PDF report via browser print/save-to-PDF
- Live monthly summary cards for income, expenses, net cash flow, and month-end forecast.
- Category chart now scales against the real highest category instead of a hard-coded 15,000 EGP reference.
- Removed hard-coded August 2026 report labeling; report month is derived from the active budget.

## Smoke test
1. Open Financial Health and verify 3 live challenges show real progress.
2. Open Reports and verify income/expense/net values match transactions.
3. Export CSV and open it.
4. Export Excel and open the .xls file.
5. Click PDF and save from the browser print dialog.
6. Verify Optimized / Baseline / Stress forecast cards appear.
