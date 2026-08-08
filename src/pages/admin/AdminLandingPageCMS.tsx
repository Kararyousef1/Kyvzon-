import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight, Check, Eye, Globe, Layout, Loader2, Palette, RotateCcw,
  Save, Settings, Sparkles, ToggleLeft, ToggleRight, Type, Layers,
} from 'lucide-react';
import { useUIStore, type LandingConfig } from '../../core/stores';
import { settingsService, publicSiteConfigService, DEFAULT_PUBLIC_SITE_CONFIG, type PublicSiteConfig } from '../../services/sdk';
import { PORTALS, PLANS, EXTRA_SERVICES } from '../public/landing/data';
import LandingPage from '../public/LandingPage';
import { getErrorMessage } from '../../services/errors';

const DEFAULT_LANDING_CONFIG: LandingConfig = {
  themeColor: '#4f46e5',
  logoSymbol: 'K',
  logoUrl: '',
  logoTextAr: 'Kyvzon',
  logoTextEn: 'Kyvzon',
  heroTitleAr: 'منصة SaaS متكاملة لإدارة مؤسستك',
  heroTitleEn: 'Complete SaaS Platform for Your Organization',
  heroDescAr: 'بوابات الموظف وHR والإدارة والمدير والمشرف والحركة والتواصل والتقنية، مع تحكم مركزي بالاشتراكات والتفعيل.',
  heroDescEn: 'Employee, HR, admin, manager, supervisor, movement, communication and tech portals with centralized subscription control.',
  aboutP1Ar: 'KYVZON منصة سحابية متكاملة لإدارة الموارد البشرية والعمليات المؤسسية.',
  aboutP1En: 'KYVZON is a cloud SaaS platform for HR and business operations.',
  aboutP2Ar: 'نركز على الأمان، عزل الشركات، وتجربة استخدام احترافية.',
  aboutP2En: 'We focus on security, tenant isolation and professional user experience.',
  aboutP3Ar: 'هدفنا تمكين الشركات في العراق والمنطقة من التحول الرقمي بثقة.',
  aboutP3En: 'Our mission is enabling companies in Iraq and the region to transform digitally.',
  addressAr: 'بغداد، العراق',
  addressEn: 'Baghdad, Iraq',
  mapUrl: '',
  showCareSection: true,
  showAgentsSection: false,
  showLocationSection: true,
  showMarketingSection: true,
  marketingTitleAr: 'منصة واحدة — بوابات متعددة',
  marketingTitleEn: 'One platform — multiple portals',
  marketingIntroAr: 'كل بوابة تخدم دورًا محددًا داخل المؤسسة وتُفعّل حسب الاشتراك.',
  marketingIntroEn: 'Each portal serves a specific organizational role and is activated by subscription.',
  marketingVisionTitleAr: 'رؤيتنا',
  marketingVisionTitleEn: 'Our Vision',
  marketingVisionTextAr: 'أن تكون KYVZON منصة SaaS قياسية لإدارة المؤسسات في المنطقة.',
  marketingVisionTextEn: 'To make KYVZON a standard SaaS platform for regional organizations.',
  marketingCommitmentAr: 'نلتزم ببناء منصة آمنة وقابلة للتوسع.',
  marketingCommitmentEn: 'We are committed to building a secure and scalable platform.',
  showVideoSection: false,
  youtubeUrl: '',
  videos: [],
  products: [],
  customNavLinks: [],
  stats: [],
  socialLinks: {},
  phone: '+964 XXX XXX XXXX',
  email: 'hello@kyvzon.com',
};

type Tab = 'identity' | 'hero' | 'sections' | 'portals' | 'publicSite' | 'preview';
type Toast = { message: string; type: 'success' | 'error' | 'info' } | null;

