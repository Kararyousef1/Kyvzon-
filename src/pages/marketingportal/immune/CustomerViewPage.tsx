/**
 * CustomerViewPage — معاينة صفحة "علاقتك معنا" (واجهة العميل) + سرعة الشحن المفضّلة.
 */
import { useState } from 'react';
import { Eye, SlidersHorizontal, Heart } from 'lucide-react';
import { customerFacingStatus, relationshipBalanceService, type PacePreference } from '../../../services/sdk';
import { marketingLeadService, type MarketingLead } from '../../../services/sdk';
import { useBalances, useAsync } from './useImmune';

const PACE_LABEL: Record<PacePreference, string> = { conservative: 'متحفّظ', balanced: 'متوازن', open: 'مفتوح' };

export default function CustomerViewPage() {
  const { data: balances, reload } = useBalances();
  const { data: leads } = useAsync<MarketingLead[]>(() => marketingLeadService.findAll({ orderBy: 'created_at', ascending: false }), []);
  const [selected, setSelected] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const bal = balances.find((b) => b.lead_id === selected) || balances[0];
  const leadName = (id: string) => leads.find((l) => l.id === id)?.full_name || 'عميل';
  const facing = bal ? customerFacingStatus(bal.balance) : null;

  const setPace = async (pace: PacePreference) => {
    if (!bal) return; setBusy(true);
    try { await relationshipBalanceService.setPace(bal.id, pace); reload(); }
    catch { /* noop */ } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-1"><Eye size={18} className="text-fuchsia-600" /><h2 className="font-black text-slate-800">معاينة صفحة «علاقتك معنا»</h2></div>
        <p className="text-xs text-slate-500 mb-4">هكذا يرى العميل حالة علاقته — شفافية حيّة بلا أرقام معقّدة.</p>
        {balances.length > 0 && (
          <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mb-4 py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
            {balances.map((b) => <option key={b.id} value={b.lead_id}>{leadName(b.lead_id)} (رصيد {b.balance})</option>)}
          </select>
        )}
      </div>

      {!bal ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-slate-400 text-sm">لا أرصدة — ابدأ مراقبة عميل من تبويب «أرصدة العلاقة».</div>
      ) : (
        <>
          {/* بطاقة العميل */}
          <div className="rounded-3xl border-2 border-fuchsia-100 bg-gradient-to-br from-fuchsia-50 to-white p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-fuchsia-100 text-fuchsia-600 flex items-center justify-center mx-auto"><Heart size={28} /></div>
            <p className="text-xs text-slate-400 mt-4">حالة علاقتك معنا</p>
            <h3 className="text-2xl font-black text-slate-800 mt-1">{facing?.label}</h3>
            <p className="text-sm text-slate-600 mt-2 max-w-md mx-auto">{facing?.message}</p>
            {/* سطر شفافية لآخر رسالة */}
            <div className="mt-5 inline-block rounded-xl bg-white border border-slate-200 px-4 py-2 text-xs text-slate-500">
              مثال شفافية: «وصلتك رسالتنا لأنك زرت صفحة التسعير قبل يومين ولم نتواصل معك منذ 5 أيام.»
            </div>
          </div>

          {/* سرعة الشحن المفضّلة */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-1"><SlidersHorizontal size={18} className="text-fuchsia-600" /><h3 className="font-black text-slate-800">سرعة التواصل المفضّلة</h3></div>
            <p className="text-xs text-slate-500 mb-4">تفضيل واحد يحكم تصرّف الأنظمة الست معاً — لا نموذج بعشرات الخانات.</p>
            <div className="grid grid-cols-3 gap-3">
              {(['conservative', 'balanced', 'open'] as PacePreference[]).map((p) => (
                <button key={p} onClick={() => setPace(p)} disabled={busy}
                  className={`rounded-xl border p-4 text-center transition-all ${bal.pace_preference === p ? 'border-fuchsia-400 bg-fuchsia-50 text-fuchsia-700' : 'border-slate-200 text-slate-600 hover:border-fuchsia-200'}`}>
                  <p className="font-bold text-sm">{PACE_LABEL[p]}</p>
                  <p className="text-[10px] text-slate-400 mt-1">{p === 'conservative' ? 'تواصل أقل' : p === 'balanced' ? 'معتدل' : 'تواصل أكثر'}</p>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
