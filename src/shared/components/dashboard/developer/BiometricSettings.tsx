import { useState, useEffect, useRef } from 'react';
import {
  Fingerprint, Clock, Settings, Wifi, Plus, Trash2, RefreshCw,
  Power, PowerOff, Activity, Database, Shield, AlertTriangle, CheckCircle2,
  X, Edit3, Save, HardDrive, Monitor, Server, Search, BarChart3, Users
} from 'lucide-react';
import { useUIStore, useAuthStore } from '../../../../core/stores';
import { supabase } from '../../../../services/supabase/supabase';
import { settingsService } from '../../../../services/sdk';

interface BiometricDevice {
  id: string;
  name: string;
  serial_number: string;
  model: string;
  ip_address: string;
  port: number;
  status: 'connected' | 'disconnected' | 'error';
  location: string;
  last_sync: string | null;
  total_users: number;
  total_logs: number;
  firmware_version: string;
  db_type: string;
}

interface SyncLog {
  id: string;
  timestamp: string;
  device_name: string;
  status: 'success' | 'failed' | 'partial';
  records_count: number;
  errors_count: number;
  duration_ms: number;
  details: string;
}

interface AttendanceConfig {
  auto_sync: boolean;
  sync_interval_minutes: number;
  enable_notifications: boolean;
  strict_check_in: boolean;
  late_threshold_minutes: number;
  overtime_threshold_hours: number;
  weekend_days: string[];
  work_start_time: string;
  work_end_time: string;
  grace_period_minutes: number;
  /** نوع قاعدة بيانات البصمة (zkteco / supabase / external) */
  databaseType?: string;
  /** وقت انتهاء الاتصال بالجهاز بالثواني */
  timeout?: number;
}

function StatCard({ icon: Icon, label, value, color, sub }: { icon: any; label: string; value: string | number; color: string; sub?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-all">
      <div className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-br ${color} opacity-10 rounded-full blur-xl -translate-y-4 translate-x-4`} />
      <div className="relative">
        <Icon size={18} className="text-gray-500 mb-1" />
        <p className="text-2xl font-black text-gray-900 font-mono">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
        {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function DeviceCard({ device, onToggle, onSync, onEdit, onDelete }: {
  device: BiometricDevice;
  onToggle: (id: string) => void;
  onSync: (id: string) => void;
  onEdit: (device: BiometricDevice) => void;
  onDelete: (id: string) => void;
}) {
  const statusConfig: Record<string, { bg: string; dot: string; label: string; text: string; pulse: boolean }> = {
    connected: { bg: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500', label: 'متصل', text: 'text-emerald-700', pulse: true },
    disconnected: { bg: 'bg-gray-50 border-gray-200', dot: 'bg-gray-400', label: 'غير متصل', text: 'text-gray-500', pulse: false },
    error: { bg: 'bg-rose-50 border-rose-200', dot: 'bg-rose-500', label: 'خطأ', text: 'text-rose-700', pulse: true },
  };
  const cfg = statusConfig[device.status] || statusConfig.disconnected;
  const DeviceIcon = device.model.includes('SpeedFace') ? Monitor : Fingerprint;

  return (
    <div className={`relative rounded-xl border ${cfg.bg} p-4 hover:shadow-lg transition-all group`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${device.status === 'connected' ? 'bg-emerald-100' : device.status === 'disconnected' ? 'bg-gray-100' : 'bg-rose-100'}`}>
            <DeviceIcon size={24} className={device.status === 'connected' ? 'text-emerald-600' : device.status === 'disconnected' ? 'text-gray-400' : 'text-rose-600'} />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-sm">{device.name}</h4>
            <p className="text-xs text-gray-500 mt-0.5">{device.model} · {device.serial_number}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} ${cfg.pulse ? 'animate-pulse' : ''}`} />
          <span className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-white/80 rounded-lg p-2.5 border border-gray-100">
          <p className="text-[10px] text-gray-500">العنوان</p>
          <p className="text-xs font-mono font-bold text-gray-900">{device.ip_address}:{device.port}</p>
        </div>
        <div className="bg-white/80 rounded-lg p-2.5 border border-gray-100">
          <p className="text-[10px] text-gray-500">الموقع</p>
          <p className="text-xs font-bold text-gray-900 truncate">{device.location}</p>
        </div>
        <div className="bg-white/80 rounded-lg p-2.5 border border-gray-100">
          <p className="text-[10px] text-gray-500">المستخدمين</p>
          <p className="text-xs font-mono font-bold text-gray-900">{device.total_users}</p>
        </div>
        <div className="bg-white/80 rounded-lg p-2.5 border border-gray-100">
          <p className="text-[10px] text-gray-500">السجلات</p>
          <p className="text-xs font-mono font-bold text-gray-900">{device.total_logs.toLocaleString()}</p>
        </div>
      </div>
      {device.last_sync && (
        <p className="text-[10px] text-gray-400 mb-3">
          آخر مزامنة: {new Date(device.last_sync).toLocaleString('ar-SA')}
        </p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => onSync(device.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-bold transition-all">
          <RefreshCw size={12} /> مزامنة
        </button>
        <button onClick={() => onEdit(device)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 text-xs font-bold transition-all">
          <Edit3 size={12} /> تعديل
        </button>
        <button onClick={() => onToggle(device.id)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${device.status === 'connected' ? 'bg-amber-100 hover:bg-amber-200 text-amber-700' : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'}`}>
          {device.status === 'connected' ? <PowerOff size={12} /> : <Power size={12} />}
          {device.status === 'connected' ? 'تعطيل' : 'تفعيل'}
        </button>
        <button onClick={() => onDelete(device.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold transition-all">
          <Trash2 size={12} /> حذف
        </button>
      </div>
    </div>
  );
}

