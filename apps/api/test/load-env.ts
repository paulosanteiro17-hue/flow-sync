import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** The suite reads the same root `.env` the API and the Prisma CLI use. */
const rootEnv = resolve(__dirname, '../../../.env');
if (existsSync(rootEnv)) loadDotenv({ path: rootEnv, override: false });

process.env.NODE_ENV = 'test';
