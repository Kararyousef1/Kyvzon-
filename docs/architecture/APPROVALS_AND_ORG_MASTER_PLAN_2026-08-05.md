# الخطة الشاملة — الموافقات والهيكل التنظيمي وبوابتا المدير والمشرف

**التاريخ:** 2026-08-05 · **الحالة:** دراسة وتصميم · **لم أكتب سطر شيفرة**

---

## القسم الأول: الواقع كما هو (مسح كامل مُحقَّق)

### ١-١ تسعة أنظمة موافقات — وثلاثة أنماط

| # | النظام | جدول الطلب | جدول الخطوات | كيف يُحدَّد المعتمِد |
|---|---|---|---|---|
| ١ | **HR** (إجازات/أذونات) | `hr_approval_requests` | `hr_approval_steps` | `approver_role` ∈ supervisor/manager/direct_manager → يُحلّ من `departments` |
| ٢ | **المشتريات** (PR) | `procurement_approval_requests` | `procurement_approval_steps` | `approver_role` + **قواعد بالمبلغ** |
| ٣ | **المالية** | `financial_approval_requests` | `financial_approval_steps` | `approver_role` (نصّ حر — بلا CHECK!) |
| ٤ | **العقود** | `contract_approval_requests` | `contract_approval_steps` | `approver_role` ∈ legal/procurement/finance/admin |
| ٥ | **الحركة** | `employee_movement_approvals` | — (مدمج) | `approver_id` مباشرة |
| ٦ | **المخزون** (تسويات) | `inventory_adjustment_approvals` | — (مدمج) | `required_role` |
| ٧ | **التصنيع** (BOM) | `mrp_bom_approvals` | — (مدمج) | `approver_role` ∈ bom_engineer/production_manager/… |
| ٨ | **CRM** (خصومات) | `crm_discount_approvals` | — (مدمج) | `required_level` ∈ none/sales_manager/commercial_ceo |
| ٩ | **العام** | `approval_requests` + `approval_actions` | — | `current_approver_id` |

**ثلاثة أنماط:**
- **أ) طلب + خطوات** (١-٤): ناضج، متعدد المراحل
- **ب) جدول مدمج** (٥-٨): خطوة واحدة غالباً
- **ج) عام مهجور** (٩): **لا أحد يكتب فيه**

### ١-٢ 🔴 الاكتشاف الأخطر: مركز موافقات المدير ميت

```
approval_requests → مايجريشن INSERT: 0  ·  SDK INSERT: 0
```

**لا سطر واحد في النظام كله يُنشئ طلباً فيه.** و`ManagerApprovalsPage` (17 سطراً) يقرأ منه وحده.

النتيجة: **المدير يفتح «مركز الموافقات» فيجد صفحة فارغة أبداً.** ليس عطلاً عارضاً — الجدول مهجور منذ `0023`.

### ١-٣ دالة إنشاء واحدة فقط في النظام

```
FUNCTION public.create_hr_approval     ← الوحيدة
```

البقية تُنشأ يدوياً في مايجريشنات متفرقة أو **لا تُنشأ إطلاقاً**. فحص `INSERT` أثبت:

| الجدول | مصادر الإنشاء |
|---|---|
| `financial_approval_requests` | **صفر** |
| `mrp_bom_approvals` | **صفر** |
| `approval_requests` | **صفر** |

ثلاثة أنظمة موافقات **مبنية ولا تُستخدم**.

### ١-٤ نموذجان ناضجان نبني عليهما

**`resolve_department_chain(dept_id)`** في `0153` — يصعد شجرة الأقسام ويورّث:

```sql
-- المشرف من القسم نفسه فقط · المدير والمدير المباشر يُورَثان من الأب
WHILE v_node IS NOT NULL AND v_depth < 20 LOOP ...
```

**`procurement_approval_rules`** — قواعد بالمبلغ والقسم والمستوى:

```sql
min_amount · max_amount · department_id (NULL = الكل)
· level 1..5 · required_role
```

**هذان هما الأساس.** لا نخترع — نُعمّم.

### ١-٥ الهيكل التنظيمي: ثلاث مشاكل

`OrgStructurePage` (474 سطراً) = شجرة أقسام فقط.

| # | المشكلة | الأثر |
|---|---|---|
| ١ | لا يعرض الأشخاص | ترى الأقسام لا من يرأس من |
| ٢ | `procurement_manager_id` عمود خاص | **دليل انكسار النهج** — كل بوابة ستطلب عمودها |
| ٣ | لا ربط بالموافقات | تُعدّل الهيكل ولا ترى أثره على سلاسل الاعتماد |

**أعمدة `departments` اليوم:** `manager_id` · `supervisor_id` · `direct_manager_id` · `procurement_manager_id`

---

## القسم الثاني: التصميم الشامل

### المبدأ الحاكم

> **محرك موافقات واحد · سلسلة اعتماد واحدة · مركز واحد للمدير — بلا لمس الجداول التسعة.**

### ٢-١ لماذا لا نوحّد الجداول؟

| البديل | الحكم |
|---|---|
| ترحيل الـ9 إلى جدول واحد | ❌ **مرفوض** — يمسّ 9 بوابات في الإنتاج، مخاطرة هائلة بلا مكسب فوري |
| ترك كل شيء | ❌ مركز المدير يبقى ميتاً |
| **عرض موحّد + محرك مشترك** | ✅ **المختار** |

