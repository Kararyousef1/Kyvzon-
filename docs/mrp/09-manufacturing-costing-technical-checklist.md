# MRP Unit 09 — Manufacturing Costing — Technical Checklist

> المصدر الفني الرسمي: `docs/mrp/09-manufacturing-costing.md`  
> لا تُعد الوحدة مكتملة إلا إذا كان كل بند موثق ممثلاً في DB/RPC/RLS/Views/SDK/UI/routes/sidebar/admin/hybrid/tests أو موسوماً كاعتماد خارجي.

## 1) Cost Elements
- [x] جدول `mrp_cost_elements`.
- [x] تصنيفات: material/labor/machine/overhead/subcontract/quality/maintenance/scrap/rework.
- [x] قابل للربط بالمالية عبر `finance_account_code` دون فرض قيود مالية مبكرة.
- [x] RPC `upsert_mrp_cost_element`.
- [x] صفحة UI: `/app/mrp/costing/cost-elements`.

## 2) Costing Profiles
- [x] جدول `mrp_costing_profiles`.
- [x] طرق: standard/actual/wac/hybrid.
- [x] ربط بالمصنع وتحديد عملة وoverhead method.
- [x] RPC `upsert_mrp_costing_profile`.
- [x] صفحة UI: `/app/mrp/costing/profiles`.

## 3) Standard Cost Versions + Item Standard Costs
- [x] جداول `mrp_standard_cost_versions`, `mrp_item_standard_costs`.
- [x] حالات draft/approved/effective/superseded/archived.
- [x] RPC `create_mrp_standard_cost_version`.
- [x] RPC `upsert_mrp_item_standard_cost`.
- [x] RPC `approve_mrp_standard_cost_version`.
- [x] صفحة UI: `/app/mrp/costing/standard-costs`.

## 4) BOM/Routing Cost Rollup
- [x] جداول `mrp_cost_rollup_runs`, `mrp_cost_rollup_lines`.
- [x] Rollup للمواد من BOM.
- [x] Rollup للعمليات من Routing وWork Center rates.
- [x] حفظ Cost Breakdown حسب element/category.
- [x] RPC `run_mrp_standard_cost_rollup`.
- [x] View `mrp_cost_rollup_summary`.
- [x] صفحة UI: `/app/mrp/costing/rollup`.

## 5) Actual Work Order Costing
- [x] جداول `mrp_actual_cost_runs`, `mrp_work_order_cost_lines`, `mrp_work_order_cost_summaries`.
- [x] جمع مواد من `mrp_actual_material_consumption` أو مواد أمر العمل.
- [x] جمع عمالة من `mrp_labor_assignments`.
- [x] جمع آلة من `mrp_production_events` وwork center machine rates.
- [x] جمع صيانة من `mrp_maintenance_work_orders`.
- [x] جمع خردة/Rework من Work Order وQuality/MES.
- [x] RPC `run_mrp_actual_work_order_costing`.
- [x] View `mrp_work_order_cost_dashboard`.
- [x] صفحة UI: `/app/mrp/costing/work-order-costs`.

## 6) Variance Analysis
- [x] جدول `mrp_cost_variances`.
- [x] أنواع الفروقات: material_usage/material_price/labor_efficiency/labor_rate/machine_efficiency/overhead/scrap/rework/maintenance.
- [x] RPC `calculate_mrp_work_order_variances`.
- [x] View `mrp_cost_variance_analysis`.
- [x] صفحة UI: `/app/mrp/costing/variances`.

## 7) WIP + Finished Goods Valuation
- [x] جدول `mrp_wip_cost_ledger`.
- [x] جدول `mrp_finished_goods_costing`.
- [x] RPC `post_mrp_wip_cost_ledger`.
- [x] RPC `value_mrp_finished_goods_from_work_order`.
- [x] Views `mrp_wip_valuation`, `mrp_finished_goods_valuation`.
- [x] صفحات UI: `/app/mrp/costing/wip`, `/app/mrp/costing/finished-goods`.

## 8) Finance Posting Bridge
- [x] جدول `mrp_cost_posting_drafts`.
- [x] حالات draft/reviewed/posted/cancelled.
- [x] RPC `create_mrp_cost_posting_draft`.
- [x] RPC `mark_mrp_cost_posting_reviewed`.
- [x] RPC `mark_mrp_cost_posting_posted`.
- [x] لا ترحيل مباشر إلى GL دون مراجعة مالية.
- [x] صفحة UI: `/app/mrp/costing/postings`.

## 9) Dashboards + KPIs
- [x] Views `mrp_costing_dashboard`, `mrp_costing_kpis`, `mrp_cost_by_item_report`.
- [x] planned vs actual، cost per unit، variances، scrap/rework/maintenance cost.
- [x] صفحة UI: `/app/mrp/costing/reports`.

## 10) Security / SDK / UI / Tests
- [x] RLS لكل جداول الوحدة.
- [x] RPCs بدون `p_tenant_id` وتستخدم `mrp_require_roles`.
- [x] SDK `src/services/sdk/MrpCostingService.ts`.
- [x] Router + Legacy Redirect + Sidebar + Admin + Hybrid Catalog.
- [x] اختبار عقد `src/test/mrp/mrpCostingContract.test.ts`.

## 11) اعتماد خارجي/مستقبلي معلن
- [ ] قيود دفتر الأستاذ النهائية في Finance تُربط عبر posting drafts؛ الترحيل المحاسبي النهائي يحتاج سياسة مالية مؤكدة وحسابات فعلية في وحدة المالية.
- [ ] Costing Analytics المتقدمة والمقارنات الزمنية العميقة ستُوسع في Unit 10 Manufacturing Analytics.
