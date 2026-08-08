# المرحلة 1 — النظافة التقنية لبوابتَي الموظف والموارد البشرية

> لا مايجريشن في هذه الجولة — كلّها كود واجهة وطبقة SDK.
> `0332` · `0333` · `0334` ما زالت تنتظر `db push`.

---

## النتيجة بالأرقام

| البند | قبل | بعد |
|---|---|---|
| **`as any`** | **57** في 20 ملفاً | **0** |
| **`Math.random`** | 2 (أحدهما ثغرة أمنية) | **0** |
| **ملفات تلمس Supabase مباشرة** | 5 | 4 (موروثة · بخطّ أساس محروس) |
| **ملفات ميتة** | 1 | 0 (مؤرشفة بتعليل) |
| **تحذيرات lint** | 1310 | **1228** (‑82) |
| **اختبارات** | 2706 | **2871** (+165 حارساً) |

```
tsc EXIT=0 · build ✅ · db:contract-check PASS · 0 خطأ lint
```

---

## كيف أُزيلت الـ57

لم تكن كتلة واحدة — خمسة أنماط مختلفة، ولكلٍّ علاج مختلف.

### النمط ① — الإثراء بالعلاقات (13 موضعاً)

ستّ صفحات في الموارد البشرية تُثري سجلاتها يدوياً:

```ts
const empMap = new Map(employees.map(e => [e.id, e]));
const enriched = data.map(x => ({ ...x, employees: empMap.get(x.employee_id) }));
```

الحقل `employees` غير موجود في النوع الأصلي، فكانت القراءة:

```ts
const emp = (bonus as any).employees;      // ← ممنوع
```

**العلاج:** أنواع مشتركة في `src/shared/types/sdk.ts`:

```ts
export interface EmployeeSummary { id; full_name_ar?; … }
export type WithEmployee<T> = T & { employees: EmployeeSummary | null };
export type WithEmployeeAndCycle<T> = WithEmployee<T> & { performance_cycles: … };
```

`EmployeeSummary` **ملخّص لا كيان كامل** — الصفحات تقرأ الاسم والقسم
فقط، فلا داعي لجرّ `EmployeeRecord` بأكمله وادّعاء وجود كل حقوله.

طُبِّق على: `BonusesPage` · `DisciplinaryPage` · `DocumentsPage` ·
`ExpensesPage` · `LoansPage` · `PerformancePage`.

### النمط ② — مصفوفات اللوحة (8 مواضع)

`HRDashboard` أعلن ثماني مصفوفات `[] as any[]` — أكبر تجمّع منفرد.

**العلاج:** سبعة أنواع صريحة، كلٌّ **مُستخرَج من الكود الذي يبنيه** ومن
الحقول التي تقرؤها الواجهة فعلاً:

```ts
interface MonthlyTrendPoint { month; problems; resolved; critical; }
interface CategorySlice     { category; count; percentage; }
interface SeveritySlice     { severity; count; color; }
interface DepartmentStat    { name; employeeCount; problemCount;
                              wellnessTotal; wellnessCount; wellnessAvg; fullMark; }
interface WellnessPoint     { day; score; }
interface RecentIncident    { id; title?; status?; severity?; created_at?; reporter?; }
interface RecentReview      { customer_name?; product_name?; review_text?; rating; }
```

### النمط ③ — `as any` **زائد تماماً** (6 مواضع)

الحقول موجودة في الأنواع أصلاً:

| الملف | الحقل | مكانه |
|---|---|---|
| `MyExpensesPage` ×4 | `rejection_reason` · `receipt_url` | `ExpenseRequest` (hrModules.ts:118,121) |
| `MyLoansPage` ×2 | `employee_id` | `User` (index.ts:48) |
| `EmployeeDashboard` ×2 | `created_at` · `status` | `Problem` · `AttendanceRecord` |

**العلاج:** حذف الـ`as any` بلا أي تغيير آخر.

### النمط ④ — أنواع بنيوية موضعية (بقية المواضع)

حيث لا نوع مشترك يستحق، نُعرّف **الحقول المقروءة فعلاً لا أكثر**:

