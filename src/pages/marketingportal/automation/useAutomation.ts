/**
 * ═════════════════════════════════════════════════════════════════════════
 *  useAutomation — خطافات بيانات وحدة أتمتة التسويق
 *  تغلّف خدمات SDK وتوفّر حالة تحميل/خطأ + إعادة تحميل.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from 'react';
import {
  marketingLeadService, leadScoreRuleService, marketingWorkflowService,
  workflowStepService, workflowEnrollmentService, marketingActionLogService,
  marketingAnalyticsService,
  type MarketingLead, type LeadScoreRule, type MarketingWorkflow,
  type WorkflowStep, type WorkflowEnrollment, type ActionLogEntry,
  type MarketingKpiSummary,
} from '../../../services/sdk';

interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

function useAsync<T>(loader: () => Promise<T>, initial: T, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const run = useCallback(loader, deps); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    run()
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : 'حدث خطأ'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [run, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export function useLeads() {
  return useAsync<MarketingLead[]>(() => marketingLeadService.findAll({ orderBy: 'score', ascending: false }), []);
}

export function useScoreRules() {
  return useAsync<LeadScoreRule[]>(() => leadScoreRuleService.listRules(), []);
}

export function useWorkflows() {
  return useAsync<MarketingWorkflow[]>(() => marketingWorkflowService.listWorkflows(), []);
}

export function useWorkflowSteps(workflowId: string | null) {
  return useAsync<WorkflowStep[]>(
    () => (workflowId ? workflowStepService.listForWorkflow(workflowId) : Promise.resolve([])),
    [],
    [workflowId],
  );
}

export function useEnrollments(workflowId: string | null) {
  return useAsync<WorkflowEnrollment[]>(
    () => (workflowId ? workflowEnrollmentService.listForWorkflow(workflowId) : Promise.resolve([])),
    [],
    [workflowId],
  );
}

export function useActionLog() {
  return useAsync<ActionLogEntry[]>(() => marketingActionLogService.listRecent(80), []);
}

export function useKpis() {
  return useAsync<MarketingKpiSummary>(
    () => marketingAnalyticsService.summary(),
    {
      totalLeads: 0,
      byTemperature: { cold: 0, warm: 0, hot: 0, sales_ready: 0 },
      byPipeline: { not_contacted: 0, contacted: 0, negotiation: 0, won: 0, lost: 0 },
      activeWorkflows: 0, totalEnrollments: 0, completedEnrollments: 0, actionsSent: 0,
      openRate: 0, clickThroughRate: 0, unsubscribeRate: 0, workflowCompletionRate: 0,
    },
    [],
  );
}

/** تسميات عربية موحّدة */
export const TEMPERATURE_LABEL: Record<string, string> = {
  cold: 'بارد', warm: 'دافئ', hot: 'ساخن', sales_ready: 'جاهز للمبيعات',
};
export const TEMPERATURE_COLOR: Record<string, string> = {
  cold: 'bg-sky-50 text-sky-600 border-sky-200',
  warm: 'bg-amber-50 text-amber-600 border-amber-200',
  hot: 'bg-orange-50 text-orange-600 border-orange-200',
  sales_ready: 'bg-emerald-50 text-emerald-600 border-emerald-200',
};
export const PIPELINE_LABEL: Record<string, string> = {
  not_contacted: 'لم يُتواصل', contacted: 'تم التواصل', negotiation: 'تفاوض', won: 'مغلقة (فوز)', lost: 'خسارة',
};
export const JOURNEY_LABEL: Record<string, string> = {
  awareness: 'الوعي', consideration: 'الاهتمام', purchase: 'الشراء',
  onboarding: 'التأهيل', retention: 'الاستبقاء', expansion: 'التوسع',
};
export const CAMPAIGN_LABEL: Record<string, string> = {
  custom: 'مخصّص', welcome: 'ترحيب', nurturing: 'تغذية',
  re_engagement: 'استعادة', post_purchase: 'ما بعد الشراء', abandoned_cart: 'عربة متروكة',
};
export const TRIGGER_LABEL: Record<string, string> = {
  time_based: 'زمني', behavioral: 'سلوكي', data_based: 'بيانات', negative: 'سلبي',
};
export const ACTION_LABEL: Record<string, string> = {
  send_email: 'إرسال بريد', send_sms: 'إرسال SMS', send_whatsapp: 'إرسال واتساب',
  create_task: 'إنشاء مهمة', update_field: 'تحديث حقل', add_tag: 'إضافة وسم',
  remove_tag: 'إزالة وسم', change_pipeline_stage: 'تغيير المرحلة', internal_notification: 'إشعار داخلي',
  retargeting_ad: 'إعلان Retargeting',
};
export const WF_STATUS_LABEL: Record<string, string> = {
  draft: 'مسودة', active: 'نشط', paused: 'متوقف', archived: 'مؤرشف',
};
