import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, Globe, RefreshCw, Save, Settings, ToggleLeft, ToggleRight, Palette, Image as ImageIcon, Type } from 'lucide-react';

const FONT_OPTIONS = ['IBM Plex Sans Arabic', 'Cairo', 'Tajawal', 'Almarai', 'Noto Kufi Arabic', 'Rubik', 'Changa'];
import { PageHeader } from '../components/shared';
import { publicSiteConfigService, DEFAULT_SITE_THEME, type PublicSiteConfig, type PublicInfoPageConfig, type PublicSiteTheme, type PublicSiteMedia, type PublicSiteContent } from '../../../services/sdk';
import { useUIStore } from '../../../core/stores';

export default function PublicSiteManagerPage() {
  const { addToast } = useUIStore();
  const [config, setConfig] = useState<PublicSiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKind, setSelectedKind] = useState<string>('about');

  const load = useCallback(async () => {
    setLoading(true);
    try { setConfig(await publicSiteConfigService.getConfig()); }
    catch (err: any) { addToast(err?.message || 'فشل تحميل إعدادات الموقع العام', 'error'); }
    finally { setLoading(false); }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      await publicSiteConfigService.updateConfig(config);
      addToast('تم حفظ إعدادات الموقع العام', 'success');
    } catch (err: any) {
      addToast(err?.message || 'فشل الحفظ', 'error');
    } finally { setSaving(false); }
  };

  const update = (patch: Partial<PublicSiteConfig>) => setConfig(prev => prev ? { ...prev, ...patch } : prev);
  const theme = { ...DEFAULT_SITE_THEME, ...(config?.theme || {}) };
  const updateTheme = (patch: Partial<PublicSiteTheme>) => setConfig(prev => prev ? ({ ...prev, theme: { ...DEFAULT_SITE_THEME, ...(prev.theme || {}), ...patch } }) : prev);
  const media = config?.media || {};
  const updateMedia = (patch: Partial<PublicSiteMedia>) => setConfig(prev => prev ? ({ ...prev, media: { ...(prev.media || {}), ...patch } }) : prev);
  const content = config?.content || {};
  const L = (v: { ar: string; en: string; ku: string } | undefined) => v || { ar: '', en: '', ku: '' };
  const updateContent = (key: keyof PublicSiteContent, lang: 'ar' | 'en' | 'ku', value: string) =>
    setConfig(prev => prev ? ({ ...prev, content: { ...(prev.content || {}), [key]: { ...L((prev.content || {})[key]), [lang]: value } } }) : prev);
  const selectedPage = config?.pages.find(p => p.kind === selectedKind) || null;
  const updatePage = (patch: Partial<PublicInfoPageConfig>) => setConfig(prev => prev ? ({ ...prev, pages: prev.pages.map(p => p.kind === selectedKind ? { ...p, ...patch } : p) }) : prev);
  const updateBullet = (idx: number, value: string) => updatePage({ bullets: (selectedPage?.bullets || []).map((b, i) => i === idx ? value : b) });

  if (loading || !config) return <div className="flex items-center justify-center py-20"><RefreshCw className="animate-spin text-gray-400" /></div>;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader title="إدارة الموقع العام" description="تحكّم كامل: الألوان، الخطوط، الشعار، الصور والفيديو، نصوص الهيرو، صفحات الزوار، وتدفق التسجيل" />

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <Card title="إعدادات عامة" icon={<Settings size={17} />}>
            <Toggle label="تفعيل صفحة التسجيل" value={config.signupEnabled} onChange={(v) => update({ signupEnabled: v })} />
            <Toggle label="تفعيل مستكشف البوابات" value={config.portalExplorerEnabled} onChange={(v) => update({ portalExplorerEnabled: v })} />
            <Toggle label="إخفاء بوابة المطور عن الزوار" value={config.hideDeveloperPortal} onChange={(v) => update({ hideDeveloperPortal: v })} />
            <Field label="رابط CTA الأساسي"><input value={config.primaryCtaHref} onChange={(e) => update({ primaryCtaHref: e.target.value })} className="input ltr" /></Field>
            <Field label="نص CTA الأساسي"><input value={config.primaryCtaLabel} onChange={(e) => update({ primaryCtaLabel: e.target.value })} className="input" /></Field>
            <Field label="بريد الدعم"><input value={config.supportEmail} onChange={(e) => update({ supportEmail: e.target.value })} className="input ltr" /></Field>
            <Field label="هاتف الدعم"><input value={config.supportPhone} onChange={(e) => update({ supportPhone: e.target.value })} className="input ltr" /></Field>
          </Card>

          <Card title="الألوان والخطوط" icon={<Palette size={17} />}>
            <div className="grid grid-cols-2 gap-3">
              <ColorField label="اللون الرئيسي" value={theme.brandColor} onChange={(v) => updateTheme({ brandColor: v })} />
              <ColorField label="الأزرق الداكن" value={theme.brandDark} onChange={(v) => updateTheme({ brandDark: v })} />
              <ColorField label="السماوي" value={theme.accentSky} onChange={(v) => updateTheme({ accentSky: v })} />
              <ColorField label="خلفية بديلة" value={theme.bgAlt} onChange={(v) => updateTheme({ bgAlt: v })} />
              <ColorField label="لون العناوين" value={theme.textHeading} onChange={(v) => updateTheme({ textHeading: v })} />
              <ColorField label="لون النصوص" value={theme.textBody} onChange={(v) => updateTheme({ textBody: v })} />
            </div>
            <div className="grid grid-cols-1 gap-3 mt-3">
              <Field label="خط النصوص (Google Font)">
                <select value={theme.fontFamily} onChange={(e) => updateTheme({ fontFamily: e.target.value })} className="input">
                  {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
              <Field label="خط العناوين (Google Font)">
                <select value={theme.headingFontFamily} onChange={(e) => updateTheme({ headingFontFamily: e.target.value })} className="input">
                  {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
            </div>
            <button onClick={() => updateTheme(DEFAULT_SITE_THEME)} className="mt-3 text-xs font-bold text-gray-500 hover:text-gray-800">↺ استعادة الثيم الافتراضي</button>
            <button onClick={save} disabled={saving} className="mt-3 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />} حفظ الألوان والخطوط
            </button>
          </Card>

          <Card title="الوسائط (شعار / صور / فيديو)" icon={<ImageIcon size={17} />}>
            <Field label="رابط الشعار (صورة)"><input value={media.logoUrl || ''} onChange={(e) => updateMedia({ logoUrl: e.target.value })} className="input ltr" placeholder="https://.../logo.png" /></Field>
            <Field label="صورة الهيرو (بديل الموك-أب)"><input value={media.heroImageUrl || ''} onChange={(e) => updateMedia({ heroImageUrl: e.target.value })} className="input ltr" placeholder="https://.../hero.png" /></Field>
            <Field label="فيديو الهيرو (YouTube/Vimeo/mp4)"><input value={media.heroVideoUrl || ''} onChange={(e) => updateMedia({ heroVideoUrl: e.target.value })} className="input ltr" placeholder="https://youtube.com/watch?v=..." /></Field>
            <p className="text-[11px] text-gray-400 mt-1 leading-5">الفيديو له الأولوية على صورة الهيرو، وكلاهما يستبدل الموك-أب الافتراضي. اترك الحقول فارغة للعودة للموك-أب.</p>
            <button onClick={save} disabled={saving} className="mt-3 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />} حفظ الوسائط
            </button>
          </Card>

          <Card title="نصوص الهيرو" icon={<Type size={17} />}>
            {([
              ['heroBadge', 'الشارة العلوية'],
              ['heroTitle1', 'العنوان (سطر 1)'],
              ['heroTitle2', 'العنوان الملوّن (سطر 2)'],
              ['heroDesc', 'الوصف'],
            ] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <input value={L((content)[key]).ar} onChange={(e) => updateContent(key, 'ar', e.target.value)} className="input" placeholder="اتركه فارغاً للنص الافتراضي" />
              </Field>
            ))}
            <button onClick={save} disabled={saving} className="mt-3 w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
              {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />} حفظ النصوص
            </button>
          </Card>

          <Card title="صفحات الموقع" icon={<Globe size={17} />}>
            <div className="space-y-2">
              {config.pages.map(page => (
                <button key={page.kind} onClick={() => setSelectedKind(page.kind)} className={`w-full text-right px-3 py-2 rounded-xl text-sm font-bold border ${selectedKind === page.kind ? 'bg-cyan-50 border-cyan-200 text-cyan-800' : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'}`}>
                  {page.title}
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Card title={`تحرير صفحة: ${selectedPage?.title || selectedKind}`} icon={<ExternalLink size={17} />}>
            {selectedPage && (
              <div className="space-y-4">
                <Toggle label="إظهار الصفحة في الموقع" value={selectedPage.enabled !== false} onChange={(v) => updatePage({ enabled: v })} />
                <Field label="عنوان الصفحة"><input value={selectedPage.title} onChange={(e) => updatePage({ title: e.target.value })} className="input" /></Field>
                <Field label="وصف الصفحة"><textarea value={selectedPage.desc} onChange={(e) => updatePage({ desc: e.target.value })} className="input min-h-[110px] resize-none" /></Field>
                <div className="grid md:grid-cols-2 gap-3">
                  <Field label="نص زر الصفحة"><input value={selectedPage.ctaLabel || ''} onChange={(e) => updatePage({ ctaLabel: e.target.value })} className="input" placeholder="تواصل / أنشئ حساب" /></Field>
                  <Field label="رابط زر الصفحة"><input value={selectedPage.ctaHref || ''} onChange={(e) => updatePage({ ctaHref: e.target.value })} className="input ltr" placeholder="/signup?intent=general" /></Field>
                </div>
                <div>
                  <div className="text-xs font-bold text-gray-500 mb-2">النقاط / المحتوى المختصر</div>
                  <div className="space-y-2">
                    {(selectedPage.bullets || []).map((b, i) => <input key={i} value={b} onChange={(e) => updateBullet(i, e.target.value)} className="input" />)}
                  </div>
                  <button onClick={() => updatePage({ bullets: [...(selectedPage.bullets || []), 'نقطة جديدة'] })} className="mt-2 text-xs font-bold text-cyan-700">+ إضافة نقطة</button>
                </div>
                <div className="pt-4 flex gap-3 border-t border-gray-100">
                  <a href={`/${selectedPage.kind}`} target="_blank" rel="noreferrer" className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 text-sm font-bold hover:bg-gray-200">معاينة الصفحة</a>
                  <button onClick={save} disabled={saving} className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-bold flex items-center gap-2 disabled:opacity-60">
                    {saving ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />} حفظ الإعدادات
                  </button>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
      <style>{`.input{width:100%;background:#f9fafb;border:1px solid #e5e7eb;border-radius:.75rem;padding:.65rem .85rem;font-size:.875rem;outline:none}.input:focus{border-color:#06b6d4;box-shadow:0 0 0 2px rgba(6,182,212,.1)}.ltr{direction:ltr;text-align:left}`}</style>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5"><div className="flex items-center gap-2 mb-4 font-black text-gray-900">{icon}{title}</div>{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block space-y-1.5"><span className="text-xs font-bold text-gray-500">{label}</span>{children}</label>; }
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-bold text-gray-500">{label}</span>
      <div className="flex items-center gap-2">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer shrink-0" style={{ padding: 2 }} />
        <input value={value} onChange={(e) => onChange(e.target.value)} className="input ltr" />
      </div>
    </label>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <button onClick={() => onChange(!value)} className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl bg-gray-50 hover:bg-gray-100 mb-2"><span className="text-sm font-bold text-gray-700">{label}</span>{value ? <ToggleRight className="text-emerald-600" /> : <ToggleLeft className="text-gray-400" />}</button>;
}
