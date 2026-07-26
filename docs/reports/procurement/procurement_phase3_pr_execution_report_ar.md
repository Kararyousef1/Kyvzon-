# تقرير تنفيذ Phase 3 — بداية إصلاح PR + Approval Workflow

**التاريخ:** 2026-07-26  
**النطاق:** إكمال أول جزء وظيفي من وحدة طلب الشراء PR بعد إغلاق P0 الأمني الأساسي.

---

## الخلاصة

تم الانتقال من الإصلاح الأمني إلى تحسين وحدة طلب الشراء نفسها. التغيير الأهم هو أن طلب الشراء لم يعد مجرد نموذج بسيط يحتوي مبرر وبنود فقط؛ أصبح يدعم حقولاً تشغيلية مهمة مثل القسم، مركز التكلفة، تاريخ الحاجة، نوع الطلب، سبب الطوارئ، المورد المقترح، UNSPSC، وصفحة تفاصيل حقيقية بدلاً من placeholder.

كذلك تم تمكين محرك قواعد الموافقات في قاعدة البيانات بحيث يستخدم جدول:

```sql
procurement_approval_rules
```

بدلاً من تجاهله.

---

## 1) Migration جديدة لمحرك قواعد الموافقات

تم إنشاء:

```text
supabase/migrations/0192_procurement_approval_rules_engine.sql
```

### ماذا تفعل؟

تعيد تعريف:

```sql
public.resolve_procurement_approval_chain(uuid, numeric)
```

بحيث:

1. تتحقق من أن القسم تابع لنفس tenant.
2. تحل أدوار القسم مع الوراثة:
   - supervisor
   - manager
   - direct_manager
   - procurement_manager
3. تبحث عن قواعد فعالة في:

```sql
public.procurement_approval_rules
```

حسب:

- tenant
- amount
- department exact أو قواعد عامة `department_id IS NULL`
- level
- required_role

4. إذا وجدت قواعد، تستخدمها لبناء سلسلة الموافقة.
5. إذا لم توجد قواعد، ترجع إلى fallback افتراضي:

```text
supervisor/direct_manager/manager → procurement → finance → admin
```

مع حدود مالية تقريبية.

---

## 2) إضافة CostCenterService

تم إنشاء:

```text
src/services/sdk/CostCenterService.ts
```

ويحتوي على:

```ts
costCenterService.findActive()
```

ثم تم تصديره من:

```text
src/services/sdk/index.ts
```

الهدف: عدم استخدام `supabase.from('cost_centers')` مباشرة في الصفحة، والالتزام بحدود SDK.

---

## 3) تحسين PurchaseRequisitionService

تم تعديل:

```text
src/services/sdk/Procurement/PurchaseRequisitionService.ts
```

### إضافات مهمة

#### في البنود

أضيف دعم:

- `unspsc_code`
- `suggested_supplier_id`
- `item_code`
- `unit`
- `notes`

#### في Header الطلب

أضيف دعم:

- `emergency_reason`
- `source`

كما تم التخلص من استخدام cast غير واضح مثل:

```ts
(input as any).emergency_reason
```

واستبداله بحقول typed.

---

## 4) بناء صفحة تفاصيل PR حقيقية

تمت إعادة بناء:

```text
src/pages/app/procurement/requisitions/RequisitionDetailPage.tsx
```

كانت سابقاً placeholder، والآن تعرض:

### Header

- رقم PR
- الحالة
- الأولوية
- المبرر
- الإجمالي التقديري
- حالة الميزانية
- نوع الطلب
- تاريخ الحاجة

### البنود

جدول كامل يعرض:

- item_code
- description
- quantity
- unit
- estimated_unit_price
- estimated_total
- UNSPSC

### الموافقات

تعرض مراحل الموافقة المتاحة:

- level
- role_required
- approver_id
- decision
- comments

### المرفقات

تعرض الملفات إن وجدت.

### قرارات الموافقة

إذا الطلب `pending_approval` تظهر أزرار:

- موافقة
- رفض

مع استدعاء SDK:

```ts
prApprovalService.approve(...)
```

