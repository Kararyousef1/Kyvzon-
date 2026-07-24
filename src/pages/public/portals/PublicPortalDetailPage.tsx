/**
 * ════════════════════════════════════════════════════════════════════════════
 *  PublicPortalDetailPage — صفحة تفاصيل البوابة الكاملة (نمط Odoo، ثيم فاتح)
 *
 *  التدفّق: ضغط بطاقة بوابة → صفحة كاملة مستقلة:
 *   شريط علوي → Hero → نظرة عامة + بطاقة معلومات → كل الوحدات (شبكة) →
 *   لماذا Kyvzon → بوابات مرتبطة → CTA → فوتر كامل.
 *  البيانات الكاملة من PORTAL_EXTRAS (portalModules.ts) المستخرجة من تقارير المشروع.
 * ════════════════════════════════════════════════════════════════════════════
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, Layers, ShieldCheck, Zap, Headphones, Sparkles, Route, Users, Plug } from 'lucide-react';
import { PORTALS } from '../landing/data';
import { PORTAL_EXTRAS } from '../landing/portalModules';
import { LangProvider } from '../landing/LangContext';
import { useThemeInjector } from '../landing/ThemeInjector';
import { Footer } from '../landing/sections/Footer';
import { ContactFab } from '../landing/sections/ContactFab';
import '../landing/styles.css';
import { publicSiteConfigService, type PublicSiteConfig } from '../../../services/sdk';

function PortalDetailContent() {
  const { portalId } = useParams();
  const navigate = useNavigate();
  const [publicConfig, setPublicConfig] = useState<PublicSiteConfig | null>(null);
  useEffect(() => { publicSiteConfigService.getConfig().then(setPublicConfig).catch(() => undefined); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [portalId]);
  useThemeInjector(publicConfig?.theme);

  const dynamicPortal = publicConfig?.portals?.find((p) => p.id === portalId && p.enabled !== false);
  const portal = dynamicPortal
    ? { ...dynamicPortal, icon: Layers, gradient: dynamicPortal.gradient || 'from-sky-500 to-blue-600' }
    : (PORTALS.find((p) => p.id === portalId) || PORTALS[0]);
  const Icon = portal.icon;
  const color = portal.color || '#0c8de7';
  const soft = `${color}14`;
  const extra = portalId ? PORTAL_EXTRAS[portalId] : undefined;
  const modules = extra?.modules || [];

  const others = PORTALS.filter((p) => p.id !== portal.id && p.id !== 'developer').slice(0, 4);

  return (
    <div className="kv-root min-h-screen" dir="rtl">
      {/* ─── شريط علوي ─── */}
      <div className="glass-header" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between" style={{ height: 64 }}>
          <button onClick={() => navigate('/')} className="font-black text-xl" style={{ color: 'var(--kv-text-hi)' }}>
            Kyv<span style={{ color: 'var(--kv-accent-1)' }}>zon</span>
          </button>
          <button onClick={() => navigate('/portals')} className="btn-outline !py-2 !px-4 text-sm">
            <ArrowRight size={16} /> كل البوابات
          </button>
        </div>
      </div>

      <main>
        {/* ─── Hero ─── */}
        <section className="hero-grid" style={{ padding: '4.5rem 0' }}>
          <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: soft }}>
                <Icon size={32} style={{ color }} />
              </div>
              <span className="badge mb-3" style={{ background: soft, color, borderColor: `${color}33` }}>
                <span className="glow-dot" style={{ background: color, boxShadow: `0 0 0 4px ${color}22` }} />
                {portal.title.ar}
              </span>
              <h1 className="font-black leading-tight" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(2rem, 4vw, 3rem)', marginTop: '0.6rem' }}>
                {portal.title.ar}
              </h1>
              <p className="mt-4 text-lg" style={{ color: 'var(--kv-text-body)', maxWidth: '34rem' }}>
                {extra?.tagline.ar || portal.desc.ar}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button onClick={() => navigate(`/signup?intent=service&service=${encodeURIComponent(portal.id)}&label=${encodeURIComponent(portal.title.ar)}`)} className="btn-primary">
                  اطلب هذه البوابة
                </button>
                <button onClick={() => navigate('/signup?intent=demo')} className="btn-outline">ابدأ مجاناً</button>
              </div>
              <div className="mt-4 text-sm" style={{ color: 'var(--kv-text-muted)' }}>
                ✓ مجاني للتجربة · ✓ بلا بطاقة ائتمان · ✓ دعم عربي كامل
              </div>
            </div>

            {/* بطاقة معلومات البوابة */}
            <div className="portal-card !cursor-default">
              <div className="flex items-center gap-2 mb-4 text-sm font-bold" style={{ color }}>
                <Sparkles size={16} /> معلومات البوابة
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--kv-bg-alt)', border: '1px solid var(--kv-border)' }}>
                  <Layers size={18} style={{ color, flexShrink: 0 }} />
                  <span style={{ color: 'var(--kv-text-hi)', fontWeight: 600, fontSize: '0.9rem' }}>
                    {modules.length || portal.features.ar.length} وحدة متكاملة
                  </span>
                </div>
                {extra?.roles && (
                  <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--kv-bg-alt)', border: '1px solid var(--kv-border)' }}>
                    <Users size={18} style={{ color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--kv-text-hi)', fontWeight: 600, fontSize: '0.85rem' }}>{extra.roles}</span>
                  </div>
                )}
                {extra?.path && (
                  <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--kv-bg-alt)', border: '1px solid var(--kv-border)' }}>
                    <Route size={18} style={{ color, flexShrink: 0 }} />
                    <span style={{ color: 'var(--kv-text-hi)', fontWeight: 600, fontSize: '0.85rem', direction: 'ltr' }}>{extra.path}</span>
                  </div>
                )}
                {extra?.integrations?.length ? (
                  <div className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'var(--kv-bg-alt)', border: '1px solid var(--kv-border)' }}>
                    <Plug size={18} style={{ color, flexShrink: 0, marginTop: 2 }} />
                    <span style={{ color: 'var(--kv-text-hi)', fontWeight: 600, fontSize: '0.85rem' }}>
                      تكاملات: {extra.integrations.join(' · ')}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        {/* ─── نظرة عامة ─── */}
        {extra?.overview && (
          <section style={{ padding: '3.5rem 0', background: 'var(--kv-bg-alt)' }}>
            <div className="max-w-4xl mx-auto px-6 text-center">
              <div className="section-label" style={{ background: soft, color, borderColor: `${color}33` }}>نظرة عامة</div>
              <p style={{ color: 'var(--kv-text-hi)', fontSize: '1.25rem', lineHeight: 1.9, fontWeight: 500, marginTop: '0.5rem' }}>
                {extra.overview.ar}
              </p>
            </div>
          </section>
        )}

        {/* ─── كل الوحدات (شبكة كاملة) ─── */}
        {modules.length > 0 && (
          <section style={{ padding: '4.5rem 0' }}>
            <div className="max-w-6xl mx-auto px-6">
              <div className="text-center mb-12 mx-auto" style={{ maxWidth: '42rem' }}>
                <div className="section-label" style={{ background: soft, color, borderColor: `${color}33` }}>الوحدات ({modules.length})</div>
                <h2 className="font-black" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>
                  كل وحدات {portal.title.ar}
                </h2>
                <p className="mt-3" style={{ color: 'var(--kv-text-body)' }}>
                  وحدات متكاملة تعمل بتناغم لتغطية كل احتياجاتك.
                </p>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                {modules.map((mod, i) => (
                  <div key={i} className="service-card h-full">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4" style={{ background: soft }}>
                      <span style={{ color, fontWeight: 900, fontSize: '1rem' }}>{i + 1}</span>
                    </div>
                    <h3 className="font-black mb-2" style={{ color: 'var(--kv-text-hi)', fontSize: '1.02rem' }}>{mod.title.ar}</h3>
                    <p style={{ color: 'var(--kv-text-body)', fontSize: '0.88rem', lineHeight: 1.7 }}>{mod.desc.ar}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ─── لماذا Kyvzon ─── */}
        <section style={{ padding: '4.5rem 0', background: 'var(--kv-bg-alt)' }}>
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-12 mx-auto" style={{ maxWidth: '40rem' }}>
              <div className="section-label">لماذا Kyvzon</div>
              <h2 className="font-black" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>مبنية لتُنجز، لا لتُعقّد</h2>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
              {[
                { icon: ShieldCheck, t: 'أمان كامل', d: 'تشفير وعزل بيانات لكل شركة على حدة.' },
                { icon: Zap, t: 'أداء سريع', d: 'واجهات سريعة حتى مع آلاف السجلات.' },
                { icon: Layers, t: 'متكاملة', d: 'تعمل بتناغم مع باقي بوابات المنصة.' },
                { icon: Headphones, t: 'دعم عربي', d: 'فريق يفهم سوقك ويرافقك خطوة بخطوة.' },
              ].map((b, i) => {
                const B = b.icon;
                return (
                  <div key={i} className="stat-card !text-start">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3" style={{ background: 'var(--kv-bg-deep)' }}>
                      <B size={20} style={{ color: 'var(--kv-accent-1)' }} />
                    </div>
                    <h3 className="font-black mb-1" style={{ color: 'var(--kv-text-hi)', fontSize: '0.98rem' }}>{b.t}</h3>
                    <p style={{ color: 'var(--kv-text-body)', fontSize: '0.83rem' }}>{b.d}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── بوابات مرتبطة ─── */}
        <section style={{ padding: '4.5rem 0' }}>
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-10 mx-auto" style={{ maxWidth: '40rem' }}>
              <div className="section-label">اكتشف المزيد</div>
              <h2 className="font-black" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>بوابات أخرى قد تهمّك</h2>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
              {others.map((p) => {
                const PI = p.icon;
                return (
                  <button key={p.id} onClick={() => navigate(`/portals/${p.id}`)} className="portal-card text-start">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: `${p.color}14` }}>
                      <PI size={22} style={{ color: p.color }} />
                    </div>
                    <h3 className="font-black mb-1" style={{ color: 'var(--kv-text-hi)', fontSize: '0.95rem' }}>{p.title.ar}</h3>
                    <div className="mt-2 text-sm font-bold" style={{ color: 'var(--kv-accent-2)' }}>اعرف المزيد ←</div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── CTA ─── */}
        <section style={{ padding: '4.5rem 0', background: 'var(--kv-bg-alt)' }}>
          <div className="max-w-6xl mx-auto px-6">
            <div className="rounded-3xl p-10 md:p-14 text-center" style={{ background: 'var(--kv-accent-grad)' }}>
              <h2 className="font-black text-white" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>جاهز لتفعيل {portal.title.ar}؟</h2>
              <p className="mt-3 mb-7" style={{ color: 'rgba(255,255,255,0.9)' }}>ابدأ اليوم مجاناً — بلا بطاقة ائتمان، وبدعم عربي كامل.</p>
              <button onClick={() => navigate('/signup?intent=demo')} className="btn-primary" style={{ background: '#fff', color: 'var(--kv-accent-3)' }}>
                ابدأ الآن مجاناً
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ─── فوتر كامل ─── */}
      <Footer publicConfig={publicConfig || undefined} />
      <ContactFab publicConfig={publicConfig || undefined} />
    </div>
  );
}

export default function PublicPortalDetailPage() {
  return (
    <LangProvider>
      <PortalDetailContent />
    </LangProvider>
  );
}
