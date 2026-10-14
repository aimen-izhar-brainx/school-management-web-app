import 'dotenv/config';

// Specs create real rows, so they must never run against the dev database.
// Use DATABASE_URL_TEST, or fall back to "<dev database name>_test" (never "_test_test").
export function testDatabaseUrl(): string | undefined {
  if (process.env.DATABASE_URL_TEST) return process.env.DATABASE_URL_TEST;
  return process.env.DATABASE_URL?.replace(/\/([^/?]+?)(?:_test)?(\?|$)/, '/$1_test$2');
}
