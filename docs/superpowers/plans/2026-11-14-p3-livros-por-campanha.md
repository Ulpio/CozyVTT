# P3 — Livros por campanha Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each campaign records which compendium books are enabled; the creature library and the campaign-scoped compendium search offer only those books.

**Architecture:** A `CampaignBook` join table, a small service `backend/src/compendium/campaignBooks.ts` that every route uses (defaults, set, read, the creature filter), two routes on the campaign, filters added to the existing creature list and compendium search, and a `CampaignBooksPicker` component shared by the create and settings modals.

**Tech Stack:** Prisma/PostgreSQL, Express + zod, React 19 + i18next, Jest e2e (supertest) and Vitest.

**Spec:** `docs/superpowers/specs/2026-11-14-p3-livros-por-campanha-design.md`

## Global Constraints

- New campaign: the books of its system except `srd`; no system → no books.
- Existing campaigns (migration): every book of their system, `srd` included.
- Disabling a book deletes nothing: tokens and sheets stay; only choice lists change.
- Only the GM (owner included) changes the books; members read them.
- Changing a campaign's system resets its books to the new system's default.
- Creatures not from a book (custom, campaign or global) always show.
- UI copy in pt-BR and en (`frontend/src/i18n/locales/{pt-BR,en}.ts`); tests run in English.
- Docs that the doc tests check (`docs/ARCHITECTURE.md` diagram, `backend/prisma/README.md` model count and list, `backend/DATABASE_MIGRATIONS.md` for a migration that writes rows, `routeInventory.test.ts` TESTED) are updated in the task that causes them.

## Review Focus

- A book id that does not exist, or belongs to another system, in a PUT → 400, nothing saved.
- A non-member passing `campaignId` to the compendium search → 403, never another campaign's list.
- A campaign with no system: the books route returns an empty list and a PUT with any id → 400.
- A campaign-scoped creature whose `source` is a book id (copied from one) still shows when that book is off.
- A system change sent together with other settings in the same PUT still resets the books.

---

### Task 1: Table, migration and service

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `CampaignBook`, relations on `Campaign` and `CompendiumBook`)
- Create: `backend/prisma/migrations/20261114180000_campaign_books/migration.sql`
- Create: `backend/src/compendium/campaignBooks.ts`
- Test: `backend/src/compendium/__tests__/campaignBooks.e2e.test.ts`
- Docs: `backend/prisma/README.md` (27 models + entry), `docs/ARCHITECTURE.md` (entity + relations), `backend/DATABASE_MIGRATIONS.md` (entry: inserts a row per existing campaign and book of its system)

**Interfaces:**
- Produces:
  - `defaultBookIds(gameSystem: GameSystem | null, db?): Promise<string[]>` — books of that system minus `srd`; `[]` for null.
  - `setCampaignBooks(campaignId: string, bookIds: string[], db?): Promise<void>` — replaces the set in one transaction; throws `CampaignBooksError` (message names the bad id) when an id is unknown or of another system than the campaign's.
  - `enabledBookIds(campaignId: string, db?): Promise<string[]>`
  - `campaignBookList(campaignId: string, db?): Promise<Array<{ id: string; name: string; enabled: boolean }>>` — books of the campaign's system, sorted by name.
  - `creatureBookScope(campaignId: string, db?): Promise<Prisma.CreatureTemplateWhereInput>` — `{ OR: [{ campaignId }, { source: { notIn: allBookIds } }, { source: { in: enabled } }] }`.
  - `class CampaignBooksError extends Error`
  - `db` defaults to the app's `prisma`; also accepts a transaction client.

- [ ] **Step 1: Failing tests** (`campaignBooks.e2e.test.ts`, real DB, invented campaign named `P3T …`, cleaned in `afterEach`):
  - `defaultBookIds('FIFTH_EDITION')` → `['dmg','mm','phb']` (sorted); `defaultBookIds(null)` → `[]`.
  - `setCampaignBooks(id, ['phb','mm'])` then `enabledBookIds(id)` → `['mm','phb']`.
  - `setCampaignBooks(id, ['nope'])` rejects with `CampaignBooksError` matching `/nope/`, and the earlier set is unchanged.
  - For a campaign with `gameSystem: null`, `setCampaignBooks(id, ['phb'])` rejects.
  - `campaignBookList(id)` → four entries, `enabled` true only for the set ones.
  - `creatureBookScope`: with only `phb` enabled, a `findMany` over global creatures named `P3T Lobo` (source `mm`), `P3T Urso` (source `custom`) and a campaign creature `P3T Cópia` (source `mm`, campaignId = id) returns Urso and Cópia, not Lobo.
- [ ] **Step 2:** Run `docker exec cozyvtt-backend sh /tmp/bejest.sh src/compendium/__tests__/campaignBooks` → FAIL (module not found).
- [ ] **Step 3:** Schema: `model CampaignBook { campaignId String; bookId String; campaign Campaign @relation(..., onDelete: Cascade); book CompendiumBook @relation(..., onDelete: Cascade); @@id([campaignId, bookId]) @@index([bookId]) }`. Migration: create table, FKs, then `INSERT INTO "CampaignBook" SELECT c.id, b.id FROM "Campaign" c JOIN "CompendiumBook" b ON b."gameSystem" = c."gameSystem";`. Run `npx prisma migrate deploy` and `npx prisma generate` in the container, restart it.
- [ ] **Step 4:** Implement the service.
- [ ] **Step 5:** Tests pass; doc tests pass in the repo-mounted container (`composeEnv`, `documentedFacts`).
- [ ] **Step 6:** Commit "Keep which books a campaign uses".

