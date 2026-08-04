# 🗺️ الخرائط والتتبع والتكاملات

---

## 1) حزمة الخرائط — قرار معماري

### القيد المُحقَّق
```
PostGIS         → ❌ غير مثبَّت في المشروع
مكتبة خرائط     → ❌ لا شيء في package.json
مفتاح Google    → ❌ غير متاح
```

### القرار: حزمة مفتوحة المصدر بلا مفاتيح

| الغرض | الأداة | التكلفة | ملاحظة |
|---|---|---|---|
| عرض الخريطة | `leaflet` + `react-leaflet` | مجاني | مُثبَت في Wikipedia وThe Washington Post |
| البلاطات | OpenStreetMap | مجاني | ⚠️ خادم OSM العام **ممنوع تجارياً** — انظر أدناه |
| البحث عن عنوان | Nominatim | مجاني | حد صارم: 1 طلب/ثانية |
| المسارات | OSRM | مجاني | الخادم العام للتطوير فقط |
| الحسابات الهندسية | SQL خالص | — | Haversine · نقطة داخل مضلّع |

```bash
npm install leaflet react-leaflet
npm install --save-dev @types/leaflet
```

### ⚠️ تحذير إنتاجي إلزامي
> خوادم OSM/Nominatim/OSRM **العامة** محدودة المعدل وغير مسموحة للاستخدام
> التجاري. قبل الإنتاج **يجب** أحد الخيارين:
> 1. استضافة ذاتية (`osrm-backend` + `tileserver-gl` عبر Docker).
> 2. مزوّد تجاري (MapTiler · LocationIQ · Mapbox).
>
> **صرّح بهذا للمستخدم — لا تعده جاهزاً للإنتاج بالخوادم العامة.**

### ⚠️ تحذير معاينة Kyvzon
معاينة الملفات داخل التطبيق تعمل في `iframe` **بلا شبكة**. بلاطات
الخريطة **لن تُحمَّل** في المعاينة. صمّم بديلاً رشيقاً (placeholder رمادي
مع الإحداثيات نصاً) ولا تعتبره عطلاً.

---

## 2) الحسابات الجغرافية بلا PostGIS

### أ) Haversine — المسافة بين نقطتين

```sql
CREATE OR REPLACE FUNCTION public.movement_haversine_km(
  lat1 NUMERIC, lng1 NUMERIC, lat2 NUMERIC, lng2 NUMERIC
)
RETURNS NUMERIC LANGUAGE SQL IMMUTABLE AS $$
  SELECT ROUND((6371 * 2 * ASIN(SQRT(
      POWER(SIN(RADIANS(lat2 - lat1) / 2), 2) +
      COS(RADIANS(lat1)) * COS(RADIANS(lat2)) *
      POWER(SIN(RADIANS(lng2 - lng1) / 2), 2)
  )))::NUMERIC, 3);
$$;
```
> `IMMUTABLE` صحيح هنا (رياضيات بحتة) ويسمح بالفهرسة.
> دقة كافية (±0.5%) لأغراض اللوجستيات؛ ليست مسافة طريق فعلية.

### ب) التحقق من السور الدائري

```sql
CREATE OR REPLACE FUNCTION public.movement_point_in_geofence(
  p_geofence_id UUID, p_lat NUMERIC, p_lng NUMERIC
)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE g RECORD; v_dist NUMERIC;
BEGIN
  SELECT * INTO g FROM public.movement_geofences WHERE id = p_geofence_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF g.fence_type = 'circle' THEN
    v_dist := public.movement_haversine_km(g.center_lat, g.center_lng, p_lat, p_lng);
    RETURN (v_dist * 1000) <= g.radius_m;
  END IF;
  -- polygon: ray casting
  RETURN public.movement_point_in_polygon(g.polygon_points, p_lat, p_lng);
END $$;
```

### ج) نقطة داخل مضلّع — Ray Casting

```sql
CREATE OR REPLACE FUNCTION public.movement_point_in_polygon(
  p_points JSONB, p_lat NUMERIC, p_lng NUMERIC
)
RETURNS BOOLEAN LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  n INT := jsonb_array_length(p_points);
  i INT := 0; j INT;
  inside BOOLEAN := false;
  xi NUMERIC; yi NUMERIC; xj NUMERIC; yj NUMERIC;
BEGIN
  IF n < 3 THEN RETURN false; END IF;
  j := n - 1;
  WHILE i < n LOOP
    xi := (p_points->i->>'lng')::NUMERIC;  yi := (p_points->i->>'lat')::NUMERIC;
    xj := (p_points->j->>'lng')::NUMERIC;  yj := (p_points->j->>'lat')::NUMERIC;
    IF ((yi > p_lat) <> (yj > p_lat))
       AND (p_lng < (xj - xi) * (p_lat - yi) / NULLIF(yj - yi, 0) + xi) THEN
      inside := NOT inside;
    END IF;
    j := i; i := i + 1;
  END LOOP;
  RETURN inside;
END $$;
```

