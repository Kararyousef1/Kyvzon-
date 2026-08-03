# Checklist — الوحدة 07: إدارة الضرائب والتقديم

## A. التوثيق

- [x] إنشاء توثيق الوحدة 07.
- [x] توثيق الأكواد والتقديم والـ Dashboard.

## B. قاعدة البيانات

- [x] إنشاء migration `0247_finance_tax_management_filing.sql`.
- [x] ربط `tax_codes` و `tax_filing_status` بالكيان القانوني.
- [x] إضافة `finance_tax_filing_lines`.
- [x] إضافة RPCs: `upsert_finance_tax_code`, `update_finance_tax_code_status`, `generate_tax_filing_draft`, `update_tax_filing_status`.
- [x] إضافة Views للوحدة.
- [x] Audit Events.

## C. SDK

- [x] تحديث `TaxService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة route `/app/finance/tax-management`.
- [x] إضافة `FinanceUnitNav unit="tax"`.
- [x] تحديث `TaxManagementPage.tsx` لاستخدام RPC.
- [x] إزالة direct `as any` من تدفقات Tax الرئيسية.

## E. Checks

- [x] إضافة `src/test/financeTaxManagementContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeTaxManagementContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1469 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء كود ضريبي.
- [ ] توليد ملف ضريبي.
- [ ] إرسال/اعتماد/دفع ملف.
