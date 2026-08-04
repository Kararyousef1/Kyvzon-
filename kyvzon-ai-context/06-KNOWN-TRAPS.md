# ⚠️ المزالق المعروفة — اقرأها قبل أن تكرّر خطأً مدفوع الثمن

## 1) مزالق البيئة

| المزلق | العرَض | الحل |
|---|---|---|
| `node_modules` لا يُحفظ | `ERR_MODULE_NOT_FOUND` | `npm ci` (~12 ثانية) |
| `.git/config` لا يُحفظ | `fatal: 'origin' does not appear to be a git repository` | `git remote add origin <URL>` |
| `.pgtest` لا يُحفظ | لا يوجد `psql` | أعد بناء المختبر — `04-VERIFICATION-PLAYBOOK.md` |

هذه المسارات مستثناة من لقطات مساحة العمل بحكم السياسة. **توقّع غيابها.**

---

## 2) ★★ صلاحية `anon` التلقائية — أخطر مزلق

Supabase يمنح `EXECUTE` لكل دالة جديدة لـ `anon` تلقائياً.
`REVOKE ... FROM PUBLIC` **لا** يسحبها.

```sql
REVOKE ALL ON FUNCTION public.f() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.f() FROM anon, authenticated;  -- ★ إلزامي
```

**قصة حقيقية:** `0268` فشل عند `db push`. تبيّن أن الحارس منع ثغرة:
زائر غير مسجَّل استطاع كتابة إشعارات في مستأجر لا يملكه، لأن دوال cron
لا تفحص `auth.uid()` بالتصميم.

**السبب في عدم كشفه محلياً:** المختبر لم يكن يحاكي
`ALTER DEFAULT PRIVILEGES`. أُضيف الآن إلى `tools/dev/pgtest-supabase-shim.sql`.

---

## 3) قيم `CHECK` — لا تخمّنها

```sql
-- ❌ خطأ ارتُكب فعلاً
UPDATE procurement_auctions SET status = 'closed';
-- ERROR: violates check constraint "procurement_auctions_status_check"

-- ✅ القيم الصحيحة: scheduled · live · ended · cancelled
```

**تحقّق دائماً قبل الكتابة:**
```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint
WHERE conrelid='public.<table>'::regclass AND conname LIKE '%status%';
```

---

## 4) `RETURNS TABLE` وتعارض الأنواع

الدالة تُنشأ بنجاح ثم تفشل عند **أول استدعاء**:
```
ERROR: structure of query does not match function result type
DETAIL: Returned type character varying does not match expected type text in column 2.
```

**الحل:** تحويل صريح لكل عمود: `col::TEXT` · `amount::NUMERIC`.
هذا كان سبب خطأ 400 في `get_ap_aging` الذي أبلغ عنه المستخدم.

---

## 5) SQL ديناميكي داخل `EXECUTE`

لا يُفحص عند الإنشاء إطلاقاً. مثال حقيقي:
`COALESCE(b.budget_name, b.name, ...)` وعمود `b.name` **غير موجود** →
كان يمنع إنشاء أي طلب شراء (أُصلح في `0257`).

⇒ **يجب تنفيذ الدالة فعلياً** لا مجرد إنشائها.

---

## 6) `STABLE` مع كتابة

```
ERROR: UPDATE is not allowed in a non-volatile function
```
حارس دائم في `0259` يفشل المايجريشن إن ظهرت دالة مخالفة.

---

## 7) تعارض أسماء أعمدة الإخراج

عمود إخراج في `RETURNS TABLE` باسم عمود جدول →
`column reference "status" is ambiguous`.
**الحل:** أسماء إخراج مميّزة أو `table_alias.column` صراحةً.

---

## 8) الأعمدة المولَّدة `GENERATED`

لا تحاول كتابتها:
- `purchase_orders.tax_amount` · `total_amount`
- `supplier_bids.effective_price`
- `supplier_risk_assessments.total_score` · `risk_level`

اكتب المصدر فقط (`total_before_tax`) ودع القاعدة تحسب.

---

## 9) فخ `allowed_pages` في الشريط الجانبي

عند وجود `custom_permissions.allowed_pages` **يُتجاهل الدور كلياً**.
أي وحدة جديدة تحتاج تسجيلاً في **4 مواضع** — راجع `03-UI-UX-RULES.md` §3.

---

## 10) ادعاءات خاطئة في التوثيق القديم — لا تصدّقها

| الادعاء | الحقيقة المُثبَتة |
|---|---|
| «بوابة المورد غائبة كلياً — لا واجهة» | ❌ **خاطئ.** 4 صفحات عامة + 6 دوال حدّية تعمل |
| «ثغرة `RequireModule` في CRM» | ❌ **خاطئ.** `RequireModule` (سطر 648) يغلّف كل `/app` حتى 1275 |
| «OCR يحتاج مزوّداً/غير منفَّذ» | ❌ **خاطئ.** منفَّذ بـ AI Vision حقيقي؛ يلزم مفتاح فقط |
| «Japanese/Dutch مدعومان لكن غير مختبرين» | ❌ **أسوأ.** كانا معطّلين تماماً — منطق British مفروض على الجميع |

> **الدرس:** دقّق أي نقص مسجَّل بالفحص المباشر للملفات قبل العمل عليه.
> قد يكون منفَّذاً، وقد يكون العطل أسوأ من الموصوف.

---

## 11) أخطاء صامتة كلّفت كثيراً

| العطل | الأثر | الإصلاح |
|---|---|---|
| غياب محفّز مزامنة إجمالي PO | **كل أرقام التحليل أصفار** | `0264` |
| `status` غامض في المطابقة | **المطابقة الثلاثية معطّلة كلياً** | `0261` |
| `b.name` غير موجود | **يمنع إنشاء أي طلب شراء** | `0257` |
| `calculate_kraljic` STABLE | كراليتش معطّلة | `0258` |
| `starting_price` غير مفروض | **قبول عروض فوق السقف → وفورات سالبة** | `0269` |

القاسم المشترك: **كلها تمرّ من الفحص الثابت بنجاح.**

---

## 12) تحذير التصدير اليدوي

لا تكتب تصدير CSV يدوياً. استخدم `src/utils/dataExport.ts`.
السبب: BOM للعربية + الحماية من CSV injection. راجع `03-UI-UX-RULES.md` §5.
