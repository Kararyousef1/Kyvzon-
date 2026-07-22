# 🏗️ دليل إنشاء بوابة/وحدة جديدة في نظام Kyvzon

> **اقرأ هذا الملف بالكامل قبل بناء أي بوابة أو دور جديد.**
> كُتب بعد بناء بوابة التسويق، ويوثّق **كل** نقاط الربط الإلزامية + **الأخطاء الحقيقية التي وقعنا فيها** حتى لا تتكرر.

---

## 0. المفاهيم الأساسية (افهمها أولاً)

في Kyvzon هناك مفهومان منفصلان يجب عدم الخلط بينهما:

| المفهوم | ما هو | أين يُعرّف |
|---------|-------|-----------|
| **الوحدة (Module)** | بوابة تُفعَّل/تُعطَّل لكل شركة (tenant) — مثل `marketing`, `finance`, `hr` | `TenantModuleCatalog.ts` + جدول `tenant_modules` |
| **الدور (Role)** | صفة المستخدم داخل شركته — مثل `marketing`, `employee`, `hr` | `UserRole` type + عمود `profiles.role` |

بوابة قد تحتاج **الاثنين معاً**: وحدة تُفعَّل للشركة + دور يستخدمها الموظف.

**قاعدة ذهبية:** إضافة قيمة جديدة لنوع `UserRole` يجعل TypeScript يكتشف **بعض** الأماكن الناقصة (عبر `Record<UserRole, ...>`) — **لكن ليس كلها**. الأماكن التي تستخدم `string` بدل `UserRole`، أو قوائم `Set`/مصفوفات، **لن يكتشفها المترجم** — وهي بالضبط مصدر أخطائنا. لذلك اتبع القائمة أدناه حرفياً.

---

## 1. ✅ قائمة التحقق الكاملة لإضافة **دور جديد** (Role)

عند إضافة دور جديد (مثال: `sales`)، عدّل **كل** هذه الملفات. الرقم بجانبها = هل يكتشفها المترجم؟

| # | الملف | التعديل | يكتشفه TS؟ |
|---|-------|---------|:----------:|
| 1 | `src/shared/types/index.ts` | أضف القيمة لنوع `UserRole` | — (المصدر) |
| 2 | `src/core/constants/permissions.ts` | أضف مدخلاً في `DEFAULT_ROLE_PERMISSIONS` | ✅ نعم |
| 3 | `src/shared/components/dashboard/Sidebar.tsx` | أضف مدخلاً في `ROLE_CONFIG` (~سطر 390) | ✅ نعم |
| 4 | `src/utils/userUtils.ts` → `getUserRoleBadge()` | أضف تسمية الدور (~سطر 293) | ✅ نعم |
| 5 | ⚠️ **`src/utils/userUtils.ts` → `normalizeRole()` → `validRoles`** | **أضف الدور للمصفوفة (~سطر 214)** | ❌ **لا — خطأنا رقم 1** |
| 6 | `src/router/constants.ts` → `ROLE_DEFAULT_PATH` | أضف مسار الصفحة الافتراضية للدور | ❌ لا |
| 7 | ⚠️ **`src/pages/admin/AdminEmployeesPage.tsx` → `ROLES`** | **أضف `{ value, label, color }`** | ❌ **لا — خطأنا رقم 2** |
| 8 | ⚠️ **`src/pages/admin/AdminEmployeesPage.tsx` → `ROLE_MODULE_MAP`** | **اربط الدور بوحدته** `role: 'moduleKey'` | ❌ **لا — خطأنا رقم 2** |
| 9 | ⚠️ **`supabase/functions/_shared/adminAuth.ts` → `TARGET_ROLES`** | **أضف الدور للـ Set** | ❌ **لا — خطأنا رقم 3** |
| 10 | ⚠️ **`supabase/functions/admin-create-user/index.ts` → `TARGET_ROLES` (نسخة محلية)** | **أضف الدور** | ❌ **لا — خطأنا رقم 3** |
| 11 | `supabase/migrations/XXXX_add_<role>.sql` | وسّع قيد `profiles.role` ليقبل الدور | ❌ لا (DB) |
| 12 | `src/pages/hybridportal/hybridPagesCatalog.ts` → `ALL_ROLES` | أضف الدور (لو يجب أن يرى الصفحات الأساسية في الاشتراك الهجين) | ❌ لا |

