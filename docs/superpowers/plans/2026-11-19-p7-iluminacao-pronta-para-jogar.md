# P7 — Iluminação dinâmica pronta para jogar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A token can carry a light that moves with it (set by hand, or lit by a torch/lamp/lantern/candle in the character's hands), a 5e character's token gets its race's darkvision automatically, new maps start ready for lighting with an easy "Escuro" switch, the walls/light/fog panels use the theme, and a test proves the player's map reveals as they walk.

**Architecture:** Tokens gain `light` (Json) and `sightRadiusManual` (Boolean). A new byte-identical shared util `tokenLights.ts` turns the map's static lights plus every token's light into one `LightSource[]`, used by the server's visibility rule (`spirit-layer.ts`) and the client's light drawing and vision. Players receive token lights anonymously (position, radii, colour) so they can draw lit ground from tokens they can't see. Darkvision and item lights are server services applied on token placement, on sheet race change and after every equip change.

**Tech Stack:** Node/Express/Prisma 7/Socket.IO (backend, Jest), React 19 + Zustand + Tailwind 4 + i18next (frontend, Vitest).

**Spec:** `docs/superpowers/specs/2026-11-19-p7-iluminacao-pronta-para-jogar-design.md`

## Global Constraints

- Every earlier Global Constraint still binds (see `docs/superpowers/plans/2026-11-19-p6-ferramentas-do-mestre.md` lines 13-22): no book text in git; i18n pt-BR and en, frontend tests in English; commits authored as `CheekyChinchilla <154020855+CheekyChinchilla@users.noreply.github.com>` with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer, subjects as plain sentences; never run the whole backend suite; `backend/src/utils` files with a frontend twin stay byte-identical (`visionParity.test.ts` list).
- `type TokenLight = { brightRadius: number; dimRadius: number; color: string; source: 'manual' | 'item'; itemId?: string }` (radii in grid squares, `0 ≤ bright ≤ dim ≤ 120`, color `#rrggbb`); `light: null` = no light.
- A token's light lights; it never gives sight (the existing light/vision split stays).
- `sightRadius` stays a GM-only field. `sightRadiusManual: true` once the GM sets it by hand; the sheet never overwrites a manual value.
- Darkvision: 5e only; compendium race `data.darkvision` in metres, a subrace's own value wins; squares = `Math.floor(metres / 1.5)` (18 m → 12, 36 m → 24); a race with none → 0.
- Item lights by compendium slug: `tocha` 4/8, `lampada` 3/6, `lanterna-coberta` 6/12, `vela` 1/2 (colour `#ffcc66`); hand-typed names starting (accent/case-insensitive) with `tocha`/`torch` 4/8, `lampiao`/`lampada`/`lamp` 3/6, `lanterna`/`lantern` 6/12, `vela`/`candle` 1/2. `lanterna-furta-fogo` is not a light. The biggest (by `dimRadius`) light item in `main`/`off`/`both` wins; none → the item light goes off. A `source: 'manual'` light is never changed by the inventory.
- Who may set a token's light: a GM on any token; a player only on tokens they control (the server's existing "may move this token" rule). Refusal: **"Você não controla esse token."**.
- New maps created through the app: `lightingEnabled: true`, `fogEnabled: true`, `explorationEnabled: true`, `globalIllumination: true`. Imported/duplicated maps keep their values. "Escuro" = `globalIllumination: false`.
- Remove the cosmetic glow around the viewer's own tokens (`drawLights.ts`).

## Review Focus

1. A goblin token carrying a torch, hidden from the player behind a wall corner → the player never receives the goblin token, but sees the lit floor in their line of sight (Task 2 integration test).
2. The GM edits a dwarf's sightRadius to 6 by hand, then the player changes the sheet's race → stays 6 (Task 3 test).
3. A player with a torch in the main hand moves it to the off hand → the light stays (no flicker off/on, one write); stows it → off; the GM had set a manual light → untouched throughout (Task 4 test).
4. A player sends `token.light.set` for another player's token or a GM's monster → refused with "Você não controla esse token." and nothing changes (Task 2 test).
5. An old map (lighting off, created before P7) → unchanged after the deploy; only maps created afterwards get the new defaults (Task 5 test).

---

### Task 1: Token light data and the shared light list

**Files:**
- Modify: `backend/prisma/schema.prisma` (Token: `light Json?`, `sightRadiusManual Boolean @default(false)`), new migration `backend/prisma/migrations/20261120120000_token_light/migration.sql`; token types on both sides (`backend/src/types`, `frontend/src/types/index.ts`)
- Create: `frontend/src/utils/tokenLights.ts` and a byte-identical `backend/src/utils/tokenLights.ts`; add it to `visionParity.test.ts`
- Modify: `backend/src/utils/spirit-layer.ts` (the visibility path uses `effectiveLights`), `backend/src/utils/tokenMask.ts` (a token's `light` is not sent on tokens a player doesn't own; it travels as an anonymous token light instead, Task 2)
- Test: `frontend/src/utils/__tests__/tokenLights.test.ts`, the shared `vision-scenarios.json` gains a case (a torch-carrying token lights a dark room)

