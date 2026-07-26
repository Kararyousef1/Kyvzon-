# تقرير تنفيذ Phase 1.2 — Same-Tenant Assertions + Security Contract Tests

**التاريخ:** 2026-07-26  
**النطاق:** استكمال P0 Security Hardening لبوابة المشتريات.

---

## الخلاصة

تم استكمال طبقة حماية إضافية فوق ما تم في `0190`، والهدف منها منع تمرير UUID من شركة أخرى داخل RPCs الحساسة، حتى مع وجود `SECURITY DEFINER`.

هذه خطوة مهمة لأن فحص الدور وحده لا يكفي في نظام multi-tenant. يجب أيضاً التأكد أن كل كيان مشار إليه مثل `supplier_id`, `po_id`, `invoice_id`, `contract_id` ينتمي لنفس الشركة الحالية.

---

## 1) إنشاء migration جديدة

تم إنشاء:

```text
supabase/migrations/0191_procurement_same_tenant_assertions.sql
```

هذه migration تضيف دوال تحقق مركزية وتعيد تعريف RPCs حساسة لتستخدمها.

---

## 2) دوال التحقق المركزية المضافة

تمت إضافة helpers التالية:

```sql
procurement_assert_supplier_in_tenant(uuid, boolean)
procurement_assert_department_in_tenant(uuid)
procurement_assert_cost_center_in_tenant(uuid)
procurement_assert_pr_in_tenant(uuid, text)
procurement_assert_sourcing_event_in_tenant(uuid)
procurement_assert_bid_in_tenant(uuid)
procurement_assert_auction_in_tenant(uuid)
procurement_assert_po_in_tenant(uuid)
procurement_assert_gr_in_tenant(uuid, uuid)
procurement_assert_invoice_in_tenant(uuid)
procurement_assert_contract_in_tenant(uuid)
procurement_assert_spend_transaction_in_tenant(uuid)
```

كل دالة تعتمد داخلياً على:

```sql
public.current_user_tenant_id()
```

وتمنع استخدام أي UUID خارج tenant الحالي.

---

## 3) RPCs تم تشديدها بإثبات same-tenant

تمت إعادة تعريف دوال حساسة لتضيف فحوصات FK/tenant.

### PR

- `create_purchase_requisition_full`
  - يتحقق من `department_id`.
  - يتحقق من `cost_center_id`.
  - يتحقق من `suggested_supplier_id` في كل بند.

- `approve_procurement_step`
  - يتحقق أن `procurement_approval_request` ينتمي لنفس tenant.

### RFx / Auctions

- `submit_supplier_bid`
  - يتحقق من `event_id`.
  - يتحقق من `supplier_id` وأن المورد `approved`.

- `evaluate_bid`
  - يتحقق من `bid_id`.

- `start_procurement_auction`
  - يتحقق من `sourcing_event_id`.

- `place_auction_bid`
  - يتحقق من `auction_id`.
  - يتحقق من `supplier_id` وأن المورد `approved`.

### PO / GR / RTV

- `create_po_from_pr`
  - يتحقق من أن المورد من نفس tenant ومعتمد.

- `receive_goods`
  - يتحقق أن `po_line_item_id` تابع لنفس `po_id`، وليس مجرد تابع لنفس tenant.
  - يضيف tenant filter عند تحديث `po_line_items`.
  - يضيف tenant filter عند حساب pending lines.

- `post_goods_receipt`
  - يتحقق من `gr_id`.

- `create_rtv`
  - يتحقق من `po_id`.
  - يتحقق من أن `gr_id` تابع لنفس `po_id`.

### Invoices

- `match_invoice`
  - يتحقق من supplier داخل invoice.
  - يتحقق أن invoice line / PO line تنتمي لنفس PO الخاص بالفاتورة.
  - يضيف tenant filter عند تحديث حالة الفاتورة.

### Contracts

- `create_contract_version`
  - يتحقق من `contract_id`.

