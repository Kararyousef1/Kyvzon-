import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { auctionService, rfxBidScorecardService, rfxDocumentService, rfxEvaluationCriteriaService, rfxInvitationService, rfxQuestionService, rfxTemplateService, sourcingEventService, supplierBidService, supplierService, type RfxDocumentRecord, type RfxEvaluationCriterionRecord, type RfxInvitationRecord, type RfxQuestionRecord, type RfxTemplateRecord, type SupplierBidRecord } from '../../../../services/sdk';
import { supabase } from '../../../../services/supabase/supabase';
import { useUIStore } from '../../../../core/stores';

export default function RfxDetailPage() {
  const { id } = useParams();
  const { addToast } = useUIStore();
  const [event, setEvent] = useState<any>(null);
  const [bids, setBids] = useState<SupplierBidRecord[]>([]);
  const [invitations, setInvitations] = useState<RfxInvitationRecord[]>([]);
  const [questions, setQuestions] = useState<RfxQuestionRecord[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [templates, setTemplates] = useState<RfxTemplateRecord[]>([]);
  const [documents, setDocuments] = useState<RfxDocumentRecord[]>([]);
  const [criteria, setCriteria] = useState<RfxEvaluationCriterionRecord[]>([]);
  const [scorecards, setScorecards] = useState<any[]>([]);
  const [awardBidId, setAwardBidId] = useState<string | null>(null);
  const [awardReason, setAwardReason] = useState('');
  const [scoreBidId, setScoreBidId] = useState<string | null>(null);
  const [scoreValues, setScoreValues] = useState<Record<string, string>>({});
  const [scoreNotes, setScoreNotes] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [selectedSuppliers, setSelectedSuppliers] = useState<string[]>([]);
  const [auctionType, setAuctionType] = useState<'british' | 'japanese' | 'dutch'>('british');
  const [answerText, setAnswerText] = useState<Record<string, string>>({});
  const [showBid, setShowBid] = useState(false);
  const [form, setForm] = useState({ supplier_id: '', total_price: 0, discount: 0, lead_time: 14 });

  const load = async () => {
    if (!id) return;
    try {
      const [ev, b, inv, qs, sups, tpl, docs, crit, cards] = await Promise.all([
        sourcingEventService.findById(id),
        supplierBidService.findByEvent(id),
        rfxInvitationService.findByEvent(id).catch(() => []),
        rfxQuestionService.findByEvent(id).catch(() => []),
        supplierService.findApproved(),
        rfxTemplateService.findActive().catch(() => []),
        rfxDocumentService.findByEvent(id).catch(() => []),
        rfxEvaluationCriteriaService.findByEvent(id).catch(() => []),
        rfxBidScorecardService.findByEvent(id).catch(() => []),
      ]);
      setEvent(ev); setBids(b); setInvitations(inv); setQuestions(qs); setSuppliers(sups); setTemplates(tpl); setDocuments(docs); setCriteria(crit); setScorecards(cards);
    } catch (e:any) { addToast(e.message,'error'); }
  };
  useEffect(()=>{ load(); }, [id]);

  const handleBid = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await supplierBidService.submit(id!, form.supplier_id, Number(form.total_price), 'SAR', Number(form.lead_time), Number(form.discount));
      addToast('تم تقديم العرض داخلياً', 'success'); setShowBid(false); await load();
    } catch (err:any) { addToast(err.message,'error'); }
  };

  const sendRfx = async () => {
    if (!id || !selectedSuppliers.length) { addToast('اختر مورداً واحداً على الأقل', 'error'); return; }
    try {
      const { data, error } = await supabase.functions.invoke('procurement-send-rfq', { body: { event_id: id, supplier_ids: selectedSuppliers } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      addToast(`تم إرسال الدعوات: ${data?.sent || 0}`, 'success');
      if (data?.links?.length) console.info('Simulated RFx links', data.links);
      await load();
    } catch(e:any) { addToast(e.message, 'error'); }
  };

  const inviteOnly = async () => {
    if (!id || !selectedSuppliers.length) return;
    try { const count = await rfxInvitationService.invite(id, selectedSuppliers); addToast(`تم تسجيل ${count} دعوات`, 'success'); await load(); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const answer = async (questionId: string) => {
    try { await rfxQuestionService.answer(questionId, answerText[questionId] || ''); addToast('تمت الإجابة', 'success'); await load(); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const award = async () => {
    if (!awardBidId) return;
    if (!awardReason.trim()) { addToast('سبب الترسية مطلوب', 'error'); return; }
    try {
      await supplierBidService.award(awardBidId, awardReason.trim());
      addToast('تمت الترسية وتحديث حالة الحدث', 'success');
      setAwardBidId(null); setAwardReason('');
      await load();
    }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const seedTemplates = async () => {
    try { await rfxTemplateService.seedDefaults(); addToast('تم تجهيز قوالب RFI/RFQ/RFP', 'success'); await load(); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const applyTemplate = async () => {
    if (!id || !selectedTemplate) return;
    try { await rfxTemplateService.apply(id, selectedTemplate); addToast('تم تطبيق القالب والمعايير', 'success'); await load(); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const openScoreDialog = (bidId: string) => {
    if (!criteria.length) { addToast('لا توجد معايير تقييم — طبّق قالباً أولاً', 'error'); return; }
    const initial: Record<string, string> = {};
    for (const c of criteria) initial[c.criterion_key] = '';
    setScoreValues(initial);
    setScoreNotes('');
    setScoreBidId(bidId);
  };

  const submitScores = async () => {
    if (!scoreBidId) return;
    const scores: Record<string, number> = {};
    for (const c of criteria) {
      const raw = scoreValues[c.criterion_key];
      const num = Number(raw);
      if (raw === '' || !Number.isFinite(num)) { addToast(`أدخل درجة ${c.label_ar}`, 'error'); return; }
      if (num < 0 || num > c.max_score) { addToast(`درجة ${c.label_ar} يجب أن تكون بين 0 و ${c.max_score}`, 'error'); return; }
      scores[c.criterion_key] = num;
    }
    try {
      const total = await rfxBidScorecardService.score(scoreBidId, scores, scoreNotes.trim() || undefined);
      addToast(`تم حفظ MECCA Score: ${total}`, 'success');
      setScoreBidId(null);
      await load();
    }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const startAuction = async () => {
    if (!id) return;
    try { const auctionId = await auctionService.startFromEvent(id, auctionType, 45); addToast(`تم بدء المزاد ${auctionId.slice(0,8)}`, 'success'); await load(); }
    catch(e:any){ addToast(e.message,'error'); }
  };

  const archiveAwarded = async () => {
    const awarded = bids.find(b => b.status === 'awarded');
    if (!awarded) { addToast('لا يوجد عرض مرسى لأرشفته', 'error'); return; }
    try {
      await supplierBidService.archiveAwardedPrice(awarded.id);
      addToast('تم أرشفة السعر في تاريخ الأسعار', 'success');
    } catch(e:any){ addToast(e.message,'error'); }
  };

  if (!event) return <div className="p-10 text-center">جاري التحميل...</div>;
  const tcoSorted = [...bids].sort((a,b)=>a.effective_price - b.effective_price);

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-2xl font-black">{event.event_number} — {event.title}</h1>
        <p className="text-slate-500 text-sm mt-1">نوع: {event.type} • حالة: {event.status} • إغلاق: {event.close_date ? new Date(event.close_date).toLocaleDateString('ar-SA') : '-'}</p>
        {event.award_reason && <p className="text-xs text-emerald-700 mt-1">سبب الترسية: {event.award_reason}</p>}
      </div>

      <Card>
        <div className="flex justify-between items-center gap-3 flex-wrap mb-3">
          <h3 className="font-bold">RFx Builder — القوالب والمعايير</h3>
          <Button variant="secondary" onClick={seedTemplates}>تجهيز القوالب الافتراضية</Button>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <select value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)} className="border rounded-xl p-2.5 text-sm">
            <option value="">اختر قالب RFI/RFQ/RFP</option>
            {templates.filter(t=>t.type===event.type || t.type==='RFQ').map(t=><option key={t.id} value={t.id}>{t.type} — {t.template_name}</option>)}
          </select>
          <Button onClick={applyTemplate}>تطبيق القالب</Button>
          <div className="text-xs text-slate-500 p-2 bg-slate-50 rounded-xl">الأقسام: {documents.length} • معايير MECCA: {criteria.length}</div>
        </div>
        <div className="grid md:grid-cols-2 gap-3 mt-3 text-xs">
          <div className="p-3 border rounded-xl"><b>أقسام الوثيقة</b><div className="mt-2 space-y-1 max-h-28 overflow-auto">{documents.map(d=><div key={d.id}>{d.section}: {d.title}</div>)}{!documents.length&&<span className="text-slate-400">لا أقسام — طبّق قالباً</span>}</div></div>
          <div className="p-3 border rounded-xl"><b>معايير التقييم</b><div className="mt-2 space-y-1 max-h-28 overflow-auto">{criteria.map(c=><div key={c.id}>{c.label_ar}: {c.weight_percent}%</div>)}{!criteria.length&&<span className="text-slate-400">لا معايير — طبّق قالباً</span>}</div></div>
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center gap-3 flex-wrap mb-3">
          <h3 className="font-bold">دعوة الموردين — Supplier Portal</h3>
          <div className="flex gap-2"><Button variant="secondary" onClick={inviteOnly}>تسجيل دعوات فقط</Button><Button onClick={sendRfx}>إرسال RFx بالبريد/الرابط</Button></div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <select multiple value={selectedSuppliers} onChange={e=>setSelectedSuppliers(Array.from(e.target.selectedOptions, o=>o.value))} className="border rounded-xl p-2.5 text-sm h-32">
            {suppliers.map(s=><option key={s.id} value={s.id}>{s.legal_name} ({s.supplier_code})</option>)}
          </select>
          <div className="space-y-1 max-h-32 overflow-auto text-xs">
            {invitations.map(inv=><div key={inv.id} className="p-2 border rounded-lg flex justify-between"><span>{suppliers.find(s=>s.id===inv.supplier_id)?.legal_name || inv.email}</span><b>{inv.status}</b></div>)}
            {!invitations.length && <div className="p-6 text-center text-slate-400">لا دعوات بعد</div>}
          </div>
        </div>
      </Card>

      <div className="flex justify-between items-center">
        <h3 className="font-bold">العروض ({bids.length}) — مقارنة TCO + ترسية</h3>
        <Button variant="secondary" onClick={()=>setShowBid(true)}>تقديم عرض داخلي</Button>
      </div>

      <Card>
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-2 text-right">المورد</th><th className="p-2">إجمالي</th><th className="p-2">خصم%</th><th className="p-2">سعر فعلي</th><th className="p-2">Lead Time</th><th className="p-2">MECCA</th><th className="p-2">حالة</th><th className="p-2">قرار</th></tr></thead><tbody className="divide-y">{tcoSorted.map(b=><tr key={b.id}><td className="p-2 font-bold">{suppliers.find(s=>s.id===b.supplier_id)?.legal_name || b.supplier_id.slice(0,6)}</td><td className="p-2">{b.total_price.toLocaleString()}</td><td className="p-2">{b.discount_percent}%</td><td className="p-2 font-black text-emerald-700">{b.effective_price.toLocaleString()}</td><td className="p-2">{b.lead_time_days || '-'} يوم</td><td className="p-2">{scorecards.find(s=>s.bid_id===b.id)?.weighted_total ?? '—'}</td><td className="p-2"><span className="text-[10px] px-2 py-1 rounded-full bg-slate-100">{b.status}</span></td><td className="p-2 flex gap-1 justify-center">{criteria.length ? <Button size="xs" variant="secondary" onClick={()=>openScoreDialog(b.id)}>MECCA</Button> : null}{b.status==='awarded'?'🏆':<Button size="xs" onClick={()=>{ setAwardBidId(b.id); setAwardReason(''); }}>ترسية</Button>}</td></tr>)}{!bids.length && <tr><td colSpan={8} className="p-10 text-center text-slate-500">لا عروض بعد — الموردون يقدمون عبر بوابة RFx.</td></tr>}</tbody></table></div>
      </Card>

      <Card>
        <div className="flex justify-between items-center gap-3 flex-wrap">
          <div><h3 className="font-bold">المزادات العكسية وأرشيف الأسعار</h3><p className="text-xs text-slate-500 mt-1">British/Japanese/Dutch — يبدأ من أول بند RFx ويؤرشف سعر العرض الفائز في price history.</p></div>
          <div className="flex gap-2">
            <select value={auctionType} onChange={e=>setAuctionType(e.target.value as 'british' | 'japanese' | 'dutch')} className="border rounded-xl p-2 text-sm"><option value="british">British</option><option value="japanese">Japanese</option><option value="dutch">Dutch</option></select>
            <Button onClick={startAuction}>بدء مزاد</Button>
            <Button variant="secondary" onClick={archiveAwarded}>أرشفة سعر الفائز</Button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="font-bold mb-3">إدارة الأسئلة Q&A</h3>
        <div className="space-y-2">{questions.map(q=><div key={q.id} className="p-3 border rounded-xl"><div className="font-bold text-sm">س: {q.question}</div><div className="text-xs text-slate-500 mt-1">الحالة: {q.status} • الرؤية: {q.visibility}</div>{q.answer ? <div className="mt-2 text-sm text-emerald-700">ج: {q.answer}</div> : <div className="flex gap-2 mt-2"><input className="border rounded-xl p-2 text-sm flex-1" placeholder="الإجابة التي ستصل للموردين" value={answerText[q.id]||''} onChange={e=>setAnswerText({...answerText,[q.id]:e.target.value})}/><Button size="sm" onClick={()=>answer(q.id)}>إجابة</Button></div>}</div>)}{!questions.length && <div className="py-8 text-center text-slate-400">لا أسئلة بعد</div>}</div>
      </Card>

      {showBid && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-bold mb-4">تقديم عرض داخلي</h3><form onSubmit={handleBid} className="space-y-3"><select required value={form.supplier_id} onChange={e=>setForm({...form, supplier_id:e.target.value})} className="w-full border rounded-xl p-2.5 text-sm"><option value="">اختر مورد معتمد</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.legal_name} ({s.supplier_code})</option>)}</select><div className="grid grid-cols-2 gap-3"><input required type="number" step={0.01} placeholder="إجمالي السعر" value={form.total_price} onChange={e=>setForm({...form, total_price:Number(e.target.value)})} className="border rounded-xl p-2.5 text-sm"/><input type="number" step={0.1} placeholder="خصم %" value={form.discount} onChange={e=>setForm({...form, discount:Number(e.target.value)})} className="border rounded-xl p-2.5 text-sm"/></div><input type="number" placeholder="Lead Time أيام" value={form.lead_time} onChange={e=>setForm({...form, lead_time:Number(e.target.value)})} className="w-full border rounded-xl p-2.5 text-sm"/><div className="flex gap-2"><Button type="submit" className="flex-1">إرسال</Button><Button type="button" variant="secondary" className="flex-1" onClick={()=>setShowBid(false)}>إلغاء</Button></div></form></div></div>}

      {awardBidId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-md"><h3 className="font-black text-lg mb-2">ترسية العرض</h3><p className="text-sm text-slate-500 mb-4">الترسية إجراء نهائي ويُسجَّل في سجل تدقيق الحدث.</p><label className="block text-xs font-bold text-slate-600 mb-1">سبب الترسية / مبرر الاختيار *</label><textarea value={awardReason} onChange={e=>setAwardReason(e.target.value)} rows={3} placeholder="مثال: أفضل TCO مع أقصر مدة تسليم" className="w-full border rounded-xl p-3" /><div className="flex gap-2 mt-4"><button type="button" onClick={award} className="flex-1 bg-emerald-600 text-white rounded-xl py-2.5 font-bold hover:bg-emerald-700">تأكيد الترسية</button><button type="button" onClick={()=>{ setAwardBidId(null); setAwardReason(''); }} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">تراجع</button></div></div></div>}

      {scoreBidId && <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" dir="rtl"><div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"><h3 className="font-black text-lg mb-2">تقييم MECCA</h3><p className="text-sm text-slate-500 mb-4">أدخل درجة كل معيار ضمن نطاقه. الدرجة النهائية تُحتسب بالأوزان تلقائياً.</p><div className="space-y-3">{criteria.map(c=><div key={c.criterion_key}><label className="block text-xs font-bold text-slate-600 mb-1">{c.label_ar} <span className="text-slate-400">(وزن {c.weight_percent}% · من {c.max_score})</span></label><input type="number" min={0} max={c.max_score} value={scoreValues[c.criterion_key] ?? ''} onChange={e=>setScoreValues({...scoreValues, [c.criterion_key]: e.target.value})} className="w-full border rounded-xl p-2.5" /></div>)}<div><label className="block text-xs font-bold text-slate-600 mb-1">ملاحظات التقييم</label><textarea value={scoreNotes} onChange={e=>setScoreNotes(e.target.value)} rows={2} className="w-full border rounded-xl p-2.5" /></div></div><div className="flex gap-2 mt-4"><button type="button" onClick={submitScores} className="flex-1 bg-amber-600 text-white rounded-xl py-2.5 font-bold hover:bg-amber-700">حفظ التقييم</button><button type="button" onClick={()=>setScoreBidId(null)} className="flex-1 border rounded-xl py-2.5 font-bold hover:bg-slate-50">إلغاء</button></div></div></div>}
    </div>
  );
}
