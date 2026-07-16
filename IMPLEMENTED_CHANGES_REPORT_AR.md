# تقرير التغييرات المنفذة في مشروع Kyvzon-

**التاريخ:** 16 يوليو 2026  
**الفرع:** `remediation/p0-security-and-build-health`  
**نوع التقرير:** تقرير تغييرات تنفيذية على الكود وقاعدة البيانات والبوابات  
**الحالة:** مكتمل ومتحقق منه بالبناء والاختبارات

---

## 1. ملخص عام

تم تنفيذ مجموعة كبيرة من التغييرات على مشروع Kyvzon- بهدف تحسين البوابات الموجودة حاليًا دون إضافة بوابات ERP جديدة مستقلة.

شملت التغييرات:

- إضافة صفحات جديدة.
- تحسين صفحات موجودة.
- إنشاء خدمات SDK جديدة.
- إضافة migrations جديدة لقاعدة البيانات.
- تحديث الصلاحيات.
- تحديث القائمة الجانبية.
- تحديث المسارات.
- تحديث أنواع SDK.
- إزالة استخدامات مباشرة لـ Supabase من بعض الصفحات وتحويلها إلى SDK.
- تشغيل فحوصات كاملة للتأكد من سلامة المشروع.

---

## 2. نتيجة التحقق النهائية

تم تشغيل:

```bash
npm run check:all
```

والنتيجة:

```text
TypeScript type-check: PASS
SDK Boundary Check: PASS
DB Contract Check: PASS
Tests: 246 passed
Test Files: 15 passed
Production Build: PASS
```

كما تم تشغيل:

```bash
npm audit --audit-level=moderate
```

والنتيجة:

```text
found 0 vulnerabilities
```

الخلاصة:

```text
المشروع سليم من ناحية البناء، الاختبارات، TypeScript، حدود SDK، وعقد قاعدة البيانات.
```

---

## 3. التغييرات على بوابة الموظف

### صفحات تمت إضافتها

```text
src/pages/employee/MyGoalsPage.tsx
```

### صفحات تم تعديلها

```text
src/pages/employee/EmployeeDashboard.tsx
src/pages/employee/ContactPage.tsx
src/pages/employee/MyPayrollPage.tsx
src/pages/employee/MyExpensesPage.tsx
src/pages/employee/MyLoansPage.tsx
src/pages/employee/ProfilePage.tsx
src/pages/employee/TrainingPage.tsx
src/pages/employee/MyAttendancePage.tsx
```

### أهم التغييرات

- إضافة صفحة أهداف ومهارات الموظف.
- إضافة ملخص مالي في لوحة الموظف.
- تحسين صفحة الرواتب مع مقارنة بين آخر قسيمتين.
- تحسين صفحة النفقات مع بحث وفلترة ومسار طلب.
- تحسين صفحة السلف مع طلب ذاتي وجدول سداد.
- تحويل صفحة التواصل إلى مركز خدمات HR.
- إضافة طلبات خطابات رسمية.
- ربط الملف الشخصي بالأهداف والمهارات والشهادات.
- تحسين التدريب وربطه بالأهداف والمهارات.
- إضافة طلب تصحيح حضور من صفحة الحضور.

### خدمات SDK مضافة

```text
src/services/sdk/EmployeeDevelopmentService.ts
src/services/sdk/EmployeeSelfServiceService.ts
```

### جداول قاعدة بيانات مضافة

من خلال migration:

```text
supabase/migrations/0016_employee_self_service.sql
```

الجداول:

```text
employee_goals
goal_updates
employee_skills
hr_cases
hr_case_comments
employee_letter_requests
```

---

## 4. التغييرات على بوابة الموارد البشرية HR

### صفحات تمت إضافتها

```text
src/pages/hr/EmployeeContractsPage.tsx
src/pages/hr/SuccessionPlanningPage.tsx
src/pages/hr/HRServiceCenterPage.tsx
src/pages/hr/HealthSafetyPage.tsx
```

### صفحات تم تعديلها

