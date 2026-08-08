import { useCallback, useEffect, useState } from 'react';
import { Award, Plus, Truck , X } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';
import { logisticsCarrierService } from '../../../../services/sdk/LogisticsCarriersCostsService';
import type { LogisticsCarrierRecord } from '../../../../shared/types/logistics-carriers-costs';
import Card from '../../../../shared/components/ui/Card';
import { MovementUnitNav } from '../shared/MovementUnitNav';
import Button from '../../../../shared/components/ui/Button';
import { getErrorMessage } from '../../../../services/errors';
import Input from '../../../../shared/components/ui/Input';
import {
  movementFoundationOperationsService,
  CARRIER_SERVICE_LABELS,
  type CarrierServiceType,
} from '../../../../services/sdk/MovementFoundationOperationsService';

export default function LogisticsCarriersPage() {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    carrierNameAr: '', serviceType: '3pl' as CarrierServiceType,
    contactPerson: '', phone: '', email: '', contractExpiry: '',
  });
  const [carriers, setCarriers] = useState<LogisticsCarrierRecord[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await logisticsCarrierService.findAll({ orderBy: 'carrier_name_ar', ascending: true });
      setCarriers(data || []);
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadData(); }, [loadData]);

  /* الإنشاء عبر RPC (0285): يرفض العقد المنتهي والبريد غير الصالح والاسم المكرَّر */
  const submitCarrier = async () => {
    setSaving(true);
    try {
      await movementFoundationOperationsService.createCarrier({
        carrierNameAr: form.carrierNameAr,
        serviceType: form.serviceType,
        contactPerson: form.contactPerson || null,
        phone: form.phone || null,
        email: form.email || null,
        contractExpiry: form.contractExpiry || null,
      });
      addToast('تمت إضافة الناقل', 'success');
      setShowCreate(false);
      setForm({ carrierNameAr: '', serviceType: '3pl', contactPerson: '', phone: '', email: '', contractExpiry: '' });
      await loadData();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <MovementUnitNav unit="logistics_carriers" />
      <div className="bg-gradient-to-br from-indigo-700 to-slate-900 rounded-2xl p-6 text-white flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-white/70 text-sm font-semibold">Logistics Control • L10</p>
          <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Truck /> الناقلون والتعاقد الخارجي (3PL)</h2>
          <p className="text-white/75 mt-2 text-sm">إدارة شركات الشحن الخارجية، عقود الخدمات، تقييم الأداء والالتزام.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="!bg-white !text-indigo-900 hover:!bg-indigo-50 !border-none" icon={<Plus size={16} />} iconPosition="left">ناقل جديد</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold"><Truck size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{carriers.length}</p><p className="text-xs text-slate-500">إجمالي الناقلين الخارجيين</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center font-bold"><Award size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">{carriers.filter(c=>c.status==='active').length}</p><p className="text-xs text-slate-500">ناقلون نشطون وعقود سارية</p></div></div></Card>
        <Card><div className="flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold"><Award size={20} /></div><div><p className="text-2xl font-extrabold text-slate-900">5.0 / 5</p><p className="text-xs text-slate-500">متوسط تقييم جودة الخدمة</p></div></div></Card>
      </div>

      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full text-sm whitespace-nowrap">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                {['رمز الناقل', 'اسم شركة النقل', 'نوع الخدمة', 'مسؤول الاتصال', 'الهاتف', 'التقييم', 'الحالة'].map(h => <th key={h} className="text-right py-3 px-4 text-xs font-bold text-slate-500">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {carriers.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-12 text-slate-400">لا توجد شركات نقل خارجية مسجلة.</td></tr>
              ) : carriers.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-indigo-600">{c.carrier_code}</td>
                  <td className="py-3 px-4 font-bold text-slate-800">{c.carrier_name_ar}</td>
                  <td className="py-3 px-4"><span className="px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">{c.service_type}</span></td>
                  <td className="py-3 px-4 text-slate-600">{c.contact_person || '—'}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">{c.phone || '—'}</td>
                  <td className="py-3 px-4 font-bold text-amber-600 flex items-center gap-1"><Award size={14} /> {c.rating}</td>
                  <td className="py-3 px-4">
                    {c.status === 'active' ? <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold">نشط</span> :
                     <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">{c.status}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">ناقل جديد</h3>
              <button type="button" onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-600">اسم الناقل *</label>
                <Input value={form.carrierNameAr}
                  onChange={(e) => setForm({ ...form, carrierNameAr: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-600">نوع الخدمة</label>
                <select value={form.serviceType} className="w-full border rounded-xl p-2.5 text-sm mt-1"
                  onChange={(e) => setForm({ ...form, serviceType: e.target.value as CarrierServiceType })}>
                  {(Object.keys(CARRIER_SERVICE_LABELS) as CarrierServiceType[]).map((t) => (
                    <option key={t} value={t}>{CARRIER_SERVICE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">جهة الاتصال</label>
                  <Input value={form.contactPerson}
                    onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">الهاتف</label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600">البريد الإلكتروني</label>
                  <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600">انتهاء العقد</label>
                  <Input type="date" value={form.contractExpiry}
                    onChange={(e) => setForm({ ...form, contractExpiry: e.target.value })} />
                </div>
              </div>
              <p className="text-[11px] text-slate-400">
                لا يُقبل تسجيل ناقل بعقد منتهٍ. تنبيه تلقائي قبل الانتهاء بـ 30 يوماً.
              </p>
            </div>
            <div className="flex gap-2 mt-5">
              <Button onClick={() => void submitCarrier()} loading={saving} className="flex-1">حفظ</Button>
              <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">إلغاء</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
