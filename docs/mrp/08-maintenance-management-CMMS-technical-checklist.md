# MRP Unit 08 — Maintenance Management / CMMS — Technical Checklist

> المصدر الرسمي: `docs/mrp/08-maintenance-management-CMMS.md`  
> المنهجية: لا تخرج الوحدة من التنفيذ إلا إذا كان كل بند موثق ممثلاً في DB/RPC/RLS/Views/SDK/UI/routes/sidebar/hybrid/tests أو موسوماً بوضوح كاعتماد خارجي.

## 1) Asset Registry — سجل الأصول
- [x] جدول أصول CMMS `mrp_maintenance_assets` مرتبط بـ `manufacturing_assets` ومركز العمل/المصنع/الخط.
- [x] بيانات المصنع/الموديل/السيريال/الشراء/التشغيل/الضمان/القيمة/العمر الإنتاجي.
- [x] مواصفات تقنية JSONB ووثائق الأصل `mrp_maintenance_asset_documents`.
- [x] حالة الأصل: active/down/maintenance/retired.
- [x] RPC `upsert_mrp_maintenance_asset`.
- [x] صفحة UI: `/app/mrp/maintenance/assets`.

## 2) Criticality Matrix — تصنيف الأهمية
- [x] جدول `mrp_asset_criticality_assessments`.
- [x] حساب score = production impact × failure likelihood.
- [x] تصنيف A/B/C تلقائي.
- [x] RPC `assess_mrp_asset_criticality`.
- [x] View `mrp_maintenance_asset_registry`.
- [x] صفحة UI: `/app/mrp/maintenance/criticality`.

## 3) Maintenance Types — Reactive / Preventive Maintenance (PM) / PdM / CBM
- [x] دعم أنواع أوامر الصيانة: reactive/breakdown/preventive/predictive/condition_based/shutdown/inspection.
- [x] خطط PM `mrp_pm_plans` و `mrp_pm_plan_tasks`.
- [x] قياسات PdM/CBM `mrp_condition_monitoring_readings`.
- [x] تنبيهات الحالة `mrp_condition_alerts`.
- [x] RPC `create_mrp_pm_plan`.
- [x] RPC `add_mrp_pm_plan_task`.
- [x] RPC `record_mrp_condition_reading` يفتح تنبيه/أمر عند تجاوز الحدود.
- [x] صفحات UI: PM Plans, Sensor/Condition Readings.

## 4) Maintenance Work Orders
- [x] جدول أوامر الصيانة `mrp_maintenance_work_orders`.
- [x] دورة حياة: new/assigned/in_progress/completed/closed/cancelled/on_hold.
- [x] جداول مهام الأمر `mrp_maintenance_work_order_tasks`.
- [x] تخصيص الفني، تقدير وفعلي، تعليمات، أصل، أولوية، مصدر.
- [x] RPC `create_mrp_maintenance_work_order`.
- [x] RPC `generate_mrp_pm_work_orders` من خطط PM.
- [x] RPC `assign_mrp_maintenance_work_order`.
- [x] RPC `start_mrp_maintenance_work_order`.
- [x] RPC `complete_mrp_maintenance_work_order`.
- [x] RPC `close_mrp_maintenance_work_order` مع سبب.
- [x] View `mrp_maintenance_work_order_board`.
- [x] صفحة UI: `/app/mrp/maintenance/work-orders`.

## 5) Spare Parts Management
- [x] جدول قطع الغيار `mrp_maintenance_spare_parts` مرتبط بالمخزون.
- [x] تصنيف insurance/consumable/emergency/repairable/tool.
- [x] min/max/reorder point/lead time/cost.
- [x] جدول قطع أمر الصيانة `mrp_maintenance_work_order_parts`.
- [x] RPC `upsert_mrp_maintenance_spare_part`.
- [x] RPC `add_mrp_maintenance_work_order_part`.
- [x] RPC `issue_mrp_maintenance_spare_part`.
- [x] RPC `generate_mrp_spare_part_reorder_recommendations` يجهز توصيات شراء عبر MRP Procurement.
- [x] View `mrp_maintenance_spare_parts_status`.
- [x] صفحة UI: `/app/mrp/maintenance/spare-parts`.

## 6) Scheduling + Capacity Reservation
- [x] PM calendar view `mrp_pm_calendar`.
- [x] عند إنشاء/جدولة أمر صيانة يتم حجز/وسم طاقة مركز العمل في `work_center_shift_capacity` عند وجود تاريخ ومركز عمل.
- [x] صفحة UI: `/app/mrp/maintenance/pm-calendar`.

## 7) Annual Shutdowns
- [x] جدول `mrp_annual_shutdown_plans`.
- [x] جدول مهام التوقف `mrp_annual_shutdown_tasks`.
- [x] RPC `create_mrp_annual_shutdown_plan`.
- [x] RPC `add_mrp_shutdown_task`.
- [x] View `mrp_annual_shutdown_schedule`.
- [x] صفحة UI: `/app/mrp/maintenance/shutdowns`.

## 8) تكاملات MRP
- [x] Shop Floor → CMMS: RPC `convert_shopfloor_request_to_maintenance_wo` يحول طلب العطل من Unit 07 إلى أمر صيانة فعلي.
- [x] Production Planning: حجز الطاقة/عدم الإتاحة عند جدولة الصيانة.
- [x] Inventory: spare parts linked to inventory items and issue tracking.
- [x] Procurement: shortage recommendations via `create_mrp_procurement_recommendation`.
- [x] Costing: حفظ labor/parts/other cost كجسر للوحدة 09.
- [x] View `mrp_maintenance_integration_health`.

## 9) KPIs and Dashboards
- [x] MTBF/MTTR view `mrp_maintenance_mtbf_mttr`.
- [x] PM Compliance + preventive/reactive ratio view `mrp_maintenance_kpis`.
- [x] Dashboard view `mrp_maintenance_dashboard`.
- [x] Cost by asset view `mrp_maintenance_cost_by_asset`.
- [x] صفحات UI: dashboard/reports.

## 10) الأمان والتعاقد التقني
- [x] RLS لكل جداول الوحدة وربط كامل بـ `tenant_id=current_user_tenant_id()`.
- [x] كل RPC يستخدم SECURITY DEFINER و `mrp_require_roles` ولا يستقبل `p_tenant_id` من العميل.
- [x] SDK موحد `src/services/sdk/MrpMaintenanceService.ts`.
- [x] Router + Legacy Redirect + Sidebar + Admin Employees + Hybrid Catalog.
- [x] اختبار عقد `src/test/mrp/mrpMaintenanceContract.test.ts`.

## 11) اعتماد خارجي/مستقبلي معلن
- [ ] خصم قطع الغيار من المخزون الفعلي عبر حركة مخزنية مالية كاملة سيُغلق نهائياً مع وحدة 09 Costing/Inventory accounting؛ حالياً يتم تتبع issue/consumed داخل أمر الصيانة ويربط الصنف بالمخزون.
- [ ] تنبؤ AI حقيقي بالأعطال من تيارات حساسات SCADA/IoT سيتم كتكامل خارجي؛ حالياً يدعم CBM/PdM thresholds ويفتح تنبيه/أمر تلقائياً عند تجاوز الحدود.
