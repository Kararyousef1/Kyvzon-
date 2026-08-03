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
export { costCenterService } from './CostCenterService';
export type { CostCenterRecord } from './CostCenterService';
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
export { currencyService, financeSetupService, legalEntityService, entityMembershipService, fiscalYearService, accountingPeriodService, financeCostCenterService, financeProjectService, exchangeRateService, financePeriodCloseService, requireFinanceTenantId } from './FinanceFoundationService';
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
export type { CurrencyRecord, LegalEntityRecord, EntityMembershipRecord, FiscalYearRecord, AccountingPeriodRecord, FinanceProjectRecord, ExchangeRateRecord, FinancePeriodCloseTaskRecord, FinancePeriodCloseReadinessRecord, FinanceCloseChecklistBoardRecord, FinanceGrcDashboardRecord, FinanceRole, EntityStatus, FiscalYearStatus, AccountingPeriodStatus } from './FinanceFoundationService';
export { entitlementService } from './EntitlementService';
export type { TenantUsageSnapshot } from './EntitlementService';

// Tenant / Platform Management
export { tenantService } from './TenantService';
export type { TenantCompany, TenantSubscription, TenantStats, PlatformAuditEntry, PlatformStats } from './TenantService';

// قاعدة البيانات (كلينتات) - من src/services/supabase/
export { supabase, default as supabaseClient } from '../supabase/supabase';export { generalLedgerService } from './GeneralLedgerService';
export type { CreateJournalDraftInput, JournalDraftLineInput, JournalEntryBoardRecord, JournalEntryLineBoardRecord, JournalLifecycleDashboardRecord } from './GeneralLedgerService';
export { chartOfAccountService } from './ChartOfAccountService';
export type { FinanceChartAccountTreeRecord, FinancePostingAccountLookupRecord, FinanceAccountUsageSummaryRecord, FinanceAccountDimensionPolicyRecord, FinanceDimensionsDashboardRecord, FinanceHierarchyIssueRecord, UpsertFinanceChartAccountInput } from './ChartOfAccountService';
export { accountsPayableService, vendorService } from './AccountsPayableService';
export type { AccountsPayableRecord, VendorRecord, PayableStatus, ApInvoiceLineInput, ApInvoiceBoardRecord, ApInvoiceLineBoardRecord, ApDashboardRecord } from './AccountsPayableService';
export { vendorPaymentService } from './VendorPaymentService';
export type { VendorPaymentRecord, VendorPaymentBoardRecord, VendorPaymentAllocationInput, VendorPaymentAllocationBoardRecord } from './VendorPaymentService';
export { accountsReceivableService, customerService, customerReceiptService } from './AccountsReceivableService';
export type { CustomerRecord, AccountsReceivableRecord, ArInvoiceLineInput, ArInvoiceBoardRecord, ArInvoiceLineBoardRecord, ArDashboardRecord, CustomerReceiptRecord, CustomerReceiptBoardRecord, CustomerReceiptAllocationInput } from './AccountsReceivableService';
export { cashManagementService } from './CashManagementService';
export { bankAccountService, bankStatementImportService, bankReconciliationService, cashBankDashboardService } from './BankStatementImportService';
export type { BankAccountRecord, BankAccountBoardRecord, BankStatementImportRecord, BankStatementLineRecord, BankStatementLineInput, BankReconciliationRecord, CashBankDashboardRecord } from './BankStatementImportService';
export { taxService } from './TaxService';
export type { TaxCodeRecord, TaxCodeBoardRecord, TaxFilingRecord, TaxFilingBoardRecord, TaxFilingLineRecord, TaxDashboardRecord } from './TaxService';
export { budgetService, forecastScenarioService } from './BudgetService';
export type { BudgetRecord, BudgetBoardRecord, BudgetLineRecord, BudgetLineBoardRecord, BudgetVarianceRecord, BudgetDashboardRecord, ForecastScenarioRecord } from './BudgetService';
export { financialReportService } from './FinancialReportService';
export type { TrialBalanceRow, GeneralLedgerRow, FinanceReportRunRecord, FinanceReportExportRecord, FinanceExecutiveKpiRecord } from './FinancialReportService';
export { auditTrailService } from './AuditTrailService';
export { systemNoteService } from './SystemNoteService';
export { approvalService } from './ApprovalService';
export { multiBookService } from './MultiBookService';
export { fixedAssetService } from './FixedAssetService';
export type { FixedAssetRecord, FixedAssetBoardRecord, DepreciationScheduleRecord, FixedAssetDashboardRecord } from './FixedAssetService';
export { revenueRecognitionService } from './RevenueRecognitionService';
export type { RevenueContractRecord, RevenueContractBoardRecord, RevenueScheduleRecord, RevenueDashboardRecord } from './RevenueRecognitionService';
export { financialReportTemplateService } from './FinancialReportTemplateService';
export { intercompanyService } from './IntercompanyService';
export type { IntercompanyTransactionRecord, IntercompanyTransactionBoardRecord, ConsolidationEntryRecord, IntercompanyDashboardRecord } from './IntercompanyService';
export { projectAccountingService } from './ProjectAccountingService';
export type { ProjectAccountingRecord, ProjectBudgetLineRecord, ProjectActualSnapshotRecord, ProjectAccountingDashboardRecord } from './ProjectAccountingService';
export { financeIntegrationService } from './FinanceIntegrationService';
export type { FinanceIntegrationConnectorRecord, FinanceIntegrationEventRecord, FinanceIntegrationDashboardRecord } from './FinanceIntegrationService';
export { hrApprovalService } from './HrApprovalService';
// 🆕 مفاتيح المزوّدين لكل شركة (BYOK — النموذج ب)
export { tenantProviderService, SUPPORTED_PROVIDERS } from './TenantProviderService';
export type { ProviderChannel, ProviderStatus, ProviderMeta } from './TenantProviderService';
// 🆕 بوابة المشتريات — Wave1: الموردون + طلبات الشراء
export {
  supplierService,
  supplierDocumentService,
  supplierContactService,
  supplierRiskAssessmentService,
  supplierSiteVisitService,
  supplierPortalInviteService,
  supplierAuditLogService,
  supplierQualificationFormService,
} from './Procurement/SupplierService';
export type {
  SupplierRecord,
  SupplierDocumentRecord,
  SupplierContactRecord,
  SupplierRiskAssessmentRecord,
  SupplierSiteVisitRecord,
  SupplierPortalInviteRecord,
  SupplierAuditLogRecord,
  SupplierQualificationFormRecord,
} from './Procurement/SupplierService';
export {
  purchaseRequisitionService,
  prLineItemService,
  prApprovalService,
  prAttachmentService,
  prAuditLogService,
  prCommentService,
  procurementReorderPointService,
} from './Procurement/PurchaseRequisitionService';
export type {
  PurchaseRequisitionRecord,
  PrLineItemRecord,
  PrApprovalRecord,
  PrAttachmentRecord,
  PrAuditLogRecord,
  PrCommentRecord,
  ProcurementReorderPointRecord,
  CreatePrItemInput,
  CreatePrInput,
} from './Procurement/PurchaseRequisitionService';
export {
  sourcingEventService,
  supplierBidService,
  rfxInvitationService,
  rfxQuestionService,
  rfxTemplateService,
  rfxDocumentService,
  rfxEvaluationCriteriaService,
  rfxBidScorecardService,
  auctionService,
  auctionBidService,
} from './Procurement/SourcingService';
export type {
  SourcingEventRecord,
  SupplierBidRecord,
  RfxInvitationRecord,
  RfxQuestionRecord,
  RfxTemplateRecord,
  RfxDocumentRecord,
  RfxEvaluationCriterionRecord,
  RfxBidScorecardRecord,
  AuctionRecord,
  AuctionBidRecord,
} from './Procurement/SourcingService';
export {
  purchaseOrderService,
  poLineItemService,
  goodsReceiptService,
  grLineItemService,
  iqcInspectionService,
  inventoryTransactionService,
  poOtifAlertService,
  rtvService,
} from './Procurement/PurchaseOrderService';
export type {
  PurchaseOrderRecord,
  PoLineItemRecord,
  GoodsReceiptRecord,
  GrLineItemRecord,
} from './Procurement/PurchaseOrderService';
export {
  supplierInvoiceService,
  matchingResultService,
} from './Procurement/InvoiceService';
export type {
  SupplierInvoiceRecord,
  MatchingResultRecord,
  CreateInvoiceInput,
  CreateInvoiceLineInput,
} from './Procurement/InvoiceService';
export {
  procurementContractService,
  contractApprovalStepService,
  contractAuditLogService,
  contractTemplateService,
  contractClauseService,
  contractVersionService,
  contractObligationService,
  contractSignatureService,
} from './Procurement/ContractService';
export type {
  ProcurementContractRecord,
  ContractRenewalRecord,
  ContractTemplateRecord,
  ContractClauseRecord,
  ContractVersionRecord,
  ContractObligationRecord,
  ContractSignatureRecord,
  ContractApprovalStepRecord,
  ContractAuditLogRecord,
} from './Procurement/ContractService';
export {
  spendParetoService,
  priceTrendService,
  procurementExecutiveKpiService,
  spendCategoryReportService,
  spendAlertService,
  spendForecastService,
  spendTransactionService,
  spendCategoryStrategyService,
  pCardTransactionService,
  toleranceRuleService,
  poReleaseService,
  procurementApprovalRuleService,
} from './Procurement/SpendAnalyticsService';
export type {
  SpendParetoRecord,
  PriceTrendRecord,
  SpendForecastRecord,
  SpendTransactionRecord,
  ProcurementExecutiveKpiRecord,
  SpendCategoryReportRecord,
  SpendIntelligenceAlertRecord,
} from './Procurement/SpendAnalyticsService';

