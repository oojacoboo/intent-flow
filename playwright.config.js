import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 15000,
  use: {
    baseURL: 'http://localhost:3847',
  },
  webServer: {
    command: 'node demo/server.js',
    port: 3847,
    reuseExistingServer: true,
  },
})
