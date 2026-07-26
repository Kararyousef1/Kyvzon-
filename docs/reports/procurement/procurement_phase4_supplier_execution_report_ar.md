# تقرير تنفيذ Phase 4 — Supplier Onboarding وفق التوثيق

**التاريخ:** 2026-07-26  
**الوحدة:** الوحدة الثالثة — تأهيل الموردين وإلحاقهم  
**التوثيق المقروء أولاً:**

```text
docs/e-procurement/03-supplier-onboarding-qualification.md
```

---

## 1) قاعدة العمل التي تم اتباعها

قبل تنفيذ أي تعديل قرأت توثيق الوحدة الثالثة، واستخرجت منه المتطلبات التالية:

| بند من التوثيق | المطلوب |
|---|---|
| طلب التسجيل | مورد يمكن إدخاله/تأهيله ومتابعة حالته |
| جمع المعلومات | بيانات قانونية، تجارية، مالية، تشغيلية، بنكية، ائتمانية |
| التحقق من الوثائق | وثائق بصلاحية وحالة تحقق وتنبيهات 90/30/0 |
| تقييم المخاطر | 5 أبعاد، مجموع 0-100، risk level |
| زيارة ميدانية | نقاط قوة/ضعف/شروط/توصية |
| الموافقة والتفعيل | قرار approve/reject/suspend حسب المخاطر |
| بوابة الموردين الذاتية | أساس بيانات ودعوات موجود، لكن البوابة العامة الكاملة ما زالت مرحلة لاحقة |
| Kraljic Matrix | حساب التصنيف والتوصية الاستراتيجية |
| Audit trail | سجل تدقيق لكل تغيير مهم |
| KPIs | مؤشرات تأهيل الموردين |

---

## 2) Migration جديدة لإكمال أساس Supplier Onboarding

تم إنشاء:

```text
supabase/migrations/0193_procurement_supplier_onboarding_completion.sql
```

### ما أضافته migration؟

#### 2.1 حقول إضافية على جدول suppliers

أضيفت حقول مطلوبة من التوثيق:

- `email`
- `phone`
- `operating_country`
- `ownership_structure`
- `authorized_signatories`
- `warehouses`
- `quality_facilities`
- `credit_rating`
- `bcp_summary`
- `sanctions_checked`
- `conflict_checked`
- `last_qualification_at`
- `qualification_notes`

هذه تغطي أجزاء من:

- البيانات القانونية والتجارية
- البيانات المالية
- البيانات التشغيلية والفنية
- الامتثال وتضارب المصالح

---

#### 2.2 نماذج التأهيل القابلة للتخصيص

أضيفت الجداول:

```sql
supplier_qualification_forms
supplier_qualification_responses
```

الهدف منها دعم متطلب التوثيق:

> نماذج التأهيل قابلة للتخصيص حسب نوع المورد وفئة الشراء.

---

#### 2.3 سجل تدقيق الموردين

أضيف جدول:

```sql
supplier_audit_log
```

مع trigger على جدول `suppliers`:

```sql
trg_suppliers_audit
```

الهدف:

> كل تغيير في بيانات المورد مسجل مع الشخص والوقت.

---

#### 2.4 دوال جديدة

أضيفت:

```sql
log_supplier_audit(...)
sync_supplier_risk_from_assessment(uuid)
decide_supplier_qualification(uuid,text,text)
```

##### `sync_supplier_risk_from_assessment`

تأخذ آخر تقييم مخاطر وتحدث:

- `suppliers.risk_score`
- `suppliers.risk_level`

##### `decide_supplier_qualification`

تطبق workflow أولي للموافقة/الرفض/التجميد:

- `approve`
- `reject`
- `suspend`
- `reactivate`
- `under_review`

وتأخذ المخاطر بالحسبان:

- المورد عالي/حرج المخاطر يحتاج admin للموافقة.
- تحديث `supplier_type` إلى `approved` أو `strategic` أو `blocked` حسب القرار والمخاطر.

