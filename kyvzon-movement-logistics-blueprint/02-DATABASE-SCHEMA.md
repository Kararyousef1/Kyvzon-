# 🗄️ مخطط قاعدة البيانات الكامل

> **41 جدولاً** موزَّعة على المايجريشنات `0270`–`0295`.
> كل جدول: `tenant_id` + RLS + `created_at`. الحرجة: `updated_at` + تدقيق.

---

## 0) قواعد التصميم الملزمة

| القاعدة | التطبيق |
|---|---|
| الإحداثيات | `NUMERIC(10,7)` — **لا PostGIS** (غير مثبَّت) |
| المسافة | `NUMERIC(10,3)` كيلومتر |
| المبالغ | `NUMERIC(16,2)` + `currency_code TEXT DEFAULT 'IQD'` |
| كل `status` | `CHECK (... IN (...))` صريح — **لا نص حر** |
| الحذف | ممنوع — `archived_at` / `cancelled_at` + سبب |
| الأرقام التسلسلية | تُولَّد بمحفّز عند الإدراج — لا إدخال يدوي |
| المرفقات | `Storage` + جدول ربط، لا `bytea` |

---

## 1) الأساس المشترك — `0270`

### `movement_role_assignments`
راجع `01-ROLES-AND-SEPARATION.md` §2.

### `movement_locations` — سجل المواقع الموحَّد
> يستبدل `destination VARCHAR(300)` النص الحر. **جوهر الإصلاح.**

```sql
CREATE TABLE public.movement_locations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  location_code   TEXT NOT NULL,
  name_ar         TEXT NOT NULL,
  name_en         TEXT,
  location_type   TEXT NOT NULL CHECK (location_type IN
    ('office','branch','warehouse','plant','customer','supplier',
     'depot','fuel_station','service_center','port','border','other')),
  -- الإحداثيات: NUMERIC لا PostGIS
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  geofence_radius_m INTEGER DEFAULT 150 CHECK (geofence_radius_m > 0),
  address_line    TEXT,
  city            TEXT,
  governorate     TEXT,
  country_code    TEXT DEFAULT 'IQ',
  -- الربط بكيانات Kyvzon القائمة
  branch_id       UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  warehouse_id    UUID REFERENCES public.inventory_warehouses(id) ON DELETE SET NULL,
  supplier_id     UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  -- نوافذ العمل والقيود
  operating_hours JSONB DEFAULT '{}'::jsonb,   -- {"sun":{"open":"08:00","close":"16:00"}}
  dock_count      INTEGER DEFAULT 0,
  requires_appointment BOOLEAN DEFAULT false,
  access_notes    TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','inactive','archived')),
  archived_at     TIMESTAMPTZ,
  archive_reason  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, location_code)
);
CREATE INDEX idx_mov_loc_coords ON public.movement_locations(tenant_id, latitude, longitude)
  WHERE status = 'active';
```

### `movement_geofences` — أسوار جغرافية
```sql
CREATE TABLE public.movement_geofences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name_ar       TEXT NOT NULL,
  fence_type    TEXT NOT NULL DEFAULT 'circle'
                CHECK (fence_type IN ('circle','polygon')),
  center_lat    NUMERIC(10,7),
  center_lng    NUMERIC(10,7),
  radius_m      INTEGER,
  polygon_points JSONB,                 -- [{lat,lng},...] عند polygon
  location_id   UUID REFERENCES public.movement_locations(id) ON DELETE CASCADE,
  alert_on_enter BOOLEAN DEFAULT false,
  alert_on_exit  BOOLEAN DEFAULT false,
  alert_on_dwell_minutes INTEGER,       -- تنبيه عند تجاوز المكوث
  is_restricted  BOOLEAN DEFAULT false, -- منطقة محظورة
  status        TEXT NOT NULL DEFAULT 'active'
                CHECK (status IN ('active','inactive')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((fence_type='circle'  AND center_lat IS NOT NULL AND radius_m IS NOT NULL)
      OR (fence_type='polygon' AND polygon_points IS NOT NULL))
);
```

