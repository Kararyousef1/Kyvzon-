# Checklist — الوحدة 03: إغلاق الفترات والتدقيق/GRC

## A. التوثيق

- [x] إنشاء توثيق الوحدة 03.
- [x] توثيق Readiness وChecklist.
- [x] توثيق قواعد الإقفال النهائي.
- [x] توثيق Audit/GRC.

## B. قاعدة البيانات

- [x] إنشاء migration `0243_finance_period_close_audit_grc.sql`.
- [x] إضافة جدول `finance_period_close_tasks`.
- [x] تفعيل RLS.
- [x] إضافة `generate_finance_period_close_checklist`.
- [x] إضافة `complete_finance_close_task`.
- [x] إضافة `waive_finance_close_task`.
- [x] إضافة `close_accounting_period_controlled`.
- [x] إضافة `reopen_accounting_period_controlled`.
- [x] إضافة `finance_period_close_readiness`.
- [x] إضافة `finance_close_checklist_board`.
- [x] إضافة `finance_audit_event_board`.
- [x] إضافة `finance_grc_dashboard`.

## C. SDK

- [x] تحديث `FinanceFoundationService.ts` بخدمة period close.
- [x] تحديث `SystemNoteService.ts` لقراءة audit board.
- [x] تحديث exports.

## D. UI

- [x] تحديث `AccountingPeriodsPage.tsx`.
- [x] إضافة `FinanceUnitNav unit="close"`.
- [x] إزالة `prompt`.
- [x] إضافة نافذة سبب.
- [x] عرض readiness.
- [x] عرض checklist.
- [x] إكمال/تجاوز task.
- [x] تحديث `SystemNotesPage.tsx` لعرض audit board المالي.

## E. Checks

- [x] إضافة `src/test/financePeriodCloseAuditContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financePeriodCloseAuditContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1491 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] توليد checklist لفترة حقيقية.
- [ ] إكمال/تجاوز المهام.
- [ ] تجربة الإقفال النهائي.
- [ ] تجربة إعادة الفتح.
- [ ] مراجعة Audit Board.
