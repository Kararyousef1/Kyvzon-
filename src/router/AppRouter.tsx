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
import { RequireMovementRole } from './guards/RequireMovementRole';
import { RequireDriver } from './guards/RequireDriver';
import { RequirePortalUnit } from './guards/RequirePortalUnit';
import { RequireDynamicPortalUnit } from './guards/RequireDynamicPortalUnit';
import { MovementRoleRedirect } from './guards/MovementRoleRedirect';
import { RequirePage } from './guards/RequirePage';
import { RoleRedirect } from './guards/RoleRedirect';

// legacy
import { legacyViewToPath } from './legacyRedirect';
import { legacyRouteService } from '../services/sdk/LegacyRouteService';

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
const FinanceFoundationDashboardPage = lazy(() => import('../pages/app/finance/FinanceFoundationDashboard'));
const MultiEntityPage       = lazy(() => import('../pages/app/finance/MultiEntityPage'));
const EntityMembershipsPage = lazy(() => import('../pages/app/finance/EntityMembershipsPage'));
const CostCentersPage       = lazy(() => import('../pages/app/finance/CostCentersPage'));
const FinanceProjectsPage   = lazy(() => import('../pages/app/finance/FinanceProjectsPage'));
const ExchangeRatesPage     = lazy(() => import('../pages/app/finance/ExchangeRatesPage'));
const SystemNotesPage       = lazy(() => import('../pages/app/finance/SystemNotesPage'));
const CashManagementPage    = lazy(() => import('../pages/app/finance/CashManagementPage'));
const BankStatementImportPage = lazy(() => import('../pages/app/finance/BankStatementImportPage'));
const CashForecastPage      = lazy(() => import('../pages/app/finance/CashForecastPage'));
const TaxManagementPage     = lazy(() => import('../pages/app/finance/TaxManagementPage'));
const BudgetPage            = lazy(() => import('../pages/app/finance/BudgetPage'));
const AdvancedVariancePage  = lazy(() => import('../pages/app/finance/AdvancedVariancePage'));
const FixedAssetsPage       = lazy(() => import('../pages/app/finance/FixedAssetsPage'));
const RevenueRecognitionPage = lazy(() => import('../pages/app/finance/RevenueRecognitionPage'));
const IntercompanyPage     = lazy(() => import('../pages/app/finance/IntercompanyPage'));
const ProjectAccountingPage = lazy(() => import('../pages/app/finance/ProjectAccountingPage'));
const FinanceIntegrationsPage = lazy(() => import('../pages/app/finance/FinanceIntegrationsPage'));
const AccountingPeriodsPage = lazy(() => import('../pages/app/finance/AccountingPeriodsPage'));
const GeneralLedgerPage     = lazy(() => import('../pages/app/finance/GeneralLedgerPage'));
const FinancialReportsPage  = lazy(() => import('../pages/app/finance/FinancialReportsPage'));
const VendorsPage           = lazy(() => import('../pages/app/finance/VendorsPage'));
const AccountsPayablePage   = lazy(() => import('../pages/app/finance/AccountsPayablePage'));
const AccountsReceivablePage = lazy(() => import('../pages/app/finance/AccountsReceivablePage'));
const APAgingPage           = lazy(() => import('../pages/app/finance/APAgingPage'));
const VendorPaymentsPage    = lazy(() => import('../pages/app/finance/VendorPaymentsPage'));

const EmployeeDashboard    = lazy(() => import('../pages/employee/EmployeeDashboard'));
// ★ 0341: ProblemsList انقسمت إلى شاشتين. كانت مكوّناً واحداً يخدم
//   دورين عبر isHR ويُسطّح بنيتَي بيانات مختلفتين في نوع واحد.
const MyProblemsPage       = lazy(() => import('../pages/employee/MyProblemsPage'));
const HrProblemsInboxPage  = lazy(() => import('../pages/hr/HrProblemsInboxPage'));
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

// ─── Lazy: Movement Portal ──────────────────────────────────────────────
const EmployeeMovementPoliciesPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementPoliciesPage'));
const EmployeeMovementLocationsPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementLocationsPage'));
const EmployeeMovementPermitsPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementPermitsPage'));
const EmployeeMovementNewPermitPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementNewPermitPage'));
const EmployeeMovementPermitDetailPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementPermitDetailPage'));
const EmployeeMovementApprovalsPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementApprovalsPage'));
const EmployeeMovementTemplatesPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementTemplatesPage'));
const EmployeeMovementGateExecutionPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementGateExecutionPage'));
const EmployeeFieldVisitsPage = lazy(() => import('../pages/app/movement/employee/EmployeeFieldVisitsPage'));
const EmployeeMissionsPage = lazy(() => import('../pages/app/movement/employee/EmployeeMissionsPage'));
const EmployeeMovementAnalyticsPage = lazy(() => import('../pages/app/movement/employee/EmployeeMovementAnalyticsPage'));
const EmployeeComplianceViolationsPage = lazy(() => import('../pages/app/movement/employee/EmployeeComplianceViolationsPage'));