// 🆕 بوابة المخزون والمستودعات — Foundation WMS
export {
  inventoryItemService,
  inventoryWarehouseService,
  inventoryLocationService,
  inventoryStockBalanceService,
  inventoryStockMovementService,
  inventoryCodeSequenceService,
  inventoryBarcodeService,
  inventoryPostingService,
  inventoryAnalyticsService,
} from './InventoryService';
export type {
  InventoryItemRecord,
  InventoryWarehouseRecord,
  InventoryLocationRecord,
  InventoryStockBalanceRecord,
  InventoryStockMovementRecord,
  InventoryCodeSequenceRecord,
  InventoryBarcodeRecord,
} from './InventoryService';

// 🆕 بوابة المخزون — الوحدة 01: الاستلام والعمليات الواردة
export {
  inventoryAsnService,
  inventoryDockAppointmentService,
  inventoryReceivingSessionService,
  inventoryReceivingLineService,
  inventoryOsdCaseService,
  inventoryQuarantineHoldService,
  inventoryPutawayTaskService,
  inventoryCrossDockTaskService,
  inventoryReceivingScanService,
  inventoryLpnLabelPrintService,
  inventoryInboundNotificationService,
  inventoryReceivingAttachmentService,
  inventoryQualityNcrCaseService,
  inventorySupplierDockInviteService,
  inventoryReceivingAnalyticsService,
} from './Inventory/ReceivingService';
export type {
  InventoryAsnRecord,
  InventoryDockAppointmentRecord,
  InventoryReceivingSessionRecord,
  InventoryReceivingLineRecord,
  InventoryOsdCaseRecord,
  InventoryQuarantineHoldRecord,
  InventoryPutawayTaskRecord,
  InventoryCrossDockTaskRecord,
  InventoryReceivingScanRecord,
  InventoryLpnLabelPrintRecord,
  InventoryInboundNotificationRecord,
  InventoryReceivingAttachmentRecord,
  InventoryQualityNcrCaseRecord,
  InventorySupplierDockInviteRecord,
} from './Inventory/ReceivingService';

