# الوحدة صفر: الأساس التقني لبوابة المخزون والمستودعات

> هذه الوثيقة هي **الجسر الهندسي** بين وثائق المستودعات التشغيلية الثمانية في `docs/inventory/01..08` وبين التنفيذ داخل Kyvzon.  
> لا نبدأ تنفيذ الاستلام أو التخزين أو السحب قبل تثبيت هذا الأساس؛ لأن كل وحدة لاحقة تعتمد عليه.

---

## 1. الهدف

بناء foundation موحّد لبوابة `inventory` يسمح بتنفيذ WMS احترافي يغطي:

1. الاستلام والعمليات الواردة.
2. التخزين وتحسين المواقع Slotting.
3. السحب وتنفيذ الأوامر Picking/Fulfillment.
4. الشحن والعمليات الصادرة.
5. الجرد الدوري ودقة المخزون.
6. المرتجعات واللوجستيات العكسية.
7. إدارة العمالة والإنتاجية.
8. تحليلات المستودع ولوحات KPI.

الأساس التقني يجب أن يمنع تكرار أخطاء الأنظمة الضعيفة مثل:

- تعديل الرصيد مباشرة دون حركة.
- عدم وجود تتبع lot/serial/expiry.
- دمج الاستلام مع التخزين دون put-away.
- عدم وجود LPN/Barcode كهوية وحدات مناولة.
- عدم وجود صلاحيات حسب مستودع/عملية.
- بناء dashboards بأرقام وهمية.
- تمرير `tenant_id` من العميل إلى RPCs حساسة.

---

## 2. نطاق هذه الوحدة التأسيسية

هذه الوحدة لا تمثل شاشة واحدة، بل تمثل **البنية المشتركة** لكل وحدات WMS.

### 2.1 داخل النطاق

- Role/Module integration للدور `inventory`.
- Master data للأصناف ووحدات القياس والتصنيفات.
- هيكل المستودع والمواقع والأرصفة.
- Barcode/LPN/Lot/Serial/Expiry foundation.
- Stock ledger وحساب الرصيد.
- Reservations والحجوزات.
- Reason codes للانحرافات والتسويات.
- Warehouse users والصلاحيات التشغيلية داخل المستودع.
- Audit log موحّد.
- Views تأسيسية للرصيد والتنبيهات.
- عقود تكامل مع Procurement/Finance/HR/CRM/Production لاحقاً.

### 2.2 خارج النطاق في Phase 0

هذه البنود لا تُنفذ بالكامل هنا، لكنها تعتمد على foundation:

- ASN التفصيلي وجدولة الأرصفة — وحدة 01.
- Slotting engine المتقدم — وحدة 02.
- Wave picking — وحدة 03.
- Carrier integration — وحدة 04.
- Cycle counting workflows — وحدة 05.
- RMA/returns — وحدة 06.
- Labor standards — وحدة 07.
- Root cause analytics — وحدة 08.

---

## 3. مفاتيح البوابة والدور

```text
Module Key: inventory
Default Route: /app/inventory
Primary Role: inventory
Status: beta حتى اكتمال runtime verification
```

### 3.1 نقاط الربط الإلزامية للدور

يجب أن يوجد `inventory` في:

- `src/shared/types/index.ts` → `UserRole`.
- `src/core/constants/permissions.ts` → `DEFAULT_ROLE_PERMISSIONS`.
- `src/shared/components/dashboard/Sidebar.tsx` → `ROLE_CONFIG` + pages.
- `src/utils/userUtils.ts` → `normalizeRole().validRoles` + `getUserRoleBadge()`.
- `src/router/constants.ts` → `ROLE_DEFAULT_PATH`.
- `src/pages/admin/AdminEmployeesPage.tsx` → `ROLES` + `ROLE_MODULE_MAP` + pages.
- `supabase/functions/_shared/adminAuth.ts` → `TARGET_ROLES`.
- `supabase/functions/admin-create-user/index.ts` → `TARGET_ROLES`.
- Migration لتوسيع `profiles.role` check constraint.
- `src/pages/hybridportal/hybridPagesCatalog.ts` عند الحاجة.

