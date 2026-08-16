import { expect, test } from '@playwright/test';
import { STATE, cardByKey, column } from './fixtures';

/**
 * Runs on the Pixel 7 profile. A Kanban board is the hardest thing to keep usable
 * on a phone, so these assertions are about it staying navigable rather than
 * about pixel positions.
 */
test.describe('mobile', () => {
  test.use({ storageState: STATE.emma });

  test('the navigation is a drawer that opens and closes', async ({ page }) => {
    await page.goto('/app');
    await page.waitForURL(/\/app\/.+/, { timeout: 30_000 });

    // The sidebar is off-canvas until asked for.
    await expect(page.getByRole('button', { name: 'Open navigation' })).toBeVisible();

    // Scoped to the nav landmark: the dashboard also links to projects.
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeHidden();

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: /Website Redesign/ })).toBeVisible();

    await page.getByRole('button', { name: 'Close navigation' }).click();
    // Off-canvas must mean hidden, not merely translated out of sight.
    await expect(nav).toBeHidden();
  });

  test('the board is readable and scrolls horizontally', async ({ page }) => {
    await page.goto('/app');
    await page.waitForURL(/\/app\/.+/, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /Website Redesign/ })
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });
    await page.getByRole('link', { name: 'Main Board' }).click();
    await page.waitForURL(/\/boards\//, { timeout: 20_000 });

    await expect(cardByKey(page, 'WEB-1')).toBeVisible({ timeout: 20_000 });

    // The page itself must not scroll sideways; only the board does.
    const bodyOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(bodyOverflow).toBe(true);

    // Later columns are reachable by scrolling the board.
    const review = column(page, 'Review');
    await review.scrollIntoViewIfNeeded();
    await expect(review).toBeVisible();
  });

  test('a task opens in a full-height drawer', async ({ page }) => {
    await page.goto('/app');
    await page.waitForURL(/\/app\/.+/, { timeout: 30_000 });

    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: /Mobile App/ })
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });
    await page.getByRole('link', { name: 'Main Board' }).click();
    await page.waitForURL(/\/boards\//, { timeout: 20_000 });

    await page.getByRole('button', { name: /^APP-/ }).first().click();

    await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByLabel('Write a comment')).toBeVisible();

    await page.getByRole('button', { name: 'Close task' }).click();
    await expect(page.getByRole('heading', { name: 'Comments' })).toBeHidden();
  });
});
