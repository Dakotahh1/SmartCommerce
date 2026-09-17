import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov', 'cobertura'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/main.ts',
        'src/database/migrate.ts',
        'src/database/migrations/**',
        'src/**/*.module.ts',
        'src/**/*.dto.ts',
        'src/test-utils/**',
      ],
    },
  },
});