### 3.2 نقاط الربط الإلزامية للموديول

- `src/services/sdk/TenantModuleCatalog.ts` → `ModuleKey`, `MODULE_CATALOG`, `PLAN_ALLOWED_MODULES`.
- `src/router/moduleMap.ts` → `/app/inventory`.
- `src/router/AppRouter.tsx` → `RequireRole` + `RequireModule`.
- SDK typed service يرث `BaseService`.
- Migrations tenant-scoped + RLS.
- Contract tests.

---

## 4. الأدوار والصلاحيات التشغيلية

لا ننشئ أدوار نظام كثيرة في البداية. الدور النظامي الأساسي هو:

```text
inventory
```

لكن داخل المستودعات نحتاج صلاحيات تشغيلية أدق تُدار عبر جدول ربط أو `custom_permissions`:

| صلاحية تشغيلية | الوصف |
|---|---|
| receiver | تنفيذ الاستلام والمسح |
| putaway_operator | تنفيذ الإيداع في المواقع |
| picker | تنفيذ السحب |
| packer | التعبئة والتحقق |
| shipper | الشحن والإغلاق |
| cycle_counter | الجرد والعد |
| inventory_supervisor | اعتماد الاستثناءات الصغيرة |
| inventory_manager | اعتماد التسويات، فتح/إغلاق الجرد، إدارة المواقع |
| quality_reviewer | قرارات الحجر/الإفراج/الرفض عند الربط بالجودة |

### قاعدة مهمة

صلاحية المستخدم في بوابة المخزون ليست فقط بدوره العام، بل أيضاً بالمستودعات المسموحة له:

```text
inventory_warehouse_users
```

مثلاً موظف استلام في مستودع A لا يجب أن يستلم في مستودع B.

---

## 5. نموذج البيانات الأساسي

### 5.1 Master Data

#### `inventory_categories`

تصنيف الأصناف، يدعم hierarchy.

حقول أساسية:

```text
id
tenant_id
parent_id
code
name_ar
name_en
is_active
created_at
```

#### `inventory_uom`

وحدات القياس.

```text
id
tenant_id
code
name_ar
name_en
precision_digits
is_active
```

#### `inventory_items`

الكيان الرئيسي للصنف.

```text
id
tenant_id
item_code
name_ar
name_en
description
item_type
category_id
base_uom
tracking_policy
unspsc_code
min_qty
max_qty
reorder_point
reorder_qty
is_perishable
is_fragile
requires_cold_chain
is_hazardous
status
created_by
created_at
updated_at
```

`tracking_policy` يجب أن تكون:

```text
none
lot
serial
expiry
lot_expiry
```

#### `inventory_item_uom_conversions`

تحويل وحدات الصنف.

```text
item_id
from_uom
to_uom
factor
```

#### `inventory_item_storage_rules`

قواعد التخزين الخاصة بالصنف.

```text
item_id
allowed_warehouse_types
allowed_zone_types
requires_temperature_control
min_temperature
max_temperature
stacking_limit
hazard_class
abc_class
velocity_class
```

---

### 5.2 Warehouse Structure

#### `inventory_warehouses`

```text
warehouse_code
name_ar
warehouse_type
branch_id
status
```

أنواع المستودعات:

```text
main
raw_material
finished_good
returns
damaged
quarantine
cold
cross_dock
shipping
other
```

#### `inventory_zones`

مستوى المنطقة داخل المستودع.

```text
warehouse_id
zone_code
zone_type
name_ar
status
capacity_rule
```

`zone_type`:

```text
receiving
quarantine
bulk_storage
forward_pick
packing
shipping
returns
damaged
cold
cross_dock
```

#### `inventory_locations`

الموقع النهائي أو الوسيط.

