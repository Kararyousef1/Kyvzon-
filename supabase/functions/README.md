# Supabase Edge Functions — Kyvzon

## Required secrets

Configure these in Supabase Edge Function secrets, never in frontend `.env` files:

- `APP_ORIGIN` — exact frontend origin, for example `https://app.example.com`.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only.
- `SUPABASE_ANON_KEY` — used to validate caller JWTs.
- `OPENROUTER_API_KEY` — used by `ai-chat` when an OpenRouter model is selected.
- `GROQ_API_KEY` — used by `ai-chat` for the Groq model.
- `ADMS_SECRET` — HMAC secret for ZKTeco requests.

## Deployment order

1. Apply the database migrations, including `103_secure_tenant_isolation.sql` and `104_device_sync_nonces.sql`.
2. Configure the secrets above.
3. Deploy the functions:

```bash
supabase functions deploy ai-chat
supabase functions deploy admin-create-user
supabase functions deploy admin-delete-user
supabase functions deploy admin-update-role
supabase functions deploy admin-reset-password
supabase functions deploy admin-toggle-status
supabase functions deploy zkteco-sync
supabase functions deploy biometric-device-action
```

4. Test with staging JWTs and a staging device signature before production.

## ZKTeco request signature

For a raw request body, compute:

```text
HMAC-SHA256(ADMS_SECRET, `${timestamp}.${nonce}.${rawBody}`)
```

Send the hexadecimal digest in `x-adms-signature` and the millisecond timestamp and nonce in:

- `x-adms-timestamp`
- `x-adms-nonce`

Requests older than five minutes or with a reused nonce are rejected.
