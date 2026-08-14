# خطة إعادة التفكير في بوابتَي الموظف والموارد البشرية

> **تحديث تنفيذي — 2026-08-15:** المراحل 0–4 مكتملة، والمرحلة 1
> أُغلقت مجدداً في `0374` بعد الوصول إلى `ANY=0` وSDK boundary بلا
> استثناءات. المرحلة 5 مكتملة تطويرياً عبر `0374`–`0378`: التواصل،
> الاعتماد واليتامى، دورة الهوية والعقد، Bonus→Payroll،
> Succession→Training، والتنفيذ الفعلي وواجهات SOP/البصمة/الحركة.
> لم يُحذف `hr_approval_steps` لأن دوال PostgreSQL حية ما زالت تقرأه
> وتكتبه؛ القرار الآمن موثق في `HR_APPROVAL_ENGINE_CONSOLIDATION_0375.md`.
> التطبيق Runtime متبقٍ، والمرحلة 6 هي التالية.
> راجع `docs/EMPLOYEE_HR_PORTALS_PLAN_STATUS_2026-08-14.md`.

> **الحالة الأصلية:** خطة مبنيّة على **قياس** لا انطباع. كل رقم أدناه استُخرج
> برمجياً من الشجرة أو من Postgres محلي مبنيّ من 262 مايجريشن.
>
> **لن نبني من الصفر.** ندخل الصفحات الموجودة، نعيد تصميمها، نُكمل
> أزرارها، نسدّ ثغراتها، ونصحّح الترابط. مرحلة مرحلة.

---

## أولاً: ما أُصلح الآن — أخطاء المتصفح الثلاثة

★ هذه **أول أعطال تُبلَّغ من المتصفح** في هذا المشروع. كل ما سبقها كان
منطق قاعدة وفحصاً ثابتاً. هذا فرق نوعي يستحق التسجيل.

### العطل ① — `profiles.cv_data` غير موجود

```
[42703] column profiles.cv_data does not exist
GET /rest/v1/profiles?select=…,cv_data → 400
```

**مُثبَت محلياً:**
```sql
SELECT count(*) FROM information_schema.columns
 WHERE table_name='profiles' AND column_name='cv_data';   →  0
```

الكود يفترض وجوده في **خمسة مواضع**:

| الملف | السطر | الفعل |
|---|---|---|
| `employee/ProfilePage.tsx` | 176 | يقرأ |
| `employee/ProfilePage.tsx` | 248 | **يكتب** (حفظ السيرة) |
| `employee/ProfilePage.tsx` | 264 | يمسح |
| `hr/TalentMarketPage.tsx` | 115 | يقرأ (سجل المؤهلات) |
| `sdk/UserService.ts` | 54 | يُصرّح به |

**الأثر:** الموظف يبني سيرته فيفشل الحفظ · مسؤول الموارد يفتح «سجل
المؤهلات» فيرى شاشة خطأ. الميزة مبنيّة كاملة وينقصها **العمود وحده**.

**الحل:** `0333` أضاف `cv_data JSONB NOT NULL DEFAULT '{}'` + فهرس GIN
للبحث بالمهارات + فهرس جزئي لـ«من لديه سيرة». وحُوِّل
`TalentMarketPage` من استعلام Supabase مباشر إلى `hr_talent_profiles()`.

### العطل ② — معرّف موظف فارغ

```
BaseService.findAll failed: attendance_logs
error: invalid input syntax for type uuid: ""
GET /rest/v1/attendance_logs?…&employee_id=eq.&… → 400
```

**مُثبَت محلياً بنصّه ذاته:**
```sql
SELECT count(*) FROM attendance_logs WHERE employee_id = '';
ERROR:  invalid input syntax for type uuid: ""
```

**السبب:** `AttendanceAnalytics.tsx:157`
```ts
attendanceService.findLogsByEmployee('', { limit: 1000 })
```
مُرّر معرّف **فارغ** ليعني «كل الموظفين». ولو نجح لكان أسوأ: جلب ألف
صفّ كامل ليُجمّعها المتصفح.