الجداول تبقى مصادر حقيقة لبواباتها. نضيف فوقها:
1. **عرضاً موحّداً** يقرأ منها كلها
2. **محركاً مشتركاً** للطلبات الجديدة
3. **دالة قرار موحّدة** توجّه لكل جدول

هذا نمط Odoo: `mixin` واحد ترثه الوحدات — بلا إعادة كتابة.

### ٢-٢ المكوّنات الخمسة

#### (أ) `unified_approvals` — عرض موحّد

```sql
CREATE VIEW public.unified_approvals AS
  SELECT 'hr' AS source_module, id, tenant_id, ... FROM hr_approval_requests
  UNION ALL
  SELECT 'procurement', ... FROM procurement_approval_requests
  UNION ALL ...  -- التسعة
```

أعمدة موحّدة: `source_module · source_id · title · requester · amount · status · current_approver_id · created_at · target_url`

**لا يلمس أي جدول.** قراءة فقط.

#### (ب) `org_role_assignments` — إنهاء تكاثر `X_manager_id`

```sql
CREATE TABLE public.org_role_assignments (
  tenant_id · department_id · org_role · user_id · is_active
)
-- org_role ∈ supervisor · manager · direct_manager · unit_manager
-- مع unit_key عند unit_manager (مدير المشتريات لهذا القسم)
```

يُلغي الحاجة لعمود جديد لكل بوابة. الأعمدة الأربعة القائمة **تُرحَّل ولا تُحذف** (توافق خلفي).

#### (ج) `resolve_approval_chain()` — تعميم `0153`

يعمّم `resolve_department_chain` ليشمل:
- السلسلة الهرمية (مشرف → مدير → مدير مباشر)
- مدير الوحدة (`portal_unit_assignments` من الخطوة ١)
- قواعد المبلغ (نمط `procurement_approval_rules`)

#### (د) `approval_rules` — قواعد عامة

تعميم `procurement_approval_rules` لكل الوحدات:

```sql
unit_key · min_amount · max_amount · department_id · level · required_role
```

#### (هـ) مركز موافقات المدير الحيّ

`ManagerApprovalsPage` يقرأ `unified_approvals` بدل الجدول الميت، ويوجّه القرار عبر `unified_approval_decide(source_module, source_id, decision, comments)`.

**وإصلاح `prompt()` المحظور** في نفس الوقت.

---

## القسم الثالث: خطة الخطوات

### الخطوة ٣ — الهيكل التنظيمي الموحّد
- `org_role_assignments` + ترحيل الأعمدة الأربعة
- تعميم `resolve_department_chain` → `resolve_org_chain`
- `OrgStructurePage`: عرض الأشخاص + إسناد كل الأدوار من مكان واحد
- **بلا حذف أي عمود** — توافق خلفي كامل

### الخطوة ٤ — محرك الموافقات الموحّد
- `unified_approvals` (عرض التسعة)
- `unified_approval_decide()` (توجيه القرار)
- `approval_rules` العامة
- `resolve_approval_chain()`

### الخطوة ٥ — مركز موافقات المدير
- `ManagerApprovalsPage` يقرأ الموحّد
- إصلاح `prompt()`
- تصفية بالوحدة والنوع والمبلغ
- **هنا يتحقق وعد «مكان واحد»**

### الخطوة ٦ — وحدة المشرف للحركة
- إكمال الدور الثاني (أضيق: بلا اعتماد نهائي)

### الخطوة ٧ — بقية وحدات المدير
- HR · المالية · المشتريات · المخزون · التصنيع · العقود · CRM · السلامة
- كل وحدة: صفحة موافقات + صفحة تقرير فريق

### الخطوة ٨ — إحياء الأنظمة الميتة
- `financial_approval_requests` · `mrp_bom_approvals` · `approval_requests`
- إما تُربط بالمحرك أو تُوثَّق كمهجورة صراحةً

### الخطوة ٩ — مصير `movement_manager` والأدوار التشغيلية
- بعد أن تعمل الوحدات، نقرّر على بيّنة

---

## القسم الرابع: المخاطر

| # | الخطر | التخفيف |
|---|---|---|
| ١ | عرض `UNION ALL` لتسعة جداول بطيء | فهارس على `status` + `tenant_id` · تصفية إلزامية |
| ٢ | كسر بوابة قائمة | **لا نلمس أي جدول** — إضافة فقط |
| ٣ | `approver_role` نصّ حر في المالية | نُطبّعه في العرض بلا تعديل الجدول |
| ٤ | ترحيل `X_manager_id` يفقد بيانات | نسخ لا نقل · الأعمدة تبقى · مقارنة عدد |
| ٥ | حجم الخطوات | كل خطوة مستقلة قابلة للإيقاف |

---

## القسم الخامس: سؤالان

**١. ترتيب الخطوات:** أبدأ بـ**الهيكل التنظيمي** (الخطوة ٣) لأنه أساس سلاسل الاعتماد — أم بـ**محرك الموافقات** (٤) لأنه يُحيي مركز المدير أسرع؟

ميلي: **الهيكل أولاً** — المحرك يعتمد عليه، وبناؤه قبله يعني إعادة عمل.

**٢. الأنظمة الميتة الثلاثة:** `financial_approval_requests` · `mrp_bom_approvals` · `approval_requests` — أُحييها بربطها بالمحرك، أم أُوثّقها مهجورة وأبني بدائل؟

---

**إن وافقت، أبدأ الخطوة ٣ فوراً: مايجريشن الهيكل التنظيمي مُختبَراً على Postgres قبل أي توثيق.**
