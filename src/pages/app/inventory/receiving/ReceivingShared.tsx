import { FormEvent, useEffect, useState } from 'react';
import { InventoryRecordTools } from '../shared/InventoryRecordTools';
import { AsnLookup, DockLookup, ItemLookup, LocationLookup, ReceivingSessionLookup, WarehouseLookup } from '../shared/InventoryLookups';
import { AsnLinesBuilder } from '../shared/InventoryLineBuilders';
import {
  inventoryAsnService,
  inventoryCrossDockTaskService,
  inventoryDockAppointmentService,
  inventoryInboundNotificationService,
  inventoryLpnLabelPrintService,
  inventoryOsdCaseService,
  inventoryQualityNcrCaseService,
  inventoryReceivingAttachmentService,
  inventoryPutawayTaskService,
  inventoryQuarantineHoldService,
  inventoryReceivingAnalyticsService,
  inventoryReceivingLineService,
  inventoryReceivingScanService,
  inventoryReceivingSessionService,
  type InventoryStatusTable,
} from '../../../../services/sdk';

type Column = { key: string; label: string; render?: (row: Record<string, unknown>) => string };
type ServiceLike = { findAll: (opts?: unknown) => Promise<Record<string, unknown>[]> };
type FormState = Record<string, string>;

const configs: Record<string, { title: string; subtitle: string; service: ServiceLike; columns: Column[]; empty: string; cta?: string; orderBy?: string }> = {
  asn: {
    title: 'ASN — إشعارات الشحن المسبق', subtitle: 'الشحنات المتوقعة من الموردين قبل وصولها للمستودع', service: inventoryAsnService as unknown as ServiceLike, cta: 'إنشاء ASN', empty: 'لا توجد ASN بعد',
    columns: [
      { key: 'asn_number', label: 'رقم ASN' }, { key: 'status', label: 'الحالة' }, { key: 'expected_arrival_at', label: 'الوصول المتوقع', render: dateCell('expected_arrival_at') },
      { key: 'carrier_name', label: 'الناقل' }, { key: 'truck_number', label: 'الشاحنة' }, { key: 'total_packages', label: 'الطرود' },
    ],
  },
  docks: {
    title: 'جدولة الأرصفة', subtitle: 'حجز مواعيد الأرصفة ومنع التداخل والازدحام', service: inventoryDockAppointmentService as unknown as ServiceLike, cta: 'حجز رصيف', empty: 'لا توجد مواعيد أرصفة',
    columns: [
      { key: 'appointment_number', label: 'رقم الموعد' }, { key: 'status', label: 'الحالة' }, { key: 'scheduled_start', label: 'البداية', render: dateCell('scheduled_start') },
      { key: 'scheduled_end', label: 'النهاية', render: dateCell('scheduled_end') }, { key: 'package_count', label: 'الطرود' },
    ],
  },
  sessions: {
    title: 'جلسات الاستلام', subtitle: 'استقبال الشاحنة، فحص المستندات، العد والمسح، ثم posting', service: inventoryReceivingSessionService as unknown as ServiceLike, cta: 'بدء جلسة', empty: 'لا توجد جلسات استلام', orderBy: 'started_at',
    columns: [
      { key: 'session_number', label: 'رقم الجلسة' }, { key: 'source_type', label: 'المصدر' }, { key: 'status', label: 'الحالة' },
      { key: 'started_at', label: 'بدأت', render: dateCell('started_at') }, { key: 'posted_at', label: 'رُحّلت', render: dateCell('posted_at') },
    ],
  },
  osd: {
    title: 'OS&D — الانحرافات', subtitle: 'Overage / Shortage / Damage وكل استثناءات الاستلام', service: inventoryOsdCaseService as unknown as ServiceLike, cta: 'تسجيل حالة', empty: 'لا توجد حالات OS&D',
    columns: [
      { key: 'case_number', label: 'رقم الحالة' }, { key: 'osd_type', label: 'النوع' }, { key: 'severity', label: 'الخطورة' }, { key: 'status', label: 'الحالة' }, { key: 'created_at', label: 'تاريخ', render: dateCell('created_at') },
    ],
  },
  quarantine: {
    title: 'الحجر الصحي / الجودة', subtitle: 'كميات مستلمة لكنها غير متاحة حتى قرار الجودة', service: inventoryQuarantineHoldService as unknown as ServiceLike, empty: 'لا توجد كميات في الحجر',
    columns: [
      { key: 'hold_number', label: 'رقم الحجز' }, { key: 'quantity', label: 'الكمية' }, { key: 'reason', label: 'السبب' }, { key: 'status', label: 'الحالة' }, { key: 'created_at', label: 'تاريخ', render: dateCell('created_at') },
    ],
  },
  putaway: {
    title: 'مهام الإيداع Put-away', subtitle: 'نقل المستلم من الاستلام/الحجر إلى موقع التخزين', service: inventoryPutawayTaskService as unknown as ServiceLike, empty: 'لا توجد مهام إيداع',
    columns: [
      { key: 'task_number', label: 'رقم المهمة' }, { key: 'quantity', label: 'الكمية' }, { key: 'status', label: 'الحالة' }, { key: 'created_at', label: 'تاريخ', render: dateCell('created_at') },
    ],
  },
  crossdock: {
    title: 'Cross-Docking', subtitle: 'مهام الشحن المباشر دون تخزين طويل', service: inventoryCrossDockTaskService as unknown as ServiceLike, empty: 'لا توجد مهام Cross-Dock',
    columns: [
      { key: 'task_number', label: 'رقم المهمة' }, { key: 'destination_type', label: 'الوجهة' }, { key: 'quantity', label: 'الكمية' }, { key: 'status', label: 'الحالة' },
    ],
  },
  scans: {
    title: 'واجهة المسح المحمولة', subtitle: 'Scan-to-Confirm للباركود وLPN أثناء الاستلام', service: inventoryReceivingScanService as unknown as ServiceLike, cta: 'تسجيل مسح', empty: 'لا توجد عمليات مسح', orderBy: 'scanned_at',
    columns: [
      { key: 'scanned_value', label: 'القيمة' }, { key: 'scan_type', label: 'النوع' }, { key: 'scan_result', label: 'النتيجة' }, { key: 'result_message', label: 'الرسالة' }, { key: 'scanned_at', label: 'الوقت', render: dateCell('scanned_at') },
    ],
  },
  labels: {
    title: 'LPN / Labeling', subtitle: 'طباعة ومعاينة ملصقات وحدات المناولة', service: inventoryLpnLabelPrintService as unknown as ServiceLike, cta: 'طباعة LPN', empty: 'لا توجد ملصقات مطبوعة', orderBy: 'printed_at',
    columns: [
      { key: 'lpn_id', label: 'LPN ID' }, { key: 'printer_name', label: 'الطابعة' }, { key: 'printed_at', label: 'وقت الطباعة', render: dateCell('printed_at') },
    ],
  },
  notifications: {
    title: 'إشعارات الاستلام', subtitle: 'إشعارات الجودة والمشتريات والتخزين الناتجة عن الاستلام', service: inventoryInboundNotificationService as unknown as ServiceLike, empty: 'لا توجد إشعارات',
    columns: [
      { key: 'event_type', label: 'الحدث' }, { key: 'target_role', label: 'الدور' }, { key: 'title', label: 'العنوان' }, { key: 'created_at', label: 'التاريخ', render: dateCell('created_at') },
    ],
  },
  attachments: {
    title: 'مرفقات الاستلام وOS&D', subtitle: 'صور الشاحنة والأضرار والمستندات القانونية', service: inventoryReceivingAttachmentService as unknown as ServiceLike, cta: 'إرفاق ملف', empty: 'لا توجد مرفقات',
    columns: [
      { key: 'entity_type', label: 'الكيان' }, { key: 'file_name', label: 'الملف' }, { key: 'file_mime', label: 'النوع' }, { key: 'created_at', label: 'التاريخ', render: dateCell('created_at') },
    ],
  },
  ncr: {
    title: 'NCR الجودة', subtitle: 'حالات عدم المطابقة الناتجة عن أضرار أو انحرافات الاستلام', service: inventoryQualityNcrCaseService as unknown as ServiceLike, cta: 'فتح NCR', empty: 'لا توجد حالات NCR',
    columns: [
      { key: 'ncr_number', label: 'رقم NCR' }, { key: 'defect_type', label: 'العيب' }, { key: 'status', label: 'الحالة' }, { key: 'created_at', label: 'التاريخ', render: dateCell('created_at') },
    ],
  },
};


