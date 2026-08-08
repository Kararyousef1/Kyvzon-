# بوابة الحركة واللوجستيات — نظرة شاملة

> كل رقم في هذا المستند مُستخرَج من الكود بأمر فعلي، لا من الذاكرة.
> تاريخ المسح: 2026-08-04 · المايجريشنات `0270`–`0299`

---

## ١. لماذا أُعيدت الهيكلة أصلاً

كان في المشروع نظام حركة قديم من `0012` و`0021`:

| الجدول القديم | ما كان يفعله |
|---|---|
| `movements_log` | سجل خروج/عودة الموظفين — يكتبه حارس البوابة |
| `movement_permits` | تصاريح خروج بسيطة |

**مشاكله البنيوية:**
- الوجهة **نص حر** (`destination VARCHAR`) — لا موقع جغرافي، لا سور، لا تخطيط مسار
- `employee_name` و`department` **مكرَّران** في الجدول — يتعارضان مع `profiles` عند تغيير الاسم
- **لا QR** ولا تحقق من الاستعمال المزدوج
- **لا أسطول إطلاقاً**: لا مركبات، لا سائقين، لا شحنات
- **لا امتثال**: لا ساعات قيادة، لا فحص مركبة، لا كشف احتيال

النظام الجديد ليس تحسيناً للقديم بل **بوابة كاملة** تغطي مجالين لم يكن أحدهما موجوداً أصلاً.

---

## ٢. الدوران — الفصل الجوهري

البوابة تخدم **مجالين مختلفين تماماً** يشتركان في البنية التحتية فقط:

| | الدور «أ» | الدور «ب» |
|---|---|---|
| **المفتاح** | `employee_movement` | `logistics` |
| **الموضوع** | حركة **الموظفين** | **الأسطول والشحن** |
| **السؤال** | من خرج؟ متى يعود؟ هل تأخّر؟ | أي مركبة؟ أي سائق؟ كم كلّفت؟ |
| **الوحدات** | E00–E06 (7) | L00–L13 (14) |

### الدور الثالث: `movement_manager`
يشرف على الدورين معاً. المنطق في `movement_require_role`:
```sql
AND a.portal_role IN (p_role, 'movement_manager')
```
أي أن `movement_manager` يمرّ في أي فحص لأي من الدورين.

### الدور الرابع الضمني: **السائق**
لا مفتاح دور له عمداً. هويته تُشتق من ارتباط صفّه في `logistics_drivers`
بحسابه (`user_id → profiles.id`). السبب: منحه دور `logistics` كان
سيفتح له الأسطول كاملاً — **تصعيد صلاحيات لكل سائق**.

```
movement_require_driver()  →  حارس مستقل، أضيق صلاحية ممكنة
```

---

## ٣. الوحدات والصفحات — 32 صفحة

### الدور «أ»: حركة الموظفين (12 صفحة)

| الوحدة | الصفحة | الوظيفة |
|---|---|---|
| **E00** | `EmployeeMovementLocationsPage` | مواقع ونقاط التفتيش + **منتقي إحداثيات على الخريطة** |
| **E00** | `EmployeeMovementPoliciesPage` | سياسات وقواعد الخروج |
| **E01** | `EmployeeMovementPermitsPage` | تصاريح الخروج + QR |
| **E01** | `EmployeeMovementNewPermitPage` | طلب تصريح جديد |
| **E01** | `EmployeeMovementPermitDetailPage` | تفاصيل التصريح |
| **E01** | `EmployeeMovementApprovalsPage` | صندوق الموافقات المعلقة |
| **E01** | `EmployeeMovementTemplatesPage` | قوالب التصاريح المتكررة |
| **E02** | `EmployeeMovementGateExecutionPage` | شاشة الحارس — مسح ودخول/خروج |
| **E03** | `EmployeeFieldVisitsPage` | الزيارات الميدانية + **check-in بالسور** |
| **E04** | `EmployeeMissionsPage` | المهام الرسمية والانتدابات |
| **E05** | `EmployeeComplianceViolationsPage` | المخالفات المرصودة |
| **E06** | `EmployeeMovementAnalyticsPage` | التحليلات والتقارير |

