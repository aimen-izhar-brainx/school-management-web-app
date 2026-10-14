import pg from 'pg';
import { testDatabaseUrl } from './test-database-url.js';

// Removes rows left behind by interrupted spec runs (names/emails prefixed `t<ticket>-`).
// Runs against the test database only (see setup-env.ts).
export default async function globalSetup() {
  const url = testDatabaseUrl();
  if (!url) return;
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`delete from "TimetableEntry" where "subjectId" in (select id from "Subject" where name ~* '^t[0-9]+-')`);
    await client.query(`delete from "ClassSubject" where "subjectId" in (select id from "Subject" where name ~* '^t[0-9]+-')`);
    await client.query(`delete from "Class" where name ~* '^t[0-9]+-'`);
    await client.query(`delete from "Subject" where name ~* '^t[0-9]+-'`);
    await client.query(`delete from "Notice" where title ~* '^t[0-9]+-'`);
    await client.query(`delete from "User" where email ~* '@t[0-9]+-.*example\\.test$'`);
  } finally {
    await client.end();
  }
}
