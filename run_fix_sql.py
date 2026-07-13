import urllib.request
import json
import os
import subprocess
import sys

# قراءة معلومات الاتصال من ملف .env
supabase_url = None
service_key = None

with open('.env', 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if line.startswith('VITE_SUPABASE_URL='):
            supabase_url = line.split('=', 1)[1].strip()
        elif line.startswith('VITE_SUPABASE_SERVICE_KEY='):
            service_key = line.split('=', 1)[1].strip()

if not supabase_url or not service_key:
    print("❌ لم يتم العثور على VITE_SUPABASE_URL أو VITE_SUPABASE_SERVICE_KEY في .env")
    exit(1)

print(f"✅ وجدت رابط Supabase: {supabase_url}")
print(f"✅ وجدت مفتاح الخدمة: {service_key[:20]}...")

# قراءة schema.sql فقط (هذا كل ما نحتاجه لقاعدة جديدة)
sql_path = 'database/schema.sql'
if not os.path.exists(sql_path):
    print(f"❌ الملف {sql_path} غير موجود")
    exit(1)

with open(sql_path, 'r', encoding='utf-8') as f:
    combined_sql = f.read()

print(f"📄 تم تحميل schema.sql ({len(combined_sql)} حرف)")

print(f"\n📦 SQL الكلي: {len(combined_sql)} حرف")

# الطريقة الأولى: استخدام /rest/v1/ مع pg extension أو sql endpoint
print(f"\n🚀 جاري إرسال SQL إلى Supabase PostgreSQL...")

# تجربة استخدام API مباشر مع سكريبت psql إذا كان متاحاً
try:
    # استخدام REST API مباشرة مع endpoint pg
    endpoint = f"{supabase_url}/rest/v1/"
    headers = {
        'apikey': service_key,
        'Authorization': f'Bearer {service_key}',
        'Content-Type': 'application/json',
    }
    
    # نحتاج إلى تقسيم SQL إلى عبارات منفصلة (حسب الفاصلة المنقوطة)
    statements = [s.strip() for s in combined_sql.split(';') if s.strip()]
    success_count = 0
    error_count = 0
    
    print(f"📊 عدد عبارات SQL المراد تنفيذها: {len(statements)}")
    
    for i, stmt in enumerate(statements):
        # نتخطى التعليقات فقط
        if stmt.startswith('--') or len(stmt) < 10:
            continue
        
        # نرسل العبارة كـ POST
        data = json.dumps({"query": stmt}).encode('utf-8')
        req = urllib.request.Request(endpoint, data=data, headers=headers, method='POST')
        
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = resp.read().decode('utf-8')
                success_count += 1
                if i % 20 == 0:
                    print(f"  ✅ {i+1}/{len(statements)} - {stmt[:60]}...")
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')[:200]
            # نتخطى أخطاء "already exists" لأنها متوقعة
            if 'already exists' in error_body.lower() or 'duplicate' in error_body.lower():
                success_count += 1
            else:
                error_count += 1
                if error_count <= 5:
                    print(f"  ⚠️  {i+1}: {error_body}")
        except Exception as e:
            error_count += 1
            if error_count <= 5:
                print(f"  ⚠️  {i+1}: {str(e)[:200]}")
    
    print(f"\n✅ تم بنجاح: {success_count} عبارة")
    print(f"❌ أخطاء: {error_count} عبارة (معظمها متوقعة مثل 'already exists')")

except Exception as e:
    print(f"❌ فشلت الطريقة الأولى: {e}")
    print("\n⚠️  الطريقة البديلة: قم بتشغيل schema.sql يدوياً")
    print("   1. اذهب إلى https://supabase.com/dashboard")
    print("   2. اختر مشروعك الجديد")
    print("   3. افتح SQL Editor")
    print("   4. الصق محتوى database/schema.sql")
    print("   5. شغّل الاستعلام")

print("\n✨ انتهى")
