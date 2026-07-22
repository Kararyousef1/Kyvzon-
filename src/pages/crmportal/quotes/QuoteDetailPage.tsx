/**
 * QuoteDetailPage — منشئ العرض CPQ: البنود + المجاميع + موافقة الخصم + الإرسال +
 * التتبّع + التوقيع الإلكتروني + توليد PDF (طباعة). القلب التشغيلي للوحدة 4.
 */
import { useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowRight, Plus, Trash2, Send, FileDown, PenLine, BadgeCheck, Eye, ShieldAlert,
} from 'lucide-react';
import {
  crmQuoteService,
  type CrmQuote, type CrmQuoteLineItem, type CrmQuoteEvent, type CrmQuoteLineItemInput,
  QUOTE_STATUS_LABEL, QUOTE_STATUS_COLOR, APPROVAL_LEVEL_LABEL,
} from '../../../services/sdk';
import { useAsync, useProducts } from './useQuotes';
import { CRM_BASE } from '../crmCatalog';

function fmt(n: number) { return Number(n).toLocaleString('ar', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

export default function QuoteDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const quote = useAsync<CrmQuote | null>(() => crmQuoteService.findById(id), null, [id]);
  const items = useAsync<CrmQuoteLineItem[]>(() => crmQuoteService.lineItems(id), [], [id]);
  const events = useAsync<CrmQuoteEvent[]>(() => crmQuoteService.events(id), [], [id]);
  const { data: products } = useProducts();

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showItem, setShowItem] = useState(false);
  const [itemForm, setItemForm] = useState<CrmQuoteLineItemInput>({ quote_id: id, description: '', quantity: 1, unit_price: 0, discount_pct: 0 });
  const [showSign, setShowSign] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);

  const q = quote.data;
  const level = useMemo(() => (q ? crmQuoteService.discountLevel(q.discount_pct) : 'none'), [q]);

  const reloadAll = () => { quote.reload(); items.reload(); events.reload(); };

  const pickProduct = (pid: string) => {
    const p = products.find((x) => x.id === pid);
    if (p) setItemForm((f) => ({ ...f, product_id: pid, description: p.name, unit_price: Number(p.unit_price) }));
    else setItemForm((f) => ({ ...f, product_id: null }));
  };
  const addItem = async () => {
    if (!itemForm.description.trim()) return;
    setBusy(true);
    try { await crmQuoteService.addLineItem(itemForm); await crmQuoteService.recalc(id); setShowItem(false); setItemForm({ quote_id: id, description: '', quantity: 1, unit_price: 0, discount_pct: 0 }); reloadAll(); }
    catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر'); } finally { setBusy(false); }
  };
  const removeItem = async (itemId: string) => {
    try { await crmQuoteService.removeLineItem(itemId); await crmQuoteService.recalc(id); reloadAll(); } catch { /* noop */ }
  };
  const setDiscount = async (pct: number) => {
    try { await crmQuoteService.updateQuote(id, { discount_pct: pct }); await crmQuoteService.recalc(id); reloadAll(); } catch { /* noop */ }
  };
  const send = async () => { setBusy(true); setMsg(null); try { await crmQuoteService.send(id); setMsg('تم إرسال العرض ✓'); reloadAll(); } catch (e) { setMsg(e instanceof Error ? e.message : 'تعذّر'); } finally { setBusy(false); } };
  const simulateOpen = async () => { try { await crmQuoteService.trackEvent(id, 'opened', { seconds: 300 }, q?.signer_email || 'client@example.com', '0.0.0.0'); reloadAll(); } catch { /* noop */ } };
  const printPdf = () => window.print();

  if (quote.loading) return <div className="text-center py-16 text-slate-400">جارٍ التحميل…</div>;
  if (!q) return <div className="text-center py-16"><p className="text-slate-400">العرض غير موجود.</p><Link to={`${CRM_BASE}/quotes/list`} className="text-cyan-600 text-sm mt-2 inline-block">← عودة</Link></div>;

  const editable = q.status === 'draft';

  return (
    <div className="space-y-5">
      <button onClick={() => navigate(`${CRM_BASE}/quotes/list`)} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 no-print"><ArrowRight size={14} /> كل العروض</button>

      {msg && <div className="rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600 px-4 py-2.5 no-print">{msg}</div>}

      <div className="rounded-3xl border border-slate-200 bg-white p-5" id="quote-doc">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <span style={{ fontFamily: "'Orbitron', sans-serif", fontWeight: 900, fontSize: '1.1rem', color: '#0891b2' }}>KYVZON</span>
              <span className={`text-[10px] font-bold border px-2 py-0.5 rounded-full ${QUOTE_STATUS_COLOR[q.status]}`}>{QUOTE_STATUS_LABEL[q.status]}</span>
            </div>
            <h1 className="text-xl font-black text-slate-800 mt-2">{q.title}</h1>
            <p className="text-xs text-slate-400 font-mono">{q.quote_number}{q.valid_until ? ` · ساري حتى ${q.valid_until}` : ''}</p>
          </div>
          <div className="text-left">
            <p className="text-xs text-slate-400">الإجمالي (شامل الضريبة)</p>
            <p className="text-3xl font-black text-cyan-700">{fmt(q.total)} <span className="text-sm">{q.currency}</span></p>
          </div>
        </div>

        {q.executive_summary && <p className="text-sm text-slate-600 mt-4 leading-relaxed border-t border-slate-100 pt-3">{q.executive_summary}</p>}

        {/* البنود */}
        <div className="mt-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-slate-800 text-sm">تفصيل البنود</h3>
            {editable && <button onClick={() => setShowItem(true)} className="flex items-center gap-1 text-xs bg-cyan-600 text-white px-3 py-1.5 rounded-lg hover:bg-cyan-700 no-print"><Plus size={13} /> بند</button>}
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-3 py-2">البند</th><th className="text-center px-3 py-2">الكمية</th><th className="text-center px-3 py-2">السعر</th><th className="text-center px-3 py-2">الخصم</th><th className="text-center px-3 py-2">الصافي</th>{editable && <th className="no-print"></th>}</tr></thead>
              <tbody className="divide-y divide-slate-100">
                {items.data.length === 0 ? <tr><td colSpan={editable ? 6 : 5} className="text-center py-6 text-slate-400">لا بنود بعد.</td></tr>
                  : items.data.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-slate-700">{it.description}</td>
                      <td className="px-3 py-2 text-center text-slate-600">{it.quantity}</td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600">{fmt(it.unit_price)}</td>
                      <td className="px-3 py-2 text-center text-slate-500">{it.discount_pct}%</td>
                      <td className="px-3 py-2 text-center font-mono font-semibold text-slate-800">{fmt(it.line_total)}</td>
                      {editable && <td className="px-3 py-2 text-center no-print"><button onClick={() => removeItem(it.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button></td>}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* المجاميع */}
        <div className="mt-4 flex justify-end">
          <div className="w-full sm:w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600"><span>المجموع الفرعي</span><span className="font-mono">{fmt(q.subtotal)}</span></div>
            <div className="flex justify-between text-slate-600">
              <span className="flex items-center gap-2">خصم إجمالي
                {editable && <input type="number" value={q.discount_pct} min={0} max={100} onChange={(e) => setDiscount(Number(e.target.value))} className="w-16 px-2 py-0.5 text-xs rounded border border-slate-200 outline-none no-print" />}
                {!editable && `${q.discount_pct}%`}
              </span>
              <span className="font-mono text-rose-500">-{fmt(q.discount_amount)}</span>
            </div>
            <div className="flex justify-between text-slate-600"><span>ضريبة القيمة المضافة ({q.tax_pct}%)</span><span className="font-mono">{fmt(q.tax_amount)}</span></div>
            <div className="flex justify-between font-black text-slate-800 border-t border-slate-200 pt-1.5"><span>الإجمالي</span><span className="font-mono text-cyan-700">{fmt(q.total)}</span></div>
          </div>
        </div>

        {/* موافقة الخصم */}
        {editable && q.discount_pct > 10 && (
          <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg no-print ${level === 'forbidden' ? 'bg-rose-50 text-rose-600 border border-rose-200' : 'bg-amber-50 text-amber-600 border border-amber-200'}`}>
            <ShieldAlert size={14} /> هذا الخصم يتطلب: {APPROVAL_LEVEL_LABEL[level]}
          </div>
        )}

        {/* التوقيع (يظهر في PDF) */}
        {q.status === 'signed' && (
          <div className="mt-5 border-t border-slate-100 pt-4 text-sm">
            <p className="font-bold text-emerald-600 flex items-center gap-1.5"><PenLine size={15} /> موقّع إلكترونياً</p>
            <p className="text-xs text-slate-500 mt-1">{q.signer_name} · {q.signer_email} · {q.signed_at ? new Date(q.signed_at).toLocaleString('ar') : ''}{q.signer_ip ? ` · IP ${q.signer_ip}` : ''}</p>
          </div>
        )}
      </div>

      {/* أزرار الإجراءات */}
      <div className="flex flex-wrap gap-2 no-print">
        {q.status === 'draft' && <button onClick={() => setShowSubmit(true)} disabled={busy || items.data.length === 0} className="flex items-center gap-1.5 bg-amber-500 text-white text-sm px-4 py-2 rounded-xl hover:bg-amber-600 disabled:opacity-60"><BadgeCheck size={15} /> اعتماد/موافقة</button>}
        {q.status === 'approved' && <button onClick={send} disabled={busy} className="flex items-center gap-1.5 bg-cyan-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-cyan-700 disabled:opacity-60"><Send size={15} /> إرسال للعميل</button>}
        {(q.status === 'sent' || q.status === 'viewed') && <>
          <button onClick={simulateOpen} className="flex items-center gap-1.5 bg-slate-100 text-slate-600 text-sm px-4 py-2 rounded-xl hover:bg-slate-200"><Eye size={15} /> محاكاة فتح العميل</button>
          <button onClick={() => setShowSign(true)} className="flex items-center gap-1.5 bg-emerald-600 text-white text-sm px-4 py-2 rounded-xl hover:bg-emerald-700"><PenLine size={15} /> توقيع إلكتروني</button>
        </>}
        <button onClick={printPdf} className="flex items-center gap-1.5 bg-slate-800 text-white text-sm px-4 py-2 rounded-xl hover:bg-slate-900"><FileDown size={15} /> توليد PDF (طباعة)</button>
      </div>

      {/* تتبّع العرض */}
      {events.data.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 no-print">
          <h3 className="font-bold text-slate-800 text-sm mb-2 flex items-center gap-2"><Eye size={16} className="text-cyan-600" /> تتبّع العرض</h3>
          <div className="space-y-1.5">
            {events.data.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-xs text-slate-500 border-b border-slate-50 pb-1.5">
                <span>{{ sent: '📤 أُرسل', opened: '👁 فتحه العميل', viewed_pricing: '💰 اطّلع على التسعير', viewed_terms: '📋 اطّلع على الشروط', shared: '🔗 شاركه', signed: '✍️ وقّع', declined: '✖ رفض' }[e.event_type]}</span>
                <span>{new Date(e.created_at).toLocaleString('ar')}{e.actor_email ? ` · ${e.actor_email}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal: إضافة بند */}
      {showItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print" onClick={() => setShowItem(false)}>
          <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4"><h3 className="font-black text-slate-800">بند جديد</h3><button onClick={() => setShowItem(false)} className="text-slate-400 hover:text-slate-600">✕</button></div>
            <div className="space-y-3">
              <div><label className="text-xs text-slate-500">من الكتالوج</label><select onChange={(e) => pickProduct(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none"><option value="">— اختر منتجاً (اختياري) —</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.unit_price}</option>)}</select></div>
              <div><label className="text-xs text-slate-500">الوصف *</label><input value={itemForm.description} onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              <div className="grid grid-cols-3 gap-2">
                <div><label className="text-xs text-slate-500">الكمية</label><input type="number" value={itemForm.quantity ?? 1} onChange={(e) => setItemForm({ ...itemForm, quantity: Number(e.target.value) })} className="w-full mt-1 px-2 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">السعر</label><input type="number" value={itemForm.unit_price ?? 0} onChange={(e) => setItemForm({ ...itemForm, unit_price: Number(e.target.value) })} className="w-full mt-1 px-2 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
                <div><label className="text-xs text-slate-500">خصم %</label><input type="number" value={itemForm.discount_pct ?? 0} onChange={(e) => setItemForm({ ...itemForm, discount_pct: Number(e.target.value) })} className="w-full mt-1 px-2 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
              </div>
            </div>
            <div className="flex gap-2 mt-5"><button onClick={addItem} disabled={busy} className="flex-1 bg-cyan-600 text-white text-sm py-2.5 rounded-xl hover:bg-cyan-700 disabled:opacity-60">إضافة</button><button onClick={() => setShowItem(false)} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
          </div>
        </div>
      )}

      {/* Modal: اعتماد/موافقة */}
      {showSubmit && <SubmitModal quoteId={id} discountPct={q.discount_pct} onClose={() => setShowSubmit(false)} onDone={(m) => { setShowSubmit(false); setMsg(m); reloadAll(); }} />}
      {/* Modal: توقيع */}
      {showSign && <SignModal quoteId={id} onClose={() => setShowSign(false)} onDone={() => { setShowSign(false); setMsg('تم التوقيع وإنشاء العقد ✓'); reloadAll(); }} />}

      <style>{`@media print { .no-print { display: none !important; } body { background: #fff; } }`}</style>
    </div>
  );
}

function SubmitModal({ quoteId, discountPct, onClose, onDone }: { quoteId: string; discountPct: number; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const needsReason = discountPct > 10;

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await crmQuoteService.submit(quoteId, reason || null);
      onDone(res === 'approved' ? 'تم اعتماد العرض ✓' : 'أُرسل طلب موافقة الخصم ✓');
    } catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-slate-800 mb-2">اعتماد العرض</h3>
        <p className="text-xs text-slate-400 mb-4">{needsReason ? `خصم ${discountPct}% يحتاج موافقة — اذكر السبب.` : 'خصم ضمن صلاحية الموظف — سيُعتمد مباشرة.'}</p>
        {needsReason && <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="سبب طلب الخصم…" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none resize-none" />}
        {err && <p className="text-xs text-rose-600 mt-2">{err}</p>}
        <div className="flex gap-2 mt-4"><button onClick={submit} disabled={busy} className="flex-1 bg-amber-500 text-white text-sm py-2.5 rounded-xl hover:bg-amber-600 disabled:opacity-60">{busy ? 'جارٍ…' : 'تأكيد'}</button><button onClick={onClose} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
      </div>
    </div>
  );
}

function SignModal({ quoteId, onClose, onDone }: { quoteId: string; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const sign = async () => {
    if (!name.trim() || !email.trim()) { setErr('الاسم والبريد مطلوبان'); return; }
    setBusy(true); setErr(null);
    try { await crmQuoteService.sign({ quoteId, signerName: name, signerEmail: email, signerIp: '0.0.0.0' }); onDone(); }
    catch (e) { setErr(e instanceof Error ? e.message : 'تعذّر'); setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 no-print" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-slate-800 mb-1">التوقيع الإلكتروني</h3>
        <p className="text-xs text-slate-400 mb-4">يُسجَّل الاسم والبريد ووقت التوقيع وعنوان IP كسجل قانوني، ويتحوّل العرض إلى عقد.</p>
        <div className="space-y-3">
          <div><label className="text-xs text-slate-500">اسم الموقِّع *</label><input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none" /></div>
          <div><label className="text-xs text-slate-500">البريد الإلكتروني *</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 px-3 py-2 text-sm rounded-xl border border-slate-200 outline-none font-mono" /></div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
        </div>
        <div className="flex gap-2 mt-5"><button onClick={sign} disabled={busy} className="flex-1 bg-emerald-600 text-white text-sm py-2.5 rounded-xl hover:bg-emerald-700 disabled:opacity-60">{busy ? 'جارٍ…' : 'أوافق وأوقّع'}</button><button onClick={onClose} className="px-4 text-sm text-slate-600 border border-slate-200 rounded-xl hover:bg-slate-50">إلغاء</button></div>
      </div>
    </div>
  );
}