const LogisticsDashboardPage = lazy(() => import('../pages/app/movement/logistics/LogisticsDashboardPage'));
const LogisticsFoundationPage = lazy(() => import('../pages/app/movement/logistics/LogisticsFoundationPage'));
const LogisticsVehiclesPage = lazy(() => import('../pages/app/movement/logistics/LogisticsVehiclesPage'));
const LogisticsDriversPage = lazy(() => import('../pages/app/movement/logistics/LogisticsDriversPage'));
const LogisticsMaintenancePage = lazy(() => import('../pages/app/movement/logistics/LogisticsMaintenancePage'));
const LogisticsShipmentOrdersPage = lazy(() => import('../pages/app/movement/logistics/LogisticsShipmentOrdersPage'));
const LogisticsDispatchPage = lazy(() => import('../pages/app/movement/logistics/LogisticsDispatchPage'));
const LogisticsRoutePlanningPage = lazy(() => import('../pages/app/movement/logistics/LogisticsRoutePlanningPage'));
const LogisticsLiveTrackingPage = lazy(() => import('../pages/app/movement/logistics/LogisticsLiveTrackingPage'));
const LogisticsEpodPage = lazy(() => import('../pages/app/movement/logistics/LogisticsEpodPage'));
const LogisticsFuelPage = lazy(() => import('../pages/app/movement/logistics/LogisticsFuelPage'));
const LogisticsCarriersPage = lazy(() => import('../pages/app/movement/logistics/LogisticsCarriersPage'));
const LogisticsCostAnalyticsPage = lazy(() => import('../pages/app/movement/logistics/LogisticsCostAnalyticsPage'));
const LogisticsTrackReplayPage = lazy(() => import('../pages/app/movement/logistics/LogisticsTrackReplayPage'));
const LogisticsSafetyCompliancePage = lazy(() => import('../pages/app/movement/logistics/LogisticsSafetyCompliancePage'));
const DriverTripsPage = lazy(() => import('../pages/app/movement/driver/DriverTripsPage'));
const DriverDeliveryPage = lazy(() => import('../pages/app/movement/driver/DriverDeliveryPage'));
const DriverInspectionPage = lazy(() => import('../pages/app/movement/driver/DriverInspectionPage'));
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
// وحدات بوابة المدير
const ManagerMovementApprovalsPage = lazy(() => import('../pages/manager/units/movement/ManagerMovementApprovalsPage'));
const ManagerMovementTeamPage      = lazy(() => import('../pages/manager/units/movement/ManagerMovementTeamPage'));
// وحدات بوابة المشرف
const SupervisorMovementShiftPage  = lazy(() => import('../pages/supervisor/units/movement/SupervisorMovementShiftPage'));
const UnitApprovalsPage            = lazy(() => import('../pages/manager/units/UnitApprovalsPage'));
const ApprovalRulesAdminPage       = lazy(() => import('../pages/admin/ApprovalRulesAdminPage'));
const MrpRolesAdminPage            = lazy(() => import('../pages/admin/MrpRolesAdminPage'));
const TechPortal            = lazy(() => import('../pages/techportal/TechPortal'));
const TechDashboard         = lazy(() => import('../pages/techportal/pages/TechDashboard'));
const BiometricDevicesPage  = lazy(() => import('../pages/techportal/pages/BiometricDevicesPage'));
const SyncLogsPage          = lazy(() => import('../pages/techportal/pages/SyncLogsPage'));
const SystemHealthPage      = lazy(() => import('../pages/techportal/pages/SystemHealthPage'));
const AttendanceAnalytics   = lazy(() => import('../pages/techportal/pages/AttendanceAnalytics'));
const SecurityEventsPage    = lazy(() => import('../pages/techportal/pages/SecurityEventsPage'));
const TechSettingsPage      = lazy(() => import('../pages/techportal/pages/TechSettingsPage'));
const TechAuditTrailPage    = lazy(() => import('../pages/techportal/pages/AuditTrailPage'));
const TechErrorLogsPage     = lazy(() => import('../pages/techportal/pages/ErrorLogsPage'));
const TechIntegrationsPage  = lazy(() => import('../pages/techportal/pages/IntegrationsPage'));
const TechDataExportsPage   = lazy(() => import('../pages/techportal/pages/DataExportsPage'));
const MarketingPortal       = lazy(() => import('../pages/marketingportal/MarketingPortal'));
// بوابة CRM
const CrmPortal             = lazy(() => import('../pages/crmportal/CrmPortal'));
const CrmDashboard          = lazy(() => import('../pages/crmportal/CrmDashboard'));
// بوابة المشتريات — Wave1: الموردون + طلبات الشراء (هيكل مجلدي مثل CRM)
const ProcurementDashboard      = lazy(() => import('../pages/app/procurement/ProcurementDashboard'));
const ProcFoundationDashboard   = lazy(() => import('../pages/app/procurement/foundation/FoundationDashboardPage'));
const ProcSpendCategoriesPage   = lazy(() => import('../pages/app/procurement/foundation/SpendCategoriesPage'));
const ProcApprovalRulesPage     = lazy(() => import('../pages/app/procurement/foundation/ApprovalRulesPage'));
const ProcPoliciesPage          = lazy(() => import('../pages/app/procurement/foundation/ProcurementPoliciesPage'));
const ProcAuditPage             = lazy(() => import('../pages/app/procurement/foundation/ProcurementAuditPage'));
const ProcIntegrationHealthPage = lazy(() => import('../pages/app/procurement/foundation/IntegrationHealthPage'));
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


// ─── Lazy: MRP / Manufacturing Portal ───────────────────────────────────────
const MrpDashboardPage = lazy(() => import('../pages/app/mrp/Dashboard'));
const MrpFoundationDashboardPage = lazy(() => import('../pages/app/mrp/foundation/Dashboard'));
const MrpPlantsPage = lazy(() => import('../pages/app/mrp/foundation/PlantsPage'));
const MrpAreasPage = lazy(() => import('../pages/app/mrp/foundation/AreasPage'));
const MrpLinesPage = lazy(() => import('../pages/app/mrp/foundation/LinesPage'));
const MrpWorkCentersPage = lazy(() => import('../pages/app/mrp/foundation/WorkCentersPage'));
const MrpResourcesPage = lazy(() => import('../pages/app/mrp/foundation/ResourcesPage'));
const MrpAssetsPage = lazy(() => import('../pages/app/mrp/foundation/AssetsPage'));
const MrpCalendarsPage = lazy(() => import('../pages/app/mrp/foundation/CalendarsPage'));
const MrpShiftsPage = lazy(() => import('../pages/app/mrp/foundation/ShiftsPage'));
const MrpCapacityPage = lazy(() => import('../pages/app/mrp/foundation/CapacityPage'));
const MrpOperationsPage = lazy(() => import('../pages/app/mrp/foundation/OperationsPage'));
const MrpRoutingsPage = lazy(() => import('../pages/app/mrp/foundation/RoutingsPage'));
const MrpNumberingPage = lazy(() => import('../pages/app/mrp/foundation/NumberingPage'));
const MrpAuditPage = lazy(() => import('../pages/app/mrp/foundation/AuditPage'));






