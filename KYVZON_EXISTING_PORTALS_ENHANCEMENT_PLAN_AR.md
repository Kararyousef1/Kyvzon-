# خطة إكمال نواقص البوابات الموجودة في Kyvzon-

**التاريخ:** 16 يوليو 2026  
**الفرع:** `remediation/p0-security-and-build-health`  
**النطاق:** تحسين البوابات الموجودة فقط، وتأجيل البوابات الجديدة المذكورة في تقرير Gap Analysis.  
**إعداد:** مراجعة هندسية/تحليل نظم لمشروع Kyvzon- داخل مساحة العمل.

---

## 1. قرار النطاق

لن يتم حالياً إنشاء بوابات ERP جديدة مثل المالية الكاملة، المشتريات، المخزون، المبيعات، CRM، سلاسل الإمداد، التصنيع، أو المشاريع.  
التركيز سيكون على البوابات الموجودة فعلياً في الكود:

1. بوابة الموظف Employee
2. بوابة الموارد البشرية HR
3. بوابة المدير Manager
4. بوابة المشرف Supervisor
5. بوابة الإدارة Admin
6. بوابة الحراسة Gatekeeper
7. بوابة التواصل Tawathul كميزة مشتركة موجودة
8. البوابة التقنية/المطور كمساندة تشغيلية موجودة

---

## 2. ما تم فحصه في المشروع

### 2.1 ملفات المسارات

- `src/router/AppRouter.tsx`
- `src/shared/components/dashboard/Sidebar.tsx`
- `src/router/legacyRedirect.ts`
- `src/core/constants/permissions.ts`

### 2.2 الصفحات الحالية حسب البوابة

#### Employee
- `EmployeeDashboard.tsx`
- `ProblemsList.tsx`
- `ProblemDetail.tsx`
- `NewProblemPage.tsx`
- `WellnessPage.tsx`
- `AIChatPage.tsx`
- `SurveyPage.tsx`
- `ProfilePage.tsx`
- `ContactPage.tsx`
- `TrainingPage.tsx`
- `SOPsPage.tsx`
- `MyAttendancePage.tsx`
- `LeaveRequestPage.tsx`
- `PermissionsPage.tsx`
- `AIInsightsDashboard.tsx`
- `MyPayrollPage.tsx`
- `MyLoansPage.tsx`
- `MyExpensesPage.tsx`

#### HR
- `HRDashboard.tsx`
- `AnalyticsPage.tsx`
- `TeamPage.tsx`
- `ReportsPage.tsx`
- `AttendancePage.tsx`
- `TalentMarketPage.tsx`
- `KioskPage.tsx`
- `HRMovementAnalyticsPage.tsx`
- `TrainingManagementPage.tsx`
- `TrainingReportsPage.tsx`
- `PayrollPage.tsx`
- `LoansPage.tsx`
- `BonusesPage.tsx`
- `ExpensesPage.tsx`
- `RecruitmentPage.tsx`
- `OnboardingPage.tsx`
- `DocumentsPage.tsx`
- `PerformancePage.tsx`
- `DisciplinaryPage.tsx`
- `ShiftSchedulingPage.tsx`
- `HRCommunicationPage.tsx`

#### Manager
- `ManagerAttendancePage.tsx`
- حالياً مسار `/app/manager` يعرض `HRDashboard` بدلاً من Dashboard خاص بالمدير.

#### Supervisor
- `SupervisorBreaksPage.tsx`
- لا يوجد `SupervisorDashboard` حالياً.

#### Admin
- `AdminDashboard.tsx`
- `AdminEmployeesPage.tsx`
- `AdminPermissionsTree.tsx`
- `AuditLogPage.tsx`
- `SettingsPage.tsx`
- `AIConfigPage.tsx`
- `AdminLandingPageCMS.tsx`
- `AdminGatekeeperPermissions.tsx`
- `AdminSOPsPage.tsx`
- `AdminSOPsReport.tsx`
- `OrgStructurePage.tsx` موجود لكنه غير مربوط في `AppRouter` أو `Sidebar`.

