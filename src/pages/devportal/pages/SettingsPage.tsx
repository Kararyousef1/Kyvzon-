/**
 * ════════════════════════════════════════════════════════════════
 *  Kyvzon Dev Portal — Settings Page
 *  إعدادات المنصة العامة
 * ════════════════════════════════════════════════════════════════
 */

import { useState, type FC } from 'react';
import {
  Settings, Shield, Globe, Database, 
  Bell, Lock, Key, Cpu, RefreshCw,
  CheckCircle, AlertTriangle, Info,
  Clock as ClockIcon,
} from 'lucide-react';
import { PageHeader } from '../components/shared';
import type { IconType } from '../types';
import { useAuthStore } from '../../../core/stores';
import { useUIStore } from '../../../core/stores';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const { addToast } = useUIStore();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      addToast('تم حفظ الإعدادات بنجاح', 'success');
    }, 800);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-4xl">
      <PageHeader
        title="إعدادات المنصة"
        description="تكوين إعدادات منصة Kyvzon العامة"
      />

      {/* Session Info */}
      <Section icon={Shield} title="معلومات الجلسة" gradient="from-cyan-500 to-blue-600">
        <Row
          label="المستخدم الحالي"
          value={user?.full_name || user?.email || '—'}
          icon={Lock}
        />
        <Row
          label="الدور"
          value={user?.role || '—'}
          icon={Key}
        />
        <Row
          label="مدة الجلسة"
          value="60 دقيقة (تنتهي تلقائياً)"
          icon={ClockIcon}
        />
      </Section>

      {/* Platform Settings */}
      <Section icon={Globe} title="إعدادات المنصة" gradient="from-violet-500 to-purple-700">
        <div className="p-4 border-b border-gray-100 last:border-0 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">نظام الـ Multi-Tenant</p>
            <p className="text-xs text-gray-500 mt-0.5">كل شركة معزولة تماماً عن الأخرى</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <CheckCircle size={12} /> مُفعّل
          </span>
        </div>
        <div className="p-4 border-b border-gray-100 last:border-0 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">نظام RLS (أمان الصفوف)</p>
            <p className="text-xs text-gray-500 mt-0.5">سياسات أمان مطبقة على جميع الجداول</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <CheckCircle size={12} /> مُفعّل
          </span>
        </div>
        <div className="p-4 border-b border-gray-100 last:border-0 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">سجل التدقيق (Audit Log)</p>
            <p className="text-xs text-gray-500 mt-0.5">جميع العمليات مُسجَّلة للمراقبة</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <CheckCircle size={12} /> مُفعّل
          </span>
        </div>
      </Section>

      {/* Database */}
      <Section icon={Database} title="قاعدة البيانات" gradient="from-emerald-500 to-teal-600">
        <Row label="المزود" value="Supabase PostgreSQL" icon={Database} />
        <Row label="الحالة" value={<span className="text-emerald-600 font-bold flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />متصل</span>} icon={CheckCircle} />
        <Row label="النسخة" value="v15.x" icon={Cpu} />
      </Section>

      {/* Security Settings */}
      <Section icon={Shield} title="إعدادات الأمان" gradient="from-red-500 to-pink-600">
        <div className="p-4 border-b border-gray-100 last:border-0 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">تسجيل محاولات الدخول</p>
            <p className="text-xs text-gray-500 mt-0.5">تُسجَّل جميع محاولات الدخول الفاشلة والناجحة</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <CheckCircle size={12} /> مُفعّل
          </span>
        </div>
        <div className="p-4 border-b border-gray-100 last:border-0 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-gray-900">قفل الحساب بعد المحاولات الفاشلة</p>
            <p className="text-xs text-gray-500 mt-0.5">5 محاولات → قفل 10 دقائق</p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
            <CheckCircle size={12} /> مُفعّل
          </span>
        </div>
      </Section>

      {/* Environment */}
      <Section icon={Info} title="معلومات البيئة" gradient="from-amber-500 to-orange-600">
        <Row
          label="حماية بوابة المطور"
          value={import.meta.env.DEV
            ? <span className="text-amber-600 font-bold">تطوير محلي فقط</span>
            : <span className="text-red-600 font-bold">تحتاج تحققاً خادمياً</span>}
          icon={import.meta.env.DEV ? Info : AlertTriangle}
        />
        <Row label="VITE_SUPABASE_URL" value={import.meta.env.VITE_SUPABASE_URL ? '✓ مُعرَّف' : '✗ غير مُعرَّف'} icon={import.meta.env.VITE_SUPABASE_URL ? CheckCircle : AlertTriangle} />
        <Row label="بيئة التشغيل" value={import.meta.env.DEV ? 'Development' : 'Production'} icon={Globe} />
      </Section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════
//  Section Helper
// ════════════════════════════════════════════════════════════════

const Section: FC<{
  icon: IconType;
  title: string;
  gradient: string;
  children: React.ReactNode;
}> = ({ icon: Icon, title, gradient, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
    <div className={`flex items-center gap-3 px-5 py-4 bg-gradient-to-r ${gradient}`}>
      <Icon size={18} className="text-white" />
      <h3 className="text-sm font-bold text-white">{title}</h3>
    </div>
    {children}
  </div>
);

const Row: FC<{
  label: string;
  value: React.ReactNode;
  icon: IconType;
}> = ({ label, value, icon: Icon }) => (
  <div className="p-4 border-b border-gray-100 last:border-0 flex items-center justify-between">
    <div className="flex items-center gap-3">
      <Icon size={16} className="text-gray-400 flex-shrink-0" />
      <span className="text-sm text-gray-600">{label}</span>
    </div>
    <span className="text-sm text-gray-900 font-medium">{value}</span>
  </div>
);
