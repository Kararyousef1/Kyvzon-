# الوحدة 00: الأساس التقني لبوابة التصنيع MRP
### بوابة التصنيع MRP — Kyvzon Platform

---

## لماذا نحتاج وحدة 00 قبل BOM؟

بوابة التصنيع لا يمكن بناؤها بدءاً من BOM مباشرة، لأن BOM وأوامر العمل وMPS والجودة والصيانة والتكاليف كلها تعتمد على طبقة أساس موحدة تمثل:

- المصنع ومواقعه وخطوطه.
- مراكز العمل والآلات والطاقات.
- التقويمات والورديات والاستثناءات.
- العمليات القياسية والتوجيهات Routing.
- الموارد البشرية/الآلية/الأدوات.
- حالات أوامر الإنتاج والتوقفات والجودة والصيانة.
- تكاملات المخزون والمشتريات والمالية والجودة والصيانة وCRM.
- الترميز والباركود وسجل التدقيق والصلاحيات.

بدون هذه الطبقة، ستصبح كل وحدة لاحقة تعيد تعريف نفس المفاهيم بطريقة مختلفة، وسنحصل على تضارب في البيانات والحالات والصلاحيات.

> قاعدة تنفيذية: هذه الوحدة 00 هي أساس بوابة التصنيع. لا نبدأ تنفيذ وحدة BOM قبل اكتمالها بالكامل توثيقاً وقاعدة بيانات وواجهات وSDK واختبارات.

---

## أولاً: نطاق وحدة الأساس التقني

تشمل هذه الوحدة تأسيس العناصر المشتركة التالية:

1. هيكل التصنيع Manufacturing Organization.
2. المصانع والمناطق وخطوط الإنتاج.
3. مراكز العمل Work Centers.
4. الموارد Manufacturing Resources.
5. الآلات والأصول الإنتاجية وربطها بالصيانة.
6. التقويمات والورديات والطاقة Capacity.
7. العمليات القياسية Operation Catalog.
8. التوجيهات Routing Foundation.
9. قواعد الترميز والباركود للتصنيع.
10. حالات Status Models لكل كيان تصنيع رئيسي.
11. سجل التدقيق Audit Trail.
12. صلاحيات وأدوار التصنيع.
13. عقود التكامل مع بوابات Kyvzon الأخرى.
14. واجهات الأساس التقني.
15. اختبارات القبول والعقود البرمجية.

---

## ثانياً: الأدوار والصلاحيات Manufacturing Roles

يجب إضافة أدوار تصنيع واضحة، أو على الأقل دعمها داخل صلاحيات البوابة حتى لو بقي الدور الرئيسي `manufacturing` لاحقاً.

### الأدوار المقترحة

| الدور | الوصف |
|---|---|
| manufacturing | مستخدم بوابة التصنيع العام |
| mrp_planner | مخطط MRP/MPS |
| production_manager | مدير الإنتاج |
| production_supervisor | مشرف خط/وردية إنتاج |
| shop_floor_operator | عامل محطة عمل رقمية |
| bom_engineer | مسؤول BOM والهندسة |
| quality_inspector | فاحص جودة مرتبط بالتصنيع |
| maintenance_technician | فني صيانة |
| maintenance_manager | مدير صيانة |
| cost_accountant | محاسب تكاليف تصنيع |

### مصفوفة صلاحيات أولية

| العملية | manufacturing | mrp_planner | production_manager | supervisor | operator | quality | maintenance | finance/admin |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| عرض بيانات التصنيع | ✅ | ✅ | ✅ | ✅ | محدود | ✅ | ✅ | ✅ |
| تعديل Master Data | محدود | ✅ | ✅ | ❌ | ❌ | محدود | محدود | ✅ |
| اعتماد BOM | ❌ | ❌ | ✅ | ❌ | ❌ | عند الجودة | ❌ | ✅ |
| تشغيل MRP | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| إصدار Work Order | ❌ | ✅ | ✅ | محدود | ❌ | ❌ | ❌ | ✅ |
| بدء/إيقاف عملية | ❌ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| تسجيل Scrap/Rework | ❌ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| إغلاق Work Order | ❌ | ❌ | ✅ | محدود | ❌ | عند الجودة | ❌ | ✅ |
| تعديل تكلفة | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| إغلاق أمر صيانة | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |

---

## ثالثاً: نماذج البيانات الأساسية المطلوبة

