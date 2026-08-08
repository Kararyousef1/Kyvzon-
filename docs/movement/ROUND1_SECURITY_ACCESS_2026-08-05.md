# الجولة ١ — الأمان والوصول · مكتملة

**التاريخ:** 2026-08-05 · **مايجريشن:** `0301` · **مُختبَر محلياً · لم يُطبَّق على الإنتاج**

---

## قراراتك التي بنيتُ عليها

| السؤال | جوابك |
|---|---|
| مصير البوابة القديمة | **(ب) إيقاف تدريجي** ← الجولة ٢ |
| من هو السائق؟ | **موظف ومتعاقد خارجي معاً** |
| الترتيب | **الأمان أولاً** |

---

## ١. 🔴 السائق كان محبوساً خلف دور مدير الأسطول

### العطل

```tsx
// AppRouter.tsx — قبل
<Route element={<RequireMovementRole role="logistics" />}>
  ...
  <Route path="driver/trips" element={<DriverTripsPage />} />
  <Route path="driver/delivery/:dispatchId" ... />
  <Route path="driver/inspection/:dispatchId" ... />
```

السائق يحتاج دور `logistics` ليرى رحلاته — وهو دور مدير الأسطول الذي يفتح التكاليف والناقلين والربحية. **إما يُحرم السائق من تطبيقه، أو يُمنح صلاحيات إدارية كاملة.**

### المفارقة: القاعدة كانت صحيحة

`0291` عرّف الحارس الصحيح أصلاً:

```sql
v_driver := public.current_driver_id();   -- من logistics_drivers.user_id
IF v_driver IS NULL THEN RAISE EXCEPTION 'NOT_A_DRIVER'; END IF;
```

السائق يُعرَّف بسجل في الأسطول **لا بدور بوابة**. الواجهة وحدها أخطأت.

### لماذا لم تستطع الواجهة استخدامها

`movement_require_driver()` ترفع استثناء `NOT_A_DRIVER`. حارس React يحتاج قيمة منطقية هادئة — فأضفتُ نظيراً:

```sql
CREATE OR REPLACE FUNCTION public.is_current_user_driver()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
AS $$ SELECT public.current_driver_id() IS NOT NULL; $$;
```

### الإصلاح

- **`RequireDriver.tsx`** — حارس جديد يستدعي `isDriver()`. مدير الأسطول يمر أيضاً (معاينة للدعم، نظير استثناء أدوار المنصة).
- **`AppRouter`** — صفحات السائق الثلاث خرجت من تحت `logistics` إلى كتلة `RequireDriver` مستقلة.
- **`DriverAppService.isDriver()`** — يستدعي `is_current_user_driver` بدل `current_driver_id`.

---

## ٢. 🔴 السائق لم يكن يرى صفحته في الشريط الجانبي أصلاً

فحصٌ كشف ما لم يكن في تشخيصي: قسم `movement-main` يشترط:

```ts
roles: ['employee_movement', 'logistics', 'movement_manager', 'admin', 'developer', 'hr']
```

**`employee` غير مذكور** — والسائق دوره غالباً `employee`. فحتى لو أصلحتُ الراوتر وحده، لما وصل السائق إلى الصفحة.

### الإصلاح

```ts
.filter((section) =>
  hasCustomPages
  || section.roles.includes(role)
  || (section.key === 'movement-main' && isFleetDriver),
)
```

وداخل الفلترة الدقيقة:

- **سائق بلا دور بوابة** ⇒ يرى صفحة السائق وحدها، والقسم يُعنون «تطبيق السائق».
- **سائق له دور بوابة** ⇒ يرى وحداته **مع** صفحة السائق.
- **لا دور ولا سجل سائق** ⇒ القسم مخفي كلياً.

---

## ٣. دعم السائق المتعاقد الخارجي (قرارك: الاثنان معاً)

```sql
ALTER TABLE public.logistics_drivers
  ADD COLUMN IF NOT EXISTS driver_type VARCHAR(20) NOT NULL DEFAULT 'employee';
CHECK (driver_type IN ('employee', 'contractor'))
```

مع قيد تماسك يمنع التناقض:

```sql
CHECK (
  (driver_type = 'employee'   AND employee_id IS NOT NULL) OR
  (driver_type = 'contractor' AND employee_id IS NULL)
)
```

