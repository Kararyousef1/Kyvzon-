# 0374 — إغلاق إنشاء طلب HR والعافية اليومية

**التاريخ:** 2026-08-14
**السياق:** المستخدم أكد أن migrations حتى `0373` مطبقة. هذه أول جولة جديدة لإكمال المرحلتين 5 و6.

## ما أُغلق

### 1. `ContactPage` لم تعد تكتب نسختين منفصلتين

قبل الجولة كانت الصفحة تنفذ عمليتين:

1. إنشاء `hr_cases`.
2. إنشاء `hr_messages` بلا `case_id`.

النتيجة المحتملة: حالة بلا رسالة، أو رسالتان/حالتان تتباعدان، والرد الفعلي لا يظهر للموظف.

أضافت migration `0374_employee_hr_integration_closure.sql` الدالة:

```text
employee_hr_case_submit(case_type, subject, description, priority)
```

خصائصها:

- عملية ذرية واحدة؛ فشل إدراج الرسالة يعيد إنشاء الحالة أيضاً.
- لا تستقبل `tenant_id` أو `employee_id` من المتصفح.
- تشتق المستأجر والموظف والمرسل من جلسة المستخدم.
- تحرس تفعيل وحدة HR.
- تنشئ الرسالة مع `case_id` الصحيح.

نُقلت `ContactPage` إلى `hrCaseService.submitCase()` وأزيلت `MessageService` القديمة بعد ثبوت عدم وجود مستورد آخر لها.

### 2. رد HR صار يصل نصاً لا حالة فقط

أُعيد تعريف `hr_message_reply()` كي:

- يحدّث الرسالة.
- يحدّث حالة `hr_cases` المرتبطة.
- يضيف الرد كنص عام في `hr_case_comments`.

تعليقات الحالات أصبحت append-only:

- سياسة INSERT مستقلة.
- سحب UPDATE/DELETE من `authenticated`.
- Trigger يمنع تعديل أو حذف أي تعليق.

`ContactPage` تحمل آخر رد عام لأول ثماني حالات معروضة وتعرضه تحت الطلب.

### 3. إصلاح مخطط العافية الحقيقي

كانت `WellnessService` وأنواع SDK تستعمل أعمدة غير موجودة:

```text
mood_score · stress_level · energy_level
```

بينما المخطط الحقيقي:

```text
score · mood · stress · energy
```

تم:

- توحيد الخدمتين في `wellnessEntryService` واحدة.
- تصحيح `WellnessEntryRecord` و`shared/types/database.ts`.
- استخدام `employees.id` عبر `useEmployeeId()` بدلاً من `profiles.id`.
- حساب المتوسط والاتجاه من `score`.
- جعل حفظ اليوم update-or-create بدلاً من الاصطدام بقيد `unique_employee_date`.
- إصلاح `EmployeeDashboard` وhook القديم للوحة HR لقراءة `score`.

### 4. إغلاق عودة `any`

أُزيلت جميع مواضع `any` الثلاثة عشر التي وجدها ماسح البوابتين من:

- `EmployeeDashboard`
- `MyLoansPage`
- `TrainingPage`
- `HRDashboard`
- `PayrollPage`
- `WellnessPage`

وأصبح سقف `ANY` في `portalScanContract` مساوياً للصفر.

## القياس بعد الجولة

```text
SUPABASE direct       0
ANY                   0
CONSOLE              34
SILENT_CATCH         13
EMPTY_FALLBACK        5
NO_LIMIT              3
HARDCODED_DATE        3
```

انخفض دين المرحلة السادسة من 73 إلى **58** موضعاً، وأُغلقت المرحلة 1 مجدداً وفق معيارها الأصلي (`any = 0`).

## التحقق

- TypeScript موجه لكل الخدمات والصفحات المعدلة: PASS.
- الاختبارات الكاملة: **168/168 ملفاً و5018/5018 اختباراً**.
- `portalHygieneContract` و`portalScanContract`: PASS مع `ANY: 0`.
- Build: PASS؛ تحذير حجم chunk فقط.
- Lint quiet: PASS، صفر أخطاء.
- `npm run db:contract-check`: PASS، 303 migrations canonical.
- `npm run sdk:boundary-check`: PASS، allowlist = 0.
- `git diff --check`: PASS.

## ما يلزم تشغيلياً

`0374_employee_hr_integration_closure.sql` migration جديدة بعد تأكيد تطبيق كل السابق. يجب دفعها إلى Supabase ثم اختبار السيناريو:

1. الموظف ينشئ طلب HR.
2. يظهر في صندوق HR مرتبطاً بالحالة.
3. HR ترد.
4. الموظف يرى نص الرد تحت طلبه.
5. تحديث تسجيل العافية لليوم نفسه لا ينشئ صفاً مكرراً.

## الخطوة التالية في الخطة

إكمال محرك الاعتمادات:

- نقل المستهلكين المتبقين من `hr_approval_steps`.
- معالجة الطلبات اليتيمة.
- تقرير حذف الجدول القديم بعد إثبات عدم وجود قارئ/كاتب حي.
