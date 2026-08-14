import { useState } from 'react';
import {
  inventoryRecordService,
  type InventoryStatusTable,
} from '../../../../services/sdk';

type Row = Record<string, unknown>;

type InventoryRecordToolsProps = {
  row: Row;
  copyKeys?: string[];
  tableName?: InventoryStatusTable;
  statusOptions?: Array<{ value: string; label: string }>;
  onChanged?: () => void;
};

const DEFAULT_COPY_KEYS = [
  'item_code','warehouse_code','location_code','asn_number','appointment_number','session_number','case_number','task_number','pick_order_number','wave_number','shipment_number','package_number','manifest_number','plan_number','rma_number','rtv_number','production_return_number','report_number','ncr_number','barcode','package_barcode','tracking_number',
];

async function copyToClipboard(value: unknown) {
  if (value === null || value === undefined || value === '') return;
  await navigator.clipboard.writeText(String(value));
}

type InferredActions = { tableName?: InventoryStatusTable; statusOptions?: Array<{ value: string; label: string }> };
function inferActions(row: Row): InferredActions {
  if (row.asn_number) return { tableName: 'inventory_asns', statusOptions: [{ value: 'cancelled', label: 'إلغاء' }, { value: 'closed', label: 'إغلاق' }] };
  if (row.appointment_number) return { tableName: 'inventory_dock_appointments', statusOptions: [{ value: 'cancelled', label: 'إلغاء' }, { value: 'completed', label: 'إكمال' }] };
  if (row.session_number) return { tableName: 'inventory_receiving_sessions', statusOptions: [{ value: 'completed', label: 'إكمال' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.case_number && row.osd_type) return { tableName: 'inventory_osd_cases', statusOptions: [{ value: 'resolved', label: 'حل الحالة' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.hold_number) return { tableName: 'inventory_quarantine_holds', statusOptions: [{ value: 'released', label: 'إفراج' }, { value: 'rejected', label: 'رفض' }] };
  if (row.pick_order_number) return { tableName: 'inventory_pick_orders', statusOptions: [{ value: 'released', label: 'إطلاق' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.exception_number) return { tableName: 'inventory_pick_exceptions', statusOptions: [{ value: 'resolved', label: 'حل' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.shipment_number) return { tableName: 'inventory_shipments', statusOptions: [{ value: 'cancelled', label: 'إلغاء' }, { value: 'shipped', label: 'شحن' }, { value: 'delivered', label: 'تسليم' }] };
  if (row.package_number) return { tableName: 'inventory_packages', statusOptions: [{ value: 'closed', label: 'إغلاق' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.manifest_number) return { tableName: 'inventory_loading_manifests', statusOptions: [{ value: 'closed', label: 'إغلاق' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.plan_number && row.plan_type) return { tableName: 'inventory_cycle_count_plans', statusOptions: [{ value: 'approved', label: 'اعتماد' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.rma_number) return { tableName: 'inventory_rmas', statusOptions: [{ value: 'approved', label: 'اعتماد' }, { value: 'cancelled', label: 'إلغاء' }, { value: 'closed', label: 'إغلاق' }] };
  if (row.rtv_number) return { tableName: 'inventory_return_rtv_claims', statusOptions: [{ value: 'submitted', label: 'إرسال' }, { value: 'closed', label: 'إغلاق' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.production_return_number) return { tableName: 'inventory_production_returns', statusOptions: [{ value: 'closed', label: 'إغلاق' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.report_number && row.report_type) return { tableName: 'inventory_periodic_report_runs', statusOptions: [{ value: 'queued', label: 'في الانتظار' }, { value: 'sent', label: 'مرسل' }, { value: 'cancelled', label: 'إلغاء' }] };
  if (row.alert_category && row.title) return { tableName: 'inventory_analytics_alerts', statusOptions: [{ value: 'acknowledged', label: 'تمت المراجعة' }, { value: 'resolved', label: 'حل' }, { value: 'dismissed', label: 'تجاهل' }] };
  return {};
}

function firstCopyKey(row: Row, keys?: string[]) {
  for (const key of [...(keys || []), ...DEFAULT_COPY_KEYS]) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return key;
  }
  return null;
}

export function InventoryRecordTools({ row, copyKeys, tableName, statusOptions, onChanged }: InventoryRecordToolsProps) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const key = firstCopyKey(row, copyKeys);
  const inferred = inferActions(row);
  const effectiveTableName = tableName || inferred.tableName;
  const effectiveStatusOptions = statusOptions || inferred.statusOptions;

  const updateStatus = async (status: string) => {
    if (!effectiveTableName || !row.id) return;
    if (!reason.trim()) { setMsg('يجب كتابة سبب التعديل أو الإغلاق قبل التنفيذ'); return; }
    setBusy(true); setMsg('');
    try {
      await inventoryRecordService.updateStatus({
        table: effectiveTableName,
        id: String(row.id),
        status,
        reason: reason.trim(),
      });
      setMsg('تم تحديث الحالة وتسجيلها في سجل النشاط');
      setReason('');
      onChanged?.();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void copyToClipboard(row.id)} className="text-xs px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200">نسخ ID</button>
        {key && <button type="button" onClick={() => void copyToClipboard(row[key])} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100">نسخ {key.includes('barcode') ? 'الباركود' : 'الكود/الرقم'}</button>}
        <button type="button" onClick={() => setOpen(true)} className="text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100">تفاصيل</button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" dir="rtl">
          <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[86vh] overflow-auto p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-xl font-black">تفاصيل السجل</h3>
                {key && <p className="text-xs text-slate-500 mt-1">{String(row[key])}</p>}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm">إغلاق</button>
            </div>
            <div className="grid md:grid-cols-2 gap-2 text-xs">
              {Object.entries(row).map(([k, v]) => (
                <div key={k} className="border border-slate-100 rounded-xl p-2 bg-slate-50/50">
                  <div className="font-black text-slate-500 mb-1">{k}</div>
                  <div className="break-all text-slate-800">{String(v ?? '—')}</div>
                </div>
              ))}
            </div>
            {effectiveStatusOptions && effectiveStatusOptions.length > 0 && effectiveTableName && Boolean(row.id) && (
              <div className="mt-4 border-t pt-4">
                <h4 className="font-black text-sm mb-2">إجراءات حالة آمنة</h4>
                <textarea value={reason} onChange={(e)=>setReason(e.target.value)} className="w-full border rounded-xl p-2 text-xs mb-3" rows={2} placeholder="اكتب سبب التعديل/الإغلاق — إلزامي للتدقيق" />
                <div className="flex flex-wrap gap-2">
                  {effectiveStatusOptions.map(opt => <button key={opt.value} disabled={busy} type="button" onClick={() => void updateStatus(opt.value)} className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-bold disabled:opacity-60">{opt.label}</button>)}
                </div>
                {msg && <div className="mt-3 text-xs rounded-xl bg-slate-100 p-2">{msg}</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
