# Checklist — الوحدة 11: المعاملات البينية والتوحيد

## A. التوثيق

- [x] إنشاء توثيق الوحدة 11.
- [x] توثيق القواعد والمعاملات والتوحيد.

## B. قاعدة البيانات

- [x] إنشاء migration `0251_finance_intercompany_consolidation.sql`.
- [x] ربط `intercompany_transactions` بالكيانات القانونية.
- [x] تقوية `consolidation_entries`.
- [x] إضافة RPCs: `create_intercompany_transaction_controlled`, `match_intercompany_transaction`, `eliminate_intercompany_transaction`, `void_intercompany_transaction`.
- [x] إضافة Views للوحدة.
- [x] Audit Events.

## C. SDK

- [x] تحديث `IntercompanyService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة route `/app/finance/intercompany`.
- [x] إضافة `FinanceUnitNav unit="intercompany"`.
- [x] تحديث `IntercompanyPage.tsx` لاستخدام RPC.
- [x] إزالة direct `as any` من التدفقات الرئيسية.

## E. Checks

- [x] إضافة `src/test/financeIntercompanyContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeIntercompanyContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1443 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء معاملة بينية.
- [ ] مطابقة معاملة.
- [ ] توليد Elimination.
- [ ] مراجعة Audit.
