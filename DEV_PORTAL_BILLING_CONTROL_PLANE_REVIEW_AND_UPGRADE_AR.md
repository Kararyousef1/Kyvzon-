# تقرير مراجعة وتطوير بوابة المطور — SaaS Billing Control Plane

تاريخ التنفيذ: 2026-07-16

## الهدف

بناءً على الملاحظة المهمة أن بوابة المطور غير مكتملة تجاريًا عند إضافة شركة جديدة، تم تنفيذ مراجعة وتطوير فعلي لتحويل جزء الشركات والاشتراكات إلى Control Plane أكثر احترافية لإدارة:

- بيانات الشركة.
- تفاصيل الاشتراك.
- السعر المخصص.
- طريقة الدفع.
- حالة الدفع.
- دورة الفوترة.
- رقم الفاتورة.
- رقم العقد.
- تاريخ الاستحقاق.
- حدود الخطة.
- البوابات المفعلة.
- سجل الاشتراكات/الدفعات.

---

## المشاكل التي كانت موجودة

### 1. نموذج إضافة الشركة كان بسيطًا جدًا

قبل التعديل كان يحتوي على:

- اسم الشركة.
- Slug.
- جهة الاتصال.
- البريد والهاتف.
- الخطة.
- الحد الأقصى للموظفين.
- البوابات.
- ملاحظات.

لكن لم يكن يحتوي على:

- السعر الفعلي للاشتراك.
- السعر المخصص للـ Custom Plan.
- العملة.
- طريقة الدفع.
- حالة الدفع.
- دورة الفوترة.
- رقم الفاتورة.
- رقم العقد.
- تاريخ بداية ونهاية الاشتراك.
- تاريخ استحقاق الدفع.
- مسؤول المبيعات.
- حدود الفروع/أجهزة البصمة/التخزين.

### 2. صفحة الاشتراكات كانت قراءة أكثر من إدارة

كانت تعرض تفاصيل محدودة، ولا يوجد زر لإضافة اشتراك/دفعة/تجديد جديد للشركة.

### 3. نموذج البيانات ناقص تجاريًا

جدول `tenant_subscriptions` كان يحتوي فقط على:

```sql
amount
currency
payment_method
payment_reference
```

وهذا غير كافٍ لمنصة SaaS تجارية.

---

## ما تم تنفيذه

## 1. إضافة Migration جديد للفوترة والاشتراكات

تم إنشاء:

```text
supabase/migrations/0026_subscription_billing_control_plane.sql
```

ويضيف إلى جدول:

```text
tenant_subscriptions
```

الحقول التالية:

```sql
billing_cycle
payment_status
payment_due_date
paid_at
base_amount
discount_amount
tax_amount
total_amount
invoice_number
contract_number
sales_owner
gateway_provider
billing_contact_name
billing_email
billing_phone
auto_renew
grace_period_days
max_branches
max_biometric_devices
storage_gb
custom_limits
metadata
updated_at
```

مع فهارس مهمة:

```sql
idx_tenant_subscriptions_billing_status
idx_tenant_subscriptions_invoice
```

---

## 2. تطوير نموذج إضافة/تعديل الشركة

تم تعديل:

```text
src/pages/devportal/pages/CompaniesPage.tsx
```

وأصبح نموذج الشركة يحتوي الآن على قسم احترافي باسم:

```text
تفاصيل الاشتراك والفوترة
```

ويشمل:

- حالة الاشتراك:
  - تجريبي
  - نشط
  - فترة سماح
  - منتهي
  - ملغي

- دورة الفوترة:
  - شهري
  - ربع سنوي
  - نصف سنوي
  - سنوي
  - دفعة واحدة
  - مخصص

- سعر الاشتراك.
- العملة:
  - IQD
  - USD
  - SAR
  - AED

- طريقة الدفع:
  - نقدي
  - تحويل مصرفي
  - بطاقة
  - زين كاش
  - آسيا حوالة
  - Stripe
  - فاتورة يدوية
  - أخرى

- حالة الدفع:
  - غير مدفوع
  - قيد المعالجة
  - مدفوع
  - متأخر
  - فشل الدفع
  - مسترجع
  - ملغي

- بداية الاشتراك.
- نهاية الاشتراك.
- تاريخ الاستحقاق.
- رقم الفاتورة.
- رقم العقد.
- مسؤول المبيعات.
- مرجع الدفع / رقم العملية.
- التجديد التلقائي.

كما تمت إضافة قسم:

```text
حدود الخطة التجارية
```

ويشمل:

