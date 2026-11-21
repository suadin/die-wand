import { defineConfig } from 'vitest/config';

export default defineConfig({
    // Unit tests live in test/; e2e/tests/ belongs to Playwright.
    test: { include: ['test/**/*.test.js'] },
});
