import { useCallback, useEffect, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { useAuthStore, useUIStore } from '../../../../core/stores';
import { employeeMovementTemplateService } from '../../../../services/sdk/EmployeePermitsService';
import { movementLocationService } from '../../../../services/sdk/MovementFoundationService';
import type { EmployeeMovementTemplateRecord, PermitType } from '../../../../shared/types/employee-permits';
import type { MovementLocationRecord } from '../../../../shared/types/movement-foundation';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';

export default function EmployeeMovementTemplatesPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [templates, setTemplates] = useState<EmployeeMovementTemplateRecord[]>([]);
  const [locations, setLocations] = useState<MovementLocationRecord[]>([]);
  const [showCreate, setShowCreate] = useState(false);

  // Form state
  const [form, setForm] = useState({
    template_name: '',
    permit_type: 'official' as PermitType,
    destination_id: '',
    destination_name: '',
    purpose: '',
    max_duration_minutes: 60,
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tmplRows, locRows] = await Promise.all([
        employeeMovementTemplateService.findAll({ orderBy: 'template_name', ascending: true }),
        movementLocationService.findActiveLocations(),
      ]);
      setTemplates(tmplRows || []);
      setLocations(locRows || []);
      if (locRows && locRows.length > 0) {
        setForm(f => ({ ...f, destination_id: locRows[0].id, destination_name: locRows[0].name_ar }));
      }
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDestinationChange = (locId: string) => {
    const loc = locations.find(l => l.id === locId);
    if (loc) {
      setForm(f => ({ ...f, destination_id: loc.id, destination_name: loc.name_ar }));
    }
  };

  const createTemplate = async () => {
    if (!form.template_name.trim()) return addToast('يرجى إدخال اسم القالب', 'warning');
    if (!form.destination_name.trim()) return addToast('يرجى تحديد الوجهة', 'warning');
    if (!form.purpose.trim()) return addToast('يرجى إدخال الغرض', 'warning');

    try {
      await employeeMovementTemplateService.create({
        tenant_id: user?.tenant_id || '',
        template_name: form.template_name.trim(),
        permit_type: form.permit_type,
        destination_id: form.destination_id || undefined,
        destination_name: form.destination_name,
        purpose: form.purpose.trim(),
        max_duration_minutes: Number(form.max_duration_minutes || 60),
        is_active: true,
      } as Partial<EmployeeMovementTemplateRecord>);

      addToast('تم إنشاء قالب التصريح بنجاح', 'success');
      setShowCreate(false);
      setForm({ template_name: '', permit_type: 'official', destination_id: '', destination_name: '', purpose: '', max_duration_minutes: 60 });
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
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><FileText /> قوالب تصاريح الخروج المتكررة</h2>
          <p className="text-white/75 mt-2 text-sm">إعداد وتسيير قوالب التصاريح للزيارات الدورية والمتكررة.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-700 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">قالب جديد</Button>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['اسم القالب', 'النوع', 'الوجهة', 'الغرض', 'المدة (دقيقة)', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-slate-400">لا توجد قوالب مسجلة حالياً.</td></tr>
              ) : templates.map(t => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-800">{t.template_name}</td>
                  <td className="py-3 px-4"><span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{t.permit_type}</span></td>
                  <td className="py-3 px-4 text-slate-700">{t.destination_name}</td>
                  <td className="py-3 px-4 text-slate-600">{t.purpose}</td>
                  <td className="py-3 px-4 font-bold text-slate-700">{t.max_duration_minutes} دقيقة</td>
                  <td className="py-3 px-4">{t.is_active ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">نشط</span> : <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">معطل</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-slate-900 mb-2">إضافة قالب تصريح جديد</h3>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">اسم القالب</label>
              <input
                value={form.template_name}
                onChange={e => setForm({ ...form, template_name: e.target.value })}
                placeholder="مثال: إيداع بنكي أسبوعي"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">نوع التصريح</label>
              <select
                value={form.permit_type}
                onChange={e => setForm({ ...form, permit_type: e.target.value as PermitType })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                <option value="official">مهمة رسمية</option>
                <option value="personal">شخصي</option>
                <option value="field_visit">زيارة ميدانية</option>
                <option value="training">تدريب</option>
                <option value="medical">مراجعة طبية</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">الوجهة</label>
              <select
                value={form.destination_id}
                onChange={e => handleDestinationChange(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                {locations.map(l => <option key={l.id} value={l.id}>{l.name_ar}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">الغرض الثابت</label>
              <textarea
                value={form.purpose}
                onChange={e => setForm({ ...form, purpose: e.target.value })}
                rows={2}
                placeholder="الغرض من التصريح..."
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">المدة القصوى (دقيقة)</label>
              <input
                type="number"
                min={15}
                value={form.max_duration_minutes}
                onChange={e => setForm({ ...form, max_duration_minutes: Number(e.target.value) })}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400 font-mono"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="secondary" fullWidth onClick={() => setShowCreate(false)}>إلغاء</Button>
              <Button fullWidth onClick={createTemplate}>حفظ القالب</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
