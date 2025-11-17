import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['text-tester-by-stagehand/setup/env-setup.js'],
    include: ['tests/vitest/**/*.test.js'],
    exclude: ['node_modules/**'],
    environment: 'node',
    globals: true,
    reporters: ['default', 'html'],
    outputFile: './results/vitest-report.html',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './results/coverage',
      include: ['tests/vitest/**/*.js'],
      exclude: ['tests/vitest/test-utils.js']
    },
    testTimeout: 120000,
    hookTimeout: 120000
  },
  server: {
    port: 51204
  }
});