**أثر جانبي مكتشَف:** الرسم الأسبوعي في نفس الصفحة كان يعدّ من هذه
المصفوفة — ولمّا كان الاستدعاء يسقط، **بقي الرسم أصفاراً دائماً**.

**الحل:** `0333` أضاف ثلاث دوال تُجمّع في القاعدة بنطاق المستأجر:
`attendance_today_by_hour()` · `attendance_today_shift_split()` ·
`attendance_last_7_days()`. وحارس في الخدمة يرفض المعرّف الفارغ.

### ★ تصحيح ذاتي مُوثَّق

حاولتُ جعل تأكيد يحرس شرط النافذة الزمنية في `attendance_last_7_days`،
فاكتشفتُ بالعكس أنه **لا يسقط**. السبب: الإقصاء **بنيوي** —
`generate_series(6,0,-1)` تُنتج سبعة صفوف والـ`LEFT JOIN` لا يُنتج شيئاً
لبصمة خارجها. أثبتُّه بتوسيع النافذة إلى 9999 يوماً: المخرَج مطابق.

فوثّقتُ الحقيقة في المايجريشن نفسه بدل ادّعاء حراسة غير قائمة، وحوّلتُ
التأكيد ليحرس الإقصاء البنيوي (وقد أثبتُّ سقوطه عند استبدال
`generate_series` بمصدر مفتوح: `أيام الأسبوع = 3 (متوقَّع 7)`).

### الحالة بعد الإصلاح

```
262 مايجريشن من الصفر · صفر فشل
verify-cv-and-attendance-0333.sql   52 تأكيداً
2650/2650 اختباراً في 127 ملفاً
tsc EXIT=0 · build ✅ · contract-check PASS · lint 0 خطأ (1310 تحذيراً)
```

---

## ثانياً: أجوبة أسئلتك

### «صفحة البلاغات لدى الموظف نفسها لدى الموارد البشرية»

**صحيح — ومقصود جزئياً.** المكوّن واحد:

```
AppRouter.tsx:737   employee/problems  →  <ProblemsList isHR={false} />
AppRouter.tsx:1275  hr/problems        →  <ProblemsList isHR={true}  />
```

`ProblemsList.tsx` = 539 سطراً يخدم الدورين بفارق `isHR` وحده.

**المشكلة الحقيقية:** الدوران يحتاجان **شاشتين مختلفتين** لا شاشة واحدة
بمفتاح:

| الموظف يحتاج | مسؤول الموارد يحتاج |
|---|---|
| بلاغاتي أنا | كل بلاغات الشركة |
| «قدّم بلاغاً» | إسناد البلاغ لمسؤول |
| متابعة حالة بلاغي | تغيير الحالة · الإغلاق |
| — | تصنيف · أولوية · SLA |
| — | تحليلات: أي قسم يبلّغ أكثر |

⇒ بند في المرحلة 3.

### «صفحة تحليل الحركة — هل هي مربوطة فعلاً ببوابة الحركة؟»

**لا.** هذا قياس لا رأي:

```
الصفحة المربوطة: HRMovementAnalyticsPage.tsx (684 سطراً)
AppRouter.tsx:1282  path="movement-analysis" → HRMovementAnalyticsPage
```

**ما تقرؤه فعلاً:**
```
gatekeeper_sessions · gatekeeper_visitor_logs · gatekeeper_visitors
movements_log · movement_permits
```

**ما لا تقرؤه — بوابة الحركة الحقيقية (`0270`–`0301`):**
```
movement_locations · movement_geofences · movement_policies
movement_role_assignments · movement_audit_events · movement_cron_health
movement_notification_log · movement_permit_attachments … (12 جدولاً)
```

**الخلاصة:** الصفحة مربوطة بنظام **البوابة الأمنية** (حارس · زوار ·
تسليم مناوبة) لا ببوابة الحركة واللوجستيات. الاسم مضلِّل والمحتوى
مشروع في ذاته.