### 1. manufacturing_plants
يمثل المصنع أو المنشأة الإنتاجية.

الحقول الأساسية:

```text
id
tenant_id
plant_code
name_ar
name_en
plant_type: manufacturing / assembly / packaging / maintenance / mixed
address
timezone
status: active / inactive / closed
created_by
created_at
updated_at
```

### 2. manufacturing_areas
يمثل مناطق داخل المصنع مثل الصهر، التجميع، التعبئة، الجودة.

```text
id
tenant_id
plant_id
area_code
name_ar
area_type: production / quality / maintenance / warehouse_link / utility / other
status
```

### 3. production_lines
خطوط الإنتاج.

```text
id
tenant_id
plant_id
area_id
line_code
name_ar
line_type: discrete / process / packaging / assembly / mixed
status: active / down / maintenance / inactive
primary_work_center_id
```

### 4. work_centers
مراكز العمل التي تُستخدم في Routing وCapacity.

```text
id
tenant_id
plant_id
line_id
work_center_code
name_ar
work_center_type: machine / labor / cell / inspection / packaging / external
capacity_uom: hour / unit / batch
standard_rate_per_hour
labor_rate_per_hour
machine_rate_per_hour
overhead_rate_per_hour
queue_time_minutes
setup_time_minutes
move_time_minutes
efficiency_percent
utilization_percent
status
```

### 5. manufacturing_resources
الموارد التي يمكن حجزها أو استخدامها في العمليات.

```text
id
tenant_id
resource_code
resource_type: labor_skill / tool / fixture / machine / inspection_device / external_service
name_ar
capacity_per_shift
cost_rate
status
```

### 6. work_center_resources
ربط الموارد بمراكز العمل.

```text
id
tenant_id
work_center_id
resource_id
required_quantity
is_primary
```

### 7. manufacturing_assets
ربط أصول الصيانة بمراكز العمل، دون تكرار CMMS.

```text
id
tenant_id
asset_code
name_ar
linked_maintenance_asset_id
plant_id
work_center_id
criticality: A / B / C
status: available / down / maintenance / retired
```

> عند تنفيذ وحدة CMMS لاحقاً، يجب ربط أصولها بهذا الجدول أو دمجه معها عبر Compatibility View.

### 8. manufacturing_calendars
تقويم إنتاجي عام.

```text
id
tenant_id
calendar_code
name_ar
timezone
status
```

### 9. manufacturing_calendar_days
الأيام العاملة والعطل والاستثناءات.

```text
id
tenant_id
calendar_id
work_date
is_working_day
available_minutes
reason
```

### 10. manufacturing_shifts
الورديات.

```text
id
tenant_id
shift_code
name_ar
starts_at_time
ends_at_time
break_minutes
status
```

### 11. work_center_shift_capacity
طاقة مركز العمل حسب الوردية والتاريخ.

```text
id
tenant_id
work_center_id
calendar_id
shift_id
work_date
available_minutes
available_capacity_units
planned_load_minutes
reserved_load_minutes
status: available / overloaded / maintenance / closed
```

### 12. manufacturing_operation_catalog
كتالوج العمليات القياسية مثل قص، ثني، لحام، تعبئة، فحص.

```text
id
tenant_id
operation_code
name_ar
operation_type: production / setup / inspection / packaging / maintenance / subcontract
standard_setup_minutes
standard_run_minutes_per_unit
requires_quality_check
requires_machine
requires_operator
status
```

### 13. routing_headers
تعريف Routing للمنتج أو لعائلة منتجات.

```text
id
tenant_id
routing_code
item_id
routing_type: manufacturing / rework / repair / subcontract
version_no
status: draft / in_review / approved / effective / superseded / archived
is_default
effective_from
effective_to
created_by
approved_by
approved_at
```

### 14. routing_operations
خطوات Routing.

```text
id
tenant_id
routing_id
sequence_no
operation_id
work_center_id
operation_name
setup_minutes
run_minutes_per_unit
queue_minutes
move_minutes
overlap_allowed
quality_gate_required
backflush_materials
instructions
status
```

### 15. manufacturing_numbering_rules
قواعد ترقيم التصنيع، يمكن إعادة استخدام نمط inventory_code_sequences أو عمل جدول خاص.

كيانات التصنيع التي تحتاج ترقيم:

```text
BOM
BOM Version
ECR
ECO
MPS
MRP Run
Planned Order
Work Order
Routing
Operation
Inspection
NCR
CAPA
Andon
Maintenance WO
Cost Rollup
```

