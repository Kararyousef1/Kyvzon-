/**
 * ════════════════════════════════════════════════════════════════
 *  App - الجذر الرئيسي (نسخة مُحسَّنة — Loading Flow Fix)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ✅ sessionStorage → localStorage (الإقرار يُحفَظ عبر الجلسات)
 *  ✅ ترتيب التحقق: localStorage أولاً قبل initialize() لتقليل الانتظار
 *  ✅ AuthLoader: محسَّن بشاشة أكثر احترافية (progress bar)
 *  ✅ إضافة timeout للـ initialize (10 ثواني) + رسالة خطأ للمستخدم
 *  ✅ إزالة wrapper المتعارض مع fixed positioning للـ Sidebar
 *  ✅ Sidebar: مغلق افتراضياً على الموبايل، مفتوح على الديسكتوب
 *  ✅ backdrop معتم على الموبايل يغلق Sidebar عند النقر
 *  ✅ إضافة الصفحات المفقودة (MyPayroll, MyLoans, MyExpenses)
 *  ════════════════════════════════════════════════════════════════
 */

import { useEffect, Suspense, lazy, useState, useRef } from 'react';
import { useAuthStore, useUIStore } from './core/stores';
import { TenantProvider } from './core/tenant/TenantContext';
import ToastContainer from './shared/components/ui/Toast';
import SplashScreen from './shared/components/ui/SplashScreen';
import AppErrorBoundary from './shared/components/dashboard/developer/ErrorBoundary';
import Sidebar from './shared/components/dashboard/Sidebar';
import Header from './shared/components/dashboard/Header';
import LoginPage from './pages/auth/LoginPage';
import LandingPage from './pages/public/LandingPage';
import DisclaimerPage from './pages/public/DisclaimerPage';
import SystemGuide from './pages/public/SystemGuide';
import NotificationsPage from './pages/public/NotificationsPage';
import MyNotificationsPage from './pages/public/MyNotificationsPage';
import WelcomeModal from './shared/components/dashboard/WelcomeModal';

// ─── Lazy Imports: Developer (Kyvzon Portal) ────────────────────
const KyvzonDevPortal    = lazy(() => import('./pages/devportal/KyvzonDevPortal'));

// ─── Lazy Imports: Employee ──────────────────────────────────────
const EmployeeDashboard  = lazy(() => import('./pages/employee/EmployeeDashboard'));
const ProblemsList       = lazy(() => import('./pages/employee/ProblemsList'));
const ProblemDetail      = lazy(() => import('./pages/employee/ProblemDetail'));
const NewProblemPage     = lazy(() => import('./pages/employee/NewProblemPage'));
const WellnessPage       = lazy(() => import('./pages/employee/WellnessPage'));
const AIChatPage         = lazy(() => import('./pages/employee/AIChatPage'));
const SurveyPage         = lazy(() => import('./pages/employee/SurveyPage'));
const ProfilePage        = lazy(() => import('./pages/employee/ProfilePage'));
const ContactPage        = lazy(() => import('./pages/employee/ContactPage'));
const TrainingPage       = lazy(() => import('./pages/employee/TrainingPage'));
const SOPsPage           = lazy(() => import('./pages/employee/SOPsPage'));
const MyAttendancePage   = lazy(() => import('./pages/employee/MyAttendancePage'));
const LeaveRequestPage   = lazy(() => import('./pages/employee/LeaveRequestPage'));
const PermissionsPage    = lazy(() => import('./pages/employee/PermissionsPage'));
const AIInsightsDashboard = lazy(() => import('./pages/employee/AIInsightsDashboard'));
const MyPayrollPage      = lazy(() => import('./pages/employee/MyPayrollPage'));
const MyLoansPage        = lazy(() => import('./pages/employee/MyLoansPage'));
const MyExpensesPage     = lazy(() => import('./pages/employee/MyExpensesPage'));

