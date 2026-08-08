/**
 * RecruitmentPage — إدارة التوظيف (HR) · migration 0362
 *
 * ★★★ أُعيدت كتابتها بعد إثبات عشرين عطلاً تشغيلياً على Postgres 17
 *     (المسبار: tools/dev/_probe_0362.sql). أخطرها:
 *
 *  ① ★★★ **قائمة المتقدمين لم تعمل يوماً.** `findByJob` تنفّذ
 *     `findAll({ filters: { job_id }, orderBy: 'applied_at' })`
 *     وكلا العمودين **معدوم** (الموجود: `posting_id` و`submitted_at`):
 *        PROBE_2: column "job_id" does not exist
 *        PROBE_3: column "applied_at" does not exist
 *     ⇒ زرّ «المتقدمون» يرمي دائماً. وحتى لو نجح، العرض يقرأ
 *       `applicant_email` و`cv_url` وكلاهما `undefined`، و
 *       `format(new Date(app.applied_at))` يرمي `Invalid time value`.
 *
 *  ② ★★★ **مفردتان لحالة الطلب لا تلتقيان.** DEFAULT في القاعدة
 *     `'submitted'` وليست في `APPLICATION_STATUS_LABELS` ⇒
 *     `<select value="submitted">` بلا `<option>` مطابق فيعرض
 *     المتصفّح **أول خيار** («تم التقديم») وهي حالةٌ أخرى.
 *
 *  ③ حالة الإعلان بلا CHECK · و`statusColors` أربعة والنوع خمسة
 *     (`cancelled` مفقود فيسقط للرماديّ صامتاً).
 *  ④⑤⑥⑦ `tenant_id` NULL · راتبٌ مقلوب · شواغر ≤ 0 · زمنٌ مقلوب.
 *  ⑧ ★★ **البطاقة تعرض `full_time` بالإنجليزية** بينما النموذج
 *     يعرض «دوام كامل» بالعربية (PROBE_11).
 *  ⑨⑩ متقدّمٌ على إعلان شركةٍ أخرى · وحذف الإعلان يُبيد متقدميه.
 *  ⑪⑫ لا فرادة على البريد · والبريد نصٌّ حرّ.
 *  ⑬ ★★★ **«تم التوظيف» لا يُنشئ موظفاً ولا يُغلق الإعلان** —
 *     PROBE_16: صفر دالة. الحلقة المفقودة بين التوظيف والتعريف.
 *  ⑭ **الصفحة لا تعرض عدد المتقدمين إطلاقاً** — لمعرفة إن كان
 *     لإعلانٍ متقدّمون يجب فتح النافذة التي ترمي (العطل ①).
 *  ⑮ `created_by` لا يُكتب ولا FK على القسم.
 *
 * ★ الصفحة لا تلمس Supabase — كل شيء عبر `recruitmentSdk`.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Briefcase, Plus, Loader2, Users, Search, UserPlus, Mail, Phone,
  FileText, Star, AlertTriangle, CheckCircle2, Clock, Archive,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  recruitmentSdk, POSTING_STATUSES, APPLICATION_STATUSES, EMPLOYMENT_TYPES,
  postingStatusLabel, postingStatusTone, stageLabel, stageTone,
  employmentTypeLabel, departmentService,
} from '../../services/sdk';
import type {
  PostingRow, ApplicationRow, RecruitmentSummary,
  PostingStatus, ApplicationStage, EmploymentType,
} from '../../services/sdk';
import { Modal, FormField, ModalActions, DetailRow } from './LoansPage';

interface DeptOption { id: string; name_ar: string }

const EMPTY_POSTING = {
  title: '', description: '', position: '', departmentId: '',
  employmentType: 'full_time' as EmploymentType,
  salaryMin: '', salaryMax: '', vacancies: 1, closingDate: '',
  requirements: '', status: 'draft' as PostingStatus,
};

const EMPTY_APPLICANT = {
  name: '', email: '', phone: '', resumeUrl: '', coverLetter: '',
};

/** ★ المراحل التي تمرّ من `setStage` — `hired` لها دالتها (العطل ⑬) */
const MOVABLE_STAGES = APPLICATION_STATUSES.filter((s) => s !== 'hired');

