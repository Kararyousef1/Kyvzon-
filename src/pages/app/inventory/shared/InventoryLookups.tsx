import { useEffect, useMemo, useState } from 'react';
import { inventoryLookupService, type InventoryLookupKey } from '../../../../services/sdk';

type LookupOption = { id: string; code: string; name?: string | null; meta?: string | null; warehouseId?: string | null };

type InventoryLookupProps = {
  label: string;
  value?: string;
  onChange: (id: string, option?: LookupOption) => void;
  required?: boolean;
  placeholder?: string;
  options: LookupOption[];
  loading?: boolean;
};

function InventoryLookup({ label, value, onChange, required, placeholder, options, loading }: InventoryLookupProps) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options.slice(0, 80);
    return options.filter(o => `${o.code} ${o.name || ''} ${o.meta || ''}`.toLowerCase().includes(s)).slice(0, 80);
  }, [options, q]);
  const selected = options.find(o => o.id === value);
  return (
    <label className="text-xs font-bold text-slate-600 space-y-1 block">
      <span>{label}{required ? ' *' : ''}</span>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder || 'ابحث بالكود أو الاسم...'} className="w-full border rounded-xl px-3 py-2 text-sm" />
      <select required={required} value={value || ''} onChange={e => onChange(e.target.value, options.find(o => o.id === e.target.value))} className="w-full border rounded-xl px-3 py-2 text-sm bg-white">
        <option value="">{loading ? 'جاري التحميل...' : '-- اختر --'}</option>
        {filtered.map(o => <option key={o.id} value={o.id}>{o.code}{o.name ? ` — ${o.name}` : ''}{o.meta ? ` — ${o.meta}` : ''}</option>)}
      </select>
      {selected && <div className="text-[11px] text-slate-400 truncate">المحدد: {selected.code}{selected.name ? ` — ${selected.name}` : ''}</div>}
    </label>
  );
}

function useLookup(key: InventoryLookupKey, mapper: (r: Record<string, unknown>) => LookupOption, deps: unknown[] = []) {
  const [rows, setRows] = useState<LookupOption[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const data = await inventoryLookupService.find(key);
        if (!mounted) return;
        setRows(data.map(mapper));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, ...deps]);
  return { options: rows, loading };
}

