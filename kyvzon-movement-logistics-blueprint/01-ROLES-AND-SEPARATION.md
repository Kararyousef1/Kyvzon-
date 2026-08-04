# 👥 فصل الدورين — الآلية الكاملة

> **المتطلب الحرفي من المستخدم:**
> «كل دور سيعرض وحداته وصفحاته الخاصة فقط»

---

## 1) تعريف الدورين

| | الدور «أ» | الدور «ب» |
|---|---|---|
| **المفتاح** | `employee_movement` | `logistics` |
| **الاسم** | حركة الموظفين | الحركة واللوجستيات |
| **السؤال** | من خرج؟ متى؟ لماذا؟ متى عاد؟ | أين البضاعة؟ أي مركبة؟ أي سائق؟ كم كلّفت؟ |
| **الكيان المركزي** | الموظف | الشحنة / المركبة |
| **المستخدم** | HR · حارس · مشرف | مدير أسطول · مُرسِل · سائق |
| **الوحدات** | 7 (E00–E06) | 12 (L00–L11) |
| **الصفحات** | 28 | 61 |

### حدود لا تُخترق
- الدور «أ» **لا يرى** المركبات ولا الشحنات ولا المسارات.
- الدور «ب» **لا يرى** تصاريح خروج الموظفين ولا الزيارات الميدانية.
- **الاستثناء الوحيد:** السائق موظف أيضاً — تظهر ساعات قيادته في الحضور
  عبر تكامل مضبوط، لا عبر خلط الواجهات.

---

## 2) نموذج البيانات

```sql
CREATE TABLE public.movement_role_assignments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  portal_role   TEXT NOT NULL
    CHECK (portal_role IN ('employee_movement','logistics')),
  access_level  TEXT NOT NULL DEFAULT 'operator'
    CHECK (access_level IN ('viewer','operator','supervisor','admin')),
  is_default    BOOLEAN NOT NULL DEFAULT false,  -- الدور المفتوح افتراضياً
  assigned_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at    TIMESTAMPTZ,
  revoke_reason TEXT,                            -- سبب إلزامي عند السحب
  UNIQUE (tenant_id, user_id, portal_role)
);
```

> **لا حذف** — السحب بـ `revoked_at` + سبب نصي (سياسة المنصة).

### مصفوفة الصلاحيات

| `access_level` | القراءة | الإنشاء | الاعتماد | الإعدادات |
|---|:---:|:---:|:---:|:---:|
| `viewer` | ✅ | ❌ | ❌ | ❌ |
| `operator` | ✅ | ✅ | ❌ | ❌ |
| `supervisor` | ✅ | ✅ | ✅ | ❌ |
| `admin` | ✅ | ✅ | ✅ | ✅ |

---

## 3) دوال الحماية

```sql
-- هل يملك المستخدم الحالي هذا الدور؟
CREATE OR REPLACE FUNCTION public.movement_has_role(p_role TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.movement_role_assignments a
     WHERE a.tenant_id = public.current_user_tenant_id()
       AND a.user_id   = auth.uid()
       AND a.portal_role = p_role
       AND a.revoked_at IS NULL
  ) OR public.current_user_role() IN ('admin','developer','it_admin');
$$;

-- حارس يرفع استثناءً — يُستدعى في بداية كل RPC
CREATE OR REPLACE FUNCTION public.movement_require_role(
  p_role TEXT,
  p_min_level TEXT DEFAULT 'operator'
)
RETURNS VOID LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_level TEXT;
  v_rank  INT;
  v_need  INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'NO_AUTH'; END IF;
  IF public.current_user_tenant_id() IS NULL THEN RAISE EXCEPTION 'NO_TENANT'; END IF;

  IF public.current_user_role() IN ('admin','developer','it_admin') THEN RETURN; END IF;

  SELECT access_level INTO v_level
    FROM public.movement_role_assignments
   WHERE tenant_id = public.current_user_tenant_id()
     AND user_id = auth.uid() AND portal_role = p_role
     AND revoked_at IS NULL;

  IF v_level IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_FOR_MOVEMENT_ROLE (%)', p_role;
  END IF;

  v_rank := CASE v_level
    WHEN 'viewer' THEN 1 WHEN 'operator' THEN 2
    WHEN 'supervisor' THEN 3 WHEN 'admin' THEN 4 END;
  v_need := CASE p_min_level
    WHEN 'viewer' THEN 1 WHEN 'operator' THEN 2
    WHEN 'supervisor' THEN 3 WHEN 'admin' THEN 4 END;

  IF v_rank < v_need THEN
    RAISE EXCEPTION 'INSUFFICIENT_MOVEMENT_ACCESS_LEVEL (have=%, need=%)',
      v_level, p_min_level;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.movement_require_role(TEXT,TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.movement_require_role(TEXT,TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.movement_require_role(TEXT,TEXT) TO authenticated;
```