#### Gatekeeper
- `GatekeeperPage.tsx`
- `KioskPage.tsx` موجود تحت HR لكنه مستخدم كمسار عام `/app/kiosk`.

---

## 3. قاعدة البيانات والخدمات الحالية

المشروع لديه طبقة SDK واضحة تحت:

- `src/services/sdk`

والجداول الأساسية موجودة في migrations:

- `tenants`, `profiles`, `departments`, `employees`
- `attendance_logs`, `attendance_summary`, `leaves`, `leave_balance`, `permission_request`, `employee_breaks`, `overtime_log`
- `incidents`, `incident_comments`, `sops`, `sop_readings`, `courses`, `course_progress`, `survey_responses`, `wellness_entries`, `hr_messages`
- `payroll_periods`, `payroll_records`, `employee_loans`, `loan_repayments`, `bonuses`, `expense_requests`, `payroll_settings`
- `performance_cycles`, `performance_reviews`, `disciplinary_actions`, `shift_schedules`, `shift_assignments`
- `job_postings`, `job_applications`, `onboarding_tasks`, `employee_onboarding`, `offboarding_records`, `employee_documents`, `employee_certifications`
- `gatekeeper_sessions`, `gatekeeper_visitors`, `gatekeeper_visitor_logs`, `movements_log`, `time_logs`, `ai_insights`, `customer_reviews`
- `announcements`, `announcement_polls`, `announcement_votes`, إلخ.

الاستنتاج: لدينا أساس HRM قوي، ويجب أن نستثمر فيه أولاً قبل فتح بوابات ERP جديدة.

---

## 4. المبادئ الهندسية الحاكمة للتطوير القادم

أي إضافة يجب أن تلتزم بما يلي:

1. **لا وصول مباشر لقاعدة البيانات من الصفحات** إلا عبر SDK.
2. **كل جدول جديد يجب أن يحتوي على `tenant_id`** إلا إذا كان جدولاً تشغيلياً عاماً يستدعي استثناءً موثقاً.
3. **RLS لكل جدول جديد أو معدّل**.
4. **Types موحدة في `src/shared/types/sdk.ts`**.
5. **Service مستقل لكل نطاق** في `src/services/sdk`.
6. **إضافة المسارات في `AppRouter.tsx`**.
7. **إضافة عناصر التنقل في `Sidebar.tsx`**.
8. **تحديث `permissions.ts`** لكل صلاحية جديدة.
9. **اختبارات أو على الأقل contract checks** عند كل مرحلة.
10. **عدم كسر البوابات الحالية**؛ كل إضافة تكون Feature Slice صغيرة قابلة للمراجعة.

---

## 5. الفجوات العملية حسب البوابة الموجودة

## 5.1 بوابة الموظف Employee Portal

### الوضع الحالي
البوابة قوية وتغطي:

- الحضور
- الإجازات والأذونات
- الرواتب
- السلف
- النفقات
- التدريب
- SOPs
- الصحة النفسية
- البلاغات
- الملف الشخصي
- التواصل مع HR
- AI Chat و AI Insights

### النواقص التي سنضيفها داخل البوابة نفسها

#### A. لوحة مالية شخصية محسّنة

**الهدف:** تحويل صفحات `payroll/loans/expenses` من صفحات منفصلة فقط إلى تجربة مالية شخصية مترابطة.

**التعديلات:**

- تحسين `EmployeeDashboard.tsx` بإضافة قسم “ملخصي المالي”:
  - آخر راتب
  - صافي الراتب
  - إجمالي السلف المتبقية
  - النفقات المعلقة
  - المكافآت الأخيرة
- تحسين `MyPayrollPage.tsx`:
  - تفصيل الراتب: الأساسي، البدلات، الاستقطاعات، الصافي
  - مقارنة مع الشهر السابق
  - تحميل قسيمة راتب PDF لاحقاً
- تحسين `MyExpensesPage.tsx`:
  - حالات الطلب: مسودة، مقدّم، تحت المراجعة، مقبول، مرفوض، مدفوع
  - مرفقات الإيصالات
  - سجل الموافقات
