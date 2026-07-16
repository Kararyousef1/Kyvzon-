# Kyvzon Biometric Agent

On-premise agent لتشغيل مزامنة أجهزة البصمة داخل شبكة العميل وربطها بمنصة Kyvzon.

## لماذا Agent؟

أجهزة ZKTeco غالبًا داخل شبكة محلية `192.168.x.x` ولا يمكن لـ Supabase Edge Functions الوصول إليها مباشرة. لذلك يعمل هذا الـ Agent داخل شبكة العميل ثم يرسل البصمات إلى Edge Function `zkteco-sync` بتوقيع HMAC.

## الميزات

- قراءة بصمات من adapters قابلة للتوسعة.
- توقيع HMAC متوافق مع `zkteco-sync`.
- Offline queue عند انقطاع الإنترنت.
- Local API للصحة والمزامنة اليدوية.
- Log محلي.
- Adapter تجريبي `mock`.
- Adapter `file` للاختبار من ملف JSON.
- نقطة توسعة `zkteco-tcp` للربط الحقيقي عبر SDK/مكتبة ZKTeco.

## الإعداد

```bash
cd tools/biometric-agent
cp config/agent.config.example.json config/agent.config.json
# عدّل edgeFunctionUrl و admsSecret و devices
npm run check
npm start
```

## Local API

```bash
curl -H "Authorization: Bearer CHANGE_ME_LOCAL_ADMIN_TOKEN" http://127.0.0.1:7755/health
curl -X POST -H "Authorization: Bearer CHANGE_ME_LOCAL_ADMIN_TOKEN" http://127.0.0.1:7755/sync
```

## Production notes

1. لا تكشف أجهزة البصمة مباشرة على الإنترنت.
2. استخدم ADMS_SECRET قوي ومطابق للسر في Supabase.
3. شغّل Agent كخدمة systemd/Windows Service.
4. استخدم adapter حقيقي لـ ZKTeco عبر مكتبة موثوقة أو SDK رسمي.
5. راقب `logs/agent.log` و `data/offline-queue.json`.

## systemd example

```ini
[Unit]
Description=Kyvzon Biometric Agent
After=network-online.target

[Service]
WorkingDirectory=/opt/kyvzon-biometric-agent
ExecStart=/usr/bin/node src/agent.mjs
Restart=always
RestartSec=5
Environment=KYVZON_AGENT_CONFIG=/opt/kyvzon-biometric-agent/config/agent.config.json

[Install]
WantedBy=multi-user.target
```

## Payload sent to zkteco-sync

```json
{
  "agent_id": "client-site-001",
  "tenant_id": "...",
  "records": [
    {
      "employee_code": "EMP001",
      "punch_time": "2026-07-16T10:00:00.000Z",
      "punch_type": "check-in",
      "verification_type": "finger",
      "device_id": "main-gate-zk-01"
    }
  ]
}
```