المتعاقد الخارجي لا يحمل ملف موظف، والموظف يجب أن يحمله. الصفوف القائمة بلا `employee_id` تُصحَّح تلقائياً إلى `contractor` **قبل** تثبيت القيد، فلا يفشل المايجريشن على قاعدة فيها بيانات.

---

## ٤. 🔴 المفاتيح الأجنبية المفقودة — مع تصحيح تشخيصي مهم

### ما اكتشفتُه أثناء التنفيذ

`employee_id` يعني **شيئين مختلفين** في نفس القاعدة:

| الجداول | تشير إلى |
|---|---|
| `attendance_logs` · `leaves` · `employee_breaks` | **`employees(id)`** |
| `movements_log` (القديم) · بوابة الحركة | **`profiles(id)`** |

بوابة الحركة تكتب `user.id` (= `profiles.id`) في أربع صفحات — وهذا **متسق** مع `movements_log` القديم الذي يقيّده صراحةً بـ`profiles`. لذا قيّدتُ جداول البوابة بـ`profiles` لا `employees`، حفاظاً على الاتفاق القائم وعلى صحة محفّزات المزامنة في `0293`.

⚠️ **هذا له أثر على الجولة ٣**: ربط تصريح الحركة بسجل الدوام سيحتاج جسراً `profiles.id → employees.id` لأن `attendance_logs` تستخدم المعنى الآخر.

### الجداول الخمسة (نطاق البوابة وحده)

```
employee_movement_permits · employee_movements_log
employee_field_visits · employee_missions · employee_movement_violations
```

كلها الآن: `REFERENCES public.profiles(id) ON DELETE CASCADE`.

**خارج النطاق عمداً:** 8 جداول أخرى بلا FK (`employee_certifications` · `employee_contracts` · `employee_documents` · `employee_goals` · `employee_letter_requests` · `employee_loans` · `employee_onboarding` · `employee_skills`) — سابقة لبوابة الحركة ومعناها `employees(id)` على الأرجح. إصلاحها يحتاج تحقيقاً منفصلاً ولا يُقحَم هنا.

### حماية البيانات

المايجريشن **يتوقف** عند وجود صفوف يتيمة بدل حذفها:

```
0301 متوقف: N صفاً يتيماً في جداول بوابة الحركة.
نظّفها يدوياً ثم أعد التشغيل — لا نحذف بيانات تلقائياً.
```

---

## ٥. التحقق الفعلي

**230 مايجريشن من الصفر · صفر فشل** على Postgres 17.10 محلي.

### `verify-movement-0301.sql` — 22/22

| # | الاختبار | النتيجة |
|---|---|---|
| 1-2 | سائق موظف · سائق متعاقد | ✅ كلاهما أُدرج |
| 3-4 | رفض `contractor` مع `employee_id` · رفض `employee` بلا | ✅ `check_violation` |
| 5-7 | `is_current_user_driver` للأنواع الثلاثة | ✅ t · t · f |
| 8 | السائق الموقوف يفقد الوصول | ✅ f |
| **9** | **السائق لا يُمنح دور مدير الأسطول** | ✅ `NOT_AUTHORIZED_FOR_MOVEMENT_ROLE (logistics)` |
| **10** | **ومع ذلك يبقى سائقاً** | ✅ t |
| 11 | مدير الأسطول ليس سائقاً تلقائياً | ✅ f |
| 12-16 | المفاتيح الأجنبية الخمسة | ✅ موجودة |
| 17-18 | FK يرفض الوهمي · يقبل الصحيح | ✅ |
| 19 | `ON DELETE CASCADE` ينظّف | ✅ remaining=0 |
| 20 | FK يشير إلى `profiles` | ✅ |
| 21-22 | `anon` محروم · `authenticated` ممنوح | ✅ |

**الاختباران 9 و10 معاً هما جوهر الإصلاح:** السائق مرفوض من دور مدير الأسطول، وسائق في الوقت نفسه.

### إثبات أن الاختبارات تكشف الانحدار

أعدتُ `driver/trips` تحت حارس اللوجستيات مؤقتاً:

