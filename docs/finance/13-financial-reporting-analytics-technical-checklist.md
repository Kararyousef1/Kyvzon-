# Checklist — الوحدة 13: التقارير المالية والتحليلات

## A. التوثيق

- [x] إنشاء توثيق الوحدة 13.
- [x] توثيق Report Runs والتصدير والـ KPIs.

## B. قاعدة البيانات

- [x] إنشاء migration `0253_finance_reporting_analytics.sql`.
- [x] إضافة `finance_report_runs`.
- [x] إضافة `finance_report_exports`.
- [x] إضافة RPCs: `generate_finance_report_run`, `request_finance_report_export`, `cancel_finance_report_run`.
- [x] إضافة Views للوحدة.
- [x] Audit Events.

## C. SDK

- [x] تحديث `FinancialReportService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة `FinanceUnitNav unit="reporting"`.
- [x] تحديث `FinancialReportsPage.tsx` لاستخدام Report Runs.
- [x] تحديث `TrialBalancePage.tsx` ضمن الوحدة.

## E. Checks

- [x] إضافة `src/test/financeReportingAnalyticsContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeReportingAnalyticsContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1443 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] توليد تقرير P&L.
- [ ] توليد تقرير Trial Balance.
- [ ] طلب تصدير.
- [ ] مراجعة Audit.