- عدد الموظفين.
- عدد الفروع.
- عدد أجهزة البصمة.
- التخزين بالـ GB.

---

## 3. عرض المعلومات التجارية في جدول الشركات

أصبحت صفحة الشركات تعرض بجانب الخطة:

- السعر الفعلي.
- العملة.

بدل الاعتماد على سعر ثابت فقط.

---

## 4. تطوير نافذة تفاصيل الشركة

تمت إضافة تفاصيل احترافية داخل نافذة عرض الشركة:

- السعر.
- دورة الفوترة.
- طريقة الدفع.
- حالة الدفع.
- رقم الفاتورة.
- رقم العقد.

---

## 5. تطوير صفحة الاشتراكات

تم تعديل:

```text
src/pages/devportal/pages/SubscriptionsPage.tsx
```

وتمت إضافة زر:

```text
إضافة اشتراك / دفعة
```

عند اختيار شركة، يمكن الآن إضافة سجل اشتراك أو تجديد جديد يحتوي على:

- الخطة.
- حالة الاشتراك.
- دورة الفوترة.
- حالة الدفع.
- بداية الاشتراك.
- نهاية الاشتراك.
- تاريخ الاستحقاق.
- طريقة الدفع.
- المبلغ.
- الخصم.
- الضريبة.
- الإجمالي.
- العملة.
- رقم الفاتورة.
- رقم العقد.
- مسؤول المبيعات.
- مرجع الدفع.
- حدود الموظفين والفروع وأجهزة البصمة والتخزين.
- ملاحظات تجارية.

كما أصبح سجل الاشتراكات يعرض:

- إجمالي الاشتراك.
- طريقة الدفع.
- حالة الدفع.
- رقم الفاتورة.
- رقم العقد.

---

## 6. تحديث خدمة TenantService

تم تعديل:

```text
src/services/sdk/TenantService.ts
```

ليدعم:

- إنشاء شركة مع بيانات فوترة كاملة.
- إنشاء سجل اشتراك تلقائي عند إضافة شركة جديدة.
- حفظ ملخص بيانات الفوترة في:

```text
tenants.settings.billing
```

- إضافة سجل اشتراك مفصل في:

```text
tenant_subscriptions
```

- تحديث Snapshot الشركة عند إضافة اشتراك جديد.

---

## 7. تحديث الأنواع TypeScript

تم تعديل:

```text
src/pages/devportal/types/index.ts
```

وإضافة أنواع واضحة:

```ts
BillingCycle
PaymentStatus
PaymentMethod
```

وتوسيع نوع:

```ts
Subscription
```

ليشمل حقول الفوترة الجديدة.

---

## الملفات المعدلة

```text
src/pages/devportal/pages/CompaniesPage.tsx
src/pages/devportal/pages/SubscriptionsPage.tsx
src/pages/devportal/types/index.ts
src/services/sdk/TenantService.ts
supabase/migrations/0026_subscription_billing_control_plane.sql
```

---

## التحقق الفني

تم تشغيل:

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

تفاصيل DB contract:

```text
Canonical migrations: 27
Literal table references: 35
Canonical tables: 100
Canonical views: 2
DB contract check: PASS
```

---

## خطوة ضرورية للتشغيل على Supabase الحقيقي

لأننا أضفنا migration جديدًا، يجب تطبيقه على قاعدة البيانات الحقيقية:

```powershell
cd E:\-Al-Rafidain
npx supabase db push
```

أو:

```powershell
supabase db push
```

بدون تطبيق migration، ستظهر أخطاء عند إنشاء اشتراك لأن قاعدة البيانات الحقيقية لن تعرف الحقول الجديدة مثل:

```text
billing_cycle
payment_status
invoice_number
contract_number
```

---

## ملاحظات معمارية

بوابة المطور الآن أصبحت أقرب إلى SaaS Control Plane حقيقي، لكنها ما زالت يمكن أن تتوسع لاحقًا بإضافات مثل:

1. صفحة فواتير مستقلة Invoices.
2. صفحة مدفوعات Payments.
3. تنبيهات قرب انتهاء الاشتراك.
4. تنبيهات تأخر الدفع.
5. بوابة دفع إلكتروني حقيقية.
6. ربط آلي بين حالة الدفع وتفعيل/تعليق البوابات.
7. سجل تعديلات تجاري لكل اشتراك.

لكن المرحلة الحالية عالجت النقص الأساسي الذي ذكرته: إضافة السعر المخصص، طرق الدفع، حالة الدفع، دورة الفوترة، والفواتير والعقود داخل بوابة المطور.