**وأسوأ:** يوجد ملف ثانٍ `MovementAnalysisPage.tsx` (49 سطراً) نصّه:

> «قيد التطوير حالياً… Placeholder — في انتظار التنفيذ»

**غير مربوط بأي مسار** — ملف ميت يجب أرشفته.

**واللقطة التي أرسلتها** تُظهر «إجمالي السجلات: 0» و«لم يعودوا حتى
الآن: 0» — متّسق مع قاعدة بلا حركات مُسجَّلة، لا مع عطل.

### `Math.random` — فحصتُ الموضعين

```
HRMovementAnalyticsPage.tsx:198  tempPin = Math.floor(100 + Math.random()*900)
TrainingManagementPage.tsx:381   newId = `course-${Date.now()}-${Math.random()…}`
```

**ليسا اختلاق بيانات** (بخلاف `0327`). لكن الأول **ثغرة أمنية**: رمز
تسليم مناوبة من ثلاث خانات بمولّد غير مشفَّر ⇒ 900 احتمال فقط.
بند في المرحلة 4.

---

## ثالثاً: القياس الكامل للبوابتين

### بوابة الموظف — 20 صفحة · 8,743 سطراً

| الصفحة | أسطر | ملاحظات مقيسة |
|---|---|---|
| `SOPsPage.tsx` | 870 | `DIRECT-SB` · `PLACEHOLDER` |
| `LeaveRequestPage.tsx` | 653 | — |
| `ProfilePage.tsx` | 623 | `as any` ×3 |
| `EmployeeDashboard.tsx` | 566 | `as any` ×6 |
| `MyAttendancePage.tsx` | 551 | `as any` ×2 |
| `ProblemsList.tsx` | 539 | `DIRECT-SB` |
| `NewProblemPage.tsx` | 496 | `DIRECT-SB` |
| `TrainingPage.tsx` | 447 | — |
| `WellnessPage.tsx` | 436 | `as any` ×1 |
| `ProblemDetail.tsx` | 399 | — |
| `PermissionsPage.tsx` | 396 | — |
| `AttendancePage.tsx` | 383 | `DIRECT-SB` |
| `MyExpensesPage.tsx` | 362 | `as any` ×5 |
| `AIInsightsDashboard.tsx` | 365 | — |
| `MyPayrollPage.tsx` | 310 | `as any` ×2 |
| `MyLoansPage.tsx` | 307 | `as any` ×4 |
| `MyGoalsPage.tsx` | 294 | — |
| `ContactPage.tsx` | 293 | — |
| `AIChatPage.tsx` | 227 | `as any` ×1 |
| `SurveyPage.tsx` | 226 | `as any` ×1 |

**الحصيلة:** 25 موضع `as any` · 5 صفحات تلمس Supabase مباشرة ·
placeholder واحد · **صفر** `confirm/alert/prompt`

### بوابة الموارد البشرية — 26 صفحة · 8,944 سطراً

| الصفحة | أسطر | ملاحظات مقيسة |
|---|---|---|
| `HRMovementAnalyticsPage.tsx` | 684 | `Math.random` (PIN) |
| `TrainingReportsPage.tsx` | 756 | `as any` ×1 |
| `PayrollPage.tsx` | 661 | — |
| `HRDashboard.tsx` | 624 | `as any` ×8 |
| `AnalyticsPage.tsx` | 620 | — |
| `KioskPage.tsx` | 610 | — |
| `TrainingManagementPage.tsx` | 595 | `as any` ×7 · `Math.random` · `DIRECT-SB` |
| `TalentMarketPage.tsx` | 468 | ✅ أُصلحت في `0333` |
| `LoansPage.tsx` | 429 | `as any` ×4 |
| `PerformancePage.tsx` | 331 | `as any` ×4 |
| `TeamPage.tsx` | 291 | — |
| `BonusesPage.tsx` | 271 | `as any` ×2 |
| `OnboardingPage.tsx` | 264 | — |
| `DocumentsPage.tsx` | 250 | `as any` ×1 |
| `SuccessionPlanningPage.tsx` | 232 | — |
| `RecruitmentPage.tsx` | 223 | — |
| `EmployeeContractsPage.tsx` | 211 | — |
| `ExpensesPage.tsx` | 211 | `as any` ×1 |
| `DisciplinaryPage.tsx` | 203 | `as any` ×2 |
| `HRServiceCenterPage.tsx` | 199 | — |
| `ShiftSchedulingPage.tsx` | 194 | `as any` ×1 |
| `HealthSafetyPage.tsx` | 154 | — |
| `ReportsPage.tsx` | 147 | — |
| `AttendancePage.tsx` | 145 | `as any` ×1 |
| `HRCommunicationPage.tsx` | 122 | — |
| `MovementAnalysisPage.tsx` | **49** | **PLACEHOLDER · غير مربوط** |

