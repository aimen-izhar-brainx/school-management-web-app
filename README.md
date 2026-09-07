# School Management App

Monorepo with a NestJS backend and a React (Vite + TypeScript) frontend.

## Structure

- `backend/` — NestJS API (listens on port 3000, routes prefixed with `/api`)
- `frontend/` — React + Vite + TypeScript app (dev server on port 5173, proxies `/api` to the backend)

## Getting started

Run each in its own terminal:

```bash
cd backend && npm run start:dev
```

```bash
cd frontend && npm run dev
```

Then open http://localhost:5173 — the page fetches from the backend to confirm the connection.
