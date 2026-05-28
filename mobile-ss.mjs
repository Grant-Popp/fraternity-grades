const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  });
  const page = await ctx.newPage();

  const pages = [
    { url: 'http://localhost:3000/auth/login', file: 'ss-mobile-login.png' },
    { url: 'http://localhost:3000/auth/signup', file: 'ss-mobile-signup.png' },
  ];

  for (const p of pages) {
    await page.goto(p.url, { waitUntil: 'networkidle' });
    await page.screenshot({ path: p.file, fullPage: true });
    console.log('saved', p.file);
  }

  await browser.close();
})();
