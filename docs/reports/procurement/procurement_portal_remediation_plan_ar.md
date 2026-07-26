# خطة إصلاح بوابة المشتريات — Kyvzon Procurement Portal

**الفرع:** `remediation/p0-security-and-build-health`  
**تاريخ الخطة:** 2026-07-26  
**الهدف:** تحويل بوابة المشتريات من Skeleton/Beta غير آمن إلى بوابة مشتريات مؤسسية آمنة، قابلة للاختبار، ومطابقة للتوثيقات السبع.

---

## 0) فلسفة الإصلاح

لن نبدأ بإضافة شاشات جميلة قبل حماية القاعدة. بوابة المشتريات تمس المال، الموردين، العقود، الفواتير، والموافقات. لذلك ترتيب الإصلاح يجب أن يكون كالتالي:

1. **إغلاق الثغرات الأمنية أولاً.**
2. **تثبيت عقد قاعدة البيانات والاختبارات.**
3. **إكمال سير العمل الحقيقي من PR إلى PO إلى GR إلى Invoice.**
4. **إكمال الموردين والعقود والتحليلات.**
5. **منع الادعاءات غير الصحيحة مثل “100% حقيقي” حتى تصبح صحيحة فعلاً.**

---

## 1) تعريف خط النهاية Definition of Done

لا نعتبر بوابة المشتريات مكتملة إلا إذا تحققت البنود التالية:

### أمنياً

- لا توجد دالة `SECURITY DEFINER` حساسة بدون فحص دور داخلي.
- لا توجد RPC عامة تقبل `tenant_id` من العميل.
- كل Views الحساسة تعمل بـ `security_invoker=true` أو تحتوي فلتر tenant صريح.
- كل FK حساس داخل RPC يتم التحقق أنه من نفس tenant.
- اختبارات RLS حقيقية لشركتين على الأقل.

### وظيفياً

- المستخدم يستطيع تنفيذ دورة كاملة:

```text
PR → Approval → RFx/Supplier → PO → Goods Receipt → Invoice → 3-Way Matching → Payment Approval → Spend Analytics
```

- المورد يستطيع استخدام بوابة ذاتية حقيقية:

```text
Invite → Supplier Portal → Documents → Qualification → Approval → Bid Submission
```

- العقود لها دورة فعلية:

```text
Template → Draft → Versioning → Approval → Signature → Obligations → Renewal
```

### هندسياً

- `npm run type-check` بلا أخطاء.
- `npm run lint` بلا errors.
- `npm run test:run` ينجح.
- `npm run build` ينجح.
- `sdk:boundary-check` ينجح.
- `db:contract-check` ينجح.
- `99_post_migration_checks.sql` يحتوي فحوصات Procurement.

---

## 2) خريطة الإصلاح العامة

| المرحلة | الاسم | الأولوية | الهدف |
|---|---|---|---|
| Phase 0 | تجميد الإطلاق وتنظيف الادعاءات | P0 | منع استخدام إنتاجي مضلل |
| Phase 1 | Security Hardening | P0 | إغلاق ثغرات RPC/Views/Tenant |
| Phase 2 | DB Contract + Tests | P0 | إثبات RLS والمخطط فعلياً |
| Phase 3 | PR + Approvals | P1 | إكمال الوحدة 01 |
| Phase 4 | Supplier Onboarding + Portal | P1 | إكمال الوحدة 03 |
| Phase 5 | RFx + Auctions | P1 | إكمال الوحدة 02 |
| Phase 6 | PO + GR + RTV | P1 | إكمال الوحدة 04 |
| Phase 7 | Invoices + 3-Way Matching | P1 | إكمال الوحدة 05 |
| Phase 8 | Contracts CLM | P1/P2 | إكمال الوحدة 06 |
| Phase 9 | Spend Intelligence | P2 | إكمال الوحدة 07 |
| Phase 10 | E2E + Production Readiness | P0/P1 | اعتماد نهائي |

---

# Phase 0 — تجميد الإطلاق وتنظيف الادعاءات

## الهدف

منع ظهور البوابة كأنها مكتملة 100% بينما هي ليست كذلك.

## المهام

### 0.1 تعديل توصيف الوحدة

**الملف:** `src/services/sdk/TenantModuleCatalog.ts`

- إبقاء `status: 'beta'` حالياً.
- إضافة `doD` لبوابة المشتريات يوضح المتبقي.
- عدم استخدام عبارات “P2P كاملة” إلا بعد اكتمال P1.