**بعد التعديل + الرفع:** أعد نشر الـ Edge Functions يدوياً:
```bash
npx supabase functions deploy admin-create-user
npx supabase functions deploy admin-update-role
```
وطبّق migration قيد `profiles.role` على Supabase (SQL Editor أو `db push`).

---

## 2. ✅ قائمة التحقق لإضافة **وحدة جديدة** (Module/Portal)

| # | الملف | التعديل |
|---|-------|---------|
| 1 | `src/services/sdk/TenantModuleCatalog.ts` | أضف المفتاح لنوع `ModuleKey` + عنصراً في `MODULE_CATALOG` + أضفه لـ `PLAN_ALLOWED_MODULES` للخطط المناسبة |
| 2 | `src/router/moduleMap.ts` → `ROUTE_MODULE_MAP` | أضف `{ pathPrefix: '/app/<portal>', moduleKey, label }` (يربط المسار بالوحدة لـ `RequireModule`) |
| 3 | `src/router/AppRouter.tsx` | أضف lazy imports + `<Route path="<portal>" element={<RequireRole roles={[...]} />}>` مع الصفحات الفرعية |
| 4 | `src/router/layouts/AppLayout.tsx` | (اختياري) بدّل لشريط جانبي مخصّص عند التصفّح داخل البوابة |
| 5 | `scripts/tests/99_post_migration_checks.sql` | أضف CHECK جديد يتحقق من وجود جداول/دوال الوحدة |
| 6 | صفحات الوحدة | `src/pages/<portal>/...` + خدمة SDK ترث `BaseService` + تصديرها في `src/services/sdk/index.ts` |
| 7 | migration | `supabase/migrations/XXXX_<module>.sql` — جداول tenant-scoped + **RLS إلزامي** + دوال |
| 8 | (إن كان للوحدة دور) | **أكمل كل بنود القسم 1 أعلاه للدور** |

---

## 3. 🔴 الأخطاء الخمسة التي وقعنا فيها فعلاً (تعلّم منها)

### الخطأ رقم 1 — الأخطر: `normalizeRole` يبتلع الدور
**العَرَض:** الدور محفوظ صحيحاً في قاعدة البيانات (`role = 'marketing'`)، لكن عند تسجيل الدخول يظهر المستخدم كـ `employee` ولا تظهر بوابته.
**السبب:** `normalizeRole()` في `src/utils/userUtils.ts` تحتوي مصفوفة `validRoles` ثابتة؛ أي دور خارجها **يُحوَّل قسراً لـ `employee`**:
```ts
return validRoles.includes(normalizedRole) ? normalizedRole : 'employee'; // ← يبتلع أي دور غير مُدرَج
```
**القاعدة:** كل دور جديد **يجب** أن يُضاف لـ `validRoles`. المترجم **لا** يكتشف هذا لأن المصفوفة `UserRole[]` تقبل أي قيمة صالحة نصياً.

### الخطأ رقم 2 — الدور غير موجود في إدارة المستخدمين
**العَرَض:** الأدمن لا يجد الدور في القائمة عند إنشاء/تعديل موظف.
**السبب:** `ROLES` و `ROLE_MODULE_MAP` في `AdminEmployeesPage.tsx` قوائم يدوية مستقلة عن `UserRole`.
**القاعدة:** أضف الدور للقائمتين. `ROLE_MODULE_MAP` يجعل الدور يظهر **فقط** عند تفعيل وحدته (سلوك صحيح ومقصود).

### الخطأ رقم 3 — الخادم يرفض الدور (Edge Functions)
**العَرَض:** إنشاء/تعديل موظف بالدور يفشل من الخادم (أو "نجاح" كاذب).
**السبب:** `admin-create-user` و `admin-update-role` تتحققان من `TARGET_ROLES` (Set في `_shared/adminAuth.ts` + نسخة محلية). دور خارجها = رفض.
**القاعدة:** أضف الدور للـ Set في الموضعين، **وأعد نشر الـ functions** (الرفع لـ GitHub لا ينشرها تلقائياً).

