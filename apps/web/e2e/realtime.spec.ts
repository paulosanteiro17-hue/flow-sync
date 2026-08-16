import { expect, test, type Page } from '@playwright/test';
import { STATE, cardByKey, column, dragCardToColumn, openAs } from './fixtures';

/**
 * The headline test for this project.
 *
 * Two independent browser contexts — two real users — with the same board open.
 * One moves a card; the other must see it move without reloading.
 */
test.describe('real-time collaboration', () => {
  test('a move by one user appears on another user’s board', async ({ browser }) => {
    const userA = await openAs(browser, STATE.emma);
    const userB = await openAs(browser, STATE.daniel);

    try {
      await userA.page
        .getByRole('link', { name: /Website Redesign/ })
        .first()
        .click();
      await userA.page.waitForURL(/\/projects\//);
      await userA.page.getByRole('link', { name: 'Main Board' }).click();
      await userA.page.waitForURL(/\/boards\//);
      const boardUrl = userA.page.url();

      await userB.page.goto(boardUrl);

      await expect(cardByKey(userA.page, 'WEB-4')).toBeVisible({ timeout: 20_000 });
      await expect(cardByKey(userB.page, 'WEB-4')).toBeVisible({ timeout: 20_000 });

      // Move it somewhere it is not already, so the test is meaningful on a re-run.
      const sourceColumn = await currentColumnOf(userA.page, 'WEB-4');
      const targetName = sourceColumn === 'In Progress' ? 'Review' : 'In Progress';

      await dragCardToColumn(userA.page, 'WEB-4', targetName);

      // The person dragging sees it immediately (optimistic update)…
      await expect(column(userA.page, targetName).getByText('WEB-4')).toBeVisible({
        timeout: 10_000,
      });

      // …and so does everyone else, with no reload. This is the whole point.
      await expect(column(userB.page, targetName).getByText('WEB-4')).toBeVisible({
        timeout: 15_000,
      });

      // It survives a reload, so it was genuinely persisted rather than only rendered.
      await userB.page.reload();
      await expect(column(userB.page, targetName).getByText('WEB-4')).toBeVisible({
        timeout: 20_000,
      });
    } finally {
      await userA.close();
      await userB.close();
    }
  });

  test('a task created by one user appears live for another', async ({ browser }) => {
    const userA = await openAs(browser, STATE.emma);
    const userB = await openAs(browser, STATE.daniel);

    try {
      await userA.page
        .getByRole('link', { name: /Internal Platform/ })
        .first()
        .click();
      await userA.page.waitForURL(/\/projects\//);
      await userA.page.getByRole('link', { name: 'Main Board' }).click();
      await userA.page.waitForURL(/\/boards\//);
      await userB.page.goto(userA.page.url());
      await expect(userB.page.getByRole('region', { name: /^Backlog column/ })).toBeVisible({
        timeout: 20_000,
      });

      const title = `Live task ${Date.now()}`;
      await column(userA.page, 'Backlog')
        .getByRole('button', { name: 'Add task', exact: true })
        .click();
      await userA.page.getByLabel('Title').fill(title);
      await userA.page.getByRole('button', { name: 'Create task' }).click();

      await expect(userA.page.getByText(title)).toBeVisible({ timeout: 15_000 });
      await expect(userB.page.getByText(title)).toBeVisible({ timeout: 15_000 });
    } finally {
      await userA.close();
      await userB.close();
    }
  });

  test('a comment written by one user appears live for another', async ({ browser }) => {
    const userA = await openAs(browser, STATE.emma);
    const userB = await openAs(browser, STATE.daniel);

    try {
      await userA.page
        .getByRole('link', { name: /Mobile App/ })
        .first()
        .click();
      await userA.page.waitForURL(/\/projects\//);
      await userA.page.getByRole('link', { name: 'Main Board' }).click();
      await userA.page.waitForURL(/\/boards\//);

      const card = cardByKey(userA.page, 'APP-1');
      await expect(card).toBeVisible({ timeout: 20_000 });
      await card.click();
      await expect(userA.page.getByRole('heading', { name: 'Comments' })).toBeVisible();

      await userB.page.goto(userA.page.url());
      await expect(userB.page.getByRole('heading', { name: 'Comments' })).toBeVisible({
        timeout: 20_000,
      });

      const body = `Live comment ${Date.now()}`;
      await userA.page.getByLabel('Write a comment').fill(body);
      await userA.page.getByRole('button', { name: 'Post comment' }).click();

      await expect(userA.page.getByText(body)).toBeVisible({ timeout: 10_000 });
      await expect(userB.page.getByText(body)).toBeVisible({ timeout: 15_000 });
    } finally {
      await userA.close();
      await userB.close();
    }
  });

  test('presence shows the other member on the same board', async ({ browser }) => {
    const userA = await openAs(browser, STATE.emma);
    const userB = await openAs(browser, STATE.daniel);

    try {
      await userA.page
        .getByRole('link', { name: /Internal Platform/ })
        .first()
        .click();
      await userA.page.waitForURL(/\/projects\//);
      await userA.page.getByRole('link', { name: 'Main Board' }).click();
      await userA.page.waitForURL(/\/boards\//);
      await userB.page.goto(userA.page.url());

      // Both sockets heartbeat as soon as they join the room.
      await expect(userA.page.getByText(/members? online/)).toBeVisible({ timeout: 20_000 });
      await expect(userB.page.getByText(/members? online/)).toBeVisible({ timeout: 20_000 });
    } finally {
      await userA.close();
      await userB.close();
    }
  });
});

async function currentColumnOf(page: Page, key: string): Promise<string> {
  for (const name of ['Backlog', 'To Do', 'In Progress', 'Review', 'Done']) {
    const found = await column(page, name).getByText(key).count();
    if (found > 0) return name;
  }
  throw new Error(`Card ${key} was not found in any column`);
}
