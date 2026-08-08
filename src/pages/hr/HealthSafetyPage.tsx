/**
 * HealthSafetyPage — الصحة والسلامة المهنية (HR) · migration 0369
 *
 * ★★★★ **العطل الأول: ثلاثةٌ من أربعة خياراتٍ في «النوع» تُخرج خطأ.**
 *
 *   `incidents_category_check` كان يقبل سبعاً لا فيها `work_injury`
 *   ولا `near_miss` ولا `security_incident` — والصفحة تعرضها في
 *   `<select>`. PROBE_2 بإدراجٍ فعليّ:
 *      safety ⇒ مقبول · work_injury ⇒ **مرفوض** · near_miss ⇒
 *      **مرفوض** · security_incident ⇒ **مرفوض**
 *   ⇒ المستخدم يختار «إصابة عمل» فيفشل التسجيل. عولج بتوسيع CHECK.
 *
 *   ★ و`health_safety` الخامس في `safetyCategories` (السطر 10) لا
 *     وجود له في القائمة ولا في القاعدة — شيفرةٌ ميتة من الطرفين،
 *     أُسقطت.
 *
 * ★ وأعطال `corrective_actions` (جدولٌ عارٍ إلّا من CHECK اثنين):
 *   صفر FK على `owner_id`/`created_by`/`completed_by` · إجراءٌ مربوطٌ
 *   بحادثٍ في مستأجرٍ آخر · `title` من مسافات · **«مكتمل» بلا مُنجِزٍ
 *   ولا لحظة** (وسجلُّ CAPA وثيقةٌ تدقيقية) · **«ملغى» بلا سببٍ ولا
 *   عمودٍ ولا زرّ** · استحقاقٌ في 2018 · **حادثٌ حرجٌ بلا إجراءٍ
 *   تصحيحيّ ولا شيء يكشفه** · **المتأخّر لا يُرصد** · الحذف النهائيّ
 *   مسموح (بينما `incidents` محميٌّ منذ 0338) · **البوّابة على وحدة
 *   `admin` لا `hr`** فالصفحة تنكسر نصفين · **الموظف لا يرى الإجراء
 *   المُسنَد إليه**.
 *
 * ★ وأعطال الصفحة نفسها:
 *   · `useState<any[]>([])` و`(i: any)` في المُرشِّح.
 *   · ثلاثة استعلاماتٍ بلا حدّ + `Map` يدويّ + `orderBy 'full_name_ar'`
 *     على عمودٍ معدومٍ لكل موظف.
 *   · الترشيح كلُّه في المتصفّح بعد جلب **كل** الحوادث.
 *   · `severity` و`category` و`status` تُعرض **نصّاً إنجليزياً خامّاً**.
 *   · `.slice(0, 12)` على الإجراءات — البقيّة تختفي بلا ترقيم.
 *   · `completeAction(...).then(loadData)` **بلا `catch`** — الخطأ يُبتلع.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `occupationalSafetySdk`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ClipboardCheck, Loader2, Plus, Search,
  ShieldAlert, Ban, PlayCircle, Timer, Eye, UserPlus,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { format, parseISO } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  occupationalSafetySdk,
  SAFETY_CATEGORIES, SAFETY_SEVERITIES, SAFETY_STATES,
  CAPA_STATES, CAPA_PRIORITIES,
  safetyCategoryLabel, safetySeverityLabel, safetyStateLabel,
  capaStateLabel, capaPriorityLabel,
  safetySeverityTone, safetyStateTone, capaStateTone, capaPriorityTone,
  isCapaFinal,
} from '../../services/sdk';
import type {
  SafetyIncidentRow, CapaRow, HealthSafetySummary,
  SafetyCategory, SafetySeverity, SafetyState, CapaState, CapaPriority,
} from '../../services/sdk';
import { Modal, DetailRow, FormField, ModalActions, EmployeePicker } from './LoansPage';

/** ★★★ اليوم بتوقيت بغداد — القاعدة تستعمل Asia/Baghdad صراحةً */
function todayBaghdad(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : format(d, 'd MMM yyyy', { locale: ar });
}

