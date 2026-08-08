# 0335 — لوحة الموظف: العطل الذي أخفى كل بياناته

> المرحلة 2 من خطة البوابتين — الجولة الأولى.
> `0332` · `0333` · `0334` · `0335` تنتظر `db push`.

---

## ★★★ العطل: اللوحة تعرض أصفاراً بينما البيانات موجودة كلّها

`EmployeeDashboard.tsx` أطلق سبعة استعلامات كلّها بـ`user.id`:

```ts
attendanceSummaryService.findAll({ filters: { employee_id: user.id } })
expenseRequestService.findByEmployee(user.id)
employeeLoanService.findByEmployee(user.id)
employeeGoalService.findByEmployee(user.id)
wellnessEntryService.findByUser(user.id, 30)
```

لكن **`user.id` هو `profiles.id`** بينما العمود `employee_id` يشير إلى
**`employees.id`** — معرّفان مختلفان تماماً. مُحقَّق من `pg_constraint`:

```
wellness_entries.employee_id    → employees
attendance_summary.employee_id  → employees
leave_balance.employee_id       → employees
incidents.employee_id           → employees   (وله user_id منفصل)
```

### الإثبات على Postgres — موظف واحد ببيانات كاملة

```
profiles.id  = de5e4ca9-…
employees.id = 63dd141c-…   ← مختلف تماماً

★★ ما يجلبه الداشبورد (بـuser.id):
   wellness_entries   = 0
   attendance_summary = 0
   employee_goals     = 0
   leave_balance      = 0

✅ ما هو موجود فعلاً (بـemployees.id):
   wellness_entries   = 1
   attendance_summary = 1
   employee_goals     = 1
   leave_balance      = 1
```

**أربع صفحات مصابة:** `EmployeeDashboard` · `ContactPage` ·
`MyGoalsPage` · `SurveyPage`.

**وعشر صفحات حلّته صحيحاً** بتكرار يدوي للنمط:
```ts
employeeService.findAll({ filters: { user_id: user.id }, limit: 1 })
```
هذا التكرار نفسه هو سبب نسيانه في الأربع.

---

## ★★ عطل ثانٍ اكتُشف أثناء إصلاح الأول

لا قيد يمنع **سجلَّي موظف لنفس المستخدم**. مُثبَت:

```
بعد إنشاء الملف: عدد سجلات الموظف = 1   (محفّز 0317)
بعد إدراج يدوي:  عدد سجلات الموظف = 2   ⇒ لا قيد يمنع التكرار
```

**والأخطر:** `current_user_employee_id()` (من `0007`) تختار بـ

```sql
SELECT e.id FROM employees e WHERE e.user_id = auth.uid() … LIMIT 1
```

**بلا `ORDER BY`** — فالاختيار غير محدَّد. مستخدم بسجلَّين قد يرى
بياناته اليوم ولا يراها غداً حسب خطة التنفيذ.

### العلاج: فهرس فريد **جزئي**

```sql
CREATE UNIQUE INDEX uq_employee_per_user_tenant
  ON public.employees (tenant_id, user_id)
  WHERE user_id IS NOT NULL;
```

**جزئي لأن** `user_id` يقبل `NULL` (موظف بلا حساب دخول — حالة مشروعة)،
و`UNIQUE` عادي يعامل كل `NULL` كقيمة مميزة فيسمح بصفوف بلا حدّ.

**ولا يُطبَّق قسراً** إن وُجد تكرار قائم — يُنبّه ولا يُسقط المايجريشن.
حذف صفّ موظف يُيتّم حضوره وإجازاته ورواتبه؛ الدمج لا الحذف.

---

## ما بُني