- تحسين `MyLoansPage.tsx`:
  - جدول السداد
  - الأقساط القادمة
  - المتبقي من السلفة

**الخدمات المطلوبة/المعدلة:**

- تحسين `FinanceService.ts`
- تحسين `PayrollService.ts`
- إضافة خدمة لاحقة اختيارية: `EmployeeFinancialSummaryService.ts` أو دالة summary داخل الخدمات الحالية.

**الجداول المحتملة:**

- لا نبدأ بجداول مالية ERP كبيرة.
- نضيف فقط، إن لزم، أعمدة أو جدول بسيط:
  - `expense_attachments`
  - `expense_approval_history`
  - `loan_schedule`

#### B. إدارة الأهداف الشخصية والمهارات

**الهدف:** ربط أداء الموظف بتطويره وتدريبه.

**الصفحات المتأثرة:**

- `TrainingPage.tsx`
- `ProfilePage.tsx`
- `AIInsightsDashboard.tsx`
- وربما صفحة جديدة تحت بوابة الموظف: `MyGoalsPage.tsx`

**التعديلات:**

- صفحة “أهدافي” داخل بوابة الموظف.
- أهداف سنوية/ربع سنوية.
- نسبة إنجاز.
- ربط الهدف بمراجعة الأداء.
- مهارات الموظف وشهاداته.
- اقتراح دورات بناءً على فجوة المهارات.

**الخدمات المطلوبة:**

- `GoalService.ts`
- تحسين `CertificationService.ts`
- تحسين `TrainingService.ts`

**الجداول المقترحة:**

- `employee_goals`
- `goal_updates`
- `employee_skills`
- `skill_assessments`

#### C. تحسين تجربة الخدمة الذاتية HR Self-Service

**الهدف:** تقليل الاعتماد على HR في الطلبات المتكررة.

**التعديلات:**

- تحسين `ContactPage.tsx` ليصبح “مركز خدمات HR” مصغر:
  - نوع الطلب
  - أولوية
  - SLA
  - حالة الطلب
  - ردود HR
- إضافة طلبات خطابات HR:
  - تعريف راتب
  - إثبات عمل
  - خطاب خبرة
- ربطها مع `DocumentsPage` في HR.

**الخدمات/الجداول:**

- تحسين `MessageService.ts` أو إضافة `HRCaseService.ts`
- `hr_cases`
- `hr_case_comments`
- `employee_letter_requests`

### الأولوية داخل بوابة الموظف

1. لوحة مالية شخصية محسنة
2. مركز خدمات HR مصغر
3. الأهداف والمهارات
4. تحسين المرفقات والتدقيق

---

## 5.2 بوابة الموارد البشرية HR Portal

### الوضع الحالي
البوابة هي الأقوى في المشروع، وتغطي:

- Dashboard وتحليلات
- إدارة الموظفين
- الحضور والإجازات
- الرواتب والسلف والمكافآت والنفقات
- التوظيف
- التدريب
- التقارير
- المستندات
- الأداء
- الانضباط
- الورديات
- الحركة والحراسة
- التواصل

### النواقص التي سنضيفها داخل البوابة الحالية

#### A. Workforce Analytics متقدمة

**الصفحات المتأثرة:**

- `AnalyticsPage.tsx`
- `HRDashboard.tsx`
- `ReportsPage.tsx`

**التعديلات:**

- معدل الدوران Turnover
- معدل الغياب Absenteeism
- متوسط مدة التوظيف
- مخاطر ترك العمل
- إنتاجية حسب القسم
- مؤشرات التدريب والأداء
- مؤشرات صحة الموظفين بشكل إجمالي دون كشف تفاصيل حساسة

**الخدمات:**

- `WorkforceAnalyticsService.ts`
- أو توسيع `AIService.ts`/`AttendanceService.ts` بدوال تحليلية، لكن الأفضل خدمة مستقلة للقراءة المركبة.

**الجداول/Views:**

