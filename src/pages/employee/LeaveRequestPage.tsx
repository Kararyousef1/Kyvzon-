/**
 * ════════════════════════════════════════════════════════════════
 *  LeaveRequestPage - طلبات الإجازات والزمنيات (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ─────────────────────────────────────────────────────────────────
 *  ✅ 10 استخدام any → 0 (LeaveRequest interface + أنواع صريحة)
 *  ✅ تنظيف جميع markdown artifacts (40+ موضع)
 *  ✅ إصلاح addToast(`...`) المكسور (4 مواضع)
 *  ✅ catch (err: any) → catch (err: unknown) + getErrorMessage (8 مواضع)
 *  ✅ statusFilter as any → نوع union صريح
 *  ✅ إصلاح جميع template literals المكسورة
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Calendar, FileText, Send, Clock, Loader, AlertTriangle,
} from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeService, leaveService, leaveBalanceService, permissionRequestService } from '../../services/sdk';
import {
  linkLeaveApproval,
  linkLeaveRejection,
  linkPermissionApproval,
  notifyEmployeeLeaveApproved,
  notifyEmployeeLeaveRejected,
  notifyEmployeePermissionApproved,
} from '../../services/integrations/leaveAttendanceLink';
import {
  LeaveType, LeaveBalance,
  DEFAULT_LEAVE_SETTINGS, calculateWorkingDays,
  getLeaveTypeLabel, getLeaveTypeColor,
  checkHajjEligibility, getDefaultLeaveRange,
} from '../../utils/leaveUtils';
import {
  PermissionType, PERMISSION_TYPE_COLORS,
} from '../../utils/shiftUtils';
import { getErrorMessage } from '../../services/errors';
import { useLocation } from 'react-router-dom';

// ════════════════════════════════════════════════════
// أنواع البيانات (تحلّ محل any)
// ════════════════════════════════════════════════════

type ViewMode = 'employee' | 'hr' | 'supervisor' | 'manager';
type RequestStatus = 'انتظار' | 'موافق' | 'مرفوض';
type StatusFilter = 'all' | RequestStatus;

interface LeaveRequestRecord {
  id: string;
  employee_id: string;
  employee_name?: string;
  leave_type: LeaveType;
  date_from: string;
  date_to: string;
  working_days_count: number;
  reason?: string;
  status: RequestStatus;
  rejection_reason?: string;
  approved_by?: string | null;
  created_at: string;
}

interface PermissionRequest {
  id: string;
  employee_id: string;
  employee_name?: string;
  employee_department?: string;
  date: string;
  permission_type: PermissionType;
  expected_out_time: string;
  expected_return_time?: string;
  status: RequestStatus;
  reason: string;
  created_at: string;
  rejection_reason?: string;
}

interface LeaveDataForLink {
  employee_id: string;
  leave_type: LeaveType;
  date_from: string;
  date_to: string;
  reason?: string;
  employee_name?: string;
  status?: RequestStatus;
}

interface PermissionDataForLink {
  employee_id: string;
  date: string;
  expected_out_time: string;
  expected_return_time?: string;
}

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function LeaveRequestPage() {
  const { user } = useAuthStore();
  const location = useLocation();
  const { addToast } = useUIStore();

  const viewMode: ViewMode = useMemo(() => {
    // نستخرج الوضع من المسار الحالي (بديل عن view IDs القديمة)
    const p = location.pathname;
    if (p.startsWith('/app/hr/leave-requests')) return 'hr';
    if (p.startsWith('/app/supervisor/')) return 'supervisor';
    if (p.startsWith('/app/manager/')) return 'manager';
    return 'employee';
  }, [location.pathname]);

  const [activeTab, setActiveTab] = useState<string>(() => (viewMode !== 'employee' ? 'permissions' : 'leaves'));
  const canApprove = viewMode === 'hr' || viewMode === 'supervisor' || viewMode === 'manager';
  const canSubmit = viewMode === 'employee';

  // Leave state
  const [requests, setRequests] = useState<LeaveRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [calculatedDays, setCalculatedDays] = useState(0);
  const [balance, setBalance] = useState<LeaveBalance | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('all');
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [realEmployeeId, setRealEmployeeId] = useState<string>('');

  const [formData, setFormData] = useState({
    leave_type: 'سنوية' as LeaveType,
    start_date: getDefaultLeaveRange(7).from,
    end_date: getDefaultLeaveRange(7).to,
    reason: '',
    attachment_url: '',
  });

  // Permissions state
  const [permissions, setPermissions] = useState<PermissionRequest[]>([]);
  const [permLoading, setPermLoading] = useState(true);
  const [permShowForm, setPermShowForm] = useState(false);
  const [permSubmitting, setPermSubmitting] = useState(false);
  const [permSearchQuery, setPermSearchQuery] = useState('');
  const [permStatusFilter, setPermStatusFilter] = useState<StatusFilter>('all');
  const [permRejectingId, setPermRejectingId] = useState<string | null>(null);
  const [permRejectionReason, setPermRejectionReason] = useState('');
  const [permProcessingId, setPermProcessingId] = useState<string | null>(null);
  const [permFormData, setPermFormData] = useState({
    permission_type: 'عادية' as PermissionType,
    date: new Date().toISOString().split('T')[0],
    expected_out_time: '10:00',
    expected_return_time: '12:00',
    reason: '',
  });

  // ── Get real employee ID ──────────────────────────────────────
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
      if (employees.length > 0) {
        const empId = employees[0].id;
        setRealEmployeeId(empId);
        const bd = await leaveBalanceService.findBalanceByEmployee(empId, new Date().getFullYear());
        if (bd) setBalance(bd as unknown as LeaveBalance);
      }
    })();
  }, [user]);

  useEffect(() => { if (!user) return; fetchRequests(); fetchPermissions(); /* eslint-disable-next-line */ }, [user, realEmployeeId]);

  useEffect(() => {
    if (formData.start_date && formData.end_date) {
      setCalculatedDays(calculateWorkingDays(formData.start_date, formData.end_date));
    }
  }, [formData.start_date, formData.end_date]);

  // ── Fetch Requests ────────────────────────────────────────────
  const fetchRequests = async () => {
    setLoading(true);
    try {
      let data;
      if (!canApprove && realEmployeeId) {
        data = await leaveService.findLeavesByEmployee(realEmployeeId);
      } else {
        data = await leaveService.findAll({ orderBy: 'created_at', ascending: false });
      }
      setRequests((data as LeaveRequestRecord[]) || []);
    } catch (err) {
      const msg = getErrorMessage(err);
      if (!msg.includes('does not exist')) addToast('فشل تحميل الطلبات', 'error');
    } finally { setLoading(false); }
  };

  const fetchPermissions = async () => {
    setPermLoading(true);
    try {
      const data = await permissionRequestService.findAll({ orderBy: 'created_at', ascending: false });
      setPermissions((data as PermissionRequest[]) || []);
    } catch { /* table may not exist */ }
    finally { setPermLoading(false); }
  };

  const hajjCheck = checkHajjEligibility(balance);

  // ── Submit Leave ──────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.start_date || !formData.end_date) return;
    if (formData.leave_type === 'حج' && !hajjCheck.eligible) { addToast(hajjCheck.message, 'error'); return; }
    if (calculatedDays === 0) { addToast('لا توجد أيام عمل فعلية', 'error'); return; }
    setSubmitting(true);
    try {
      let targetId = realEmployeeId;
      if (!targetId) {
        const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
        if (employees.length > 0) targetId = employees[0].id;
      }

      await leaveService.createLeave({
        employee_id: targetId || user.id,
        leave_type: formData.leave_type,
        date_from: formData.start_date,
        date_to: formData.end_date,
        working_days_count: calculatedDays,
        reason: formData.reason,
      });
      addToast('✅ تم إرسال طلب الإجازة', 'success');
      setShowForm(false);
      fetchRequests();
    } catch (err) { addToast('❌ ' + getErrorMessage(err), 'error'); }
    finally { setSubmitting(false); }
  };

  // ── Approve Leave ─────────────────────────────────────────────
  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      const leaveData = await leaveService.findById(id) as LeaveDataForLink | null;

      await leaveService.approveLeave(id, realEmployeeId || user?.id || '');

      const ld = leaveData as LeaveDataForLink | null;
      if (ld) {
        const linkResult = await linkLeaveApproval(ld.employee_id, ld.date_from, ld.date_to, ld.leave_type);
        await notifyEmployeeLeaveApproved(ld.employee_id, ld.leave_type, ld.date_from, ld.date_to);
        addToast(`✅ تمت الموافقة وتحديث ${linkResult.daysUpdated} يوم في سجل الحضور`, 'success');
      } else {
        addToast('✅ تمت الموافقة', 'success');
      }
      fetchRequests();
    } catch (err) { addToast('❌ ' + getErrorMessage(err), 'error'); }
    finally { setProcessingId(null); }
  };

  // ── Reject Leave ──────────────────────────────────────────────
  const handleReject = async () => {
    if (!rejectingId || !rejectionReason.trim()) { addToast('يرجى إدخال سبب الرفض', 'warning'); return; }
    setProcessingId(rejectingId);
    try {
      const leaveData = await leaveService.findById(rejectingId) as LeaveDataForLink | null;

      await leaveService.rejectLeave(rejectingId, user?.id || '', rejectionReason);

      const ld = leaveData as LeaveDataForLink | null;
      if (ld && ld.status === 'موافق') {
        await linkLeaveRejection(ld.employee_id, ld.date_from, ld.date_to);
      }
      addToast('✅ تم الرفض', 'success');
      setRejectingId(null); setRejectionReason('');
      fetchRequests();
    } catch (err) { addToast('❌ ' + getErrorMessage(err), 'error'); }
    finally { setProcessingId(null); }
  };

  // ── Submit Permission ─────────────────────────────────────────
  const handlePermSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !permFormData.date) return;
    setPermSubmitting(true);
    try {
      let targetId = realEmployeeId;
      if (!targetId) {
        const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
        if (employees.length > 0) targetId = employees[0].id;
      }
      await permissionRequestService.createRequest({
        employee_id: targetId || user.id,
        employee_name: user.full_name || 'موظف',
        employee_department: user.department || undefined,
        date: permFormData.date,
        permission_type: permFormData.permission_type,
        expected_out_time: permFormData.expected_out_time,
        expected_return_time: permFormData.permission_type === 'مغادرة' ? undefined : permFormData.expected_return_time,
        reason: permFormData.reason,
      });
      addToast('✅ تم إرسال طلب الزمنية', 'success');
      setPermShowForm(false);
      fetchPermissions();
    } catch (err) { addToast('❌ ' + getErrorMessage(err), 'error'); }
    finally { setPermSubmitting(false); }
  };

  // ── Approve Permission ────────────────────────────────────────
  const handlePermApprove = async (id: string) => {
    setPermProcessingId(id);
    try {
      const permData = await permissionRequestService.findById(id) as PermissionDataForLink | null;

      await permissionRequestService.approveRequest(id, realEmployeeId || user?.id || '');

      const pd = permData as PermissionDataForLink | null;
      if (pd) {
        await linkPermissionApproval(pd.employee_id, pd.date, pd.expected_out_time, pd.expected_return_time);
        await notifyEmployeePermissionApproved(pd.employee_id, pd.date);
      }
      addToast('✅ تمت الموافقة وتحديث سجل الحضور', 'success');
      fetchPermissions();
    } catch (err) { addToast('❌ ' + getErrorMessage(err), 'error'); }
    finally { setPermProcessingId(null); }
  };

  // ── Reject Permission ─────────────────────────────────────────
  const handlePermReject = async () => {
    if (!permRejectingId || !permRejectionReason.trim()) { addToast('يرجى إدخال سبب الرفض', 'warning'); return; }
    setPermProcessingId(permRejectingId);
    try {
      await permissionRequestService.rejectRequest(permRejectingId, user?.id || '', permRejectionReason);
      addToast('✅ تم الرفض', 'success');
      setPermRejectingId(null); setPermRejectionReason('');
      fetchPermissions();
    } catch (err) { addToast('❌ ' + getErrorMessage(err), 'error'); }
    finally { setPermProcessingId(null); }
  };

  // ── Computed ──────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total: requests.length,
    pending: requests.filter((r) => r.status === 'انتظار').length,
    approved: requests.filter((r) => r.status === 'موافق').length,
    rejected: requests.filter((r) => r.status === 'مرفوض').length,
  }), [requests]);

  const permStats = useMemo(() => ({
    total: permissions.length,
    pending: permissions.filter((r) => r.status === 'انتظار').length,
    approved: permissions.filter((r) => r.status === 'موافق').length,
    rejected: permissions.filter((r) => r.status === 'مرفوض').length,
  }), [permissions]);

  const filteredRequests = useMemo(() => requests.filter((req) => {
    if (statusFilter !== 'all' && req.status !== statusFilter) return false;
    if (leaveTypeFilter !== 'all' && req.leave_type !== leaveTypeFilter) return false;
    if (searchQuery.trim() && !(req.employee_name || '').toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [requests, statusFilter, leaveTypeFilter, searchQuery]);

  const filteredPermissions = useMemo(() => permissions.filter((perm) => {
    if (permStatusFilter !== 'all' && perm.status !== permStatusFilter) return false;
    if (permSearchQuery.trim() && !(perm.employee_name || '').toLowerCase().includes(permSearchQuery.toLowerCase())) return false;
    return true;
  }), [permissions, permStatusFilter, permSearchQuery]);

  const pageGradient = useMemo(() => ({
    employee: 'from-emerald-600 to-teal-700',
    supervisor: 'from-blue-600 to-indigo-700',
    manager: 'from-amber-600 to-orange-700',
    hr: 'from-purple-600 to-pink-700',
  }[viewMode]), [viewMode]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      انتظار: 'bg-amber-100 text-amber-700',
      موافق: 'bg-emerald-100 text-emerald-700',
      مرفوض: 'bg-red-100 text-red-700',
    };
    const label: Record<string, string> = { انتظار: 'قيد المراجعة', موافق: 'تمت الموافقة', مرفوض: 'مرفوض' };
    return <span className={`px-3 py-1 rounded-full text-xs font-bold ${map[status] || 'bg-slate-100 text-slate-600'}`}>{label[status] || status}</span>;
  };

  // ════════════════════════════════════════════════════
  // العرض
  // ════════════════════════════════════════════════════

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      {/* Tabs */}
      <div className="flex gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-1.5 overflow-x-auto">
        <button onClick={() => setActiveTab('leaves')} className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'leaves' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
          <Calendar size={16} /> الإجازات
        </button>
        <button onClick={() => setActiveTab('permissions')} className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all ${activeTab === 'permissions' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:bg-slate-100'}`}>
          <Clock size={16} /> الزمنيات
        </button>
      </div>

      {/* Leaves Tab */}
      {activeTab === 'leaves' && (
        <>
          <div className={`bg-gradient-to-br ${pageGradient} rounded-2xl p-6 text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-extrabold"><Calendar size={24} className="inline ml-2" />طلبات الإجازات</h2>
                <p className="text-white/70 mt-1">جميع أنواع الإجازات مع حساب ذكي للمدة</p>
              </div>
              {canSubmit && (
                <button onClick={() => setShowForm(!showForm)} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl font-bold text-sm">{showForm ? 'إلغاء' : '+ طلب إجازة'}</button>
              )}
            </div>
          </div>

          {canApprove && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'الإجمالي', value: stats.total, color: 'bg-white text-slate-800' },
                { label: 'قيد المراجعة', value: stats.pending, color: 'bg-amber-50 text-amber-700' },
                { label: 'تمت الموافقة', value: stats.approved, color: 'bg-emerald-50 text-emerald-700' },
                { label: 'مرفوض', value: stats.rejected, color: 'bg-red-50 text-red-700' },
              ].map((s, i) => (
                <div key={i} className={`rounded-2xl p-4 border ${s.color}`}>
                  <div className="text-xs font-bold mb-1">{s.label}</div>
                  <div className="text-2xl font-extrabold">{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {canSubmit && showForm && (
            <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border space-y-4">
              <h3 className="text-lg font-extrabold">نموذج طلب إجازة</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1">نوع الإجازة</label>
                  <select value={formData.leave_type} onChange={(e) => setFormData({ ...formData, leave_type: e.target.value as LeaveType })} className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500">
                    {DEFAULT_LEAVE_SETTINGS.map((s) => <option key={s.leaveType} value={s.leaveType}>{getLeaveTypeLabel(s.leaveType)}</option>)}
                  </select>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 flex items-center justify-center">
                  <div className="text-center"><div className="text-2xl font-bold text-indigo-600">{calculatedDays}</div><div className="text-xs text-gray-600">يوم عمل فعلي</div></div>
                </div>
                <div><label className="block text-sm font-bold mb-1">من</label><input type="date" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className="w-full border rounded-xl px-3 py-2.5" required /></div>
                <div><label className="block text-sm font-bold mb-1">إلى</label><input type="date" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="w-full border rounded-xl px-3 py-2.5" required /></div>
              </div>
              {formData.leave_type === 'حج' && !hajjCheck.eligible && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700"><AlertTriangle className="inline ml-1" />{hajjCheck.message}</div>
              )}
              <textarea value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} rows={3} className="w-full border rounded-xl px-3 py-2.5" placeholder="سبب الإجازة..." required />
              <button type="submit" disabled={submitting} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold disabled:opacity-50">{submitting ? 'جاري...' : <><Send size={16} className="inline ml-1" />إرسال</>}</button>
            </form>
          )}

          {canApprove && (
            <div className="bg-white rounded-2xl p-4 border flex gap-3">
              <input type="text" placeholder="بحث..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="flex-1 border rounded-xl px-3 py-2.5" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="border rounded-xl px-3 py-2.5">
                <option value="all">جميع الحالات</option><option value="انتظار">قيد المراجعة</option><option value="موافق">موافق</option><option value="مرفوض">مرفوض</option>
              </select>
              <select value={leaveTypeFilter} onChange={(e) => setLeaveTypeFilter(e.target.value)} className="border rounded-xl px-3 py-2.5">
                <option value="all">جميع الأنواع</option>
                {DEFAULT_LEAVE_SETTINGS.map((s) => <option key={s.leaveType} value={s.leaveType}>{getLeaveTypeLabel(s.leaveType)}</option>)}
              </select>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-20"><Loader className="animate-spin" size={32} /></div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border"><FileText size={48} className="mx-auto mb-4 opacity-40" /><p>لا توجد طلبات إجازة</p></div>
          ) : (
            <div className="space-y-3">
              {filteredRequests.map((req) => (
                <div key={req.id} className={`bg-white rounded-2xl p-5 border ${req.status === 'انتظار' ? 'border-amber-200' : ''} hover:shadow-md`}>
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${getLeaveTypeColor(req.leave_type)}20`, color: getLeaveTypeColor(req.leave_type) }}>{getLeaveTypeLabel(req.leave_type)}</span>
                        {statusBadge(req.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span>{req.date_from} ← {req.date_to}</span>
                        <span className="font-bold text-slate-700">{req.working_days_count} يوم</span>
                      </div>
                      {req.reason && <p className="text-sm text-slate-600 mt-2">{req.reason}</p>}
                      {req.rejection_reason && req.status === 'مرفوض' && <p className="text-sm text-red-600 mt-2">الرفض: {req.rejection_reason}</p>}
                    </div>
                    {canApprove && req.status === 'انتظار' && (
                      <div className="flex gap-2">
                        <button onClick={() => handleApprove(req.id)} disabled={processingId === req.id} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">موافقة</button>
                        <button onClick={() => { setRejectingId(req.id); setRejectionReason(''); }} disabled={processingId === req.id} className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">رفض</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {rejectingId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRejectingId(null)}>
              <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-extrabold mb-3">سبب رفض الطلب</h3>
                <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={4} className="w-full border rounded-xl px-3 py-2.5" autoFocus />
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setRejectingId(null)} className="px-4 py-2 bg-slate-100 rounded-xl">إلغاء</button>
                  <button onClick={handleReject} disabled={!rejectionReason.trim()} className="px-4 py-2 bg-red-600 text-white rounded-xl">تأكيد الرفض</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Permissions Tab */}
      {activeTab === 'permissions' && (
        <>
          <div className={`bg-gradient-to-br ${pageGradient} rounded-2xl p-6 text-white`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-extrabold"><Clock size={24} className="inline ml-2" />طلبات الزمنيات</h2>
                <p className="text-white/70 mt-1">إدارة طلبات الزمنيات بأنواعها الأربعة</p>
              </div>
              {canSubmit && (
                <button onClick={() => setPermShowForm(!permShowForm)} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl font-bold text-sm">{permShowForm ? 'إلغاء' : '+ طلب زمنية'}</button>
              )}
            </div>
          </div>

          {canApprove && (
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: 'الإجمالي', value: permStats.total, color: 'bg-white' },
                { label: 'قيد المراجعة', value: permStats.pending, color: 'bg-amber-50' },
                { label: 'تمت الموافقة', value: permStats.approved, color: 'bg-emerald-50' },
                { label: 'مرفوض', value: permStats.rejected, color: 'bg-red-50' },
              ].map((s, i) => (
                <div key={i} className={`rounded-2xl p-4 border ${s.color}`}>
                  <div className="text-xs font-bold text-slate-500 mb-1">{s.label}</div>
                  <div className="text-2xl font-extrabold text-slate-800">{s.value}</div>
                </div>
              ))}
            </div>
          )}

          {canSubmit && permShowForm && (
            <form onSubmit={handlePermSubmit} className="bg-white rounded-2xl p-6 border space-y-4">
              <h3 className="text-lg font-extrabold">نموذج طلب زمنية</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold mb-1">نوع الزمنية</label>
                  <select value={permFormData.permission_type} onChange={(e) => setPermFormData({ ...permFormData, permission_type: e.target.value as PermissionType })} className="w-full border rounded-xl px-3 py-2.5">
                    {(['عادية', 'مغادرة', 'تعويضية', 'بدون_راتب'] as PermissionType[]).map((t) => (
                      <option key={t} value={t}>{t === 'عادية' ? 'زمنية عادية' : t === 'مغادرة' ? 'مغادرة العمل' : t === 'تعويضية' ? 'زمنية تعويضية' : 'بدون راتب'}</option>
                    ))}
                  </select>
                </div>
                <div><label className="block text-sm font-bold mb-1">التاريخ</label><input type="date" value={permFormData.date} onChange={(e) => setPermFormData({ ...permFormData, date: e.target.value })} className="w-full border rounded-xl px-3 py-2.5" required /></div>
                <div><label className="block text-sm font-bold mb-1">وقت الخروج</label><input type="time" value={permFormData.expected_out_time} onChange={(e) => setPermFormData({ ...permFormData, expected_out_time: e.target.value })} className="w-full border rounded-xl px-3 py-2.5" required /></div>
                {permFormData.permission_type !== 'مغادرة' && (
                  <div><label className="block text-sm font-bold mb-1">وقت العودة</label><input type="time" value={permFormData.expected_return_time} onChange={(e) => setPermFormData({ ...permFormData, expected_return_time: e.target.value })} className="w-full border rounded-xl px-3 py-2.5" /></div>
                )}
              </div>
              <textarea value={permFormData.reason} onChange={(e) => setPermFormData({ ...permFormData, reason: e.target.value })} rows={3} className="w-full border rounded-xl px-3 py-2.5" placeholder="السبب..." required />
              <button type="submit" disabled={permSubmitting} className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold disabled:opacity-50">{permSubmitting ? 'جاري...' : <><Send size={16} className="inline ml-1" />إرسال الطلب</>}</button>
            </form>
          )}

          {canApprove && (
            <div className="bg-white rounded-2xl p-4 border flex gap-3">
              <input type="text" placeholder="بحث..." value={permSearchQuery} onChange={(e) => setPermSearchQuery(e.target.value)} className="flex-1 border rounded-xl px-3 py-2.5" />
              <select value={permStatusFilter} onChange={(e) => setPermStatusFilter(e.target.value as StatusFilter)} className="border rounded-xl px-3 py-2.5">
                <option value="all">جميع الحالات</option><option value="انتظار">قيد المراجعة</option><option value="موافق">موافق</option><option value="مرفوض">مرفوض</option>
              </select>
            </div>
          )}

          {permLoading ? (
            <div className="flex justify-center py-20"><Loader className="animate-spin" size={32} /></div>
          ) : filteredPermissions.length === 0 ? (
            <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border"><Clock size={48} className="mx-auto mb-4 opacity-40" /><p>لا توجد طلبات زمنية</p></div>
          ) : (
            <div className="space-y-3">
              {filteredPermissions.map((perm) => (
                <div key={perm.id} className={`bg-white rounded-2xl p-5 border ${perm.status === 'انتظار' ? 'border-amber-200' : ''} hover:shadow-md`}>
                  <div className="flex items-start justify-between flex-wrap gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${PERMISSION_TYPE_COLORS[perm.permission_type]}20`, color: PERMISSION_TYPE_COLORS[perm.permission_type] }}>
                          {perm.permission_type === 'عادية' ? 'زمنية عادية' : perm.permission_type === 'مغادرة' ? 'مغادرة' : perm.permission_type === 'تعويضية' ? 'تعويضية' : 'بدون راتب'}
                        </span>
                        {statusBadge(perm.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-slate-500">
                        <span>📅 {perm.date}</span>
                        <span>🚪 {perm.expected_out_time}</span>
                        {perm.expected_return_time && <span>🔙 {perm.expected_return_time}</span>}
                      </div>
                      {perm.reason && <p className="text-sm text-slate-600 mt-2">{perm.reason}</p>}
                      {perm.rejection_reason && perm.status === 'مرفوض' && <p className="text-sm text-red-600 mt-2">الرفض: {perm.rejection_reason}</p>}
                    </div>
                    {canApprove && perm.status === 'انتظار' && (
                      <div className="flex gap-2">
                        <button onClick={() => handlePermApprove(perm.id)} disabled={permProcessingId === perm.id} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">موافقة</button>
                        <button onClick={() => { setPermRejectingId(perm.id); setPermRejectionReason(''); }} disabled={permProcessingId === perm.id} className="px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">رفض</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {permRejectingId && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPermRejectingId(null)}>
              <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-extrabold mb-3">سبب رفض الزمنية</h3>
                <textarea value={permRejectionReason} onChange={(e) => setPermRejectionReason(e.target.value)} rows={4} className="w-full border rounded-xl px-3 py-2.5" autoFocus />
                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => setPermRejectingId(null)} className="px-4 py-2 bg-slate-100 rounded-xl">إلغاء</button>
                  <button onClick={handlePermReject} disabled={!permRejectionReason.trim()} className="px-4 py-2 bg-red-600 text-white rounded-xl">تأكيد الرفض</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