const MrpQualityDashboardPage = lazy(() => import('../pages/app/mrp/quality/QualityDashboard'));
const MrpQualityPlansPage = lazy(() => import('../pages/app/mrp/quality/QualityPlansPage'));
const MrpQualityChecklistsPage = lazy(() => import('../pages/app/mrp/quality/QualityChecklistsPage'));
const MrpQualityInspectionsPage = lazy(() => import('../pages/app/mrp/quality/QualityInspectionsPage'));
const MrpAqlPage = lazy(() => import('../pages/app/mrp/quality/AqlPage'));
const MrpNcrPage = lazy(() => import('../pages/app/mrp/quality/NcrPage'));
const MrpCapaPage = lazy(() => import('../pages/app/mrp/quality/CapaPage'));
const MrpCalibrationPage = lazy(() => import('../pages/app/mrp/quality/CalibrationPage'));
const MrpSpcPage = lazy(() => import('../pages/app/mrp/quality/SpcPage'));
const MrpQualityQuarantinePage = lazy(() => import('../pages/app/mrp/quality/QualityQuarantinePage'));
const MrpQualityReportsPage = lazy(() => import('../pages/app/mrp/quality/QualityReportsPage'));
const MrpShopFloorDashboardPage = lazy(() => import('../pages/app/mrp/shopfloor/Dashboard'));
const MrpShopFloorWorkstationsPage = lazy(() => import('../pages/app/mrp/shopfloor/WorkstationsPage'));
const MrpShopFloorTerminalsPage = lazy(() => import('../pages/app/mrp/shopfloor/TerminalsPage'));
const MrpProductionTrackingPage = lazy(() => import('../pages/app/mrp/shopfloor/ProductionTrackingPage'));
const MrpShopFloorConsumptionPage = lazy(() => import('../pages/app/mrp/shopfloor/ConsumptionPage'));
const MrpOeePage = lazy(() => import('../pages/app/mrp/shopfloor/OeePage'));
const MrpDowntimePage = lazy(() => import('../pages/app/mrp/shopfloor/DowntimePage'));
const MrpDowntimeParetoPage = lazy(() => import('../pages/app/mrp/shopfloor/DowntimeParetoPage'));
const MrpWorkOrderProgressPage = lazy(() => import('../pages/app/mrp/shopfloor/WorkOrderProgressPage'));
const MrpLaborShiftPage = lazy(() => import('../pages/app/mrp/shopfloor/LaborShiftPage'));
const MrpAndonPage = lazy(() => import('../pages/app/mrp/shopfloor/AndonPage'));
const MrpSupervisorShopFloorPage = lazy(() => import('../pages/app/mrp/shopfloor/SupervisorDashboardPage'));
const MrpProductionManagerPage = lazy(() => import('../pages/app/mrp/shopfloor/ProductionManagerDashboardPage'));
const MrpMaintenanceBridgePage = lazy(() => import('../pages/app/mrp/shopfloor/MaintenanceBridgePage'));
const MrpShopFloorReportsPage = lazy(() => import('../pages/app/mrp/shopfloor/ShopFloorReportsPage'));
const MrpMaintenanceDashboardPage = lazy(() => import('../pages/app/mrp/maintenance/Dashboard'));
const MrpMaintenanceAssetsPage = lazy(() => import('../pages/app/mrp/maintenance/AssetsPage'));
const MrpMaintenanceCriticalityPage = lazy(() => import('../pages/app/mrp/maintenance/CriticalityPage'));
const MrpPmPlansPage = lazy(() => import('../pages/app/mrp/maintenance/PmPlansPage'));
const MrpPmCalendarPage = lazy(() => import('../pages/app/mrp/maintenance/PmCalendarPage'));
const MrpMaintenanceWorkOrdersPage = lazy(() => import('../pages/app/mrp/maintenance/MaintenanceWorkOrdersPage'));
const MrpMaintenanceSparePartsPage = lazy(() => import('../pages/app/mrp/maintenance/SparePartsPage'));
const MrpConditionMonitoringPage = lazy(() => import('../pages/app/mrp/maintenance/ConditionMonitoringPage'));
const MrpMaintenanceBreakdownsPage = lazy(() => import('../pages/app/mrp/maintenance/BreakdownsPage'));
const MrpAnnualShutdownsPage = lazy(() => import('../pages/app/mrp/maintenance/AnnualShutdownsPage'));
const MrpMaintenanceReportsPage = lazy(() => import('../pages/app/mrp/maintenance/MaintenanceReportsPage'));
const MrpCostingDashboardPage = lazy(() => import('../pages/app/mrp/costing/Dashboard'));
const MrpCostElementsPage = lazy(() => import('../pages/app/mrp/costing/CostElementsPage'));
const MrpCostingProfilesPage = lazy(() => import('../pages/app/mrp/costing/CostingProfilesPage'));
const MrpStandardCostsPage = lazy(() => import('../pages/app/mrp/costing/StandardCostsPage'));
const MrpCostRollupPage = lazy(() => import('../pages/app/mrp/costing/CostRollupPage'));
const MrpWorkOrderCostsPage = lazy(() => import('../pages/app/mrp/costing/WorkOrderCostsPage'));
const MrpCostVariancesPage = lazy(() => import('../pages/app/mrp/costing/CostVariancesPage'));
const MrpWipValuationPage = lazy(() => import('../pages/app/mrp/costing/WipValuationPage'));
const MrpFinishedGoodsValuationPage = lazy(() => import('../pages/app/mrp/costing/FinishedGoodsValuationPage'));
const MrpCostPostingsPage = lazy(() => import('../pages/app/mrp/costing/CostPostingsPage'));
const MrpCostingReportsPage = lazy(() => import('../pages/app/mrp/costing/CostingReportsPage'));
const MrpAnalyticsDashboardPage = lazy(() => import('../pages/app/mrp/analytics/Dashboard'));
const MrpAnalyticsExecutivePage = lazy(() => import('../pages/app/mrp/analytics/ExecutivePage'));
const MrpAnalyticsOperationsPage = lazy(() => import('../pages/app/mrp/analytics/OperationsPage'));
const MrpAnalyticsKpiScorecardPage = lazy(() => import('../pages/app/mrp/analytics/KpiScorecardPage'));
const MrpAnalyticsOeeTrendsPage = lazy(() => import('../pages/app/mrp/analytics/OeeTrendsPage'));
const MrpAnalyticsSchedulePage = lazy(() => import('../pages/app/mrp/analytics/SchedulePage'));
const MrpAnalyticsBottlenecksPage = lazy(() => import('../pages/app/mrp/analytics/BottlenecksPage'));
const MrpAnalyticsQualityCostPage = lazy(() => import('../pages/app/mrp/analytics/QualityCostPage'));
const MrpAnalyticsCostVariancePage = lazy(() => import('../pages/app/mrp/analytics/CostVariancePage'));
const MrpAnalyticsMaintenanceReliabilityPage = lazy(() => import('../pages/app/mrp/analytics/MaintenanceReliabilityPage'));
const MrpAnalyticsAlertsPage = lazy(() => import('../pages/app/mrp/analytics/AnalyticsAlertsPage'));
const MrpAnalyticsRootCausePage = lazy(() => import('../pages/app/mrp/analytics/RootCausePage'));
const MrpAnalyticsReportsPage = lazy(() => import('../pages/app/mrp/analytics/AnalyticsReportsPage'));
const MrpAnalyticsExportsPage = lazy(() => import('../pages/app/mrp/analytics/AnalyticsExportsPage'));
const MrpAnalyticsKpiTargetsPage = lazy(() => import('../pages/app/mrp/analytics/KpiTargetsPage'));
const MrpProcurementDashboardPage = lazy(() => import('../pages/app/mrp/procurement/ProcurementDashboard'));
const MrpRecommendationsPage = lazy(() => import('../pages/app/mrp/procurement/RecommendationsPage'));
const MrpPrStatusPage = lazy(() => import('../pages/app/mrp/procurement/PrStatusPage'));
const MrpRfqTcoPage = lazy(() => import('../pages/app/mrp/procurement/RfqTcoPage'));
const MrpPoStatusPage = lazy(() => import('../pages/app/mrp/procurement/PoStatusPage'));
const MrpGrStatusPage = lazy(() => import('../pages/app/mrp/procurement/GrStatusPage'));
const MrpInvoiceMatchPage = lazy(() => import('../pages/app/mrp/procurement/InvoiceMatchPage'));
const MrpSupplierScorecardPage = lazy(() => import('../pages/app/mrp/procurement/SupplierScorecardPage'));
const MrpContractAlertsPage = lazy(() => import('../pages/app/mrp/procurement/ContractAlertsPage'));
const MrpProcurementAlertsPage = lazy(() => import('../pages/app/mrp/procurement/ProcurementAlertsPage'));
const MrpProcurementReportsPage = lazy(() => import('../pages/app/mrp/procurement/ProcurementReportsPage'));
const MrpInventoryDashboardPage = lazy(() => import('../pages/app/mrp/inventory/InventoryDashboard'));
const MrpRawMaterialsPage = lazy(() => import('../pages/app/mrp/inventory/RawMaterialsPage'));
const MrpWipPage = lazy(() => import('../pages/app/mrp/inventory/WipPage'));
const MrpFinishedGoodsPage = lazy(() => import('../pages/app/mrp/inventory/FinishedGoodsPage'));
const MrpValuationPage = lazy(() => import('../pages/app/mrp/inventory/ValuationPage'));
const MrpLotsTraceabilityPage = lazy(() => import('../pages/app/mrp/inventory/LotsTraceabilityPage'));
const MrpSafetyStockPage = lazy(() => import('../pages/app/mrp/inventory/SafetyStockPage'));
const MrpMaterialIssuesPage = lazy(() => import('../pages/app/mrp/inventory/MaterialIssuesPage'));
const MrpReconciliationPage = lazy(() => import('../pages/app/mrp/inventory/ReconciliationPage'));
const MrpInventoryReportsPage = lazy(() => import('../pages/app/mrp/inventory/InventoryReportsPage'));
const MrpPlanningDashboardPage = lazy(() => import('../pages/app/mrp/planning/PlanningDashboard'));
const MrpRunsPage = lazy(() => import('../pages/app/mrp/planning/MrpRunsPage'));
const MrpPlannedOrdersPage = lazy(() => import('../pages/app/mrp/planning/PlannedOrdersPage'));
const MrpWorkOrdersPage = lazy(() => import('../pages/app/mrp/planning/WorkOrdersPage'));
const MrpWorkOrderMaterialsPage = lazy(() => import('../pages/app/mrp/planning/WorkOrderMaterialsPage'));
const MrpWorkOrderOperationsPage = lazy(() => import('../pages/app/mrp/planning/WorkOrderOperationsPage'));
const MrpProductionSchedulingPage = lazy(() => import('../pages/app/mrp/planning/ProductionSchedulingPage'));
const MrpDispatchPage = lazy(() => import('../pages/app/mrp/planning/DispatchPage'));
const MrpWorkOrderAlertsPage = lazy(() => import('../pages/app/mrp/planning/WorkOrderAlertsPage'));
const MrpPlanningReportsPage = lazy(() => import('../pages/app/mrp/planning/PlanningReportsPage'));
const MrpForecastingDashboardPage = lazy(() => import('../pages/app/mrp/forecasting/ForecastingDashboard'));
const MrpDemandHistoryPage = lazy(() => import('../pages/app/mrp/forecasting/DemandHistoryPage'));
const MrpForecastModelsPage = lazy(() => import('../pages/app/mrp/forecasting/ForecastModelsPage'));
const MrpForecastRunsPage = lazy(() => import('../pages/app/mrp/forecasting/ForecastRunsPage'));
const MrpForecastAccuracyPage = lazy(() => import('../pages/app/mrp/forecasting/ForecastAccuracyPage'));
const MrpPlanningPoliciesPage = lazy(() => import('../pages/app/mrp/forecasting/PlanningPoliciesPage'));
const MrpMpsDashboardPage = lazy(() => import('../pages/app/mrp/mps/MpsDashboard'));
const MrpMpsBoardPage = lazy(() => import('../pages/app/mrp/mps/MpsBoardPage'));
const MrpMpsPlansPage = lazy(() => import('../pages/app/mrp/mps/MpsPlansPage'));
const MrpMpsLinesPage = lazy(() => import('../pages/app/mrp/mps/MpsLinesPage'));
const MrpRccpPage = lazy(() => import('../pages/app/mrp/mps/RccpPage'));
const MrpMpsAlertsPage = lazy(() => import('../pages/app/mrp/mps/MpsAlertsPage'));
const MrpMpsReportsPage = lazy(() => import('../pages/app/mrp/mps/MpsReportsPage'));
const MrpBomDashboardPage = lazy(() => import('../pages/app/mrp/bom/BomDashboard'));
const MrpBomBuilderPage = lazy(() => import('../pages/app/mrp/bom/BomBuilderPage'));
const MrpBomHeadersPage = lazy(() => import('../pages/app/mrp/bom/BomHeadersPage'));
const MrpBomVersionsPage = lazy(() => import('../pages/app/mrp/bom/BomVersionsPage'));
const MrpBomLinesPage = lazy(() => import('../pages/app/mrp/bom/BomLinesPage'));
const MrpBomExplosionPage = lazy(() => import('../pages/app/mrp/bom/BomExplosionPage'));
const MrpBomAvailabilityPage = lazy(() => import('../pages/app/mrp/bom/BomAvailabilityPage'));
const MrpEcrPage = lazy(() => import('../pages/app/mrp/bom/EcrPage'));
const MrpEcoPage = lazy(() => import('../pages/app/mrp/bom/EcoPage'));
const MrpBomImportExportPage = lazy(() => import('../pages/app/mrp/bom/BomImportExportPage'));
const MrpBomReportsPage = lazy(() => import('../pages/app/mrp/bom/BomReportsPage'));
const MrpIntegrationsPage = lazy(() => import('../pages/app/mrp/foundation/IntegrationsPage'));

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

