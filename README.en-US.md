# Galaxyous Union AI Mix

Galaxyous Union AI Mix is a full-stack, multi-model AI platform that combines real-time chat, workflow orchestration, and tool integrations. The repository includes a React/Vite frontend, an Express backend with Socket.IO, and a dedicated admin panel.

## Architecture
- Frontend (Vite + React): main UI in `App.tsx`, feature modules in `components/`, shared logic in `contexts/`, `hooks/`, `services/`, and `utils/`.
- Backend (Express + Socket.IO): REST APIs under `server/src/routes/`, real-time namespaces for discussion and isolation mode, and background tasks via BullMQ.
- Isolation Mode: structured multi-agent discussion engine with session management, event log, scenario presets, and WebSocket gateway (`server/src/isolation-mode/`).
- Workflow and MCP: DAG workflow engine and MCP tool registry/marketplace under `core/workflow/` and `core/mcp/`.
- Knowledge/RAG: ingestion and retrieval endpoints under `server/src/routes/knowledge` with shared logic in `core/rag/`.
- Multimodal: image/video/audio generation UI in `components/MultimodalCenter.tsx` and Gemini Live proxy at `/gemini-live`.

## Repository Layout
- `components/`, `contexts/`, `hooks/`, `services/`, `utils/`: frontend features and shared logic
- `server/`: backend source in `server/src/`, build output in `server/dist/`
- `admin-panel/`: separate admin UI (Vite + React)
- `core/`: shared engines (workflow, MCP, RAG, sandbox)
- `public/`, `app/styles/`: static assets and styles
- `dist/`: frontend build output

## Requirements
- Node.js 18+
- MySQL 8+
- Redis 6+ (queues, cache, event log)

## Setup
Install dependencies:
```bash
npm install
npm --prefix server install
npm --prefix admin-panel install
```

Configure environment:
- Backend: copy `server/.env.example` to `server/.env` and fill in DB/Redis/API settings.
- Frontend: optional build-time overrides in `.env.production` (Vite).

Run locally:
```bash
# backend
npm --prefix server run dev

# frontend
npm run dev

# admin panel (optional)
npm --prefix admin-panel run dev
```

## Build and Deploy
Build locally:
```bash
npm run build
npm --prefix server run build
npm --prefix admin-panel run build
```

Production deploy uses `deploy.sh` and PM2 (`ecosystem.config.cjs`):
```bash
./deploy.sh
```

## Tests
- Frontend: `npm test` or `npm run test:coverage` (Vitest)
- Backend: `npm --prefix server test` or `npm --prefix server run test:coverage` (Jest)

## License
Apache License 2.0. See `LICENSE`.
