# Coluna de iniciativa sobre o mapa — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During combat, a column at the map's left edge shows everyone the initiative order with each rolled value, whose turn it is, the round, and (where allowed) HP bars.

**Architecture:** Frontend only. A pure helper turns the combat state the store already holds (`useCombatState()` in `frontend/src/stores/gameStore.ts`, `CombatState`/`CombatantEntry` in `frontend/src/types/index.ts`) into rows; a component renders them over the map in both layouts; a small store request lets a row ask the map to centre on its token. The server order of `combatants` is the turn order (the tracker does not sort).

**Tech Stack:** React 19, Zustand, Tailwind 4 (theme tokens), i18next, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-24-coluna-de-iniciativa-design.md`

## Global Constraints

- Frontend only: no server, socket or database change.
- Visible only while `combat.active`; hidden otherwise.
- HP bar only for the GM and, for players, only on `type === 'player'` combatants; never a monster's HP to a player.
- Never shows a combatant the store does not hold (the server already filters per viewer).
- Collapse choice remembered per browser through `optionalStorage` (`frontend/src/utils/optionalStorage.ts`), key `mesa.initiativeColumn.collapsed`; compact layout starts collapsed when nothing is stored.
- No editing from the column (initiative edits stay in the "Iniciativa" tab).
- Text through i18n (pt-BR and en, new group `initiativeColumn`); frontend tests in English plus a pt-BR assertion via `inPortuguese` (`@/test/inPortuguese`).
- Theme colour tokens only (same classes as other map overlays, light and dark).
- Commits: `git -c user.name=CheekyChinchilla -c user.email=154020855+CheekyChinchilla@users.noreply.github.com commit`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `.superpowers/`.

**Commands:** tests `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 <paths>`; typecheck `MSYS_NO_PATHCONV=1 docker exec -e NODE_OPTIONS=--max-old-space-size=2048 cozyvtt-frontend npx tsc --noEmit -p tsconfig.json` (only the known character-export error may remain).

## Review Focus

1. A combatant whose initiative is `null` (not rolled yet) shows "–" and keeps its place — Task 1 test.
2. The current-turn token is not in the viewer's list (hidden from this player) — no row is marked current, nothing crashes — Task 1 test.
3. A player never sees an HP bar on an `npc`/`object` row, even when `hp` is present in the entry — Task 1 test.
4. Storage blocked (private mode): the column still renders with the layout default — Task 2 test.
5. Clicking a row whose token is on another map does nothing (no pan, no error) — Task 3 test.

---

### Task 1: Rows from the combat state

**Files:**
- Create: `frontend/src/components/campaign/initiativeColumn/rows.ts`
- Test: `frontend/src/components/campaign/initiativeColumn/__tests__/rows.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface InitiativeRow {
    tokenId: string; mapId: string; name: string; imageUrl: string;
    value: string;            // rolled value as text, or '–' when null
    current: boolean;
    hp: { current: number; max: number; temp: number } | null; // null when this viewer must not see it
  }
  export function initiativeRows(combat: CombatState, viewer: { isGM: boolean }): InitiativeRow[];
  ```

- [ ] **Step 1: Failing tests** in `rows.test.ts`:
  - `keeps the server order and marks the current turn`: three combatants, `currentTokenId` = second → rows in the same order, only row 2 `current`.
  - `shows a dash for a combatant who has not rolled`: `initiative: null` → `value === '–'`; `initiative: 0` → `'0'`.
  - `marks no row current when the current token is not in the list`: `currentTokenId: 'gone'` → every `current` false.
  - `shows HP to the GM on every row`: `isGM: true` → npc row keeps `hp`.
  - `hides monster HP from a player`: `isGM: false`, npc and object rows with `hp` set → `hp === null`; player row keeps `hp`.
  - `is empty when combat is not active`: `active: false` → `[]`.
- [ ] **Step 2:** Run → FAIL (module missing).
- [ ] **Step 3:** Implement `initiativeRows` in `rows.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit "Turn the combat state into initiative column rows".

### Task 2: The column over the map

**Files:**
- Create: `frontend/src/components/campaign/initiativeColumn/InitiativeColumn.tsx`
- Modify: where the map is mounted — desktop `frontend/src/pages/CampaignPage.tsx` (~line 263, next to `<MapCanvas …/>`) and compact `frontend/src/components/campaign/compact/CompactTable.tsx` (over its map); locales `frontend/src/i18n/locales/{en,pt-BR}.ts` (group `initiativeColumn`)
- Test: `frontend/src/components/campaign/initiativeColumn/__tests__/InitiativeColumn.test.tsx`

