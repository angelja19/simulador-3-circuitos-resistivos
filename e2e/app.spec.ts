import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.goto('./');
});

test('título, tres ventanillas, R_eq de la escalera', async ({ page }, info) => {
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Simulador 3 – Circuitos Resistivos');
  await expect(page.getByText('Sin errores').first()).toBeVisible();
  await expect(page.getByText(/R_eq = /).first()).toBeVisible();
  if (info.project.name === 'celular') await page.getByRole('tab', { name: /2\. Solución/ }).click();
  await expect(page.getByText('Concepto clave').first()).toBeVisible();
});

test('plantilla del cuaderno: divisor en cascada', async ({ page }) => {
  await page.getByRole('button', { name: /Plantillas/ }).click();
  await page.locator('.card', { hasText: 'Cuaderno: divisor en cascada' }).getByRole('button').click();
  await expect(page.getByText('8 V').first()).toBeVisible();
  await expect(page.getByText('5,333 V').first()).toBeVisible();
});

test('red no reducible propone Δ→Y; error con resistencia negativa', async ({ page }, info) => {
  await page.getByRole('button', { name: /Plantillas/ }).click();
  await page.locator('.card', { hasText: 'Puente no balanceado' }).getByRole('button').click();
  await expect(page.getByText(/NO se puede reducir solo con serie y paralelo/).first()).toBeVisible();
  await page.getByRole('button', { name: /3.5 Δ ↔ Y/ }).click();
  await page.getByLabel('R1').fill('-3');
  await expect(page.getByRole('alert').first()).toContainText('positivas');
  await page.getByRole('button', { name: /Puente de Wheatstone/ }).click();
  await expect(page.getByText(/BALANCEADO/).first()).toBeVisible();
  await page.getByRole('button', { name: /Armar y reducir/ }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `docs/captura-${info.project.name}.png` });
});
