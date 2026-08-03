# Checklist — الوحدة 09: الأصول الثابتة

## A. التوثيق

- [x] إنشاء توثيق الوحدة 09.
- [x] توثيق الأصول والإهلاك والاستبعاد.

## B. قاعدة البيانات

- [x] إنشاء migration `0249_finance_fixed_assets.sql`.
- [x] ربط `fixed_assets` و `depreciation_schedules` بالكيان.
- [x] إضافة RPCs: `upsert_finance_fixed_asset`, `generate_fixed_asset_depreciation_schedule`, `run_fixed_asset_depreciation`, `update_fixed_asset_status`.
- [x] إضافة Views للوحدة.
- [x] Audit Events.

## C. SDK

- [x] تحديث `FixedAssetService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة route `/app/finance/fixed-assets`.
- [x] إضافة `FinanceUnitNav unit="assets"`.
- [x] تحديث `FixedAssetsPage.tsx` لاستخدام RPC.
- [x] إزالة direct `as any` من تدفقات Fixed Assets الرئيسية.

## E. Checks

- [x] إضافة `src/test/financeFixedAssetsContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeFixedAssetsContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1453 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء أصل.
- [ ] توليد جدول إهلاك.
- [ ] تشغيل الإهلاك.
- [ ] استبعاد أصل بسبب.