```text
warehouse_id
zone_id
parent_id
location_code
location_type
barcode
status
max_capacity
current_capacity_used
requires_cold_chain
hazardous_allowed
x_coordinate
y_coordinate
z_coordinate
```

`location_type`:

```text
zone
aisle
rack
shelf
bin
dock
staging
quarantine
```

#### `inventory_docks`

الأرصفة والأبواب.

```text
warehouse_id
dock_code
dock_type
status
max_truck_size
calendar_enabled
```

---

### 5.3 Tracking: Lot / Serial / Expiry / LPN / Barcode

#### `inventory_lots`

```text
item_id
lot_number
manufacture_date
expiry_date
supplier_id
status
quality_status
```

`quality_status`:

```text
pending
approved
quarantine
rejected
expired
```

#### `inventory_serial_numbers`

```text
item_id
serial_number
lot_id
status
current_warehouse_id
current_location_id
```

#### `inventory_lpn`

LPN = License Plate Number، أي هوية وحدة المناولة.

```text
lpn_number
parent_lpn_id
warehouse_id
location_id
status
label_printed_at
created_source
```

`status`:

```text
created
received
in_quarantine
putaway_pending
stored
picked
packed
shipped
closed
void
```

#### `inventory_barcodes`

```text
entity_type
entity_id
barcode_value
barcode_type
is_primary
```

`entity_type`:

```text
item
location
lpn
shipment
employee
equipment
```

---

### 5.4 Stock Ledger and Balance

#### قاعدة ذهبية

```text
لا يوجد أي تغيير رصيد بدون inventory_stock_movements.
```

#### `inventory_stock_movements`

Immutable ledger.

```text
movement_number
tenant_id
movement_date
movement_type
item_id
warehouse_id
location_id
lot_id
serial_id
lpn_id
quantity
uom
base_quantity
unit_cost
currency_code
reference_type
reference_id
reason_code_id
actor_id
created_at
```

`movement_type`:

```text
opening_balance
receipt
putaway
relocation
issue
pick
pack
ship
transfer_out
transfer_in
adjustment
return_in
return_out
quarantine_hold
quarantine_release
reservation
unreservation
scrap
```

#### `inventory_stock_balances`

Current balance maintained atomically by RPC.

```text
item_id
warehouse_id
location_id
lot_id
serial_id
lpn_id
on_hand_qty
reserved_qty
available_qty
quality_hold_qty
damaged_qty
average_cost
updated_at
```

### ملاحظة PostgreSQL حرجة

لا تستخدم `UNIQUE` عادي على أعمدة nullable مثل:

```sql
UNIQUE(item_id, warehouse_id, location_id, lot_number, serial_number)
```

لأن `NULL` لا يتعارض مع `NULL` في PostgreSQL.  
الحل المعتمد:

- إما استخدام أعمدة FK غير nullable لقيم default مخصصة.
- أو استخدام unique index على expressions مثل `COALESCE`.
- أو استخدام `NULLS NOT DISTINCT` في PostgreSQL 15+.

الموصى به في Kyvzon:

```sql
CREATE UNIQUE INDEX ... ON inventory_stock_balances(
  tenant_id,
  item_id,
  warehouse_id,
  COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(lot_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(serial_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(lpn_id, '00000000-0000-0000-0000-000000000000'::uuid)
);
```

---

### 5.5 Reservations

#### `inventory_reservations`

```text
reservation_number
source_type
source_id
item_id
warehouse_id
location_id
lot_id
lpn_id
reserved_qty
status
expires_at
created_by
```

`status`:

```text
active
partially_consumed
consumed
released
expired
cancelled
```

لا يجوز السحب من مخزون محجوز لمصدر آخر إلا بصلاحية manager وبسجل audit.

---

### 5.6 Reason Codes

#### `inventory_reason_codes`

تستخدم في:

- OS&D.
- تعديلات الجرد.
- الحجر.
- الإتلاف.
- المرتجعات.