### الدور «ب»: اللوجستيات (15 صفحة)

| الوحدة | الصفحة | الوظيفة |
|---|---|---|
| **L00** | `LogisticsDashboardPage` | لوحة القيادة والمؤشرات |
| **L00** | `LogisticsFoundationPage` | الإعدادات + **صحة الجدولة** + **حالة الترحيل** |
| **L01** | `LogisticsVehiclesPage` | المركبات + **وثائقها** |
| **L02** | `LogisticsDriversPage` | السائقون + **ربط حساب تطبيق السائق** |
| **L03** | `LogisticsMaintenancePage` | الصيانة والإصلاح |
| **L04** | `LogisticsFuelPage` | الوقود + **6 أعلام احتيال** |
| **L05** | `LogisticsShipmentOrdersPage` | أوامر النقل والشحنات |
| **L06** | `LogisticsRoutePlanningPage` | تخطيط المسار + **خريطة** + **4 مراحل تحسين** |
| **L07** | `LogisticsDispatchPage` | الإرسال ودورة الرحلة |
| **L08** | `LogisticsLiveTrackingPage` | **خريطة حية** + 4 حالات اتصال |
| **L09** | `LogisticsEpodPage` | إثبات التسليم |
| **L10** | `LogisticsCarriersPage` | الناقلون الخارجيون 3PL |
| **L11** | `LogisticsCostAnalyticsPage` | التكاليف والربحية |
| **L12** | `LogisticsTrackReplayPage` | **إعادة تشغيل المسار** — تحقيق الحوادث |
| **L13** | `LogisticsSafetyCompliancePage` | **HOS + DVIR** — امتثال السلامة |

### تطبيق السائق PWA (3 شاشات)

| الوحدة | الصفحة | الوظيفة |
|---|---|---|
| **D01** | `DriverTripsPage` | رحلاتي + **شريط ساعات القيادة** + تتبع GPS |
| **D02** | `DriverDeliveryPage` | إثبات التسليم + **توقيع رقمي** |
| **D03** | `DriverInspectionPage` | فحص المركبة DVIR + **عمل دون اتصال** |

---

## ٤. قاعدة البيانات — 36 جدولاً · 15 عرضاً · 76 دالة

### الجداول حسب المجال

**الأساس المشترك (7):**
`movement_locations` · `movement_geofences` · `movement_policies` ·
`movement_role_assignments` · `movement_audit_events` ·
`movement_notification_log` · `movement_permit_attachments`

**حركة الموظفين (7):**
`employee_movement_permits` · `employee_movements_log` ·
`employee_movement_approvals` · `employee_movement_templates` ·
`employee_movement_violations` · `employee_field_visits` ·
`field_visit_checkins` · `employee_missions`

**الأسطول (6):**
`logistics_vehicles` · `logistics_drivers` · `logistics_maintenance` ·
`fleet_vehicle_documents` · `fleet_vehicle_inspections` (DVIR) ·
`fleet_driver_hos_logs`

**النقل والتسليم (8):**
`logistics_shipment_orders` · `logistics_dispatches` ·
`logistics_trip_stops` · `logistics_routes` · `logistics_telemetry` ·
`logistics_epod` · `logistics_fuel_logs` · `logistics_shipments` *(مهجور)*

**التجارة والتحليل (4):**
`logistics_carriers` · `logistics_carrier_rates` ·
`logistics_trip_costs` · `logistics_kpi_snapshots`

**التشغيل (4):**
`logistics_settings` · `scheduled_job_runs` ·
`driver_offline_operations` · *(سجلات المزامنة)*

### العروض (15)
`logistics_dashboard_kpis` · `logistics_fleet_alerts` ·
`logistics_dispatch_board` · `logistics_live_vehicle_positions` ·
`logistics_trackable_dispatches` · `logistics_dispatch_stops_view` ·
`logistics_profitability` · `logistics_carrier_performance` ·
`logistics_fuel_efficiency` · `logistics_safety_compliance` ·
`logistics_vehicle_safety_status` · `movement_cron_health` ·
`movement_notification_dispatch_status` ·
`movement_legacy_migration_status` · `driver_offline_sync_issues`

