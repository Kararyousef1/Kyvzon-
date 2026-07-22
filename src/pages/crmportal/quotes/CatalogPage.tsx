/**
 * CatalogPage — كتالوج المنتجات (باقات + إضافات + خدمات) + إنشاء + تهيئة افتراضية.
 */
import { useMemo, useState } from 'react';
import { Plus, X, Package, Sparkles } from 'lucide-react';
import {
  crmProductService,
  type CrmProductInput, type ProductType, type BillingCycle,
  PRODUCT_TYPE_LABEL, BILLING_CYCLE_LABEL,
} from '../../../services/sdk';
import { useProducts } from './useQuotes';

const EMPTY: CrmProductInput = { name: '', product_type: 'package', unit_price: 0, billing_cycle: 'monthly' };
const TYPE_COLOR: Record<ProductType, string> = {
  package: 'bg-cyan-50 text-cyan-600 border-cyan-200',
  addon: 'bg-violet-50 text-violet-600 border-violet-200',
  service: 'bg-amber-50 text-amber-600 border-amber-200',
};

export default function CatalogPage() {
  const { data: products, loading, reload } = useProducts();
  const [show, setShow] = useState(false);
  const [form, setForm] = useState<CrmProductInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const grouped = useMemo(() => ({
    package: products.filter((p) => p.product_type === 'package'),
    addon: products.filter((p) => p.product_type === 'addon'),
    service: products.filter((p) => p.product_type === 'service'),
  }), [products]);

  const save = async () => {
    if (!form.name.trim()) { setErr('اسم المنتج مطلوب'); return; }
    setBusy(true); setErr(null);
    try { await crmProductService.createProduct(form); setShow(false); setForm(EMPTY); reload(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر الحفظ'); } finally { setBusy(false); }
  };
  const seed = async () => { setSeeding(true); try { await crmProductService.seedDefault(); reload(); } catch { /* noop */ } finally { setSeeding(false); } };

  const Group = ({ title, type }: { title: string; type: ProductType }) => (
    <div>
      <h3 className="text-sm font-bold text-slate-700 mb-2">{title} ({grouped[type].length})</h3>
      {grouped[type].length === 0 ? <p className="text-slate-300 text-xs pb-2">—</p>
        : <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {grouped[type].map((p) => (
            <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${TYPE_COLOR[p.product_type]}`}>{PRODUCT_TYPE_LABEL[p.product_type]}</span>
                {p.sku && <span className="text-[10px] text-slate-300 font-mono">{p.sku}</span>}
              </div>
              <h4 className="font-black text-slate-800 mt-2">{p.name}</h4>
              <p className="text-lg font-black text-cyan-700 mt-1">{Number(p.unit_price).toLocaleString('ar')} <span className="text-[11px] font-normal text-slate-400">{p.currency} / {p.unit_label || BILLING_CYCLE_LABEL[p.billing_cycle]}</span></p>
            </div>
          ))}
        </div>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-slate-500">كتالوج مركزي للباقات والإضافات والخدمات — تُبنى منه بنود العروض تلقائياً.</p>
        <div className="flex gap-2">
          <button onClick={seed} disabled={seeding} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 text-sm px-4 py-2 rounded-xl hover:bg-slate-200 disabled:opacity-60"><Sparkles size={15} /> {seeding ? 'جارٍ…' : 'كتالوج افتراضي'}</button>
          <button onClick={() => setShow(true)} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700"><Plus size={16} /> منتج جديد</button>
        </div>
      </div>

      {loading ? <p className="text-slate-400 text-sm text-center py-10">جارٍ التحميل…</p>
        : products.length === 0 ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center"><Package size={32} className="mx-auto text-slate-300" /><p className="text-slate-500 mt-3 font-semibold">الكتالوج فارغ</p><p className="text-slate-400 text-sm mt-1">ابدأ بتهيئة الكتالوج الافتراضي (باقات + إضافات + خدمات).</p></div>
          : <div className="space-y-5"><Group title="الباقات" type="package" /><Group title="الإضافات" type="addon" /><Group title="الخدمات" type="service" /></div>}

      {show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShow(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">منتج جديد</h3><button onClick={() => setShow(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">الاسم *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">النوع</label><select value={form.product_type} onChange={(e) => setForm({ ...form, product_type: e.target.value as ProductType })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(PRODUCT_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-slate-500">السعر</label><input type="number" value={form.unit_price ?? 0} onChange={(e) => setForm({ ...form, unit_price: Number(e.target.value) })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="text-xs text-slate-500">دورة الفوترة</label><select value={form.billing_cycle} onChange={(e) => setForm({ ...form, billing_cycle: e.target.value as BillingCycle })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none">{Object.entries(BILLING_CYCLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="text-xs text-slate-500">وحدة القياس</label><input value={form.unit_label || ''} onChange={(e) => setForm({ ...form, unit_label: e.target.value })} placeholder="موظف / جهاز" className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
              <div><label className="text-xs text-slate-500">SKU</label><input value={form.sku || ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
              {err && <p className="text-xs text-rose-600">{err}</p>}
            </div>
            <div className="flex gap-2 mt-5"><button onClick={save} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'حفظ'}</button><button onClick={() => setShow(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