- يفضل SQL views أو RPC للقراءات الثقيلة:
  - `v_hr_workforce_kpis`
  - `v_hr_attendance_trends`
  - `v_hr_turnover_risk`

#### B. Succession Planning / تخطيط التعاقب

**الصفحات المتأثرة:**

- `TeamPage.tsx`
- `TalentMarketPage.tsx`
- `PerformancePage.tsx`
- صفحة جديدة داخل HR: `SuccessionPlanningPage.tsx`

**التعديلات:**

- تحديد المناصب الحرجة.
- ترشيح خلفاء.
- جاهزية المرشح: جاهز الآن، خلال 6 أشهر، خلال سنة.
- خطة تطوير مرتبطة بالدورات والأداء.

**الخدمات والجداول:**

- `SuccessionService.ts`
- `critical_positions`
- `succession_candidates`
- `succession_development_plans`

#### C. Diversity & Inclusion Reporting

**التنفيذ بحذر شديد بسبب حساسية البيانات.**

**الصفحات:**

- `AnalyticsPage.tsx`
- `ReportsPage.tsx`

**التعديلات:**

- تقارير إجمالية فقط حسب الأقسام والمستويات.
- منع إظهار بيانات فردية حساسة.
- إضافة إعداد لتعطيل/تفعيل هذه التحليلات حسب سياسة الشركة.

**الخدمات:**

- `DiversityAnalyticsService.ts`

#### D. Contract Management للموظفين أولاً

لن ندخل عقود الموردين حالياً لأنها تخص Procurement المؤجلة.

**الصفحات:**

- `DocumentsPage.tsx`
- `TeamPage.tsx`
- صفحة جديدة: `EmployeeContractsPage.tsx`

**التعديلات:**

- نوع العقد
- تاريخ البداية والنهاية
- التنبيه قبل الانتهاء
- مرفقات العقد
- حالة العقد

**الخدمات والجداول:**

- `ContractService.ts`
- `employee_contracts`
- `contract_renewal_alerts`

#### E. Health & Safety Management محسّن

يوجد `IncidentService.ts`، لكن البلاغات حالياً أقرب إلى مشاكل HR عامة.

**التعديلات:**

- إضافة تصنيف للحوادث:
  - حادث سلامة
  - إصابة عمل
  - خطر محتمل
  - حادث أمني
- سجل إجراءات التصحيح CAPA.
- تقارير السلامة حسب الموقع/القسم.

**الخدمات والجداول:**

- تحسين `IncidentService.ts`
- `safety_incidents` أو توسيع `incidents` مع نوع واضح
- `corrective_actions`

### أولوية HR

1. Workforce Analytics
2. عقود الموظفين والتنبيهات
3. تخطيط التعاقب
4. Health & Safety
5. Diversity Reporting

---

## 5.3 بوابة المدير Manager Portal

### الوضع الحالي
- لا توجد لوحة مدير حقيقية.
- `/app/manager` يعرض `HRDashboard`.
- توجد صفحة واحدة قوية: `ManagerAttendancePage.tsx`.

### النواقص الحرجة

#### A. إنشاء `ManagerDashboard.tsx`

**المحتوى:**

- ملخص الفريق
- الحضور اليومي
- المتأخرون والغائبون
- طلبات تنتظر الموافقة
- أداء الفريق
- الدورات المتأخرة
- البلاغات المفتوحة داخل الفريق

**الخدمات:**

- `ManagerDashboardService.ts`
- أو استخدام خدمات قائمة مع دوال scoped by manager/team.

#### B. Approval Center / مركز الموافقات

**صفحة جديدة:**

- `ManagerApprovalsPage.tsx`

**الطلبات التي يديرها:**

- إجازات
- أذونات
- نفقات
- سلف، إن كانت سياسة الشركة تتطلب موافقة المدير
- تصحيح حضور
- أهداف الموظفين

**الخدمة والجداول:**

- `ApprovalService.ts`
- `approval_requests`
- `approval_steps`
- `approval_actions`

#### C. Team Performance

**صفحة جديدة:**

- `TeamPerformancePage.tsx`

**التعديلات:**

