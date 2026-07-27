import { useEffect, useState, type ReactNode } from 'react';
import { ItemLookup, LocationLookup, PackageLookup, PickOrderLookup, RmaLineLookup, WarehouseLookup } from './InventoryLookups';

type Line = Record<string, string | number | boolean | null>;
type BuilderProps = { value?: string; onChange: (json: string) => void };

function parseLines(value?: string, fallback: Line[] = []): Line[] {
  try { const v = value ? JSON.parse(value) : fallback; return Array.isArray(v) ? v : fallback; } catch { return fallback; }
}
function parseStrings(value?: string): string[] {
  try { const v = value ? JSON.parse(value) : []; return Array.isArray(v) ? v.map(String) : []; } catch { return []; }
}
function emit(lines: unknown[], onChange: (json: string)=>void) { onChange(JSON.stringify(lines, null, 2)); }
function field(label:string,value:unknown,onChange:(v:string)=>void,type='text'){
  return <label className="text-xs font-bold text-slate-600"><span>{label}</span><input type={type} value={String(value??'')} onChange={e=>onChange(e.target.value)} className="w-full border rounded-xl p-2 mt-1"/></label>;
}
function Box({title,children}:{title:string;children:ReactNode}){return <div className="md:col-span-3 border rounded-2xl p-3 bg-white"><h4 className="font-black text-sm mb-3">{title}</h4>{children}</div>}

function useLines(value: string | undefined, onChange: (json:string)=>void, fallback: Line[]) {
  const [lines,setLines]=useState<Line[]>(()=>parseLines(value,fallback));
  useEffect(()=>{emit(lines,onChange)},[]); // initial sync
  const sync=(next:Line[])=>{setLines(next); emit(next,onChange);};
  const patch=(i:number,p:Line)=>sync(lines.map((l,idx)=>idx===i?{...l,...p}:l));
  const remove=(i:number)=>sync(lines.filter((_,idx)=>idx!==i));
  const add=(line:Line)=>sync([...lines,line]);
  return {lines,patch,remove,add};
}

export function AsnLinesBuilder({value,onChange}:BuilderProps){
  const {lines,patch,remove,add}=useLines(value,onChange,[{item_id:'',expected_qty:1,uom:'PCS'}]);
  return <Box title="بنود ASN"><div className="space-y-3">{lines.map((l,i)=><div key={i} className="grid md:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl"><ItemLookup label="الصنف" value={String(l.item_id||'')} onChange={id=>patch(i,{item_id:id})} required />{field('الكمية المتوقعة',l.expected_qty,v=>patch(i,{expected_qty:Number(v||0)}),'number')}{field('الوحدة',l.uom,v=>patch(i,{uom:v}))}{field('Lot المورد',l.supplier_lot_number,v=>patch(i,{supplier_lot_number:v}))}{field('عدد الطرود',l.package_count,v=>patch(i,{package_count:Number(v||0)}),'number')}<button type="button" onClick={()=>remove(i)} className="text-xs bg-rose-50 text-rose-700 rounded-xl p-2">حذف البند</button></div>)}<button type="button" onClick={()=>add({item_id:'',expected_qty:1,uom:'PCS'})} className="text-sm bg-indigo-600 text-white rounded-xl px-3 py-2 font-bold">+ إضافة بند</button></div></Box>;
}

export function PickOrderLinesBuilder({value,onChange}:BuilderProps){
  const {lines,patch,remove,add}=useLines(value,onChange,[{item_id:'',requested_qty:1,uom:'PCS'}]);
  return <Box title="بنود أمر السحب"><div className="space-y-3">{lines.map((l,i)=><div key={i} className="grid md:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl"><ItemLookup label="الصنف" value={String(l.item_id||'')} onChange={id=>patch(i,{item_id:id})} required />{field('الكمية',l.requested_qty,v=>patch(i,{requested_qty:Number(v||0)}),'number')}{field('الوحدة',l.uom,v=>patch(i,{uom:v}))}<WarehouseLookup label="المستودع المفضل" value={String(l.warehouse_id||'')} onChange={id=>patch(i,{warehouse_id:id})} /><LocationLookup label="الموقع المفضل" value={String(l.location_id||'')} onChange={id=>patch(i,{location_id:id})} /><button type="button" onClick={()=>remove(i)} className="text-xs bg-rose-50 text-rose-700 rounded-xl p-2">حذف البند</button></div>)}<button type="button" onClick={()=>add({item_id:'',requested_qty:1,uom:'PCS'})} className="text-sm bg-indigo-600 text-white rounded-xl px-3 py-2 font-bold">+ إضافة بند</button></div></Box>;
}

export function RmaLinesBuilder({value,onChange}:BuilderProps){
  const {lines,patch,remove,add}=useLines(value,onChange,[{item_id:'',expected_qty:1,uom:'PCS',unit_value:0}]);
  return <Box title="بنود RMA"><div className="space-y-3">{lines.map((l,i)=><div key={i} className="grid md:grid-cols-5 gap-2 bg-slate-50 p-3 rounded-xl"><ItemLookup label="الصنف" value={String(l.item_id||'')} onChange={id=>patch(i,{item_id:id})} required />{field('الكمية',l.expected_qty,v=>patch(i,{expected_qty:Number(v||0)}),'number')}{field('الوحدة',l.uom,v=>patch(i,{uom:v}))}{field('قيمة الوحدة',l.unit_value,v=>patch(i,{unit_value:Number(v||0)}),'number')}{field('سبب العميل',l.declared_reason,v=>patch(i,{declared_reason:v}))}<button type="button" onClick={()=>remove(i)} className="text-xs bg-rose-50 text-rose-700 rounded-xl p-2">حذف البند</button></div>)}<button type="button" onClick={()=>add({item_id:'',expected_qty:1,uom:'PCS',unit_value:0})} className="text-sm bg-indigo-600 text-white rounded-xl px-3 py-2 font-bold">+ إضافة بند</button></div></Box>;
}