```text
code
name_ar
reason_type
requires_approval
is_active
```

`reason_type`:

```text
receiving_exception
stock_adjustment
quality_hold
return
scrap
short_pick
damage
```

---

### 5.7 Audit

#### `inventory_audit_log`

```text
entity_table
entity_id
action
actor_id
old_value
new_value
comments
created_at
```

لا تعديل ولا حذف لسجل التدقيق من الواجهة.

---

## 6. RPC Contracts الأساسية

كل RPC حساسة يجب أن:

- تكون `SECURITY DEFINER`.
- تستخدم `SET search_path = public`.
- تستخرج `tenant_id` داخلياً من `current_user_tenant_id()`.
- لا تقبل `p_tenant_id` من العميل.
- تتحقق من role/warehouse permission.
- تسجل audit عند العمليات الحرجة.

### 6.1 `inventory_require_roles(allowed_roles text[])`

يفحص:

```text
auth.uid()
current_user_tenant_id()
current_user_role()
```

ويسمح دائماً لـ:

```text
admin
developer
it_admin
```

حسب سياسة المنصة.

---

### 6.2 `create_inventory_item_full(...)`

ينشئ:

- item.
- uom conversions.
- storage rules.
- barcode اختياري.

يرفض:

- item_code مكرر داخل tenant.
- tracking_policy غير صحيح.
- base_uom غير موجود.

---

### 6.3 `archive_inventory_item(p_item_id, p_reason)`

لا يحذف الصنف، بل يحوله إلى:

```text
archived
```

ويرفض الأرشفة إن كان له رصيد غير صفري إلا بصلاحية manager وسياسة واضحة.

---

### 6.4 `post_inventory_movement(...)`

الدالة المركزية لكل حركة.

المسؤوليات:

1. تحقق من الصنف.
2. تحقق من المستودع والموقع.
3. تحقق من lot/serial عند الحاجة.
4. تحقق من الرصيد السالب.
5. إدراج الحركة immutable.
6. تحديث الرصيد الحالي atomic.
7. تسجيل audit عند الحاجة.

---

### 6.5 `reserve_inventory(...)`

يحجز كمية لمصدر:

```text
sales_order
production_order
pick_wave
transfer
manual
```

لا يزيد `on_hand_qty` ولا ينقصه، بل يزيد `reserved_qty`.

---

### 6.6 `release_inventory_reservation(...)`

يفك الحجز كلياً أو جزئياً.

---

### 6.7 `move_inventory_lpn(...)`

ينقل LPN من موقع إلى آخر مع حركة `relocation` أو `putaway`.

---

## 7. State Machines تأسيسية

### 7.1 Item

```text
active → inactive → archived
```

لا رجوع من `archived` إلا بصلاحية admin/developer وسبب.

### 7.2 Warehouse

```text
active → inactive → closed
```

لا يمكن إغلاق مستودع فيه رصيد إلا بعد تحويل/تصفير.

### 7.3 Location

```text
active → blocked → active
active → full → active
active → closed
```

### 7.4 LPN

```text
created → received → putaway_pending → stored → picked → packed → shipped → closed
```

مسار الحجر:

```text
received → in_quarantine → released → putaway_pending
received → in_quarantine → rejected → return_out/scrap
```

### 7.5 Reservation

```text
active → partially_consumed → consumed
active → released
active → expired
active → cancelled
```

---

## 8. تكامل Kyvzon الداخلي

### 8.1 Procurement

| الحدث | التكامل |
|---|---|
| PO sent/acknowledged | يمكن إنشاء ASN متوقع |
| Goods Receipt | يمكن إنشاء Receiving Session أو Receipt |
| IQC rejected | يحول الكمية إلى quarantine/rejected |
| RTV | حركة `return_out` أو `transfer_out` |
| Invoice matching | يعتمد على GR/receipt المقبول |

### قاعدة مهمة

يجب تحديد مصدر الحقيقة:

