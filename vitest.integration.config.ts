import { defineConfig } from 'vitest/config'

// Live testnet tests (real key servers + fullnode); run with `npm run test:integration`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 120_000,
  },
})
