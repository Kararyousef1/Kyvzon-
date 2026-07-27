# MRP Unit 10 — Manufacturing Analytics — Technical Checklist

> المصدر الرسمي: `docs/mrp/10-manufacturing-analytics.md`

## 1) KPI Targets + Snapshots
- [x] جداول `mrp_manufacturing_kpi_targets`, `mrp_manufacturing_kpi_snapshots`.
- [x] RPC `upsert_mrp_manufacturing_kpi_target`.
- [x] RPC `refresh_mrp_manufacturing_kpi_snapshots`.
- [x] صفحة `/app/mrp/analytics/kpi-targets`.

## 2) Executive + Operational Dashboards
- [x] View `mrp_manufacturing_executive_dashboard`.
- [x] View `mrp_production_performance_dashboard`.
- [x] View `mrp_manufacturing_kpi_scorecard`.
- [x] صفحات dashboard/executive/operations/scorecard.

## 3) OEE + Schedule + Bottleneck
- [x] View `mrp_oee_trend_report`.
- [x] View `mrp_schedule_attainment_report`.
- [x] View `mrp_bottleneck_analysis`.
- [x] صفحات OEE/Schedule/Bottlenecks.

## 4) Quality + Cost + Maintenance Analytics
- [x] View `mrp_quality_cost_dashboard`.
- [x] View `mrp_cost_variance_dashboard`.
- [x] View `mrp_maintenance_reliability_dashboard`.
- [x] صفحات quality-cost/cost-variance/maintenance-reliability.

## 5) Alerts + Predictive Insights
- [x] جداول `mrp_manufacturing_analytics_alerts`, `mrp_manufacturing_predictive_insights`.
- [x] RPC `generate_mrp_manufacturing_predictive_alerts`.
- [x] RPC `close_mrp_manufacturing_analytics_alert`.
- [x] View `mrp_predictive_alert_queue`.
- [x] صفحة alerts.

## 6) Root Cause Analysis
- [x] جدول `mrp_manufacturing_root_cause_analyses`.
- [x] RPC `create_mrp_manufacturing_root_cause_analysis`.
- [x] RPC `close_mrp_manufacturing_root_cause_analysis`.
- [x] View `mrp_root_cause_analysis_board`.
- [x] صفحة root-cause.

## 7) Reports + Exports
- [x] جداول `mrp_manufacturing_report_runs`, `mrp_manufacturing_export_requests`.
- [x] RPC `generate_mrp_manufacturing_periodic_report`.
- [x] RPC `request_mrp_manufacturing_report_export`.
- [x] Views `mrp_manufacturing_report_center`, `mrp_manufacturing_export_queue`.
- [x] صفحات reports/exports.

## 8) Security/SDK/UI/Tests
- [x] RLS لكل الجداول.
- [x] RPCs بدون `p_tenant_id`.
- [x] SDK `MrpAnalyticsService.ts`.
- [x] Router/Sidebar/Admin/Hybrid.
- [x] اختبار عقد `mrpManufacturingAnalyticsContract.test.ts`.