```ts
type ResponseRow = { survey_id: string };          // SurveyPage
type RawProfile  = { id; full_name_ar?; … };       // TrainingReportsPage
type EmpLite     = { id; full_name_ar?; email? };  // TrainingManagementPage
```

### النمط ⑤ — `Parameters<typeof fn>[0]`

لحمولات الإنشاء حيث النوع الدقيق يخصّ الخدمة:

```ts
} as unknown as Parameters<typeof employeeLoanService.createLoan>[0]);
```

---

## ★★ ثغرة أمنية مُصلَحة

`HRMovementAnalyticsPage.tsx:217` — رمز تسليم المناوبة:

```ts
const tempPin = Math.floor(100 + Math.random() * 900).toString();
```

**مشكلتان:**
1. ثلاث خانات = **900 احتمال فقط** — يُخمَّن بالتجربة
2. `Math.random()` **غير تشفيري**: بذرته قابلة للاستنتاج، فمن يرى
   رمزاً واحداً قد يتنبّأ بالتالي

الرمز يفتح بوابة الشركة لحارس بديل. تخمينه = دخول غير مصرّح به.

**العلاج:** ست خانات (مليون احتمال) من `crypto.getRandomValues`، بنفس
النمط المستعمل في `AdminEmployeesPage.tsx:574`:

```ts
function generateHandoverPin(): string {
  const MIN = 100000, RANGE = 900000;
  const LIMIT = Math.floor(0xffffffff / RANGE) * RANGE;
  const buf = new Uint32Array(1);
  let v: number;
  do { crypto.getRandomValues(buf); v = buf[0]; } while (v >= LIMIT);
  return String(MIN + (v % RANGE));
}
```

**الطرح المعياري** (`while (v >= LIMIT)`) يمنع انحياز `%` — القسمة
المباشرة تجعل القيم الأولى أكثر احتمالاً.

---

## ★★ عطل مُقاس اكتُشف أثناء التنظيف

`TrainingManagementPage.tsx:409` كان يولّد معرّف دورة:

```ts
const newId = `course-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
await courseService.createCourse({ id: newId, … });
```

لكن `courses.id` من نوع **`UUID`**
(`0003_hr_platform_modules.sql:292`) بافتراضي `gen_random_uuid()`.

نصّ مثل `"course-1738245891-ab3f"` **يرفضه Postgres حتماً** — إنشاء
أي دورة جديدة كان يفشل.

**العلاج:** نترك القاعدة تولّد المعرّف وتُعيده:

```ts
const created = await courseService.createCourse({ ...courseData, created_by: user?.id });
const newId = created.id;
```

---

## `QuizService` — إخراج آخر ملف من اللمس المباشر

`TrainingManagementPage` كانت تجمع **ثلاث مخالفات** في كتلة واحدة:

```ts
const { supabase } = await import('../../services/supabase/supabase');
const tenant_id = localStorage.getItem('tenant_id');
await supabase.from('quizzes').upsert({
  id: (quiz as any).id || undefined,
  course_id: (quiz as any).course_id,
  title: (quiz as any).title || 'اختبار',
  questions: (quiz as any).questions || [],
  tenant_id,
} as any);
```

1. استيراد Supabase ديناميكياً داخل الصفحة
2. خمسة `as any` رغم وجود نوع `Quiz` كامل
3. **`tenant_id` من `localStorage`** — قيمة يتحكّم بها المتصفح

> عن ③: RLS يحرسها فعلياً (`quizzes_tenant_isolation` في `0143`)،
> لكن إرسالها من العميل عبثٌ في أحسن الأحوال ومصدر لبس في أسوئها.

**العلاج:** `src/services/sdk/QuizService.ts` مبنيّة على أعمدة الجدول
المُحقَّقة من `0143_training_quizzes.sql`:

- `tenant_id` **لا يُرسَل** — القاعدة تملأه
- `passing_score` مقصوص 0–100 (الجدول يحمل
  `CHECK (passing_score BETWEEN 0 AND 100)`)
- `deactivate()` لا `delete()` — محاولات الموظفين تشير إليه
- الفروق عن نوع الواجهة مُوثَّقة: `passingScore ↔ passing_score` ·
  `timeLimit ↔ time_limit_minutes` · `status ↔ is_active`

**وأزلتُ رسالة نجاح كاذبة:** كان `catch { addToast('تم حفظ الاختبار
محلياً', 'info'); }` — لم يُحفظ في أي مكان.

---

## الملف الميت

`src/pages/hr/MovementAnalysisPage.tsx` → `_archive/` مع `README.md`
يشرح السبب.

**مُقاس:** 49 سطراً · محتواه «قيد التطوير — Placeholder» حرفياً ·
**غير مربوط بأي مسار** · **لا يقرأ أي جدول**.

المسار `hr/movement-analysis` يشير إلى `HRMovementAnalyticsPage.tsx`
(684 سطراً — الصفحة العاملة).

أُرشف ولم يُحذف — قاعدة المشروع.

---

## الحارس — `portalHygieneContract.test.ts`

**165 اختباراً.** يفحص كل صفحة في البوابتين (45 صفحة) واحدة واحدة:

| المحروس | النوع |
|---|---|
| صفر `as any` | مطلق |
| صفر `Math.random` | مطلق |
| صفر `confirm/alert/prompt` | مطلق |
| مولّد PIN تشفيري وستّ خانات | مطلق |
| لمس Supabase المباشر | **خطّ أساس** (4 ملفات) — يمنع الزيادة لا يدّعي الصفر |
| `WithEmployee` مستعملة في الستّ | مطلق |
| أنواع `HRDashboard` السبعة | مطلق |
| الملف الميت مؤرشف وبلا مرجع | مطلق |
| `QuizService` لا تُرسل `tenant_id` | مطلق |

### ★ يبدأ بفحص نفسه

```ts
it('★ الصفحات موجودة (وإلا مرّ الحارس فارغاً)', …);
it('★ codeOnly يُزيل التعليقات فعلاً', …);
```

حارس يمرّ على قائمة فارغة = حارس بلا قيمة.

### ثلاثة أعكاس تُسقطه

| العكس | ما ظهر |
|---|---|
| إعادة `(bonus as any).employees` | `× src/pages/hr/BonusesPage.tsx` |
| إعادة `Math.random()` للـPIN | `× src/pages/hr/HRMovementAnalyticsPage.tsx` |
| `supabase.from()` في `TeamPage` | `× لا ملف جديد يلمس Supabase` **و** `× خطّ الأساس لا يزيد` |

---

## ★ تصحيح ذاتي

كتبتُ في الحارس:

```ts
expect(codeOnly(SVC)).not.toMatch(/tenant_id:/);
```

**فضفاض** — يطابق تعريف الحقل في الواجهة (`tenant_id: string`) وهو
مشروع تماماً. المقصود ألّا يُبنى في **حمولة الكتابة**. صُحّح ليفحص
كتلة `payload` وحدها، مع تأكيد أن الكتلة ليست فارغة (وإلا مرّ الفحص
على نصّ خالٍ).

---

## ما لم يُعالَج — بوعي

**أربعة ملفات تلمس Supabase مباشرة:**

```
employee/AttendancePage.tsx    5 جداول
employee/NewProblemPage.tsx    incidents
employee/ProblemsList.tsx      incidents
employee/SOPsPage.tsx          sops
```

**لماذا تُركت:** كلّها ضمن نطاق المرحلتين 2 و3 (إعادة تصميم صفحة
صفحة، وفصل شاشات البلاغات). إخراجها الآن يعني كتابة خدمات ستُعاد
كتابتها بعد أسابيع. الحارس يمنع **الزيادة** ريثما يحين دورها.

**52 انتهاك حدود SDK** في `finance/inventory` — موروثة، خارج نطاق
البوابتين، ثابتة بلا تغيير.

---

## الملفات

```
جديدة:
  src/services/sdk/QuizService.ts
  src/test/portalHygieneContract.test.ts          165 اختباراً
  src/pages/hr/_archive/MovementAnalysisPage.tsx  (مؤرشف)
  src/pages/hr/_archive/README.md

معدَّلة (20 صفحة + 3 ملفات بنية):
  src/shared/types/sdk.ts          + EmployeeSummary · WithEmployee · WithEmployeeAndCycle
  src/services/sdk/index.ts        + quizService
  src/pages/employee/*.tsx         9 ملفات
  src/pages/hr/*.tsx               11 ملفاً
```
