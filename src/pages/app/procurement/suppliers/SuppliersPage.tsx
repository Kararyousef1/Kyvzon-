import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';
import { supplierService, type SupplierRecord } from '../../../../services/sdk';
import { Plus, Search, Shield, AlertTriangle } from 'lucide-react';
import { useUIStore } from '../../../../core/stores';

export default function SuppliersPage() {
  const { addToast } = useUIStore();
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ legal_name: '', supplier_code: '', tax_number: '', country: 'SA', city: '' });

  const load = async () => {
    setLoading(true);
    try {
      const data = await supplierService.findAll({ orderBy: 'created_at', ascending: false, limit: 100 });
      setSuppliers(data);
    } catch (e: any) {
      addToast('فشل تحميل الموردين: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = suppliers.filter(s => 
    !query || s.legal_name.toLowerCase().includes(query.toLowerCase()) || s.supplier_code.toLowerCase().includes(query.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supplierService.create({
        legal_name: form.legal_name,
        supplier_code: form.supplier_code || `VEND-${Date.now().toString().slice(-5)}`,
        tax_number: form.tax_number || null,
        country: form.country,
        city: form.city,
        supplier_type: 'prospect',
        status: 'pending',
      });
      addToast('تم إنشاء المورد — بانتظار التأهيل', 'success');
      setShowCreate(false);
      setForm({ legal_name: '', supplier_code: '', tax_number: '', country: 'SA', city: '' });
      await load();
    } catch (err: any) {
      addToast('فشل الإنشاء: ' + err.message, 'error');
    }
  };

  const kraljicColor: Record<string, string> = {
    strategic: 'bg-purple-100 text-purple-700',
    leverage: 'bg-blue-100 text-blue-700',
    bottleneck: 'bg-amber-100 text-amber-700',
    routine: 'bg-slate-100 text-slate-700',
  };

  const riskColor: Record<string, string> = {
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-orange-100 text-orange-700',
    critical: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-black">الموردون</h1>
          <p className="text-slate-500 mt-1">Kraljic Matrix + تقييم مخاطر 5 أبعاد — Wave1</p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="بحث بالاسم أو الكود..." className="pr-9 border rounded-xl px-3 py-2 text-sm w-64" />
          </div>
          <Button onClick={()=>setShowCreate(true)}><Plus size={16} className="inline ml-1" />مورد جديد</Button>
        </div>
      </div>

      {loading ? <div className="py-20 text-center">جاري التحميل...</div> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(s => (
            <Card key={s.id} className="hover:shadow-lg transition">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold">{s.legal_name}</div>
                  <div className="text-xs text-slate-500 mt-1">{s.supplier_code} • {s.country || '-'} {s.city || ''}</div>
                </div>
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${s.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : s.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100'}`}>{s.status}</span>
              </div>
              <div className="flex gap-2 mt-3 flex-wrap">
                {s.kraljic_category && <span className={`text-[10px] px-2 py-1 rounded-full ${kraljicColor[s.kraljic_category] || 'bg-slate-100'}`}>{s.kraljic_category}</span>}
                {s.risk_level && <span className={`text-[10px] px-2 py-1 rounded-full flex items-center gap-1 ${riskColor[s.risk_level] || 'bg-slate-100'}`}><Shield size={10} />{s.risk_level} {s.risk_score ? `(${s.risk_score})` : ''}</span>}
                {s.supplier_type && <span className="text-[10px] px-2 py-1 rounded-full bg-slate-100">{s.supplier_type}</span>}
              </div>
              <div className="mt-3 text-xs text-slate-500">ضريبي: {s.tax_number || '-'}</div>
              <Link to={`/app/procurement/suppliers/${s.id}`} className="block mt-4">
                <Button variant="secondary" size="sm" fullWidth>فتح ملف المورد</Button>
              </Link>
            </Card>
          ))}
          {!filtered.length && <div className="col-span-full py-16 text-center text-slate-500"><AlertTriangle className="mx-auto mb-2" />لا يوجد موردون</div>}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-lg mb-4">مورد جديد — تسجيل أولي</h3>
            <form onSubmit={handleCreate} className="space-y-3">
              <Input required placeholder="الاسم القانوني" value={form.legal_name} onChange={e=>setForm({...form, legal_name: e.target.value})} />
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="كود المورد (اختياري)" value={form.supplier_code} onChange={e=>setForm({...form, supplier_code: e.target.value})} />
                <Input placeholder="الرقم الضريبي" value={form.tax_number} onChange={e=>setForm({...form, tax_number: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input placeholder="الدولة" value={form.country} onChange={e=>setForm({...form, country: e.target.value})} />
                <Input placeholder="المدينة" value={form.city} onChange={e=>setForm({...form, city: e.target.value})} />
              </div>
              <div className="flex gap-2 pt-2">
                <Button type="submit" className="flex-1">حفظ</Button>
                <Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowCreate(false)}>إلغاء</Button>
              </div>
              <p className="text-[11px] text-slate-400 text-center">سيُنشأ كمورد prospect — ثم يمر بتأهيل ووثائق وتقييم مخاطر حسب 03</p>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