```
× المسار driver/trips ليس داخل كتلة RequireMovementRole role="logistics"
Tests  1 failed | 37 passed
```

ثم استرجعتُ ⇒ 38/38.

---

## ٦. اختباران كسرتُهما وأصلحتُهما

| الاختبار | لماذا كُسر | الإصلاح |
|---|---|---|
| `movementRoleSyncContract` — «يُخفي القسم لمن لا دور له» | صار الشرط مركّباً: لا دور **ولا سائق** | تأكيد على الشرطين معاً |
| `movementDriverCronOropt` — «يستدعي RPCs 0291» | `current_driver_id` لم يعد مُستدعى مباشرة | نُقل إلى تأكيد منفصل على `is_current_user_driver` |

كلاهما كان يؤكد نيّة صحيحة بوسيلة عفا عليها التغيير.

---

## ٧. بوابات الجودة

| البوابة | النتيجة |
|---|---|
| `type-check` | ✅ صفر خطأ |
| `test:run` | ✅ **1444/1444** في 99 ملفاً (كانت 1405/98 — صافي +39) |
| `build` | ✅ 13.46 ثانية |
| `lint` | ✅ 0 خطأ |
| `db:contract-check` | ✅ PASS |
| `sdk:boundary-check` | ✅ صفر انتهاك في `movement` |
| 230 مايجريشن من الصفر | ✅ صفر فشل |
| `verify-0300` + `verify-0301` | ✅ 22/22 + 22/22 |
| إعادة تطبيق `0301` | ✅ آمن للتكرار (6 FK ثابتة) |

---

## ٨. الملفات

```
supabase/migrations/0301_movement_driver_guard_and_fks.sql  (جديد)
tools/dev/verify-movement-0301.sql                          (جديد — 22 اختباراً)
src/router/guards/RequireDriver.tsx                         (جديد)
src/test/movementDriverAccessContract.test.ts               (جديد — 38 اختباراً)
docs/movement/ROUND1_SECURITY_ACCESS_2026-08-05.md          (جديد — هذا الملف)
src/router/AppRouter.tsx                                    (معدَّل)
src/shared/components/dashboard/Sidebar.tsx                 (معدَّل)
src/services/sdk/DriverAppService.ts                        (معدَّل)
src/pages/hybridportal/hybridPagesCatalog.ts                (معدَّل — توثيق)
src/test/movementRoleSyncContract.test.ts                   (معدَّل)
src/test/movementDriverCronOroptContract.test.ts            (معدَّل)
src/pages/hr/GatekeeperPage.tsx                             (حُذف — 0 بايت يتيم)
```

---

## ٩. خطوتك

```bash
npx supabase db push          # يطبّق 0300 + 0301
```

ثم لاختبار السائق فعلياً:

1. من `L03 السائقون والامتثال` — اربط حساب مستخدم بسجل سائق.
2. سجّل الدخول بذلك الحساب (دوره `employee` عادي).
3. يجب أن ترى **«تطبيق السائق»** في الشريط الجانبي، وصفحة رحلاتي تفتح.
4. وتأكد أنه **لا يرى** الأسطول أو التكاليف.

---

## ١٠. ما تبقّى — الجولات القادمة

### الجولة ٢ — الإيقاف التدريجي للبوابة القديمة *(قرارك: ب)*
- تحويل `HRMovementAnalyticsPage` للقراءة من الجديد
- بانر «شاشة قديمة» في `GatekeeperPage` + `MovementControlPage`
- **بلا** إسقاط جداول

### الجولة ٣ — التكاملات الحرجة
- تسليم ePOD → خصم المخزون
- تصريح الحركة → سجل الدوام (**ينتبه لجسر `profiles`↔`employees`**)
- سائق ↔ ملف الموظف

### الجولة ٤ — المالية والمشتريات
- تكاليف الأسطول → مركز تكلفة · أمر شراء → أمر نقل

### الجولة ٥ — اكتمال الواجهات
- المحطات/التسعيرة/المرفقات · 5 حالات فارغة · حالة تحميل ناقصة

### الجولة ٦ — الميزات المؤجلة
- مواد خطرة/مبرَّدة · حوادث المركبات · Storage لصور ePOD · تحذير OSM

**لم يُنفَّذ `git push` ولا `db push`.**