const EMPTY_CAPA = {
  incidentId: '',
  title: '',
  description: '',
  priority: 'medium' as CapaPriority,
  ownerId: '',
  dueDate: '',
};

export default function HealthSafetyPage() {
  const { addToast } = useUIStore();

  const [loading, setLoading] = useState(true);
  const [incidents, setIncidents] = useState<SafetyIncidentRow[]>([]);
  const [actions, setActions] = useState<CapaRow[]>([]);
  const [summary, setSummary] = useState<HealthSafetySummary | null>(null);

  const [search, setSearch] = useState('');
  const [sevFilter, setSevFilter] = useState<'all' | SafetySeverity>('all');
  const [capaFilter, setCapaFilter] = useState<'all' | CapaState>('all');

  const [showCapa, setShowCapa] = useState(false);
  const [capaForm, setCapaForm] = useState({ ...EMPTY_CAPA });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [detail, setDetail] = useState<SafetyIncidentRow | null>(null);
  const [capaDetail, setCapaDetail] = useState<CapaRow | null>(null);
  const [completing, setCompleting] = useState<CapaRow | null>(null);
  const [verifyNote, setVerifyNote] = useState('');
  const [cancelling, setCancelling] = useState<CapaRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑰: الترشيح في القاعدة لا في المتصفّح
      const [inc, capa, sum] = await Promise.all([
        occupationalSafetySdk.incidents(
          search.trim() || null, null,
          sevFilter === 'all' ? null : sevFilter, 200,
        ),
        occupationalSafetySdk.actions(
          search.trim() || null,
          capaFilter === 'all' ? null : capaFilter, null, 200,
        ),
        occupationalSafetySdk.summary().catch(() => null),
      ]);
      setIncidents(inc);
      setActions(capa);
      setSummary(sum);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, search, sevFilter, capaFilter]);

  useEffect(() => { load(); }, [load]);

  const handleOpenCapa = async () => {
    if (!capaForm.title.trim()) { addToast('عنوان الإجراء مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await occupationalSafetySdk.openAction({
        incidentId: capaForm.incidentId || null,
        title: capaForm.title,
        description: capaForm.description.trim() || null,
        priority: capaForm.priority,
        ownerId: capaForm.ownerId || null,
        dueDate: capaForm.dueDate || null,
      });
      addToast('تم إنشاء الإجراء التصحيحي', 'success');
      setShowCapa(false);
      setCapaForm({ ...EMPTY_CAPA });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleStart = async (row: CapaRow) => {
    setBusyId(row.id);
    try {
      const done = await occupationalSafetySdk.startAction(row.id);
      addToast(done ? 'بدأ تنفيذ الإجراء' : 'الإجراء ليس مفتوحاً', 'info');
      await load();
    } catch (err) {
      // ★ العطل ⑳ في الصفحة القديمة: `.then(loadData)` بلا catch
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleComplete = async () => {
    if (!completing) return;
    setBusyId(completing.id);
    try {
      await occupationalSafetySdk.completeAction(
        completing.id, verifyNote.trim() || null,
      );
      addToast('أُنجز الإجراء التصحيحي', 'success');
      setCompleting(null);
      setVerifyNote('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★★★ العطل ⑦: زرُّ الإلغاء — لم يكن موجوداً */
  const handleCancel = async () => {
    if (!cancelling) return;
    if (!cancelReason.trim()) { addToast('سبب الإلغاء مطلوب', 'warning'); return; }
    setBusyId(cancelling.id);
    try {
      await occupationalSafetySdk.cancelAction(cancelling.id, cancelReason);
      addToast('أُلغي الإجراء — السجلّ محفوظ', 'success');
      setCancelling(null);
      setCancelReason('');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const gapCount = useMemo(
    () => summary?.incidentsNoCapa ?? incidents.filter((i) => i.needsCapa).length,
    [summary, incidents],
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      {/* ══════════ الترويسة ══════════ */}
      <div className="bg-gradient-to-br from-red-600 to-orange-700 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white/70 text-sm font-semibold">Health &amp; Safety</p>
          <h2 className="text-2xl font-extrabold mt-1">الصحة والسلامة المهنية</h2>
          <p className="text-white/75 mt-2 text-sm">
            حوادث السلامة ومتابعة الإجراءات التصحيحية (CAPA).
          </p>
        </div>
        <button
          onClick={() => { setCapaForm({ ...EMPTY_CAPA }); setShowCapa(true); }}
          className="flex items-center gap-2 bg-white text-red-700 hover:bg-red-50 rounded-xl px-4 py-2.5 font-bold transition-colors"
        >
          <ClipboardCheck size={18} /> إجراء تصحيحي
        </button>
      </div>

      {/* ══════════ ★★★★ لافتة فجوة CAPA ══════════ */}
      {gapCount > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200">
          <ShieldAlert size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-red-900">
              {gapCount} حادثاً جسيماً مفتوحاً بلا إجراءٍ تصحيحيّ
            </p>
            <p className="text-red-700 mt-0.5">
              جوهرُ CAPA أن كل حادثٍ جسيمٍ يُقابله إجراء. افتح إجراءً لكلٍّ
              منها قبل إغلاق الحادث.
            </p>
          </div>
        </div>
      )}

      {(summary?.capaOverdue ?? 0) > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200">
          <Timer size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-bold text-amber-900">
              {summary?.capaOverdue} إجراءً تجاوز موعد استحقاقه
            </p>
            <p className="text-amber-700 mt-0.5">
              الإجراء المتأخّر يعني حادثاً لم يُعالَج فعلياً بعد.
            </p>
          </div>
        </div>
      )}

      {(summary?.capaUnassigned ?? 0) > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <UserPlus size={20} className="text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-slate-700">
            <strong>{summary?.capaUnassigned}</strong> إجراءً مفتوحاً بلا مسؤول.
          </p>
        </div>
      )}

      {/* ══════════ البطاقات ══════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <StatBox label="الحوادث" value={summary?.incidentsTotal ?? 0} tone="bg-red-50 text-red-700" icon={ShieldAlert} />
        <StatBox label="مفتوحة" value={summary?.incidentsOpen ?? 0} tone="bg-amber-50 text-amber-700" icon={AlertTriangle} />
        <StatBox label="جسيمة" value={summary?.incidentsSevere ?? 0} tone="bg-orange-50 text-orange-700" icon={AlertTriangle} />
        <StatBox label="بلا إجراء" value={summary?.incidentsNoCapa ?? 0} tone="bg-rose-100 text-rose-800" icon={ShieldAlert} />
        <StatBox label="إجراءات مفتوحة" value={summary?.capaOpen ?? 0} tone="bg-blue-50 text-blue-700" icon={ClipboardCheck} />
        <StatBox label="متأخّرة" value={summary?.capaOverdue ?? 0} tone="bg-red-50 text-red-700" icon={Timer} />
      </div>

      {/* ══════════ الترشيح ══════════ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في الحوادث والإجراءات…"
            className="w-full pr-9 pl-3 py-2 rounded-lg border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-red-500"
          />
        </div>
        <select
          value={sevFilter}
          onChange={(e) => setSevFilter(e.target.value as 'all' | SafetySeverity)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
        >
          <option value="all">كل الخطورات</option>
          {SAFETY_SEVERITIES.map((s) => (
            <option key={s} value={s}>{safetySeverityLabel(s)}</option>
          ))}
        </select>
        <select
          value={capaFilter}
          onChange={(e) => setCapaFilter(e.target.value as 'all' | CapaState)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-red-500"
        >
          <option value="all">كل حالات الإجراءات</option>
          {CAPA_STATES.map((s) => (
            <option key={s} value={s}>{capaStateLabel(s)}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-red-600" size={36} />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* ══════ حوادث السلامة ══════ */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">
              حوادث السلامة ({incidents.length})
            </h3>
            {incidents.length === 0 ? (
              <EmptyBox text="لا توجد حوادث سلامة" />
            ) : incidents.map((row) => (
              <div key={row.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{row.title}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {row.employeeName} · {fmtDate(row.reportedAt)}
                      {row.ageDays > 0 && ` · منذ ${row.ageDays} يوماً`}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      {/* ★ العطل ⑱: كانت تُعرض نصّاً إنجليزياً خامّاً */}
                      <Badge tone="bg-slate-100 text-slate-600 border-slate-200">
                        {safetyCategoryLabel(String(row.category))}
                      </Badge>
                      <Badge tone={safetySeverityTone(String(row.severity))}>
                        {safetySeverityLabel(String(row.severity))}
                      </Badge>
                      <Badge tone={safetyStateTone(String(row.status))}>
                        {safetyStateLabel(String(row.status))}
                      </Badge>
                      {row.actionsTotal > 0 && (
                        <Badge tone="bg-blue-50 text-blue-700 border-blue-200">
                          {row.actionsOpen}/{row.actionsTotal} إجراء
                        </Badge>
                      )}
                      {/* ★★★★ العطل ⑨ مرئيّاً */}
                      {row.needsCapa && (
                        <Badge tone="bg-rose-100 text-rose-800 border-rose-300">
                          يحتاج إجراءً تصحيحياً
                        </Badge>
                      )}
                      {row.isAnonymous && (
                        <Badge tone="bg-slate-800 text-slate-100 border-slate-700">
                          بلاغٌ مجهول
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => setDetail(row)}
                      className="p-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100"
                      title="التفاصيل"
                    >
                      <Eye size={16} />
                    </button>
                    {row.needsCapa && (
                      <button
                        onClick={() => {
                          setCapaForm({ ...EMPTY_CAPA, incidentId: row.id });
                          setShowCapa(true);
                        }}
                        className="p-2 rounded-lg bg-red-50 text-red-700 hover:bg-red-100"
                        title="إجراء تصحيحي"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* ══════ الإجراءات التصحيحية ══════ */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-700">
              الإجراءات التصحيحية ({actions.length})
            </h3>
            {actions.length === 0 ? (
              <EmptyBox text="لا توجد إجراءات تصحيحية" />
            ) : actions.map((row) => (
              <div key={row.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-900">{row.title}</p>
                    <p className="text-xs text-slate-500 mt-1">
                      {row.ownerName ?? 'بلا مسؤول'}
                      {' · '}{row.dueDate ? fmtDate(row.dueDate) : 'بلا موعد'}
                      {row.incidentTitle && ` · ${row.incidentTitle}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <Badge tone={capaPriorityTone(String(row.priority))}>
                        {capaPriorityLabel(String(row.priority))}
                      </Badge>
                      <Badge tone={capaStateTone(String(row.status))}>
                        {capaStateLabel(String(row.status))}
                      </Badge>
                      {/* ★★★ العطل ⑩ مرئيّاً */}
                      {row.isOverdue && (
                        <Badge tone="bg-red-50 text-red-700 border-red-200">
                          تأخّر {Math.abs(row.daysToDue ?? 0)} يوماً
                        </Badge>
                      )}
                      {!row.isOverdue && !isCapaFinal(String(row.status))
                        && row.daysToDue !== null && (
                        <Badge tone="bg-slate-100 text-slate-600 border-slate-200">
                          متبقٍّ {row.daysToDue} يوماً
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 justify-end">
                    {row.status === 'open' && (
                      <ActionBtn onClick={() => handleStart(row)} busy={busyId === row.id}
                        tone="bg-indigo-50 text-indigo-700 hover:bg-indigo-100" icon={PlayCircle}>
                        بدء
                      </ActionBtn>
                    )}
                    {!isCapaFinal(String(row.status)) && (
                      <ActionBtn
                        onClick={() => { setCompleting(row); setVerifyNote(''); }}
                        busy={busyId === row.id}
                        tone="bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                        icon={CheckCircle2}
                      >
                        إنجاز
                      </ActionBtn>
                    )}
                    {/* ★★★ العطل ⑦: زرُّ الإلغاء لم يكن موجوداً */}
                    {!isCapaFinal(String(row.status)) && (
                      <ActionBtn
                        onClick={() => { setCancelling(row); setCancelReason(''); }}
                        busy={busyId === row.id}
                        tone="bg-orange-50 text-orange-700 hover:bg-orange-100"
                        icon={Ban}
                      >
                        إلغاء
                      </ActionBtn>
                    )}
                    <button
                      onClick={() => setCapaDetail(row)}
                      className="p-2 rounded-lg bg-slate-50 text-slate-600 hover:bg-slate-100"
                      title="التفاصيل"
                    >
                      <Eye size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════ إجراء تصحيحي جديد ══════════ */}
      {showCapa && (
        <Modal title="إجراء تصحيحي" onClose={() => setShowCapa(false)}>
          <FormField label="مرتبطٌ بحادث">
            <select
              value={capaForm.incidentId}
              onChange={(e) => setCapaForm({ ...capaForm, incidentId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              <option value="">غير مرتبط</option>
              {incidents.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.title} — {safetySeverityLabel(String(i.severity))}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="العنوان" required>
            <input
              value={capaForm.title}
              onChange={(e) => setCapaForm({ ...capaForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-red-500"
            />
          </FormField>
          <FormField label="الأولوية">
            <select
              value={capaForm.priority}
              onChange={(e) => setCapaForm({ ...capaForm, priority: e.target.value as CapaPriority })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              {CAPA_PRIORITIES.map((p) => (
                <option key={p} value={p}>{capaPriorityLabel(p)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="المسؤول">
            <EmployeePicker
              value={capaForm.ownerId}
              onChange={(id) => setCapaForm({ ...capaForm, ownerId: id })}
            />
          </FormField>
          <FormField label="تاريخ الاستحقاق">
            <input
              type="date"
              value={capaForm.dueDate}
              min={todayBaghdad()}
              onChange={(e) => setCapaForm({ ...capaForm, dueDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <FormField label="الوصف">
            <textarea
              value={capaForm.description}
              onChange={(e) => setCapaForm({ ...capaForm, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <ModalActions
            onClose={() => setShowCapa(false)}
            onSubmit={saving ? () => undefined : handleOpenCapa}
            submitLabel={saving ? 'جارٍ الحفظ…' : 'حفظ'}
            color="red"
          />
        </Modal>
      )}

      {/* ══════════ إنجاز الإجراء ══════════ */}
      {completing && (
        <Modal title="إنجاز الإجراء التصحيحي" onClose={() => setCompleting(null)}>
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm">
            <DetailRow label="الإجراء" value={completing.title} />
            <DetailRow label="المسؤول" value={completing.ownerName ?? 'بلا مسؤول'} />
          </div>
          <FormField label="ملاحظة التحقّق من الفاعلية">
            <textarea
              value={verifyNote}
              onChange={(e) => setVerifyNote(e.target.value)}
              rows={3}
              placeholder="كيف تأكّدتَ أن الإجراء منع تكرار الحادث؟"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              سجلُّ CAPA وثيقةٌ تدقيقية — المُنجِز ولحظة الإنجاز يُسجَّلان آلياً.
            </p>
          </FormField>
          <ModalActions
            onClose={() => setCompleting(null)}
            onSubmit={busyId === completing.id ? () => undefined : handleComplete}
            submitLabel={busyId === completing.id ? 'جارٍ الحفظ…' : 'إنجاز'}
            color="emerald"
          />
        </Modal>
      )}

      {/* ══════════ إلغاء الإجراء ══════════ */}
      {cancelling && (
        <Modal title="إلغاء الإجراء التصحيحي" onClose={() => setCancelling(null)}>
          <div className="p-3 rounded-xl bg-orange-50 border border-orange-200 text-sm text-orange-800">
            سجلُّ الإجراء <strong>لا يُحذف</strong> — يُلغى مع حفظ سببه
            وفاعله ولحظته، ويبقى وثيقةً تدقيقية.
          </div>
          <FormField label="سبب الإلغاء" required>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-orange-500"
            />
          </FormField>
          <ModalActions
            onClose={() => setCancelling(null)}
            onSubmit={busyId === cancelling.id ? () => undefined : handleCancel}
            submitLabel={busyId === cancelling.id ? 'جارٍ الإلغاء…' : 'إلغاء الإجراء'}
            color="orange"
          />
        </Modal>
      )}

      {/* ══════════ تفاصيل الحادث ══════════ */}
      {detail && (
        <Modal title="تفاصيل حادث السلامة" onClose={() => setDetail(null)}>
          <DetailRow label="العنوان" value={detail.title} />
          <DetailRow label="المُبلِّغ" value={detail.employeeName} />
          {/* ★ العطل ⑱: كانت تُعرض خامّة */}
          <DetailRow label="التصنيف" value={safetyCategoryLabel(String(detail.category))} />
          <DetailRow label="الخطورة" value={safetySeverityLabel(String(detail.severity))} />
          <DetailRow label="الحالة" value={safetyStateLabel(String(detail.status))} />
          <DetailRow label="الوصف" value={detail.description} />
          <DetailRow label="تاريخ البلاغ" value={fmtDate(detail.reportedAt)} />
          <DetailRow label="العمر" value={`${detail.ageDays} يوماً`} />
          <DetailRow
            label="الإجراءات"
            value={`${detail.actionsOpen} مفتوح من ${detail.actionsTotal}`}
          />
          {detail.needsCapa && (
            <div className="mt-2 p-3 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800">
              ⚠ حادثٌ جسيمٌ مفتوحٌ بلا إجراءٍ تصحيحيّ فعّال.
            </div>
          )}
          <button
            onClick={() => {
              setCapaForm({ ...EMPTY_CAPA, incidentId: detail.id });
              setDetail(null);
              setShowCapa(true);
            }}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-xl py-2.5 font-bold transition-colors"
          >
            <Plus size={16} /> إجراء تصحيحي لهذا الحادث
          </button>
        </Modal>
      )}

      {/* ══════════ تفاصيل الإجراء ══════════ */}
      {capaDetail && (
        <Modal title="تفاصيل الإجراء التصحيحي" onClose={() => setCapaDetail(null)}>
          <DetailRow label="العنوان" value={capaDetail.title} />
          {capaDetail.incidentTitle && (
            <DetailRow label="الحادث" value={capaDetail.incidentTitle} />
          )}
          <DetailRow label="الأولوية" value={capaPriorityLabel(String(capaDetail.priority))} />
          <DetailRow label="الحالة" value={capaStateLabel(String(capaDetail.status))} />
          <DetailRow label="المسؤول" value={capaDetail.ownerName ?? 'بلا مسؤول'} />
          <DetailRow label="الاستحقاق" value={capaDetail.dueDate ? fmtDate(capaDetail.dueDate) : 'بلا موعد'} />
          {capaDetail.description && (
            <DetailRow label="الوصف" value={capaDetail.description} />
          )}
          <DetailRow label="بدأ في" value={fmtDate(capaDetail.startedAt)} />
          <DetailRow label="أُنجز في" value={fmtDate(capaDetail.completedAt)} />
          {capaDetail.completerName && (
            <DetailRow label="أنجزه" value={capaDetail.completerName} />
          )}
          {capaDetail.verificationNote && (
            <DetailRow label="ملاحظة التحقّق" value={capaDetail.verificationNote} />
          )}
          {capaDetail.cancelReason && (
            <DetailRow label="سبب الإلغاء" value={capaDetail.cancelReason} />
          )}
          <DetailRow label="أنشأه" value={capaDetail.creatorName ?? '—'} />
        </Modal>
      )}
    </div>
  );
}

/* ─────────────────────────── مكوّنات مساعدة ─────────────────────────── */

function StatBox({ label, value, tone, icon: Icon }: {
  label: string; value: number; tone: string; icon: LucideIcon;
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${tone}`}>
        <Icon size={18} />
      </div>
      <p className="text-2xl font-extrabold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border ${tone}`}>
      {children}
    </span>
  );
}

function ActionBtn({ onClick, busy, tone, icon: Icon, children }: {
  onClick: () => void; busy: boolean; tone: string;
  icon: LucideIcon; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 ${tone}`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Icon size={14} />}
      {children}
    </button>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="text-center py-12 bg-white rounded-2xl border border-slate-100 text-slate-400">
      {text}
    </div>
  );
}
