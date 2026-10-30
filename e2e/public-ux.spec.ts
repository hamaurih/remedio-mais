import { test, expect } from '@playwright/test';

test('header mobile até 112px e barra contextual do produto', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const header = page.locator('header');
  await expect(header).toBeVisible();
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(112);
  // Usa produto real retornado pela loja; não fabrica estoque ou sucesso.
  const productLink = page.locator('a[href^="/produto/"]').first();
  await expect(productLink).toBeAttached({ timeout: 20000 });
  const href = await productLink.getAttribute('href');
  await page.goto(href!);
  const bar = page.getByTestId('product-mobile-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('R$');
  await expect(bar.getByRole('button', { name: /Adicionar ao carrinho|Esgotado/ })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Falar no WhatsApp', exact: true })).toBeHidden();
  await page.evaluate(() => window.scrollTo(0, 500));
  expect((await header.boundingBox())!.y).toBe(0);
  expect((await header.boundingBox())!.height).toBeLessThanOrEqual(112);
});