- `purchase_orders` مصدر الالتزام الشرائي.
- `goods_receipts` مصدر إثبات الاستلام الشرائي.
- `inventory_stock_movements` مصدر الحقيقة للمخزون.

لا يكفي أن ينشئ المشتريات `inventory_transactions` القديم فقط؛ يجب لاحقاً ربطه بـ ledger الجديد أو تحويله إلى compatibility view.

---

### 8.2 Finance

أحداث المخزون التي قد تولد أثر مالي لاحقاً:

- receipt.
- adjustment.
- scrap.
- return_out.
- shipment.

في المرحلة الأولى نسجل `unit_cost` و`currency_code`، ثم نربط GL لاحقاً عبر Finance RPC.

---

### 8.3 HR

وحدة Labor Management تعتمد على:

- profiles/employees.
- attendance.
- shifts.
- training/skills.
- bonuses/performance لاحقاً.

لا نكرر بيانات الموظف داخل WMS، بل نربط بـ `profiles` و/أو `employees`.

---

### 8.4 CRM / Sales

Picking/Shipping يحتاج مستقبلاً:

- sales orders.
- customer accounts.
- shipments.
- notifications.

حتى قبل اكتمال sales order، يجب تصميم `source_type/source_id` بشكل مرن.

---

### 8.5 Quality

Quarantine/OS&D/Returns تحتاج foundation جودة:

- inspection decision.
- NCR.
- defect reasons.
- disposition.

إن لم توجد وحدة جودة، نبدأ بجداول مبسطة داخل inventory ثم نفصلها لاحقاً.

---

## 9. RLS وقواعد الأمان

كل جدول يجب أن يحتوي:

```text
tenant_id UUID NOT NULL REFERENCES tenants(id)
```

وقواعد:

### SELECT

يسمح لـ:

```text
inventory
admin
manager حسب الحاجة
procurement لبعض التكاملات
finance للتقييم والتقارير
```

مع:

```sql
tenant_id = public.current_user_tenant_id()
```

### WRITE

يسمح غالباً لـ:

```text
inventory
admin
developer
it_admin
```

أما عمليات حساسة مثل adjustment/posting فيجب أن تكون عبر RPC فقط.

### ممنوع

- تمرير `tenant_id` من العميل إلى RPC.
- تحديث stock balance مباشرة من الواجهة.
- حذف stock movement.
- تعديل audit log.

---

## 10. الصفحات التأسيسية المطلوبة

قبل الوحدة 01، نحتاج هذه الصفحات:

```text
/app/inventory                  Dashboard
/app/inventory/items            الأصناف
/app/inventory/warehouses       المستودعات والمواقع
/app/inventory/stock            الأرصدة
/app/inventory/movements        الكارت المخزني
/app/inventory/settings         الإعدادات/الأسباب/وحدات القياس
```

### MVP UI

- CRUD للأصناف.
- CRUD للمستودعات.
- CRUD للمواقع.
- عرض الرصيد.
- عرض الكارت المخزني.
- إنشاء حركة opening/adjustment محدودة عبر RPC.

### ليس MVP

- Mobile barcode app.
- Heatmap رسومية متقدمة.
- Carrier integration.
- Labor incentives.

---

## 11. Acceptance Criteria للـ Foundation

### AC-01 — الدور

```text
Given مستخدم role=inventory
When يسجل الدخول
Then لا يتحول إلى employee
And يوجه إلى /app/inventory
```

### AC-02 — تفعيل الموديول

```text
Given شركة ليس لديها module inventory
When مستخدم inventory يفتح /app/inventory
Then يظهر حارس module غير مفعلة
```

### AC-03 — إنشاء صنف

```text
Given مستخدم inventory
When ينشئ صنف item_code=RM-001
Then يظهر في inventory_items لنفس tenant فقط
And لا يستطيع tenant آخر رؤيته
```

### AC-04 — منع تكرار الصنف

