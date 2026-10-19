# Trowbridge Chess Book Swap — Build Plan

Oct 19, 2026 · @Mark

## Overview and goals

Build a small web app at books.trowbridgechessclub.co.uk where local chess players list books they want to sell or swap, post want lists, and arrange handover in person at club nights or tournaments. No payments go through the site, and no postage is involved.

- **Users:** Trowbridge Chess Club members and players from nearby clubs in the Wiltshire and Somerset leagues (Trowbridge plays in Somerset East), roughly tens of users at first, not thousands.
- **Core idea:** in-person handover removes the postage cost that makes £3–£10 books uneconomic to sell online.
- **Running cost:** £0. Free tiers only; the club domain is already paid for.
- **Pilot success:** 20+ books listed and at least 5 completed handovers (gone listings that still have a reserved request attached; gone without one counts as sold elsewhere) within 3 months of launch. Mark snapshots the handover count monthly, since a buyer deleting their account clears the link and turns a handover into "sold elsewhere".
- **Design for later:** keep the data model ready for multiple clubs, but build only for one.

## Assumptions and open decisions

These are the defaults the build starts from. Claude Code should confirm each with Mark before the phase that depends on it; the data controller question is genuinely open.

| Decision | Default | Alternatives | Needed by |
| --- | --- | --- | --- |
| Front-end approach | Vue 3 + Vite + TypeScript + vue-router, matching the club site (`vue-tcc/`) | Vanilla TypeScript, Svelte | Phase 1 |
| Backend | Supabase (Postgres, auth, row-level security) | Netlify Functions + a separate database | Phase 1 |
| Accounts | GitHub, Netlify, Supabase and email provider all under Mark's personal email, not work accounts | — | Phase 1 |
| Repo workflow | New public repo; changes via PR so CI, including policy tests, gates merges. A deliberate change from the club-site repo, where Mark pushes to `main` | Direct pushes to `main` | Phase 1 |
| Sign-in method | 6-digit email code (OTP) as primary; magic link optional, since mail scanners can consume one-time links | Magic link only | Phase 2 |
| Email provider | Resend free tier as custom SMTP, sending from trowbridgechessclub.co.uk with SPF and DKIM | Another SMTP provider | Phase 2 |
| Who can join | Open sign-up protected by Cloudflare Turnstile; Mark can disable accounts | Invite-only | Phase 2 |
| Contact between users | In-app request; the other party's email is revealed only once accepted | Show email directly; no messaging | Phase 4 |
| Book metadata | Manual entry as the main path (much older stock has no ISBN); optional ISBN prefill from Open Library | Manual only | Phase 3 |
| Data controller | Open: Mark personally or Trowbridge Chess Club | — | Phase 6 |
| Club sign-off | Mark to raise it with the committee before launch | — | Phase 6 |

## Tech stack

A Vue single-page app on Netlify talks directly to Supabase; there is no server of our own to run or patch.

| Layer | Choice | Why |
| --- | --- | --- |
| Hosting | Netlify, deploys on push to `main` | Free HTTPS, custom subdomain, preview deploys per PR |
| Front end | Vue 3 + Vite + TypeScript + vue-router, plain CSS | Same stack as the club site; Vue escapes interpolated text by default |
| Data and auth | Supabase via `@supabase/supabase-js` | Postgres, email-code auth and row-level security in one service |
| Email | Resend as custom SMTP for Supabase auth | Supabase's built-in sender only reaches members of the Supabase organisation and is heavily rate-limited |
| Bot protection | Cloudflare Turnstile, using Supabase's native CAPTCHA support; Cloudflare's always-pass test keys locally and in CI | Free; stops scripted sign-ups |
| Book lookup | Open Library `/api/books?bibkeys=ISBN:…&jscmd=data&format=json` | Returns author names in one call; `/isbn/` returns only author keys |
| Tests | Vitest for logic; pgTAP (`supabase test db`) for RLS, privileges and functions | Both run in CI |
| CI | GitHub Actions in the public repo: lint, type-check, Vitest, and `supabase start` + `supabase test db` on every PR | Policy tests gate merges |
| Scheduled jobs | GitHub Actions in a separate **private** repo, `chess-book-swap-ops`: weekly keep-alive API request; weekly encrypted backup | Private repos aren't subject to the 60-day scheduled-workflow cut-off, and their artifacts aren't public |

