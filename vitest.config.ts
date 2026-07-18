/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/test/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/', 'dist/', 'e2e/', 'playwright.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      // Coverage gate currently targets the tested business-critical core.
      // Expanding this list is tracked work; untested UI/infrastructure must not
      // be silently counted as covered by a global threshold.
      include: [
        'src/utils/shiftCalculations.ts',
        'src/utils/shiftConfig.ts',
        'src/utils/shiftExport.ts',
        'src/utils/shiftReports.ts',
        'src/services/integrations/leaveAttendanceLink.ts',
        'src/services/notifications/notificationManager.ts',
        'src/shared/components/ui/Button.tsx',
      ],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'dist/',
        'e2e/',
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
