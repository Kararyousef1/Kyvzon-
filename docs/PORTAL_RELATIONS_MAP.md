# خريطة الترابط — بوابتا الموظف والموارد البشرية

> **المرحلة 0 من خطة البوابتين.**
>
> كل رقم وكل ادّعاء في هذا المستند **مُستخرَج برمجياً** — إمّا من شجرة
> الكود بتحليل نصّي، أو من Postgres 17 محلي مبنيّ من **262 مايجريشن
> بصفر فشل**. لا تخمين واحد.
>
> **الغرض:** لا نعيد تصميم شاشة قبل معرفة من يقرأ بياناتها وأين ينقطع
> الخيط.

---

## ملخّص تنفيذي — خمسة أعطال بنيوية مُثبَتة

| # | العطل | الخطورة | مُثبَت بـ |
|---|---|---|---|
| ① | **نظاما اعتماد متوازيان** لا يتحدّثان | ★★★ | الموظف على `hr_approval_steps` · المدير على `unified_approval_steps` |
| ② | **`approval_rules` يبدأ فارغاً** لكل مستأجر | ★★★ | `build_approval_steps` أعادت `0` |
| ③ | **لا محفّز** يبني خطوات الاعتماد | ★★ | `pg_trigger` على `hr_approval_requests` = صفر |
| ④ | **طلبات اعتماد يتيمة** بعد حذف مصدرها | ★★ | حذفتُ إجازة فبقي طلبها في صندوق المدير |
| ⑤ | **شاشة واحدة لثلاثة أدوار** عبر URL | ★ | `LeaveRequestPage` على مسارين · `ProblemsList` بمفتاح `isHR` |

---

## أولاً: من يقرأ ماذا — الجداول الفعلية لكل صفحة

استُخرجت بربط كل صفحة بخدمات SDK التي تستدعيها، ثم بالجدول الذي ترثه
كل خدمة من `BaseService` (204 خدمة مربوطة بجداولها)، مضافاً إليه أي
`.from()` أو `.rpc()` مباشر.

### بوابة الموظف — 20 صفحة

| الصفحة | الجداول |
|---|---|
| `EmployeeDashboard` | `attendance_summary` · `employee_goals` · `employee_loans` · `employees` · `expense_requests` · `incidents` · `leaves` · `wellness_entries` |
| `LeaveRequestPage` | `employees` · `hr_approval_requests` · `hr_approval_steps` · `leave_balance` · `leaves` · `permissions_request` |
| `ProfilePage` | `employee_certifications` · `employee_goals` · `employee_skills` · `employees` · `profiles` |
| `AttendancePage` | ⚠ **5 جداول بلمس مباشر:** `attendance_logs` · `attendance_summary` · `employees` · `leave_balance` · `leaves` |
| `TrainingPage` | `course_progress` · `courses` · `employee_goals` · `employee_skills` · `employees` |
| `MyAttendancePage` | `attendance_logs` · `attendance_summary` · `employees` · `hr_cases` |
| `PermissionsPage` | `employees` · `hr_approval_requests` · `hr_approval_steps` · `permissions_request` |
| `ContactPage` | `employee_letter_requests` · `hr_cases` · `hr_messages` |
| `ProblemDetail` | `incident_comments` · `incidents` |
| `MyExpensesPage` | `employees` · `expense_requests` |
| `MyLoansPage` | `employee_loans` · `employees` |
| `MyGoalsPage` | `employee_goals` · `employee_skills` |
| `AIInsightsDashboard` | `ai_insights` · `attendance_summary` |
| `NewProblemPage` | ⚠ `incidents` مباشر |
| `ProblemsList` | ⚠ `incidents` مباشر |
| `SOPsPage` | ⚠ `sops` مباشر |
| `MyPayrollPage` | `employees` |
| `SurveyPage` | `survey_responses` |
| `WellnessPage` | `wellness_entries` |
| `AIChatPage` | `system_settings` |

### بوابة الموارد البشرية — 26 صفحة