### 0.2 إزالة/تعديل عبارات “100% حقيقي” غير الصحيحة

الملفات المحتملة:

- migrations `0182` إلى `0188`
- صفحات المشتريات
- خدمات SDK

نستبدلها بعبارات صادقة:

```text
Beta implementation — partial workflow, not production-complete yet
```

### 0.3 إضافة راية داخل الواجهة

في لوحة المشتريات:

```text
هذه البوابة في وضع Beta. بعض المسارات قيد الإكمال ولا تستخدم كمرجع مالي نهائي.
```

## معيار القبول

- لا توجد صفحة تقول للمستخدم إن البوابة مكتملة 100% وهي ليست كذلك.

---

# Phase 1 — Security Hardening / الإصلاح الأمني الحرج

هذه أهم مرحلة. لا نكمل الميزات قبلها.

---

## 1.1 إنشاء migration أمنية جديدة

**ملف جديد مقترح:**

```text
supabase/migrations/0190_procurement_security_hardening.sql
```

## 1.2 إضافة دوال مساعدة للصلاحيات

داخل migration الجديدة:

```sql
CREATE OR REPLACE FUNCTION public.require_procurement_role(allowed_roles text[] DEFAULT ARRAY['procurement','admin'])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.current_user_tenant_id() IS NULL THEN
    RAISE EXCEPTION 'NO_TENANT';
  END IF;

  IF NOT (
    public.current_user_is_staff()
    OR public.current_user_role() = ANY(allowed_roles)
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED';
  END IF;
END;
$$;
```

لكن يجب استخدام هذه الدالة بحذر لأن `SECURITY DEFINER` قد يخفي سياق RLS؛ الأفضل أيضاً بناء دوال `assert_same_tenant`.

---

## 1.3 حماية كل RPC حساسة بفحص دور داخلي

### المجموعة A — PR

- `create_purchase_requisition_full`
  - يسمح: `employee`, `procurement`, `admin`, `manager`
  - لكن الإنشاء كموظف يجب أن يكون فقط لنفسه.
- `approve_procurement_step`
  - يسمح فقط للـ approver المعين أو admin/procurement عند التفويض.
- `consolidate_prs`
  - يسمح فقط: `procurement`, `admin`.
- `resolve_procurement_approval_chain`
  - قراءة داخلية؛ لا يلزم GRANT عام إلا إن كانت الواجهة تحتاجها.
- `check_pr_budget`
  - يسمح: `procurement`, `admin`, `finance`, أو call داخلي.

### المجموعة B — RFx

- `create_sourcing_event_from_pr`: `procurement/admin` فقط.
- `submit_supplier_bid`: لا يجب أن يكون لأي authenticated داخلي؛ إما procurement/admin داخلياً، أو Supplier Portal service-role بمسار منفصل.
- `evaluate_bid`: `procurement/admin/manager` حسب السياسة.
- `start_procurement_auction`: `procurement/admin`.
- `place_auction_bid`: Supplier Portal أو procurement/admin فقط، مع تحقق المورد.

### المجموعة C — PO/GR

- `create_po_from_pr`: `procurement/admin`.
- `receive_goods`: `procurement/admin` أو دور warehouse إن أضيف لاحقاً.
- `post_goods_receipt`: `procurement/admin` أو quality/warehouse لاحقاً.
- `create_rtv`: `procurement/admin`.

### المجموعة D — Invoices

- `match_invoice`: `procurement/admin/finance`.
- `seed_procurement_tolerance_rules`: `admin/procurement/finance_admin` وليس أي مستخدم.
- `detect_duplicate_invoice`: يجب ألا تقبل `tenant_id` من العميل.
- `calculate_early_discount_saving`: يمكن أن تبقى عامة لأنها pure calculation، لكن لا تحتاج `SECURITY DEFINER`.

### المجموعة E — Contracts

- `create_contract_version`: `procurement/admin/legal` بعد إضافة دور legal أو إزالة ذكره.
- `sign_contract`: لا يجب أن تكون مجرد RPC عامة؛ يجب أن تمر عبر Edge Function توقيع أو تحقق token/OTP.

### المجموعة F — Spend

- `classify_spend_transaction`: `procurement/admin`.
- `detect_maverick_spend`: لا تقبل `tenant_id` من العميل.
- `calculate_supplier_otif`: `procurement/admin/finance`.
- `forecast_spend`: لا تقبل `tenant_id` من العميل.

---

## 1.4 إزالة `tenant_id` من مدخلات RPC العامة

### قبل

