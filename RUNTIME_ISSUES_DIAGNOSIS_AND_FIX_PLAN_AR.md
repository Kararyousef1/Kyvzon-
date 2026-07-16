# تقرير تشخيص مشاكل التشغيل الحالية وخطة الإصلاح — Kyvzon

تاريخ التقرير: 2026-07-16

## ملخص تنفيذي

بعد مراجعة ملفات التوجيه، الواجهات، الـ SDK، والـ migrations المرتبطة بالصور المرسلة، المشاكل ليست مشكلة واحدة؛ بل هي ثلاث طبقات متداخلة:

1. **خلل Routing/Portal Identity**: دور المشرف موجه افتراضياً إلى بوابة الموظف، وبعض أدوار الإدارة والمشرف ما زالت تعرض أقسام الخدمة الذاتية للموظف بشكل يسبب التباساً.
2. **عدم توافق Frontend/DB Contract في جدول `employee_breaks`**: الواجهة تستعلم/تكتب أعمدة غير موجودة فعلياً في migration الأساسي.
3. **خلل Layout**: مساحة المحتوى لا تتكيف مع حالة الـ Sidebar المفتوح/المغلق، لذلك يظهر المحتوى غير متمركز ومساحة فارغة يمين الشاشة.
4. **أخطاء 403 عند التبليغات/announcements**: غالباً بسبب RLS أو عدم وجود ربط صحيح بين مستخدم Supabase Auth وسجل `profiles`/`tenant_id`، وليس بسبب React فقط.

---

## 1. مشكلة عرض محتوى بوابة الموظف في بوابة المشرف/المدير/التقنية

### السبب المؤكد للمشرف

في الملف:

```text
src/router/constants.ts
```

المسار الافتراضي للمشرف مضبوط حالياً على:

```ts
supervisor: '/app/employee'
```

وهذا يعني أن المشرف بعد تسجيل الدخول أو عند الضغط على شعار النظام أو عند الرجوع للمسار الافتراضي يتم إرساله إلى **لوحة الموظف** وليس إلى:

```text
/app/supervisor
```

### السبب الجزئي للمدير والمشرف

في الملف:

```text
src/shared/components/dashboard/Sidebar.tsx
```

أقسام بوابة الموظف معرفة بهذه الأدوار:

```ts
roles: ['employee', 'supervisor', 'manager']
```

وهذا يجعل المدير والمشرف يشاهدان وظائف الخدمة الذاتية للموظف بجانب بواباتهم القيادية. هذا ليس خطأ تقنياً بالكامل إذا كان المقصود أن المدير/المشرف يبقى لديهم خدمات ذاتية، لكنه خطأ UX/Portal Identity لأنه يظهر كأنهم داخل بوابة الموظف.

### بوابة التقنية

المسار الافتراضي لـ `it_admin` صحيح:

```ts
it_admin: '/app/tech-portal'
```

لكن يجب فحص الآتي:

1. هل قيمة الدور في جدول `profiles.role` هي بالضبط:

```text
it_admin
```

وليس مثلاً:

```text
it-admin
tech_admin
IT Admin
supervisor
```

2. عنصر البوابة التقنية في الـ Sidebar يظهر فقط لـ:

```ts
roles: ['it_admin']
```

بينما Route يسمح أيضاً بـ:

```ts
['it_admin', 'admin', 'developer']
```

وهذا عدم اتساق. إذا دخل admin/developer إلى `/app/tech-portal` يستطيع الوصول، لكن لا يرى نفس عنصر القائمة.

3. إذا لم تكن وحدة `tech_portal` مفعلة في `tenant_modules`، فإن حارس `RequireModule` قد يمنع أو يغير تجربة الوصول حسب حالة التفعيل.

---

## 2. خطأ `employee_breaks.supervisor_id does not exist`

### الخطأ من الصورة

```text
column employee_breaks.supervisor_id does not exist
```

### السبب المؤكد

في الصفحة:

```text
src/pages/supervisor/SupervisorBreaksPage.tsx
```

يوجد استعلام:

```ts
employeeBreakService.findAll({ filters: { supervisor_id: user.id } })
```