// 🆕 بوابة المخزون — الوحدة 02: التخزين وSlotting
export {
  inventoryAbcClassificationService,
  inventorySlottingRecommendationService,
  inventoryReplenishmentPolicyService,
  inventoryReplenishmentTaskService,
  inventoryLocationLabelPrintService,
  inventoryAffinityRuleService,
  inventorySeasonalSlottingPlanService,
  inventoryTaskInterleavingSuggestionService,
  inventorySlowMovingReportSubscriptionService,
  inventoryStorageAnalyticsService,
} from './Inventory/StorageSlottingService';
export type {
  InventoryAbcClassificationRecord,
  InventorySlottingRecommendationRecord,
  InventoryReplenishmentPolicyRecord,
  InventoryReplenishmentTaskRecord,
  InventoryLocationLabelPrintRecord,
  InventoryAffinityRuleRecord,
  InventorySeasonalSlottingPlanRecord,
  InventoryTaskInterleavingSuggestionRecord,
  InventorySlowMovingReportSubscriptionRecord,
} from './Inventory/StorageSlottingService';

// 🆕 بوابة المخزون — الوحدة 03: السحب وتنفيذ الأوامر
export {
  inventoryPickOrderService,
  inventoryPickTaskService,
  inventoryPickExceptionService,
  inventoryPickWaveService,
  inventoryPickScanService,
  inventoryPickingTechnologyEventService,
  inventoryPickSortingSessionService,
  inventoryPickZoneHandoffService,
  inventoryPickingAnalyticsService,
} from './Inventory/PickingService';
export type {
  InventoryPickOrderRecord,
  InventoryPickTaskRecord,
  InventoryPickWaveRecord,
  InventoryPickExceptionRecord,
  InventoryPickScanRecord,
  InventoryPickingTechnologyEventRecord,
  InventoryPickSortingSessionRecord,
  InventoryPickZoneHandoffRecord,
} from './Inventory/PickingService';

