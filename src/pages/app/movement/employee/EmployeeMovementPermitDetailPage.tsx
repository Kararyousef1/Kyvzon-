import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock, QrCode, ShieldAlert, XCircle, RefreshCw } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { employeeMovementPermitService } from '../../../../services/sdk/EmployeePermitsService';
import type { EmployeeMovementPermitRecord } from '../../../../shared/types/employee-permits';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function EmployeeMovementPermitDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [permit, setPermit] = useState<EmployeeMovementPermitRecord | null>(null);

  // Modals state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [extendMinutes, setExtendMinutes] = useState(30);
  const [extendReason, setExtendReason] = useState('');

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await employeeMovementPermitService.findById(id);
      setPermit(data || null);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [id, addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleCancel = async () => {
    if (!id || cancelReason.trim().length < 10) {
      return addToast('يرجى كتابة سبب الإلغاء (10 أحرف على الأقل)', 'warning');
    }
    try {
      await employeeMovementPermitService.cancelPermit(id, cancelReason.trim());
      addToast('تم إلغاء التصريح بنجاح', 'success');
      setShowCancelModal(false);
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const handleExtend = async () => {
    if (!id || extendReason.trim().length < 5) {
      return addToast('يرجى كتابة سبب التمديد', 'warning');
    }
    try {
      await employeeMovementPermitService.extendPermit(id, extendMinutes, extendReason.trim());
      addToast('تم تمديد فترة التصريح بنجاح', 'success');
      setShowExtendModal(false);
      setExtendReason('');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  if (loading) {
    return <div className="text-center py-20 text-slate-400">جاري تحميل تفاصيل التصريح...</div>;
  }

  if (!permit) {
    return <div className="text-center py-20 text-slate-400">التصريح غير موجود أو تم حذفه.</div>;
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E01</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><QrCode /> تفاصيل تصريح الخروج: {permit.permit_number || permit.id.substring(0, 8)}</h2>
          <p className="text-white/75 mt-2 text-sm">متابعة حالة التصريح، رمز التحقق QR، وتاريخ دورة الحياة.</p>
        </div>
        <Button onClick={() => navigate('/app/movement/employee/permits')} className="!bg-white/15 hover:!bg-white/25 !text-white !border-none" icon={<ArrowRight size={16} />} iconPosition="right">العودة للقائمة</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <h3 className="text-lg font-bold text-slate-900 mb-4">معلومات التصريح الأساسية</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-400 block text-xs">الموظف</span><strong className="text-slate-800">{permit.employee_name || 'موظف'}</strong></div>
              <div><span className="text-slate-400 block text-xs">النوع</span><span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{permit.permit_type}</span></div>
              <div><span className="text-slate-400 block text-xs">الوجهة</span><strong className="text-slate-800">{permit.destination_name}</strong></div>
              <div><span className="text-slate-400 block text-xs">الحالة</span><strong className="text-emerald-700">{permit.status}</strong></div>
              <div className="col-span-2"><span className="text-slate-400 block text-xs">الغرض</span><p className="text-slate-700 mt-0.5">{permit.purpose}</p></div>
              <div><span className="text-slate-400 block text-xs">صالح من</span><span className="font-mono text-slate-700">{format(new Date(permit.valid_from), 'dd MMM yyyy HH:mm', { locale: ar })}</span></div>
              <div><span className="text-slate-400 block text-xs">صالح حتى</span><span className="font-mono text-slate-700">{format(new Date(permit.valid_until), 'dd MMM yyyy HH:mm', { locale: ar })}</span></div>
            </div>

            {permit.status === 'approved' && (
              <div className="flex gap-2 pt-6 border-t border-slate-100 mt-6">
                <Button variant="outline" onClick={() => setShowExtendModal(true)} icon={<RefreshCw size={16} />} iconPosition="left">تمديد التصريح</Button>
                <Button variant="danger" onClick={() => setShowCancelModal(true)} icon={<XCircle size={16} />} iconPosition="left">إلغاء التصريح</Button>
              </div>
            )}
          </Card>
        </div>

        <div>
          <Card className="text-center space-y-4">
            <h4 className="font-bold text-slate-800">رمز التحقق المشفر (QR)</h4>
            <div className="w-48 h-48 mx-auto bg-slate-900 rounded-2xl p-4 flex flex-col items-center justify-center text-white shadow-inner">
              <QrCode size={80} className="text-indigo-400 mb-2 animate-pulse" />
              <p className="font-mono text-xs text-indigo-200">SHA-256 SECURED</p>
            </div>
            <p className="text-xs text-slate-500 font-mono">الرمز: {permit.qr_token.substring(0, 16)}...</p>
            <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded-xl">يتم مسح هذا الرمز عند بوابات الحراسة لتنفيذ الخروج.</p>
          </Card>
        </div>
      </div>

      {/* Cancel Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCancelModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 text-rose-600"><ShieldAlert /> إلغاء التصريح</h3>
            <p className="text-sm text-slate-600">يرجى كتابة سبب الإلغاء بدقة (10 أحرف على الأقل):</p>
            <textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              rows={3}
              placeholder="سبب الإلغاء..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-rose-400"
            />
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setShowCancelModal(false)}>تراجع</Button>
              <Button variant="danger" fullWidth onClick={handleCancel}>تأكيد الإلغاء</Button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {showExtendModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExtendModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><RefreshCw /> تمديد فترة التصريح</h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">مدة إضافية (بالدقائق)</label>
              <input
                type="number"
                min={15}
                max={120}
                value={extendMinutes}
                onChange={e => setExtendMinutes(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">سبب التمديد</label>
              <textarea
                value={extendReason}
                onChange={e => setExtendReason(e.target.value)}
                rows={3}
                placeholder="سبب التمديد..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setShowExtendModal(false)}>تراجع</Button>
              <Button fullWidth onClick={handleExtend}>تأكيد التمديد</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
