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
import { RequirePage } from './guards/RequirePage';
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
import ServiceDetailPage from '../pages/public/portals/ServiceDetailPage';
import PublicInfoPage from '../pages/public/static/PublicInfoPage';
import SupplierPortalPage from '../pages/public/supplier/SupplierPortalPage';
import SupplierRfxPortalPage from '../pages/public/supplier/SupplierRfxPortalPage';
import SupplierInvoicePortalPage from '../pages/public/supplier/SupplierInvoicePortalPage';
import SupplierDockPortalPage from '../pages/public/supplier/SupplierDockPortalPage';

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
const ProcurementApprovalRulesPage = lazy(() => import('../pages/admin/ProcurementApprovalRulesPage'));
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
const MarketingPortal       = lazy(() => import('../pages/marketingportal/MarketingPortal'));
// بوابة CRM
const CrmPortal             = lazy(() => import('../pages/crmportal/CrmPortal'));
const CrmDashboard          = lazy(() => import('../pages/crmportal/CrmDashboard'));
// بوابة المشتريات — Wave1: الموردون + طلبات الشراء (هيكل مجلدي مثل CRM)
const ProcurementDashboard      = lazy(() => import('../pages/app/procurement/ProcurementDashboard'));
const SuppliersLayout           = lazy(() => import('../pages/app/procurement/suppliers/SuppliersLayout'));
const SuppliersPage             = lazy(() => import('../pages/app/procurement/suppliers/SuppliersPage'));
const SupplierDetailPage        = lazy(() => import('../pages/app/procurement/suppliers/SupplierDetailPage'));
const RequisitionsLayout        = lazy(() => import('../pages/app/procurement/requisitions/RequisitionsLayout'));
const RequisitionListPage       = lazy(() => import('../pages/app/procurement/requisitions/RequisitionListPage'));
const RequisitionDetailPage     = lazy(() => import('../pages/app/procurement/requisitions/RequisitionDetailPage'));
// Unit 04 — PO + GR
const OrdersLayout              = lazy(() => import('../pages/app/procurement/orders/OrdersLayout'));
const PurchaseOrdersPage        = lazy(() => import('../pages/app/procurement/orders/PurchaseOrdersPage'));
const PoDetailPage              = lazy(() => import('../pages/app/procurement/orders/PoDetailPage'));
const PoReleasesPage            = lazy(() => import('../pages/app/procurement/orders/PoReleasesPage'));
const GoodsReceiptPage          = lazy(() => import('../pages/app/procurement/orders/GoodsReceiptPage'));
// Unit 02 — RFx + Auctions
const SourcingLayout            = lazy(() => import('../pages/app/procurement/sourcing/SourcingLayout'));
const SourcingEventsPage        = lazy(() => import('../pages/app/procurement/sourcing/SourcingEventsPage'));
const RfxDetailPage             = lazy(() => import('../pages/app/procurement/sourcing/RfxDetailPage'));
const AuctionLivePage           = lazy(() => import('../pages/app/procurement/sourcing/AuctionLivePage'));
// Unit 05 — Invoices
const InvoicesLayout            = lazy(() => import('../pages/app/procurement/invoices/InvoicesLayout'));
const InvoicesPage              = lazy(() => import('../pages/app/procurement/invoices/InvoicesPage'));
const MatchingDetailPage        = lazy(() => import('../pages/app/procurement/invoices/MatchingDetailPage'));
const ToleranceRulesPage        = lazy(() => import('../pages/app/procurement/invoices/ToleranceRulesPage'));
// Unit 06 — Contracts
const ContractsLayout           = lazy(() => import('../pages/app/procurement/contracts/ContractsLayout'));
const ContractsPage             = lazy(() => import('../pages/app/procurement/contracts/ContractsPage'));
const TemplatesPage             = lazy(() => import('../pages/app/procurement/contracts/TemplatesPage'));
const ObligationsPage           = lazy(() => import('../pages/app/procurement/contracts/ObligationsPage'));
const VersionsPage              = lazy(() => import('../pages/app/procurement/contracts/VersionsPage'));
const SignaturesPage            = lazy(() => import('../pages/app/procurement/contracts/SignaturesPage'));
// Unit 07 — Spend Analytics
const AnalyticsLayout2          = lazy(() => import('../pages/app/procurement/analytics/AnalyticsLayout'));
const SpendAnalyticsPage        = lazy(() => import('../pages/app/procurement/analytics/SpendAnalyticsPage'));
const CategoryPage              = lazy(() => import('../pages/app/procurement/analytics/CategoryPage'));
const PriceTrendPage            = lazy(() => import('../pages/app/procurement/analytics/PriceTrendPage'));
const ForecastPage              = lazy(() => import('../pages/app/procurement/analytics/ForecastPage'));

