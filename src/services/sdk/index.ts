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
export { errorLogService } from './ErrorLogService';

// Tenant / Platform Management
export { tenantService } from './TenantService';
export type { TenantCompany, TenantSubscription, TenantStats, PlatformAuditEntry, PlatformStats } from './TenantService';

// قاعدة البيانات (كلينتات) - من src/services/supabase/
export { supabase, default as supabaseClient } from '../supabase/supabase';