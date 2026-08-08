# الجولة التالية — إتمام إصلاحات التدقيق في الواجهة

**التاريخ:** 2026-08-05 · **المايجريشن:** `0319`
**لم يُنفَّذ `git push`** · **`db push` مطلوب منك**

---

## ما أُنجز

تدقيق `0318` أصلح القاعدة وترك ثلاثة بنود في الواجهة. هذه الجولة أنجزتها كاملة.

| # | البند | الحالة |
|---|---|---|
| ① | حفظ الفرع والوردية عند التعديل | ✅ |
| ② | قائمة الورديات من `structure_shifts` | ✅ |
| ③ | شاشة تعارضات الاشتراك | ✅ |

```
248 مايجريشن من الصفر        صفر فشل
744 تأكيداً سلوكياً · 26/27 ملف  (الفاشل أداة سحابة لا اختبار)
2084/2084 اختبار وحدة · 113 ملفاً
tsc EXIT=0 · lint 0 خطأ · build ✅ · db:contract-check PASS
```

---

## ★ ① العطل الأخطر: التعديل يمحو ما لا يخصّه

### ما كان يحدث

مسار **تعديل** الموظف كان يحفظ:

```ts
userService.updateUser(id, { full_name, department, position, phone, status })
supabase.from('profiles').update({
  custom_permissions: { ...currentCustom, allowed_pages: effectiveAllowedPages }
})
```

**لا ذكر لـ`branch_id` ولا `shift_code`.** وأسوأ: القراءة كانت

```ts
branch_id:  emp.branch_id || '',   // ← عمود غير موجود على profiles
shift_code: '',                    // ← ثابت فارغ
```

فالحقلان يظهران فارغين مهما كانت القيمة المحفوظة، ثم **يُحفظ الفراغ فوق الأصل**.

### الإصلاح — ثلاث نقاط

| الموضع | ما تغيّر |
|---|---|
| **فتح التعديل** | `findPlacement()` تجلب القسم والفرع والوردية الحقيقية |
| **الحفظ** | `savePlacement()` تكتب في `employees` عبر دالة مُتحقِّقة |
| **دلالة NULL** | `undefined` = «لا تغيير» · `''` = «امسح» |

### ★ النقطة الجوهرية: `COALESCE` لا التعيين المباشر

```sql
SET department_id = COALESCE(p_department_id, e.department_id),
    branch_id     = COALESCE(p_branch_id,     e.branch_id),
    shift_code    = CASE
                      WHEN p_shift_code IS NULL     THEN e.shift_code
                      WHEN btrim(p_shift_code) = '' THEN NULL
                      ELSE p_shift_code
                    END
```

**تحديثٌ لا يخصّ الفرع لا يجوز أن يمحوه** — وهذا بعينه العطل الأصلي. اختبار العقد يحرس المبدأ:

```ts
expect(scope).not.toMatch(/SET[\s\S]*branch_id\s*=\s*p_branch_id\s*,/);
```

### التحقق من الانتماء

`set_employee_placement` ترفض أربع حالات — كلها مُختبَرة سلوكياً:

```
TARGET_USER_NOT_IN_TENANT · DEPARTMENT_NOT_IN_TENANT
BRANCH_NOT_IN_TENANT      · SHIFT_NOT_FOUND
```

والامتياز إداري: `admin · hr · developer · it_admin` فقط. موظف حاول تنسيب نفسه ⇒ رُفض.

---

## ② قائمة الورديات من القاعدة

### قبل — أربع قيم في JSX

```jsx
<option value="morning">الوردية الصباحية (08:00 ص — 04:00 م)</option>
<option value="evening">…</option>
<option value="night">…</option>
<option value="flexible">…</option>
```

شركة تُعرّف وردية خاصة ⇒ **لا تظهر لأحد**.

### بعد

```jsx
{shiftOptions.map(sh => (
  <option key={sh.code} value={sh.code}>
    {sh.nameAr} ({sh.startTime} — {sh.endTime}){sh.isGlobal ? '' : ' ★'}
  </option>
))}
```

`shift_catalog()` تعيد: **ورديات شركتك** (بنجمة ★) **+ القوالب العامة**.

القوالب الأربعة موجودة كـ`tenant_id IS NULL` بنفس الرموز القديمة (`morning`…) فلا ينكسر أي صف بيانات قائم.

