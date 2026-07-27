# الملحق التقني للوحدة 03 — عمليات السحب وتنفيذ الأوامر

المصدر التشغيلي: `docs/inventory/03-picking-operations-fulfillment.md`

## 1. Checklist التنفيذ

### Pick Order Types
- جدول `inventory_pick_orders` يدعم source_type:
  - `production_order`
  - `sales_order`
  - `replenishment`
  - `transfer`
  - `manual`
- حقل `critical_ratio` لأولوية الإنتاج.
- حالات: `draft`, `released`, `in_progress`, `partially_picked`, `picked`, `short_picked`, `cancelled`.

### Picking Methods
- دعم طرق:
  - discrete
  - batch
  - cluster
  - zone
  - wave
- جدول `inventory_pick_waves` للموجات.
- جدول `inventory_pick_wave_orders` لربط الأوامر بالموجات.
- جدول `inventory_pick_containers` لدعم Cluster Picking.

### Smart Pick Lists + Route Optimization
- جدول `inventory_pick_lists`.
- جدول `inventory_pick_tasks`.
- خوارزميات `s_shape`, `largest_gap`, `combined`.
- RPC: `generate_inventory_pick_list(...)`.
- ترتيب حسب `pick_sequence` والموقع.

### Mobile Picking / Scan-to-Confirm
- جدول `inventory_pick_scans`.
- RPC: `confirm_inventory_pick_scan(...)`.
- لا يمكن إكمال مهمة بدون scan صحيح للصنف/الموقع/LPN حسب الإعداد.

### Exceptions
- جدول `inventory_pick_exceptions`.
- أنواع: `short_pick`, `location_empty`, `wrong_item`, `wrong_lot`, `damaged`, `other`.
- RPC: `report_inventory_pick_exception(...)`.
- يسجل audit/notification ويحدث حالة المهمة.

### Wave Management
- RPC: `create_inventory_pick_wave(...)`.
- RPC: `release_inventory_pick_wave(...)`.
- لوحة موجات مرئية.

### Task Interleaving
- استعمال foundation من الوحدة 02: `inventory_task_interleaving_suggestions`.
- RPC: `generate_inventory_picking_interleaving(...)` يربط pick tasks مع replenishment/putaway.

### Employee Performance
- View: `inventory_picking_productivity`.
- View: `inventory_picking_kpis`.
- مؤشرات: pick accuracy, pick rate, short pick rate, cycle time, on-time pick.

### Technology Foundation
- جدول `inventory_picking_technology_events` لأنماط:
  - barcode
  - voice
  - pick_to_light
  - rfid
- يثبت دعم التقنيات بدون تكامل أجهزة متقدم في المرحلة الأولى.

## 2. قواعد الأمان
- كل جدول tenant-scoped.
- RLS لكل جدول.
- RPCs لا تقبل `p_tenant_id`.
- كل posting عبر `inventory_require_roles`.

## 3. Acceptance Criteria

### AC-PICK-01
Given pick order with lines, When `generate_inventory_pick_list`, Then ينشأ pick list/tasks مرتبة بالمسار.

### AC-PICK-02
Given task requires scan, When user scans wrong item/location, Then operation fails and wrong scan is logged.

### AC-PICK-03
Given insufficient stock, When picking, Then short pick exception is created.

### AC-PICK-04
Given wave created, When released, Then all orders become released and tasks become open/assigned.

### AC-PICK-05
Given pick task completed, Then inventory movement `pick` is posted and stock is reduced.

### AC-PICK-06
Given production order source, Then priority uses critical_ratio.

### AC-PICK-07
Then no sensitive RPC accepts tenant_id from client.
