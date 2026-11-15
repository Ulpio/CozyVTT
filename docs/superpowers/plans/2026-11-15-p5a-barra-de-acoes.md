# P5a — Barra de ações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A bar under the session map, built from the character sheet or the NPC's stat block, where a player (or the GM, for monsters) picks an attack, healing spell or check, clicks a target token, and the server rolls, compares against AC, applies HP, spends the slot and posts a per-role card in chat that the GM can undo.

**Architecture:** The server resolves every action (spec, Abordagem 1). Pure rule modules under `backend/src/rules/actions/` (distance, d20 attack, damage, range text, monster text parser, action catalogue, card projection) feed one service, `services/actionResolver.ts`, which a new socket handler `websocket/handlers/actions.ts` calls. The card is a `Message` of type `CHARACTER_ACTION` whose metadata holds the GM view plus the undo record; every send (live and history) goes through `projectActionCard`. The frontend only asks for the action list, enters a targeting mode, and renders cards.

**Tech Stack:** Node/Express/Prisma/Socket.IO (backend, Jest), React 19 + Zustand + Tailwind 4 + i18next (frontend, Vitest).

**Spec:** `docs/superpowers/specs/2026-11-15-p5a-barra-de-acoes-design.md` (roadmap: `docs/superpowers/specs/2026-11-14-mesa-roadmap-design.md`, P5).

## Global Constraints

- A player's client never receives a GM token's AC, HP or hit chance — not in the card, the action list, the ack, nor the history route — except HP when that token's `showHpBar` is on (spec: "se o mestre ligou a barra de PV daquele monstro, o cartão mostra os PV"). AC and hit chance: never.
- The client sends only `{ mapId, actorTokenId, actionId, targetTokenId?, mode, slotLevel?, grip? }`. Bonus and dice always come from the stored sheet / stat block / compendium.
- A requester may act only through a token they control: GM any; a player when the token's `characterId` is a character they own, or `controlledBy` is them. A target must be a token the requester is sent today (`filterTokensByRole` + `tokensSentTo`); otherwise refuse with `'Invalid target'` without saying whether it exists.
- Everything the app changes is undoable by the GM.
- Distances in feet: `squares × map.feetPerSquare`; squares between nearest edges, diagonals by `map.diagonalRule` (`'flat'` = 1 each; `'alternating'` = 1,2,1,2…). Metres from text → feet as `m / 1.5 * 5`.
- Attack: d20 + bonus; `'advantage'` 2d20 keep highest, `'disadvantage'` keep lowest; natural 20 always hits and is a critical (double the dice, not the modifier); natural 1 always misses; hit when total ≥ AC.
- Monster state: `'unharmed'` (current = max), `'wounded'` (current > max/2), `'badly-wounded'` (0 < current ≤ max/2), `'down'` (0). pt-BR: ileso / ferido / muito ferido / caído.
- Concentration DC = `max(10, floor(damage / 2))`.
- Damage takes temporary HP first (reuse `applyHitPointChange` in `backend/src/utils/rules/hitPoints.ts`); healing never exceeds max and never restores temporary HP.
- Old sheets and hand-made NPCs keep working: every new field is optional.
- No book text in git: curation stays in `materiais/.compendio/curation` (git-ignored).
- All new UI text in `frontend/src/i18n` pt-BR and en; frontend tests run in English.
- Small upstream-code changes allowed; say why in the commit. Commits authored as CheekyChinchilla with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer.
- Tests: backend `bash C:/Users/Usuario/AppData/Local/Temp/claude/44e4d72f1b5153f0/90da892d-7ec9-477b-8e57-853a2ce536d7/scratchpad/berepo.sh --runInBand --forceExit <paths>` (never the whole suite); frontend `docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 <paths>`; typecheck `npx tsc --noEmit -p .` in each package (the known horror-d100 fixture error is pre-existing). After a Prisma migration: `migrate deploy` on dev and `cozyvtt_test`, then `docker restart cozyvtt-backend`.

## Review Focus

