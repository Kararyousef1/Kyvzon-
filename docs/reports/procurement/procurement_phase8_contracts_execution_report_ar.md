# تقرير تنفيذ Phase 8 — الوحدة السادسة: إدارة دورة حياة العقود CLM

**التاريخ:** 2026-07-26  
**الوحدة:** الوحدة السادسة — Contract Lifecycle Management  
**التوثيق المعتمد:** `docs/e-procurement/06-contract-lifecycle-management.md`

---

## 1) قراءة التوثيق والمتطلبات

تمت قراءة توثيق الوحدة السادسة قبل التنفيذ، والمتطلبات الأساسية كانت:

- دورة حياة العقد كاملة: request/draft/review/negotiation/approval/signature/obligations/renewal/termination.
- مكتبة القوالب.
- مكتبة البنود مع Red Flags.
- التفاوض وإدارة الإصدارات Redlining.
- سير موافقات قانوني/مشتريات/مالي/إدارة.
- E-Signature مع سجل تدقيق.
- تتبع الالتزامات.
- التعديلات Amendments.
- التجديد والإنهاء.
- تحليلات CLM.

---

## 2) Migration جديدة لإكمال CLM

تم إنشاء:

```text
supabase/migrations/0201_procurement_contracts_clm_completion.sql
```

### أضافت حالات دورة حياة العقد

تم توسيع `procurement_contracts.status` ليشمل:

```text
request, draft, review, negotiation, approval, approved,
sent_for_signature, signed, active, expired, terminated, renewed
```

### أضافت حقول إدارة التجديد والإنهاء

- `auto_renewal`
- `non_standard_terms`
- `legal_review_required`
- `renewal_decision`
- `renewal_decision_notes`
- `terminated_at`
- `termination_reason`

---

## 3) جداول CLM الجديدة

تمت إضافة:

```sql
contract_audit_log
contract_approval_requests
contract_approval_steps
contract_signature_requests
contract_redline_comments
```

هذه تغطي:

- سجل تدقيق العقد.
- سير الموافقات.
- طلبات التوقيع الإلكتروني.
- تعليقات Redlining.

---

## 4) دوال CLM الجديدة

تمت إضافة:

```sql
log_contract_audit(...)
seed_default_contract_templates_clauses()
create_procurement_contract_full(...)
request_contract_approval(...)
approve_contract_step(...)
request_contract_signature(...)
add_contract_obligation(...)
decide_contract_renewal(...)
terminate_contract(...)
```

### أهم ما تفعله

#### `seed_default_contract_templates_clauses`

ينشئ قوالب:

- MSA
- SLA
- SOW
- PO Terms & Conditions
- NDA
- IP Agreement

وينشئ بنوداً معيارية وبنود Red Flags.

#### `create_procurement_contract_full`

ينشئ عقداً كاملاً من قالب اختياري، وينشئ نسخة أولى:

```text
v0.1
```

#### `request_contract_approval`

ينشئ سير موافقة متعدد المستويات حسب:

- legal review required
- قيمة العقد > 50,000
- قيمة العقد > 500,000
- شروط غير معيارية

#### `approve_contract_step`

يعتمد/يرفض خطوة موافقة، وينقل العقد إلى `approved` عند اكتمال الخطوات.

#### `request_contract_signature`

ينشئ طلبات توقيع بترتيب للموقعين.

#### `add_contract_obligation`

يضيف التزامات للعقد.

#### `decide_contract_renewal`

يسجل قرار التجديد:

- renew same
- renegotiate
- expand
- reduce
- terminate
- rfq new

#### `terminate_contract`

ينهي العقد مع سبب موثق.

---

## 5) تحليلات CLM

أضيفت view:

```sql
contract_clm_analytics
```

تعرض:

- عدد العقود النشطة.
- قيمة العقود النشطة.
- عقود تنتهي خلال 90 يوم.
- عقود ذات تجديد تلقائي.
- عقود منتهية.
- نسبة التوقيع الإلكتروني.

---

## 6) تحديث SDK

تم تعديل:

```text
src/services/sdk/Procurement/ContractService.ts
```

وأضيف:

- `createFull`
- `requestApproval`
- `requestSignature`
- `decideRenewal`
- `terminate`
- `contractApprovalStepService`
- `contractAuditLogService`
- `contractTemplateService.seedDefaults`
- `contractObligationService.add`

وتم تحديث التصدير من:

```text
src/services/sdk/index.ts
```

---

## 7) تحديث صفحة العقود

تمت إعادة بناء:

```text
src/pages/app/procurement/contracts/ContractsPage.tsx
```

وأصبحت تدعم:

- إنشاء عقد جديد من قالب.
- اختيار المورد.
- اختيار نوع العقد.
- تحديد القيمة والتواريخ.
- إرسال العقد للموافقات.
- عرض خطوات الموافقة.
- قبول/رفض خطوات الموافقة.
- طلب التوقيع.
- قرار التجديد.
- إنهاء العقد.
- عرض Audit للعقد.

---

## 8) تحديث صفحة القوالب والبنود

تمت إعادة بناء:

```text
src/pages/app/procurement/contracts/TemplatesPage.tsx
```

وأصبحت تدعم:

- تجهيز قوالب افتراضية.
- إنشاء قالب جديد.
- إنشاء بند جديد.
- تحديد Red Flag.
- عرض القوالب والبنود.

---

## 9) تحديث الاختبارات والفحوصات

تم تحديث:

```text
scripts/tests/99_post_migration_checks.sql
src/test/procurement/procurementSecurityContract.test.ts
```

للتأكد من وجود:

- `contract_audit_log`
- `contract_approval_steps`
- `contract_signature_requests`
- `seed_default_contract_templates_clauses`
- `create_procurement_contract_full`
- `contract_clm_analytics`
- واجهة إنشاء عقد.
- واجهة القوالب الافتراضية.

---

## 10) نتائج التحقق

تم تشغيل:

```bash
npm run type-check
npm run db:contract-check
npm run test:run
npm run build
```

النتائج:

| الأمر | النتيجة |
|---|---|
| TypeScript | نجح |
| DB contract check | نجح |
| Tests | نجحت — 39 ملف / 413 اختبار |
| Build | نجح مع تحذير chunk size |

---

## 11) حالة الوحدة السادسة مقابل التوثيق

| متطلب التوثيق | الحالة |
|---|---|
| طلب/صياغة عقد | موجود |
| مكتبة القوالب | موجودة |
| مكتبة البنود | موجودة |
| Red Flags | موجودة |
| الإصدارات | موجودة سابقاً + مستمرة |
| Redlining comments | أساس DB موجود |
| سير الموافقات | موجود |
| E-Signature requests | موجود كأساس طلبات توقيع |
| الالتزامات | موجودة + add obligation |
| التعديلات Amendments | موجودة سابقاً في DB |
| التجديد | موجود |
| الإنهاء | موجود |
| تحليلات CLM | موجودة |
| Audit trail | موجود |

---

## 12) الحكم

الوحدة السادسة أصبحت تملك سير CLM عملياً:

```text
Contract Draft
→ Template/Clauses
→ Versioning/Redlining
→ Approval Workflow
→ Signature Requests
→ Obligations
→ Renewal Decision
→ Termination
→ Audit/Analytics
```

المتبقي لاحقاً هو تحسينات على تجربة التوقيع العام public token UI ودمج DocuSign إنتاجياً بالكامل، لكن أساس CLM المؤسسي أصبح موجوداً.
