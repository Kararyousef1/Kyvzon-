# معمارية الوحدات — خطة الخطوة ١

**التاريخ:** 2026-08-05 · **الحالة:** خطة للمراجعة · **لم أكتب سطر شيفرة**

---

## أولاً: ما وجدتُه في البحث (سند خارجي)

بحثتُ عن النمط المعياري قبل أن أخترع شيئاً. النتيجة: **فكرتك تطابق نمطين معروفين في الصناعة.**

### النمط ١ — Scoped Roles (`User → Role → Scope`)

> "Real organizations need scoped roles, not global ones... design for User → Role → Scope relationships from the start. A department head may need admin rights in their department, but zero access for others."
> — [OSO, 10 RBAC Best Practices 2025](https://www.osohq.com/learn/rbac-best-practices)

> "Encoding scope directly into role assignments keeps the model flexible without multiplying roles."
> — [LoginRadius, Access Control Design](https://www.loginradius.com/blog/identity/design-effective-rbac-system)

والمشكلة التي تتجنّبها مُسمّاة صراحةً **"role explosion"**:

> "Leads to role explosion fast. Keep roles coarse-grained, tied to job functions."
> — [r/ExperiencedDevs](https://www.reddit.com/r/ExperiencedDevs/comments/zd5ami/what_are_the_best_practices_around_developing_rbac/)

**ترجمة لحالتنا:** `manager` = الدور (خشن، مرتبط بوظيفة) · الوحدة = النطاق (Scope).

### النمط ٢ — مركز موافقات موحّد

> "Odoo Approvals allows you to manage every request from one centralized hub. Because approving referrals, rentals, procurement, contracts, and payments shouldn't make you open so many different apps."
> — [Odoo Approvals](https://www.odoo.com/app/approvals)

**هذا حرفياً ما تصفه.** والحل عندهم: mixin واحد ترثه كل الوحدات، لا 16 نظاماً منفصلاً.

---

## ثانياً: سوابق قائمة في مشروعنا (لا نخترع)

فحصتُ الشيفرة فوجدتُ النمط **مطبَّقاً بالفعل مرتين**:

### `entity_memberships` (0126) — سابقة Scoped Role

```sql
tenant_id · legal_entity_id · user_id · finance_role · is_active
```

مستخدم + نطاق (كيان قانوني) + دور داخل النطاق. **بالضبط ما نريده** لكن للمالية وحدها.

### `movement_role_assignments` (0270) — سابقة ثانية

```sql
tenant_id · user_id · portal_role · is_active · origin
```

### `resolveEffectiveRoles` + `walkUp` (DepartmentService:103)

منطق **وراثة الأدوار عبر شجرة الأقسام** موجود ويعمل:

```ts
const walkUp = (field: 'manager_id' | 'direct_manager_id' | 'procurement_manager_id') => {
  // يمشي لأعلى السلسلة لإيجاد أول قيمة غير فارغة
```

**قرار:** لن أبني نظام صلاحيات جديداً. سأعمّم `entity_memberships` نمطاً، وأعيد استخدام `walkUp`.

---

## ثالثاً: التصميم المقترح

### الجدول الأساسي: `portal_unit_assignments`

```sql
CREATE TABLE public.portal_unit_assignments (
  id            UUID PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  user_id       UUID NOT NULL REFERENCES profiles(id),
  base_role     VARCHAR(20) NOT NULL CHECK (base_role IN ('manager','supervisor')),
  unit_key      VARCHAR(30) NOT NULL,     -- 'movement' · 'hr' · 'finance' …
  scope_type    VARCHAR(20) NOT NULL DEFAULT 'department'
                CHECK (scope_type IN ('department','branch','tenant')),
  scope_id      UUID,                     -- NULL مع tenant
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  origin        VARCHAR(20) NOT NULL DEFAULT 'manual',
  UNIQUE (tenant_id, user_id, base_role, unit_key, scope_type, scope_id)
);
```

**لماذا `scope_type` + `scope_id`؟** لأن «مدير الحركة» قد يكون على قسم واحد أو فرع أو الشركة كلها. بلا نطاق سنعود لمشكلة «مدير يرى كل شيء».

### مبدأ حاسم: الوحدة **منظور** لا نسخة

هذا أخطر ما يمكن أن نُخطئ فيه.

| ❌ خطأ | ✅ صواب |
|---|---|
| نسخ 22 صفحة حركة داخل بوابة المدير | صفحتان تعرضان **فريقه فقط** |
| المدير يرى الأسطول والتكاليف | يرى تصاريح موظفيه ومخالفاتهم |
| مضاعفة الصيانة | مصدر بيانات واحد بفلترة مختلفة |

**الوحدة تجيب سؤالاً واحداً: «ما الذي يخصّ فريقي في هذا المجال؟»**

### مصدر «الفريق»

ثلاث طبقات موجودة بالفعل:
1. `profiles.manager_id` / `supervisor_id` — مباشر
2. `departments.manager_id` + `walkUp` — عبر القسم مع وراثة
3. `portal_unit_assignments.scope_id` — نطاق صريح

سأبني دالة `is_in_my_team(p_user_id)` تجمع الثلاث.

---

## رابعاً: نطاق الخطوة ١ بالضبط

**وحدة واحدة فقط: «الحركة» للمدير.** نُثبتها في المتصفح، ثم نعمّم.

### ما سأبنيه

| # | العنصر | التفصيل |
|---|---|---|
| ١ | مايجريشن `0302` | `portal_unit_assignments` + RLS + `is_in_my_team()` + `my_portal_units()` |
| ٢ | كتالوج `PORTAL_UNITS` | مصدر واحد للحقيقة: 9 وحدات مدير + 5 مشرف (نُسجّل كلها، نُفعّل الحركة) |
| ٣ | صفحة `manager-movement-approvals` | اعتماد تصاريح خروج فريقه |
| ٤ | صفحة `manager-movement-team` | حركة الفريق · المخالفات |
| ٥ | خدمة SDK | `PortalUnitService` + `ManagerMovementService` |
| ٦ | الشريط الجانبي | قسم «وحداتي» يعرض الوحدات المُسندة |
| ٧ | الخطوة ٣ في المعالج | بطاقات وحدات عند اختيار مدير/مشرف |
| ٨ | التسجيل في 4 مواضع | Sidebar · Catalog · AdminEmployees · Router+legacyRedirect |
| ٩ | الاختبارات | سلوكي على Postgres + عقد |

### ما **لن** أفعله في الخطوة ١

- ❌ لا ألمس `movement_manager` (قرارك معلّق)
- ❌ لا أوحّد الـ16 جدول موافقات (الخطوة ٢)
- ❌ لا أبني الوحدات الثماني الأخرى
- ❌ لا ألمس الهيكل التنظيمي (خطوة لاحقة)
- ❌ لا أحذف أي دور قائم

---

## خامساً: القرارات التصميمية وتبريرها

| # | القرار | البديل المرفوض | السبب |
|---|---|---|---|
| ١ | جدول جديد `portal_unit_assignments` | أعمدة في `profiles` | يتكاثر بلا حد — نفس داء `procurement_manager_id` |
| ٢ | `scope_type` + `scope_id` | نطاق ضمني (القسم فقط) | المدير قد يكون على فرع أو الشركة |
| ٣ | صفحات جديدة تحت `/app/manager/units/movement/*` | إعادة توجيه لبوابة الحركة | «مكان واحد» — لا قفز بين بوابات |
| ٤ | `PORTAL_UNITS` كتالوج واحد | تعريف مبعثر | منع الانحراف — درس `TARGET_ROLES` |
| ٥ | تسجيل 14 وحدة الآن · تفعيل 1 | تسجيل واحدة | البنية تُختبر بالكامل من البداية |
| ٦ | إعادة استخدام `walkUp` | منطق وراثة جديد | موجود ويعمل |

---

## سادساً: المخاطر

| الخطر | التخفيف |
|---|---|
| **تعارض مع `allowed_pages`** | الوحدات تُنتج `allowed_pages` لا تُبدّله |
| **مدير بلا وحدات يفقد صفحاته الخمس** | الصفحات العامة تبقى بلا شرط وحدة |
| **`prompt()` في `ManagerApprovalsPage`** | لن ألمسها في الخطوة ١ — أُصلحها في الخطوة ٢ |
| **RLS على الجدول الجديد** | سياسة مستأجر + حارس `has_function_privilege` |
| **أداء `is_in_my_team`** | `STABLE` + فهرس على `manager_id` |

---

## سابعاً: معيار النجاح

الخطوة ١ **لا تُعتبر مكتملة** إلا بـ:

1. ✅ 231 مايجريشن من الصفر · صفر فشل
2. ✅ اختبار سلوكي على Postgres محلي (لا فحص نصي فقط)
3. ✅ `type-check` · `build` · `lint` · `test:run` خضراء
4. ✅ إثبات أن الاختبار يكشف الانحدار (عكس الإصلاح ⇒ فشل)
5. ✅ **تفتحها في المتصفح وتراها تعمل**

---

## ثامناً: سؤالان قبل البدء

**١. مسار الوحدات:** أفضّل `/app/manager/units/movement/approvals` — يوضح أن هذه وحدة داخل بوابة المدير. البديل `/app/manager/movement/approvals` أقصر. أيهما؟

**٢. `movement_manager` أثناء الخطوة ١:** سأتركه يعمل كما هو ولن ألمسه. حين تكتمل وحدة المدير للحركة وتراها تعمل، تقرّر مصيره على بيّنة. موافق؟

---

**إن وافقت على الخطة أبدأ التنفيذ فوراً — مايجريشن `0302` أولاً، مُختبَراً على Postgres محلي قبل أي توثيق.**