- مراجعات الأداء لفريق المدير.
- أهداف الفريق.
- الموظفون ذوو الأداء العالي/المحتاجون دعم.
- تنبيهات انتهاء شهادات أو دورات.

#### D. Resource Allocation مبسط داخل HRM

لن ندخل Project Portal حالياً، لكن يمكن إضافة توزيع مهام داخلي خفيف.

**صفحة:**

- `TeamWorkloadPage.tsx`

**الجداول:**

- `team_tasks`
- `team_task_assignments`

### أولوية Manager

1. ManagerDashboard
2. Approval Center
3. Team Performance
4. Team Workload/Tasks

---

## 5.4 بوابة المشرف Supervisor Portal

### الوضع الحالي
- صفحة واحدة فقط: `SupervisorBreaksPage.tsx`.
- المشرف يملك صلاحيات موظف مع بعض الصلاحيات الإضافية.

### النواقص الحرجة

#### A. إنشاء `SupervisorDashboard.tsx`

**المحتوى:**

- فريق الوردية الحالي
- الحضور الفوري
- الاستراحات المفتوحة
- المتأخرون
- مشاكل اليوم
- تنبيهات السلامة

#### B. Shift Operations

**الصفحات:**

- تحسين `SupervisorBreaksPage.tsx`
- إضافة `SupervisorShiftPage.tsx`

**التعديلات:**

- بدء/إغلاق الوردية.
- عرض الموظفين المعينين للوردية.
- تسجيل ملاحظات الوردية.
- تسليم الوردية للمشرف التالي.

**الخدمات والجداول:**

- تحسين `ShiftService.ts`
- `shift_handovers`
- `shift_notes`

#### C. Task Assignment خفيف

**صفحة:**

- `SupervisorTasksPage.tsx`

**التعديلات:**

- إنشاء مهمة تشغيلية يومية.
- إسناد لموظف.
- حالة المهمة.
- ملاحظات الإنجاز.

**الخدمات:**

- `TaskService.ts`

#### D. Safety & Quality Checklists

بدلاً من تصنيع كامل، نبدأ بقوائم فحص تشغيلية.

**صفحة:**

- `SupervisorChecklistsPage.tsx`

**الجداول:**

- `operational_checklists`
- `checklist_items`
- `checklist_submissions`

### أولوية Supervisor

1. SupervisorDashboard
2. Shift Operations/Handover
3. Supervisor Tasks
4. Safety/Quality Checklists

---

## 5.5 بوابة الإدارة Admin Portal

### الوضع الحالي
بوابة الإدارة جيدة، لكن فيها نقص في إدارة الشركة والفروع والامتثال، كما أن `OrgStructurePage.tsx` غير مربوط في التنقل.

### النواقص المطلوب إضافتها

#### A. ربط وتحسين الهيكل التنظيمي

**التعديلات الفورية:**

- إضافة Route لـ `OrgStructurePage.tsx`.
- إضافة عنصر Sidebar.
- التأكد من الصلاحية في `permissions.ts`.

**الصفحة:**

- `OrgStructurePage.tsx`

#### B. Company Profile / Tenant Profile

**صفحة جديدة أو ضمن Settings:**

- `CompanyProfilePage.tsx`

**التعديلات:**

- شعار الشركة
- الاسم التجاري والقانوني
- البلد والمدينة
- العملة الافتراضية كإعداد فقط، دون فتح مالية ERP
- اللغة والوقت
- سياسات الحضور والإجازات العامة

**الخدمات:**

- تحسين `TenantService.ts`
- تحسين `SettingsService.ts`

#### C. Branch Management

**صفحة جديدة:**

- `BranchesPage.tsx`

**الجداول:**

- `branches`
- ربط الموظفين بالفروع عند الحاجة.

#### D. Compliance Center مصغر

**صفحة جديدة:**

- `CompliancePage.tsx`

**التعديلات:**

- سياسات مطلوبة
- سجل قبول الموظفين للسياسات
- تواريخ مراجعة السياسات
- تنبيهات انتهاء المستندات الحساسة
- تدقيق صلاحيات المستخدمين

