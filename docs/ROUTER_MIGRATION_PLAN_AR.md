# 🧭 خطة إحياء Router الحقيقي — Kyvzon Platform

**التاريخ:** 15 يوليو 2026
**الفرع:** `remediation/p0-security-and-build-health`
**المهندس:** Platform Architect
**الهدف:** استبدال switch/activeView-based routing بـ `react-router-dom` كامل + deep-linking + Route Guards.

---

## 🎯 الملخص التنفيذي

المشروع حالياً يستخدم **switch كبير على `activeView` (Zustand)** بدلاً من router حقيقي. المشاكل:

- ❌ لا deep-linking — URL لا يعكس الصفحة
- ❌ زر Back يعمل عبر hack يدوي (`popstate` + `pushState`)
- ❌ Route guards مبعثرة داخل الـ switch
- ❌ لا يمكن مشاركة link لصفحة داخلية
- ❌ Refresh يعيدك للصفحة الافتراضية للدور
- ❌ **76 case** في switch واحد (467 سطر في App.tsx)

## الحل — استبدال شامل بـ `react-router-dom@6`

- ✅ 76 view → 76 route بمسار URL واضح
- ✅ deep-linking كامل: `/hr/attendance` مباشرة
- ✅ زر Back/Forward يعمل تلقائياً
- ✅ Route Guards موحّدة: `<RequireAuth>`, `<RequireRole>`, `<RequirePermission>`
- ✅ Refresh يبقيك على نفس الصفحة
- ✅ App.tsx يختصر إلى ~120 سطر

---

## 🗺️ خريطة المسارات المقترحة

### المسارات العامة (بدون auth)
```
/                       → LandingPage
/login                  → LoginPage
/disclaimer             → DisclaimerPage
/guide                  → SystemGuide
```

### المسارات المصادَق عليها — تحت `/app`
```
/app                    → Redirect to role-default
/app/notifications      → NotificationsPage
/app/my-notifications   → MyNotificationsPage

# Employee
/app/employee           → EmployeeDashboard
/app/employee/problems  → ProblemsList (isHR=false)
/app/employee/problems/new  → NewProblemPage
/app/employee/wellness  → WellnessPage
/app/employee/ai-chat   → AIChatPage
/app/employee/survey    → SurveyPage
/app/employee/training  → TrainingPage
/app/employee/sops      → SOPsPage
/app/employee/profile   → ProfilePage
/app/employee/contact   → ContactPage
/app/employee/attendance → MyAttendancePage
/app/employee/leave-requests → LeaveRequestPage
/app/employee/permissions → PermissionsPage
/app/employee/payroll   → MyPayrollPage
/app/employee/loans     → MyLoansPage
/app/employee/expenses  → MyExpensesPage
/app/employee/insights  → AIInsightsDashboard

# HR
/app/hr                 → HRDashboard
/app/hr/problems        → ProblemsList (isHR=true)
/app/hr/analytics       → AnalyticsPage
/app/hr/team            → TeamPage
/app/hr/reports         → ReportsPage
/app/hr/attendance      → AttendancePage
/app/hr/talent-market   → TalentMarketPage
/app/hr/movement-analysis → HRMovementAnalyticsPage
/app/hr/training/manage → TrainingManagementPage
/app/hr/training/reports → TrainingReportsPage
/app/hr/payroll         → HRPayrollPage
/app/hr/loans           → HRLoansPage
/app/hr/bonuses         → HRBonusesPage
/app/hr/expenses        → HRExpensesPage
/app/hr/recruitment     → RecruitmentPage
/app/hr/onboarding      → OnboardingPage
/app/hr/documents       → DocumentsPage
/app/hr/performance     → PerformancePage
/app/hr/disciplinary    → DisciplinaryPage
/app/hr/shifts          → ShiftSchedulingPage
/app/hr/communication   → HRCommunicationPage
/app/hr/leave-requests  → LeaveRequestPage
/app/hr/sops            → AdminSOPsPage

# Admin
/app/admin              → AdminDashboard
/app/admin/employees    → AdminEmployeesPage
/app/admin/permissions  → AdminPermissionsTree
/app/admin/permissions-management → PermissionsPage
/app/admin/audit-log    → AuditLogPage
/app/admin/settings     → SettingsPage
/app/admin/ai-config    → AIConfigPage
/app/admin/cms          → AdminLandingPageCMS
/app/admin/gatekeeper-permissions → AdminGatekeeperPermissions
/app/admin/sops         → AdminSOPsPage
/app/admin/sops-reports → AdminSOPsReport

# Other roles
/app/manager            → HRDashboard
/app/manager/attendance → ManagerAttendancePage
/app/supervisor/breaks  → SupervisorBreaksPage
/app/gatekeeper         → GatekeeperPage
/app/kiosk              → KioskPage
/app/tech-portal        → TechPortal
/app/tawathul           → TawathulPortalPage
/app/tawathul/admin     → TawathulAdminPage
/app/insights           → AIInsightsDashboard

# Developer portal (shell خاص)
/dev                    → KyvzonDevPortal (بدون Sidebar/Header العام)
```

