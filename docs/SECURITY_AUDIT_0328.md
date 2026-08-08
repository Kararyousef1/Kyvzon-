# 0328 — تدقيق أمني: عزل بوابة التقنية عن داخل المنصة

**التاريخ:** 2026-08-05 · **الفرع:** `remediation/p0-security-and-build-health`
**الخطورة:** 🔴 **حرجة — تسريب بيانات تجارية بين الشركات العميلة**
**الحالة:** مُصلَح ومُختبَر على Postgres 17.10 محلي · **لم يُدفع للسحابة بعد**

---

## المبدأ الذي انتُهك

بوابة التقنية **خاصة بالشركة المستأجِرة**، لا نافذة على داخل المنصة.
مسؤول تقنية شركة عميلة يجب ألّا يعلم بوجود شركات أخرى **أصلاً** — لا
أسماءها ولا خططها ولا كياناتها القانونية.

الفحص أثبت أن العكس كان يحدث.

---

## 🔴 العطل ① — `it_admin` يُعامَل مالكاً للمنصة

```sql
-- قبل 0328
CREATE FUNCTION current_user_is_platform_owner() ... AS $$
  SELECT COALESCE(
    current_user_role() IN ('developer','it_admin')   -- ★★★
    AND current_user_tenant_id() IS NOT NULL,
  FALSE);
$$;
```

لكن `it_admin` دور **مستأجر** لا دور منصة. صفحاته في `permissions.ts`:

```
tech-portal · dashboard · notifications · my-notifications · profile · attendance
```

لا علاقة له بإدارة المنصة إطلاقاً.

### القياس — جلسة RLS حقيقية بدور `it_admin` لشركة (أ)

```
is_platform_owner    = true
tenants              = 3 صف  ← «Kyvzon Platform · أ · ب»
tenant_subscriptions = 1 صف  ← خطة شركة أخرى
legal_entities       = 2 صف  ← كيان شركة أخرى
chart_of_accounts    = 1 صف  ← «نقدية شركة ب — سرّي»
```

**مسؤول تقنية أي عميل كان يقرأ قائمة كل العملاء وخططهم واشتراكاتهم
وكياناتهم القانونية وحساباتهم المالية.** هذا تسريب تجاري ومنافس، لا
مجرّد خلل صلاحيات.

11 سياسة تعتمد هذه الدالة على: `tenants` · `tenant_subscriptions` ·
`legal_entities` · `entity_memberships` · `platform_audit_log` ·
`public_signup_requests`.

### ⚠️ مفارقة في الإصلاح السابق `0318`

`0318` أضاف الشرط `AND current_user_tenant_id() IS NOT NULL` ظنّاً أنه
يمنع التجاوز. **الحقيقة معكوسة**: مالك المنصة الحقيقي يُدار من مستأجر
المنصة، فالشرط كان يمنح الامتياز لمن له مستأجر — أي **لتقني الشركة** —
بينما الغرض كان حجبه.

الإصلاح الصحيح: مالك المنصة = `developer` **ينتمي لمستأجر المنصة نفسه**
(`slug = 'kyvzon'`).

---

## 🔴 العطل ② — `system_settings` بلا فلتر مستأجر إطلاقاً

```sql
system_settings_admin_select : USING current_user_is_staff()
system_settings_admin_write  : USING/CHECK current_user_is_staff()
```

لا ذكر لـ`tenant_id` في أيٍّ منهما — قراءةً **وكتابةً**.

### القياس

```
تقني شركة (أ) يقرأ إعدادات شركة (ب)   ⇒ «شركة ب»
ويقرأ مفتاحها السرّي                  ⇒ «sk-live-BBBB-سرّي»
ويكتب عليها                           ⇒ صارت «مُخترَقة»
```

`system_settings` تحوي مفاتيح تكامل ونوافذ دوام وقواعد إجازات وإعدادات
ذكاء اصطناعي. تعديلها من شركة أخرى **تخريب مباشر** لا مجرّد اطّلاع.

---

## 🟠 العطل ③ — `tenant_modules` مكشوف

`kyvzon_tenant_modules_write` (`ALL`) بلا فلتر مستأجر. مقيس: تقني شركة
(أ) يرى صف وحدات شركة ثالثة. الوحدات المُفعَّلة تكشف **ما اشترته كل
شركة** — معلومة تجارية.

---

## 🟡 العطل ④ — إيحاء في الواجهة

`SecurityEventsPage.tsx:309`:
> «مراقبة التهديدات والأنشطة الأمنية **للمنصة**»

يُوحي بنطاق يتجاوز الشركة. صُحّح إلى «**في شركتك**».

---

## الحل: فصل ثلاث طبقات صريحة

```
┌─────────────────────────────────────────────────────────┐
│ مالك المنصة    developer + مستأجر المنصة (slug=kyvzon)  │
│                يُدار من بوابة المطوّرين                   │
├─────────────────────────────────────────────────────────┤
│ تقنية الشركة   admin · it_admin · developer             │
│                داخل مستأجره فقط — بلا استثناء            │
├─────────────────────────────────────────────────────────┤
│ مستخدم عادي    بياناته وفريقه                            │
└─────────────────────────────────────────────────────────┘
```

