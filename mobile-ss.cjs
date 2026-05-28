const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2
  });
  const page = await ctx.newPage();

  await page.goto('http://localhost:3000/auth/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'ss-mobile-login.png', fullPage: true });
  console.log('saved login');

  await page.goto('http://localhost:3000/auth/signup', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'ss-mobile-signup.png', fullPage: true });
  console.log('saved signup');

  await browser.close();
})();
