# Helpdesk Pro frontend

React 18, Vite, TypeScript (strict), Tailwind CSS, React Router 6. Owner: ALEX.

## Run it

```bash
cd frontend
npm ci                      # uses package-lock.json
npm run dev                 # http://127.0.0.1:3000, proxies /api to the local API on 127.0.0.1:8000
```

`npm run dev` sets `VITE_AUTH_MODE=local` for you, so the dev sign-in shows. Without it the app signs in with Cognito, which needs the
`VITE_COGNITO_*` values. To serve the preview on the network, pass the host and port through: `npm run dev -- --host 0.0.0.0 --port 3000`.
Only do that on a trusted network: the dev sign-in accepts any seeded user from the `X-Dev-User` header.

The local API is started from `backend/` (see `backend/README-local.md`):

```bash
cd backend && LOCAL_API_PORT=8000 .venv/bin/python scripts/local_server.py
```

## Environment

Copy `.env.example` to `.env.local` if you need to change a value. Only public values belong here. The browser can read
every `VITE_*` variable, so never put a secret in one.

| Variable | Default | Meaning |
|---|---|---|
| `VITE_AUTH_MODE` | `cognito` | Only the exact value `local` shows the dev sign-in with the seeded users (`X-Dev-User` header). Any other value, or none, signs in with the user pool, so a forgotten variable fails closed. `npm run dev` sets `local` itself. The deployment build must not set `local`; CI fails the build if the demo code is in it. |
| `VITE_API_URL` | empty | Base URL for the API. Empty means same origin (`/api`), which CloudFront and the Vite proxy use. |
| `VITE_COGNITO_USER_POOL_ID` | | Cognito mode: user pool ID (a Terraform output). |
| `VITE_COGNITO_CLIENT_ID` | | Cognito mode: app client ID, `helpdesk-pro-prod-web`. No secret. |
| `VITE_COGNITO_REGION` | | Cognito mode: region of the user pool. |
| `VITE_DEV_API_TARGET` | `http://127.0.0.1:8000` | Dev server only: where `/api` is proxied. |

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server with the `/api` proxy |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, type-aware, zero warnings allowed |
| `npm test` | Vitest and Testing Library (`npm run test:watch` to watch) |
| `npm run build` | Typecheck, then production build to `dist/` |

## Layout

- `src/lib/api` one client for every call. Errors become `ApiError` (status, code, field details).
- `src/lib/auth` local dev sign-in and Cognito SRP. Roles come from the ID token's `cognito:groups`.
- `src/lib/roles.ts` every role rule. The UI gates with these, and the API enforces them again.
- `src/components/ui` shared primitives (Button, Badge, Card, Field, Dialog, Toast, Skeleton, EmptyState, ErrorState).
- `src/features/{auth,tickets,workspace,dashboard,users}` one folder per area.
