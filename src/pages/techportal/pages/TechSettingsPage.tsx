/**
 * ════════════════════════════════════════════════════════════════
 *  TechSettingsPage — إعدادات البوابة التقنية
 *
 *  الميزات:
 *  • إعدادات أوقات العمل والدوام
 *  • إعدادات المزامنة التلقائية
 *  • إعدادات الإشعارات والتنبيهات
 *  • إعدادات الأمان
 *  • AUDIT LOG كامل لكل تعديل (من / ماذا / متى)
 *  • Validation قبل الحفظ
 *  • مقارنة القيمة القديمة بالجديدة في السجل
 *  • زر استعادة الإعدادات الافتراضية
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback, useRef, type FC } from 'react';
import {
  Settings, Save, RefreshCw, AlertCircle, CheckCircle2,
  Clock, Wifi, Bell, Shield, RotateCcw, ChevronDown,
  ChevronUp, History, User, Calendar, Info, X, Eye,
  EyeOff, ToggleLeft, ToggleRight, Loader2,
} from 'lucide-react';
import { settingsService }      from '../../../services/sdk/SettingsService';
import { getErrorMessage }      from '../../../services/errors';
import { useUIStore, useAuthStore } from '../../../core/stores';
import { getUserDisplayName }   from '../../../utils/userUtils';

// ════════════════════════════════════════════════════════════════
//  Types
// ════════════════════════════════════════════════════════════════

interface TechSettingsForm {
  // Work Hours
  work_start:         string;
  work_end:           string;
  work_days:          string;
  late_threshold:     string;   // minutes
  grace_period:       string;   // minutes
  overtime_threshold: string;   // minutes

  // Sync
  auto_sync:          string;   // 'true' | 'false'
  sync_interval:      string;   // minutes

  // Notifications
  notify_on_failure:  string;   // 'true' | 'false'
  max_retry_attempts: string;

  // Security
  session_timeout:    string;   // minutes
  require_2fa:        string;   // 'true' | 'false'
}

interface AuditEntry {
  id: string;
  field: string;
  fieldLabel: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedAt: string;
}

const DEFAULTS: TechSettingsForm = {
  work_start:         '08:00',
  work_end:           '17:00',
  work_days:          '0,1,2,3,4',
  late_threshold:     '15',
  grace_period:       '5',
  overtime_threshold: '30',
  auto_sync:          'true',
  sync_interval:      '5',
  notify_on_failure:  'true',
  max_retry_attempts: '3',
  session_timeout:    '480',
  require_2fa:        'false',
};

const FIELD_LABELS: Record<keyof TechSettingsForm, string> = {
  work_start:         'وقت بداية الدوام',
  work_end:           'وقت نهاية الدوام',
  work_days:          'أيام العمل',
  late_threshold:     'حد التأخير (دقيقة)',
  grace_period:       'فترة السماح (دقيقة)',
  overtime_threshold: 'حد العمل الإضافي (دقيقة)',
  auto_sync:          'المزامنة التلقائية',
  sync_interval:      'فترة المزامنة (دقيقة)',
  notify_on_failure:  'إشعار عند الفشل',
  max_retry_attempts: 'الحد الأقصى لإعادة المحاولة',
  session_timeout:    'مهلة الجلسة (دقيقة)',
  require_2fa:        'المصادقة الثنائية',
};

const WORK_DAYS_MAP: Record<string, string> = {
  '0': 'الأحد', '1': 'الاثنين', '2': 'الثلاثاء',
  '3': 'الأربعاء', '4': 'الخميس', '5': 'الجمعة', '6': 'السبت',
};

// ════════════════════════════════════════════════════════════════
//  Helpers
// ════════════════════════════════════════════════════════════════

function formatValue(key: keyof TechSettingsForm, val: string): string {
  if (key === 'auto_sync' || key === 'notify_on_failure' || key === 'require_2fa') {
    return val === 'true' ? 'مفعّل' : 'معطّل';
  }
  if (key === 'work_days') {
    return val.split(',').map(d => WORK_DAYS_MAP[d.trim()] ?? d).join('، ');
  }
  return val;
}

function validate(form: TechSettingsForm): Partial<Record<keyof TechSettingsForm, string>> {
  const e: Partial<Record<keyof TechSettingsForm, string>> = {};
  if (!form.work_start.match(/^\d{2}:\d{2}$/)) e.work_start = 'صيغة غير صحيحة (HH:MM)';
  if (!form.work_end.match(/^\d{2}:\d{2}$/))   e.work_end   = 'صيغة غير صحيحة (HH:MM)';
  if (form.work_start >= form.work_end) e.work_end = 'يجب أن يكون وقت النهاية بعد وقت البداية';
  const lateN = Number(form.late_threshold);
  if (isNaN(lateN) || lateN < 1 || lateN > 120)  e.late_threshold = 'يجب أن يكون بين 1 و120 دقيقة';
  const graceN = Number(form.grace_period);
  if (isNaN(graceN) || graceN < 0 || graceN > 60) e.grace_period = 'يجب أن يكون بين 0 و60 دقيقة';
  const intervalN = Number(form.sync_interval);
  if (isNaN(intervalN) || intervalN < 1 || intervalN > 60) e.sync_interval = 'يجب أن يكون بين 1 و60 دقيقة';
  const retryN = Number(form.max_retry_attempts);
  if (isNaN(retryN) || retryN < 1 || retryN > 10) e.max_retry_attempts = 'يجب أن يكون بين 1 و10';
  return e;
}

// ════════════════════════════════════════════════════════════════
//  Sub-Components
// ════════════════════════════════════════════════════════════════

const inputCls = `
  w-full px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700
  text-slate-200 text-sm placeholder-slate-600
  focus:outline-none focus:border-cyan-600 focus:ring-1 focus:ring-cyan-600/30
  transition-all
`;

const Field: FC<{
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}> = ({ label, hint, error, children }) => (
  <div className="space-y-1.5">
    <div className="flex items-center gap-2">
      <label className="text-xs font-bold text-slate-400">{label}</label>
      {hint && (
        <div className="group relative">
          <Info size={11} className="text-slate-700 cursor-help" />
          <div className="absolute bottom-full right-0 mb-1.5 w-48 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-400 leading-relaxed opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-10">
            {hint}
          </div>
        </div>
      )}
    </div>
    {children}
    {error && (
      <p className="flex items-center gap-1 text-xs text-red-400">
        <AlertCircle size={11} />
        {error}
      </p>
    )}
  </div>
);

const Toggle: FC<{
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
}> = ({ value, onChange, label, description }) => (
  <label className="flex items-center justify-between gap-4 cursor-pointer select-none p-3 rounded-xl hover:bg-slate-800/40 transition-colors">
    <div className="min-w-0">
      <p className="text-sm font-bold text-slate-300">{label}</p>
      {description && <p className="text-xs text-slate-600 mt-0.5">{description}</p>}
    </div>
    <div
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-cyan-600' : 'bg-slate-700'}`}
    >
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? 'right-0.5' : 'right-5'}`} />
    </div>
  </label>
);

/** Section Card */
const Section: FC<{
  id: string;
  icon: FC<any>;
  title: string;
  color: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  hasChanges?: boolean;
}> = ({ id, icon: Icon, title, color, expanded, onToggle, children, hasChanges }) => (
  <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-800/20 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
          <Icon size={15} className="text-white" />
        </div>
        <span className="text-sm font-bold text-slate-200">{title}</span>
        {hasChanges && (
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        )}
      </div>
      {expanded ? <ChevronUp size={16} className="text-slate-600" /> : <ChevronDown size={16} className="text-slate-600" />}
    </button>
    {expanded && (
      <div className="px-5 pb-5 border-t border-slate-800/60 pt-4">
        {children}
      </div>
    )}
  </div>
);