**الحصيلة:** 32 موضع `as any` · صفحة ميتة · صفحتان بـ`Math.random` ·
صفحة تلمس Supabase مباشرة

**ملاحظة على الأحجام:** ستّ صفحات تحت 210 أسطر (`HRCommunicationPage`
122 · `AttendancePage` 145 · `ReportsPage` 147 · `HealthSafetyPage` 154
· `ShiftSchedulingPage` 194 · `HRServiceCenterPage` 199). هذه أحجام
**تلميحية لا حاسمة** — تستحق فحصاً واحدة واحدة لتحديد أيها ناقص فعلاً
وأيها بسيط بطبيعته.

---

## رابعاً: الخطة — سبع مراحل

> كل مرحلة تنتهي بـ: مايجريشن + اختبار سلوكي على Postgres + عكس كل
> إصلاح لإثبات سقوط الاختبار + اختبار عقد + توثيق. لا ننتقل حتى تكتمل.

### المرحلة 0 — خريطة الترابط ★ الأساس

**لا تصميم قبل فهم العلاقات.** المُخرَج مستند واحد يجيب:

- كل جدول تكتب فيه بوابة الموظف — من يقرؤه؟
- كل شاشة في الموارد البشرية — من أين تأتي بياناتها؟
- أين ينقطع الخيط؟ (مثال مُثبَت: طلب الإجازة يصل صندوق المدير لكن
  `leaves.status` كان يبقى «انتظار» — أُصلح في `0323`)
- الترابط مع البوابات الأخرى: المالية (رواتب · سلف · مصروفات) ·
  التقنية (بصمة · حضور) · الحركة (تصاريح) · التواصل (إشعارات)

**المُخرَج:** `docs/PORTAL_RELATIONS_MAP.md` + مخطط الجداول المشتركة

### المرحلة 1 — سدّ الثغرات المقيسة (نظافة تقنية)

| البند | العدد |
|---|---|
| `as any` في بوابة الموظف | 25 |
| `as any` في الموارد البشرية | 32 |
| صفحات تلمس Supabase مباشرة | 6 |
| `MovementAnalysisPage` الميتة | أرشفة |
| PIN بـ`Math.random` | استبدال بمولّد آمن |

**+ حارس** يمنع عودتها (على نمط `adminUserPagesContract`).

### المرحلة 2 — بوابة الموظف صفحة صفحة

الترتيب بالأثر على المستخدم:

1. **`EmployeeDashboard`** (566) — الواجهة الأولى · 6 `as any`
2. **`ProfilePage`** (623) — السيرة الذاتية تعمل الآن بعد `0333`
3. **`MyAttendancePage`** (551) — حضوري وانصرافي
4. **`LeaveRequestPage`** (653) — طلب الإجازة ومتابعته
5. **`MyExpensesPage`** + **`MyLoansPage`** (669) — أُصلح منطقهما في `0325`، الواجهة تحتاج مراجعة
6. **`MyPayrollPage`** (310) — الترابط مع المالية
7. **`SOPsPage`** (870) — الأكبر · placeholder · `DIRECT-SB`
8. الباقي

### المرحلة 3 — فصل البلاغات