| الصفحة | الجداول |
|---|---|
| `HRDashboard` | `customer_reviews` · `departments` · `employees` · `incidents` · `structure_departments` · `wellness_entries` |
| `TeamPage` | `departments` · `employee_certifications` · `employees` · `incidents` · `structure_departments` · `wellness_entries` |
| `SuccessionPlanningPage` | `critical_positions` · `departments` · `employees` · `structure_departments` · `succession_candidates` |
| `KioskPage` | `attendance_logs` · `attendance_summary` · `departments` · `employees` · `structure_departments` |
| `TrainingReportsPage` | `course_progress` · `courses` · `departments` · `employees` · `structure_departments` |
| `HRMovementAnalyticsPage` | `customer_reviews` · `movement_permits` · `movements_log` · `profiles` |
| `AttendancePage` | `attendance_logs` · `departments` · `employees` · `structure_departments` |
| `ReportsPage` | `critical_positions` · `employee_contracts` · `incidents` · `wellness_entries` |
| `TrainingManagementPage` | `courses` · `employee_certifications` · `employees` · ⚠ `quizzes` مباشر |
| `AnalyticsPage` | `incidents` · `profiles` · `wellness_entries` |
| `HRServiceCenterPage` | `employee_letter_requests` · `employees` · `hr_cases` |
| `HealthSafetyPage` | `corrective_actions` · `employees` · `incidents` |
| `TalentMarketPage` | `profiles` ✅ *(أُصلحت في `0333`)* |
| `PayrollPage` | `employees` |
| `RecruitmentPage` | `job_postings` |
| `HRCommunicationPage` | `hr_messages` |
| `MovementAnalysisPage` | **لا شيء — placeholder ميت** |
| باقي التسع | جدولان لكل صفحة |

---

## ثانياً: الجداول المشتركة — نقاط التماس الخمس عشرة

هذه **حدود التماس** بين البوابتين. أي تغيير في أيّها يمسّ الطرفين.

| الجدول | الموظف يكتب/يقرأ | الموارد البشرية |
|---|---|---|
| `employees` | 9 صفحات | 15 صفحة ← **أكثر جدول تماساً** |
| `incidents` | 4 صفحات | 4 صفحات |
| `attendance_logs` | 2 | 2 |
| `wellness_entries` | 2 | 4 |
| `profiles` | 1 | 3 |
| `courses` | 1 | 2 |
| `employee_certifications` | 1 | 2 |
| `expense_requests` | 2 | 1 |
| `employee_loans` | 2 | 1 |
| `hr_cases` | 2 | 1 |
| `attendance_summary` | 2 | 1 |
| `sops` | 1 | 1 |
| `hr_messages` | 1 | 1 |
| `employee_letter_requests` | 1 | 1 |
| `course_progress` | 1 | 1 |

### ★★ حصرية للموظف — 11 جدولاً

```
leaves · permissions_request · hr_approval_requests · hr_approval_steps
leave_balance · employee_goals · employee_skills · incident_comments
survey_responses · ai_insights · system_settings
```

**هنا العطل:** `leaves` و`permissions_request` و`hr_approval_*` **لا
تظهر في أي صفحة من بوابة الموارد البشرية**. عنصر التنقّل
`hr-leave-requests` موجود، لكن مساره يشير إلى **نفس مكوّن الموظف**:

```
AppRouter.tsx:1216  employee/leave-requests → <LeaveRequestPage />
AppRouter.tsx:1300  hr/leave-requests       → <LeaveRequestPage />
```

### حصرية للموارد البشرية — 16 جدولاً

```
bonuses · corrective_actions · critical_positions · customer_reviews
departments · disciplinary_actions · employee_contracts · job_postings
movement_permits · movements_log · onboarding_tasks · performance_cycles
quizzes · shift_assignments · structure_departments · succession_candidates
```

مقبول — هذه أدوات إدارية بطبيعتها.

---

## ثالثاً: ★★★ العطل الأخطر — نظاما اعتماد متوازيان

### القياس