---

## 5) تحسين صفحة قائمة وإنشاء PR

تمت إعادة بناء:

```text
src/pages/app/procurement/requisitions/RequisitionListPage.tsx
```

### النموذج الآن يدعم

#### Header

- department_id
- cost_center_id
- needed_by_date
- currency_code
- request_type
- priority
- emergency_reason إذا priority = emergency
- justification

#### البنود

كل بند يدعم:

- item_code
- description
- quantity
- unit
- estimated_unit_price
- suggested_supplier_id
- unspsc_code
- notes

### Lookup data

الصفحة تجلب عبر SDK:

- الأقسام من `departmentService.findActive()`
- مراكز التكلفة من `costCenterService.findActive()`
- الموردين المعتمدين من `supplierService.findApproved()`

### تحسين القائمة

تمت إضافة:

- badge لحالة الميزانية
- زر تفاصيل ينقل إلى صفحة PR detail
- أزرار موافقة/رفض مباشرة للطلبات المعلقة

---

## 6) تحديث اختبار Security Contract

تم تعديل:

```text
src/test/procurement/procurementSecurityContract.test.ts
```

وأضيف فحص أن migration `0192`:

- موجودة.
- تستخدم `procurement_approval_rules`.
- تدعم `direct_manager`.

---

## 7) نتائج التحقق

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
| `npm run test:run` | نجح — 39 ملفات / 403 اختبار |
| `npm run build` | نجح |
| `npm run lint` | 0 errors، مع 1363 warning موجودة/متراكمة |

---

## 8) ملفات جديدة في هذه الدفعة

```text
supabase/migrations/0192_procurement_approval_rules_engine.sql
src/services/sdk/CostCenterService.ts
procurement_phase3_pr_execution_report_ar.md
```

## 9) ملفات معدلة في هذه الدفعة

```text
src/services/sdk/index.ts
src/services/sdk/Procurement/PurchaseRequisitionService.ts
src/pages/app/procurement/requisitions/RequisitionDetailPage.tsx
src/pages/app/procurement/requisitions/RequisitionListPage.tsx
src/test/procurement/procurementSecurityContract.test.ts
```

---

## 10) ما الذي أصبح أفضل الآن؟

قبل هذه الدفعة:

- تفاصيل PR كانت placeholder.
- نموذج PR كان بدائياً جداً.
- `procurement_approval_rules` موجودة لكنها غير مستخدمة فعلياً.
- لا يوجد ربط واضح بين PR والـ cost center/supplier/UNSPSC من الواجهة.

بعد هذه الدفعة:

- يوجد نموذج PR أقرب للتوثيق.
- توجد صفحة تفاصيل PR فعلية.
- الموافقات تظهر في صفحة التفاصيل.
- قواعد الموافقات أصبحت جزءاً من محرك إنشاء السلسلة.
- الواجهة بقيت داخل حدود SDK.

---

## 11) النواقص المتبقية في وحدة PR

ما زال مطلوباً:

1. رفع مرفقات فعلي من صفحة PR.
2. سجل تدقيق immutable لكل تغيير.
3. تعليقات ومراجعات `revision_required`.
4. إشعارات للمعتمدين.
5. صفحة إدارة قواعد الموافقات للمشتريات بصورة أوسع من صفحة الأدمن الحالية.
6. دعم توليد PR من reorder points/MRP.
7. توسيع budget check ليشمل فئة/مشروع/CAPEX وليس cost center فقط.

---

## 12) الخطوة التالية المقترحة

الانتقال إلى:

```text
Phase 4 — Supplier Onboarding + Supplier Detail
```

أول مهامها:

1. تحويل `SupplierDetailPage.tsx` من placeholder إلى تبويبات فعلية.
2. عرض وثائق المورد.
3. عرض جهات الاتصال.
4. عرض تقييم المخاطر.
5. عرض زيارات ميدانية.
6. إضافة أزرار حساب Kraljic وتنبيه الوثائق.

أو بدلاً من ذلك يمكن استكمال PR أولاً بإضافة attachments/audit/comments.