> **ملاحظة تشغيلية:** المايجريشن طبع `أُضيف 0 قالب` لأنها كانت موجودة مسبقاً — و`WHERE NOT EXISTS` احترمها. سلوك صحيح لا خطأ.

---

## ③ شاشة تعارضات الاشتراك — بوابة المطوّرين

`detect_subscription_conflicts()` كانت جاهزة منذ `0318` بلا واجهة. الآن:

**بوابة المطوّرين ← تعارضات الاشتراك**

تعرض خمسة أنواع، كلٌّ بشرح عملي:

| التعارض | ماذا يعني | الخطورة |
|---|---|---|
| تعارض عمودَي الخطة | `plan` ≠ `subscription_plan` | 🔴 |
| **هجين بلا صفحات** | مستخدموه لا يرون أي صفحة | 🔴 |
| **اشتراك منتهٍ نشط** | يعمل بلا اشتراك ساري | 🔴 |
| صفحات مخصّصة بلا خطة هجينة | القائمة تُتجاهَل صامتةً | 🟠 |
| وحدة بلا تفعيل | يرون عناصر لا تعمل | 🟠 |

### حدود صريحة في `PlatformService`

وثّقتُ في رأس الملف أن هذه الطبقة **للمنصة لا لبيانات العملاء**، واختبار العقد يفرضها:

```ts
for (const t of ['employees','legal_entities','leaves','profiles','payroll'])
  expect(PLAT).not.toContain(`from('${t}')`);
```

يمنع أن يعود أحد لاحقاً فيضيف قراءة بيانات عميل هنا — وهو المسار الذي أنتج ثغرة `0318`.

**التسجيل في أربعة مواضع:** النوع · `PAGE_META` · التوجيه · عنصر التنقل — كلها مُختبَرة.

---

## إثبات الانحدار

| العكس | النتيجة |
|---|---|
| إزالة `savePlacement` من التعديل | ❌ `① التعديل يحفظ التنسيب` |
| إرجاع التعيين المباشر بدل `COALESCE` | ❌ اختباران |

**انعكاسان · سقوط في كليهما · استرجاع نظيف.**

---

## الملفات

```
supabase/migrations/0319_employee_placement_and_shift_catalog.sql   جديد
src/services/sdk/EmployeePlacementService.ts                        جديد
src/services/sdk/PlatformService.ts                                 جديد
src/pages/devportal/pages/SubscriptionConflictsPage.tsx             جديد
src/test/employeePlacementContract.test.ts                          جديد — 43
src/pages/admin/AdminEmployeesPage.tsx                              معدَّل — 6 مواضع
src/pages/devportal/types/index.ts · KyvzonDevPortal.tsx · Layout.tsx  معدَّلة
```

---

## خطوتك

```bash
npx supabase db push
```

سيُطبَّق `0319` وحده.

### التحقق — ثلاث دقائق

**١. الفرع والوردية**
- الإدارة ← إدارة الموظفين ← **عدّل** موظفاً
- اختر فرعاً ووردية ← احفظ
- **أعد فتح التعديل** ← يجب أن يظهرا محفوظين

  > هذا الاختبار الحاسم: كانا يظهران فارغين دائماً.

**٢. الورديات**
- قائمة «الوردية التشغيلية» تعرض الأربعة الافتراضية
- عرّف وردية في «الهيكل» ← ستظهر بنجمة ★

**٣. تعارضات الاشتراك**
- بوابة المطوّرين ← **تعارضات الاشتراك**
- إن ظهرت شركات فهذه مشكلات حقيقية كانت مخفية

---

## ما بقي — بانتظار قرارك

من تدقيق `0318`، بند واحد لم أُصلحه **بقرار**:

> **الاشتراك لا يحرس القاعدة.** شركة بخطة `basic` أنشأت كياناً مالياً بنجاح. البوابات تُقفَل بالواجهة لا بـRLS.

لم أُصلحه لأن إقفال الوحدات على مستوى RLS يمسّ مئات الجداول وقد يكسر عملاء يعملون الآن. الآن صار لديك **شاشة تكشف التعارض** — وهي الخطوة المنطقية قبل الإقفال.

**أخبرني إن أردتَ الإقفال الحقيقي** — جولة كاملة بترحيل مدروس.

### تحفّظ ثابت

كل ما أُثبت هنا: Postgres محلي + اختبارات ثابتة + بناء. **الواجهات الجديدة لم تُرَ تعمل في متصفح.**
