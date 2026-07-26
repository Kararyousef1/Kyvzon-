# تقرير إكمال المتبقي من الوحدة الأولى — PR Finalization

**التاريخ:** 2026-07-26  
**الوحدة:** الوحدة الأولى — طلب الشراء وسير الموافقات  
**التوثيق المعتمد:** `docs/e-procurement/01-purchase-requisition-approval.md`

---

## ما تم إكماله في هذه الدفعة

### 1) Migration جديدة للمتبقي من الوحدة الأولى

تم إنشاء:

```text
supabase/migrations/0197_procurement_pr_notifications_budget.sql
```

وتضيف:

- أعمدة budget scope على PR:
  - `project_id`
  - `budget_scope`
  - `budget_category_code`
  - `last_reminder_at`

- جدول تذكيرات الموافقات:
  ```sql
  pr_approval_reminders
  ```

- View للطلبات المتأخرة عند المعتمدين:
  ```sql
  pr_overdue_approvals
  ```

- دالة تسجيل تذكير:
  ```sql
  record_pr_approval_reminder(uuid, uuid, text, jsonb)
  ```

---

### 2) Edge Function لمرفقات PR

تم إنشاء:

```text
supabase/functions/procurement-pr-attachment/index.ts
```

وتدعم:

- رفع ملف PR إلى Storage bucket خاص:
  ```text
  pr-attachments
  ```

- تسجيل المرفق في:
  ```sql
  pr_attachments
  ```

- إنشاء رابط موقّع مؤقت لفتح المرفق:
  ```text
  signed_url
  ```

الأمان:

- تتحقق من JWT.
- تتحقق أن PR داخل tenant المستخدم.
- تسمح لصاحب الطلب أو أدوار المشتريات/الإدارة/المالية/المدير.
- لا تقبل `tenant_id` من العميل.

---

### 3) Edge Function لتذكير المعتمدين

تم إنشاء:

```text
supabase/functions/procurement-pr-approval-reminder/index.ts
```

وتعمل كـ cron محمي بـ:

```text
CRON_SECRET
```

تقوم بـ:

- قراءة `pr_overdue_approvals`.
- تسجيل تذكير في `pr_approval_reminders`.
- تحديث `last_reminder_at`.
- تسجيل audit في `pr_audit_log`.
- تسجيل platform audit.

هذا يحقق أساس متطلب:

> إشعارات ذكية: تذكير المعتمدين الذين لم يستجيبوا خلال X ساعات.

---

### 4) تحديث SDK للمرفقات

تم تعديل:

```text
src/services/sdk/Procurement/PurchaseRequisitionService.ts
```

وأضيف إلى `prAttachmentService`:

```ts
uploadFile(prId, file)
signedUrl(prId, fileUrl)
```

الصفحات لا تستدعي Supabase مباشرة؛ تلتزم بطبقة SDK.

---

### 5) تحديث واجهة تفاصيل PR

تم تعديل:

```text
src/pages/app/procurement/requisitions/RequisitionDetailPage.tsx
```

وأصبحت المرفقات تدعم:

- رفع ملف مباشر.
- إضافة رابط خارجي.
- فتح مرفق خاص عبر signed URL.

---

### 6) تحديث الفحوصات والاختبارات

تم تحديث:

```text
scripts/tests/99_post_migration_checks.sql
src/test/procurement/procurementSecurityContract.test.ts
```

للتأكد من:

- `pr_approval_reminders`
- `pr_overdue_approvals`
- `record_pr_approval_reminder`
- `procurement-pr-attachment`
- `procurement-pr-approval-reminder`
- وجود رفع ملف في صفحة PR

---

## نتائج التحقق

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
| `npm run test:run` | نجح — 39 ملفات / 409 اختبار |
| `npm run build` | نجح مع تحذير chunk size |
| `npm run lint` | 0 errors، مع warnings متراكمة |

---

## حالة الوحدة الأولى بعد هذه الدفعة

| متطلب التوثيق | الحالة |
|---|---|
| نموذج PR ذكي | موجود |
| المرفقات | موجودة مع رفع خاص وsigned URL |
| مصادر توليد PR | يدوي + ROP/MRP مبسط |
| سير موافقات مرن | موجود |
| فحص الميزانية | موجود + budget scope foundation |
| دعم الطوارئ | موجود |
| دمج الطلبات | موجود |
| تتبع الحالة | موجود |
| طلب تعديل | موجود |
| إلغاء | موجود |
| تعليقات | موجودة |
| سجل تدقيق كامل | موجود كأساس عملي |
| تذكير المعتمدين | موجود عبر cron/audit |
| KPIs | موجودة |

---

## المتبقي الاختياري لاحقاً

- إرسال بريد فعلي للمعتمدين بدلاً من audit-only في cron.
- واجهة إدارة متقدمة لنقاط إعادة الطلب.
- توسيع فحص الميزانية التفصيلي لفئات ومشاريع CAPEX بعمق أكبر.

---

## الحكم

الوحدة الأولى أصبحت الآن مكتملة كأساس عملي قوي وفق التوثيق:

```text
PR Form → Attachments → Budget Check → Approval Chain → Revision/Cancel → Comments → Audit → Reminders → ROP/MRP → KPIs
```
