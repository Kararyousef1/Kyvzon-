import { useEffect, useState } from 'react';
import { Building2, Globe, Loader2, Save, Settings } from 'lucide-react';
import Card from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { useAuthStore, useUIStore } from '../../core/stores';
import { settingsService } from '../../services/sdk';
import { getErrorMessage } from '../../services/errors';

export default function CompanyProfilePage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [form, setForm] = useState({
    legal_name: '',
    trade_name: '',
    country: 'IQ',
    city: 'Baghdad',
    default_currency: 'IQD',
    timezone: 'Asia/Baghdad',
    language: 'ar',
    website: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const current = await settingsService.findSystemSettings();
        setSettingsId(current?.id || null);
        const general = current?.general_settings || {};
        setForm(prev => ({ ...prev, ...general.company_profile }));
      } catch (err) {
        addToast(getErrorMessage(err), 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [addToast]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const current = await settingsService.findSystemSettings();
      const general = current?.general_settings || {};
      const payload = { ...general, company_profile: { ...form, updated_by: user?.id, updated_at: new Date().toISOString() } };
      if (settingsId || current?.id) await settingsService.updateSystemSettings(settingsId || current.id, { general_settings: payload });
      else await settingsService.updateGeneralSettings(payload);
      addToast('تم تحديث ملف الشركة', 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><Loader2 className="animate-spin text-rose-600" size={36} /></div>;

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="bg-gradient-to-br from-rose-600 to-red-700 rounded-2xl p-6 text-white">
        <p className="text-white/70 text-sm font-semibold">Company Governance</p>
        <h2 className="text-2xl font-extrabold mt-1 flex items-center gap-2"><Building2 /> ملف الشركة</h2>
        <p className="text-white/75 mt-2 text-sm">إعدادات الهوية القانونية والتشغيلية للشركة الحالية.</p>
      </div>

      <Card>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="الاسم القانوني"><input value={form.legal_name} onChange={e => setForm({ ...form, legal_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="الاسم التجاري"><input value={form.trade_name} onChange={e => setForm({ ...form, trade_name: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="الدولة"><input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="المدينة"><input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="العملة الافتراضية"><input value={form.default_currency} onChange={e => setForm({ ...form, default_currency: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="المنطقة الزمنية"><input value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="الموقع الإلكتروني"><input value={form.website} onChange={e => setForm({ ...form, website: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="البريد"><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="الهاتف"><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400" /></Field>
          <Field label="اللغة"><select value={form.language} onChange={e => setForm({ ...form, language: e.target.value })} className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-rose-400"><option value="ar">العربية</option><option value="en">English</option></select></Field>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={handleSave} loading={saving} icon={<Save size={16} />} iconPosition="left">حفظ ملف الشركة</Button>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        <Card className="bg-slate-50"><div className="flex items-center gap-3"><Globe className="text-indigo-600" /><div><p className="font-bold text-slate-800">إعدادات محلية</p><p className="text-xs text-slate-500">اللغة، العملة، والمنطقة الزمنية تظهر في تقارير النظام.</p></div></div></Card>
        <Card className="bg-slate-50"><div className="flex items-center gap-3"><Settings className="text-rose-600" /><div><p className="font-bold text-slate-800">حوكمة مركزية</p><p className="text-xs text-slate-500">هذه الإعدادات خاصة بالـ Tenant الحالي ولا تؤثر على الشركات الأخرى.</p></div></div></Card>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-xs font-bold text-slate-600 mb-1.5">{label}</span>{children}</label>;
}