Key naming: Supabase's newer keys are `sb_publishable_…` (safe in the browser) and `sb_secret_…` (never in the repo or browser). Only the publishable key goes in the front end. Security relies entirely on RLS, column grants and security-definer functions, so every table needs RLS enabled with explicit policies.

Free-tier limits to respect:

- **Supabase:** 2 active projects. Production plus one hosted dev project uses both.
- **Netlify:** new accounts are on a credit-based free plan, so preview deploys draw on a monthly allowance. Fine at this scale; Cloudflare Pages is a like-for-like fallback.

## Data model

Six tables in Postgres, managed as Supabase migrations in the repo. Book details live once in `books`; each copy for sale or swap is a row in `listings`. RLS controls rows, not columns, so column limits use `GRANT` and privileged actions use security-definer functions.

Privilege pattern: Supabase grants `anon` and `authenticated` full rights on new `public` tables by default, which would make column grants meaningless. Every migration that creates a table therefore runs `REVOKE ALL ON <table> FROM anon, authenticated` first, then grants exactly the privileges below. Front-end queries always name their columns; `.select('*')` will fail with permission denied on `profiles` and `contact_requests`.

| Table | Key fields | Grants and row rules |
| --- | --- | --- |
| `clubs` | id, name, slug, default handover note | `anon`, `authenticated`: SELECT. Writes: admin only, via migration or function |
| `profiles` | id (= auth user id), display\_name, club\_id, is\_admin, is\_disabled, created\_at | `anon`: SELECT (id, display\_name), so signed-out browsing shows owner names. `authenticated`: SELECT (id, display\_name, club\_id); UPDATE (display\_name, club\_id), RLS limits to own row. No INSERT: rows are created by a trigger on `auth.users`. Own flags via `current_profile()` |
| `books` | id, title, author, isbn, publisher, year, edition, notation (algebraic / descriptive), topic (opening, middlegame, endgame, tactics, games collection, history, other), eco\_code, level (beginner / club / advanced / master) | `anon`: SELECT. `authenticated`: SELECT, INSERT if active. Merges: `merge_books()` only |
| `listings` | id, owner\_id (default `auth.uid()`), book\_id, condition (as new / very good / good / worn), price\_pence (nullable), swap\_ok, status (available / reserved / gone), reserved\_request\_id (nullable), hidden\_at, hidden\_reason (admin / disabled), handover\_note, notes, created\_at | `anon`: SELECT. `authenticated`: SELECT; DELETE, owner only; INSERT (book\_id, condition, price\_pence, swap\_ok, handover\_note, notes) with `WITH CHECK (owner_id = auth.uid())`; UPDATE (those columns plus status and reserved\_request\_id), owner only. hidden\_at, hidden\_reason, owner\_id and created\_at are never client-writable. Public rows: status is not gone and hidden\_at is null; owners also see all their own. Writes require `is_active()` |
| `wants` | id, user\_id (default `auth.uid()`), book\_id (nullable), free\_text, max\_price\_pence, created\_at; check that book\_id or free\_text is set | `authenticated`: SELECT, INSERT, UPDATE, DELETE, owner only, with `WITH CHECK (user_id = auth.uid())`. Matching is an ordinary query under RLS |
| `contact_requests` | id, listing\_id, requester\_id (default `auth.uid()`), message, status (pending / accepted / declined / withdrawn, default pending), created\_at | `authenticated`: SELECT for requester and listing owner; INSERT (listing\_id, message) with `WITH CHECK (status = 'pending')`, requester is the current user, listing available and not their own; UPDATE (status) only, with a trigger allowing owner → accepted/declined and requester → withdrawn, from pending |

Security-definer functions, each with `SET search_path = ''`, checking the caller itself, with execute revoked from `public` and `anon` and granted only to `authenticated` (except the trigger function):