### `movement_policies` · `movement_audit_events`
نمط `procurement_policies` و`procurement_audit_events` حرفياً
(`policy_key` · `policy_value JSONB` · `applies_to_role`).

---

## 2) الدور «أ» — حركة الموظفين — `0271`–`0273`

### `employee_movement_permits` (يستبدل `movement_permits`)
```sql
CREATE TABLE public.employee_movement_permits (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  permit_number     TEXT NOT NULL,              -- PRM-2026-00001 بمحفّز
  employee_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  department_id     UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  permit_type       TEXT NOT NULL CHECK (permit_type IN
    ('personal','official','field_visit','training','medical',
     '客户_visit','emergency','delegation')),
  destination_id    UUID REFERENCES public.movement_locations(id),  -- ✅ مرجع لا نص
  destination_free_text TEXT,                   -- استثناء موثَّق فقط
  purpose           TEXT NOT NULL,
  planned_exit_at   TIMESTAMPTZ NOT NULL,
  planned_return_at TIMESTAMPTZ NOT NULL,
  max_duration_minutes INTEGER NOT NULL DEFAULT 60,
  is_paid_time      BOOLEAN NOT NULL DEFAULT true,   -- يُحتسب من ساعات العمل؟
  deduct_from_leave BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','pending_approval','approved','rejected',
     'active','completed','expired','cancelled')),
  -- QR للتحقق عند البوابة (نمط بوابة المورد: هاش لا نص خام)
  qr_token_hash     TEXT,
  qr_expires_at     TIMESTAMPTZ,
  requested_by      UUID REFERENCES public.profiles(id),
  cancelled_at      TIMESTAMPTZ,
  cancel_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, permit_number),
  CHECK (planned_return_at > planned_exit_at),
  CHECK (status <> 'cancelled' OR cancel_reason IS NOT NULL)   -- سبب إلزامي
);
```

### `employee_movement_approvals`
سلسلة موافقات متعددة المستويات — نمط `procurement_approval_steps`:
`step_order` · `approver_id` · `decision` (`pending/approved/rejected/delegated`)
· `decided_at` · `comments` · `escalated_at`.

### `employee_movement_log` (يستبدل `movements_log`)
```sql
CREATE TABLE public.employee_movement_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  movement_number TEXT NOT NULL,
  permit_id       UUID REFERENCES public.employee_movement_permits(id),
  employee_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movement_type   TEXT NOT NULL CHECK (movement_type IN     -- ✅ CHECK (كان مفقوداً)
    ('exit','return','field_visit','training','medical',
     'delegation','emergency','unauthorized_exit')),
  destination_id  UUID REFERENCES public.movement_locations(id),
  -- الخروج
  departure_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  departure_gate_id UUID REFERENCES public.movement_locations(id),
  departure_recorded_by UUID REFERENCES public.profiles(id),
  departure_method TEXT CHECK (departure_method IN
    ('qr_scan','biometric','manual','mobile_app','auto')),
  departure_lat   NUMERIC(10,7),
  departure_lng   NUMERIC(10,7),
  -- العودة
  returned_at     TIMESTAMPTZ,
  return_gate_id  UUID REFERENCES public.movement_locations(id),
  return_recorded_by UUID REFERENCES public.profiles(id),
  return_method   TEXT,
  return_lat      NUMERIC(10,7),
  return_lng      NUMERIC(10,7),
  -- المحسوبات
  actual_duration_minutes INTEGER GENERATED ALWAYS AS (
    CASE WHEN returned_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (returned_at - departure_at))::INT / 60 END) STORED,
  is_overdue      BOOLEAN NOT NULL DEFAULT false,
  overdue_minutes INTEGER,
  status          TEXT NOT NULL DEFAULT 'out'
                  CHECK (status IN ('out','returned','overdue','no_return','cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- ✅ كان مفقوداً
  UNIQUE (tenant_id, movement_number)
);
```

