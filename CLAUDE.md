# Project

- **Name:** School Management App
- **Stack:** React 19 + Vite + TypeScript + Tailwind v4 (frontend); NestJS 12 + Prisma 7 + Postgres + JWT auth (backend); oxlint (both)
- **Run:**
  - Backend: `cd backend && npm run start:dev` (port 3000, routes prefixed `/api`)
  - Frontend: `cd frontend && npm run dev` (port 5173, proxies `/api` to backend)
- **Test:**
  - Backend: `cd backend && npm run test`
  - Frontend: `cd frontend && npm run test` (added in M1 of `docs/plan.md`)
