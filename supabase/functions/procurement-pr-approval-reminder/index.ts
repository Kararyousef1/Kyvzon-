/** procurement-pr-approval-reminder — cron لتذكير المعتمدين المتأخرين */
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

async function verifyCronSecret(req: Request): Promise<boolean> {
  const secret = Deno.env.get('CRON_SECRET'); if(!secret) return false;
  const provided=req.headers.get('x-cron-secret')||req.headers.get('authorization')?.replace('Bearer ','')||'';
  if(provided.length!==secret.length) return false;
  let diff=0; for(let i=0;i<secret.length;i++) diff|=secret.charCodeAt(i)^provided.charCodeAt(i);
  return diff===0;
}

serve(async (req: Request) => {
  if(req.method!=='POST'&&req.method!=='GET') return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{'Content-Type':'application/json'}});
  if(!(await verifyCronSecret(req))) return new Response(JSON.stringify({error:'Invalid cron secret'}),{status:401,headers:{'Content-Type':'application/json'}});
  const supabaseUrl=Deno.env.get('SUPABASE_URL'); const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!supabaseUrl||!serviceKey) return new Response(JSON.stringify({error:'Service not configured'}),{status:503,headers:{'Content-Type':'application/json'}});
  const admin=createClient(supabaseUrl, serviceKey, {auth:{persistSession:false}});
  try{
    const {data:rows,error}=await admin.from('pr_overdue_approvals').select('*').limit(200);
    if(error) throw error;
    let recorded=0;
    for(const r of rows||[]){
      // لا نكرر التذكير لنفس PR خلال 4 ساعات
      if(r.last_reminder_at && Date.now()-new Date(r.last_reminder_at).getTime()<4*3600*1000) continue;
      await admin.from('pr_approval_reminders').insert({tenant_id:r.tenant_id,pr_id:r.pr_id,approval_step_id:r.step_id,approver_id:r.approver_id,channel:'audit',details:{waiting_hours:r.waiting_hours,pr_number:r.pr_number,amount:r.total_estimated,currency:r.currency_code}});
      await admin.from('purchase_requisitions').update({last_reminder_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',r.pr_id).eq('tenant_id',r.tenant_id);
      await admin.from('pr_audit_log').insert({tenant_id:r.tenant_id,pr_id:r.pr_id,action:'approval_reminder_cron',old_status:r.status,new_status:r.status,new_value:{step_id:r.step_id,approver_id:r.approver_id,waiting_hours:r.waiting_hours},comments:'Automatic overdue approval reminder'}).catch(()=>undefined);
      recorded++;
    }
    await admin.from('platform_audit_log').insert({action:'procurement_pr_approval_reminder_cron',category:'procurement',target_type:'system',details:{overdue_count:rows?.length||0,recorded},description:`PR reminder cron: ${recorded} reminders`}).catch(()=>undefined);
    return new Response(JSON.stringify({ok:true,overdue:rows?.length||0,recorded}),{status:200,headers:{'Content-Type':'application/json'}});
  }catch(e){
    console.error('pr reminder cron failed', e instanceof Error?e.message:String(e));
    return new Response(JSON.stringify({error:'Cron failed'}),{status:500,headers:{'Content-Type':'application/json'}});
  }
});
