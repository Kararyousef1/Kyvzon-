import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import { Building2, CalendarDays, Loader2, Plus, RefreshCw } from 'lucide-react';
import { accountingPeriodService, currencyService, financeSetupService, fiscalYearService, legalEntityService, type AccountingPeriodRecord, type CurrencyRecord, type FiscalYearRecord, type LegalEntityRecord } from '../../../services/sdk/FinanceFoundationService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';

export default function FinanceSetupPage() {
  const { addToast } = useUIStore();
  const [entities, setEntities] = useState<LegalEntityRecord[]>([]);
  const [currencies, setCurrencies] = useState<CurrencyRecord[]>([]);
  const [entityId, setEntityId] = useState('');
  const [years, setYears] = useState<FiscalYearRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingEntity, setSavingEntity] = useState(false);
  const [savingYear, setSavingYear] = useState(false);
  const [entityForm, setEntityForm] = useState({ code: '', nameAr: '', nameEn: '', baseCurrencyCode: 'IQD', registrationNumber: '', taxNumber: '' });
  const [yearForm, setYearForm] = useState({ name: String(new Date().getFullYear()), startDate: `${new Date().getFullYear()}-01-01` });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entityRows, currencyRows] = await Promise.all([legalEntityService.findActive(), currencyService.findActive()]);
      setEntities(entityRows); setCurrencies(currencyRows);
      const selected = entityId || entityRows[0]?.id || '';
      if (!entityId && selected) setEntityId(selected);
      setYears(selected ? await fiscalYearService.findForEntity(selected) : []);
    } catch (error) { addToast(`تعذر تحميل الإعداد المالي: ${getErrorMessage(error)}`, 'error'); }
    finally { setLoading(false); }
  }, [addToast, entityId]);
  useEffect(() => { void load(); }, [load]);

  const createEntity = async (event: FormEvent) => {
    event.preventDefault(); setSavingEntity(true);
    try {
      const entity = await financeSetupService.createLegalEntity(entityForm);
      setEntityId(entity.id); setEntityForm({ code: '', nameAr: '', nameEn: '', baseCurrencyCode: 'IQD', registrationNumber: '', taxNumber: '' });
      addToast('تم إنشاء الكيان القانوني وإسناد صلاحية الإدارة لك', 'success'); await load();
    } catch (error) { addToast(`تعذر إنشاء الكيان: ${getErrorMessage(error)}`, 'error'); }
    finally { setSavingEntity(false); }
  };
  const createYear = async (event: FormEvent) => {
    event.preventDefault(); if (!entityId) return; setSavingYear(true);
    try {
      await financeSetupService.createFiscalYearWithMonthlyPeriods({ legalEntityId: entityId, name: yearForm.name, startDate: yearForm.startDate });
      addToast('تم إنشاء السنة المالية و12 فترة شهرية مفتوحة', 'success'); await load();
    } catch (error) { addToast(`تعذر إنشاء السنة المالية: ${getErrorMessage(error)}`, 'error'); }
    finally { setSavingYear(false); }
  };

  if (loading) return <div className="py-24 text-center"><Loader2 className="animate-spin mx-auto mb-3" />جارٍ تحميل الإعداد المالي…</div>;
  return <div className="p-6 md:p-8 space-y-6" dir="rtl"><div className="flex justify-between flex-wrap gap-3"><div><p className="font-bold text-indigo-700 text-sm">Finance Foundation</p><h1 className="text-3xl font-black">إعداد الكيانات والفترات</h1><p className="text-slate-500 mt-2">ابدأ بالكيان القانوني ثم أنشئ السنة والفترات قبل ترحيل أي قيد.</p></div><button onClick={() => void load()} className="px-4 py-2 rounded-xl border font-bold text-sm"><RefreshCw size={15} className="inline ml-1" />تحديث</button></div><div className="grid xl:grid-cols-2 gap-6"><form onSubmit={createEntity} className="bg-white border rounded-2xl p-6 space-y-3"><h2 className="font-black flex gap-2 items-center"><Building2 className="text-indigo-600" />كيان قانوني جديد</h2><div className="grid sm:grid-cols-2 gap-3"><Field label="رمز الكيان *"><input required value={entityForm.code} onChange={e => setEntityForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="IQ-BGD-01" /></Field><Field label="العملة الأساسية"><select value={entityForm.baseCurrencyCode} onChange={e => setEntityForm(f => ({ ...f, baseCurrencyCode: e.target.value }))}>{currencies.map(currency => <option key={currency.code} value={currency.code}>{currency.code} — {currency.name}</option>)}</select></Field></div><Field label="الاسم بالعربية *"><input required value={entityForm.nameAr} onChange={e => setEntityForm(f => ({ ...f, nameAr: e.target.value }))} /></Field><Field label="الاسم بالإنجليزية"><input value={entityForm.nameEn} onChange={e => setEntityForm(f => ({ ...f, nameEn: e.target.value }))} /></Field><div className="grid sm:grid-cols-2 gap-3"><Field label="رقم التسجيل"><input value={entityForm.registrationNumber} onChange={e => setEntityForm(f => ({ ...f, registrationNumber: e.target.value }))} /></Field><Field label="الرقم الضريبي"><input value={entityForm.taxNumber} onChange={e => setEntityForm(f => ({ ...f, taxNumber: e.target.value }))} /></Field></div><button disabled={savingEntity} className="w-full bg-indigo-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">{savingEntity ? 'جارٍ الإنشاء…' : 'إنشاء الكيان القانوني'}</button></form><section className="bg-white border rounded-2xl p-6"><h2 className="font-black mb-4">الكيانات المتاحة</h2>{entities.length ? <div className="space-y-2">{entities.map(entity => <button key={entity.id} onClick={() => setEntityId(entity.id)} className={`w-full text-right border rounded-xl p-3 ${entity.id === entityId ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200'}`}><b>{entity.code}</b><span className="mr-2">{entity.name_ar}</span><span className="mr-2 text-xs text-slate-500">{entity.base_currency_code}</span></button>)}</div> : <p className="text-slate-500">لا يوجد كيان قانوني. أنشئ الأول من النموذج.</p>}</section></div><div className="grid xl:grid-cols-2 gap-6"><form onSubmit={createYear} className="bg-white border rounded-2xl p-6 space-y-3"><h2 className="font-black flex gap-2 items-center"><CalendarDays className="text-emerald-600" />سنة مالية وفترات شهرية</h2><p className="text-sm text-slate-500">تنشئ العملية 12 فترة شهرية مفتوحة. يمكن إقفال الفترات لاحقاً عبر صلاحيات الكيان.</p><Field label="الكيان القانوني"><select value={entityId} onChange={e => setEntityId(e.target.value)} required><option value="">اختر كياناً</option>{entities.map(entity => <option value={entity.id} key={entity.id}>{entity.code} — {entity.name_ar}</option>)}</select></Field><div className="grid sm:grid-cols-2 gap-3"><Field label="اسم السنة *"><input required value={yearForm.name} onChange={e => setYearForm(f => ({ ...f, name: e.target.value }))} /></Field><Field label="تاريخ البداية *"><input required type="date" value={yearForm.startDate} onChange={e => setYearForm(f => ({ ...f, startDate: e.target.value }))} /></Field></div><button disabled={savingYear || !entityId} className="w-full bg-emerald-600 text-white rounded-xl py-3 font-bold disabled:opacity-50">{savingYear ? 'جارٍ الإنشاء…' : 'إنشاء السنة و12 فترة'}</button></form><section className="bg-white border rounded-2xl p-6"><h2 className="font-black mb-4">السنوات المالية</h2>{years.length ? <div className="space-y-2">{years.map(year => <div key={year.id} className="border rounded-xl p-3"><b>{year.name}</b><span className="mr-3 text-sm text-slate-500">{year.start_date} — {year.end_date}</span><span className="mr-3 text-xs font-bold text-emerald-700">{year.status}</span></div>)}</div> : <p className="text-slate-500">لا توجد سنة مالية للكيان المحدد.</p>}</section></div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="text-sm font-bold block space-y-1"><span>{label}</span><div className="[&>input]:w-full [&>input]:rounded-xl [&>input]:border [&>input]:p-2.5 [&>select]:w-full [&>select]:rounded-xl [&>select]:border [&>select]:p-2.5">{children}</div></label>; }
