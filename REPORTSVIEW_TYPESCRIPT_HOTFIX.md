# ReportsView TypeScript Hotfix

Fixes GitHub Actions TypeScript errors in `src/components/ReportsView.tsx` caused by `Object.values()` / `Object.entries()` values being inferred as `unknown`.

Changes:
- Explicitly types `categoryTotals` as `Record<string, number>`.
- Creates a typed `categoryEntries: Array<[string, number]>`.
- Uses numeric normalization before sorting, arithmetic, `Math.max`, and currency formatting.
- Adds a safe uncategorized fallback for expense categories.

No backend behavior, Firestore schema, or report export format was changed.