- `handle_new_user()`: trigger on `auth.users` insert that creates the `profiles` row.
- `is_admin()` and `is_active()`: used inside policies, avoiding infinite recursion when policies on `profiles` query `profiles`.
- `current_profile()`: returns the caller's own profile, including flags.
- `contact_email(request_id)`: returns the other party's email from `auth.users` only if the request is accepted and the caller is one of the two parties.
- `merge_books(from_id, to_id)`: admin only; repoints `listings` and `wants`, then deletes the duplicate.
- `admin_set_user_flags(user_id, is_disabled)`: admin only. Disabling also sets hidden\_at and `hidden_reason = 'disabled'` on all their listings; re-enabling clears only those. This can't live in the read policy, because `anon` can't execute `is_active()`.
- `admin_hide_listing(listing_id)`: admin only; sets `hidden_reason = 'admin'`.
- `delete_my_account()`: owned by `postgres`, deletes the caller's row in `auth.users`.

Constraints and conventions:

- Prices are integer pence, never floats. Enum-like fields use check constraints or Postgres enums.
- Unique index on `books.isbn` where isbn is not null.
- Unique pending request per (listing\_id, requester\_id), as a partial unique index.
- Every foreign key to a user uses `ON DELETE CASCADE`; `contact_requests.listing_id` also cascades.
- `listings.reserved_request_id` uses `ON DELETE SET NULL`, so a requester deleting their account isn't blocked by a listing reserved for them. Don't use a check constraint tying reserved status to a non-null reference: the set-null would violate it and block the deletion.
- Reservation rules, enforced by one `BEFORE INSERT OR UPDATE` trigger on `listings`:
  - a non-null reserved\_request\_id must be an accepted request whose listing\_id is this listing;
  - status can become reserved only with a valid reserved\_request\_id in the same row;
  - when status changes from reserved to available, reserved\_request\_id is cleared; this is how an owner un-reserves when a buyer never turns up. On reserved to gone it is kept, as the record of a handover through the site;
  - when reserved\_request\_id goes from non-null to null while status is still reserved (the set-null path), status becomes available. It never overrides a status of gone set in the same update.
- Disabled users can't insert or update anything: every write policy's `WITH CHECK` calls `is_active()`.

## MVP features and user flows

The MVP has five pages and one admin view. Browsing needs no account; everything else does.

- **Sign in:** enter an email, pass the Turnstile check, receive a 6-digit code, enter it. First sign-in asks for a display name.
- **Browse listings (home):** available books with title, author, condition, price or "swap", and owner's display name. Filters for topic, notation and swap-only; a text search on title and author.
- **Listing detail:** full book details, condition, notes, handover note (e.g. "Thursday club nights"), and a "Request this book" button that opens a short message form.
- **Add or edit a listing:** a manual form as the main path, since much older and descriptive-notation stock has no ISBN or sparse records. An optional ISBN field prefills from Open Library. Pick an existing `books` row where one matches, to avoid duplicates.
- **Listing status:** the owner marks a listing reserved (linked to an accepted request) or gone.
- **My account:** all my listings, including gone ones; my want list; contact requests sent and received. The owner can accept or decline; the requester can withdraw a pending request. Accepting reveals both parties' emails to each other.
- **Want list:** add a book (from the catalogue or free text) with an optional maximum price. Show matching available listings on the page.
- **Admin view (Mark only):** list users, disable an account, hide any listing, merge duplicate books.
- **Static pages:** about and how it works, privacy notice, and a contact address for problems.

UI requirements: mobile-first and lightweight (few dependencies, small bundle); accessible (labels on all inputs, keyboard navigation, sufficient contrast); light and dark mode via `prefers-color-scheme`. The app needs JavaScript to run, which is acceptable. Use British English throughout the interface, and add a link to the books site from the main club site's navigation or footer at launch.

## Security, privacy and GDPR

Collect the minimum personal data: an email address and a display name. Never expose emails publicly; reveal them only to the two parties of an accepted contact request.

- **RLS and privileges everywhere:** every table has RLS enabled and Supabase's default grants revoked before any data is written. pgTAP tests must prove:
  - every table in `public` has RLS enabled (the first test, from Phase 1);
  - `table_privs_are` and `column_privs_are` match the grants in the data model for `anon` and `authenticated`;
  - a user cannot read another user's wants, edit another user's listing, read contact requests they are not part of, create a request that is already accepted, change their own `is_admin` or `is_disabled`, or read anyone's email except via an accepted request;
  - an owner cannot un-hide a hidden listing or set hidden\_at, hidden\_reason, owner\_id or created\_at;
  - an owner cannot reserve a listing against another listing's request, or against a request that isn't accepted;
  - an owner can un-reserve by setting status back to available, which clears reserved\_request\_id, and marking a reserved listing gone keeps its reserved\_request\_id and stays gone;
  - a signed-out visitor can see listing owners' display names and nothing else from `profiles`;
  - a requester whose request reserved a listing can delete their account, and the listing returns to available;
  - disabling a user hides their listings from everyone else, and re-enabling restores only those.
