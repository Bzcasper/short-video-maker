import { defineConfig } from "vitest/config";
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./src/tests/setup.ts'],
    testTimeout: 60000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    pool: 'threads',
    poolOptions: {
      threads: {
        maxThreads: 4,
        minThreads: 1,
        useAtomics: true
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/tests/setup.ts',
        '**/*.test.ts',
        '**/*.d.ts',
        'dist/'
      ]
    },
    include: [
      'src/**/*.test.ts',
      'src/tests/**/*.test.ts',
      'tests/**/*.test.ts'
    ],
    exclude: [
      'node_modules/',
      'dist/',
      '.git/'
    ],
    reporter: ['default', 'json', 'html']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './src/tests')
    }
  },
  define: {
    __TEST__: true
  }
});}
