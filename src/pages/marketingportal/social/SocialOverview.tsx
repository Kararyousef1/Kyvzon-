/**
 * SocialOverview — نظرة عامة: KPIs + المنصات + تردد النشر + قاعدة 80/20.
 */
import { Eye, TrendingUp, MousePointerClick, DollarSign } from 'lucide-react';
import { PLATFORM_META, POSTING_FREQUENCY } from '../../../services/sdk';
import { useSocialKpis } from './useSocial';

function Stat({ icon: Icon, label, value }: { icon: typeof Eye; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="w-9 h-9 rounded-xl bg-fuchsia-50 text-fuchsia-600 flex items-center justify-center"><Icon size={18} /></div>
      <p className="text-2xl font-black text-slate-800 mt-3">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

export default function SocialOverview() {
  const { data: k, loading } = useSocialKpis();
  const platforms = Object.entries(PLATFORM_META) as Array<[string, { label: string; audience: string; bestContent: string }]>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Eye} label="إجمالي الوصول (Reach)" value={loading ? '…' : k.totalReach.toLocaleString()} />
        <Stat icon={TrendingUp} label="معدل التفاعل" value={loading ? '…' : `${k.engagementRate}%`} />
        <Stat icon={MousePointerClick} label="نقرات (CTR)" value={loading ? '…' : `${k.clickThroughRate}%`} />
        <Stat icon={DollarSign} label="إيراد مُنسب" value={loading ? '…' : `$${k.attributedRevenue.toLocaleString()}`} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">المنصات وطبيعة كل منها</h2>
        <p className="text-xs text-slate-500 mb-4">اختر المنصة المناسبة لكل هدف.</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {platforms.map(([key, m]) => (
            <div key={key} className="rounded-xl border border-slate-100 p-4">
              <p className="font-bold text-slate-800">{m.label}</p>
              <p className="text-[11px] text-slate-400 mt-1">👥 {m.audience}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">✨ {m.bestContent}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black text-slate-800 mb-4">تردد النشر الموصى به</h2>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-400"><tr><th className="text-right pb-2">المنصة</th><th className="text-right pb-2">التردد</th><th className="text-right pb-2">أفضل وقت</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {POSTING_FREQUENCY.map((p) => (
                <tr key={p.platform}><td className="py-2 font-semibold text-slate-700">{p.platform}</td><td className="py-2 text-slate-600">{p.frequency}</td><td className="py-2 text-xs text-slate-400">{p.bestTime}</td></tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-black text-slate-800 mb-4">قاعدة المحتوى 80/20</h2>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="font-semibold text-slate-700">محتوى يُضيف قيمة</span><span className="text-fuchsia-600 font-bold">80%</span></div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-fuchsia-500" style={{ width: '80%' }} /></div>
              <p className="text-[11px] text-slate-400 mt-1">تعليم · إلهام · ترفيه · بيانات</p>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1"><span className="font-semibold text-slate-700">محتوى ترويجي</span><span className="text-amber-500 font-bold">20%</span></div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-amber-400" style={{ width: '20%' }} /></div>
              <p className="text-[11px] text-slate-400 mt-1">عروض · أسعار · ميزات</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
