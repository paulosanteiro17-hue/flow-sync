import { test as setup } from '@playwright/test';
import { DEMO, STATE, signIn } from './fixtures';

/**
 * Signs each demo account in once and saves its cookies.
 *
 * Sign-in is rate limited to five attempts per 15 minutes per IP and email — a
 * deliberate security control, not something to relax for tests. Reusing storage
 * state keeps the whole suite to one sign-in per account and makes it faster too.
 */
setup('authenticate as the workspace owner', async ({ page }) => {
  await signIn(page, DEMO.emma);
  await page.context().storageState({ path: STATE.emma });
});

setup('authenticate as an admin', async ({ page }) => {
  await signIn(page, DEMO.daniel);
  await page.context().storageState({ path: STATE.daniel });
});

setup('authenticate as a guest', async ({ page }) => {
  await signIn(page, DEMO.guest);
  await page.context().storageState({ path: STATE.guest });
});
