import { useState, useEffect } from 'react';
import { Save, Bell, Lock, Globe, Mail, Shield } from 'lucide-react';
import Card, { CardHeader, CardTitle } from '../../shared/components/ui/Card';
import Button from '../../shared/components/ui/Button';
import { useUIStore } from '../../core/stores';
import { settingsService } from '../../services/sdk/SettingsService';

export default function SettingsPage() {
  const { addToast } = useUIStore();
  const [settings, setSettings] = useState({
    systemName: 'Kyvzon',
    language: 'ar',
    timezone: 'Asia/Riyadh',
    emailNotifications: true,
    pushNotifications: true,
    smsNotifications: false,
    anonymousReports: true,
    aiAnalysis: true,
    autoAssign: true,
    maxFileSize: '10',
    sessionTimeout: '60',
    maintenanceMode: false,
  });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const savedSettings = await settingsService.findGeneralSettings();
        if (savedSettings) {
          setSettings(prev => ({ ...prev, ...savedSettings }));
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    };
    loadSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsService.updateGeneralSettings(settings as unknown as Record<string, unknown>);
      addToast('تم حفظ الإعدادات بنجاح ✅', 'success');
    } catch (err) {
      console.error(err);
      addToast('حدث خطأ أثناء الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (key: keyof typeof settings) => {
    setSettings(prev => ({ ...prev, [key]: !prev[key as keyof typeof settings] }));
  };

  const ToggleRow = ({ label, desc, settingKey }: { label: string; desc: string; settingKey: keyof typeof settings }) => (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-500 mt-0.5">{desc}</p>
      </div>
      <button
        onClick={() => toggle(settingKey)}
        className={`w-11 h-6 rounded-full transition-all flex items-center cursor-pointer ${settings[settingKey] ? 'bg-indigo-600' : 'bg-slate-300'}`}
      >
        <div className={`w-4 h-4 rounded-full bg-white shadow transition-all mx-1 ${settings[settingKey] ? 'translate-x-0' : '-translate-x-0'} ${settings[settingKey] ? 'mr-auto ml-1' : 'ml-0 mr-auto'}`} />
      </button>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-slate-500">جاري التحميل...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-extrabold text-slate-800">⚙️ إعدادات النظام</h2>
        <p className="text-sm text-slate-500">تكوين وإدارة جميع إعدادات المنصة</p>
      </div>

      {/* General */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe size={16} /> الإعدادات العامة</CardTitle>
        </CardHeader>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">اسم النظام</label>
            <input
              value={settings.systemName}
              onChange={e => setSettings(p => ({ ...p, systemName: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">اللغة</label>
              <select
                value={settings.language}
                onChange={e => setSettings(p => ({ ...p, language: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 cursor-pointer"
              >
                <option value="ar">العربية</option>
                <option value="en">English</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">المنطقة الزمنية</label>
              <select
                value={settings.timezone}
                onChange={e => setSettings(p => ({ ...p, timezone: e.target.value }))}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-400 cursor-pointer"
              >
                <option value="Asia/Riyadh">الرياض (GMT+3)</option>
                <option value="Asia/Dubai">دبي (GMT+4)</option>
              </select>
            </div>
          </div>
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bell size={16} /> الإشعارات</CardTitle>
        </CardHeader>
        <div>
          <ToggleRow label="إشعارات البريد الإلكتروني" desc="إرسال إشعارات عبر البريد الإلكتروني" settingKey="emailNotifications" />
          <ToggleRow label="الإشعارات الفورية" desc="إشعارات المتصفح والتطبيق" settingKey="pushNotifications" />
          <ToggleRow label="إشعارات SMS" desc="رسائل نصية للحالات العاجلة" settingKey="smsNotifications" />
        </div>
      </Card>

      {/* Privacy & Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield size={16} /> الخصوصية والأمان</CardTitle>
        </CardHeader>
        <div>
          <ToggleRow label="التقارير المجهولة" desc="السماح للموظفين بالإبلاغ مجهول الهوية" settingKey="anonymousReports" />
          <ToggleRow label="وضع الصيانة" desc="إيقاف النظام مؤقتاً للصيانة" settingKey="maintenanceMode" />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">انتهاء الجلسة (دقيقة)</label>
            <input
              type="number"
              value={settings.sessionTimeout}
              onChange={e => setSettings(p => ({ ...p, sessionTimeout: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">حجم الملف الأقصى (MB)</label>
            <input
              type="number"
              value={settings.maxFileSize}
              onChange={e => setSettings(p => ({ ...p, maxFileSize: e.target.value }))}
              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            />
          </div>
        </div>
      </Card>

      {/* AI */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">🤖 الذكاء الاصطناعي</CardTitle>
        </CardHeader>
        <div>
          <ToggleRow label="تحليل AI التلقائي" desc="تحليل المشاكل تلقائياً عند رفعها" settingKey="aiAnalysis" />
          <ToggleRow label="التكليف التلقائي" desc="تكليف المشاكل تلقائياً بناء على الفئة" settingKey="autoAssign" />
        </div>
      </Card>

      <Button fullWidth size="lg" onClick={handleSave} loading={saving} icon={<Save size={16} />} iconPosition="left">
        حفظ جميع الإعدادات
      </Button>
    </div>
  );
}