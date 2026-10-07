// Vitest setup file, loaded before every test file (see `test.setupFiles` in
// vite.config.ts). Importing the `/vitest` entry point (rather than the bare
// `@testing-library/jest-dom` specifier) both registers the jest-dom matchers
// on vitest's `expect` and augments vitest's `Assertion` type, so matchers
// like `toBeInTheDocument()` type-check correctly across the whole project.
import '@testing-library/jest-dom/vitest'
