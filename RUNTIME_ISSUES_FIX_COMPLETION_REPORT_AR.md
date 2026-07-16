# تقرير تنفيذ إصلاحات مشاكل البوابات والتشغيل — Kyvzon

تاريخ التنفيذ: 2026-07-16

## النتيجة المختصرة

تم تنفيذ الإصلاحات الأساسية للمشاكل التي ظهرت في الصور:

1. إصلاح توجيه المشرف من بوابة الموظف إلى بوابة المشرف.
2. إصلاح انحراف المحتوى وعدم تمركزه بسبب هامش الـ Sidebar.
3. فصل أقسام بوابة الموظف من Sidebar الخاص بالمشرف والمدير حتى لا تظهر لهم كبوابة رئيسية.
4. إصلاح عقد جدول `employee_breaks` بإضافة migration جديد للأعمدة التي تستخدمها بوابة المشرف.
5. إصلاح RLS الخاص بـ `employee_breaks` للسماح للمشرف/المدير بإدارة التصاريح التي يصدرونها بدون فتح الجدول لكل المستخدمين.
6. تحديث صفحة تصاريح المشرف لتستخدم SDK بدل الاستعلام المباشر من Supabase.
7. تحديث الاختبار الخاص بالمسارات الافتراضية ليتوافق مع القرار المعماري الجديد.

---

## الملفات التي تم تعديلها

### التوجيه والـ Layout

```text
src/router/constants.ts
src/router/layouts/AppLayout.tsx
src/test/router/constants.test.ts
```

### Sidebar وفصل البوابات

```text
src/shared/components/dashboard/Sidebar.tsx
```

### بوابة المشرف / تصاريح الاستراحة

```text
src/pages/supervisor/SupervisorBreaksPage.tsx
src/services/sdk/UserService.ts
src/shared/types/sdk.ts
src/shared/types/api.ts
```

### قاعدة البيانات / RLS

```text
supabase/migrations/0025_employee_breaks_supervisor_contract.sql
```

---

## تفاصيل الإصلاحات

## 1. إصلاح توجيه المشرف

كان المسار الافتراضي للمشرف:

```ts
supervisor: '/app/employee'
```

وتم تغييره إلى:

```ts
supervisor: '/app/supervisor'
```

هذا يعالج ظهور لوحة الموظف مباشرة عند دخول حساب المشرف.

---

## 2. إصلاح تمركز المحتوى

كان `AppLayout` يحجز هامشًا ثابتًا:

```tsx
lg:mr-72
```

بينما الـ Sidebar يتغير بين الوضع المفتوح والمصغر. تم تحويل الهامش إلى ديناميكي:

```tsx
sidebarOpen ? 'lg:mr-64' : 'lg:mr-16'
```

مع transition حتى يكون الانتقال ناعمًا.

---

## 3. فصل Sidebar الموظف عن المدير والمشرف

كانت أقسام بوابة الموظف تظهر للأدوار:

```ts
['employee', 'supervisor', 'manager']
```

تم حصر أقسام بوابة الموظف في Sidebar على:

```ts
['employee']
```

بينما يبقى للمشرف والمدير أقسامهم الخاصة:

```text
لوحة المشرف
إدارة الوردية
مهام الفريق
قوائم الفحص
تصاريح الاستراحة
لوحة المدير
مركز الموافقات
أداء الفريق
عبء العمل
حضور الفريق
```

هذا يعالج التباس أن بوابة المشرف/المدير تعرض محتوى بوابة الموظف.

---

## 4. إصلاح جدول `employee_breaks`

تم إنشاء migration جديد:

```text
supabase/migrations/0025_employee_breaks_supervisor_contract.sql
```

يضيف الأعمدة التي تستخدمها صفحة تصاريح المشرف:

```sql
supervisor_id
supervisor_name
employee_name
destination
duration_minutes
out_time
return_time
notes
updated_at
```

مع فهارس مناسبة:

```sql
idx_employee_breaks_tenant_supervisor_created
idx_employee_breaks_tenant_status_created
```

---

## 5. إصلاح RLS الخاص بتصاريح الاستراحة

تم استبدال سياسة `employee_breaks` العامة التي كانت تعتمد فقط على `current_user_is_staff()` بسياسات أدق:

