/**
 * ════════════════════════════════════════════════════════════════
 *  HrReportService — تقارير الموارد البشرية (migration 0370)
 *
 *  ★ الصفحة القديمة لم تكن ناقصةً — كانت **تكذب**.
 *
 *  ① ★★★★ **ثلاثةٌ من ثمانية تقاريرَ محتواها الحرفيّ: بيانات تجريبية**
 *     الفرع `else` (ReportsPage.tsx:79–82) يُخرج سطراً واحداً:
 *        rows = [['بيانات تجريبية', '—', '—']]
 *     ويسقط فيه: satisfaction · performance · sentiment.
 *     ثمّ السطر 96: addToast('✅ تم إنشاء التقرير بنجاح').
 *     ⇒ ملفٌّ زائفٌ يُنزَّل والمستخدم يُطمْأَن إليه. وهذا أسوأ من
 *       زرٍّ معطَّل: الزرّ المعطَّل يُعلن عجزه.
 *
 *  ② ★★★★ **تقرير البلاغات يفضح المُبلِّغ المجهول.**
 *     `incidentService.findAll()` يقرأ الجدول خاماً.
 *     PROBE_2 — بلاغٌ بـ`is_anonymous = TRUE`:
 *        employee_name = موظف واحد · department = المالية
 *        reported_by   = 23700002-…
 *     المايجريشن 0338 أصلح هذا **في الدوال**، وطريق التقارير يلتفّ
 *     حول الإصلاح لأنّه لا يمرّ بدالة. الوعدُ يُخلَف من بابٍ خلفيّ.
 *
 *  ③ ★★★★ **تقرير الصحة النفسية: مزاجُ كلّ موظفٍ بمعرّفه وملاحظاته.**
 *     PROBE_1 — ما كان يخرج فعلاً:
 *        02831964-… | terrible | 20 | أفكّر في الاستقالة
 *     ⇒ ملفٌّ على قرصٍ شخصيّ فيه نيّةُ موظفٍ بالاستقالة مقرونةً بمعرّفه.
 *     ★ العلاج: تجميعٌ بالقسم مع حدٍّ أدنى k = 3 **في القاعدة**.
 *
 *  ④ ★★★ **لا أثرَ لأيّ تصدير.** PROBE_4: صفوف التدقيق = 0.
 *     من صدّر بيانات المنشأة ومتى؟ لا سبيل لأن يُعرف.
 *
 *  ⑤ ★★★ **المدير يُصدِّر ملفّاً فارغاً صامتاً.**
 *     الكتالوج يمنح `hr-reports` لـ['hr','admin','manager']
 *     و`current_user_is_staff()` لا تشمل `manager`.
 *     PROBE_7 بدور manager حقيقيّ: wellness=0 · incidents=0.
 *     ⇒ ملفٌّ بترويسةٍ بلا صفوف + «✅ تم بنجاح». الصمت أخطر من المنع.
 *
 *  ⑥ ★★ **تواريخُ 2024 مسمَّرةٌ** في شيفرةٍ تعمل في 2026.
 *  ⑦ ★★★ **لا نطاقَ زمنيّ ولا حدَّ صفوف** — و«معدّل الحضور» يُحسب
 *     على آخر 500 صفٍّ كيفما وقعت. رقمٌ بلا معنى.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر هذه الطبقة.
 * ════════════════════════════════════════════════════════════════
 */
import { supabase } from '../supabase/supabase';
import { logger } from '../utils/logger';
import { SdkError, SdkErrorCode } from './BaseService';

/** ★ فئات التقارير الستّ — مطابِقة لـ`chk_hr_report_def_category` */
export const HR_REPORT_CATEGORIES = [
  'workforce', 'attendance', 'performance', 'safety', 'wellbeing', 'contracts',
] as const;
export type HrReportCategory = (typeof HR_REPORT_CATEGORIES)[number];

