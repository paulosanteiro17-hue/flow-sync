import { expect, test } from '@playwright/test';
import { cardByKey, column, gotoDemoWorkspace, signIn, STATE } from './fixtures';

test.describe('landing page', () => {
  test('presents the product and its entry points', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Move work forward, together.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start free' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Explore the demo workspace/ }).first(),
    ).toBeVisible();
  });

  test('redirects an unauthenticated visitor away from the app', async ({ page }) => {
    await page.goto('/app');
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 20_000 });
  });
});

test.describe('onboarding a brand new account', () => {
  test('sign up, create a workspace, sign out and back in', async ({ page }) => {
    const email = `e2e-${Date.now()}@flowsync.test`;
    const password = 'PlaywrightRun42';

    await page.goto('/sign-up');
    await page.getByLabel('Full name').fill('E2E Tester');
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click();

    // A brand new account has no workspace, so onboarding takes over.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });

    await page.getByLabel('Workspace name').fill('E2E Workspace');
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await expect(page).toHaveURL(/\/app\/.+\/projects/, { timeout: 20_000 });

    // Onboarding lands on the projects page with the "new project" dialog already
    // open, so dismiss it before touching anything behind it.
    await expect(page.getByRole('heading', { name: 'New project' })).toBeVisible({
      timeout: 15_000,
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'New project' })).toBeHidden();

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in/, { timeout: 20_000 });

    await signIn(page, email, password);
    await expect(page).toHaveURL(/\/app/, { timeout: 20_000 });
  });

  test('the demo entry point lands in a populated workspace', async ({ page }) => {
    await page.goto('/demo');
    await expect(page).toHaveURL(/\/app\/.+/, { timeout: 30_000 });
    await expect(page.getByRole('heading', { name: /Good to see you/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText('Northstar Labs').first()).toBeVisible();
  });
});

test.describe('working in a board', () => {
  test.use({ storageState: STATE.emma });

  test('creates a task, edits it in the drawer and comments on it', async ({ page }) => {
    await gotoDemoWorkspace(page);

    await page
      .getByRole('link', { name: /Q4 Product Launch/ })
      .first()
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });
    await page.getByRole('link', { name: 'Main Board' }).click();
    await page.waitForURL(/\/boards\//, { timeout: 20_000 });

    const title = `E2E task ${Date.now()}`;

    // `exact` matters: the column header also has an "Add task to To Do" button.
    await column(page, 'To Do').getByRole('button', { name: 'Add task', exact: true }).click();
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Create task' }).click();

    const card = page.getByRole('button', { name: new RegExp(title) });
    await expect(card).toBeVisible({ timeout: 15_000 });

    await card.click();
    await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible({ timeout: 15_000 });

    // Change the priority through the drawer. Scoped by role because task cards
    // also expose their priority as a title attribute.
    await page.getByRole('combobox', { name: 'Priority', exact: true }).click();
    await page.getByRole('option', { name: 'Urgent' }).click();

    // Add a subtask and complete it.
    await page.getByLabel('New subtask').fill('Check the acceptance criteria');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Check the acceptance criteria')).toBeVisible({ timeout: 10_000 });
    await page.getByRole('checkbox', { name: 'Check the acceptance criteria' }).click();
    await expect(page.getByText('1 / 1 completed')).toBeVisible({ timeout: 10_000 });

    // Comment on it.
    const comment = `Looks good ${Date.now()}`;
    await page.getByLabel('Write a comment').fill(comment);
    await page.getByRole('button', { name: 'Post comment' }).click();
    await expect(page.getByText(comment)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Close task' }).click();
    await expect(page.getByRole('heading', { name: 'Comments' })).toBeHidden();
  });

  test('filters cards by priority and clears the filter', async ({ page }) => {
    await gotoDemoWorkspace(page);

    await page
      .getByRole('link', { name: /Website Redesign/ })
      .first()
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });
    await page.getByRole('link', { name: 'Main Board' }).click();
    await page.waitForURL(/\/boards\//, { timeout: 20_000 });
    await expect(cardByKey(page, 'WEB-1')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('checkbox', { name: 'Urgent' }).click();
    await page.keyboard.press('Escape');

    // WEB-5 is the seeded urgent card; WEB-1 is not urgent.
    await expect(cardByKey(page, 'WEB-5')).toBeVisible();
    await expect(cardByKey(page, 'WEB-1')).toBeHidden();

    await page.getByRole('button', { name: 'Filters' }).click();
    await page.getByRole('button', { name: 'Clear all filters' }).click();
    await page.keyboard.press('Escape');
    await expect(cardByKey(page, 'WEB-1')).toBeVisible();
  });

  test('the command palette finds a task and opens it', async ({ page }) => {
    await gotoDemoWorkspace(page);

    await page.keyboard.press('Control+k');
    const input = page.getByPlaceholder('Search tasks, projects and people…');
    await expect(input).toBeVisible();

    await input.fill('authentication');
    await expect(page.getByText('Implement authentication flow')).toBeVisible({ timeout: 15_000 });
    await page.getByText('Implement authentication flow').click();

    await expect(page).toHaveURL(/task=/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: 'Comments' })).toBeVisible({ timeout: 20_000 });
  });

  test('the notification bell opens, and links to the full centre', async ({ page }) => {
    await gotoDemoWorkspace(page);

    await page.getByRole('button', { name: /Notifications/ }).click();
    await expect(page.getByRole('heading', { name: 'Notifications' })).toBeVisible();

    await page.getByRole('link', { name: 'Open the notification centre' }).click();
    await expect(page).toHaveURL(/\/notifications/, { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'All', exact: true })).toBeVisible();
  });

  test('the activity feed lists what happened', async ({ page }) => {
    await gotoDemoWorkspace(page);

    await page.getByRole('link', { name: 'Activity' }).click();
    await expect(page).toHaveURL(/\/activity/, { timeout: 20_000 });
    await expect(page.getByText(/created|moved|assigned|commented/).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe('permissions', () => {
  test.use({ storageState: STATE.guest });

  test('a guest sees only their project, cannot create tasks, but can comment', async ({
    page,
  }) => {
    await gotoDemoWorkspace(page);

    // Both the sidebar and the dashboard link to a project, hence `.first()`.
    await expect(page.getByRole('link', { name: /Q4 Product Launch/ }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('link', { name: /Website Redesign/ })).toHaveCount(0);

    await page
      .getByRole('link', { name: /Q4 Product Launch/ })
      .first()
      .click();
    await page.waitForURL(/\/projects\//, { timeout: 20_000 });
    await page.getByRole('link', { name: 'Main Board' }).click();
    await page.waitForURL(/\/boards\//, { timeout: 20_000 });

    // No task-creation affordances are rendered for a guest.
    await expect(page.getByRole('button', { name: 'Add task' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add column' })).toHaveCount(0);

    // Commenting is allowed.
    await page
      .getByRole('button', { name: /^LAUNCH-/ })
      .first()
      .click();
    await expect(page.getByLabel('Write a comment')).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('team management', () => {
  test.use({ storageState: STATE.emma });

  test('the owner sees the roster with roles', async ({ page }) => {
    await gotoDemoWorkspace(page);

    await page.getByRole('link', { name: 'Team' }).click();
    await expect(page).toHaveURL(/\/team/, { timeout: 20_000 });

    await expect(page.getByText('Emma Carter')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('noah.bennett@contractor.dev')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Invite people' })).toBeVisible();
  });
});