### جداول مكمّلة
| الجدول | الغرض |
|---|---|
| `employee_field_visits` | زيارة ميدانية: العميل · الأجندة · النتيجة · التقرير |
| `field_visit_checkins` | تسجيل وصول بإحداثيات + صورة + تحقق من السور |
| `employee_movement_violations` | مخالفة: `late_return`/`no_permit`/`geofence_breach`/`no_return` |
| `movement_permit_attachments` | مرفقات عبر Storage |

---

## 3) الدور «ب» — الأسطول — `0274`–`0277`

### `fleet_vehicles`
```sql
CREATE TABLE public.fleet_vehicles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_code      TEXT NOT NULL,
  plate_number      TEXT NOT NULL,
  vin               TEXT,
  vehicle_type      TEXT NOT NULL CHECK (vehicle_type IN
    ('sedan','van','pickup','light_truck','medium_truck','heavy_truck',
     'trailer','tanker','refrigerated','bus','forklift','motorcycle','other')),
  make TEXT, model TEXT, model_year INTEGER,
  color TEXT,
  -- السعة (حاسمة لتخطيط الحمولة)
  max_payload_kg    NUMERIC(12,2),
  max_volume_m3     NUMERIC(10,2),
  pallet_capacity   INTEGER,
  -- الوقود والطاقة
  fuel_type         TEXT CHECK (fuel_type IN ('diesel','petrol','lpg','cng','electric','hybrid')),
  tank_capacity_l   NUMERIC(8,2),
  avg_consumption_l_100km NUMERIC(6,2),
  battery_capacity_kwh NUMERIC(8,2),
  -- التبريد
  is_refrigerated   BOOLEAN DEFAULT false,
  min_temp_c        NUMERIC(5,2),
  max_temp_c        NUMERIC(5,2),
  -- القيود الفيزيائية (لتفادي الجسور المنخفضة — قيد ملاحة تجارية)
  height_m NUMERIC(5,2), width_m NUMERIC(5,2), length_m NUMERIC(5,2),
  gross_weight_kg NUMERIC(12,2),
  hazmat_allowed BOOLEAN DEFAULT false,
  -- الملكية
  ownership_type    TEXT NOT NULL DEFAULT 'owned'
                    CHECK (ownership_type IN ('owned','leased','rented','contractor')),
  purchase_date DATE, purchase_cost NUMERIC(16,2),
  lease_end_date DATE,
  fixed_asset_id UUID,          -- ربط بالأصول الثابتة في المالية
  home_location_id UUID REFERENCES public.movement_locations(id),
  assigned_driver_id UUID,
  current_odometer_km NUMERIC(12,2) DEFAULT 0,
  current_engine_hours NUMERIC(10,2) DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'available' CHECK (status IN
    ('available','on_trip','in_maintenance','out_of_service','reserved','retired','sold')),
  retired_at TIMESTAMPTZ, retire_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, vehicle_code),
  UNIQUE (tenant_id, plate_number)
);
```

### `fleet_vehicle_documents`
`doc_type`: `registration` · `insurance` · `inspection` · `permit` · `hazmat_license`
مع `expiry_date` + تنبيهات 90/30/7 (نمط `supplier_documents`).