### الخطأ رقم 4 — تحديث الدور عبر العميل بدل Edge Function
**العَرَض:** تعديل دور موظف يظهر "نجاح" لكن أحياناً لا يُحفَظ بثبات.
**السبب:** `handleSave` كان يمرّر `role` مباشرة عبر `userService.updateUser` (عميل RLS).
**القاعدة:** غيّر الدور **دائماً** عبر `adminUserService.updateUserRole()` → Edge Function `admin-update-role` (service_role، يتجاوز RLS، يتحقق أمنياً، يسجّل audit). لا تُحدّث `profiles.role` مباشرة من الواجهة.

### الخطأ رقم 5 — تعارض أسماء الجداول
**العَرَض:** migration يفشل بخطأ `column ... does not exist` بسبب `CREATE TABLE IF NOT EXISTS` على اسم موجود بسكيمة مختلفة.
**السبب:** اخترنا `survey_responses` وكان موجوداً من migration HR قديم.
**القاعدة:** قبل تسمية أي جدول جديد، ابحث: `grep -rl "CREATE TABLE.*<name>" supabase/migrations/`. استخدم بادئة مميّزة عند التعارض (فعلنا `mkt_survey_*`).

---

## 4. 🔑 نقاط ربط معمارية مهمة

- **RLS إلزامي**: كل جدول جديد `tenant_id UUID NOT NULL REFERENCES tenants(id)` + سياسات `SELECT`/`ALL` على `tenant_id = public.current_user_tenant_id()`.
- **BaseService**: كل خدمة SDK ترث `BaseService<T>` (تحقن `tenant_id` تلقائياً). تصريح الخدمة في `src/services/sdk/index.ts`.
- **الدوال (RPC)**: العمليات الحساسة عبر `SECURITY DEFINER` + `SET search_path = public` + فحص `tenant_id = current_user_tenant_id()` داخل الدالة.
- **حالة الوحدة**: `status: 'beta'` لا تُحجب؛ فقط `'planned'` تُنبّه (`RequireModule`).
- **ملفات Edge Functions** (Deno): خارج نطاق `tsconfig` (يشمل `src` فقط) — استخدم `supabase/functions/deno.json` + إضافة Deno في VS Code لتفادي أخطاء المحرّر الوهمية.

---

## 5. 🧪 التحقق قبل كل رفع (إلزامي)

```bash
npx tsc --noEmit          # يجب: 0 أخطاء
npx eslint src            # يجب: 0 errors (التحذيرات دَين متتبّع مقبول)
npx vitest run            # يجب: كل الاختبارات تمر
npx vite build            # يجب: ✓ built
# اختبار migrations محلياً (Postgres):
#   00_supabase_shim.sql + كل migrations + 99_post_migration_checks.sql
```

**أضف اختبار حماية** لكل نقطة ربط هشة (مثل `normalizeRoleMarketing.test.ts` الذي يمنع رجوع الخطأ رقم 1).

---

## 6. 📋 مسار الاختبار الحي بعد الرفع

1. بوابة المطوّر → `ModulesPage` → فعّل الوحدة لشركة (تأكّد من الخطة).
2. بوابة الأدمن → إدارة المستخدمين → أنشئ/عدّل موظفاً واختر الدور الجديد (يجب أن يظهر).
3. سجّل دخول بالموظف → يُوجَّه لبوابته ويراها.
4. عطّل الوحدة → يجب أن تُحجب برسالة "غير مفعلة".
5. **بعد تعديل Edge Functions**: `npx supabase functions deploy ...`.
6. **بعد تعديل الواجهة**: أعد بناء/نشر الواجهة (الاستضافة) — إصلاحات مثل `normalizeRole` أمامية ولن تظهر بلا إعادة نشر.

---

*آخر تحديث: يوليو 2026 — بعد إكمال بوابة التسويق وإصلاح تكامل الأدوار.*
