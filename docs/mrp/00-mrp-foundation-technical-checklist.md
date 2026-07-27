# Checklist تقني — الوحدة 00: الأساس التقني لبوابة التصنيع MRP

مصدر الحقيقة: `docs/mrp/00-mrp-foundation-technical-addendum.md`.

> قاعدة التنفيذ: لا نخرج إلى BOM قبل اكتمال كل بند في هذه القائمة في DB/RPC/SDK/UI/Routes/Permissions/Tests أو توثيقه كتكامل خارجي لاحق.

## 1) أدوار وبوابة التصنيع
- [x] إضافة دور/بوابة `manufacturing` في الواجهة والصلاحيات والتوجيه.
- [x] إضافة module key `mrp` في TenantModuleCatalog وRequireModule.
- [x] دعم أدوار تخصصية داخل MRP عبر جدول داخلي: mrp_planner, production_manager, supervisor, operator, bom_engineer, quality_inspector, maintenance, cost_accountant.

## 2) Master Manufacturing Data
- [x] manufacturing_plants.
- [x] manufacturing_areas.
- [x] production_lines.
- [x] work_centers.
- [x] manufacturing_resources.
- [x] work_center_resources.
- [x] manufacturing_assets.
- [x] manufacturing_calendars.
- [x] manufacturing_calendar_days.
- [x] manufacturing_shifts.
- [x] work_center_shift_capacity.
- [x] manufacturing_operation_catalog.
- [x] routing_headers.
- [x] routing_operations.

## 3) Numbering / Barcode / Audit
- [x] mrp_numbering_rules.
- [x] generate_mrp_next_code.
- [x] preview_mrp_next_code.
- [x] mrp_barcodes.
- [x] mrp_audit_log.
- [x] log_mrp_audit_event.

## 4) Status Models
- [x] Foundation status checks في الجداول.
- [x] Routing status: draft/in_review/approved/effective/superseded/archived.
- [x] Capacity status: available/overloaded/maintenance/closed.
- [x] Work center status: active/down/maintenance/inactive.

## 5) RPCs
- [x] mrp_require_roles.
- [x] upsert_mrp_numbering_rule.
- [x] preview_mrp_next_code.
- [x] generate_mrp_next_code.
- [x] create_mrp_plant.
- [x] create_mrp_work_center.
- [x] create_mrp_calendar.
- [x] generate_work_center_capacity.
- [x] upsert_operation_catalog.
- [x] create_routing_header.
- [x] add_routing_operation.
- [x] approve_routing.
- [x] archive_mrp_master_record.
- [x] check_work_center_availability.

## 6) Views / Dashboards
- [x] mrp_foundation_dashboard.
- [x] mrp_work_center_capacity_calendar.
- [x] mrp_resource_matrix.
- [x] mrp_routing_overview.
- [x] mrp_open_masterdata_issues.
- [x] mrp_audit_activity.
- [x] mrp_integration_health.

## 7) UI Pages
- [x] /app/mrp dashboard.
- [x] /app/mrp/foundation.
- [x] /app/mrp/foundation/plants.
- [x] /app/mrp/foundation/areas.
- [x] /app/mrp/foundation/lines.
- [x] /app/mrp/foundation/work-centers.
- [x] /app/mrp/foundation/resources.
- [x] /app/mrp/foundation/assets.
- [x] /app/mrp/foundation/calendars.
- [x] /app/mrp/foundation/shifts.
- [x] /app/mrp/foundation/capacity.
- [x] /app/mrp/foundation/operations.
- [x] /app/mrp/foundation/routings.
- [x] /app/mrp/foundation/numbering.
- [x] /app/mrp/foundation/audit.
- [x] /app/mrp/foundation/integrations.

## 8) UX Requirements
- [x] بحث/عرض كود واسم.
- [x] توليد كود أو إدخال يدوي للكيانات الرئيسية.
- [x] Copy ID / Copy Code.
- [x] Details modal.
- [x] Edit/status actions audited via RPC.
- [x] Lookups أساسية للـ Plant/Line/Work Center/Calendar/Shift/Operation.

## 9) Integration Contracts
- [x] توثيق وتمثيل صحة التكامل مع Inventory/Procurement/Finance/Quality/Maintenance/CRM.
- [x] View `mrp_integration_health` كبداية تحقق.

## 10) Tests
- [x] Contract test لوحدة 00.
- [x] type-check.
- [x] db:contract-check.
- [x] db:procurement-sql-check.
- [x] test:run.
- [x] build/lint.
