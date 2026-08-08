# دليل تطبيق مايجريشنات بوابة الحركة على Supabase

> **لا تُنفّذ `npx supabase db push` مباشرة.** اقرأ هذا أولاً.
> يغطي `0270`–`0299` (30 مايجريشن).

---

## ⚠️ لماذا لا تُنفّذه مباشرة

| # | الخطر | الأثر لو حدث |
|---|---|---|
| 🔴 ١ | **`0288` يستبدل قيد `profiles_role_check`** | لو وُجد مستخدم بدور خارج القائمة الـ18 → **المايجريشن يفشل في منتصف الدفعة** |
| 🔴 ٢ | **`0293` يُنشئ محفّزات على `movements_log` و`movement_permits`** | جدولان **يعملان في الإنتاج الآن**. أي `INSERT` بعدها يُشعل مزامنة |
| 🔴 ٣ | **`0292` يرحّل بياناتك الفعلية** | يقرأ كل صفوف الجدولين القديمين ويكتب نسخة في الجديد |
| 🟠 ٤ | **`pg_cron` غير مُفعَّل** | `0290`/`0295` سيتخطّيان الجدولة **بصمت** |
| 🟠 ٥ | **30 مايجريشن دفعةً واحدة** | فشل في `0295` يترك القاعدة في حالة نصفية |

> **`DELETE FROM` في `0286` آمن** — داخل دالة `purge_old_telemetry`
> تُستدعى يدوياً أو بجدولة، لا تُنفَّذ وقت التطبيق.

---

## الخطوة ٠ — نسخة احتياطية (إلزامية)

```bash
# من لوحة Supabase: Database → Backups → Create backup
# أو عبر CLI:
npx supabase db dump --db-url "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  -f backup-before-movement-$(date +%Y%m%d-%H%M).sql
```

**تحقق أن الملف غير فارغ:**
```bash
ls -lh backup-before-movement-*.sql
```

> بلا نسخة احتياطية لا تُكمل. `0288` و`0292` يلمسان بيانات قائمة.

---

## الخطوة ١ — 🔴 فحص أدوار المستخدمين (الأهم)

`0288` سيرفض أي دور خارج القائمة الـ18. **نفّذ هذا في SQL Editor
على Supabase قبل أي شيء:**

```sql
SELECT role, count(*) AS عدد
  FROM public.profiles
 WHERE role NOT IN (
   'employee','hr','admin','gatekeeper','developer','supervisor','manager',
   'it_admin','tech','finance','marketing','sales','procurement','inventory',
   'manufacturing','employee_movement','logistics','movement_manager'
 )
 GROUP BY role;
```

| النتيجة | الإجراء |
|---|---|
| **صفر صفوف** | ✅ تابع للخطوة ٢ |
| **أي صف** | ⛔ **قف** — أرسل لي النتيجة قبل المتابعة |

> لو ظهر دور غير متوقَّع، الخيارات: إضافته للقيد، أو تصحيح تلك
> الصفوف. القرار يحتاج معرفتك بالبيانات.

---

## الخطوة ٢ — قياس حجم الترحيل

```sql
SELECT 'movements_log'    AS الجدول, count(*) AS الصفوف FROM public.movements_log
UNION ALL
SELECT 'movement_permits', count(*) FROM public.movement_permits;
```

**احفظ هذين الرقمين.** ستقارنهما بعد التطبيق — `0292` يفشل تلقائياً
عند أي عدم تطابق، لكن التحقق اليدوي طبقة أمان ثانية.

**وافحص الوجهات النصية** (ستصير مواقع):
```sql
SELECT count(DISTINCT regexp_replace(trim(destination), '\s+', ' ', 'g'))
  FROM (SELECT destination FROM public.movements_log
        UNION SELECT destination FROM public.movement_permits) x
 WHERE destination IS NOT NULL AND trim(destination) <> '';
```
هذا عدد المواقع التي ستُنشأ برمز `LEG-####`.

---

## الخطوة ٣ — تفعيل `pg_cron`

**لوحة Supabase → Database → Extensions → ابحث عن `pg_cron` → فعّله.**

بدونه سيتخطّى `0290` و`0295` الجدولة **بصمت** (لن يفشلا، لكن
الإشعارات لن تعمل أبداً).

للتأكد:
```sql
SELECT extname FROM pg_extension WHERE extname = 'pg_cron';
```

---

## الخطوة ٤ — ربط المشروع والمعاينة

```bash
cd /path/to/Kyvzon

# اربط المشروع (مرة واحدة)
npx supabase link --project-ref [PROJECT_REF]

# ★ معاينة بلا تطبيق — لا تتخطَّ هذه
npx supabase db push --dry-run
```

**تحقق من المخرجات:**
- عدد الملفات = **30** (`0270`–`0299`)
- لا رسائل خطأ
- `README.md` سيُتخطّى (طبيعي — لا يطابق نمط التسمية)

---

## الخطوة ٥ — التطبيق

```bash
npx supabase db push
```

### الرسائل المتوقَّعة (نجاح)
```
NOTICE: ✅ 0288: profiles_role_check now covers 18 roles incl. movement portal
NOTICE: 0292: رُحِّل N تصريحاً · M حركة · K موقعاً
NOTICE: ✅ 0292: رُحِّل N تصريحاً و M حركة — مطابقة العدد مؤكَّدة
NOTICE: ✅ 0293: مزامنة حيّة قديم←جديد مفعَّلة ومُختبَرة
NOTICE: ✅ 0290: pg_cron مُجدوَل — الإشعارات يومياً 06:00 UTC
NOTICE: ✅ 0299: عزل المستأجرين في فحص السور + حارس دائم
```

