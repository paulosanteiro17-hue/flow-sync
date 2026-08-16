import { expect, test } from '@playwright/test';
import { STATE, column } from './fixtures';

/**
 * Covers the destructive and administrative actions that were previously
 * reachable through the API but had no interface: deleting a task, adding a
 * board, and managing who is on a project.
 */
test.describe('project and task management', () => {
  test.use({ storageState: STATE.emma });

  test('creates a task and then deletes it from the drawer', async ({ page }) => {
    await page.goto('/app');
    await page.waitForURL(/\/app\/.+/, { timeout: 30_000 });

    await page
      .getByRole('link', { name: /Q4 Product Launch/ })
      .first()
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });
    await page.getByRole('link', { name: 'Main Board' }).click();
    await page.waitForURL(/\/boards\//, { timeout: 20_000 });

    const title = `Disposable ${Date.now()}`;
    await column(page, 'To Do').getByRole('button', { name: 'Add task', exact: true }).click();
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create task' }).click();

    const card = page.getByRole('button', { name: new RegExp(title) });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.click();
    await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Task actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete task' }).click();
    await page.getByRole('button', { name: 'Delete task' }).click();

    // The drawer closes and the card is gone from the board.
    await expect(page.getByRole('heading', { name: 'Comments' })).toBeHidden({ timeout: 15_000 });
    await expect(card).toHaveCount(0);
  });

  test('adds a board to a project', async ({ page }) => {
    await page.goto('/app');
    await page.waitForURL(/\/app\/.+/, { timeout: 30_000 });

    await page
      .getByRole('link', { name: /Internal Platform/ })
      .first()
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });

    const boardName = `Sprint ${Date.now().toString().slice(-5)}`;
    await page.getByRole('button', { name: 'New board' }).click();
    await page.getByLabel('Name').fill(boardName);
    await page.getByRole('button', { name: 'Create board' }).click();

    await expect(page.getByRole('link', { name: boardName })).toBeVisible({ timeout: 15_000 });

    // The new board opens with the default workflow columns.
    await page.getByRole('link', { name: boardName }).click();
    await page.waitForURL(/\/boards\//, { timeout: 20_000 });
    await expect(column(page, 'Backlog')).toBeVisible({ timeout: 20_000 });
    await expect(column(page, 'Done')).toBeVisible();
  });

  test('the project page is reachable and shows boards and members', async ({ page }) => {
    await page.goto('/app');
    await page.waitForURL(/\/app\/.+/, { timeout: 30_000 });

    await page
      .getByRole('link', { name: /Website Redesign/ })
      .first()
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });

    // The top bar and the page body both name the project.
    await expect(page.getByRole('heading', { name: 'Website Redesign' }).last()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Boards' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
    await expect(page.getByLabel('Project status')).toBeVisible();
  });
});

test.describe('project management permissions', () => {
  test.use({ storageState: STATE.guest });

  test('a guest sees no destructive project controls', async ({ page }) => {
    await page.goto('/app');
    await page.waitForURL(/\/app\/.+/, { timeout: 30_000 });

    await page
      .getByRole('link', { name: /Q4 Product Launch/ })
      .first()
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });

    await expect(page.getByRole('button', { name: 'Project actions' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'New board' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add members' })).toHaveCount(0);
  });
});
