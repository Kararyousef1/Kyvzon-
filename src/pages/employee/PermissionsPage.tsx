/**
 * ════════════════════════════════════════════════════════════════
 *  PermissionsPage - طلبات الزمنيات (نسخة مُصلحة)
 * ════════════════════════════════════════════════════════════════
 *
 *  🔧 الإصلاحات المُطبّقة:
 *  ✅ 9 استخدام any → 0
 *  ✅ (user as any).manager_id → user.manager_id (موجود في النوع)
 *  ✅ (perm as any).rejection_reason → rejection_reason? (مضاف للـ interface)
 *  ✅ catch (err: any) → unknown + getErrorMessage (5 مواضع)
 *  ✅ setStatusFilter(... as any) → StatusFilter union
 *  ✅ تنظيف جميع markdown artifacts
 *  ✅ data as any[] → Permission[]
 *  ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useMemo } from 'react';
import { Clock, FileText, Send, CheckCircle, XCircle, Loader, Search, Filter } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../core/stores';
import { employeeService, permissionRequestService } from '../../services/sdk';
import { notifyUser, notifyRole } from '../../services/notifications/notificationService';
import { addNotification } from '../../services/notifications/notificationManager';
import { getErrorMessage } from '../../services/errors';
import { PermissionType, PERMISSION_TYPE_COLORS } from '../../utils/shiftUtils';

// ════════════════════════════════════════════════════
// أنواع البيانات
// ════════════════════════════════════════════════════

type PermissionStatus = 'انتظار' | 'موافق' | 'مرفوض';
type StatusFilter = 'all' | PermissionStatus;

interface Permission {
  id: string;
  employee_id: string;
  date: string;
  permission_type: PermissionType;
  expected_out_time: string;
  expected_return_time?: string | null;
  actual_out_time?: string;
  actual_return_time?: string;
  status: PermissionStatus;
  approved_by?: string;
  reason: string;
  created_at: string;
  reviewed_at?: string;
  rejection_reason?: string;
  employee_name?: string;
  employee_department?: string;
}

const PERMISSION_LABELS: Record<PermissionType, string> = {
  عادية: 'زمنية عادية',
  مغادرة: 'مغادرة العمل',
  تعويضية: 'زمنية تعويضية',
  بدون_راتب: 'زمنية بدون راتب',
};

const PERMISSION_DESCRIPTIONS: Record<PermissionType, string> = {
  عادية: 'خروج مبكر + رجوع - يُخصم من الراتب بالساعة',
  مغادرة: 'خروج بدون رجوع - يُخصم من الراتب بالساعة',
  تعويضية: 'تعويض عن أوفرتايم سابق - لا خصم من الراتب',
  بدون_راتب: 'خصم كامل للساعات الغائبة',
};

// ════════════════════════════════════════════════════
// المكون الرئيسي
// ════════════════════════════════════════════════════

export default function PermissionsPage() {
  const { user } = useAuthStore();
  const { addToast, activeView } = useUIStore();

  const [employeeId, setEmployeeId] = useState<string>('');
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [formData, setFormData] = useState({
    permission_type: 'عادية' as PermissionType,
    date: new Date().toISOString().split('T')[0],
    expected_out_time: '10:00',
    expected_return_time: '12:00',
    reason: '',
  });

  const viewMode = activeView === 'hr-permissions' || activeView === 'admin-permissions-management' ? 'hr' : activeView === 'manager-permissions' ? 'manager' : 'employee';
  const canApprove = viewMode === 'hr' || viewMode === 'manager';
  const canSubmit = viewMode === 'employee';

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
      if (employees.length > 0) setEmployeeId(employees[0].id);
    })();
  }, [user]);

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const data = await permissionRequestService.findAll({ orderBy: 'created_at', ascending: false });
      setPermissions((data as Permission[]) || []);
    } catch (err) {
      const msg = getErrorMessage(err);
      if (!msg.includes('does not exist')) addToast('❌ فشل تحميل الزمنيات', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPermissions(); }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !formData.date || !formData.expected_out_time) return;
    setSubmitting(true);
    try {
      let targetId = employeeId;
      if (!targetId) {
        const employees = await employeeService.findAll({ filters: { user_id: user.id }, limit: 1 });
        if (employees.length > 0) {
          targetId = employees[0].id;
          setEmployeeId(targetId);
        }
      }

      await permissionRequestService.createRequest({
        employee_id: targetId || user.id,
        employee_name: user.full_name || 'موظف',
        employee_department: user.department || undefined,
        date: formData.date,
        permission_type: formData.permission_type,
        expected_out_time: formData.expected_out_time,
        expected_return_time: formData.permission_type === 'مغادرة' ? undefined : formData.expected_return_time,
        reason: formData.reason,
      });

      // إشعار للمدير المباشر أو HR
      const managerId = user.manager_id || null;
      try {
        if (managerId) {
          await notifyUser(managerId, {
            type: 'leave_requested', priority: 'high',
            title: `طلب زمنية جديد: ${PERMISSION_LABELS[formData.permission_type]}`,
            message: `${user.full_name} يطلب ${PERMISSION_LABELS[formData.permission_type]} ليوم ${formData.date}`,
            actionUrl: '/permissions', groupKey: `perm-requested-${Date.now()}`,
          });
        } else {
          await notifyRole(['hr', 'admin'], {
            type: 'leave_requested', priority: 'high',
            title: `طلب زمنية جديد: ${PERMISSION_LABELS[formData.permission_type]}`,
            message: `${user.full_name} يطلب ${PERMISSION_LABELS[formData.permission_type]}`,
            actionUrl: '/permissions', groupKey: `perm-requested-${Date.now()}`,
          });
        }
      } catch { /* تجاهل أخطاء الإشعار */ }

      try {
        addNotification(user.id, {
          type: 'success', priority: 'normal',
          title: '✅ تم إرسال طلب الزمنية',
          message: `طلب ${PERMISSION_LABELS[formData.permission_type]} قيد المراجعة`,
          actionUrl: '/permissions', groupKey: `perm-sent-${Date.now()}`,
        });
      } catch { /* تجاهل */ }

      addToast('✅ تم إرسال طلب الزمنية بنجاح', 'success');
      setShowForm(false);
      setFormData({ permission_type: 'عادية', date: new Date().toISOString().split('T')[0], expected_out_time: '10:00', expected_return_time: '12:00', reason: '' });
      fetchPermissions();
    } catch (err) {
      addToast('❌ فشل إرسال الطلب: ' + getErrorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: string) => {
    if (!user) return;
    setProcessingId(id);
    try {
      const perm = await permissionRequestService.findById(id) as { employee_id: string; employee_name: string; permission_type: PermissionType } | null;
      if (!perm) throw new Error('الطلب غير موجود');

      await permissionRequestService.approveRequest(id, employeeId || user?.id || '');

      const permData = perm as { employee_id: string; permission_type: PermissionType };
      if (permData.employee_id) {
        await notifyUser(permData.employee_id, {
          type: 'leave_approved', priority: 'normal',
          title: `✅ تمت الموافقة على ${PERMISSION_LABELS[permData.permission_type]}`,
          message: 'تمت الموافقة على طلب الزمنية الخاصة بك',
          actionUrl: '/permissions', groupKey: `perm-${id}`,
        });
      }
      addToast('✅ تمت الموافقة', 'success');
      fetchPermissions();
    } catch (err) {
      addToast('❌ ' + getErrorMessage(err), 'error');
    } finally { setProcessingId(null); }
  };

  const handleReject = async () => {
    if (!user || !rejectingId || !rejectionReason.trim()) { addToast('⚠️ يرجى إدخال سبب الرفض', 'warning'); return; }
    setProcessingId(rejectingId);
    try {
      const perm = await permissionRequestService.findById(rejectingId) as { employee_id: string; permission_type: PermissionType } | null;
      if (!perm) throw new Error('الطلب غير موجود');

      await permissionRequestService.rejectRequest(rejectingId, user?.id || '', rejectionReason);

      const permData = perm as { employee_id: string; permission_type: PermissionType };
      if (permData.employee_id) {
        await notifyUser(permData.employee_id, {
          type: 'leave_rejected', priority: 'urgent',
          title: `❌ تم رفض ${PERMISSION_LABELS[permData.permission_type]}`,
          message: `تم رفض طلب الزمنية، السبب: ${rejectionReason}`,
          actionUrl: '/permissions', groupKey: `perm-rej-${rejectingId}`,
        });
      }
      addToast('✅ تم الرفض', 'success');
      setRejectingId(null); setRejectionReason('');
      fetchPermissions();
    } catch (err) { addToast('❌ ' + getErrorMessage(err), 'error'); }
    finally { setProcessingId(null); }
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      انتظار: 'bg-amber-100 text-amber-700 border border-amber-200',
      موافق: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
      مرفوض: 'bg-red-100 text-red-700 border border-red-200',
    };
    const label: Record<string, string> = { انتظار: 'قيد المراجعة', موافق: 'تمت الموافقة', مرفوض: 'مرفوض' };
    return <span className={`px-3 py-1 rounded-full text-xs font-bold ${map[status] || 'bg-slate-100 text-slate-600'}`}>{label[status] || status}</span>;
  };

  const stats = useMemo(() => ({
    total: permissions.length,
    pending: permissions.filter((r) => r.status === 'انتظار').length,
    approved: permissions.filter((r) => r.status === 'موافق').length,
    rejected: permissions.filter((r) => r.status === 'مرفوض').length,
  }), [permissions]);

  const filteredPermissions = useMemo(() => {
    return permissions.filter((req) => {
      if (statusFilter !== 'all' && req.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const name = (req.employee_name || '').toLowerCase();
        const dept = (req.employee_department || '').toLowerCase();
        if (!name.includes(q) && !dept.includes(q)) return false;
      }
      return true;
    });
  }, [permissions, statusFilter, searchQuery]);

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className={`bg-gradient-to-br ${canApprove ? 'from-blue-600 to-indigo-700' : 'from-emerald-600 to-teal-700'} rounded-2xl p-6 text-white`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-2xl font-extrabold flex items-center gap-2"><Clock size={24} /> الزمنيات</h2>
            <p className="text-white/70 mt-1">{canApprove ? 'إدارة طلبات الزمنيات للموظفين' : 'تقديم طلبات الزمنيات بأنواعها الأربعة'}</p>
          </div>
          {canSubmit && (
            <button onClick={() => setShowForm(!showForm)} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-xl font-bold text-sm transition-colors">{showForm ? 'إلغاء' : '+ طلب زمنية'}</button>
          )}
        </div>
      </div>

      {canApprove && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-slate-100"><div className="text-2xl font-extrabold text-slate-800">{stats.total}</div><div className="text-xs text-slate-500 font-bold">الإجمالي</div></div>
          <div className="bg-amber-50 rounded-2xl p-4 border border-amber-100"><div className="text-2xl font-extrabold text-amber-700">{stats.pending}</div><div className="text-xs text-amber-600 font-bold">بانتظار المراجعة</div></div>
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100"><div className="text-2xl font-extrabold text-emerald-700">{stats.approved}</div><div className="text-xs text-emerald-600 font-bold">تمت الموافقة</div></div>
          <div className="bg-red-50 rounded-2xl p-4 border border-red-100"><div className="text-2xl font-extrabold text-red-700">{stats.rejected}</div><div className="text-xs text-red-600 font-bold">مرفوض</div></div>
        </div>
      )}

      {canSubmit && showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 border border-slate-100 space-y-4">
          <h3 className="text-lg font-extrabold text-slate-800 flex items-center gap-2"><FileText size={20} /> نموذج طلب زمنية</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1">نوع الزمنية</label>
              <select value={formData.permission_type} onChange={(e) => setFormData({ ...formData, permission_type: e.target.value as PermissionType })} className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500">
                {(Object.keys(PERMISSION_LABELS) as PermissionType[]).map((type) => (<option key={type} value={type}>{PERMISSION_LABELS[type]}</option>))}
              </select>
              <p className="text-xs text-gray-500 mt-1">{PERMISSION_DESCRIPTIONS[formData.permission_type]}</p>
            </div>
            <div><label className="block text-sm font-bold mb-1">التاريخ</label><input type="date" value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })} className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500" required /></div>
            <div><label className="block text-sm font-bold mb-1">وقت الخروج المتوقع</label><input type="time" value={formData.expected_out_time} onChange={(e) => setFormData({ ...formData, expected_out_time: e.target.value })} className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500" required /></div>
            {formData.permission_type !== 'مغادرة' && (
              <div><label className="block text-sm font-bold mb-1">وقت العودة المتوقع</label><input type="time" value={formData.expected_return_time} onChange={(e) => setFormData({ ...formData, expected_return_time: e.target.value })} className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500" /></div>
            )}
          </div>
          <div><label className="block text-sm font-bold mb-1">السبب</label><textarea value={formData.reason} onChange={(e) => setFormData({ ...formData, reason: e.target.value })} rows={3} className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-emerald-500" placeholder="اذكر سبب طلب الزمنية..." required /></div>
          <button type="submit" disabled={submitting} className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-2">{submitting ? 'جاري الإرسال...' : <><Send size={16} /> إرسال الطلب</>}</button>
        </form>
      )}

      {canApprove && (
        <div className="bg-white rounded-2xl p-4 border border-slate-100">
          <div className="grid md:grid-cols-2 gap-3">
            <div className="relative">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="ابحث باسم الموظف، القسم..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full border rounded-xl pr-10 pl-3 py-2.5 outline-none focus:border-indigo-500" />
            </div>
            <div className="relative">
              <Filter size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className="w-full border rounded-xl pr-10 pl-3 py-2.5 outline-none focus:border-indigo-500 appearance-none bg-white">
                <option value="all">جميع الحالات</option><option value="انتظار">قيد المراجعة</option><option value="موافق">موافق</option><option value="مرفوض">مرفوض</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader className="animate-spin" size={32} /></div>
      ) : filteredPermissions.length === 0 ? (
        <div className="text-center py-20 text-slate-400 bg-white rounded-2xl border border-slate-100"><Clock size={48} className="mx-auto mb-4 opacity-40" /><p className="font-bold">{permissions.length === 0 ? 'لا توجد زمنيات' : 'لا توجد نتائج'}</p></div>
      ) : (
        <div className="space-y-3">
          {filteredPermissions.map((perm) => (
            <div key={perm.id} className={`bg-white rounded-2xl p-5 border ${perm.status === 'انتظار' ? 'border-amber-200' : 'border-slate-100'} hover:shadow-md transition-shadow`}>
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="flex-1 min-w-0">
                  {canApprove && <div className="text-sm font-bold text-slate-800 mb-1">{perm.employee_name || 'موظف'}</div>}
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${PERMISSION_TYPE_COLORS[perm.permission_type]}20`, color: PERMISSION_TYPE_COLORS[perm.permission_type] }}>{PERMISSION_LABELS[perm.permission_type]}</span>
                    {statusBadge(perm.status)}
                    <span className="text-xs text-slate-400">• {new Date(perm.created_at).toLocaleDateString('ar-EG')}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500 flex-wrap">
                    <span>📅 {perm.date}</span><span>🚪 خروج: {perm.expected_out_time}</span>
                    {perm.expected_return_time && <span>🔙 عودة: {perm.expected_return_time}</span>}
                  </div>
                  {perm.reason && <div className="mt-2 p-3 bg-slate-50 rounded-xl text-sm text-slate-600 border-r-4 border-slate-300"><span className="font-bold text-slate-700">السبب: </span>{perm.reason}</div>}
                  {perm.status === 'مرفوض' && perm.rejection_reason && (
                    <div className="mt-2 p-3 bg-red-50 rounded-xl text-sm text-red-700 border-r-4 border-red-400"><span className="font-bold">سبب الرفض: </span>{perm.rejection_reason}</div>
                  )}
                </div>
                {canApprove && perm.status === 'انتظار' && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => handleApprove(perm.id)} disabled={processingId === perm.id} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-1.5 shadow-sm">{processingId === perm.id ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />} موافقة</button>
                    <button onClick={() => { setRejectingId(perm.id); setRejectionReason(''); }} disabled={processingId === perm.id} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-1.5 shadow-sm"><XCircle size={14} /> رفض</button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejectingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setRejectingId(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4"><XCircle className="text-red-600" size={24} /><h3 className="text-lg font-extrabold text-slate-800">سبب رفض الزمنية</h3></div>
            <p className="text-sm text-slate-500 mb-3">يرجى توضيح سبب الرفض.</p>
            <textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={4} className="w-full border rounded-xl px-3 py-2.5 outline-none focus:border-red-500" placeholder="اكتب سبب الرفض..." autoFocus />
            <div className="flex items-center justify-end gap-2 mt-4">
              <button onClick={() => { setRejectingId(null); setRejectionReason(''); }} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl font-bold hover:bg-slate-200 text-sm">إلغاء</button>
              <button onClick={handleReject} disabled={processingId === rejectingId || !rejectionReason.trim()} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-1.5">{processingId === rejectingId ? <Loader size={14} className="animate-spin" /> : <XCircle size={14} />} تأكيد الرفض</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