```
الجداول:
  hr_approval_requests · hr_approval_steps        ← النظام الأول
  unified_approval_steps                          ← النظام الثاني

من يستعمل الأول:
  src/pages/employee/LeaveRequestPage.tsx
  src/pages/employee/PermissionsPage.tsx
  src/services/sdk/HrApprovalService.ts
  src/services/sdk/LeaveService.ts
  src/shared/components/dashboard/HrApprovalInbox.tsx

من يستعمل الثاني:
  src/pages/manager/ManagerApprovalsPage.tsx
  src/pages/manager/units/UnitApprovalsPage.tsx
  src/services/sdk/UnifiedApprovalService.ts
  src/services/sdk/FinancialRequestService.ts
  src/shared/components/approvals/ApprovalTrail.tsx
```

⇒ **الموظف يقدّم في نظام، والمدير يعتمد في نظام آخر.**

### الجسر الوحيد: عرض `unified_approvals`

```sql
FROM hr_approval_requests        ← يجمع من عشرة مصادر
FROM financial_approval_requests
FROM procurement_approval_requests
FROM contract_approval_requests
FROM inventory_adjustment_approvals
FROM mrp_bom_approvals
FROM crm_discount_approvals
FROM employee_movement_approvals
FROM employee_movement_permits
FROM approval_requests
```

العرض يجمع **الطلبات** — لكن **الخطوات** تبقى في جدولين منفصلين.

### الإثبات التشغيلي الكامل

سيناريو حقيقي على Postgres: مستأجر · قسم · مدير · موظف · إجازة.

```
─── بعد إنشاء الطلب في hr_approval_requests ───
  hr_approval_steps      = 0
  unified_approval_steps = 0
  إشعارات               = 0
─── نجرّب المحرك الموحّد يدوياً ───
  build_approval_steps أعادت 0
  قواعد الاعتماد للمستأجر = 0 (بلا قواعد ⇒ لا سلسلة)
```

**سلسلة الانقطاع، حلقة حلقة:**

1. `INSERT INTO leaves` ⇒ الحالة `'انتظار'` ✅
2. **لا محفّز** يُنشئ `hr_approval_requests` — الواجهة مسؤولة
3. `INSERT INTO hr_approval_requests` ⇒ **لا محفّز** يبني الخطوات
4. `build_approval_steps()` تُرجع **0** لأن `approval_rules` فارغ
5. صفر خطوات ⇒ **صفر إشعارات** (محفّز `0322` على جدول الخطوات)
6. المدير لا يُنبَّه

### ② `approval_rules` يبدأ فارغاً — بلا استثناء

```bash
$ grep -l "INSERT INTO public.approval_rules" supabase/migrations/*.sql
supabase/migrations/0308_approval_rules_management.sql
```

الموضع الوحيد **داخل دالة إدارة** (`p_rule_id IS NULL` ⇒ إدراج) — لا
`seed` ولا سلسلة افتراضية. و`resolve_approval_chain` **بلا احتياط**:
فحصتُها عن `fallback` و`manager_id` و`IF NOT FOUND` — لا شيء.

**النتيجة:** مستأجر جديد ⇒ كل طلبات الاعتماد **تتجمّد صامتة**.

> ملاحظة: `detect_approval_rule_gaps()` موجودة وتُنبّه على الفجوات —
> لكنها **تشخيص لا علاج**، ولا شيء يستدعيها تلقائياً.

---

## رابعاً: ④ الطلبات اليتيمة

`hr_approval_requests.related_id` يشير إلى `leaves` أو
`permissions_request` حسب `request_type` — **مرجع متعدد الأشكال بلا
مفتاح أجنبي**. فحصتُ كل `pg_constraint` من نوع `f`:

```
hr_approval_requests . department_id  →  departments
hr_approval_requests . employee_id    →  employees
(لا شيء لـ related_id)
```

**الإثبات:**

```
قبل الحذف: طلبات اعتماد = 1
★ بعد حذف الإجازة: طلبات اعتماد = 1 (يتيمة)
★★ وتظهر في صندوق المدير: 1 طلب يشير إلى إجازة محذوفة
```

المدير يرى طلباً لا مصدر له. الحل ليس مفتاحاً أجنبياً (المرجع متعدد
الأشكال) بل **محفّز تنظيف** أو تحويل الحذف إلى أرشفة.

---

## خامساً: ⑤ شاشة واحدة لثلاثة أدوار

### `LeaveRequestPage` — الوضع من مسار URL

