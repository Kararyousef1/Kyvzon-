import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Building2, FileText, Shield, UserRound, ClipboardCheck, History, MapPin } from 'lucide-react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';
import {
  supplierAuditLogService,
  supplierContactService,
  supplierDocumentService,
  supplierRiskAssessmentService,
  supplierService,
  supplierSiteVisitService,
  type SupplierAuditLogRecord,
  type SupplierContactRecord,
  type SupplierDocumentRecord,
  type SupplierRecord,
  type SupplierRiskAssessmentRecord,
  type SupplierSiteVisitRecord,
} from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

type TabKey = 'overview' | 'documents' | 'contacts' | 'risk' | 'visits' | 'kraljic' | 'audit';

const riskColor: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  critical: 'bg-red-100 text-red-700',
};

const statusColor: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  under_review: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-slate-200 text-slate-700',
};

function daysLeft(date?: string | null): number | null {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const { addToast } = useUIStore();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [supplier, setSupplier] = useState<SupplierRecord | null>(null);
  const [documents, setDocuments] = useState<SupplierDocumentRecord[]>([]);
  const [contacts, setContacts] = useState<SupplierContactRecord[]>([]);
  const [risks, setRisks] = useState<SupplierRiskAssessmentRecord[]>([]);
  const [visits, setVisits] = useState<SupplierSiteVisitRecord[]>([]);
  const [audit, setAudit] = useState<SupplierAuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [overview, setOverview] = useState({
    legal_name: '', trade_name: '', email: '', phone: '', tax_number: '', registration_number: '', legal_form: '',
    country: '', operating_country: '', city: '', address: '', website: '', industry: '', bank_name: '', iban: '', swift_code: '',
    currency_code: 'SAR', payment_terms_days: 45, credit_limit: 0, employee_count: 0, annual_revenue: 0, max_capacity: 0, lead_time_days: 0,
    credit_rating: '', bcp_summary: '', sanctions_checked: false, conflict_checked: false,
  });
  const [docForm, setDocForm] = useState({ doc_type: 'commercial_register', file_name: '', file_url: '', expiry_date: '' });
  const [contactForm, setContactForm] = useState({ full_name: '', job_title: '', email: '', phone: '', is_primary: false });
  const [riskForm, setRiskForm] = useState({ financial_score: 0, compliance_score: 0, operational_score: 0, quality_score: 0, security_score: 0, notes: '' });
  const [visitForm, setVisitForm] = useState({ visit_date: '', strengths: '', weaknesses: '', conditions: '', recommendation: 'approved' });

  const load = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [s, docs, cons, riskRows, visitRows, auditRows] = await Promise.all([
        supplierService.findById(id),
        supplierDocumentService.findBySupplier(id).catch(() => []),
        supplierContactService.findBySupplier(id).catch(() => []),
        supplierRiskAssessmentService.findBySupplier(id).catch(() => []),
        supplierSiteVisitService.findBySupplier(id).catch(() => []),
        supplierAuditLogService.findBySupplier(id).catch(() => []),
      ]);
      setSupplier(s);
      setDocuments(docs);
      setContacts(cons);
      setRisks(riskRows);
      setVisits(visitRows);
      setAudit(auditRows);
      if (s) {
        setOverview({
          legal_name: s.legal_name || '', trade_name: s.trade_name || '', email: s.email || '', phone: s.phone || '', tax_number: s.tax_number || '', registration_number: s.registration_number || '', legal_form: s.legal_form || '',
          country: s.country || '', operating_country: s.operating_country || '', city: s.city || '', address: s.address || '', website: s.website || '', industry: s.industry || '', bank_name: s.bank_name || '', iban: s.iban || '', swift_code: s.swift_code || '',
          currency_code: s.currency_code || 'SAR', payment_terms_days: s.payment_terms_days || 45, credit_limit: s.credit_limit || 0, employee_count: s.employee_count || 0, annual_revenue: s.annual_revenue || 0, max_capacity: s.max_capacity || 0, lead_time_days: s.lead_time_days || 0,
          credit_rating: s.credit_rating || '', bcp_summary: s.bcp_summary || '', sanctions_checked: Boolean(s.sanctions_checked), conflict_checked: Boolean(s.conflict_checked),
        });
      }
    } catch (e: any) {
      addToast('فشل تحميل المورد: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const latestRisk = risks[0];
  const riskTotal = useMemo(() => ['financial_score','compliance_score','operational_score','quality_score','security_score'].reduce((s, key) => s + Number((riskForm as any)[key] || 0), 0), [riskForm]);
  const expiringDocs = documents.filter(d => {
    const left = daysLeft(d.expiry_date);
    return left !== null && left <= 90;
  });

  const saveOverview = async () => {
    if (!supplier) return;
    setSaving(true);
    try {
      const updated = await supplierService.update(supplier.id, {
        ...overview,
        payment_terms_days: Number(overview.payment_terms_days), credit_limit: Number(overview.credit_limit), employee_count: Number(overview.employee_count),
        annual_revenue: Number(overview.annual_revenue), max_capacity: Number(overview.max_capacity), lead_time_days: Number(overview.lead_time_days),
      } as any);
      setSupplier(updated);
      addToast('تم حفظ بيانات المورد', 'success');
      await load();
    } catch (e: any) { addToast(e.message, 'error'); } finally { setSaving(false); }
  };

  const addDocument = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supplier) return;
    try {
      await supplierDocumentService.create({ supplier_id: supplier.id, ...docForm, expiry_date: docForm.expiry_date || null } as any);
      setDocForm({ doc_type: 'commercial_register', file_name: '', file_url: '', expiry_date: '' });
      addToast('تمت إضافة الوثيقة', 'success'); await load();
    } catch (err: any) { addToast(err.message, 'error'); }
  };

  const addContact = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supplier) return;
    try {
      await supplierContactService.create({ supplier_id: supplier.id, ...contactForm } as any);
      setContactForm({ full_name: '', job_title: '', email: '', phone: '', is_primary: false });
      addToast('تمت إضافة جهة الاتصال', 'success'); await load();
    } catch (err: any) { addToast(err.message, 'error'); }
  };

  const addRisk = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supplier) return;
    try {
      await supplierRiskAssessmentService.create({ supplier_id: supplier.id, ...riskForm } as any);
      await supplierRiskAssessmentService.syncToSupplier(supplier.id).catch(() => undefined);
      setRiskForm({ financial_score: 0, compliance_score: 0, operational_score: 0, quality_score: 0, security_score: 0, notes: '' });
      addToast('تم حفظ تقييم المخاطر ومزامنته', 'success'); await load();
    } catch (err: any) { addToast(err.message, 'error'); }
  };

  const addVisit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supplier) return;
    try {
      await supplierSiteVisitService.create({ supplier_id: supplier.id, ...visitForm, agenda: [] } as any);
      setVisitForm({ visit_date: '', strengths: '', weaknesses: '', conditions: '', recommendation: 'approved' });
      addToast('تم حفظ الزيارة الميدانية', 'success'); await load();
    } catch (err: any) { addToast(err.message, 'error'); }
  };

  const calculateKraljic = async () => {
    if (!supplier) return;
    try {
      const category = await supplierService.calculateKraljic(supplier.id);
      addToast('تم تحديث تصنيف كراليتش: ' + category, 'success');
      await load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  const decide = async (decision: 'approve' | 'reject' | 'suspend' | 'reactivate' | 'under_review') => {
    if (!supplier) return;
    try {
      await supplierService.decideQualification(supplier.id, decision, `قرار من صفحة المورد: ${decision}`);
      addToast('تم تحديث حالة التأهيل', 'success');
      await load();
    } catch (e: any) { addToast(e.message, 'error'); }
  };

  if (loading) return <div className="p-10 text-center">جاري تحميل المورد...</div>;
  if (!supplier) return <Card className="max-w-2xl mx-auto text-center py-12"><h2 className="font-black text-xl">المورد غير موجود</h2></Card>;

  const tabs: Array<{ key: TabKey; label: string; icon: any }> = [
    { key: 'overview', label: 'المعلومات', icon: Building2 },
    { key: 'documents', label: 'الوثائق', icon: FileText },
    { key: 'contacts', label: 'الاتصالات', icon: UserRound },
    { key: 'risk', label: 'المخاطر', icon: Shield },
    { key: 'visits', label: 'الزيارات', icon: MapPin },
    { key: 'kraljic', label: 'Kraljic', icon: ClipboardCheck },
    { key: 'audit', label: 'التدقيق', icon: History },
  ];

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div>
          <Link to="/app/procurement/suppliers" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600 mb-2"><ArrowRight size={14}/> العودة للموردين</Link>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-3xl font-black">{supplier.legal_name}</h1>
            <span className={`text-xs px-3 py-1 rounded-full font-bold ${statusColor[supplier.status] || 'bg-slate-100'}`}>{supplier.status}</span>
            {supplier.risk_level && <span className={`text-xs px-3 py-1 rounded-full ${riskColor[supplier.risk_level]}`}>{supplier.risk_level} {supplier.risk_score ?? ''}</span>}
            {supplier.kraljic_category && <span className="text-xs px-3 py-1 rounded-full bg-purple-100 text-purple-700">{supplier.kraljic_category}</span>}
          </div>
          <p className="text-slate-500 mt-1 font-mono">{supplier.supplier_code} • {supplier.country || '-'} {supplier.city || ''}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="secondary" onClick={() => decide('under_review')}>إرسال للمراجعة</Button>
          <Button size="sm" className="bg-emerald-600" onClick={() => decide('approve')}>اعتماد</Button>
          <Button size="sm" variant="secondary" className="!bg-red-50 !text-red-700" onClick={() => decide('reject')}>رفض</Button>
          <Button size="sm" variant="secondary" onClick={() => decide('suspend')}>تجميد</Button>
        </div>
      </div>

      {expiringDocs.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="font-bold text-amber-800">تنبيهات امتثال: {expiringDocs.length} وثائق منتهية أو ستنتهي خلال 90 يوم</div>
          <div className="text-xs text-amber-700 mt-1">حسب التوثيق: 90/30/0 يوم مع تجميد المورد عند انتهاء الوثائق الحرجة.</div>
        </Card>
      )}

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(t => {
          const Icon = t.icon;
          return <button key={t.key} onClick={() => setActiveTab(t.key)} className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap flex items-center gap-2 ${activeTab===t.key?'bg-indigo-600 text-white':'bg-white border text-slate-600'}`}><Icon size={15}/>{t.label}</button>;
        })}
      </div>

      {activeTab === 'overview' && (
        <Card>
          <h3 className="font-bold mb-4">البيانات القانونية والمالية والتشغيلية</h3>
          <div className="grid md:grid-cols-3 gap-3">
            <Input placeholder="الاسم القانوني" value={overview.legal_name} onChange={e=>setOverview({...overview, legal_name:e.target.value})}/>
            <Input placeholder="الاسم التجاري" value={overview.trade_name} onChange={e=>setOverview({...overview, trade_name:e.target.value})}/>
            <Input placeholder="البريد" value={overview.email} onChange={e=>setOverview({...overview, email:e.target.value})}/>
            <Input placeholder="الهاتف" value={overview.phone} onChange={e=>setOverview({...overview, phone:e.target.value})}/>
            <Input placeholder="السجل التجاري" value={overview.registration_number} onChange={e=>setOverview({...overview, registration_number:e.target.value})}/>
            <Input placeholder="الرقم الضريبي" value={overview.tax_number} onChange={e=>setOverview({...overview, tax_number:e.target.value})}/>
            <Input placeholder="الدولة" value={overview.country} onChange={e=>setOverview({...overview, country:e.target.value})}/>
            <Input placeholder="بلد التشغيل" value={overview.operating_country} onChange={e=>setOverview({...overview, operating_country:e.target.value})}/>
            <Input placeholder="المدينة" value={overview.city} onChange={e=>setOverview({...overview, city:e.target.value})}/>
            <Input placeholder="البنك" value={overview.bank_name} onChange={e=>setOverview({...overview, bank_name:e.target.value})}/>
            <Input placeholder="IBAN" value={overview.iban} onChange={e=>setOverview({...overview, iban:e.target.value})}/>
            <Input placeholder="SWIFT" value={overview.swift_code} onChange={e=>setOverview({...overview, swift_code:e.target.value})}/>
            <Input type="number" placeholder="شروط الدفع بالأيام" value={overview.payment_terms_days} onChange={e=>setOverview({...overview, payment_terms_days:Number(e.target.value)})}/>
            <Input type="number" placeholder="حد الائتمان" value={overview.credit_limit} onChange={e=>setOverview({...overview, credit_limit:Number(e.target.value)})}/>
            <Input placeholder="التصنيف الائتماني" value={overview.credit_rating} onChange={e=>setOverview({...overview, credit_rating:e.target.value})}/>
            <Input type="number" placeholder="عدد الموظفين" value={overview.employee_count} onChange={e=>setOverview({...overview, employee_count:Number(e.target.value)})}/>
            <Input type="number" placeholder="الطاقة القصوى" value={overview.max_capacity} onChange={e=>setOverview({...overview, max_capacity:Number(e.target.value)})}/>
            <Input type="number" placeholder="Lead Time أيام" value={overview.lead_time_days} onChange={e=>setOverview({...overview, lead_time_days:Number(e.target.value)})}/>
          </div>
          <textarea placeholder="العنوان" value={overview.address} onChange={e=>setOverview({...overview, address:e.target.value})} className="w-full border rounded-xl p-3 text-sm mt-3" />
          <textarea placeholder="ملخص خطة استمرارية الأعمال BCP" value={overview.bcp_summary} onChange={e=>setOverview({...overview, bcp_summary:e.target.value})} className="w-full border rounded-xl p-3 text-sm mt-3" />
          <div className="flex gap-4 mt-3 text-sm">
            <label><input type="checkbox" checked={overview.sanctions_checked} onChange={e=>setOverview({...overview, sanctions_checked:e.target.checked})}/> فحص العقوبات</label>
            <label><input type="checkbox" checked={overview.conflict_checked} onChange={e=>setOverview({...overview, conflict_checked:e.target.checked})}/> فحص تضارب المصالح</label>
          </div>
          <Button loading={saving} className="mt-4" onClick={saveOverview}>حفظ البيانات</Button>
        </Card>
      )}

      {activeTab === 'documents' && (
        <div className="grid lg:grid-cols-3 gap-5">
          <Card className="lg:col-span-2"><h3 className="font-bold mb-3">إدارة الوثائق وتجديدها</h3><div className="space-y-2">{documents.map(d => { const left=daysLeft(d.expiry_date); return <div key={d.id} className="p-3 border rounded-xl flex justify-between text-sm"><div><div className="font-bold">{d.file_name}</div><div className="text-xs text-slate-500">{d.doc_type} • {d.expiry_date || 'بدون انتهاء'}</div></div><span className={`text-xs px-2 py-1 rounded-full ${left!==null && left<0?'bg-red-100 text-red-700':left!==null&&left<=30?'bg-amber-100 text-amber-700':'bg-slate-100'}`}>{d.verification_status}{left!==null?` • ${left} يوم`:''}</span></div>; })}{!documents.length && <div className="py-10 text-center text-slate-400">لا وثائق</div>}</div></Card>
          <Card><h3 className="font-bold mb-3">وثيقة جديدة</h3><form onSubmit={addDocument} className="space-y-2"><select value={docForm.doc_type} onChange={e=>setDocForm({...docForm, doc_type:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"><option value="commercial_register">سجل تجاري</option><option value="tax_certificate">ضريبة</option><option value="iso_certificate">ISO</option><option value="insurance">تأمين</option><option value="bank_letter">خطاب بنكي</option><option value="authorization">تفويض</option><option value="other">أخرى</option></select><Input required placeholder="اسم الملف" value={docForm.file_name} onChange={e=>setDocForm({...docForm,file_name:e.target.value})}/><Input required placeholder="رابط الملف" value={docForm.file_url} onChange={e=>setDocForm({...docForm,file_url:e.target.value})}/><Input type="date" value={docForm.expiry_date} onChange={e=>setDocForm({...docForm,expiry_date:e.target.value})}/><Button type="submit" fullWidth>إضافة</Button></form></Card>
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="grid lg:grid-cols-3 gap-5"><Card className="lg:col-span-2"><h3 className="font-bold mb-3">جهات الاتصال والمفوضون</h3><div className="grid md:grid-cols-2 gap-3">{contacts.map(c=><div key={c.id} className="p-3 border rounded-xl"><div className="font-bold">{c.full_name} {c.is_primary?'⭐':''}</div><div className="text-xs text-slate-500">{c.job_title || '-'} • {c.email || '-'} • {c.phone || '-'}</div></div>)}{!contacts.length && <div className="py-10 text-center text-slate-400">لا جهات اتصال</div>}</div></Card><Card><h3 className="font-bold mb-3">إضافة جهة اتصال</h3><form onSubmit={addContact} className="space-y-2"><Input required placeholder="الاسم" value={contactForm.full_name} onChange={e=>setContactForm({...contactForm,full_name:e.target.value})}/><Input placeholder="المنصب" value={contactForm.job_title} onChange={e=>setContactForm({...contactForm,job_title:e.target.value})}/><Input placeholder="البريد" value={contactForm.email} onChange={e=>setContactForm({...contactForm,email:e.target.value})}/><Input placeholder="الهاتف" value={contactForm.phone} onChange={e=>setContactForm({...contactForm,phone:e.target.value})}/><label className="text-sm"><input type="checkbox" checked={contactForm.is_primary} onChange={e=>setContactForm({...contactForm,is_primary:e.target.checked})}/> أساسي</label><Button type="submit" fullWidth>إضافة</Button></form></Card></div>
      )}

      {activeTab === 'risk' && (
        <div className="grid lg:grid-cols-3 gap-5"><Card className="lg:col-span-2"><h3 className="font-bold mb-3">آلة تقييم المخاطر — 5 أبعاد</h3><div className="space-y-2">{risks.map(r=><div key={r.id} className="p-3 border rounded-xl"><div className="flex justify-between"><b>المجموع {r.total_score}/100</b><span className={`text-xs px-2 py-1 rounded-full ${riskColor[r.risk_level]}`}>{r.risk_level}</span></div><div className="text-xs text-slate-500 mt-1">مالي {r.financial_score} • امتثال {r.compliance_score} • تشغيلي {r.operational_score} • جودة {r.quality_score} • أمن {r.security_score}</div>{r.notes && <div className="text-xs mt-1">{r.notes}</div>}</div>)}{!risks.length && <div className="py-10 text-center text-slate-400">لا تقييمات مخاطر</div>}</div></Card><Card><h3 className="font-bold mb-3">تقييم جديد — المجموع {riskTotal}/100</h3><form onSubmit={addRisk} className="space-y-2">{(['financial_score','compliance_score','operational_score','quality_score','security_score'] as const).map(k=><Input key={k} type="number" min={0} max={20} placeholder={k} value={riskForm[k]} onChange={e=>setRiskForm({...riskForm,[k]:Number(e.target.value)})}/>)}<textarea placeholder="ملاحظات" value={riskForm.notes} onChange={e=>setRiskForm({...riskForm,notes:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"/><Button type="submit" fullWidth>حفظ وتحديث المورد</Button></form></Card></div>
      )}

      {activeTab === 'visits' && (
        <div className="grid lg:grid-cols-3 gap-5"><Card className="lg:col-span-2"><h3 className="font-bold mb-3">الزيارات الميدانية والتدقيق</h3><div className="space-y-2">{visits.map(v=><div key={v.id} className="p-3 border rounded-xl text-sm"><div className="flex justify-between"><b>{new Date(v.visit_date).toLocaleDateString('ar-SA')}</b><span>{v.recommendation || '-'}</span></div><div className="text-xs text-slate-500 mt-1">قوة: {v.strengths || '-'} • ضعف: {v.weaknesses || '-'}</div>{v.conditions && <div className="text-xs mt-1">شروط: {v.conditions}</div>}</div>)}{!visits.length && <div className="py-10 text-center text-slate-400">لا زيارات</div>}</div></Card><Card><h3 className="font-bold mb-3">زيارة جديدة</h3><form onSubmit={addVisit} className="space-y-2"><Input required type="date" value={visitForm.visit_date} onChange={e=>setVisitForm({...visitForm,visit_date:e.target.value})}/><textarea placeholder="نقاط القوة" value={visitForm.strengths} onChange={e=>setVisitForm({...visitForm,strengths:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"/><textarea placeholder="نقاط الضعف" value={visitForm.weaknesses} onChange={e=>setVisitForm({...visitForm,weaknesses:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"/><textarea placeholder="شروط الموافقة" value={visitForm.conditions} onChange={e=>setVisitForm({...visitForm,conditions:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"/><select value={visitForm.recommendation} onChange={e=>setVisitForm({...visitForm,recommendation:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"><option value="approved">موافقة</option><option value="conditional">مشروطة</option><option value="rejected">رفض</option></select><Button type="submit" fullWidth>حفظ</Button></form></Card></div>
      )}

      {activeTab === 'kraljic' && (
        <Card><h3 className="font-bold mb-3">مصفوفة كراليتش والتوصية الاستراتيجية</h3><div className="grid md:grid-cols-2 gap-4"><div className="p-4 border rounded-xl"><div className="text-sm text-slate-500">التصنيف الحالي</div><div className="text-3xl font-black mt-2">{supplier.kraljic_category || 'غير محسوب'}</div><Button className="mt-4" onClick={calculateKraljic}>حساب التصنيف</Button></div><div className="p-4 bg-slate-50 rounded-xl text-sm leading-relaxed"><b>التوصيات:</b><br/>Strategic: شراكة طويلة ولقاءات ربعية. Leverage: منافسة ومفاوضة سعر. Bottleneck: مخزون أمان ومورد بديل. Routine: أتمتة وتقليل وقت إداري.</div></div></Card>
      )}

      {activeTab === 'audit' && (
        <Card><h3 className="font-bold mb-3">سجل التدقيق</h3><div className="space-y-2">{audit.map(a=><div key={a.id} className="p-3 border rounded-xl text-sm"><div className="flex justify-between"><b>{a.action}</b><span className="text-xs text-slate-500">{new Date(a.created_at).toLocaleString('ar-SA')}</span></div><div className="text-xs text-slate-500">{a.entity_table} • {a.comments || ''}</div></div>)}{!audit.length && <div className="py-10 text-center text-slate-400">لا توجد أحداث تدقيق بعد</div>}</div></Card>
      )}
    </div>
  );
}
