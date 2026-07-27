# الملحق التقني للوحدة 01 — الاستلام والعمليات الواردة

المصدر التشغيلي: `docs/inventory/01-receiving-inbound-operations.md`

## 1. Checklist التنفيذ

### ASN — Advanced Shipping Notice
- جدول `inventory_asns` لرأس إشعار الشحنة.
- جدول `inventory_asn_lines` لبنود الشحنة والكميات والـ Lot/Serial/Expiry المتوقع.
- حالات ASN: `draft`, `submitted`, `confirmed`, `partially_received`, `received`, `closed`, `cancelled`.
- ربط اختياري بـ `purchase_orders` و `suppliers` دون كسر إذا لم توجد بيانات.
- RPC: `create_inventory_asn(...)`.
- واجهة: قائمة ASN وتفاصيل ASN.

### Dock Scheduling
- جدول `inventory_dock_appointments`.
- حالات الموعد: `requested`, `scheduled`, `checked_in`, `unloading`, `completed`, `no_show`, `cancelled`.
- منع ازدواجية حجز نفس الرصيف لنفس النافذة الزمنية.
- RPC: `schedule_inventory_dock_appointment(...)`.
- واجهة: تقويم/جدول الأرصفة.

### Receiving Sessions
- جدول `inventory_receiving_sessions`.
- جدول `inventory_receiving_lines`.
- حالات الجلسة: `open`, `receiving`, `exception`, `posted`, `putaway_pending`, `completed`, `cancelled`.
- ربط الجلسة بـ ASN أو PO أو مصدر يدوي.
- RPCs:
  - `start_inventory_receiving_session(...)`.
  - `record_inventory_receiving_line(...)`.
  - `post_inventory_receiving_session(...)`.
- واجهة: قائمة جلسات الاستلام وتفاصيل الجلسة.

### OS&D
- جدول `inventory_osd_cases`.
- أنواع: `overage`, `shortage`, `damage`, `wrong_item`, `seal_mismatch`, `documentation_error`, `other`.
- حالات: `open`, `under_review`, `accepted`, `rejected`, `rtv_required`, `resolved`, `cancelled`.
- حفظ الصور/المرفقات كـ JSONB metadata حالياً، وربط storage لاحقاً.
- RPC: `create_inventory_osd_case(...)`.
- واجهة: قائمة OS&D.

### Quarantine
- جدول `inventory_quarantine_holds`.
- حالات: `on_hold`, `released`, `rejected`, `scrapped`, `returned`.
- أي كمية تحتاج جودة تُرحّل إلى hold أو موقع حجر.
- واجهة: قائمة الحجر.

### LPN / Labeling
- الاستفادة من جدول foundation `inventory_lpn`.
- توليد LPN عند الاستلام عند الحاجة.
- RPC: `generate_inventory_lpn_for_receipt(...)`.
- واجهة: صفحة LPN Labels.

### Cross-Docking
- جدول `inventory_cross_dock_tasks`.
- حالات: `planned`, `ready`, `moved`, `cancelled`.
- لا تنفذ خوارزمية متقدمة الآن؛ foundation فقط.
- واجهة: قائمة مهام Cross-Dock.

### KPIs / Reports
- View `inventory_receiving_kpis`.
- View `inventory_receiving_dashboard`.
- مؤشرات: open sessions, dock-to-stock average, OS&D count, ASN compliance.

## 2. قواعد الأمان
- كل جدول يحتوي `tenant_id` وRLS.
- لا توجد RPC تقبل `p_tenant_id`.
- العمليات الحساسة عبر SECURITY DEFINER.
- فحص role عبر `inventory_require_roles`.

## 3. Acceptance Criteria

### AC-RCV-01
Given ASN صالح، When يتم بدء جلسة استلام منه، Then تنشأ receiving session مرتبطة بنفس tenant وASN.

### AC-RCV-02
Given receiving line بكمية مقبولة، When يتم post session، Then تنشأ inventory movement من نوع `receipt` ويزيد الرصيد.

### AC-RCV-03
Given فرق overage/shortage/damage، When يسجل المستخدم الحالة، Then تنشأ OS&D case ولا تختفي من dashboard حتى resolved.

### AC-RCV-04
Given مواد تحتاج جودة، When يتم post receiving، Then توضع في quarantine hold ولا تعتبر available للاستخدام حتى release.

### AC-RCV-05
Given dock appointment، When توجد نافذة زمنية متداخلة لنفس dock، Then يمنع النظام الحجز المكرر.

### AC-RCV-06
Then لا توجد أي RPC في هذه الوحدة تقبل `tenant_id` من العميل.