- **Definer functions:** keep them to the list in the data model. Each sets `search_path = ''`, checks the caller itself, and revokes execute from `anon` and `public`.
- **Secrets:** the Supabase URL, publishable key and Turnstile site key come from environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_TURNSTILE_SITE_KEY`). Commit `.env.example` only; add `.env` and `.netlify/` to `.gitignore`. The secret key is never used in the public repo.
- **Input handling:** treat all user text as untrusted. Rely on Vue's default escaping and ban `v-html` on user content (enforce with an ESLint rule). Cap lengths on notes and messages (e.g. 1,000 characters) in both UI and database.
- **Headers:** set a Content-Security-Policy, `X-Content-Type-Options: nosniff` and `Referrer-Policy` in `netlify.toml`. `connect-src` allows the Supabase project (plus its `wss://` URL if Realtime is used), Open Library and Turnstile; `img-src` adds `covers.openlibrary.org` if covers are shown; `script-src` and `frame-src` allow Turnstile.
- **Abuse limits:** Turnstile on sign-up and sign-in; cap contact requests per user per day (e.g. 10) in the database.
- **Backups contain every user's email.** They run only in the private ops repo, never the public one, and are encrypted on the runner with `age` to a public key before upload; the private key is kept offline by Mark.
- **The dump connection string is effectively the `postgres` superuser** and the most sensitive secret in the setup. It lives only as a secret in the ops repo; the ops repo stays Mark-only, with two-factor authentication on his GitHub account. The ops README says this plainly.
- **Production data stays out of hosted non-production systems.** Restore tests use a local `supabase start` instance, wiped afterwards; never the hosted dev project used by preview deploys.
- **Account deletion:** self-service via `delete_my_account()`, cascading to profile, listings, wants and contact requests.
- **Email deliverability:** SPF, DKIM and DMARC records, set up by Mark (see Deployment).
- **UK GDPR:** decide whether the data controller is Mark or the club, and name it in the privacy notice. Complete the ICO data protection fee self-assessment; a not-for-profit exemption probably applies, but confirm it.
- **Privacy notice:** a plain-English page stating what is stored, why, where (choose an EU or UK Supabase region), that encrypted backups are kept for up to 90 days, who the controller is, and how to delete it.
- **Separation:** no link to any club membership data; this project holds its own users only.

## Repo structure and local setup

Two repos: the public `chess-book-swap` holds the front end and database migrations; the private `chess-book-swap-ops` holds only the scheduled jobs that touch production data.

```
chess-book-swap/          # public
  CLAUDE.md            # this plan, condensed, plus conventions
  README.md            # setup and deploy instructions
  netlify.toml         # build settings, SPA redirect, security headers
  package.json
  vite.config.ts
  tsconfig.json
  eslint.config.js     # includes a no-v-html rule
  .env.example
  index.html
  src/
    main.ts
    router.ts
    supabase.ts        # client setup from env vars
    views/             # one component per page
    components/
    composables/       # auth state, data access
    lib/               # pure logic: formatting, matching, validation
    styles/
  supabase/
    config.toml        # local CAPTCHA uses Turnstile test keys or is disabled
    templates/         # auth email templates using {{ .Token }}
    migrations/        # SQL, one file per change
    tests/             # pgTAP: RLS, privileges, functions
    seed.sql           # sample books for local dev
  tests/               # Vitest unit tests
  .github/workflows/
    ci.yml             # lint, type-check, Vitest, pgTAP

chess-book-swap-ops/      # private, Mark only
  README.md            # restore steps; warns the dump secret is effectively superuser
  .github/workflows/
    keepalive.yml      # weekly API request with the publishable key
    backup.yml         # weekly CLI dumps (public schema + data, auth data only), age-encrypted, size-checked
```

Local setup the README must cover:

1. Install Node LTS, Docker and the Supabase CLI.
2. `npm install`, then `supabase start` to run Postgres, auth and a local mail catcher in Docker.
3. `supabase db reset` to apply migrations and seed data.
4. Copy `.env.example` to `.env` with the local Supabase URL and publishable key.
5. `npm run dev` for the site; `npm test` for unit tests; `supabase test db` for policy tests.
6. For preview deploys, use the hosted dev Supabase project, not the local one.

## Phased build plan

Six phases, each ending in a working, deployed state. Finish and verify each before starting the next; open one PR per phase.

1. **Scaffold and deploy.** Vue 3 + Vite + TypeScript + vue-router project, ESLint with a no-`v-html` rule, `netlify.toml` with SPA redirect and security headers, CI including a pgTAP job, placeholder home page, `CLAUDE.md` and README. The first pgTAP test asserts every table in `public` has RLS enabled. Mark creates the hosted dev Supabase project and the private `chess-book-swap-ops` repo.
   - Done when: CI passes on a PR, including the RLS-enabled test; the placeholder is live on the Netlify URL with security headers present.
2. **Database and auth.** Before starting, Mark sets up Resend with its DNS records, configures it as custom SMTP in the dev project, switches the sign-in email template to `{{ .Token }}`, and creates Turnstile keys. Then: all six tables as migrations with revoke-then-grant privileges, RLS policies, helper and trigger functions, status-transition trigger, seed data, email-code sign-in with Turnstile (test keys locally and in CI), profile creation on first sign-in.
   - Done when: pgTAP tests pass in CI for every rule and grant in the data model; an email address outside the Supabase organisation receives a 6-digit code in the inbox, not spam, and signs in.
3. **Listings.** Browse page with filters and search, listing detail, manual add and edit form, optional ISBN prefill from Open Library, status changes. All queries name their columns.
   - Done when: a signed-in user can list a book without an ISBN in under two minutes; signed-out visitors can browse and see owners' names but not edit; owners see their own gone listings.
4. **Contact requests.** Request form, My account with sent and received requests, accept, decline and withdraw, `contact_email()`, reserved linked to an accepted request with `ON DELETE SET NULL`, daily cap.
   - Done when: two test users complete the request-to-accept flow and see each other's emails; a third user cannot see the request or either email; the requester can delete their account while their request reserves a listing; the owner can un-reserve a listing whose buyer never turns up.
5. **Want lists and admin.** Want list page with matching listings, admin view using the admin functions (disable with listing hiding, hide, merge), self-service account deletion.
   - Done when: a want shows a matching listing as soon as it is created; a merge repoints other users' listings; disabling a user hides their listings; deletion removes all of a user's rows.
6. **Launch prep.** Production Supabase project with SMTP, code template and Turnstile; keep-alive and encrypted backup workflows in the ops repo pointed at production, with size checks and failure emails confirmed reaching Mark; privacy notice naming the controller; ICO fee self-assessment done; accessibility pass; custom subdomain; link from the main club site.
   - Done when: the site is live on books.trowbridgechessclub.co.uk over HTTPS; a backup has been decrypted and restored, users included, into a local instance that was then wiped, and the exact dump and restore commands are recorded in the ops README; Mark has approved it for club launch.

## Deployment

Netlify builds from `main`; every PR gets a preview URL. Some steps need Mark's accounts, so Claude Code should prepare them and hand them over rather than attempt them.

- **Build settings in `netlify.toml`:** build command `npm run build`, publish directory `dist`, Node version pinned, `/* /index.html 200` redirect for client-side routing.
- **Environment variables (Mark sets in Netlify):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_TURNSTILE_SITE_KEY`. Production context uses the production project; deploy previews use the hosted dev project.
- **Supabase auth settings (Mark sets, in both projects):** custom SMTP via Resend; email OTP enabled; sign-in and sign-up email templates changed to send `{{ .Token }}` instead of the default link; Turnstile CAPTCHA enabled; site URL `https://books.trowbridgechessclub.co.uk`; redirect URLs for the production domain, the Netlify URL and `http://localhost:5173`.
- **DNS (Mark does):**
  - CNAME `books` pointing at the Netlify site name, then add the domain in Netlify and confirm HTTPS is active.
  - Resend's records as it issues them: SPF stays on its `send.` subdomain as Resend sets it by default, plus the DKIM record. Don't add a second SPF record at the root; if one exists, leave it alone.
  - A basic DMARC record (e.g. `_dmarc` with `v=DMARC1; p=none; rua=` a mailbox Mark reads), so Gmail and Outlook don't route codes to spam.