const tableByType: Record<string,InventoryStatusTable> = {
  asn:'inventory_asns', docks:'inventory_dock_appointments', sessions:'inventory_receiving_sessions', osd:'inventory_osd_cases', quarantine:'inventory_quarantine_holds', putaway:'inventory_putaway_tasks', crossdock:'inventory_cross_dock_tasks', scans:'inventory_receiving_scans', labels:'inventory_lpn_label_prints', notifications:'inventory_inbound_notifications', attachments:'inventory_receiving_attachments', ncr:'inventory_quality_ncr_cases'
};
const statusActionsByType: Record<string, Array<{value:string;label:string}>> = {
  asn:[{value:'cancelled',label:'إلغاء'}], docks:[{value:'cancelled',label:'إلغاء'},{value:'completed',label:'إكمال'}], osd:[{value:'resolved',label:'حل الحالة'},{value:'cancelled',label:'إلغاء'}], putaway:[{value:'cancelled',label:'إلغاء'}], crossdock:[{value:'cancelled',label:'إلغاء'}]
};

function dateCell(key: string) {
  return (row: Record<string, unknown>) => row[key] ? new Date(String(row[key])).toLocaleString('ar-SA') : '—';
}

function textInput(label: string, name: string, form: FormState, setForm: (patch: FormState) => void, required = false, type = 'text') {
  return (
    <label className="text-xs font-bold text-slate-600 space-y-1">
      <span>{label}</span>
      <input required={required} type={type} value={form[name] || ''} onChange={(e) => setForm({ [name]: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" />
    </label>
  );
}

function ActionBox({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bg-white border rounded-2xl p-4 shadow-sm"><h3 className="font-black mb-3">{title}</h3>{children}</div>;
}

function ReceivingActionPanel({ type, onDone }: { type: string; onDone: () => void }) {
  const [form, setFormState] = useState<FormState>({
    lines_json: '[{"item_id":"","expected_qty":1,"uom":"PCS"}]',
    osd_type: 'shortage',
    severity: 'warning',
    source_type: 'manual',
    condition_status: 'ok',
    uom: 'PCS',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const setForm = (patch: FormState) => setFormState((prev) => ({ ...prev, ...patch }));

  const run = async (handler: () => Promise<void>) => {
    setBusy(true); setMessage(null);
    try { await handler(); setMessage('تم تنفيذ العملية بنجاح'); onDone(); }
    catch (e) { setMessage(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  if (type === 'asn') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => {
      const lines = JSON.parse(form.lines_json || '[]') as unknown[];
      await inventoryAsnService.createFull({
        supplier_id: form.supplier_id || null,
        po_id: form.po_id || null,
        expected_arrival_at: form.expected_arrival_at || null,
        carrier_name: form.carrier_name || null,
        truck_number: form.truck_number || null,
        bol_number: form.bol_number || null,
        total_packages: Number(form.total_packages || 0),
        total_weight: form.total_weight ? Number(form.total_weight) : null,
        lines,
      });
    }); };
    return <ActionBox title="إنشاء ASN"><form onSubmit={submit} className="grid md:grid-cols-3 gap-3">{textInput('Supplier ID', 'supplier_id', form, setForm)}{textInput('PO ID', 'po_id', form, setForm)}{textInput('الوصول المتوقع', 'expected_arrival_at', form, setForm, false, 'datetime-local')}{textInput('الناقل', 'carrier_name', form, setForm)}{textInput('الشاحنة', 'truck_number', form, setForm)}{textInput('BOL', 'bol_number', form, setForm)}{textInput('عدد الطرود', 'total_packages', form, setForm, false, 'number')}<AsnLinesBuilder value={form.lines_json} onChange={(json)=>setForm({lines_json:json})} /><Submit busy={busy} />{message && <Msg message={message} />}</form></ActionBox>;
  }

  if (type === 'docks') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { await inventoryDockAppointmentService.schedule({ warehouse_id: form.warehouse_id, dock_id: form.dock_id || null, asn_id: form.asn_id || null, scheduled_start: form.scheduled_start, scheduled_end: form.scheduled_end, package_count: Number(form.package_count || 0), special_requirements: form.special_requirements || null }); }); };
    return <ActionBox title="حجز رصيف"><form onSubmit={submit} className="grid md:grid-cols-3 gap-3"><WarehouseLookup label="اختر المستودع" value={form.warehouse_id} onChange={(id)=>setForm({warehouse_id:id})} required /><DockLookup label="اختر الرصيف" value={form.dock_id} onChange={(id)=>setForm({dock_id:id})} /><AsnLookup label="اختر ASN" value={form.asn_id} onChange={(id)=>setForm({asn_id:id})} />{textInput('البداية', 'scheduled_start', form, setForm, true, 'datetime-local')}{textInput('النهاية', 'scheduled_end', form, setForm, true, 'datetime-local')}{textInput('الطرود', 'package_count', form, setForm, false, 'number')}<Submit busy={busy} />{message && <Msg message={message} />}</form></ActionBox>;
  }

  if (type === 'sessions') {
    const start = (e: FormEvent) => { e.preventDefault(); void run(async () => { await inventoryReceivingSessionService.start({ warehouse_id: form.warehouse_id, receiving_location_id: form.receiving_location_id || null, asn_id: form.asn_id || null, appointment_id: form.appointment_id || null, po_id: form.po_id || null, source_type: form.source_type || 'manual', driver_name: form.driver_name || null, bol_number: form.bol_number || null, seal_number: form.seal_number || null, seal_status: form.seal_status || null }); }); };
    const recordLine = () => run(async () => { await inventoryReceivingLineService.record({ session_id: form.line_session_id, item_id: form.item_id, expected_qty: Number(form.expected_qty || 0), received_qty: Number(form.received_qty || 0), accepted_qty: Number(form.accepted_qty || 0), rejected_qty: Number(form.rejected_qty || 0), uom: form.uom || 'PCS', lot_number: form.lot_number || null, expiry_date: form.expiry_date || null, requires_quality: form.requires_quality === 'true', condition_status: form.condition_status || 'ok', target_location_id: form.target_location_id || null, generate_lpn: form.generate_lpn !== 'false' }); });
    const post = () => run(async () => { await inventoryReceivingSessionService.post(form.post_session_id); });
    return <div className="grid gap-4"><ActionBox title="بدء جلسة استلام"><form onSubmit={start} className="grid md:grid-cols-3 gap-3"><WarehouseLookup label="اختر المستودع" value={form.warehouse_id} onChange={(id)=>setForm({warehouse_id:id})} required /><LocationLookup label="موقع الاستلام" value={form.receiving_location_id} onChange={(id)=>setForm({receiving_location_id:id})} /><AsnLookup label="اختر ASN" value={form.asn_id} onChange={(id)=>setForm({asn_id:id})} />{textInput('Appointment ID', 'appointment_id', form, setForm)}{textInput('Driver', 'driver_name', form, setForm)}{textInput('BOL', 'bol_number', form, setForm)}<Submit busy={busy} />{message && <Msg message={message} />}</form></ActionBox><ActionBox title="تسجيل بند استلام"><div className="grid md:grid-cols-4 gap-3"><ReceivingSessionLookup label="اختر جلسة الاستلام" value={form.line_session_id} onChange={(id)=>setForm({line_session_id:id})} required /><ItemLookup label="اختر الصنف" value={form.item_id} onChange={(id)=>setForm({item_id:id})} required />{textInput('Expected', 'expected_qty', form, setForm, false, 'number')}{textInput('Received', 'received_qty', form, setForm, true, 'number')}{textInput('Accepted', 'accepted_qty', form, setForm, true, 'number')}{textInput('Rejected', 'rejected_qty', form, setForm, false, 'number')}{textInput('Lot', 'lot_number', form, setForm)}<LocationLookup label="موقع التخزين المستهدف" value={form.target_location_id} onChange={(id)=>setForm({target_location_id:id})} /><button disabled={busy} onClick={recordLine} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm">تسجيل البند</button></div></ActionBox><ActionBox title="ترحيل جلسة الاستلام"><div className="flex gap-3">{textInput('Session ID', 'post_session_id', form, setForm, true)}<button disabled={busy || !form.post_session_id} onClick={post} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm">Post</button></div></ActionBox></div>;
  }

  if (type === 'osd') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { await inventoryOsdCaseService.createCase({ session_id: form.session_id || null, receiving_line_id: form.receiving_line_id || null, osd_type: form.osd_type, severity: form.severity || 'warning', description: form.description, quantity_difference: form.quantity_difference ? Number(form.quantity_difference) : null, attachments: [] }); }); };
    return <ActionBox title="تسجيل OS&D"><form onSubmit={submit} className="grid md:grid-cols-3 gap-3">{textInput('Session ID', 'session_id', form, setForm)}{textInput('Receiving Line ID', 'receiving_line_id', form, setForm)}{textInput('النوع', 'osd_type', form, setForm, true)}{textInput('الخطورة', 'severity', form, setForm)}{textInput('فرق الكمية', 'quantity_difference', form, setForm, false, 'number')}{textInput('الوصف', 'description', form, setForm, true)}<Submit busy={busy} />{message && <Msg message={message} />}</form></ActionBox>;
  }

  if (type === 'scans') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { await inventoryReceivingScanService.scan(form.session_id, form.scanned_value, form.scan_type || 'barcode'); }); };
    return <ActionBox title="Scan-to-Confirm"><form onSubmit={submit} className="grid md:grid-cols-3 gap-3">{textInput('Session ID', 'session_id', form, setForm, true)}{textInput('Barcode / LPN / Item', 'scanned_value', form, setForm, true)}{textInput('نوع المسح', 'scan_type', form, setForm)}<Submit busy={busy} />{message && <Msg message={message} />}</form></ActionBox>;
  }

  if (type === 'labels') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { const payload = await inventoryLpnLabelPrintService.print(form.lpn_id, form.printer_name || undefined); setForm({ label_payload: JSON.stringify(payload, null, 2) }); }); };
    return <ActionBox title="طباعة / معاينة LPN"><form onSubmit={submit} className="grid md:grid-cols-3 gap-3">{textInput('LPN ID', 'lpn_id', form, setForm, true)}{textInput('Printer', 'printer_name', form, setForm)}<Submit busy={busy} />{message && <Msg message={message} />} {form.label_payload && <textarea readOnly value={form.label_payload} className="md:col-span-3 w-full border rounded-xl p-3 font-mono text-xs" rows={6} />}</form></ActionBox>;
  }

  if (type === 'attachments') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { await inventoryReceivingAttachmentService.attach({ entity_type: form.entity_type || 'osd_case', entity_id: form.entity_id, file_name: form.file_name, file_url: form.file_url, file_mime: form.file_mime || null }); }); };
    return <ActionBox title="إضافة مرفق"><form onSubmit={submit} className="grid md:grid-cols-3 gap-3">{textInput('نوع الكيان', 'entity_type', form, setForm, true)}{textInput('Entity ID', 'entity_id', form, setForm, true)}{textInput('اسم الملف', 'file_name', form, setForm, true)}{textInput('رابط الملف storage:// أو URL', 'file_url', form, setForm, true)}{textInput('MIME', 'file_mime', form, setForm)}<Submit busy={busy} />{message && <Msg message={message} />}</form></ActionBox>;
  }

  if (type === 'ncr') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(async () => { await inventoryQualityNcrCaseService.createFromOsd(form.osd_case_id, form.defect_type, form.description); }); };
    return <ActionBox title="فتح NCR من OS&D"><form onSubmit={submit} className="grid md:grid-cols-3 gap-3">{textInput('OS&D Case ID', 'osd_case_id', form, setForm, true)}{textInput('نوع العيب', 'defect_type', form, setForm, true)}{textInput('الوصف', 'description', form, setForm, true)}<Submit busy={busy} />{message && <Msg message={message} />}</form></ActionBox>;
  }

  return null;
}