1. A player sends `action.resolve` for a token they don't control, or with a target id of a hidden / other-plane / out-of-sight token → refused the same way as a missing token (Task 6 tests).
2. Two actions land on the same monster at once (two players clicking together) → both HP changes apply, neither is lost; tokens JSON is written under the map lock (Task 6 test with two concurrent resolves).
3. GM undoes an action after the target's HP changed again → HP left alone, slot and concentration restored, card says so (Task 6 test).
4. A sheet edited by hand (attack with no `compendiumRef`, no `range`, damage text like `"1d8+3 + 1d6"`) → still a working bar button; unparseable damage refuses with a readable message instead of throwing (Task 3 test).
5. Player reloads the page → history cards come back projected for that player, with no AC/HP inside the metadata (Task 6 history-route test).

---

### Task 1: Distance, range text and d20 core

**Files:**
- Create: `backend/src/rules/actions/distance.ts`, `backend/src/rules/actions/rangeText.ts`, `backend/src/rules/actions/attackRoll.ts`, `backend/src/rules/actions/types.ts`
- Modify: `backend/src/utils/dice-parser.ts` (injectable random source)
- Test: `backend/src/rules/actions/__tests__/distance.test.ts`, `rangeText.test.ts`, `attackRoll.test.ts`

**Interfaces:**
- Produces:
  - `type RollMode = 'normal' | 'advantage' | 'disadvantage'`
  - `type Rng = (sides: number) => number` (returns 1..sides)
  - `rollDice(expression: string, rng?: Rng): RollResult` — existing function, new optional `rng` defaulting to today's `Math.random` die.
  - `tokenDistanceFeet(a: Footprint, b: Footprint, map: { feetPerSquare: number; diagonalRule: string }): number` where `Footprint = { x: number; y: number; width: number; height: number }` in grid squares (token `size` defaults to 1×1).
  - `parseRangeText(text: string): { kind: 'self' } | { kind: 'touch' } | { kind: 'feet'; normal: number; long?: number } | null` — accepts `"Pessoal"`, `"Toque"`, `"36 metros"`, `"1,5 m"`, `"24/96 m"`, `"alcance 3 m"`, `"distância 24/96 m"`.
  - `metresToFeet(m: number): number` = `m / 1.5 * 5`, rounded to the nearest 5.
  - `rollAttack(bonus: number, mode: RollMode, rng?: Rng): { d20s: number[]; natural: number; total: number }`
  - `attackHits(roll, ac): { hit: boolean; critical: boolean }`
  - `hitChance(bonus: number, ac: number, mode: RollMode): number` (0..1, nat-1/nat-20 rules included)
  - `rollDamage(expression: string, critical: boolean, rng?: Rng): { total: number; breakdown: RollResult }` — critical doubles each dice term's count, not flat modifiers.

- [ ] **Step 1: Write the failing tests**

```ts
// distance.test.ts
const flat = { feetPerSquare: 5, diagonalRule: 'flat' };
it('adjacent medium tokens are 5 ft apart', () => expect(tokenDistanceFeet({x:0,y:0,width:1,height:1},{x:1,y:0,width:1,height:1},flat)).toBe(5));
it('a large ogre next to a medium target is 5 ft away', () => expect(tokenDistanceFeet({x:0,y:0,width:2,height:2},{x:2,y:1,width:1,height:1},flat)).toBe(5));
it('flat diagonal counts one square each', () => expect(tokenDistanceFeet({x:0,y:0,width:1,height:1},{x:3,y:3,width:1,height:1},flat)).toBe(15));
it('alternating diagonal counts 5 then 10', () => expect(tokenDistanceFeet({x:0,y:0,width:1,height:1},{x:3,y:3,width:1,height:1},{feetPerSquare:5,diagonalRule:'alternating'})).toBe(20));
// rangeText.test.ts
it.each([['Pessoal',{kind:'self'}],['Toque',{kind:'touch'}],['36 metros',{kind:'feet',normal:120}],['1,5 m',{kind:'feet',normal:5}],['24/96 m',{kind:'feet',normal:80,long:320}]])('%s', (t, r) => expect(parseRangeText(t)).toEqual(r));
it('unknown text is null', () => expect(parseRangeText('Visão')).toBeNull());
// attackRoll.test.ts
const seq = (...v: number[]) => { let i = 0; return () => v[i++]; };
it('advantage keeps the highest', () => expect(rollAttack(5,'advantage',seq(4,17)).total).toBe(22));
it('natural 20 hits and crits against any AC', () => expect(attackHits({d20s:[20],natural:20,total:25},40)).toEqual({hit:true,critical:true}));
it('natural 1 misses against AC 1', () => expect(attackHits({d20s:[1],natural:1,total:11},1)).toEqual({hit:false,critical:false}));
it('hit chance +5 vs AC 15 is 55%', () => expect(hitChance(5,15,'normal')).toBeCloseTo(0.55));
it('critical doubles dice only', () => expect(rollDamage('1d8+3',true,seq(4,6)).total).toBe(13));
```

