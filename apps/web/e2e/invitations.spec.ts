import { expect, test } from '@playwright/test';
import { STATE, gotoDemoWorkspace } from './fixtures';

/**
 * Inviting somebody has to produce something the inviter can actually send.
 *
 * This build logs invitation emails to the console rather than delivering them,
 * and the database stores only a hash of the token — so the accept link exists in
 * exactly one place: the response to creating the invitation. If the UI does not
 * show it, the feature looks like it silently does nothing, which is precisely
 * how this was reported.
 */
test.describe('invitations', () => {
  test.use({ storageState: STATE.emma });

  test('creating an invitation returns a link the owner can send', async ({ page }) => {
    await gotoDemoWorkspace(page);

    await page.getByRole('link', { name: 'Team' }).click();
    await expect(page).toHaveURL(/\/team/, { timeout: 20_000 });

    const email = `invitee-${Date.now()}@flowsync.test`;

    await page.getByRole('button', { name: 'Invite people' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Create invitation' }).click();

    // The link is shown, not just a "sent" toast.
    await expect(page.getByRole('heading', { name: new RegExp(email) })).toBeVisible({
      timeout: 15_000,
    });

    const link = page.getByLabel('Invitation link');
    await expect(link).toBeVisible();
    await expect(link).toHaveValue(/\/invite\/[\w-]+$/);

    await page.getByRole('button', { name: 'Done' }).click();

    // And it now appears among the pending invitations.
    await expect(page.getByText(email)).toBeVisible({ timeout: 15_000 });
  });

  test('an invitation link opens an accept page describing the workspace', async ({ page }) => {
    await gotoDemoWorkspace(page);
    await page.getByRole('link', { name: 'Team' }).click();
    await expect(page).toHaveURL(/\/team/, { timeout: 20_000 });

    const email = `preview-${Date.now()}@flowsync.test`;
    await page.getByRole('button', { name: 'Invite people' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Create invitation' }).click();

    const acceptUrl = await page.getByLabel('Invitation link').inputValue();
    await page.getByRole('button', { name: 'Done' }).click();

    await page.goto(acceptUrl);

    await expect(page.getByRole('heading', { name: /Join Northstar Labs/ })).toBeVisible({
      timeout: 20_000,
    });
    // The address appears both in the invitation summary and in the mismatch notice.
    await expect(page.getByText(email).first()).toBeVisible();

    // Emma is signed in as somebody else, so she is told rather than allowed through.
    await expect(page.getByText(/but this invitation was sent to/)).toBeVisible();
  });

  test('a revoked invitation stops working', async ({ page }) => {
    await gotoDemoWorkspace(page);
    await page.getByRole('link', { name: 'Team' }).click();
    await expect(page).toHaveURL(/\/team/, { timeout: 20_000 });

    const email = `revoked-${Date.now()}@flowsync.test`;
    await page.getByRole('button', { name: 'Invite people' }).click();
    await page.getByLabel('Email').fill(email);
    await page.getByRole('button', { name: 'Create invitation' }).click();

    const acceptUrl = await page.getByLabel('Invitation link').inputValue();
    await page.getByRole('button', { name: 'Done' }).click();

    const row = page.locator('li').filter({ hasText: email });
    await row.getByRole('button', { name: 'Revoke' }).click();
    await expect(page.getByText(email)).toHaveCount(0, { timeout: 15_000 });

    await page.goto(acceptUrl);
    // The error state renders both a title and a message; either proves the point.
    await expect(
      page.getByText(/invitation is not valid|invalid or has expired/i).first(),
    ).toBeVisible({ timeout: 20_000 });
  });
});