function Submit({ busy }: { busy: boolean }) { return <button disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm">{busy ? 'جاري...' : 'حفظ'}</button>; }
function Msg({ message }: { message: string }) { return <div className="md:col-span-3 text-xs text-slate-600 bg-slate-50 rounded-xl p-2">{message}</div>; }

export function ReceivingTablePage({ type }: { type: keyof typeof configs }) {
  const cfg = configs[type];
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    cfg.service.findAll({ orderBy: cfg.orderBy || 'created_at', ascending: false, limit: 100 })
      .then((data) => mounted && setRows(data || []))
      .catch((e) => mounted && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [cfg.service, cfg.orderBy, type, refresh]);

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex justify-between gap-3 flex-wrap">
        <div><h1 className="text-3xl font-black">{cfg.title}</h1><p className="text-slate-500 mt-1">{cfg.subtitle}</p></div>
      </div>
      <ReceivingActionPanel type={type} onDone={() => setRefresh((x) => x + 1)} />
      <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
        {loading ? <div className="p-10 text-center text-slate-500">جاري التحميل...</div> : error ? <div className="p-6 text-red-600">{error}</div> : (
          <table className="w-full text-sm"><thead className="bg-slate-50"><tr>{cfg.columns.map((c) => <th key={c.key} className="p-3 text-right">{c.label}</th>)}<th className="p-3 text-right">إجراءات</th></tr></thead><tbody className="divide-y">{rows.map((row) => <tr key={String(row.id)}>{cfg.columns.map((c) => <td key={c.key} className="p-3">{c.render ? c.render(row) : String(row[c.key] ?? '—')}</td>)}<td className="p-3"><InventoryRecordTools row={row} tableName={tableByType[type]} statusOptions={statusActionsByType[type]} onChanged={() => setRefresh((x) => x + 1)} /></td></tr>)}{!rows.length && <tr><td colSpan={cfg.columns.length+1} className="p-10 text-center text-slate-400">{cfg.empty}</td></tr>}</tbody></table>
        )}
      </div>
    </div>
  );
}