// ─── Lazy Imports: HR ────────────────────────────────────────────
const HRDashboard              = lazy(() => import('./pages/hr/HRDashboard'));
const AnalyticsPage            = lazy(() => import('./pages/hr/AnalyticsPage'));
const TeamPage                 = lazy(() => import('./pages/hr/TeamPage'));
const ReportsPage              = lazy(() => import('./pages/hr/ReportsPage'));
const AttendancePage           = lazy(() => import('./pages/hr/AttendancePage'));
const TalentMarketPage         = lazy(() => import('./pages/hr/TalentMarketPage'));
const KioskPage                = lazy(() => import('./pages/hr/KioskPage'));
const HRMovementAnalyticsPage  = lazy(() => import('./pages/hr/HRMovementAnalyticsPage'));
const TrainingManagementPage   = lazy(() => import('./pages/hr/TrainingManagementPage'));
const TrainingReportsPage      = lazy(() => import('./pages/hr/TrainingReportsPage'));
const HRPayrollPage            = lazy(() => import('./pages/hr/PayrollPage'));
const HRLoansPage              = lazy(() => import('./pages/hr/LoansPage'));
const HRBonusesPage            = lazy(() => import('./pages/hr/BonusesPage'));
const HRExpensesPage           = lazy(() => import('./pages/hr/ExpensesPage'));
const RecruitmentPage          = lazy(() => import('./pages/hr/RecruitmentPage'));
const OnboardingPage           = lazy(() => import('./pages/hr/OnboardingPage'));
const DocumentsPage            = lazy(() => import('./pages/hr/DocumentsPage'));
const PerformancePage          = lazy(() => import('./pages/hr/PerformancePage'));
const DisciplinaryPage         = lazy(() => import('./pages/hr/DisciplinaryPage'));
const ShiftSchedulingPage      = lazy(() => import('./pages/hr/ShiftSchedulingPage'));
const HRCommunicationPage      = lazy(() => import('./pages/hr/HRCommunicationPage'));

// ─── Lazy Imports: Admin ─────────────────────────────────────────
const AdminDashboard              = lazy(() => import('./pages/admin/AdminDashboard'));
const AdminEmployeesPage          = lazy(() => import('./pages/admin/AdminEmployeesPage'));
const AdminPermissionsTree        = lazy(() => import('./pages/admin/AdminPermissionsTree'));
const AuditLogPage                = lazy(() => import('./pages/admin/AuditLogPage'));
const SettingsPage                = lazy(() => import('./pages/admin/SettingsPage'));
const AIConfigPage                = lazy(() => import('./pages/admin/AIConfigPage'));
const AdminLandingPageCMS         = lazy(() => import('./pages/admin/AdminLandingPageCMS'));
const AdminGatekeeperPermissions  = lazy(() => import('./pages/admin/AdminGatekeeperPermissions'));
const AdminSOPsPage               = lazy(() => import('./pages/admin/AdminSOPsPage'));
const AdminSOPsReport             = lazy(() => import('./pages/admin/AdminSOPsReport'));

// ─── Lazy Imports: Other Roles ───────────────────────────────────
const GatekeeperPage        = lazy(() => import('./pages/gatekeeper/GatekeeperPage'));
const SupervisorBreaksPage  = lazy(() => import('./pages/supervisor/SupervisorBreaksPage'));
const ManagerAttendancePage = lazy(() => import('./pages/manager/ManagerAttendancePage'));
const TechPortal           = lazy(() => import('./pages/techportal/TechPortal'));
const TawathulPortalPage   = lazy(() => import('./modules/tawathul/pages/TawathulPortalPage'));
const TawathulAdminPage    = lazy(() => import('./modules/tawathul/pages/TawathulAdminPage'));

// ════════════════════════════════════════════════════════════════
//  Constants
// ════════════════════════════════════════════════════════════════

const ROLE_DEFAULT_VIEW: Record<string, string> = {
  developer: 'developer-dashboard',
  hr:        'hr-dashboard',
  admin:     'admin-dashboard',
  employee:  'employee-dashboard',
  gatekeeper:'gatekeeper-portal',
  supervisor:'employee-dashboard',
  manager:   'manager-dashboard',
  it_admin:  'tech-portal',
};

