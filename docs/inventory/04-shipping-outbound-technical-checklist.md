# الملحق التقني للوحدة 04 — الشحن والعمليات الصادرة

المصدر التشغيلي: `docs/inventory/04-shipping-outbound-operations.md`

## Checklist التنفيذ

### Packing Station
- `inventory_packing_stations`
- `inventory_packaging_materials`
- `inventory_packing_sessions`
- `inventory_packages`
- `inventory_package_lines`
- RPCs:
  - `start_inventory_packing_session(...)`
  - `verify_inventory_pack_scan(...)`
  - `suggest_inventory_carton(...)`
  - `close_inventory_package(...)`

### Shipping Documents
- `inventory_shipping_documents`
- أنواع: `shipping_label`, `packing_list`, `bol`, `commercial_invoice`, `certificate_of_origin`, `msds`, `customs`.
- RPC: `generate_inventory_shipping_document(...)`.

### Carrier / Rate Shopping
- `inventory_carriers`
- `inventory_carrier_services`
- `inventory_carrier_rate_quotes`
- RPC: `rate_shop_inventory_shipment(...)`.
- Carrier API foundation: provider, credentials_reference, simulated/live mode.

### Outbound Shipments
- `inventory_shipments`
- `inventory_shipment_packages`
- حالات: draft, packed, rated, label_printed, staged, loaded, shipped, delivered, delayed, cancelled.
- RPC: `create_inventory_shipment(...)`.

### Staging / Loading / Manifest
- `inventory_shipping_staging_lanes`
- `inventory_loading_manifests`
- `inventory_manifest_packages`
- `inventory_loading_scans`
- RPCs:
  - `stage_inventory_package(...)`
  - `scan_inventory_load_package(...)`
  - `close_inventory_loading_manifest(...)`

### Tracking & Notifications
- `inventory_shipment_tracking_events`
- `inventory_customer_shipping_notifications`
- RPC: `record_inventory_tracking_event(...)`.

### KPIs
- Views:
  - `inventory_shipping_dashboard`
  - `inventory_shipping_kpis`
  - `inventory_carrier_performance`
  - `inventory_shipping_cost_report`

## Acceptance Criteria

- AC-SHP-01: لا يمكن إغلاق package دون scan للمواد المطلوبة.
- AC-SHP-02: Rate shopping يرجع خيارات carrier service ويختار الأفضل حسب تكلفة/تاريخ وصول.
- AC-SHP-03: توليد shipping label وpacking list وBOL يسجل وثائق قابلة للطباعة.
- AC-SHP-04: loading scan يرفض package غير موجود في manifest.
- AC-SHP-05: close manifest يرفض إذا لم تُحمّل كل الطرود.
- AC-SHP-06: tracking event يحدّث حالة shipment ويرسل notification foundation.
- AC-SHP-07: لا توجد RPC تقبل `p_tenant_id`.
