# Checklist — الوحدة 06: النقد والبنوك والتسوية

## A. التوثيق

- [x] إنشاء توثيق الوحدة 06.
- [x] توثيق الحسابات والكشوف والتسويات.

## B. قاعدة البيانات

- [x] إنشاء migration `0246_finance_cash_bank_reconciliation.sql`.
- [x] ربط bank tables بالكيان القانوني.
- [x] إضافة RPCs الحسابات والكشوف والمطابقة والتسوية: `upsert_finance_bank_account`, `create_bank_statement_import_with_lines`, `match_bank_statement_line`, `complete_bank_reconciliation`.
- [x] إضافة Views للوحدة.
- [x] Audit Events للعمليات الحساسة.

## C. SDK

- [x] تحديث `BankStatementImportService.ts`.
- [x] تحديث `CashManagementService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة routes النقد والبنوك.
- [x] إضافة `FinanceUnitNav unit="cash"`.
- [x] تحديث `CashManagementPage.tsx` لاستخدام RPC.
- [x] تحديث `BankStatementImportPage.tsx` لاستخدام RPC.
- [x] إزالة direct `as any` من تدفقات Cash/Bank الرئيسية.

## E. Checks

- [x] إضافة `src/test/financeCashBankContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeCashBankContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1471 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء حساب بنكي.
- [ ] استيراد كشف بسطر.
- [ ] مطابقة سطر.
- [ ] إنشاء وإكمال تسوية.
