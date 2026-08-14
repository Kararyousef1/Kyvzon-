import { FormEvent, useEffect, useMemo, useState } from 'react';
import { ItemLookup, LocationLookup, WarehouseLookup } from './InventoryLookups';
import {
  inventoryAnalyticsService,
  inventoryBarcodeService,
  inventoryCodeSequenceService,
  inventoryItemService,
  inventoryLocationService,
  inventoryPostingService,
  inventoryRecordService,
  inventoryStockBalanceService,
  inventoryStockMovementService,
  inventoryWarehouseService,
} from '../../../../services/sdk';

type Column = { key: string; label: string; render?: (row: Record<string, unknown>) => string };
type ServiceLike = { findAll: (opts?: unknown) => Promise<Record<string, unknown>[]>; update?: (id:string,data:Record<string,unknown>)=>Promise<unknown> };
type FormState = Record<string, string>;
type PageType = 'items'|'warehouses'|'locations'|'stock'|'movements'|'numbering';

type PageConfig = {
  title: string;
  subtitle: string;
  service?: ServiceLike;
  columns: Column[];
  empty: string;
  cta?: string;
  orderBy?: string;
  entityType?: 'item'|'warehouse'|'location';
  codeKey?: string;
  barcodeKey?: string;
};

const short = (v: unknown) => v ? `${String(v).slice(0, 8)}…` : '—';
const configs: Record<PageType, PageConfig> = {
  items: {
    title: 'الأصناف والمواد', subtitle: 'Master Data للأصناف، وحدات القياس، وسياسات التتبع', service: inventoryItemService as unknown as ServiceLike, cta: 'إضافة صنف', empty: 'لا توجد أصناف بعد', entityType:'item', codeKey:'item_code',
    columns: [
      { key: 'item_code', label: 'الكود' }, { key: 'name_ar', label: 'الاسم' }, { key: 'item_type', label: 'النوع' },
      { key: 'base_uom', label: 'الوحدة' }, { key: 'tracking_policy', label: 'التتبع' }, { key: 'status', label: 'الحالة' },
      { key: 'id', label: 'ID', render: (r) => short(r.id) },
    ],
  },
  warehouses: {
    title: 'المستودعات', subtitle: 'المستودعات الرئيسية والفرعية وحالتها التشغيلية', service: inventoryWarehouseService as unknown as ServiceLike, cta: 'إضافة مستودع', empty: 'لا توجد مستودعات بعد', entityType:'warehouse', codeKey:'warehouse_code',
    columns: [
      { key: 'warehouse_code', label: 'الكود' }, { key: 'name_ar', label: 'المستودع' }, { key: 'warehouse_type', label: 'النوع' }, { key: 'status', label: 'الحالة' },
      { key: 'id', label: 'ID', render: (r) => short(r.id) },
    ],
  },
  locations: {
    title: 'المواقع التخزينية', subtitle: 'المناطق، الممرات، الأرفف، الخانات والباركود', service: inventoryLocationService as unknown as ServiceLike, cta: 'إضافة موقع', empty: 'لا توجد مواقع بعد', entityType:'location', codeKey:'location_code', barcodeKey:'barcode',
    columns: [
      { key: 'location_code', label: 'كود الموقع' }, { key: 'location_type', label: 'النوع' }, { key: 'status', label: 'الحالة' }, { key: 'barcode', label: 'الباركود' },
      { key: 'id', label: 'ID', render: (r) => short(r.id) },
    ],
  },
  stock: {
    title: 'الأرصدة الحالية', subtitle: 'الرصيد المتاح والمحجوز حسب الصنف والمستودع والموقع', service: inventoryStockBalanceService as unknown as ServiceLike, empty: 'لا توجد أرصدة بعد', orderBy: 'updated_at', cta: 'رصيد افتتاحي',
    columns: [
      { key: 'item_id', label: 'الصنف', render: (r) => short(r.item_id) }, { key: 'warehouse_id', label: 'المستودع', render: (r) => short(r.warehouse_id) }, { key: 'location_id', label: 'الموقع', render: (r) => short(r.location_id) },
      { key: 'on_hand_qty', label: 'الرصيد' }, { key: 'reserved_qty', label: 'محجوز' }, { key: 'available_qty', label: 'متاح' },
    ],
  },
  movements: {
    title: 'الكارت المخزني', subtitle: 'دفتر حركات immutable لكل تغيير مخزني', service: inventoryStockMovementService as unknown as ServiceLike, empty: 'لا توجد حركات بعد', orderBy: 'movement_date', cta: 'ترحيل حركة',
    columns: [
      { key: 'movement_number', label: 'رقم الحركة' }, { key: 'movement_type', label: 'النوع' }, { key: 'movement_date', label: 'التاريخ', render: (r) => r.movement_date ? new Date(String(r.movement_date)).toLocaleString('ar-SA') : '—' },
      { key: 'item_id', label: 'الصنف', render: (r) => short(r.item_id) }, { key: 'quantity', label: 'الكمية' }, { key: 'reference_type', label: 'المرجع' },
    ],
  },
  numbering: {
    title: 'قواعد الترميز والباركود', subtitle: 'احفظ نمط ترقيم مثل K-001 ليستمر تلقائياً إلى K-002، أو استخدم الإدخال اليدوي عند الحاجة.', service: inventoryCodeSequenceService as unknown as ServiceLike, empty: 'لا توجد قواعد ترقيم بعد', cta:'إضافة قاعدة',
    columns: [
      {key:'entity_type',label:'الكيان'}, {key:'sequence_name',label:'الاسم'}, {key:'prefix',label:'Prefix'}, {key:'padding',label:'Padding'}, {key:'next_number',label:'Next'}, {key:'barcode_prefix',label:'Barcode Prefix'}, {key:'is_default',label:'افتراضي'},
    ],
  },
};