- staff يمكنه إدارة سجلات الشركة.
- المشرف/المدير يستطيع إدارة السجلات التي أصدرها فقط عندما:

```sql
supervisor_id = auth.uid()
```

- الموظف يستطيع قراءة سجلاته فقط عبر:

```sql
employee_id = public.current_user_employee_id()
```

هذا يحل مشكلة 403 المتوقعة بعد إضافة الأعمدة، بدون كسر عزل الشركات أو فتح البيانات.

---

## 6. إصلاح صفحة SupervisorBreaksPage

تم إزالة الاستعلام المباشر القديم من الصفحة واستبداله بالـ SDK:

```ts
employeeBreakService
userService
```

كما تم:

- تحميل فريق المشرف عبر `userService.findAllUsers`.
- إنشاء التصريح عبر `employeeBreakService.create`.
- استخدام `employee_id` المرتبط بسجل الموظف الحقيقي بدل استخدام profile id مباشرة.
- إضافة `break_type = 'supervisor_permit'`.
- إضافة `started_at` عند إنشاء التصريح.

ملاحظة مهمة: إذا كان حساب المستخدم في `profiles` لا يحتوي على `employee_id` مرتبط بسجل في جدول `employees`، ستظهر ملاحظة في قائمة الاختيار أن الموظف لا يملك سجل موظف مرتبط. هذا أفضل من إرسال قيمة خاطئة تكسر FK.

---

## التحقق الفني

تم تشغيل الفحوصات المطلوبة بعد الإصلاح:

```bash
npm run type-check
npm run check:all
npm audit --audit-level=moderate
```

النتيجة:

```text
TypeScript type-check: PASS
SDK Boundary Check: PASS
DB Contract Check: PASS
Tests: 251 passed
Test Files: 16 passed
Production Build: PASS
npm audit: 0 vulnerabilities
```

تفاصيل DB contract بعد إضافة migration 0025:

```text
Canonical migrations: 26
Literal table references: 35
Canonical tables: 100
Canonical views: 2
DB contract check: PASS
```

---

## خطوة ضرورية على قاعدة البيانات الحقيقية

حتى تختفي أخطاء `employee_breaks.supervisor_id does not exist` من المتصفح، يجب تطبيق migration الجديد على Supabase الحقيقي.

من جهازك داخل المشروع:

```powershell
cd E:\-Al-Rafidain
npx supabase db push
```

أو إذا ثبت Supabase CLI عالميًا:

```powershell
supabase db push
```

بعدها أعد تشغيل التطبيق أو حدث الصفحة.

---

## بخصوص خطأ 403 في التبليغات

الإصلاحات الحالية عالجت مشاكل البوابات و`employee_breaks`. أما 403 الخاص بـ `announcements` فهو غالبًا مرتبط ببيانات قاعدة Supabase الحقيقية:

يجب التأكد أن المستخدم الذي يسجل الدخول موجود في:

```text
public.profiles
```

بنفس:

```text
id = auth.uid()
```

وأن لديه:

```text
tenant_id صحيح
role صحيح
```

استعلامات التشخيص المقترحة في Supabase SQL Editor:

```sql
SELECT id, email, role, tenant_id, employee_id
FROM public.profiles
ORDER BY created_at DESC;
```

وفحص الجداول:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'announcements',
    'announcement_polls',
    'announcement_poll_options',
    'announcement_votes',
    'announcement_likes'
  );
```

إذا كان `tenant_id` فارغًا أو المستخدم غير مربوط بسجل profile صحيح، سيستمر 403 بسبب RLS، وهذا ليس خطأ واجهة بل حماية قاعدة البيانات تعمل كما صُممت.

---

## الحالة النهائية

الإصلاحات البرمجية تمت ونجحت الفحوصات بالكامل. المتبقي فقط على بيئة التشغيل الحقيقية:

1. تطبيق migration 0025.
2. التأكد من ربط `profiles.employee_id` بسجلات `employees` للموظفين الذين سيصدر لهم المشرف تصاريح.
3. فحص بيانات `profiles.tenant_id` لحل 403 الخاص بالتبليغات إذا استمر.
