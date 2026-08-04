# ✅ قائمة التنفيذ القابلة للتتبع

> ضع `[x]` عند الإنجاز **بعد التحقق الفعلي** لا بعد الكتابة.

---

## قبل البدء

- [ ] `npm ci`
- [ ] بناء مختبر Postgres — `kyvzon-ai-context/04-VERIFICATION-PLAYBOOK.md`
- [ ] تطبيق `tools/dev/pgtest-supabase-shim.sql` (**يجب** أن يحوي `ALTER DEFAULT PRIVILEGES`)
- [ ] `npm install leaflet react-leaflet && npm i -D @types/leaflet`
- [ ] قراءة `00-MASTER-PLAN.md` + `01-ROLES-AND-SEPARATION.md`

---

## المرحلة 1 — الأساس (`0270`)

### قاعدة البيانات
- [ ] `movement_role_assignments` + RLS
- [ ] `movement_locations` + فهرس الإحداثيات
- [ ] `movement_geofences` + CHECK circle/polygon
- [ ] `movement_policies` · `movement_audit_events`
- [ ] `movement_has_role()` · `movement_require_role()`
- [ ] `movement_haversine_km()` — `IMMUTABLE`
- [ ] `movement_point_in_geofence()` · `movement_point_in_polygon()`
- [ ] `generate_movement_number()` + محفّزات
- [ ] **`REVOKE ... FROM anon, authenticated` على كل دالة**
- [ ] حارس نهاية المايجريشن (كائنات + صلاحيات)

### التحقق
- [ ] المايجريشن يُطبَّق من الصفر بلا خطأ
- [ ] `SET ROLE anon` → `permission denied` على كل RPC
- [ ] Haversine: بغداد↔البصرة ≈ 450 كم (تحقق يدوي)
- [ ] نقطة داخل/خارج سور نصف قطره 150م
- [ ] Ray casting على مضلّع رباعي

### الوحدة
- [ ] وحدة `movement` في `TenantModuleCatalog` (**موجودة** — تُحدَّث)
- [ ] `RequireMovementRole.tsx`
- [ ] `MovementRoleSelector` + `MovementRoleDenied`
- [ ] `MovementUnitNav` (بطاقات أفقية)
- [ ] التسجيل في **المواضع الأربعة**

---

## المرحلة 2 — الأسطول (`0274`–`0277`)

- [ ] `fleet_vehicles` (القيود الفيزيائية + السعة)
- [ ] `fleet_vehicle_documents` + تنبيهات 90/30/7
- [ ] `fleet_drivers` + حدود HOS
- [ ] `fleet_driver_hos_logs` · `fleet_driver_assignments`
- [ ] `fleet_maintenance_plans` · `_orders` · `_parts`
- [ ] `fleet_vehicle_inspections` (DVIR)
- [ ] `fleet_fuel_transactions` + كشف الاحتيال
- [ ] `fleet_vehicle_incidents`

### التحقق الوظيفي (بالتشغيل الفعلي)
- [ ] إسناد سائق برخصة منتهية → **مرفوض**
- [ ] إسناد مركبة بتأمين منتهٍ → **مرفوض**
- [ ] تجاوز 11 ساعة قيادة → `HOS_LIMIT_EXCEEDED`
- [ ] عيب DVIR حرج → المركبة `out_of_service` تلقائياً
- [ ] تزوّد > سعة الخزان → علم احتيال
- [ ] عداد أقل من السابق → مرفوض

---

## المرحلة 3 — حركة الموظفين (`0271`–`0273`)

- [ ] `employee_movement_permits` (**CHECK على كل حالة**)
- [ ] `employee_movement_approvals`
- [ ] `employee_movement_log` (+ `updated_at` + CHECK على `movement_type`)
- [ ] `employee_field_visits` · `field_visit_checkins`
- [ ] `employee_movement_violations`
- [ ] `request_movement_permit()` · `approve_movement_permit()`
- [ ] `execute_movement_permit()` · `record_movement_return()`
- [ ] محفّز كشف التأخر

### التحقق
- [ ] تصريح بلا سبب → مرفوض
- [ ] عودة قبل خروج → مرفوض
- [ ] QR مستخدم مرتين → `PERMIT_ALREADY_USED`
- [ ] QR منتهٍ → `PERMIT_EXPIRED`
- [ ] تجاوز المدة → مخالفة `late_return` آلية
- [ ] إلغاء بلا سبب → مرفوض
- [ ] تصريحان مفتوحان لنفس الموظف → مرفوض

### الترحيل
- [ ] سكربت `movements_log` → `employee_movement_log`
- [ ] سكربت `movement_permits` → `employee_movement_permits`
- [ ] الوجهات النصية → `movement_locations`
- [ ] **مطابقة العدد قبل/بعد**
- [ ] إعادة تسمية القديم `_deprecated` (**لا حذف الآن**)

---

## المرحلة 4 — الأوامر والإرسال (`0278`–`0282`)

- [ ] `logistics_transport_orders` (نوافذ زمنية + حمولة)
- [ ] `logistics_shipments` · `_items`
- [ ] `logistics_trips` · `logistics_trip_stops`
- [ ] `logistics_route_plans` · `_legs`
- [ ] `trg_sync_trip_stops` ← **درس 0264**
- [ ] `trg_update_odometer`
- [ ] `assign_trip()` بكل قواعد الأهلية

### التحقق
- [ ] حمولة > سعة المركبة → مرفوض
- [ ] بضاعة مبرَّدة في مركبة عادية → مرفوض
- [ ] مواد خطرة بلا رخصة → مرفوض
- [ ] إضافة/حذف توقف → العدّاد يتحدث **فعلياً**
- [ ] رحلة مكتملة → عداد المركبة يتحدث