export default function AdminLandingPageCMS() {
  const navigate = useNavigate();
  const { updateLandingConfig, addToast } = useUIStore();
  const [activeTab, setActiveTab] = useState<Tab>('identity');
  const [config, setConfig] = useState<LandingConfig>(DEFAULT_LANDING_CONFIG);
  const [publicConfig, setPublicConfig] = useState<PublicSiteConfig>(DEFAULT_PUBLIC_SITE_CONFIG);
  const [portalVisibility, setPortalVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  // ★ تأكيد التراجع — بديل confirm() المحظور
  const [confirmReset, setConfirmReset] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const themeColor = config.themeColor || '#4f46e5';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [landing, publicSite] = await Promise.all([
        settingsService.findLandingConfig().catch(() => null),
        publicSiteConfigService.getConfig().catch(() => DEFAULT_PUBLIC_SITE_CONFIG),
      ]);
      const nextLanding = { ...DEFAULT_LANDING_CONFIG, ...(landing || {}) } as LandingConfig;
      const visibility = ((landing as any)?.portalVisibility || {}) as Record<string, boolean>;
      setConfig(nextLanding);
      setPublicConfig(publicSite);
      setPortalVisibility(Object.fromEntries(PORTALS.map((p) => [p.id, visibility[p.id] ?? true])));
      updateLandingConfig(nextLanding);
    } catch (err) {
      notify('فشل تحميل إعدادات صفحة الزوار: ' + getErrorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  }, [updateLandingConfig]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    addToast?.(message, type);
  };

  const updateConfig = (patch: Partial<LandingConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setHasChanges(true);
  };

  const updatePublic = (patch: Partial<PublicSiteConfig>) => {
    setPublicConfig(prev => ({ ...prev, ...patch }));
    setHasChanges(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const landingPayload = { ...(config as any), portalVisibility } as Record<string, unknown>;
      await Promise.all([
        settingsService.updateLandingConfig(landingPayload),
        publicSiteConfigService.updateConfig(publicConfig),
      ]);
      updateLandingConfig(config);
      setHasChanges(false);
      setSavedAt(new Date().toLocaleTimeString('ar-IQ'));
      notify('تم حفظ إعدادات صفحة الزوار والموقع العام بنجاح', 'success');
    } catch (err) {
      notify('فشل الحفظ: ' + getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  /**
   * التراجع عن التغييرات — تأكيد داخل الصفحة لا confirm().
   *
   * ★ confirm() محظور بسياسة المنصة: يوقف خيط الواجهة، لا يُنسَّق مع
   *   بقية التصميم، ولا يدعم RTL بشكل موثوق عبر المتصفحات.
   */
  const reset = () => {
    load();
    setHasChanges(false);
    setConfirmReset(false);
  };

  const tabs = useMemo(() => [
    { id: 'identity' as const, label: 'الهوية', icon: Palette, desc: 'الشعار والألوان' },
    { id: 'hero' as const, label: 'Hero و CTA', icon: Sparkles, desc: 'العنوان وأزرار البدء' },
    { id: 'sections' as const, label: 'الأقسام', icon: Layout, desc: 'إظهار وإخفاء الأقسام' },
    { id: 'portals' as const, label: 'البوابات', icon: Layers, desc: 'بوابات الزوار العامة' },
    { id: 'publicSite' as const, label: 'الموقع العام', icon: Globe, desc: 'الفوتر والصفحات' },
    { id: 'preview' as const, label: 'المعاينة', icon: Eye, desc: 'معاينة الصفحة' },
  ], []);

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl"><Loader2 className="animate-spin text-indigo-600" size={34} /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {toast && <ToastBox message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {/* ★ تأكيد التراجع — Modal لا confirm() (سياسة المنصة) */}
      {confirmReset && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-slate-800">التراجع عن التغييرات</h3>
            <p className="text-sm text-slate-600 leading-relaxed">
              ستُفقد كل التعديلات غير المحفوظة وتعود الصفحة لآخر نسخة محفوظة.
            </p>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setConfirmReset(false)} className="px-5 py-2.5 bg-white border rounded-xl font-bold text-sm">
                إبقاء التعديلات
              </button>
              <button onClick={reset} className="px-5 py-2.5 bg-rose-600 text-white rounded-xl font-bold text-sm">
                تراجع
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-sm">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/dev')} className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 text-slate-600 hover:bg-slate-200" title="العودة لبوابة المطور"><ArrowRight size={20} /></button>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-md" style={{ background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` }}><Globe size={20} /></div>
              <div>
                <h2 className="text-lg font-black text-slate-800">إدارة صفحة الزوار</h2>
                <div className="flex items-center gap-2 mt-0.5">
                  {savedAt && <span className="text-xs text-slate-400 flex items-center gap-1"><Check size={11} className="text-emerald-500" /> آخر حفظ: {savedAt}</span>}
                  {hasChanges && <span className="text-xs text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">تغييرات غير محفوظة</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && <button onClick={() => setConfirmReset(true)} className="hidden sm:flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm font-bold text-slate-600"><RotateCcw size={14} /> تراجع</button>}
              <a href="/" target="_blank" rel="noreferrer" className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-sm font-bold"><Eye size={16} /> معاينة حية</a>
              <button onClick={save} disabled={saving || !hasChanges} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-black text-white disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed" style={!saving && hasChanges ? { background: `linear-gradient(135deg, ${themeColor}, ${themeColor}cc)` } : {}}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid xl:grid-cols-12 gap-6">
          <aside className="xl:col-span-3 2xl:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-3 sticky top-24">
              <div className="grid grid-cols-3 gap-2 mb-4 p-3 bg-slate-50 rounded-xl">
                <MiniStat label="بوابات" value={PORTALS.length} />
                <MiniStat label="صفحات" value={publicConfig.pages.length} />
                <MiniStat label="ظاهرة" value={Object.values(portalVisibility).filter(Boolean).length} />
              </div>
              <nav className="space-y-1">
                {tabs.map(tab => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold text-right transition-all ${active ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? 'bg-indigo-100' : 'bg-slate-100'}`}><Icon size={15} /></div>
                    <div className="flex-1"><div>{tab.label}</div><div className="text-[10px] font-medium opacity-60 mt-0.5">{tab.desc}</div></div>
                  </button>;
                })}
              </nav>
            </div>
          </aside>

          <main className="xl:col-span-9 2xl:col-span-10 space-y-6">
            {activeTab === 'identity' && <IdentityTab config={config} updateConfig={updateConfig} />}
            {activeTab === 'hero' && <HeroTab config={config} publicConfig={publicConfig} updateConfig={updateConfig} updatePublic={updatePublic} />}
            {activeTab === 'sections' && <SectionsTab config={config} updateConfig={updateConfig} />}
            {activeTab === 'portals' && <PortalsTab visibility={portalVisibility} setVisibility={(v) => { setPortalVisibility(v); setHasChanges(true); }} />}
            {activeTab === 'publicSite' && <PublicSiteTab publicConfig={publicConfig} updatePublic={updatePublic} />}
            {activeTab === 'preview' && <PreviewTab config={config} />}
          </main>
        </div>
      </div>
    </div>
  );
}

function IdentityTab({ config, updateConfig }: { config: LandingConfig; updateConfig: (p: Partial<LandingConfig>) => void }) {
  const colors = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#0f172a'];
  return <Panel title="الهوية البصرية والألوان" icon={<Palette size={18} />}>
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <Field label="اسم الشعار بالعربية"><input className="input" value={config.logoTextAr} onChange={(e) => updateConfig({ logoTextAr: e.target.value })} /></Field>
        <Field label="Logo Text English"><input className="input ltr" value={config.logoTextEn} onChange={(e) => updateConfig({ logoTextEn: e.target.value })} /></Field>
        <Field label="رمز الشعار"><input className="input" value={config.logoSymbol} maxLength={3} onChange={(e) => updateConfig({ logoSymbol: e.target.value })} /></Field>
        <Field label="رابط صورة الشعار"><input className="input ltr" value={config.logoUrl} onChange={(e) => updateConfig({ logoUrl: e.target.value })} placeholder="https://..." /></Field>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="text-xs font-black text-slate-400 mb-3">اللون الرئيسي</div>
        <input className="input ltr mb-4" value={config.themeColor} onChange={(e) => updateConfig({ themeColor: e.target.value })} />
        <div className="grid grid-cols-4 gap-3">
          {colors.map(c => <button key={c} onClick={() => updateConfig({ themeColor: c })} className="h-12 rounded-2xl border-2" style={{ background: c, borderColor: config.themeColor === c ? '#111827' : 'transparent' }} />)}
        </div>
        <div className="mt-6 p-5 rounded-2xl text-white shadow-lg" style={{ background: `linear-gradient(135deg, ${config.themeColor}, ${config.themeColor}bb)` }}>
          <div className="font-black text-xl">{config.logoTextAr}</div>
          <div className="text-white/75 text-sm mt-1">معاينة الهوية البصرية</div>
        </div>
      </div>
    </div>
  </Panel>;
}

function HeroTab({ config, publicConfig, updateConfig, updatePublic }: { config: LandingConfig; publicConfig: PublicSiteConfig; updateConfig: (p: Partial<LandingConfig>) => void; updatePublic: (p: Partial<PublicSiteConfig>) => void }) {
  return <Panel title="محتوى Hero وأزرار CTA" icon={<Sparkles size={18} />}>
    <div className="grid lg:grid-cols-2 gap-5">
      <Field label="العنوان الرئيسي بالعربية"><input className="input" value={config.heroTitleAr} onChange={(e) => updateConfig({ heroTitleAr: e.target.value })} /></Field>
      <Field label="Hero Title English"><input className="input ltr" value={config.heroTitleEn} onChange={(e) => updateConfig({ heroTitleEn: e.target.value })} /></Field>
      <Field label="الوصف بالعربية"><textarea className="input min-h-[120px] resize-none" value={config.heroDescAr} onChange={(e) => updateConfig({ heroDescAr: e.target.value })} /></Field>
      <Field label="Description English"><textarea className="input min-h-[120px] resize-none ltr" value={config.heroDescEn} onChange={(e) => updateConfig({ heroDescEn: e.target.value })} /></Field>
      <Field label="نص CTA الأساسي"><input className="input" value={publicConfig.primaryCtaLabel} onChange={(e) => updatePublic({ primaryCtaLabel: e.target.value })} /></Field>
      <Field label="رابط CTA الأساسي"><input className="input ltr" value={publicConfig.primaryCtaHref} onChange={(e) => updatePublic({ primaryCtaHref: e.target.value })} /></Field>
    </div>
  </Panel>;
}

function SectionsTab({ config, updateConfig }: { config: LandingConfig; updateConfig: (p: Partial<LandingConfig>) => void }) {
  const rows: Array<[keyof LandingConfig, string, string]> = [
    ['showMarketingSection', 'قسم التسويق والرؤية', 'يعرض رؤية المنصة ومحتواها التسويقي'],
    ['showVideoSection', 'قسم الفيديو', 'عرض فيديو تعريفي أو شرح المنتج'],
    ['showLocationSection', 'قسم الموقع', 'إظهار موقع الشركة ومعلومات التواصل'],
    ['showStatsSection', 'قسم الإحصائيات', 'إحصائيات عامة في صفحة الزوار'],
    ['showCareSection', 'قسم العناية', 'محتوى إضافي عن العناية بالعملاء'],
    ['showAgentsSection', 'قسم الوكلاء', 'عرض شركاء أو وكلاء المنصة'],
  ];
  return <Panel title="إظهار وإخفاء أقسام صفحة الزوار" icon={<Layout size={18} />}>
    <div className="grid md:grid-cols-2 gap-4">
      {rows.map(([key, title, desc]) => <ToggleCard key={String(key)} title={title} desc={desc} value={Boolean((config as any)[key])} onChange={(v) => updateConfig({ [key]: v } as any)} />)}
    </div>
  </Panel>;
}

function PortalsTab({ visibility, setVisibility }: { visibility: Record<string, boolean>; setVisibility: (v: Record<string, boolean>) => void }) {
  return <Panel title="البوابات الظاهرة للزوار" icon={<Layers size={18} />}>
    <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800 font-bold">بوابة المطور لا تظهر هنا لأنها داخلية وخاصة بفريق Kyvzon.</div>
    <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
      {PORTALS.map(p => {
        const Icon = p.icon;
        const visible = visibility[p.id] !== false;
        return <button key={p.id} onClick={() => setVisibility({ ...visibility, [p.id]: !visible })} className={`text-right rounded-2xl border p-4 transition-all ${visible ? 'bg-white border-cyan-200 shadow-sm' : 'bg-slate-50 border-slate-200 opacity-60'}`}>
          <div className="flex items-center gap-3 mb-3"><div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${p.color}18`, color: p.color }}><Icon size={18} /></div><div className="font-black text-slate-800">{p.title.ar}</div></div>
          <p className="text-xs text-slate-500 leading-6 line-clamp-2">{p.desc.ar}</p>
          <div className={`mt-3 text-xs font-black ${visible ? 'text-emerald-600' : 'text-slate-400'}`}>{visible ? 'ظاهر للزوار' : 'مخفي'}</div>
        </button>;
      })}
    </div>
  </Panel>;
}

