# Checklist — الوحدة 05: الذمم المدينة والتحصيل

## A. التوثيق

- [x] إنشاء توثيق الوحدة 05.
- [x] توثيق العملاء والفواتير والتحصيلات والأعمار.

## B. قاعدة البيانات

- [x] إنشاء migration `0245_finance_accounts_receivable_collections.sql`.
- [x] إضافة `ar_invoice_lines`.
- [x] إضافة `customer_receipts`.
- [x] إضافة `customer_receipt_allocations`.
- [x] تفعيل RLS.
- [x] إضافة RPCs العملاء والفواتير والتحصيل: `upsert_finance_customer`, `create_ar_invoice_with_lines`, `set_ar_invoice_lifecycle_status`, `post_customer_receipt_with_reason`.
- [x] إضافة Views للوحدة.

## C. SDK

- [x] تحديث `AccountsReceivableService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة route `/app/finance/accounts-receivable`.
- [x] إضافة `FinanceUnitNav unit="ar"`.
- [x] تحديث `AccountsReceivablePage.tsx`.
- [x] إزالة direct create و `any` من تدفقات AR الرئيسية.
- [x] إضافة سبب إلزامي للحالات الحساسة.

## E. Checks

- [x] إضافة `src/test/financeAccountsReceivableContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeAccountsReceivableContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1485 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء عميل.
- [ ] إنشاء فاتورة بسطر.
- [ ] إرسال/اعتماد/إلغاء فاتورة.
- [ ] إنشاء تحصيل وترحيله.
- [ ] مراجعة Aging/Audit.
