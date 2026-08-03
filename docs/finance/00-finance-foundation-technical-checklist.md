# Finance Unit 00 — Foundation & Control Plane Technical Checklist

> المصدر: `docs/finance/00-finance-foundation-control-plane.md`

## 1) Documentation
- [x] توثيق رسمي للوحدة.
- [x] Technical checklist.
- [x] ربط بخطة إعادة الهندسة `FINANCE_REARCHITECTURE_PLAN_AR.md`.

## 2) Existing DB Foundation
- [x] `currencies`.
- [x] `legal_entities`.
- [x] `entity_memberships`.
- [x] `fiscal_years`.
- [x] `accounting_periods`.
- [x] `cost_centers`.
- [x] `finance_projects`.
- [x] `exchange_rates`.
- [x] `finance_audit_events`.

## 3) New/Completed RPC Actions
- [x] `update_legal_entity_status`.
- [x] `assign_finance_entity_membership`.
- [x] `deactivate_finance_entity_membership`.
- [x] `upsert_finance_cost_center`.
- [x] `update_finance_cost_center_status`.
- [x] `upsert_finance_project`.
- [x] `update_finance_project_status`.
- [x] `upsert_finance_exchange_rate`.
- [x] Existing: `create_legal_entity`.
- [x] Existing: `create_fiscal_year_with_monthly_periods`.
- [x] Existing: `set_accounting_period_status`.

## 4) Views / Lookups
- [x] `finance_foundation_dashboard`.
- [x] `finance_legal_entity_lookup`.
- [x] `finance_entity_membership_board`.
- [x] `finance_cost_center_lookup`.
- [x] `finance_project_lookup`.
- [x] `finance_exchange_rate_board`.

## 5) SDK
- [x] Extend `FinanceFoundationService.ts` with status/membership/cost center/project/exchange-rate APIs.
- [x] Export services in `src/services/sdk/index.ts`.

## 6) UI Pages
- [x] `FinanceUnitNav`.
- [x] `/app/finance/foundation`.
- [x] `/app/finance/setup`.
- [x] `/app/finance/multi-entity`.
- [x] `/app/finance/accounting-periods`.
- [x] `/app/finance/entity-memberships`.
- [x] `/app/finance/cost-centers`.
- [x] `/app/finance/projects`.
- [x] `/app/finance/exchange-rates`.
- [x] `/app/finance/system-notes`.

## 7) Routing / Navigation
- [x] AppRouter lazy imports and routes.
- [x] Legacy redirects corrected and expanded.
- [x] Finance dashboard includes unit navigation.
- [ ] Sidebar main finance units pass — planned for later finance-wide UX pass.
- [ ] Admin/Hybrid catalog full finance page expansion — planned as part of finance portal re-architecture.

## 8) Tests / Checks
- [x] `src/test/finance/financeFoundationContract.test.ts`.
- [x] Update `scripts/tests/99_post_migration_checks.sql`.
- [x] Type-check/build/db checks.

## 9) Future / External Dependencies
- [ ] Multi-book accounting is Unit 03/11 scope, not Unit 00.
- [ ] Consolidation is Unit 11 scope.
- [ ] Full audit vault/system notes integration is Unit 03 scope; Unit 00 exposes existing system notes page.
