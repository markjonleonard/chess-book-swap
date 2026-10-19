# Chess Book Swap

A small site where chess players in the Wiltshire and Somerset leagues list books to sell or swap, post want lists, and hand books over in person at club nights, league matches and tournaments. No payments go through the site and nothing is posted.

It will live at `books.trowbridgechessclub.co.uk`. The build plan, data model and security design are in [`docs/plan.md`](docs/plan.md).

## Stack

- **Front end:** Vue 3, Vite, TypeScript and vue-router, deployed to Netlify.
- **Data and sign-in:** Supabase (Postgres with row-level security, email-code sign-in).
- **Tests:** Vitest for front-end logic; pgTAP (`supabase test db`) for database policies.

## Local setup

You need Node 24 LTS or later, the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) and a Docker-compatible runtime (Docker Desktop, OrbStack or Colima).

1. `npm install`
2. `supabase start` runs Postgres, auth and a local mail catcher in Docker.
3. `supabase db reset` applies the migrations and seed data.
4. Copy `.env.example` to `.env` and fill in the local URL and publishable key from `supabase status`.
5. `npm run dev` serves the site at http://localhost:5173.

When you're done, `supabase stop`.

Preview deploys use a hosted dev Supabase project, never the local one.

## Checks

These are what CI runs on every pull request:

| Command                | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `npm run lint`         | ESLint, including a ban on `v-html`                                |
| `npm run format:check` | Prettier (`npm run format` fixes it)                               |
| `npm test`             | Vitest unit tests                                                  |
| `npm run build`        | Type-check with `vue-tsc`, then build to `dist/`                   |
| `supabase test db`     | pgTAP policy tests (needs `supabase start` or `supabase db start`) |

## Deploying

Netlify builds `main` and every pull request (as a preview) using `netlify.toml`. Database migrations reach production only through `supabase db push`, run by hand after review, never from CI.

## Licence

Not yet chosen.