// 🆕 بوابة المخزون — الوحدة 04: الشحن والعمليات الصادرة
export { inventoryShipmentService, inventoryPackageService, inventoryCarrierService, inventoryShippingDocumentService, inventoryCarrierRateQuoteService, inventoryRateShoppingRuleService, inventoryCarrierWebhookEventService, inventoryLoadingManifestService, inventoryShippingAnalyticsService } from './Inventory/ShippingService';
export type { InventoryShipmentRecord, InventoryPackageRecord, InventoryCarrierRecord, InventoryShippingDocumentRecord, InventoryLoadingManifestRecord, InventoryCarrierRateQuoteRecord, InventoryTrackingEventRecord, InventoryRateShoppingRuleRecord, InventoryCarrierWebhookEventRecord } from './Inventory/ShippingService';

// 🆕 بوابة المخزون — الوحدة 05: الجرد ودقة المخزون
export { inventoryCycleCountPlanService, inventoryCountTaskService, inventoryCountVarianceService, inventoryAdjustmentApprovalService, inventoryCountFreezeService, inventoryAnnualCountPlanService, inventoryCountingAnalyticsService } from './Inventory/CountingService';
export type { InventoryCycleCountPlanRecord, InventoryCountTaskRecord, InventoryCountVarianceRecord, InventoryAdjustmentApprovalRecord, InventoryCountFreezeRecord, InventoryAnnualCountPlanRecord } from './Inventory/CountingService';