| # | المكوّن | الدور |
|---|---|---|
| ⓪ | `uq_employee_per_user_tenant` | سجلّ موظف واحد لكل مستخدم |
| ① | `my_employee_id()` | كشف `current_user_employee_id` للواجهة |
| ② | `my_dashboard_summary()` | ملخّص اللوحة — صفّ واحد بدل سبعة استعلامات |
| ③ | `my_leave_balance(year)` | رصيد الإجازات بالمعرّف الصحيح |
| ④ | خمسة فهارس | أحدها جزئي على الأهداف النشطة |
| ⑤ | `useEmployeeId()` | هوك مشترك يُنهي التكرار اليدوي |
| ⑥ | `EmployeeDashboardService` | طبقة SDK |

### قرارات تقنية

**`my_dashboard_summary` تُرجع صفّ أصفار لمن بلا سجلّ موظف** — لا «لا
شيء». الواجهة تحتاج التمييز بين «لا بيانات» (تُحلّ بالوقت) و«لا سجلّ
موظف» (تحتاج تدخّل الموارد البشرية).

**`incidents` يقبل `employee_id` أو `user_id`** — البلاغات القديمة
سُجّلت بـ`user_id`.

**الأهداف النشطة وحدها في المتوسط.** لو حُسب المكتمل (100%) لارتفع
المتوسط زوراً من 60 إلى ≈73.

**رصيد الإجازات `NUMERIC` لا `INTEGER`** — الأعمدة مُحقَّقة:
`annual_* :: numeric(6,3)` · `sick_* :: numeric(5,1)`. نصف يوم إجازة
قيمة مشروعة، وتقريبها يُفقد رصيداً. (اكتشفه `tsc`… بل Postgres:
`Returned type numeric(6,3) does not match expected type integer`.)

**المتبقّي يطرح المعلّق:** `30 − 5 − 2.5 = 22.5`. طلب قيد الاعتماد
يحجز الرصيد؛ بدون طرحه يرى الموظف رصيداً يظنّه متاحاً ثم يُرفض طلبه.

---

## ★★ خطأ كدتُ أُكرّره

عند إصلاح الصفحات كتبتُ أولاً:

```ts
employee_id: employeeId ?? '',
```

**هذا بالضبط عطل `0333`** — `employee_id=eq.` يردّه Postgres بـ400
«invalid input syntax for type uuid». استبدلتُه بحارس صريح:

```ts
if (!employeeId) {
  addToast('حسابك غير مرتبط بسجلّ موظف — راجع الموارد البشرية', 'error');
  return;
}
```

`tsc` هو من أجبرني على مواجهة الحالة: `Type 'string | null' is not
assignable to parameter of type 'string'`.

---

## واجهة «حساب بلا سجلّ موظف»

قبل هذا الإصلاح كان الموظف في هذه الحالة يرى **لوحة أصفار كاملة بلا
تفسير** — يظنّ أن بياناته ضاعت. الآن رسالة صريحة تشرح السبب وتوجّهه
إلى الموارد البشرية.

---

## الإثبات

### الاختبار السلوكي — 38 تأكيداً

`tools/dev/verify-employee-dashboard-0335.sql`

يبدأ بالتحقق من أن **التجهيز نفسه صالح**:

```sql
ASSERT v_e <> v_u,
  '1.1 ★★ employees.id = profiles.id ⇒ الاختبار لا يقيس العطل الحقيقي';
```

ويفحص القيد بمحاولة تكرار حقيقية (`unique_violation`)، وأنه **لا يخنق**
الموظفين بلا حساب دخول (`NOUSER-1` · `NOUSER-2`).

### ستة أعكاس تُسقط الاختبار