export default function RecruitmentPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PostingRow[]>([]);
  const [summary, setSummary] = useState<RecruitmentSummary | null>(null);
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | PostingStatus>('all');
  const [showPosting, setShowPosting] = useState(false);
  const [showApplicant, setShowApplicant] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [postingForm, setPostingForm] = useState({ ...EMPTY_POSTING });
  const [applicantForm, setApplicantForm] = useState({ ...EMPTY_APPLICANT });

  // لوحة المتقدمين
  const [selected, setSelected] = useState<PostingRow | null>(null);
  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ApplicationRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [hireTarget, setHireTarget] = useState<ApplicationRow | null>(null);
  const [hireCode, setHireCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [board, sum, depts] = await Promise.all([
        recruitmentSdk.board(
          search.trim() || null,
          statusFilter === 'all' ? null : statusFilter,
          200,
        ),
        recruitmentSdk.summary().catch(() => null),
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
  }, [addToast, search, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => { void load(); }, 250);
    return () => clearTimeout(t);
  }, [load]);

  /** ★★★ العطل ①: هذه الدالة كانت ترمي دائماً */
  const openApplicants = async (posting: PostingRow) => {
    setSelected(posting);
    setAppsLoading(true);
    try {
      setApps(await recruitmentSdk.applications(posting.id, null));
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
      setApps([]);
    } finally {
      setAppsLoading(false);
    }
  };

  const refreshApps = async () => {
    if (!selected) return;
    setApps(await recruitmentSdk.applications(selected.id, null));
    await load();
  };

  const handleSavePosting = async () => {
    if (!postingForm.title.trim()) { addToast('عنوان الوظيفة مطلوب', 'warning'); return; }
    if (!postingForm.description.trim()) { addToast('الوصف مطلوب', 'warning'); return; }
    if (postingForm.vacancies <= 0) { addToast('عدد الشواغر يجب أن يكون موجباً', 'warning'); return; }
    const min = postingForm.salaryMin === '' ? null : Number(postingForm.salaryMin);
    const max = postingForm.salaryMax === '' ? null : Number(postingForm.salaryMax);
    if (min != null && max != null && min > max) {
      addToast('الراتب «من» أكبر من «إلى»', 'warning');
      return;
    }
    setSaving(true);
    try {
      await recruitmentSdk.savePosting({
        title:          postingForm.title.trim(),
        description:    postingForm.description.trim(),
        position:       postingForm.position.trim() || null,
        departmentId:   postingForm.departmentId || null,
        employmentType: postingForm.employmentType,
        salaryMin:      min,
        salaryMax:      max,
        vacancies:      postingForm.vacancies,
        closingDate:    postingForm.closingDate || null,
        requirements:   postingForm.requirements
          .split(',').map((r) => r.trim()).filter(Boolean),
        status:         postingForm.status,
      });
      addToast('تم حفظ الإعلان', 'success');
      setShowPosting(false);
      setPostingForm({ ...EMPTY_POSTING });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitApplicant = async () => {
    if (!selected) return;
    if (!applicantForm.name.trim()) { addToast('اسم المتقدّم مطلوب', 'warning'); return; }
    if (!applicantForm.email.trim()) { addToast('البريد مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await recruitmentSdk.submitApplication({
        postingId:   selected.id,
        name:        applicantForm.name.trim(),
        email:       applicantForm.email.trim(),
        phone:       applicantForm.phone.trim() || null,
        resumeUrl:   applicantForm.resumeUrl.trim() || null,
        coverLetter: applicantForm.coverLetter.trim() || null,
      });
      addToast('تم تسجيل المتقدّم', 'success');
      setShowApplicant(false);
      setApplicantForm({ ...EMPTY_APPLICANT });
      await refreshApps();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★ العطل ②: المفردات من مصدرٍ واحد — و`hired` لا يمرّ من هنا */
  const handleStage = async (app: ApplicationRow, stage: string) => {
    if (stage === 'hired') { setHireTarget(app); setHireCode(''); return; }
    if (stage === 'rejected') { setRejectTarget(app); setRejectReason(''); return; }
    setBusyId(app.id);
    try {
      await recruitmentSdk.setStage(
        app.id, stage as Exclude<ApplicationStage, 'hired'>,
      );
      addToast(`انتقل إلى «${stageLabel(stage)}»`, 'success');
      await refreshApps();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    if (!rejectReason.trim()) { addToast('سبب الرفض مطلوب', 'warning'); return; }
    setSaving(true);
    try {
      await recruitmentSdk.setStage(rejectTarget.id, 'rejected', rejectReason.trim());
      addToast('تم الرفض مع تسجيل السبب', 'success');
      setRejectTarget(null);
      await refreshApps();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /** ★★★ العطل ⑬: التوظيف يُنشئ موظفاً فعلاً */
  const handleHire = async () => {
    if (!hireTarget) return;
    setSaving(true);
    try {
      const r = await recruitmentSdk.hire(hireTarget.id, hireCode.trim() || null);
      addToast(
        r.postingStatus === 'filled'
          ? 'تم التوظيف — وأُغلق الإعلان لامتلاء الشواغر'
          : `تم التوظيف — بقي ${r.vacanciesLeft} شاغر`,
        'success',
      );
      setHireTarget(null);
      await refreshApps();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const fmtDate = (d: string | null): string =>
    d ? format(new Date(d), 'd MMM yyyy', { locale: ar }) : '—';
  const fmtMoney = (n: number | null): string =>
    n == null ? '—' : new Intl.NumberFormat('ar-IQ').format(n);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-5" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center">
            <Briefcase className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">إدارة التوظيف</h1>
            <p className="text-sm text-slate-500">الإعلانات والمتقدمون ومسار التوظيف</p>
          </div>
        </div>
        <button
          onClick={() => { setPostingForm({ ...EMPTY_POSTING }); setShowPosting(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
        >
          <Plus size={18} /> وظيفة جديدة
        </button>
      </div>

      {summary && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Stat label="مفتوحة" value={summary.open} tone="emerald" icon={<Briefcase size={16} />} />
            <Stat label="شواغر" value={summary.vacancies} tone="teal" icon={<Users size={16} />} />
            <Stat label="متقدمون" value={summary.appsTotal} tone="blue" icon={<UserPlus size={16} />} />
            <Stat label="طلبات جديدة" value={summary.appsNew} tone="amber" icon={<Clock size={16} />} />
            <Stat label="تم توظيفهم" value={summary.appsHired} tone="indigo" icon={<CheckCircle2 size={16} />} />
          </div>

          {/* ★ إعلانٌ مفتوحٌ فات موعد إغلاقه — تناقضٌ صامت */}
          {summary.expired > 0 && (
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
              <AlertTriangle size={18} className="text-red-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-800 leading-relaxed">
                <b>{summary.expired}</b> إعلاناً <b>مفتوحاً</b> فات موعد إغلاقه —
                ما زال يقبل التقديم شكلاً ولا يجب.
              </p>
            </div>
          )}
          {summary.noApps > 0 && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
              <Users size={18} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800 leading-relaxed">
                <b>{summary.noApps}</b> إعلاناً مفتوحاً <b>بلا متقدّم واحد</b>.
              </p>
            </div>
          )}
        </>
      )}

      <div className="relative">
        <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث بالعنوان أو المسمّى أو القسم…"
          className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm outline-none focus:border-teal-400"
        />
      </div>

      {/* ★ العطل ③: المفردات الخمس كاملة — كانت statusColors أربعة */}
      <div className="flex gap-2 flex-wrap">
        <Chip active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} label="الكل" />
        {POSTING_STATUSES.map((s) => (
          <Chip key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}
                label={postingStatusLabel(s)} />
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-teal-500" size={40} />
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-16">
          <Briefcase size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500">لا توجد إعلانات مطابقة</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {rows.map((job) => (
            <div key={job.id} className="bg-white rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-shadow">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="w-11 h-11 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                    <Briefcase size={20} className="text-teal-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-slate-900 truncate">{job.title}</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${postingStatusTone(job.status)}`}>
                        {postingStatusLabel(job.status)}
                      </span>
                      {job.isExpired && job.status === 'open' && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold border bg-red-50 text-red-700 border-red-200">
                          فات موعد الإغلاق
                        </span>
                      )}
                    </div>
                    {/* ★ العطل ⑧: النوع بالعربية لا `full_time` خاماً */}
                    <p className="text-xs text-slate-500 mt-1">
                      {job.position} · {employmentTypeLabel(job.employmentType)} ·{' '}
                      {job.vacancies} شاغر · {job.department}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {job.salaryMin != null || job.salaryMax != null
                        ? `${fmtMoney(job.salaryMin)} – ${fmtMoney(job.salaryMax)} د.ع`
                        : 'الراتب غير معلن'}
                      {job.closingDate && (
                        <>
                          {' · '}يُغلق {fmtDate(job.closingDate)}
                          {job.daysLeft != null && (
                            <span className={job.daysLeft < 0 ? 'text-red-600 font-semibold' : ''}>
                              {' '}({job.daysLeft < 0
                                ? `منذ ${Math.abs(job.daysLeft)} يوم`
                                : `بعد ${job.daysLeft} يوم`})
                            </span>
                          )}
                        </>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* ★★ العطل ⑭: العدّادات التي لم تكن موجودة */}
                  <div className="flex gap-1.5">
                    <Counter label="متقدّم" value={job.appsTotal} tone="slate" />
                    {job.appsNew > 0 && <Counter label="جديد" value={job.appsNew} tone="amber" />}
                    {job.appsProgress > 0 && <Counter label="بالمسار" value={job.appsProgress} tone="blue" />}
                    {job.appsHired > 0 && <Counter label="وُظّف" value={job.appsHired} tone="emerald" />}
                  </div>
                  <button
                    onClick={() => void openApplicants(job)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 rounded-lg text-sm font-semibold hover:bg-blue-100"
                  >
                    <Users size={14} /> المتقدمون
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─────────────── إعلان جديد ─────────────── */}
      {showPosting && (
        <Modal title="وظيفة جديدة" onClose={() => setShowPosting(false)}>
          <FormField label="عنوان الوظيفة" required>
            <input value={postingForm.title}
              onChange={(e) => setPostingForm({ ...postingForm, title: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500" />
          </FormField>
          <FormField label="المسمى الوظيفي">
            <input value={postingForm.position}
              onChange={(e) => setPostingForm({ ...postingForm, position: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="الوصف" required>
            <textarea value={postingForm.description}
              onChange={(e) => setPostingForm({ ...postingForm, description: e.target.value })}
              rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500" />
          </FormField>
          <FormField label="القسم">
            <select value={postingForm.departmentId}
              onChange={(e) => setPostingForm({ ...postingForm, departmentId: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              <option value="">غير محدد</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name_ar}</option>)}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="نوع التوظيف">
              <select value={postingForm.employmentType}
                onChange={(e) => setPostingForm({ ...postingForm, employmentType: e.target.value as EmploymentType })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg">
                {EMPLOYMENT_TYPES.map((t) => (
                  <option key={t} value={t}>{employmentTypeLabel(t)}</option>
                ))}
              </select>
            </FormField>
            <FormField label="عدد الشواغر" required>
              <input type="number" min={1} value={postingForm.vacancies}
                onChange={(e) => setPostingForm({ ...postingForm, vacancies: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="الراتب من">
              <input type="number" min={0} value={postingForm.salaryMin}
                onChange={(e) => setPostingForm({ ...postingForm, salaryMin: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </FormField>
            <FormField label="الراتب إلى">
              <input type="number" min={0} value={postingForm.salaryMax}
                onChange={(e) => setPostingForm({ ...postingForm, salaryMax: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </FormField>
          </div>
          <FormField label="تاريخ الإغلاق">
            <input type="date" value={postingForm.closingDate}
              onChange={(e) => setPostingForm({ ...postingForm, closingDate: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            <p className="text-xs text-slate-400 mt-1">تاريخٌ في الماضي مرفوض في القاعدة.</p>
          </FormField>
          <FormField label="المتطلّبات (مفصولة بفواصل)">
            <input value={postingForm.requirements}
              onChange={(e) => setPostingForm({ ...postingForm, requirements: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="الحالة" required>
            <select value={postingForm.status}
              onChange={(e) => setPostingForm({ ...postingForm, status: e.target.value as PostingStatus })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg">
              {POSTING_STATUSES.map((s) => (
                <option key={s} value={s}>{postingStatusLabel(s)}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-1">
              «مفتوح» وحده يقبل التقديم — وتاريخ النشر يُسجَّل تلقائياً.
            </p>
          </FormField>
          <ModalActions
            onClose={() => setShowPosting(false)}
            onSubmit={() => { if (!saving) void handleSavePosting(); }}
            submitLabel={saving ? 'جارٍ الحفظ…' : 'حفظ'}
            color="blue"
          />
        </Modal>
      )}

      {/* ─────────────── المتقدمون ─────────────── */}
      {selected && (
        <Modal title={`متقدمو: ${selected.title}`} onClose={() => setSelected(null)}>
          <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
            <p className="text-xs text-slate-500">
              {selected.appsTotal} متقدّم · {selected.vacancies} شاغر ·{' '}
              {selected.appsHired} وُظِّف
            </p>
            {selected.status === 'open' && (
              <button
                onClick={() => { setApplicantForm({ ...EMPTY_APPLICANT }); setShowApplicant(true); }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-teal-50 text-teal-700 rounded-lg text-xs font-bold hover:bg-teal-100"
              >
                <UserPlus size={13} /> تسجيل متقدّم
              </button>
            )}
          </div>

          {appsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-blue-500" size={28} />
            </div>
          ) : apps.length === 0 ? (
            <div className="text-center py-8 text-slate-400">لا يوجد متقدمون بعد</div>
          ) : (
            <div className="space-y-2 max-h-[26rem] overflow-y-auto">
              {/* ★★★ مرتَّبون بالأجدر من القاعدة (hired ثم offer …) */}
              {apps.map((app) => (
                <div key={app.id} className="border border-slate-100 rounded-xl p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900 text-sm">{app.name}</p>
                      {/* ★★★ العطل ①: هذه الحقول كانت undefined */}
                      <p className="text-xs text-slate-500 flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="flex items-center gap-1"><Mail size={11} /> {app.email}</span>
                        {app.phone && (
                          <span className="flex items-center gap-1"><Phone size={11} /> {app.phone}</span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        قدّم في {fmtDate(app.submittedAt)}
                        {app.reviewerName !== '—' && ` · راجعه ${app.reviewerName}`}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border flex-shrink-0 ${stageTone(app.stage)}`}>
                      {stageLabel(app.stage)}
                    </span>
                  </div>

                  {app.rating != null && (
                    <p className="text-xs text-amber-600 flex items-center gap-1 mb-1">
                      <Star size={12} /> التقييم {app.rating}/5
                    </p>
                  )}
                  {app.rejectionReason && (
                    <p className="text-xs text-red-700 bg-red-50 rounded-lg px-2 py-1 mb-1">
                      سبب الرفض: {app.rejectionReason}
                    </p>
                  )}
                  {app.coverLetter && (
                    <p className="text-xs text-slate-600 line-clamp-2 mb-1">{app.coverLetter}</p>
                  )}

                  <div className="flex items-center gap-2 pt-1.5 border-t border-slate-50">
                    {app.resumeUrl && (
                      <a href={app.resumeUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-blue-600 hover:underline flex-shrink-0">
                        <FileText size={12} /> السيرة
                      </a>
                    )}
                    {/* ★★★ الموظَّف لا يعود متقدّماً */}
                    {app.stage === 'hired' ? (
                      <span className="text-xs text-emerald-700 font-bold flex items-center gap-1">
                        <CheckCircle2 size={12} /> وُظِّف — لا رجوع
                      </span>
                    ) : (
                      <>
                        <select
                          value={app.stage}
                          disabled={busyId === app.id}
                          onChange={(e) => void handleStage(app, e.target.value)}
                          className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs disabled:opacity-50"
                        >
                          {MOVABLE_STAGES.map((s) => (
                            <option key={s} value={s}>{stageLabel(s)}</option>
                          ))}
                        </select>
                        {/* ★★★ العطل ⑬: زرٌّ منفصل — التوظيف يُنشئ موظفاً */}
                        <button
                          onClick={() => { setHireTarget(app); setHireCode(''); }}
                          disabled={busyId === app.id || app.stage === 'withdrawn'}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 flex-shrink-0"
                        >
                          توظيف
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* ─────────────── تسجيل متقدّم ─────────────── */}
      {showApplicant && selected && (
        <Modal title={`تسجيل متقدّم — ${selected.title}`} onClose={() => setShowApplicant(false)}>
          <FormField label="الاسم" required>
            <input value={applicantForm.name}
              onChange={(e) => setApplicantForm({ ...applicantForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="البريد الإلكتروني" required>
            <input type="email" value={applicantForm.email}
              onChange={(e) => setApplicantForm({ ...applicantForm, email: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
            <p className="text-xs text-slate-400 mt-1">
              البريد يُطبَّع صغيراً، ولا يُقبل المتقدّم نفسه مرّتين على الإعلان نفسه.
            </p>
          </FormField>
          <FormField label="الهاتف">
            <input value={applicantForm.phone}
              onChange={(e) => setApplicantForm({ ...applicantForm, phone: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="رابط السيرة الذاتية">
            <input value={applicantForm.resumeUrl}
              onChange={(e) => setApplicantForm({ ...applicantForm, resumeUrl: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <FormField label="رسالة التغطية">
            <textarea value={applicantForm.coverLetter}
              onChange={(e) => setApplicantForm({ ...applicantForm, coverLetter: e.target.value })}
              rows={2} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <ModalActions
            onClose={() => setShowApplicant(false)}
            onSubmit={() => { if (!saving) void handleSubmitApplicant(); }}
            submitLabel={saving ? 'جارٍ التسجيل…' : 'تسجيل'}
            color="emerald"
          />
        </Modal>
      )}

      {/* ★ الرفض يحتاج سبباً — Modal لا prompt() (سياسة المنصة) */}
      {rejectTarget && (
        <Modal title={`رفض: ${rejectTarget.name}`} onClose={() => setRejectTarget(null)}>
          <FormField label="سبب الرفض" required>
            <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
              rows={3} className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <p className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            الرفض بلا سبب مرفوض في القاعدة — السبب يبقى في السجلّ ولا يُحذف.
          </p>
          <ModalActions
            onClose={() => setRejectTarget(null)}
            onSubmit={() => { if (!saving) void handleReject(); }}
            submitLabel={saving ? 'جارٍ…' : 'رفض'}
            color="red"
          />
        </Modal>
      )}

      {/* ★★★ العطل ⑬: التوظيف الحقيقيّ */}
      {hireTarget && (
        <Modal title={`توظيف: ${hireTarget.name}`} onClose={() => setHireTarget(null)}>
          <DetailRow label="البريد" value={hireTarget.email} />
          <DetailRow label="الهاتف" value={hireTarget.phone || undefined} />
          <DetailRow label="المرحلة الحالية" value={stageLabel(hireTarget.stage)} />
          <FormField label="رمز الموظف">
            <input value={hireCode} onChange={(e) => setHireCode(e.target.value)}
              placeholder="اتركه فارغاً لتوليده تلقائياً"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg" />
          </FormField>
          <p className="text-xs text-slate-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3 leading-relaxed">
            سيُنشأ <b>صفُّ موظف</b> بالبريد والهاتف وقسم الإعلان، ويُربط
            بهذا الطلب. وإن امتلأت الشواغر يُغلق الإعلان تلقائياً.
            <br />
            <span className="text-emerald-800 font-semibold">
              هذه العملية لا تُلغى — الموظَّف لا يعود متقدّماً.
            </span>
          </p>
          <ModalActions
            onClose={() => setHireTarget(null)}
            onSubmit={() => { if (!saving) void handleHire(); }}
            submitLabel={saving ? 'جارٍ التوظيف…' : 'توظيف'}
            color="emerald"
          />
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
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    teal:    'bg-teal-50 text-teal-700 border-teal-200',
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    indigo:  'bg-indigo-50 text-indigo-700 border-indigo-200',
  };
  return (
    <div className={`rounded-2xl border p-4 ${tones[tone] ?? tones.blue}`}>
      <div className="flex items-center gap-1.5 mb-1 opacity-80">
        {icon}<span className="text-xs font-semibold">{label}</span>
      </div>
      <p className="text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function Counter({ label, value, tone }: {
  label: string; value: number; tone: string;
}) {
  const tones: Record<string, string> = {
    slate:   'bg-slate-100 text-slate-600',
    amber:   'bg-amber-100 text-amber-700',
    blue:    'bg-blue-100 text-blue-700',
    emerald: 'bg-emerald-100 text-emerald-700',
  };
  return (
    <span className={`px-2 py-1 rounded-lg text-[11px] font-bold ${tones[tone] ?? tones.slate}`}
          title={label}>
      {value} {label}
    </span>
  );
}

function Chip({ active, onClick, label }: {
  active: boolean; onClick: () => void; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
        active ? 'bg-teal-600 text-white'
               : 'bg-white text-slate-600 border border-slate-200 hover:border-teal-300'
      }`}>
      {label}
    </button>
  );
}