export function ReceivingDashboard() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [kpis, setKpis] = useState<Record<string, unknown>[]>([]);
  useEffect(() => {
    inventoryReceivingAnalyticsService.dashboard().then(setRows).catch(() => setRows([]));
    inventoryReceivingAnalyticsService.kpis().then(setKpis).catch(() => setKpis([]));
  }, []);
  const first = kpis[0] || {};
  const cards: Array<[string, string | number]> = [
    ['جلسات الاستلام', Number(first.total_sessions ?? 0)],
    ['جلسات مرحّلة', Number(first.posted_sessions ?? 0)],
    ['ASN Compliance %', Number(first.asn_compliance_percent ?? 0)],
    ['OS&D', Number(first.osd_cases ?? 0)],
  ];
  return <div className="space-y-6" dir="rtl"><div><h1 className="text-3xl font-black">الاستلام والعمليات الواردة</h1><p className="text-slate-500 mt-1">ASN، جدولة الأرصفة، جلسات الاستلام، OS&D، الحجر وLPN.</p></div><div className="grid md:grid-cols-4 gap-4">{cards.map(([l,v])=><div key={l} className="bg-white border rounded-2xl p-5"><div className="text-xs text-slate-500">{l}</div><div className="text-2xl font-black mt-2">{v}</div></div>)}</div><div className="bg-white border rounded-2xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50"><tr><th className="p-3 text-right">المستودع</th><th className="p-3">جلسات مفتوحة</th><th className="p-3">ASN متوقعة</th><th className="p-3">أرصفة نشطة</th><th className="p-3">OS&D مفتوحة</th><th className="p-3">حجر</th></tr></thead><tbody>{rows.map(r=><tr key={String(r.warehouse_id)} className="border-t"><td className="p-3">{String(r.warehouse_code ?? '—')}</td><td className="p-3 text-center">{String(r.open_sessions ?? 0)}</td><td className="p-3 text-center">{String(r.expected_asns ?? 0)}</td><td className="p-3 text-center">{String(r.active_dock_appointments ?? 0)}</td><td className="p-3 text-center">{String(r.open_osd_cases ?? 0)}</td><td className="p-3 text-center">{String(r.quarantine_holds ?? 0)}</td></tr>)}{!rows.length&&<tr><td colSpan={6} className="p-10 text-center text-slate-400">لا توجد بيانات استقبال بعد</td></tr>}</tbody></table></div></div>;
}
