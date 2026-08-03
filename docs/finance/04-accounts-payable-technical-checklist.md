# Checklist — الوحدة 04: الذمم الدائنة والموردون

## A. التوثيق

- [x] إنشاء توثيق الوحدة 04.
- [x] توثيق الموردين والفواتير والمدفوعات والأعمار.
- [x] توثيق حدود Local/Supabase/Browser Runtime.

## B. قاعدة البيانات

- [x] إنشاء migration `0244_finance_accounts_payable_unit.sql`.
- [x] إضافة جدول `ap_invoice_lines`.
- [x] تفعيل RLS.
- [x] إضافة `upsert_finance_vendor`.
- [x] إضافة `update_finance_vendor_status`.
- [x] إضافة `create_ap_invoice_with_lines`.
- [x] إضافة `set_ap_invoice_lifecycle_status`.
- [x] إضافة `post_vendor_payment_with_reason`.
- [x] إضافة `void_vendor_payment`.
- [x] إضافة Views للوحدة.

## C. SDK

- [x] تحديث `AccountsPayableService.ts`.
- [x] تحديث `VendorPaymentService.ts`.
- [x] تحديث exports.

## D. UI

- [x] إضافة `FinanceUnitNav unit="ap"`.
- [x] تحديث صفحة الموردين لاستخدام RPC.
- [x] تحديث صفحة فواتير الموردين مع Line Builder.
- [x] إزالة `prompt` من فواتير الموردين.
- [x] تحديث صفحة الدفعات لسبب الترحيل.
- [x] إضافة nav لصفحة Aging.

## E. Checks

- [x] إضافة `src/test/financeAccountsPayableContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeAccountsPayableContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1488 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء مورد.
- [ ] تعطيل/تفعيل مورد بسبب.
- [ ] إنشاء فاتورة بسطر.
- [ ] إرسال واعتماد وإلغاء فاتورة.
- [ ] إنشاء دفعة وترحيلها.
- [ ] مراجعة Aging/Audit.
