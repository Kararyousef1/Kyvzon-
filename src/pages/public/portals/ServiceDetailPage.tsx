/**
 * ════════════════════════════════════════════════════════════════════════════
 *  ServiceDetailPage — صفحة تفاصيل الخدمة الغنية (نمط Odoo، ثيم فاتح)
 *
 *  التدفّق: المستخدم يضغط بطاقة خدمة في الرئيسية → تفتح هذه الصفحة (لا التسجيل):
 *   Hero الخدمة → المنافع (كتل) → كيف نعمل (خطوات) → خدمات مرتبطة → CTA.
 *  المحتوى من EXTRA_SERVICES + SERVICE_DETAILS.
 * ════════════════════════════════════════════════════════════════════════════
 */
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle, Sparkles } from 'lucide-react';
import { EXTRA_SERVICES } from '../landing/data';
import { SERVICE_DETAILS } from '../landing/serviceDetails';
import { LangProvider } from '../landing/LangContext';
import { useThemeInjector } from '../landing/ThemeInjector';
import { Footer } from '../landing/sections/Footer';
import { ContactFab } from '../landing/sections/ContactFab';
import '../landing/styles.css';
import { publicSiteConfigService, type PublicSiteConfig } from '../../../services/sdk';

function ServiceDetailContent() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const [publicConfig, setPublicConfig] = useState<PublicSiteConfig | null>(null);
  useEffect(() => { publicSiteConfigService.getConfig().then(setPublicConfig).catch(() => undefined); }, []);
  useEffect(() => { window.scrollTo(0, 0); }, [serviceId]);
  useThemeInjector(publicConfig?.theme);

  const service = EXTRA_SERVICES.find((s) => s.id === serviceId) || EXTRA_SERVICES[0];
  const Icon = service.icon;
  const color = service.color || '#0c8de7';
  const soft = `${color}14`;
  const extra = service.id ? SERVICE_DETAILS[service.id] : undefined;

  const others = EXTRA_SERVICES.filter((s) => s.id !== service.id).slice(0, 3);

  return (
    <div className="kv-root min-h-screen" dir="rtl">
      {/* ─── شريط علوي ─── */}
      <div className="glass-header" style={{ position: 'sticky', top: 0, zIndex: 30 }}>
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between" style={{ height: 64 }}>
          <button onClick={() => navigate('/')} className="font-black text-xl" style={{ color: 'var(--kv-text-hi)' }}>
            Kyv<span style={{ color: 'var(--kv-accent-1)' }}>zon</span>
          </button>
          <button onClick={() => navigate('/#services')} className="btn-outline !py-2 !px-4 text-sm">
            <ArrowRight size={16} /> كل الخدمات
          </button>
        </div>
      </div>

      <main>
        {/* ─── Hero الخدمة ─── */}
        <section className="hero-grid" style={{ padding: '4.5rem 0' }}>
          <div className="max-w-6xl mx-auto px-6 grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-5" style={{ background: soft }}>
                <Icon size={32} style={{ color }} />
              </div>
              <span className="badge mb-3" style={{ background: soft, color, borderColor: `${color}33` }}>
                {service.badge.ar}
              </span>
              <h1 className="font-black leading-tight" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(2rem, 4vw, 3rem)', marginTop: '0.6rem' }}>
                {service.title.ar}
              </h1>
              <p className="mt-4 text-lg" style={{ color: 'var(--kv-text-body)', maxWidth: '34rem' }}>
                {extra?.tagline.ar || service.desc.ar}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <button
                  onClick={() => navigate(`/signup?intent=service&service=${encodeURIComponent(service.id || service.title.en)}&label=${encodeURIComponent(service.title.ar)}`)}
                  className="btn-primary"
                >
                  اطلب هذه الخدمة
                </button>
                <button onClick={() => navigate('/contact')} className="btn-outline">تحدّث مع مستشار</button>
              </div>
              <div className="mt-4 text-sm font-bold" style={{ color }}>{service.promo.ar}</div>
            </div>

            {/* بطاقة المنافع المصغّرة */}
            <div className="service-card !cursor-default">
              <div className="flex items-center gap-2 mb-4 text-sm font-bold" style={{ color }}>
                <Sparkles size={16} /> لماذا تختار هذه الخدمة
              </div>
              <div className="space-y-3">
                {(extra?.benefits || []).slice(0, 4).map((b, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl p-3" style={{ background: 'var(--kv-bg-alt)', border: '1px solid var(--kv-border)' }}>
                    <CheckCircle size={18} style={{ color, flexShrink: 0, marginTop: 2 }} />
                    <span style={{ color: 'var(--kv-text-hi)', fontWeight: 600, fontSize: '0.88rem' }}>{b.title.ar}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── المنافع (كتل تفصيلية) ─── */}
        {extra?.benefits?.length ? (
          <section style={{ padding: '4.5rem 0', background: 'var(--kv-bg-alt)' }}>
            <div className="max-w-6xl mx-auto px-6">
              <div className="text-center mb-12 mx-auto" style={{ maxWidth: '40rem' }}>
                <div className="section-label" style={{ background: soft, color, borderColor: `${color}33` }}>المنافع</div>
                <h2 className="font-black" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>ماذا تكسب مع هذه الخدمة</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {extra.benefits.map((b, i) => (
                  <div key={i} className="service-card h-full flex gap-4 items-start">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: soft }}>
                      <CheckCircle size={20} style={{ color }} />
                    </div>
                    <div>
                      <h3 className="font-black mb-1" style={{ color: 'var(--kv-text-hi)', fontSize: '1.05rem' }}>{b.title.ar}</h3>
                      <p style={{ color: 'var(--kv-text-body)', fontSize: '0.9rem', lineHeight: 1.75 }}>{b.desc.ar}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* ─── كيف نعمل (خطوات) ─── */}
        {extra?.steps?.length ? (
          <section style={{ padding: '4.5rem 0' }}>
            <div className="max-w-6xl mx-auto px-6">
              <div className="text-center mb-12 mx-auto" style={{ maxWidth: '40rem' }}>
                <div className="section-label">كيف نعمل</div>
                <h2 className="font-black" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>خطوات واضحة من البداية للإطلاق</h2>
              </div>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
                {extra.steps.map((s, i) => (
                  <div key={i} className="stat-card !text-start relative">
                    <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-3 font-black" style={{ background: soft, color, fontSize: '1.1rem' }}>
                      {i + 1}
                    </div>
                    <h3 className="font-black mb-1" style={{ color: 'var(--kv-text-hi)', fontSize: '0.98rem' }}>{s.title.ar}</h3>
                    <p style={{ color: 'var(--kv-text-body)', fontSize: '0.85rem' }}>{s.desc.ar}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* ─── خدمات مرتبطة ─── */}
        <section style={{ padding: '4.5rem 0', background: 'var(--kv-bg-alt)' }}>
          <div className="max-w-6xl mx-auto px-6">
            <div className="text-center mb-10 mx-auto" style={{ maxWidth: '40rem' }}>
              <div className="section-label">اكتشف المزيد</div>
              <h2 className="font-black" style={{ color: 'var(--kv-text-hi)', fontSize: 'clamp(1.5rem, 3vw, 2rem)' }}>خدمات أخرى قد تهمّك</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              {others.map((s) => {
                const SI = s.icon;
                return (
                  <button key={s.id} onClick={() => navigate(`/services/${s.id}`)} className="service-card text-start">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3" style={{ background: `${s.color}14` }}>
                      <SI size={22} style={{ color: s.color }} />
                    </div>
                    <h3 className="font-black mb-1" style={{ color: 'var(--kv-text-hi)', fontSize: '0.95rem' }}>{s.title.ar}</h3>
                    <p style={{ color: 'var(--kv-text-body)', fontSize: '0.82rem' }}>{s.desc.ar}</p>
                    <div className="mt-3 text-sm font-bold" style={{ color: 'var(--kv-accent-2)' }}>اعرف المزيد ←</div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── CTA ختامي ─── */}
        <section style={{ padding: '4.5rem 0' }}>
          <div className="max-w-6xl mx-auto px-6">
            <div className="rounded-3xl p-10 md:p-14 text-center" style={{ background: 'var(--kv-accent-grad)' }}>
              <h2 className="font-black text-white" style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)' }}>مهتم بـ {service.title.ar}؟</h2>
              <p className="mt-3 mb-7" style={{ color: 'rgba(255,255,255,0.9)' }}>تواصل معنا اليوم ودعنا نحوّل فكرتك إلى واقع.</p>
              <button
                onClick={() => navigate(`/signup?intent=service&service=${encodeURIComponent(service.id || service.title.en)}&label=${encodeURIComponent(service.title.ar)}`)}
                className="btn-primary"
                style={{ background: '#fff', color: 'var(--kv-accent-3)' }}
              >
                اطلب الخدمة الآن
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

export default function ServiceDetailPage() {
  return (
    <LangProvider>
      <ServiceDetailContent />
    </LangProvider>
  );
}
