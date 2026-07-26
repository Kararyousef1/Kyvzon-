import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, FileText, ShieldCheck, UserRound } from 'lucide-react';
import { supabase } from '../../../services/supabase/supabase';
import Button from '../../../shared/components/ui/Button';
import Input from '../../../shared/components/ui/Input';

type SupplierPortalDoc = { doc_type: string; file_name: string; file_url: string; expiry_date: string; file_base64?: string; file_mime?: string };
type SupplierPortalContact = { full_name: string; job_title: string; email: string; phone: string; is_primary: boolean };

const blankDoc = (): SupplierPortalDoc => ({ doc_type: 'commercial_register', file_name: '', file_url: '', expiry_date: '' });
const blankContact = (): SupplierPortalContact => ({ full_name: '', job_title: '', email: '', phone: '', is_primary: false });

export default function SupplierPortalPage() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [documents, setDocuments] = useState<SupplierPortalDoc[]>([blankDoc()]);
  const [contacts, setContacts] = useState<SupplierPortalContact[]>([blankContact()]);
  const [supplier, setSupplier] = useState({
    legal_name: '', trade_name: '', email: '', phone: '', registration_number: '', tax_number: '', legal_form: 'llc',
    country: '', operating_country: '', city: '', address: '', website: '', industry: '', employee_count: 0,
    annual_revenue: 0, bank_name: '', iban: '', swift_code: '', currency_code: 'SAR', payment_terms_days: 45,
    credit_limit: 0, product_list: '', max_capacity: 0, reference_customers: '', lead_time_days: 0,
    bcp_summary: '', sanctions_checked: false, conflict_checked: false,
  });
  const [answers, setAnswers] = useState({
    has_quality_system: false,
    has_information_security_policy: false,
    has_business_continuity_plan: false,
    has_conflict_of_interest: false,
    notes: '',
  });

  const completion = useMemo(() => {
    const required = [supplier.legal_name, supplier.registration_number, supplier.tax_number, supplier.country, supplier.city, supplier.bank_name, supplier.iban, supplier.product_list];
    const filled = required.filter(Boolean).length;
    return Math.round((filled / required.length) * 100);
  }, [supplier]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError('');
      try {
        const { data, error: fnError } = await supabase.functions.invoke('procurement-supplier-portal', {
          body: { action: 'verify', token },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
        const s = data?.supplier || {};
        setInviteEmail(data?.invite_email || '');
        setSupplierCode(s.supplier_code || '');
        setSupplier((prev) => ({
          ...prev,
          legal_name: s.legal_name || '', trade_name: s.trade_name || '', email: s.email || data?.invite_email || '', phone: s.phone || '',
          registration_number: s.registration_number || '', tax_number: s.tax_number || '', legal_form: s.legal_form || 'llc',
          country: s.country || '', operating_country: s.operating_country || '', city: s.city || '', address: s.address || '', website: s.website || '', industry: s.industry || '',
          employee_count: s.employee_count || 0, annual_revenue: s.annual_revenue || 0, bank_name: s.bank_name || '', iban: s.iban || '', swift_code: s.swift_code || '',
          currency_code: s.currency_code || 'SAR', payment_terms_days: s.payment_terms_days || 45, credit_limit: s.credit_limit || 0,
          product_list: Array.isArray(s.product_list) ? s.product_list.join(', ') : '', max_capacity: s.max_capacity || 0,
          reference_customers: Array.isArray(s.reference_customers) ? s.reference_customers.join(', ') : '', lead_time_days: s.lead_time_days || 0,
          bcp_summary: s.bcp_summary || '', sanctions_checked: Boolean(s.sanctions_checked), conflict_checked: Boolean(s.conflict_checked),
        }));
      } catch (e: any) {
        setError(e.message || 'تعذر فتح رابط الدعوة');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const attachFile = (index: number, file?: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setError('حجم الملف يجب أن يكون أقل من 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const arr = [...documents];
      arr[index] = {
        ...arr[index],
        file_name: arr[index].file_name || file.name,
        file_mime: file.type || 'application/octet-stream',
        file_base64: String(reader.result || ''),
        file_url: '',
      };
      setDocuments(arr);
    };
    reader.readAsDataURL(file);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const cleanDocs = documents.filter((d) => d.file_name && d.file_url);
      const cleanContacts = contacts.filter((c) => c.full_name);
      const { data, error: fnError } = await supabase.functions.invoke('procurement-supplier-portal', {
        body: { action: 'submit', token, supplier, documents: cleanDocs, contacts: cleanContacts, answers },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setDone(true);
    } catch (err: any) {
      setError(err.message || 'تعذر إرسال البيانات');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-slate-50" dir="rtl">جاري التحقق من رابط الدعوة...</div>;
  if (error && !supplier.legal_name && !inviteEmail) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 p-6" dir="rtl"><div className="bg-white border rounded-2xl p-8 max-w-md text-center"><h1 className="font-black text-xl text-red-700">رابط غير صالح</h1><p className="text-sm text-slate-500 mt-2">{error}</p></div></div>;
  }
  if (done) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 p-6" dir="rtl"><div className="bg-white border rounded-2xl p-8 max-w-lg text-center"><CheckCircle className="mx-auto text-emerald-600 mb-3" size={44}/><h1 className="font-black text-2xl">تم إرسال بياناتك للمراجعة</h1><p className="text-sm text-slate-500 mt-2">ستراجع إدارة المشتريات بياناتك ووثائقك ثم تتواصل معك عند التفعيل أو طلب استكمال معلومات.</p></div></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="bg-white border rounded-3xl p-6 shadow-sm">
          <div className="flex justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-3xl font-black">بوابة تسجيل الموردين</h1>
              <p className="text-slate-500 mt-1">أكمل بيانات شركتك وارفع وثائقك ليتم إرسال الملف إلى فريق المشتريات للمراجعة.</p>
              <p className="text-xs text-slate-400 mt-1">الدعوة: {inviteEmail || '-'} • كود المورد: {supplierCode || 'سيُحدد من النظام'}</p>
            </div>
            <div className="text-center min-w-[140px]"><div className="text-3xl font-black text-indigo-600">{completion}%</div><div className="text-xs text-slate-500">اكتمال الحقول الأساسية</div></div>
          </div>
          {error && <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">{error}</div>}
        </div>

        <form onSubmit={submit} className="space-y-5">
          <section className="bg-white border rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-xl mb-4 flex items-center gap-2"><ShieldCheck size={20}/> البيانات القانونية والتجارية</h2>
            <div className="grid md:grid-cols-3 gap-3">
              <Input required placeholder="الاسم القانوني" value={supplier.legal_name} onChange={e=>setSupplier({...supplier, legal_name:e.target.value})}/>
              <Input placeholder="الاسم التجاري" value={supplier.trade_name} onChange={e=>setSupplier({...supplier, trade_name:e.target.value})}/>
              <select value={supplier.legal_form} onChange={e=>setSupplier({...supplier, legal_form:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="corporation">مساهمة</option><option value="llc">ذ.م.م</option><option value="sole">مؤسسة فردية</option><option value="partnership">شراكة</option><option value="other">أخرى</option></select>
              <Input required placeholder="رقم السجل التجاري" value={supplier.registration_number} onChange={e=>setSupplier({...supplier, registration_number:e.target.value})}/>
              <Input required placeholder="الرقم الضريبي" value={supplier.tax_number} onChange={e=>setSupplier({...supplier, tax_number:e.target.value})}/>
              <Input placeholder="الموقع الإلكتروني" value={supplier.website} onChange={e=>setSupplier({...supplier, website:e.target.value})}/>
              <Input required placeholder="الدولة" value={supplier.country} onChange={e=>setSupplier({...supplier, country:e.target.value})}/>
              <Input placeholder="بلد التشغيل الفعلي" value={supplier.operating_country} onChange={e=>setSupplier({...supplier, operating_country:e.target.value})}/>
              <Input required placeholder="المدينة" value={supplier.city} onChange={e=>setSupplier({...supplier, city:e.target.value})}/>
            </div>
            <textarea placeholder="العنوان الكامل" value={supplier.address} onChange={e=>setSupplier({...supplier, address:e.target.value})} className="w-full border rounded-xl p-3 text-sm mt-3" />
          </section>

          <section className="bg-white border rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-xl mb-4">البيانات المالية والتشغيلية</h2>
            <div className="grid md:grid-cols-3 gap-3">
              <Input required placeholder="البنك" value={supplier.bank_name} onChange={e=>setSupplier({...supplier, bank_name:e.target.value})}/>
              <Input required placeholder="IBAN" value={supplier.iban} onChange={e=>setSupplier({...supplier, iban:e.target.value})}/>
              <Input placeholder="SWIFT" value={supplier.swift_code} onChange={e=>setSupplier({...supplier, swift_code:e.target.value})}/>
              <Input type="number" placeholder="شروط الدفع بالأيام" value={supplier.payment_terms_days} onChange={e=>setSupplier({...supplier, payment_terms_days:Number(e.target.value)})}/>
              <Input type="number" placeholder="حد الائتمان المطلوب" value={supplier.credit_limit} onChange={e=>setSupplier({...supplier, credit_limit:Number(e.target.value)})}/>
              <Input type="number" placeholder="الإيراد السنوي" value={supplier.annual_revenue} onChange={e=>setSupplier({...supplier, annual_revenue:Number(e.target.value)})}/>
              <Input placeholder="الصناعة/النشاط" value={supplier.industry} onChange={e=>setSupplier({...supplier, industry:e.target.value})}/>
              <Input type="number" placeholder="عدد الموظفين" value={supplier.employee_count} onChange={e=>setSupplier({...supplier, employee_count:Number(e.target.value)})}/>
              <Input type="number" placeholder="Lead Time القياسي" value={supplier.lead_time_days} onChange={e=>setSupplier({...supplier, lead_time_days:Number(e.target.value)})}/>
              <Input required placeholder="المنتجات/الخدمات — افصل بفواصل" value={supplier.product_list} onChange={e=>setSupplier({...supplier, product_list:e.target.value})}/>
              <Input placeholder="عملاء مرجعيون — افصل بفواصل" value={supplier.reference_customers} onChange={e=>setSupplier({...supplier, reference_customers:e.target.value})}/>
              <Input type="number" placeholder="الطاقة الإنتاجية القصوى" value={supplier.max_capacity} onChange={e=>setSupplier({...supplier, max_capacity:Number(e.target.value)})}/>
            </div>
            <textarea placeholder="ملخص خطة استمرارية الأعمال BCP" value={supplier.bcp_summary} onChange={e=>setSupplier({...supplier, bcp_summary:e.target.value})} className="w-full border rounded-xl p-3 text-sm mt-3" />
          </section>

          <section className="bg-white border rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-xl mb-4 flex items-center gap-2"><FileText size={20}/> الوثائق</h2>
            <div className="space-y-3">
              {documents.map((d, i) => (
                <div key={i} className="grid md:grid-cols-5 gap-2 p-3 bg-slate-50 rounded-2xl">
                  <select value={d.doc_type} onChange={e=>{ const arr=[...documents]; arr[i]={...d,doc_type:e.target.value}; setDocuments(arr); }} className="border rounded-xl p-2.5 text-sm">
                    <option value="commercial_register">السجل التجاري</option><option value="tax_certificate">شهادة الضريبة</option><option value="insurance">التأمين</option><option value="iso_certificate">ISO</option><option value="bank_letter">خطاب بنكي</option><option value="authorization">تفويض توقيع</option><option value="other">أخرى</option>
                  </select>
                  <Input placeholder="اسم الوثيقة" value={d.file_name} onChange={e=>{ const arr=[...documents]; arr[i]={...d,file_name:e.target.value}; setDocuments(arr); }}/>
                  <Input placeholder="رابط ملف اختياري" value={d.file_url} onChange={e=>{ const arr=[...documents]; arr[i]={...d,file_url:e.target.value, file_base64: undefined}; setDocuments(arr); }}/>
                  <Input type="date" value={d.expiry_date} onChange={e=>{ const arr=[...documents]; arr[i]={...d,expiry_date:e.target.value}; setDocuments(arr); }}/>
                  <label className="border rounded-xl p-2.5 text-sm bg-white cursor-pointer text-center">
                    {d.file_base64 ? 'تم اختيار ملف' : 'رفع ملف'}
                    <input type="file" className="hidden" onChange={e=>attachFile(i, e.target.files?.[0])} />
                  </label>
                </div>
              ))}
              <Button type="button" variant="secondary" onClick={()=>setDocuments([...documents, blankDoc()])}>+ وثيقة</Button>
              <p className="text-xs text-slate-400">يمكنك رفع ملف مباشر أو إدخال رابط ملف. الحد الأقصى للرفع المباشر 10MB.</p>
            </div>
          </section>

          <section className="bg-white border rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-xl mb-4 flex items-center gap-2"><UserRound size={20}/> جهات الاتصال</h2>
            <div className="space-y-3">
              {contacts.map((c, i) => <div key={i} className="grid md:grid-cols-5 gap-2 p-3 bg-slate-50 rounded-2xl"><Input placeholder="الاسم" value={c.full_name} onChange={e=>{ const arr=[...contacts]; arr[i]={...c,full_name:e.target.value}; setContacts(arr); }}/><Input placeholder="المنصب" value={c.job_title} onChange={e=>{ const arr=[...contacts]; arr[i]={...c,job_title:e.target.value}; setContacts(arr); }}/><Input placeholder="البريد" value={c.email} onChange={e=>{ const arr=[...contacts]; arr[i]={...c,email:e.target.value}; setContacts(arr); }}/><Input placeholder="الهاتف" value={c.phone} onChange={e=>{ const arr=[...contacts]; arr[i]={...c,phone:e.target.value}; setContacts(arr); }}/><label className="text-sm flex items-center gap-1"><input type="checkbox" checked={c.is_primary} onChange={e=>{ const arr=[...contacts]; arr[i]={...c,is_primary:e.target.checked}; setContacts(arr); }}/> أساسي</label></div>)}
              <Button type="button" variant="secondary" onClick={()=>setContacts([...contacts, blankContact()])}>+ جهة اتصال</Button>
            </div>
          </section>

          <section className="bg-white border rounded-3xl p-6 shadow-sm">
            <h2 className="font-black text-xl mb-4">أسئلة الامتثال الأولية</h2>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <label><input type="checkbox" checked={answers.has_quality_system} onChange={e=>setAnswers({...answers, has_quality_system:e.target.checked})}/> لدينا نظام جودة موثق</label>
              <label><input type="checkbox" checked={answers.has_information_security_policy} onChange={e=>setAnswers({...answers, has_information_security_policy:e.target.checked})}/> لدينا سياسة أمن معلومات</label>
              <label><input type="checkbox" checked={answers.has_business_continuity_plan} onChange={e=>setAnswers({...answers, has_business_continuity_plan:e.target.checked})}/> لدينا خطة استمرارية أعمال</label>
              <label><input type="checkbox" checked={answers.has_conflict_of_interest} onChange={e=>setAnswers({...answers, has_conflict_of_interest:e.target.checked})}/> يوجد تضارب مصالح محتمل</label>
            </div>
            <textarea placeholder="ملاحظات إضافية" value={answers.notes} onChange={e=>setAnswers({...answers, notes:e.target.value})} className="w-full border rounded-xl p-3 text-sm mt-3" />
            <div className="flex gap-3 mt-5">
              <Button type="submit" loading={saving} className="flex-1">إرسال للمراجعة</Button>
            </div>
          </section>
        </form>
      </div>
    </div>
  );
}
