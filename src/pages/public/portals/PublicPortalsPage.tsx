import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Layers } from 'lucide-react';
import { PORTALS } from '../landing/data';
import { LangProvider } from '../landing/LangContext';
import { useThemeInjector } from '../landing/ThemeInjector';
import { Footer } from '../landing/sections/Footer';
import { ContactFab } from '../landing/sections/ContactFab';
import '../landing/styles.css';
import { publicSiteConfigService, type PublicSiteConfig } from '../../../services/sdk';

function PortalsContent() {
  const navigate = useNavigate();
  const [publicConfig, setPublicConfig] = useState<PublicSiteConfig | null>(null);
  useEffect(() => { window.scrollTo(0, 0); publicSiteConfigService.getConfig().then(setPublicConfig).catch(() => undefined); }, []);
  useThemeInjector(publicConfig?.theme);
  const displayPortals = publicConfig?.portals?.length
    ? publicConfig.portals.filter((p) => p.enabled !== false).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((p) => ({ ...p, icon: Layers }))
    : PORTALS.filter((p) => p.id !== 'developer');

  return (
    <div className="kv-root min-h-screen" dir="rtl">
      {/* شريط علوي */}
      <div className="glass-header" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
        <div className="kv-container flex items-center justify-between" style={{ height: 64 }}>
          <button onClick={() => navigate('/')} className="font-black text-xl" style={{ color: 'var(--kv-text-hi)' }}>
            Kyv<span style={{ color: 'var(--kv-accent-1)' }}>zon</span>
          </button>
          <button onClick={() => navigate('/signup?intent=demo')} className="btn-primary !py-2 !px-5 text-sm">ابدأ مجانًا</button>
        </div>
      </div>

      {/* Hero القسم */}
      <section className="hero-grid" style={{ paddingBlock: 'clamp(3.5rem, 7vw, 5.5rem)' }}>
        <div className="kv-container text-center">
          <span className="kv-eyebrow"><Layers size={13} /> بوابات KYVZON</span>
          <h1 className="kv-h2 mt-4" style={{ fontSize: 'var(--kv-fs-h1)' }}>استكشف بوابات المنصة</h1>
          <p className="kv-lead mx-auto" style={{ maxWidth: '42rem' }}>
            تعرّف على كل بوابة، وحداتها، وكيف تساعد شركتك على إدارة الموارد البشرية والتشغيل والمالية والمبيعات.
          </p>
        </div>
      </section>

      {/* شبكة البوابات */}
      <section className="kv-section" style={{ paddingTop: 0, background: 'var(--kv-bg-alt)' }}>
        <div className="kv-container" style={{ paddingTop: 'var(--kv-space-10)' }}>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayPortals.map((p) => {
              const Icon = p.icon;
              const color = p.color || '#1466d8';
              return (
                <button key={p.id} onClick={() => navigate(`/portals/${p.id}`)} className="kv-card text-start h-full flex flex-col group" aria-label={p.title.ar}>
                  {/* شريط لوني علوي */}
                  <div style={{ position: 'absolute', insetInlineStart: 0, insetInlineEnd: 0, top: 0, height: 4, borderRadius: '22px 22px 0 0', background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
                  <div className="kv-icon-box" style={{ background: `${color}14`, color, marginBottom: 'var(--kv-space-4)' }}>
                    <Icon size={24} />
                  </div>
                  <h2 className="font-black mb-2" style={{ color: 'var(--kv-text-hi)', fontSize: '1.2rem' }}>{p.title.ar}</h2>
                  <p style={{ color: 'var(--kv-text-body)', fontSize: '0.9rem', lineHeight: 1.75, marginBottom: 'var(--kv-space-5)', flex: 1 }}>{p.desc.ar}</p>
                  <div className="space-y-2.5">
                    {p.features.ar.slice(0, 3).map((f) => (
                      <div key={f} className="flex items-center gap-2" style={{ color: 'var(--kv-text-body)', fontSize: '0.83rem', fontWeight: 500 }}>
                        <CheckCircle size={14} style={{ color, flexShrink: 0 }} /> {f}
                      </div>
                    ))}
                  </div>
                  <div className="mt-6 pt-4 text-sm font-bold flex items-center gap-2" style={{ color, borderTop: '1px solid var(--kv-border)' }}>
                    استكشف التفاصيل <ArrowLeft size={14} className="transition-transform group-hover:-translate-x-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <Footer publicConfig={publicConfig || undefined} />
      <ContactFab publicConfig={publicConfig || undefined} />
    </div>
  );
}

export default function PublicPortalsPage() {
  return (
    <LangProvider>
      <PortalsContent />
    </LangProvider>
  );
}
