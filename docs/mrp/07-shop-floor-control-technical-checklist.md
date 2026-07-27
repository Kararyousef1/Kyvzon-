# MRP Unit 07 — Shop Floor Control & Manufacturing Execution — Technical Checklist

> المصدر الرسمي: `docs/mrp/07-shop-floor-control.md`  
> المنهجية: لا تُعد الوحدة مكتملة إلا إذا كان كل بند موثق ممثلاً في قاعدة البيانات/RPC/RLS/Views/SDK/UI/routes/sidebar/hybrid/tests أو موسوماً بوضوح كاعتماد خارجي مستقبلي.

## 1) محطات العمل الرقمية Digital Work Stations
- [x] جدول محطات العمل الرقمية `mrp_shop_floor_workstations` مع الربط بالمصنع/الخط/مركز العمل/الأصل.
- [x] حالات المحطة: active / locked / down / maintenance / retired.
- [x] دعم نوع الجهاز: tablet / kiosk / industrial_pc / mobile / hmi / api.
- [x] حفظ SOP/work instructions URL وتعليمات العامل وخيار تسجيل الإنتاج.
- [x] جلسات الطرفيات `mrp_shop_floor_terminal_sessions` لتسجيل دخول/خروج العامل وربط الوردية.
- [x] RPC لإنشاء/تحديث محطة عمل `upsert_mrp_workstation`.
- [x] RPC فتح/إغلاق جلسة طرفية `open_mrp_terminal_session`, `close_mrp_terminal_session`.
- [x] صفحة UI: `/app/mrp/shopfloor/workstations`.
- [x] صفحة UI: `/app/mrp/shopfloor/terminals`.

## 2) تتبع الإنتاج في الوقت الحقيقي Real-Time Production Tracking
- [x] جدول أحداث الإنتاج `mrp_production_events` لتسجيل unit/batch/setup/material_request/quality_issue.
- [x] حفظ good/scrap/rework/cycle time/lot/workstation/work center/work order/operation.
- [x] تحديث كميات العملية وأمر العمل عند التسجيل.
- [x] جدول الاستهلاك الفعلي `mrp_actual_material_consumption` ومقارنة actual vs standard.
- [x] RPC بدء/إيقاف/استئناف العملية `start_mrp_operation`, `pause_mrp_operation`, `resume_mrp_operation`.
- [x] RPC تسجيل الإنتاج `record_mrp_production_event`.
- [x] RPC تسجيل الاستهلاك الفعلي `record_mrp_actual_material_consumption`.
- [x] View تتبع لحظي `mrp_real_time_production_tracking`.
- [x] View فروقات الاستهلاك `mrp_actual_vs_standard_consumption`.
- [x] صفحة UI: `/app/mrp/shopfloor/tracking`.
- [x] صفحة UI: `/app/mrp/shopfloor/consumption`.

## 3) OEE — Overall Equipment Effectiveness
- [x] جدول لقطات OEE `mrp_oee_snapshots`.
- [x] حساب Availability = run/planned.
- [x] حساب Performance = actual/theoretical.
- [x] حساب Quality = good/total.
- [x] حساب OEE = A × P × Q.
- [x] دعم الفترة/الوردية/مركز العمل/المحطة/أمر العمل.
- [x] RPC احتساب لقطة OEE `calculate_mrp_oee_snapshot`.
- [x] View `mrp_oee_dashboard`.
- [x] صفحة UI: `/app/mrp/shopfloor/oee`.

## 4) إدارة التوقفات Downtime Management + Pareto
- [x] جدول أسباب التوقف `mrp_downtime_reason_codes` بتصنيف planned/unplanned وloss bucket.
- [x] جدول أحداث التوقف `mrp_downtime_events` مع start/end/duration/status.
- [x] ربط التوقف بأمر العمل/العملية/المحطة/مركز العمل/الأصل.
- [x] RPC بدء التوقف `start_mrp_downtime`.
- [x] RPC إنهاء التوقف `end_mrp_downtime`.
- [x] RPC pause/resume للعملية يولد/يغلق downtime.
- [x] View `mrp_downtime_dashboard`.
- [x] View Pareto `mrp_downtime_pareto`.
- [x] صفحة UI: `/app/mrp/shopfloor/downtime`.
- [x] صفحة UI: `/app/mrp/shopfloor/pareto`.

