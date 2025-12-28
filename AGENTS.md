# Repository Guidelines

## Project Structure & Module Organization
- `App.tsx`/`index.tsx` are the main entry points for the Vite + React frontend.
- UI and shared logic live in `components/`, `contexts/`, `hooks/`, `services/`, and `utils/`.
- The backend lives in `server/` with source in `server/src/` and build output in `server/dist/`.
- Admin UI is in `admin-panel/`.
- Static assets are in `public/` and `app/styles/` (if present); frontend build output is `dist/`.
- `tempsay/` is for local notes/reports and should not be committed.

## Build, Test, and Development Commands
- Frontend (repo root): `npm run dev` (Vite dev server), `npm run build` (builds `dist/`), `npm run preview` (preview build).
- Frontend tests: `npm test` or `npm run test:coverage` (Vitest).
- Backend (`server/`): `npm run dev` (ts-node-dev), `npm run build` (TypeScript compile + copy preset assets), `npm run start` (run `dist/index.js`).
- Backend tests: `npm run test` or `npm run test:coverage` (Jest).
- Admin panel (`admin-panel/`): `npm run dev`, `npm run build`, `npm run preview`, `npm run lint`.

## Coding Style & Naming Conventions
- TypeScript/TSX throughout; follow existing formatting (4-space indentation) and file naming.
- React components use `PascalCase.tsx`; hooks use `useX.ts`; utilities/services use `camelCase` filenames.
- Keep comments short and only for non-obvious logic.

## Testing Guidelines
- Use Vitest for frontend tests and Jest for backend tests.
- Name tests `*.test.ts(x)` or `*.spec.ts(x)` and colocate with the module when practical.
- Run coverage (`test:coverage`) for higher-risk or core logic changes.

## Commit & Pull Request Guidelines
- Commit messages use a `type:` prefix (e.g., `fix: ...`, `docs: ...`, `debug: ...`) and a short imperative subject.
- PRs should include a concise description, linked issues, and test results; include screenshots for UI changes.

## Security & Configuration
- Frontend config lives in `.env.production`; backend config in `server/.env`. Do not commit secrets.
- Production uses `deploy.sh` and PM2 (`ecosystem.config.cjs`); keep deployments reproducible.
