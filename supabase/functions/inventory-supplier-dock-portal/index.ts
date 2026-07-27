/** inventory-supplier-dock-portal — بوابة عامة للمورد لحجز رصيف عبر token */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
function headers(){return {'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'}}
function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:headers()})}
async function sha256Hex(value:string){const data=new TextEncoder().encode(value);const hash=await crypto.subtle.digest('SHA-256',data);return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join('')}
serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headers()}); if(req.method!=='POST')return json({error:'Method not allowed'},405);
 const supabaseUrl=Deno.env.get('SUPABASE_URL'); const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if(!supabaseUrl||!serviceKey)return json({error:'Service not configured'},503);
 let body:Record<string,unknown>; try{body=await req.json()}catch{return json({error:'حمولة غير صالحة'},400)}
 const action=String(body.action||'verify'); const token=String(body.token||'').trim(); if(!token||token.length<32)return json({error:'رابط الحجز غير صالح'},400);
 const admin=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false}}); const tokenHash=await sha256Hex(token);
 const {data:invite,error:invErr}=await admin.from('inventory_supplier_dock_invites').select('*').eq('token_hash',tokenHash).maybeSingle();
 if(invErr)return json({error:'تعذر التحقق من الدعوة'},500); if(!invite)return json({error:'الدعوة غير موجودة'},404); if(new Date(invite.expires_at).getTime()<Date.now())return json({error:'انتهت صلاحية الدعوة'},410); if(invite.status!=='active')return json({error:'الدعوة غير نشطة'},409);
 if(action==='verify'){
   const {data:docks}=await admin.from('inventory_docks').select('id,dock_code,dock_type,status').eq('tenant_id',invite.tenant_id).eq('warehouse_id',invite.warehouse_id).eq('status','active');
   return json({ok:true,email:invite.email,warehouse_id:invite.warehouse_id,asn_id:invite.asn_id,docks:docks||[]});
 }
 if(action==='book'){
   const dockId=String(body.dock_id||''); const start=String(body.scheduled_start||''); const end=String(body.scheduled_end||''); if(!start||!end)return json({error:'وقت البداية والنهاية مطلوب'},400);
   if(new Date(end).getTime()<=new Date(start).getTime()) return json({error:'نافذة الحجز غير صالحة'},400);
   if(dockId){
     const {data:overlap}=await admin.from('inventory_dock_appointments').select('id').eq('tenant_id',invite.tenant_id).eq('dock_id',dockId).not('status','in','("cancelled","completed","no_show")').lt('scheduled_start',end).gt('scheduled_end',start).limit(1);
     if(Array.isArray(overlap)&&overlap.length>0) return json({error:'الرصيف محجوز في هذه الفترة'},409);
   }
   const appointmentNumber=`DOCK-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,8)}`;
   const {data:appt,error}=await admin.from('inventory_dock_appointments').insert({tenant_id:invite.tenant_id,appointment_number:appointmentNumber,warehouse_id:invite.warehouse_id,dock_id:dockId||null,asn_id:invite.asn_id||null,supplier_id:invite.supplier_id||null,scheduled_start:start,scheduled_end:end,package_count:Number(body.package_count||0),special_requirements:String(body.special_requirements||'')||null,status:'scheduled'}).select('id').single();
   if(error)return json({error:error.message},400);
   await admin.from('inventory_supplier_dock_invites').update({status:'booked',used_at:new Date().toISOString()}).eq('id',invite.id);
   return json({ok:true,appointment_id:appt?.id});
 }
 return json({error:'إجراء غير مدعوم'},400);
});