export function ItemLookup({ label = 'الصنف', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_items', r => ({ id: String(r.id), code: String(r.item_code || ''), name: String(r.name_ar || ''), meta: String(r.base_uom || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} placeholder="ابحث بكود أو اسم الصنف..." />;
}

export function WarehouseLookup({ label = 'المستودع', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_warehouses', r => ({ id: String(r.id), code: String(r.warehouse_code || ''), name: String(r.name_ar || ''), meta: String(r.warehouse_type || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} placeholder="ابحث بكود أو اسم المستودع..." />;
}

export function LocationLookup({ label = 'الموقع', value, onChange, required, warehouseId }: Omit<InventoryLookupProps, 'options'|'loading'> & { warehouseId?: string }) {
  const { options, loading } = useLookup('inventory_locations', r => ({ id: String(r.id), code: String(r.location_code || ''), name: String(r.barcode || ''), meta: String(r.location_type || ''), warehouseId: String(r.warehouse_id || '') }), [warehouseId]);
  const filtered = warehouseId ? options.filter(o => o.warehouseId === warehouseId) : options;
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={filtered} loading={loading} placeholder="ابحث بكود الموقع أو الباركود..." />;
}

export function DockLookup({ label = 'الرصيف', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_docks', r => ({ id: String(r.id), code: String(r.dock_code || ''), name: String(r.dock_type || ''), meta: String(r.status || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}

export function AsnLookup({ label = 'ASN', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_asns', r => ({ id: String(r.id), code: String(r.asn_number || ''), name: String(r.status || ''), meta: r.expected_arrival_at ? new Date(String(r.expected_arrival_at)).toLocaleDateString('ar-SA') : '' }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} placeholder="ابحث برقم ASN..." />;
}

export function ReceivingSessionLookup({ label = 'جلسة الاستلام', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_receiving_sessions', r => ({ id: String(r.id), code: String(r.session_number || ''), name: String(r.status || ''), meta: String(r.source_type || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} placeholder="ابحث برقم جلسة الاستلام..." />;
}

export function RmaLookup({ label = 'RMA', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_rmas', r => ({ id: String(r.id), code: String(r.rma_number || ''), name: String(r.status || ''), meta: String(r.reason_code || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}

export function RmaLineLookup({ label = 'سطر RMA', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_rma_lines', r => ({ id: String(r.id), code: String(r.id || '').slice(0,8), name: `Qty ${String(r.expected_qty || '')}`, meta: String(r.status || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} placeholder="ابحث بسطر RMA..." />;
}

export function SupplierLookup({ label = 'المورد', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('suppliers', r => ({ id: String(r.id), code: String(r.supplier_code || r.code || r.id || ''), name: String(r.legal_name || r.trade_name || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} placeholder="ابحث باسم أو كود المورد..." />;
}

export function WorkerLookup({ label = 'الموظف', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('profiles', r => ({ id: String(r.id), code: String(r.email || r.id || ''), name: String(r.full_name || ''), meta: String(r.role || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} placeholder="ابحث باسم أو بريد الموظف..." />;
}

export function PickOrderLookup({ label = 'أمر السحب', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_pick_orders', r => ({ id: String(r.id), code: String(r.pick_order_number || ''), name: String(r.status || ''), meta: String(r.priority || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function PickTaskLookup({ label = 'مهمة السحب', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_pick_tasks', r => ({ id: String(r.id), code: String(r.task_number || ''), name: String(r.status || ''), meta: String(r.required_qty || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function PickWaveLookup({ label = 'موجة السحب', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_pick_waves', r => ({ id: String(r.id), code: String(r.wave_number || ''), name: String(r.status || ''), meta: String(r.wave_type || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function PickListLookup({ label = 'قائمة السحب', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_pick_lists', r => ({ id: String(r.id), code: String(r.pick_list_number || ''), name: String(r.status || ''), meta: String(r.route_algorithm || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}

export function PackageLookup({ label = 'الطرد', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_packages', r => ({ id: String(r.id), code: String(r.package_number || ''), name: String(r.status || ''), meta: String(r.package_barcode || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function ShipmentLookup({ label = 'الشحنة', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_shipments', r => ({ id: String(r.id), code: String(r.shipment_number || ''), name: String(r.status || ''), meta: String(r.tracking_number || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function ManifestLookup({ label = 'Manifest', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_loading_manifests', r => ({ id: String(r.id), code: String(r.manifest_number || ''), name: String(r.status || ''), meta: String(r.truck_number || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function CarrierLookup({ label = 'الناقل', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_carriers', r => ({ id: String(r.id), code: String(r.carrier_code || ''), name: String(r.name_ar || ''), meta: String(r.provider || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}

export function CountPlanLookup({ label = 'خطة الجرد', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_cycle_count_plans', r => ({ id: String(r.id), code: String(r.plan_number || ''), name: String(r.status || ''), meta: String(r.plan_type || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function CountTaskLookup({ label = 'مهمة العد', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_count_tasks', r => ({ id: String(r.id), code: String(r.task_number || ''), name: String(r.status || ''), meta: `Round ${String(r.count_round || '')}` }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function CountLineLookup({ label = 'سطر العد', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_count_task_lines', r => ({ id: String(r.id), code: String(r.id || '').slice(0,8), name: String(r.counted_qty ?? 'غير معدود'), meta: String(r.system_qty ?? '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}

export function ReturnReceiptLineLookup({ label = 'سطر استلام المرتجع', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_return_receipt_lines', r => ({ id: String(r.id), code: String(r.id || '').slice(0,8), name: String(r.status || ''), meta: String(r.received_qty || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function ReturnAssessmentLookup({ label = 'تقييم المرتجع', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_return_condition_assessments', r => ({ id: String(r.id), code: `${String(r.condition_grade || '')}-${String(r.id || '').slice(0,8)}`, name: String(r.recommended_disposition || ''), meta: String(r.defect_type || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function ReturnDispositionTaskLookup({ label = 'مهمة التوجيه', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_return_disposition_tasks', r => ({ id: String(r.id), code: String(r.task_number || ''), name: String(r.disposition || ''), meta: String(r.status || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function ProductionReturnLookup({ label = 'إرجاع الإنتاج', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_production_returns', r => ({ id: String(r.id), code: String(r.production_return_number || ''), name: String(r.status || ''), meta: String(r.reason_code || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}

export function LaborTaskLookup({ label = 'مهمة العمالة', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_labor_dispatch_tasks', r => ({ id: String(r.id), code: String(r.task_number || ''), name: String(r.task_type || ''), meta: String(r.status || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function LaborInterleavingSuggestionLookup({ label = 'اقتراح الدمج', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_labor_task_interleaving_suggestions', r => ({ id: String(r.id), code: String(r.id || '').slice(0,8), name: String(r.status || ''), meta: String(r.estimated_minutes_saved || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function IncentiveProgramLookup({ label = 'برنامج الحوافز', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_labor_incentive_programs', r => ({ id: String(r.id), code: String(r.program_name || ''), name: String(r.status || ''), meta: `${String(r.period_start || '')} → ${String(r.period_end || '')}` }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}

export function AlertLookup({ label = 'التنبيه', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_analytics_alerts', r => ({ id: String(r.id), code: String(r.title || ''), name: String(r.severity || ''), meta: String(r.status || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
export function ReportRunLookup({ label = 'تشغيل التقرير', value, onChange, required }: Omit<InventoryLookupProps, 'options'|'loading'>) {
  const { options, loading } = useLookup('inventory_periodic_report_runs', r => ({ id: String(r.id), code: String(r.report_number || ''), name: String(r.report_type || ''), meta: String(r.delivery_status || '') }));
  return <InventoryLookup label={label} value={value} onChange={onChange} required={required} options={options} loading={loading} />;
}
