/**
 * ═════════════════════════════════════════════════════════════════════════
 *  AppRouter — Router الرئيسي للتطبيق
 *
 *  البنية:
 *   /                   → LandingPage (عامة)
 *   /login              → LoginPage
 *   /disclaimer         → DisclaimerPage
 *   /guide              → SystemGuide
 *   /app/*              → المسارات المصادَق عليها (AppLayout)
 *   /dev                → KyvzonDevPortal (DevLayout — لـ developer/it_admin)
 *
 *  Lazy loading لكل الصفحات الثقيلة (67 صفحة).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { lazy, useEffect } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useSearchParams,
  useNavigate,
} from 'react-router-dom';

// طبقات
import { AppLayout } from './layouts/AppLayout';
import { DevLayout } from './layouts/DevLayout';

// حراس
import { RequireAuth } from './guards/RequireAuth';
import { RequireRole } from './guards/RequireRole';
import { RequireModule } from './guards/RequireModule';
import { RoleRedirect } from './guards/RoleRedirect';

// legacy
import { legacyViewToPath } from './legacyRedirect';

// الصفحات العامة (eager — دائماً محتاجة)
import LoginPage from '../pages/auth/LoginPage';
import LandingPage from '../pages/public/LandingPage';
import DisclaimerPage from '../pages/public/DisclaimerPage';
import SystemGuide from '../pages/public/SystemGuide';
import NotificationsPage from '../pages/public/NotificationsPage';
import MyNotificationsPage from '../pages/public/MyNotificationsPage';
import SignupPage from '../pages/public/signup/SignupPage';
import PublicAccountPage from '../pages/public/account/PublicAccountPage';
import PublicPortalsPage from '../pages/public/portals/PublicPortalsPage';
import PublicPortalDetailPage from '../pages/public/portals/PublicPortalDetailPage';
import PublicInfoPage from '../pages/public/static/PublicInfoPage';

// ─── Lazy: Employee ─────────────────────────────────────────────────────
// ─── Lazy: Finance ──────────────────────────────────────────────────────
const FinancialDashboard    = lazy(() => import('../pages/app/finance/FinancialDashboard'));
const ChartOfAccountsPage   = lazy(() => import('../pages/app/finance/ChartOfAccountsPage'));
const JournalEntriesPage    = lazy(() => import('../pages/app/finance/JournalEntriesPage'));
const TrialBalancePage      = lazy(() => import('../pages/app/finance/TrialBalancePage'));
const FinanceSetupPage      = lazy(() => import('../pages/app/finance/FinanceSetupPage'));
const AccountingPeriodsPage = lazy(() => import('../pages/app/finance/AccountingPeriodsPage'));
const GeneralLedgerPage     = lazy(() => import('../pages/app/finance/GeneralLedgerPage'));
const FinancialReportsPage  = lazy(() => import('../pages/app/finance/FinancialReportsPage'));
const VendorsPage           = lazy(() => import('../pages/app/finance/VendorsPage'));
const AccountsPayablePage   = lazy(() => import('../pages/app/finance/AccountsPayablePage'));
const APAgingPage           = lazy(() => import('../pages/app/finance/APAgingPage'));
const VendorPaymentsPage    = lazy(() => import('../pages/app/finance/VendorPaymentsPage'));

const EmployeeDashboard    = lazy(() => import('../pages/employee/EmployeeDashboard'));
const ProblemsList         = lazy(() => import('../pages/employee/ProblemsList'));
const ProblemDetail        = lazy(() => import('../pages/employee/ProblemDetail'));
const NewProblemPage       = lazy(() => import('../pages/employee/NewProblemPage'));
const WellnessPage         = lazy(() => import('../pages/employee/WellnessPage'));
const AIChatPage           = lazy(() => import('../pages/employee/AIChatPage'));
const SurveyPage           = lazy(() => import('../pages/employee/SurveyPage'));
const ProfilePage          = lazy(() => import('../pages/employee/ProfilePage'));
const ContactPage          = lazy(() => import('../pages/employee/ContactPage'));
const TrainingPage         = lazy(() => import('../pages/employee/TrainingPage'));
const SOPsPage             = lazy(() => import('../pages/employee/SOPsPage'));
const MyAttendancePage     = lazy(() => import('../pages/employee/MyAttendancePage'));
const LeaveRequestPage     = lazy(() => import('../pages/employee/LeaveRequestPage'));
const PermissionsPage      = lazy(() => import('../pages/employee/PermissionsPage'));
const AIInsightsDashboard  = lazy(() => import('../pages/employee/AIInsightsDashboard'));
const MyPayrollPage        = lazy(() => import('../pages/employee/MyPayrollPage'));
const MyLoansPage          = lazy(() => import('../pages/employee/MyLoansPage'));
const MyExpensesPage       = lazy(() => import('../pages/employee/MyExpensesPage'));
const MyGoalsPage          = lazy(() => import('../pages/employee/MyGoalsPage'));

// ─── Lazy: HR ─────────────────────────────────────────────────────────
const HRDashboard              = lazy(() => import('../pages/hr/HRDashboard'));
const AnalyticsPage            = lazy(() => import('../pages/hr/AnalyticsPage'));
const TeamPage                 = lazy(() => import('../pages/hr/TeamPage'));
const ReportsPage              = lazy(() => import('../pages/hr/ReportsPage'));
const AttendancePage           = lazy(() => import('../pages/hr/AttendancePage'));
const TalentMarketPage         = lazy(() => import('../pages/hr/TalentMarketPage'));
const KioskPage                = lazy(() => import('../pages/hr/KioskPage'));
const HRMovementAnalyticsPage  = lazy(() => import('../pages/hr/HRMovementAnalyticsPage'));
const TrainingManagementPage   = lazy(() => import('../pages/hr/TrainingManagementPage'));
const TrainingReportsPage      = lazy(() => import('../pages/hr/TrainingReportsPage'));
const HRPayrollPage            = lazy(() => import('../pages/hr/PayrollPage'));
const HRLoansPage              = lazy(() => import('../pages/hr/LoansPage'));
const HRBonusesPage            = lazy(() => import('../pages/hr/BonusesPage'));
const HRExpensesPage           = lazy(() => import('../pages/hr/ExpensesPage'));
const RecruitmentPage          = lazy(() => import('../pages/hr/RecruitmentPage'));
const OnboardingPage           = lazy(() => import('../pages/hr/OnboardingPage'));
const DocumentsPage            = lazy(() => import('../pages/hr/DocumentsPage'));
const PerformancePage          = lazy(() => import('../pages/hr/PerformancePage'));
const DisciplinaryPage         = lazy(() => import('../pages/hr/DisciplinaryPage'));
const ShiftSchedulingPage      = lazy(() => import('../pages/hr/ShiftSchedulingPage'));
const HRCommunicationPage      = lazy(() => import('../pages/hr/HRCommunicationPage'));
const EmployeeContractsPage    = lazy(() => import('../pages/hr/EmployeeContractsPage'));
const SuccessionPlanningPage   = lazy(() => import('../pages/hr/SuccessionPlanningPage'));
const HRServiceCenterPage      = lazy(() => import('../pages/hr/HRServiceCenterPage'));
const HealthSafetyPage         = lazy(() => import('../pages/hr/HealthSafetyPage'));

// ─── Lazy: Admin ────────────────────────────────────────────────────
const AdminDashboard             = lazy(() => import('../pages/admin/AdminDashboard'));
const AdminEmployeesPage         = lazy(() => import('../pages/admin/AdminEmployeesPage'));
const AdminPermissionsTree       = lazy(() => import('../pages/admin/AdminPermissionsTree'));
const AuditLogPage               = lazy(() => import('../pages/admin/AuditLogPage'));
const SettingsPage               = lazy(() => import('../pages/admin/SettingsPage'));
const AIConfigPage               = lazy(() => import('../pages/admin/AIConfigPage'));
const AdminLandingPageCMS        = lazy(() => import('../pages/admin/AdminLandingPageCMS'));
const AdminGatekeeperPermissions = lazy(() => import('../pages/admin/AdminGatekeeperPermissions'));
const AdminSOPsPage              = lazy(() => import('../pages/admin/AdminSOPsPage'));
const AdminSOPsReport            = lazy(() => import('../pages/admin/AdminSOPsReport'));
const OrgStructurePage           = lazy(() => import('../pages/admin/OrgStructurePage'));
const CompanyProfilePage         = lazy(() => import('../pages/admin/CompanyProfilePage'));
const BranchesPage               = lazy(() => import('../pages/admin/BranchesPage'));
const CompliancePage             = lazy(() => import('../pages/admin/CompliancePage'));

// ─── Lazy: Other roles ──────────────────────────────────────────────
const GatekeeperPage        = lazy(() => import('../pages/gatekeeper/GatekeeperPage'));
const MovementControlPage   = lazy(() => import('../pages/gatekeeper/MovementControlPage'));
const SupervisorDashboard   = lazy(() => import('../pages/supervisor/SupervisorDashboard'));
const SupervisorBreaksPage  = lazy(() => import('../pages/supervisor/SupervisorBreaksPage'));
const SupervisorShiftPage   = lazy(() => import('../pages/supervisor/SupervisorShiftPage'));
const SupervisorTasksPage   = lazy(() => import('../pages/supervisor/SupervisorTasksPage'));
const SupervisorChecklistsPage = lazy(() => import('../pages/supervisor/SupervisorChecklistsPage'));
const ManagerDashboard      = lazy(() => import('../pages/manager/ManagerDashboard'));
const ManagerAttendancePage = lazy(() => import('../pages/manager/ManagerAttendancePage'));
const ManagerApprovalsPage  = lazy(() => import('../pages/manager/ManagerApprovalsPage'));
const ManagerTeamPerformancePage = lazy(() => import('../pages/manager/ManagerTeamPerformancePage'));
const ManagerWorkloadPage   = lazy(() => import('../pages/manager/ManagerWorkloadPage'));
const TechPortal            = lazy(() => import('../pages/techportal/TechPortal'));
const TechDashboard         = lazy(() => import('../pages/techportal/pages/TechDashboard'));
const BiometricDevicesPage  = lazy(() => import('../pages/techportal/pages/BiometricDevicesPage'));
const SyncLogsPage          = lazy(() => import('../pages/techportal/pages/SyncLogsPage'));
const SystemHealthPage      = lazy(() => import('../pages/techportal/pages/SystemHealthPage'));
const AttendanceAnalytics   = lazy(() => import('../pages/techportal/pages/AttendanceAnalytics'));
const SecurityEventsPage    = lazy(() => import('../pages/techportal/pages/SecurityEventsPage'));
const TechSettingsPage      = lazy(() => import('../pages/techportal/pages/TechSettingsPage'));
const TawathulPortalPage    = lazy(() => import('../modules/tawathul/pages/TawathulPortalPage'));
const TawathulAdminPage     = lazy(() => import('../modules/tawathul/pages/TawathulAdminPage'));
const KyvzonDevPortal       = lazy(() => import('../pages/devportal/KyvzonDevPortal'));

// ═════════════════════════════════════════════════════════════════════════
//  LegacyRedirect: يترجم ?view=xxx القديم إلى المسار الجديد
// ═════════════════════════════════════════════════════════════════════════

function LegacyViewHandler({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const view = params.get('view');

  useEffect(() => {
    if (!view) return;
    const target = legacyViewToPath(view);
    if (target) navigate(target, { replace: true });
  }, [view, navigate]);

  return <>{children}</>;
}

// ═════════════════════════════════════════════════════════════════════════
//  AppRoutes — التعريف الفعلي لكل المسارات (مفصول ليسهل الاختبار)
// ═════════════════════════════════════════════════════════════════════════

export function AppRoutes() {
  return (
    <Routes>
      {/* المسارات العامة */}
      <Route path="/" element={<LandingPage onLoginClick={() => window.location.assign('/login')} />} />
      <Route path="/login" element={<LoginPage onNavigate={() => {}} onBack={() => window.history.back()} />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/account" element={<PublicAccountPage />} />
      <Route path="/portals" element={<PublicPortalsPage />} />
      <Route path="/portals/:portalId" element={<PublicPortalDetailPage />} />
      <Route path="/about" element={<PublicInfoPage kind="about" />} />
      <Route path="/careers" element={<PublicInfoPage kind="careers" />} />
      <Route path="/blog" element={<PublicInfoPage kind="blog" />} />
      <Route path="/support" element={<PublicInfoPage kind="support" />} />
      <Route path="/status" element={<PublicInfoPage kind="status" />} />
      <Route path="/privacy" element={<PublicInfoPage kind="privacy" />} />
      <Route path="/terms" element={<PublicInfoPage kind="terms" />} />
      <Route path="/security" element={<PublicInfoPage kind="security" />} />
      <Route path="/contact" element={<PublicInfoPage kind="contact" />} />
      <Route path="/disclaimer" element={<DisclaimerPage onAccess={() => {
        localStorage.setItem('disclaimer_passed', 'true');
        window.location.assign('/');
      }} />} />
      <Route path="/guide" element={<SystemGuide onSkip={() => {
        localStorage.setItem('guide_passed', 'true');
        window.location.assign('/');
      }} />} />

      {/* المسارات المصادَق عليها */}
      <Route element={<RequireAuth />}>
        {/* Dev Portal — طبقة مستقلة */}
        <Route path="/dev" element={<RequireRole roles={['developer', 'it_admin']} />}>
          <Route element={<DevLayout />}>
            <Route index element={<KyvzonDevPortal />} />
          </Route>
        </Route>

        {/* App: كل باقي الصفحات */}
        <Route path="/app" element={<AppLayout />}>
          <Route element={<RequireModule />}>
          {/* Root: تحويل حسب الدور */}
          <Route index element={<RoleRedirect />} />

          {/* Notifications */}
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="my-notifications" element={<MyNotificationsPage />} />

          {/* Insights (متاح لعدة أدوار) */}
          <Route path="insights" element={<AIInsightsDashboard />} />

          {/* Tech Portal */}
          <Route path="tech-portal" element={<RequireRole roles={['it_admin', 'tech', 'admin', 'developer']} />}>
            <Route element={<TechPortal />}>
              <Route index element={<TechDashboard />} />
              <Route path="dashboard" element={<TechDashboard />} />
              <Route path="biometric" element={<BiometricDevicesPage />} />
              <Route path="sync-logs" element={<SyncLogsPage />} />
              <Route path="attendance-analytics" element={<AttendanceAnalytics />} />
              <Route path="system-health" element={<SystemHealthPage />} />
              <Route path="security-events" element={<SecurityEventsPage />} />
              <Route path="settings" element={<TechSettingsPage />} />
            </Route>
          </Route>

          {/* Employee */}
          <Route path="employee" element={<RequireRole roles={['employee', 'supervisor', 'manager']} />}>
            <Route index element={<EmployeeDashboard />} />
            <Route path="problems" element={<ProblemsList isHR={false} />} />
            <Route path="problems/new" element={<NewProblemPage />} />
            <Route path="problems/:id" element={<ProblemDetail />} />
            <Route path="wellness" element={<WellnessPage />} />
            <Route path="ai-chat" element={<AIChatPage />} />
            <Route path="survey" element={<SurveyPage />} />
            <Route path="training" element={<TrainingPage />} />
            <Route path="goals" element={<MyGoalsPage />} />
            <Route path="sops" element={<SOPsPage />} />
            <Route path="profile" element={<ProfilePage />} />
            <Route path="contact" element={<ContactPage />} />
            <Route path="attendance" element={<MyAttendancePage />} />
            <Route path="leave-requests" element={<LeaveRequestPage />} />
            <Route path="permissions" element={<PermissionsPage />} />
            <Route path="payroll" element={<MyPayrollPage />} />
            <Route path="loans" element={<MyLoansPage />} />
            <Route path="expenses" element={<MyExpensesPage />} />
            <Route path="insights" element={<AIInsightsDashboard />} />
          </Route>

          {/* Manager */}
          <Route path="manager" element={<RequireRole roles={['manager', 'hr', 'admin']} />}>
            <Route index element={<ManagerDashboard />} />
            <Route path="attendance" element={<ManagerAttendancePage />} />
            <Route path="approvals" element={<ManagerApprovalsPage />} />
            <Route path="performance" element={<ManagerTeamPerformancePage />} />
            <Route path="workload" element={<ManagerWorkloadPage />} />
          </Route>

          {/* Supervisor */}
          <Route path="supervisor" element={<RequireRole roles={['supervisor', 'manager', 'hr', 'admin']} />}>
            <Route index element={<SupervisorDashboard />} />
            <Route path="breaks" element={<SupervisorBreaksPage />} />
            <Route path="shift" element={<SupervisorShiftPage />} />
            <Route path="tasks" element={<SupervisorTasksPage />} />
            <Route path="checklists" element={<SupervisorChecklistsPage />} />
          </Route>

          {/* HR */}
          <Route path="hr" element={<RequireRole roles={['hr', 'admin']} />}>
            <Route index element={<HRDashboard />} />
            <Route path="problems" element={<ProblemsList isHR={true} />} />
            <Route path="problems/:id" element={<ProblemDetail />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="team" element={<TeamPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="talent-market" element={<TalentMarketPage />} />
            <Route path="movement-analysis" element={<HRMovementAnalyticsPage />} />
            <Route path="training/manage" element={<TrainingManagementPage />} />
            <Route path="training/reports" element={<TrainingReportsPage />} />
            <Route path="payroll" element={<HRPayrollPage />} />
            <Route path="loans" element={<HRLoansPage />} />
            <Route path="bonuses" element={<HRBonusesPage />} />
            <Route path="expenses" element={<HRExpensesPage />} />
            <Route path="recruitment" element={<RecruitmentPage />} />
            <Route path="onboarding" element={<OnboardingPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="contracts" element={<EmployeeContractsPage />} />
            <Route path="succession" element={<SuccessionPlanningPage />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="disciplinary" element={<DisciplinaryPage />} />
            <Route path="shifts" element={<ShiftSchedulingPage />} />
            <Route path="communication" element={<HRCommunicationPage />} />
            <Route path="service-center" element={<HRServiceCenterPage />} />
            <Route path="health-safety" element={<HealthSafetyPage />} />
            <Route path="leave-requests" element={<LeaveRequestPage />} />
            <Route path="sops" element={<AdminSOPsPage />} />
          </Route>

          {/* Admin */}
          <Route path="admin" element={<RequireRole roles={['admin']} />}>
            <Route index element={<AdminDashboard />} />
            <Route path="employees" element={<AdminEmployeesPage />} />
            <Route path="permissions" element={<AdminPermissionsTree />} />
            <Route path="permissions-management" element={<PermissionsPage />} />
            <Route path="audit-log" element={<AuditLogPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="company-profile" element={<CompanyProfilePage />} />
            <Route path="branches" element={<BranchesPage />} />
            <Route path="org-structure" element={<OrgStructurePage />} />
            <Route path="compliance" element={<CompliancePage />} />
            <Route path="ai-config" element={<AIConfigPage />} />
            <Route path="cms" element={<AdminLandingPageCMS />} />
            <Route path="gatekeeper-permissions" element={<AdminGatekeeperPermissions />} />
            <Route path="sops" element={<AdminSOPsPage />} />
            <Route path="sops-reports" element={<AdminSOPsReport />} />
          </Route>

          {/* Gatekeeper / Movement */}
          <Route path="gatekeeper" element={<RequireRole roles={['gatekeeper', 'admin', 'hr']} />}>
            <Route index element={<GatekeeperPage />} />
            <Route path="movements" element={<MovementControlPage />} />
          </Route>



          {/* Kiosk (متاح لأي مستخدم مصادَق عليه — يُستخدم في أجهزة عامة) */}
          <Route path="kiosk" element={<KioskPage />} />

          {/* Tawathul (بوابة التواصل) */}
          <Route path="tawathul">
            <Route index element={<TawathulPortalPage />} />
            <Route path="admin" element={<RequireRole roles={['admin', 'hr']}><TawathulAdminPage /></RequireRole>} />
          </Route>

          {/* Finance */}
          <Route path="finance" element={<RequireRole roles={['finance', 'finance_manager', 'accountant', 'entity_admin', 'admin', 'hr', 'manager']} />}>
            <Route element={<RequireModule moduleKey="finance" />}>
              <Route index element={<FinancialDashboard />} />
              <Route path="chart-of-accounts" element={<ChartOfAccountsPage />} />
              <Route path="journal-entries" element={<JournalEntriesPage />} />
              <Route path="trial-balance" element={<TrialBalancePage />} />
              <Route path="setup" element={<FinanceSetupPage />} />
              <Route path="accounting-periods" element={<AccountingPeriodsPage />} />
              <Route path="general-ledger" element={<GeneralLedgerPage />} />
              <Route path="reports" element={<FinancialReportsPage />} />
              <Route path="vendors" element={<VendorsPage />} />
              <Route path="accounts-payable" element={<AccountsPayablePage />} />
              <Route path="accounts-payable/aging" element={<APAgingPage />} />
              <Route path="vendor-payments" element={<VendorPaymentsPage />} />
            </Route>
          </Route>
          </Route>
        </Route>

        {/* أي مسار غير معروف تحت auth → redirect للـ default */}
        <Route path="*" element={<RoleRedirect />} />
      </Route>
    </Routes>
  );
}

// ═════════════════════════════════════════════════════════════════════════
//  AppRouter: يُحيط AppRoutes بـ BrowserRouter + LegacyViewHandler
// ═════════════════════════════════════════════════════════════════════════

export function AppRouter() {
  return (
    <BrowserRouter>
      <LegacyViewHandler>
        <AppRoutes />
      </LegacyViewHandler>
    </BrowserRouter>
  );
}

export default AppRouter;