### `fleet_drivers`
```sql
CREATE TABLE public.fleet_drivers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  driver_code        TEXT NOT NULL,
  employee_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- ربط HR
  full_name          TEXT NOT NULL,
  phone              TEXT,
  license_number     TEXT NOT NULL,
  license_class      TEXT CHECK (license_class IN ('A','B','C','D','E','heavy','hazmat')),
  license_expiry     DATE NOT NULL,
  -- الأهلية
  hazmat_certified   BOOLEAN DEFAULT false,
  medical_cert_expiry DATE,
  -- ساعات القيادة (HOS) — امتثال السلامة
  max_daily_drive_hours    NUMERIC(4,2) DEFAULT 11,
  max_weekly_drive_hours   NUMERIC(5,2) DEFAULT 60,
  min_rest_hours_between   NUMERIC(4,2) DEFAULT 10,
  -- الأداء
  safety_score       NUMERIC(5,2) DEFAULT 100 CHECK (safety_score BETWEEN 0 AND 100),
  total_trips        INTEGER DEFAULT 0,
  total_distance_km  NUMERIC(14,2) DEFAULT 0,
  -- وصول تطبيق السائق (نمط بوابة المورد)
  portal_token_hash  TEXT,
  portal_token_expires_at TIMESTAMPTZ,
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN
    ('active','on_trip','on_rest','on_leave','suspended','inactive')),
  suspended_reason   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, driver_code),
  UNIQUE (tenant_id, license_number)
);
```

### جداول الأسطول المكمّلة
| الجدول | المحتوى |
|---|---|
| `fleet_driver_hos_logs` | سجل ساعات: `driving`/`on_duty`/`off_duty`/`sleeper` |
| `fleet_driver_assignments` | إسناد سائق↔مركبة بفترة |
| `fleet_maintenance_plans` | خطة وقائية: كل X كم أو Y يوم أو Z ساعة محرك |
| `fleet_maintenance_orders` | أمر صيانة: `preventive`/`corrective`/`inspection`/`recall` |
| `fleet_maintenance_parts` | القطع + التكلفة + ربط بالمخزون |
| `fleet_vehicle_inspections` | DVIR: فحص قبل/بعد الرحلة بقائمة مرجعية |
| `fleet_fuel_transactions` | تزوّد: كمية · سعر · عداد · محطة · بطاقة · **كشف الاحتيال** |
| `fleet_vehicle_incidents` | حادث/مخالفة/عطل + مرفقات |

---

## 4) الشحنات والنقل — `0278`–`0282`

### `logistics_transport_orders`
```sql
CREATE TABLE public.logistics_transport_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  order_number    TEXT NOT NULL,
  order_type      TEXT NOT NULL CHECK (order_type IN
    ('outbound','inbound','internal_transfer','return','service_call')),
  -- مصدر الطلب (تكامل البوابات)
  source_module   TEXT CHECK (source_module IN
    ('inventory','procurement','mrp','crm','manual')),
  source_ref_id   UUID,
  source_ref_number TEXT,
  -- من / إلى
  origin_location_id      UUID NOT NULL REFERENCES public.movement_locations(id),
  destination_location_id UUID NOT NULL REFERENCES public.movement_locations(id),
  -- النافذة الزمنية (VRPTW)
  requested_pickup_from   TIMESTAMPTZ,
  requested_pickup_to     TIMESTAMPTZ,
  requested_delivery_from TIMESTAMPTZ,
  requested_delivery_to   TIMESTAMPTZ,
  service_duration_minutes INTEGER DEFAULT 15,
  -- الحمولة
  total_weight_kg NUMERIC(12,2),
  total_volume_m3 NUMERIC(10,3),
  package_count   INTEGER,
  requires_refrigeration BOOLEAN DEFAULT false,
  temperature_range TEXT,
  is_hazmat       BOOLEAN DEFAULT false,
  hazmat_class    TEXT,
  priority        TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','confirmed','planned','assigned','in_transit',
     'delivered','partially_delivered','failed','cancelled')),
  cancelled_at TIMESTAMPTZ, cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, order_number),
  CHECK (origin_location_id <> destination_location_id),
  CHECK (requested_delivery_to IS NULL OR requested_pickup_from IS NULL
         OR requested_delivery_to >= requested_pickup_from)
);
```

### `logistics_shipments` · `logistics_shipment_items`
شحنة = تجميع أوامر في وحدة نقل واحدة. البنود تربط بـ
`inventory_items` مع `quantity` · `weight_kg` · `serial/batch`.

