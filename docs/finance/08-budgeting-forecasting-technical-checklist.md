# Checklist — الوحدة 08: الموازنات والتنبؤات

## A. التوثيق

- [x] إنشاء توثيق الوحدة 08.
- [x] توثيق الموازنة والتباين والتنبؤ.

## B. قاعدة البيانات

- [x] إنشاء migration `0248_finance_budgeting_forecasting.sql`.
- [x] ربط `budgets`, `budget_lines`, `budget_variance_reports`, `cash_forecast_scenarios` بالكيان القانوني.
- [x] إضافة RPCs: `upsert_finance_budget`, `upsert_finance_budget_line`, `update_finance_budget_status`, `generate_budget_variance_report`, `upsert_finance_forecast_scenario`, `update_finance_forecast_status`.
- [x] إضافة Views للوحدة.
- [x] Audit Events.

## C. SDK

- [x] تحديث `BudgetService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة routes: `/budget`, `/budget-variance`.
- [x] إضافة `FinanceUnitNav unit="budget"`.
- [x] تحديث `BudgetPage.tsx` لاستخدام RPC وLine Builder.
- [x] تحديث `AdvancedVariancePage.tsx` لاستخدام SDK.
- [x] تحديث `CashForecastPage.tsx` لاستخدام SDK.

## E. Checks

- [x] إضافة `src/test/financeBudgetingForecastingContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeBudgetingForecastingContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1460 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء موازنة.
- [ ] إضافة سطور.
- [ ] إرسال/اعتماد الموازنة.
- [ ] توليد Variance.
- [ ] إنشاء Forecast واعتماده.