---

## ٥. المميزات — ما يميّز هذه البوابة فعلياً

### 🗺️ الخرائط التفاعلية
- `leaflet` + `react-leaflet` · بلاطات OpenStreetMap مجانية بلا مفتاح API
- **علامات SVG مضمَّنة** — أيقونة Leaflet الافتراضية مكسورة مع الحزم
- منتقي إحداثيات بالنقر + رسم السور الجغرافي
- الحزمة **معزولة في chunk خاص** (157 KB) — لا تُحمَّل إلا في صفحات الخريطة

### 🧭 تحسين المسار — أربع مراحل مقيسة
```
① الترتيب المُدخَل     55.95 كم  (خط الأساس)
② Nearest Neighbour   36.36 كم  (‑35%)
③ 2-opt               29.31 كم  (‑19% إضافية)
④ Or-opt              (تناوب حتى الاستقرار)
```
**Or-opt تفوّق على 2-opt في 280 من 300 حالة عشوائية (93.3%)** — قياس
فعلي لا تقدير. الواجهة تُفصح: «حل تقريبي لا أمثل · مسافة جوّية».

### 🛡️ امتثال السلامة
| النظام | الحد | الأثر |
|---|---|---|
| **HOS** قيادة | 11 ساعة | **يمنع الإسناد** |
| **HOS** عمل | 14 ساعة | يمنع الإسناد |
| **HOS** دورة | 70 ساعة/8 أيام | يمنع الإسناد |
| **DVIR** عيب حرج | — | **يوقف المركبة تلقائياً** |
| وثيقة منتهية | — | يمنع الإسناد |
| رخصة منتهية | — | يمنع الإسناد |

**HOS يُسجَّل تلقائياً** مع دورة الرحلة: الانطلاق يفتح فترة قيادة،
الوصول يُغلقها ويفتح «على رأس العمل»، الإكمال يُغلق الكل.

### ⛽ كشف احتيال الوقود — 6 أعلام
`RAPID_REFUEL` · `ABNORMAL_CONSUMPTION` · `NO_DISTANCE_SINCE_LAST_REFUEL` ·
`EXCESSIVE_QUANTITY` · `FUEL_FOR_ELECTRIC_VEHICLE` · **`TANK_CAPACITY_EXCEEDED`**

### 📱 تطبيق السائق — يعمل دون اتصال
- **نقاط GPS** تُخزَّن محلياً وتُرفع دفعةً
- **الفحص والحالة والتسليم** كلها idempotent بـ`client_uuid`
- **الرفع مرتَّب زمنياً** بـ`performed_at` — لا بترتيب المصفوفة
  (الإكمال يتطلب ePOD؛ الترتيب العشوائي كان سيكسر التسلسل)
- الفشل الدائم يُزال من الطابور — وإلا لم يفرغ أبداً
- `driver_offline_sync_issues` يُظهر للمُرسِل ما فشل رفعه

### 🔁 إعادة تشغيل المسار (L12)
مسافة تراكمية · فجوات الإشارة · رصد التوقفات — **محسوبة في الخادم**
لا المتصفح. تُستعمل لتحقيق الحوادث ونزاعات وقت التسليم.

### ⏰ الجدولة الفعلية
`pg_cron` **داخل المايجريشن** لا في لوحة تحكم Supabase — يُراجَع في PR
ويُعاد بناؤه في أي بيئة. ثلاث مهام:
- إشعارات يومية 06:00 UTC
- لقطة مؤشرات 23:30 UTC
- تنظيف التتبع أسبوعياً

`movement_cron_health` يكشف التوقّف الصامت:
`never_ran` · `failing` · `stale` · `stuck` · `healthy`

---

## ٦. التكاملات

### ✅ قائمة فعلياً