- [ ] **Step 2: Run them, expect FAIL (modules missing)**
- [ ] **Step 3: Implement the four modules and the `rng` parameter** (thread `rng` through `rollDie` → `rollDiceTerm` → `rollDice`; no behaviour change when omitted).
- [ ] **Step 4: Run the new tests plus `utils/__tests__/dice-parser*` — PASS**
- [ ] **Step 5: Commit** `Add the distance, range and d20 rules the action bar resolves with`

### Task 2: Monster action parser

**Files:**
- Create: `backend/src/rules/actions/monsterActions.ts`
- Test: `backend/src/rules/actions/__tests__/monsterActions.test.ts`, `backend/src/rules/actions/__tests__/monsterActions.db.test.ts`

**Interfaces:**
- Consumes: `parseRangeText`, `metresToFeet` (Task 1).
- Produces:
  - `interface MonsterAttack { kind: 'melee' | 'ranged'; bonus: number; reachFeet?: number; normalFeet?: number; longFeet?: number; damage: { dice: string; type: string }[]; extraText?: string }`
  - `parseMonsterAction(description: string): MonsterAttack | null`

- [ ] **Step 1: Failing tests** — goblin "Cimitarra" text → `{kind:'melee',bonus:4,reachFeet:5,damage:[{dice:'1d6 + 2',type:'cortante'}]}`; "Arco Curto" → `normalFeet:80,longFeet:320`; wolf "Mordida" keeps `extraText` starting `"Se o alvo for uma criatura"`; a two-damage text "Acerto: 7 (1d10 + 2) de dano perfurante mais 7 (2d6) de dano de veneno." → two damage parts; "Ataque Corpo-a-Corpo ou à Distância com Arma" → `kind:'melee'` with `reachFeet` and `normalFeet/longFeet`; plain prose ("O dragão usa sua Presença Aterradora") → `null`.
- [ ] **Step 2: Run, expect FAIL**
- [ ] **Step 3: Implement** (regex on the pt-BR book shape: `Ataque (Corpo-a-Corpo|à Distância|Corpo-a-Corpo ou à Distância) com (Arma|Magia): ([+-]\d+) para atingir`, `alcance X m`, `distância X/Y m`, `Acerto: N (dice) de dano TYPE` and following `mais N (dice) de dano TYPE`; everything after the damage sentence is `extraText`).
- [ ] **Step 4: DB coverage test** (`monsterActions.db.test.ts`, runs against `cozyvtt_test` after `compendium:import` has run there; if the table is empty the test skips with a message): for every `CreatureTemplate` action whose description contains `"para atingir"`, `parseMonsterAction` is not null; log the count. Expected: 100% of those parse.
- [ ] **Step 5: Run both, PASS; commit** `Read monster attacks from the book's text`

### Task 3: Action catalogue for characters and NPCs (+ schema fields)