### `logistics_trips`
```sql
-- الرحلة = مركبة + سائق + مسار + مجموعة توقفات
CREATE TABLE public.logistics_trips (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trip_number   TEXT NOT NULL,
  vehicle_id    UUID REFERENCES public.fleet_vehicles(id),
  driver_id     UUID REFERENCES public.fleet_drivers(id),
  route_plan_id UUID,
  planned_start_at TIMESTAMPTZ, planned_end_at TIMESTAMPTZ,
  actual_start_at  TIMESTAMPTZ, actual_end_at  TIMESTAMPTZ,
  planned_distance_km NUMERIC(10,3),
  actual_distance_km  NUMERIC(10,3),
  start_odometer_km NUMERIC(12,2), end_odometer_km NUMERIC(12,2),
  fuel_consumed_l NUMERIC(10,2),
  total_stops     INTEGER DEFAULT 0,
  completed_stops INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN
    ('planned','assigned','accepted','started','in_progress',
     'completed','cancelled','aborted')),
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, trip_number)
);
```

### `logistics_trip_stops`
```sql
  stop_sequence INTEGER NOT NULL,       -- ترتيب التوقف
  stop_type TEXT CHECK (stop_type IN ('pickup','delivery','fuel','rest','border','depot')),
  location_id UUID REFERENCES public.movement_locations(id),
  planned_arrival_at TIMESTAMPTZ, planned_departure_at TIMESTAMPTZ,
  actual_arrival_at  TIMESTAMPTZ, actual_departure_at  TIMESTAMPTZ,
  arrival_lat NUMERIC(10,7), arrival_lng NUMERIC(10,7),
  geofence_verified BOOLEAN DEFAULT false,   -- هل وصل داخل السور فعلاً؟
  dwell_minutes INTEGER,
  status TEXT CHECK (status IN ('pending','en_route','arrived','completed','skipped','failed')),
  skip_reason TEXT,
  UNIQUE (trip_id, stop_sequence)
```

### `logistics_route_plans` · `logistics_route_legs`
نتيجة خوارزمية التحسين: `optimization_method` (`nearest_neighbour`/`two_opt`/`manual`)
· `total_distance_km` · `estimated_duration_minutes` · `computed_at`.

---

## 5) التتبع والتسليم — `0283`–`0286`

### `logistics_tracking_events` — جدول عالي الحجم
```sql
CREATE TABLE public.logistics_tracking_events (
  id          BIGSERIAL PRIMARY KEY,        -- BIGSERIAL لا UUID (حجم هائل)
  tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  trip_id     UUID REFERENCES public.logistics_trips(id) ON DELETE CASCADE,
  vehicle_id  UUID REFERENCES public.fleet_vehicles(id),
  driver_id   UUID REFERENCES public.fleet_drivers(id),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latitude    NUMERIC(10,7) NOT NULL,
  longitude   NUMERIC(10,7) NOT NULL,
  speed_kmh   NUMERIC(6,2),
  heading_deg NUMERIC(5,2),
  accuracy_m  NUMERIC(8,2),
  event_type  TEXT NOT NULL DEFAULT 'ping' CHECK (event_type IN
    ('ping','trip_start','trip_end','stop_arrival','stop_departure',
     'geofence_enter','geofence_exit','harsh_brake','harsh_accel',
     'speeding','idle_start','idle_end','panic','offline','online')),
  geofence_id UUID REFERENCES public.movement_geofences(id),
  source      TEXT DEFAULT 'driver_app'
              CHECK (source IN ('driver_app','telematics','manual','simulated')),
  raw_payload JSONB
);
CREATE INDEX idx_track_trip_time ON public.logistics_tracking_events(trip_id, recorded_at DESC);
CREATE INDEX idx_track_vehicle_time ON public.logistics_tracking_events(tenant_id, vehicle_id, recorded_at DESC);
```
> **سياسة الاحتفاظ:** تُلخَّص بعد 90 يوماً إلى `logistics_trip_summaries`
> وتُحذف الخام. دالة `purge_old_tracking_events()` عبر cron.