```ts
const viewMode: ViewMode = useMemo(() => {
  const p = location.pathname;
  if (p.startsWith('/app/hr/leave-requests')) return 'hr';
  if (p.startsWith('/app/supervisor/'))       return 'supervisor';
  if (p.startsWith('/app/manager/'))          return 'manager';
  return 'employee';
}, [location.pathname]);

const canApprove = viewMode === 'hr' || viewMode === 'supervisor' || viewMode === 'manager';
```

ثم:

```ts
if (!canApprove && realEmployeeId) data = await leaveService.findLeavesByEmployee(realEmployeeId);
else                               data = await leaveService.findAll({ … });
```

### ✅ الأمان سليم — أثبتُّه عبر RLS حقيقي

هذا **بالضبط** نمط الثغرة التي أصلحها `0324`. فحصتُه تشغيلياً بجلسة
`psql` واحدة مع `SET ROLE authenticated`:

```
── موظف عادي يستدعي findAll على leaves ──
  ✅ يرى 0 — RLS يحجب إجازة زميله
── ومحاولة اعتمادها ──
  (لا صف مُحدَّث)
```

السياسة النافذة:
```sql
kyvzon_leaves_select | SELECT |
  tenant_id = current_user_tenant_id()
  AND (current_user_is_staff() OR employee_id = current_user_employee_id())
```

⇒ **المشكلة تصميمية لا أمنية.** شاشة تخدم أربعة أدوار بمنطق `if` متشعّب
= صيانة صعبة وتجربة مبتورة لكل دور.

### `ProblemsList` — المكوّن نفسه بمفتاح

```
AppRouter.tsx:737   employee/problems → <ProblemsList isHR={false} />
AppRouter.tsx:1275  hr/problems       → <ProblemsList isHR={true}  />
```

539 سطراً لدورين. الموظف يحتاج «بلاغاتي»، والموارد تحتاج إسناداً
وتصنيفاً وSLA وتحليلات.

---

## سادساً: الترابط مع البوابات الأخرى

| الجسر | الجداول | الحالة |
|---|---|---|
| **الموارد ↔ المالية** | `expense_requests` · `employee_loans` → `financial_approval_requests` | ✅ أُصلح في `0325` |
| **الموارد ↔ التقنية** | `attendance_logs` ← `biometric_devices` | ⚠ `device_id` نصّ بلا FK (وُثّق في `0327`) |
| **الموارد ↔ الحركة** | `movement_permits` · `movements_log` | ⚠ صفحة HR تقرأ **البوابة الأمنية** لا بوابة الحركة |
| **الكل ↔ التواصل** | `notifications` | ✅ موحّد في `0326` |
| **الموارد ↔ الهيكل** | `departments` · `structure_departments` | ⚠ جدولان للهيكل — يحتاج فحصاً |

### ★ تحليل الحركة — الجواب النهائي

**الصفحة المربوطة:** `HRMovementAnalyticsPage.tsx` (684 سطراً) عبر
`AppRouter.tsx:1282`.

**ما تقرؤه:** `gatekeeper_sessions` · `gatekeeper_visitor_logs` ·
`gatekeeper_visitors` · `movements_log` · `movement_permits`

**ما لا تقرؤه — بوابة الحركة الحقيقية (12 جدولاً من `0270`–`0301`):**
```
movement_locations · movement_geofences · movement_policies
movement_role_assignments · movement_audit_events · movement_cron_health
movement_notification_log · movement_notification_dispatch_status
movement_permit_attachments · movement_legacy_migration_status
movements_log · movement_permits
```

⇒ الصفحة مربوطة بنظام **البوابة الأمنية** (حارس · زوار · تسليم مناوبة).
محتواها مشروع، **واسمها مضلِّل**.

**وملف ميت:** `MovementAnalysisPage.tsx` (49 سطراً) نصّه «قيد التطوير —
Placeholder»، **غير مربوط بأي مسار**.

**ثغرة أمنية مقيسة** في نفس الصفحة، السطر 198:
```ts
const tempPin = Math.floor(100 + Math.random() * 900).toString();
```
رمز تسليم مناوبة من ثلاث خانات بمولّد غير مشفَّر ⇒ **900 احتمال**.