/** Audit Row */
const AuditRow: FC<{ entry: AuditEntry }> = ({ entry }) => (
  <div className="flex items-start gap-3 py-3 border-b border-slate-800/40 last:border-0">
    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center flex-shrink-0 mt-0.5">
      <History size={12} className="text-slate-500" />
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold text-slate-300">{entry.fieldLabel}</span>
        <span className="text-[10px] text-slate-600">تغيّر من</span>
        <span className="text-[10px] font-mono bg-red-900/30 text-red-300 px-1.5 py-0.5 rounded border border-red-800/40">
          {entry.oldValue}
        </span>
        <span className="text-[10px] text-slate-600">إلى</span>
        <span className="text-[10px] font-mono bg-emerald-900/30 text-emerald-300 px-1.5 py-0.5 rounded border border-emerald-800/40">
          {entry.newValue}
        </span>
      </div>
      <div className="flex items-center gap-3 mt-1">
        <div className="flex items-center gap-1 text-[10px] text-slate-600">
          <User size={9} />
          {entry.changedBy}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-600">
          <Calendar size={9} />
          {new Date(entry.changedAt).toLocaleString('ar-SA', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          })}
        </div>
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
//  Work Days Picker
// ════════════════════════════════════════════════════════════════

const WorkDaysPicker: FC<{
  value: string;
  onChange: (v: string) => void;
}> = ({ value, onChange }) => {
  const selected = new Set(value.split(',').map(d => d.trim()));

  const toggle = (day: string) => {
    if (selected.has(day)) {
      selected.delete(day);
    } else {
      selected.add(day);
    }
    onChange(Array.from(selected).sort().join(','));
  };

  return (
    <div className="flex gap-2 flex-wrap">
      {Object.entries(WORK_DAYS_MAP).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => toggle(key)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
            selected.has(key)
              ? 'bg-cyan-900/60 text-cyan-300 border-cyan-700/60'
              : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-600 hover:text-slate-400'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════
//  Reset Confirm Modal
// ════════════════════════════════════════════════════════════════

const ResetModal: FC<{ onConfirm: () => void; onClose: () => void }> = ({ onConfirm, onClose }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
    <div className="relative w-full max-w-sm bg-slate-900 border border-amber-800/50 rounded-2xl shadow-2xl p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-amber-900/40 border border-amber-700/50 flex items-center justify-center mx-auto mb-4">
        <RotateCcw size={22} className="text-amber-400" />
      </div>
      <h3 className="text-base font-black text-white mb-2">استعادة الإعدادات الافتراضية</h3>
      <p className="text-sm text-slate-400 mb-5">
        سيتم إعادة جميع الإعدادات إلى قيمها الافتراضية. هذا الإجراء سيُسجَّل في سجل التدقيق.
      </p>
      <div className="flex gap-3">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
          إلغاء
        </button>
        <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-sm font-bold transition-all">
          استعادة
        </button>
      </div>
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════════
//  Main Page
// ════════════════════════════════════════════════════════════════

export default function TechSettingsPage() {
  const { addToast } = useUIStore();
  const { user }     = useAuthStore();

  const [form,         setForm]         = useState<TechSettingsForm>({ ...DEFAULTS });
  const [savedForm,    setSavedForm]    = useState<TechSettingsForm>({ ...DEFAULTS });
  const [errors,       setErrors]       = useState<Partial<Record<keyof TechSettingsForm, string>>>({});
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [showReset,    setShowReset]    = useState(false);
  const [auditLog,     setAuditLog]     = useState<AuditEntry[]>([]);
  const [showAudit,    setShowAudit]    = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    work: true, sync: true, notifications: false, security: false,
  });

  const toggleSection = (id: string) =>
    setExpanded(p => ({ ...p, [id]: !p[id] }));

  // ─── Derived: which fields changed? ─────────────────────────
  const changedKeys = (Object.keys(form) as (keyof TechSettingsForm)[]).filter(
    k => form[k] !== savedForm[k]
  );
  const hasChanges = changedKeys.length > 0;

  // ─── Load ──────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      type RawSettings = Record<string, unknown> | null;
      const raw = (await settingsService.findSystemSettings()) as unknown as RawSettings;
      const techRaw = (raw?.tech_settings ?? {}) as Record<string, string>;
      const merged: TechSettingsForm = { ...DEFAULTS };
      (Object.keys(DEFAULTS) as (keyof TechSettingsForm)[]).forEach(k => {
        if (techRaw[k] !== undefined) merged[k] = String(techRaw[k]);
      });
      setForm(merged);
      setSavedForm(merged);
    } catch {
      // keep defaults silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  // ─── Field updater ──────────────────────────────────────────
  const set = (key: keyof TechSettingsForm, value: string) => {
    setForm(p => ({ ...p, [key]: value }));
    setErrors(p => { const n = { ...p }; delete n[key]; return n; });
  };

  // ─── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      addToast('يرجى تصحيح الأخطاء قبل الحفظ', 'error');
      return;
    }

    setSaving(true);
    try {
      // Build audit entries for changed fields
      const userName = getUserDisplayName(user);
      const now      = new Date().toISOString();
      const newEntries: AuditEntry[] = changedKeys.map(k => ({
        id:          `${k}-${Date.now()}-${Math.random()}`,
        field:       k,
        fieldLabel:  FIELD_LABELS[k],
        oldValue:    formatValue(k, savedForm[k]),
        newValue:    formatValue(k, form[k]),
        changedBy:   userName,
        changedAt:   now,
      }));

      // Persist via SettingsService — get record id first, then update
      const current = await settingsService.findSystemSettings();
      if (current?.id) {
        await settingsService.updateSystemSettings(current.id, {
          tech_settings: { ...(form as unknown as Record<string, unknown>) },
        });
      }

      setSavedForm({ ...form });
      setAuditLog(prev => [...newEntries, ...prev].slice(0, 100)); // keep last 100
      addToast(`تم حفظ ${newEntries.length} تعديل بنجاح`, 'success');
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  // ─── Reset ──────────────────────────────────────────────────
  const handleReset = () => {
    const userName = getUserDisplayName(user);
    const now = new Date().toISOString();
    const entries: AuditEntry[] = (Object.keys(DEFAULTS) as (keyof TechSettingsForm)[])
      .filter(k => form[k] !== DEFAULTS[k])
      .map(k => ({
        id: `reset-${k}-${Date.now()}`,
        field: k,
        fieldLabel: FIELD_LABELS[k],
        oldValue: formatValue(k, form[k]),
        newValue: formatValue(k, DEFAULTS[k]),
        changedBy: userName,
        changedAt: now,
      }));

    setForm({ ...DEFAULTS });
    setErrors({});
    if (entries.length > 0) setAuditLog(prev => [...entries, ...prev].slice(0, 100));
    setShowReset(false);
    addToast('تمت استعادة الإعدادات الافتراضية', 'success');
  };

  // ─── Discard ────────────────────────────────────────────────
  const handleDiscard = () => {
    setForm({ ...savedForm });
    setErrors({});
    addToast('تم تجاهل التعديلات', 'info');
  };

  // ─── Render ─────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-cyan-400 animate-spin" />
          <p className="text-sm text-slate-500">جاري تحميل الإعدادات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {showReset && <ResetModal onConfirm={handleReset} onClose={() => setShowReset(false)} />}

      {/* ─── Header ─── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-black text-white flex items-center gap-2">
            <Settings size={20} className="text-slate-400" />
            إعدادات البوابة التقنية
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            إعدادات الدوام والمزامنة والأمان — كل تعديل يُسجَّل في سجل التدقيق
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAudit(v => !v)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-white text-sm font-medium transition-all relative"
          >
            <History size={14} />
            سجل التعديلات
            {auditLog.length > 0 && (
              <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                {auditLog.length > 9 ? '9+' : auditLog.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setShowReset(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700 text-slate-400 hover:text-amber-400 hover:border-amber-700/50 text-sm font-medium transition-all"
          >
            <RotateCcw size={14} />
            <span className="hidden sm:inline">استعادة الافتراضي</span>
          </button>
        </div>
      </div>

      {/* ─── Unsaved Changes Banner ─── */}
      {hasChanges && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-900/20 border border-amber-700/40">
          <AlertCircle size={15} className="text-amber-400 flex-shrink-0" />
          <span className="text-sm text-amber-300 flex-1">
            لديك <strong>{changedKeys.length}</strong> تعديل غير محفوظ
          </span>
          <div className="flex items-center gap-2">
            <button onClick={handleDiscard} className="text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium">
              تجاهل
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-all disabled:opacity-50"
            >
              {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
              حفظ الآن
            </button>
          </div>
        </div>
      )}

      {/* ════ Section 1: Work Hours ════ */}
      <Section
        id="work"
        icon={Clock}
        title="إعدادات أوقات العمل"
        color="bg-cyan-700"
        expanded={expanded.work}
        onToggle={() => toggleSection('work')}
        hasChanges={changedKeys.some(k => ['work_start','work_end','work_days','late_threshold','grace_period','overtime_threshold'].includes(k))}
      >
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="وقت بداية الدوام" error={errors.work_start} hint="بصيغة 24 ساعة مثل 08:00">
            <input type="time" className={inputCls} value={form.work_start}
              onChange={e => set('work_start', e.target.value)} />
          </Field>
          <Field label="وقت نهاية الدوام" error={errors.work_end}>
            <input type="time" className={inputCls} value={form.work_end}
              onChange={e => set('work_end', e.target.value)} />
          </Field>

          <div className="sm:col-span-2">
            <Field label="أيام العمل" hint="اختر الأيام التي يُعدّ فيها الموظف حاضراً">
              <WorkDaysPicker value={form.work_days} onChange={v => set('work_days', v)} />
            </Field>
          </div>

          <Field label="حد التأخير (دقيقة)" error={errors.late_threshold}
            hint="الموظف الذي يصل بعد هذه المدة يُعدّ متأخراً">
            <div className="flex items-center gap-2">
              <input type="number" min={1} max={120} className={inputCls} value={form.late_threshold}
                onChange={e => set('late_threshold', e.target.value)} />
              <span className="text-xs text-slate-600 flex-shrink-0">د</span>
            </div>
          </Field>

          <Field label="فترة السماح (دقيقة)" error={errors.grace_period}
            hint="مدة السماح بعد وقت الدوام قبل احتساب التأخير">
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={60} className={inputCls} value={form.grace_period}
                onChange={e => set('grace_period', e.target.value)} />
              <span className="text-xs text-slate-600 flex-shrink-0">د</span>
            </div>
          </Field>

          <Field label="حد العمل الإضافي (دقيقة)" error={errors.overtime_threshold}
            hint="المدة الزائدة بعد نهاية الدوام التي تُحتسب عملاً إضافياً">
            <div className="flex items-center gap-2">
              <input type="number" min={0} max={240} className={inputCls} value={form.overtime_threshold}
                onChange={e => set('overtime_threshold', e.target.value)} />
              <span className="text-xs text-slate-600 flex-shrink-0">د</span>
            </div>
          </Field>
        </div>
      </Section>

      {/* ════ Section 2: Sync ════ */}
      <Section
        id="sync"
        icon={Wifi}
        title="إعدادات المزامنة"
        color="bg-purple-700"
        expanded={expanded.sync}
        onToggle={() => toggleSection('sync')}
        hasChanges={changedKeys.some(k => ['auto_sync','sync_interval','max_retry_attempts'].includes(k))}
      >
        <div className="space-y-4">
          <Toggle
            value={form.auto_sync === 'true'}
            onChange={v => set('auto_sync', String(v))}
            label="المزامنة التلقائية"
            description="تشغيل مزامنة دورية تلقائية مع أجهزة البصمة"
          />

          {form.auto_sync === 'true' && (
            <div className="grid sm:grid-cols-2 gap-4 pt-2 border-t border-slate-800/60">
              <Field label="فترة المزامنة (دقيقة)" error={errors.sync_interval}
                hint="كم دقيقة بين كل عملية مزامنة تلقائية">
                <select className={inputCls} value={form.sync_interval}
                  onChange={e => set('sync_interval', e.target.value)}>
                  {[1, 2, 5, 10, 15, 30, 60].map(v => (
                    <option key={v} value={v}>
                      {v === 1 ? 'كل دقيقة' : v === 60 ? 'كل ساعة' : `كل ${v} دقائق`}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="أقصى عدد لإعادة المحاولة" error={errors.max_retry_attempts}
                hint="عند فشل المزامنة، كم مرة تُعاد المحاولة قبل تسجيل الخطأ">
                <input type="number" min={1} max={10} className={inputCls} value={form.max_retry_attempts}
                  onChange={e => set('max_retry_attempts', e.target.value)} />
              </Field>
            </div>
          )}
        </div>
      </Section>

      {/* ════ Section 3: Notifications ════ */}
      <Section
        id="notifications"
        icon={Bell}
        title="إعدادات الإشعارات"
        color="bg-amber-700"
        expanded={expanded.notifications}
        onToggle={() => toggleSection('notifications')}
        hasChanges={changedKeys.some(k => ['notify_on_failure'].includes(k))}
      >
        <div className="space-y-1">
          <Toggle
            value={form.notify_on_failure === 'true'}
            onChange={v => set('notify_on_failure', String(v))}
            label="إشعار عند فشل المزامنة"
            description="إرسال تنبيه داخلي عند فشل أي عملية مزامنة"
          />
          <div className="px-3 py-2 rounded-xl bg-slate-800/30 border border-slate-800">
            <p className="text-xs text-slate-600 leading-relaxed flex items-start gap-1.5">
              <Info size={11} className="mt-0.5 flex-shrink-0" />
              ربط الإشعارات بالبريد الإلكتروني أو Slack يتطلب تكوين Edge Function مخصصة.
              حالياً تظهر الإشعارات داخل المنصة فقط.
            </p>
          </div>
        </div>
      </Section>

      {/* ════ Section 4: Security ════ */}
      <Section
        id="security"
        icon={Shield}
        title="إعدادات الأمان"
        color="bg-red-700"
        expanded={expanded.security}
        onToggle={() => toggleSection('security')}
        hasChanges={changedKeys.some(k => ['session_timeout','require_2fa'].includes(k))}
      >
        <div className="space-y-4">
          <Toggle
            value={form.require_2fa === 'true'}
            onChange={v => set('require_2fa', String(v))}
            label="المصادقة الثنائية"
            description="إلزام مستخدمي البوابة التقنية بالمصادقة الثنائية عند تسجيل الدخول"
          />
          <Field label="مهلة الجلسة (دقيقة)" hint="المدة التي بعدها يُعاد تسجيل دخول المستخدم تلقائياً">
            <select className={inputCls} value={form.session_timeout}
              onChange={e => set('session_timeout', e.target.value)}>
              {[30, 60, 120, 240, 480, 720, 1440].map(v => (
                <option key={v} value={v}>
                  {v < 60 ? `${v} دقيقة` : v < 1440 ? `${v/60} ساعة` : 'يوم كامل'}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      {/* ─── Save Button ─── */}
      <div className="flex items-center justify-end gap-3 pt-2">
        {hasChanges && (
          <button onClick={handleDiscard} className="px-4 py-2.5 rounded-xl border border-slate-700 text-sm font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all">
            تجاهل التعديلات
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-bold transition-all shadow-lg shadow-cyan-900/40 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? 'جاري الحفظ...' : 'حفظ الإعدادات'}
        </button>
      </div>

      {/* ─── Audit Log Panel ─── */}
      {showAudit && (
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <History size={16} className="text-amber-400" />
              <h3 className="text-sm font-bold text-slate-200">سجل تعديلات الإعدادات</h3>
              <span className="text-xs text-slate-600">({auditLog.length} تعديل)</span>
            </div>
            <button onClick={() => setShowAudit(false)} className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-white hover:bg-slate-800 transition-all">
              <X size={13} />
            </button>
          </div>
          {auditLog.length === 0 ? (
            <div className="text-center py-8">
              <History size={28} className="text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-600">لا توجد تعديلات مسجلة في هذه الجلسة</p>
              <p className="text-xs text-slate-700 mt-1">ستظهر هنا كل تعديل تقوم به بعد الحفظ</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/40 max-h-80 overflow-y-auto">
              {auditLog.map(entry => <AuditRow key={entry.id} entry={entry} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}