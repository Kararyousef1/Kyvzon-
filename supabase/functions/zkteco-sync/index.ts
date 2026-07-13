// ============================================================================
// Kyvzon Platform
// Edge Function: ZKTeco Biometric Sync
// تستقبل البصمات من جهاز ZKTeco عبر ADMS أو HTTP
// ============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

interface PunchRequest {
  employee_code: string;
  punch_time: string;
  punch_type?: 'check-in' | 'check-out';
  verification_type?: 'finger' | 'face' | 'card' | 'password';
  device_id?: string;
  secret?: string;
}

interface SyncResult {
  success: boolean;
  message: string;
  record_id?: number;
  employee_name?: string;
  shift_type?: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-app-secret',
  'Content-Type': 'application/json',
};

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET /health
  if (req.method === 'GET') {
    return new Response(
      JSON.stringify({
        status: 'healthy',
        service: 'zkteco-sync',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          POST: '/api/punch - سجل بصمة واحدة',
          POST_BULK: '/api/punch/bulk - سجل بصمات متعددة',
          GET_HEALTH: '/api/health - فحص الصحة',
        },
      }),
      { status: 200, headers: corsHeaders }
    );
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Method not allowed' }),
      { status: 405, headers: corsHeaders }
    );
  }

  try {
    // التحقق من التوقيع السري
    const appSecret = Deno.env.get('ADMS_SECRET') || '';
    const requestSecret = req.headers.get('x-app-secret') || '';
    
    if (appSecret && requestSecret !== appSecret) {
      await logSyncError('ADMS', 'توقيع غير صالح');
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid secret' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const body = await req.json();
    const url = new URL(req.url);
    const path = url.pathname;

    // توجيه حسب المسار
    if (path.endsWith('/api/punch/bulk')) {
      return await handleBulkPunch(body, appSecret);
    } else {
      return await handleSinglePunch(body, appSecret);
    }

  } catch (error) {
    console.error('❌ خطأ عام:', error);
    return new Response(
      JSON.stringify({ success: false, error: `Internal server error: ${error.message}` }),
      { status: 500, headers: corsHeaders }
    );
  }
});

/**
 * معالجة بصمة واحدة
 */
