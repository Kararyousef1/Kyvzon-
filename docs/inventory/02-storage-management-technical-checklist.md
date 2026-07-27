# الملحق التقني للوحدة 02 — إدارة التخزين وتحسين المواقع

المصدر التشغيلي: `docs/inventory/02-storage-management-slotting.md`

## 1. Checklist التنفيذ

### Warehouse Structure
- توسيع `inventory_locations` لتخزين العنوان المنطقي: warehouse/zone/aisle/bay/level/bin.
- أبعاد الموقع: طول، عرض، ارتفاع، حجم، وزن أقصى.
- خصائص الموقع: Golden Zone، تسلسل السحب، نوع المواد المسموح، سياسة التخزين.
- View: `inventory_location_map` لخريطة المواقع.
- صفحة: خريطة المواقع.

### ABC Classification
- جدول `inventory_abc_classifications`.
- RPC: `refresh_inventory_abc_classification(...)`.
- التصنيف يعتمد على حركات pick/issue/ship خلال فترة تحليل.
- الفئة A/B/C تحفظ مع عدد السحوبات ونسبة الحركة.

### Slotting Engine
- جدول `inventory_slotting_strategies` لتعريف fixed/dynamic/affinity/seasonal.
- جدول `inventory_fixed_item_locations` للمواقع الثابتة.
- جدول `inventory_affinity_rules` لعلاقات الأصناف التي تسحب معاً.
- جدول `inventory_slotting_recommendations` للاقتراحات.
- RPC: `generate_inventory_slotting_recommendations()`.
- صفحة: Slotting.

### Directed Put-away
- RPC: `suggest_inventory_putaway_location(...)`.
- يعتمد على:
  - قواعد التخزين.
  - Zone type.
  - السعة المتاحة.
  - ABC class.
  - Golden Zone.
- التكامل مع الوحدة 01: مهام `inventory_putaway_tasks` تستخدم الموقع المقترح.

### Replenishment
- جدول `inventory_replenishment_policies`.
- جدول `inventory_replenishment_tasks`.
- RPC: `generate_inventory_replenishment_tasks()`.
- RPC: `complete_inventory_replenishment_task(...)`.
- يدعم Min/Max وDynamic foundation.
- صفحة: Replenishment.

### Capacity & Space Management
- View: `inventory_capacity_report`.
- View: `inventory_capacity_alerts`.
- تحذير عند تجاوز 85% وcritical عند 90%.
- صفحة: Capacity.

### Heatmap
- View: `inventory_location_heatmap`.
- يعتمد على حركات الموقع خلال آخر 30 يوم.
- صفحة: Heatmap.

### Slow/Dead Stock
- View: `inventory_slow_moving_report`.
- أصناف بلا حركة 180+ يوم.
- صفحة: Slow Moving.

### Location Labels
- جدول `inventory_location_label_prints`.
- RPC: `print_inventory_location_label(...)`.
- يحتوي QR/Barcode payload.
- صفحة: Location Labels.

### Storage KPIs
- View: `inventory_storage_kpis`.
- مؤشرات:
  - space utilization.
  - location accuracy foundation.
  - average putaway hours.
  - replenishment open/complete.
  - slow moving items.

## 2. قواعد الأمان
- كل جدول tenant-scoped.
- RLS لكل جدول.
- لا RPC تقبل `p_tenant_id`.
- العمليات الحساسة عبر `inventory_require_roles`.

## 3. Acceptance Criteria

### AC-STO-01
Given موقع تخزين له أبعاد وسعة، When تظهر خريطة المستودع، Then يظهر الموقع مع نسبة الامتلاء وحالته.

### AC-STO-02
Given حركات سحب تاريخية، When يتم تشغيل `refresh_inventory_abc_classification`, Then تصنف الأصناف A/B/C.

### AC-STO-03
Given صنف A وموقع Golden Zone متاح، When `suggest_inventory_putaway_location`, Then يفضل الموقع الذهبي إن كان متوافقاً مع قواعد التخزين.

### AC-STO-04
Given forward pick location وصل إلى min_qty، When `generate_inventory_replenishment_tasks`, Then تنشأ مهمة تجديد.

### AC-STO-05
Given موقع امتلاؤه أكثر من 90%, Then يظهر في `inventory_capacity_alerts` كـ critical.

### AC-STO-06
Given صنف بلا حركة أكثر من 180 يوم، Then يظهر في `inventory_slow_moving_report`.

### AC-STO-07
Given موقع جديد، When `print_inventory_location_label`, Then يسجل label payload قابل للطباعة.

### AC-STO-08
Then لا توجد RPC في هذه الوحدة تقبل `tenant_id` من العميل.