// ─── Lazy: Inventory / Warehouse Portal ────────────────────────────────────
const InventoryDashboard        = lazy(() => import('../pages/app/inventory/InventoryDashboard'));
const InventoryFoundationDashboard = lazy(() => import('../pages/app/inventory/foundation/FoundationDashboard'));
const InventoryItemsPage        = lazy(() => import('../pages/app/inventory/foundation/ItemsPage'));
const InventoryWarehousesPage   = lazy(() => import('../pages/app/inventory/foundation/WarehousesPage'));
const InventoryLocationsPage    = lazy(() => import('../pages/app/inventory/foundation/LocationsPage'));
const InventoryStockPage        = lazy(() => import('../pages/app/inventory/foundation/StockPage'));
const InventoryMovementsPage    = lazy(() => import('../pages/app/inventory/foundation/MovementsPage'));
const InventoryNumberingPage    = lazy(() => import('../pages/app/inventory/foundation/NumberingPage'));
const ReceivingDashboardPage    = lazy(() => import('../pages/app/inventory/receiving/ReceivingDashboard'));
const InventoryAsnListPage      = lazy(() => import('../pages/app/inventory/receiving/AsnListPage'));
const InventoryDockSchedulePage = lazy(() => import('../pages/app/inventory/receiving/DockSchedulePage'));
const InventoryReceivingSessionsPage = lazy(() => import('../pages/app/inventory/receiving/ReceivingSessionsPage'));
const InventoryOsdCasesPage     = lazy(() => import('../pages/app/inventory/receiving/OsdCasesPage'));
const InventoryQuarantinePage   = lazy(() => import('../pages/app/inventory/receiving/QuarantinePage'));
const InventoryPutawayTasksPage = lazy(() => import('../pages/app/inventory/receiving/PutawayTasksPage'));
const InventoryCrossDockingPage = lazy(() => import('../pages/app/inventory/receiving/CrossDockingPage'));
const InventoryMobileScanPage   = lazy(() => import('../pages/app/inventory/receiving/MobileScanPage'));
const InventoryLpnLabelsPage    = lazy(() => import('../pages/app/inventory/receiving/LpnLabelsPage'));
const InventoryReceivingReportsPage = lazy(() => import('../pages/app/inventory/receiving/ReceivingReportsPage'));
const InventoryInboundNotificationsPage = lazy(() => import('../pages/app/inventory/receiving/InboundNotificationsPage'));
const InventoryReceivingAttachmentsPage = lazy(() => import('../pages/app/inventory/receiving/AttachmentsPage'));
const InventoryQualityNcrPage = lazy(() => import('../pages/app/inventory/receiving/QualityNcrPage'));
const StorageDashboardPage = lazy(() => import('../pages/app/inventory/storage/StorageDashboard'));
const InventoryLocationMapPage = lazy(() => import('../pages/app/inventory/storage/LocationMapPage'));
const InventoryVisualWarehouseMapPage = lazy(() => import('../pages/app/inventory/storage/VisualWarehouseMapPage'));
const InventoryStorageHeatmapPage = lazy(() => import('../pages/app/inventory/storage/HeatmapPage'));
const InventorySlottingPage = lazy(() => import('../pages/app/inventory/storage/SlottingPage'));
const InventoryAbcClassificationPage = lazy(() => import('../pages/app/inventory/storage/AbcClassificationPage'));
const InventoryReplenishmentPage = lazy(() => import('../pages/app/inventory/storage/ReplenishmentPage'));
const InventoryCapacityPage = lazy(() => import('../pages/app/inventory/storage/CapacityPage'));
const InventorySlowMovingPage = lazy(() => import('../pages/app/inventory/storage/SlowMovingPage'));
const InventoryLocationLabelsPage = lazy(() => import('../pages/app/inventory/storage/LocationLabelsPage'));
const InventoryAffinityPage = lazy(() => import('../pages/app/inventory/storage/AffinityPage'));
const InventorySeasonalSlottingPage = lazy(() => import('../pages/app/inventory/storage/SeasonalSlottingPage'));
const InventoryTaskInterleavingPage = lazy(() => import('../pages/app/inventory/storage/TaskInterleavingPage'));
const InventorySlowMovingReportsPage = lazy(() => import('../pages/app/inventory/storage/SlowMovingReportsPage'));
const PickingDashboardPage = lazy(() => import('../pages/app/inventory/picking/PickingDashboard'));
const PickOrdersPage = lazy(() => import('../pages/app/inventory/picking/PickOrdersPage'));
const PickTasksPage = lazy(() => import('../pages/app/inventory/picking/PickTasksPage'));
const PickWavesPage = lazy(() => import('../pages/app/inventory/picking/PickWavesPage'));
const PickExceptionsPage = lazy(() => import('../pages/app/inventory/picking/PickExceptionsPage'));
const PickScansPage = lazy(() => import('../pages/app/inventory/picking/PickScansPage'));
const PickingProductivityPage = lazy(() => import('../pages/app/inventory/picking/PickingProductivityPage'));
const PickingKpisPage = lazy(() => import('../pages/app/inventory/picking/PickingKpisPage'));
const PickRouteMapPage = lazy(() => import('../pages/app/inventory/picking/PickRouteMapPage'));
const VoicePickingPage = lazy(() => import('../pages/app/inventory/picking/VoicePickingPage'));
const PickToLightPage = lazy(() => import('../pages/app/inventory/picking/PickToLightPage'));
const RfidPickingPage = lazy(() => import('../pages/app/inventory/picking/RfidPickingPage'));
const PickSortingPage = lazy(() => import('../pages/app/inventory/picking/PickSortingPage'));
const ZoneHandoffsPage = lazy(() => import('../pages/app/inventory/picking/ZoneHandoffsPage'));
const ShippingDashboardPage = lazy(() => import('../pages/app/inventory/shipping/ShippingDashboard'));
const ShippingPackagesPage = lazy(() => import('../pages/app/inventory/shipping/PackagesPage'));
const ShipmentsPage = lazy(() => import('../pages/app/inventory/shipping/ShipmentsPage'));
const ShippingCarriersPage = lazy(() => import('../pages/app/inventory/shipping/CarriersPage'));
const ShippingDocumentsPage = lazy(() => import('../pages/app/inventory/shipping/ShippingDocumentsPage'));
const ShippingManifestsPage = lazy(() => import('../pages/app/inventory/shipping/ManifestsPage'));
const ShippingKpisPage = lazy(() => import('../pages/app/inventory/shipping/ShippingKpisPage'));
const CountingDashboardPage = lazy(() => import('../pages/app/inventory/counting/CountingDashboard'));
const CountPlansPage = lazy(() => import('../pages/app/inventory/counting/CountPlansPage'));
const CountTasksPage = lazy(() => import('../pages/app/inventory/counting/CountTasksPage'));
const CountVariancesPage = lazy(() => import('../pages/app/inventory/counting/VariancesPage'));
const AdjustmentApprovalsPage2 = lazy(() => import('../pages/app/inventory/counting/AdjustmentApprovalsPage'));
const CountCompletionPage = lazy(() => import('../pages/app/inventory/counting/CountCompletionPage'));
const ExpiryCountReportPage = lazy(() => import('../pages/app/inventory/counting/ExpiryCountReportPage'));
const MobileCountPage = lazy(() => import('../pages/app/inventory/counting/MobileCountPage'));
const RecountPage = lazy(() => import('../pages/app/inventory/counting/RecountPage'));
const FreezePage = lazy(() => import('../pages/app/inventory/counting/FreezePage'));
const AnnualCountPage = lazy(() => import('../pages/app/inventory/counting/AnnualCountPage'));
const RateQuotesPage = lazy(() => import('../pages/app/inventory/shipping/RateQuotesPage'));
const RateRulesPage = lazy(() => import('../pages/app/inventory/shipping/RateRulesPage'));
const TrackingPage = lazy(() => import('../pages/app/inventory/shipping/TrackingPage'));
const CarrierWebhooksPage = lazy(() => import('../pages/app/inventory/shipping/CarrierWebhooksPage'));
const ManifestCompletionPage = lazy(() => import('../pages/app/inventory/shipping/ManifestCompletionPage'));
const ReturnsDashboardPage = lazy(() => import('../pages/app/inventory/returns/ReturnsDashboard'));
const ReturnRmaPage = lazy(() => import('../pages/app/inventory/returns/RmaPage'));
const ReturnReceivingPage = lazy(() => import('../pages/app/inventory/returns/ReturnReceivingPage'));
const ReturnGradingPage = lazy(() => import('../pages/app/inventory/returns/ReturnGradingPage'));
const ReturnDispositionPage = lazy(() => import('../pages/app/inventory/returns/ReturnDispositionPage'));
const ProductionReturnsPage = lazy(() => import('../pages/app/inventory/returns/ProductionReturnsPage'));
const ReturnRtvPage = lazy(() => import('../pages/app/inventory/returns/ReturnRtvPage'));
const ReturnNotificationsPage = lazy(() => import('../pages/app/inventory/returns/ReturnNotificationsPage'));
const SupplierRtvReportsPage = lazy(() => import('../pages/app/inventory/returns/SupplierRtvReportsPage'));
const ReturnAnalyticsPage = lazy(() => import('../pages/app/inventory/returns/ReturnAnalyticsPage'));
const ReturnQualityPage = lazy(() => import('../pages/app/inventory/returns/ReturnQualityPage'));
const ReturnValueRecoveryPage = lazy(() => import('../pages/app/inventory/returns/ReturnValueRecoveryPage'));
const ReturnCapaPage = lazy(() => import('../pages/app/inventory/returns/ReturnCapaPage'));
const LaborDashboardPage = lazy(() => import('../pages/app/inventory/labor/LaborDashboard'));
const LaborStandardsPage = lazy(() => import('../pages/app/inventory/labor/LaborStandardsPage'));
const WorkforcePlanningPage = lazy(() => import('../pages/app/inventory/labor/WorkforcePlanningPage'));
const WorkerAvailabilityPage = lazy(() => import('../pages/app/inventory/labor/WorkerAvailabilityPage'));
const LaborDispatchPage = lazy(() => import('../pages/app/inventory/labor/LaborDispatchPage'));
const LaborInterleavingPage = lazy(() => import('../pages/app/inventory/labor/LaborInterleavingPage'));
const LaborTimeTrackingPage = lazy(() => import('../pages/app/inventory/labor/LaborTimeTrackingPage'));
const EmployeePerformancePage2 = lazy(() => import('../pages/app/inventory/labor/EmployeePerformancePage'));
const LaborManagerDashboardPage = lazy(() => import('../pages/app/inventory/labor/LaborManagerDashboardPage'));
const NonProductiveTimePage = lazy(() => import('../pages/app/inventory/labor/NonProductiveTimePage'));
const SkillsTrainingPage = lazy(() => import('../pages/app/inventory/labor/SkillsTrainingPage'));
const LaborIncentivesPage = lazy(() => import('../pages/app/inventory/labor/LaborIncentivesPage'));
const LaborReportsPage = lazy(() => import('../pages/app/inventory/labor/LaborReportsPage'));
const LaborSafetyKpisPage = lazy(() => import('../pages/app/inventory/labor/LaborSafetyKpisPage'));
const LaborLeaderboardPage = lazy(() => import('../pages/app/inventory/labor/LaborLeaderboardPage'));
const WarehouseAnalyticsDashboardPage = lazy(() => import('../pages/app/inventory/analytics/WarehouseAnalyticsDashboard'));
const ExecutiveDashboardPage = lazy(() => import('../pages/app/inventory/analytics/ExecutiveDashboardPage'));
const OperationsManagerDashboardPage = lazy(() => import('../pages/app/inventory/analytics/OperationsManagerDashboardPage'));
const ShiftSupervisorDashboardPage = lazy(() => import('../pages/app/inventory/analytics/ShiftSupervisorDashboardPage'));
const KpiScorecardPage = lazy(() => import('../pages/app/inventory/analytics/KpiScorecardPage'));
const KpiTrendsPage = lazy(() => import('../pages/app/inventory/analytics/KpiTrendsPage'));
const InventoryHeatmapAnalyticsPage = lazy(() => import('../pages/app/inventory/analytics/InventoryHeatmapAnalyticsPage'));
const SeasonalPatternsPage = lazy(() => import('../pages/app/inventory/analytics/SeasonalPatternsPage'));
const RootCauseAnalysisPage = lazy(() => import('../pages/app/inventory/analytics/RootCauseAnalysisPage'));
const PredictiveAlertsPage = lazy(() => import('../pages/app/inventory/analytics/PredictiveAlertsPage'));
const PeriodicReportsPage = lazy(() => import('../pages/app/inventory/analytics/PeriodicReportsPage'));
const ReportExportsPage = lazy(() => import('../pages/app/inventory/analytics/ReportExportsPage'));
const OperatingCostsPage = lazy(() => import('../pages/app/inventory/analytics/OperatingCostsPage'));
const KpiTargetsPage = lazy(() => import('../pages/app/inventory/analytics/KpiTargetsPage'));

