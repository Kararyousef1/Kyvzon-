# تقرير تنفيذ إكمال الوحدة الأولى — PR + Approval Workflow

**التاريخ:** 2026-07-26  
**الوحدة:** الوحدة الأولى — طلب الشراء وسير الموافقات  
**التوثيق المعتمد:**

```text
docs/e-procurement/01-purchase-requisition-approval.md
```

---

## ما تم تنفيذه

### 1) Migration جديدة لإكمال وحدة PR

تم إنشاء:

```text
supabase/migrations/0196_procurement_pr_completion.sql
```

وتضيف:

- حالات PR الناقصة من التوثيق:
  - `submitted`
  - `under_review`
  - `revision_required`

- جدول سجل تدقيق:
  ```sql
  pr_audit_log
  ```

- جدول التعليقات:
  ```sql
  pr_comments
  ```

- دوال:
  ```sql
  log_pr_audit(...)
  add_pr_comment(...)
  request_pr_revision(...)
  cancel_pr(...)
  generate_reorder_point_prs()
  ```

- View مؤشرات أداء:
  ```sql
  pr_kpis
  ```

---

### 2) تحسين سير الموافقات

تمت إعادة تعريف:

```sql
approve_procurement_step(uuid,text,text)
```

لتسجل audit عند الموافقة أو الرفض، وتحدث الحالة إلى:

- `under_review` إذا بقيت مراحل موافقة.
- `approved` إذا انتهت كل المراحل.
- `rejected` عند الرفض.

---

### 3) دعم طلب التعديل Revision Required

تمت إضافة:

```sql
request_pr_revision(pr_id, reason)
```

وتقوم بـ:

- تغيير حالة PR إلى `revision_required`.
- إضافة تعليق بالسبب.
- تسجيل audit.

---

### 4) دعم الإلغاء

تمت إضافة:

```sql
cancel_pr(pr_id, reason)
```

وتسمح بالإلغاء قبل الاعتماد النهائي، مع تسجيل audit.

---

### 5) دعم توليد PR من نقاط إعادة الطلب / MRP مبسط

تمت إضافة:

```sql
generate_reorder_point_prs()
```

تقرأ من:

```sql
procurement_reorder_points
```

وتولد PR تلقائياً إذا:

```text
current_stock <= reorder_point
```

ثم تحدث `last_generated_at` وتسجل audit.

---

### 6) تحديث SDK

تم تعديل:

```text
src/services/sdk/Procurement/PurchaseRequisitionService.ts
```

وأضيف:

- `PrAuditLogRecord`
- `PrCommentRecord`
- `prAuditLogService`
- `prCommentService`
- `purchaseRequisitionService.requestRevision()`
- `purchaseRequisitionService.cancel()`
- `purchaseRequisitionService.generateFromReorderPoints()`

وتم تصديرها من:

```text
src/services/sdk/index.ts
```

---

### 7) تحديث صفحة تفاصيل PR

تم تعديل:

```text
src/pages/app/procurement/requisitions/RequisitionDetailPage.tsx
```

وأضيف:

- عرض سجل التدقيق.
- عرض التعليقات.
- إضافة تعليق.
- طلب تعديل.
- إلغاء الطلب.
- إضافة مرفق برابط.

---

### 8) تحديث قائمة PR

تم تعديل:

```text
src/pages/app/procurement/requisitions/RequisitionListPage.tsx
```

وأضيف:

- زر توليد PR من ROP/MRP.
- دعم ألوان الحالات الجديدة.

---

### 9) تحديث الاختبارات والفحوصات

تم تعديل:

```text
src/test/procurement/procurementSecurityContract.test.ts
scripts/tests/99_post_migration_checks.sql
```

للتأكد من:

- وجود `pr_audit_log`.
- وجود `pr_comments`.
- وجود `request_pr_revision`.
- وجود `generate_reorder_point_prs`.
- وجود `pr_kpis`.

---

## نتائج التحقق

تم تشغيل:

```bash
npm run type-check
npm run db:contract-check
npm run sdk:boundary-check
npm run test:run
npm run build
```

النتائج:

| الأمر | النتيجة |
|---|---|
| `npm run type-check` | نجح |
| `npm run db:contract-check` | نجح |
| `npm run sdk:boundary-check` | نجح |
| `npm run test:run` | نجح — 39 ملفات / 408 اختبار |
| `npm run build` | نجح مع تحذير chunk size |

---

## حالة الوحدة الأولى مقابل التوثيق

| متطلب التوثيق | الحالة |
|---|---|
| نموذج PR ذكي | موجود كأساس جيد |
| حقول القسم/مركز التكلفة/تاريخ الحاجة/النوع/الأولوية | موجودة |
| البنود والمورد المقترح وUNSPSC | موجودة |
| المرفقات | موجودة كرابط، ورفع مباشر يمكن تحسينه لاحقاً |
| فحص الميزانية | موجود |
| سير موافقات مرن | موجود مع قواعد approval rules من 0192 |
| حالات Submitted/Under Review/Revision Required | موجودة |
| طلب تعديل | موجود |
| إلغاء الطلب | موجود |
| سجل التدقيق | موجود |
| التعليقات | موجودة |
| توليد من ROP/MRP | موجود كأساس عبر reorder points |
| مؤشرات الأداء | موجودة عبر `pr_kpis` |

---

## المتبقي لاحقاً

- رفع المرفقات مباشرة إلى Storage بدلاً من روابط فقط.
- إشعارات realtime/email للمعتمدين المتأخرين.
- ربط أعمق مع ميزانية المشروع/CAPEX.
- واجهة أكثر تقدماً لإدارة reorder points.

---

## الحكم

الوحدة الأولى أصبحت الآن تغطي أساساً عملياً قوياً من التوثيق:

```text
PR Form → Budget Check → Approval Chain → Revision/Cancel → Attachments → Comments → Audit → ROP/MRP Generation → KPIs
```