- **Migrations to production:** `supabase db push` against the production project, run by Mark after review, never automatically from CI.
- **Keep-alive (ops repo):** a weekly small request through the Supabase API using the publishable key, e.g. reading one row from `clubs`. This is the commonly used approach; a direct Postgres query may not count as activity for the pause check.
- **Backups (ops repo):** weekly, using the Supabase CLI rather than raw `pg_dump`, which must match the server's Postgres major version:
  1. `supabase db dump` for the `public` schema;
  2. `supabase db dump --data-only` for `public` data;
  3. `supabase db dump --data-only --schema auth`, keeping users and identities. The CLI excludes tables rather than including them, so use -x for auth.sessions, auth.refresh\_tokens, auth.audit\_log\_entries and other transient tables; Phase 6 confirms the exact command and records it in the ops README. Never dump auth's schema: a fresh project already has its own managed `auth` schema, and restoring it would clash.
  4. Encrypt all three files with `age` to Mark's public key, then upload as an artifact with the maximum retention (90 days in private repos).
- **Backup monitoring:** the job fails noisily if any dump is empty or below a minimum size, and if `auth` users or `profiles` row counts are zero. Mark confirms GitHub's failed-workflow emails reach him; for scheduled workflows these go to whoever last edited the cron, so Mark makes that edit himself.
- **Restore procedure (ops README):** restore into a local `supabase start` instance, never a hosted project during tests: apply the schema, then load auth data and public data in a session with SET session\_replication\_role = replica, which disables triggers (including handle\_new\_user and the reservation trigger) and foreign-key checks for that session. The CLI's data-only dumps may already include this; the README says to check the dump header and add it if not; check row counts and that every profile joins to a restored auth user; then `supabase stop --no-backup` to wipe it. A real recovery uses the same order on a fresh production project. On hosted Supabase the postgres role isn't a full superuser, and the local test can't prove it may set session\_replication\_role, so in a real recovery check that it works on the fresh project before loading any data.
- **Main site:** add a link to the books subdomain in the club site's navigation or footer at launch.

## Out of scope and later ideas

None of these are built in the MVP; the data model should simply not block them.

- **Out of scope:** payments, postage or shipping, ratings and reviews, in-app chat beyond contact requests, mobile apps.
- **Tournament handover:** reuse the main club site's `tournaments.json` (baked from the club calendar's ♟️ events) so sellers can tag "I'll be at this event". If wider data is wanted later, use the chess-results CLI.
- **Email alerts:** notify a user when a new listing matches their want list. This is where a security-definer matching function would be justified.
- **Club library clearances:** bulk import from a CSV for a club offloading donated stock.
- **More clubs:** a club picker and per-club filtering, using the existing `clubs` table.
- **Affiliate link:** when nobody has a wanted book, link to buy it new.

## Working instructions for Claude Code

Mark already maintains the club site in Vue 3 + Vite (`vue-tcc/`). Follow that site's conventions where sensible; explain Supabase-specific choices briefly; skip general programming explanations.

- **Start of each phase:** confirm any open decision from the assumptions table that the phase depends on. Ask rather than guess.
- **Small steps:** one PR per phase, with small, well-described commits. In this repo, changes go via PR so CI gates merges, unlike the club-site repo.
- **Tests first for security:** write the pgTAP tests before or alongside the policies, grants and functions, and confirm they pass in CI before declaring a phase done.
- **Dependencies:** keep them few. Ask before adding any library beyond Vue, vue-router, Vite, TypeScript, supabase-js, ESLint and Vitest. Pin exact versions.
- **Never:** commit secrets, use the secret key anywhere in this project, disable RLS to make something work, use `v-html` on user content, or run migrations against production.
- **Hand-offs to Mark:** anything needing his accounts (Netlify, Supabase dashboard and email templates, Resend, Turnstile, DNS, the ops repo and its secrets) goes in a short checklist at the end of the PR description. All accounts are personal, not work ones.
- **Keep `CLAUDE.md` current:** after each phase, update it with what was built, conventions adopted and any decisions Mark confirmed.