```sql
forecast_spend(p_tenant_id UUID, p_period TEXT, p_category_code TEXT)
```

### بعد

```sql
forecast_spend(p_period TEXT, p_category_code TEXT DEFAULT NULL)
```

وفي الداخل:

```sql
v_tenant := public.current_user_tenant_id();
```

الدوال المطلوب تعديلها:

- `detect_duplicate_invoice`
- `forecast_spend`
- `seed_procurement_tolerance_rules`
- أي RPC أخرى تأخذ `p_tenant_id` من العميل.

---

## 1.5 إصلاح Views الحساسة

كل views التالية يجب إصلاحها:

- `pr_pending_with_age`
- `pr_rogue_spending`
- `supplier_expiry_alerts`
- `rfq_tco_comparison`
- `auction_savings`
- `po_tracking`
- `otif_metrics`
- `invoice_stp_metrics`
- `invoice_dispute_breakdown`
- `contract_renewals_upcoming`
- `spend_pareto_80_20`
- `price_trend`

### الشكل المفضل

```sql
CREATE OR REPLACE VIEW public.price_trend
WITH (security_invoker = true)
AS
SELECT ...
FROM public.procurement_price_history
WHERE tenant_id = public.current_user_tenant_id();
```

## 1.6 التحقق من tenant لكل FK داخل RPC

مثال في `create_po_from_pr`:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.suppliers
  WHERE id = p_supplier_id
    AND tenant_id = v_tenant
    AND status = 'approved'
) THEN
  RAISE EXCEPTION 'SUPPLIER_NOT_APPROVED_OR_NOT_IN_TENANT';