## 5) حالة تنفيذ أوامر العمل Work Order Execution Status
- [x] تحديث أمر العمل إلى in_progress/paused عند التشغيل/التوقف.
- [x] تحديث كمية completed/scrapped من أحداث الإنتاج.
- [x] View `mrp_work_order_execution_status` يعرض المطلوب/المنتج/المتبقي/النسبة/CR/status.
- [x] صفحة UI: `/app/mrp/shopfloor/work-order-progress`.

## 6) إدارة العمال والورديات Labor & Shift Management
- [x] جدول `mrp_labor_assignments` لربط العامل بأمر/عملية/وردية/مركز عمل.
- [x] حفظ direct_minutes/downtime_minutes/good/scrap/productivity.
- [x] RPC `assign_mrp_labor_to_operation`.
- [x] RPC `close_mrp_labor_assignment`.
- [x] View `mrp_labor_shift_dashboard`.
- [x] صفحة UI: `/app/mrp/shopfloor/labor-shifts`.

## 7) Andon Digital Signals
- [x] جدول `mrp_andon_signals` للألوان والأولوية والحالة.
- [x] ربط Andon بالمحطة/أمر العمل/العملية/التوقف.
- [x] RPC رفع إشارة `raise_mrp_andon_signal`.
- [x] RPC إقرار `acknowledge_mrp_andon_signal`.
- [x] RPC حل/إغلاق `resolve_mrp_andon_signal` مع سبب.
- [x] View `mrp_andon_board`.
- [x] صفحة UI: `/app/mrp/shopfloor/andon`.

## 8) لوحات المشرف ومدير الإنتاج
- [x] View `mrp_supervisor_dashboard`: OEE/وحدات/توقفات/Andon لكل مركز عمل.
- [x] View `mrp_production_manager_dashboard`: مؤشرات شاملة للمصنع والخطوط.
- [x] View `mrp_shop_floor_dashboard`: ملخص الوحدة.
- [x] View `mrp_shopfloor_kpis`: OEE/Schedule Attainment/Cycle Time/MTBF/MTTR proxies.
- [x] صفحة UI: `/app/mrp/shopfloor/supervisor`.
- [x] صفحة UI: `/app/mrp/shopfloor/manager`.
- [x] صفحة UI: `/app/mrp/shopfloor/reports`.

## 9) التكاملات
- [x] التكامل مع Work Orders من الوحدة 03 عبر FK وتحديث الكميات والحالات.
- [x] التكامل مع Quality من الوحدة 06 عبر `raise_mrp_quality_issue_from_floor` الذي ينشئ NCR.
- [x] التكامل مع Maintenance عبر `mrp_shopfloor_maintenance_requests` كجسر قبل Unit 08.
- [x] RPC `create_mrp_breakdown_maintenance_request`.
- [x] View `mrp_shopfloor_maintenance_queue`.
- [x] صفحة UI: `/app/mrp/shopfloor/maintenance`.

## 10) الأمان والتعاقد التقني
- [x] RLS لكل جداول الوحدة وربط كامل بـ `tenant_id=current_user_tenant_id()`.
- [x] كل RPC يستخدم `SECURITY DEFINER` و `mrp_require_roles` ولا يستقبل `p_tenant_id` من العميل.
- [x] SDK موحد `src/services/sdk/MrpShopFloorService.ts`.
- [x] تصدير SDK في `src/services/sdk/index.ts`.
- [x] Router + Legacy Redirect + Sidebar + Hybrid Catalog.
- [x] اختبار عقد `src/test/mrp/mrpShopFloorContract.test.ts`.

## 11) اعتماد خارجي/مستقبلي معلن
- [ ] إنشاء Maintenance Work Order حقيقي داخل CMMS سيتم ربطه في Unit 08؛ حالياً الوحدة تنشئ طلب صيانة جسري قابل للتحويل لاحقاً.
- [ ] التكامل الآلي مع SCADA/PLC/HMI عبر API/MQTT ليس جزءاً من هذه الوحدة؛ تم تجهيز `device_type='api'` وحقول المحطات/الأحداث لاستقبال التكامل مستقبلاً.
