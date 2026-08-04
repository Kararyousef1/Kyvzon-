# 🔐 قاعدة البيانات والأمان

## 1) نموذج العزل متعدد المستأجرين

كل جدول أعمال يحوي `tenant_id UUID NOT NULL REFERENCES public.tenants(id)`.

### الدوال المساعدة (موجودة فعلاً — استخدمها ولا تعيد اختراعها)

```sql
public.current_user_tenant_id()            -- UUID المستأجر من الجلسة
public.current_user_role()                 -- دور المستخدم
public.current_user_is_staff()             -- موظف داخلي؟
public.current_user_employee_id()
public.current_user_is_hybrid()
public.current_user_is_platform_owner()
public.current_user_subscription_plan()
public.current_user_can_access_legal_entity(UUID)
public.current_user_can_manage_legal_entity(UUID)
```

### قالب RLS المعتمد

```sql
ALTER TABLE public.x ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS x_select ON public.x;
CREATE POLICY x_select ON public.x
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
     AND (public.current_user_is_staff()
          OR public.current_user_role() IN ('procurement','admin')));
```

Views تُنشأ بـ `WITH (security_invoker = true)` لتحترم RLS.

---

## 2) ★★ أخطر مزلق في المشروع: صلاحيات Supabase الافتراضية

### المشكلة

Supabase يضبط على كل مشروع:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
```

⇒ **كل دالة جديدة تُمنَح تلقائياً لـ `anon` بمنحة صريحة.**

### لماذا `REVOKE ... FROM PUBLIC` لا يكفي

```sql
REVOKE ALL ON FUNCTION public.f() FROM PUBLIC;   -- ❌ لا يكفي
```

`REVOKE FROM PUBLIC` يسحب منحة `PUBLIC` **الضمنية** فقط. أما منحة
Supabase فهي **صريحة** للدور `anon`:

```
proacl = {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
                                ^^^^^^^^^^^^^^^ لا يمسّها REVOKE FROM PUBLIC
```

### الحل الصحيح

```sql
REVOKE ALL ON FUNCTION public.f() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.f() FROM anon, authenticated;  -- ★ صريح
GRANT EXECUTE ON FUNCTION public.f() TO service_role;
```

### حادثة حقيقية (2026-08-04)

المايجريشن `0268` فشل عند `supabase db push` بـ:
```
ERROR: 0268 failed: anon must not execute the cron dispatcher (SQLSTATE P0001)
```

الحارس كان **يمنع ثغرة حقيقية**. الاستغلال المُثبَت قبل الإصلاح:

```
إشعارات قبل: 0
SET ROLE anon;
SELECT * FROM dispatch_contract_renewal_notifications_for_tenant('<مستأجر غير مملوك>');
 contracts_notified | notifications_created
                  1 |                     1
إشعارات بعد: 1     ← زائر غير مسجَّل كتب في مستأجر لا يملكه
```

**السبب:** دوال cron **لا تفحص `auth.uid()`** — بالتصميم، لأنها تعمل
بلا جلسة. فالصلاحية هي خط دفاعها **الوحيد**.

### القاعدة المستخلَصة

> أي دالة `SECURITY DEFINER` **لا** تفحص `auth.uid()` داخلياً **يجب**
> أن تُسحب منها صلاحية `anon` و`authenticated` صراحةً.
> وأضف حارس `has_function_privilege` في نهاية المايجريشن.

```sql
IF has_function_privilege('anon', 'public.f(uuid)', 'EXECUTE') THEN
  RAISE EXCEPTION 'anon must not execute %', 'public.f(uuid)';
END IF;
```

---

## 3) حراس نهاية المايجريشن — إلزامي

كل مايجريشن ينتهي بكتلة تأكيد تُفشِله عند نقص أي كائن:

```sql
DO $$
BEGIN
  IF to_regclass('public.my_table') IS NULL THEN
    RAISE EXCEPTION '0270 failed: my_table missing';
  END IF;
  IF to_regprocedure('public.my_fn(uuid)') IS NULL THEN
    RAISE EXCEPTION '0270 failed: my_fn missing';
  END IF;
  RAISE NOTICE '✅ 0270: applied';
END $$;
```

ثم `NOTIFY pgrst, 'reload schema';` لتحديث PostgREST.

---

## 4) صلاحيات المالية (سبب شائع لأخطاء 403)

`entity_memberships.finance_role`:

| الدور | الصلاحية |
|---|---|
| `viewer` · `approver` | قراءة فقط |
| `accountant` · `finance_manager` · `entity_admin` | إنشاء وتعديل |

> `NOT_AUTHORIZED_FOR_ENTITY` سببه الدور غالباً، **لا عطل**.
> من ينشئ الكيان يصبح `entity_admin` تلقائياً.

## 5) صلاحيات المشتريات

`public.procurement_require_roles(TEXT[])` ترفع:
- `NO_AUTH` إذا `auth.uid() IS NULL`
- `NO_TENANT` إذا لا مستأجر
- `NOT_AUTHORIZED_FOR_PROCUREMENT_OPERATION` إذا الدور غير مسموح

`developer` و`it_admin` مسموحان دائماً للتشخيص.

---

## 6) قيم حقيقية للأعمدة (مُحقَّقة — لا تخمّن)

| الجدول | الحقيقة |
|---|---|
| `spend_transactions` | `category_code` (نص) **لا** `category_id` |
| `departments` | `name_ar` **لا** `name` |
| `budgets` | `budget_name` فقط — **لا يوجد** `name` |
| `supplier_documents` | `doc_type` **لا** `document_type` |
| `sourcing_events` | `type` **لا** `event_type` · القيم `RFI/RFQ/RFP/auction` |
| `rfx_evaluation_criteria` | `label_ar` **لا** `criterion_label` |
| `inventory_warehouses` | `warehouse_code`, `name_ar`, `status` (لا `code`/`is_active`) |
| `tenants` | يتطلب `name` + `name_ar` + `slug` (كلها NOT NULL) |
| `notifications` | `tenant_id,user_id,type,title,message,is_read,related_table,related_id,priority,metadata` |
| `procurement_auctions.status` | `scheduled` · `live` · `ended` · `cancelled` — **لا `closed`** |
| `supplier_invoices.duplicate_status` | `clean` · `suspected_duplicate` · `confirmed_duplicate` |
| `purchase_orders` | `total_before_tax` عادي؛ `tax_amount` و`total_amount` **GENERATED** |
| `supplier_bids.effective_price` | GENERATED من `total_price * (1 - discount_percent/100)` |
| `supplier_risk_assessments` | درجات 0–20 لكل بُعد؛ `total_score`/`risk_level` GENERATED |

### أعمدة GENERATED — لا تحاول كتابتها
`purchase_orders.tax_amount` · `total_amount` · `supplier_bids.effective_price`
· `supplier_risk_assessments.total_score` · `risk_level`
