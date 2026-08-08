/**
 * ════════════════════════════════════════════════════════════════
 *  SuccessionPlanningService — تخطيط التعاقب (migration 0361)
 *
 *  ★★★ الأعطال التي يُصلحها — كلها مُثبتة تشغيلياً على Postgres 17
 *      قبل كتابة سطر واحد (المسبار: tools/dev/_probe_0361.sql):
 *
 *  ① ★★★ **«جاهز الآن» يُقصى من العرض دائماً.**
 *     `findByPosition` تُرتّب `orderBy:'readiness_level', ascending:true`
 *     والصفحة تعرض `.slice(0, 3)`. الترتيب **أبجديّ**:
 *        future_potential < ready_12_months < ready_6_months < ready_now
 *     ⇒ `ready_now` **رابعاً** فلا يظهر أبداً. صفحةٌ اسمها «تخطيط
 *       التعاقب» تُخفي الخليفة الجاهز وتعرض «موهبة مستقبلية» مكانه.
 *
 *  ②/③ **`incumbent_employee_id` بلا FK** — شاغلٌ معدوم (PROBE_1) أو
 *     من **مستأجرٍ آخر** (PROBE_3) كان يُقبل. والصفحة تعرض «غير محدد»
 *     لأن `employeeMap` لا تحويه ⇒ التسريب صامت.
 *  ④/⑤ **`succession_candidates.employee_id` بلا FK** كذلك.
 *  ⑥ **مرشّحٌ على منصبٍ في مستأجرٍ آخر** (PROBE_6) ⇒ قُبِل.
 *  ⑦ ★★★ **الموظف مرشَّحٌ لخلافة نفسه** (PROBE_7) ⇒ قُبِل بدرجة 100.
 *     خطة تعاقبٍ خليفتها هو الشاغل نفسه = لا خطة إطلاقاً.
 *  ⑧ **`readiness_score` يناقض `readiness_level`**: «جاهز الآن» بدرجة
 *     3 (PROBE_8) ⇒ قُبِل. الشريط يعرض 3% والنصّ «جاهز الآن».
 *  ⑨ **`readiness_score` يقبل NULL** و`?? 0` في الصفحة يُخفي غياب
 *     القياس ⇒ غير المُقيَّم يبدو صفرَ جاهزية (درس 0353).
 *  ⑩ **الحذف النهائيّ نجح** بدور `authenticated` حقيقيّ (PROBE_10).
 *  ⑪ ★★★ **حذف المنصب يُبيد كل مرشّحيه** (`ON DELETE CASCADE`) —
 *     PROBE_11: منصبٌ بمرشّحَين ⇒ صفر مرشّح بلا تحذير.
 *  ⑫ **`status='closed'` بلا أثر** (PROBE_12): المغلق في العدّ.
 *     ★ و`findActive()` موجودة في الخدمة القديمة والصفحة لا تستدعيها.
 *  ⑬ **`candidate.status='inactive'` بلا أثر** (PROBE_13).
 *  ⑭ ★★★ **N+1 نداءً**: `positionRows.map(p => findByPosition(p.id))`
 *     PROBE_14: 3 مناصب ⇒ 1+3. بمئة منصبٍ ⇒ 101.
 *  ⑮ **`succession_development_plans` جدولٌ حيٌّ بلا مستعمل** — صفر
 *     صفّ، والخدمة مُصدَّرة ولا يستوردها أيّ ملف.
 *  ⑯ **صفر دالة في المنظومة** (PROBE_18) — كل المنطق في المتصفّح.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError } from './BaseService';

/** ★ مستويات الجاهزية — مطابِقة لـ`succession_candidates_readiness_level_check` */
export const READINESS_LEVELS = [
  'ready_now', 'ready_6_months', 'ready_12_months', 'future_potential',
] as const;
export type ReadinessLevel = (typeof READINESS_LEVELS)[number];

