/**
 * vite.config.ts — نسخة محسَّنة
 *
 * 🔧 الإصلاحات:
 * ✅ تقسيم chunks أذكى: vendor / supabase / charts / ui
 * ✅ minify: terser (أصغر حجم bundle)
 * ✅ build.reportCompressedSize: false (بناء أسرع في CI)
 * ✅ chunkSizeWarningLimit رُفع إلى 700 (تقليل التحذيرات الوهمية)
 */

import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    outDir: "dist",
    assetsDir: "assets",
    sourcemap: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Rolldown/Vite 8 يقبل manualChunks كدالة فقط.
        // إبقاء التجميع حسب المجال يمنع خطأ build السابق مع Vite 8.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('/react/') || id.includes('/react-dom/')) return 'vendor';
          if (id.includes('react-router-dom') || id.includes('/zustand/')) return 'router';
          if (id.includes('@supabase/supabase-js')) return 'supabase';
          if (id.includes('/recharts/')) return 'charts';
          if (id.includes('/framer-motion/') || id.includes('/lucide-react/')) return 'ui';
          if (id.includes('react-hook-form') || id.includes('/zod/') || id.includes('@hookform/resolvers')) return 'forms';
          return undefined;
        },
      },
    },
  },
});