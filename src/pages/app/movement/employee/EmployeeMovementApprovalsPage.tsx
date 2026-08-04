import { useCallback, useEffect, useState } from 'react';
import { CheckSquare, CheckCircle2, XCircle, ShieldAlert } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../../core/stores';
import { employeeMovementPermitService } from '../../../../services/sdk/EmployeePermitsService';
import type { EmployeeMovementPermitRecord } from '../../../../shared/types/employee-permits';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function EmployeeMovementApprovalsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [pendingPermits, setPendingPermits] = useState<EmployeeMovementPermitRecord[]>([]);

  // Action modal
  const [activePermit, setActivePermit] = useState<EmployeeMovementPermitRecord | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await employeeMovementPermitService.findPendingApprovals();
      setPendingPermits(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleApprove = async (permit: EmployeeMovementPermitRecord) => {
    try {
      await employeeMovementPermitService.update(permit.id, {
        status: 'approved',
        approved_by: user?.id,
        updated_at: new Date().toISOString(),
      } as Partial<EmployeeMovementPermitRecord>);
      addToast('تم اعتماد التصريح بنجاح وتوليد رمز QR', 'success');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleRejectConfirm = async () => {
    if (!activePermit || rejectReason.trim().length < 5) {
      return addToast('يرجى كتابة سبب الرفض', 'warning');
    }
    try {
      await employeeMovementPermitService.update(activePermit.id, {
        status: 'rejected',
        notes: `[مرفوض]: ${rejectReason.trim()}`,
        updated_at: new Date().toISOString(),
      } as Partial<EmployeeMovementPermitRecord>);
      addToast('تم رفض طلب التصريح', 'info');
      setActivePermit(null);
      setActionType(null);
      setRejectReason('');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E01</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><CheckSquare /> صندوق الموافقات المعلقة</h2>
          <p className="text-white/75 mt-2 text-sm">مراجعة واعتماد طلبات تصاريح الخروج المقدمة من الموظفين.</p>
        </div>
      </div>

      <div className="space-y-4">
        {pendingPermits.length === 0 ? (
          <Card><div className="text-center py-12 text-slate-400"><CheckCircle2 size={40} className="mx-auto text-emerald-500 mb-2" /><p className="font-bold text-slate-700">صندوق الموافقات فارغ</p><p className="text-xs">لا توجد طلبات تصاريح خروج بانتظار الاعتماد حالياً.</p></div></Card>
        ) : pendingPermits.map(p => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 text-xs font-bold">بانتظار الموافقة</span>
                  <span className="font-mono text-xs text-slate-400">{p.permit_number || p.id.substring(0, 8)}</span>
                </div>
                <h4 className="text-base font-bold text-slate-900">{p.employee_name || 'موظف'} — <span className="text-indigo-600">{p.destination_name}</span></h4>
                <p className="text-sm text-slate-600"><strong>الغرض:</strong> {p.purpose}</p>
                <p className="text-xs text-slate-400 font-mono">الخروج المخطط: {format(new Date(p.valid_from), 'dd MMM yyyy HH:mm', { locale: ar })} ({p.max_duration_minutes} دقيقة)</p>
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => handleApprove(p)} icon={<CheckCircle2 size={16} />} iconPosition="left">اعتماد</Button>
                <Button size="sm" variant="danger" onClick={() => { setActivePermit(p); setActionType('reject'); }} icon={<XCircle size={16} />} iconPosition="left">رفض</Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Reject Modal */}
      {actionType === 'reject' && activePermit && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setActivePermit(null); setActionType(null); }}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 text-rose-600"><ShieldAlert /> رفض طلب التصريح</h3>
            <p className="text-sm text-slate-600">يرجى كتابة سبب رفض التصريح للموظف:</p>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              rows={3}
              placeholder="سبب الرفض..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => { setActivePermit(null); setActionType(null); }}>تراجع</Button>
              <Button variant="danger" fullWidth onClick={handleRejectConfirm}>تأكيد الرفض</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