### Task 2: Campaign routes

**Files:**
- Modify: `backend/src/routes/campaigns.ts` (POST `/`, PUT `/:campaignId`, new GET/PUT `/:campaignId/books`)
- Modify: `backend/src/validators/campaigns.ts` (`bookIds` on `CreateCampaignSchema`; `CampaignBooksSchema = z.object({ bookIds: z.array(z.string().max(40)).max(50) })`)
- Test: `backend/src/routes/__tests__/campaignBooks.e2e.test.ts`; add the two routes to `routeInventory.test.ts` TESTED.

**Interfaces:**
- Consumes: Task 1's service.
- Produces: `GET /api/campaigns/:id/books` (member) → `{ books: Array<{id,name,enabled}> }`; `PUT /api/campaigns/:id/books` (GM) body `{ bookIds }` → same shape; 400 on `CampaignBooksError`. POST `/api/campaigns` takes optional `bookIds` (absent → `defaultBookIds`). PUT `/api/campaigns/:id` with a changed `gameSystem` resets to `defaultBookIds(new)`. Each change broadcasts `campaign.books.updated` `{ campaignId, bookIds }`.

- [ ] **Step 1: Failing tests:**
  - creating a 5e campaign without `bookIds` → GET books shows phb, mm, dmg enabled, srd not.
  - creating with `bookIds: ['phb']` → only phb.
  - GM PUT `['phb','srd']` → 200 and both enabled; player PUT → 403; player GET → 200.
  - PUT `['xx']` → 400 and the list unchanged.
  - PUT `/api/campaigns/:id` `{ gameSystem: 'HORROR_D100', name: 'x' }` → GET books returns `[]`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement; book writes go in the same transaction as the campaign create/update where the handler already has one, otherwise right after it.
- [ ] **Step 4:** Tests + `routeInventory` pass.
- [ ] **Step 5:** Commit "Let the GM choose a campaign's books".

### Task 3: Filters on creatures and compendium

**Files:**
- Modify: `backend/src/routes/creatures.ts` (GET list: push `await creatureBookScope(campaignId)` into `scopes`)
- Modify: `backend/src/routes/compendium.ts` (`campaignId` in `SearchQuery`; when given: member check, then `where.bookId = { in: enabled }` intersected with `book`)
- Test: `backend/src/routes/__tests__/creatureCampaignBooks.e2e.test.ts`, extend `backend/src/routes/__tests__/compendium.e2e.test.ts`

- [ ] **Step 1: Failing tests:**
  - with `mm` off, the creature list has no global `mm` creature, still has the campaign's own creatures and global `custom` ones; `?source=mm` → empty.
  - compendium `?campaignId=<id>&q=<invented phb spell>` with `phb` off → no items; with it on → the entry.
  - a non-member with `campaignId` → 403.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Pass, plus existing `creatures`, `creatureCampaignScope`, `compendium` suites.
- [ ] **Step 5:** Commit "Offer only a campaign's books".

### Task 4: Picker in the create and settings modals

**Files:**
- Create: `frontend/src/components/campaign/CampaignBooksPicker.tsx`
- Modify: `frontend/src/components/CreateCampaignModal.tsx`, `frontend/src/components/campaign/CampaignSettingsModal.tsx`, `frontend/src/services/api.ts` (`getCampaignBooks(id)`, `setCampaignBooks(id, bookIds)`), campaign service `createCampaign` passes `bookIds`, `frontend/src/types/index.ts`, locales.
- Test: `frontend/src/components/campaign/__tests__/CampaignBooksPicker.test.tsx`

**Interfaces:**
- Produces: `CampaignBooksPicker({ books: Array<{id,name,enabled}>, onChange(bookIds: string[]), disabled?: boolean })` — a fieldset with legend "Livros desta campanha" / "Books in this campaign", one checkbox per book; empty list shows "Este sistema ainda não tem livros." / "This system has no books yet."
- Create modal: builds the list from `getCompendiumBooks()` filtered by the chosen system, defaults per Global Constraints, re-defaults when the system changes, sends `bookIds`.
- Settings modal: loads `getCampaignBooks`, saves with `setCampaignBooks` on toggle; players see it disabled.

- [ ] **Step 1: Failing tests:** renders a checkbox per book with its state; toggling calls `onChange` with the new id list; empty list shows the empty copy; `disabled` disables every box.
- [ ] **Step 2:** `docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 src/components/campaign/__tests__/CampaignBooksPicker` → FAIL.
- [ ] **Step 3:** Implement and wire both modals.
- [ ] **Step 4:** Picker tests pass; existing `CreateCampaignModal*` and `CampaignSettingsModal*` tests pass; `npx tsc --noEmit` clean in frontend.
- [ ] **Step 5:** Commit "Pick a campaign's books when creating or setting it".

### Task 5: Check in the browser

- [ ] In the test campaign: turn `mm` off in settings → the Goblin leaves the creature library; turn it back on → it returns. Create a new 5e campaign → srd unchecked, the others checked.
- [ ] Ledger line; final review per executing-plans.