**الخدمات والجداول:**

- `ComplianceService.ts`
- `policy_acknowledgements`
- `compliance_checks`

#### E. Advanced Security Policies

**التعديلات:**

- تقوية `AdminPermissionsTree.tsx`.
- سجل تغيير الصلاحيات.
- مراجعة دورية للصلاحيات.
- عرض المستخدمين ذوي الصلاحيات العالية.

### أولوية Admin

1. ربط OrgStructurePage
2. Company Profile
3. Branches
4. Compliance Center
5. Advanced Security Review

---

## 5.6 بوابة الحراسة Gatekeeper Portal

### الوضع الحالي
بوابة الحراسة قوية نسبياً، وتحتوي على:

- جلسات الحراسة
- الزوار
- سجلات الدخول والخروج
- الحركة
- استراحات الموظفين
- Kiosk/محطة تسجيل ذاتي

### النواقص المطلوبة

#### A. Visitor Pre-Registration

**داخل `GatekeeperPage.tsx` أو صفحة جديدة:**

- `VisitorPreRegistrationPage.tsx`

**التعديلات:**

- تسجيل زيارة مسبقة من HR/Admin/Manager.
- رمز زيارة QR أو رقم مرجعي.
- الشخص المستضيف.
- وقت الزيارة المتوقع.

**الخدمات:**

- تحسين `GatekeeperVisitorService.ts`
- `VisitorInvitationService.ts`

**الجداول:**

- `visitor_invitations`

#### B. Access Control Integration Status

لا نربط بأجهزة حقيقية الآن، لكن نضيف صفحة تشغيلية لحالة التكامل.

**صفحة:**

- `AccessDevicesPage.tsx`

**الخدمات:**

- تحسين `BiometricDeviceService.ts`
- `device_health_logs`

#### C. Parking Management مبسط

ليس بوابة جديدة، بل تبويب داخل الحراسة.

**صفحة:**

- `ParkingPage.tsx`

**الجداول:**

- `parking_permits`
- `vehicle_logs`

#### D. Security Incident Management

**التعديلات:**

- استخدام `IncidentService.ts` مع نوع حادث أمني.
- تبويب “حوادث أمنية” في Gatekeeper.
- مسار تصعيد إلى HR/Admin.

### أولوية Gatekeeper

1. Visitor Pre-Registration
2. Security Incidents
3. Device Health
4. Parking

---

## 5.7 Tawathul / التواصل

### الوضع الحالي
بوابة `tawathul` موجودة كموديول مستقل تحت `src/modules/tawathul`.

### التحسينات المقترحة ضمن الموجود

1. ربط طلبات HR Cases مع محادثات Tawathul.
2. إشعارات عند تحديث الطلبات.
3. قنوات حسب القسم أو الفرع.
4. صلاحيات واضحة للمحادثات الحساسة.

---

## 6. خطة التنفيذ التدريجية المقترحة

## المرحلة 0 — تثبيت الأساس قبل أي Feature

**المدة:** 2-3 أيام  
**الهدف:** منع إضافة عشوائية فوق بنية غير موثقة.

### المهام

1. توثيق خريطة المسارات الحالية.
2. توثيق خريطة Sidebar الحالية.
3. تشغيل:
   - `npm run type-check`
   - `npm run sdk:boundary-check`
   - `npm run db:contract-check`
   - `npm run test:run`
   - `npm run build`
4. تحديد الصفحات التي تستخدم Supabase مباشرة إن وجدت.
5. فتح ملف `docs/EXISTING_PORTALS_ENHANCEMENT_BACKLOG.md` يحتوي backlog رسمي.

### المخرجات

- تقرير صحة البناء.
- قائمة Technical Debt قبل التطوير.
- Backlog نهائي مصنف حسب البوابة.

---

## المرحلة 1 — إصلاح البوابات الأضعف: Manager + Supervisor

**المدة:** 1-2 أسبوع  
**السبب:** هذه أكبر فجوة داخل البوابات الموجودة.

### Manager

