# Checklist — الوحدة 02: القيود والدفتر العام

## A. التوثيق

- [x] إنشاء توثيق الوحدة 02.
- [x] توثيق دورة حياة القيد.
- [x] توثيق قواعد Line Builder والأبعاد.
- [x] توثيق حدود Local/Supabase/Browser Runtime.

## B. قاعدة البيانات

- [x] إنشاء migration `0242_finance_general_ledger_journal_lifecycle.sql`.
- [x] إضافة أعمدة void على `journal_entries`.
- [x] إضافة `submit_journal_entry`.
- [x] إضافة `approve_journal_entry`.
- [x] إضافة `post_journal_entry_with_reason`.
- [x] إضافة `void_journal_entry`.
- [x] إضافة `finance_journal_lifecycle_dashboard`.
- [x] إضافة `finance_journal_entry_board`.
- [x] إضافة `finance_journal_entry_line_board`.
- [x] تسجيل Audit Event لكل انتقال حالة.

## C. SDK

- [x] تحديث `GeneralLedgerService.ts`.
- [x] إضافة `findBoard`.
- [x] إضافة `findLines`.
- [x] إضافة `findLifecycleDashboard`.
- [x] إضافة `submitEntry`.
- [x] إضافة `approveEntry`.
- [x] تحديث `postJournalEntry` ليطلب سبباً.
- [x] إضافة `voidEntry`.

## D. UI

- [x] تحديث `JournalEntriesPage.tsx`.
- [x] إضافة `FinanceUnitNav unit="gl"`.
- [x] استخدام `finance_posting_account_lookup` للحسابات.
- [x] إضافة Lookups لمراكز التكلفة والمشاريع.
- [x] إظهار متطلبات الأبعاد.
- [x] إزالة `confirm/prompt` من صفحة القيود.
- [x] إضافة نافذة سبب لكل انتقال حالة.
- [x] عرض سطور القيد المحدد.

## E. Checks

- [x] إضافة `src/test/financeGeneralLedgerLifecycleContract.test.ts`.
- [x] تحديث `scripts/tests/99_post_migration_checks.sql`.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeGeneralLedgerLifecycleContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1496 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق Supabase migration — لم يتم من المساعد.
- [ ] اختبار إنشاء قيد فعلي.
- [ ] اختبار submit/approve/post.
- [ ] اختبار void قبل الترحيل.
- [ ] اختبار reverse بعد الترحيل.
- [ ] مراجعة Audit Events في Supabase.
