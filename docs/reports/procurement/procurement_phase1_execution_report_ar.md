# تقرير تنفيذ Phase 1 — Procurement Security Hardening

**التاريخ:** 2026-07-26  
**النطاق:** بداية تنفيذ خطة إصلاح بوابة المشتريات — P0 Security Hardening.

---

## ما تم تنفيذه

### 1) إنشاء migration أمنية جديدة

تم إنشاء الملف:

```text
supabase/migrations/0190_procurement_security_hardening.sql
```

يحتوي على:

- دالة حراسة مركزية:

```sql
public.procurement_require_roles(allowed_roles text[])
```

- لا تعتمد على `current_user_is_staff()` لأن هذه الدالة تشمل HR، وهذا واسع جداً لعمليات المشتريات.
- تسمح فقط بالأدوار المحددة في `allowed_roles` مع `developer/it_admin` للدعم التشخيصي.

---

### 2) حماية RPCs الحساسة بفحص دور داخلي

تمت إعادة تعريف RPCs حساسة وإضافة:

```sql
PERFORM public.procurement_require_roles(...);
```

للدوال التالية:

#### PR
- `create_purchase_requisition_full`
- `approve_procurement_step`
- `consolidate_prs`

#### RFx / Auctions
- `create_sourcing_event_from_pr`
- `submit_supplier_bid`
- `evaluate_bid`
- `start_procurement_auction`
- `place_auction_bid`

#### PO / GR / RTV
- `create_po_from_pr`
- `receive_goods`
- `post_goods_receipt`
- `create_rtv`

#### Invoices
- `match_invoice`

#### Contracts
- `create_contract_version`
- `sign_contract`

#### Spend
- `classify_spend_transaction`
- `calculate_supplier_otif`

---

### 3) منع تمرير tenant_id من العميل

تم إلغاء صلاحية `authenticated` عن الدوال القديمة التي تقبل tenant من العميل:

- `check_pr_budget(UUID,UUID,NUMERIC)`
- `seed_procurement_tolerance_rules(UUID)`
- `detect_duplicate_invoice(UUID,UUID,TEXT,NUMERIC,DATE)`
- `detect_maverick_spend(UUID)`
- `forecast_spend(UUID,TEXT,TEXT)`

وتم إنشاء بدائل آمنة تعتمد على:

```sql
public.current_user_tenant_id()
```

الدوال الجديدة:

- `check_pr_budget(UUID, NUMERIC)`
- `seed_procurement_tolerance_rules()`
- `detect_duplicate_invoice(UUID, TEXT, NUMERIC, DATE)`
- `detect_maverick_spend()`
- `forecast_spend(TEXT, TEXT)`

---

### 4) إصلاح Views المشتريات لتكون tenant-scoped

تمت إعادة تعريف views التالية باستخدام:

```sql
WITH (security_invoker = true)
```

مع فلتر:

```sql
tenant_id = public.current_user_tenant_id()
```

الـ views التي تم تشديدها:

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

---

### 5) تحديث SDK لإزالة tenant_id من العميل

تم تعديل:

```text
src/services/sdk/Procurement/SpendAnalyticsService.ts
```

التغييرات:

- `forecast()` لم يعد يجلب أول tenant من جدول `tenants`.
- صار يستدعي:

```ts
supabase.rpc('forecast_spend', {
  p_period,
  p_category_code,
})
```

- `toleranceRuleService.seed()` لم يعد يستقبل `tenantId`.

---

### 6) تحديث صفحة Tolerance Rules

تم تعديل:

```text
src/pages/app/procurement/invoices/ToleranceRulesPage.tsx
```

التغيير:

- إزالة قراءة `tenant_id` من `localStorage`.
- استدعاء `toleranceRuleService.seed()` بدون tenant.

---

### 7) ربط صفحات كانت غير مربوطة بالراوتر

تم تعديل:

```text
src/router/AppRouter.tsx
```

وتم ربط:

- `PoReleasesPage`

المسار:

```text
/app/procurement/orders/releases
```

- `ToleranceRulesPage`

المسار:

```text
/app/procurement/invoices/tolerance-rules
```

---

### 8) تحديث Post Migration Checks

تم تعديل:

```text
scripts/tests/99_post_migration_checks.sql
```

وإضافة قسم جديد:

```text
AA. بوابة المشتريات — P0 Security + الوحدات السبع
```

يفحص:

- وجود دور procurement في قيد profiles.
- جداول ودوال PR.
- جداول ودوال RFx.
- جداول ودوال الموردين.
- جداول ودوال PO/GR.
- جداول ودوال الفواتير.
- جداول ودوال العقود.
- جداول ودوال التحليلات.
- وجود `procurement_require_roles`.
- أن الدوال القديمة التي تقبل tenant_id لم تعد executable بواسطة authenticated.

---

### 9) إضافة ملف Smoke Test لعزل RLS

تم إنشاء:

```text
scripts/tests/procurement_rls_isolation.sql
```

هذا ليس اختبار RLS كامل بعد، لكنه يضع الأساس ويؤكد prerequisites. المرحلة القادمة يجب تحويله إلى harness كامل يضبط JWT claims ويختبر شركتين فعلياً.

---

## نتائج التحقق

تم تشغيل الأوامر التالية:

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
| `npm run test:run` | نجح — 38 ملفات / 399 اختبار |
| `npm run build` | نجح |
| `npm run lint` | 0 errors، مع 1360 warning موجودة مسبقاً تقريباً |

---

## ملفات تم تعديلها / إنشاؤها

### ملفات جديدة

```text
supabase/migrations/0190_procurement_security_hardening.sql
scripts/tests/procurement_rls_isolation.sql
procurement_phase1_execution_report_ar.md
```

### ملفات معدلة

```text
scripts/tests/99_post_migration_checks.sql
src/services/sdk/Procurement/SpendAnalyticsService.ts
src/pages/app/procurement/invoices/ToleranceRulesPage.tsx
src/router/AppRouter.tsx
```

---

## ملاحظات هندسية مهمة

1. هذا لا يعني أن Phase 1 اكتملت 100%؛ هذا هو تنفيذ أول قوي لإغلاق أخطر الفتحات.
2. لا يزال مطلوباً في الخطوة القادمة إضافة تحقق same-tenant داخل كل RPC لكل FK حساس، مثل `supplier_id`, `po_id`, `contract_id`, `invoice_id`.
3. لا يزال مطلوباً اختبار SQL فعلي بـ JWT context للتأكد من RLS بين شركتين.
4. لا يزال مطلوباً تطبيق migration على قاعدة Supabase/بيئة اختبار حقيقية لأن البيئة الحالية لا تحتوي `psql`.

---

## الخطوة التالية المقترحة

البدء مباشرة في:

```text
Phase 1.2 — FK Same-Tenant Assertions + Real RLS Test Harness
```

أي إضافة تحقق صريح داخل RPCs:

```sql
IF NOT EXISTS (
  SELECT 1 FROM public.suppliers
  WHERE id = p_supplier_id
    AND tenant_id = v_tenant
) THEN
  RAISE EXCEPTION 'SUPPLIER_NOT_IN_TENANT';
END IF;
```

ثم تشغيل migrations على قاعدة اختبار حقيقية.