// 🆕 بوابة المخزون — الوحدة 06: المرتجعات واللوجستيات العكسية
export { inventoryRmaService, inventoryReturnReceiptService, inventoryReturnConditionAssessmentService, inventoryReturnDispositionTaskService, inventoryProductionReturnService, inventoryReturnRtvClaimService, inventoryReturnCustomerNotificationService, inventorySupplierRtvReportService, inventoryReturnCapaActionService, inventoryReturnsAnalyticsService } from './Inventory/ReturnsService';
export type { InventoryRmaRecord, InventoryRmaLineRecord, InventoryReturnReceiptRecord, InventoryReturnReceiptLineRecord, InventoryReturnConditionAssessmentRecord, InventoryReturnDispositionTaskRecord, InventoryReturnRtvClaimRecord, InventoryProductionReturnRecord, InventoryReturnCustomerNotificationRecord, InventorySupplierRtvReportRecord, InventoryReturnCapaActionRecord } from './Inventory/ReturnsService';

// 🆕 بوابة المخزون — الوحدة 07: إدارة العمالة والإنتاجية
export { inventoryLaborStandardService, inventoryWorkerAvailabilityService, inventoryLaborWorkforcePlanService, inventoryLaborSkillService, inventoryWorkerSkillService, inventoryLaborTrainingService, inventoryLaborDispatchTaskService, inventoryLaborTimeLogService, inventoryLaborInterleavingService, inventoryLaborIncentiveProgramService, inventoryLaborIncentiveAwardService, inventoryLaborLeaderboardService, inventoryLaborReportRunService, inventoryLaborSafetyIncidentService, inventoryLaborAnalyticsService } from './Inventory/LaborService';
export type { InventoryLaborStandardRecord, InventoryWorkerAvailabilityRecord, InventoryLaborWorkforcePlanRecord, InventoryLaborSkillRecord, InventoryWorkerSkillRecord, InventoryLaborTrainingRecord, InventoryLaborDispatchTaskRecord, InventoryLaborTimeLogRecord, InventoryLaborIncentiveProgramRecord, InventoryLaborIncentiveAwardRecord, InventoryLaborLeaderboardRecord, InventoryLaborReportRunRecord, InventoryLaborSafetyIncidentRecord } from './Inventory/LaborService';

// 🆕 بوابة المخزون — الوحدة 08: تحليلات المستودع ولوحة المؤشرات
export { inventoryAnalyticsKpiTargetService, inventoryAnalyticsKpiSnapshotService, inventoryAnalyticsAlertRuleService, inventoryAnalyticsAlertService, inventoryRootCauseAnalysisService, inventoryPeriodicReportScheduleService, inventoryPeriodicReportRunService, inventoryReportExportService, inventoryOperatingCostEntryService, inventoryWarehouseAnalyticsService } from './Inventory/AnalyticsService';
export type { InventoryAnalyticsKpiTargetRecord, InventoryAnalyticsKpiSnapshotRecord, InventoryAnalyticsAlertRuleRecord, InventoryAnalyticsAlertRecord, InventoryRootCauseAnalysisRecord, InventoryPeriodicReportScheduleRecord, InventoryPeriodicReportRunRecord, InventoryReportExportRecord, InventoryOperatingCostEntryRecord } from './Inventory/AnalyticsService';

// 🏭 بوابة التصنيع MRP — الوحدة 00: الأساس التقني
export { mrpPlantService, mrpAreaService, mrpLineService, mrpWorkCenterService, mrpResourceService, mrpAssetService, mrpCalendarService, mrpShiftService, mrpOperationService, mrpRoutingService, mrpNumberingService, mrpCapacityService, mrpAnalyticsService } from './MrpService';
export type { MrpPlantRecord, MrpAreaRecord, MrpLineRecord, MrpWorkCenterRecord, MrpResourceRecord, MrpAssetRecord, MrpCalendarRecord, MrpShiftRecord, MrpOperationRecord, MrpRoutingRecord, MrpNumberingRecord } from './MrpService';

