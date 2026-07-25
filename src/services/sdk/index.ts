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
export { publicSiteConfigService, DEFAULT_PUBLIC_SITE_CONFIG, DEFAULT_SITE_THEME } from './PublicSiteConfigService';
export type { PublicSiteConfig, PublicInfoPageConfig, PublicSiteTheme, PublicSiteMedia, PublicSiteContent, PublicPlanConfig, PublicServiceConfig, PublicPortalConfig } from './PublicSiteConfigService';
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
// 🆕 وحدة أتمتة التسويق (بوابة التسويق — التقرير 1)
export {
  marketingLeadService,
  leadScoreRuleService,
  marketingWorkflowService,
  workflowStepService,
  workflowEnrollmentService,
  marketingActionLogService,
  marketingAnalyticsService,
  CAMPAIGN_TEMPLATES,
} from './MarketingAutomationService';
export type {
  MarketingLead, MarketingLeadInput, JourneyStage, PipelineStage, LeadTemperature,
  LeadScoreRule, ScoreRuleType, LeadScoreEvent,
  MarketingWorkflow, MarketingWorkflowInput, CampaignType, WorkflowStatus, TriggerType,
  WorkflowStep, WorkflowStepInput, StepType, ActionType,
  WorkflowEnrollment, EnrollmentStatus, ActionLogEntry, ActionLogStatus,
  MarketingKpiSummary, CampaignTemplate,
} from './MarketingAutomationService';
// 🆕 وحدة البريد الإلكتروني (بوابة التسويق — التقرير 2)
export {
  senderDomainService, emailListService, emailSubscriberService, emailSegmentService,
  emailTemplateService, emailCampaignService, campaignVariantService, emailDeliveryService,
  BEST_SEND_TIMES, AUTH_DELIVERABILITY, KPI_TARGETS,
} from './MarketingEmailService';
export type {
  SenderDomain, SenderDomainInput, AuthStatus, DmarcPolicy, EmailProvider, WarmupWeek,
  EmailList, EmailListInput, OptInType,
  EmailSubscriber, EmailSubscriberInput, SubscriberStatus,
  EmailSegment, SegmentType,
  EmailTemplate, EmailTemplateInput,
  EmailCampaign, EmailCampaignInput, CampaignStatus,
  CampaignVariant, CampaignVariantInput,
  EmailEventType, EmailKpis,
} from './MarketingEmailService';
// 🆕 وحدة وسائل التواصل الاجتماعي (بوابة التسويق — التقرير 3)
export {
  socialAccountService, socialPostService, socialInteractionService,
  socialUtmService, socialListeningService, socialAnalyticsService,
  PLATFORM_META, POSTING_FREQUENCY,
} from './MarketingSocialService';
export type {
  SocialPlatform, SocialAccount, SocialAccountInput,
  ContentType, PostStatus, SocialPost, SocialPostInput,
  PostTarget, PostTargetInput,
  InteractionType, InteractionStatus, SocialInteraction, SocialInteractionInput,
  UtmLink, TermType, ListeningTerm, ListeningMention, SocialKpis,
} from './MarketingSocialService';
// 🆕 وحدة الرسائل النصية والواتساب (بوابة التسويق — التقرير 4)
export {
  messagingGatewayService, messagingContactService, whatsappTemplateService,
  smsTemplateService, messagingCampaignService, messagingDeliveryService,
  SMS_MAX_CHARS, SMS_TYPE_META, SMS_VS_WA, MESSAGING_KPI_TARGETS,
} from './MarketingMessagingService';
export type {
  MessagingChannel, MessagingProvider, MessagingGateway, MessagingGatewayInput,
  MessagingContact, MessagingContactInput,
  WaCategory, WaApprovalStatus, WhatsappTemplate, WhatsappTemplateInput,
  SmsType, SmsTemplate,
  MessagingCampaignStatus, MessagingCampaign, MessagingCampaignInput,
  MessageStatus, MessagingMessage, MessagingKpis, WaWarmupWeek,
} from './MarketingMessagingService';
// 🆕 وحدة إدارة الفعاليات (بوابة التسويق — التقرير 5)
export {
  eventService, eventTicketService, eventPromoService, eventRegistrationService,
  TICKET_TIER_LABEL, EVENT_TYPE_LABEL, PRE_EVENT_SEQUENCE,
} from './MarketingEventsService';
export type {
  EventType, EventStatus, StreamProvider, MarketingEvent, MarketingEventInput,
  EventSpeaker, EventSponsor, EventSession,
  TicketTier, EventTicketType, EventTicketTypeInput,
  EventPromoCode, EventPromoCodeInput,
  RegistrationStatus, PaymentStatus, EventRegistration, EventKpis, CheckinResult,
} from './MarketingEventsService';
// 🆕 وحدة الاستبيانات والتغذية الراجعة (بوابة التسويق — التقرير 6)
export {
  marketingSurveyService, marketingSurveyResponseService,
  SURVEY_TEMPLATES, NPS_INTERPRETATION, LOOP_PLAYBOOK, SURVEY_TYPE_LABEL,
} from './MarketingSurveysService';
export type {
  SurveyType, SurveyStatus, QuestionType, NpsCategory, LoopStatus, SurveyChannel,
  MarketingSurvey, MarketingSurveyInput, SurveyQuestion, SurveyQuestionInput,
  SurveyResponse, SurveyAnswerInput, SurveyCertificate, SurveyKpis, SurveyTemplate,
} from './MarketingSurveysService';
// 🆕 نظام المناعة العلائقية (بوابة التسويق — التقرير 7، الطبقة الحاكمة)
export {
  relationshipBalanceService, governanceService, culturalCalendarService, immuneService,
  STATUS_LABEL, STATUS_COLOR, customerFacingStatus, statusFromBalance, POINTS_TABLE, CULTURAL_RULES,
} from './RelationshipImmuneService';
export type {
  RelationshipStatus, PacePreference, GovernanceDecision,
  RelationshipBalance, LedgerEntry, GovernanceLogEntry,
  OccasionType, OccasionEffect, CulturalOccasion, CulturalOccasionInput,
  IncidentType, ImmuneIncident, ImmuneSettings, GovernanceResult, MarketingDebt,
} from './RelationshipImmuneService';
// 🆕 بوابة CRM — الوحدة 1: جهات الاتصال والحسابات (التقرير 01)
export {
  crmAccountService, crmContactService, crmActivityService, crmAuditService,
  listConvertibleLeads,
  ACCOUNT_TYPE_LABEL, ACCOUNT_TYPE_COLOR, ACCOUNT_TIER_LABEL,
  DECISION_ROLE_LABEL, DECISION_ROLE_COLOR, TEMPERATURE_LABEL, TEMPERATURE_COLOR,
  ACTIVITY_TYPE_LABEL, ACTIVITY_TYPE_ICON, ENRICHMENT_PROVIDERS,
} from './CrmContactsService';
export type {
  AccountType, AccountTier, EnrichmentStatus, CrmAccount, CrmAccountInput,
  DecisionRole, ContactTemperature, CrmContact, CrmContactInput,
  ActivityType, ActivityDirection, LoggedVia, CrmActivity, CrmActivityInput,
  Account360, DuplicateCandidate, CrmMergeLogEntry, CrmAuditEntry,
} from './CrmContactsService';
// 🆕 بوابة CRM — الوحدة 2: خط الأنابيب والصفقات (التقرير 02)
export {
  crmPipelineService, crmStageService, crmLossReasonService, crmDealService,
  PIPELINE_TYPE_LABEL, DEAL_VALUE_TYPE_LABEL, DEAL_STATUS_LABEL, DEAL_STATUS_COLOR,
  ALERT_TYPE_LABEL, ALERT_TYPE_COLOR, STAGE_TYPE_ACCENT,
} from './CrmPipelineService';
export type {
  PipelineType, StageType, DealStatus, DealValueType,
  CrmPipeline, CrmPipelineInput, CrmStage, CrmStageInput, CrmLossReason,
  CrmDeal, CrmDealInput, DealVelocity, StagnationAlert,
} from './CrmPipelineService';
// 🆕 بوابة CRM — الوحدة 3: الأنشطة والأتمتة (التقرير 03)
export {
  crmTaskService, crmSequenceService, crmSequenceStepService, crmEnrollmentService,
  crmAutomationService, crmAssignmentService,
  TASK_TYPE_LABEL, TASK_PRIORITY_LABEL, TASK_PRIORITY_COLOR, TASK_STATUS_LABEL,
  SEQUENCE_TYPE_LABEL, SEQUENCE_ACTION_LABEL,
  AUTOMATION_TRIGGER_LABEL, AUTOMATION_ACTION_LABEL, ASSIGNMENT_MATCH_LABEL, CALL_OUTCOME_LABEL,
} from './CrmActivitiesService';
export type {
  TaskType, TaskPriority, TaskStatus, TaskOrigin, CrmTask, CrmTaskInput,
  SequenceType, SequenceActionType, SequenceEnrollmentStatus,
  CrmSequence, CrmSequenceInput, CrmSequenceStep, CrmSequenceStepInput, CrmSequenceEnrollment,
  AutomationTrigger, AutomationAction, CrmAutomationRule, CrmAutomationRuleInput,
  AssignmentMatchType, CrmAssignmentRule, CrmAssignmentRuleInput,
  ActivityStats, ActivityGap, CallOutcome,
} from './CrmActivitiesService';
// 🆕 بوابة CRM — الوحدة 4: العروض والعقود CPQ (التقرير 04)
export {
  crmProductService, crmQuoteService, crmQuoteLineItemService, crmApprovalService, crmContractService,
  PRODUCT_TYPE_LABEL, BILLING_CYCLE_LABEL, QUOTE_STATUS_LABEL, QUOTE_STATUS_COLOR,
  APPROVAL_LEVEL_LABEL, CONTRACT_STATUS_LABEL, CONTRACT_STATUS_COLOR, RENEWAL_ALERT_LABEL,
} from './CrmQuotesService';
export type {
  ProductType, BillingCycle, CrmProduct, CrmProductInput,
  QuoteStatus, CrmQuote, CrmQuoteInput, CrmQuoteLineItem, CrmQuoteLineItemInput,
  ApprovalLevel, ApprovalStatus, CrmDiscountApproval,
  QuoteEventType, CrmQuoteEvent, ContractStatus, CrmContract,
  QuoteAnalytics, ContractRenewalAlert,
} from './CrmQuotesService';
// 🆕 بوابة CRM — الوحدة 5: الدعم والتذاكر (التقرير 05)
export {
  crmTicketService, crmTicketReplyService, crmSlaService, crmCannedService, crmKbService, crmRoutingService,
  TICKET_TYPE_LABEL, TICKET_PRIORITY_LABEL, TICKET_PRIORITY_COLOR, TICKET_CHANNEL_LABEL,
  TICKET_STATUS_LABEL, TICKET_STATUS_COLOR, KB_ARTICLE_TYPE_LABEL, ROUTING_STRATEGY_LABEL, SLA_REFERENCE,
} from './CrmSupportService';
export type {
  TicketType, TicketPriority, TicketChannel, TicketStatus, CrmTicket, CrmTicketReply,
  CrmSlaPolicy, CrmCannedResponse, CrmCannedResponseInput,
  KbArticleType, CrmKbArticle, CrmKbArticleInput,
  RoutingStrategy, RoutingMatchType, CrmRoutingRule, CrmRoutingRuleInput,
  SupportKpis, ChurnRiskAccount,
} from './CrmSupportService';
// 🆕 بوابة CRM — الوحدة 6: التحليلات والتنبؤ (التقرير 06)
export {
  crmTargetService, crmMrrService, crmAnalytics,
  FORECAST_CATEGORY_LABEL, HEALTH_WEIGHTS_REFERENCE, healthTier, CRM_KPI_TARGETS,
} from './CrmAnalyticsService';
export type {
  ForecastCategory, CrmSalesTarget, CrmSalesTargetInput, CrmMrrSnapshot, CrmMrrSnapshotInput,
  WeightedForecastRow, FunnelRow, VelocityRow, CompetitorRow, SegmentRow,
  MrrMovementRow, RepPerformanceRow, ExecKpis,
} from './CrmAnalyticsService';
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
export { hrApprovalService } from './HrApprovalService';
// 🆕 مفاتيح المزوّدين لكل شركة (BYOK — النموذج ب)
export { tenantProviderService, SUPPORTED_PROVIDERS } from './TenantProviderService';
export type { ProviderChannel, ProviderStatus, ProviderMeta } from './TenantProviderService';
// 🆕 بوابة المشتريات — Wave1: الموردون + طلبات الشراء
export {
  supplierService,
  supplierDocumentService,
  supplierRiskAssessmentService,
} from './Procurement/SupplierService';
export type {
  SupplierRecord,
  SupplierDocumentRecord,
  SupplierRiskAssessmentRecord,
} from './Procurement/SupplierService';
export {
  purchaseRequisitionService,
  prLineItemService,
  prApprovalService,
  prAttachmentService,
} from './Procurement/PurchaseRequisitionService';
export type {
  PurchaseRequisitionRecord,
  PrLineItemRecord,
  PrApprovalRecord,
  PrAttachmentRecord,
  CreatePrItemInput,
  CreatePrInput,
} from './Procurement/PurchaseRequisitionService';
