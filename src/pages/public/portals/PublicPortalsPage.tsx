import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Layers } from 'lucide-react';
import { PORTALS } from '../landing/data';
import '../landing/styles.css';
import { publicSiteConfigService, type PublicSiteConfig } from '../../../services/sdk';

export default function PublicPortalsPage() {
  const navigate = useNavigate();
  const [publicConfig, setPublicConfig] = useState<PublicSiteConfig | null>(null);
  useEffect(() => { publicSiteConfigService.getConfig().then(setPublicConfig).catch(() => undefined); }, []);
  const displayPortals = publicConfig?.portals?.length ? publicConfig.portals.filter(p => p.enabled !== false).sort((a,b)=>(a.order??0)-(b.order??0)).map(p => ({ ...p, icon: Layers })) : PORTALS;
  return (
    <div className="kv-root min-h-screen hero-grid" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 md:px-8 py-24">
        <div className="flex items-center justify-between mb-10">
          <button onClick={() => navigate('/')} className="btn-outline py-2 px-4">العودة للرئيسية</button>
          <button onClick={() => navigate('/signup?intent=demo')} className="btn-primary py-2 px-4">ابدأ مجانًا</button>
        </div>
        <div className="text-center mb-14">
          <div className="section-label mx-auto">بوابات KYVZON</div>
          <h1 className="section-title text-4xl font-black text-white mt-3">استكشف بوابات المنصة</h1>
          <p className="text-white/60 mt-4 max-w-2xl mx-auto">تعرف على كل بوابة، مميزاتها، وكيف تساعد شركتك على إدارة الموارد البشرية والتشغيل والاتصال والتقنية.</p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayPortals.map((p) => {
            const Icon = p.icon;
            return (
              <button key={p.id} onClick={() => navigate(`/portals/${p.id}`)} className="service-card text-right h-full group">
                <div className="w-14 h-14 rounded-2xl mb-4 flex items-center justify-center" style={{ background: `${p.color}18` }}><Icon size={24} style={{ color: p.color }}/></div>
                <h2 className="font-black text-white text-lg mb-2">{p.title.ar}</h2>
                <p className="text-white/65 text-sm leading-7 mb-5">{p.desc.ar}</p>
                <div className="space-y-2">
                  {p.features.ar.slice(0,3).map(f => <div key={f} className="flex items-center gap-2 text-white/65 text-xs"><CheckCircle size={13} style={{ color: p.color }}/>{f}</div>)}
                </div>
                <div className="mt-6 text-sm font-bold flex items-center gap-2" style={{ color: p.color }}>استكشف التفاصيل <ArrowLeft size={14} className="group-hover:-translate-x-1 transition-transform"/></div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