**Interfaces:**
- Consumes: `initiativeRows` (Task 1), `useCombatState()`, the viewer's GM flag the page already uses (`isGM` from the campaign context), `optionalStorage`.
- Produces: `export default function InitiativeColumn({ compact, onRowClick }: { compact: boolean; onRowClick?: (row: InitiativeRow) => void }): JSX.Element | null`.

Layout: absolutely positioned at the map's left edge, below the map toolbar, above the map but below modals; `role="region"` with `aria-label` = `t('initiativeColumn.label')` ("Initiative order" / "Ordem de iniciativa"). Header "Round {{round}}" / "Rodada {{round}}" and a collapse toggle (`aria-expanded`, label "Collapse"/"Recolher" and "Expand"/"Abrir"). Expanded row: portrait (`imageUrl`, initial-letter fallback), name, value right-aligned and prominent, HP bar under the name when `row.hp`; the current row has a brand border and an arrow, plus `aria-current="true"`. Collapsed: portrait + value only, name in `title`. Rows are buttons calling `onRowClick`. Long lists scroll inside the column (max height = map area).

- [ ] **Step 1: Failing tests** in `InitiativeColumn.test.tsx` (seed the store's combat state the way existing InitiativeTracker tests do):
  - `renders nothing outside combat`.
  - `shows the round, names and rolled values in order` (expanded): "Round 2", names in order, values "18", "–".
  - `marks the current turn` → the current row has `aria-current="true"`.
  - `shows HP bars only where the viewer may see them` → as player, `getAllByRole('meter'|…)` count equals the player-character rows (use whatever accessible role the bar gets, e.g. `role="meter"` with an `aria-label`).
  - `collapses and remembers it` → click "Collapse": names gone, values stay; `optionalStorage.getItem('mesa.initiativeColumn.collapsed') === '1'`; a fresh render starts collapsed.
  - `starts collapsed in the compact layout when nothing is stored`, and `starts expanded on desktop`.
  - `still renders when storage throws` (mock `optionalStorage.getItem` to throw/return null per its contract) → renders with the layout default.
  - `reads in Portuguese` → inside `inPortuguese`: "Rodada 2", region "Ordem de iniciativa", button "Recolher".
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the component, add the locale keys, mount it in both layouts over the map (pass `compact` accordingly; `onRowClick` wired in Task 3).
- [ ] **Step 4:** Run the new test, the existing `CampaignPage*`/`CompactTable*`/`InitiativeTracker*` tests (known pre-existing CampaignPage useToast failures excepted) and the typecheck → PASS.
- [ ] **Step 5:** Commit "Show the initiative order in a column over the map".

### Task 3: Tap a row to centre the map on its token

**Files:**
- Modify: `frontend/src/stores/gameStore.ts` (request), `frontend/src/components/campaign/MapCanvas.tsx` (handle it), the two mount points from Task 2 (pass `onRowClick`)
- Test: `frontend/src/stores/__tests__/centreRequest.test.ts`, `frontend/src/components/campaign/__tests__/MapCanvasCentre.test.tsx`

**Interfaces:**
- Produces in the store: state `centreRequest: { tokenId: string; nonce: number } | null` and action `requestCentreOn(tokenId: string): void` (nonce increments so the same token can be requested twice); cleared on campaign reset with the rest.
- MapCanvas: an effect on `centreRequest` — if the token is on the current map and the viewer can see it, `panBy` so the token's centre lands at the canvas centre (use `gridToScreen` + the canvas size; token size in squares via the existing token centre helper); otherwise do nothing.

- [ ] **Step 1: Failing tests**:
  - `centreRequest.test.ts`: `requestCentreOn('a')` twice → two different nonces, same tokenId.
  - `MapCanvasCentre.test.tsx` (smallest MapCanvas render existing tests use): a token at square (10,10) on the current map → after `requestCentreOn(id)`, the token's screen centre equals the canvas centre (within 1px); a token on another map → pan unchanged.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement the store request and the MapCanvas effect; pass `onRowClick={(row) => useGameStore.getState().requestCentreOn(row.tokenId)}` at both mount points.
- [ ] **Step 4:** Run these tests, the Task 2 test, existing MapCanvas tests, typecheck → PASS.
- [ ] **Step 5:** Commit "Centre the map on a combatant tapped in the initiative column".