function AddDeviceModal({ onClose, onSave, editDevice }: {
  onClose: () => void;
  onSave: (device: Partial<BiometricDevice>) => void;
  editDevice?: BiometricDevice | null;
}) {
  const [form, setForm] = useState({
    name: editDevice?.name || '',
    serial_number: editDevice?.serial_number || '',
    model: editDevice?.model || 'ZKteco F18',
    ip_address: editDevice?.ip_address || '',
    port: editDevice?.port || 4370,
    location: editDevice?.location || '',
    db_type: editDevice?.db_type || 'zkteco',
  });

  const models = [
    'ZKteco F18', 'ZKteco F22', 'ZKteco F28',
    'ZKteco SpeedFace V5L', 'ZKteco SpeedFace V4L',
    'ZKteco uFace 302', 'ZKteco iFace 102',
    'ZKteco iFace950 Plus', 'أخرى',
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-2xl border border-gray-200 shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 border border-indigo-200 flex items-center justify-center">
              <Fingerprint size={20} className="text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-900">{editDevice ? 'تعديل الجهاز' : 'إضافة جهاز بصمة جديد'}</h3>
              <p className="text-xs text-gray-500">{editDevice ? 'تعديل بيانات جهاز البصمة' : 'ربط جهاز بصمة جديد بالنظام'}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={18} className="text-gray-400" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">اسم الجهاز</label>
              <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="مثال: جهاز البصمة الرئيسي"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">الرقم التسلسلي</label>
              <input type="text" value={form.serial_number} onChange={e => setForm(p => ({ ...p, serial_number: e.target.value }))}
                placeholder="ZK-2024-XXXXX"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">الموديل</label>
              <select value={form.model} onChange={e => setForm(p => ({ ...p, model: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all">
                {models.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">عنوان IP</label>
              <input type="text" value={form.ip_address} onChange={e => setForm(p => ({ ...p, ip_address: e.target.value }))}
                placeholder="192.168.1.100"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5">المنفذ (Port)</label>
              <input type="number" value={form.port} onChange={e => setForm(p => ({ ...p, port: parseInt(e.target.value) || 4370 }))}
                placeholder="4370"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all font-mono" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">الموقع</label>
              <input type="text" value={form.location} onChange={e => setForm(p => ({ ...p, location: e.target.value }))}
                placeholder="مثال: المدخل الرئيسي - الطابق الأرضي"
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5">نوع قاعدة البيانات</label>
              <select value={form.db_type} onChange={e => setForm(p => ({ ...p, db_type: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all">
                <option value="zkteco">ZKteco SDK (مزامنة مباشرة)</option>
                <option value="supabase">Supabase (قاعدة بيانات النظام)</option>
                <option value="external">خارجي (API خارجي)</option>
              </select>
            </div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-800 flex items-center gap-2">
              <AlertTriangle size={14} />
              تأكد من أن الجهاز متصل على نفس الشبكة وأن المنفذ مفتوح قبل إضافة الجهاز
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between p-5 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-bold text-sm hover:bg-gray-100 transition-all">
            إلغاء
          </button>
          <button onClick={() => onSave(form)}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/25 transition-all">
            <Save size={16} /> {editDevice ? 'حفظ التعديلات' : 'إضافة الجهاز'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BiometricSettings() {
  const { addToast } = useUIStore();
  const { user } = useAuthStore();
  const [devices, setDevices] = useState<BiometricDevice[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [config, setConfig] = useState<AttendanceConfig>({
    auto_sync: true,
    sync_interval_minutes: 15,
    enable_notifications: true,
    strict_check_in: false,
    late_threshold_minutes: 15,
    overtime_threshold_hours: 8,
    weekend_days: ['friday', 'saturday'],
    work_start_time: '08:00',
    work_end_time: '16:00',
    grace_period_minutes: 10,
  });
  const [activeTab, setActiveTab] = useState<'devices' | 'settings' | 'logs' | 'stats'>('devices');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState<BiometricDevice | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [testResult, setTestResult] = useState<{ device_id: string; success: boolean; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  const fetchFromSupabase = async () => {
    setIsLoading(true);
    try {
      const { data: syncData } = await supabase
        .from('sync_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (syncData) {
        setSyncLogs(syncData.map((s: any) => ({
          id: s.id,
          timestamp: s.created_at,
          device_name: `جهاز ${s.device_id || s.source}`,
          status: s.status === 'success' ? 'success' as const : 'failed' as const,
          records_count: s.records_synced || 0,
          errors_count: s.status === 'error' ? 1 : 0,
          duration_ms: 0,
          details: s.error_message || `مزامنة ${s.source} - ${s.records_synced || 0} سجل`
        })));
      }

      const { count: logsCount } = await supabase
        .from('attendance_logs')
        .select('*', { count: 'exact', head: true });

      // جلب إعدادات النظام عبر SettingsService
      try {
        const systemSettings = await settingsService.findSystemSettings();
        if (systemSettings) {
          const biometricConfig = systemSettings.biometric_config || {};
          setConfig({
            auto_sync: biometricConfig.auto_sync !== undefined ? biometricConfig.auto_sync : true,
            sync_interval_minutes: biometricConfig.sync_interval_minutes || 15,
            enable_notifications: biometricConfig.enable_notifications !== undefined ? biometricConfig.enable_notifications : true,
            strict_check_in: biometricConfig.strict_check_in || false,
            late_threshold_minutes: biometricConfig.late_threshold_minutes || 15,
            overtime_threshold_hours: biometricConfig.overtime_threshold_hours || 8,
            weekend_days: biometricConfig.weekend_days || ['friday', 'saturday'],
            work_start_time: biometricConfig.work_start_time || '08:00',
            work_end_time: biometricConfig.work_end_time || '16:00',
            grace_period_minutes: biometricConfig.grace_period_minutes || 10,
          });
        }
      } catch (err) {
        console.warn('Failed to load biometric settings:', err);
      }

      setDevices([{
        id: 'supabase-1',
        name: 'نظام Supabase',
        serial_number: 'CLOUD-001',
        model: 'Supabase Cloud',
        ip_address: 'api.supabase.co',
        port: 443,
        status: 'connected',
        location: 'Cloud Server',
        last_sync: syncData && syncData.length > 0 ? syncData[0].created_at : null,
        total_users: 0,
        total_logs: logsCount || 0,
        firmware_version: '-',
        db_type: 'supabase',
      }]);
    } catch (err) {
      console.error('❌ فشل جلب بيانات Supabase:', err);
      addToast('فشل جلب البيانات من قاعدة البيانات', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchFromSupabase(); }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [syncLogs]);

  const handleToggle = (id: string) => {
    setDevices(prev => prev.map(d => {
      if (d.id !== id) return d;
      const newStatus: 'connected' | 'disconnected' = d.status === 'connected' ? 'disconnected' : 'connected';
      addToast(`${d.name}: ${newStatus === 'connected' ? 'تم التفعيل' : 'تم التعطيل'}`, newStatus === 'connected' ? 'success' : 'warning');
      return { ...d, status: newStatus };
    }));
  };

  const handleSync = async (id: string) => {
    const device = devices.find(d => d.id === id);
    if (!device) return;
    setIsSyncing(true);
    addToast(`جاري مزامنة ${device.name}...`, 'info');
    await new Promise(resolve => setTimeout(resolve, 2000));
    const success = Math.random() > 0.3;
    const newLog: SyncLog = {
      id: `log-${Date.now()}`,
      timestamp: new Date().toISOString(),
      device_name: device.name,
      status: success ? 'success' : 'failed',
      records_count: success ? Math.floor(Math.random() * 50) + 10 : 0,
      errors_count: success ? 0 : Math.floor(Math.random() * 5) + 1,
      duration_ms: Math.floor(Math.random() * 4000) + 1000,
      details: success ? 'تمت المزامنة بنجاح' : 'فشل المزامنة: تعذر الاتصال بالجهاز'
    };
    setSyncLogs(prev => [newLog, ...prev]);
    setDevices(prev => prev.map(d => d.id === id ? { ...d, last_sync: new Date().toISOString(), status: success ? 'connected' : 'error' } : d));
    addToast(`تم ${success ? 'إتمام' : 'فشل'} مزامنة ${device.name}`, success ? 'success' : 'error');
    setIsSyncing(false);
  };

  const handleSyncAll = async () => {
    setIsSyncing(true);
    addToast('جاري مزامنة جميع الأجهزة...', 'info');
    await new Promise(resolve => setTimeout(resolve, 3000));
    setDevices(prev => prev.map(d => d.status === 'connected' ? { ...d, last_sync: new Date().toISOString() } : d));
    addToast('تمت مزامنة جميع الأجهزة المتصلة', 'success');
    setIsSyncing(false);
  };

  const handleTestConnection = (id: string) => {
    const device = devices.find(d => d.id === id);
    if (!device) return;
    addToast(`جاري اختبار الاتصال بـ ${device.name}...`, 'info');
    setTimeout(() => {
      const success = Math.random() > 0.3;
      setTestResult({ device_id: id, success, message: success ? '✅ الاتصال ناجح - زمن الاستجابة: 12ms' : '❌ فشل الاتصال - الجهاز لا يستجيب' });
      addToast(`اختبار الاتصال: ${success ? 'ناجح' : 'فاشل'}`, success ? 'success' : 'error');
    }, 1500);
  };

  const handleAddDevice = async (deviceData: Partial<BiometricDevice>) => {
    const newDevice: BiometricDevice = {
      id: `device-${Date.now()}`,
      name: deviceData.name || 'جهاز جديد',
      serial_number: deviceData.serial_number || '',
      model: deviceData.model || 'ZKteco F18',
      ip_address: deviceData.ip_address || '',
      port: deviceData.port || 4370,
      status: 'disconnected',
      location: deviceData.location || '',
      last_sync: null,
      total_users: 0,
      total_logs: 0,
      firmware_version: 'V1.0.0',
      db_type: deviceData.db_type || 'zkteco',
    };
    if (editingDevice) {
      setDevices(prev => prev.map(d => d.id === editingDevice.id ? { ...d, ...deviceData } : d));
      addToast(`تم تحديث بيانات ${newDevice.name}`, 'success');
    } else {
      setDevices(prev => [...prev, newDevice]);
      addToast(`تم إضافة ${newDevice.name} بنجاح`, 'success');
    }
    setShowAddModal(false);
    setEditingDevice(null);
  };

  const handleDelete = (id: string) => {
    const device = devices.find(d => d.id === id);
    if (device && window.confirm(`هل أنت متأكد من حذف ${device.name}؟`)) {
      setDevices(prev => prev.filter(d => d.id !== id));
      addToast(`تم حذف ${device.name}`, 'success');
    }
  };

  const handleEdit = (device: BiometricDevice) => {
    setEditingDevice(device);
    setShowAddModal(true);
  };

  const saveConfig = async () => {
    try {
      const currentSettings = await settingsService.findSystemSettings();
      const biometricConfig = {
        auto_sync: config.auto_sync,
        sync_interval_minutes: config.sync_interval_minutes,
        enable_notifications: config.enable_notifications,
        strict_check_in: config.strict_check_in,
        late_threshold_minutes: config.late_threshold_minutes,
        overtime_threshold_hours: config.overtime_threshold_hours,
        weekend_days: config.weekend_days,
        work_start_time: config.work_start_time,
        work_end_time: config.work_end_time,
        grace_period_minutes: config.grace_period_minutes,
      };

      if (currentSettings?.id) {
        await settingsService.updateSystemSettings(currentSettings.id, {
          biometric_config: biometricConfig,
          updated_at: new Date().toISOString(),
        } as unknown as Record<string, unknown>);
      } else {
        await settingsService.create({
          id: 'singleton',
          biometric_config: biometricConfig,
          updated_at: new Date().toISOString(),
        } as unknown as Record<string, unknown>);
      }
      addToast('تم حفظ إعدادات البصمة في قاعدة البيانات', 'success');
    } catch (err) {
      addToast('فشل حفظ الإعدادات', 'error');
    }
  };

  const filteredDevices = devices.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.serial_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.location.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const connectedDevices = devices.filter(d => d.status === 'connected').length;
  const totalLogs = devices.reduce((sum, d) => sum + d.total_logs, 0);
  const totalUsers = devices.reduce((sum, d) => sum + d.total_users, 0);
  const lastSyncTime = devices.reduce((latest, d) => {
    if (!d.last_sync) return latest;
    return d.last_sync > latest ? d.last_sync : latest;
  }, '');

  const tabs = [
    { id: 'devices' as const, label: 'الأجهزة', icon: Fingerprint },
    { id: 'settings' as const, label: 'الإعدادات', icon: Settings },
    { id: 'logs' as const, label: 'سجلات المزامنة', icon: Activity },
    { id: 'stats' as const, label: 'الإحصائيات', icon: BarChart3 },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" dir="rtl">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
        <span className="mr-3 text-gray-600">جاري تحميل بيانات البصمة...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" dir="rtl">
      <div className="relative overflow-hidden rounded-2xl border border-gray-200 shadow-xl bg-gradient-to-br from-indigo-900 via-indigo-800 to-purple-900">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
        <div className="relative z-10 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/25">
                <Fingerprint size={32} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white flex items-center gap-2">
                  إعدادات البصمة والتحكم
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">v1.0</span>
                </h1>
                <p className="text-indigo-200 text-sm mt-0.5">ربط وإدارة أجهزة البصمة • مزامنة البيانات • إعدادات الحضور</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleSyncAll} disabled={isSyncing}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/10 text-white font-bold text-sm transition-all disabled:opacity-50">
                <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} /> مزامنة الكل
              </button>
              <button onClick={() => { setEditingDevice(null); setShowAddModal(true); }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-500/25 transition-all">
                <Plus size={16} /> إضافة جهاز
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-2xl font-black text-white font-mono">{devices.length}</p>
              <p className="text-xs text-indigo-200">إجمالي الأجهزة</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-2xl font-black text-emerald-400 font-mono">{connectedDevices}</p>
              <p className="text-xs text-indigo-200">متصل</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-2xl font-black text-white font-mono">{totalUsers.toLocaleString()}</p>
              <p className="text-xs text-indigo-200">مستخدمي البصمة</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-2xl font-black text-white font-mono">{totalLogs.toLocaleString()}</p>
              <p className="text-xs text-indigo-200">إجمالي السجلات</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-3 border border-white/10">
              <p className="text-lg font-black text-white font-mono text-sm">
                {lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('ar-SA') : '--:--'}
              </p>
              <p className="text-xs text-indigo-200">آخر مزامنة</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-white p-1.5 rounded-xl border border-gray-200 shadow-md overflow-x-auto">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab === tab.id ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'}`}>
              <Icon size={16} /> {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'devices' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="ابحث عن جهاز..."
                className="w-full pr-9 pl-3 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all" />
            </div>
            <span className="text-xs text-gray-500">{filteredDevices.length} من {devices.length} جهاز</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDevices.map(device => (
              <div key={device.id}>
                <DeviceCard device={device} onToggle={handleToggle} onSync={handleSync} onEdit={handleEdit} onDelete={handleDelete} />
                {testResult?.device_id === device.id && (
                  <div className={`mt-2 p-3 rounded-xl text-xs font-bold ${testResult.success ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {testResult.message}
                  </div>
                )}
                <button onClick={() => handleTestConnection(device.id)}
                  className="mt-2 text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1">
                  <Activity size={12} /> اختبار الاتصال
                </button>
              </div>
            ))}
          </div>
          {filteredDevices.length === 0 && (
            <div className="text-center py-12">
              <Fingerprint size={48} className="mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500 text-sm">لا توجد أجهزة مطابقة للبحث</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-3xl space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Settings size={16} className="text-indigo-600" /> الإعدادات العامة
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-gray-900">المزامنة التلقائية</p>
                  <p className="text-xs text-gray-500">مزامنة بيانات البصمة تلقائياً مع قاعدة البيانات</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={config.auto_sync} onChange={e => setConfig(p => ({ ...p, auto_sync: e.target.checked }))} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                </label>
              </div>
              {config.auto_sync && (
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div>
                    <p className="text-sm font-bold text-gray-900">فترة المزامنة (بالدقائق)</p>
                    <p className="text-xs text-gray-500">كم مرة يتم مزامنة البيانات تلقائياً</p>
                  </div>
                  <select value={config.sync_interval_minutes} onChange={e => setConfig(p => ({ ...p, sync_interval_minutes: parseInt(e.target.value) }))}
                    className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500">
                    <option value={5}>كل 5 دقائق</option>
                    <option value={10}>كل 10 دقائق</option>
                    <option value={15}>كل 15 دقيقة</option>
                    <option value={30}>كل 30 دقيقة</option>
                    <option value={60}>كل ساعة</option>
                  </select>
                </div>
              )}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div>
                  <p className="text-sm font-bold text-gray-900">إشعارات المزامنة</p>
                  <p className="text-xs text-gray-500">إرسال إشعار عند نجاح/فشل المزامنة</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={config.enable_notifications} onChange={e => setConfig(p => ({ ...p, enable_notifications: e.target.checked }))} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                </label>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Clock size={16} className="text-indigo-600" /> إعدادات الحضور والانصراف
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">وقت بداية العمل</label>
                <input type="time" value={config.work_start_time} onChange={e => setConfig(p => ({ ...p, work_start_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500" />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">وقت نهاية العمل</label>
                <input type="time" value={config.work_end_time} onChange={e => setConfig(p => ({ ...p, work_end_time: e.target.value }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500" />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">فترة السماح (دقائق)</label>
                <input type="number" value={config.grace_period_minutes} onChange={e => setConfig(p => ({ ...p, grace_period_minutes: parseInt(e.target.value) || 10 }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500" min={0} max={60} />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">حد التأخير (دقائق)</label>
                <input type="number" value={config.late_threshold_minutes} onChange={e => setConfig(p => ({ ...p, late_threshold_minutes: parseInt(e.target.value) || 15 }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500" min={0} max={120} />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">حد الإضافي (ساعات)</label>
                <input type="number" value={config.overtime_threshold_hours} onChange={e => setConfig(p => ({ ...p, overtime_threshold_hours: parseInt(e.target.value) || 8 }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500" min={0} max={24} />
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">أيام العطلة</label>
                <select multiple value={config.weekend_days} onChange={e => setConfig(p => ({ ...p, weekend_days: Array.from(e.target.selectedOptions, o => o.value) }))}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500 h-20">
                  <option value="saturday">السبت</option>
                  <option value="sunday">الأحد</option>
                  <option value="monday">الإثنين</option>
                  <option value="tuesday">الثلاثاء</option>
                  <option value="wednesday">الأربعاء</option>
                  <option value="thursday">الخميس</option>
                  <option value="friday">الجمعة</option>
                </select>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl col-span-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-gray-900">تسجيل الدخول الصارم</p>
                    <p className="text-xs text-gray-500">منع تسجيل الحضور خارج أوقات الدوام المحددة</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" checked={config.strict_check_in} onChange={e => setConfig(p => ({ ...p, strict_check_in: e.target.checked }))} className="sr-only peer" />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Database size={16} className="text-indigo-600" /> إعدادات اتصال قاعدة البيانات
            </h3>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <p className="text-xs text-amber-800 flex items-center gap-2">
                <AlertTriangle size={14} />
                هذه الإعدادات تؤثر على طريقة اتصال النظام بأجهزة البصمة ومزامنة البيانات
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">نوع قاعدة بيانات البصمة</label>
                <select value={config.databaseType || "zkteco"}
                  onChange={(e) => setConfig({...config, databaseType: e.target.value})}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500">
                  <option value="zkteco">ZKteco SDK</option>
                  <option value="supabase">Supabase (PostgreSQL)</option>
                  <option value="external">API خارجي</option>
                </select>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl">
                <label className="block text-xs font-bold text-gray-700 mb-1.5">وقت انتهاء الاتصال (ثواني)</label>
                <input type="number" value={config.timeout || 5}
                  onChange={(e) => setConfig({...config, timeout: Number(e.target.value)})}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm text-gray-900 outline-none focus:border-indigo-500" />
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <button onClick={saveConfig}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-bold text-sm hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/25 transition-all">
              <Save size={16} /> حفظ الإعدادات
            </button>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-indigo-600" />
              <span className="text-sm font-bold text-gray-900">سجلات المزامنة</span>
              <span className="text-xs text-gray-500">| {syncLogs.length} سجل</span>
            </div>
            <button onClick={() => setSyncLogs([])} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-bold transition-all">
              <Trash2 size={12} /> مسح السجلات
            </button>
          </div>
          <div ref={logRef} className="max-h-96 overflow-y-auto">
            {syncLogs.map(log => {
              const statusConfig: Record<string, { bg: string; dot: string; text: string; label: string }> = {
                success: { bg: 'bg-emerald-50', dot: 'bg-emerald-500', text: 'text-emerald-700', label: 'ناجح' },
                failed: { bg: 'bg-rose-50', dot: 'bg-rose-500', text: 'text-rose-700', label: 'فاشل' },
                partial: { bg: 'bg-amber-50', dot: 'bg-amber-500', text: 'text-amber-700', label: 'جزئي' },
              };
              const cfg = statusConfig[log.status] || statusConfig.failed;
              return (
                <div key={log.id} className={`flex items-start gap-3 p-4 border-b border-gray-100 ${cfg.bg}`}>
                  <div className={`w-2 h-2 rounded-full ${cfg.dot} mt-1.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className={`text-sm font-bold ${cfg.text}`}>{log.device_name}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${cfg.text} bg-white/50`}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">{log.details}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-gray-400">
                      <span>{new Date(log.timestamp).toLocaleString('ar-SA')}</span>
                      <span>• {log.records_count} سجل</span>
                      {log.errors_count > 0 && <span className="text-rose-500">• {log.errors_count} خطأ</span>}
                      <span>• {log.duration_ms}ms</span>
                    </div>
                  </div>
                </div>
              );
            })}
            {syncLogs.length === 0 && (
              <div className="text-center py-12">
                <Activity size={32} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500 text-sm">لا توجد سجلات مزامنة</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'stats' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Fingerprint} label="إجمالي الأجهزة" value={devices.length} color="from-indigo-500 to-purple-600" sub={`${connectedDevices} متصل`} />
            <StatCard icon={Users} label="مستخدمي البصمة" value={totalUsers.toLocaleString()} color="from-emerald-500 to-teal-600" />
            <StatCard icon={HardDrive} label="إجمالي السجلات" value={totalLogs.toLocaleString()} color="from-cyan-500 to-blue-600" />
            <StatCard icon={Activity} label="عمليات المزامنة" value={syncLogs.length} color="from-amber-500 to-orange-600" sub={`${syncLogs.filter(l => l.status === 'success').length} ناجحة`} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 size={16} className="text-indigo-600" /> أداء الأجهزة
            </h3>
            <div className="space-y-3">
              {devices.map(device => (
                <div key={device.id} className="p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Fingerprint size={14} className="text-gray-500" />
                      <span className="text-sm font-bold text-gray-900">{device.name}</span>
                    </div>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${device.status === 'connected' ? 'bg-emerald-100 text-emerald-700' : device.status === 'disconnected' ? 'bg-gray-200 text-gray-500' : 'bg-rose-100 text-rose-700'}`}>
                      {device.status === 'connected' ? 'متصل' : device.status === 'disconnected' ? 'منفصل' : 'خطأ'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                    <span>السجلات: {device.total_logs.toLocaleString()}</span>
                    <span>المستخدمين: {device.total_users}</span>
                    <span>IP: {device.ip_address}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Shield size={16} className="text-indigo-600" /> حالة النظام
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">خدمة المزامنة</span>
                </div>
                <p className="text-lg font-black text-emerald-700 font-mono mt-1">نشطة</p>
              </div>
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <div className="flex items-center gap-2">
                  <Wifi size={14} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700">اتصال الشبكة</span>
                </div>
                <p className="text-lg font-black text-emerald-700 font-mono mt-1">مستقر</p>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                <div className="flex items-center gap-2">
                  <Server size={14} className="text-amber-600" />
                  <span className="text-xs font-bold text-amber-700">حالة قاعدة البيانات</span>
                </div>
                <p className="text-lg font-black text-amber-700 font-mono mt-1">متصلة</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAddModal && (
        <AddDeviceModal
          onClose={() => { setShowAddModal(false); setEditingDevice(null); }}
          onSave={handleAddDevice}
          editDevice={editingDevice}
        />
      )}
    </div>
  );
}