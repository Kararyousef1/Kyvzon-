/**
 * ════════════════════════════════════════════════════════════════
 *  LeaveRequestPage — طلبات الإجازات والزمنيات
 *
 *  ═══ ما تغيّر في 0339 ═══════════════════════════════════════════
 *
 *  ★★★ الصلاحية لم تعد تُشتقّ من مسار URL.
 *      كان:  const viewMode = location.pathname.startsWith('/app/manager/') ? …
 *            const canApprove = viewMode === 'hr' | 'supervisor' | 'manager'
 *      وكان `/app/manager/leave-requests` و`/app/supervisor/leave-requests`
 *      **غير مسجَّلين في AppRouter أصلاً** — فرعان ميّتان تماماً، ومع ذلك
 *      كانا يمنحان صلاحية اعتماد لو وُصِل إليهما.
 *      الآن: `row.canDecide` يأتي من القاعدة = من له خطوة `active`
 *      في سلسلة الاعتماد. لا مسار يمنح صلاحية.
 *
 *  ★★★ زرّ «موافقة» كان يفشل دائماً.
 *      `approveLeave(id, realEmployeeId)` يكتب `employees.id` في عمود
 *      `approved_by` الذي يشير FK إلى `profiles`. مُقاس بجلسة RLS:
 *        violates foreign key constraint "leaves_approved_by_fkey"
 *      الآن القرار عبر `unifiedApprovalService.decideHrAny()` وحده — وهو المسار
 *      الذي يُحرّك السلسلة ويُزامن `leaves.status` في القاعدة.
 *
 *  ★★ الرصيد صار حقيقياً: حجز عند الطلب · خصم عند الاعتماد ·
 *      تحرير عند الرفض أو الإلغاء. كان `leave_balance` جدول زينة:
 *      خمسة أيام معتمَدة تركت `annual_used = 0.000`.
 *
 *  ★★ المدة تُحسب في القاعدة. `calculateWorkingDays` كانت تستثني
 *      الجمعة فقط ولا تعرف `holidays` (المُعامل الثالث لم يُمرَّر قط).
 *
 *  ★ الإلغاء بدل الحذف: الطلب يبقى بحالة 'ملغى' للتدقيق.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, FileText, Send, Clock, Loader, AlertTriangle,
  CheckCircle2, XCircle, Ban, Inbox, User,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { unifiedApprovalService, employeeDashboardService } from '../../services/sdk';
import {
  leaveRequestService, leaveErrorMessage,
  type LeaveRequestRow, type LeaveScope, type LeaveStatusValue,
} from '../../services/sdk/LeaveRequestService';
import {
  LeaveType, DEFAULT_LEAVE_SETTINGS,
  getLeaveTypeLabel, getLeaveTypeColor, getDefaultLeaveRange,
} from '../../utils/leaveUtils';
import { getErrorMessage } from '../../services/errors';
import type { LeaveBalanceSummary } from '../../services/sdk/EmployeeDashboardService';

// ════════════════════════════════════════════════════
// أنواع البيانات
// ════════════════════════════════════════════════════

type StatusFilter = 'all' | LeaveStatusValue;

const STATUS_STYLE: Record<string, string> = {
  انتظار: 'bg-amber-100 text-amber-700',
  موافق: 'bg-emerald-100 text-emerald-700',
  مرفوض: 'bg-red-100 text-red-700',
  ملغى: 'bg-slate-100 text-slate-500',
};

const STATUS_LABEL: Record<string, string> = {
  انتظار: 'قيد المراجعة',
  موافق: 'تمت الموافقة',
  مرفوض: 'مرفوض',
  ملغى: 'ملغى',
};

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function LeaveRequestPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  /**
   * ★ النطاق بديل `viewMode` المشتقّ من URL.
   *   `mine`  — طلباتي
   *   `inbox` — ما ينتظر قراري (تحدّده القاعدة من السلسلة)
   *   `all`   — سجلّ الشركة (RLS يحكم من يراه فعلاً)
   */
  const [scope, setScope] = useState<LeaveScope>('mine');
  /**
   * ★★★★ عطلٌ بلّغ عنه المستخدم (2026-08-08): «يظهر للموظف كما يظهر
   *   للموارد البشرية طلباتي والتي بانتظار قراره وسجلات الشركة».
   *
   *   التبويبات الثلاثة كانت تُعرض لكلّ مستخدمٍ بلا شرط دور. RLS
   *   حرست البيانات (الموظف رأى صفَّه هو)، لكنّ التبويب ظهر فأوهمه
   *   أنّه يطالع سجلّ الشركة. **الإيهامُ عطلٌ وإن لم يُسرّب.**
   *
   *   القرار: الموظف يرى «طلباتي» وحدها. والحارسُ الحقيقيّ في
   *   القاعدة — `can_use_request_scope` في 0372 — فلا يكفي الإخفاء.
   */
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [canSeeInbox, setCanSeeInbox] = useState(false);

  // ── حالة الإجازات ────────────────────────────────────────────
  const [rows, setRows] = useState<LeaveRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [previewDays, setPreviewDays] = useState(0);
  const [balance, setBalance] = useState<LeaveBalanceSummary | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('all');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [inboxCount, setInboxCount] = useState(0);

  const [formData, setFormData] = useState({
    leave_type: 'سنوية' as LeaveType,
    start_date: getDefaultLeaveRange(7).from,
    end_date: getDefaultLeaveRange(7).to,
    reason: '',
    attachment_url: '',
  });

  // ── الرصيد ────────────────────────────────────────────────────
  const loadBalance = useCallback(async () => {
    try {
      setBalance(await employeeDashboardService.leaveBalance());
    } catch { /* الرصيد اختياري للعرض */ }
  }, []);

  // ── جلب الطلبات ───────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await leaveRequestService.list(
        scope,
        statusFilter === 'all' ? null : statusFilter,
        200,
      );
      setRows(data);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
      setRows([]);
    } finally { setLoading(false); }
  }, [scope, statusFilter, addToast]);

  /**
   * ★ الصلاحية تُسأل عنها القاعدة **قبل** عرض أيّ تبويب.
   *   `canUseScope` تستدعي `can_use_request_scope` (0372).
   */
  const fetchScopes = useCallback(async () => {
    const [allOk, inboxOk] = await Promise.all([
      leaveRequestService.canUseScope('all'),
      leaveRequestService.canUseScope('inbox'),
    ]);
    setCanSeeAll(allOk);
    setCanSeeInbox(inboxOk);
    if (!inboxOk) { setInboxCount(0); return; }
    try {
      const pending = await leaveRequestService.list('inbox', 'انتظار', 200);
      setInboxCount(pending.length);
    } catch { setInboxCount(0); }
  }, []);

  useEffect(() => { if (user) { void fetchRows(); } }, [user, fetchRows]);
  useEffect(() => {
    if (!user) return;
    void loadBalance();
    void fetchScopes();
  }, [user, loadBalance, fetchScopes]);

  // ── معاينة المدة: من القاعدة لا من المتصفح ───────────────────
  useEffect(() => {
    if (!formData.start_date || !formData.end_date) { setPreviewDays(0); return; }
    let alive = true;
    void (async () => {
      const d = await leaveRequestService.workingDays(
        formData.start_date, formData.end_date);
      if (alive) setPreviewDays(d);
    })();
    return () => { alive = false; };
  }, [formData.start_date, formData.end_date]);

  // ── إرسال طلب إجازة ───────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.start_date || !formData.end_date) return;
    setSubmitting(true);
    try {
      // ★ لا نمرّر employee_id ولا working_days_count — القاعدة تشتقّهما.
      const res = await leaveRequestService.submit({
        leaveType: formData.leave_type,
        dateFrom: formData.start_date,
        dateTo: formData.end_date,
        reason: formData.reason,
        attachmentUrl: formData.attachment_url || undefined,
      });
      addToast(`تم إرسال طلب الإجازة (${res.workingDays} يوم عمل)`, 'success');
      setShowForm(false);
      setFormData((f) => ({ ...f, reason: '' }));
      await Promise.all([fetchRows(), loadBalance()]);
    } catch (err) {
      addToast(leaveErrorMessage(getErrorMessage(err)), 'error');
    } finally { setSubmitting(false); }
  };

  // ── القرار: عبر سلسلة الاعتماد حصراً ─────────────────────────
  const decide = async (
    row: LeaveRequestRow,
    decision: 'approved' | 'rejected',
    comments?: string,
  ) => {
    setProcessingId(row.id);
    try {
      // ★ واجهة المحرّك الموحّد تقبل معرّف المصدر مباشرةً وتترجمه داخل
      //   القاعدة إلى معرّف طلب الاعتماد. لا بحث من الواجهة في الجدول القديم.
      //   القاعدة تُزامن leaves.status عبر sync_hr_source_status (0323).
      const finalStatus = await unifiedApprovalService.decideHrAny(row.id, decision, comments);
      addToast(
        finalStatus === 'pending'
          ? 'سُجِّل قرارك — الطلب انتقل للمرحلة التالية'
          : finalStatus === 'approved'
            ? 'اكتملت السلسلة: تمت الموافقة'
            : 'اكتملت السلسلة: مرفوض',
        'success',
      );
      setRejectingId(null); setRejectionReason('');
      await Promise.all([fetchRows(), fetchScopes(), loadBalance()]);
    } catch (err) {
      addToast(leaveErrorMessage(getErrorMessage(err)), 'error');
    } finally { setProcessingId(null); }
  };

  // ── الإلغاء (بديل الحذف) ─────────────────────────────────────
  const handleCancel = async () => {
    if (!cancellingId) return;
    setProcessingId(cancellingId);
    try {
      await leaveRequestService.cancel(cancellingId, cancelReason.trim() || undefined);
      addToast('أُلغي الطلب وحُرِّر الرصيد المحجوز', 'success');
      setCancellingId(null); setCancelReason('');
      await Promise.all([fetchRows(), loadBalance()]);
    } catch (err) {
      addToast(leaveErrorMessage(getErrorMessage(err)), 'error');
    } finally { setProcessingId(null); }
  };

  // ── المشتقّات ────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === 'انتظار').length,
    approved: rows.filter((r) => r.status === 'موافق').length,
    rejected: rows.filter((r) => r.status === 'مرفوض').length,
    cancelled: rows.filter((r) => r.status === 'ملغى').length,
  }), [rows]);

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (leaveTypeFilter !== 'all' && r.leaveType !== leaveTypeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      // ★ الاسم يُحلّ في القاعدة — كان `employee_name` عموداً غير موجود
      //   في `leaves` فالبحث لم يُطابق شيئاً أبداً في وضع الموارد البشرية.
      const hay = `${r.employeeName} ${r.reason ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, leaveTypeFilter, searchQuery]);

  const scopeGradient: Record<LeaveScope, string> = {
    mine: 'from-emerald-600 to-teal-700',
    inbox: 'from-blue-600 to-indigo-700',
    all: 'from-purple-600 to-pink-700',
  };

  const statusBadge = (status: string) => (
    <span className={`px-3 py-1 rounded-full text-xs font-bold ${
      STATUS_STYLE[status] || 'bg-slate-100 text-slate-600'}`}>
      {STATUS_LABEL[status] || status}
    </span>
  );

  const remaining = balance
    ? { annual: balance.annualLeft, sick: balance.sickLeft }
    : null;

  // ════════════════════════════════════════════════════
  // العرض
  // ════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* ★ 0340: تبويب الزمنيات كان نسخةً ثانيةً من PermissionsPage —
          شاشتان تكتبان في نفس الجدول بمنطقَي صلاحية مختلفَين. أُزيل هنا
          وبقيت الشاشة المخصّصة وحدها مصدرَ الحقيقة. */}
      <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-1.5 overflow-x-auto">
        <span className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm bg-white text-emerald-600 shadow-sm">
          <Calendar size={16} /> الإجازات
        </span>
        <Link
          to="/app/employee/permissions"
          className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm text-slate-500 hover:bg-slate-100 transition-all"
        >
          <Clock size={16} /> الزمنيات
        </Link>
      </div>

          <div className={`bg-gradient-to-br ${scopeGradient[scope]} rounded-2xl p-6 text-white`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-2xl font-extrabold">
                  <Calendar size={24} className="inline ml-2" />طلبات الإجازات
                </h2>
                <p className="text-white/70 mt-1">
                  المدة والرصيد محسوبان في النظام — تُستثنى الجمعة والعطل الرسمية
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl font-bold text-sm"
              >
                {showForm ? 'إلغاء' : '+ طلب إجازة'}
              </button>
            </div>
          </div>

          {/* ★ اختيار النطاق — يختفي كلّياً للموظف العاديّ */}
          <div
            className="flex gap-2 bg-white border rounded-2xl p-1.5 overflow-x-auto"
            hidden={!canSeeAll && !canSeeInbox}
          >
            {([
              { key: 'mine' as const, label: 'طلباتي', icon: User, show: true },
              { key: 'inbox' as const, label: 'بانتظار قراري', icon: Inbox, show: canSeeInbox },
              { key: 'all' as const, label: 'سجلّ الشركة', icon: FileText, show: canSeeAll },
            ].filter((t) => t.show)).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setScope(key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm transition-all ${
                  scope === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                <Icon size={15} /> {label}
                {key === 'inbox' && inboxCount > 0 && (
                  <span className="bg-amber-400 text-slate-900 rounded-full px-2 text-xs">
                    {inboxCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* الرصيد */}
          {remaining && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'رصيد سنوي متبقٍّ', value: remaining.annual, hint: `من ${balance?.annualTotal ?? 0}`, color: 'bg-emerald-50 text-emerald-700' },
                { label: 'محجوز (قيد المراجعة)', value: balance?.annualPending ?? 0, hint: 'يُحجز فور الطلب', color: 'bg-amber-50 text-amber-700' },
                { label: 'رصيد مرضي متبقٍّ', value: remaining.sick, hint: `من ${balance?.sickTotal ?? 0}`, color: 'bg-sky-50 text-sky-700' },
                { label: 'إجازة الحج', value: balance?.hajjTaken ? 'مستهلكة' : 'متاحة', hint: 'مرّة في الخدمة', color: 'bg-violet-50 text-violet-700' },
              ].map((s) => (
                <div key={s.label} className={`rounded-2xl p-4 border ${s.color}`}>
                  <div className="text-xs font-bold mb-1">{s.label}</div>
                  <div className="text-2xl font-extrabold">{s.value}</div>
                  <div className="text-[11px] opacity-70 mt-0.5">{s.hint}</div>
                </div>
              ))}
            </div>
          )}

          {/* إحصاءات النطاق */}
          {scope !== 'mine' && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { label: 'الإجمالي', value: stats.total, color: 'bg-white text-slate-800' },
                { label: 'قيد المراجعة', value: stats.pending, color: 'bg-amber-50 text-amber-700' },
                { label: 'تمت الموافقة', value: stats.approved, color: 'bg-emerald-50 text-emerald-700' },
                { label: 'مرفوض', value: stats.rejected, color: 'bg-red-50 text-red-700' },
                { label: 'ملغى', value: stats.cancelled, color: 'bg-slate-50 text-slate-500' },
              ].map((s) => (
                <div key={s.label} className={`rounded-2xl p-4 border ${s.color}`}>
                  <div className="text-xs font-bold mb-1">{s.label}</div>
                  <div className="text-2xl font-extrabold">{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* النموذج */}
          {showForm && (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border space-y-4">
              <h3 className="text-lg font-extrabold">نموذج طلب إجازة</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="leave-type" className="block text-sm font-bold mb-1">نوع الإجازة</label>
                  <select
                    id="leave-type"
                    value={formData.leave_type}
                    onChange={(e) => setFormData({ ...formData, leave_type: e.target.value as LeaveType })}
                    className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                  >
                    {DEFAULT_LEAVE_SETTINGS.map((s) => (
                      <option key={s.leaveType} value={s.leaveType}>{getLeaveTypeLabel(s.leaveType)}</option>
                    ))}
                  </select>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-indigo-600">{previewDays}</div>
                    <div className="text-xs text-gray-600">يوم عمل فعلي</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">محسوب في النظام</div>
                  </div>
                </div>
                <div>
                  <label htmlFor="leave-from" className="block text-sm font-bold mb-1">من</label>
                  <input
                    id="leave-from" type="date" value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2.5" required
                  />
                </div>
                <div>
                  <label htmlFor="leave-to" className="block text-sm font-bold mb-1">إلى</label>
                  <input
                    id="leave-to" type="date" value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full border rounded-xl px-3 py-2.5" required
                  />
                </div>
              </div>

              {formData.leave_type === 'حج' && balance?.hajjTaken && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <AlertTriangle size={15} className="inline ml-1" />
                  استُهلكت إجازة الحج — تُمنح مرّة واحدة في الخدمة
                </div>
              )}
              {previewDays === 0 && formData.start_date && formData.end_date && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700">
                  <AlertTriangle size={15} className="inline ml-1" />
                  المدى المختار لا يحتوي أيام عمل فعلية (جُمَع أو عطل رسمية)
                </div>
              )}

              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                rows={3} className="w-full border rounded-xl px-3 py-2.5"
                placeholder="سبب الإجازة..." required
              />
              <button
                type="submit" disabled={submitting || previewDays === 0}
                className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50"
              >
                {submitting ? 'جاري الإرسال...' : <><Send size={16} className="inline ml-1" />إرسال</>}
              </button>
            </form>
          )}

          {/* المرشّحات */}
          <div className="bg-white rounded-2xl p-4 border flex gap-3 flex-wrap">
            <input
              type="text" placeholder="بحث بالاسم أو السبب..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 min-w-[180px] border rounded-xl px-3 py-2.5"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="border rounded-xl px-3 py-2.5"
              aria-label="ترشيح بالحالة"
            >
              <option value="all">جميع الحالات</option>
              <option value="انتظار">قيد المراجعة</option>
              <option value="موافق">تمت الموافقة</option>
              <option value="مرفوض">مرفوض</option>
              <option value="ملغى">ملغى</option>
            </select>
            <select
              value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)}
              className="border rounded-xl px-3 py-2.5"
              aria-label="ترشيح بالنوع"
            >
              <option value="all">جميع الأنواع</option>
              {DEFAULT_LEAVE_SETTINGS.map((s) => (
                <option key={s.leaveType} value={s.leaveType}>{getLeaveTypeLabel(s.leaveType)}</option>
              ))}
            </select>
          </div>

          {/* القائمة */}
          {loading ? (
            <div className="flex justify-center py-20"><Loader className="animate-spin" size={32} /></div>
          ) : filteredRows.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border">
              <FileText size={48} className="mx-auto mb-4 opacity-40" />
              <p>
                {scope === 'inbox' ? 'لا توجد طلبات بانتظار قرارك'
                  : scope === 'mine' ? 'لم تقدّم طلب إجازة بعد'
                    : 'لا توجد طلبات في سجلّ الشركة'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredRows.map((row) => (
                <div
                  key={row.id}
                  className={`bg-white rounded-2xl p-5 border ${
                    row.status === 'انتظار' ? 'border-amber-200' : ''} hover:shadow-md`}
                >
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: `${getLeaveTypeColor(row.leaveType as LeaveType)}20`,
                            color: getLeaveTypeColor(row.leaveType as LeaveType),
                          }}
                        >
                          {getLeaveTypeLabel(row.leaveType as LeaveType)}
                        </span>
                        {statusBadge(row.status)}
                        {scope !== 'mine' && (
                          <span className="text-sm font-bold text-slate-700">
                            <User size={13} className="inline ml-1" />{row.employeeName}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                        <span>{row.dateFrom} ← {row.dateTo}</span>
                        <span className="font-bold text-slate-700">{row.workingDays} يوم عمل</span>
                      </div>
                      {row.reason && <p className="text-sm text-slate-600 mt-2">{row.reason}</p>}
                    </div>

                    <div className="flex gap-2 flex-wrap">
                      {/* ★ الأزرار تظهر بحسب صلاحية القاعدة لا بحسب المسار */}
                      {row.canDecide && (
                        <>
                          <button
                            type="button"
                            onClick={() => decide(row, 'approved')}
                            disabled={processingId === row.id}
                            className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                          >
                            <CheckCircle2 size={14} className="inline ml-1" />موافقة
                          </button>
                          <button
                            type="button"
                            onClick={() => { setRejectingId(row.id); setRejectionReason(''); }}
                            disabled={processingId === row.id}
                            className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                          >
                            <XCircle size={14} className="inline ml-1" />رفض
                          </button>
                        </>
                      )}
                      {row.canCancel && (
                        <button
                          type="button"
                          onClick={() => { setCancellingId(row.id); setCancelReason(''); }}
                          disabled={processingId === row.id}
                          className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold text-sm disabled:opacity-50"
                        >
                          <Ban size={14} className="inline ml-1" />إلغاء الطلب
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* نافذة الرفض */}
          {rejectingId && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setRejectingId(null)}
              role="presentation"
            >
              <div
                className="bg-white rounded-2xl p-6 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
                role="presentation"
              >
                <h3 className="text-lg font-extrabold mb-3">سبب رفض الطلب</h3>
                <textarea
                  value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}
                  rows={4} className="w-full border rounded-xl px-3 py-2.5"
                  placeholder="يُسجَّل السبب في سلسلة الاعتماد" autoFocus
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button" onClick={() => setRejectingId(null)}
                    className="px-4 py-2 bg-slate-100 rounded-xl"
                  >تراجع</button>
                  <button
                    type="button"
                    onClick={() => {
                      const row = rows.find((r) => r.id === rejectingId);
                      if (row) void decide(row, 'rejected', rejectionReason);
                    }}
                    disabled={!rejectionReason.trim()}
                    className="px-4 py-2 bg-red-600 text-white rounded-xl disabled:opacity-50"
                  >تأكيد الرفض</button>
                </div>
              </div>
            </div>
          )}

          {/* نافذة الإلغاء — بديل الحذف النهائي */}
          {cancellingId && (
            <div
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
              onClick={() => setCancellingId(null)}
              role="presentation"
            >
              <div
                className="bg-white rounded-2xl p-6 max-w-md w-full"
                onClick={(e) => e.stopPropagation()}
                role="presentation"
              >
                <h3 className="text-lg font-extrabold mb-1">إلغاء طلب الإجازة</h3>
                <p className="text-sm text-slate-500 mb-3">
                  يبقى الطلب في السجلّ بحالة «ملغى» ويُحرَّر الرصيد المحجوز.
                </p>
                <textarea
                  value={cancelReason} onChange={(e) => setCancelReason(e.target.value)}
                  rows={3} className="w-full border rounded-xl px-3 py-2.5"
                  placeholder="سبب الإلغاء (اختياري)" autoFocus
                />
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    type="button" onClick={() => setCancellingId(null)}
                    className="px-4 py-2 bg-slate-100 rounded-xl"
                  >تراجع</button>
                  <button
                    type="button" onClick={handleCancel}
                    disabled={processingId === cancellingId}
                    className="px-4 py-2 bg-slate-800 text-white rounded-xl disabled:opacity-50"
                  >تأكيد الإلغاء</button>
                </div>
              </div>
            </div>
          )}
    </div>
  );
}