```text
src/pages/hr/AnalyticsPage.tsx
src/pages/hr/ReportsPage.tsx
src/pages/hr/HRMovementAnalyticsPage.tsx
```

### أهم التغييرات

- إضافة إدارة عقود الموظفين.
- إضافة تخطيط التعاقب للمناصب الحرجة.
- إضافة مركز خدمات HR لإدارة طلبات الموظفين والخطابات.
- إضافة صفحة الصحة والسلامة المهنية.
- إضافة الإجراءات التصحيحية CAPA.
- تحسين تحليلات HR بمؤشرات القوى العاملة.
- إضافة تقارير للقوى العاملة والعقود والتعاقب.
- إضافة تبويب تصاريح الحركة في تحليلات الحركة.

### خدمات SDK مضافة

```text
src/services/sdk/ContractService.ts
src/services/sdk/SuccessionService.ts
src/services/sdk/HealthSafetyService.ts
src/services/sdk/WorkforceAnalyticsService.ts
```

### جداول قاعدة بيانات مضافة

```text
employee_contracts
critical_positions
succession_candidates
succession_development_plans
corrective_actions
```

من خلال migrations:

```text
supabase/migrations/0017_hr_maturity_contracts_succession.sql
supabase/migrations/0018_hr_service_center_health_safety.sql
```

---

## 5. التغييرات على بوابة الإدارة Admin

### صفحات تمت إضافتها

```text
src/pages/admin/CompanyProfilePage.tsx
src/pages/admin/BranchesPage.tsx
src/pages/admin/CompliancePage.tsx
```

### صفحات تم تعديلها

```text
src/pages/admin/AdminDashboard.tsx
src/pages/admin/AuditLogPage.tsx
src/pages/admin/SettingsPage.tsx
```

### صفحة كانت موجودة وتم ربطها

```text
src/pages/admin/OrgStructurePage.tsx
```

### أهم التغييرات

- إضافة صفحة ملف الشركة.
- إضافة إدارة الفروع.
- إضافة مركز الامتثال.
- ربط صفحة الهيكل التنظيمي بالراوتر والقائمة.
- تحسين لوحة الإدارة بمؤشرات الحوكمة.
- تحسين سجل العمليات مع فلاتر وتصدير CSV.
- إصلاح حفظ الإعدادات حتى لا يمسح إعدادات ملف الشركة.
- إضافة منطقة بغداد الزمنية.

### خدمات SDK مضافة

```text
src/services/sdk/BranchService.ts
src/services/sdk/ComplianceService.ts
```

### جداول قاعدة بيانات مضافة

```text
branches
compliance_checks
policy_acknowledgements
```

من خلال migration:

```text
supabase/migrations/0019_admin_governance_branches_compliance.sql
```

---

## 6. التغييرات على بوابة الحركة والحراسة

### صفحات تمت إضافتها

```text
src/pages/gatekeeper/MovementControlPage.tsx
```

### صفحات تم تعديلها

```text
src/pages/hr/HRMovementAnalyticsPage.tsx
```

### خدمات تم تعديلها

```text
src/services/sdk/GatekeeperService.ts
```

### خدمات SDK مضافة

```text
src/services/sdk/MovementPermitService.ts
```

### أهم التغييرات

- إضافة صفحة مستقلة لبوابة الحركة.
- تسجيل خروج وعودة الموظفين.
- كشف التأخير.
- كشف مخالفة المسار.
- إضافة تصاريح حركة مسبقة.
- استخدام التصريح تلقائيًا عند تسجيل الحركة.
- إلغاء التصريح.
- عرض التصاريح داخل تحليلات HR.
- تصدير تصاريح الحركة إلى Excel.
- إصلاح فلتر `fromDate` في `movementLogService.findMovements`.

### جداول وقاعدة بيانات

تم تحسين جدول:

```text
movements_log
```

وإضافة جدول:

```text
movement_permits
```

من خلال:

```text
supabase/migrations/0020_movement_portal_hardening.sql
supabase/migrations/0021_movement_permits.sql
```

---

## 7. التغييرات على بوابة المشرف

