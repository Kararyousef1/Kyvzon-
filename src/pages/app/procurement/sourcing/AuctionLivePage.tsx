import { useEffect, useState, useRef } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { auctionService, auctionBidService, supplierService, type AuctionRecord, type AuctionBidRecord } from '../../../../services/sdk';
import { supabase } from '../../../../services/supabase/supabase';
import { useUIStore } from '../../../../core/stores';

/**
 * قواعد العرض حسب نوع المزاد — تطابق منطق المايجريشن 0269.
 * قبل ذلك كانت الواجهة تعرض قاعدة British لكل الأنواع، والخلفية
 * تفرضها فعلياً، فكان النوعان japanese و dutch معطّلين.
 */
const AUCTION_RULES: Record<
  'british' | 'japanese' | 'dutch',
  {
    label: string;
    actionLabel: string;
    description: string;
    placeholder: (best: number | null | undefined, start: number) => string;
  }
> = {
  british: {
    label: 'إنجليزي عكسي',
    actionLabel: 'مزايدة',
    description: 'مزاد إنجليزي عكسي: كل عرض يجب أن يكون أقل من أفضل سعر حالي.',
    placeholder: (best, start) => `أقل من ${(best ?? start).toLocaleString()}`,
  },
  japanese: {
    label: 'ياباني',
    actionLabel: 'قبول المستوى',
    description:
      'مزاد ياباني: النظام يعلن مستويات هابطة والمورد يقبل المستوى أو ينسحب. ' +
      'القبول بنفس السعر مسموح، والرجوع لسعر أعلى مرفوض. انسحاب ما قبل الأخير يُنهي المزاد.',
    placeholder: (best, start) => `${(best ?? start).toLocaleString()} أو أقل`,
  },
  dutch: {
    label: 'هولندي',
    actionLabel: 'قبول السعر',
    description: 'مزاد هولندي: أول مورد يقبل السعر يفوز وينتهي المزاد فوراً — لا مزايدة بعده.',
    placeholder: (_best, start) => `حتى ${start.toLocaleString()}`,
  },
};