**Files:**
- Create: `backend/src/rules/actions/catalogue.ts`
- Modify: `backend/src/compendium/schemas.ts` (`SpellMechanics.healingAddsModifier: z.boolean().optional()`), `backend/src/validators/game-systems/fifthEdition.schema.ts` (`concentratingOn: z.object({ name: shortText.min(1), compendiumRef: compendiumRefSchema.optional() }).nullable().optional()` at the sheet root), the matching frontend sheet type in `frontend/src/types`, `materiais/.compendio/curation/21-spell-mechanics.json` (git-ignored: `healingAddsModifier: true` on Curar Ferimentos and Palavra Curativa, and any other 0–2 healing spell whose text adds the modifier), then re-run curation and `compendium:import`.
- Test: `backend/src/rules/actions/__tests__/catalogue.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2; P4's sheet shape (`attacks[]` with `additionalDamage` label `'Duas mãos'` for versatile, `spellcasting.spells[]`, `cantripRefs`, `compendiumRef`).
- Produces:
  - `type ActionId = string` — `attack:<index>`, `attack:<index>:thrown`, `spell:<bookId>/<slug>`, `npc:<list>:<index>` (`list` ∈ actions|bonusActions|reactions).
  - `interface ActionOption { id: ActionId; name: string; group: 'attack' | 'spell' | 'npc'; resolution: 'attack' | 'heal' | 'cast' | 'post'; spellLevel?: number; concentration?: boolean; grips?: ('one' | 'two')[]; reach?: { kind: 'self' | 'touch' } | { kind: 'feet'; normal: number; long?: number }; }` — the client-safe shape (no AC/HP; for the GM's NPCs bonus/dice may be shown: include `summary?: string` only for NPC options).
  - `interface ResolvedActionSpec { option: ActionOption; attackBonus?: number; damage: { dice: string; type?: string }[]; versatileDamage?: { dice: string; type?: string }; healing?: { dice: string; addModifier: boolean }; scaling?: { perSlot?: string; cantrip?: boolean }; extraText?: string; description?: string }` — server-only.
  - `characterActions(sheet: FifthEditionCharacterData, spells: Map<string, CompendiumSpell>, weapons: Map<string, CompendiumWeapon>): ResolvedActionSpec[]` (map keys `bookId/slug`)
  - `npcActions(statBlock: NpcStatBlock): ResolvedActionSpec[]`
  - `spellcastingModifier(sheet): number`, `characterLevel(sheet): number`
- Rules pinned here: attack index order = `sheet.attacks` order; a weapon with `arremesso` and a compendium `normalRange` also yields `attack:<i>:thrown` with the thrown range; a weapon with no range is melee 5 ft, 10 ft with `alcance`; `additionalDamage` lines labelled `'Duas mãos'` become `versatileDamage` and `grips:['one','two']`, others add; spells resolve `'attack'` when `mechanics.attack`, `'heal'` when `mechanics.healing`, else `'cast'`; an attack cantrip already present in `attacks[]` (same `compendiumRef`) is listed once, as the spell; NPC options with a parsed attack resolve `'attack'`, others `'post'`.

- [ ] **Step 1: Failing tests** — using the P4 fixture sheets (`frontend/src/utils/guidedCreation/__tests__/fixtures/` sheets, read as `guidedSheets.test.ts` already does): fighter → `attack:0` Espada longa with `grips:['one','two']`; wizard → `spell:<book>/raio-de-fogo` resolution `'attack'`; cleric → `spell:<book>/curar-ferimentos` `'heal'` with `addModifier:true`; a hand-made sheet `{attacks:[{name:'Clava',attackBonus:3,damageRoll:'1d4+1'}]}` → melee 5 ft; an attack whose `damageRoll` is `'muito'` → option present but `damage: []` and resolver refuses (Task 5); goblin stat block → two `'attack'` options and none `'post'`.
- [ ] **Step 2: Run, FAIL**
- [ ] **Step 3: Implement, add schema fields, update curation and re-import**
- [ ] **Step 4: Run catalogue tests + `compendium` schema tests + `guidedSheets.test.ts` — PASS**
- [ ] **Step 5: Commit** `List what a character or NPC can do from its sheet or stat block`

### Task 4: The action card and who sees what

**Files:**
- Create: `backend/src/rules/actions/actionCard.ts`
- Test: `backend/src/rules/actions/__tests__/actionCard.test.ts`

**Interfaces:**
- Produces:
  - `interface ActionCardTarget { tokenId: string; name: string; maskedName?: 'something' | 'something-invisible'; isCharacter: boolean; ownerUserId?: string; showHpBar: boolean; ac: number; hitChance?: number; hpBefore: number; hpAfter: number; hpMax: number; temp?: number; attack?: { d20s: number[]; natural: number; total: number; hit: boolean; critical: boolean }; damage?: { total: number; type?: string; breakdown: string }[]; healing?: number; concentrationCheckDc?: number; }`
  - `interface ActionCard { kind: 'action'; actor: { tokenId: string; name: string; maskedName?: ...; userId?: string }; actionName: string; mode: RollMode; disadvantageReason?: 'long-range'; slotLevel?: number; targets: ActionCardTarget[]; extraText?: string; undo: UndoRecord; undoneAt?: string; undoPartial?: boolean }`
  - `interface UndoRecord { hp: { tokenId: string; characterId?: string; before: { current: number; temp: number }; after: { current: number; temp: number } }[]; slot?: { characterId: string; level: number }; concentration?: { characterId: string; before: unknown; after: unknown } }`
  - `type Viewer = { role: 'GM' | 'PLAYER' | 'SPECTATOR'; userId: string }`
  - `projectActionCard(card: ActionCard, viewer: Viewer): PlayerActionCard | ActionCard` — GM gets the card unchanged; anyone else gets `PlayerActionCard`: no `undo`, no `ac`, no `hitChance`, no `extraText` when the actor is a GM NPC; per target `hp` only if `isCharacter && (ownerUserId === viewer.userId || showHpBar)` or `!isCharacter && showHpBar`, else `state: MonsterState`; names replaced by `maskedName` when set.
  - `monsterState(current: number, max: number): 'unharmed' | 'wounded' | 'badly-wounded' | 'down'`

- [ ] **Step 1: Failing tests** — player projection of a goblin hit has no key named `ac`, `hitChance`, `hpBefore`, `hpAfter`, `undo` anywhere (deep key scan); with `showHpBar:true` it has `hp`; owner sees own character's HP, another player doesn't unless `showHpBar`; masked actor shows `maskedName`; GM projection deep-equals input; `monsterState(7,7)='unharmed'`, `(4,7)='wounded'`, `(3,7)='badly-wounded'`, `(0,7)='down'`.
- [ ] **Step 2: FAIL; Step 3: implement; Step 4: PASS**
- [ ] **Step 5: Commit** `Decide what each reader sees of an action card`

### Task 5: The resolver service

**Files:**
- Create: `backend/src/services/actionResolver.ts`
- Modify: `backend/src/routes/maps.ts` (export `resendSoonIfCurrent`, `resendInitiativeFor`, `withMapsLocked` if not exported — no behaviour change; commit says why)
- Test: `backend/src/services/__tests__/actionResolver.e2e.test.ts` (DB-backed, `cozyvtt_test`)

**Interfaces:**
- Consumes: Tasks 1–4; `filterTokensByRole`, `tokensSentTo`, `getSpiritVisibility` (`utils/spirit-layer.ts`); `applyHitPointChange` (`utils/rules/hitPoints.ts`); `emitCharacterUpdated` (`websocket/utils.ts`).
- Produces:
  - `interface ActionRequest { mapId: string; actorTokenId: string; actionId: ActionId; targetTokenId?: string; mode: RollMode; slotLevel?: number; grip?: 'one' | 'two'; replaceConcentration?: boolean }`
  - `type ResolveOutcome = { ok: true; messageId: string; card: ActionCard } | { ok: false; error: string; code?: 'needs-concentration-confirm' }`
  - `resolveAction(campaignId: string, requester: Viewer, req: ActionRequest, rng?: Rng): Promise<ResolveOutcome>`
  - `listActions(campaignId: string, requester: Viewer, mapId: string, actorTokenId: string): Promise<ActionOption[] | { error: string }>`
  - `undoAction(campaignId: string, requester: Viewer, messageId: string): Promise<{ ok: true; card: ActionCard; partial: boolean } | { ok: false; error: string }>`
  - `rollConcentration(campaignId: string, requester: Viewer, messageId: string, targetTokenId: string, rng?: Rng): Promise<{ ok: true; total: number; dc: number; kept: boolean } | { ok: false; error: string }>`
- Behaviour pinned:
  - Refusals (exact strings): `'Not your token'`, `'Invalid target'`, `'Out of range'`, `'No spell slot of that level'`, `'This action cannot be resolved'` (no damage dice parsed), `'Already undone'`, `'GM only'`.
  - Range: target beyond `long` (or beyond `normal` with no `long`) refused; between normal and long → mode combined with disadvantage (`advantage`+`disadvantage` = `normal`), `disadvantageReason:'long-range'`; touch = 5 ft; self = actor only.
  - Slot: `cast`/`attack`/`heal` of a leveled spell spends `spellcasting.slots[slotLevel].expended += 1` (slotLevel ≥ spell level, default spell level); cantrips spend nothing; damage/heal scales `perSlot × (slotLevel − level)`; cantrip dice × tier (1/2/3/4 at char level 1/5/11/17).
  - Concentration: a concentration spell when `concentratingOn` is set and `!replaceConcentration` → `{ok:false, code:'needs-concentration-confirm'}`; otherwise set `concentratingOn`. A character target taking damage while `concentratingOn` gets `concentrationCheckDc`.
  - Healing: `dice (+ spellcastingModifier if addModifier)`, up to max.
  - HP writes: character → sheet `hp` via the same path as `character.hp.update` then `emitCharacterUpdated`; NPC token → `token.hp` in `Map.tokens` inside `withMapsLocked([mapId])`, then `resendSoonIfCurrent` + `resendInitiativeFor`. A token with no HP (`hp` absent, no character) → damage reported, nothing applied.
  - Writes a `Message` `{ type: 'CHARACTER_ACTION', userId: requester.userId, content: '<actor> → <target>: <action>', metadata: card }` and returns its id. All writes in one transaction where Prisma allows (sheet + message); the token write is under the map lock.
  - Undo (GM only): if every target's current HP equals its `after`, restore `before`; else leave HP, restore slot/concentration, `partial: true`. Sets `undoneAt`.
  - Concentration roll: owner or GM; d20 + CON save bonus from the sheet vs the card's DC; failure clears `concentratingOn`; posts its own small card.

- [ ] **Step 1: Failing tests** (seeded `rng`; a campaign with GM, two players, a fighter sheet from the P4 fixtures, a goblin NPC token AC 15 HP 7): hit applies 1d8+3 to goblin HP; nat 20 doubles; player resolving for the other player's token → `'Not your token'`; target hidden (`visible:false`) → `'Invalid target'`; target 200 ft away with a longsword → `'Out of range'`; shortbow at 100 ft → disadvantage with reason; cleric Curar Ferimentos at slot 2 heals `2d8+WIS` and `expended` of slot 2 goes 0→1; concentration confirm code; two concurrent `resolveAction` on the same goblin both land (HP drops by both); undo restores HP; undo after a manual HP change is partial; spectator → `'Not your token'`; history-safety: the stored metadata is the GM card (checked again in Task 6).
- [ ] **Step 2: FAIL; Step 3: implement; Step 4: PASS**
- [ ] **Step 5: Commit** `Resolve bar actions on the server: roll, compare, apply, record` (body: why a non-GM's action may now change a GM token's HP)

### Task 6: Socket events and the history route

**Files:**
- Create: `backend/src/websocket/handlers/actions.ts`, `backend/src/validators/actions.ts`
- Modify: `backend/src/websocket/events.ts` (register), `backend/src/routes/campaigns.ts` (chat history: project `CHARACTER_ACTION` metadata with `projectActionCard` for the requester), `docs/` API/socket docs where the project lists events
- Test: `backend/src/websocket/__tests__/actions.e2e.test.ts`, `backend/src/routes/__tests__/` chat history test for projection

**Interfaces:**
- Consumes: Task 5.
- Produces socket events (all with the project's ack pattern `ackFrom` / `refuseRequest`, `withinCeiling`, spectators refused):
  - `action.list` `{ mapId, actorTokenId }` → ack `{ options: ActionOption[] }`
  - `action.resolve` `ActionRequest` → ack `{ ok, messageId? , error?, code? }`; each campaign socket receives `chat.message` with the message whose `metadata` is `projectActionCard(card, thatSocketViewer)` (same per-reader loop as `handlers/chat.ts`).
  - `action.undo` `{ messageId }` → GM only; re-emits `chat.message.updated` `{ id, metadata }` projected per reader.
  - `action.concentration` `{ messageId, targetTokenId }` → ack result; posts a card the same way.
- Zod: `ActionRequestSchema` (ids ≤ 64 chars, `actionId` ≤ 200, `mode` enum, `slotLevel` 1–9, `grip` enum).

- [ ] **Step 1: Failing tests** — two player sockets + GM socket: after a goblin hit, the player's received `chat.message.metadata` has no `ac`/`hitChance`/`undo` (deep scan) and the GM's has them; `GET /api/campaigns/:id/messages` as a player returns the same projected metadata; as GM the full one; undo by a player → refused `'GM only'`; malformed payload → refused by Zod.
- [ ] **Step 2: FAIL; Step 3: implement; Step 4: PASS** (run the new tests plus the existing chat-history and dice e2e tests)
- [ ] **Step 5: Commit** `Send bar actions over the socket, each reader their own card`

### Task 7: Frontend action service, store and targeting mode

**Files:**
- Create: `frontend/src/services/actions.service.ts`, `frontend/src/stores/actionStore.ts`, `frontend/src/utils/actionTargeting.ts` (frontend copy of `tokenDistanceFeet` + `parseRangeText` result handling, for highlighting only)
- Modify: `frontend/src/services/socket.ts` (emit helpers), `frontend/src/components/campaign/MapCanvas.tsx` (targeting mode: when `actionStore.pending` is set, token click calls `resolvePending(tokenId)` instead of selecting; cursor `crosshair`; in-range tokens get a highlight ring, others dimmed; Esc / right click cancel)
- Test: `frontend/src/stores/__tests__/actionStore.test.ts`, `frontend/src/utils/__tests__/actionTargeting.test.ts`, a MapCanvas targeting test next to the existing MapCanvas tests

**Interfaces:**
- Produces:
  - `useActionStore`: `{ pending: { actorTokenId: string; option: ActionOption; slotLevel?: number; grip?: 'one'|'two' } | null; mode: RollMode; begin(p): void; cancel(): void; setMode(m): void; resolvePending(targetTokenId?: string): Promise<{ ok: boolean; error?: string; code?: string }> }` — `'self'` reach resolves immediately on `begin` with no target; `needs-concentration-confirm` opens a confirm and re-sends with `replaceConcentration: true`.
  - `actionsService.list(mapId, actorTokenId): Promise<ActionOption[]>`, `.resolve(req)`, `.undo(messageId)`, `.concentration(messageId, targetTokenId)`
  - `tokensInReach(actor: Token, tokens: Token[], reach, map): Set<string>` (long range counts as in reach).

- [ ] **Step 1: Failing tests** — store: `begin` then `cancel` clears pending; `resolvePending` sends exactly `{mapId, actorTokenId, actionId, targetTokenId, mode, slotLevel, grip}` (no bonus/dice keys); targeting: adjacent goblin in reach of a 5 ft melee option, 30 ft one not; MapCanvas: with pending set, clicking a token calls `resolvePending` and does not change `selectedTokenId`; Esc clears pending.
- [ ] **Step 2: FAIL; Step 3: implement; Step 4: PASS**
- [ ] **Step 5: Commit** `Pick a bar action's target on the map`