وعند إنشاء تصريح يتم إرسال أعمدة مثل:

```ts
supervisor_id
destination
duration_minutes
supervisor_name
employee_name
```

لكن جدول `employee_breaks` في migration الأساسي:

```text
supabase/migrations/0002_employee_features.sql
```

يحتوي فقط على:

```sql
id
tenant_id
employee_id
break_type
started_at
ended_at
status
created_at
```

أي أن الواجهة والـ DB غير متطابقين.

### مشكلة ثانية ستظهر بعد إضافة الأعمدة

في:

```text
supabase/migrations/0010_platform_tenant_rls_audit.sql
```

تم وضع `employee_breaks` ضمن جداول لا يسمح بها إلا لمن يعتبرهم النظام staff:

```sql
public.current_user_is_staff()
```

وحالياً `current_user_is_staff()` تشمل:

```text
admin, hr, developer, it_admin
```

ولا تشمل:

```text
supervisor, manager
```

لذلك حتى بعد إضافة عمود `supervisor_id`، قد يتحول الخطأ من 400 إلى 403 للمشرف/المدير.

---

## 3. مشكلة المحتوى لا يظهر وسط الشاشة

### السبب المؤكد

في:

```text
src/router/layouts/AppLayout.tsx
```

المحتوى الرئيسي يستخدم margin ثابت:

```tsx
<main className="lg:mr-72 pt-16 min-h-screen">
```

لكن الـ Sidebar نفسه يتغير بين:

```tsx
sidebarOpen ? 'w-64' : 'w-0 lg:w-16'
```

والـ Header أصلاً يستخدم هامشاً ديناميكياً:

```tsx
sidebarOpen ? 'lg:mr-64' : 'lg:mr-16'
```

إذن AppLayout يحجز 18rem يميناً دائماً، حتى عندما يكون الـ Sidebar بعرض 4rem فقط. هذا يسبب فراغاً كبيراً وانحراف المحتوى.

### ملاحظة إضافية

`TechPortal.tsx` يحتوي Header داخلي خاص به، لكنه يعرض داخل `AppLayout` الذي لديه Header عام أيضاً. هذا قد يسبب تجربة مزدوجة وغير متسقة للبوابة التقنية.

---

## 4. خطأ 403 عند التبليغات/announcements

### المؤشر من الصورة

يوجد طلب إلى `announcements?select=*` يرجع 403.

### الاحتمالات الأقوى

1. المستخدم مسجل في Supabase Auth لكن لا يوجد له سجل مطابق في:

```text
public.profiles
```

بنفس `id = auth.uid()`.

2. سجل `profiles` موجود لكن `tenant_id` فارغ أو لا يطابق بيانات الشركة.

3. migrations الخاصة بالتبليغات/RLS لم تطبق على قاعدة البيانات الحقيقية.

4. النظام يستخدم `tenant_id` من localStorage في الواجهة، لكن RLS في قاعدة البيانات لا يثق بـ localStorage، بل يعتمد على:

```sql
public.current_user_tenant_id()
```

وهذه الدالة تستخرج tenant من جدول `profiles` بناءً على `auth.uid()`.

### نقطة مهمة

الواجهة تسمح للمشرف والمدير بالنشر، وRLS في `announcements` يسمح بالـ INSERT لأي مستخدم authenticated بشرط:

```sql
tenant_id = public.current_user_tenant_id()
AND author_id = auth.uid()
```

لذلك إذا ظهر 403 حتى عند SELECT أو INSERT فهذا غالباً يعني أن `current_user_tenant_id()` ترجع NULL أو لا تطابق `tenant_id` المرسل.

---

## خطة الإصلاح المقترحة

### المرحلة 1 — إصلاح هوية البوابات والتوجيه

1. تعديل:

```text
src/router/constants.ts
```

من:

```ts
supervisor: '/app/employee'
```

إلى:

```ts
supervisor: '/app/supervisor'
```

2. مراجعة Login redirect و Logo redirect لأنها تعتمد على نفس `getDefaultPathForRole`.

