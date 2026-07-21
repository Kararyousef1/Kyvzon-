/**
 * ════════════════════════════════════════════════════════════════════════════
 *  MarketingSurveysService — خدمة وحدة الاستبيانات والتغذية الراجعة (التقرير 6)
 *
 *  يغلّف جداول ودوال migration 0162:
 *    • marketing_surveys / mkt_survey_questions → الاستبيانات وأسئلتها
 *    • mkt_survey_responses / mkt_survey_answers → الاستجابات والإجابات
 *    • mkt_survey_certificates                   → شهادات اختبارات الموظفين
 *
 *  الدوال (RPC): submit_survey_response (تحسب NPS/CSAT/CES + تصحيح + شهادة + CRM)
 *                · close_survey_loop · survey_kpis · nps_category_for.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { BaseService, getCurrentTenantId } from './BaseService';
import { supabase } from '../supabase/supabase';

export type SurveyType = 'nps' | 'csat' | 'ces' | 'post_purchase' | 'product' | 'churn' | 'market_research' | 'employee' | 'quiz' | 'custom';
export type SurveyStatus = 'draft' | 'active' | 'closed';
export type QuestionType = 'nps' | 'csat' | 'ces' | 'likert' | 'rating' | 'multiple_choice' | 'single_choice' | 'text' | 'yes_no' | 'number';
export type NpsCategory = 'promoter' | 'passive' | 'detractor';
export type LoopStatus = 'open' | 'assigned' | 'resolved' | 'not_needed';
export type SurveyChannel = 'email' | 'in_app' | 'sms' | 'whatsapp' | 'link';

export interface MarketingSurvey {
  id: string; tenant_id: string; name: string; description: string | null;
  survey_type: SurveyType; status: SurveyStatus;
  is_quiz: boolean; pass_score: number | null; issues_certificate: boolean;
  created_by: string | null; created_at: string; updated_at: string;
}
export interface MarketingSurveyInput {
  name: string; description?: string | null; survey_type?: SurveyType; status?: SurveyStatus;
  is_quiz?: boolean; pass_score?: number | null; issues_certificate?: boolean;
}

export interface SurveyQuestion {
  id: string; tenant_id: string; survey_id: string; order_index: number;
  question_type: QuestionType; question_text: string; is_required: boolean;
  options: string[]; correct_answer: string | null; points: number; created_at: string;
}
export interface SurveyQuestionInput {
  survey_id: string; order_index: number; question_type: QuestionType; question_text: string;
  is_required?: boolean; options?: string[]; correct_answer?: string | null; points?: number;
}

export interface SurveyResponse {
  id: string; tenant_id: string; survey_id: string; lead_id: string | null; employee_id: string | null;
  respondent_name: string | null; respondent_email: string | null; channel: SurveyChannel;
  nps_score: number | null; nps_category: NpsCategory | null; csat_score: number | null; ces_score: number | null;
  quiz_score: number | null; quiz_passed: boolean | null;
  loop_status: LoopStatus; assigned_to: string | null; is_complete: boolean;
  submitted_at: string | null; created_at: string;
}
export interface SurveyAnswerInput { question_id: string; text?: string | null; number?: number | null; }

export interface SurveyCertificate {
  id: string; tenant_id: string; survey_id: string; response_id: string;
  recipient_name: string; score: number; certificate_no: string; issued_at: string;
}

export interface SurveyKpis {
  responses: number; complete: number;
  promoters: number; passives: number; detractors: number; nps: number;
  csatAvg: number; cesAvg: number; openDetractors: number;
}

// ════════════════════════════════════════════════════════════════════════════
//  الخدمات
// ════════════════════════════════════════════════════════════════════════════

class SurveyService extends BaseService<MarketingSurvey> {
  constructor() { super('marketing_surveys'); }
  listSurveys() { return this.findAll({ orderBy: 'created_at', ascending: false }); }
  createSurvey(input: MarketingSurveyInput) { return this.create(input as Partial<MarketingSurvey>); }
  setStatus(id: string, status: SurveyStatus) { return this.update(id, { status } as Partial<MarketingSurvey>); }

  async listQuestions(surveyId: string): Promise<SurveyQuestion[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('mkt_survey_questions').select('*').eq('survey_id', surveyId).order('order_index', { ascending: true });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as SurveyQuestion[];
  }
  async addQuestion(input: SurveyQuestionInput): Promise<SurveyQuestion> {
    const tenantId = getCurrentTenantId();
    const { data, error } = await supabase.from('mkt_survey_questions').insert({ ...input, tenant_id: tenantId }).select().single();
    if (error) throw new Error(error.message);
    return data as SurveyQuestion;
  }
}

class SurveyResponseService {
  /** إرسال استجابة (يحسب المقاييس + تصحيح الاختبار + الشهادة + ربط CRM) */
  async submit(params: { surveyId: string; answers: SurveyAnswerInput[]; leadId?: string | null; name?: string; email?: string; channel?: SurveyChannel }): Promise<string> {
    const answersPayload = params.answers.map((a) => ({ question_id: a.question_id, text: a.text ?? null, number: a.number != null ? String(a.number) : null }));
    const { data, error } = await supabase.rpc('submit_survey_response', {
      p_survey_id: params.surveyId, p_answers: answersPayload,
      p_lead_id: params.leadId ?? null, p_name: params.name ?? null, p_email: params.email ?? null, p_channel: params.channel ?? 'link',
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async listForSurvey(surveyId: string): Promise<SurveyResponse[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('mkt_survey_responses').select('*').eq('survey_id', surveyId).order('created_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as SurveyResponse[];
  }

  /** إغلاق الحلقة: تعيين/حل استجابة منتقد */
  async closeLoop(responseId: string, action: 'assign' | 'resolve', assignee?: string): Promise<void> {
    const { error } = await supabase.rpc('close_survey_loop', { p_response_id: responseId, p_action: action, p_assignee: assignee ?? null });
    if (error) throw new Error(error.message);
  }

  async kpis(surveyId: string): Promise<SurveyKpis> {
    const { data, error } = await supabase.rpc('survey_kpis', { p_survey_id: surveyId });
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) || {};
    return {
      responses: Number(row.responses || 0), complete: Number(row.complete || 0),
      promoters: Number(row.promoters || 0), passives: Number(row.passives || 0), detractors: Number(row.detractors || 0),
      nps: Number(row.nps || 0), csatAvg: Number(row.csat_avg || 0), cesAvg: Number(row.ces_avg || 0),
      openDetractors: Number(row.open_detractors || 0),
    };
  }

  /** تحليل مشاعر إجمالي للأسئلة النصية (للـ Text Analytics) */
  async sentimentBreakdown(surveyId: string): Promise<{ positive: number; neutral: number; negative: number }> {
    const tenantId = getCurrentTenantId();
    // 1) استجابات الاستبيان
    let rq = supabase.from('mkt_survey_responses').select('id').eq('survey_id', surveyId);
    if (tenantId) rq = rq.eq('tenant_id', tenantId);
    const { data: rData, error: rErr } = await rq;
    if (rErr) return { positive: 0, neutral: 0, negative: 0 };
    const respIds = ((rData || []) as Array<{ id: string }>).map((r) => r.id);
    if (respIds.length === 0) return { positive: 0, neutral: 0, negative: 0 };
    // 2) مشاعر الإجابات النصية لتلك الاستجابات
    let aq = supabase.from('mkt_survey_answers').select('sentiment').in('response_id', respIds).not('sentiment', 'is', null);
    if (tenantId) aq = aq.eq('tenant_id', tenantId);
    const { data: aData, error: aErr } = await aq;
    if (aErr) return { positive: 0, neutral: 0, negative: 0 };
    const rows = (aData || []) as Array<{ sentiment: string }>;
    return {
      positive: rows.filter((r) => r.sentiment === 'positive').length,
      neutral: rows.filter((r) => r.sentiment === 'neutral').length,
      negative: rows.filter((r) => r.sentiment === 'negative').length,
    };
  }

  async certificatesForSurvey(surveyId: string): Promise<SurveyCertificate[]> {
    const tenantId = getCurrentTenantId();
    let q = supabase.from('mkt_survey_certificates').select('*').eq('survey_id', surveyId).order('issued_at', { ascending: false });
    if (tenantId) q = q.eq('tenant_id', tenantId);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data || []) as SurveyCertificate[];
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  مكتبة القوالب (من التقرير) + الثوابت المرجعية
// ════════════════════════════════════════════════════════════════════════════

export interface SurveyTemplate {
  key: string; name: string; type: SurveyType;
  questions: Array<Omit<SurveyQuestionInput, 'survey_id'>>;
}

export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    key: 'nps', name: 'NPS — صافي الترويج', type: 'nps',
    questions: [
      { order_index: 0, question_type: 'nps', question_text: 'ما مدى احتمال أن توصي بـ Kyvzon لصديق أو زميل؟ (0-10)' },
      { order_index: 1, question_type: 'text', question_text: 'ما السبب الرئيسي لتقييمك؟' },
    ],
  },
  {
    key: 'csat', name: 'CSAT — رضا العملاء', type: 'csat',
    questions: [
      { order_index: 0, question_type: 'csat', question_text: 'كيف تقيّم تجربتك مع خدمتنا اليوم؟ (1-5)' },
      { order_index: 1, question_type: 'text', question_text: 'هل هناك أي شيء آخر تريد إخبارنا به؟' },
    ],
  },
  {
    key: 'ces', name: 'CES — جهد العميل', type: 'ces',
    questions: [
      { order_index: 0, question_type: 'ces', question_text: 'كم كان من السهل إتمام هذه المهمة؟ (1 صعب - 7 سهل)' },
    ],
  },
  {
    key: 'post_purchase', name: 'ما بعد الشراء', type: 'post_purchase',
    questions: [
      { order_index: 0, question_type: 'single_choice', question_text: 'ما الذي دفعك للتحول لـ Kyvzon؟', options: ['السعر', 'الميزات', 'التوصية', 'الدعم'] },
      { order_index: 1, question_type: 'text', question_text: 'ماذا كنت تستخدم قبلنا؟' },
    ],
  },
  {
    key: 'churn', name: 'الإلغاء (Churn)', type: 'churn',
    questions: [
      { order_index: 0, question_type: 'single_choice', question_text: 'لماذا قررت الإلغاء؟', options: ['السعر', 'نقص ميزة', 'الدعم', 'انتقلت لمنافس', 'أخرى'] },
      { order_index: 1, question_type: 'text', question_text: 'هل كان هناك شيء يجعلك تبقى؟' },
    ],
  },
  {
    key: 'employee', name: 'رضا الموظفين (eNPS)', type: 'employee',
    questions: [
      { order_index: 0, question_type: 'nps', question_text: 'هل توصي بالعمل في شركتنا لصديق؟ (0-10)' },
      { order_index: 1, question_type: 'likert', question_text: 'ما مدى شعورك بالتقدير في عملك؟', options: ['ضعيف جداً', 'ضعيف', 'متوسط', 'جيد', 'ممتاز'] },
    ],
  },
];

/** تفسير نطاقات NPS (من التقرير) */
export const NPS_INTERPRETATION = [
  { range: 'أقل من 0', label: 'وضع حرج' },
  { range: '0-30', label: 'مقبول' },
  { range: '31-50', label: 'جيد' },
  { range: '51-70', label: 'ممتاز' },
  { range: 'أعلى من 70', label: 'استثنائي' },
];

/** استجابة إغلاق الحلقة حسب الفئة (من التقرير) */
export const LOOP_PLAYBOOK: Record<NpsCategory, { window: string; action: string }> = {
  detractor: { window: 'خلال 48 ساعة', action: 'اتصال شخصي من مدير النجاح لفهم المشكلة وحلّها' },
  passive: { window: 'خلال أسبوع', action: 'تعريفهم بميزة لم يكتشفوها أو دعوة لجلسة تدريب' },
  promoter: { window: 'خلال 3 أيام', action: 'شكر شخصي + طلب مراجعة على G2/Capterra أو شهادة' },
};

export const SURVEY_TYPE_LABEL: Record<SurveyType, string> = {
  nps: 'NPS', csat: 'CSAT', ces: 'CES', post_purchase: 'ما بعد الشراء', product: 'تقييم منتج',
  churn: 'إلغاء', market_research: 'بحث سوق', employee: 'موظفين', quiz: 'اختبار', custom: 'مخصّص',
};

// ════════════════════════════════════════════════════════════════════════════
//  Singletons
// ════════════════════════════════════════════════════════════════════════════
export const marketingSurveyService = new SurveyService();
export const marketingSurveyResponseService = new SurveyResponseService();