export const HR_REPORT_CATEGORY_AR: Record<HrReportCategory, string> = {
  workforce:   'القوى العاملة',
  attendance:  'الحضور والإجازات',
  performance: 'الأداء',
  safety:      'السلامة والبلاغات',
  wellbeing:   'الصحة النفسية',
  contracts:   'العقود',
};

export const HR_REPORT_CATEGORY_TONE: Record<HrReportCategory, string> = {
  workforce:   'bg-indigo-50 text-indigo-700 border-indigo-200',
  attendance:  'bg-sky-50 text-sky-700 border-sky-200',
  performance: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  safety:      'bg-red-50 text-red-700 border-red-200',
  wellbeing:   'bg-rose-50 text-rose-700 border-rose-200',
  contracts:   'bg-amber-50 text-amber-700 border-amber-200',
};

export const hrReportCategoryLabel = (c: string): string =>
  HR_REPORT_CATEGORY_AR[c as HrReportCategory] ?? c;

export const hrReportCategoryTone = (c: string): string =>
  HR_REPORT_CATEGORY_TONE[c as HrReportCategory]
  ?? 'bg-slate-50 text-slate-700 border-slate-200';

/** صفٌّ في كتالوج التقارير */
export interface HrReportDefinitionRow {
  code:          string;
  nameAr:        string;
  descriptionAr: string;
  category:      string;
  columnsAr:     string[];
  needsRange:    boolean;
  /** ★ تقريرٌ يمسّ بياناً حسّاساً — يُنبَّه عليه في الواجهة */
  isSensitive:   boolean;
  lastRunAt:     string | null;
  runs30d:       number;
}

/** صفٌّ من نتيجة التنفيذ — سبعة أعمدةٍ نصّية وإجماليٌّ يكشف الاقتطاع */
export interface HrReportResultRow {
  rowIndex:  number;
  cells:     (string | null)[];
  totalRows: number;
}

/** نتيجة تنفيذٍ كاملة */
export interface HrReportResult {
  code:        string;
  nameAr:      string;
  headers:     string[];
  rows:        string[][];
  /** ★ الإجمالي الحقيقيّ في القاعدة — قد يفوق `rows.length` */
  totalRows:   number;
  /** ★★★ الاقتطاع مكشوفٌ صراحةً لا مُخفىً (العطل ⑦) */
  wasTruncated: boolean;
  dateFrom:    string | null;
  dateTo:      string | null;
  generatedAt: string;
}

/** صفٌّ في سجلّ التصديرات */
export interface HrReportRunRow {
  id:           string;
  reportCode:   string;
  reportName:   string;
  isSensitive:  boolean;
  actorName:    string;
  executedAt:   string | null;
  dateFrom:     string | null;
  dateTo:       string | null;
  rowCount:     number;
  totalRows:    number;
  wasTruncated: boolean;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? '' : String(v));
const strOrNull = (v: unknown): string | null =>
  v == null || String(v) === '' ? null : String(v);
const bool = (v: unknown): boolean => v === true || v === 'true' || v === 't';
const strArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => str(x)) : [];

class HrReportSdk {
  /**
   * كتالوج التقارير — ثمانيةٌ **كلُّها منفَّذة**.
   * ★ كان مصفوفةً مسمَّرةً في TSX ثلاثةٌ من عناصرها بلا أيّ تنفيذ.
   */
  async catalog(): Promise<HrReportDefinitionRow[]> {
    const { data, error } = await supabase.rpc('hr_report_catalog');
    if (error) {
      logger.error('hr_report_catalog فشل: ' + error.message, {
        component: 'HrReportSdk', action: 'catalog',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      code:          str(r.code),
      nameAr:        str(r.name_ar),
      descriptionAr: str(r.description_ar),
      category:      str(r.category),
      columnsAr:     strArray(r.columns_ar),
      needsRange:    bool(r.needs_range),
      isSensitive:   bool(r.is_sensitive),
      lastRunAt:     strOrNull(r.last_run_at),
      runs30d:       num(r.runs_30d),
    }));
  }

