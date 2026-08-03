# Checklist — الوحدة 12: محاسبة المشاريع

## A. التوثيق

- [x] إنشاء توثيق الوحدة 12.
- [x] توثيق المشاريع والموازنات والفعلي.

## B. قاعدة البيانات

- [x] إنشاء migration `0252_finance_project_accounting.sql`.
- [x] إضافة `finance_project_budget_lines`.
- [x] إضافة `finance_project_actual_snapshots`.
- [x] إضافة RPCs: `upsert_project_accounting_project`, `upsert_project_budget_line`, `generate_project_actuals_snapshot`, `update_project_accounting_status`.
- [x] إضافة Views للوحدة.
- [x] Audit Events.

## C. SDK

- [x] إنشاء/تحديث `ProjectAccountingService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة route `/app/finance/project-accounting`.
- [x] إضافة `FinanceUnitNav unit="project"`.
- [x] تحديث `ProjectAccountingPage.tsx` لاستخدام RPC.
- [x] إزالة direct `as any` و Supabase insert من التدفقات الرئيسية.

## E. Checks

- [x] إضافة `src/test/financeProjectAccountingContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeProjectAccountingContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1443 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء مشروع.
- [ ] إضافة سطر موازنة.
- [ ] توليد Snapshot.
- [ ] إغلاق مشروع بسبب.