### `logistics_delivery_proofs` (ePOD)
```sql
  trip_stop_id      UUID NOT NULL,
  shipment_id       UUID,
  delivery_status   TEXT NOT NULL CHECK (delivery_status IN
    ('delivered','partial','refused','failed','rescheduled')),
  recipient_name    TEXT,
  recipient_id_number TEXT,
  signature_url     TEXT,              -- Storage
  photo_urls        JSONB DEFAULT '[]'::jsonb,   -- حتى 10 صور
  barcode_scans     JSONB DEFAULT '[]'::jsonb,
  pin_verified      BOOLEAN DEFAULT false,
  captured_lat      NUMERIC(10,7),
  captured_lng      NUMERIC(10,7),
  captured_at       TIMESTAMPTZ NOT NULL,
  geofence_verified BOOLEAN DEFAULT false,
  failure_reason    TEXT CHECK (failure_reason IN
    ('recipient_absent','wrong_address','refused','damaged',
     'access_denied','payment_issue','other')),
  cod_amount_collected NUMERIC(16,2),
  notes TEXT,
  -- المزامنة دون اتصال
  captured_offline  BOOLEAN DEFAULT false,
  synced_at         TIMESTAMPTZ,
  client_uuid       TEXT,              -- منع التكرار عند إعادة المزامنة
  UNIQUE (tenant_id, client_uuid)      -- ★ idempotency
```

> **الحقل `client_uuid` حاسم:** تطبيق السائق يعمل دون اتصال ويعيد الإرسال؛
> بدونه تتضاعف السجلات.

### `logistics_delivery_exceptions` · `logistics_customer_notifications`

---

## 6) الناقلون والتكاليف — `0287`–`0290`

| الجدول | المحتوى |
|---|---|
| `logistics_carriers` | ناقل خارجي: ترخيص · تأمين · تقييم · ربط `suppliers` |
| `logistics_carrier_rates` | تعرفة: خط · وضع · وزن · حجم · شريحة سعرية |
| `logistics_freight_invoices` | فاتورة الناقل + تدقيق آلي مقابل التعرفة |
| `logistics_trip_costs` | تكلفة الرحلة: وقود · سائق · صيانة · رسوم · جمارك |
| `logistics_kpi_snapshots` | لقطات KPI يومية للتحليلات السريعة |

---

## 7) الفهارس والمحفّزات الحرجة

```sql
-- ترقيم تلقائي (لا إدخال يدوي)
CREATE TRIGGER trg_permit_number BEFORE INSERT ON public.employee_movement_permits
  FOR EACH ROW EXECUTE FUNCTION public.generate_movement_number('PRM');

-- مزامنة عدّاد التوقفات (درس من 0264: بدونها كل التحليلات أصفار)
CREATE TRIGGER trg_sync_trip_stops
  AFTER INSERT OR UPDATE OR DELETE ON public.logistics_trip_stops
  FOR EACH ROW EXECUTE FUNCTION public.sync_trip_stop_counters();

-- تحديث عداد المركبة من الرحلة
CREATE TRIGGER trg_update_odometer AFTER UPDATE ON public.logistics_trips
  FOR EACH ROW WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION public.update_vehicle_odometer();

-- كشف تجاوز التصريح
CREATE TRIGGER trg_detect_overdue AFTER UPDATE ON public.employee_movement_log
  FOR EACH ROW EXECUTE FUNCTION public.detect_movement_overdue();
```

---

## 8) مصفوفة الجداول (41)

| المجموعة | العدد | المايجريشن |
|---|---|---|
| الأساس المشترك | 5 | `0270` |
| حركة الموظفين | 8 | `0271`–`0273` |
| الأسطول والسائقون | 12 | `0274`–`0277` |
| الأوامر والرحلات | 7 | `0278`–`0282` |
| التتبع والتسليم | 5 | `0283`–`0286` |
| الناقلون والتكاليف | 4 | `0287`–`0290` |