### التعامل مع legacy URLs
- `?view=X` (query param القديم) → redirect إلى المسار الجديد
- localStorage `activeView` → يُقرأ مرة ثم يُمحى للتوافق

---

## 🛡️ Route Guards (المكونات الحارسة)

### 1. `<RequireAuth>` — المستخدم مسجَّل الدخول
```tsx
<RequireAuth>
  <Outlet />
</RequireAuth>
```
- إن لم يكن مصادَق عليه → redirect إلى `/login?redirect=<current>`
- بعد login، يعود لنفس URL

### 2. `<RequireRole roles={['hr', 'admin']}>`
- إن لم يكن الدور مطابقاً → redirect إلى default-view لدوره
- يعرض toast خطأ

### 3. `<RequirePermission perm="hr-payroll">`
- يستخدم `hasPermission` من `permissions.ts`
- إن لم يكن مصرَّحاً → صفحة 403 بسيطة

### 4. `<RoleRedirect>` — يُوجِّه للمسار الافتراضي حسب الدور
- `/app` → `/app/hr` (لـ HR)، `/app/admin` (لـ admin)، إلخ
- يستخدم في `<Route index>` لـ `/app`

---

## 📅 خطة التنفيذ — 5 مراحل

### المرحلة 1: التحضير (~30 دقيقة)
1. ✅ إضافة `react-router-dom` للـ dependencies
2. ✅ إنشاء `src/router/` folder جديد:
   - `AppRouter.tsx` — Router الرئيسي
   - `routes.tsx` — تعريف كل المسارات
   - `guards/RequireAuth.tsx`
   - `guards/RequireRole.tsx`
   - `guards/RequirePermission.tsx`
   - `guards/RoleRedirect.tsx`

### المرحلة 2: بناء بنية Router (~90 دقيقة)
1. ✅ كتابة `routes.tsx` مع كل الـ 76 route
2. ✅ كتابة Guards (4 مكونات)
3. ✅ Layout components:
   - `PublicLayout.tsx` (لا Sidebar/Header)
   - `AppLayout.tsx` (Sidebar + Header + Outlet)
   - `DevLayout.tsx` (KyvzonDevPortal بدون shell عام)

### المرحلة 3: تحديث App.tsx (~30 دقيقة)
1. ✅ استبدال switch الكبير بـ `<AppRouter />`
2. ✅ حذف `SHARED_PAGE`, `PageRenderer`, `DefaultPage`
3. ✅ حذف hacks الـ popstate/pushState اليدوية
4. ✅ التأكد أن TenantProvider + ToastContainer + WelcomeModal ما زالت تحيط بالتطبيق

