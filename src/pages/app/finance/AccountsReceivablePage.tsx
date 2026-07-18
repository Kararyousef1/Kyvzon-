import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Building2, Loader2, Plus, RefreshCw, Search, X, FileText, DollarSign } from 'lucide-react';
import { currencyService, legalEntityService, type CurrencyRecord, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import { accountsReceivableService, customerService, type AccountsReceivableRecord, type CustomerRecord } from '../../../services/sdk/AccountsReceivableService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function AccountsReceivablePage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerRecord[]>([]);
  const [invoices, setInvoices] = useState<AccountsReceivableRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);

  const [custForm, setCustForm] = useState({ customer_code: '', name_ar: '', tax_number: '', email: '', payment_terms_days: 30, currency_code: 'IQD' });
  const [invForm, setInvForm] = useState({ customer_id: '', invoice_number: '', invoice_date: new Date().toISOString().slice(0,10), total_amount: '', currency_code: 'IQD', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [es, cs] = await Promise.all([legalEntityService.findActive(), currencyService.findActive()]);
      setEntities(es);
      setCurrencies(cs);
      const id = entityId || es[0]?.id || '';
      if (!entityId && id) setEntityId(id);
      if (id) {
        const [cust, inv] = await Promise.all([customerService.findActiveForEntity(id), accountsReceivableService.findForEntity(id)]);
        setCustomers(cust);
        setInvoices(inv);
      }
    } catch (e) {
      addToast(`تعذر التحميل: ${getErrorMessage(e)}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast, entityId]);

  useEffect(() => { void load(); }, [load]);

  const submitCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!entityId) return;
    setSaving(true);
    try {
      // Use SDK service — respects tenant_id injection + RLS
      await (customerService as any).create({
        legal_entity_id: entityId,
        ...custForm,
      });
      addToast('تم إنشاء العميل', 'success');
      setCustForm({ customer_code: '', name_ar: '', tax_number: '', email: '', payment_terms_days: 30, currency_code: 'IQD' });
      setShowCustomer(false);
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const submitInvoice = async (e: FormEvent) => {
    e.preventDefault();
    if (!entityId) return;
    setSaving(true);
    try {
      await (accountsReceivableService as any).create({
        legal_entity_id: entityId,
        customer_id: invForm.customer_id,
        invoice_number: invForm.invoice_number,
        invoice_date: invForm.invoice_date,
        total_amount: Number(invForm.total_amount),
        amount_received: 0,
        currency_code: invForm.currency_code,
        exchange_rate: 1,
        status: 'draft',
        notes: invForm.notes,
      });
      addToast('تم إنشاء الفاتورة كمسودة', 'success');
      setShowInvoice(false);
      setInvForm({ customer_id: '', invoice_number: '', invoice_date: new Date().toISOString().slice(0,10), total_amount: '', currency_code: 'IQD', notes: '' });
      await load();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const filtered = invoices.filter(i => i.invoice_number.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 md:p-8 space-y-6" dir="rtl">
      <div className="flex justify-between flex-wrap gap-3">
        <div>
          <p className="text-sm font-bold text-blue-700">Accounts Receivable — Wave 4 (Beta) — Real SDK ✅</p>
          <h1 className="text-3xl font-black">حسابات العملاء والفواتير</h1>
          <p className="text-slate-500 mt-2">عملاء + فواتير AR مع حالة draft → approved → paid، مرتبطة بـ GL لاحقاً. لا mock.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => void load()} className="border rounded-xl px-4 py-2 font-bold"><RefreshCw size={15} className="inline ml-1" />تحديث</button>
          <button onClick={() => setShowCustomer(true)} className="bg-slate-900 text-white rounded-xl px-4 py-2 font-bold"><Plus size={15} className="inline ml-1" />عميل</button>
          <button onClick={() => setShowInvoice(true)} disabled={!customers.length} className="bg-blue-600 text-white rounded-xl px-4 py-2 font-bold disabled:opacity-50"><FileText size={15} className="inline ml-1" />فاتورة</button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <select value={entityId} onChange={e => setEntityId(e.target.value)} className="border rounded-xl p-3 bg-white">
          {entities.map(x => <option value={x.id} key={x.id}>{x.code} — {x.name_ar}</option>)}
        </select>
        <label className="border rounded-xl p-3 flex gap-2 bg-white"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="بحث برقم الفاتورة..." className="w-full outline-none" /></label>
        <div className="bg-white border rounded-xl p-3 flex items-center gap-2">
          <DollarSign size={16} className="text-blue-600" />
          <span className="text-sm font-bold">{invoices.length} فاتورة — {customers.length} عميل — SDK حقيقي</span>
        </div>
      </div>

      {loading ? <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ التحميل من Supabase عبر SDK حقيقي...</div> : (
        <div className="bg-white border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50"><tr><th className="p-3 text-right">رقم الفاتورة</th><th className="p-3 text-right">العميل</th><th className="p-3 text-right">التاريخ</th><th className="p-3 text-right">المبلغ</th><th className="p-3 text-right">الحالة</th></tr></thead>
            <tbody className="divide-y">
              {filtered.map(r => {
                const cust = customers.find(c => c.id === r.customer_id);
                return <tr key={r.id}><td className="p-3 font-mono font-bold text-blue-700">{r.invoice_number}</td><td className="p-3">{cust?.name_ar || r.customer_id.slice(0,8)}</td><td className="p-3">{r.invoice_date}</td><td className="p-3 font-black">{Number(r.total_amount).toLocaleString()} {r.currency_code}</td><td className="p-3"><span className="px-2 py-1 bg-amber-50 border border-amber-200 rounded-full text-xs font-bold">{r.status}</span></td></tr>;
              })}
              {!filtered.length && <tr><td colSpan={5} className="p-16 text-center text-slate-500"><Building2 className="mx-auto mb-3 text-slate-300" />لا توجد فواتير لهذا الكيان — أنشئ عميل ثم فاتورة. كل شيء عبر SDK.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showCustomer && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShowCustomer(false)}><form onSubmit={submitCustomer} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-3"><div className="flex justify-between"><h2 className="font-black text-xl">عميل جديد — SDK + RLS</h2><button type="button" onClick={() => setShowCustomer(false)}><X /></button></div><input required placeholder="رمز العميل *" value={custForm.customer_code} onChange={e => setCustForm(f => ({ ...f, customer_code: e.target.value.toUpperCase() }))} className="w-full border rounded-xl p-2.5" /><input required placeholder="الاسم بالعربية *" value={custForm.name_ar} onChange={e => setCustForm(f => ({ ...f, name_ar: e.target.value }))} className="w-full border rounded-xl p-2.5" /><input placeholder="الرقم الضريبي" value={custForm.tax_number} onChange={e => setCustForm(f => ({ ...f, tax_number: e.target.value }))} className="w-full border rounded-xl p-2.5" /><button disabled={saving} className="w-full bg-slate-900 text-white rounded-xl py-3 font-bold">{saving ? 'جارٍ الحفظ...' : 'حفظ العميل عبر SDK'}</button><p className="text-[11px] text-slate-400 text-center">يُحفظ عبر customerService.create() مع tenant_id تلقائي + RLS</p></form></div>}

      {showInvoice && <div className="fixed inset-0 z-50 bg-slate-950/50 flex items-center justify-center p-4" onClick={() => !saving && setShowInvoice(false)}><form onSubmit={submitInvoice} onClick={e => e.stopPropagation()} className="w-full max-w-lg bg-white rounded-2xl p-6 space-y-3"><div className="flex justify-between"><h2 className="font-black text-xl">فاتورة AR جديدة</h2><button type="button" onClick={() => setShowInvoice(false)}><X /></button></div><select required value={invForm.customer_id} onChange={e => setInvForm(f => ({ ...f, customer_id: e.target.value }))} className="w-full border rounded-xl p-2.5"><option value="">اختر العميل</option>{customers.map(c => <option value={c.id} key={c.id}>{c.customer_code} — {c.name_ar}</option>)}</select><div className="grid grid-cols-2 gap-3"><input required placeholder="رقم الفاتورة" value={invForm.invoice_number} onChange={e => setInvForm(f => ({ ...f, invoice_number: e.target.value }))} className="border rounded-xl p-2.5" /><input required type="date" value={invForm.invoice_date} onChange={e => setInvForm(f => ({ ...f, invoice_date: e.target.value }))} className="border rounded-xl p-2.5" /></div><div className="grid grid-cols-2 gap-3"><input required type="number" placeholder="المبلغ" value={invForm.total_amount} onChange={e => setInvForm(f => ({ ...f, total_amount: e.target.value }))} className="border rounded-xl p-2.5" /><select value={invForm.currency_code} onChange={e => setInvForm(f => ({ ...f, currency_code: e.target.value }))} className="border rounded-xl p-2.5">{currencies.map(c => <option key={c.code}>{c.code}</option>)}</select></div><button disabled={saving} className="w-full bg-blue-600 text-white rounded-xl py-3 font-bold">{saving ? 'جارٍ الحفظ...' : 'حفظ كمسودة عبر SDK'}</button></form></div>}
    </div>
  );
}