**Interfaces:**
- `export type TokenLight` (Global Constraints); `export function tokenLightValid(v: unknown): v is TokenLight`.
- `export function effectiveLights(staticLights: LightSource[] | unknown, tokens: Array<{ id: string; x: number; y: number; width?: number; height?: number; light?: TokenLight | null }>, gridSize: number): LightSource[]` — static lights unchanged, plus one enabled `LightSource` per token with a light, at the token's centre (pixel → the unit `LightSource` uses), id `token:<tokenId>`. Returns a new array each call (the server's lit cache is keyed by array identity: key it by a stable string of the inputs instead if needed, without losing the cache for maps with no token lights).

- [ ] **Step 1: Failing tests:** `effectiveLights` with two static lights and a token with a torch → three lights, the third centred on a 2×2 token; a token with `light: null` adds nothing; `tokenLightValid` rejects bright > dim, negative, > 120, bad colour; the new vision scenario (dark map, no global illumination, a human with sightRadius 0 next to a torch-carrying token) passes on both sides via `visionParity`.
- [ ] **Step 2: Run** `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run src/utils/__tests__/tokenLights.test.ts` and `berepo.sh --runInBand --forceExit src/utils/__tests__/visionParity.test.ts` → FAIL.
- [ ] **Step 3: Implement**; run `prisma migrate deploy` on dev and `cozyvtt_test`, then `docker restart cozyvtt-backend`.
- [ ] **Step 4: Run** them plus the existing vision/lighting tests (`backend/src/utils/__tests__` files matching `raycast|visibility|spirit|lighting`, `wallsAndLightsForPlayers.integration.test.ts`) → PASS. Both typechecks.
- [ ] **Step 5: Commit** — "Let a token carry a light, counted with the map's lights".

### Task 2: Setting a token's light, and players seeing lit ground

**Files:**
- Modify: `backend/src/websocket/handlers/tokens.ts` (`token.light.set`), the map/tokens payload for players (where `tokenSentTo`/filtered tokens are built) to add `tokenLights`, ceiling table, websocket docs; frontend receiving `tokenLights` and the token `light` update
- Test: `backend/src/websocket/__tests__/tokenLight.integration.test.ts`

**Interfaces:**
- Socket `token.light.set { mapId: string; tokenId: string; light: TokenLight | null }` (the client sends `source: 'manual'`; the server forces `source: 'manual'` and drops `itemId` for anything sent) → ack `{ ok: true }` or a refusal; GM any token, player only a token they control ("Você não controla esse token."), invalid light → **"Essa luz não é válida."**. On success broadcast the token update to GMs and the token's controllers, and to every player the refreshed `tokenLights` and their recomputed visible tokens.
- Players' map state gains `tokenLights: Array<{ x: number; y: number; brightRadius: number; dimRadius: number; color: string }>` — every token light on the map, with no token id.

