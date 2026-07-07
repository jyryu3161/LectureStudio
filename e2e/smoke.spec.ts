import { expect, test } from '@playwright/test';

test('landing page renders the hero copy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /write an ebook/i })).toBeVisible();
});

test('the app rail Reading Mode link navigates to /reading', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Reading Mode' }).click();
  await expect(page).toHaveURL(/\/reading$/);
});
