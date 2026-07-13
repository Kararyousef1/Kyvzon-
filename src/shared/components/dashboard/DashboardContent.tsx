import { useUIStore } from '../../../core/stores';

// Employee Pages
import EmployeeDashboard from '../../../pages/employee/EmployeeDashboard';
import ProblemsList from '../../../pages/employee/ProblemsList';
import WellnessPage from '../../../pages/employee/WellnessPage';
import SurveyPage from '../../../pages/employee/SurveyPage';
import TrainingPage from '../../../pages/employee/TrainingPage';
import AIChatPage from '../../../pages/employee/AIChatPage';
import ContactPage from '../../../pages/employee/ContactPage';
import ProfilePage from '../../../pages/employee/ProfilePage';
import NewProblemPage from '../../../pages/employee/NewProblemPage';
import ProblemDetail from '../../../pages/employee/ProblemDetail';
import MyAttendancePage from '../../../pages/employee/MyAttendancePage';
import AttendancePage from '../../../pages/employee/AttendancePage';
import PermissionsPage from '../../../pages/employee/PermissionsPage';
import LeaveRequestPage from '../../../pages/employee/LeaveRequestPage';
import SOPsPage from '../../../pages/employee/SOPsPage';
import AIInsightsDashboard from '../../../pages/employee/AIInsightsDashboard';
import ManagerAttendancePage from '../../../pages/manager/ManagerAttendancePage';

// HR Pages
import HRDashboard from '../../../pages/hr/HRDashboard';
import HRCommunicationPage from '../../../pages/hr/HRCommunicationPage';
import ReportsPage from '../../../pages/hr/ReportsPage';
import AnalyticsPage from '../../../pages/hr/AnalyticsPage';
import TeamPage from '../../../pages/hr/TeamPage';
import TalentMarketPage from '../../../pages/hr/TalentMarketPage';
import HRAttendancePage from '../../../pages/hr/AttendancePage';
import HRMovementAnalyticsPage from '../../../pages/hr/HRMovementAnalyticsPage';
import TrainingManagementPage from '../../../pages/hr/TrainingManagementPage';
import TrainingReportsPage from '../../../pages/hr/TrainingReportsPage';

// Gatekeeper & Standalone Pages
import GatekeeperPage from '../../../pages/gatekeeper/GatekeeperPage';

// Admin Pages
import AdminDashboard from '../../../pages/admin/AdminDashboard';
import AdminEmployeesPage from '../../../pages/admin/AdminEmployeesPage';
import AdminSOPsPage from '../../../pages/admin/AdminSOPsPage';
import AdminSOPsReport from '../../../pages/admin/AdminSOPsReport';
import AIConfigPage from '../../../pages/admin/AIConfigPage';
import AuditLogPage from '../../../pages/admin/AuditLogPage';
import SettingsPage from '../../../pages/admin/SettingsPage';
import AdminPermissionsTree from '../../../pages/admin/AdminPermissionsTree';
import AdminGatekeeperPermissions from '../../../pages/admin/AdminGatekeeperPermissions';
import AdminLandingPageCMS from '../../../pages/admin/AdminLandingPageCMS';

// Dev Pages
import DeveloperDashboard from './DeveloperDashboard';
import StructureManager from '../../../pages/developer/StructureManager';

// Public/Shared Pages
import MyNotificationsPage from '../../../pages/public/MyNotificationsPage';
import WelcomeModal from './WelcomeModal';

const viewMap: Record<string, React.ReactNode> = {
  // Employee
  'employee-dashboard': <EmployeeDashboard />,
  'employee-problems': <ProblemsList />,
  'new-problem': <NewProblemPage />,
  'employee-wellness': <WellnessPage />,
  'employee-survey': <SurveyPage />,
  'employee-training': <TrainingPage />,
  'employee-ai-chat': <AIChatPage />,
  'employee-contact': <ContactPage />,
  'employee-profile': <ProfilePage />,
  'employee-sops': <SOPsPage />,
  'my-attendance': <MyAttendancePage />,
  'employee-attendance': <AttendancePage />,
  'my-leave-requests': <LeaveRequestPage />,
  'employee-leave-requests': <LeaveRequestPage />,
  'employee-permissions': <PermissionsPage />,
  'employee-leaves': <LeaveRequestPage />,
  'employee-ai-insights': <AIInsightsDashboard />,

  // Manager
  'manager-dashboard': <EmployeeDashboard />,
  'manager-attendance': <ManagerAttendancePage />,
  'manager-leave-requests': <LeaveRequestPage />,

  // Supervisor
  'supervisor-breaks': <div className="p-8 text-center"><p className="text-slate-500">توقيع خروج الموظفين</p></div>,
  'supervisor-leave-requests': <LeaveRequestPage />,

  // HR
  'hr-dashboard': <HRDashboard />,
  'hr-problems': <ProblemsList isHR />,
  'hr-movement-analysis': <HRMovementAnalyticsPage />,
  'hr-communication': <HRCommunicationPage />,
  'hr-reports': <ReportsPage />,
  'hr-analytics': <AnalyticsPage />,
  'hr-team': <TeamPage />,
  'hr-talent-market': <TalentMarketPage />,
  'hr-attendance': <HRAttendancePage />,
  'hr-leave-requests': <LeaveRequestPage />,
  'hr-ai-insights': <AIInsightsDashboard />,
  'manage-training': <TrainingManagementPage />,
  'training-reports': <TrainingReportsPage />,

  // Manager views
  'attendance': <HRAttendancePage />,
  'leave-requests': <LeaveRequestPage />,

  // Gatekeeper
  'gatekeeper-portal': <GatekeeperPage />,
  'gatekeeper-movement': <HRMovementAnalyticsPage />,

  // Notifications (لجميع الأدوار)
  'my-notifications': <MyNotificationsPage />,

  // Admin
  'admin-dashboard': <AdminDashboard />,
  'admin-cms': <AdminLandingPageCMS />,
  'admin-employees': <AdminEmployeesPage />,
  'admin-permissions': <AdminPermissionsTree />,
  'admin-gatekeeper-permissions': <AdminGatekeeperPermissions />,
  'admin-reports': <ReportsPage />,
  'admin-settings': <SettingsPage />,
  'admin-audit-log': <AuditLogPage />,
  'admin-sops': <AdminSOPsPage />,
  'admin-sops-reports': <AdminSOPsReport />,
  'admin-ai-config': <AIConfigPage />,
  'admin-attendance': <HRAttendancePage />,
  'admin-ai-insights': <AIInsightsDashboard />,

  // Developer
  'developer-dashboard': <DeveloperDashboard />,
  'developer-attendance': <HRAttendancePage />,
  'developer-logs': <AuditLogPage />,
  'developer-db': <div className="p-8 text-center"><p className="text-slate-500">إدارة قاعدة البيانات</p></div>,
  'developer-structure': <StructureManager />,

  // Original views
  'problem-detail': <div className="p-8 text-center"><p className="text-slate-500">تفاصيل البلاغ</p></div>,
  'welcome-page': <WelcomeModal />,
};

export default function DashboardContent() {
  const { activeView } = useUIStore();

  // Logic to extract problem ID
  const problemId = activeView.startsWith('problem-detail:') ? activeView.split('problem-detail:')[1] : null;
  if (problemId) {
    return <ProblemDetail />;
  }

  // Return the component from the map, or a default if not found
  return viewMap[activeView] || <EmployeeDashboard />;
}