### المرحلة 4: تحديث Sidebar (~45 دقيقة)
1. ✅ استبدال `setActiveView` بـ `useNavigate()`
2. ✅ استبدال `activeView === X` بـ `useLocation() + matchPath()`
3. ✅ استخدام `<NavLink>` بدلاً من `<button onClick>`
4. ✅ الحفاظ على منطق الصلاحيات وBadges

### المرحلة 5: تحديث Zustand + تنظيف (~30 دقيقة)
1. ✅ إزالة `activeView` من UIStore
2. ✅ إزالة `setActiveView` methods
3. ✅ تحديث persist middleware ليخفض متطلبات storage
4. ✅ حذف `LandingPage.old.tsx` (1480 سطر — dead code)
5. ✅ تحديث ADRs

---

## 🔒 حماية Legacy — Legacy URL Redirects

المستخدمون الحاليون الذين يفتحون `?view=hr-attendance` يجب ألا يُكسَر لهم شيء:

```tsx
// في AppRouter — قبل الـ routes
function LegacyViewRedirect() {
  const [params] = useSearchParams();
  const view = params.get('view');
  if (!view) return null;
  const newPath = VIEW_TO_PATH[view];
  if (newPath) return <Navigate to={newPath} replace />;
  return null;
}
```

`VIEW_TO_PATH` — mapping من view القديم إلى المسار الجديد (76 عنصر).

---

## 🧪 ما نختبره

سيبقى `test:run` = 200/200 لأن الاختبارات الحالية لا تعتمد على router. الاختبارات الجديدة:

1. **RouteGuards.test.tsx** — 6 اختبارات:
   - RequireAuth يُحوِّل غير المصادَق عليهم
   - RequireRole يمنع الأدوار الأخرى
   - RequirePermission يمنع بلا صلاحية
   - RoleRedirect يوجِّه لـ default-view

2. **LegacyRedirect.test.tsx** — 3 اختبارات:
   - `?view=hr-attendance` → `/app/hr/attendance`
   - `?view=unknown` → لا يُعيد توجيه
   - localStorage `activeView` قديم يُقرأ مرة ثم يُمحى

---

## 📊 الأثر المتوقع

| المقياس | قبل | بعد |
|---|:---:|:---:|
| حجم App.tsx | 467 سطر | ~120 سطر |
| حجم switch/case | 76 case (~150 سطر) | 0 (يحلّها routes.tsx بجدول ~120 سطر) |
| Deep-linking يعمل | ❌ | ✅ |
| Browser Back/Forward | يعمل بـ hack | ✅ يعمل تلقائياً |
| Refresh يبقي الصفحة | ❌ (يعيد للـ default-view) | ✅ |
| مشاركة link داخلي | ❌ | ✅ |
| Route Guards موحّدة | ❌ (مبعثرة) | ✅ (3 مكونات) |
| اختبارات جديدة | — | +9 |
| dead code محذوف | — | 1480 سطر (LandingPage.old) |

---

## 🚦 معايير القبول (Definition of Done)

```
[ ] npm install react-router-dom يعمل بلا تعارض
[ ] كل 76 مسار يعمل بـ URL مباشر
[ ] deep-linking يعمل (نسخ URL + فتح في تبويب جديد)
[ ] Refresh يبقيك على نفس الصفحة
[ ] Back/Forward يعمل بلا كتابة كود
[ ] Route Guards تعمل: غير المصادَق عليهم يُحوَّلون
[ ] Legacy ?view= URLs يعيدون التوجيه للمسار الجديد
[ ] Sidebar يُبرِز العنصر النشط بشكل صحيح
[ ] Sidebar على الموبايل يُغلَق بعد التنقل
[ ] npm run check:all = PASS
[ ] الاختبارات = 200 + 9 جديدة = 209
[ ] LandingPage.old.tsx محذوف
```

---

**التوقيع:** Platform Architect
**الحالة:** جاهزة للتنفيذ — أبدأ بالمرحلة 1