export function ReturnReceiveLinesBuilder({value,onChange}:BuilderProps){
  const {lines,patch,remove,add}=useLines(value,onChange,[{rma_line_id:'',received_qty:1,package_damage:false}]);
  return <Box title="بنود استلام المرتجع"><div className="space-y-3">{lines.map((l,i)=><div key={i} className="grid md:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl"><RmaLineLookup label="سطر RMA" value={String(l.rma_line_id||'')} onChange={id=>patch(i,{rma_line_id:id})} required />{field('الكمية المستلمة',l.received_qty,v=>patch(i,{received_qty:Number(v||0)}),'number')}<label className="text-xs font-bold text-slate-600"><span>تلف بالطرد؟</span><select value={String(Boolean(l.package_damage))} onChange={e=>patch(i,{package_damage:e.target.value==='true'})} className="w-full border rounded-xl p-2 mt-1"><option value="false">لا</option><option value="true">نعم</option></select></label><button type="button" onClick={()=>remove(i)} className="text-xs bg-rose-50 text-rose-700 rounded-xl p-2">حذف البند</button></div>)}<button type="button" onClick={()=>add({rma_line_id:'',received_qty:1,package_damage:false})} className="text-sm bg-indigo-600 text-white rounded-xl px-3 py-2 font-bold">+ إضافة بند</button></div></Box>;
}

export function ProductionReturnLinesBuilder({value,onChange}:BuilderProps){
  const {lines,patch,remove,add}=useLines(value,onChange,[{item_id:'',issued_qty:0,consumed_qty:0,return_qty:1,cost_rate:0}]);
  return <Box title="بنود إرجاع الإنتاج"><div className="space-y-3">{lines.map((l,i)=><div key={i} className="grid md:grid-cols-6 gap-2 bg-slate-50 p-3 rounded-xl"><ItemLookup label="الصنف" value={String(l.item_id||'')} onChange={id=>patch(i,{item_id:id})} required />{field('مصروف',l.issued_qty,v=>patch(i,{issued_qty:Number(v||0)}),'number')}{field('مستهلك',l.consumed_qty,v=>patch(i,{consumed_qty:Number(v||0)}),'number')}{field('مرتجع',l.return_qty,v=>patch(i,{return_qty:Number(v||0)}),'number')}{field('تكلفة الوحدة',l.cost_rate,v=>patch(i,{cost_rate:Number(v||0)}),'number')}<button type="button" onClick={()=>remove(i)} className="text-xs bg-rose-50 text-rose-700 rounded-xl p-2">حذف</button></div>)}<button type="button" onClick={()=>add({item_id:'',issued_qty:0,consumed_qty:0,return_qty:1,cost_rate:0})} className="text-sm bg-indigo-600 text-white rounded-xl px-3 py-2 font-bold">+ إضافة بند</button></div></Box>;
}

export function PackageIdsBuilder({value,onChange}:BuilderProps){return <IdsBuilder title="اختيار الطرود" value={value} onChange={onChange} type="package"/>}
export function PickOrderIdsBuilder({value,onChange}:BuilderProps){return <IdsBuilder title="اختيار أوامر السحب" value={value} onChange={onChange} type="pickOrder"/>}

export function TagValuesBuilder({value,onChange}:BuilderProps){
  const [tags,setTags]=useState<string[]>(()=>parseStrings(value)); const [tag,setTag]=useState('');
  const sync=(next:string[])=>{setTags(next); emit(next,onChange);};
  return <Box title="RFID Tags"><div className="flex gap-2"><input value={tag} onChange={e=>setTag(e.target.value)} className="border rounded-xl p-2 text-sm" placeholder="Tag value"/><button type="button" onClick={()=>{if(tag.trim()){sync([...tags,tag.trim()]);setTag('')}}} className="bg-indigo-600 text-white rounded-xl px-3 py-2 text-sm">إضافة</button></div><div className="flex flex-wrap gap-2 mt-2">{tags.map((t,i)=><button type="button" key={i} onClick={()=>sync(tags.filter((_,x)=>x!==i))} className="text-xs bg-slate-100 rounded-full px-3 py-1">{t} ×</button>)}</div></Box>
}

function IdsBuilder({title,value,onChange,type}:{title:string;value?:string;onChange:(json:string)=>void;type:'package'|'pickOrder'}){
  const [ids,setIds]=useState<string[]>(()=>parseStrings(value));
  const sync=(next:string[])=>{setIds(next); emit(next,onChange);};
  const add=(id:string)=>{if(id&&!ids.includes(id)) sync([...ids,id]);};
  return <Box title={title}><div className="grid md:grid-cols-2 gap-2">{type==='package'?<PackageLookup label="اختر طرداً" onChange={add}/>:<PickOrderLookup label="اختر أمر سحب" onChange={add}/>}</div><div className="flex flex-wrap gap-2 mt-2">{ids.map(id=><button type="button" key={id} onClick={()=>sync(ids.filter(x=>x!==id))} className="text-xs bg-slate-100 rounded-full px-3 py-1">{id.slice(0,8)}… ×</button>)}</div></Box>;
}