### د) صندوق إحاطة للفلترة السريعة
قبل Haversine على آلاف الصفوف، فلتِر بمستطيل (يستخدم الفهرس):
```sql
WHERE latitude  BETWEEN p_lat - (p_km/111.0) AND p_lat + (p_km/111.0)
  AND longitude BETWEEN p_lng - (p_km/(111.0*COS(RADIANS(p_lat))))
                    AND p_lng + (p_km/(111.0*COS(RADIANS(p_lat))))
```

---

## 3) تحسين المسار — بلا OR-Tools

OR-Tools مكتبة Python/C++ ولا تعمل داخل Postgres أو المتصفح. الحل:
خوارزمية داخلية بمرحلتين.

### المرحلة 1 — Nearest Neighbour (حل ابتدائي)
```
ابدأ من المستودع
كرر: اختر أقرب توقف غير مُزار يحترم السعة والنافذة الزمنية
حتى تنتهي التوقفات → عُد للمستودع
```
تعقيد `O(n²)` — مقبول حتى ~200 توقف.

### المرحلة 2 — 2-opt (تحسين)
```
كرر حتى لا تحسّن:
  لكل زوج حافتين (i,i+1) و(j,j+1):
    إن كان عكس المقطع بينهما يقلّل المسافة → اعكسه
```
يحسّن Nearest Neighbour بـ **10–15%** عملياً.

### القيود المطبَّقة (VRPTW + CVRP)
| القيد | المصدر |
|---|---|
| سعة الوزن | `fleet_vehicles.max_payload_kg` |
| سعة الحجم | `max_volume_m3` |
| النوافذ الزمنية | `requested_delivery_from/to` |
| مدة الخدمة | `service_duration_minutes` |
| ساعات القيادة | `fleet_drivers.max_daily_drive_hours` |
| التبريد | `requires_refrigeration` ↔ `is_refrigerated` |
| المواد الخطرة | `is_hazmat` ↔ `hazmat_allowed` |
| ارتفاع المركبة | `height_m` — تفادي الجسور المنخفضة |

### التنفيذ
```
حتى 50 توقفاً   → RPC في Postgres (plpgsql)
50–300         → Edge Function (Deno)
أكثر من 300    → يُقسَّم لمناطق أولاً (clustering) ثم يُحلّ كل تجمّع
```

> **إفصاح صريح:** هذا حل تقريبي (heuristic) لا أمثل (optimal). للأساطيل
> الكبيرة يوصى بمزوّد متخصص. **لا تدّعِ أنه OR-Tools.**

---

## 4) تطبيق السائق — PWA بـ capability-token

### لماذا PWA لا تطبيق أصلي؟
لا بنية React Native في المشروع. PWA يعمل على الجهازين ويدعم العمل دون
اتصال عبر Service Worker (`src/registerSW.ts` **موجود بالفعل**).

### نمط المصادقة — نسخ بوابة المورد المُثبتة
```
/driver/:token  →  Edge Function: logistics-driver-portal
                   SHA-256(token) = portal_token_hash
                   + انتهاء صلاحية + APP_ORIGIN allowlist
```
السائق **لا يحتاج حساب Supabase** — نفس آلية `supplier_portal_invites`.

### العمل دون اتصال
```
IndexedDB يخزّن: الرحلة · التوقفات · ePOD غير المُرسَل
عند عودة الاتصال: إرسال دفعي بـ client_uuid لمنع التكرار
نقاط GPS تُجمَّع وتُرسل دفعات كل 30 ثانية
```

### الشاشات (7)
`رحلاتي` · `تفاصيل الرحلة` · `الملاحة للتوقف` · `تسليم + ePOD` ·
`إبلاغ استثناء` · `فحص المركبة DVIR` · `تسجيل تزوّد وقود`

---

## 5) التكاملات مع بوابات Kyvzon

### أ) المخزون ↔ اللوجستيات
```
شحنة صادرة تُسلَّم
  → post_shipment_to_inventory(shipment_id)
  → inventory_stock_movements (movement_type='issue')
  → خصم inventory_stock_balances
```
> ⚠️ استخدم القيم الحقيقية: `movement_number` و`base_quantity` إلزاميان.
> راجع `kyvzon-ai-context/02-DATABASE-AND-SECURITY.md` §6.

