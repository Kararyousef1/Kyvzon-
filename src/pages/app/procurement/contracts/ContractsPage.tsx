import { useEffect, useState } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import Input from '../../../../shared/components/ui/Input';
import { contractApprovalStepService, contractAuditLogService, contractTemplateService, procurementContractService, supplierService, type ContractApprovalStepRecord, type ContractAuditLogRecord, type ContractRenewalRecord, type ProcurementContractRecord, type SupplierRecord } from '../../../../services/sdk';
import { useUIStore } from '../../../../core/stores';

type RenewalDecision = 'renew_same' | 'renegotiate' | 'expand' | 'reduce' | 'terminate' | 'rfq_new';
type ContractTemplateOption = { id: string; name: string; type?: string | null };

export default function ContractsPage() {
  const { addToast } = useUIStore();
  const [contracts, setContracts] = useState<ProcurementContractRecord[]>([]);
  const [renewals, setRenewals] = useState<ContractRenewalRecord[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>([]);
  const [templates, setTemplates] = useState<ContractTemplateOption[]>([]);
  const [stepTarget, setStepTarget] = useState<{ step: ContractApprovalStepRecord; decision: 'approved'|'rejected' } | null>(null);
  const [stepComments, setStepComments] = useState('');
  const [signContract, setSignContract] = useState<ProcurementContractRecord | null>(null);
  const [signEmail, setSignEmail] = useState('');
  const [renewalContract, setRenewalContract] = useState<ProcurementContractRecord | null>(null);
  const [renewalForm, setRenewalForm] = useState<{ decision: RenewalDecision; notes: string }>({ decision: 'renegotiate', notes: '' });
  const [terminateContract, setTerminateContract] = useState<ProcurementContractRecord | null>(null);
  const [terminateReason, setTerminateReason] = useState('');
  const [steps, setSteps] = useState<ContractApprovalStepRecord[]>([]);
  const [audit, setAudit] = useState<ContractAuditLogRecord[]>([]);
  const [selected, setSelected] = useState<ProcurementContractRecord | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', type: 'MSA', title: '', total_value: 0, currency_code: 'SAR', start_date: '', end_date: '', template_id: '', description: '' });

  const load = async () => {
    try {
      const [data, ren, sups, tpl] = await Promise.all([
        procurementContractService.findAll({ orderBy: 'end_date', ascending: true, limit: 100 }),
        procurementContractService.findRenewalsUpcoming(20),
        supplierService.findApproved().catch(() => []),
        contractTemplateService.findAll({ limit: 100 }).catch(() => []),
      ]);
      setContracts(data); setRenewals(ren); setSuppliers(sups); setTemplates(tpl);
    } catch(e:any){ addToast(e.message,'error'); }
  };
  useEffect(()=>{ load(); }, []);

  const selectContract = async (c: ProcurementContractRecord) => {
    setSelected(c);
    setSteps(await contractApprovalStepService.findByContract(c.id).catch(()=>[]));
    setAudit(await contractAuditLogService.findByContract(c.id).catch(()=>[]));
  };

  const createContract = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const id = await procurementContractService.createFull(form);
      addToast(`تم إنشاء العقد ${id.slice(0,8)}`, 'success');
      setShowCreate(false); setForm({ supplier_id: '', type: 'MSA', title: '', total_value: 0, currency_code: 'SAR', start_date: '', end_date: '', template_id: '', description: '' }); await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };

  const requestApproval = async (c: ProcurementContractRecord) => { try { await procurementContractService.requestApproval(c.id); addToast('تم إرسال العقد للموافقات', 'success'); await load(); await selectContract(c); } catch(e:any){ addToast(e.message,'error'); } };
  const openStepDialog = (s: ContractApprovalStepRecord, decision: 'approved'|'rejected') => { setStepComments(''); setStepTarget({ step: s, decision }); };
  const submitStep = async () => {
    if (!stepTarget) return;
    if (stepTarget.decision === 'rejected' && !stepComments.trim()) { addToast('تعليق الرفض مطلوب', 'error'); return; }
    try {
      await contractApprovalStepService.decide(stepTarget.step.id, stepTarget.decision, stepComments.trim());
      addToast('تم تسجيل القرار', 'success');
      setStepTarget(null);
      if (selected) await selectContract(selected);
      await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };
  const openSignDialog = (c: ProcurementContractRecord) => { setSignEmail(''); setSignContract(c); };
  const submitSign = async () => {
    if (!signContract) return;
    const email = signEmail.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { addToast('بريد إلكتروني غير صالح', 'error'); return; }
    try {
      await procurementContractService.requestSignature(signContract.id, [{ email, role: 'supplier', order: 1 }]);
      addToast('تم إنشاء طلب التوقيع', 'success');
      setSignContract(null);
      await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };
  const openRenewalDialog = (c: ProcurementContractRecord) => { setRenewalForm({ decision: 'renegotiate', notes: '' }); setRenewalContract(c); };
  const submitRenewal = async () => {
    if (!renewalContract) return;
    if (!renewalForm.notes.trim()) { addToast('ملاحظات قرار التجديد مطلوبة', 'error'); return; }
    try {
      await procurementContractService.decideRenewal(renewalContract.id, renewalForm.decision, renewalForm.notes.trim());
      addToast('تم حفظ قرار التجديد', 'success');
      setRenewalContract(null);
      await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };
  const openTerminateDialog = (c: ProcurementContractRecord) => { setTerminateReason(''); setTerminateContract(c); };
  const submitTerminate = async () => {
    if (!terminateContract) return;
    if (!terminateReason.trim()) { addToast('سبب الإنهاء مطلوب', 'error'); return; }
    try {
      await procurementContractService.terminate(terminateContract.id, terminateReason.trim());
      addToast('تم إنهاء العقد', 'info');
      setTerminateContract(null);
      await load();
    } catch(e:any){ addToast(e.message,'error'); }
  };

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div className="flex justify-between items-center gap-3 flex-wrap"><div><h1 className="text-3xl font-black">إدارة دورة حياة العقود CLM</h1><p className="text-slate-500 mt-1">طلب → مسودة → مراجعة/تفاوض → موافقات → توقيع → التزامات → تجديد/إنهاء.</p></div><Button onClick={()=>setShowCreate(true)}>عقد جديد</Button></div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2"><h3 className="font-bold mb-3">العقود ({contracts.length})</h3><div className="space-y-2 max-h-[55vh] overflow-auto">{contracts.map(c=><button key={c.id} onClick={()=>selectContract(c)} className={`w-full text-right p-3 border rounded-xl text-sm ${selected?.id===c.id?'bg-indigo-50 border-indigo-300':'bg-white hover:bg-slate-50'}`}><div className="flex justify-between gap-3"><div><div className="font-bold">{c.contract_number} — {c.title}</div><div className="text-xs text-slate-500">{c.type} • {c.status} • {c.total_value?.toLocaleString()} {c.currency_code}</div></div><div className="text-xs text-slate-400">ينتهي: {c.end_date ? new Date(c.end_date).toLocaleDateString('ar-SA') : '-'}</div></div><div className="flex gap-1 mt-2 flex-wrap"><Button type="button" size="xs" variant="secondary" onClick={(e)=>{e.stopPropagation();requestApproval(c);}}>موافقات</Button>{c.status==='approved'&&<Button type="button" size="xs" onClick={(e)=>{e.stopPropagation();openSignDialog(c);}}>توقيع</Button>}<Button type="button" size="xs" variant="secondary" onClick={(e)=>{e.stopPropagation();openRenewalDialog(c);}}>قرار تجديد</Button><Button type="button" size="xs" variant="secondary" className="!bg-red-50 !text-red-700" onClick={(e)=>{e.stopPropagation();openTerminateDialog(c);}}>إنهاء</Button></div></button>)}{!contracts.length&&<div className="py-10 text-center text-slate-400">لا عقود</div>}</div></Card>
        <Card><h3 className="font-bold mb-3 text-amber-800">تجديدات قادمة 90 يوم</h3><div className="space-y-2 max-h-[55vh] overflow-auto">{renewals.map((r:any)=><div key={r.id} className={`p-3 border rounded-xl text-sm ${r.renewal_status==='critical_30'?'bg-red-50 border-red-200':r.renewal_status==='warning_90'?'bg-amber-50 border-amber-200':'bg-white'}`}><div className="flex justify-between"><span className="font-bold">{r.contract_number}</span><span className="text-xs">{r.days_until_expiry} يوم</span></div><div className="text-xs text-slate-500">{r.title} — {r.total_value?.toLocaleString()} — {r.renewal_status}</div></div>)}{!renewals.length&&<div className="py-10 text-center text-slate-400 text-sm">لا تجديدات قادمة</div>}</div></Card>
      </div>

      {selected && <div className="grid lg:grid-cols-2 gap-4"><Card><h3 className="font-bold mb-3">موافقات العقد</h3><div className="space-y-2">{steps.map(s=><div key={s.id} className="p-3 border rounded-xl flex justify-between items-center text-sm"><div><b>#{s.step_order} — {s.approver_role}</b><div className="text-xs text-slate-500">{s.status}</div></div>{s.status==='active'&&<div className="flex gap-1"><Button size="xs" onClick={()=>openStepDialog(s,'approved')}>موافقة</Button><Button size="xs" variant="secondary" className="!bg-red-50 !text-red-700" onClick={()=>openStepDialog(s,'rejected')}>رفض</Button></div>}</div>)}{!steps.length&&<div className="text-center text-slate-400 py-6">لا توجد موافقات</div>}</div></Card><Card><h3 className="font-bold mb-3">Audit</h3><div className="space-y-2 max-h-64 overflow-auto">{audit.map(a=><div key={a.id} className="p-2 border rounded-xl text-xs"><b>{a.action}</b><div>{a.old_status||'—'} → {a.new_status||'—'}</div>{a.comments&&<div>{a.comments}</div>}<div className="text-slate-400">{new Date(a.created_at).toLocaleString('ar-SA')}</div></div>)}{!audit.length&&<div className="text-center text-slate-400 py-6">لا audit</div>}</div></Card></div>}

      {showCreate&&<div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-3xl"><h3 className="font-bold text-lg mb-4">عقد جديد</h3><form onSubmit={createContract} className="space-y-3"><div className="grid md:grid-cols-2 gap-3"><select required value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="">المورد</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.legal_name}</option>)}</select><select value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="border rounded-xl p-2.5 text-sm"><option value="MSA">MSA</option><option value="SLA">SLA</option><option value="SOW">SOW</option><option value="PO_TC">PO T&C</option><option value="NDA">NDA</option><option value="IP">IP</option><option value="other">Other</option></select></div><Input required placeholder="عنوان العقد" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/><div className="grid md:grid-cols-3 gap-3"><Input type="number" placeholder="القيمة" value={form.total_value} onChange={e=>setForm({...form,total_value:Number(e.target.value)})}/><Input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})}/><Input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})}/></div><select value={form.template_id} onChange={e=>setForm({...form,template_id:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"><option value="">بدون قالب</option>{templates.map(t=><option key={t.id} value={t.id}>{t.type} — {t.name}</option>)}</select><textarea className="w-full border rounded-xl p-3 text-sm" placeholder="وصف" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><div className="flex gap-2"><Button type="submit" className="flex-1">إنشاء</Button><Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowCreate(false)}>إلغاء</Button></div></form></div></div>}

      {stepTarget && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">قرار الموافقة</h3><p className="text-sm text-slate-500 mb-4">القرار: <b>{stepTarget.decision === 'approved' ? 'موافقة' : 'رفض'}</b></p><label className="block text-xs font-bold text-slate-600 mb-1">التعليق {stepTarget.decision === 'rejected' ? '*' : ''}</label><textarea rows={3} value={stepComments} onChange={e=>setStepComments(e.target.value)} className="w-full border rounded-xl p-3" /><div className="flex gap-2 mt-4"><button type="button" onClick={submitStep} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-bold hover:bg-amber-700">تأكيد</button><button type="button" onClick={()=>setStepTarget(null)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">إلغاء</button></div></div></div>}

      {signContract && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">طلب توقيع إلكتروني</h3><p className="text-sm text-slate-500 mb-4">{signContract.contract_number}</p><label className="block text-xs font-bold text-slate-600 mb-1">بريد موقّع المورد *</label><input type="email" value={signEmail} onChange={e=>setSignEmail(e.target.value)} placeholder="vendor@example.com" className="w-full border rounded-xl p-2.5" dir="ltr" /><div className="flex gap-2 mt-4"><button type="button" onClick={submitSign} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-bold hover:bg-amber-700">إرسال الطلب</button><button type="button" onClick={()=>setSignContract(null)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">إلغاء</button></div></div></div>}

      {renewalContract && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">قرار التجديد</h3><p className="text-sm text-slate-500 mb-4">{renewalContract.contract_number}</p><label className="block text-xs font-bold text-slate-600 mb-1">القرار *</label><select value={renewalForm.decision} onChange={e=>setRenewalForm({...renewalForm, decision:e.target.value as RenewalDecision})} className="w-full border rounded-xl p-2.5 bg-white"><option value="renew_same">تجديد بنفس الشروط</option><option value="renegotiate">إعادة تفاوض</option><option value="expand">توسيع النطاق</option><option value="reduce">تقليص النطاق</option><option value="terminate">عدم التجديد</option><option value="rfq_new">طرح مناقصة جديدة</option></select><label className="block text-xs font-bold text-slate-600 mb-1 mt-3">ملاحظات القرار *</label><textarea rows={3} value={renewalForm.notes} onChange={e=>setRenewalForm({...renewalForm, notes:e.target.value})} className="w-full border rounded-xl p-3" /><div className="flex gap-2 mt-4"><button type="button" onClick={submitRenewal} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-bold hover:bg-amber-700">حفظ القرار</button><button type="button" onClick={()=>setRenewalContract(null)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">إلغاء</button></div></div></div>}

      {terminateContract && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">إنهاء العقد</h3><p className="text-sm text-slate-500 mb-4">{terminateContract.contract_number} — إجراء نهائي لا يمكن التراجع عنه.</p><label className="block text-xs font-bold text-slate-600 mb-1">سبب الإنهاء *</label><textarea rows={3} value={terminateReason} onChange={e=>setTerminateReason(e.target.value)} placeholder="يُسجَّل في سجل تدقيق العقد" className="w-full border rounded-xl p-3" /><div className="flex gap-2 mt-4"><button type="button" onClick={submitTerminate} className="flex-1 bg-rose-600 text-white rounded-xl py-2.5 font-bold hover:bg-rose-700">تأكيد الإنهاء</button><button type="button" onClick={()=>setTerminateContract(null)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">تراجع</button></div></div></div>}
    </div>
  );
}
