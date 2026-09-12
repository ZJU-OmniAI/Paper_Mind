import { defineConfig } from '@playwright/test';
process.env.NO_PROXY = [process.env.NO_PROXY, '127.0.0.1', 'localhost'].filter(Boolean).join(',');
process.env.no_proxy = process.env.NO_PROXY;
export default defineConfig({
  testDir: './tests/ui', fullyParallel: false, workers: 1,
  timeout: 30000, reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4178', channel: process.env.PW_CHANNEL || undefined, headless: true, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure' },
  webServer: { command: 'node tests/serve.mjs', url: 'http://127.0.0.1:4178/manager.html', reuseExistingServer: false, timeout: 10000 }
});