export default function AuctionLivePage() {
  const { addToast } = useUIStore();
  const [auctions, setAuctions] = useState<AuctionRecord[]>([]);
  const [selected, setSelected] = useState<AuctionRecord | null>(null);
  const [bids, setBids] = useState<AuctionBidRecord[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [bidPrice, setBidPrice] = useState<number>(0);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadAuctions = async () => {
    try {
      const live = await auctionService.findLive();
      setAuctions(live);
      if (live.length && !selected) setSelected(live[0]);
      const sups = await supplierService.findApproved();
      setSuppliers(sups);
    } catch (e:any) { addToast(e.message,'error'); }
  };

  const loadBids = async (auctionId: string) => {
    try {
      const b = await auctionBidService.findByAuction(auctionId);
      setBids(b);
    } catch {}
  };

  useEffect(()=>{ loadAuctions(); }, []);

  useEffect(()=>{
    if (!selected) return;
    loadBids(selected.id);

    // Realtime للعروض الحية — غرفة procurement-auction-{id}
    if (channelRef.current) supabase.removeChannel(channelRef.current);
    const ch = supabase.channel(`procurement-auction-${selected.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'auction_bids', filter: `auction_id=eq.${selected.id}` }, (payload) => {
        setBids(prev => [...prev, payload.new as AuctionBidRecord].sort((a,b)=>a.bid_price-b.bid_price));
        // تحديث أفضل سعر
        setSelected(s => s ? { ...s, current_best_price: Math.min(...[...bids, payload.new as AuctionBidRecord].map(x=>x.bid_price), s.current_best_price || Infinity) } : s);
      })
      .subscribe();
    channelRef.current = ch;

    return ()=>{ if (channelRef.current) supabase.removeChannel(channelRef.current); };
  }, [selected?.id]);

  const handleBid = async () => {
    if (!selected || !supplierId || !bidPrice) return;
    try {
      const result = await auctionService.placeBid(selected.id, supplierId, bidPrice);
      if (result.auction_closed) {
        // المزاد الهولندي: أول قبول يفوز وينهي المزاد فوراً
        addToast(`تم قبول السعر ${result.current_best.toLocaleString()} — انتهى المزاد الهولندي وفاز هذا المورد`, 'success');
      } else if (result.extended) {
        addToast(`تم قبول العرض — تم تمديد المزاد ${selected.extension_minutes} دقائق!`, 'success');
      } else if (!result.is_new_best) {
        // الياباني: قبول مستوى قائم دون تحسينه
        addToast(`تم تسجيل قبول المستوى ${bidPrice.toLocaleString()} — أفضل سعر ما زال ${result.current_best.toLocaleString()}`, 'success');
      } else {
        addToast(`تم قبول العرض — أفضل سعر الآن ${result.current_best.toLocaleString()}`, 'success');
      }
      setBidPrice(0);
      await loadBids(selected.id);
      const updated = await auctionService.findById(selected.id);
      if (updated) setSelected(updated);
    } catch (e:any) {
      addToast(e.message,'error');
    }
  };

  /*
    الانسحاب ركن أساسي في المزاد الياباني: المورد يقبل المستوى أو ينسحب،
    وانسحاب ما قبل الأخير يُنهي المزاد. السبب إلزامي ويُسجَّل للتدقيق
    (سياسة المنصة: كل تغيير حالة يحتاج سبباً نصياً).
  */
  const handleWithdraw = async () => {
    if (!selected || !supplierId) return;
    if (withdrawReason.trim().length < 5) {
      addToast('سبب الانسحاب مطلوب (5 أحرف على الأقل)', 'error');
      return;
    }
    try {
      const closed = await auctionService.withdrawSupplier(selected.id, supplierId, withdrawReason.trim());
      addToast(closed ? 'تم الانسحاب — بقي مورد واحد فأُغلق المزاد' : 'تم تسجيل انسحاب المورد', 'success');
      setWithdrawReason('');
      setShowWithdraw(false);
      const updated = await auctionService.findById(selected.id);
      if (updated) setSelected(updated);
    } catch (e:any) {
      addToast(e.message,'error');
    }
  };

  const saving = selected ? (selected.starting_price - (selected.current_best_price || selected.starting_price)) : 0;
  const annualSaving = saving * (selected?.annual_quantity || 0);
  const savingPercent = selected && selected.starting_price>0 ? (saving/selected.starting_price*100) : 0;

  return (
    <div className="space-y-5 max-w-[1600px] mx-auto" dir="rtl">
      <div>
        <h1 className="text-3xl font-black">المزادات العكسية الحية</h1>
        <p className="text-slate-500 mt-1">British Open Descending — الموردون يرون عروض بعضهم ويخفضون — يوفر 18% كما في التقرير</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-1">
          <h3 className="font-bold mb-3">مزادات حية ({auctions.length})</h3>
          <div className="space-y-2 max-h-[60vh] overflow-auto">
            {auctions.map(a=>(
              <button key={a.id} onClick={()=>setSelected(a)} className={`w-full text-right p-3 rounded-xl border text-sm ${selected?.id===a.id ? 'bg-amber-50 border-amber-300' : 'bg-white hover:bg-slate-50'}`}>
                <div className="font-bold">{a.auction_number}</div>
                <div className="text-xs text-slate-500 truncate">{a.item_description}</div>
                <div className="text-xs mt-1">أفضل: <span className="font-black text-emerald-700">{a.current_best_price || a.starting_price}</span> / بدأ: {a.starting_price}</div>
                <div className="text-[10px] text-slate-400">ينتهي: {new Date(a.end_time).toLocaleTimeString('ar-SA')}</div>
              </button>
            ))}
            {!auctions.length && <div className="text-center py-10 text-slate-400 text-sm">لا مزادات حية</div>}
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-4">
          {!selected ? <Card className="py-20 text-center text-slate-400">اختر مزاد</Card> : (
            <>
              <Card>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h2 className="text-xl font-black">{selected.auction_number}</h2>
                    <p className="text-sm text-slate-600 mt-1">{selected.item_description} — {selected.annual_quantity} {selected.unit}/سنة</p>
                    <p className="text-xs text-slate-400 mt-1">نوع: {AUCTION_RULES[selected.auction_type].label} • بدأ: {new Date(selected.start_time).toLocaleString('ar-SA')} • ينتهي: {new Date(selected.end_time).toLocaleString('ar-SA')}</p>
                  </div>
                  <div className="text-left">
                    <div className="text-xs text-slate-500">سعر البداية</div>
                    <div className="font-mono">{selected.starting_price.toLocaleString()}</div>
                    <div className="text-xs text-slate-500 mt-2">أفضل حالي</div>
                    <div className="font-mono font-black text-emerald-700 text-lg">{(selected.current_best_price || selected.starting_price).toLocaleString()}</div>
                    <div className="text-[11px] text-emerald-600 mt-1">توفير: {saving.toLocaleString()} للوحدة ({savingPercent.toFixed(1)}%) = {annualSaving.toLocaleString()} /سنة</div>
                  </div>
                </div>

                <div className="mt-4 flex gap-2 items-end">
                  <select value={supplierId} onChange={e=>setSupplierId(e.target.value)} className="border rounded-xl p-2.5 text-sm flex-1">
                    <option value="">اختر مورد</option>
                    {suppliers.map(s=><option key={s.id} value={s.id}>{s.legal_name}</option>)}
                  </select>
                  <input
                    type="number"
                    step={0.01}
                    placeholder={AUCTION_RULES[selected.auction_type].placeholder(
                      selected.current_best_price,
                      selected.starting_price,
                    )}
                    value={bidPrice || ''}
                    onChange={e=>setBidPrice(Number(e.target.value))}
                    className="border rounded-xl p-2.5 text-sm w-40"
                  />
                  <Button onClick={handleBid}>{AUCTION_RULES[selected.auction_type].actionLabel}</Button>
                  {selected.auction_type === 'japanese' && (
                    <Button variant="secondary" onClick={()=>setShowWithdraw(v=>!v)}>انسحاب</Button>
                  )}
                </div>

                {showWithdraw && selected.auction_type === 'japanese' && (
                  <div className="mt-3 border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
                    <label className="text-xs font-bold text-amber-800">
                      سبب انسحاب المورد (إلزامي — يُسجَّل في التدقيق)
                    </label>
                    <textarea
                      value={withdrawReason}
                      onChange={e=>setWithdrawReason(e.target.value)}
                      rows={2}
                      className="w-full border rounded-xl p-2 text-sm"
                      placeholder="مثال: السعر المعروض أقل من تكلفة الإنتاج"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={handleWithdraw}>تأكيد الانسحاب</Button>
                      <Button size="sm" variant="secondary" onClick={()=>{setShowWithdraw(false); setWithdrawReason('');}}>إلغاء</Button>
                    </div>
                  </div>
                )}

                {/* شرح القاعدة يتغير حسب نوع المزاد — كانت قاعدة British ثابتة لكل الأنواع */}
                <p className="text-[11px] text-slate-400 mt-2">
                  {AUCTION_RULES[selected.auction_type].description}
                  {' '}السقف الأعلى {selected.starting_price.toLocaleString()} ولا يجوز تجاوزه (BID_ABOVE_CEILING).
                  {selected.auction_type !== 'dutch' &&
                    ` أي عرض في آخر ${selected.extension_minutes} دقائق يمدّد المزاد تلقائياً.`}
                </p>
              </Card>

              <Card>
                <h3 className="font-bold mb-3">سجل العروض الحي — Realtime ({bids.length})</h3>
                <div className="overflow-x-auto max-h-[40vh] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50"><tr><th className="p-2 text-right">الوقت</th><th className="p-2">المورد</th><th className="p-2">السعر</th></tr></thead>
                    <tbody className="divide-y">
                      {bids.map(b=>(
                        <tr key={b.id} className={b.bid_price === selected.current_best_price ? 'bg-emerald-50 font-bold' : ''}>
                          <td className="p-2 text-xs">{new Date(b.created_at).toLocaleTimeString('ar-SA')}</td>
                          <td className="p-2">{suppliers.find(s=>s.id===b.supplier_id)?.legal_name || b.supplier_id.slice(0,6)}</td>
                          <td className="p-2 font-mono">{b.bid_price.toLocaleString()}</td>
                        </tr>
                      ))}
                      {!bids.length && <tr><td colSpan={3} className="p-10 text-center text-slate-400">لا عروض بعد</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                  <strong>سيناريو التقرير:</strong> كرتون 40×30×25 — 500K وحدة/سنة — بدأ 2.50 — انتهى 2.05 — توفير 0.45×500K=225K ريال/سنة 18%
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