### ب) المشتريات ← اللوجستيات
```
purchase_orders (status='sent')
  → إنشاء transport_order (order_type='inbound')
  → source_module='procurement' + source_ref_id
  → عند الوصول: goods_receipts + جسر 0260
```

### ج) اللوجستيات → المالية
```
رحلة مكتملة → logistics_trip_costs
  → توزيع على مركز التكلفة
فاتورة ناقل → تدقيق مقابل التعرفة → accounts_payable
```

### د) الموارد البشرية ↔ الدورين
```
fleet_drivers.employee_id → profiles
ساعات القيادة → سجل الحضور
تصريح خروج مقبول ≠ غياب (بقاعدة is_paid_time)
```

### هـ) الحراسة ↔ حركة الموظفين
```
مسح QR عند البوابة
  → execute_movement_permit(permit_id, gate_id, 'qr_scan')
  → employee_movement_log
```

### مصفوفة التكامل
| من | إلى | المحفّز |
|---|---|---|
| المخزون | شحنة صادرة | أمر شحن جاهز |
| المشتريات | شحنة واردة | PO مُرسَل |
| التصنيع | نقل داخلي | أمر عمل يحتاج مواد |
| CRM | تسليم عميل | صفقة مغلقة |
| اللوجستيات | المالية | رحلة مكتملة |
| اللوجستيات | المخزون | تسليم مؤكَّد |
| حركة الموظفين | الحضور | خروج/عودة |
| حركة الموظفين | الحراسة | تصريح معتمد |

---

## 6) الإشعارات المجدولة

> ★ اتبع نمط `0268`: نسخ `*_for_tenant` + مُشغِّل `service_role`.
> الدوال المعتمدة على `current_user_tenant_id()` **لا تعمل تحت cron**.

| المهمة | التوقيت | المحتوى |
|---|---|---|
| `dispatch_permit_overdue_alerts` | كل 15 دقيقة | تصريح تجاوز وقته |
| `dispatch_vehicle_document_expiry` | يومي | تأمين/فحص ينتهي (90/30/7) |
| `dispatch_driver_license_expiry` | يومي | رخصة تنتهي |
| `dispatch_maintenance_due` | يومي | صيانة مستحقة بالكم/الأيام |
| `dispatch_delivery_eta_updates` | كل 10 دقائق | تحديث ETA للعملاء |
| `dispatch_hos_violation_alerts` | كل ساعة | تجاوز ساعات القيادة |
| `purge_old_tracking_events` | أسبوعي | تلخيص وحذف > 90 يوماً |

```sql
-- التوقيع الصحيح
CREATE OR REPLACE FUNCTION public.run_movement_daily_notifications_cron(...)
...
REVOKE ALL ON FUNCTION ... FROM PUBLIC;
REVOKE ALL ON FUNCTION ... FROM anon, authenticated;   -- ★ إلزامي
GRANT EXECUTE ON FUNCTION ... TO service_role;
```

---

## 7) Edge Functions (7)

| الدالة | المصادقة | الغرض |
|---|---|---|
| `logistics-driver-portal` | capability-token | بوابة السائق |
| `logistics-track-public` | capability-token | تتبع عام للعميل |
| `logistics-route-optimize` | JWT | تحسين ثقيل |
| `logistics-geocode-proxy` | JWT | وسيط Nominatim + cache |
| `logistics-telematics-webhook` | HMAC | استقبال Samsara/Geotab |
| `movement-daily-notifications` | CRON_SECRET | الإشعارات |
| `movement-permit-qr` | JWT | توليد QR |

> **وسيط الترميز الجغرافي ضروري:** Nominatim يحدّ بطلب/ثانية ويمنع
> الاستدعاء المباشر من المتصفح. الوسيط يخزّن النتائج مؤقتاً.

---

## 8) اعتبارات الأداء

| الخطر | الحل |
|---|---|
| `tracking_events` ينمو بالملايين | فهرس `(trip_id, recorded_at DESC)` + تلخيص 90 يوماً |
| خريطة بـ500 مركبة | تجميع علامات (clustering) + تحديث كل 15 ثانية |
| حساب المسافات لكل الصفوف | فلترة بصندوق إحاطة أولاً |
| Realtime لكل نقطة GPS | Realtime للأحداث فقط؛ النقاط بـ polling |
| تحسين 300 توقف | Edge Function + مهلة 30 ثانية |