1. إنشاء `ManagerDashboard.tsx`.
2. تعديل `/app/manager` ليعرض Dashboard المدير بدلاً من `HRDashboard`.
3. إنشاء `ManagerApprovalsPage.tsx`.
4. إضافة `ApprovalService.ts`.
5. إضافة جداول الموافقات.
6. تحديث Sidebar والصلاحيات.

### Supervisor

1. إنشاء `SupervisorDashboard.tsx`.
2. إنشاء `SupervisorShiftPage.tsx`.
3. إنشاء `SupervisorTasksPage.tsx`.
4. تحسين `SupervisorBreaksPage.tsx`.
5. تحديث Sidebar والصلاحيات.

### معايير القبول

- المدير يرى فقط فريقه، لا كل الشركة.
- المشرف يرى فقط وردياته/فريقه.
- كل الاستعلامات محمية بـ RLS/tenant_id.
- لا يتم كسر صفحات Employee/HR الحالية.

---

## المرحلة 2 — Employee Self-Service وتحسين التجربة الشخصية

**المدة:** 1-2 أسبوع

### المهام

1. تحسين `EmployeeDashboard.tsx` بملخص مالي ومهام معلقة.
2. تحسين صفحات:
   - `MyPayrollPage.tsx`
   - `MyExpensesPage.tsx`
   - `MyLoansPage.tsx`
3. إضافة مرفقات النفقات وسجل الموافقات.
4. إضافة `MyGoalsPage.tsx`.
5. إضافة `employee_goals` و `employee_skills`.
6. تحسين `ProfilePage.tsx` لعرض المهارات والشهادات.

### معايير القبول

- الموظف يرى “ما يهمه الآن” في Dashboard.
- كل طلب مالي/إداري له حالة واضحة وسجل تدقيق.
- لا توجد بيانات مالية لموظف آخر.

---

## المرحلة 3 — HR Analytics + Contracts + Succession

**المدة:** 2-3 أسابيع

### المهام

1. إنشاء `WorkforceAnalyticsService.ts`.
2. تحسين `AnalyticsPage.tsx` و `HRDashboard.tsx`.
3. إضافة `EmployeeContractsPage.tsx`.
4. إضافة `SuccessionPlanningPage.tsx`.
5. ربط التدريب والأداء بالتعاقب.
6. إضافة views/RPC للتقارير الثقيلة.

### معايير القبول

- تقارير HR تعتمد على بيانات حقيقية وليست mock.
- لا تعرض التحليلات بيانات حساسة فردية إلا لمن يملك صلاحية صريحة.
- العقود لها تنبيهات قبل الانتهاء.

---

## المرحلة 4 — Admin Governance

**المدة:** 1-2 أسبوع

### المهام

1. ربط `OrgStructurePage.tsx` في Router و Sidebar.
2. إنشاء/تحسين `CompanyProfilePage.tsx`.
3. إضافة `BranchesPage.tsx`.
4. إضافة `CompliancePage.tsx`.
5. تحسين مراجعة الصلاحيات في Admin.

### معايير القبول

- كل فرع/قسم/منصب واضح في النظام.
- إعدادات الشركة لا تكسر multi-tenancy.
- يوجد سجل تدقيق لتغييرات الأمن والصلاحيات.

---

## المرحلة 5 — Gatekeeper Hardening

**المدة:** 1-2 أسبوع

### المهام

1. إضافة التسجيل المسبق للزوار.
2. إضافة حوادث أمنية مخصصة.
3. إضافة حالة أجهزة البصمة/الوصول.
4. إضافة إدارة مواقف بسيطة.
5. تحسين التقارير اليومية للحارس.

### معايير القبول

- الزائر يمكن تتبعه من الدعوة إلى الخروج.
- الحوادث الأمنية لها تصعيد واضح.
- سجلات الحركة لا يمكن تعديلها بدون تدقيق.

---

## 7. ترتيب الأولويات النهائي

