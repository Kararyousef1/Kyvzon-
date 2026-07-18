/**
 * ════════════════════════════════════════════════════════════════
 *  SDK Layer - نقطة التصدير الموحدة
 *  جميع خدمات النظام في مكان واحد
 * ════════════════════════════════════════════════════════════════
 * 
 *  الهدف: عزل الكود الأمامي تماماً عن قاعدة البيانات
 *  عند تغيير قاعدة البيانات، نغير فقط ملفات SDK
 * ════════════════════════════════════════════════════════════════
 */

// 🆕 الخدمات الجديدة (مع BaseService + حقن tenant_id تلقائي)
export { BaseService } from './BaseService';
export { SdkError, SdkErrorCode, getCurrentTenantId, requireTenantId } from './BaseService';
export { authService } from './AuthService';
export { publicSignupService } from './PublicSignupService';
export { publicSignupAdminService } from './PublicSignupAdminService';
export { publicSiteConfigService, DEFAULT_PUBLIC_SITE_CONFIG } from './PublicSiteConfigService';
export type { PublicSiteConfig, PublicInfoPageConfig } from './PublicSiteConfigService';
export type { PublicSignupRequestRecord, PublicSignupStatus } from './PublicSignupAdminService';
export type { PublicSignupIntentType, PublicSignupRequestInput } from './PublicSignupService';
export type { LoginResult, SessionResult } from './AuthService';
export { userService } from './UserService';
export type { UserProfile, UserUpdateInput } from './UserService';
export { employeeService } from './EmployeeService';
export type { EmployeeInput, EmployeeRecord } from './EmployeeService';
export { attendanceService, attendanceSummaryService } from './AttendanceService';
export { leaveService, leaveBalanceService, leaveSettingsService, holidayService } from './LeaveService';
export { permissionService, permissionRequestService } from './PermissionService';
export { notificationService } from './NotificationService';
export { payrollService } from './PayrollService';
export { aiService } from './AIService';
export { settingsService } from './SettingsService';
export { departmentService, specialtyService } from './DepartmentService';
export { incidentService } from './IncidentService';
export { wellnessService, wellnessEntryService } from './WellnessService';
export { reviewService } from './ReviewService';
export { auditLogService } from './AuditLogService';
export type { AuditLogRecord } from './AuditLogService';
export { securityEventService } from './SecurityEventService';
export type { SecurityEventRecord, SecurityEventInput } from './SecurityEventService';
export { storageService } from './StorageService';
export type { UploadOptions } from './StorageService';
export { biometricDeviceService } from './BiometricDeviceService';
export type { BiometricDeviceRecord, BiometricDeviceInput } from './BiometricDeviceService';
export { messageService } from './MessageService';
export type { HrMessageRecord, HrMessageInput } from './MessageService';
export { certificationService } from './CertificationService';
export { gatekeeperSessionService, gatekeeperVisitorLogService, movementLogService, employeeBreakService } from './GatekeeperService';
export { gatekeeperVisitorService } from './GatekeeperVisitorService';
export { expenseRequestService, employeeLoanService, bonusService } from './FinanceService';
export { courseService, courseProgressService } from './TrainingService';
export { disciplinaryActionService, employeeDocumentService } from './HRService';
export { performanceCycleService, performanceReviewService } from './PerformanceService';
export { onboardingTaskService, employeeOnboardingService, offboardingRecordService } from './OnboardingService';
export { jobPostingService, jobApplicationService } from './RecruitmentService';
export { shiftAssignmentService } from './ShiftService';
export { payrollPeriodService, payrollRecordService, payrollSettingService } from './PayrollService';
export { surveyResponseService } from './SurveyService';
export { structureDepartmentService, structurePositionService, structureRankService, structureShiftService, structureRoleService } from './StructureService';
export { adminUserService } from './AdminUserService';
export { incidentCommentService } from './IncidentCommentService';
export { timeLogService } from './TimeLogService';
export { syncLogService } from './SyncLogService';
export { employeeGoalService, goalUpdateService, employeeSkillService } from './EmployeeDevelopmentService';
export { hrCaseService, hrCaseCommentService, employeeLetterRequestService } from './EmployeeSelfServiceService';
export { employeeContractService } from './ContractService';
export { criticalPositionService, successionCandidateService, successionDevelopmentPlanService } from './SuccessionService';
export { workforceAnalyticsService } from './WorkforceAnalyticsService';
export type { WorkforceSummary } from './WorkforceAnalyticsService';
export { correctiveActionService } from './HealthSafetyService';
export { branchService } from './BranchService';
export { complianceCheckService, policyAcknowledgementService } from './ComplianceService';
export { movementPermitService } from './MovementPermitService';
export { teamTaskService, shiftNoteService, operationalChecklistService } from './SupervisorService';
export { approvalRequestService, approvalActionService } from './ApprovalService';
export { managerWorkloadItemService } from './ManagerService';
export { tenantModuleService, MODULE_CATALOG, PLAN_ALLOWED_MODULES, PLAN_LIMITS, modulesForPlan, isModuleAllowedForPlan, planLimitsForPlan } from './TenantModuleService';
export type { TenantModuleRecord, ModuleCatalogItem, ModuleKey, PlanLimits } from './TenantModuleService';
export { currencyService, financeSetupService, legalEntityService, entityMembershipService, fiscalYearService, accountingPeriodService, requireFinanceTenantId } from './FinanceFoundationService';
export type { CurrencyRecord, LegalEntityRecord, EntityMembershipRecord, FiscalYearRecord, AccountingPeriodRecord, FinanceRole, EntityStatus, FiscalYearStatus, AccountingPeriodStatus } from './FinanceFoundationService';
export { entitlementService } from './EntitlementService';
export type { TenantUsageSnapshot } from './EntitlementService';

// Tenant / Platform Management
export { tenantService } from './TenantService';
export type { TenantCompany, TenantSubscription, TenantStats, PlatformAuditEntry, PlatformStats } from './TenantService';

// قاعدة البيانات (كلينتات) - من src/services/supabase/
export { supabase, default as supabaseClient } from '../supabase/supabase';export { generalLedgerService } from './GeneralLedgerService';
export type { CreateJournalDraftInput, JournalDraftLineInput } from './GeneralLedgerService';
export { chartOfAccountService } from './ChartOfAccountService';
export { accountsPayableService, vendorService } from './AccountsPayableService';
export type { AccountsPayableRecord, VendorRecord, PayableStatus } from './AccountsPayableService';
export { vendorPaymentService } from './VendorPaymentService';
export type { VendorPaymentRecord, VendorPaymentAllocationInput } from './VendorPaymentService';
export { accountsReceivableService } from './AccountsReceivableService';
export { cashManagementService } from './CashManagementService';
export { taxService } from './TaxService';
export { budgetService } from './BudgetService';
export { financialReportService } from './FinancialReportService';
export { auditTrailService } from './AuditTrailService';
export { systemNoteService } from './SystemNoteService';
export { approvalService } from './ApprovalService';
export { multiBookService } from './MultiBookService';
export { fixedAssetService } from './FixedAssetService';
export { financialReportTemplateService } from './FinancialReportTemplateService';
export { intercompanyService } from './IntercompanyService';