function PublicSiteTab({ publicConfig, updatePublic }: { publicConfig: PublicSiteConfig; updatePublic: (p: Partial<PublicSiteConfig>) => void }) {
  const updatePage = (kind: string, patch: any) => updatePublic({ pages: publicConfig.pages.map(p => p.kind === kind ? { ...p, ...patch } : p) });
  const seedPlans = () => updatePublic({ plans: PLANS.map((p, i) => ({ ...p, enabled: true, order: i })) });
  const seedServices = () => updatePublic({ services: EXTRA_SERVICES.map((svc, i) => ({ id: `service-${i + 1}`, iconKey: 'settings', color: svc.color, title: svc.title, desc: svc.desc, promo: svc.promo, badge: svc.badge, enabled: true, order: i })) });
  const seedPortals = () => updatePublic({ portals: PORTALS.map((portal, i) => ({ id: portal.id, iconKey: portal.id, color: portal.color, gradient: portal.gradient, title: portal.title, desc: portal.desc, features: portal.features, enabled: true, order: i })) });
  const updatePlan = (id: string, patch: any) => updatePublic({ plans: (publicConfig.plans || []).map(p => p.id === id ? { ...p, ...patch } : p) });
  const updateService = (id: string, patch: any) => updatePublic({ services: (publicConfig.services || []).map(s => s.id === id ? { ...s, ...patch } : s) });
  const updatePortal = (id: string, patch: any) => updatePublic({ portals: (publicConfig.portals || []).map(p => p.id === id ? { ...p, ...patch } : p) });

  return <Panel title="إعداد الموقع العام وصفحات الفوتر" icon={<Globe size={18} />}>
    <div className="grid lg:grid-cols-2 gap-5 mb-6">
      <ToggleCard title="تفعيل التسجيل العام" desc="السماح للزوار بإنشاء حساب عبر OTP" value={publicConfig.signupEnabled} onChange={(v) => updatePublic({ signupEnabled: v })} />
      <ToggleCard title="تفعيل مستكشف البوابات" desc="إظهار صفحات /portals وتفاصيل كل بوابة" value={publicConfig.portalExplorerEnabled} onChange={(v) => updatePublic({ portalExplorerEnabled: v })} />
      <Field label="بريد الدعم"><input className="input ltr" value={publicConfig.supportEmail} onChange={(e) => updatePublic({ supportEmail: e.target.value })} /></Field>
      <Field label="هاتف الدعم"><input className="input ltr" value={publicConfig.supportPhone} onChange={(e) => updatePublic({ supportPhone: e.target.value })} /></Field>
    </div>

    <CmsCollection title="الخطط المعروضة في صفحة الأسعار" empty="لم يتم نقل الخطط بعد — سيتم استخدام data.ts كـ fallback" onSeed={seedPlans} onAdd={() => updatePublic({ plans: [...(publicConfig.plans || []), { id: `custom-${Date.now()}`, name: { ar: 'خطة جديدة', en: 'New Plan', ku: 'New Plan' }, range: { ar: 'حسب الاتفاق', en: 'Custom', ku: 'Custom' }, desc: { ar: 'وصف الخطة', en: 'Plan description', ku: 'Plan description' }, features: { ar: ['ميزة'], en: ['Feature'], ku: ['Feature'] }, enabled: true, order: (publicConfig.plans || []).length }] })}>
      {(publicConfig.plans || []).map(plan => <EditorCard key={plan.id} title={plan.name.ar} enabled={plan.enabled !== false} onToggle={() => updatePlan(plan.id, { enabled: plan.enabled === false })} onDelete={() => updatePublic({ plans: (publicConfig.plans || []).filter(p => p.id !== plan.id) })}>
        <div className="grid md:grid-cols-2 gap-3"><input className="input" value={plan.name.ar} onChange={(e) => updatePlan(plan.id, { name: { ...plan.name, ar: e.target.value } })} /><input className="input ltr" value={plan.name.en} onChange={(e) => updatePlan(plan.id, { name: { ...plan.name, en: e.target.value } })} /></div>
        <textarea className="input min-h-[80px] resize-none mt-3" value={plan.desc.ar} onChange={(e) => updatePlan(plan.id, { desc: { ...plan.desc, ar: e.target.value } })} />
      </EditorCard>)}
    </CmsCollection>

    <CmsCollection title="الخدمات الإضافية" empty="لم يتم نقل الخدمات بعد — سيتم استخدام data.ts كـ fallback" onSeed={seedServices} onAdd={() => updatePublic({ services: [...(publicConfig.services || []), { id: `service-${Date.now()}`, iconKey: 'settings', color: '#6366f1', title: { ar: 'خدمة جديدة', en: 'New Service', ku: 'New Service' }, desc: { ar: 'وصف الخدمة', en: 'Service description', ku: 'Service description' }, promo: { ar: 'اطلب الآن', en: 'Request now', ku: 'Request now' }, badge: { ar: 'جديد', en: 'New', ku: 'New' }, enabled: true, order: (publicConfig.services || []).length }] })}>
      {(publicConfig.services || []).map(svc => <EditorCard key={svc.id} title={svc.title.ar} enabled={svc.enabled !== false} onToggle={() => updateService(svc.id, { enabled: svc.enabled === false })} onDelete={() => updatePublic({ services: (publicConfig.services || []).filter(s => s.id !== svc.id) })}>
        <div className="grid md:grid-cols-3 gap-3"><input className="input" value={svc.title.ar} onChange={(e) => updateService(svc.id, { title: { ...svc.title, ar: e.target.value } })} /><input className="input ltr" value={svc.title.en} onChange={(e) => updateService(svc.id, { title: { ...svc.title, en: e.target.value } })} /><input className="input ltr" value={svc.color} onChange={(e) => updateService(svc.id, { color: e.target.value })} /></div>
        <textarea className="input min-h-[80px] resize-none mt-3" value={svc.desc.ar} onChange={(e) => updateService(svc.id, { desc: { ...svc.desc, ar: e.target.value } })} />
      </EditorCard>)}
    </CmsCollection>

    <CmsCollection title="البوابات العامة ومستكشف البوابات" empty="لم يتم نقل البوابات بعد — سيتم استخدام data.ts كـ fallback" onSeed={seedPortals} onAdd={() => updatePublic({ portals: [...(publicConfig.portals || []), { id: `portal-${Date.now()}`, iconKey: 'layers', color: '#6366f1', title: { ar: 'بوابة جديدة', en: 'New Portal', ku: 'New Portal' }, desc: { ar: 'وصف البوابة', en: 'Portal description', ku: 'Portal description' }, features: { ar: ['ميزة'], en: ['Feature'], ku: ['Feature'] }, enabled: true, order: (publicConfig.portals || []).length }] })}>
      {(publicConfig.portals || []).map(portal => <EditorCard key={portal.id} title={portal.title.ar} enabled={portal.enabled !== false} onToggle={() => updatePortal(portal.id, { enabled: portal.enabled === false })} onDelete={() => updatePublic({ portals: (publicConfig.portals || []).filter(p => p.id !== portal.id) })}>
        <div className="grid md:grid-cols-3 gap-3"><input className="input ltr" value={portal.id} onChange={(e) => updatePortal(portal.id, { id: e.target.value })} /><input className="input" value={portal.title.ar} onChange={(e) => updatePortal(portal.id, { title: { ...portal.title, ar: e.target.value } })} /><input className="input ltr" value={portal.color} onChange={(e) => updatePortal(portal.id, { color: e.target.value })} /></div>
        <textarea className="input min-h-[80px] resize-none mt-3" value={portal.desc.ar} onChange={(e) => updatePortal(portal.id, { desc: { ...portal.desc, ar: e.target.value } })} />
      </EditorCard>)}
    </CmsCollection>

    <div className="space-y-3 mt-6">
      <h4 className="font-black text-slate-800">صفحات الفوتر</h4>
      {publicConfig.pages.map(page => <div key={page.kind} className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3 mb-3"><div className="font-black text-slate-800">/{page.kind} — {page.title}</div><button onClick={() => updatePage(page.kind, { enabled: page.enabled === false })}>{page.enabled === false ? <ToggleLeft className="text-slate-400" /> : <ToggleRight className="text-emerald-600" />}</button></div>
        <div className="grid md:grid-cols-2 gap-3"><input className="input" value={page.title} onChange={(e) => updatePage(page.kind, { title: e.target.value })} /><input className="input ltr" value={page.ctaHref || ''} onChange={(e) => updatePage(page.kind, { ctaHref: e.target.value })} placeholder="CTA href" /></div>
      </div>)}
    </div>
  </Panel>;
}

