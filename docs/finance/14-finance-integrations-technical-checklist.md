# Checklist — الوحدة 14: التكاملات المالية

## A. التوثيق

- [x] إنشاء توثيق الوحدة 14.
- [x] توثيق connectors/events/posting bridge.

## B. قاعدة البيانات

- [x] إنشاء migration `0254_finance_integrations.sql`.
- [x] إضافة `finance_integration_connectors`.
- [x] إضافة `finance_integration_events`.
- [x] إضافة RPCs: `upsert_finance_integration_connector`, `ingest_finance_integration_event`, `review_finance_integration_event`, `create_finance_journal_from_integration_event`.
- [x] إضافة Views للوحدة.
- [x] Audit Events.

## C. SDK

- [x] إنشاء `FinanceIntegrationService.ts`.
- [x] تحديث exports.

## D. UI/Routes

- [x] إضافة route `/app/finance/integrations`.
- [x] إضافة `FinanceUnitNav unit="integrations"`.
- [x] إنشاء `FinanceIntegrationsPage.tsx`.

## E. Checks

- [x] إضافة `src/test/financeIntegrationsContract.test.ts`.
- [x] تحديث post migration checks.
- [x] تشغيل `npm run type-check` — PASS محلياً.
- [x] تشغيل `npm run db:contract-check` — PASS محلياً.
- [x] تشغيل `npm run db:procurement-sql-check` — PASS محلياً.
- [x] تشغيل `npm run test:run -- src/test/financeIntegrationsContract.test.ts` — PASS محلياً.
- [x] تشغيل `npm run build` — PASS محلياً مع تحذير chunk-size المعروف.
- [x] تشغيل `npm run lint` — PASS بدون errors، مع 1443 warnings عامة/قديمة خارج نطاق الوحدة.

## F. Runtime

- [ ] تطبيق migration على Supabase — لم يتم من المساعد.
- [ ] إنشاء Connector.
- [ ] Ingest Event.
- [ ] Review Event.
- [ ] Convert to Journal.
