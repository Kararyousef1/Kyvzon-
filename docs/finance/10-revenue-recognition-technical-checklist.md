# Checklist — الوحدة 10: الاعتراف بالإيرادات

## A. التوثيق

- [x] إنشاء توثيق الوحدة 10.
- [x] توثيق العقود والجداول والاعتراف.

## B. قاعدة البيانات

- [x] إنشاء migration `0250_finance_revenue_recognition.sql`.
- [x] ربط `revenue_contracts` و `revenue_recognition_schedules` بالكيان.
- [x] إضافة RPCs: `upsert_finance_revenue_contract`, `generate_revenue_recognition_schedule`, `recognize_revenue_schedule_line`, `update_revenue_contract_status`.
- [x] إضافة Views للوحدة.
- [x] Audit Events.

## C. SDK

- [x] تحديث `RevenueRecognitionService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة route `/app/finance/revenue-recognition`.
- [x] إضافة `FinanceUnitNav unit="revenue"`.
- [x] تحديث `RevenueRecognitionPage.tsx` لاستخدام RPC.
- [x] إزالة direct `as any` من تدفقات Revenue الرئيسية.

## E. Checks

- [x] إضافة `src/test/financeRevenueRecognitionContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeRevenueRecognitionContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1448 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء عقد إيراد.
- [ ] توليد جدول اعتراف.
- [ ] تشغيل اعتراف.
- [ ] إكمال/إلغاء عقد.
