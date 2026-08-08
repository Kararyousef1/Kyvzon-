import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, ArrowLeft, CheckCircle2, Clock, MapPin, QrCode } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../../core/stores';
import { employeeMovementPermitService } from '../../../../services/sdk/EmployeePermitsService';
import { movementLocationService, movementPolicyService } from '../../../../services/sdk/MovementFoundationService';
import type { MovementLocationRecord, MovementPolicyRecord } from '../../../../shared/types/movement-foundation';
import type { PermitType, EmployeeMovementPermitRecord } from '../../../../shared/types/employee-permits';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import { MovementUnitNav } from '../shared/MovementUnitNav';

export default function EmployeeMovementNewPermitPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [locations, setLocations] = useState<MovementLocationRecord[]>([]);
  const [policies, setPolicies] = useState<MovementPolicyRecord[]>([]);

  // Form state
  const [form, setForm] = useState({
    permit_type: 'official' as PermitType,
    destination_id: '',
    destination_name: '',
    purpose: '',
    valid_from: new Date().toISOString().slice(0, 16),
    max_duration_minutes: 60,
    is_paid_time: true,
    deduct_from_leave: false,
  });

  const loadFoundation = useCallback(async () => {
    try {
      const [locs, pols] = await Promise.all([
        movementLocationService.findActiveLocations(),
        movementPolicyService.findActivePolicies(),
      ]);
      setLocations(locs || []);
      setPolicies(pols || []);
      if (locs && locs.length > 0) {
        setForm(f => ({ ...f, destination_id: locs[0].id, destination_name: locs[0].name_ar }));
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  }, [addToast]);

  useEffect(() => { loadFoundation(); }, [loadFoundation]);

  const selectedLocation = locations.find(l => l.id === form.destination_id);

  const handleDestinationChange = (locId: string) => {
    const loc = locations.find(l => l.id === locId);
    if (loc) {
      setForm(f => ({ ...f, destination_id: loc.id, destination_name: loc.name_ar }));
    }
  };

  const validateStep1 = () => {
    if (!form.destination_name.trim()) {
      addToast('يرجى تحديد وجهة التصريح', 'warning');
      return false;
    }
    if (!form.purpose.trim() || form.purpose.trim().length < 10) {
      addToast('يرجى إدخال غرض واضح للتصريح (10 أحرف على الأقل)', 'warning');
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (form.max_duration_minutes <= 0) {
      addToast('يرجى تحديد مدة صحيحة', 'warning');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    try {
      const validFromDate = new Date(form.valid_from);
      const validUntilDate = new Date(validFromDate.getTime() + form.max_duration_minutes * 60000);
      const qrToken = Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);

      await employeeMovementPermitService.create({
        tenant_id: user?.tenant_id || '',
        employee_id: user?.id || '',
        employee_name: user?.full_name || user?.name || user?.email || 'موظف',
        permit_number: `PRM-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`,
        permit_type: form.permit_type,
        destination_id: form.destination_id || undefined,
        destination_name: form.destination_name,
        purpose: form.purpose.trim(),
        valid_from: validFromDate.toISOString(),
        valid_until: validUntilDate.toISOString(),
        max_duration_minutes: form.max_duration_minutes,
        is_paid_time: form.is_paid_time,
        deduct_from_leave: form.deduct_from_leave,
        qr_token: qrToken,
        status: 'pending_approval',
        created_by: user?.id,
      } as Partial<EmployeeMovementPermitRecord>);

      addToast('تم إرسال طلب التصريح بنجاح بانتظار الموافقة', 'success');
      navigate('/app/movement/employee/permits');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-fade-in" dir="rtl">
      <MovementUnitNav unit="employee_permits" />
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Employee Movement • E01</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><QrCode /> طلب تصريح خروج جديد</h2>
          <p className="text-white/75 mt-2 text-sm">إنشاء تصريح خروج مسبق وفقاً للسياسات المعتمدة وسلسلة الموافقات.</p>
        </div>
        <Button onClick={() => navigate('/app/movement/employee/permits')} className="!bg-white/15 hover:!bg-white/25 !text-white !border-none" icon={<ArrowRight size={16} />} iconPosition="right">العودة للقائمة</Button>
      </div>

      {/* Steps Indicator */}
      <div className="grid grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-2 text-center text-xs font-bold">
        <div className={`py-2 rounded-xl transition-all ${step === 1 ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}>① الأساسيات والوجهة</div>
        <div className={`py-2 rounded-xl transition-all ${step === 2 ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}>② التوقيت والمدد</div>
        <div className={`py-2 rounded-xl transition-all ${step === 3 ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500'}`}>③ المراجعة والاعتماد</div>
      </div>

      {step === 1 && (
        <Card>
          <h3 className="text-lg font-bold text-slate-900 mb-4">الخطوة 1: تفاصيل الوجهة والغرض</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">نوع التصريح</label>
              <select
                value={form.permit_type}
                onChange={e => setForm({ ...form, permit_type: e.target.value as PermitType })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              >
                <option value="official">مهمة رسمية (Official)</option>
                <option value="personal">شخصي (Personal)</option>
                <option value="field_visit">زيارة ميدانية (Field Visit)</option>
                <option value="training">تدريب (Training)</option>
                <option value="medical">مراجعة طبية (Medical)</option>
                <option value="customer_visit">زيارة عميل (Customer Visit)</option>
                <option value="emergency">طارئ (Emergency)</option>
                <option value="delegation">انتداب (Delegation)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">الوجهة المعتمدة</label>
              <select
                value={form.destination_id}
                onChange={e => handleDestinationChange(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400"
              >
                {locations.map(l => <option key={l.id} value={l.id}>{l.name_ar} ({l.location_type})</option>)}
              </select>
              {selectedLocation && (
                <div className="mt-2 p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2.5 text-xs text-indigo-900">
                  <MapPin size={16} className="text-indigo-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">معلومات الموقع المختار:</p>
                    <p className="text-indigo-700 mt-0.5">النوع: {selectedLocation.location_type} | نصف قطر السور: {selectedLocation.radius_meters || 50} متر</p>
                    {selectedLocation.description && <p className="text-indigo-600 mt-1">{selectedLocation.description}</p>}
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">الغرض (10 أحرف على الأقل)</label>
              <textarea
                value={form.purpose}
                onChange={e => setForm({ ...form, purpose: e.target.value })}
                rows={3}
                placeholder="اكتب الغرض التفصيلي للخروج..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>

            <div className="flex justify-end pt-4">
              <Button onClick={() => { if (validateStep1()) setStep(2); }} icon={<ArrowLeft size={16} />} iconPosition="left">التالي: التوقيت</Button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <h3 className="text-lg font-bold text-slate-900 mb-4">الخطوة 2: التوقيت والمدد المسموحة</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">وقت الخروج المخطط</label>
              <input
                type="datetime-local"
                value={form.valid_from}
                onChange={e => setForm({ ...form, valid_from: e.target.value })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1.5">المدة المتوقعة (بالدقائق)</label>
              <input
                type="number"
                min={15}
                max={480}
                value={form.max_duration_minutes}
                onChange={e => setForm({ ...form, max_duration_minutes: Number(e.target.value) })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">الحد الأقصى المسموح عادة بالسياسة: 240 دقيقة (4 ساعات).</p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100">
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_paid_time}
                  onChange={e => setForm({ ...form, is_paid_time: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                يُحتسب وقت التصريح كعمل مدفوع الأجر (لا يُخصم من الحضور)
              </label>

              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.deduct_from_leave}
                  onChange={e => setForm({ ...form, deduct_from_leave: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                خصم الوقت من رصيد الإجازات الشخصية
              </label>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="secondary" onClick={() => setStep(1)} icon={<ArrowRight size={16} />} iconPosition="right">السابق</Button>
              <Button onClick={() => { if (validateStep2()) setStep(3); }} icon={<ArrowLeft size={16} />} iconPosition="left">التالي: المراجعة</Button>
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <h3 className="text-lg font-bold text-slate-900 mb-4">الخطوة 3: مراجعة الطلب والإرسال</h3>
          <div className="space-y-4">
            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-200"><span className="text-slate-500">نوع التصريح:</span><strong className="text-slate-900">{form.permit_type}</strong></div>
              <div className="flex justify-between py-1 border-b border-slate-200"><span className="text-slate-500">الوجهة:</span><strong className="text-indigo-700">{form.destination_name}</strong></div>
              <div className="flex justify-between py-1 border-b border-slate-200"><span className="text-slate-500">الغرض:</span><strong className="text-slate-900">{form.purpose}</strong></div>
              <div className="flex justify-between py-1 border-b border-slate-200"><span className="text-slate-500">وقت البدء:</span><strong className="font-mono text-slate-900">{form.valid_from}</strong></div>
              <div className="flex justify-between py-1 border-b border-slate-200"><span className="text-slate-500">المدة:</span><strong className="font-mono text-slate-900">{form.max_duration_minutes} دقيقة</strong></div>
              <div className="flex justify-between py-1"><span className="text-slate-500">سلسلة الموافقة:</span><strong className="text-emerald-700">المدير المباشر ← مسؤول الأمن/HR</strong></div>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="secondary" onClick={() => setStep(2)} icon={<ArrowRight size={16} />} iconPosition="right">السابق</Button>
              <Button onClick={handleSubmit} icon={<CheckCircle2 size={16} />} iconPosition="left">إرسال الطلب للموافقة</Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