/**
 * معالج المسارات القديمة `?view=xxx`.
 *
 * ⚠️ **طبقة مهجورة — قيد الإيقاف التدريجي (0329).**
 *
 * لا يولّد أي كود داخلي `?view=` (فُحص: صفر موضع في `src`، وصفر دالة
 * في القاعدة تكتبه في `action_url`). وجودها لخدمة الروابط الخارجية
 * القديمة وحدها: إشارات مرجعية وروابط بريد وإشعارات مُخزَّنة قبل
 * الهجرة إلى `react-router-dom`.
 *
 * ★ يُسجّل كل استعمال فعلي ليصبح الحذف قراراً مبنيّاً على قياس:
 *   `legacy_route_summary()` تُخبر متى يُؤمَن حذف هذه الطبقة.
 *   القياس **لا يُؤخّر التوجيه**: يُطلق دون انتظار.
 */
function LegacyViewHandler({ children }: { children: React.ReactNode }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const view = params.get('view');

  useEffect(() => {
    if (!view) return;
    const target = legacyViewToPath(view);

    // القياس أولاً لكن دون await: التوجيه لا ينتظر الشبكة
    void legacyRouteService.recordHit(view, target);

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
            صلاحية "نشر بلاغ" تبقى محكومة داخل MyProblemsPage (permKey new-problem).
          */}
          <Route path="employee/profile" element={<ProfilePage />} />
          <Route path="employee/problems" element={<MyProblemsPage />} />
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
              {/* الوحدة 00 — الأساس ولوحة التحكم */}
              <Route path="foundation" element={<ProcFoundationDashboard />} />
              <Route path="foundation/categories" element={<ProcSpendCategoriesPage />} />
              <Route path="foundation/approval-rules" element={<ProcApprovalRulesPage />} />
              <Route path="foundation/policies" element={<ProcPoliciesPage />} />
              <Route path="foundation/audit" element={<ProcAuditPage />} />
              <Route path="foundation/integration" element={<ProcIntegrationHealthPage />} />
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


          {/* MRP / Manufacturing Portal — بوابة التصنيع */}
          <Route path="mrp" element={<RequireRole roles={['manufacturing', 'admin', 'developer', 'manager']} />}>
            <Route element={<RequireModule moduleKey="mrp" />}>
              <Route index element={<MrpDashboardPage />} />
              <Route path="dashboard" element={<MrpDashboardPage />} />
              <Route path="foundation" element={<MrpFoundationDashboardPage />} />
              <Route path="foundation/plants" element={<MrpPlantsPage />} />
              <Route path="foundation/areas" element={<MrpAreasPage />} />
              <Route path="foundation/lines" element={<MrpLinesPage />} />
              <Route path="foundation/work-centers" element={<MrpWorkCentersPage />} />
              <Route path="foundation/resources" element={<MrpResourcesPage />} />
              <Route path="foundation/assets" element={<MrpAssetsPage />} />
              <Route path="foundation/calendars" element={<MrpCalendarsPage />} />
              <Route path="foundation/shifts" element={<MrpShiftsPage />} />
              <Route path="foundation/capacity" element={<MrpCapacityPage />} />
              <Route path="foundation/operations" element={<MrpOperationsPage />} />
              <Route path="foundation/routings" element={<MrpRoutingsPage />} />
              <Route path="foundation/numbering" element={<MrpNumberingPage />} />
              <Route path="foundation/audit" element={<MrpAuditPage />} />
              <Route path="foundation/integrations" element={<MrpIntegrationsPage />} />

              <Route path="bom" element={<MrpBomDashboardPage />} />
              <Route path="bom/builder" element={<MrpBomBuilderPage />} />
              <Route path="bom/headers" element={<MrpBomHeadersPage />} />
              <Route path="bom/versions" element={<MrpBomVersionsPage />} />
              <Route path="bom/lines" element={<MrpBomLinesPage />} />
              <Route path="bom/explosion" element={<MrpBomExplosionPage />} />
              <Route path="bom/availability" element={<MrpBomAvailabilityPage />} />
              <Route path="bom/ecr" element={<MrpEcrPage />} />
              <Route path="bom/eco" element={<MrpEcoPage />} />
              <Route path="bom/import-export" element={<MrpBomImportExportPage />} />
              <Route path="bom/reports" element={<MrpBomReportsPage />} />

              <Route path="forecasting" element={<MrpForecastingDashboardPage />} />
              <Route path="forecasting/history" element={<MrpDemandHistoryPage />} />
              <Route path="forecasting/models" element={<MrpForecastModelsPage />} />
              <Route path="forecasting/runs" element={<MrpForecastRunsPage />} />
              <Route path="forecasting/accuracy" element={<MrpForecastAccuracyPage />} />
              <Route path="forecasting/policies" element={<MrpPlanningPoliciesPage />} />
              <Route path="mps" element={<MrpMpsDashboardPage />} />
              <Route path="mps/board" element={<MrpMpsBoardPage />} />
              <Route path="mps/plans" element={<MrpMpsPlansPage />} />
              <Route path="mps/lines" element={<MrpMpsLinesPage />} />
              <Route path="mps/rccp" element={<MrpRccpPage />} />
              <Route path="mps/alerts" element={<MrpMpsAlertsPage />} />
              <Route path="mps/reports" element={<MrpMpsReportsPage />} />

              <Route path="planning" element={<MrpPlanningDashboardPage />} />
              <Route path="planning/mrp-runs" element={<MrpRunsPage />} />
              <Route path="planning/proposals" element={<MrpPlannedOrdersPage />} />
              <Route path="planning/work-orders" element={<MrpWorkOrdersPage />} />
              <Route path="planning/materials" element={<MrpWorkOrderMaterialsPage />} />
              <Route path="planning/operations" element={<MrpWorkOrderOperationsPage />} />
              <Route path="planning/scheduling" element={<MrpProductionSchedulingPage />} />
              <Route path="planning/dispatch" element={<MrpDispatchPage />} />
              <Route path="planning/alerts" element={<MrpWorkOrderAlertsPage />} />
              <Route path="planning/reports" element={<MrpPlanningReportsPage />} />

              <Route path="inventory" element={<MrpInventoryDashboardPage />} />
              <Route path="inventory/raw-materials" element={<MrpRawMaterialsPage />} />
              <Route path="inventory/wip" element={<MrpWipPage />} />
              <Route path="inventory/finished-goods" element={<MrpFinishedGoodsPage />} />
              <Route path="inventory/valuation" element={<MrpValuationPage />} />
              <Route path="inventory/lots-traceability" element={<MrpLotsTraceabilityPage />} />
              <Route path="inventory/safety-stock" element={<MrpSafetyStockPage />} />
              <Route path="inventory/material-issues" element={<MrpMaterialIssuesPage />} />
              <Route path="inventory/reconciliation" element={<MrpReconciliationPage />} />
              <Route path="inventory/reports" element={<MrpInventoryReportsPage />} />

              <Route path="procurement" element={<MrpProcurementDashboardPage />} />
              <Route path="procurement/recommendations" element={<MrpRecommendationsPage />} />
              <Route path="procurement/pr" element={<MrpPrStatusPage />} />
              <Route path="procurement/rfq" element={<MrpRfqTcoPage />} />
              <Route path="procurement/po" element={<MrpPoStatusPage />} />
              <Route path="procurement/gr" element={<MrpGrStatusPage />} />
              <Route path="procurement/invoices" element={<MrpInvoiceMatchPage />} />
              <Route path="procurement/suppliers" element={<MrpSupplierScorecardPage />} />
              <Route path="procurement/contracts" element={<MrpContractAlertsPage />} />
              <Route path="procurement/alerts" element={<MrpProcurementAlertsPage />} />
              <Route path="procurement/reports" element={<MrpProcurementReportsPage />} />

              <Route path="quality" element={<MrpQualityDashboardPage />} />
              <Route path="quality/plans" element={<MrpQualityPlansPage />} />
              <Route path="quality/checklists" element={<MrpQualityChecklistsPage />} />
              <Route path="quality/inspections" element={<MrpQualityInspectionsPage />} />
              <Route path="quality/aql" element={<MrpAqlPage />} />
              <Route path="quality/ncr" element={<MrpNcrPage />} />
              <Route path="quality/capa" element={<MrpCapaPage />} />
              <Route path="quality/calibration" element={<MrpCalibrationPage />} />
              <Route path="quality/spc" element={<MrpSpcPage />} />
              <Route path="quality/quarantine" element={<MrpQualityQuarantinePage />} />
              <Route path="quality/reports" element={<MrpQualityReportsPage />} />

              <Route path="shopfloor" element={<MrpShopFloorDashboardPage />} />
              <Route path="shopfloor/workstations" element={<MrpShopFloorWorkstationsPage />} />
              <Route path="shopfloor/terminals" element={<MrpShopFloorTerminalsPage />} />
              <Route path="shopfloor/tracking" element={<MrpProductionTrackingPage />} />
              <Route path="shopfloor/consumption" element={<MrpShopFloorConsumptionPage />} />
              <Route path="shopfloor/oee" element={<MrpOeePage />} />
              <Route path="shopfloor/downtime" element={<MrpDowntimePage />} />
              <Route path="shopfloor/pareto" element={<MrpDowntimeParetoPage />} />
              <Route path="shopfloor/work-order-progress" element={<MrpWorkOrderProgressPage />} />
              <Route path="shopfloor/labor-shifts" element={<MrpLaborShiftPage />} />
              <Route path="shopfloor/andon" element={<MrpAndonPage />} />
              <Route path="shopfloor/supervisor" element={<MrpSupervisorShopFloorPage />} />
              <Route path="shopfloor/manager" element={<MrpProductionManagerPage />} />
              <Route path="shopfloor/maintenance" element={<MrpMaintenanceBridgePage />} />
              <Route path="shopfloor/reports" element={<MrpShopFloorReportsPage />} />

              <Route path="maintenance" element={<MrpMaintenanceDashboardPage />} />
              <Route path="maintenance/assets" element={<MrpMaintenanceAssetsPage />} />
              <Route path="maintenance/criticality" element={<MrpMaintenanceCriticalityPage />} />
              <Route path="maintenance/pm-plans" element={<MrpPmPlansPage />} />
              <Route path="maintenance/pm-calendar" element={<MrpPmCalendarPage />} />
              <Route path="maintenance/work-orders" element={<MrpMaintenanceWorkOrdersPage />} />
              <Route path="maintenance/spare-parts" element={<MrpMaintenanceSparePartsPage />} />
              <Route path="maintenance/condition" element={<MrpConditionMonitoringPage />} />
              <Route path="maintenance/breakdowns" element={<MrpMaintenanceBreakdownsPage />} />
              <Route path="maintenance/shutdowns" element={<MrpAnnualShutdownsPage />} />
              <Route path="maintenance/reports" element={<MrpMaintenanceReportsPage />} />

              <Route path="costing" element={<MrpCostingDashboardPage />} />
              <Route path="costing/cost-elements" element={<MrpCostElementsPage />} />
              <Route path="costing/profiles" element={<MrpCostingProfilesPage />} />
              <Route path="costing/standard-costs" element={<MrpStandardCostsPage />} />
              <Route path="costing/rollup" element={<MrpCostRollupPage />} />
              <Route path="costing/work-order-costs" element={<MrpWorkOrderCostsPage />} />
              <Route path="costing/variances" element={<MrpCostVariancesPage />} />
              <Route path="costing/wip" element={<MrpWipValuationPage />} />
              <Route path="costing/finished-goods" element={<MrpFinishedGoodsValuationPage />} />
              <Route path="costing/postings" element={<MrpCostPostingsPage />} />
              <Route path="costing/reports" element={<MrpCostingReportsPage />} />

              <Route path="analytics" element={<MrpAnalyticsDashboardPage />} />
              <Route path="analytics/executive" element={<MrpAnalyticsExecutivePage />} />
              <Route path="analytics/operations" element={<MrpAnalyticsOperationsPage />} />
              <Route path="analytics/scorecard" element={<MrpAnalyticsKpiScorecardPage />} />
              <Route path="analytics/oee" element={<MrpAnalyticsOeeTrendsPage />} />
              <Route path="analytics/schedule" element={<MrpAnalyticsSchedulePage />} />
              <Route path="analytics/bottlenecks" element={<MrpAnalyticsBottlenecksPage />} />
              <Route path="analytics/quality-cost" element={<MrpAnalyticsQualityCostPage />} />
              <Route path="analytics/cost-variance" element={<MrpAnalyticsCostVariancePage />} />
              <Route path="analytics/maintenance" element={<MrpAnalyticsMaintenanceReliabilityPage />} />
              <Route path="analytics/alerts" element={<MrpAnalyticsAlertsPage />} />
              <Route path="analytics/root-cause" element={<MrpAnalyticsRootCausePage />} />
              <Route path="analytics/reports" element={<MrpAnalyticsReportsPage />} />
              <Route path="analytics/exports" element={<MrpAnalyticsExportsPage />} />
              <Route path="analytics/kpi-targets" element={<MrpAnalyticsKpiTargetsPage />} />
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
              <Route path="audit-trail" element={<TechAuditTrailPage />} />
              <Route path="error-logs" element={<TechErrorLogsPage />} />
              <Route path="integrations" element={<TechIntegrationsPage />} />
              <Route path="data-exports" element={<TechDataExportsPage />} />
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

            {/* وحدات بوابة المدير (0302/0303).
                معمارية Scoped Roles: بدل دور جديد لكل بوابة، المدير يحمل
                دور manager ووحدات مُسنَدة بنطاق. كل وحدة تعرض منظور فريقه
                لا نسخة من البوابة الأصلية. */}
            <Route
              path="units/movement"
              element={<RequirePortalUnit baseRole="manager" unitKey="movement" />}
            >
              <Route path="approvals" element={<ManagerMovementApprovalsPage />} />
              <Route path="team" element={<ManagerMovementTeamPage />} />
            </Route>

            {/* الوحدات الثماني الأخرى — صفحة واحدة ديناميكية.
                المحرك الموحّد (0305) يخدمها كلها؛ الاختلاف معامل لا صفحة. */}
            <Route path="units/:unitKey" element={<RequireDynamicPortalUnit baseRole="manager" />}>
              <Route path="approvals" element={<UnitApprovalsPage baseRole="manager" />} />
            </Route>

            {/* ★★★ 0339: 'manager-leave-requests' في VIEW_TO_PATH كان يوجّه
                إلى /app/employee/leave-requests، والصفحة تفحص
                startsWith('/app/manager/') لتمنح صلاحية اعتماد ⇒ الفرع لم
                يُنفَّذ قط. المسار يُسجَّل الآن، والصلاحية من السلسلة. */}
            <Route path="leave-requests" element={<LeaveRequestPage />} />
          </Route>

          {/* Supervisor */}
          <Route path="supervisor" element={<RequireRole roles={['supervisor', 'manager', 'hr', 'admin']} />}>
            <Route index element={<SupervisorDashboard />} />
            <Route path="breaks" element={<SupervisorBreaksPage />} />
            <Route path="shift" element={<SupervisorShiftPage />} />
            <Route path="tasks" element={<SupervisorTasksPage />} />
            <Route path="checklists" element={<SupervisorChecklistsPage />} />

            {/* وحدات بوابة المشرف (0307) — أضيق من المدير: متابعة بلا اعتماد */}
            <Route
              path="units/movement"
              element={<RequirePortalUnit baseRole="supervisor" unitKey="movement" />}
            >
              <Route path="shift" element={<SupervisorMovementShiftPage />} />
            </Route>

            <Route path="units/:unitKey" element={<RequireDynamicPortalUnit baseRole="supervisor" />}>
              <Route path="approvals" element={<UnitApprovalsPage baseRole="supervisor" />} />
            </Route>

            {/* ★★★ 0339: كان VIEW_TO_PATH يوجّه المشرف إلى مسار غير مسجَّل
                إطلاقاً، والصفحة تفحص startsWith('/app/supervisor/') لتمنح
                صلاحية اعتماد. الصفحة الآن تستمدّ الصلاحية من السلسلة، لكن
                المسار يُسجَّل ليعمل عنصر التنقّل. */}
            <Route path="leave-requests" element={<LeaveRequestPage />} />
          </Route>

          {/* HR */}
          <Route path="hr" element={<RequireRole roles={['hr', 'admin']} />}>
            <Route index element={<HRDashboard />} />
            <Route path="problems" element={<HrProblemsInboxPage />} />
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
            <Route path="approval-rules" element={<ApprovalRulesAdminPage />} />
            <Route path="mrp-roles" element={<MrpRolesAdminPage />} />
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

          {/* Movement & Logistics Portal — بوابة الحركة واللوجستيات */}
          <Route path="movement" element={<RequireRole roles={['employee_movement', 'logistics', 'movement_manager', 'gatekeeper', 'admin', 'developer', 'hr']} />}>
            <Route element={<RequireModule moduleKey="movement" />}>
              {/* التحويل حسب دور المستخدم — لا وجهة ثابتة */}
              <Route index element={<MovementRoleRedirect />} />
              {/* الدور «أ» — حركة الموظفين: لا يراه صاحب دور اللوجستيات */}
              <Route element={<RequireMovementRole role="employee_movement" />}>
              <Route path="employee/policies" element={<EmployeeMovementPoliciesPage />} />
              <Route path="employee/locations" element={<EmployeeMovementLocationsPage />} />
              <Route path="employee/permits" element={<EmployeeMovementPermitsPage />} />
              <Route path="employee/permits/new" element={<EmployeeMovementNewPermitPage />} />
              <Route path="employee/permits/:id" element={<EmployeeMovementPermitDetailPage />} />
              <Route path="employee/permits/approvals" element={<EmployeeMovementApprovalsPage />} />
              <Route path="employee/permits/templates" element={<EmployeeMovementTemplatesPage />} />
              <Route path="employee/execution" element={<EmployeeMovementGateExecutionPage />} />
              <Route path="employee/field-visits" element={<EmployeeFieldVisitsPage />} />
              <Route path="employee/missions" element={<EmployeeMissionsPage />} />
              <Route path="employee/compliance" element={<EmployeeComplianceViolationsPage />} />
              <Route path="employee/analytics" element={<EmployeeMovementAnalyticsPage />} />
              </Route>

              {/* الدور «ب» — الحركة واللوجستيات: لا يراه صاحب دور حركة الموظفين */}
              <Route element={<RequireMovementRole role="logistics" />}>
              <Route path="logistics/dashboard" element={<LogisticsDashboardPage />} />
              <Route path="logistics/foundation" element={<LogisticsFoundationPage />} />
              <Route path="logistics/fleet" element={<LogisticsVehiclesPage />} />
              <Route path="logistics/drivers" element={<LogisticsDriversPage />} />
              <Route path="logistics/maintenance" element={<LogisticsMaintenancePage />} />
              <Route path="logistics/orders" element={<LogisticsShipmentOrdersPage />} />
              <Route path="logistics/dispatch" element={<LogisticsDispatchPage />} />
              <Route path="logistics/routes" element={<LogisticsRoutePlanningPage />} />
              <Route path="logistics/tracking" element={<LogisticsLiveTrackingPage />} />
              <Route path="logistics/track-replay" element={<LogisticsTrackReplayPage />} />
              <Route path="logistics/safety" element={<LogisticsSafetyCompliancePage />} />
              <Route path="logistics/epod" element={<LogisticsEpodPage />} />
              <Route path="logistics/fuel" element={<LogisticsFuelPage />} />
              <Route path="logistics/carriers" element={<LogisticsCarriersPage />} />
              <Route path="logistics/costs" element={<LogisticsCostAnalyticsPage />} />
              </Route>

              {/* تطبيق السائق — حارس مستقل.
                  كانت هذه الصفحات تحت RequireMovementRole role="logistics"،
                  أي أن السائق يحتاج دور مدير الأسطول ليرى رحلاته (تصعيد
                  امتياز). السائق يُعرَّف بـ logistics_drivers.user_id لا
                  بدور بوابة — تماماً كما في movement_require_driver (0291). */}
              <Route element={<RequireDriver />}>
              <Route path="driver/trips" element={<DriverTripsPage />} />
              <Route path="driver/delivery/:dispatchId" element={<DriverDeliveryPage />} />
              <Route path="driver/inspection/:dispatchId" element={<DriverInspectionPage />} />
              </Route>
            </Route>
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
              <Route path="foundation" element={<FinanceFoundationDashboardPage />} />
              <Route path="setup" element={<FinanceSetupPage />} />
              <Route path="multi-entity" element={<MultiEntityPage />} />
              <Route path="entity-memberships" element={<EntityMembershipsPage />} />
              <Route path="cost-centers" element={<CostCentersPage />} />
              <Route path="projects" element={<FinanceProjectsPage />} />
              <Route path="exchange-rates" element={<ExchangeRatesPage />} />
              <Route path="system-notes" element={<SystemNotesPage />} />
              <Route path="cash-management" element={<CashManagementPage />} />
              <Route path="bank-statement-import" element={<BankStatementImportPage />} />
              <Route path="cash-forecast" element={<CashForecastPage />} />
              <Route path="tax-management" element={<TaxManagementPage />} />
              <Route path="budget" element={<BudgetPage />} />
              <Route path="budget-variance" element={<AdvancedVariancePage />} />
              <Route path="fixed-assets" element={<FixedAssetsPage />} />
              <Route path="revenue-recognition" element={<RevenueRecognitionPage />} />
              <Route path="intercompany" element={<IntercompanyPage />} />
              <Route path="project-accounting" element={<ProjectAccountingPage />} />
              <Route path="integrations" element={<FinanceIntegrationsPage />} />
              <Route path="accounting-periods" element={<AccountingPeriodsPage />} />
              <Route path="general-ledger" element={<GeneralLedgerPage />} />
              <Route path="reports" element={<FinancialReportsPage />} />
              <Route path="vendors" element={<VendorsPage />} />
              <Route path="accounts-payable" element={<AccountsPayablePage />} />
              <Route path="accounts-receivable" element={<AccountsReceivablePage />} />
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