async function handleSinglePunch(body: any, appSecret: string): Promise<Response> {
  const { employee_code, punch_time, punch_type, verification_type, device_id, secret } = body as PunchRequest;

  // التحقق من الحقول المطلوبة
  if (!employee_code || !punch_time) {
    return new Response(
      JSON.stringify({ success: false, error: 'employee_code و punch_time مطلوبان' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  const supabase = createClient(supabaseUrl, supabaseKey);
  const result: SyncResult = { success: false, message: '' };

  try {
    // 1. البحث عن الموظف بالكود
    const { data: employee, error: empError } = await supabase
      .from('employees')
      .select('id, employee_code, first_name, last_name')
      .eq('employee_code', employee_code)
      .single();

    if (empError || !employee) {
      result.message = `الموظف بالكود ${employee_code} غير موجود`;
      
      await logSyncError('ADMS', result.message, { employee_code });
      
      return new Response(JSON.stringify(result), { status: 404, headers: corsHeaders });
    }

    // 2. تحديد نوع البصمة من ADMS
    const punchTime = new Date(punch_time);
    const shiftDate = punchTime.toISOString().split('T')[0];

    // استخدام دالة Supabase SQL لتحديد الوردية وحفظ البصمة
    const { data: dbResult, error: dbError } = await supabase.rpc('sync_adms_punch', {
      p_employee_code: employee_code,
      p_punch_time: punchTime.toISOString(),
      p_verification_type: verification_type || 'finger',
      p_device_id: device_id || `ADMS_${punchTime.getTime()}`,
    });

    if (dbError) {
      // إذا فشلت الدالة، نضيف السجل يدوياً
      const { data: insertResult, error: insertError } = await supabase
        .from('attendance_logs')
        .insert({
          employee_id: employee.id,
          punch_time: punchTime.toISOString(),
          punch_type: punch_type || 'check-in',
          shift_date: shiftDate,
          device_id: device_id || `ADMS_${punchTime.getTime()}`,
          verification_type: verification_type || 'finger',
          source: 'ADMS',
          raw_data: { employee_code, request_time: new Date().toISOString() },
        })
        .select('id')
        .single();

      if (insertError) {
        result.message = `فشل حفظ البصمة: ${insertError.message}`;
        
        await logSyncError('ADMS', result.message, { employee_code, error: insertError.message });
        
        return new Response(JSON.stringify(result), { status: 500, headers: corsHeaders });
      }

      result.success = true;
      result.record_id = insertResult.id;
      result.employee_name = `${employee.first_name} ${employee.last_name || ''}`;
      result.message = 'تم حفظ البصمة بنجاح';
    } else {
      result.success = true;
      result.employee_name = `${employee.first_name} ${employee.last_name || ''}`;
      result.shift_type = (dbResult as any)?.shift_type;
      result.message = 'تم حفظ البصمة ومعالجة الوردية';
    }

    // تسجيل عملية المزامنة الناجحة
    await supabase.from('sync_log').insert({
      source: 'ADMS',
      device_id: device_id || 'ADMS',
      records_synced: 1,
      status: 'success',
      details: {
        employee_code,
        employee_name: result.employee_name,
        punch_time: punchTime.toISOString(),
      },
    });

    return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });

  } catch (error) {
    result.message = `خطأ غير متوقع: ${error.message}`;
    
    await logSyncError('ADMS', result.message, { employee_code });
    
    return new Response(JSON.stringify(result), { status: 500, headers: corsHeaders });
  }
}

/**
 * معالجة بصمات متعددة (Bulk)
 */
async function handleBulkPunch(body: any, appSecret: string): Promise<Response> {
  const records = Array.isArray(body) ? body : body.records;
  
  if (!records || !Array.isArray(records) || records.length === 0) {
    return new Response(
      JSON.stringify({ success: false, error: 'يجب إرسال مصفوفة records' }),
      { status: 400, headers: corsHeaders }
    );
  }

  if (records.length > 500) {
    return new Response(
      JSON.stringify({ success: false, error: 'الحد الأقصى 500 سجل في المرة الواحدة' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const supabase = createClient(supabaseUrl, supabaseKey);

  const results: SyncResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const record of records) {
    const { employee_code, punch_time, punch_type, verification_type, device_id } = record;

    if (!employee_code || !punch_time) {
      results.push({
        success: false,
        message: `employee_code و punch_time مطلوبان في السجل`,
      });
      failCount++;
      continue;
    }

    try {
      const { data: employee } = await supabase
        .from('employees')
        .select('id, employee_code, first_name, last_name')
        .eq('employee_code', employee_code)
        .single();

      if (!employee) {
        results.push({ success: false, message: `الموظف ${employee_code} غير موجود` });
        failCount++;
        continue;
      }

      const punchTime = new Date(punch_time);
      const shiftDate = punchTime.toISOString().split('T')[0];

      const { data: insertResult, error: insertError } = await supabase
        .from('attendance_logs')
        .insert({
          employee_id: employee.id,
          punch_time: punchTime.toISOString(),
          punch_type: punch_type || 'check-in',
          shift_date: shiftDate,
          device_id: device_id || `ADMS_BULK`,
          verification_type: verification_type || 'finger',
          source: 'ADMS',
          raw_data: { employee_code, bulk: true },
        })
        .select('id')
        .single();

      if (insertError) {
        // تجاهل التكرار (constraint unique_employee_punch)
        if (insertError.code === '23505') {
          results.push({ success: true, message: 'مكرر - تم التجاهل' });
          successCount++;
        } else {
          results.push({ success: false, message: insertError.message });
          failCount++;
        }
      } else {
        results.push({
          success: true,
          record_id: insertResult.id,
          employee_name: `${employee.first_name} ${employee.last_name || ''}`,
          message: 'تم الحفظ',
        });
        successCount++;
      }
    } catch (error) {
      results.push({ success: false, message: `خطأ: ${error.message}` });
      failCount++;
    }
  }

  // تسجيل المزامنة
  await supabase.from('sync_log').insert({
    source: 'ADMS',
    device_id: 'ADMS_BULK',
    records_synced: successCount,
    status: failCount > 0 ? 'error' : 'success',
    error_message: failCount > 0 ? `${failCount} سجل فشل من أصل ${records.length}` : null,
    details: { total: records.length, success: successCount, fail: failCount },
  });

  return new Response(
    JSON.stringify({
      success: failCount === 0,
      total: records.length,
      synced: successCount,
      failed: failCount,
      results,
    }),
    { status: failCount > 0 ? 207 : 200, headers: corsHeaders }
  );
}

/**
 * تسجيل خطأ في المزامنة
 */
async function logSyncError(source: string, errorMessage: string, details?: any) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    await supabase.from('sync_log').insert({
      source,
      device_id: 'ADMS',
      records_synced: 0,
      status: 'error',
      error_message: errorMessage,
      details: details || {},
    });
  } catch {
    // تجاهل فشل تسجيل الخطأ نفسه
  }
}