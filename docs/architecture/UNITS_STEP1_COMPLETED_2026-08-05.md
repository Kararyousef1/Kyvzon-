# معمارية الوحدات — الخطوة ١ مكتملة

**التاريخ:** 2026-08-05 · **المايجريشن:** `0302` + `0303` · **مُختبَر محلياً · لم يُطبَّق على الإنتاج**

---

## ما بُني

النموذج الأول الكامل: **وحدة «الحركة» داخل بوابة المدير**. البنية عامة تتسع للوحدات الثلاث عشرة الباقية.

### السند المعياري (بحث قبل التنفيذ)

| النمط | المصدر |
|---|---|
| **Scoped Roles** — `User → Role → Scope` | [OSO, RBAC Best Practices 2025](https://www.osohq.com/learn/rbac-best-practices) · [LoginRadius](https://www.loginradius.com/blog/identity/design-effective-rbac-system) |
| تجنّب **"role explosion"** | [r/ExperiencedDevs](https://www.reddit.com/r/ExperiencedDevs/comments/zd5ami/what_are_the_best_practices_around_developing_rbac/) |
| **مركز موافقات موحّد** | [Odoo Approvals](https://www.odoo.com/app/approvals) |

ولم نخترع شيئاً: النمط مطبَّق في مشروعنا مرتين — `entity_memberships` (0126) و`resolveEffectiveRoles/walkUp`.

---

## `0302` — الأساس

### الجدول

```sql
portal_unit_assignments (
  user_id · base_role('manager'|'supervisor') · unit_key
  · scope_type('department'|'branch'|'tenant') · scope_id
  · is_active · origin('manual'|'org_sync')
)
```

**لماذا `scope_type`؟** بلا نطاق يعود «مدير الوحدة» مديراً على الشركة كلها.

**تفصيل دقيق:** استعملتُ **فهرسين جزئيين** لا `UNIQUE` واحداً — لأن `UNIQUE` يعامل `NULL` كقيمة مميزة فيسمح بتكرار صفوف `scope_type='tenant'`:

```sql
uq_portal_unit_scoped      ... WHERE scope_id IS NOT NULL
uq_portal_unit_tenant_wide ... WHERE scope_id IS NULL
```

### الدوال الثلاث

| الدالة | الغرض |
|---|---|
| `my_portal_units()` | وحدات المستخدم الحالي |
| `has_portal_unit(role, unit)` | هل له الوحدة؟ **المدير يشمل صلاحية المشرف** |
| `is_in_my_team(user_id)` | ثلاث طبقات انتماء |

### 🔴 فجوة بنيوية اكتُشفت أثناء التنفيذ

كتبتُ `is_in_my_team` معتمداً على `profiles.department_id` — فاكتشفتُ بالفحص أنه **غير موجود**:

| الجدول | العمود | النوع |
|---|---|---|
| `profiles` | `department` | **TEXT — نصّ حر** |
| `employees` | `department_id` | UUID — مفتاح أجنبي |

فبنيتُ جسراً بترتيب موثوقية تنازلي:
1. `employees.department_id` عبر `employees.user_id` ← الأوثق
2. مطابقة `profiles.department` بالاسم (بلا حساسية لحالة الأحرف، مع تشذيب)

**هذا دين تقني قائم في المشروع** — وثّقتُه ولم أُخفِه.

---

## `0303` — منظور الفريق لا نسخة البوابة

**المبدأ الحاكم:** لم أنسخ صفحات الحركة الـ22 داخل بوابة المدير. بنيتُ منظوراً يجيب: «ما الذي يخصّ فريقي؟»

خمس دوال، كلها بطبقتَي حماية:
1. `require_portal_unit('manager','movement')` — هل له الوحدة؟
2. `is_in_my_team(employee_id)` — هل هذا من فريقه؟

القرار يسجّل أثره في `employee_movement_approvals` **القائم** — لا جدول جديد.

---

## الواجهة

```
src/shared/constants/portalUnits.ts        كتالوج 9 وحدات (مصدر حقيقة واحد)
src/shared/hooks/usePortalUnits.ts         hook الوحدات
src/services/sdk/PortalUnitService.ts      إسناد + مزامنة (بلا حذف نهائي)
src/services/sdk/ManagerMovementUnitService.ts  منظور الحركة + ترجمة الأخطاء للعربية
src/router/guards/RequirePortalUnit.tsx    حارس المسار
src/pages/manager/units/ManagerUnitNav.tsx تنقّل داخل الوحدة
src/pages/manager/units/movement/ManagerMovementApprovalsPage.tsx
src/pages/manager/units/movement/ManagerMovementTeamPage.tsx
```

**المسار:** `/app/manager/units/movement/*` — يوثّق نفسه ويتسع.

**بلا `prompt()`** — نافذة حوار بدلها (المخالفة القائمة في `ManagerApprovalsPage` تُصلَح في الخطوة ٢).

---

## التحقق الفعلي

### 232 مايجريشن من الصفر · صفر فشل

### الاختبار السلوكي — 37/37

أبرزها:

| # | الاختبار | النتيجة |
|---|---|---|
| 1-6 | قيود النطاق والتفرّد | ✅ كلها ترفض الخطأ |
| 7 | الفريق يشمل **حفيد القسم** (وراثة الشجرة) | ✅ |
| 8 | الفريق **لا** يشمل قسماً آخر | ✅ |
| 9 | الفريق يشمل المرؤوس المباشر ولو في قسم آخر | ✅ |
| 13 | المدير يشمل صلاحية المشرف في وحدته | ✅ |
| 16-17 | المدير يرى تصريح فريقه **وحده** | ✅ |
| **21** | **يرفض الاعتماد خارج الفريق** | ✅ `EMPLOYEE_NOT_IN_MY_TEAM` |
| 22 | تصريح القسم الآخر **لم يتغيّر** | ✅ |
| 29-37 | `anon` لا ينفّذ أياً من الثماني | ✅ |

### اختبار العقد — 49/49

يحرس التطابق الثلاثي: كتالوج TS ↔ قيد `0302` ↔ `ModuleKey`.

---

## ⚠️ خطأان اكتشفتهما في عملي نفسه

### ١. توقّع خاطئ في اختبار سلوكي

`team_size=3` بينما توقّعتُ 2. **الفحص أثبت أن الدالة صحيحة وتوقّعي خاطئ**: المدير الثالث قسمه «التقنية» أيضاً فهو داخل نطاق المدير. النطاق **مكاني** (القسم وفروعه) لا هرمي.

صحّحتُ الاختبار لا الدالة، ووثّقتُ السبب.

### ٢. اختبار عقد لا يكشف الانحدار

عند إثبات الكشف، حذفتُ `AND public.is_in_my_team(...)` من `WHERE` فـ**مرّت الاختبارات 48/48**. تأكيدي كان فضفاضاً: يبحث عن الاسم في أي موضع.

أصلحتُه ليتحقق من الموضع داخل `WHERE` تحديداً، وأضفتُ تأكيداً يعدّ الاستعلامات الفرعية الستة في `team_kpis`. ثم أعدتُ اختبار الانحدار:

```
(أ) حذف فحص الوحدة من الشريط  → × يُخفي صفحات الوحدة غير المُسنَدة
(ب) حذف فلترة الفريق من WHERE → × كل استعلام يفلتر بـ is_in_my_team داخل WHERE
(ج) حذف فلترة من team_kpis    → × كل استعلام فرعي في team_kpis يفلتر بالفريق
```

الثلاثة تُكشف الآن.

---

## بوابات الجودة

| البوابة | النتيجة |
|---|---|
| `type-check` | ✅ صفر خطأ |
| `test:run` | ✅ **1493/1493** في 100 ملف (كانت 1444/99 — صافي +49) |
| `build` | ✅ 7.95 ثانية |
| `lint` | ✅ 0 خطأ |
| `db:contract-check` | ✅ PASS |
| `sdk:boundary-check` | ✅ صفر انتهاك في وحدات المدير |
| 232 مايجريشن من الصفر | ✅ صفر فشل |
| السلوكي | ✅ 37/37 |
| إعادة التطبيق ×2 | ✅ آمن للتكرار |

---

## خطوتك — اختبار في المتصفح

```bash
npx supabase db push
```

ثم:

**١. أسنِد الوحدة** (مؤقتاً بـSQL حتى تُبنى واجهة الخطوة ٣ في الخطوة التالية):

```sql
INSERT INTO public.portal_unit_assignments
  (tenant_id, user_id, base_role, unit_key, scope_type, scope_id)
SELECT p.tenant_id, p.id, 'manager', 'movement', 'department', d.id
  FROM public.profiles p
  JOIN public.departments d
    ON d.tenant_id = p.tenant_id
   AND lower(btrim(d.name_ar)) = lower(btrim(p.department))
 WHERE p.email = '[بريد المدير]';
```

**٢. تحقّق:**
- الشريط يعرض «وحدة الحركة — اعتماد التصاريح» و«حركة الفريق»
- تفتحان وتعملان
- مدير **بلا** إسناد لا يرى الصفحتين إطلاقاً

**٣. اختبار العزل — الأهم:** أنشئ تصريحاً لموظف من قسم آخر، وتأكد أن المدير **لا يراه**.

---

## الخطوة ٢ المقترحة

**واجهة إسناد الوحدات في الخطوة ٣ من معالج إدارة المستخدمين.**

عند اختيار «مدير» تظهر بطاقات الوحدات التسع (النشطة قابلة للاختيار، المخطَّطة معطَّلة بوسم «قريباً») مع اختيار النطاق — قسم أو فرع أو الشركة.

هذا يُغني عن SQL اليدوي أعلاه، ويكمل الدورة.

**بعدها:** الوحدات الباقية · العرض الموحّد للموافقات · الهيكل التنظيمي · مصير `movement_manager`.

---

## الملفات

```
supabase/migrations/0302_portal_unit_assignments.sql          (جديد)
supabase/migrations/0303_manager_movement_unit_functions.sql  (جديد)
tools/dev/verify-portal-units-0302-0303.sql                   (جديد — 37 اختباراً)
src/shared/constants/portalUnits.ts                           (جديد)
src/shared/hooks/usePortalUnits.ts                            (جديد)
src/services/sdk/PortalUnitService.ts                         (جديد)
src/services/sdk/ManagerMovementUnitService.ts                (جديد)
src/router/guards/RequirePortalUnit.tsx                       (جديد)
src/pages/manager/units/ManagerUnitNav.tsx                    (جديد)
src/pages/manager/units/movement/*.tsx                        (جديد — صفحتان)
src/test/portalUnitsArchitectureContract.test.ts              (جديد — 49 اختباراً)
src/router/AppRouter.tsx · legacyRedirect.ts                  (معدَّل)
src/shared/components/dashboard/Sidebar.tsx                   (معدَّل)
src/pages/hybridportal/hybridPagesCatalog.ts                  (معدَّل)
src/pages/admin/AdminEmployeesPage.tsx                        (معدَّل)
src/core/constants/permissions.ts                             (معدَّل)
```

**لم يُنفَّذ `git push` ولا `db push`.**