| الأولوية | البوابة | العمل | السبب |
|---|---|---|---|
| P0 | Manager | Dashboard + Approvals | نقص واضح جداً ومسار المدير حالياً يعرض HRDashboard |
| P0 | Supervisor | Dashboard + Shift Operations | البوابة شبه فارغة حالياً |
| P1 | Employee | Financial Summary + HR Self-Service | تحسين قيمة يومية لكل مستخدم |
| P1 | HR | Workforce Analytics | تحويل البيانات الحالية إلى قرارات |
| P1 | Admin | OrgStructure + Company Profile | أساس حوكمة النظام |
| P2 | HR | Contracts + Succession | نضج HRM احترافي |
| P2 | Gatekeeper | Visitor Pre-Registration + Security Incidents | تقوية الأمن التشغيلي |
| P3 | Employee/HR | Goals + Skills + Learning recommendations | تطوير المواهب |
| P3 | Admin | Compliance Center | جاهزية تنظيمية وتدقيق |

---

## 8. مخاطر التنفيذ وكيف نمنعها

### خطر 1: تضخم المشروع وتحويله إلى ERP كامل قبل وقته

**المعالجة:** ممنوع إنشاء بوابات ERP جديدة في هذه المرحلة. كل إضافة يجب أن تخدم بوابة موجودة.

### خطر 2: كسر RLS أو Multi-Tenancy

**المعالجة:** كل Migration جديدة تمر بمراجعة:

- `tenant_id`
- سياسات RLS
- indexes
- audit trail

### خطر 3: تكرار الخدمات أو جداول متداخلة

**المعالجة:** لا ننشئ خدمة جديدة إذا كانت خدمة قائمة يمكن توسيعها دون تشويه.

### خطر 4: صفحات كثيرة بلا قيمة

**المعالجة:** كل صفحة جديدة يجب أن يكون لها:

- مستخدم واضح
- قرار/عملية واضحة
- خدمة SDK
- صلاحية
- route
- sidebar
- test/check

---

## 9. أول Sprint تنفيذي مقترح

### Sprint 1: Manager/Supervisor Foundations

**المدة:** 5-7 أيام عمل

#### المهام التفصيلية

1. إنشاء:
   - `src/pages/manager/ManagerDashboard.tsx`
   - `src/pages/manager/ManagerApprovalsPage.tsx`
   - `src/pages/supervisor/SupervisorDashboard.tsx`
   - `src/pages/supervisor/SupervisorShiftPage.tsx`
2. إنشاء:
   - `src/services/sdk/ApprovalService.ts`
   - `src/services/sdk/ManagerService.ts`
   - `src/services/sdk/SupervisorService.ts`
3. Migration:
   - `approval_requests`
   - `approval_steps`
   - `approval_actions`
   - `shift_notes`
   - `shift_handovers`
4. تحديث:
   - `AppRouter.tsx`
   - `Sidebar.tsx`
   - `legacyRedirect.ts`
   - `permissions.ts`
   - `src/services/sdk/index.ts`
   - `src/shared/types/sdk.ts`
5. اختبارات/Checks:
   - type-check
   - sdk boundary
   - db contract
   - build

#### معايير نجاح Sprint 1

- `/app/manager` يعرض Dashboard مدير مستقل.
- المدير يملك مركز موافقات أولي.
- `/app/supervisor` يعرض Dashboard مشرف مستقل.
- المشرف يملك صفحة وردية تشغيلية.
- لا توجد بوابات ERP جديدة.
- لا توجد استعلامات مباشرة من الصفحات إلى Supabase خارج SDK.

---

## 10. الخلاصة

مشروع Kyvzon- ليس بحاجة حالياً إلى فتح بوابات ERP جديدة قبل تقوية ما هو موجود.  
أفضل قرار هندسي هو إكمال البوابات الحالية تدريجياً، خصوصاً Manager و Supervisor، ثم تحسين Employee Self-Service و HR Analytics، وبعدها Admin Governance و Gatekeeper Hardening.

هذه الخطة تحول النظام من HRM جيد إلى HRM مؤسسي ناضج، وتمهّد لاحقاً لإضافة بوابات ERP المؤجلة دون فوضى معمارية.