### Task 8: The action bar

**Files:**
- Create: `frontend/src/components/campaign/actionBar/ActionBar.tsx`, `ActionButton.tsx`, `SpellMenu.tsx`, `ChecksMenu.tsx`, `useBarActor.ts`, `useActionOptions.ts`
- Modify: `frontend/src/components/campaign/DesktopTable.tsx` (bar as a row under the three-panel `<main>` group), `frontend/src/components/campaign/compact/BottomBar.tsx` + `CompactTable.tsx` (an "Ações" entry opening the bar in a `BottomSheet`), `frontend/src/i18n` pt-BR/en (`actionBar.*`)
- Test: `frontend/src/components/campaign/actionBar/__tests__/ActionBar.test.tsx`, `useBarActor.test.ts`

**Interfaces:**
- Consumes: Task 7; `getCharacterRolls` (`utils/characterRolls.ts`) and `buildNpcRolls` (`utils/npcRolls.ts`) for the Checks menu, sent through the existing dice roll path with the bar's mode applied (`withAdvantage` / `withDisadvantage`).
- Produces: `useBarActor(): { token: Token; kind: 'character' | 'npc' } | null` — player: their character's token on the current map (several → the one chosen by portrait, remembered per campaign in `localStorage` wrapped in try/catch); GM: the selected token, else null.
- UI pinned (spec "Onde fica"): portrait + name + HP/AC of the actor on the left (only the actor's own numbers); attack buttons inline; "Magias", "Itens", "Testes" open menus; mode toggle Normal / Vantagem / Desvantagem on the right. Spell menu grouped by circle, cantrips first, each circle showing `remaining/total` slots; a leveled spell asks the circle (only circles ≥ spell level with a free slot enabled); versatile weapon asks "Uma mão / Duas mãos"; a `'cast'` spell posts and spends without targeting; a `'post'` NPC action posts its text. "Itens" lists inventory items whose name matches an attack (they reuse that attack) — other items are listed disabled with no action in P5a. No bar outside a campaign or for spectators.

- [ ] **Step 1: Failing tests** — renders the fighter's Espada longa button and clicking it begins targeting with that option; wizard's spell menu shows cantrips first and circle 1 as `4/4`; a circle with 0 free is disabled; GM with no selection sees no bar; GM selecting the goblin sees Cimitarra and Arco curto; Checks menu "Atletismo" sends a dice roll with the bar's advantage mode applied.
- [ ] **Step 2: FAIL; Step 3: implement; Step 4: PASS** (plus the existing DesktopTable / CompactTable tests and the `themeTokens` test — use theme tokens only)
- [ ] **Step 5: Commit** `Show the action bar under the map`

### Task 9: Action cards in chat

**Files:**
- Create: `frontend/src/components/campaign/ActionCardMessage.tsx`
- Modify: `frontend/src/components/campaign/ChatMessage.tsx` (`CHARACTER_ACTION` with `metadata.kind === 'action'` renders the card; other `CHARACTER_ACTION` messages unchanged), the chat store / socket listener for `chat.message.updated`, i18n `actionCard.*`
- Test: `frontend/src/components/campaign/__tests__/ActionCardMessage.test.tsx`

**Interfaces:**
- Consumes: the projected card shapes from Task 4 (mirror the types in `frontend/src/types`), `actionsService.undo` / `.concentration`.
- UI pinned: header "Ator → Alvo · Ação"; attack line (total, the d20s, "Acertou / Errou / Crítico!", "desvantagem: longe" when set); damage per type; healing; target line — HP when present, else the state word; GM extra: "contra CA X", "chance N%", "PV a → b", extra monster text, "Desfazer" button (hidden after undo; the card shows "Desfeito" / "Desfeito em parte: os PV mudaram depois"); "Teste de concentração (CD x)" button for the target's owner and the GM.

- [ ] **Step 1: Failing tests** — a player card renders "Goblin: muito ferido" and no "CA"; a GM card renders "CA 15", "55%" and a Desfazer button that calls `undo(messageId)`; after `chat.message.updated` with `undoneAt` the button is gone and "Desfeito" shows; concentration button visible to the owner only.
- [ ] **Step 2: FAIL; Step 3: implement; Step 4: PASS**
- [ ] **Step 5: Commit** `Show bar results as cards in chat`

### Task 10: One turn per class, checked against the book

**Files:**
- Create: `backend/src/services/__tests__/actionResolver.classes.e2e.test.ts`
- Test only (plus fixes in earlier tasks' code if it finds bugs)

- [ ] **Step 1: Write the test** — for each of the 12 P4 fixture sheets, place its token next to a goblin (AC 15, HP 7) and an ally; with a seeded `rng`, resolve its first weapon attack, and where the class has one, an attack cantrip or attack spell and a healing spell; assert bonus and damage expressions equal the book's (the fixture's `attacks[].attackBonus`/`damageRoll`; Raio de Fogo `1d10`, `+` spell attack; Curar Ferimentos `1d8 + mod`), slot spent, HP changed. Then the goblin's Cimitarra against the fighter (AC from the sheet): +4, 1d6+2, applied to the sheet HP.
- [ ] **Step 2: Run; fix any failure at its source task's code; PASS**
- [ ] **Step 3: Commit** `Play one bar turn for every class against a goblin`

### Task 11: Real-app check (controller)

- [ ] In the dev app with a GM and a player account (local test credentials only): player selects the P4 cleric, attacks the goblin with the warhammer, casts Curar Ferimentos on themself at circle 1; GM selects the goblin and attacks the cleric; GM undoes one action. Check: player chat shows no AC/HP of the goblin; GM card shows them; HP bars and the sheet move; slots go down; reload keeps the cards projected. Screenshot desktop and compact widths.