END IF;
```

ينطبق على:

- `supplier_id`
- `pr_id`
- `event_id`
- `auction_id`
- `po_id`
- `gr_id`
- `invoice_id`
- `contract_id`
- `bid_id`

## معيار قبول Phase 1

- لا توجد RPC حساسة بدون `current_user_role()` أو تحقق مكافئ.
- لا توجد RPC عامة تقبل tenant من العميل.
- كل views الحساسة tenant-scoped.
- اختبارات SQL تثبت أن مستخدم tenant A لا يرى tenant B.

---

# Phase 2 — DB Contract + اختبارات حقيقية

## 2.1 تحديث post migration checks

**الملف:**

```text
scripts/tests/99_post_migration_checks.sql
```

نضيف فصول:

```text
AA. Procurement Role + Module
AB. PR tables/functions
AC. Supplier onboarding tables/functions
AD. RFx tables/functions
AE. PO/GR tables/functions
AF. Invoices matching tables/functions
AG. CLM tables/functions
AH. Spend analytics tables/functions
AI. Security checks for views/RPC grants
```

## 2.2 إضافة اختبارات RLS حقيقية

**ملف مقترح:**

```text
scripts/tests/procurement_rls_isolation.sql
```

السيناريو:

1. إنشاء tenant A و tenant B.
2. إنشاء مستخدم procurement في tenant A.
3. إنشاء مستخدم procurement في tenant B.
4. إدخال PR/PO/Supplier/Invoice في tenant A.
5. التأكد أن tenant B لا يقرأ أي سجل.
6. اختبار أن employee لا يستطيع تشغيل RPC حساسة مثل `create_po_from_pr`.

## 2.3 إضافة اختبارات Vitest غير سطحية

الاختبارات الحالية مفيدة شكلياً لكنها لا تثبت قاعدة البيانات. نضيف اختبارات لخدمات SDK:

- لا تقبل `tenant_id` من input.
- لا تستخدم direct supabase من صفحات procurement خارج SDK.
- كل صفحة مهمة تستدعي service صحيح.

## معيار قبول Phase 2

- post migration checks تحتوي Procurement.
- اختبارات RLS تثبت العزل.
- CI يفشل عند حذف أي جدول/دالة مهمة.

---

# Phase 3 — إصلاح الوحدة 01: PR + Approval Workflow

## الهدف

تحويل PR من نموذج بسيط إلى سير طلب شراء حقيقي.

## المهام

### 3.1 إكمال نموذج PR

**الملف:**

```text
src/pages/app/procurement/requisitions/RequisitionListPage.tsx
```

إضافة حقول:

- department_id
- cost_center_id
- needed_by_date
- request_type
- priority
- emergency_reason
- supplier suggestion لكل بند
- item_code
- unit
- unspsc_code
- attachments

### 3.2 بناء صفحة تفاصيل PR الحقيقية

**الملف:**

```text
src/pages/app/procurement/requisitions/RequisitionDetailPage.tsx
```

تبويبات:

1. Header
2. Line Items
3. Budget Check
4. Approval Timeline
5. Attachments
6. Audit Log
7. Comments / Revision

### 3.3 جعل Approval Rules مستخدمة فعلياً

حالياً `procurement_approval_rules` موجودة لكن `resolve_procurement_approval_chain` لا يستخدمها. يجب تعديل الدالة لاختيار القواعد الفعالة حسب:

- amount
- department
- request_type
- CAPEX
- emergency
- supplier status

### 3.4 إضافة حالات مفقودة

إما توسيع enum status أو توحيدها مع UI:

- `under_review`
- `revision_required`

### 3.5 Audit + Notifications

- تسجيل كل قرار approval.
- تذكير المعتمد بعد X ساعات.
- إشعار عند رفض/طلب تعديل.

## معيار قبول Phase 3

- موظف ينشئ PR كامل.
- PR ينتقل عبر مراحل موافقة قابلة للتخصيص.
- الميزانية تظهر للمستخدم.
- كل قرار مسجل.

---

# Phase 4 — إصلاح الموردين Supplier Onboarding

## الهدف

بناء تأهيل موردين حقيقي لا مجرد قائمة.

## المهام

### 4.1 بناء صفحة تفاصيل المورد

**الملف:**

```text
src/pages/app/procurement/suppliers/SupplierDetailPage.tsx
```

تبويبات:

1. المعلومات القانونية
2. المعلومات المالية والبنكية
3. الوثائق
4. جهات الاتصال
5. تقييم المخاطر
6. الزيارة الميدانية
7. Kraljic Matrix
8. Spend History
9. Audit

### 4.2 بناء Supplier Portal public route

مسار جديد:

```text
/supplier-portal/:token
```

الوظائف:

- تحقق token عبر Edge Function وليس مباشرة من العميل.
- إدخال بيانات المورد.
- رفع وثائق.
- تحديث جهات الاتصال.
- تقديم عروض RFx لاحقاً.

### 4.3 إصلاح token security

- عدم إرجاع token الخام في production.
- تخزين hash فقط.
- Edge Function للتحقق والتسجيل.

### 4.4 Workflow تأهيل

حالات المورد:

```text
pending → under_review → approved/rejected/suspended
```

مع موافقات حسب risk score.

## معيار قبول Phase 4

- دعوة مورد تنشئ رابطاً حقيقياً.
- المورد يرفع وثائقه.
- المشتريات تتحقق وتوافق.
- المورد approved يظهر في AVL.

---

# Phase 5 — إصلاح RFx + Auctions

## الهدف

بناء دورة توريد استراتيجية حقيقية.

## المهام

### 5.1 RFx Builder

صفحة إنشاء RFx يجب أن تدعم:

- RFI
- RFQ
- RFP
- Auction
- قوالب جاهزة
- أقسام الوثيقة
- معايير تقييم ووزن
- قائمة موردين مدعوين

### 5.2 Supplier Bid Submission

- تقديم العرض من Supplier Portal وليس من صفحة داخلية فقط.
- دعم مرفقات العرض.
- دعم أسئلة وأجوبة Q&A.

### 5.3 Bid Evaluation

- MECCA score حقيقي.
- Technical/commercial/quality/delivery.
- shortlist.
- award.

### 5.4 Auction creation

- زر إنشاء مزاد من RFx event.
- إعداد British/Japanese/Dutch.
- Realtime subscription.
- audit لكل bid.

## معيار قبول Phase 5

- PR معتمد يتحول RFQ.
- الموردون يقدمون عروضهم عبر بوابة المورد.
- المشتريات تقارن TCO وتختار فائزاً.

---

# Phase 6 — إصلاح PO + GR + RTV

## الهدف

إكمال دورة أمر الشراء والاستلام.

## المهام

### 6.1 إنشاء PO من PR/RFx Award

واجهة في:

```text
PurchaseOrdersPage.tsx
```

- اختيار PR معتمد أو RFx awarded.
- اختيار supplier approved.
- تحديد PO type.
- شروط التسليم والدفع.

### 6.2 إرسال PO للمورد

Edge Function:

```text
procurement-send-po
```

- Resend/BYOK.
- Audit.
- تحديث status إلى `sent`.

### 6.3 واجهة Goods Receipt

في:

```text
GoodsReceiptPage.tsx
```

- اختيار PO.
- إدخال delivery note.
- إدخال received/accepted/rejected per line.
- lot/expiry/location.
- damage photos.

### 6.4 GR Posting + Inventory

إذا لا توجد inventory module، يجب على الأقل إنشاء جدول:

```text
inventory_transactions
```

أو وضع PlannedFeature واضح بدلاً من تعليق داخلي.

### 6.5 RTV

واجهة إنشاء RTV من GR line.

### 6.6 ربط الصفحات غير المربوطة

في `AppRouter.tsx`:

- ربط `PoReleasesPage`
- ربط أي صفحة RTV إذا أضيفت

## معيار قبول Phase 6

- PR approved يتحول إلى PO.
- PO يرسل للمورد.
- GR يسجل استلام جزئي/كامل.
- RTV ينشأ عند رفض الجودة أو الضرر.

---

# Phase 7 — إصلاح Invoices + 3-Way Matching

## الهدف

تحويل المطابقة من RPC معزول إلى workflow حقيقي.

## المهام

### 7.1 إنشاء فاتورة

واجهة:

```text
InvoicesPage.tsx
```

- اختيار supplier.
- اختيار PO.
- إدخال invoice header.
- إدخال invoice lines.
- رفع PDF.

### 7.2 OCR حقيقي

`procurement-invoice-ocr` يجب أن:

- يجلب الملف من Storage أو signed URL.
- يرسل محتوى/صورة للنموذج المناسب فعلاً.
- يتحقق من JSON schema.
- ينشئ draft invoice أو يرجع extracted data فقط.

### 7.3 Matching Detail كامل

`MatchingDetailPage.tsx` يجب أن يعرض:

- PO lines
- GR lines
- Invoice lines
- price variance
- quantity variance
- tolerance decision
- exception owner

### 7.4 ربط ToleranceRulesPage بالراوتر

مسار مقترح:

```text
/app/procurement/invoices/tolerance-rules
```

### 7.5 Payment Approval

إضافة سير اعتماد دفع:

```text
matched → approved_for_payment → paid
```

## معيار قبول Phase 7

- فاتورة تدخل من PDF أو يدوي.
- يتم تشغيل 3-way matching.
- الاستثناء يظهر ويعالج.
- الفاتورة المطابقة تصبح approved.

---

# Phase 8 — إصلاح Contracts CLM

## الهدف

تحويل CLM من tables إلى نظام عقود عملي.

## المهام

### 8.1 إصلاح status mismatch

حالياً الواجهة تبحث عن `approved` لكن DB لا يحتويها. الخيارات:

- إضافة `approved` إلى enum/check.
- أو تعديل الواجهة إلى `approval`/`active`/`signed`.

الأفضل إضافة سير واضح:

```text
draft → review → negotiation → approval → approved → sent_for_signature → signed → active → expired/terminated/renewed
```

### 8.2 Contract Editor

- إنشاء عقد من template.
- إضافة clauses.
- red flags.
- versioning.

### 8.3 Approval Workflow

- قانوني للعقود عالية المخاطر.
- مالية للعقود فوق حد معين.
- إدارة للعقود متعددة السنوات.

### 8.4 توقيع حقيقي

- لا قبول `127.0.0.1` من الواجهة.
- لا `otp_verified=true` مباشرة.
- التوقيع عبر Edge Function مع token/OTP.
- DocuSign live يجب أن يستدعي API فعلياً أو يسمى simulated بوضوح.

### 8.5 Obligations

- إنشاء الالتزامات من العقد.
- تنبيهات 30/7/0.
- تحديث status إلى overdue آلياً.

## معيار قبول Phase 8

- عقد ينشأ من template.
- يمر approvals.
- يوقع بطريقة قابلة للتدقيق.
- تظهر التزامات وتجديدات.

---

# Phase 9 — إصلاح Spend Analytics

## الهدف

إزالة الأرقام الثابتة وبناء ذكاء مشتريات فعلي.

## المهام

### 9.1 Data Collector

إنشاء RPC أو scheduled job يملأ `spend_transactions` من:

- purchase_orders
- supplier_invoices
- procurement_contracts
- p_card لاحقاً
- expenses لاحقاً

### 9.2 إزالة hardcoded KPIs

في:

```text
SpendAnalyticsPage.tsx
```

إزالة:

- 12.4M
- 487K
- 158
- 12

واستبدالها باستعلامات SDK.

### 9.3 إصلاح forecast service

حالياً يجلب أول tenant من جدول tenants. يجب استخدام:

```ts
getCurrentTenantId()
```

أو RPC بلا tenant input.

### 9.4 UNSPSC classification

- manual classification أولاً.
- AI classification لاحقاً عبر Edge Function.
- تخزين confidence.

### 9.5 Export

- Excel.
- PDF.

## معيار قبول Phase 9

- لوحة التحليلات تعرض بيانات حقيقية فقط.
- Pareto وMaverick وPrice trend وForecast تعمل من بيانات فعلية.

---

# Phase 10 — E2E + Production Readiness

## 10.1 سيناريو E2E رئيسي

باستخدام Playwright:

```text
Admin enables procurement module
Admin creates procurement user
Employee creates PR
Manager approves
Procurement creates RFQ
Supplier submits bid
Procurement awards
Procurement creates PO
Warehouse receives goods
Finance creates invoice
System matches 3-way
Finance approves payment
Spend dashboard updates
```

## 10.2 سيناريو RLS E2E

- مستخدم شركة A لا يرى أي شيء من شركة B.
- employee لا يستطيع تشغيل RPC حساسة.
- finance يرى invoices ولا يستطيع تعديل RFx.

## 10.3 Performance

- Index review.
- pagination.
- count queries.
- no loading all records without limit.

## 10.4 Release checklist

```bash
npm run type-check
npm run lint
npm run test:run
npm run build
npm run sdk:boundary-check
npm run db:contract-check
# local DB migration test with psql/supabase
```

## معيار قبول Phase 10

- E2E يثبت الدورة كاملة.
- الأمن مثبت.
- لا توجد بيانات hardcoded.
- التوثيق محدث.

---

# 3) ترتيب التنفيذ العملي المقترح

## Sprint 1 — Security Foundation

1. إنشاء migration `0190_procurement_security_hardening.sql`.
2. حماية RPCs الحساسة.
3. إصلاح Views.
4. إزالة tenant input من RPCs.
5. تحديث SDK المتأثر.
6. تحديث post migration checks.

**المدة المتوقعة:** 2–4 أيام هندسية.

## Sprint 2 — PR + Supplier basics

1. إكمال PR form.
2. إكمال PR detail.
3. استخدام approval rules فعلياً.
4. إكمال Supplier detail tabs.
5. بناء supplier portal route الأساسي.

**المدة المتوقعة:** 4–7 أيام هندسية.

## Sprint 3 — PO/GR + Invoice path

1. إنشاء PO من PR.
2. GR receive/post.
3. Invoice create.
4. 3-way matching detail.
5. Tolerance rules route.

**المدة المتوقعة:** 5–8 أيام هندسية.

## Sprint 4 — RFx + Contracts + Analytics

1. RFx builder.
2. Supplier bids via portal.
3. Contracts status/workflow.
4. Real spend collector.
5. Remove hardcoded analytics.

**المدة المتوقعة:** 6–10 أيام هندسية.

## Sprint 5 — E2E + production hardening

1. Playwright E2E.
2. RLS DB tests.
3. Performance.
4. Documentation.
5. Deployment instructions.

**المدة المتوقعة:** 3–5 أيام هندسية.

---

# 4) أول ملف يجب تعديله عند بدء التنفيذ

أبدأ فعلياً من:

```text
supabase/migrations/0190_procurement_security_hardening.sql
```

لأن أي تطوير واجهة قبل إغلاق RPC/Views سيزيد مساحة الخطر.

ثم مباشرة:

```text
scripts/tests/99_post_migration_checks.sql
```

لأن كل إصلاح أمني يجب أن يصبح قابلاً للكشف إذا انكسر لاحقاً.

---

# 5) قائمة فحص قبل الانتقال من P0 إلى P1

- [ ] كل RPC حساسة تفحص الدور.
- [ ] لا توجد RPC عامة تقبل tenant_id من العميل.
- [ ] كل views tenant-scoped.
- [ ] `99_post_migration_checks.sql` يحتوي procurement checks.
- [ ] اختبارات RLS حقيقية موجودة.
- [ ] `npm run type-check` ينجح.
- [ ] `npm run test:run` ينجح.
- [ ] `npm run build` ينجح.

---

## الحكم الهندسي

الخطأ الأكبر الآن ليس نقص صفحة أو زر. الخطأ الأكبر أن طبقة قاعدة البيانات تعطي انطباعاً أنها محمية بـ RLS، بينما `SECURITY DEFINER` و Views العادية قد تتجاوز هذه الحماية إن لم تُضبط بعناية.

لذلك الإصلاح الصحيح يبدأ من العمق:

```text
DB Security → DB Tests → SDK → UI Workflows → E2E
```

وليس العكس.
