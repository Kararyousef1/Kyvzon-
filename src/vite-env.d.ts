/// <reference types="vite/client" />

/**
 * Only values that are safe to expose to the browser belong here.
 * Service-role, AI-provider, device, and developer secrets must be
 * configured as server-side Edge Function secrets instead.
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  readonly VITE_APP_NAME: string;
  readonly VITE_APP_VERSION: string;
  readonly VITE_APP_ENV: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
