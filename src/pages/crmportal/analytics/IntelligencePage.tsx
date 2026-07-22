/**
 * IntelligencePage — ذكاء المنافسة (Win/Loss ضد كل منافس) + تجزئة العملاء + مؤشر صحة الحساب.
 */
import { useState } from 'react';
import { Swords, PieChart, HeartPulse } from 'lucide-react';
import {
  crmAnalytics, crmAccountService,
  type CompetitorRow, type SegmentRow, type CrmAccount,
  healthTier, HEALTH_WEIGHTS_REFERENCE,
} from '../../../services/sdk';
import { useAsync } from './useAnalytics';

export default function IntelligencePage() {
  const competitors = useAsync<CompetitorRow[]>(() => crmAnalytics.winLossByCompetitor(), []);
  const segments = useAsync<SegmentRow[]>(() => crmAnalytics.segmentation(), []);
  const accounts = useAsync<CrmAccount[]>(() => crmAccountService.listAccounts(), []);
  const [selAccount, setSelAccount] = useState('');
  const [health, setHealth] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  const checkHealth = async (id: string) => {
    setSelAccount(id); setHealth(null); if (!id) return;
    setChecking(true);
    try { const s = await crmAnalytics.accountHealth(id); setHealth(s); } catch { /* noop */ } finally { setChecking(false); }
  };
  const tier = health != null ? healthTier(health) : null;

  return (
    <div className="space-y-5">
      {/* Competitive intelligence */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><Swords size={16} className="text-cyan-600" /> معدل الفوز ضد كل منافس</h3>
        {competitors.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : competitors.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا بيانات منافسين بعد — تُجمع من الصفقات المُغلقة.</p>
            : <div className="rounded-xl border border-slate-200 overflow-hidden"><table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-4 py-2">المنافس</th><th className="text-center px-4 py-2">واجهناه</th><th className="text-center px-4 py-2">فزنا</th><th className="text-center px-4 py-2">خسرنا</th><th className="text-center px-4 py-2">Win Rate</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{competitors.data.map((c) => (
                <tr key={c.competitor}><td className="px-4 py-2 text-slate-700 font-semibold">{c.competitor}</td><td className="px-4 py-2 text-center text-slate-600">{c.faced}</td><td className="px-4 py-2 text-center text-emerald-600">{c.won}</td><td className="px-4 py-2 text-center text-rose-600">{c.lost}</td><td className="px-4 py-2 text-center"><span className={`font-black ${c.winRate >= 60 ? 'text-emerald-600' : c.winRate >= 45 ? 'text-amber-600' : 'text-rose-600'}`}>{c.winRate}%</span></td></tr>
              ))}</tbody>
            </table></div>}
      </div>

      {/* Segmentation */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2"><PieChart size={16} className="text-cyan-600" /> تجزئة العملاء (حسب القطاع)</h3>
        {segments.loading ? <p className="text-slate-400 text-sm">جارٍ…</p>
          : segments.data.length === 0 ? <p className="text-slate-400 text-sm py-4 text-center">لا عملاء فعليون بعد.</p>
            : <div className="rounded-xl border border-slate-200 overflow-hidden"><table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs"><tr><th className="text-right px-4 py-2">القطاع</th><th className="text-center px-4 py-2">العملاء</th><th className="text-center px-4 py-2">متوسط القيمة</th><th className="text-center px-4 py-2">إجمالي القيمة</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{segments.data.map((s) => (
                <tr key={s.segment}><td className="px-4 py-2 text-slate-700 font-semibold">{s.segment}</td><td className="px-4 py-2 text-center text-slate-600">{s.accounts}</td><td className="px-4 py-2 text-center font-mono text-slate-600">{s.avgLtv.toLocaleString('ar')}</td><td className="px-4 py-2 text-center font-mono font-semibold text-cyan-700">{s.totalLtv.toLocaleString('ar')}</td></tr>
              ))}</tbody>
            </table></div>}
      </div>

      {/* Account health */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h3 className="font-bold text-slate-800 text-sm mb-1 flex items-center gap-2"><HeartPulse size={16} className="text-cyan-600" /> مؤشر صحة الحساب</h3>
        <p className="text-xs text-slate-400 mb-3">أوزان: دخول {HEALTH_WEIGHTS_REFERENCE.login}% · استخدام {HEALTH_WEIGHTS_REFERENCE.usage}% · CSAT {HEALTH_WEIGHTS_REFERENCE.csat}% · تذاكر {HEALTH_WEIGHTS_REFERENCE.tickets}% · دفع {HEALTH_WEIGHTS_REFERENCE.payment}% · NPS {HEALTH_WEIGHTS_REFERENCE.nps}%.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <select value={selAccount} onChange={(e) => checkHealth(e.target.value)} className="py-2 px-3 text-sm rounded-xl border border-slate-200 outline-none">
            <option value="">اختر حساباً…</option>
            {accounts.data.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          {checking && <span className="text-sm text-slate-400">جارٍ الحساب…</span>}
          {tier && health != null && (
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-slate-800">{health}<span className="text-sm text-slate-400">/100</span></span>
              <span className={`text-xs font-bold border px-3 py-1 rounded-full ${tier.color}`}>{tier.label}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
