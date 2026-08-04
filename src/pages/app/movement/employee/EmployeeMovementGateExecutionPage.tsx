import { useCallback, useEffect, useState } from 'react';
import { ArrowRightLeft, CheckCircle2, Clock, QrCode, Search, ShieldAlert } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../../core/stores';
import { employeeMovementLogService, employeeMovementPermitService } from '../../../../services/sdk/EmployeePermitsService';
import { movementLocationService } from '../../../../services/sdk/MovementFoundationService';
import type { EmployeeMovementLogRecord, EmployeeMovementPermitRecord } from '../../../../shared/types/employee-permits';
import type { MovementLocationRecord } from '../../../../shared/types/movement-foundation';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export default function EmployeeMovementGateExecutionPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [activeMovements, setActiveMovements] = useState<EmployeeMovementLogRecord[]>([]);
  const [locations, setLocations] = useState<MovementLocationRecord[]>([]);
  const [scanCode, setScanCode] = useState('');
  const [scannedPermit, setScannedPermit] = useState<EmployeeMovementPermitRecord | null>(null);
  const [activeMovementForReturn, setActiveMovementForReturn] = useState<EmployeeMovementLogRecord | null>(null);
  const [returnNotes, setReturnNotes] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [movs, locs] = await Promise.all([
        employeeMovementLogService.findActiveMovements(),
        movementLocationService.findActiveLocations(),
      ]);
      setActiveMovements(movs || []);
      setLocations(locs || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    try {
      const permit = await employeeMovementPermitService.findByQrToken(code);
      if (!permit) {
        addToast('رمز QR غير معروف أو باطل', 'error');
        setScannedPermit(null);
        return;
      }
      if (permit.status !== 'approved') {
        addToast(`التصريح غير صالح للخروج (الحالة: ${permit.status})`, 'warning');
      }
      setScannedPermit(permit);
      setScanCode('');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const confirmExit = async () => {
    if (!scannedPermit) return;
    try {
      const now = new Date();
      const expectedReturn = new Date(now.getTime() + scannedPermit.max_duration_minutes * 60000);

      await employeeMovementLogService.create({
        tenant_id: user?.tenant_id || '',
        employee_id: scannedPermit.employee_id,
        permit_id: scannedPermit.id,
        destination_name: scannedPermit.destination_name,
        purpose: scannedPermit.purpose,
        departure_at: now.toISOString(),
        expected_return_at: expectedReturn.toISOString(),
        status: 'out',
        logged_by_id: user?.id,
        notes: `خروج عبر البوابة بتصريح رقم ${scannedPermit.permit_number || scannedPermit.id.substring(0,8)}`,
      } as Partial<EmployeeMovementLogRecord>);

      await employeeMovementPermitService.update(scannedPermit.id, {
        status: 'completed',
        used_at: now.toISOString(),
        updated_at: now.toISOString(),
      } as unknown as Partial<EmployeeMovementPermitRecord>);

      addToast('تم تسجيل خروج الموظف بنجاح عبر البوابة', 'success');
      setScannedPermit(null);
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  const confirmReturn = async () => {
    if (!activeMovementForReturn) return;
    try {
      const now = new Date();
      const expected = new Date(activeMovementForReturn.expected_return_at);
      const isOverdue = now > expected;

      await employeeMovementLogService.update(activeMovementForReturn.id, {
        returned_at: now.toISOString(),
        status: isOverdue ? 'overdue' : 'returned',
        notes: `${activeMovementForReturn.notes || ''} | عودة عبر البوابة: ${returnNotes.trim() || 'عاد في الوقت المحدد'}`,
        updated_at: now.toISOString(),
      } as Partial<EmployeeMovementLogRecord>);

      addToast(isOverdue ? 'تم تسجيل العودة (متأخر عن الموعد)' : 'تم تسجيل عودة الموظف بنجاح', isOverdue ? 'warning' : 'success');
      setActiveMovementForReturn(null);
      setReturnNotes('');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E02</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><ArrowRightLeft /> تنفيذ الحركة وبوابة الحراسة</h2>
          <p className="text-white/75 mt-2 text-sm">مسح رموز QR، تسجيل الخروج الفعلي، ومتابعة العودة والتأخير.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 space-y-4">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><QrCode className="text-indigo-600" /> ماسح بوابات الحراسة</h3>
          <form onSubmit={handleScan} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">رمز التصريح (QR Token)</label>
              <input
                type="text"
                value={scanCode}
                onChange={e => setScanCode(e.target.value)}
                placeholder="امسح الرمز أو اكتبه هنا..."
                className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:border-indigo-400 font-mono"
                autoFocus
              />
            </div>
            <Button type="submit" fullWidth icon={<Search size={16} />} iconPosition="left">تحقق من التصريح</Button>
          </form>

          {scannedPermit && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-3">
              <div className="flex items-center gap-2 text-emerald-800 font-bold"><CheckCircle2 size={20} /> تصريح صالح للخروج</div>
              <div className="text-xs space-y-1 text-slate-700">
                <p><strong>الموظف:</strong> {scannedPermit.employee_name || 'موظف'}</p>
                <p><strong>الوجهة:</strong> {scannedPermit.destination_name}</p>
                <p><strong>الغرض:</strong> {scannedPermit.purpose}</p>
                <p><strong>المدة:</strong> {scannedPermit.max_duration_minutes} دقيقة</p>
              </div>
              <Button fullWidth onClick={confirmExit} className="!bg-emerald-600 hover:!bg-emerald-700">تأكيد خروج الموظف</Button>
            </div>
          )}
        </Card>

        <Card padding="none" className="lg:col-span-2">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Clock /> الموظفون في الخارج حالياً ({activeMovements.length})</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {['الموظف', 'الوجهة', 'وقت الخروج', 'العودة المتوقعة', 'الحالة', 'إجراء'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {activeMovements.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا يوجد موظفون في الخارج حالياً.</td></tr>
                ) : activeMovements.map(m => (
                  <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="py-3 px-4 font-bold text-slate-800">{m.notes?.includes('بتصريح') ? m.destination_name : 'موظف'}</td>
                    <td className="py-3 px-4 font-bold text-indigo-700">{m.destination_name}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{format(new Date(m.departure_at), 'HH:mm', { locale: ar })}</td>
                    <td className="py-3 px-4 font-mono text-slate-500">{format(new Date(m.expected_return_at), 'HH:mm', { locale: ar })}</td>
                    <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">في الخارج</span></td>
                    <td className="py-3 px-4"><Button size="xs" onClick={() => setActiveMovementForReturn(m)}>تسجيل عودة</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {activeMovementForReturn && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setActiveMovementForReturn(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900">تسجيل عودة الموظف للبوابة</h3>
            <p className="text-sm text-slate-600">الوجهة المصرح بها: <strong>{activeMovementForReturn.destination_name}</strong></p>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات العودة (اختياري)</label>
              <textarea
                value={returnNotes}
                onChange={e => setReturnNotes(e.target.value)}
                rows={3}
                placeholder="ملاحظات العودة..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" fullWidth onClick={() => setActiveMovementForReturn(null)}>تراجع</Button>
              <Button fullWidth onClick={confirmReturn}>تأكيد العودة</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