```text
Given item_code موجود داخل tenant
When يحاول المستخدم إنشاء نفس الكود
Then تفشل العملية بقيد unique واضح
```

### AC-05 — حركة مخزون

```text
Given صنف ومستودع وموقع نشط
When post_inventory_movement(receipt, qty=10)
Then تنشأ حركة immutable
And يزيد الرصيد on_hand_qty بمقدار 10
```

### AC-06 — منع الرصيد السالب

```text
Given available_qty=5
When issue qty=6
Then تفشل العملية NEGATIVE_STOCK_NOT_ALLOWED
```

### AC-07 — حجز المخزون

```text
Given available_qty=10
When reserve qty=4
Then reserved_qty=4
And available_qty=6
And on_hand_qty يبقى 10
```

### AC-08 — تتبع lot

```text
Given item tracking_policy=lot
When receipt بدون lot
Then تفشل العملية LOT_REQUIRED
```

### AC-09 — audit

```text
Given operation حساسة مثل adjustment
When تنجح
Then يسجل inventory_audit_log
```

### AC-10 — لا tenant_id من العميل

```text
Then لا توجد RPC حساسة تقبل p_tenant_id
```

---

## 12. خطة التنفيذ

### Phase 0A — التأسيس المعماري

- إضافة/تثبيت role/module inventory.
- إضافة وثيقة foundation.
- إضافة contract tests.

### Phase 0B — قاعدة البيانات

- master data.
- warehouse/location structure.
- lot/serial/lpn/barcode.
- stock ledger.
- reservations.
- reason codes.
- audit.
- RLS.
- RPCs الأساسية.

### Phase 0C — SDK

- typed services.
- RPC wrappers.
- منع تمرير tenant_id.

### Phase 0D — UI

- dashboard.
- items.
- warehouses/locations.
- stock balances.
- movements.
- settings.

### Phase 0E — Runtime verification

- `npm run type-check`
- `npm run db:contract-check`
- `npm run test:run`
- `npm run build`
- `npx supabase db push`
- SQL post checks.
- Smoke test.

---

## 13. العلاقة مع الوثائق الثمانية

هذه الوثيقة لا تستبدل الوثائق الثمانية. بل تجعل تنفيذها ممكناً.

| الوثيقة | تعتمد على foundation |
|---|---|
| 01 Receiving | items, warehouses, docks, LPN, stock ledger, reason codes |
| 02 Storage/Slotting | locations, zones, capacity, ABC, movement history |
| 03 Picking | reservations, tasks, stock availability, LPN/barcode |
| 04 Shipping | packing, staging, LPN, shipment source references |
| 05 Cycle Counting | balances, movements, reason codes, approvals |
| 06 Returns | LPN, quality status, reason codes, RTV/return movements |
| 07 Labor | warehouse tasks, employees, time logs |
| 08 Analytics | all transactional tables/views |

---

## 14. Definition of Done للـ Foundation

لا تعتبر Phase 0 مكتملة حتى يتحقق الآتي:

- كل جدول foundation موجود ومطبق على Supabase.
- RLS مفعّل لكل جدول.
- لا توجد RPC حساسة تقبل `tenant_id` من العميل.
- `post_inventory_movement` يعمل حياً.
- حركة receipt تزيد الرصيد.
- حركة issue تمنع السالب.
- role `inventory` يظهر في Admin ويعمل.
- module `inventory` يمكن تفعيله/تعطيله.
- dashboard لا يحتوي أرقام hardcoded.
- contract tests تمر.
- post migration checks تمر.

---

## 15. القرار الهندسي

سنبدأ التنفيذ بالترتيب التالي:

```text
00 Foundation Technical Addendum
→ 0204/0205 Inventory Foundation migrations
→ SDK foundation
→ UI foundation
→ Tests
→ ثم الوحدة 01 Receiving & Inbound Operations
```

هذا يمنع إعادة العمل لاحقاً، ويجعل بوابة المخزون قابلة للتوسع إلى WMS كامل دون كسر التصميم.