// 🏭 بوابة التصنيع MRP — الوحدة 01: BOM & Engineering Change
export { mrpBomHeaderService, mrpBomVersionService, mrpBomLineService, mrpEcrService, mrpEcoService, mrpBomExplosionService, mrpBomAvailabilityService, mrpBomImportBatchService, mrpBomExportRequestService, mrpBomAnalyticsService } from './MrpBomService';
export type { MrpBomHeaderRecord, MrpBomVersionRecord, MrpBomLineRecord, MrpEcrRecord, MrpEcoRecord, MrpBomExplosionRunRecord, MrpBomAvailabilityCheckRecord, MrpBomImportBatchRecord, MrpBomExportRequestRecord } from './MrpBomService';

// 🏭 بوابة التصنيع MRP — الوحدة 02: Demand Forecasting & MPS
export { mrpDemandHistoryService, mrpForecastModelService, mrpForecastRunService, mrpForecastLineService, mrpProductPolicyService, mrpMpsPlanService, mrpMpsLineService, mrpForecastingAnalyticsService } from './MrpForecastingService';
export type { MrpDemandHistoryRecord, MrpForecastModelRecord, MrpForecastRunRecord, MrpMpsPlanRecord, MrpMpsLineRecord } from './MrpForecastingService';

// 🏭 بوابة التصنيع MRP — الوحدة 03: Production Planning & Work Orders
export { mrpRunService, mrpPlannedOrderService, mrpWorkOrderService, mrpWorkOrderMaterialService, mrpWorkOrderOperationService, mrpDispatchService, mrpPlanningAnalyticsService } from './MrpPlanningService';
export type { MrpRunRecord, MrpPlannedOrderRecord, MrpWorkOrderRecord, MrpWorkOrderMaterialRecord, MrpWorkOrderOperationRecord } from './MrpPlanningService';

// 🏭 بوابة التصنيع MRP — الوحدة 04: Manufacturing Inventory & WIP
export { mrpInventoryValuationPolicyService, mrpWipLocationService, mrpWipMovementService, mrpLotTraceService, mrpInventoryOptimizationService, mrpInventoryAnalyticsService } from './MrpInventoryService';

// 🏭 بوابة التصنيع MRP — الوحدة 05: Procurement Integration
export { mrpProcurementRecommendationService, mrpSupplierTcoService, mrpProcurementAlertService, mrpProcurementAnalyticsService } from './MrpProcurementService';

// 🏭 بوابة التصنيع MRP — الوحدة 06: Quality Management
export { mrpQualityPlanService, mrpQualityChecklistService, mrpQualityInspectionService, mrpAqlService, mrpNcrService, mrpCapaService, mrpCalibrationService, mrpSpcService, mrpQuarantineService, mrpQualityAnalyticsService } from './MrpQualityService';

// 🆕 بوابة التصنيع MRP — Unit 07: Shop Floor Control & MES
export { mrpWorkstationService, mrpTerminalSessionService, mrpShopFloorExecutionService, mrpDowntimeService, mrpDowntimeReasonService, mrpLaborAssignmentService, mrpAndonService, mrpMaintenanceBridgeService, mrpOeeService, mrpShopFloorAnalyticsService } from './MrpShopFloorService';

// 🆕 بوابة التصنيع MRP — Unit 08: Maintenance / CMMS
export { mrpMaintenanceAssetService, mrpPmPlanService, mrpMaintenanceWorkOrderService, mrpMaintenanceSparePartService, mrpConditionMonitoringService, mrpAnnualShutdownService, mrpMaintenanceAnalyticsService } from './MrpMaintenanceService';

// 🆕 بوابة التصنيع MRP — Unit 09: Manufacturing Costing
export { mrpCostElementService, mrpCostingProfileService, mrpStandardCostService, mrpCostRollupService, mrpActualCostingService, mrpWipCostService, mrpCostPostingService, mrpCostingAnalyticsService } from './MrpCostingService';

// 🆕 بوابة التصنيع MRP — Unit 10: Manufacturing Analytics
export { mrpManufacturingKpiTargetService, mrpManufacturingSnapshotService, mrpManufacturingAlertService, mrpManufacturingRcaService, mrpManufacturingReportService, mrpManufacturingAnalyticsService } from './MrpAnalyticsService';
