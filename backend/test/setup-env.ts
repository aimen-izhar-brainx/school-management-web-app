import { testDatabaseUrl } from './test-database-url.js';

const testUrl = testDatabaseUrl();

if (!testUrl) throw new Error('Set DATABASE_URL (or DATABASE_URL_TEST) to run the specs.');
process.env.DATABASE_URL = testUrl;