### صفحات تمت إضافتها

```text
src/pages/supervisor/SupervisorDashboard.tsx
src/pages/supervisor/SupervisorShiftPage.tsx
src/pages/supervisor/SupervisorTasksPage.tsx
src/pages/supervisor/SupervisorChecklistsPage.tsx
```

### صفحات تم تعديلها

```text
src/pages/supervisor/SupervisorBreaksPage.tsx
```

### أهم التغييرات

- إضافة لوحة مشرف تشغيلية.
- إضافة إدارة الوردية.
- إضافة ملاحظات وتسليمات الوردية.
- إضافة مهام الفريق.
- إضافة قوائم فحص تشغيلية.
- تحسين تصاريح الاستراحة.
- إزالة الاستخدام المباشر لـ Supabase في صفحة الاستراحات وتحويلها إلى SDK.

### خدمات SDK مضافة

```text
src/services/sdk/SupervisorService.ts
```

وتحتوي على:

```text
teamTaskService
shiftNoteService
operationalChecklistService
```

### جداول قاعدة بيانات مضافة

```text
team_tasks
shift_notes
operational_checklists
```

من خلال:

```text
supabase/migrations/0022_supervisor_portal_operations.sql
```

---

## 8. التغييرات على بوابة المدير

### صفحات تمت إضافتها

```text
src/pages/manager/ManagerDashboard.tsx
src/pages/manager/ManagerApprovalsPage.tsx
src/pages/manager/ManagerTeamPerformancePage.tsx
src/pages/manager/ManagerWorkloadPage.tsx
```

### أهم التغييرات

- إنشاء Dashboard مستقل للمدير بدل استخدام HRDashboard.
- إضافة مركز موافقات المدير.
- إضافة صفحة أداء الفريق.
- إضافة صفحة عبء العمل والموارد.
- ربط المدير بأهداف ومهارات فريقه.
- إضافة عناصر عمل وتقدير ساعات.

### خدمات SDK مضافة

```text
src/services/sdk/ApprovalService.ts
src/services/sdk/ManagerService.ts
```

### جداول قاعدة بيانات مضافة

```text
approval_requests
approval_actions
manager_workload_items
```

من خلال:

```text
supabase/migrations/0023_manager_portal_approvals_workload.sql
```

---

## 9. ملفات رئيسية تم تحديثها على مستوى النظام

```text
src/router/AppRouter.tsx
src/router/legacyRedirect.ts
src/shared/components/dashboard/Sidebar.tsx
src/core/constants/permissions.ts
src/shared/types/sdk.ts
src/services/sdk/index.ts
```

### الغرض من التحديثات

- ربط الصفحات الجديدة بالمسارات.
- تحديث القائمة الجانبية.
- إضافة صلاحيات جديدة.
- تصدير خدمات SDK الجديدة.
- تحديث أنواع البيانات.
- دعم legacy redirects للمسارات الجديدة.

---

## 10. قائمة خدمات SDK الجديدة

```text
ApprovalService.ts
BranchService.ts
ComplianceService.ts
ContractService.ts
EmployeeDevelopmentService.ts
EmployeeSelfServiceService.ts
HealthSafetyService.ts
ManagerService.ts
MovementPermitService.ts
SuccessionService.ts
SupervisorService.ts
WorkforceAnalyticsService.ts
```

---

## 11. قائمة migrations الجديدة

```text
0016_employee_self_service.sql
0017_hr_maturity_contracts_succession.sql
0018_hr_service_center_health_safety.sql
0019_admin_governance_branches_compliance.sql
0020_movement_portal_hardening.sql
0021_movement_permits.sql
0022_supervisor_portal_operations.sql
0023_manager_portal_approvals_workload.sql
```

---

## 12. إضافات SaaS Control Plane الأخيرة

تمت إضافة طبقة تحكم مركزية في بوابة المطور لإدارة تفعيل وتعطيل البوابات حسب الشركة وخطة الاشتراك.

### ملفات جديدة/معدلة