// صفحات تظهر في أدوار متعددة — تحديدها مسبقاً يُقلل تكرار switch
// ملاحظة: هذه تُستخدم فقط للموظفين والمديرين والمشرفين
// صفحات HR لها مسارات خاصة تبدأ بـ hr- ويتم التعامل معها في switch
const SHARED_PAGE: Record<string, JSX.Element> = {
  'employee-leave-requests':  <LeaveRequestPage />,
  'employee-permissions':     <PermissionsPage />,
  'employee-payroll':         <MyPayrollPage />,
  'employee-loans':           <MyLoansPage />,
  'employee-expenses':        <MyExpensesPage />,
  'manager-leave-requests':   <LeaveRequestPage />,
  'supervisor-leave-requests':<LeaveRequestPage />,
};

// ════════════════════════════════════════════════════════════════
//  Loaders
// ════════════════════════════════════════════════════════════════

function PageLoader() {
  return <SplashScreen mini />;
}

function AuthLoader({ timedOut }: { timedOut?: boolean }) {
  return (
    <SplashScreen
      timedOut={timedOut}
      message={!timedOut ? 'جاري التحقق من الجلسة...' : undefined}
    />
  );
}

function DefaultPage({ role }: { role?: string }) {
  if (role === 'developer')  return <KyvzonDevPortal />;
  if (role === 'hr')         return <HRDashboard />;
  if (role === 'admin')      return <AdminDashboard />;
  if (role === 'gatekeeper') return <GatekeeperPage />;
  return <EmployeeDashboard />;
}

// ════════════════════════════════════════════════════════════════
//  Page Renderer
// ════════════════════════════════════════════════════════════════