### 16. manufacturing_audit_log
سجل تدقيق موحد أو توسيع audit log الحالي.

```text
id
tenant_id
unit_key
entity_table
entity_id
action
old_value
new_value
reason
actor_id
created_at
```

---

## رابعاً: نماذج الحالات Status Models

### BOM Status

```text
draft
in_review
approved
effective
superseded
archived
```

القواعد:

- لا يمكن استخدام BOM في Work Order إلا إذا كان `effective`.
- لا يمكن حذف BOM مستخدم في Work Order.
- أي تعديل على BOM effective ينتج إصداراً جديداً أو ECO.

### ECR Status

```text
requested
impact_analysis
approved_for_eco
rejected
closed
```

### ECO Status

```text
draft
impact_analysis
approved
scheduled
implemented
rejected
closed
```

### MPS Status

```text
draft
simulated
firmed
approved
released
superseded
cancelled
```

### MRP Run Status

```text
queued
running
completed
failed
cancelled
```

### Planned Order Status

```text
suggested
reviewed
firmed
converted_to_work_order
converted_to_purchase_requisition
cancelled
```

### Work Order Status

```text
draft
planned
firmed
released
material_reserved
in_progress
paused
completed
closed
cancelled
on_hold
```

### Operation Status

```text
pending
ready
in_progress
paused
completed
skipped
blocked
```

### Quality Status

```text
pending
in_inspection
accepted
rejected
rework_required
ncr_opened
closed
```

### Maintenance WO Status

```text
new
assigned
in_progress
completed
closed
cancelled
```

---

## خامساً: التكاملات الإلزامية مع بوابات Kyvzon

### 1. Inventory Portal Integration

MRP يجب أن يعتمد على بوابة المخزون كمصدر الحقيقة في:

```text
items
warehouses
locations
lots
serials
stock_balances
stock_movements
reservations
cycle_counting
returns
```

عمليات التكامل:

| من MRP | إلى Inventory | النتيجة |
|---|---|---|
| Work Order Release | reserve_inventory | حجز مواد |
| Material Issue | post_inventory_movement(issue) | صرف خامات |
| Backflush | post_inventory_movement(issue) | صرف تلقائي حسب BOM |
| Production Completion | post_inventory_movement(receipt/return_in) | إدخال منتج تام |
| Scrap | post_inventory_movement(scrap) | خردة إنتاج |
| Production Return | return_in | إرجاع مواد غير مستخدمة |
| Quality Hold | quality_hold_qty | تعليق مخزون |

### 2. Procurement Portal Integration

MRP لا يعيد بناء المشتريات، بل يولد مقترحات شراء.

| MRP | Procurement | النتيجة |
|---|---|---|
| Planned Purchase Recommendation | Purchase Requisition | PR تلقائي |
| Supplier Lead Time | MRP Planning | حساب تاريخ الطلب |
| PO Status | Supply Plan | عرض التوريد المتوقع |
| GR | Inventory & MRP | تحديث التوافر |

### 3. Finance Integration

| MRP | Finance | النتيجة |
|---|---|---|
| Standard Cost Rollup | Costing Ledger | تكلفة معيارية |
| Actual Material Issue | WIP | تكلفة فعلية |
| Labor Actuals | WIP | تكلفة عمالة |
| Machine Hours | Overhead | تحميل صناعي |
| Finished Goods Receipt | Inventory Valuation | تقييم المنتج التام |
| Variance | GL/Reports | فروقات إنتاج |

### 4. HR / Labor Integration

- الموظفون والمهارات والورديات من HR/Labor.
- تسجيل وقت العمل الفعلي على أوامر العمل.
- احتساب تكلفة العمالة.
- منع إسناد عملية تتطلب مهارة لعامل غير مؤهل.

### 5. Quality Integration

- IQC مرتبط باستلام الخامات.
- IPQC مرتبط بعمليات Work Order.
- OQC مرتبط بإكمال المنتج النهائي.
- NCR/CAPA يمنع الإغلاق النهائي عند وجود عيب حرج.

### 6. Maintenance Integration

- تعطل آلة يغير طاقة Work Center.
- Andon breakdown يفتح Maintenance WO.
- PM schedule يحجز وقت مركز العمل.
- MTBF/MTTR يؤثر على التخطيط.

### 7. CRM/Sales Integration