function textInput(label: string, name: string, form: FormState, setForm: (patch: FormState) => void, required = false, type = 'text') {
  return <label className="text-xs font-bold text-slate-600 space-y-1"><span>{label}</span><input required={required} type={type} value={form[name] || ''} onChange={(e) => setForm({ [name]: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm" /></label>;
}
function selectInput(label: string, name: string, form: FormState, setForm: (patch: FormState) => void, options: string[]) {
  return <label className="text-xs font-bold text-slate-600 space-y-1"><span>{label}</span><select value={form[name] || options[0]} onChange={(e) => setForm({ [name]: e.target.value })} className="w-full border rounded-xl px-3 py-2 text-sm bg-white">{options.map(o => <option key={o} value={o}>{o}</option>)}</select></label>;
}
function Msg({ message, ok }: { message: string; ok?: boolean }) { return <div className={`md:col-span-4 text-xs rounded-xl p-2 ${ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message}</div>; }
function Submit({ busy, label }: { busy: boolean; label: string }) { return <button type="submit" disabled={busy} className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold text-sm disabled:opacity-60">{busy ? 'جاري...' : label}</button>; }
function ActionBox({ title, children }: { title: string; children: React.ReactNode }) { return <div className="bg-white border rounded-2xl p-4 shadow-sm"><h3 className="font-black mb-3">{title}</h3>{children}</div>; }

async function copyText(value: unknown) {
  if (!value) return;
  await navigator.clipboard.writeText(String(value));
}

function FoundationActionPanel({ type, onDone }: { type: PageType; onDone: () => void }) {
  const [form, setFormState] = useState<FormState>({
    entity_type:'item', sequence_name:'ترقيم الأصناف', prefix:'K', separator:'-', padding:'3', next_number:'1', barcode_prefix:'ITEM', barcode_type:'code128',
    item_type: 'raw_material', base_uom: 'KG', tracking_policy: 'lot', status: 'active', warehouse_type: 'main', location_type: 'bin', movement_type: 'opening_balance', quantity: '100', reason_code: 'manual_entry',
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const setForm = (patch: FormState) => setFormState(prev => ({ ...prev, ...patch }));
  const run = async (handler: () => Promise<unknown>, success: string) => {
    setBusy(true); setMessage(null);
    try { await handler(); setMessage({ text: success, ok: true }); onDone(); }
    catch (e) { setMessage({ text: e instanceof Error ? e.message : String(e), ok: false }); }
    finally { setBusy(false); }
  };
    if (type === 'numbering') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(() => inventoryCodeSequenceService.upsert({ ...form, padding:Number(form.padding||4), next_number:Number(form.next_number||1), include_year:form.include_year==='true', include_month:form.include_month==='true', is_default:true }), 'تم حفظ قاعدة الترميز بنجاح'); };
    const preview = async () => { try { const code = await inventoryCodeSequenceService.preview(form.entity_type); setMessage({ text: `الكود التالي: ${code}`, ok: true }); } catch(e) { setMessage({ text: e instanceof Error ? e.message : String(e), ok:false }); } };
    return <ActionBox title="إعداد قاعدة ترميز"><form onSubmit={submit} className="grid md:grid-cols-4 gap-3">{selectInput('نوع الكيان','entity_type',form,setForm,['item','warehouse','location','dock','asn','pick_order','shipment','rma','labor_task','generic'])}{textInput('اسم القاعدة','sequence_name',form,setForm,true)}{textInput('Prefix مثل K','prefix',form,setForm,true)}{textInput('الفاصل','separator',form,setForm)}{textInput('عدد الخانات','padding',form,setForm,true,'number')}{textInput('الرقم التالي','next_number',form,setForm,true,'number')}{textInput('Suffix اختياري','suffix',form,setForm)}{textInput('Barcode Prefix','barcode_prefix',form,setForm)}{selectInput('Barcode Type','barcode_type',form,setForm,['code128','qr','ean13','manual'])}<Submit busy={busy} label="حفظ قاعدة الترميز"/><button type="button" onClick={preview} className="px-4 py-2 rounded-xl bg-slate-700 text-white text-sm font-bold">معاينة الكود التالي</button>{message && <Msg message={message.text} ok={message.ok} />}</form></ActionBox>;
  }

  if (type === 'items') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(() => inventoryItemService.createSmart({ ...form, reorder_point: Number(form.reorder_point || 0), reorder_qty: Number(form.reorder_qty || 0) }), 'تم إنشاء الصنف بنجاح'); };
    return <ActionBox title="إضافة صنف يدوي"><form onSubmit={submit} className="grid md:grid-cols-4 gap-3">{textInput('كود الصنف (اختياري - يولد تلقائياً)', 'item_code', form, setForm)}{textInput('باركود (اختياري - يولد تلقائياً)', 'barcode', form, setForm)}{textInput('الاسم العربي', 'name_ar', form, setForm, true)}{textInput('الاسم الإنجليزي', 'name_en', form, setForm)}{selectInput('نوع الصنف', 'item_type', form, setForm, ['raw_material','finished_good','semi_finished','consumable','spare_part','packaging','other'])}{textInput('الوحدة', 'base_uom', form, setForm, true)}{selectInput('سياسة التتبع', 'tracking_policy', form, setForm, ['none','lot','serial','expiry','lot_expiry'])}{textInput('حد إعادة الطلب', 'reorder_point', form, setForm, false, 'number')}{textInput('كمية إعادة الطلب', 'reorder_qty', form, setForm, false, 'number')}<Submit busy={busy} label="إنشاء الصنف" />{message && <Msg message={message.text} ok={message.ok} />}</form></ActionBox>;
  }

  if (type === 'warehouses') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(() => inventoryWarehouseService.createSmart(form), 'تم إنشاء المستودع بنجاح'); };
    return <ActionBox title="إضافة مستودع"><form onSubmit={submit} className="grid md:grid-cols-4 gap-3">{textInput('كود المستودع (اختياري - يولد تلقائياً)', 'warehouse_code', form, setForm)}{textInput('باركود (اختياري - يولد تلقائياً)', 'barcode', form, setForm)}{textInput('الاسم العربي', 'name_ar', form, setForm, true)}{textInput('الاسم الإنجليزي', 'name_en', form, setForm)}{selectInput('نوع المستودع', 'warehouse_type', form, setForm, ['main','raw_material','finished_good','returns','damaged','quarantine','cold','cross_dock','shipping','other'])}<Submit busy={busy} label="إنشاء المستودع" />{message && <Msg message={message.text} ok={message.ok} />}</form></ActionBox>;
  }

  if (type === 'locations') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(() => inventoryLocationService.createSmart({ ...form, max_capacity: form.max_capacity ? Number(form.max_capacity) : null, current_capacity_used: form.current_capacity_used ? Number(form.current_capacity_used) : 0 }), 'تم إنشاء الموقع بنجاح'); };
    return <ActionBox title="إضافة موقع تخزيني"><form onSubmit={submit} className="grid md:grid-cols-4 gap-3"><WarehouseLookup label="اختر المستودع" value={form.warehouse_id} onChange={(id)=>setForm({warehouse_id:id})} required />{textInput('Zone ID اختياري', 'zone_id', form, setForm)}{textInput('كود الموقع (اختياري - يولد تلقائياً)', 'location_code', form, setForm)}{textInput('Barcode (اختياري - يولد تلقائياً)', 'barcode', form, setForm)}{selectInput('نوع الموقع', 'location_type', form, setForm, ['zone','aisle','rack','shelf','bin','dock','staging','quarantine'])}{textInput('Max Capacity', 'max_capacity', form, setForm, false, 'number')}{textInput('Used Capacity', 'current_capacity_used', form, setForm, false, 'number')}<Submit busy={busy} label="إنشاء الموقع" />{message && <Msg message={message.text} ok={message.ok} />}</form></ActionBox>;
  }

  if (type === 'stock' || type === 'movements') {
    const submit = (e: FormEvent) => { e.preventDefault(); void run(() => inventoryPostingService.postMovement({ movement_type: form.movement_type || 'opening_balance', item_id: form.item_id, warehouse_id: form.warehouse_id, location_id: form.location_id || null, quantity: Number(form.quantity || 0), reference_type: form.reference_type || 'manual', reason_code: form.reason_code || 'manual_entry' }), 'تم ترحيل حركة المخزون بنجاح'); };
    return <ActionBox title="ترحيل حركة مخزون"><form onSubmit={submit} className="grid md:grid-cols-4 gap-3">{selectInput('نوع الحركة', 'movement_type', form, setForm, ['opening_balance','receipt','putaway','relocation','issue','adjustment','return_in','scrap'])}<ItemLookup label="اختر الصنف" value={form.item_id} onChange={(id)=>setForm({item_id:id})} required /><WarehouseLookup label="اختر المستودع" value={form.warehouse_id} onChange={(id)=>setForm({warehouse_id:id})} required /><LocationLookup label="اختر الموقع" value={form.location_id} onChange={(id)=>setForm({location_id:id})} />{textInput('الكمية', 'quantity', form, setForm, true, 'number')}{textInput('Reference Type', 'reference_type', form, setForm)}{textInput('Reason Code', 'reason_code', form, setForm)}<Submit busy={busy} label="ترحيل الحركة" />{message && <Msg message={message.text} ok={message.ok} />}</form></ActionBox>;
  }
  return null;
}

function DetailModal({ row, type, onClose, onSaved }: { row: Record<string, unknown>; type: PageType; onClose:()=>void; onSaved:()=>void }) {
  const [form,setForm]=useState<FormState>(()=>Object.fromEntries(Object.entries(row).map(([k,v])=>[k,String(v??'')])));
  const [msg,setMsg]=useState('');
  const [reason,setReason]=useState('');
  const set=(patch:FormState)=>setForm(x=>({...x,...patch}));
  const entityType = type === 'items' ? 'item' : type === 'warehouses' ? 'warehouse' : type === 'locations' ? 'location' : null;
  const patch = () => {
    if(type==='items') return {name_ar:form.name_ar,name_en:form.name_en||null,reorder_point:Number(form.reorder_point||0),reorder_qty:Number(form.reorder_qty||0),status:form.status};
    if(type==='warehouses') return {name_ar:form.name_ar,name_en:form.name_en||null,status:form.status};
    if(type==='locations') return {barcode:form.barcode||null,status:form.status,max_capacity:form.max_capacity||null,current_capacity_used:form.current_capacity_used||0};
    return {};
  };
  const save=async()=>{try{
    if(!entityType) return;
    if(!reason.trim()){setMsg('يجب كتابة سبب التعديل للتدقيق'); return;}
    await inventoryRecordService.updateMaster({entityType,id:String(row.id),patch:patch(),reason:reason.trim()});
    setMsg('تم الحفظ وتسجيل التعديل في سجل النشاط'); setReason(''); onSaved();
  }catch(e){setMsg(e instanceof Error?e.message:String(e));}};
  const archive=async()=>{try{
    if(!entityType) return;
    if(!reason.trim()){setMsg('يجب كتابة سبب الأرشفة/الإغلاق للتدقيق'); return;}
    const status = type==='items' ? 'archived' : 'closed';
    await inventoryRecordService.updateMaster({entityType,id:String(row.id),patch:{status},reason:reason.trim()});
    setMsg('تم تعطيل/أرشفة السجل وتسجيل العملية'); setReason(''); onSaved();
  }catch(e){setMsg(e instanceof Error?e.message:String(e));}};
  const editable=['items','warehouses','locations'].includes(type);
  return <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"><div className="bg-white rounded-3xl max-w-3xl w-full max-h-[85vh] overflow-auto p-5" dir="rtl"><div className="flex justify-between items-center mb-4"><h3 className="font-black text-xl">تفاصيل السجل</h3><button onClick={onClose} className="px-3 py-1 rounded-xl bg-slate-100">إغلاق</button></div><div className="grid md:grid-cols-2 gap-2 text-xs mb-4">{Object.entries(row).map(([k,v])=><div key={k} className="border rounded-xl p-2"><div className="font-bold text-slate-500">{k}</div><div className="break-all">{String(v??'—')}</div></div>)}</div>{editable&&<div className="border-t pt-4 grid md:grid-cols-3 gap-3">{textInput('الاسم العربي','name_ar',form,set)}{textInput('الاسم الإنجليزي','name_en',form,set)}{textInput('Status','status',form,set)}{type==='items'&&<>{textInput('Reorder Point','reorder_point',form,set,false,'number')}{textInput('Reorder Qty','reorder_qty',form,set,false,'number')}</>}{type==='locations'&&<>{textInput('Barcode','barcode',form,set)}{textInput('Max Capacity','max_capacity',form,set,false,'number')}{textInput('Used Capacity','current_capacity_used',form,set,false,'number')}</>}<label className="md:col-span-3 text-xs font-bold text-slate-600 space-y-1"><span>سبب التعديل/الإغلاق — إلزامي</span><textarea value={reason} onChange={e=>setReason(e.target.value)} className="w-full border rounded-xl p-2" rows={2}/></label><button onClick={save} className="bg-emerald-600 text-white rounded-xl px-3 py-2 font-bold text-sm">حفظ التعديل</button><button onClick={archive} className="bg-amber-600 text-white rounded-xl px-3 py-2 font-bold text-sm">أرشفة/إغلاق</button>{msg&&<div className="md:col-span-3 text-xs bg-slate-100 rounded-xl p-2">{msg}</div>}</div>}</div></div>;
}

export function InventoryTablePage({ type }: { type: PageType }) {
  const cfg = configs[type];
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selected,setSelected]=useState<Record<string,unknown>|null>(null);
  const [toast,setToast]=useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    cfg.service?.findAll({ orderBy: cfg.orderBy || 'created_at', ascending: false, limit: 50 })
      .then((data) => mounted && setRows(data || []))
      .catch((e) => mounted && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [cfg.service, cfg.orderBy, type, refresh]);

  const copy = async(value:unknown,label:string)=>{await copyText(value); setToast(`تم نسخ ${label}`); setTimeout(()=>setToast(''),1800);};

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex justify-between items-start gap-3 flex-wrap">
        <div><h1 className="text-3xl font-black">{cfg.title}</h1><p className="text-slate-500 mt-1">{cfg.subtitle}</p></div>
      </div>
      {cfg.cta && <FoundationActionPanel type={type} onDone={() => setRefresh(x => x + 1)} />}
      {toast&&<div className="bg-emerald-50 text-emerald-700 p-2 rounded-xl text-xs">{toast}</div>}
      <div className="bg-white border rounded-2xl shadow-sm overflow-hidden">
        {loading ? <div className="p-10 text-center text-slate-500">جاري التحميل...</div> : error ? <div className="p-6 text-red-600">{error}</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600"><tr>{cfg.columns.map((c) => <th key={c.key} className="p-3 text-right">{c.label}</th>)}<th className="p-3 text-right">إجراءات</th></tr></thead>
              <tbody className="divide-y">
                {rows.map((row) => <tr key={String(row.id)} className="hover:bg-slate-50">{cfg.columns.map((c) => <td key={c.key} className="p-3">{c.render ? c.render(row) : String(row[c.key] ?? '—')}</td>)}<td className="p-3"><div className="flex flex-wrap gap-2"><button onClick={()=>void copy(row.id,'ID')} className="text-xs px-2 py-1 rounded-lg bg-slate-100">نسخ ID</button>{cfg.codeKey&&<button onClick={()=>void copy(row[cfg.codeKey!],'الكود')} className="text-xs px-2 py-1 rounded-lg bg-blue-50 text-blue-700">نسخ الكود</button>}{cfg.barcodeKey&&<button onClick={()=>void copy(row[cfg.barcodeKey!],'الباركود')} className="text-xs px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">نسخ الباركود</button>}<button onClick={()=>setSelected(row)} className="text-xs px-2 py-1 rounded-lg bg-indigo-50 text-indigo-700">تفاصيل/تعديل</button></div></td></tr>)}
                {!rows.length && <tr><td colSpan={cfg.columns.length+1} className="p-10 text-center text-slate-400">{cfg.empty}</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {selected&&<DetailModal row={selected} type={type} onClose={()=>setSelected(null)} onSaved={()=>setRefresh(x=>x+1)}/>}    
    </div>
  );
}

export function InventoryDashboard() {
  const [kpis, setKpis] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { let mounted = true; inventoryAnalyticsService.kpis().then((d) => mounted && setKpis(d)).catch(() => mounted && setKpis([])).finally(() => mounted && setLoading(false)); return () => { mounted = false; }; }, []);
  const first = kpis[0] || {};
  const cards = useMemo<Array<[string, string | number]>>(() => [
    ['إجمالي الأصناف', Number(first.total_items ?? 0)], ['أصناف تحت إعادة الطلب', Number(first.reorder_items ?? 0)], ['نفاد مخزون', Number(first.stockout_items ?? 0)], ['قيمة تقديرية', Number(first.estimated_value ?? 0).toLocaleString()],
  ], [first]);
  return <div className="space-y-6" dir="rtl"><div><h1 className="text-3xl font-black">بوابة المخزون والمستودعات</h1><p className="text-slate-500 mt-1">Foundation WMS مبني على وثائق الاستلام، التخزين، السحب، الشحن، الجرد، المرتجعات، العمالة والتحليلات.</p></div><div className="grid md:grid-cols-4 gap-4">{cards.map(([label, value]) => <div key={label} className="bg-white rounded-2xl border p-5 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="text-2xl font-black mt-2">{loading ? '...' : value}</div></div>)}</div></div>;
}

export function InventoryPlaceholderPage({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="space-y-4" dir="rtl"><h1 className="text-3xl font-black">{title}</h1><p className="text-slate-500">{subtitle}</p><div className="bg-white border rounded-2xl p-8 text-slate-500">هذه صفحة انتقالية.</div></div>;
}
