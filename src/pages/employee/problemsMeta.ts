/**
 * ════════════════════════════════════════════════════════════════
 *  problemsMeta — بيانات عرض البلاغات المشتركة بين الشاشتين
 *
 *  ★ 0341: كانت `STATUS_CONFIG` و`SEVERITY_CONFIG` و`CATEGORIES`
 *    معرَّفةً داخل `ProblemsList` وحدها. بعد تقسيم الشاشة إلى
 *    `MyProblemsPage` و`HrProblemsInboxPage` صار تكرارها يعني
 *    تباعدهما مع الوقت — وهو نفس نمط العطل الذي نُصلحه في البيانات.
 *
 *  ★ القيم مطابقة لقيود القاعدة المُحقَّقة من `pg_constraint`:
 *      incidents_status_check   : pending·in_progress·resolved·closed
 *      incidents_severity_check : low·medium·high·critical
 *      incidents_category_check : technical·hr·management·workplace·
 *                                 salary·safety·other
 *    أي قيمة خارجها ترفضها القاعدة، فالبحث بالمفتاح آمن — لكن نستعمل
 *    `??` احتياطاً لئلا تنهار الشاشة لو تغيّر القيد يوماً.
 * ════════════════════════════════════════════════════════════════
 */

export type IncidentStatusKey = 'pending' | 'in_progress' | 'resolved' | 'closed';
export type IncidentSeverityKey = 'low' | 'medium' | 'high' | 'critical';

type BadgeVariant = 'warning' | 'info' | 'success' | 'neutral' | 'danger';

export const STATUS_META: Record<IncidentStatusKey, {
  label: string; variant: BadgeVariant; color: string; bg: string;
}> = {
  pending:     { label: 'معلّقة',       variant: 'warning', color: 'text-amber-600',   bg: 'bg-amber-50' },
  in_progress: { label: 'قيد المعالجة', variant: 'info',    color: 'text-blue-600',    bg: 'bg-blue-50' },
  resolved:    { label: 'محلولة',       variant: 'success', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  closed:      { label: 'مغلقة',        variant: 'neutral', color: 'text-slate-600',   bg: 'bg-slate-50' },
};

export const SEVERITY_META: Record<string, {
  label: string; variant: BadgeVariant; bar: string;
}> = {
  low:      { label: 'منخفضة', variant: 'success', bar: 'bg-emerald-500' },
  medium:   { label: 'متوسطة', variant: 'warning', bar: 'bg-amber-500' },
  high:     { label: 'عالية',  variant: 'danger',  bar: 'bg-orange-500' },
  critical: { label: 'حرجة',   variant: 'danger',  bar: 'bg-red-500' },
};

export const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  technical:  { label: 'تقني',        icon: '💻' },
  hr:         { label: 'موارد بشرية', icon: '👥' },
  management: { label: 'إدارة',       icon: '📊' },
  workplace:  { label: 'بيئة عمل',    icon: '🏢' },
  salary:     { label: 'رواتب',       icon: '💰' },
  safety:     { label: 'سلامة',       icon: '🛡️' },
  other:      { label: 'أخرى',        icon: '📝' },
};

/**
 * ★ الانتقالات المشروعة — **نسخة طبق الأصل** من `set_incident_status`
 *   في migration 0341. تُستعمل لعرض الأزرار الممكنة فقط، والقاعدة هي
 *   الحَكَم. أي اختلاف بينهما يعني زرّاً يفشل — يحرسه اختبار العقد.
 */
export const STATUS_TRANSITIONS: Record<IncidentStatusKey, IncidentStatusKey[]> = {
  pending:     ['in_progress', 'resolved', 'closed'],
  in_progress: ['resolved', 'closed', 'pending'],
  resolved:    ['closed', 'in_progress'],
  closed:      ['in_progress'],
};