| التكامل | الآلية |
|---|---|
| **النظام القديم** | `0292` رحّل البيانات · `0293` **محفّزات مزامنة حيّة** |
| **`profiles`** | هوية الموظف والسائق — لا تكرار للأسماء |
| **`notifications`** | 5 أنواع تنبيهات عبر Edge Function |
| **`tenants`** | عزل كامل على 36 جدولاً |
| **صلاحيات المنصة** | 22 مفتاحاً في المواضع الأربعة |

### ⚠️ الترحيل — تفصيل مهم
الجدولان القديمان **لم يُحذفا**. الكود القديم ما زال يكتب فيهما،
والمحفّزات تنقل كل صف **لحظياً** إلى الجديد. الانقسام انتهى دون
كسر الإنتاج. الإيقاف على مراحل:
```
① ترحيل + مزامنة   ✅ منجَز
② تحويل القراءة
③ تجميد الكتابة
④ إعادة التسمية ثم الإسقاط
```

### ❌ تكاملات غائبة
| المطلوب | الحالة |
|---|---|
| **تسليم → خصم المخزون** | البوابتان منفصلتان |
| **تكلفة الرحلة → المالية** | لا جسر لدفتر الأستاذ |
| **فاتورة الناقل → المشتريات** | `logistics_freight_invoices` غير موجود |

---

## ٧. الأمان — كل رقم مُتحقَّق

| البند | النتيجة |
|---|---|
| دوال البوابة | **76** |
| `anon` ينفّذ أياً منها | **صفر** ✅ |
| جداول بلا RLS | **صفر** ✅ |
| جداول بـ RLS وصفر سياسات (= حجب كامل) | **صفر** ✅ |
| دوال `STABLE` تكتب | **صفر** ✅ |
| `as any` · `confirm` · `prompt` | **صفر** ✅ |
| حذف نهائي للسجلات | **صفر** ✅ |

### ثغرتان اكتُشفتا وأُصلحتا
**① قيد أدوار `profiles`** — الأدوار الثلاثة أُضيفت في TypeScript ولم
تُضَف لقيد قاعدة البيانات. **البوابة كاملةً كانت غير قابلة للإسناد
لأي موظف.** (`0288`)

**② تسريب مواقع عبر المستأجرين** — `movement_point_in_geofence`
تقرأ الأسوار بلا فلترة مستأجر. استدعاء متكرر بإحداثيات مختلفة يرسم
حدود سور مستأجر آخر ويكشف **موقع مستودعه السري**. (`0299`)

---

## ٨. الحجم والتحقق

```
SQL (0270-0299)      9,935 سطر    30 مايجريشن
صفحات TSX            8,461 سطر    32 صفحة
خدمات SDK            2,740 سطر    18 خدمة
اختبارات عقد         3,745 سطر    594 اختباراً
اختبارات سلوكية      3,282 سطر    268 اختباراً
─────────────────────────────────────────────
الإجمالي            28,163 سطر
```

| الفحص | النتيجة |
|---|---|
| `npm run test:run` | ✅ **1376 اختباراً / 97 ملفاً** |
| `type-check` · `build` · `db:contract-check` | ✅ PASS |
| `sdk:boundary-check` | ✅ صفر انتهاك في ملفات الحركة |
| Postgres **من الصفر** | ✅ **228 مايجريشن · 0 فشل** |
| اختبارات سلوكية (8 ملفات) | ✅ **268/268** |

---

## ٩. ⚠️ مستوى التحقق — الحقيقة كاملةً

| المستوى | الحالة |
|---|---|
| فحص ثابت (type/lint/build) | ✅ |
| **Postgres محلي** | ✅ 228 مايجريشن · 268 اختباراً سلوكياً |
| **`supabase db push`** | ❌ **لم يُنفَّذ ولا مرة** |
| **متصفح حقيقي** | ❌ **لم يُفتح قط** |

> **مكتمل محلياً ≠ جاهز للإنتاج.**

الخرائط وتطبيق السائق والوضع دون اتصال **لم تُرَ تعمل**. سلوك
`navigator.onLine` وأحداث الشبكة يتفاوت بين الأجهزة ويحتاج اختباراً
يدوياً على هاتف فعلي.
