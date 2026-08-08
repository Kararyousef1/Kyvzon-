/**
 * SuccessionPlanningPage — تخطيط التعاقب (HR) · migration 0361
 *
 * ★★★ أُعيدت كتابتها بعد إثبات ستة عشر عطلاً تشغيلياً على Postgres 17
 *     (المسبار: tools/dev/_probe_0361.sql). أخطرها:
 *
 *  ① ★★★ **«جاهز الآن» كان يُقصى من العرض دائماً.**
 *     `findByPosition` تُرتّب `orderBy:'readiness_level'` والصفحة تعرض
 *     `.slice(0, 3)`. والترتيب **أبجديّ**:
 *        future_potential < ready_12_months < ready_6_months < ready_now
 *     ⇒ المعروضون الثلاثة دائماً هم الثلاثة الأقلّ جاهزية، و`ready_now`
 *       رابعاً فلا يظهر. صفحةٌ اسمها «تخطيط التعاقب» تُخفي الخليفة
 *       الجاهز — وبطاقة «جاهزون الآن» تعدّه فيرى المستخدم رقماً لا
 *       يجد له مقابلاً في القائمة.
 *  ②/③ **الشاغل بلا FK**: معدومٌ أو من **شركةٍ أخرى** كان يُقبل، ثم
 *     يُعرض «غير محدد» لأن `employeeMap` لا تحويه ⇒ تسريبٌ صامت.
 *  ④/⑤/⑥ **المرشّح والمنصب كذلك** — مرشّحٌ من شركةٍ أخرى، ومرشّحٌ
 *     مسجَّلٌ على منصبٍ في شركةٍ أخرى.
 *  ⑦ ★★★ **الموظف مرشَّحٌ لخلافة نفسه** — قُبِل بدرجة 100.
 *  ⑧ **الدرجة تناقض المستوى**: «جاهز الآن» بدرجة 3.
 *  ⑨ **الدرجة تقبل NULL** و`?? 0` يُخفي غياب القياس.
 *  ⑩ **الحذف النهائيّ نجح** بدور `authenticated` حقيقيّ.
 *  ⑪ ★★★ **حذف المنصب يُبيد كل مرشّحيه** (`ON DELETE CASCADE`).
 *  ⑫/⑬ **`status` بلا أثر** في الجدولين: المغلق والمعطَّل في العدّ.
 *  ⑭ **N+1 نداءً** + جلب كل الموظفين وكل الأقسام لبناء `Map`.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `successionPlanningSdk`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award, Crown, Loader2, Plus, Search, ShieldAlert, Target, Users,
  UserX, Archive, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import {
  successionPlanningSdk, READINESS_LEVELS, RISK_LEVELS,
  readinessLabel, readinessTone, riskLabel, riskTone, minScoreFor,
  departmentService,
} from '../../services/sdk';
import type {
  SuccessionPositionRow, SuccessionSummary, SuccessionCandidate,
  ReadinessLevel, RiskLevel, PositionStatus,
} from '../../services/sdk';
import { Modal, FormField, ModalActions, EmployeePicker, DetailRow } from './LoansPage';

interface DeptOption { id: string; name_ar: string }

const EMPTY_POSITION = {
  title: '', departmentId: '', incumbentId: '',
  riskLevel: 'medium' as RiskLevel, businessImpact: '', skills: '',
};

const EMPTY_CANDIDATE = {
  positionId: '', employeeId: '',
  level: 'ready_12_months' as ReadinessLevel, score: 50,
  strengths: '', gaps: '', notes: '',
};

export default function SuccessionPlanningPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<SuccessionPositionRow[]>([]);
  const [summary, setSummary] = useState<SuccessionSummary | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [tab, setTab] = useState<PositionStatus>('active');
  const [riskFilter, setRiskFilter] = useState<'all' | RiskLevel>('all');
  const [search, setSearch] = useState('');
  const [showPosition, setShowPosition] = useState(false);
  const [showCandidate, setShowCandidate] = useState(false);
  const [detail, setDetail] = useState<SuccessionPositionRow | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [positionForm, setPositionForm] = useState({ ...EMPTY_POSITION });
  const [candidateForm, setCandidateForm] = useState({ ...EMPTY_CANDIDATE });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑭: استعلامٌ واحد بدل 1+N — والأقسام للنموذج وحده
      const [board, sum, depts] = await Promise.all([
        successionPlanningSdk.board(
          search.trim() || null,
          riskFilter === 'all' ? null : riskFilter,
          tab,
          200,
        ),
        successionPlanningSdk.summary().catch(() => null),
        departmentService.findAll({ orderBy: 'name_ar' }).catch(() => []),
      ]);
      setRows(board);
      setSummary(sum);
      setDepartments(
        (depts as unknown as DeptOption[]).map((d) => ({
          id: String(d.id), name_ar: String(d.name_ar ?? ''),
        })),
      );
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, search, riskFilter, tab]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  const handleSavePosition = async () => {
    if (!positionForm.title.trim()) { addToast('عنوان المنصب مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await successionPlanningSdk.savePosition({
        title:          positionForm.title.trim(),
        departmentId:   positionForm.departmentId || null,
        incumbentId:    positionForm.incumbentId || null,
        riskLevel:      positionForm.riskLevel,
        businessImpact: positionForm.businessImpact.trim() || null,
        requiredSkills: positionForm.skills
          .split(',').map((s) => s.trim()).filter(Boolean),
      });
      addToast('تم حفظ المنصب الحرج', 'success');
      setShowPosition(false);
      setPositionForm({ ...EMPTY_POSITION });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const openNominate = (position?: SuccessionPositionRow) => {
    setCandidateForm({ ...EMPTY_CANDIDATE, positionId: position?.id ?? '' });
    setShowCandidate(true);
  };

  const handleNominate = async () => {
    if (!candidateForm.positionId) { addToast('اختر المنصب', 'warning'); return; }
    if (!candidateForm.employeeId) { addToast('اختر المرشّح', 'warning'); return; }
    // ★ العطل ⑧: نمنع التناقض قبل النداء — الرسالة أوضح من رمز القاعدة
    const min = minScoreFor(candidateForm.level);
    if (candidateForm.score < min) {
      addToast(
        `«${readinessLabel(candidateForm.level)}» يحتاج درجة ${min} فأعلى`,
        'warning',
      );
      return;
    }
    setSaving(true);
    try {
      await successionPlanningSdk.nominate({
        positionId: candidateForm.positionId,
        employeeId: candidateForm.employeeId,
        level:      candidateForm.level,
        score:      candidateForm.score,
        strengths:  candidateForm.strengths.trim() || null,
        gaps:       candidateForm.gaps.trim() || null,
        notes:      candidateForm.notes.trim() || null,
      });
      addToast('تم ترشيح الخليفة', 'success');
      setShowCandidate(false);
      setCandidateForm({ ...EMPTY_CANDIDATE });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★ العطل ⑬: إلغاء الترشيح لا حذفه — التقييم دليل */
  const handleDeactivate = async (c: SuccessionCandidate) => {
    setBusyId(c.id);
    try {
      await successionPlanningSdk.setCandidateStatus(c.id, 'inactive');
      addToast('أُلغي الترشيح (لم يُحذف)', 'success');
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** ★ العطل ⑫: إغلاق المنصب لا حذفه */
  const handleTogglePosition = async (p: SuccessionPositionRow) => {
    setBusyId(p.id);
    try {
      const next: PositionStatus = p.status === 'active' ? 'closed' : 'active';
      await successionPlanningSdk.setPositionStatus(p.id, next);
      addToast(next === 'closed' ? 'أُغلق المنصب' : 'أُعيد تفعيل المنصب', 'success');
      setDetail(null);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const positionOptions = useMemo(
    () => rows.map((r) => ({ id: r.id, title: r.title })),
    [rows],
  );

  const minForLevel = minScoreFor(candidateForm.level);

  return (
    <div className="space-y-5 animate-fade-in p-4 sm:p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-800 rounded-2xl p-6 text-white flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-white/70 text-sm font-semibold">Succession Planning</p>
          <h2 className="text-2xl font-extrabold mt-1">تخطيط التعاقب</h2>
          <p className="text-white/75 mt-2 text-sm">
            المناصب الحرجة والخلفاء وجاهزيتهم — مرتَّبةً بالأجهز أولاً.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setPositionForm({ ...EMPTY_POSITION }); setShowPosition(true); }}
            className="flex items-center gap-2 bg-white/15 hover:bg-white/25 rounded-xl px-4 py-2 font-bold"
          >
            <Plus size={18} /> منصب حرج
          </button>
          <button
            onClick={() => openNominate()}
            className="flex items-center gap-2 bg-white text-indigo-700 hover:bg-indigo-50 rounded-xl px-4 py-2 font-bold"
          >
            <Users size={18} /> ترشيح خليفة
          </button>
        </div>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="مناصب نشطة" value={summary.positions} tone="blue" icon={<Crown size={16} />} />
            <Stat label="مخاطر عالية" value={summary.highRisk} tone="red" icon={<ShieldAlert size={16} />} />
            <Stat label="جاهزون الآن" value={summary.readyNow} tone="emerald" icon={<Award size={16} />} />
            <Stat label="بدون خلفاء" value={summary.uncovered} tone="amber" icon={<Target size={16} />} />
            <Stat label="مغلقة" value={summary.closed} tone="slate" icon={<Archive size={16} />} />
          </div>

          {/* ★★ الرقم الذي يهمّ فعلاً: المكشوف **والحرج** */}
          {summary.criticalUncovered > 0 && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 leading-relaxed">
                <b>{summary.criticalUncovered}</b> منصباً <b>حرجاً أو عالي
                الخطر</b> بلا أيّ خليفة. هذه هي الفجوة التي وُجدت الصفحة
                لقياسها.
              </p>
            </div>
          )}

          {/* ★ NULL = «لا مرشّح» لا «صفر جاهزية» (درس 0353) */}
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <TrendingUp size={15} className="text-slate-400" />
            متوسّط الجاهزية:{' '}
            <b className="text-slate-900">
              {summary.avgScore == null ? 'لا مرشّحين بعد' : `${summary.avgScore}%`}
            </b>
            <span className="text-slate-400">
              · {summary.candidates} مرشّحاً نشطاً
            </span>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex bg-slate-100 rounded-xl p-1">
          {(['active', 'closed'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                tab === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
              }`}
            >
              {t === 'active' ? 'النشطة' : 'المغلقة'}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث بالمنصب أو الشاغل أو القسم…"
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-sm outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Chip active={riskFilter === 'all'} onClick={() => setRiskFilter('all')} label="كل المخاطر" />
        {RISK_LEVELS.map((r) => (
          <Chip key={r} active={riskFilter === r} onClick={() => setRiskFilter(r)} label={riskLabel(r)} />
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue-600" size={36} />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 text-slate-400">
          {tab === 'closed' ? 'لا مناصب مغلقة' : 'لا مناصب حرجة مطابقة'}
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((p) => (
            <div key={p.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900">{p.title}</p>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${riskTone(p.riskLevel)}`}>
                      {riskLabel(p.riskLevel)}
                    </span>
                    {p.status === 'closed' && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-500 border-slate-200">
                        مغلق
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    الشاغل: <b className="text-slate-700">{p.incumbentName}</b>
                    {' • '}القسم: <b className="text-slate-700">{p.department}</b>
                  </p>
                  {p.businessImpact && (
                    <p className="text-xs text-slate-600 mt-2 max-w-2xl">{p.businessImpact}</p>
                  )}
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => setDetail(p)}
                    className="px-3 py-2 rounded-xl bg-slate-50 text-slate-700 text-xs font-bold hover:bg-slate-100"
                  >
                    التفاصيل
                  </button>
                  {p.status === 'active' && (
                    <button
                      onClick={() => openNominate(p)}
                      className="px-3 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold hover:bg-blue-100"
                    >
                      ترشيح خليفة
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4">
                {p.candidatesTotal === 0 ? (
                  <div className={`text-xs rounded-xl px-3 py-2 font-bold ${
                    ['critical', 'high'].includes(String(p.riskLevel))
                      ? 'text-red-700 bg-red-50 border border-red-200'
                      : 'text-amber-700 bg-amber-50 border border-amber-200'
                  }`}>
                    لا خليفة لهذا المنصب
                    {['critical', 'high'].includes(String(p.riskLevel))
                      && ' — وهو منصبٌ حرج'}
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-slate-500">
                        {p.candidatesTotal} خليفة
                        {p.readyNow > 0 && (
                          <span className="text-emerald-700"> · {p.readyNow} جاهز الآن</span>
                        )}
                      </p>
                      {/* ★ NULL = لا مرشّح — لا صفر */}
                      {p.avgScore != null && (
                        <p className="text-xs text-slate-400">متوسّط {p.avgScore}%</p>
                      )}
                    </div>
                    {/* ★★★ العطل ①: مرتَّبون بالأجهز أولاً من القاعدة.
                        كان الترتيب الأبجديّ يُقصي «جاهز الآن» دائماً. */}
                    <div className="grid md:grid-cols-3 gap-2">
                      {p.candidates.slice(0, 3).map((c) => (
                        <div key={c.id} className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-800 truncate">
                                {c.employeeName}
                              </p>
                              <p className="text-[11px] text-slate-400">{c.employeeCode}</p>
                            </div>
                            {p.status === 'active' && (
                              <button
                                onClick={() => void handleDeactivate(c)}
                                disabled={busyId === c.id}
                                title="إلغاء الترشيح (لا حذف)"
                                className="text-slate-400 hover:text-red-600 disabled:opacity-40 flex-shrink-0"
                              >
                                {busyId === c.id
                                  ? <Loader2 size={14} className="animate-spin" />
                                  : <UserX size={14} />}
                              </button>
                            )}
                          </div>
                          <span className={`inline-block mt-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full border ${readinessTone(c.level)}`}>
                            {readinessLabel(c.level)}
                          </span>
                          <div className="mt-2 h-1.5 bg-white rounded-full overflow-hidden">
                            <div
                              className={c.rank === 1 ? 'h-full bg-emerald-600' : 'h-full bg-blue-600'}
                              style={{ width: `${c.score}%` }}
                            />
                          </div>
                          <p className="text-[11px] text-slate-500 mt-1">{c.score}%</p>
                        </div>
                      ))}
                    </div>
                    {p.candidatesTotal > 3 && (
                      <button
                        onClick={() => setDetail(p)}
                        className="mt-2 text-xs font-bold text-blue-700 hover:underline"
                      >
                        و{p.candidatesTotal - 3} آخرون…
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────────── منصب حرج ─────────────── */}
      {showPosition && (
        <Modal title="منصب حرج" onClose={() => setShowPosition(false)}>
          <FormField label="عنوان المنصب" required>
            <input
              value={positionForm.title}
              onChange={(e) => setPositionForm({ ...positionForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <FormField label="القسم">
            <select
              value={positionForm.departmentId}
              onChange={(e) => setPositionForm({ ...positionForm, departmentId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              <option value="">غير محدد</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name_ar}</option>
              ))}
            </select>
          </FormField>
          {/* ★ العطل ③: الشاغل من المستأجر نفسه — EmployeePicker يقرأ من SDK */}
          <EmployeePicker
            value={positionForm.incumbentId}
            onChange={(id) => setPositionForm({ ...positionForm, incumbentId: id })}
          />
          <FormField label="مستوى الخطر" required>
            <select
              value={positionForm.riskLevel}
              onChange={(e) => setPositionForm({ ...positionForm, riskLevel: e.target.value as RiskLevel })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              {RISK_LEVELS.map((r) => (
                <option key={r} value={r}>{riskLabel(r)}</option>
              ))}
            </select>
          </FormField>
          <FormField label="الأثر على العمل">
            <textarea
              value={positionForm.businessImpact}
              onChange={(e) => setPositionForm({ ...positionForm, businessImpact: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <FormField label="المهارات المطلوبة (مفصولة بفواصل)">
            <input
              value={positionForm.skills}
              onChange={(e) => setPositionForm({ ...positionForm, skills: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <ModalActions
            onClose={() => setShowPosition(false)}
            onSubmit={() => { if (!saving) void handleSavePosition(); }}
            submitLabel={saving ? 'جارٍ الحفظ…' : 'حفظ'}
            color="blue"
          />
        </Modal>
      )}

      {/* ─────────────── ترشيح خليفة ─────────────── */}
      {showCandidate && (
        <Modal title="ترشيح خليفة" onClose={() => setShowCandidate(false)}>
          <FormField label="المنصب" required>
            <select
              value={candidateForm.positionId}
              onChange={(e) => setCandidateForm({ ...candidateForm, positionId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              <option value="">اختر منصباً…</option>
              {positionOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </select>
          </FormField>
          <EmployeePicker
            value={candidateForm.employeeId}
            onChange={(id) => setCandidateForm({ ...candidateForm, employeeId: id })}
          />
          <FormField label="الجاهزية" required>
            <select
              value={candidateForm.level}
              onChange={(e) => {
                const level = e.target.value as ReadinessLevel;
                const min = minScoreFor(level);
                setCandidateForm({
                  ...candidateForm, level,
                  // ★ العطل ⑧: الدرجة تُرفَع تلقائياً للحدّ الأدنى
                  score: Math.max(candidateForm.score, min),
                });
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              {READINESS_LEVELS.map((l) => (
                <option key={l} value={l}>{readinessLabel(l)}</option>
              ))}
            </select>
          </FormField>
          <FormField label={`درجة الجاهزية (${minForLevel}–100)`} required>
            <input
              type="number"
              min={minForLevel}
              max={100}
              value={candidateForm.score}
              onChange={(e) => setCandidateForm({ ...candidateForm, score: Number(e.target.value) })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
            {/* ★★ نُخبر بالقاعدة قبل أن يرفضها الخادم */}
            <p className="text-xs text-slate-500 mt-1">
              «{readinessLabel(candidateForm.level)}» يحتاج <b>{minForLevel}</b> فأعلى —
              الدرجة التي تناقض المستوى مرفوضة في القاعدة.
            </p>
          </FormField>
          <FormField label="نقاط القوة">
            <textarea
              value={candidateForm.strengths}
              onChange={(e) => setCandidateForm({ ...candidateForm, strengths: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <FormField label="الفجوات">
            <textarea
              value={candidateForm.gaps}
              onChange={(e) => setCandidateForm({ ...candidateForm, gaps: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <p className="text-xs text-slate-600 bg-blue-50 border border-blue-200 rounded-lg p-2.5 leading-relaxed">
            شاغل المنصب لا يُرشَّح لخلافة نفسه، وإعادة ترشيح الشخص نفسه
            <b> تُحدِّث</b> تقييمه ولا تُنشئ صفّاً مكرَّراً.
          </p>
          <ModalActions
            onClose={() => setShowCandidate(false)}
            onSubmit={() => { if (!saving) void handleNominate(); }}
            submitLabel={saving ? 'جارٍ الترشيح…' : 'ترشيح'}
            color="blue"
          />
        </Modal>
      )}

      {/* ─────────────── التفاصيل ─────────────── */}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <DetailRow label="الخطر" value={riskLabel(detail.riskLevel)} />
          <DetailRow label="الحالة" value={detail.status === 'active' ? 'نشط' : 'مغلق'} />
          <DetailRow label="القسم" value={detail.department} />
          <DetailRow label="الشاغل الحالي" value={detail.incumbentName} />
          <DetailRow label="الأثر" value={detail.businessImpact ?? undefined} />
          <DetailRow
            label="المهارات"
            value={detail.requiredSkills.length ? detail.requiredSkills.join('، ') : undefined}
          />
          <DetailRow label="عدد الخلفاء" value={String(detail.candidatesTotal)} />
          <DetailRow
            label="متوسّط الجاهزية"
            value={detail.avgScore == null ? 'لا مرشّحين' : `${detail.avgScore}%`}
          />

          {detail.candidates.length > 0 && (
            <div className="pt-2 space-y-2">
              <p className="text-xs font-bold text-slate-500">
                الخلفاء — الأجهز أوّلاً
              </p>
              {detail.candidates.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-100 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-bold text-slate-800">
                      {c.employeeName}
                      <span className="text-slate-400 font-normal"> · {c.employeeCode}</span>
                    </p>
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${readinessTone(c.level)}`}>
                      {readinessLabel(c.level)} · {c.score}%
                    </span>
                  </div>
                  {c.strengths && (
                    <p className="text-xs text-emerald-700 mt-1.5">قوة: {c.strengths}</p>
                  )}
                  {c.gaps && (
                    <p className="text-xs text-amber-700 mt-0.5">فجوة: {c.gaps}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ★ العطل ⑫: الإغلاق بدل الحذف — والحذف ممنوع في القاعدة */}
          <div className="pt-3 border-t border-slate-100">
            <button
              onClick={() => void handleTogglePosition(detail)}
              disabled={busyId === detail.id}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-sm hover:bg-slate-200 disabled:opacity-50"
            >
              {detail.status === 'active' ? 'إغلاق المنصب' : 'إعادة التفعيل'}
            </button>
            <p className="text-[11px] text-slate-400 mt-1.5 text-center">
              المناصب وخطط التعاقب لا تُحذف — تُغلق أو يُلغى ترشيحها.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────

function Stat({ label, value, tone, icon }: {
  label: string; value: number; tone: string; icon: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    slate:   'bg-slate-50 text-slate-700 border-slate-200',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] ?? tones.slate}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function Chip({ active, onClick, label }: {
  active: boolean; onClick: () => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        active
          ? 'bg-blue-600 text-white'
          : 'bg-white text-slate-600 border border-slate-200 hover:border-blue-300'
      }`}
    >
      {label}
    </button>
  );
}