| # | العكس | ما ظهر |
|---|---|---|
| ① | `v_emp := auth.uid()` (العودة للعطل) | `5.1 ★★ الملخّص لم يحلّ معرّف الموظف` |
| ② | `UNIQUE` ← `INDEX` عادي | `2.3 ★★ سجلّ موظف ثانٍ قُبل — القيد صوري` |
| ③ | المتبقّي بلا طرح المعلّق | `6.2 ★★ المتبقّي = 25.000 (متوقَّع 22.5)` |
| ④ | `status IN ('active','completed')` | `5.6 ★ أهداف نشطة = 3 (متوقَّع 2)` |
| ⑤ | `tenant_id … OR TRUE` | `7.3 ★★★ أيام مُتتبَّعة = 5 (متوقَّع 4)` |
| ⑥ | حذف صفّ الأصفار | `8.2 ★★ الملخّص أعاد 0 صفاً (متوقَّع 1)` |

### ★★★ تصحيح ذاتي: ثغرة في تغطيتي

**العكس ⑤ لم يُسقط الاختبار في المحاولة الأولى.** نجحت الـ37 تأكيداً
كلّها رغم إلغاء فلتر المستأجر.

**السبب المُشخَّص:** `employee_id` معرّف UUID **فريد عالمياً**، فترشيحه
وحده يُقصي الصفوف الأجنبية ضمناً. التأكيدان `7.1` و`7.2` كانا يقيسان
عزلاً يحدث بالصدفة لا بالتصميم.

**الكشف الحقيقي** يحتاج **نفس `employee_id` في مستأجرين مختلفين** —
حالة تبدو مستحيلة لكنها ليست كذلك: **لا مفتاح أجنبي** على
`attendance_summary.employee_id` يربطه بمستأجره، فبيانات مُرحَّلة أو
خطأ إدراج قد يُنتجها. فلتر المستأجر هو خطّ الدفاع الوحيد.

أُضيف التأكيد `7.3` الذي يُنشئ هذه الحالة بالضبط — وقد أثبتُّ سقوطه:
`أيام مُتتبَّعة = 5 (متوقَّع 4)`.

### اختبار العقد — 63 اختباراً

`src/test/employeeDashboardContract.test.ts`

---

## ★ أثر جانبي: القيد كسر اختبارين سابقين

بعد إضافة `uq_employee_per_user_tenant` سقط اختبارا `0333` و`0334`:

```
ERROR: duplicate key value violates unique constraint "uq_employee_per_user_tenant"
```

**وهذا دليل أن القيد نافذ.** كانا يُدرجان سجلّ موظف يدوياً بعد أن
أنشأه محفّز `0317` تلقائياً. أُصلحا ليلتقطا ما أنشأه المحفّز — **وهذا
ما يحدث في الإنتاج فعلاً**، فصار الاختباران أقرب للواقع لا أبعد.

---

## الحالة بعد الجولة

```
264 مايجريشن من الصفر · صفر فشل

verify-employee-dashboard-0335.sql     38 تأكيداً
verify-unified-hr-engine-0334.sql      52 تأكيداً
verify-cv-and-attendance-0333.sql      52 تأكيداً
verify-tech-exports-0332.sql           78 تأكيداً

سبعة سكربتات RLS حقيقي — كلّها تنجح:
  0334: 16/16 · 0332: 16/16 · 0330: 11/11 · 0328: 17/17
  0324:  5/5  · 0326:  8/8  · 0329: 10/10

2934/2934 اختباراً في 130 ملفاً
tsc EXIT=0 · build ✅ · contract-check PASS · 0 خطأ lint
```

---

## ما تبقّى في المرحلة 2

| الصفحة | أسطر | الحالة |
|---|---|---|
| ~~`EmployeeDashboard`~~ | 566 | ✅ هذه الجولة |
| `ProfilePage` | 623 | التالي — السيرة الذاتية تعمل بعد `0333` |
| `MyAttendancePage` | 551 | حضوري وانصرافي |
| `LeaveRequestPage` | 653 | ينتظر فصل الشاشات (المرحلة 3) |
| `SOPsPage` | 870 | الأكبر · placeholder · يلمس Supabase |
| `AttendancePage` | 383 | يلمس Supabase (5 جداول) |
| `NewProblemPage` · `ProblemsList` | 1035 | ينتظران المرحلة 3 |
