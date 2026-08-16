import { expect, type Browser, type Page } from '@playwright/test';
import { resolve } from 'node:path';

/** Seeded demo accounts. `npm run db:seed` recreates them. */
export const DEMO = {
  password: process.env.DEMO_PASSWORD ?? 'DemoFlow2024!',
  emma: process.env.DEMO_EMAIL ?? 'emma.carter@northstarlabs.io',
  daniel: 'daniel.kim@northstarlabs.io',
  guest: 'noah.bennett@contractor.dev',
} as const;

const stateDir = resolve(__dirname, '../.playwright');

/** Saved sessions, written once by `auth.setup.ts` and reused by every spec. */
export const STATE = {
  emma: `${stateDir}/owner.json`,
  daniel: `${stateDir}/admin.json`,
  guest: `${stateDir}/guest.json`,
} as const;

export async function signIn(page: Page, email: string, password = DEMO.password): Promise<void> {
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20_000 });
}

/**
 * Opens an independent browser context for a saved session, so two users can be
 * driven side by side in one test — which is what the realtime specs need.
 */
export async function openAs(
  browser: Browser,
  storageState: string,
): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  await page.goto('/app');
  await page.waitForURL(/\/app\/.+/, { timeout: 30_000 });
  return { page, close: () => context.close() };
}

/** Opens the first board of the named project and waits for its cards to render. */
export async function openProjectBoard(page: Page, projectName: string): Promise<string> {
  await page.getByRole('link', { name: projectName, exact: false }).first().click();
  await page.waitForURL(/\/boards\//, { timeout: 20_000 });
  await expect(page.getByRole('button', { name: /^WEB-|^APP-|^PLAT-|^LAUNCH-/ }).first()).toBeVisible({
    timeout: 20_000,
  });
  return page.url();
}

export function cardByKey(page: Page, key: string) {
  return page.getByRole('button', { name: new RegExp(`^${key}:`) });
}

export function column(page: Page, name: string) {
  return page.getByRole('region', { name: new RegExp(`^${name} column`) });
}

/**
 * Drags a card onto a column.
 *
 * dnd-kit listens for pointer events with an activation distance, so the move is
 * performed in steps rather than with a single `dragTo`, which would not trigger it.
 */
export async function dragCardToColumn(page: Page, key: string, columnName: string): Promise<void> {
  const card = cardByKey(page, key);
  const target = column(page, columnName);

  // The board scrolls horizontally, so either end of the drag can start off-screen.
  // A synthetic mouse cannot travel outside the viewport, so bring both into view
  // before measuring them.
  await target.scrollIntoViewIfNeeded();
  await card.scrollIntoViewIfNeeded();

  const cardBox = await card.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) throw new Error('Could not locate the card or the target column');

  const viewport = page.viewportSize();
  if (viewport && (cardBox.x + cardBox.width > viewport.width || targetBox.x < 0)) {
    throw new Error(
      `Cannot drag ${key} to ${columnName}: the two are not on screen at the same time`,
    );
  }

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  // Cross the activation distance first, then travel in steps so dnd-kit's
  // collision detection sees intermediate positions.
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 20, cardBox.y + cardBox.height / 2, {
    steps: 5,
  });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 90, { steps: 15 });
  await page.mouse.up();
}