### 🔴 لو فشل — لا تُعد المحاولة فوراً
كل مايجريشن يحمل حارساً يُفشل نفسه عند أي خلل بدل ترك حالة نصفية.
**انسخ نص الخطأ كاملاً وأرسله لي** — الحراس مصمَّمة لتشرح السبب:

| نص الخطأ | المعنى |
|---|---|
| `0288 failed: role X missing` | دور غير مُغطّى → عد للخطوة ١ |
| `0292 failed: permits count mismatch` | ترحيل ناقص → **لا تُعد التشغيل** |
| `0299 failed: SECURITY DEFINER…` | دالة بلا عزل مستأجر |
| `pg_cron غير متاح` | ⚠️ تحذير لا خطأ — عد للخطوة ٣ |

---

## الخطوة ٦ — التحقق بعد التطبيق

### ① الترحيل مكتمل
```sql
SELECT * FROM public.movement_legacy_migration_status;
```
**`pending_rows` يجب أن يكون صفراً في السطرين.** أي رقم أكبر = محفّز
لم يعمل → شغّل:
```sql
SELECT * FROM public.migrate_pending_legacy_movements();
```

### ② الأمان
```sql
-- يجب أن يُرجع صفر صفوف
SELECT p.proname
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname ~ '^(movement_|logistics_|record_my_|get_my_|start_my_|end_my_)'
   AND has_function_privilege('anon', p.oid, 'EXECUTE');
```

### ③ الجدولة
```sql
SELECT jobname, schedule, active FROM cron.job
 WHERE jobname LIKE 'kyvzon_%';
```
**متوقَّع 3 مهام.** لو صفر → `pg_cron` لم يُفعَّل قبل التطبيق:
```bash
# فعّله ثم أعد تشغيل الاثنين فقط
npx supabase db push --include-all
```

### ④ صحة النظام
```sql
SELECT job_name, health FROM public.movement_cron_health;
```
`never_ran` طبيعي في اليوم الأول. بعد 48 ساعة يجب أن يصير `healthy`.

---

## الخطوة ٧ — إسناد الأدوار (لن تعمل البوابة بدونها)

المايجريشنات تبني البنية فقط. **لا أحد يرى البوابة حتى تُسنَد الأدوار.**

### أ) دور المنصة
```sql
UPDATE public.profiles SET role = 'logistics'
 WHERE id = '[USER_UUID]';
```

### ب) دور البوابة (الأهم)
```sql
INSERT INTO public.movement_role_assignments
  (tenant_id, user_id, portal_role, is_active)
VALUES ('[TENANT_UUID]', '[USER_UUID]', 'logistics', true);
```

**القيم المتاحة:** `employee_movement` · `logistics` · `movement_manager`

> `movement_require_role` يمرّر أدوار المنصة `admin`/`developer`/`it_admin`
> تلقائياً — فحسابك الإداري يعمل بلا إسناد.

### ج) ربط سائق بتطبيق السائق
من واجهة **L02 السائقون → زر «ربط حساب»**، أو:
```sql
SELECT public.link_driver_account('[DRIVER_UUID]', '[USER_UUID]');
```

---

## الخطوة ٨ — سرّ الإشعارات

Edge Function `movement-daily-notifications` تحتاج:

```bash
npx supabase secrets set CRON_SECRET="$(openssl rand -hex 32)"
npx supabase functions deploy movement-daily-notifications
```

> بدونه ترفض الدالة كل الطلبات (وهذا سلوك آمن مقصود).

---

## ⚠️ ما لن يعمل فوراً — إفصاح صريح

| البند | السبب |
|---|---|
| **رفع صور ePOD** | يحتاج Storage bucket لم يُنشأ |
| **الخرائط في معاينة الملفات** | لا شبكة في الـiframe — تعمل في المتصفح |
| **بلاطات OSM في الإنتاج** | ⚠️ خوادم مجانية بحدود استعمال. لأسطول كبير استعمل مزوّداً مدفوعاً |
| **تسليم → خصم المخزون** | تكامل غير مبنيّ |
| **الوضع دون اتصال** | مُختبَر على القاعدة فقط — **لم يُختبر في متصفح** |

---

## خطة التراجع

```bash
# استعادة النسخة الاحتياطية
psql "postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres" \
  -f backup-before-movement-YYYYMMDD-HHMM.sql
```

**تراجع جزئي** (إن أردت إيقاف المزامنة فقط دون استعادة كاملة):
```sql
DROP TRIGGER IF EXISTS trg_sync_legacy_movement_log ON public.movements_log;
DROP TRIGGER IF EXISTS trg_sync_legacy_movement_permit ON public.movement_permits;
```
الجدولان القديمان **لم يُمسّا** — النظام القديم يواصل العمل كما كان.

---

## الملخّص التنفيذي

```
٠. نسخة احتياطية              ← إلزامية
١. فحص أدوار profiles          ← 🔴 الأهم، قف لو ظهر شيء
٢. قياس حجم الترحيل            ← احفظ الأرقام
٣. تفعيل pg_cron               ← قبل التطبيق
٤. db push --dry-run           ← معاينة
٥. db push                     ← التطبيق
٦. تحقق (4 استعلامات)          ← بعد التطبيق
٧. إسناد الأدوار               ← بدونها لا أحد يرى شيئاً
٨. CRON_SECRET + deploy        ← للإشعارات
```

**الأخطر:** الخطوة ١. الباقي محميّ بحراس داخل المايجريشنات.