`ProblemsList` واحدة بمفتاح `isHR` ⇒ شاشتان مستقلّتان:
- **الموظف:** بلاغاتي · تقديم · متابعة
- **الموارد:** كل البلاغات · إسناد · تصنيف · أولوية · SLA · تحليلات

### المرحلة 4 — بوابة الموارد البشرية صفحة صفحة

1. **`HRDashboard`** (624) — 8 `as any`
2. **`TeamPage`** (291) — إدارة الموظفين
3. **`AttendancePage`** (145) — صغيرة جداً لوظيفة كبيرة، تُفحص
4. **`PayrollPage`** (661) — الترابط مع المالية
5. **`TrainingManagementPage`** (595) — 7 `as any` + `DIRECT-SB`
6. **`HRMovementAnalyticsPage`** (684) — إعادة تسمية + PIN آمن
7. الست الصغيرة — فحص «ناقصة أم بسيطة؟»
8. الباقي

### المرحلة 5 — الترابط بين البوابات

- الموظف ↔ الموارد: الطلبات · الاعتمادات · الوثائق
  - ✅ `0374`: إنشاء حالة التواصل ورسالتها ذرياً وإيصال رد HR للموظف.
  - ✅ `0375`: صفر مستهلك React للمحرك القديم، مصالحة اليتيم وحارس inbox.
  - ✅ `0376`: Hire→Auth invitation→Draft contract→Onboarding، وإنهاء الخدمة يغلق العقد ويعطل Auth عبر outbox.
  - ✅ `0377`: Bonus→Payroll وSuccession→Training ومشغل التدريب/الاختبار.
  - ✅ `0378`: التنفيذ الفعلي للزمنيات.
  - ℹ️ تفكيك `hr_approval_steps` مؤجل بقرار سلامة موثق؛ لا حذف مع اعتماد DB حي.
- الموارد ↔ المالية: ✅ الرواتب والسلف والمصروفات والمكافآت مترابطة.
- الموارد ↔ التقنية: ✅ صحة البصمة والحضور ظاهرة في HR.
- الموارد ↔ الحركة: ✅ إنشاء التصاريح متاح من واجهة HR إلى الوحدة الحقيقية.
- الكل ↔ التواصل: ✅ الإشعارات موحّدة منذ `0326`.

### المرحلة 6 — التصميم والاكتمال

توحيد بصري · حالات فارغة مفسَّرة · حالات تحميل · معالجة أخطاء ·
إمكانية وصول · استجابة للجوال.

---

## خامساً: قرارك — بأيّهما نبدأ؟

| # | الخيار | لماذا |
|---|---|---|
| **أ** | **المرحلة 0 — خريطة الترابط** | ★ توصيتي. لا نعيد تصميم شاشة قبل معرفة من يقرأ بياناتها. يمنع إعادة العمل |
| ب | المرحلة 1 — النظافة التقنية | 57 `as any` + 6 صفحات تلمس Supabase. سريع وملموس لكنه لا يُحسّن ما يراه المستخدم |
| ج | بوابة الموظف فوراً | تبدأ بـ`EmployeeDashboard` |
| د | الموارد البشرية فوراً | تبدأ بـ`HRDashboard` |

**توصيتي: أ ثم ب ثم ج.** خريطة الترابط تكشف الأعطال الصامتة كما كشفت
`0323` أن الإجازة تبقى «انتظار» بعد الاعتماد — وهي أخطر ما نجده.

---

## ملحق تاريخي: ما كان ينتظر الدفع عند كتابة الخطة

> **مُتجاوز:** أكد المستخدم في 2026-08-14 أن كل migrations حتى `0373`
> مطبقة. يُحتفظ بالنص التالي كسجل زمني فقط.

`0332` و`0333` **لم يكونا قد دُفعا وقتها**:

```
supabase/migrations/0332_tech_unified_exports_and_webhooks.sql
supabase/migrations/0333_profiles_cv_data_and_attendance_scope.sql
```

`0333` هو ما يُصلح خطأَي المتصفح — **بلا دفعه تبقى الشاشتان معطوبتين**.

```powershell
npx supabase db push
```