- [ ] **Step 1: Failing tests:** Review Focus 1 (hidden goblin with a torch: player gets no goblin token, gets one `tokenLights` entry, and the server's visibility rule counts the lit area); Review Focus 4; a player lights their own token → controllers and GM get it, others get only `tokenLights`; invalid light refused.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/websocket/__tests__/tokenLight.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `wallsAndLightsForPlayers.integration.test.ts` and the token-move tests → PASS. Backend tsc.
- [ ] **Step 5: Commit** — "Let the GM and a token's controller light it, and show players the lit ground".

### Task 3: Darkvision from the sheet

**Files:**
- Create: `backend/src/services/darkvision.ts`
- Modify: token creation paths that set `characterId` (route and socket), the character update route (race change), the GM's token edit path (setting `sightRadius` by hand sets `sightRadiusManual: true`)
- Test: `backend/src/services/__tests__/darkvision.e2e.test.ts`

**Interfaces:**
- `export async function darkvisionSquares(sheet: unknown, gameSystem: string | null): Promise<number | null>` — null when not 5e or no compendium race; else the Global Constraints value.
- `export async function syncDarkvision(characterId: string): Promise<number>` — writes `sightRadius` on every token of the character with `sightRadiusManual: false`; returns how many changed; emits the token updates.

- [ ] **Step 1: Failing tests:** a dwarf (`anao`) placed on a map → token sightRadius 12; a drow subrace (36 m) → 24; a human → 0; a sheet without a compendium race → untouched; Review Focus 2; dwarf → human by sheet edit → 0; two tokens of the same character on two maps both update.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/services/__tests__/darkvision.e2e.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus the token and character route tests it touches → PASS. Backend tsc.
- [ ] **Step 5: Commit** — "Give a 5e character's tokens their race's darkvision".

### Task 4: A torch in hand lights the token

**Files:**
- Create: `backend/src/services/itemLight.ts`
- Modify: `backend/src/services/inventory.ts` (`equipItem` calls the sync after a successful write; token placement also calls it)
- Test: `backend/src/services/__tests__/itemLight.e2e.test.ts`

**Interfaces:**
- `export function itemLightFor(inventory: Item[]): TokenLight | null` (pure; Global Constraints table; `source: 'item'`, `itemId`).
- `export async function syncItemLight(characterId: string): Promise<void>` — for each token of the character: if its light is `manual`, skip; else set `itemLightFor(...)` (null clears); write only when it changes; broadcast like Task 2.

- [ ] **Step 1: Failing tests:** torch to `main` → token light 4/8 `source: 'item'`; Review Focus 3 (main→off: still lit, no extra write; stow → null; manual light untouched); torch + hooded lantern → 6/12; a hand-typed "Tocha velha" in hand → 4/8; `lanterna-furta-fogo` → no light; placing a token of a character already holding a torch → lit.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/services/__tests__/itemLight.e2e.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `inventory.e2e.test.ts` → PASS. Backend tsc.
- [ ] **Step 5: Commit** — "Light a character's token while a torch or lantern is in hand".

### Task 5: New map defaults, the "Escuro" switch and drawing token lights

**Files:**
- Modify: `backend/src/routes/maps.ts` (map creation defaults only), `frontend/src/components/campaign/GmLightControls.tsx` (an "Escuro" switch bound to the map's `globalIllumination`, inverted), the client's light drawing and vision (`drawLights.ts`, `map/vision.ts`: use `effectiveLights` with own tokens + `tokenLights`; remove the cosmetic own-token glow), i18n
- Test: `backend/src/routes/__tests__` (map create defaults), `frontend/src/components/campaign/__tests__/GmLightControls.test.tsx`, a client vision test that a `tokenLights` entry lights the ground

**Interfaces:**
- "Escuro" on → `globalIllumination: false` through the existing map update path.

- [ ] **Step 1: Failing tests:** creating a map → `lightingEnabled`, `fogEnabled`, `explorationEnabled`, `globalIllumination` all true; Review Focus 5 (an existing map row with lighting off is unchanged; an imported map keeps its values); the "Escuro" switch sends `globalIllumination: false` and reflects it; the client vision computes a lit area from a `tokenLights` entry; no glow is drawn for a token without light.
- [ ] **Step 2: Run** the new tests → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus the existing map, lighting and vision client tests → PASS. Both typechecks.
- [ ] **Step 5: Commit** — "Start new maps ready for lighting, add the dark switch and draw token lights".

### Task 6: The token's "Luz" menu

**Files:**
- Modify: the token context menu (desktop right-click and compact long-press; find where token menu items are built), socket helper for `token.light.set`, i18n
- Test: a token menu test file next to the existing token menu tests

**Interfaces:**
- "Luz" submenu for the GM on any token and for a player on tokens they control: "Nenhuma", "Vela" 1/2, "Tocha" 4/8, "Lampião" 3/6, "Lanterna" 6/12, "Personalizar…" (bright, dim, colour; same limits); the current one checked; an item light shows "(tocha na mão)" next to it. Refusals show like other token refusals.

- [ ] **Step 1: Failing tests:** the GM picks "Tocha" → emits `token.light.set { light: { brightRadius: 4, dimRadius: 8, color: '#ffcc66', source: 'manual' } }`; "Nenhuma" → `light: null`; a player sees "Luz" only on their own token; custom validates bright ≤ dim.
- [ ] **Step 2: Run** them → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus existing token menu tests → PASS. Frontend tsc.
- [ ] **Step 5: Commit** — "Add a light choice to the token menu".

### Task 7: Walls, light and fog panels in the theme

**Files:**
- Modify: `GmWallControls.tsx`, `GmLightControls.tsx`, `GmFogControls.tsx` (and their small subcomponents)
- Test: their existing tests; a test that none of the three uses `stone-`/`slate-`/`amber-`/`orange-`/`violet-`/`emerald-` palette classes for chrome (data swatches excepted)

- [ ] **Step 1: Failing test** for the palette classes.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** with the theme classes the other GM panels use (light and dark themes); wall-type and light colours that are data stay.
- [ ] **Step 4: Run** the three panels' tests → PASS. Frontend tsc. Look at the three panels in the browser in both themes.
- [ ] **Step 5: Commit** — "Dress the walls, light and fog panels in the table's theme".

### Task 8: The done-when session

**Files:**
- Create: `backend/src/websocket/__tests__/p7.integration.test.ts`

- [ ] **Step 1: Write the test** following the spec's "Pronto quando": a new map with walls (a room with a closed door) and a campfire; "Escuro" on; a dwarf, a human and a third character placed (compendium races, skipped when `/compendio/data` is absent) → the dwarf sees 12 squares, the human sees only the lit room; the human equips a torch → their token is lit and they see around them; behind the closed door nothing reaches either player until the GM opens it.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/websocket/__tests__/p7.integration.test.ts` → PASS (fix the owning task's code, not the test).
- [ ] **Step 3: Commit** — "Play the P7 done-when session end to end".