---

#### 2.5 KPI View

أضيفت view:

```sql
supplier_onboarding_kpis
```

تعرض:

- إجمالي الموردين
- المعتمدين
- المرفوضين
- المجمدين
- نسبة الاعتماد
- موردين لديهم وثائق منتهية
- الموردين عاليي المخاطر

---

## 3) تحديث SDK الخاص بالموردين

تم تعديل:

```text
src/services/sdk/Procurement/SupplierService.ts
```

### إضافات على `SupplierRecord`

أضيفت الحقول الجديدة مثل:

- `email`
- `phone`
- `operating_country`
- `credit_rating`
- `bcp_summary`
- `sanctions_checked`
- `conflict_checked`
- `last_qualification_at`
- `qualification_notes`

### دوال جديدة

أضيفت:

```ts
supplierService.decideQualification(...)
supplierRiskAssessmentService.syncToSupplier(...)
supplierAuditLogService.findBySupplier(...)
supplierQualificationFormService.findActive()
```

### تصدير جديد من SDK index

تم تحديث:

```text
src/services/sdk/index.ts
```

لتصدير:

- `supplierAuditLogService`
- `supplierQualificationFormService`
- أنواع audit/form الجديدة

---

## 4) تحويل صفحة تفاصيل المورد من Placeholder إلى صفحة فعلية

تمت إعادة بناء:

```text
src/pages/app/procurement/suppliers/SupplierDetailPage.tsx
```

كانت سابقاً placeholder، والآن تحتوي تبويبات فعلية:

### 4.1 تبويب المعلومات

يعرض/يعدل:

- الاسم القانوني والتجاري
- البريد والهاتف
- السجل والرقم الضريبي
- الدولة وبلد التشغيل والمدينة
- البنك، IBAN، SWIFT
- شروط الدفع
- حد الائتمان
- التصنيف الائتماني
- عدد الموظفين
- الطاقة القصوى
- Lead time
- BCP
- فحص العقوبات
- فحص تضارب المصالح

### 4.2 تبويب الوثائق

يدعم:

- عرض الوثائق
- نوع الوثيقة
- تاريخ الانتهاء
- حالة التحقق
- تنبيه حسب الأيام المتبقية
- إضافة وثيقة جديدة برابط ملف

### 4.3 تبويب جهات الاتصال

يدعم:

- عرض جهات الاتصال
- إضافة جهة اتصال
- تحديد جهة الاتصال الأساسية

### 4.4 تبويب المخاطر

يدعم تقييم 5 أبعاد:

- financial
- compliance
- operational
- quality
- security

ثم يحفظ التقييم ويزامنه مع المورد.

### 4.5 تبويب الزيارات الميدانية

يدعم:

- عرض الزيارات
- إضافة زيارة ميدانية
- نقاط القوة
- نقاط الضعف
- شروط الموافقة
- التوصية النهائية

### 4.6 تبويب Kraljic

يدعم:

- عرض التصنيف الحالي
- حساب التصنيف عبر:

```ts
supplierService.calculateKraljic(...)
```

- عرض التوصيات الاستراتيجية من التوثيق.

### 4.7 تبويب Audit

يعرض سجل التدقيق من:

```ts
supplierAuditLogService.findBySupplier(...)
```

---

## 5) تحسين صفحة قائمة الموردين

تم تعديل:

```text
src/pages/app/procurement/suppliers/SuppliersPage.tsx
```

وتم إضافة زر:

```text
فتح ملف المورد
```

يربط إلى:

```text
/app/procurement/suppliers/:id
```

---

## 6) تحديث Post Migration Checks

تم تعديل:

```text
scripts/tests/99_post_migration_checks.sql
```

وأصبح فحص وحدة الموردين يتأكد أيضاً من:

