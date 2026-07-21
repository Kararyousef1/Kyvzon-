/**
 * SocialAnalyticsPage — التحليلات: KPIs (Reach/Engagement/CTR) + ROI مُنسب لكل منصة.
 */
import { useEffect, useState } from 'react';
import { socialAnalyticsService } from '../../../services/sdk';
import { useSocialKpis, PLATFORM_LABEL } from './useSocial';

export default function SocialAnalyticsPage() {
  const { data: k, loading } = useSocialKpis();
  const [byPlatform, setByPlatform] = useState<Array<{ platform: string; revenue: number; clicks: number; conversions: number }>>([]);

  useEffect(() => { socialAnalyticsService.revenueByPlatform().then(setByPlatform).catch(() => {}); }, []);
  const maxRev = Math.max(1, ...byPlatform.map((p) => p.revenue));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'الوصول (Reach)', v: loading ? '…' : k.totalReach.toLocaleString() },
          { l: 'الظهور (Impressions)', v: loading ? '…' : k.totalImpressions.toLocaleString() },
          { l: 'معدل التفاعل', v: loading ? '…' : `${k.engagementRate}%` },
          { l: 'CTR', v: loading ? '…' : `${k.clickThroughRate}%` },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{s.v}</p><p className="text-xs text-slate-500 mt-0.5">{s.l}</p></div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: 'إجمالي التفاعلات', v: loading ? '…' : k.totalEngagements.toLocaleString() },
          { l: 'نقرات', v: loading ? '…' : k.totalClicks.toLocaleString() },
          { l: 'منشورات منشورة', v: loading ? '…' : k.publishedPosts },
          { l: 'إيراد مُنسب', v: loading ? '…' : `$${k.attributedRevenue.toLocaleString()}` },
        ].map((s) => (
          <div key={s.l} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-2xl font-black text-slate-800">{s.v}</p><p className="text-xs text-slate-500 mt-0.5">{s.l}</p></div>
        ))}
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="font-black text-slate-800 mb-1">الإيراد المُنسب لكل منصة (ROI)</h2>
        <p className="text-xs text-slate-500 mb-4">عبر روابط UTM — أي منصة تحقق أعلى عائد.</p>
        {byPlatform.length === 0 ? <p className="text-slate-400 text-sm">لا بيانات إسناد بعد — احفظ روابط UTM من تبويب UTM.</p>
          : <div className="space-y-3">
              {byPlatform.map((p) => (
                <div key={p.platform}>
                  <div className="flex justify-between text-sm mb-1"><span className="font-semibold text-slate-700">{PLATFORM_LABEL[p.platform] || p.platform}</span><span className="text-emerald-600 font-bold">${p.revenue.toLocaleString()}</span></div>
                  <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden"><div className="h-full bg-fuchsia-500" style={{ width: `${(p.revenue / maxRev) * 100}%` }} /></div>
                  <p className="text-[11px] text-slate-400 mt-0.5">{p.clicks} نقرة · {p.conversions} تحويل</p>
                </div>
              ))}
            </div>}
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        تحويل التعليقات → عملاء محتملين يظهر في الوحدة 1 (أتمتة التسويق)؛ والإيراد المُنسب يربط UTM بالمبيعات — إسناد كامل من المنشور إلى الصفقة.
      </div>
    </div>
  );
}
