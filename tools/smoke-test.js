const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('http://127.0.0.1:4173', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'preview-initial.png', fullPage: true });

  const imageStatus = await page.locator('.bird').evaluateAll((images) => images.map((image) => ({ src: image.getAttribute('src'), width: image.naturalWidth })));
  if (imageStatus.some((image) => image.width === 0)) throw new Error(`Missing bird asset: ${JSON.stringify(imageStatus)}`);

  await page.locator('#bookBotany').click();
  await page.locator('#bookHeavy').press('Enter');
  await page.locator('#menuButton').click();
  await page.locator('#rainToggle').check();
  await page.locator('#breezeToggle').check();
  await page.locator('#volumeSlider').fill('12');
  await page.locator('#closeSettings').click();
  await page.locator('#bookSecret').click();
  await page.waitForTimeout(250);
  if ((await page.locator('#discoveryCount').textContent()).trim() !== '3/3') throw new Error('All three discovery states did not unlock.');
  await page.locator('#teaCup').click();
  if (!(await page.locator('#scene').evaluate((node) => node.classList.contains('tea-party')))) throw new Error('Millet tea party state did not unlock.');
  await page.screenshot({ path: 'preview-tea-party.png', fullPage: true });

  if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
  console.log(JSON.stringify({ ok: true, discoveries: 3, teaParty: true, images: imageStatus }));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