- `supplier_audit_log`
- `supplier_qualification_forms`
- `decide_supplier_qualification(uuid,text,text)`

---

## 7) تحديث الاختبارات

تم تعديل:

```text
src/test/procurement/procurementSecurityContract.test.ts
```

وأضيف فحص migration `0193`:

- `supplier_audit_log`
- `supplier_qualification_forms`
- `decide_supplier_qualification`
- `supplier_onboarding_kpis`

---

## 8) نتائج التحقق

تم تشغيل:

```bash
npm run type-check
npm run db:contract-check
npm run sdk:boundary-check
npm run test:run
npm run build
npm run lint
```

النتائج:

| الأمر | النتيجة |
|---|---|
| `npm run type-check` | نجح |
| `npm run db:contract-check` | نجح |
| `npm run sdk:boundary-check` | نجح |
| `npm run test:run` | نجح — 39 ملفات / 404 اختبار |
| `npm run build` | نجح |
| `npm run lint` | 0 errors، مع warnings متراكمة |

---

## 9) مدى مطابقة وحدة الموردين للتوثيق بعد هذه الدفعة

| متطلب التوثيق | الحالة بعد التنفيذ |
|---|---|
| جمع البيانات القانونية | موجود في DB والواجهة |
| جمع البيانات المالية | موجود في DB والواجهة |
| جمع البيانات التشغيلية | موجود جزئياً في DB والواجهة |
| الوثائق وتواريخ الانتهاء | موجود |
| تنبيهات 90/30/0 | موجودة كعرض في الصفحة + cron سابق |
| تقييم المخاطر 5 أبعاد | موجود |
| sync risk إلى supplier | موجود |
| الزيارة الميدانية | موجودة |
| الموافقة/الرفض/التجميد | موجود عبر RPC |
| Kraljic | موجود مع زر حساب وتوصيات |
| سجل التدقيق | موجود |
| KPIs | موجودة كـ view |
| نماذج تأهيل مخصصة | جداول موجودة، واجهة إدارتها ليست كاملة بعد |
| بوابة المورد الذاتية الكاملة | غير مكتملة بعد، ما زالت مرحلة لاحقة |
| رفع ملفات فعلي إلى Storage | غير مكتمل؛ حالياً يتم إدخال رابط ملف |
| إشعارات بريدية فعلية لكل تنبيه | موجودة جزئياً عبر cron/Edge، تحتاج استكمال templates وإرسال فعلي |

---

## 10) النواقص المتبقية في الوحدة الثالثة

للوصول إلى اكتمال 100% حسب التوثيق، ما زال مطلوباً:

1. بناء بوابة المورد العامة:
   ```text
   /supplier-portal/:token
   ```
2. بناء Edge Function للتحقق من token بشكل آمن واستقبال بيانات المورد.
3. رفع ملفات فعلي إلى Supabase Storage بدلاً من إدخال URL.
4. واجهة إدارة نماذج التأهيل المخصصة.
5. إرسال إشعارات بريدية فعلية للمورد عند 90/30/0 يوم.
6. ربط الموردين ببوابة RFQ لاحقاً لتقديم العروض مباشرة.
7. ربط الموردين بـ PO/Invoices لاحقاً لعرض الأوامر والفواتير.

---

## 11) الخطوة التالية المقترحة

لإكمال الوحدة الثالثة بالكامل قبل الانتقال لوحدة أخرى، الخطوة التالية هي:

```text
Phase 4.2 — Supplier Self-Service Portal
```

وسأبدأ فيها بقراءة نفس التوثيق مرة أخرى حول قسم بوابة الموردين، ثم تنفيذ:

- route عام `/supplier-portal/:token`
- Edge Function verify/register/update
- نموذج self-service للمورد
- رفع الوثائق أو على الأقل storage integration أولي

إذا أردت الانتقال للترتيب حسب الوحدات، نكمل الوحدة الثالثة حتى إغلاقها قبل RFx.
