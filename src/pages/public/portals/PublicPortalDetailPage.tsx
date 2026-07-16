import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, Image as ImageIcon, Layers } from 'lucide-react';
import { PORTALS } from '../landing/data';
import '../landing/styles.css';
import { publicSiteConfigService, type PublicSiteConfig } from '../../../services/sdk';

export default function PublicPortalDetailPage() {
  const { portalId } = useParams();
  const navigate = useNavigate();
  const [publicConfig, setPublicConfig] = useState<PublicSiteConfig | null>(null);
  useEffect(() => { publicSiteConfigService.getConfig().then(setPublicConfig).catch(() => undefined); }, []);
  const dynamicPortal = publicConfig?.portals?.find(p => p.id === portalId && p.enabled !== false);
  const portal = dynamicPortal ? { ...dynamicPortal, icon: Layers, gradient: dynamicPortal.gradient || 'from-indigo-500 to-violet-600' } : (PORTALS.find(p => p.id === portalId) || PORTALS[0]);
  const Icon = portal.icon;

  return (
    <div className="kv-root min-h-screen hero-grid" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 md:px-8 py-24">
        <button onClick={() => navigate('/portals')} className="btn-outline py-2 px-4 mb-8"><ArrowRight size={16}/> كل البوابات</button>
        <div className="glass-dark rounded-3xl p-8 md:p-12 border border-white/10">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="w-20 h-20 rounded-3xl flex items-center justify-center mb-6" style={{ background: `${portal.color}20`, border: `1px solid ${portal.color}44` }}><Icon size={36} style={{ color: portal.color }}/></div>
              <h1 className="text-3xl md:text-4xl font-black text-white mb-4">{portal.title.ar}</h1>
              <p className="text-white/70 leading-8 text-lg">{portal.desc.ar}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button onClick={() => navigate(`/signup?intent=service&service=${encodeURIComponent(portal.id)}&label=${encodeURIComponent(portal.title.ar)}`)} className="btn-primary">اطلب هذه البوابة</button>
                <button onClick={() => navigate('/signup?intent=demo')} className="btn-outline">ابدأ مجانًا</button>
              </div>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5">
              <div className="aspect-video rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 border border-white/10 flex flex-col items-center justify-center text-white/45">
                <ImageIcon size={46} className="mb-3" />
                <div className="font-bold">لقطات توضيحية للبوابة</div>
                <div className="text-xs mt-1">يمكن إدارتها لاحقًا من صفحة الزوار في بوابة المطور</div>
              </div>
            </div>
          </div>
          <div className="mt-12 grid md:grid-cols-2 gap-4">
            {portal.features.ar.map(f => <div key={f} className="rounded-2xl bg-white/[0.04] border border-white/10 p-4 flex items-center gap-3 text-white/75"><CheckCircle size={18} style={{ color: portal.color }}/><span>{f}</span></div>)}
          </div>
        </div>
      </div>
    </div>
  );
}
