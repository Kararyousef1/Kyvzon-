/** procurement-send-rfq — إرسال RFx للموردين مع روابط بوابة عروض آمنة */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

function isProduction(): boolean { return (Deno.env.get('DENO_ENV') || Deno.env.get('APP_ENV') || 'production') === 'production'; }
function resolveAllowedOrigin(req: Request): string { const origin=req.headers.get('origin')||''; const allow=(Deno.env.get('APP_ORIGIN')||'').split(',').map(o=>o.trim()).filter(Boolean); const local=origin.includes('localhost')||origin.includes('127.0.0.1'); if(origin&&allow.includes(origin)) return origin; if(origin&&local&&!isProduction()) return origin; return ''; }
function headers(req: Request): Record<string,string> { const origin=resolveAllowedOrigin(req); const base:Record<string,string>={'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-app-name','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'}; if(origin) base['Access-Control-Allow-Origin']=origin; return base; }
function json(req: Request, body: unknown, status=200): Response { return new Response(JSON.stringify(body), { status, headers: headers(req) }); }
function token(): string { const b=new Uint8Array(32); crypto.getRandomValues(b); return Array.from(b).map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function hashToken(t:string): Promise<string> { const data=new TextEncoder().encode(t); const h=await crypto.subtle.digest('SHA-256', data); return Array.from(new Uint8Array(h)).map(b=>b.toString(16).padStart(2,'0')).join(''); }

serve(async (req: Request) => {
  if (req.method==='OPTIONS') return new Response(null, { status: 204, headers: headers(req) });
  if (req.method!=='POST') return json(req, { error: 'Method not allowed' }, 405);
  const requestOrigin=req.headers.get('origin'); if(requestOrigin&&resolveAllowedOrigin(req)==='') return json(req,{error:'Origin not allowed'},403);

  const supabaseUrl=Deno.env.get('SUPABASE_URL'); const anonKey=Deno.env.get('SUPABASE_ANON_KEY'); const authorization=req.headers.get('authorization');
  if(!supabaseUrl||!anonKey||!authorization?.startsWith('Bearer ')) return json(req,{error:'Auth/config missing'},503);
  const userClient=createClient(supabaseUrl, anonKey, { global:{headers:{Authorization:authorization}}, auth:{persistSession:false, autoRefreshToken:false} });
  const {data:authData,error:authError}=await userClient.auth.getUser(); if(authError||!authData.user) return json(req,{error:'جلسة غير صالحة'},401);
  const {data:profile}=await userClient.from('profiles').select('role, tenant_id').eq('id',authData.user.id).single();
  const allowed=new Set(['procurement','admin','developer','it_admin']); if(!profile||!allowed.has(String(profile.role))||!profile.tenant_id) return json(req,{error:'غير مخوّل'},403);

  let body:{event_id?:unknown;supplier_ids?:unknown}; try{body=await req.json();}catch{return json(req,{error:'حمولة غير صالحة'},400);}
  const eventId=String(body.event_id||'').trim(); const supplierIds=Array.isArray(body.supplier_ids)?body.supplier_ids.map((s:any)=>String(s)):[];
  if(!eventId||!supplierIds.length) return json(req,{error:'event_id و supplier_ids مطلوبان'},400);

  const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'); if(!serviceKey) return json(req,{error:'Service not configured'},503);
  const admin=createClient(supabaseUrl, serviceKey, {auth:{persistSession:false}});
  const {data:event,error:eventError}=await admin.from('sourcing_events').select('*').eq('id',eventId).eq('tenant_id',profile.tenant_id).single();
  if(eventError||!event) return json(req,{error:'حدث التوريد غير موجود'},404);
  const {data:suppliers}=await admin.from('suppliers').select('id, legal_name, email, status').in('id',supplierIds).eq('tenant_id',profile.tenant_id).eq('status','approved');

  let resendKey:string|undefined; let fromEmail=Deno.env.get('RESEND_FROM')||'procurement@kyvzon.com';
  try{ const {data:cred}=await admin.rpc('get_tenant_provider_secret',{p_tenant_id:profile.tenant_id,p_channel:'email',p_provider:'resend'}); const row=Array.isArray(cred)?cred[0]:cred; if(row?.secret_value){resendKey=row.secret_value; if(row.config?.from_email) fromEmail=String(row.config.from_email);} }catch{}
  if(!resendKey) resendKey=Deno.env.get('RESEND_API_KEY');

  const portalBase=(Deno.env.get('APP_ORIGIN')||'http://localhost:5173').split(',')[0].trim();
  let sent=0, failed=0; const simulatedLinks:Array<{supplier_id:string;link:string}> = [];
  for(const sup of suppliers||[]){
    const raw=token(); const tokenHash=await hashToken(raw); const link=`${portalBase}/supplier-rfx/${raw}`; const email=(sup as any).email || `${(sup as any).legal_name}@example.com`;
    const {data:inv,error:invError}=await admin.from('rfx_supplier_invitations').upsert({tenant_id:profile.tenant_id,event_id:eventId,supplier_id:(sup as any).id,email,token_hash:tokenHash,status:'invited',invited_by:authData.user.id,expires_at:new Date(Date.now()+14*86400000).toISOString()},{onConflict:'tenant_id,event_id,supplier_id'}).select('id').single();
    if(invError){failed++; continue;}
    if(resendKey){
      try{ const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:fromEmail,to:email,subject:`طلب ${event.type} ${event.event_number} — ${event.title}`,html:`<p>مرحباً ${(sup as any).legal_name},</p><p>تمت دعوتك لتقديم عرض لحدث التوريد ${event.event_number}: ${event.title}</p><p>نوع الحدث: ${event.type}</p><p>تاريخ الإغلاق: ${event.close_date?new Date(event.close_date).toLocaleDateString('ar-SA'):'-'}</p><p><a href="${link}">تقديم العرض عبر بوابة المورد</a></p>`})}); if(res.ok) sent++; else failed++; }catch{failed++;}
    } else { simulatedLinks.push({supplier_id:(sup as any).id, link}); sent++; }
    await admin.from('rfx_event_audit_log').insert({tenant_id:profile.tenant_id,event_id:eventId,actor_id:authData.user.id,action:'rfx_invitation_created',entity_table:'rfx_supplier_invitations',entity_id:inv?.id,new_value:{supplier_id:(sup as any).id,email,mode:resendKey?'live':'simulated'}}).catch(()=>undefined);
  }
  await admin.from('sourcing_events').update({issued_at:new Date().toISOString(),status:'open',updated_at:new Date().toISOString()}).eq('id',eventId).eq('tenant_id',profile.tenant_id);
  await admin.from('platform_audit_log').insert({action:'procurement_rfq_sent',category:'procurement',target_type:'sourcing_event',target_id:eventId,details:{event_number:event.event_number,supplier_count:supplierIds.length,sent,failed,mode:resendKey?'live':'simulated'},description:`تم إرسال ${event.type} ${event.event_number} لـ ${sent} موردين`}).catch(()=>undefined);
  return json(req,{mode:resendKey?'live':'simulated',ok:true,sent,failed,links:resendKey?undefined:simulatedLinks},200);
});