3. إعادة تنظيم Sidebar:
   - إما إخفاء أقسام employee عن manager/supervisor.
   - أو نقلها تحت اسم واضح مثل: **الخدمات الذاتية** بدل أن تظهر كأنها بوابة الموظف.

4. توحيد أدوار بوابة التقنية بين Route و Sidebar:
   - إما جعلها فقط `it_admin`.
   - أو السماح بعرضها أيضاً لـ `admin` و `developer` إذا كان هذا مقصوداً.

---

### المرحلة 2 — إصلاح عقد `employee_breaks`

إنشاء migration جديد مثل:

```text
supabase/migrations/0025_employee_breaks_supervisor_contract.sql
```

يضيف الأعمدة المطلوبة:

```sql
ALTER TABLE public.employee_breaks
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supervisor_name TEXT,
  ADD COLUMN IF NOT EXISTS employee_name TEXT,
  ADD COLUMN IF NOT EXISTS destination TEXT,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER DEFAULT 15,
  ADD COLUMN IF NOT EXISTS out_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
```

ثم إضافة index:

```sql
CREATE INDEX IF NOT EXISTS idx_employee_breaks_tenant_supervisor
ON public.employee_breaks(tenant_id, supervisor_id, created_at DESC);
```

ثم تحديث RLS بحيث يسمح للمشرف/المدير بإدارة تصاريح فريقه، بدون توسيع `current_user_is_staff()` عالمياً بشكل خطر.

---

### المرحلة 3 — إصلاح Layout

تعديل:

```text
src/router/layouts/AppLayout.tsx
```

ليصبح margin الرئيسي متوافقاً مع حالة Sidebar:

```tsx
<main className={`${sidebarOpen ? 'lg:mr-64' : 'lg:mr-16'} pt-16 min-h-screen transition-all duration-300`}>
```

بدل:

```tsx
<main className="lg:mr-72 pt-16 min-h-screen">
```

ثم مراجعة الصفحات التي تستخدم `page-container` للتأكد أن `max-width` و `margin auto` يعملان داخل المساحة الصحيحة.

---

### المرحلة 4 — إصلاح بوابة التقنية UX

1. إبقاء `TechPortal` كصفحة داخل AppLayout، لكن إزالة/تبسيط Header الداخلي الخاص بها.
2. جعل Tabs البوابة التقنية واضحة:
   - لوحة التحكم
   - أجهزة البصمة
   - سجل المزامنة
   - صحة النظام
   - الإعدادات
3. التأكد من تفعيل module:

```text
tech_portal
```

في جدول:

```text
tenant_modules
```

للشركة الحالية.

---

### المرحلة 5 — تشخيص وإصلاح 403 في التبليغات

يجب فحص قاعدة البيانات الحقيقية:

```sql
SELECT id, email, role, tenant_id
FROM public.profiles
WHERE email = 'supervisor@kyvzon.dev';
```

ثم التأكد أن `tenant_id` موجود في:

```sql
SELECT id, name
FROM public.tenants;
```

ثم التأكد أن migrations الخاصة بالتبليغات مطبقة:

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

وفحص RLS:

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename LIKE 'announcement%';
```

إذا كان المستخدم لا يملك profile مطابقاً لـ Supabase Auth، يجب إصلاح بيانات seed/profiles لا تعطيل RLS.

---

## أوامر التحقق بعد تنفيذ الإصلاح

بعد أي تعديل فعلي يجب تشغيل:

```bash
npm run type-check
npm run check:all
npm audit --audit-level=moderate
```

ويجب ألا نعتبر الإصلاح مكتملاً إلا إذا كانت النتائج:

```text
TypeScript PASS
SDK Boundary PASS
DB Contract PASS
Tests PASS
Build PASS
Audit 0 vulnerabilities
```

---

## الأولوية

1. إصلاح `ROLE_DEFAULT_PATH` للمشرف.
2. إصلاح Layout margin.
3. إنشاء migration لعقد `employee_breaks` + RLS.
4. فحص وربط بيانات Auth/Profile/Tenant لحل 403.
5. تحسين فصل هوية البوابات في Sidebar وتجربة بوابة التقنية.
