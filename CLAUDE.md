# CLAUDE.md

Guidance for Claude Code in this repo. The full plan is [`docs/plan.md`](docs/plan.md); this file condenses it and records what has been built and decided.

## What this is

A chess book swap for players in the Wiltshire and Somerset leagues, at `books.trowbridgechessclub.co.uk`. Listings, want lists and contact requests; handover in person; no payments or postage. Tens of users, £0 running cost on free tiers.

## Stack

- Vue 3 + Vite + TypeScript + vue-router, plain CSS, on Netlify. Same family as the club site (`vue-tcc/` in the trowbridge-chess-club repo): follow its conventions where sensible.
- Supabase: Postgres, email-code (OTP) auth, row-level security. The browser talks to Supabase directly with the publishable key; there is no server of our own.
- Tests: Vitest (`tests/`, pure logic in `src/lib/`) and pgTAP (`supabase/tests/`).
- CI (`.github/workflows/ci.yml`): lint, Prettier, Vitest and build (which type-checks) in one job; `supabase db start` + `supabase test db` in another.

## Layout

- `src/views/` one component per page; `src/router/index.ts` routes (with a catch-all 404, since Netlify sends every unknown path to `index.html`).
- `src/lib/` pure logic with unit tests in `tests/`.
- `src/styles/main.css` colour tokens on `:root`, redefined under `prefers-color-scheme: dark`.
- `supabase/migrations/` one SQL file per change; `supabase/tests/` pgTAP; `supabase/config.toml` local stack (Realtime, Storage, Edge Functions and Analytics are off).
- `netlify.toml` build, SPA redirect, security headers and CSP.

## Rules

- **Workflow:** changes go via pull request so CI gates merges; never push to `main`. One PR per phase, small well-described commits.
- **Start of each phase:** confirm with Mark any open decision from the plan's assumptions table that the phase depends on.
- **RLS and privileges:** every table has RLS enabled and Supabase's default grants revoked (`REVOKE ALL ... FROM anon, authenticated`) before granting exactly what the plan's data model lists. Write pgTAP tests before or alongside policies, grants and functions. `supabase/tests/rls_enabled.test.sql` fails if any `public` table lacks RLS.
- **Security-definer functions:** only those listed in the plan; each sets `search_path = ''`, checks the caller itself, and has execute revoked from `public` and `anon`.
- **Untrusted text:** render with interpolation only. `vue/no-v-html` is an ESLint error; never disable it for user content.
- **CSP:** `netlify.toml` allows only `'self'` until a phase needs more. Add the exact origin (Supabase project, Open Library, Turnstile) in the phase that uses it, not before.
- **Queries name their columns:** `.select('*')` fails on tables with column-level grants.
- **Prices:** integer pence, never floats (`src/lib/price.ts`).
- **Dependencies:** keep them few. Ask before adding any library beyond Vue, vue-router, Vite, TypeScript, supabase-js, ESLint, Prettier and Vitest (and their own plugins and types). Pin exact versions (`.npmrc` sets `save-exact`), preferring releases at least two weeks old. GitHub Actions are pinned by commit SHA with the version in a comment.
- **Never:** commit secrets, use the Supabase secret key anywhere in this repo, disable RLS to make something work, or run migrations against production. Production migrations are `supabase db push`, run by Mark after review.
- **Hand-offs:** anything needing Mark's accounts (Netlify, Supabase dashboard, Resend, Turnstile, DNS, the private ops repo) goes in a checklist at the end of the PR description. All accounts are personal, not work ones.
- **Copy:** British English.

## Local Docker

`supabase start` and `supabase test db` need Docker. On Mark's machine, this project uses OrbStack, not Docker Desktop:

1. Before: `docker context use orbstack`.
2. After: `supabase stop`, then `docker context use desktop-linux`, and check with `docker context ls`.

Remind Mark to switch back at the end of any session that used Docker.

## Commands

`npm run dev` · `npm run lint` · `npm run format` · `npm test` · `npm run build` · `supabase start` · `supabase test db` · `supabase stop`

## Status

- **Phase 1 (scaffold and deploy):** in progress on branch `phase-1`. Confirmed: Vue 3 stack, Supabase, personal accounts only, changes via PR. Repo has secret scanning, push protection and Dependabot alerts on; a ruleset on `main` requiring the CI checks follows the first CI run.

Update this section at the end of each phase with what was built, conventions adopted and decisions confirmed.
