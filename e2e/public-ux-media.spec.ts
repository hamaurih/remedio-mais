import { test, expect } from '@playwright/test';

for (const width of [1280, 1440]) {
  test(`M3: categorias alcançáveis com setas e teclado em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const nav = page.locator('header nav');
    const region = nav.getByRole('region', { name: 'Categorias da loja' });
    const next = nav.getByRole('button', { name: 'Mais categorias' });
    const previous = nav.getByRole('button', { name: 'Categorias anteriores' });
    await expect(next).toBeVisible();
    await expect(previous).toHaveCount(0);
    await page.screenshot({ path: `/tmp/remedio-ux-nav-${width}.png` });
    await next.click();
    await expect(previous).toBeVisible();
    await region.focus();
    const before = await region.evaluate(el => el.scrollLeft);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeLessThan(before);
    for (let i = 0; i < 15 && await next.count(); i++) {
      await next.click();
      await page.waitForTimeout(500);
    }
    await expect(next).toHaveCount(0);
    // Tab mantém todos os links alcançáveis e revela o item focado.
    for (const name of ['Higiene Pessoal', 'Mamães e Bebês']) {
      const link = region.getByRole('link', { name, exact: true });
      await expect(link).toHaveCount(1);
      await link.focus();
      await expect(link).toBeInViewport();
    }
  });
}

test('M4: uma entrada de WhatsApp na home mobile, header até 112px e desktop preservado', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const links = page.locator('a[href*="wa.me"], a[href*="api.whatsapp.com"]');
  await expect(page.getByRole('link', { name: 'WhatsApp', exact: true }).filter({ visible: true })).toHaveCount(1);
  await expect.poll(async () => {
    let count = 0;
    for (const link of await links.all()) if (await link.isVisible()) count++;
    return count;
  }).toBe(1);
  expect((await page.locator('header').boundingBox())!.height).toBeLessThanOrEqual(112);
  await expect(page.getByRole('link', { name: 'Entrar', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Carrinho', exact: true }).first()).toBeVisible();
  await page.screenshot({ path: '/tmp/remedio-ux-home-390.png' });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.screenshot({ path: '/tmp/remedio-ux-footer-390.png' });
  let visible = 0;
  for (const link of await links.all()) if (await link.isVisible()) visible++;
  expect(visible).toBe(1);
  expect((await page.locator('header').boundingBox())!.y).toBe(0);
  await page.goto('/fale-conosco');
  await expect(page.locator('footer').getByRole('link', { name: 'WhatsApp', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('main').getByRole('link', { name: 'WhatsApp', exact: true }).first()).toBeVisible();
});

test('M2: contraste real do cabeçalho amarelo é AA', async ({ page }) => {
  await page.goto('/');
  const section = page.locator('section.bg-highlight').filter({ has: page.getByRole('heading', { name: /Melhores Ofertas/ }) });
  await expect(section).toBeVisible();
  const ratios = await section.evaluate(el => {
    const rgb = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3).map(Number);
    const luminance = (color: string) => rgb(color).map(v => {
      const c = v / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const background = getComputedStyle(el).backgroundColor;
    return [...el.querySelectorAll('h2 + p, a[href="/melhores-ofertas"]')].map(node => {
      const color = getComputedStyle(node).color;
      const a = luminance(color), b = luminance(background);
      return { color, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
  });
  expect(ratios).toHaveLength(2);
  for (const item of ratios) expect(item.ratio).toBeGreaterThanOrEqual(4.5);
  console.log('Contrastes M2:', ratios);
  await section.evaluate(el => window.scrollTo(0, window.scrollY + el.getBoundingClientRect().top - document.querySelector('header')!.getBoundingClientRect().height - 16));
  await page.waitForTimeout(1000); // Aguarda a animação Reveal antes da inspeção visual.
  await page.screenshot({ path: '/tmp/remedio-ux-ofertas.png' });
});