  /**
   * تنفيذ تقرير — استعلامٌ واحدٌ في القاعدة.
   *
   * ★★★ الدالة `SECURITY INVOKER` ⇒ RLS ساريةٌ على كلّ جدولٍ تقرؤه،
   *   والأثرُ التدقيقيّ يُكتب داخلها فلا سبيل لتصديرٍ بلا أثر.
   * ★ تُلقي `HR_REPORT_FORBIDDEN` لغير الموارد البشرية والإدارة —
   *   منعٌ مسموعٌ بدل ملفٍّ فارغٍ صامت (العطل ⑤).
   */
  async execute(
    code: string,
    from?: string | null,
    to?: string | null,
    limit = 2000,
  ): Promise<HrReportResult> {
    const def = (await this.catalog()).find((d) => d.code === code);
    if (!def) throw new SdkError(SdkErrorCode.NOT_FOUND, `لا تقريرَ بالرمز ${code}`);

    const { data, error } = await supabase.rpc('hr_report_execute', {
      p_code:  code,
      p_from:  from ?? null,
      p_to:    to ?? null,
      p_limit: limit,
    });
    if (error) {
      logger.error('hr_report_execute فشل: ' + error.message, {
        component: 'HrReportSdk', action: 'execute',
      });
      throw SdkError.fromSupabaseError(error);
    }

    const raw = (data ?? []) as Raw[];
    const width = def.columnsAr.length;
    const cellKeys = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7'];
    const rows = raw.map((r) =>
      cellKeys.slice(0, width).map((k) => str(r[k])));
    // ★ `totalRows` يأتي في كلّ صفّ؛ الصفر الصادق حين لا صفوف
    const totalRows = raw.length > 0 ? num(raw[0].total_rows) : 0;

    return {
      code,
      nameAr:       def.nameAr,
      headers:      def.columnsAr,
      rows,
      totalRows,
      wasTruncated: totalRows > rows.length,
      dateFrom:     def.needsRange ? (from ?? null) : null,
      dateTo:       def.needsRange ? (to ?? null)   : null,
      generatedAt:  new Date().toISOString(),
    };
  }

  /** سجلّ التصديرات — «من صدّر ماذا ومتى» (العطل ④) */
  async runs(limit = 50): Promise<HrReportRunRow[]> {
    const { data, error } = await supabase.rpc('hr_report_run_board', {
      p_limit: limit,
    });
    if (error) {
      logger.error('hr_report_run_board فشل: ' + error.message, {
        component: 'HrReportSdk', action: 'runs',
      });
      throw SdkError.fromSupabaseError(error);
    }
    return ((data ?? []) as Raw[]).map((r) => ({
      id:           str(r.id),
      reportCode:   str(r.report_code),
      reportName:   str(r.report_name),
      isSensitive:  bool(r.is_sensitive),
      actorName:    str(r.actor_name),
      executedAt:   strOrNull(r.executed_at),
      dateFrom:     strOrNull(r.date_from),
      dateTo:       strOrNull(r.date_to),
      rowCount:     num(r.row_count),
      totalRows:    num(r.total_rows),
      wasTruncated: bool(r.was_truncated),
    }));
  }
}

export const hrReportSdk = new HrReportSdk();

/**
 * تحويل نتيجةٍ إلى CSV.
 * ★ BOM لأجل Excel العربيّ، وكلُّ خليّةٍ مُقتبَسةٌ ومُهرَّبة.
 */
export const hrReportToCsv = (result: HrReportResult): string => {
  const esc = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    result.headers.map(esc).join(','),
    ...result.rows.map((r) => r.map(esc).join(',')),
  ];
  return '\ufeff' + lines.join('\r\n');
};

/** اسمُ ملفٍّ يحمل رمز التقرير وتاريخه — لا اسمَ عامّاً مكرَّراً */
export const hrReportFileName = (result: HrReportResult): string => {
  const stamp = result.generatedAt.slice(0, 10);
  const range = result.dateFrom && result.dateTo
    ? `_${result.dateFrom}_${result.dateTo}` : '';
  return `${result.code}${range}_${stamp}.csv`;
};