> ⚠️ **السحب من `anon` صريح** — راجع `kyvzon-ai-context/02-DATABASE-AND-SECURITY.md`.
> منحة Supabase التلقائية لا يسحبها `REVOKE FROM PUBLIC`.

### قالب RLS لكل جدول لوجستي
```sql
CREATE POLICY x_select ON public.x FOR SELECT TO authenticated
  USING (tenant_id = public.current_user_tenant_id()
     AND public.movement_has_role('logistics'));
```

---

## 4) طبقة الواجهة

### أ) الحارس

`src/router/guards/RequireMovementRole.tsx`

```tsx
export function RequireMovementRole({ role }: { role: 'employee_movement' | 'logistics' }) {
  const { roles, loading } = useMovementRoles();
  if (loading) return null;
  if (!roles.includes(role)) {
    return <MovementRoleDenied requestedRole={role} availableRoles={roles} />;
  }
  return <Outlet />;
}
```

> `MovementRoleDenied` تعرض رسالة عربية واضحة + زر تبديل للدور المتاح —
> لا شاشة 403 صمّاء.

### ب) المسارات

```tsx
<Route path="movement" element={<RequireRole roles={[...]} />}>
  <Route element={<RequireModule moduleKey="movement" />}>
    <Route index element={<MovementRoleSelector />} />

    <Route path="employee" element={<RequireMovementRole role="employee_movement" />}>
      <Route path="foundation" element={<EmpFoundationPage />} />
      <Route path="permits"    element={<PermitsPage />} />
      {/* … 28 صفحة */}
    </Route>

    <Route path="logistics" element={<RequireMovementRole role="logistics" />}>
      <Route path="foundation" element={<LogFoundationPage />} />
      <Route path="fleet"      element={<FleetPage />} />
      {/* … 61 صفحة */}
    </Route>
  </Route>
</Route>
```

### ج) الشريط الجانبي

في `splitInventorySection` بـ `Sidebar.tsx`:

```ts
if (section.key === 'movement-main') {
  const activeRole = getActiveMovementRole();   // من السياق
  const mainIds = activeRole === 'logistics'
    ? ['movement-log-foundation','movement-log-fleet', /* 12 */]
    : ['movement-emp-foundation','movement-emp-permits', /* 7 */];
  return [{ ...section, items: section.items.filter(i => mainIds.includes(i.id)) }];
}
```

### د) مبدّل الدور

يظهر **فقط** لمن يملك الدورين، أعلى الشريط:

```
┌──────────────────────────────┐
│  🚶 حركة الموظفين  │  🚚 اللوجستيات  │
└──────────────────────────────┘
```
الاختيار يُحفظ في `localStorage` + `movement_role_assignments.is_default`.

---

## 5) ★ التسجيل في المواضع الأربعة

كل صفحة من الـ89 تحتاج تسجيلاً في **الأربعة معاً**:

| # | الملف | ماذا |
|---|---|---|
| 1 | `src/shared/components/dashboard/Sidebar.tsx` | العنصر + `MOVEMENT_UNIT_FALLBACK` |
| 2 | `src/pages/hybridportal/hybridPagesCatalog.ts` | معرّف الصفحة |
| 3 | `src/pages/admin/AdminEmployeesPage.tsx` | صلاحية الصفحة |
| 4 | `src/router/AppRouter.tsx` + `legacyRedirect.ts` | المسار + تحويل القديم |

> نسيان واحد = صفحة تختفي عند مستخدمي `allowed_pages`.

### تحويلات المسارات القديمة
```ts
'/app/gatekeeper/movements'  → '/app/movement/employee/execution'
'/app/hr/movement-analysis'  → '/app/movement/employee/analytics'
```

---

## 6) اختبارات العزل الإلزامية

```
✅ صاحب employee_movement فقط → /app/movement/logistics/fleet = مرفوض
✅ صاحب logistics فقط → /app/movement/employee/permits = مرفوض
✅ صاحب الدورين → كلاهما + المبدّل ظاهر
✅ صاحب دور واحد → المبدّل مخفي
✅ الشريط الجانبي يعرض وحدات الدور النشط فقط
✅ RPC لوجستي بدور موظفين → NOT_AUTHORIZED_FOR_MOVEMENT_ROLE
✅ viewer يحاول الإنشاء → INSUFFICIENT_MOVEMENT_ACCESS_LEVEL
✅ anon على أي RPC → permission denied
✅ مستأجر آخر → صفر صفوف (RLS)
```