- `sign_contract`
  - يتحقق من `contract_id`.

### Spend

- `classify_spend_transaction`
  - يتحقق من `transaction_id`.
  - يتحقق من `category_code` داخل نفس tenant.

- `calculate_supplier_otif`
  - يتحقق من `supplier_id`.

---

## 4) تحديث SDK إضافي

تم تعديل:

```text
src/services/sdk/Procurement/InvoiceService.ts
```

حيث كان `detectDuplicate()` يمرر:

```ts
p_tenant_id
```

تمت إزالة ذلك بالكامل، وصار يستدعي RPC الآمنة:

```ts
detect_duplicate_invoice(p_supplier_id, p_invoice_number, p_total_amount, p_invoice_date)
```

---

## 5) إضافة اختبار Security Contract

تم إنشاء:

```text
src/test/procurement/procurementSecurityContract.test.ts
```

الاختبار يثبت بشكل static أن:

- migration `0190` موجودة وتحتوي guard و `security_invoker`.
- migration `0191` موجودة وتحتوي same-tenant helpers.
- Procurement SDK لا يمرر `p_tenant_id` إلى RPCs.
- SDK لا يجلب أول tenant من جدول `tenants`.

---

## 6) تحديث Post Migration Checks

تم تحديث:

```text
scripts/tests/99_post_migration_checks.sql
```

وأضاف الفحص الآن أيضاً وجود helpers التالية:

```sql
procurement_assert_supplier_in_tenant(uuid,boolean)
procurement_assert_po_in_tenant(uuid)
procurement_assert_contract_in_tenant(uuid)
```

---

## 7) نتائج التحقق بعد هذه الدفعة

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
| `npm run test:run` | نجح — 39 ملفات / 402 اختبار |
| `npm run build` | نجح |
| `npm run lint` | 0 errors، مع 1360 warning موجودة سابقاً تقريباً |

---

## 8) الملفات الجديدة في هذه الدفعة

```text
supabase/migrations/0191_procurement_same_tenant_assertions.sql
src/test/procurement/procurementSecurityContract.test.ts
procurement_phase1_2_execution_report_ar.md
```

## 9) الملفات المعدلة في هذه الدفعة

```text
scripts/tests/99_post_migration_checks.sql
src/services/sdk/Procurement/InvoiceService.ts
```

مع استمرار وجود تعديلات الدفعة السابقة:

```text
supabase/migrations/0190_procurement_security_hardening.sql
src/services/sdk/Procurement/SpendAnalyticsService.ts
src/pages/app/procurement/invoices/ToleranceRulesPage.tsx
src/router/AppRouter.tsx
scripts/tests/procurement_rls_isolation.sql
```

---

## 10) ملاحظة مهمة

لم يتم تشغيل migrations على PostgreSQL فعلي داخل هذه البيئة لأن `psql` غير متوفر. تم التحقق عبر:

- TypeScript
- Build
- Vitest
- DB contract static check
- SDK boundary check
- Static security contract test

لكن قبل الدمج النهائي يجب تطبيق migrations على قاعدة اختبار Supabase فعلية أو Docker Postgres وتشغيل:

```bash
scripts/tests/run_clean_db_test.sh
```

أو بديل Supabase CLI.

---

## 11) الخطوة التالية المقترحة

بعد إغلاق معظم P0 الأمني، الخطوة التالية المنطقية هي:

```text
Phase 3 — إكمال PR + Approval Workflow
```

لكن قبلها أو بالتوازي يفضل تشغيل migrations على قاعدة اختبار حقيقية للتأكد من صحة SQL runtime.

أول مهام Phase 3 ستكون:

1. إكمال نموذج إنشاء PR.
2. بناء صفحة تفاصيل PR الحقيقية.
3. جعل `procurement_approval_rules` مستخدمة فعلياً في `resolve_procurement_approval_chain`.
4. إضافة audit/comments/attachments.
