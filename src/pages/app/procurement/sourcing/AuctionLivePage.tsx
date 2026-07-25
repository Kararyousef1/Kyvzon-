import { useEffect, useState, useRef } from 'react';
import Card from '../../../../shared/components/ui/Card';
import Button from '../../../../shared/components/ui/Button';
import { auctionService, auctionBidService, supplierService, type AuctionRecord, type AuctionBidRecord } from '../../../../services/sdk';
import { supabase } from '../../../../services/supabase/supabase';
import { useUIStore } from '../../../../core/stores';

export default function AuctionLivePage() {
  const { addToast } = useUIStore();
  const [auctions, setAuctions] = useState<AuctionRecord[]>([]);
  const [selected, setSelected] = useState<AuctionRecord | null>(null);
  const [bids, setBids] = useState<AuctionBidRecord[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [bidPrice, setBidPrice] = useState<number>(0);
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
      addToast(result.extended ? `تم قبول العرض — تم تمديد المزاد ${selected.extension_minutes} دقائق!` : `تم قبول العرض — أفضل سعر الآن ${result.current_best}`, 'success');
      setBidPrice(0);
      await loadBids(selected.id);
      // تحديث المزاد
      const updated = await auctionService.findById(selected.id);
      if (updated) setSelected(updated as any);
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
                    <p className="text-xs text-slate-400 mt-1">نوع: {selected.auction_type} • بدأ: {new Date(selected.start_time).toLocaleString('ar-SA')} • ينتهي: {new Date(selected.end_time).toLocaleString('ar-SA')}</p>
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
                  <input type="number" step={0.01} placeholder={`أقل من ${selected.current_best_price || selected.starting_price}`} value={bidPrice || ''} onChange={e=>setBidPrice(Number(e.target.value))} className="border rounded-xl p-2.5 text-sm w-40" />
                  <Button onClick={handleBid}>مزايدة</Button>
                </div>
                <p className="text-[11px] text-slate-400 mt-2">القاعدة: يجب أن يكون العرض أقل من أفضل سعر حالي — وإلا يفشل BID_MUST_BE_LOWER_THAN_CURRENT — إذا جاء عرض في آخر {selected.extension_minutes} دقائق يتم التمديد تلقائياً — كما في التقرير</p>
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
