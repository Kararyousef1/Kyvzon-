/**
 * ════════════════════════════════════════════════════════════════
 *  PerformancePage — تقييم الأداء (HR) · أُعيدت كتابتها في المرحلة 4
 *
 *  ★★★ ما كان معطوباً — كلّه مقيس على Postgres قبل الكتابة
 *      (المسبار: tools/dev/_probe_0356.sql · التفاصيل في
 *       supabase/migrations/0356_performance_review_integrity.sql):
 *
 *  ① **إنشاء أيّ تقييم يفشل دائماً** — ستّة أعمدة معدومة تُرسَل:
 *     overall_score · strengths · improvements · completed_at
 *     · updated_at · goals_summary.
 *  ② **وأيُّ تعديل يفشل أيضاً**: محفّز من 0003 يكتب `updated_at`
 *     على جدول بلا العمود ⇒ «record new has no field updated_at».
 *  ③ سُلَّمان متناقضان: القاعدة `rating 1..5` والصفحة `0..100`
 *     ⇒ «undefined%» ولون **أحمر دائماً** لكل تقييم.
 *  ④ `status` نصٌّ حرّ ⇒ شارة فارغة لأيّ قيمة خارج الخمس.
 *  ⑤ الدورة بلا قيود: نهاية قبل بداية · فترة مخترعة · حالة وهمية.
 *  ⑥ تقييمان لنفس الموظف في نفس الدورة.
 *  ⑦ الموظف يُقيّم نفسه بلا مانع.
 *  ⑧ `cycle_id` بلا FK ⇒ تقييم يتيم.
 *  ⑨ الحذف النهائي متاح لأي staff.
 *  ⑩ ثلاثة استعلامات بلا حدّ + ربط بخريطتين في المتصفّح.
 *  ⑪ `EmptyState({ icon }: { icon: any })` — `any` صريح.
 *
 *  ★ الصفحة لا تلمس Supabase — كل شيء عبر `performanceReviewSdk`.
 * ════════════════════════════════════════════════════════════════
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp, Plus, Loader2, Eye, Star, Target, Calendar,
  Archive, RefreshCw, Search, ShieldAlert, Award, Users, X,
} from 'lucide-react';
import { useUIStore } from '../../core/stores';
import {
  performanceReviewSdk, employeeService,
  REVIEW_STATUS_AR, REVIEW_STATUS_TONE, REVIEW_TRANSITIONS,
  CYCLE_STATUS_AR, CYCLE_STATUS_TONE, CYCLE_TRANSITIONS,
  CYCLE_PERIODS, CYCLE_PERIOD_AR, REVIEW_STATUSES,
} from '../../services/sdk';
import type {
  PerformanceSummary, CycleRow, ReviewRow,
  ReviewDbStatus, CycleDbStatus, CyclePeriod,
} from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Modal, FormField, ModalActions, EmployeePicker } from './LoansPage';

/** اليوم بتوقيت بغداد — القاعدة تستعمل Asia/Baghdad صراحةً */
function todayBaghdad(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/** إضافة أشهر تقويمية بأمان — لا setMonth (يقفز 31 يناير إلى 3 مارس) */
function addMonthsSafe(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(
    target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const PERIOD_MONTHS: Record<CyclePeriod, number> = {
  monthly: 1, quarterly: 3, semi_annual: 6, annual: 12,
};

/** لون الدرجة — على سُلَّم 0..100 الواحد */
function scoreTone(score: number | null): { text: string; bg: string } {
  if (score === null) return { text: '#64748b', bg: '#64748b22' };
  if (score >= 85) return { text: '#10b981', bg: '#10b98122' };
  if (score >= 70) return { text: '#f59e0b', bg: '#f59e0b22' };
  return { text: '#ef4444', bg: '#ef444422' };
}

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const t = new Date(d);
  if (Number.isNaN(t.getTime())) return '—';
  return format(t, 'd MMM yyyy', { locale: ar });
}

export default function PerformancePage() {
  const { addToast } = useUIStore();

  const [tab, setTab] = useState<'cycles' | 'reviews'>('cycles');
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [cycles, setCycles]   = useState<CycleRow[]>([]);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);

  const [statusFilter, setStatusFilter] = useState<'all' | ReviewDbStatus>('all');
  const [cycleFilter, setCycleFilter]   = useState<string>('all');
  const [search, setSearch]             = useState('');
  const [includeArchived, setIncludeArchived] = useState(false);

  const [showCycleModal, setShowCycleModal]   = useState(false);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [selected, setSelected] = useState<ReviewRow | null>(null);
  const [archiving, setArchiving] = useState<ReviewRow | null>(null);
  const [archiveReason, setArchiveReason] = useState('');

  const [cycleForm, setCycleForm] = useState({
    name: '', description: '',
    start_date: todayBaghdad(),
    end_date: addMonthsSafe(todayBaghdad(), 3),
    period: 'quarterly' as CyclePeriod,
  });

  const [reviewForm, setReviewForm] = useState({
    cycle_id: '', employee_id: '', reviewer_id: '',
    score: '75', strengths: '', improvements: '', comments: '',
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // ★ العطل ⑩: ثلاثة استعلامات بلا حدّ وخريطتان في المتصفّح
      //   صارت ثلاث دوال قاعدة، كلّها محدودة ومحسوبة هناك.
      const [sum, cyc, rev] = await Promise.all([
        performanceReviewSdk.summary(),
        performanceReviewSdk.cycles(includeArchived, 100),
        performanceReviewSdk.reviews({
          cycleId: cycleFilter === 'all' ? null : cycleFilter,
          status:  statusFilter === 'all' ? null : statusFilter,
          search:  search.trim() || null,
          includeArchived,
          limit: 300,
        }),
      ]);
      setSummary(sum);
      setCycles(cyc);
      setReviews(rev);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, cycleFilter, statusFilter, search, includeArchived]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  const openCycles = useMemo(
    () => cycles.filter((c) => c.status === 'draft' || c.status === 'active'),
    [cycles],
  );

  const reviewCounts = useMemo(() => {
    const c: Record<string, number> = { all: reviews.length };
    for (const s of REVIEW_STATUSES) c[s] = 0;
    for (const r of reviews) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [reviews]);

  // ── الدورة ────────────────────────────────────────────────────
  const handleCreateCycle = async () => {
    if (cycleForm.name.trim() === '') {
      addToast('اسم الدورة إلزاميّ', 'warning'); return;
    }
    if (!cycleForm.start_date || !cycleForm.end_date) {
      addToast('تاريخا البداية والنهاية إلزاميّان', 'warning'); return;
    }
    // ★ العطل ⑤: النهاية قبل البداية كانت تمرّ إلى القاعدة
    if (cycleForm.end_date < cycleForm.start_date) {
      addToast('تاريخ النهاية قبل البداية', 'warning'); return;
    }
    setProcessing(true);
    try {
      await performanceReviewSdk.createCycle({
        name: cycleForm.name.trim(),
        description: cycleForm.description.trim() || null,
        startDate: cycleForm.start_date,
        endDate: cycleForm.end_date,
        period: cycleForm.period,
      });
      addToast('أُنشئت دورة التقييم', 'success');
      setShowCycleModal(false);
      setCycleForm({
        name: '', description: '',
        start_date: todayBaghdad(),
        end_date: addMonthsSafe(todayBaghdad(), 3),
        period: 'quarterly',
      });
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleCycleStatus = async (cycle: CycleRow, next: CycleDbStatus) => {
    setProcessing(true);
    try {
      await performanceReviewSdk.setCycleStatus(cycle.id, next);
      addToast(
        next === 'closed'
          ? 'أُغلقت الدورة وأُلغيت تقييماتها المعلَّقة'
          : `حالة الدورة الآن: ${CYCLE_STATUS_AR[next]}`,
        'success');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  // ── التقييم ───────────────────────────────────────────────────
  const handleCreateReview = async () => {
    const score = Number(reviewForm.score);
    if (!reviewForm.employee_id) {
      addToast('اختر الموظف', 'warning'); return;
    }
    // ★ العطل ③: الدرجة على سُلَّم واحد صريح 0..100
    if (!Number.isFinite(score) || score < 0 || score > 100) {
      addToast('الدرجة يجب أن تكون بين 0 و 100', 'warning'); return;
    }
    setProcessing(true);
    try {
      // ★ العطل ①: هذه الحقول تُقابل أعمدةً موجودة فعلاً منذ 0356
      await performanceReviewSdk.createReview({
        employeeId: reviewForm.employee_id,
        cycleId: reviewForm.cycle_id || null,
        reviewerId: reviewForm.reviewer_id || null,
        score,
        strengths: reviewForm.strengths.trim() || null,
        improvements: reviewForm.improvements.trim() || null,
        comments: reviewForm.comments.trim() || null,
      });
      addToast('أُنشئ التقييم بحالة «مسودة»', 'success');
      setShowReviewModal(false);
      setReviewForm({
        cycle_id: '', employee_id: '', reviewer_id: '',
        score: '75', strengths: '', improvements: '', comments: '',
      });
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleReviewStatus = async (review: ReviewRow, next: ReviewDbStatus) => {
    setProcessing(true);
    try {
      await performanceReviewSdk.setReviewStatus(review.id, next);
      addToast(`الحالة الآن: ${REVIEW_STATUS_AR[next]}`, 'success');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleArchive = async () => {
    if (!archiving) return;
    if (archiveReason.trim() === '') {
      addToast('سبب الأرشفة إلزاميّ', 'warning'); return;
    }
    setProcessing(true);
    try {
      // ★ العطل ⑨: الحذف كان نهائياً — الآن أرشفة بأثر تدقيق
      await performanceReviewSdk.archiveReview(archiving.id, archiveReason.trim());
      addToast('أُرشِف التقييم — يبقى للتدقيق', 'success');
      setArchiving(null);
      setArchiveReason('');
      await fetchAll();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" dir="rtl">
      {/* ═══ الترويسة ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
            <TrendingUp className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">تقييم الأداء</h1>
            <p className="text-sm text-slate-500">دورات التقييم ونتائجها</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchAll()}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            تحديث
          </button>
          {tab === 'cycles' ? (
            <button
              onClick={() => setShowCycleModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
            >
              <Plus size={18} /> دورة جديدة
            </button>
          ) : (
            <button
              onClick={() => setShowReviewModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition-colors shadow-sm"
            >
              <Plus size={18} /> تقييم جديد
            </button>
          )}
        </div>
      </div>

      {/* ═══ البطاقات — محسوبة في القاعدة ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard
          icon={Calendar} tone="text-slate-900"
          value={summary ? String(summary.cycles) : '—'}
          label="دورات التقييم"
          hint={summary ? `${summary.active} نشطة` : ''}
        />
        <StatCard
          icon={Star} tone="text-blue-600"
          value={summary ? String(summary.reviews) : '—'}
          label="التقييمات"
          hint={summary ? `${summary.completed} مكتملة` : ''}
        />
        {/* ★★★ «لم يُقيَّم أحد» ≠ «متوسّط صفر» (درس 0353) */}
        <StatCard
          icon={Award}
          tone={summary && summary.avgScore !== null
            ? (summary.avgScore >= 70 ? 'text-emerald-600' : 'text-amber-600')
            : 'text-slate-400'}
          value={summary
            ? (summary.avgScore === null ? 'لم يُقيَّم بعد' : `${summary.avgScore}%`)
            : '—'}
          label="متوسّط الأداء"
          hint={summary && summary.topScore !== null
            ? `الأعلى ${summary.topScore}% · الأدنى ${summary.lowScore}%`
            : 'الملغاة خارج الحساب'}
        />
        <StatCard
          icon={Users} tone="text-indigo-600"
          value={summary
            ? (summary.coverage === null ? '—' : `${summary.coverage}%`)
            : '—'}
          label="تغطية الموظفين"
          hint="من الموظفين النشطين"
        />
      </div>

      {/* ═══ التبويبات ═══ */}
      <div className="flex gap-2 mb-5 border-b border-slate-200">
        {([['cycles', 'دورات التقييم', Calendar],
           ['reviews', 'التقييمات', Star]] as const).map(([key, label, Icon]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-3 font-semibold border-b-2 transition-colors ${
              tab === key
                ? 'text-blue-600 border-blue-600'
                : 'text-slate-500 border-transparent hover:text-slate-700'
            }`}
          >
            <Icon size={18} /> {label}
          </button>
        ))}
        <label className="mr-auto flex items-center gap-2 text-sm text-slate-600 self-center cursor-pointer">
          <input
            type="checkbox" checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="rounded border-slate-300"
          />
          إظهار المؤرشف
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="animate-spin text-blue-500 mb-3" size={40} />
          <p className="text-slate-500">جاري التحميل…</p>
        </div>
      ) : tab === 'cycles' ? (
        cycles.length === 0 ? (
          <EmptyState icon={Calendar} title="لا توجد دورات تقييم" />
        ) : (
          <div className="grid gap-3">
            {cycles.map((cycle) => (
              <CycleCard
                key={cycle.id} cycle={cycle} processing={processing}
                onStatus={(next) => void handleCycleStatus(cycle, next)}
                onOpenReviews={() => { setCycleFilter(cycle.id); setTab('reviews'); }}
              />
            ))}
          </div>
        )
      ) : (
        <>
          {/* ═══ مرشّحات التقييمات — كلها في القاعدة ═══ */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex-1 min-w-[200px] relative">
              <Search size={17} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text" value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث بالاسم أو الرمز أو الدورة…"
                className="w-full pr-10 pl-3 py-2.5 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={cycleFilter}
              onChange={(e) => setCycleFilter(e.target.value)}
              aria-label="ترشيح بالدورة"
              className="px-3 py-2.5 border border-slate-200 rounded-xl bg-white outline-none"
            >
              <option value="all">كل الدورات</option>
              {cycles.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <FilterChip
              active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}
              label="الكل" count={reviewCounts.all}
            />
            {REVIEW_STATUSES.map((s) => (
              <FilterChip
                key={s} active={statusFilter === s} onClick={() => setStatusFilter(s)}
                label={REVIEW_STATUS_AR[s]} count={reviewCounts[s] ?? 0}
              />
            ))}
          </div>

          {reviews.length === 0 ? (
            <EmptyState icon={Star} title="لا توجد تقييمات" />
          ) : (
            <div className="grid gap-3">
              {reviews.map((review) => (
                <ReviewCard
                  key={review.id} review={review} processing={processing}
                  onDetails={() => setSelected(review)}
                  onStatus={(next) => void handleReviewStatus(review, next)}
                  onArchive={() => { setArchiving(review); setArchiveReason(''); }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ═══ نافذة الدورة ═══ */}
      {showCycleModal && (
        <Modal title="دورة تقييم جديدة" onClose={() => setShowCycleModal(false)}>
          <FormField label="اسم الدورة" required>
            <input
              type="text" value={cycleForm.name}
              onChange={(e) => setCycleForm({ ...cycleForm, name: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
          <FormField label="الوصف">
            <textarea
              value={cycleForm.description} rows={2}
              onChange={(e) => setCycleForm({ ...cycleForm, description: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </FormField>
          <FormField label="فترة التقييم" required>
            <select
              value={cycleForm.period}
              onChange={(e) => {
                const period = e.target.value as CyclePeriod;
                setCycleForm({
                  ...cycleForm, period,
                  // ★ الحساب بأشهر تقويمية — لا setMonth
                  end_date: addMonthsSafe(cycleForm.start_date, PERIOD_MONTHS[period]),
                });
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            >
              {CYCLE_PERIODS.map((p) => (
                <option key={p} value={p}>{CYCLE_PERIOD_AR[p]}</option>
              ))}
            </select>
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="من تاريخ" required>
              <input
                type="date" value={cycleForm.start_date}
                onChange={(e) => setCycleForm({
                  ...cycleForm, start_date: e.target.value,
                  end_date: addMonthsSafe(e.target.value, PERIOD_MONTHS[cycleForm.period]),
                })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </FormField>
            <FormField label="إلى تاريخ" required>
              <input
                type="date" value={cycleForm.end_date}
                min={cycleForm.start_date}
                onChange={(e) => setCycleForm({ ...cycleForm, end_date: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </FormField>
          </div>
          {/* ★ العطل ⑤: تنبيه قبل الإرسال بدل خطأ خام من القاعدة */}
          {cycleForm.end_date < cycleForm.start_date && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              تاريخ النهاية قبل البداية
            </p>
          )}
          <ModalActions
            onClose={() => setShowCycleModal(false)}
            onSubmit={() => void handleCreateCycle()}
            submitLabel={processing ? 'جارٍ الإنشاء…' : 'إنشاء'}
            color="blue"
          />
        </Modal>
      )}

      {/* ═══ نافذة التقييم ═══ */}
      {showReviewModal && (
        <Modal title="تقييم جديد" onClose={() => setShowReviewModal(false)}>
          <FormField label="الدورة">
            <select
              value={reviewForm.cycle_id}
              onChange={(e) => setReviewForm({ ...reviewForm, cycle_id: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— بلا دورة —</option>
              {/* ★ المغلقة والملغاة لا تُعرض: القاعدة ترفض التقييم فيها */}
              {openCycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({CYCLE_STATUS_AR[c.status]})
                </option>
              ))}
            </select>
            {openCycles.length === 0 && (
              <p className="text-[11px] text-amber-600 mt-1">
                لا دورة مفتوحة — يمكن الإنشاء بلا دورة
              </p>
            )}
          </FormField>
          {/* ★ العطل ⑦: تسميتان مميّزتان بدل EmployeePicker مكرَّر بلا تمييز */}
          <div className="rounded-xl border border-slate-200 p-3 space-y-3">
            <p className="text-xs font-bold text-slate-500">الموظف المُقيَّم</p>
            <EmployeePicker
              value={reviewForm.employee_id}
              onChange={(id) => setReviewForm({ ...reviewForm, employee_id: id })}
            />
          </div>
          <FormField label="الدرجة (0–100)" required>
            <input
              type="number" min="0" max="100" inputMode="numeric"
              value={reviewForm.score}
              onChange={(e) => setReviewForm({ ...reviewForm, score: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              التقدير من 5 يُشتقّ آلياً في القاعدة
            </p>
          </FormField>
          <FormField label="نقاط القوة">
            <textarea
              value={reviewForm.strengths} rows={2}
              onChange={(e) => setReviewForm({ ...reviewForm, strengths: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <FormField label="نقاط التحسين">
            <textarea
              value={reviewForm.improvements} rows={2}
              onChange={(e) => setReviewForm({ ...reviewForm, improvements: e.target.value })}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg"
            />
          </FormField>
          <div className="flex items-start gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
            <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
            <span>
              لا يجوز أن يُقيّم الموظف نفسه، ولا تقييمان للموظف نفسه في
              الدورة نفسها — القاعدة تحرسهما.
            </span>
          </div>
          <ModalActions
            onClose={() => setShowReviewModal(false)}
            onSubmit={() => void handleCreateReview()}
            submitLabel={processing ? 'جارٍ الإنشاء…' : 'إنشاء'}
            color="blue"
          />
        </Modal>
      )}

      {/* ═══ نافذة التفاصيل ═══ */}
      {selected && (
        <Modal title="تفاصيل التقييم" onClose={() => setSelected(null)}>
          <div className="space-y-1">
            <DetailRow label="الموظف" value={selected.employeeName} />
            <DetailRow label="الرمز" value={selected.employeeCode} />
            <DetailRow label="القسم" value={selected.department} />
            <DetailRow label="المقيّم" value={selected.reviewerName} />
            <DetailRow label="الدورة" value={selected.cycleName} />
            <DetailRow
              label="الدرجة"
              value={selected.score === null ? '—' : `${selected.score}%`}
            />
            <DetailRow
              label="التقدير"
              value={selected.rating === null ? '—' : `${selected.rating} من 5`}
            />
            <DetailRow label="الحالة" value={REVIEW_STATUS_AR[selected.status]} />
            <DetailRow label="أُرسل" value={fmtDate(selected.submittedAt)} />
            <DetailRow label="اكتمل" value={fmtDate(selected.completedAt)} />
            {selected.strengths && (
              <DetailRow label="نقاط القوة" value={selected.strengths} />
            )}
            {selected.improvements && (
              <DetailRow label="نقاط التحسين" value={selected.improvements} />
            )}
            {selected.comments && (
              <DetailRow label="ملاحظات" value={selected.comments} />
            )}
          </div>
        </Modal>
      )}

      {/* ═══ نافذة الأرشفة — بديل الحذف النهائي ═══ */}
      {archiving && (
        <Modal
          title="أرشفة التقييم"
          onClose={() => { setArchiving(null); setArchiveReason(''); }}
        >
          <p className="text-sm text-slate-600">
            {archiving.employeeName} —{' '}
            {archiving.score === null ? '—' : `${archiving.score}%`}
          </p>
          <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5">
            التقييم يبقى للتدقيق ولا يُحذف. وأرشفته تُحرّر مكان الموظف
            في الدورة فيمكن إنشاء تقييم جديد.
          </p>
          <textarea
            value={archiveReason} rows={3} autoFocus
            onChange={(e) => setArchiveReason(e.target.value)}
            placeholder="سبب الأرشفة (إلزاميّ)"
            className="w-full border border-slate-200 rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300"
          />
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => { setArchiving(null); setArchiveReason(''); }}
              disabled={processing}
              className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl font-bold text-sm disabled:opacity-50"
            >
              تراجع
            </button>
            <button
              onClick={() => void handleArchive()}
              disabled={processing || archiveReason.trim() === ''}
              className="px-5 py-2.5 bg-slate-800 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2"
            >
              {processing && <Loader2 size={14} className="animate-spin" />}
              تأكيد الأرشفة
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ مكوّنات الصفحة ═══════════════

/** ★ العطل ⑪: كان `icon: any` — الآن نوع مكتبة الأيقونات */
function StatCard({ icon: Icon, tone, value, label, hint }: {
  icon: LucideIcon; tone: string; value: string; label: string; hint?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4">
      <div className="flex items-center gap-1.5 text-slate-400 mb-1.5">
        <Icon size={16} />
        <span className="text-xs font-semibold">{label}</span>
      </div>
      <p className={`text-xl font-bold ${tone} truncate`}>{value}</p>
      {hint && <p className="text-[11px] text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

function FilterChip({ active, onClick, label, count }: {
  active: boolean; onClick: () => void; label: string; count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors border ${
        active
          ? 'bg-blue-600 text-white border-blue-600'
          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
      }`}
    >
      {label}
      <span className={`mr-1.5 text-xs ${active ? 'opacity-80' : 'text-slate-400'}`}>
        {count}
      </span>
    </button>
  );
}

function CycleCard({ cycle, processing, onStatus, onOpenReviews }: {
  cycle: CycleRow; processing: boolean;
  onStatus: (next: CycleDbStatus) => void; onOpenReviews: () => void;
}) {
  const nexts = CYCLE_TRANSITIONS[cycle.status] ?? [];
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-4 transition-shadow ${
      cycle.archived ? 'opacity-60' : 'hover:shadow-md'
    }`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-bold text-slate-900">{cycle.name}</h3>
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
              CYCLE_STATUS_TONE[cycle.status]
            }`}>
              {CYCLE_STATUS_AR[cycle.status]}
            </span>
            <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-600">
              {CYCLE_PERIOD_AR[cycle.period as CyclePeriod] ?? cycle.period}
            </span>
            {cycle.archived && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500">
                <Archive size={10} className="inline ml-1" />مؤرشفة
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500">{cycle.description || 'بلا وصف'}</p>
          <p className="text-xs text-slate-400 mt-1">
            {fmtDate(cycle.startDate)} ← {fmtDate(cycle.endDate)}
          </p>
        </div>
        <div className="text-left flex-shrink-0">
          <p className="text-lg font-bold text-slate-800">
            {cycle.reviews} <span className="text-xs font-normal text-slate-400">تقييم</span>
          </p>
          <p className="text-xs text-slate-500">{cycle.completed} مكتمل</p>
          {/* ★★ NULL ≠ صفر */}
          <p className="text-xs text-slate-500">
            {cycle.avgScore === null ? 'لا متوسّط' : `متوسّط ${cycle.avgScore}%`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <button
          onClick={onOpenReviews}
          className="px-3 py-1.5 rounded-lg font-semibold text-xs bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
        >
          <Target size={13} className="inline ml-1" />تقييماتها
        </button>
        {/* ★ الانتقالات المسموحة فقط — نسخة من جدول القاعدة */}
        {!cycle.archived && nexts.map((next) => (
          <button
            key={next} onClick={() => onStatus(next)} disabled={processing}
            className="px-3 py-1.5 rounded-lg font-semibold text-xs border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            → {CYCLE_STATUS_AR[next]}
          </button>
        ))}
        {cycle.status === 'active' && (
          <span className="text-[11px] text-slate-400 mr-auto">
            الإغلاق يُلغي التقييمات المعلَّقة
          </span>
        )}
      </div>
    </div>
  );
}

function ReviewCard({ review, processing, onDetails, onStatus, onArchive }: {
  review: ReviewRow; processing: boolean;
  onDetails: () => void; onStatus: (next: ReviewDbStatus) => void;
  onArchive: () => void;
}) {
  // ★ العطل ③: اللون من `score` الحقيقيّ — كان `overall_score` معدوماً
  //   فيحسب من `undefined >= 85` = false ⇒ أحمر لكل تقييم أبداً.
  const tone = scoreTone(review.score);
  const nexts = review.archived ? [] : (REVIEW_TRANSITIONS[review.status] ?? []);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 p-4 transition-shadow ${
      review.archived ? 'opacity-60' : 'hover:shadow-md'
    }`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: tone.bg }}
          >
            <Star size={20} style={{ color: tone.text }} />
          </div>
          <div className="min-w-0">
            <p className="font-bold text-slate-900 truncate">
              {review.employeeName}
            </p>
            <p className="text-xs text-slate-500 truncate">
              {review.employeeCode} · {review.department} · {review.cycleName}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: tone.text }}>
              {review.score === null ? '—' : `${review.score}%`}
            </p>
            <span className="text-[11px] text-slate-400">
              {review.rating === null ? 'بلا تقدير' : `${review.rating}/5`}
            </span>
          </div>
          <div className="flex flex-col items-end gap-1">
            <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
              REVIEW_STATUS_TONE[review.status]
            }`}>
              {REVIEW_STATUS_AR[review.status]}
            </span>
            {review.archived && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-500">
                <Archive size={10} className="inline ml-1" />مؤرشف
              </span>
            )}
          </div>
          <button
            onClick={onDetails}
            title="التفاصيل"
            className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
          >
            <Eye size={16} />
          </button>
        </div>
      </div>

      {!review.archived && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {nexts.map((next) => (
            <button
              key={next} onClick={() => onStatus(next)} disabled={processing}
              className="px-3 py-1.5 rounded-lg font-semibold text-xs border border-slate-200 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              → {REVIEW_STATUS_AR[next]}
            </button>
          ))}
          <button
            onClick={onArchive} disabled={processing}
            className="px-3 py-1.5 rounded-lg font-semibold text-xs bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50 transition-colors"
          >
            <Archive size={13} className="inline ml-1" />أرشفة
          </button>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="flex items-start justify-between py-1.5 border-b border-slate-50 last:border-0 gap-3">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="font-semibold text-slate-900 text-sm text-left">
        {value || '—'}
      </span>
    </div>
  );
}

/** ★ العطل ⑪: `icon: any` صار `LucideIcon` */
function EmptyState({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
        <Icon size={28} className="text-slate-400" />
      </div>
      <p className="font-semibold text-slate-700">{title}</p>
    </div>
  );
}
