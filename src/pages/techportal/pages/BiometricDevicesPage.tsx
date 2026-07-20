/**
 * ════════════════════════════════════════════════════════════════
 *  BiometricDevicesPage — إدارة أجهزة البصمة ZKTeco
 *
 *  المسار: /app/tech-portal/biometric
 * ════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from 'react';
import { Fingerprint, Plus, RefreshCw, Trash2, Wifi, WifiOff, Edit3, X, Loader2 } from 'lucide-react';
import { biometricDeviceService } from '../../../services/sdk/BiometricDeviceService';
import { getErrorMessage } from '../../../services/errors';
import { useUIStore } from '../../../core/stores';
import type { BioDevice } from '../types';

export default function BiometricDevicesPage() {
  const { addToast } = useUIStore();
  const [devices, setDevices] = useState<BioDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<BioDevice | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    device_type: 'zkteco',
    ip_address: '',
    port: 4370,
    location: '',
    sync_interval_minutes: 5,
  });

  const loadDevices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await biometricDeviceService.findAllDevices();
      setDevices(data as unknown as BioDevice[]);
    } catch (err) {
      addToast('فشل تحميل الأجهزة', 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { loadDevices(); }, [loadDevices]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', device_type: 'zkteco', ip_address: '', port: 4370, location: '', sync_interval_minutes: 5 });
    setModalOpen(true);
  };

  const openEdit = (device: BioDevice) => {
    setEditing(device);
    setForm({
      name: device.name,
      device_type: device.device_type,
      ip_address: device.ip_address,
      port: device.port,
      location: device.location,
      sync_interval_minutes: device.sync_interval_minutes,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editing) {
        await biometricDeviceService.update(editing.id, form as any);
        addToast('تم تحديث الجهاز', 'success');
      } else {
        await biometricDeviceService.create(form as any);
        addToast('تم إضافة الجهاز', 'success');
      }
      setModalOpen(false);
      window.dispatchEvent(new CustomEvent('tech-portal-refresh'));
      await loadDevices();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الجهاز؟')) return;
    try {
      await biometricDeviceService.deleteDevice(id);
      addToast('تم حذف الجهاز', 'success');
      window.dispatchEvent(new CustomEvent('tech-portal-refresh'));
      await loadDevices();
    } catch (err) {
      addToast(getErrorMessage(err), 'error');
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-white">إدارة أجهزة البصمة</h1>
          <p className="text-xs text-slate-500 mt-0.5">{devices.length} جهاز مسجل</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadDevices} className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-700 text-slate-400 hover:text-slate-200">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-900/50 border border-cyan-700/50 text-cyan-300 text-sm font-bold hover:bg-cyan-900/80 transition-all">
            <Plus size={14} /> إضافة جهاز
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-xl bg-slate-800/40 animate-pulse" />)}
        </div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Fingerprint size={48} className="text-slate-700 mb-4" />
          <p className="text-slate-500 font-medium">لا توجد أجهزة بصمة مضافة</p>
          <button onClick={openCreate} className="mt-4 text-sm text-cyan-500 hover:text-cyan-300 underline">إضافة جهاز</button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {devices.map(device => (
            <div key={device.id} className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {device.is_active ? <Wifi size={16} className="text-emerald-400" /> : <WifiOff size={16} className="text-slate-600" />}
                  <span className="text-sm font-bold text-slate-200">{device.name}</span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(device)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-slate-800 text-slate-500 hover:text-slate-200"><Edit3 size={13} /></button>
                  <button onClick={() => handleDelete(device.id)} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-900/30 text-slate-500 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">IP:</span> <span className="text-slate-300 font-mono">{device.ip_address}</span></div>
                <div><span className="text-slate-500">Port:</span> <span className="text-slate-300">{device.port}</span></div>
                <div><span className="text-slate-500">الموقع:</span> <span className="text-slate-300">{device.location || '—'}</span></div>
                <div><span className="text-slate-500">المزامنة:</span> <span className="text-slate-300">{device.sync_interval_minutes}د</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="font-bold text-white">{editing ? 'تعديل جهاز' : 'إضافة جهاز'}</h3>
              <button onClick={() => setModalOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-800"><X size={16} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">اسم الجهاز</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">IP Address</label>
                  <input value={form.ip_address} onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))} className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white font-mono outline-none focus:border-cyan-500" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Port</label>
                  <input type="number" value={form.port} onChange={e => setForm(f => ({ ...f, port: Number(e.target.value) }))} className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" />
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">الموقع</label>
                <input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">دورة المزامنة (دقائق)</label>
                <input type="number" value={form.sync_interval_minutes} onChange={e => setForm(f => ({ ...f, sync_interval_minutes: Number(e.target.value) }))} className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-500" />
              </div>
            </div>
            <div className="flex gap-2 p-4 border-t border-slate-700">
              <button onClick={() => setModalOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-sm">إلغاء</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-cyan-900/50 border border-cyan-700/50 text-cyan-300 font-bold text-sm flex items-center justify-center gap-2">
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'جاري الحفظ...' : editing ? 'تحديث' : 'إضافة'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}