- الطلبات المؤكدة تغذي Forecast/MPS.
- MTO/ATO يعتمد على أوامر العملاء.
- تأخير الإنتاج يطلق تنبيه للعميل/المبيعات.

---

## سادساً: واجهات وحدة 00 المطلوبة

### المسارات المقترحة

```text
/app/mrp
/app/mrp/foundation
/app/mrp/foundation/plants
/app/mrp/foundation/areas
/app/mrp/foundation/lines
/app/mrp/foundation/work-centers
/app/mrp/foundation/resources
/app/mrp/foundation/assets
/app/mrp/foundation/calendars
/app/mrp/foundation/shifts
/app/mrp/foundation/capacity
/app/mrp/foundation/operations
/app/mrp/foundation/routings
/app/mrp/foundation/numbering
/app/mrp/foundation/audit
/app/mrp/foundation/integrations
```

### UX Requirements

كل صفحة Master Data يجب أن تحتوي:

- بحث بالكود والاسم.
- توليد كود تلقائي أو إدخال يدوي.
- باركود/QR إذا كان الكيان مادياً.
- Copy ID / Copy Code.
- Details modal.
- Edit safe fields.
- Archive/Close وليس hard delete.
- Audit trail داخل الصفحة.
- Lookups بدل كتابة UUID.
- Import/Export عند الحاجة.

---

## سابعاً: RPCs المطلوبة في وحدة 00

```text
mrp_require_roles(allowed_roles text[])
upsert_mrp_numbering_rule(...)
generate_mrp_next_code(...)
register_mrp_barcode(...)
create_mrp_plant(...)
create_mrp_work_center(...)
create_mrp_calendar(...)
generate_work_center_capacity(...)
upsert_operation_catalog(...)
create_routing_header(...)
add_routing_operation(...)
approve_routing(...)
archive_mrp_master_record(...)
log_mrp_audit_event(...)
check_work_center_availability(...)
```

---

## ثامناً: Views / Dashboards المطلوبة

```text
mrp_foundation_dashboard
mrp_work_center_capacity_calendar
mrp_resource_matrix
mrp_routing_overview
mrp_open_masterdata_issues
mrp_audit_activity
mrp_integration_health
```

---

## تاسعاً: Acceptance Criteria

### AC-MRP-FND-01
لا يمكن إنشاء Work Center بدون Plant نشط.

### AC-MRP-FND-02
كل Work Center يجب أن يكون له كود فريد داخل الشركة.

### AC-MRP-FND-03
يمكن للشركة تعريف ترقيم خاص بها مثل `WC-001` أو إدخال كود يدوي.

### AC-MRP-FND-04
أي تعديل على Work Center أو Routing يسجل في audit log مع السبب.

### AC-MRP-FND-05
لا يتم حذف كيان Master Data مستخدم، بل يؤرشف أو يغلق.

### AC-MRP-FND-06
التقويمات والورديات تولد capacity buckets قابلة للاستخدام في MPS/RCCP.

### AC-MRP-FND-07
Routing لا يصبح effective إلا بعد approve.

### AC-MRP-FND-08
كل حقل مرجعي في الواجهة يستخدم Lookup وليس UUID يدوي.

### AC-MRP-FND-09
أي تكامل مع المخزون/المشتريات/المالية له contract واضح ومختبر.

### AC-MRP-FND-10
الفحوصات التالية تمر قبل الخروج من الوحدة:

```bash
npm run type-check
npm run db:contract-check
npm run db:procurement-sql-check
npm run test:run -- src/test/mrp/mrpFoundationContract.test.ts
npm run test:run
npm run build
npm run lint
```

---

## عاشراً: ما لا تنفذه وحدة 00

هذه الوحدة لا تنفذ:

- BOM الكامل.
- MPS.
- MRP Run.
- Work Orders.
- Quality inspections.
- CMMS الكامل.
- Cost rollup.

لكنها تؤسس كل ما تحتاجه هذه الوحدات.

---

## خلاصة وحدة 00

وحدة الأساس التقني هي طبقة التصنيع المشتركة. إذا اكتملت بشكل صحيح، تصبح وحدات BOM وMPS وWork Orders وQuality وMES وCMMS مبنية على قاعدة واحدة متماسكة، لا على جداول متفرقة.

*هذه الوثيقة هي مصدر الحقيقة قبل تنفيذ أي كود في بوابة التصنيع MRP.*