---

## سابعاً: ما هو سليم — لا نلمسه

الصدق يقتضي تسجيل ما يعمل:

| البند | الدليل |
|---|---|
| **RLS على كل جداول البوابتين** | فحصتُ 28 جدولاً: **كلها `RLS=ON`** بسياسات (2–5 لكل جدول) |
| **عزل الإجازات** | موظف عادي يرى `0` من إجازات زميله عبر RLS حقيقي |
| **حارس تجاوز الحالة** | `trg_guard_status_bypass` نافذ على `leaves` (و3 جداول أخرى) |
| **الطلبات المالية** | `0325` أصلح الاعتماد والرفض |
| **الإشعارات** | `0326` وحّد السطح |
| **`profiles.cv_data`** | `0333` أضافه — السيرة الذاتية تعمل |

---

## ثامناً: ترتيب العلاج المقترح

| # | البند | لماذا الآن |
|---|---|---|
| **1** | **قواعد اعتماد افتراضية** (`approval_rules`) | ★★★ بدونها كل طلب يتجمّد. سلسلة احتياطية: مدير القسم ← الموارد البشرية |
| **2** | **محفّز بناء الخطوات** على `hr_approval_requests` | ★★★ يُغلق الحلقة 3→4→5 |
| **3** | **توحيد نظامَي الاعتماد** | ★★★ قرار معماري: هل نُهاجر `hr_approval_*` إلى الموحّد أم نبني جسراً؟ |
| **4** | **تنظيف الطلبات اليتيمة** | ★★ محفّز أو أرشفة بدل حذف |
| **5** | **فصل شاشات الأدوار** | ★ `LeaveRequestPage` ثم `ProblemsList` |
| **6** | **أرشفة `MovementAnalysisPage`** + إعادة تسمية + PIN آمن | ★ |
| **7** | النظافة: 57 `as any` · 6 لمسات مباشرة | — |

---

## سؤال معماري يحتاج قرارك — البند 3

**النظامان لا يمكن أن يبقيا.** ثلاثة خيارات:

| الخيار | ماذا يعني | الكلفة |
|---|---|---|
| **أ — الهجرة الكاملة** | نقل `hr_approval_*` إلى `unified_approval_steps` وحذف القديم | الأكبر · الأنظف · محرك واحد لكل البوابات |
| **ب — الجسر** | محفّز يُزامن الجدولين في الاتجاهين | أسرع · يُبقي التعقيد ودَين الصيانة |
| **ج — الفصل الصريح** | `hr_approval_*` للطلبات البسيطة (إجازة · استئذان) والموحّد للمعقّدة | يحتاج حدوداً واضحة وإلا عاد الالتباس |

**توصيتي: أ.** المحرك الموحّد (`0305`–`0310`) أنضج: يدعم التدرّج
بالمبلغ · الوحدات · تتبّع السلسلة (`ApprovalTrail`) · وقد أُصلحت دورة
حياته في `0323`. وإبقاء نظامين يعني أن كل إصلاح مستقبلي يُكتب مرتين —
وهذا بالضبط سبب أن `0323` احتاج `sync_hr_source_status`.

---

## ملحق: منهجية الاستخراج

| المُخرَج | الطريقة |
|---|---|
| خدمة → جدول | تحليل `class X extends BaseService<T>` + `super('table')` ⇒ **204 خدمة** |
| صفحة → جداول | مطابقة `\b[a-z]\w*Service\.` في كل صفحة + الجداول الموروثة |
| لمس مباشر | `\.from\('([a-z0-9_]+)'\)` داخل ملفات الصفحات |
| RLS | `pg_class.relrowsecurity` + عدّ `pg_policies` |
| المفاتيح الأجنبية | `pg_constraint` حيث `contype='f'` |
| المحفّزات | `pg_trigger` حيث `NOT tgisinternal` |
| سلسلة الاعتماد | سيناريو حيّ على Postgres مع `RAISE NOTICE` وتراجع |
| العزل | جلسة `psql` واحدة: `SET request.jwt.claim.sub` + `SET ROLE authenticated` |