// بوابة CRM — الوحدة 1: جهات الاتصال والحسابات (التقرير 01)
const ContactsLayout        = lazy(() => import('../pages/crmportal/contacts/ContactsLayout'));
const ContactsOverview      = lazy(() => import('../pages/crmportal/contacts/ContactsOverview'));
const CrmAccountsPage       = lazy(() => import('../pages/crmportal/contacts/AccountsPage'));
const CrmAccountDetailPage  = lazy(() => import('../pages/crmportal/contacts/AccountDetailPage'));
const CrmPeoplePage         = lazy(() => import('../pages/crmportal/contacts/PeoplePage'));
const CrmContactDetailPage  = lazy(() => import('../pages/crmportal/contacts/ContactDetailPage'));
const CrmConvertPage        = lazy(() => import('../pages/crmportal/contacts/ConvertPage'));
const CrmAuditPage          = lazy(() => import('../pages/crmportal/contacts/AuditPage'));
// بوابة CRM — الوحدة 2: خط الأنابيب والصفقات (التقرير 02)
const PipelineLayout        = lazy(() => import('../pages/crmportal/pipeline/PipelineLayout'));
const PipelineOverview      = lazy(() => import('../pages/crmportal/pipeline/PipelineOverview'));
const KanbanBoard           = lazy(() => import('../pages/crmportal/pipeline/KanbanBoard'));
const CrmDealsListPage      = lazy(() => import('../pages/crmportal/pipeline/DealsListPage'));
const CrmDealDetailPage     = lazy(() => import('../pages/crmportal/pipeline/DealDetailPage'));
const CrmWinLossPage        = lazy(() => import('../pages/crmportal/pipeline/WinLossPage'));
// بوابة CRM — الوحدة 3: الأنشطة والأتمتة (التقرير 03)
const ActivitiesLayout      = lazy(() => import('../pages/crmportal/activities/ActivitiesLayout'));
const ActivitiesOverview    = lazy(() => import('../pages/crmportal/activities/ActivitiesOverview'));
const CrmMyTasksPage        = lazy(() => import('../pages/crmportal/activities/MyTasksPage'));
const CrmSequencesPage      = lazy(() => import('../pages/crmportal/activities/SequencesPage'));
const CrmAutomationPage     = lazy(() => import('../pages/crmportal/activities/AutomationPage'));
const CrmAssignmentPage     = lazy(() => import('../pages/crmportal/activities/AssignmentPage'));
// بوابة CRM — الوحدة 4: العروض والعقود CPQ (التقرير 04)
const QuotesLayout          = lazy(() => import('../pages/crmportal/quotes/QuotesLayout'));
const QuotesOverview        = lazy(() => import('../pages/crmportal/quotes/QuotesOverview'));
const CrmCatalogPage        = lazy(() => import('../pages/crmportal/quotes/CatalogPage'));
const CrmQuotesListPage     = lazy(() => import('../pages/crmportal/quotes/QuotesListPage'));
const CrmQuoteDetailPage    = lazy(() => import('../pages/crmportal/quotes/QuoteDetailPage'));
const CrmApprovalsPage      = lazy(() => import('../pages/crmportal/quotes/ApprovalsPage'));
const CrmContractsPage      = lazy(() => import('../pages/crmportal/quotes/ContractsPage'));
// بوابة CRM — الوحدة 5: الدعم والتذاكر (التقرير 05)
const SupportLayout         = lazy(() => import('../pages/crmportal/support/SupportLayout'));
const SupportOverview       = lazy(() => import('../pages/crmportal/support/SupportOverview'));
const CrmTicketsPage        = lazy(() => import('../pages/crmportal/support/TicketsPage'));
const CrmTicketDetailPage   = lazy(() => import('../pages/crmportal/support/TicketDetailPage'));
const CrmKnowledgeBasePage  = lazy(() => import('../pages/crmportal/support/KnowledgeBasePage'));
const CrmSupportSettingsPage = lazy(() => import('../pages/crmportal/support/SupportSettingsPage'));
// بوابة CRM — الوحدة 6: التحليلات والتنبؤ (التقرير 06)
const AnalyticsLayout       = lazy(() => import('../pages/crmportal/analytics/AnalyticsLayout'));
const CrmExecOverview       = lazy(() => import('../pages/crmportal/analytics/ExecOverview'));
const CrmForecastPage       = lazy(() => import('../pages/crmportal/analytics/ForecastPage'));
const CrmIntelligencePage   = lazy(() => import('../pages/crmportal/analytics/IntelligencePage'));
const CrmRevenuePage        = lazy(() => import('../pages/crmportal/analytics/RevenuePage'));
const MarketingDashboard    = lazy(() => import('../pages/marketingportal/MarketingDashboard'));
const IntegrationsPage      = lazy(() => import('../pages/marketingportal/IntegrationsPage'));
// وحدة أتمتة التسويق (التقرير 1)
const AutomationLayout      = lazy(() => import('../pages/marketingportal/automation/AutomationLayout'));
const AutomationOverview    = lazy(() => import('../pages/marketingportal/automation/AutomationOverview'));
const LeadsPage             = lazy(() => import('../pages/marketingportal/automation/LeadsPage'));
const ScoringPage           = lazy(() => import('../pages/marketingportal/automation/ScoringPage'));
const WorkflowsPage         = lazy(() => import('../pages/marketingportal/automation/WorkflowsPage'));
const ActivityPage          = lazy(() => import('../pages/marketingportal/automation/ActivityPage'));
// وحدة البريد الإلكتروني (التقرير 2)
const EmailLayout           = lazy(() => import('../pages/marketingportal/email/EmailLayout'));
const EmailOverview         = lazy(() => import('../pages/marketingportal/email/EmailOverview'));
const EmailInfraPage        = lazy(() => import('../pages/marketingportal/email/InfraPage'));
const EmailListsPage        = lazy(() => import('../pages/marketingportal/email/ListsPage'));
const EmailTemplatesPage    = lazy(() => import('../pages/marketingportal/email/TemplatesPage'));
const EmailCampaignsPage    = lazy(() => import('../pages/marketingportal/email/CampaignsPage'));
const EmailAnalyticsPage    = lazy(() => import('../pages/marketingportal/email/AnalyticsPage'));
// وحدة وسائل التواصل الاجتماعي (التقرير 3)
const SocialLayout          = lazy(() => import('../pages/marketingportal/social/SocialLayout'));
const SocialOverview        = lazy(() => import('../pages/marketingportal/social/SocialOverview'));
const SocialAccountsPage    = lazy(() => import('../pages/marketingportal/social/AccountsPage'));
const SocialPostsPage       = lazy(() => import('../pages/marketingportal/social/PostsPage'));
const SocialCalendarPage    = lazy(() => import('../pages/marketingportal/social/CalendarPage'));
const SocialInboxPage       = lazy(() => import('../pages/marketingportal/social/InboxPage'));
const SocialUtmPage         = lazy(() => import('../pages/marketingportal/social/UtmPage'));
const SocialListeningPage   = lazy(() => import('../pages/marketingportal/social/ListeningPage'));
const SocialAnalyticsPage   = lazy(() => import('../pages/marketingportal/social/SocialAnalyticsPage'));
// وحدة الرسائل النصية والواتساب (التقرير 4)
const MessagingLayout       = lazy(() => import('../pages/marketingportal/messaging/MessagingLayout'));
const MessagingOverview     = lazy(() => import('../pages/marketingportal/messaging/MessagingOverview'));
const MessagingGatewaysPage = lazy(() => import('../pages/marketingportal/messaging/GatewaysPage'));
const MessagingContactsPage = lazy(() => import('../pages/marketingportal/messaging/ContactsPage'));
const MessagingTemplatesPage = lazy(() => import('../pages/marketingportal/messaging/TemplatesPage'));
const MessagingCampaignsPage = lazy(() => import('../pages/marketingportal/messaging/CampaignsPage'));
const MessagingAnalyticsPage = lazy(() => import('../pages/marketingportal/messaging/MessagingAnalyticsPage'));
// وحدة إدارة الفعاليات (التقرير 5)
const EventsPage            = lazy(() => import('../pages/marketingportal/events/EventsPage'));
const EventDetail          = lazy(() => import('../pages/marketingportal/events/EventDetail'));
// وحدة الاستبيانات والتغذية الراجعة (التقرير 6)
const SurveysPage          = lazy(() => import('../pages/marketingportal/surveys/SurveysPage'));
const SurveyDetail         = lazy(() => import('../pages/marketingportal/surveys/SurveyDetail'));
// وحدة نظام المناعة العلائقية (التقرير 7 — الطبقة الحاكمة)
const ImmuneLayout         = lazy(() => import('../pages/marketingportal/immune/ImmuneLayout'));
const ImmuneOverview       = lazy(() => import('../pages/marketingportal/immune/ImmuneOverview'));
const ImmuneBalancesPage   = lazy(() => import('../pages/marketingportal/immune/BalancesPage'));
const ImmuneGovernancePage = lazy(() => import('../pages/marketingportal/immune/GovernancePage'));
const ImmuneCulturalPage   = lazy(() => import('../pages/marketingportal/immune/CulturalPage'));
const ImmuneImmunityPage   = lazy(() => import('../pages/marketingportal/immune/ImmunityPage'));
const ImmuneCustomerPage   = lazy(() => import('../pages/marketingportal/immune/CustomerViewPage'));
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
      <Route path="/services/:serviceId" element={<ServiceDetailPage />} />
      <Route path="/supplier-portal/:token" element={<SupplierPortalPage />} />
      <Route path="/supplier-rfx/:token" element={<SupplierRfxPortalPage />} />
      <Route path="/supplier-invoice/:token" element={<SupplierInvoicePortalPage />} />
      <Route path="/supplier-dock/:token" element={<SupplierDockPortalPage />} />
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
          {/* حارس الصفحات للاشتراك الهجين — يمرّر دون تدخّل لغير الهجين */}
          <Route element={<RequirePage />}>
          {/* Root: تحويل حسب الدور */}
          <Route index element={<RoleRedirect />} />

          {/* Notifications */}
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="my-notifications" element={<MyNotificationsPage />} />

          {/* Insights (متاح لعدة أدوار) */}
          <Route path="insights" element={<AIInsightsDashboard />} />

          {/*
            صفحات أساسية متاحة لكل الأدوار وكل البوابات — بنفس مساراتها الأصلية
            (/app/employee/profile و /app/employee/problems) لكن خارج قيد دور الموظف.
            يحلّ "حسابي/البلاغات لا تعمل" لغير الموظف (HR/admin/الاشتراك الهجين).
            صلاحية "نشر بلاغ" تبقى محكومة داخل ProblemsList (permKey new-problem).
          */}
          <Route path="employee/profile" element={<ProfilePage />} />
          <Route path="employee/problems" element={<ProblemsList isHR={false} />} />
          <Route path="employee/problems/new" element={<NewProblemPage />} />
          <Route path="employee/problems/:id" element={<ProblemDetail />} />

          {/* Marketing Portal — بوابة التسويق (تُفعَّل كوحدة marketing) */}
          <Route path="marketing" element={<RequireRole roles={['marketing', 'admin', 'developer']} />}>
            <Route element={<MarketingPortal />}>
              <Route index element={<MarketingDashboard />} />
              {/* الوحدة 1 — أتمتة التسويق (تُبنى الوحدات تدريجياً حسب ترتيب التقارير) */}
              <Route path="automation" element={<AutomationLayout />}>
                <Route index element={<AutomationOverview />} />
                <Route path="leads" element={<LeadsPage />} />
                <Route path="scoring" element={<ScoringPage />} />
                <Route path="workflows" element={<WorkflowsPage />} />
                <Route path="activity" element={<ActivityPage />} />
              </Route>
              {/* الوحدة 2 — البريد الإلكتروني */}
              <Route path="email" element={<EmailLayout />}>
                <Route index element={<EmailOverview />} />
                <Route path="infra" element={<EmailInfraPage />} />
                <Route path="lists" element={<EmailListsPage />} />
                <Route path="templates" element={<EmailTemplatesPage />} />
                <Route path="campaigns" element={<EmailCampaignsPage />} />
                <Route path="analytics" element={<EmailAnalyticsPage />} />
              </Route>
              {/* الوحدة 3 — وسائل التواصل الاجتماعي */}
              <Route path="social" element={<SocialLayout />}>
                <Route index element={<SocialOverview />} />
                <Route path="accounts" element={<SocialAccountsPage />} />
                <Route path="posts" element={<SocialPostsPage />} />
                <Route path="calendar" element={<SocialCalendarPage />} />
                <Route path="inbox" element={<SocialInboxPage />} />
                <Route path="utm" element={<SocialUtmPage />} />
                <Route path="listening" element={<SocialListeningPage />} />
                <Route path="analytics" element={<SocialAnalyticsPage />} />
              </Route>
              {/* الوحدة 5 — إدارة الفعاليات */}
              <Route path="events" element={<EventsPage />} />
              <Route path="events/:eventId" element={<EventDetail />} />
              {/* الوحدة 6 — الاستبيانات والتغذية الراجعة */}
              <Route path="surveys" element={<SurveysPage />} />
              <Route path="surveys/:surveyId" element={<SurveyDetail />} />
              {/* ربط المزوّدين — مفاتيح خاصة بالشركة (BYOK) */}
              <Route path="integrations" element={<IntegrationsPage />} />
              {/* الوحدة 7 — نظام المناعة العلائقية (الطبقة الحاكمة) */}
              <Route path="immune-system" element={<ImmuneLayout />}>
                <Route index element={<ImmuneOverview />} />
                <Route path="balances" element={<ImmuneBalancesPage />} />
                <Route path="governance" element={<ImmuneGovernancePage />} />
                <Route path="cultural" element={<ImmuneCulturalPage />} />
                <Route path="immunity" element={<ImmuneImmunityPage />} />
                <Route path="customer" element={<ImmuneCustomerPage />} />
              </Route>
              {/* الوحدة 4 — الرسائل النصية والواتساب */}
              <Route path="messaging" element={<MessagingLayout />}>
                <Route index element={<MessagingOverview />} />
                <Route path="gateways" element={<MessagingGatewaysPage />} />
                <Route path="contacts" element={<MessagingContactsPage />} />
                <Route path="templates" element={<MessagingTemplatesPage />} />
                <Route path="campaigns" element={<MessagingCampaignsPage />} />
                <Route path="analytics" element={<MessagingAnalyticsPage />} />
              </Route>
            </Route>
          </Route>

          {/* CRM Portal — بوابة CRM (تُفعَّل كوحدة crm) */}
          <Route path="crm" element={<RequireRole roles={['sales', 'admin', 'developer']} />}>
            <Route element={<CrmPortal />}>
              <Route index element={<CrmDashboard />} />
              {/* الوحدة 1: جهات الاتصال والحسابات (التقرير 01) */}
              <Route path="contacts" element={<ContactsLayout />}>
                <Route index element={<ContactsOverview />} />
                <Route path="accounts" element={<CrmAccountsPage />} />
                <Route path="accounts/:id" element={<CrmAccountDetailPage />} />
                <Route path="people" element={<CrmPeoplePage />} />
                <Route path="people/:id" element={<CrmContactDetailPage />} />
                <Route path="convert" element={<CrmConvertPage />} />
                <Route path="audit" element={<CrmAuditPage />} />
              </Route>
              {/* الوحدة 2: خط الأنابيب والصفقات (التقرير 02) */}
              <Route path="pipeline" element={<PipelineLayout />}>
                <Route index element={<PipelineOverview />} />
                <Route path="board" element={<KanbanBoard />} />
                <Route path="list" element={<CrmDealsListPage />} />
                <Route path="deals/:id" element={<CrmDealDetailPage />} />
                <Route path="winloss" element={<CrmWinLossPage />} />
              </Route>
              {/* الوحدة 3: الأنشطة والأتمتة (التقرير 03) */}
              <Route path="activities" element={<ActivitiesLayout />}>
                <Route index element={<ActivitiesOverview />} />
                <Route path="tasks" element={<CrmMyTasksPage />} />
                <Route path="sequences" element={<CrmSequencesPage />} />
                <Route path="automation" element={<CrmAutomationPage />} />
                <Route path="assignment" element={<CrmAssignmentPage />} />
              </Route>
              {/* الوحدة 4: العروض والعقود CPQ (التقرير 04) */}
              <Route path="quotes" element={<QuotesLayout />}>
                <Route index element={<QuotesOverview />} />
                <Route path="catalog" element={<CrmCatalogPage />} />
                <Route path="list" element={<CrmQuotesListPage />} />
                <Route path="detail/:id" element={<CrmQuoteDetailPage />} />
                <Route path="approvals" element={<CrmApprovalsPage />} />
                <Route path="contracts" element={<CrmContractsPage />} />
              </Route>
              {/* الوحدة 5: الدعم والتذاكر (التقرير 05) */}
              <Route path="support" element={<SupportLayout />}>
                <Route index element={<SupportOverview />} />
                <Route path="tickets" element={<CrmTicketsPage />} />
                <Route path="tickets/:id" element={<CrmTicketDetailPage />} />
                <Route path="kb" element={<CrmKnowledgeBasePage />} />
                <Route path="settings" element={<CrmSupportSettingsPage />} />
              </Route>
              {/* الوحدة 6: التحليلات والتنبؤ (التقرير 06) — بوابة CRM كاملة 6/6 */}
              <Route path="analytics" element={<AnalyticsLayout />}>
                <Route index element={<CrmExecOverview />} />
                <Route path="forecast" element={<CrmForecastPage />} />
                <Route path="intelligence" element={<CrmIntelligencePage />} />
                <Route path="revenue" element={<CrmRevenuePage />} />
              </Route>
            </Route>
          </Route>

          {/* Procurement Portal — بوابة المشتريات Wave1 (هيكل مجلدي مثل CRM) */}
          <Route path="procurement" element={<RequireRole roles={['procurement', 'admin', 'developer', 'manager', 'finance']} />}>
            <Route element={<RequireModule moduleKey="procurement" />}>
              <Route index element={<ProcurementDashboard />} />
              <Route path="dashboard" element={<ProcurementDashboard />} />
              <Route path="suppliers" element={<SuppliersLayout />}>
                <Route index element={<SuppliersPage />} />
                <Route path=":id" element={<SupplierDetailPage />} />
              </Route>
              <Route path="requisitions" element={<RequisitionsLayout />}>
                <Route index element={<RequisitionListPage />} />
                <Route path=":id" element={<RequisitionDetailPage />} />
              </Route>
              <Route path="sourcing" element={<SourcingLayout />}>
                <Route index element={<SourcingEventsPage />} />
                <Route path=":id" element={<RfxDetailPage />} />
                <Route path="auctions/live" element={<AuctionLivePage />} />
              </Route>
              <Route path="orders" element={<OrdersLayout />}>
                <Route index element={<PurchaseOrdersPage />} />
                <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
                <Route path="purchase-orders/:id" element={<PoDetailPage />} />
                <Route path="releases" element={<PoReleasesPage />} />
                <Route path="goods-receipts" element={<GoodsReceiptPage />} />
              </Route>
              <Route path="invoices" element={<InvoicesLayout />}>
                <Route index element={<InvoicesPage />} />
                <Route path="tolerance-rules" element={<ToleranceRulesPage />} />
                <Route path=":id/matching" element={<MatchingDetailPage />} />
              </Route>
              <Route path="contracts" element={<ContractsLayout />}>
                <Route index element={<ContractsPage />} />
                <Route path="templates" element={<TemplatesPage />} />
                <Route path="obligations" element={<ObligationsPage />} />
                <Route path="versions" element={<VersionsPage />} />
                <Route path="signatures" element={<SignaturesPage />} />
              </Route>
              <Route path="analytics" element={<AnalyticsLayout2 />}>
                <Route index element={<SpendAnalyticsPage />} />
                <Route path="categories" element={<CategoryPage />} />
                <Route path="price-trend" element={<PriceTrendPage />} />
                <Route path="forecast" element={<ForecastPage />} />
              </Route>
            </Route>
          </Route>

          {/* Inventory / Warehouse Portal — بوابة المخزون والمستودعات */}
          <Route path="inventory" element={<RequireRole roles={['inventory', 'admin', 'developer', 'manager', 'procurement']} />}>
            <Route element={<RequireModule moduleKey="inventory" />}>
              <Route index element={<InventoryDashboard />} />
              <Route path="dashboard" element={<InventoryDashboard />} />
              <Route path="foundation" element={<InventoryFoundationDashboard />} />
              <Route path="items" element={<InventoryItemsPage />} />
              <Route path="warehouses" element={<InventoryWarehousesPage />} />
              <Route path="locations" element={<InventoryLocationsPage />} />
              <Route path="stock" element={<InventoryStockPage />} />
              <Route path="movements" element={<InventoryMovementsPage />} />
              <Route path="numbering" element={<InventoryNumberingPage />} />
              <Route path="receiving" element={<ReceivingDashboardPage />} />
              <Route path="receiving/asn" element={<InventoryAsnListPage />} />
              <Route path="receiving/dock-schedule" element={<InventoryDockSchedulePage />} />
              <Route path="receiving/sessions" element={<InventoryReceivingSessionsPage />} />
              <Route path="receiving/osd" element={<InventoryOsdCasesPage />} />
              <Route path="receiving/quarantine" element={<InventoryQuarantinePage />} />
              <Route path="receiving/putaway" element={<InventoryPutawayTasksPage />} />
              <Route path="receiving/cross-dock" element={<InventoryCrossDockingPage />} />
              <Route path="receiving/mobile-scan" element={<InventoryMobileScanPage />} />
              <Route path="receiving/lpn-labels" element={<InventoryLpnLabelsPage />} />
              <Route path="receiving/reports" element={<InventoryReceivingReportsPage />} />
              <Route path="receiving/notifications" element={<InventoryInboundNotificationsPage />} />
              <Route path="receiving/attachments" element={<InventoryReceivingAttachmentsPage />} />
              <Route path="receiving/ncr" element={<InventoryQualityNcrPage />} />
              <Route path="storage" element={<StorageDashboardPage />} />
              <Route path="storage/map" element={<InventoryLocationMapPage />} />
              <Route path="storage/visual-map" element={<InventoryVisualWarehouseMapPage />} />
              <Route path="storage/heatmap" element={<InventoryStorageHeatmapPage />} />
              <Route path="storage/slotting" element={<InventorySlottingPage />} />
              <Route path="storage/abc" element={<InventoryAbcClassificationPage />} />
              <Route path="storage/replenishment" element={<InventoryReplenishmentPage />} />
              <Route path="storage/capacity" element={<InventoryCapacityPage />} />
              <Route path="storage/slow-moving" element={<InventorySlowMovingPage />} />
              <Route path="storage/location-labels" element={<InventoryLocationLabelsPage />} />
              <Route path="storage/affinity" element={<InventoryAffinityPage />} />
              <Route path="storage/seasonal" element={<InventorySeasonalSlottingPage />} />
              <Route path="storage/interleaving" element={<InventoryTaskInterleavingPage />} />
              <Route path="storage/slow-moving-reports" element={<InventorySlowMovingReportsPage />} />
              <Route path="picking" element={<PickingDashboardPage />} />
              <Route path="picking/orders" element={<PickOrdersPage />} />
              <Route path="picking/tasks" element={<PickTasksPage />} />
              <Route path="picking/waves" element={<PickWavesPage />} />
              <Route path="picking/exceptions" element={<PickExceptionsPage />} />
              <Route path="picking/scans" element={<PickScansPage />} />
              <Route path="picking/productivity" element={<PickingProductivityPage />} />
              <Route path="picking/kpis" element={<PickingKpisPage />} />
              <Route path="picking/route-map" element={<PickRouteMapPage />} />
              <Route path="picking/voice" element={<VoicePickingPage />} />
              <Route path="picking/pick-to-light" element={<PickToLightPage />} />
              <Route path="picking/rfid" element={<RfidPickingPage />} />
              <Route path="picking/sorting" element={<PickSortingPage />} />
              <Route path="picking/handoffs" element={<ZoneHandoffsPage />} />
              <Route path="shipping" element={<ShippingDashboardPage />} />
              <Route path="shipping/packages" element={<ShippingPackagesPage />} />
              <Route path="shipping/shipments" element={<ShipmentsPage />} />
              <Route path="shipping/carriers" element={<ShippingCarriersPage />} />
              <Route path="shipping/documents" element={<ShippingDocumentsPage />} />
              <Route path="shipping/manifests" element={<ShippingManifestsPage />} />
              <Route path="shipping/manifest-completion" element={<ManifestCompletionPage />} />
              <Route path="shipping/rate-quotes" element={<RateQuotesPage />} />
              <Route path="shipping/rate-rules" element={<RateRulesPage />} />
              <Route path="shipping/tracking" element={<TrackingPage />} />
              <Route path="shipping/webhooks" element={<CarrierWebhooksPage />} />
              <Route path="shipping/kpis" element={<ShippingKpisPage />} />
              <Route path="counting" element={<CountingDashboardPage />} />
              <Route path="counting/plans" element={<CountPlansPage />} />
              <Route path="counting/tasks" element={<CountTasksPage />} />
              <Route path="counting/variances" element={<CountVariancesPage />} />
              <Route path="counting/approvals" element={<AdjustmentApprovalsPage2 />} />
              <Route path="counting/completion" element={<CountCompletionPage />} />
              <Route path="counting/expiry" element={<ExpiryCountReportPage />} />
              <Route path="counting/mobile" element={<MobileCountPage />} />
              <Route path="counting/recount" element={<RecountPage />} />
              <Route path="counting/freeze" element={<FreezePage />} />
              <Route path="counting/annual" element={<AnnualCountPage />} />
              <Route path="returns" element={<ReturnsDashboardPage />} />
              <Route path="returns/rma" element={<ReturnRmaPage />} />
              <Route path="returns/receiving" element={<ReturnReceivingPage />} />
              <Route path="returns/grading" element={<ReturnGradingPage />} />
              <Route path="returns/disposition" element={<ReturnDispositionPage />} />
              <Route path="returns/production" element={<ProductionReturnsPage />} />
              <Route path="returns/rtv" element={<ReturnRtvPage />} />
              <Route path="returns/notifications" element={<ReturnNotificationsPage />} />
              <Route path="returns/supplier-reports" element={<SupplierRtvReportsPage />} />
              <Route path="returns/analytics" element={<ReturnAnalyticsPage />} />
              <Route path="returns/quality" element={<ReturnQualityPage />} />
              <Route path="returns/value-recovery" element={<ReturnValueRecoveryPage />} />
              <Route path="returns/capa" element={<ReturnCapaPage />} />
              <Route path="labor" element={<LaborDashboardPage />} />
              <Route path="labor/standards" element={<LaborStandardsPage />} />
              <Route path="labor/planning" element={<WorkforcePlanningPage />} />
              <Route path="labor/availability" element={<WorkerAvailabilityPage />} />
              <Route path="labor/dispatch" element={<LaborDispatchPage />} />
              <Route path="labor/interleaving" element={<LaborInterleavingPage />} />
              <Route path="labor/time-tracking" element={<LaborTimeTrackingPage />} />
              <Route path="labor/employee-performance" element={<EmployeePerformancePage2 />} />
              <Route path="labor/manager-dashboard" element={<LaborManagerDashboardPage />} />
              <Route path="labor/non-productive" element={<NonProductiveTimePage />} />
              <Route path="labor/skills-training" element={<SkillsTrainingPage />} />
              <Route path="labor/incentives" element={<LaborIncentivesPage />} />
              <Route path="labor/reports" element={<LaborReportsPage />} />
              <Route path="labor/safety-kpis" element={<LaborSafetyKpisPage />} />
              <Route path="labor/leaderboard" element={<LaborLeaderboardPage />} />
              <Route path="analytics" element={<WarehouseAnalyticsDashboardPage />} />
              <Route path="analytics/executive" element={<ExecutiveDashboardPage />} />
              <Route path="analytics/operations" element={<OperationsManagerDashboardPage />} />
              <Route path="analytics/supervisor" element={<ShiftSupervisorDashboardPage />} />
              <Route path="analytics/scorecard" element={<KpiScorecardPage />} />
              <Route path="analytics/trends" element={<KpiTrendsPage />} />
              <Route path="analytics/heatmap" element={<InventoryHeatmapAnalyticsPage />} />
              <Route path="analytics/seasonal" element={<SeasonalPatternsPage />} />
              <Route path="analytics/root-cause" element={<RootCauseAnalysisPage />} />
              <Route path="analytics/alerts" element={<PredictiveAlertsPage />} />
              <Route path="analytics/reports" element={<PeriodicReportsPage />} />
              <Route path="analytics/exports" element={<ReportExportsPage />} />
              <Route path="analytics/costs" element={<OperatingCostsPage />} />
              <Route path="analytics/targets" element={<KpiTargetsPage />} />
            </Route>
          </Route>

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
            {/* ملاحظة: problems و profile نُقلت للمنطقة العامة (متاحة لكل الأدوار) أعلاه */}
            <Route path="wellness" element={<WellnessPage />} />
            <Route path="ai-chat" element={<AIChatPage />} />
            <Route path="survey" element={<SurveyPage />} />
            <Route path="training" element={<TrainingPage />} />
            <Route path="goals" element={<MyGoalsPage />} />
            <Route path="sops" element={<SOPsPage />} />
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
            <Route path="procurement-approvals" element={<ProcurementApprovalRulesPage />} />
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