| ما أُضيف | الغرض |
|---|---|
| `is_platform_tenant(uuid)` | تمييز مستأجر المنصة بـ`slug` لا بالدور |
| `current_user_is_tenant_tech()` | صلاحية تقنية **داخل** المستأجر |
| `my_isolation_report()` | تقرير عزل ذاتي — `SECURITY INVOKER` عمداً |
| حرّاس `RESTRICTIVE` | على `system_settings` و`tenant_modules` — يُجمعون بـ`AND` فلا تتجاوزهم سياسة توسيعية لاحقة |

**`my_isolation_report` هي `SECURITY INVOKER` عن قصد**: تقيس RLS الفعلي
ولا تتجاوزه، فالرقم الذي تُعيده هو ما يراه المستخدم حقاً. لو كانت
`DEFINER` لكذبت.

---

## النتيجة بعد الإصلاح

| المجال | قبل | بعد |
|---|---|---|
| `is_platform_owner` (لـ`it_admin`) | `true` | `false` |
| `tenants` | 3 | **1** (شركته فقط) |
| `tenant_subscriptions` | 1 | **0** |
| `legal_entities` | 2 | **0** |
| `chart_of_accounts` | 1 | **0** |
| `system_settings` | 2 | **1** (شركته) |
| `tenant_modules` | 1 أجنبي | **0** |

**ووظيفته التقنية سليمة:** `is_tenant_tech = true` · يرى إعدادات شركته
ويعدّلها · يرى أجهزتها. **ومطوّر المنصة لم يُكسَر**: `is_platform_owner
= true` ويرى كل الشركات.

---

## إثبات العكس

| العكس | ما التقطه الاختبار |
|---|---|
| إعادة `it_admin` لمالكي المنصة | `★★ it_admin ما زال مالكاً` · `يرى 5 شركة` · `4 شركة أجنبية` · `1 اشتراكاً أجنبياً` · `2 كياناً أجنبياً` |
| إزالة حارس `system_settings` | `يقرأ 3 إعداداً أجنبياً` · `★★★ قرأ مفتاحاً سرّياً: sk-live-SECRET-B` |

بعد كل استرجاع: `✅ verify-0328-rls: 17/17`.

---

## ⚠️ خطآن وقعتُ فيهما وصحّحتُهما

### ① ترتيب التعريف
عرّفتُ `current_user_is_platform_owner` قبل `is_platform_tenant` التي
تستدعيها ⇒ `function public.is_platform_tenant(uuid) does not exist`.
أُعيد الترتيب.

### ② المايجريشن لم يكن قابلاً لإعادة التشغيل
أسقطتُ الأسماء **القديمة** فقط، فإعادة التشغيل لا تستبدل السياسات
الجديدة. اكتُشف حين فشل الاسترجاع بعد عكس اختباري. ثم ظهر المزلق
الموثَّق في `0322`:

```
cannot drop function current_user_is_tenant_tech() because other
objects depend on it
```

نُقلت كل الإسقاطات إلى **مقدّمة** المايجريشن، وأُثبتت الإدمبوتنسي
بتشغيله مرتين متتاليتين.

---

## حالة الفحوص

```
257 مايجريشن من الصفر            صفر فشل
35/36 ملف سلوكي · 479 تأكيداً مرقّماً
verify-0328         24/24
verify-0328-rls     17/17  (RLS حقيقي)
verify-0326-rls      8/8
verify-0324-rls      5/5
2346/2346 اختبار وحدة في 121 ملفاً   (+26 جديداً)
tsc EXIT=0 · lint 0 خطأ · build ✅ · db:contract-check PASS
```

---

## ما لم يُختبر ويبقى مفتوحاً

- **المتصفح** — لم يُختبر في أي جولة.
- **`db push`** لـ`0317`–`0328` بيد المستخدم. **هذه الجولة عاجلة**:
  التسريب قائم في الإنتاج حتى تُدفع.
- **بقية السياسات التوسيعية**: المسح وجد **50 سياسة PERMISSIVE** بلا
  فلتر مستأجر، أغلبها `finance_*` محميّة فعلياً بـ
  `current_user_can_access_legal_entity()` (فُحصت: لا تسرّب بعد إصلاح
  `platform_owner`). لكن لم أفحص الخمسين واحدةً واحدةً — يُنصح بجولة
  مخصّصة.
- **`currencies` و`scheduled_job_runs`** مقروءان لكل مُصادَق. الأولى
  بيانات مرجعية عامة (لا حساسية)، والثانية تكشف جدولة المهام — تحتاج
  قراراً: هل تُخفى عن المستأجرين؟

---

## الملفات

```
supabase/migrations/0328_tech_portal_tenant_isolation.sql   جديد
tools/dev/verify-tech-isolation-0328.sql                    جديد · 24 تأكيداً
tools/dev/verify-tech-isolation-0328-rls.sh                 جديد · 17 عبر RLS
src/test/techIsolationContract.test.ts                      جديد · 26 اختباراً
src/services/sdk/TechMetricsService.ts        + isolationReport
src/services/sdk/index.ts                     تصدير IsolationRow
src/pages/techportal/pages/SystemHealthPage.tsx   لوحة عزل الشركة
src/pages/techportal/pages/SecurityEventsPage.tsx إزالة إيحاء «المنصة»
```
