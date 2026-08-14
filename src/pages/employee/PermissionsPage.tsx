/**
 * ════════════════════════════════════════════════════════════════
 *  PermissionsPage — طلبات الزمنيات
 *
 *  ═══ ما تغيّر في 0340 ═══════════════════════════════════════════
 *
 *  ★★★ زرّ «موافقة» كان يفشل في **كل** الحالات المشروعة.
 *      كان: `approveRequest(id, employeeId || user?.id || '')`
 *      مُقاس بجلسة RLS حقيقية بدور hr:
 *        أ) للمُعتمِد سجلّ موظف + سلسلة ⇒ APPROVAL_CHAIN_BYPASS
 *        ب) بلا سجلّ (يسقط إلى user.id) + سلسلة ⇒ APPROVAL_CHAIN_BYPASS
 *        ج) بلا سلسلة ⇒ نجح، لكنه اعتماد بلا رقابة
 *      ولعزل الـFK عن الحارس: `approved_by = employees.id` بلا سلسلة ⇒
 *        violates foreign key constraint
 *        "permissions_request_approved_by_fkey"
 *      الآن القرار عبر `unifiedApprovalService.decideHrAny()` وحده.
 *
 *  ★★★ الصلاحية لم تعد من مسار URL.
 *      كان: `canApprove = viewMode === 'hr' || viewMode === 'manager'`
 *      و`viewMode` من `location.pathname.startsWith('/app/hr/')`.
 *      فحص آلي لكتل AppRouter: هذه الصفحة مسجَّلة في موضعين فقط —
 *      `/app/employee/permissions` و`/app/admin/permissions-management`.
 *      لا `/app/hr/…` ولا `/app/manager/…`: فرعان لم يُنفَّذا قط.
 *      الآن `row.canDecide` من السلسلة.
 *
 *  ★★ الطلب والسلسلة صارا في معاملة واحدة. كان الإنشاء استدعاءين:
 *      فشلُ الثاني يترك طلباً بلا سلسلة يُعتمَد بلا رقابة (الحالة ج).
 *
 *  ★★ الزمنية المعتمَدة تُنفَّذ الآن في جدول `permissions` — كان فارغاً
 *      دائماً مهما اعتُمد من طلبات.
 *
 *  ★ الاسم يُحلّ من `profiles` الحيّ. كان نصّاً يُرسله المتصفح وقت
 *      الطلب فيتجمّد: تغيير الاسم في الملف الشخصي لا يظهر في الطلبات.
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Clock, FileText, Send, Loader, CheckCircle2, XCircle,
  Ban, Inbox, User, AlertTriangle,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { unifiedApprovalService } from '../../services/sdk';
import {
  permissionRequestGateway, permissionErrorMessage,
  type PermissionRequestRow, type PermissionScope,
  type PermissionStatusValue, type PermissionKind,
} from '../../services/sdk/PermissionRequestGatewayService';
import { getErrorMessage } from '../../services/errors';
import { PERMISSION_TYPE_COLORS } from '../../utils/shiftUtils';

// ════════════════════════════════════════════════════
// ثوابت العرض
// ════════════════════════════════════════════════════

type StatusFilter = 'all' | PermissionStatusValue;

const PERMISSION_LABELS: Record<PermissionKind, string> = {
  عادية: 'زمنية عادية',
  مغادرة: 'مغادرة العمل',
  تعويضية: 'زمنية تعويضية',
  بدون_راتب: 'زمنية بدون راتب',
};

const PERMISSION_DESCRIPTIONS: Record<PermissionKind, string> = {
  عادية: 'خروج مبكر ثم رجوع — يُخصم من الراتب بالساعة',
  مغادرة: 'خروج بلا رجوع — يُخصم من الراتب بالساعة',
  تعويضية: 'تعويض عن عمل إضافي سابق — لا خصم',
  بدون_راتب: 'خصم كامل للساعات الغائبة',
};

const STATUS_STYLE: Record<string, string> = {
  انتظار: 'bg-amber-100 text-amber-700 border border-amber-200',
  موافق: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
  مرفوض: 'bg-red-100 text-red-700 border border-red-200',
  ملغى: 'bg-slate-100 text-slate-500 border border-slate-200',
};

const STATUS_LABEL: Record<string, string> = {
  انتظار: 'قيد المراجعة',
  موافق: 'تمت الموافقة',
  مرفوض: 'مرفوض',
  ملغى: 'ملغى',
};

const KINDS: PermissionKind[] = ['عادية', 'مغادرة', 'تعويضية', 'بدون_راتب'];

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function PermissionsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();

  /**
   * ★ النطاق بديل `viewMode` المشتقّ من URL.
   *   لا مسار يمنح صلاحية — القاعدة وحدها تقرّر.
   */
  const [scope, setScope] = useState<PermissionScope>('mine');
  /**
   * ★★★★ عطلٌ بلّغ عنه المستخدم (2026-08-08): التبويبات الثلاثة كانت
   *   تُعرض لكلّ مستخدمٍ بلا شرط دور. القرار: «الموظف فقط يطلب
   *   زمنيه ويرى طلباته فقط». والحارسُ في القاعدة (0372).
   */
  const [canSeeAll, setCanSeeAll] = useState(false);
  const [canSeeInbox, setCanSeeInbox] = useState(false);
  const [rows, setRows] = useState<PermissionRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | PermissionKind>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [inboxCount, setInboxCount] = useState(0);
  const [executionTarget, setExecutionTarget] = useState<PermissionRequestRow | null>(null);
  const [executionForm, setExecutionForm] = useState({ actualOut: '', actualReturn: '', note: '' });

  const [formData, setFormData] = useState({
    permission_type: 'عادية' as PermissionKind,
    date: new Date().toISOString().split('T')[0],
    expected_out_time: '10:00',
    expected_return_time: '12:00',
    reason: '',
  });

  // ── الجلب ─────────────────────────────────────────────────────
  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const data = await permissionRequestGateway.list(
        scope,
        statusFilter === 'all' ? null : statusFilter,
        200,
      );
      setRows(data);
    } catch (err) {
      addToast(permissionErrorMessage(getErrorMessage(err)), 'error');
      setRows([]);
    } finally { setLoading(false); }
  }, [scope, statusFilter, addToast]);

  /**
   * ★ الصلاحية تُسأل عنها القاعدة **قبل** عرض أيّ تبويب — ولا يُستدعى
   *   النطاق `inbox` أصلاً لمن لا يملكه (وإلّا رُفض بـPERM_SCOPE_FORBIDDEN).
   */
  const fetchInboxCount = useCallback(async () => {
    const [allOk, inboxOk] = await Promise.all([
      permissionRequestGateway.canUseScope('all'),
      permissionRequestGateway.canUseScope('inbox'),
    ]);
    setCanSeeAll(allOk);
    setCanSeeInbox(inboxOk);
    if (!inboxOk) { setInboxCount(0); return; }
    try {
      const pending = await permissionRequestGateway.list('inbox', 'انتظار', 200);
      setInboxCount(pending.length);
    } catch { setInboxCount(0); }
  }, []);

  useEffect(() => { if (user) void fetchRows(); }, [user, fetchRows]);
  useEffect(() => { if (user) void fetchInboxCount(); }, [user, fetchInboxCount]);

  // ── الإرسال ───────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.date || !formData.expected_out_time) return;
    setSubmitting(true);
    try {
      // ★ لا نمرّر employee_id ولا employee_name — القاعدة تشتقّهما،
      //   والسلسلة تُنشأ في نفس المعاملة.
      await permissionRequestGateway.submit({
        permissionType: formData.permission_type,
        date: formData.date,
        outTime: formData.expected_out_time,
        returnTime: formData.expected_return_time,
        reason: formData.reason,
      });
      addToast('تم إرسال طلب الزمنية', 'success');
      setShowForm(false);
      setFormData((f) => ({ ...f, reason: '' }));
      await Promise.all([fetchRows(), fetchInboxCount()]);
    } catch (err) {
      addToast(permissionErrorMessage(getErrorMessage(err)), 'error');
    } finally { setSubmitting(false); }
  };

  // ── القرار: عبر السلسلة حصراً ────────────────────────────────
  const decide = async (
    row: PermissionRequestRow,
    decision: 'approved' | 'rejected',
    comments?: string,
  ) => {
    setProcessingId(row.id);
    try {
      // ★ واجهة المحرّك الموحّد تقبل معرّف المصدر مباشرةً؛ لا تبحث الصفحة
      //   في hr_approval_requests. القاعدة تُزامن الحالة وتملأ
      //   approved_by/reviewed_at وتُنفّذ الزمنية في جدول permissions.
      const finalStatus = await unifiedApprovalService.decideHrAny(row.id, decision, comments);
      addToast(
        finalStatus === 'pending'
          ? 'سُجِّل قرارك — الطلب انتقل للمرحلة التالية'
          : finalStatus === 'approved'
            ? 'اكتملت السلسلة: تمت الموافقة ونُفِّذت الزمنية'
            : 'اكتملت السلسلة: مرفوض',
        'success',
      );
      setRejectingId(null); setRejectionReason('');
      await Promise.all([fetchRows(), fetchInboxCount()]);
    } catch (err) {
      addToast(permissionErrorMessage(getErrorMessage(err)), 'error');
    } finally { setProcessingId(null); }
  };

  // ── الإلغاء (بديل الحذف) ─────────────────────────────────────
  const handleCancel = async () => {
    if (!cancellingId) return;
    setProcessingId(cancellingId);
    try {
      await permissionRequestGateway.cancel(cancellingId, cancelReason.trim() || undefined);
      addToast('أُلغي الطلب', 'success');
      setCancellingId(null); setCancelReason('');
      await Promise.all([fetchRows(), fetchInboxCount()]);
    } catch (err) {
      addToast(permissionErrorMessage(getErrorMessage(err)), 'error');
    } finally { setProcessingId(null); }
  };

  // ── المشتقّات ────────────────────────────────────────────────
  const openExecution = (row: PermissionRequestRow) => {
    const out = `${row.date}T${row.outTime.slice(0, 5)}`;
    const back = row.returnTime ? `${row.date}T${row.returnTime.slice(0, 5)}` : '';
    setExecutionTarget(row);
    setExecutionForm({ actualOut: out, actualReturn: back, note: row.executionNote || '' });
  };

  const recordExecution = async () => {
    if (!executionTarget || !executionForm.actualOut) return;
    if (executionTarget.permissionType !== 'مغادرة' && !executionForm.actualReturn) {
      addToast('وقت العودة الفعلي مطلوب', 'warning'); return;
    }
    setProcessingId(executionTarget.id);
    try {
      await permissionRequestGateway.recordExecution({
        requestId: executionTarget.id,
        actualOut: new Date(executionForm.actualOut).toISOString(),
        actualReturn: executionForm.actualReturn
          ? new Date(executionForm.actualReturn).toISOString() : null,
        note: executionForm.note.trim() || null,
      });
      addToast('سُجّلت حركة الخروج والعودة الفعلية', 'success');
      setExecutionTarget(null);
      await fetchRows();
    } catch (err) {
      addToast(permissionErrorMessage(getErrorMessage(err)), 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const stats = useMemo(() => ({
    total: rows.length,
    pending: rows.filter((r) => r.status === 'انتظار').length,
    approved: rows.filter((r) => r.status === 'موافق').length,
    rejected: rows.filter((r) => r.status === 'مرفوض').length,
    cancelled: rows.filter((r) => r.status === 'ملغى').length,
  }), [rows]);

  const filteredRows = useMemo(() => rows.filter((r) => {
    if (typeFilter !== 'all' && r.permissionType !== typeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      const hay = `${r.employeeName} ${r.department} ${r.reason ?? ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, typeFilter, searchQuery]);

  const scopeGradient: Record<PermissionScope, string> = {
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

  // مغادرة = خروج بلا رجوع
  const needsReturn = formData.permission_type !== 'مغادرة';
  const badTimes = needsReturn
    && formData.expected_return_time !== ''
    && formData.expected_return_time <= formData.expected_out_time;

  // ════════════════════════════════════════════════════
  // العرض
  // ════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className={`bg-gradient-to-br ${scopeGradient[scope]} rounded-2xl p-6 text-white`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-extrabold flex items-center gap-2">
              <Clock size={24} /> الزمنيات
            </h2>
            <p className="text-white/70 mt-1">
              أربعة أنواع — بحدّ أقصى ثلاث زمنيات في اليوم الواحد
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowForm((v) => !v)}
            className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl font-bold text-sm transition-colors"
          >
            {showForm ? 'إلغاء' : '+ طلب زمنية'}
          </button>
        </div>
      </div>

      {/* ★ النطاق — يختفي كلّياً للموظف العاديّ */}
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

      {scope !== 'mine' && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'الإجمالي', value: stats.total, color: 'bg-white text-slate-800' },
            { label: 'قيد المراجعة', value: stats.pending, color: 'bg-amber-50 text-amber-700' },
            { label: 'تمت الموافقة', value: stats.approved, color: 'bg-emerald-50 text-emerald-700' },
            { label: 'مرفوض', value: stats.rejected, color: 'bg-red-50 text-red-700' },
            { label: 'ملغى', value: stats.cancelled, color: 'bg-slate-50 text-slate-500' },
          ].map((s) => (
            <div key={s.label} className={`rounded-2xl p-4 border ${s.color}`}>
              <div className="text-2xl font-extrabold">{s.value}</div>
              <div className="text-xs font-bold">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2">
            <FileText size={20} /> نموذج طلب زمنية
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="perm-kind" className="block text-sm font-bold mb-1">نوع الزمنية</label>
              <select
                id="perm-kind"
                value={formData.permission_type}
                onChange={(e) => setFormData({ ...formData, permission_type: e.target.value as PermissionKind })}
                className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
              >
                {KINDS.map((t) => (
                  <option key={t} value={t}>{PERMISSION_LABELS[t]}</option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {PERMISSION_DESCRIPTIONS[formData.permission_type]}
              </p>
            </div>
            <div>
              <label htmlFor="perm-date" className="block text-sm font-bold mb-1">التاريخ</label>
              <input
                id="perm-date" type="date" value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                required
              />
            </div>
            <div>
              <label htmlFor="perm-out" className="block text-sm font-bold mb-1">وقت الخروج المتوقّع</label>
              <input
                id="perm-out" type="time" value={formData.expected_out_time}
                onChange={(e) => setFormData({ ...formData, expected_out_time: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                required
              />
            </div>
            {needsReturn && (
              <div>
                <label htmlFor="perm-back" className="block text-sm font-bold mb-1">وقت العودة المتوقّع</label>
                <input
                  id="perm-back" type="time" value={formData.expected_return_time}
                  onChange={(e) => setFormData({ ...formData, expected_return_time: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500"
                />
              </div>
            )}
          </div>

          {badTimes && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              <AlertTriangle size={15} className="inline ml-1" />
              وقت العودة يجب أن يكون بعد وقت الخروج
            </div>
          )}
          {!needsReturn && (
            <div className="bg-slate-50 border rounded-xl p-3 text-sm text-slate-600">
              «مغادرة العمل» خروج بلا رجوع — لا يُطلب وقت عودة
            </div>
          )}

          <textarea
            value={formData.reason}
            onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            rows={3} className="w-full border rounded-xl px-3 py-2.5"
            placeholder="سبب الزمنية..." required
          />
          <button
            type="submit" disabled={submitting || badTimes}
            className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50"
          >
            {submitting ? 'جاري الإرسال...' : <><Send size={16} className="inline ml-1" />إرسال الطلب</>}
          </button>
        </form>
      )}

      <div className="bg-white rounded-2xl p-4 border flex gap-3 flex-wrap">
        <input
          type="text" placeholder="بحث بالاسم أو القسم أو السبب..."
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
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | PermissionKind)}
          className="border rounded-xl px-3 py-2.5"
          aria-label="ترشيح بالنوع"
        >
          <option value="all">جميع الأنواع</option>
          {KINDS.map((t) => <option key={t} value={t}>{PERMISSION_LABELS[t]}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="animate-spin" size={32} /></div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border">
          <Clock size={48} className="mx-auto mb-4 opacity-40" />
          <p>
            {scope === 'inbox' ? 'لا توجد زمنيات بانتظار قرارك'
              : scope === 'mine' ? 'لم تقدّم طلب زمنية بعد'
                : 'لا توجد زمنيات في سجلّ الشركة'}
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
                        backgroundColor: `${PERMISSION_TYPE_COLORS[row.permissionType]}20`,
                        color: PERMISSION_TYPE_COLORS[row.permissionType],
                      }}
                    >
                      {PERMISSION_LABELS[row.permissionType]}
                    </span>
                    {statusBadge(row.status)}
                    {row.executed && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-sky-50 text-sky-700 border border-sky-200">
                        مُنفَّذة
                      </span>
                    )}
                    {scope !== 'mine' && (
                      <span className="text-sm font-bold text-slate-700">
                        <User size={13} className="inline ml-1" />
                        {row.employeeName}
                        <span className="text-slate-400 font-normal"> · {row.department}</span>
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                    <span>التاريخ: {row.date}</span>
                    <span>الخروج: {row.outTime}</span>
                    {row.returnTime && <span>العودة: {row.returnTime}</span>}
                  </div>
                  {row.reason && <p className="text-sm text-slate-600 mt-2">{row.reason}</p>}
                  {row.rejectionReason && row.status !== 'انتظار' && (
                    <p className="text-sm text-red-600 mt-2">السبب: {row.rejectionReason}</p>
                  )}
                  {row.actualOut && (
                    <p className="text-xs text-sky-700 bg-sky-50 rounded-lg px-2 py-1 mt-2">
                      فعلياً: خروج {new Date(row.actualOut).toLocaleString('ar-IQ')}
                      {row.actualReturn ? ` · عودة ${new Date(row.actualReturn).toLocaleString('ar-IQ')}` : ''}
                    </p>
                  )}
                </div>

                <div className="flex gap-2 flex-wrap">
                  {/* ★ الأزرار من صلاحية القاعدة لا من المسار */}
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
                  {row.canRecordExecution && (
                    <button
                      type="button"
                      onClick={() => openExecution(row)}
                      disabled={processingId === row.id}
                      className="px-4 py-2 bg-sky-600 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                    >
                      <Clock size={14} className="inline ml-1" />
                      {row.actualOut ? 'تحديث التنفيذ' : 'تسجيل التنفيذ الفعلي'}
                    </button>
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

      {executionTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="presentation">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md space-y-4" dir="rtl">
            <h3 className="text-lg font-extrabold text-slate-800">تسجيل التنفيذ الفعلي</h3>
            <p className="text-sm text-slate-600">
              {executionTarget.employeeName} · {PERMISSION_LABELS[executionTarget.permissionType]}
            </p>
            <div>
              <label className="block text-sm font-bold mb-1">الخروج الفعلي</label>
              <input type="datetime-local" value={executionForm.actualOut}
                onChange={(e) => setExecutionForm({ ...executionForm, actualOut: e.target.value })}
                className="w-full border rounded-xl px-3 py-2.5" />
            </div>
            {executionTarget.permissionType !== 'مغادرة' && (
              <div>
                <label className="block text-sm font-bold mb-1">العودة الفعلية</label>
                <input type="datetime-local" value={executionForm.actualReturn}
                  onChange={(e) => setExecutionForm({ ...executionForm, actualReturn: e.target.value })}
                  className="w-full border rounded-xl px-3 py-2.5" />
              </div>
            )}
            <textarea value={executionForm.note}
              onChange={(e) => setExecutionForm({ ...executionForm, note: e.target.value })}
              rows={2} placeholder="ملاحظة التنفيذ (اختيارية)"
              className="w-full border rounded-xl px-3 py-2.5" />
            <div className="flex gap-2">
              <button type="button" onClick={() => setExecutionTarget(null)}
                className="flex-1 px-4 py-2.5 bg-slate-100 rounded-xl font-bold">إلغاء</button>
              <button type="button" onClick={() => void recordExecution()}
                disabled={processingId === executionTarget.id}
                className="flex-1 px-4 py-2.5 bg-sky-600 text-white rounded-xl font-bold disabled:opacity-50">
                حفظ التنفيذ
              </button>
            </div>
          </div>
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
            <h3 className="text-lg font-extrabold mb-3">سبب رفض الزمنية</h3>
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
            <h3 className="text-lg font-extrabold mb-1">إلغاء طلب الزمنية</h3>
            <p className="text-sm text-slate-500 mb-3">
              يبقى الطلب في السجلّ بحالة «ملغى» وتُغلَق سلسلة الاعتماد.
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