function PageRenderer() {
  const { activeView, sidebarOpen } = useUIStore();
  const { user } = useAuthStore();

  // Kyvzon Portal — تخطيطه الخاص بدون Header/Sidebar العام
  if (activeView === 'developer-dashboard') {
    return (
      <AppErrorBoundary componentName="KyvzonDevPortal">
        <Suspense fallback={<PageLoader />}>
          <KyvzonDevPortal />
        </Suspense>
      </AppErrorBoundary>
    );
  }

  const renderPage = (): JSX.Element => {
    // صفحة تفاصيل المشكلة — معرف ديناميكي
    if (activeView.startsWith('problem-detail:')) {
      return <ProblemDetail />;
    }

    // صفحات مشتركة بين أدوار (employee / manager / supervisor)
    // التحقق بالمطابقة التامة لتجنب تداخل مع مسارات hr-
    if (SHARED_PAGE[activeView]) return SHARED_PAGE[activeView];

    switch (activeView) {
      // ─── إشعارات ────────────────────────────────────────────
      case 'my-notifications':    return <MyNotificationsPage />;
      case 'notifications':       return <NotificationsPage />;

      // ─── Employee ────────────────────────────────────────────
      case 'employee-dashboard':  return <EmployeeDashboard />;
      case 'employee-problems':   return <ProblemsList isHR={false} />;
      case 'new-problem':         return <NewProblemPage />;
      case 'employee-wellness':   return <WellnessPage />;
      case 'employee-ai-chat':    return <AIChatPage />;
      case 'employee-survey':     return <SurveyPage />;
      case 'employee-training':   return <TrainingPage />;
      case 'employee-sops':       return <SOPsPage />;
      case 'employee-profile':    return <ProfilePage />;
      case 'employee-contact':    return <ContactPage />;
      case 'employee-attendance': return <MyAttendancePage />;
      case 'employee-requests':   return <LeaveRequestPage />;
      case 'employee-leave-requests': return <LeaveRequestPage />;
      case 'employee-permissions':    return <PermissionsPage />;
      case 'employee-payroll':    return <MyPayrollPage />;
      case 'employee-loans':      return <MyLoansPage />;
      case 'employee-expenses':   return <MyExpensesPage />;
      case 'employee-ai-insights': return <AIInsightsDashboard />;
      case 'insights':            return <AIInsightsDashboard />;

      // ─── Kiosk ───────────────────────────────────────────────
      case 'kiosk-mode':          return <KioskPage />;

      // ─── Manager ─────────────────────────────────────────────
      case 'manager-dashboard':   return <HRDashboard />;
      case 'manager-attendance':  return <ManagerAttendancePage />;

      // ─── HR ──────────────────────────────────────────────────
      case 'hr-dashboard':        return <HRDashboard />;
      case 'hr-problems':         return <ProblemsList isHR={true} />;
      case 'hr-analytics':
      case 'hr-sentiment':
      case 'hr-predictions':      return <AnalyticsPage />;
      case 'hr-team':             return <TeamPage />;
      case 'hr-talent-market':    return <TalentMarketPage />;
      case 'hr-attendance':       return <AttendancePage />;
      case 'hr-leave-requests':   return <LeaveRequestPage />;
      case 'hr-communication':    return <HRCommunicationPage />;
      case 'hr-reports':          return <ReportsPage />;
      case 'hr-movement-analysis':return <HRMovementAnalyticsPage />;
      case 'hr-manage-training':  return <TrainingManagementPage />;
      case 'hr-training-reports': return <TrainingReportsPage />;
      case 'admin-ai-insights':
      case 'hr-ai-insights':      return <AIInsightsDashboard />;
      // ─── HR Finance ──────────────────────────────────────────
      case 'hr-payroll':          return <HRPayrollPage />;
      case 'hr-loans':            return <HRLoansPage />;
      case 'hr-bonuses':          return <HRBonusesPage />;
      case 'hr-expenses':         return <HRExpensesPage />;
      // ─── HR People ───────────────────────────────────────────
      case 'hr-recruitment':      return <RecruitmentPage />;
      case 'hr-onboarding':       return <OnboardingPage />;
      case 'hr-documents':        return <DocumentsPage />;
      // ─── HR Performance ──────────────────────────────────────
      case 'hr-performance':      return <PerformancePage />;
      case 'hr-disciplinary':     return <DisciplinaryPage />;
      case 'hr-shifts':           return <ShiftSchedulingPage />;
      // ─── HR Surveys ──────────────────────────────────────────
      case 'hr-manage-surveys':   return <SurveyPage />;
      case 'hr-sops':             return <AdminSOPsPage />;

      // ─── Gatekeeper / Movements ──────────────────────────────
      case 'gatekeeper':
      case 'hr-movements':
      case 'movements':
      case 'employee-movements':
      case 'gatekeeper-page':
      case 'gatekeeper-portal':   return <GatekeeperPage />;

      // ─── Admin ───────────────────────────────────────────────
      case 'admin-dashboard':              return <AdminDashboard />;
      case 'admin-cms':                    return <AdminLandingPageCMS />;
      case 'admin-employees':              return <AdminEmployeesPage />;
      case 'admin-permissions':            return <AdminPermissionsTree />;
      case 'admin-permissions-management': return <PermissionsPage />;
      case 'admin-gatekeeper-permissions': return <AdminGatekeeperPermissions />;
      case 'admin-reports':                return <ReportsPage />;
      case 'admin-settings':               return <SettingsPage />;
      case 'admin-audit-log':              return <AuditLogPage />;
      case 'admin-sops':                   return <AdminSOPsPage />;
      case 'admin-sops-reports':           return <AdminSOPsReport />;
      case 'admin-ai-config':              return <AIConfigPage />;
      case 'admin-attendance':             return <AttendancePage />;

      // ─── Developer (Kyvzon Portal) ──────────────────────────
      case 'developer-dashboard':  return <KyvzonDevPortal />;

      // ─── Supervisor ──────────────────────────────────────────
      case 'supervisor-breaks':    return <SupervisorBreaksPage />;

      // ─── IT/Tech Portal ──────────────────────────────────────
      case 'tech-portal':          return <TechPortal />;

      // ─── Tawathul (Communication) ────────────────────────────
      case 'tawathul-portal':      return <TawathulPortalPage />;
      case 'tawathul-admin':       return <TawathulAdminPage />;

      default: return <DefaultPage role={user?.role} />;
    }
  };

  return (
    <div className={`transition-all duration-300 min-h-screen pt-16 ${sidebarOpen ? 'lg:mr-64' : 'lg:mr-16'}`}>
      <main className="p-4 sm:p-6 min-h-[calc(100vh-64px)]">
        <AppErrorBoundary>
          <Suspense fallback={<PageLoader />}>{renderPage()}</Suspense>
        </AppErrorBoundary>
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  App
// ════════════════════════════════════════════════════════════════

export default function App() {
  const { isAuthenticated, user, loading, initialize } = useAuthStore();
  const { setActiveView, sidebarOpen, setSidebarOpen } = useUIStore();
  const [showLogin, setShowLogin]       = useState(false);
  const [authTimedOut, setAuthTimedOut] = useState(false);
  const initializedRef = useRef(false);

  // ✅ localStorage — يُحفَظ عبر الجلسات
  const [disclaimerPassed, setDisclaimerPassed] = useState(
    () => localStorage.getItem('disclaimer_passed') === 'true'
  );
  const [guidePassed, setGuidePassed] = useState(
    () => localStorage.getItem('guide_passed') === 'true'
  );

  const isPreviewMode = window.location.search.includes('preview=true');

  // ✅ Initialize + Timeout (10 ثواني)
  useEffect(() => {
    if (isPreviewMode) return;

    // منع التكرار في StrictMode (React 18)
    if (initializedRef.current) return;
    initializedRef.current = true;

    initialize();
    const timeout = setTimeout(() => {
      // نتحقق من loading الحالي عبر useAuthStore.getState()
      // لتجنب مشكلة closure حيث تبقى القيمة القديمة
      const { loading: currentLoading } = useAuthStore.getState();
      if (currentLoading) setAuthTimedOut(true);
    }, 10_000);
    return () => clearTimeout(timeout);
  }, [isPreviewMode, initialize]);

  // ✅ Sidebar: مفتوح على الديسكتوب، مغلق على الموبايل
  useEffect(() => {
    setSidebarOpen(window.innerWidth >= 1024);
  }, [setSidebarOpen]);

  // ✅ إغلاق تلقائي عند تصغير النافذة
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) setSidebarOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setSidebarOpen]);

  // ✅ View من URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('view') === 'kiosk-mode') setActiveView('kiosk-mode');
  }, [setActiveView]);

  // ✅ الـ View الافتراضي حسب الدور
  useEffect(() => {
    if (!user) return;
    setActiveView(ROLE_DEFAULT_VIEW[user.role] ?? 'employee-dashboard');
  }, [user?.role, setActiveView]);

  // ✅ استماع لحدث popstate (زر الرجوع في المتصفح)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { activeView?: string; loginPage?: boolean } | null;
      if (state?.loginPage === false || state === null) {
        setShowLogin(false);
      }
      if (state?.activeView) {
        setActiveView(state.activeView);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setActiveView]);

  // ─── Render Guards ───────────────────────────────────────────
  if (isPreviewMode) {
    return (
      <TenantProvider>
        <LandingPage onLoginClick={() => {}} />
        <ToastContainer />
      </TenantProvider>
    );
  }

  if (loading) {
    return <AuthLoader timedOut={authTimedOut} />;
  }

  if (!disclaimerPassed) {
    return (
      <DisclaimerPage
        onAccess={() => {
          setDisclaimerPassed(true);
          localStorage.setItem('disclaimer_passed', 'true');
        }}
      />
    );
  }

  if (!guidePassed) {
    return (
      <SystemGuide
        onSkip={() => {
          setGuidePassed(true);
          localStorage.setItem('guide_passed', 'true');
        }}
      />
    );
  }

  if (!isAuthenticated) {
    if (showLogin) return <><LoginPage onNavigate={() => {}} onBack={() => {
      window.history.back();
      setShowLogin(false);
    }} /><ToastContainer /></>;
    return <><LandingPage onLoginClick={() => {
      window.history.pushState({ loginPage: true }, '');
      setShowLogin(true);
    }} /><ToastContainer /></>;
  }

  // ─── Main App ────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen bg-slate-50"
      dir="rtl"
      style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
    >
      <Header />
      <Sidebar />

      {/* Backdrop معتم على الموبايل/التابلت */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <PageRenderer />
      <WelcomeModal />
      <ToastContainer />
    </div>
  );
}