```text
src/services/sdk/TenantModuleService.ts
src/pages/devportal/pages/ModulesPage.tsx
src/shared/hooks/useTenantModules.ts
src/router/moduleMap.ts
src/router/guards/RequireModule.tsx
src/test/tenantModules.test.ts
supabase/migrations/0024_tenant_modules_control_plane.sql
```

### الإمكانيات المضافة

- جدول `tenant_modules` لإدارة البوابات لكل شركة.
- كتالوج مركزي للبوابات.
- تحديد البوابات المسموحة حسب الخطة.
- حدود أولية لكل خطة: الموظفون، الفروع، أجهزة البصمة، التخزين.
- صفحة إدارة البوابات داخل بوابة المطور.
- ربط صفحة الشركات بزر مباشر لإدارة بوابات الشركة.
- ربط صفحة الاشتراكات بعرض البوابات المفعلة والمسموحة.
- مزامنة البوابات مع خطة الاشتراك.
- إخفاء البوابات غير المفعلة من Sidebar.
- منع الوصول إلى مسارات بوابات غير مفعلة عبر `RequireModule`.
- إضافة اختبارات مباشرة لمنطق البوابات وخريطة المسارات.

---

## 13. إضافة Kyvzon Biometric Agent

تمت إضافة Agent مستقل داخل المشروع لتشغيل مزامنة أجهزة البصمة داخل شبكة العميل.

### الملفات الجديدة

```text
tools/biometric-agent/package.json
tools/biometric-agent/README.md
tools/biometric-agent/config/agent.config.example.json
tools/biometric-agent/src/agent.mjs
tools/biometric-agent/src/config.mjs
tools/biometric-agent/src/hmac.mjs
tools/biometric-agent/src/queue.mjs
tools/biometric-agent/src/zktecoAdapter.mjs
```

### إمكانياته

- يعمل داخل شبكة العميل On-Premise.
- يرسل البصمات إلى `zkteco-sync` بتوقيع HMAC.
- يدعم Offline Queue.
- يوفر Local API للصحة والمزامنة اليدوية.
- يحتوي Adapter تجريبي `mock`.
- يحتوي Adapter `file` للاختبار من JSON.
- يترك نقطة توسعة واضحة لـ `zkteco-tcp` عبر SDK أو مكتبة ZKTeco.

### التحقق

تم تشغيل:

```bash
npm --prefix tools/biometric-agent run check
```

والنتيجة ناجحة.

---

## 14. حالة Git الحالية

التغييرات موجودة في مساحة العمل ولم يتم عمل commit لها بعد.

يوجد:

- ملفات معدلة.
- ملفات جديدة.
- migrations جديدة.
- تقرير سابق شامل:

```text
PORTAL_ENHANCEMENTS_COMPLETION_REPORT_AR.md
```

وهذا التقرير الحالي:

```text
IMPLEMENTED_CHANGES_REPORT_AR.md
```

---

## 13. ملاحظات تشغيلية مهمة

1. يجب تطبيق migrations الجديدة على بيئة Supabase قبل استخدام الميزات الجديدة في البيئة الحية.
2. جميع الميزات الجديدة مربوطة بالـ SDK وليست باستدعاءات Supabase مباشرة من الصفحات.
3. بعض الميزات تعتمد على وجود بيانات فعلية في الجداول الجديدة، لذلك ستظهر فارغة في البداية حتى يتم إدخال بيانات.
4. تم الحفاظ على مبدأ Multi-Tenancy عبر `tenant_id` وRLS في الجداول الجديدة.
5. تم اجتياز فحص DB Contract، ما يعني أن الجداول المشار إليها من الكود موجودة في migrations.

---

## 14. الخلاصة

تم تنفيذ تطوير كبير ومنظم للبوابات الموجودة في مشروع Kyvzon-، وتحويلها إلى بوابات أكثر نضجًا وتكاملًا.

الحالة النهائية:

```text
المشروع سليم.
البناء ناجح.
الاختبارات ناجحة.
لا توجد ثغرات npm audit.
التغييرات جاهزة للمراجعة أو الاعتماد في Git.
```
