#!/usr/bin/env node
/**
 * Prepares the database used by the backend integration suite.
 *
 * Reads DATABASE_URL_TEST from the repository root `.env`, creates the database
 * if it does not exist, then applies all migrations to it. Running this twice is
 * safe — it is the first thing CI does before `npm run test:api`.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(here, '..');
const rootEnvPath = resolve(apiDir, '../../.env');

function loadRootEnv() {
  if (!existsSync(rootEnvPath)) return;
  const contents = readFileSync(rootEnvPath, 'utf8');
  for (const line of contents.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

loadRootEnv();

const testUrl = process.env.DATABASE_URL_TEST;
if (!testUrl) {
  console.error('DATABASE_URL_TEST is not set. Copy .env.example to .env first.');
  process.exit(1);
}

const url = new URL(testUrl);
const databaseName = url.pathname.replace(/^\//, '');
if (!databaseName) {
  console.error(`DATABASE_URL_TEST has no database name: ${testUrl}`);
  process.exit(1);
}

// Connect to the maintenance database to issue CREATE DATABASE.
const adminUrl = new URL(testUrl);
adminUrl.pathname = '/postgres';
adminUrl.search = '';

const createSql = `SELECT 'CREATE DATABASE "${databaseName}"' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '${databaseName}')\\gexec`;

function run(command, args, options = {}) {
  return execFileSync(command, args, { stdio: 'inherit', cwd: apiDir, ...options });
}

try {
  run('npx', ['--yes', 'prisma', 'db', 'execute', '--url', adminUrl.toString(), '--stdin'], {
    input: `CREATE DATABASE "${databaseName}";`,
    stdio: ['pipe', 'inherit', 'pipe'],
  });
  console.log(`Created test database "${databaseName}".`);
} catch (error) {
  const stderr = error?.stderr?.toString() ?? '';
  if (stderr.includes('already exists')) {
    console.log(`Test database "${databaseName}" already exists.`);
  } else {
    console.error(stderr || String(error));
    console.error(`Could not create the test database. Statement attempted:\n${createSql}`);
    process.exit(1);
  }
}

run('npx', ['--yes', 'prisma', 'migrate', 'deploy'], {
  env: { ...process.env, DATABASE_URL: testUrl },
});

console.log('Test database is up to date.');