---

## المرحلة 5 — المسارات والتتبع (`0283`–`0284`)

- [ ] `logistics_tracking_events` (`BIGSERIAL` + فهارس)
- [ ] `optimize_route()` — NN + 2-opt
- [ ] `record_tracking_ping()` + كشف السور
- [ ] `purge_old_tracking_events()`
- [ ] الخريطة الحية + تجميع العلامات
- [ ] إعادة تشغيل المسار

### التحقق
- [ ] 20 توقفاً → المسار يحترم السعة والنوافذ
- [ ] 2-opt يحسّن NN (قِس قبل/بعد)
- [ ] 200 توقف → ينتهي < 30 ثانية
- [ ] دخول/خروج السور → حدث مسجَّل
- [ ] 10,000 نقطة → الاستعلام < 500 مللي

---

## المرحلة 6 — التسليم (`0285`–`0286`)

- [ ] `logistics_delivery_proofs` + **`UNIQUE(tenant_id, client_uuid)`**
- [ ] `logistics_delivery_exceptions`
- [ ] `submit_delivery_proof()`
- [ ] Edge Function `logistics-driver-portal`
- [ ] PWA السائق (7 شاشات)
- [ ] IndexedDB + مزامنة دفعية

### التحقق
- [ ] إرسال نفس `client_uuid` مرتين → **سجل واحد**
- [ ] ePOD خارج السور → مُعلَّم للمراجعة
- [ ] فشل التسليم بلا سبب → مرفوض
- [ ] token منتهٍ → مرفوض
- [ ] تسليم مؤكَّد → المخزون يُخصم

---

## المرحلة 7 — الناقلون والتحليلات (`0287`–`0290`)

- [ ] `logistics_carriers` · `_rates`
- [ ] `logistics_freight_invoices` + تدقيق آلي
- [ ] `logistics_trip_costs` · `logistics_kpi_snapshots`
- [ ] Views: OTIF · تكلفة/كم · الاستغلال
- [ ] التصدير عبر `dataExport.ts` حصراً

---

## المرحلة 8 — الإشعارات (`0291`)

- [ ] 7 دوال `*_for_tenant` (**لا اعتماد على `current_user_tenant_id()`**)
- [ ] `run_movement_daily_notifications_cron()`
- [ ] `movement_notification_log` + قيد فريد يومي
- [ ] Edge Function `movement-daily-notifications` + `CRON_SECRET`
- [ ] View حالة الجدولة

### التحقق
- [ ] `SET ROLE service_role` → **يعمل**
- [ ] `SET ROLE anon` → `permission denied`
- [ ] تشغيل ثانٍ نفس اليوم → أصفار
- [ ] مستأجر معطَّل الوحدة → صفر إشعارات

---

## المرحلة 9 — الإنهاء

- [ ] `npm run type-check` → 0
- [ ] `npm run lint` → 0 errors
- [ ] `npm run test:run` → كل الاختبارات
- [ ] `npm run build`
- [ ] `npm run db:contract-check`
- [ ] `npm run sdk:boundary-check`
- [ ] Postgres محلي: كل المايجريشنات + مسح الدوال + مسح الـ views
- [ ] `grep -rn "as any\|confirm(\|prompt(" src/pages/app/movement/` → **صفر**
- [ ] كل `RETURNS TABLE` تُستدعى فعلياً
- [ ] لا دالة `STABLE` تكتب

---

## بوابات الجودة — لا تجاوز

| البوابة | الشرط |
|---|---|
| 🔴 الصلاحيات | `REVOKE FROM anon` على **كل** دالة + حارس |
| 🔴 عزل الدورين | 9 اختبارات في `01-ROLES...` §6 تنجح |
| 🔴 عزل المستأجرين | RLS على كل جدول · مستأجر آخر = صفر |
| 🔴 قيم CHECK | تحقَّق من `pg_constraint` **قبل** الكتابة |
| 🔴 التنفيذ الفعلي | لا توثيق لـ SQL لم يُنفَّذ |
| 🟠 المواضع الأربعة | كل صفحة مسجَّلة في الأربعة |
| 🟠 الممنوعات | لا `confirm`/`prompt`/`as any`/حذف نهائي |
| 🟠 التصدير | عبر `dataExport.ts` فقط |

---

## مزالق خاصة بهذه البوابة

| المزلق | الوقاية |
|---|---|
| نسيان `REVOKE FROM anon` | حارس في كل مايجريشن |
| عدّاد التوقفات لا يتحدث | محفّز + اختبار إضافة/حذف |
| ePOD مكرر عند إعادة المزامنة | `UNIQUE(tenant_id, client_uuid)` |
| `tracking_events` يخنق القاعدة | فهارس + تلخيص 90 يوماً |
| خلط الدورين في الشريط | فلترة `mainIds` حسب الدور النشط |
| خرائط لا تظهر في المعاينة | بديل رشيق — متوقَّع لا عطل |
| ادعاء OR-Tools | صرّح: heuristic تقريبي |
| خوادم OSM العامة في الإنتاج | **حذّر المستخدم صراحةً** |

---

## تقرير التقدّم

عند نهاية كل مرحلة، قدّم:
1. الملفات التي أُنشئت/عُدِّلت (بالأسماء)
2. الفحوصات المُشغَّلة ونتائجها **الفعلية**
3. ما نجح وما فشل — بالنص الحرفي للأخطاء
4. **مستوى التحقق:** ثابت؟ Postgres محلي؟ `db push`؟ متصفح؟
5. ما تبقّى بصراحة

> **مكتمل محلياً ≠ جاهز للإنتاج.**
