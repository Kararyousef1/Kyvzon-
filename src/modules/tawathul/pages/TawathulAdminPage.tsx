/**
 * إدارة بوابة التواصل — للإدارة / HR / المطور
 */

import { useEffect, useState } from 'react';
import { Settings2, ShieldAlert, BarChart3, Save, Download, CheckCircle2, AlertTriangle, Database, ShieldCheck } from 'lucide-react';
import { canAdminTawathul } from '../permissions';
import { useAuthStore, useUIStore } from '../../../core/stores';
import { tawathulAdminService } from '../services';
import type { TawathulSettings } from '../types';
import Button from '../../../shared/components/ui/Button';
import Card from '../../../shared/components/ui/Card';

export default function TawathulAdminPage() {
  const { user } = useAuthStore();
  const addToast = useUIStore((s) => s.addToast);
  const allowed = canAdminTawathul(user?.role, user?.permissions);
  const [settings, setSettings] = useState<TawathulSettings | null>(null);
  const [stats, setStats] = useState({ conversations: 0, messages: 0, members: 0, channels: 0, attachments: 0, unread_notifications: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      setLoading(true);
      try {
        const [s, st] = await Promise.all([
          tawathulAdminService.getSettings(),
          tawathulAdminService.getStats(),
        ]);
        setSettings(
          s || {
            id: '',
            tenant_id: '',
            is_enabled: true,
            allow_dms: true,
            allow_groups: true,
            allow_channels: true,
            allow_file_upload: true,
            max_file_size_mb: 25,
            retention_days: 365,
          },
        );
        setStats(st);
      } catch (e: any) {
        addToast(e?.message || 'تعذّر تحميل الإعدادات', 'error');
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed, addToast]);

  if (!allowed) {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center p-8 bg-white rounded-2xl border" dir="rtl">
        <ShieldAlert className="mx-auto text-amber-500 mb-3" size={40} />
        <h1 className="font-bold text-slate-800">إدارة بوابة التواصل للمشرفين فقط</h1>
      </div>
    );
  }

  const toggle = (key: keyof TawathulSettings) => {
    if (!settings) return;
    setSettings({ ...settings, [key]: !(settings as any)[key] });
  };

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const updated = await tawathulAdminService.updateSettings(settings);
      setSettings(updated);
      addToast('تم حفظ إعدادات بوابة التواصل', 'success');
    } catch (e: any) {
      addToast(e?.message || 'فشل الحفظ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const healthChecks = [
    {
      label: 'تفعيل البوابة',
      ok: !!settings?.is_enabled,
      hint: settings?.is_enabled ? 'البوابة متاحة للمستخدمين' : 'البوابة معطلة حاليًا',
    },
    {
      label: 'المحادثات والقنوات',
      ok: !!settings?.allow_dms || !!settings?.allow_groups || !!settings?.allow_channels,
      hint: 'يجب تفعيل نوع محادثة واحد على الأقل',
    },
    {
      label: 'سياسة الملفات',
      ok: !settings?.allow_file_upload || Number(settings?.max_file_size_mb || 0) > 0,
      hint: settings?.allow_file_upload ? `الحد: ${settings?.max_file_size_mb || 0}MB` : 'رفع الملفات غير مفعل',
    },
    {
      label: 'نشاط الرسائل',
      ok: stats.messages > 0 || stats.conversations === 0,
      hint: stats.messages > 0 ? `${stats.messages} رسالة` : 'لا توجد رسائل بعد',
    },
  ];

  const healthScore = Math.round((healthChecks.filter((c) => c.ok).length / healthChecks.length) * 100);

  const exportStats = () => {
    const rows = [
      ['المحادثات', String(stats.conversations)],
      ['الرسائل', String(stats.messages)],
      ['العضويات', String(stats.members)],
      ['القنوات', String(stats.channels)],
      ['المرفقات', String(stats.attachments)],
      ['الإشعارات غير المقروءة', String(stats.unread_notifications)],
      ['درجة الصحة', `${healthScore}%`],
      ['تفعيل البوابة', String(settings?.is_enabled ?? false)],
      ['السماح بالملفات', String(settings?.allow_file_upload ?? false)],
      ['حجم الملف الأقصى', String(settings?.max_file_size_mb ?? 0)],
      ['مدة الاحتفاظ', String(settings?.retention_days ?? 365)],
    ];
    const csv = ['المؤشر,القيمة', ...rows.map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tawathul_stats_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast('تم تصدير إحصائيات التواصل', 'success');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in" dir="rtl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center">
            <Settings2 size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">إدارة بوابة التواصل</h1>
            <p className="text-sm text-slate-500">إعدادات الشركة · الإحصائيات · السياسات · صحة البوابة</p>
          </div>
        </div>
        <Button variant="secondary" onClick={exportStats} icon={<Download size={14} />} iconPosition="left">
          تصدير CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'المحادثات', value: stats.conversations },
          { label: 'الرسائل', value: stats.messages },
          { label: 'العضويات', value: stats.members },
          { label: 'القنوات', value: stats.channels },
          { label: 'المرفقات', value: stats.attachments },
          { label: 'إشعارات غير مقروءة', value: stats.unread_notifications },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <div className="flex items-center gap-2 text-slate-500 text-xs mb-1">
              <BarChart3 size={14} /> {s.label}
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {loading ? '…' : s.value}
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-slate-800 flex items-center gap-2"><ShieldCheck size={18} className="text-indigo-600" /> صحة بوابة التواصل</h2>
          <span className={`text-xs font-bold px-3 py-1 rounded-full ${healthScore >= 80 ? 'bg-emerald-50 text-emerald-700' : healthScore >= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
            {healthScore}%
          </span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {healthChecks.map((check) => (
            <div key={check.label} className={`rounded-xl border p-3 ${check.ok ? 'bg-emerald-50 border-emerald-100' : 'bg-amber-50 border-amber-100'}`}>
              <div className="flex items-center gap-2">
                {check.ok ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-amber-600" />}
                <p className="text-sm font-bold text-slate-800">{check.label}</p>
              </div>
              <p className="text-xs text-slate-500 mt-1">{check.hint}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h2 className="font-bold text-slate-800">سياسات البوابة</h2>
        {loading || !settings ? (
          <p className="text-sm text-slate-400">جاري التحميل…</p>
        ) : (
          <>
            {(
              [
                ['is_enabled', 'تفعيل بوابة التواصل'],
                ['allow_dms', 'السماح بالمحادثات الفردية'],
                ['allow_groups', 'السماح بالمجموعات'],
                ['allow_channels', 'السماح بالقنوات'],
                ['allow_file_upload', 'السماح برفع الملفات'],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex items-center justify-between gap-3 py-2 border-b border-slate-50 last:border-0 cursor-pointer"
              >
                <span className="text-sm text-slate-700">{label}</span>
                <input
                  type="checkbox"
                  className="accent-indigo-600 w-4 h-4"
                  checked={!!(settings as any)[key]}
                  onChange={() => toggle(key)}
                />
              </label>
            ))}

            <label className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-slate-700">الحد الأقصى لحجم الملف (MB)</span>
              <input
                type="number"
                min={1}
                max={100}
                value={settings.max_file_size_mb}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    max_file_size_mb: Number(e.target.value) || 25,
                  })
                }
                className="w-24 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-left"
              />
            </label>

            <label className="flex items-center justify-between gap-3 py-2">
              <span className="text-sm text-slate-700">مدة الاحتفاظ بالرسائل (يوم)</span>
              <input
                type="number"
                min={30}
                max={3650}
                value={settings.retention_days ?? 365}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    retention_days: Number(e.target.value) || 365,
                  })
                }
                className="w-24 rounded-xl border border-slate-200 px-3 py-1.5 text-sm text-left"
              />
            </label>

            <div className="pt-2 flex justify-end">
              <Button onClick={() => void save()} loading={saving} icon={<Save size={14} />}>
                حفظ الإعدادات
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card className="p-5 text-sm text-slate-600 leading-relaxed">
        <p className="font-semibold text-slate-800 mb-1">ملاحظات تشغيل</p>
        <ul className="list-disc pr-5 space-y-1">
          <li>نفّذ SQL: 300 ثم 301 ثم 302 على Supabase.</li>
          <li>Bucket التخزين: <code>tawathul</code> (أو fallback على public-assets).</li>
          <li>العزل يتم عبر tenant_id + RLS + عضوية المحادثة.</li>
        </ul>
      </Card>
    </div>
  );
}