/** ★ مستويات الخطر — مطابِقة لـ`critical_positions_risk_level_check` */
export const RISK_LEVELS = ['critical', 'high', 'medium', 'low'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const POSITION_STATUSES = ['active', 'closed'] as const;
export type PositionStatus = (typeof POSITION_STATUSES)[number];

export const READINESS_AR: Record<ReadinessLevel, string> = {
  ready_now:        'جاهز الآن',
  ready_6_months:   'جاهز خلال 6 أشهر',
  ready_12_months:  'جاهز خلال 12 شهراً',
  future_potential: 'موهبة مستقبلية',
};

export const READINESS_TONE: Record<ReadinessLevel, string> = {
  ready_now:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  ready_6_months:   'bg-blue-50 text-blue-700 border-blue-200',
  ready_12_months:  'bg-amber-50 text-amber-700 border-amber-200',
  future_potential: 'bg-slate-100 text-slate-600 border-slate-200',
};

export const RISK_AR: Record<RiskLevel, string> = {
  critical: 'حرج',
  high:     'عالٍ',
  medium:   'متوسط',
  low:      'منخفض',
};

export const RISK_TONE: Record<RiskLevel, string> = {
  critical: 'bg-red-50 text-red-700 border-red-200',
  high:     'bg-orange-50 text-orange-700 border-orange-200',
  medium:   'bg-blue-50 text-blue-700 border-blue-200',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
};

/**
 * ★★★ العطل ①: الحدّ الأدنى للدرجة عند كل مستوى — مطابِق لـ
 *    `succession_candidates_score_level_chk` ولحارس
 *    `SUCCESSION_SCORE_LEVEL_MISMATCH`.
 */
export const READINESS_MIN_SCORE: Record<ReadinessLevel, number> = {
  ready_now:        80,
  ready_6_months:   60,
  ready_12_months:  40,
  future_potential: 0,
};

/**
 * ★★★ رتبة الجاهزية المنطقية — 1 = الأجهز.
 *   الترتيب الأبجديّ كان يضع `ready_now` **آخراً** فيُقصيه
 *   `slice(0,3)` في الواجهة. مطابِقة لـ`succession_readiness_rank()`.
 */
export const READINESS_RANK: Record<ReadinessLevel, number> = {
  ready_now:        1,
  ready_6_months:   2,
  ready_12_months:  3,
  future_potential: 4,
};

export const readinessLabel = (l: string): string =>
  READINESS_AR[l as ReadinessLevel] ?? l;
export const readinessTone = (l: string): string =>
  READINESS_TONE[l as ReadinessLevel]
  ?? 'bg-slate-100 text-slate-600 border-slate-200';
export const riskLabel = (r: string): string =>
  RISK_AR[r as RiskLevel] ?? r;
export const riskTone = (r: string): string =>
  RISK_TONE[r as RiskLevel] ?? 'bg-slate-100 text-slate-600 border-slate-200';
export const minScoreFor = (l: string): number =>
  READINESS_MIN_SCORE[l as ReadinessLevel] ?? 0;

export interface SuccessionCandidate {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  level: ReadinessLevel | string;
  /** 1 = الأجهز — يأتي مرتَّباً من القاعدة */
  rank: number;
  score: number;
  strengths: string | null;
  gaps: string | null;
  notes: string | null;
}

export interface SuccessionPositionRow {
  id: string;
  title: string;
  riskLevel: RiskLevel | string;
  status: PositionStatus | string;
  department: string;
  incumbentId: string | null;
  incumbentName: string;
  businessImpact: string | null;
  requiredSkills: string[];
  candidatesTotal: number;
  readyNow: number;
  /** ★ `null` = لا مرشّح — لا «أسوأ رتبة» (درس 0353) */
  bestRank: number | null;
  /** ★ `null` = لا مرشّح — لا «صفر جاهزية» */
  avgScore: number | null;
  candidates: SuccessionCandidate[];
  createdAt: string | null;
}

export interface SuccessionSummary {
  positions: number;
  closed: number;
  highRisk: number;
  readyNow: number;
  uncovered: number;
  /** ★★ المكشوف **والحرج** — الرقم الذي يهمّ فعلاً */
  criticalUncovered: number;
  candidates: number;
  avgScore: number | null;
}

export interface PositionInput {
  id?: string | null;
  title: string;
  departmentId?: string | null;
  incumbentId?: string | null;
  riskLevel: RiskLevel;
  businessImpact?: string | null;
  requiredSkills?: string[] | null;
}

export interface NominateInput {
  positionId: string;
  employeeId: string;
  level: ReadinessLevel;
  score: number;
  strengths?: string | null;
  gaps?: string | null;
  notes?: string | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
/** ★ يحفظ التمييز بين «صفر» و«غير مُقاس» (درس 0353) */
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);

/** ★ فكّ مصفوفة المرشّحين من JSONB بلا `as any` */
function parseCandidates(v: unknown): SuccessionCandidate[] {
  if (!Array.isArray(v)) return [];
  return (v as Raw[]).map((c) => ({
    id:           str(c.id),
    employeeId:   str(c.employeeId),
    employeeName: str(c.employeeName),
    employeeCode: str(c.employeeCode),
    level:        str(c.level),
    rank:         num(c.rank),
    score:        num(c.score),
    strengths:    strOrNull(c.strengths),
    gaps:         strOrNull(c.gaps),
    notes:        strOrNull(c.notes),
  }));
}

class SuccessionPlanningSdk {
  /** ملخّص التعاقب — محسوب في القاعدة (staff فقط) */
  async summary(): Promise<SuccessionSummary> {
    const { data, error } = await supabase.rpc('succession_summary');
    if (error) {
      logger.error('succession_summary فشل: ' + error.message, {
        component: 'SuccessionPlanningSdk', action: 'summary',
      });
      throw SdkError.fromSupabaseError(error);
    }
    const r = ((data ?? []) as Raw[])[0] ?? {};
    return {
      positions:         num(r.out_positions),
      closed:            num(r.out_closed),
      highRisk:          num(r.out_high_risk),
      readyNow:          num(r.out_ready_now),
      uncovered:         num(r.out_uncovered),
      criticalUncovered: num(r.out_critical_uncovered),
      candidates:        num(r.out_candidates),
      avgScore:          numOrNull(r.out_avg_score),
    };
  }

  /**
   * لوح التعاقب — المنصب ومرشّحوه في استعلام واحد.
   *
   * ★ العطل ⑭: النسخة السابقة نفّذت 1+N نداءً شبكياً وجلبت كل
   *   الموظفين وكل الأقسام لبناء `Map` في المتصفّح.
   * ★★★ العطل ①: المرشّحون يأتون مرتَّبين **بالجاهزية المنطقية**
   *   (`ready_now` أولاً) لا الأبجدية.
   * ★ العطلان ⑫/⑬: المنصب المغلق والمرشّح المعطَّل خارج الحساب.
   */
  async board(
    search?: string | null,
    risk?: RiskLevel | null,
    status: PositionStatus | null = 'active',
    limit = 200,
  ): Promise<SuccessionPositionRow[]> {
    const { data, error } = await supabase.rpc('succession_board', {
      p_search: search ?? null,
      p_risk:   risk ?? null,
      p_status: status,
      p_limit:  limit,
    });
    if (error) {
      logger.error('succession_board فشل: ' + error.message, {
        component: 'SuccessionPlanningSdk', action: 'board',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:              str(r.out_id),
      title:           str(r.out_title),
      riskLevel:       str(r.out_risk_level),
      status:          str(r.out_status),
      department:      str(r.out_department),
      incumbentId:     strOrNull(r.out_incumbent_id),
      incumbentName:   str(r.out_incumbent_name),
      businessImpact:  strOrNull(r.out_business_impact),
      requiredSkills:  Array.isArray(r.out_required_skills)
        ? (r.out_required_skills as unknown[]).map(str) : [],
      candidatesTotal: num(r.out_candidates_total),
      readyNow:        num(r.out_ready_now),
      bestRank:        numOrNull(r.out_best_rank),
      avgScore:        numOrNull(r.out_avg_score),
      candidates:      parseCandidates(r.out_candidates),
      createdAt:       strOrNull(r.out_created_at),
    }));
  }

  /**
   * إنشاء منصبٍ حرج أو تعديله.
   *
   * ★ العطلان ②/③: الشاغل والقسم من المستأجر نفسه حتماً —
   *   `SUCCESSION_INCUMBENT_NOT_FOUND` · `SUCCESSION_DEPARTMENT_NOT_FOUND`.
   */
  async savePosition(input: PositionInput): Promise<string> {
    const { data, error } = await supabase.rpc('succession_position_upsert', {
      p_id:         input.id ?? null,
      p_title:      input.title,
      p_department: input.departmentId ?? null,
      p_incumbent:  input.incumbentId ?? null,
      p_risk:       input.riskLevel,
      p_impact:     input.businessImpact ?? null,
      p_skills:     input.requiredSkills ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /**
   * ترشيح خليفة.
   *
   * ★★★ العطل ⑦: الشاغل لا يخلف نفسه — `SUCCESSION_SELF_NOMINATION`.
   * ★★ العطل ⑧: الدرجة تتّسق مع المستوى —
   *   `SUCCESSION_SCORE_LEVEL_MISMATCH`.
   * ★ إعادة الترشيح **تُحدِّث** ولا تُكرِّر (الفرادة قائمة في القاعدة).
   */
  async nominate(input: NominateInput): Promise<string> {
    const { data, error } = await supabase.rpc('succession_candidate_nominate', {
      p_position:  input.positionId,
      p_employee:  input.employeeId,
      p_level:     input.level,
      p_score:     input.score,
      p_strengths: input.strengths ?? null,
      p_gaps:      input.gaps ?? null,
      p_notes:     input.notes ?? null,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /** ★ العطل ⑬: الإلغاء بدل الحذف — الترشيح دليلٌ تقييميّ */
  async setCandidateStatus(
    candidateId: string, status: 'active' | 'inactive',
  ): Promise<string> {
    const { data, error } = await supabase.rpc('succession_candidate_set_status', {
      p_id: candidateId, p_status: status,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }

  /** ★ العطل ⑫: الإغلاق بدل الحذف */
  async setPositionStatus(
    positionId: string, status: PositionStatus,
  ): Promise<string> {
    const { data, error } = await supabase.rpc('succession_position_close', {
      p_id: positionId, p_status: status,
    });
    if (error) throw SdkError.fromSupabaseError(error);
    return str(data);
  }
}

export const successionPlanningSdk = new SuccessionPlanningSdk();
export default successionPlanningSdk;