function PreviewTab({ config }: { config: LandingConfig }) {
  return <Panel title="معاينة صفحة الهبوط" icon={<Eye size={18} />}>
    <div className="rounded-2xl bg-slate-900 text-white p-6 mb-4">
      <div className="text-xs text-white/50 mb-2">معاينة سريعة للمحتوى المحفوظ في إعدادات صفحة الزوار</div>
      <h2 className="text-3xl font-black mb-3" style={{ color: config.themeColor }}>{config.heroTitleAr}</h2>
      <p className="text-white/70 leading-8 max-w-3xl">{config.heroDescAr}</p>
    </div>
    <div className="rounded-2xl overflow-hidden border border-slate-200 max-h-[620px] overflow-y-auto bg-slate-950">
      <LandingPage onLoginClick={() => undefined} previewMode />
    </div>
  </Panel>;
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"><div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100"><div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">{icon}</div><h3 className="font-black text-slate-800">{title}</h3></div><div className="p-6">{children}</div><style>{`.input{width:100%;background:#f8fafc;border:1px solid #e2e8f0;border-radius:.85rem;padding:.72rem .9rem;font-size:.9rem;outline:none}.input:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.12)}.ltr{direction:ltr;text-align:left}`}</style></section>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-black text-slate-500">{label}</span>{children}</label>; }
function MiniStat({ label, value }: { label: string; value: number }) { return <div className="text-center"><div className="text-xl font-black text-slate-800">{value}</div><div className="text-[10px] text-slate-400 font-bold">{label}</div></div>; }
function ToggleCard({ title, desc, value, onChange }: { title: string; desc: string; value: boolean; onChange: (v: boolean) => void }) { return <button onClick={() => onChange(!value)} className={`text-right rounded-2xl border p-4 transition-all ${value ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}><div className="flex items-center justify-between gap-3"><div className="font-black text-slate-800">{title}</div>{value ? <ToggleRight className="text-emerald-600" /> : <ToggleLeft className="text-slate-400" />}</div><p className="text-xs text-slate-500 mt-2 leading-6">{desc}</p></button>; }

function CmsCollection({ title, empty, onSeed, onAdd, children }: { title: string; empty: string; onSeed: () => void; onAdd: () => void; children: React.ReactNode }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between gap-3 mb-4"><h4 className="font-black text-slate-800">{title}</h4><div className="flex gap-2"><button onClick={onSeed} className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700">تهيئة من البيانات الحالية</button><button onClick={onAdd} className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold">+ إضافة</button></div></div>{hasChildren ? <div className="space-y-3">{children}</div> : <div className="rounded-xl bg-white border border-dashed border-slate-300 p-5 text-sm text-slate-500">{empty}</div>}</div>;
}
function EditorCard({ title, enabled, onToggle, onDelete, children }: { title: string; enabled: boolean; onToggle: () => void; onDelete: () => void; children: React.ReactNode }) {
  return <div className={`rounded-2xl border p-4 ${enabled ? 'bg-white border-slate-200' : 'bg-white/60 border-slate-200 opacity-70'}`}><div className="flex items-center justify-between gap-3 mb-3"><div className="font-black text-slate-800">{title}</div><div className="flex gap-2"><button onClick={onToggle}>{enabled ? <ToggleRight className="text-emerald-600" /> : <ToggleLeft className="text-slate-400" />}</button><button onClick={onDelete} className="text-xs font-bold text-rose-600">حذف</button></div></div>{children}</div>;
}

function ToastBox({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) { return <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-2xl text-white text-sm font-bold shadow-2xl ${type === 'success' ? 'bg-emerald-600' : type === 'error' ? 'bg-rose-600' : 'bg-slate-800'}`} onClick={onClose}>{message}</div>; }
