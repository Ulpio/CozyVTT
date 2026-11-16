# P5b — Salvaguardas, vários alvos e áreas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The action bar resolves saving-throw spells and monster save actions (breath weapons), several targets (chosen one by one, by ray, or caught by a BG3-style area template the server measures), lets each player roll their own character's save from a pending prompt that survives reloads, tracks monster recharge, and covers the PHB's 3rd–9th level spells.

**Architecture:** P5a's server-resolves-everything model, extended. Pure rules gain area geometry (shared byte-for-byte with the client, like the vision files), save rolls and a monster save-action reader. The action card stored in `Message.metadata` (type `CHARACTER_ACTION`) becomes the pending record: each target carries its save state, and new socket events roll a pending save, roll the rest (GM), undo one target, and roll/reset a recharge. New resolver code lives in new files under `backend/src/services/actionResolver/` so `actionResolver.ts` (770 lines) does not grow much.

**Tech Stack:** Node/Express/Prisma 7/Socket.IO (backend, Jest), React 19 + Zustand + Tailwind 4 + i18next (frontend, Vitest).

**Spec:** `docs/superpowers/specs/2026-11-16-p5b-salvaguardas-e-areas-design.md` (builds on `docs/superpowers/specs/2026-11-15-p5a-barra-de-acoes-design.md`; roadmap P5).

## Global Constraints

- Every P5a Global Constraint still binds (see `docs/superpowers/plans/2026-11-15-p5a-barra-de-acoes.md`): no AC/HP/hit chance of a GM token to a player except HP under `showHpBar`; bonuses and dice only from stored sheet / stat block / compendium; act only through a controlled token; everything undoable by the GM; distances and metres→feet as in P5a; old sheets and hand-made NPCs keep working (every new field optional); no book text in git; i18n pt-BR and en, frontend tests in English; commits authored as CheekyChinchilla with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer; the same test commands (never the whole backend suite).
- The client sends, for a P5b action, only `{ mapId, actorTokenId, actionId, mode, slotLevel?, targetTokenIds?, area? }` where `area = { anchor: { x, y }, aim?: { x, y } }` in map pixels. The server decides who is in the area.
- A player's client never receives a GM token's save bonus, save total, AC, HP, nor anything about a target it is not sent (spec anti-goal: "nenhuma área pode revelar ao jogador que há algo escondido dentro dela").
- Save: d20 + save bonus; advantage/disadvantage as P5a's d20; **no** automatic success or failure on natural 20 or 1; success when total ≥ DC.
- Character spell DC = 8 + proficiency + spellcasting modifier (`fifthEditionSpellSaveDC` in `backend/src/utils/rules/fifthEdition.ts`). Monster action DC = the DC in its text.
- Damage of a save effect is rolled **once** for all targets; failed save takes all of it; a successful save takes `floor(total / 2)` when `halfOnSave`, else 0. Each target's damage enters when its own save is rolled.
- Magic Resistance: a monster whose stat block has a trait named "Resistência à Magia" rolls with advantage against a compendium spell cast by a character, never against a monster action. Combined with a disadvantage the player or GM picked, they cancel as P5a.
- The area catches every token, no deselection, that is: on the token layer whose `layer` equals the caster's; not `type: 'object'`; and has a sheet (`characterId` bound to a character of the campaign) or a `statBlock`. Allies, the caster (inside a sphere, cube or cylinder) and hidden tokens included. A cone's or line's own origin is not in it, so its caster is never caught.
- Square coverage: a grid square is in the area when its centre is inside the snapped template; a token is in when any square of its footprint is.
- 5e cone rule: `'width-equals-distance'` (what `MapCanvas.tsx` already passes for non-FANTASY_D20 systems).
- Rays: Eldritch Blast 1/2/3/4 beams at character level 1/5/11/17; Scorching Ray 3 + 1 per slot above 2nd; Magic Missile 3 darts + 1 per slot above 1st, auto-hit. A target may be picked by several rays.
- A pending save has no time limit; it ends by the owner's roll, the GM's "roll the rest", or an undo. The server accepts a save only from the GM or a user who controls that target (character owner or `controlledBy`), once per target.
- Monster tokens with `controlledBy` a player count as that player's for saves.
- Spells that stay "conjurar" (post text): Meteor Swarm, Prismatic Spray, Prismatic Wall, the drawn walls (Wall of Fire, Wall of Ice, Wall of Stone, Wall of Thorns, Wall of Force…), Delayed Blast Fireball, and random-effect spells; the curation lists each with a reason.

## Review Focus

1. Two players roll their pending saves for the same Fireball at the same moment → both damages apply, the card shows both, neither overwrites the other (Task 7 concurrency test; the card row is re-read inside the map lock).
2. A player's area hits a hidden goblin → the goblin takes damage, and the player's card, ack, `action.pendingSaves` reply and history route contain no trace of it: no entry, no count in "waiting for N saves" that includes it (Task 6 projection test, Task 7 e2e).
3. The GM undoes one target, then later undoes everything → the first target is not restored twice; pending saves of other targets disappear from their owners' prompts (Task 7 test).
4. The actor's map changes between preview and click (a token moved into the cone after the preview) → the server's coverage wins and the card lists what the server measured; the client never sends target ids for an area action, and an `area` request with `targetTokenIds` is refused (Task 7 test).
5. A player reloads the page with a save pending from a message older than the loaded chat page → the prompt still appears (Task 9 store test over `action.pendingSaves`).

---

### Task 1: Shared area geometry

**Files:**
- Move: `frontend/src/components/campaign/map/aoeGeometry.ts` → `frontend/src/utils/aoeGeometry.ts` (update every import; its test moves to `frontend/src/utils/__tests__/aoeGeometry.test.ts`)
- Create: `frontend/src/utils/areaGeometry.ts`, `backend/src/utils/aoeGeometry.ts` and `backend/src/utils/areaGeometry.ts` (byte-identical copies)
- Modify: `backend/src/utils/__tests__/visionParity.test.ts` (add `'aoeGeometry.ts'`, `'areaGeometry.ts'` to the list and a line to its comment)
- Test: `backend/src/utils/__tests__/areaGeometry.test.ts`

**Interfaces:**
- Produces (`areaGeometry.ts`, imports only `./aoeGeometry`):
  - `type AreaShape = 'sphere' | 'cylinder' | 'cube' | 'cone' | 'line'`
  - `interface AreaSpec { shape: AreaShape; sizeFt: number; widthFt?: number }` (`sizeFt` = radius for sphere/cylinder, side for cube, length for cone/line; `widthFt` line only, default 5)
  - `interface GridRules { gridSize: number; feetPerSquare: number; coneRule: ConeRule }`
  - `interface PxRect { x: number; y: number; width: number; height: number }`
  - `type PlacedArea = { kind: 'circle'; centre: Pt; radius: number } | { kind: 'rect'; x: number; y: number; size: number } | { kind: 'polygon'; points: Pt[] }`
  - `placeAreaAtPoint(spec: AreaSpec, anchor: Pt, aim: Pt | undefined, grid: GridRules): PlacedArea` — the same snapping and shapes `drawAoEOverlay` draws for a non-exact anchor (reuse `snapToSquareCentre`, `cubeRect`, `squareExitPoint`, `coneOutline`, `squaresFor`).
  - `placeAreaFromCaster(spec: AreaSpec, caster: PxRect, aim: Pt, grid: GridRules): PlacedArea` — cone/line emerging from the point where the ray from the caster's centre towards `aim` leaves `caster` (a generalised `squareExitPoint` for a W×H footprint; for 1×1 it equals `squareExitPoint`).
  - `squareInArea(area: PlacedArea, col: number, row: number, gridSize: number): boolean` — square centre inside (boundary counts as inside).
  - `rectInArea(area: PlacedArea, rect: PxRect, gridSize: number): boolean` — any grid square of the rect is in.
- `drawAoEOverlay` keeps drawing exactly as today; Task 8 adds a preview built on `placeArea*`.

- [ ] **Step 1: Write the failing tests** in `areaGeometry.test.ts` (grid 50 px, 5 ft):
  - `'a 20 ft sphere centred on an intersection covers the 8×8 squares around it, not the ninth ring'`: anchor (200,200) → `squareInArea` true for (0..7, 0..7), false for (8,4) and (4,8).
  - `'a 10 ft cube covers exactly two squares across'` → 4 squares in, neighbours out.
  - `'a 15 ft cone from a 1×1 caster aimed right covers 3 squares deep and never the caster square'`.
  - `'a 60 ft cone from a 3×3 dragon starts at its edge'`: caster rect (0,0,150,150) aimed at (1000,75) → square (3,1) in, (2,1) (inside the dragon) out.
  - `'a 30 ft × 5 ft line covers six squares in a row'`.
  - `'a 2×2 token is in when only one of its squares is'` via `rectInArea`.
  - `'placeAreaAtPoint matches drawAoEOverlay's cube rectangle'`: `placeAreaAtPoint({shape:'cube',sizeFt:10}, …)` equals `cubeRect(...)`.
- [ ] **Step 2: Run, expect FAIL** (`Cannot find module '../areaGeometry'`).
- [ ] **Step 3: Implement** `areaGeometry.ts` in frontend utils, move `aoeGeometry.ts`, copy both to backend utils, add both to `visionParity`.
- [ ] **Step 4: Run** backend `src/utils/__tests__/areaGeometry.test.ts src/utils/__tests__/visionParity.test.ts`, and frontend `src/utils/__tests__/aoeGeometry.test.ts src/components/campaign/map`. Expected: PASS. Frontend `tsc` clean (horror-d100 fixture error only).
- [ ] **Step 5: Commit** — "Measure an area's squares the same way on the server and the map".

### Task 2: Spell mechanics schema and text readers

**Files:**
- Modify: `backend/src/compendium/schemas.ts` (`SpellMechanics`; drop the `level <= 2` refine), `backend/src/compendium/__tests__/schemas.test.ts`
- Create: `backend/src/rules/actions/areaText.ts`
- Test: `backend/src/rules/actions/__tests__/areaText.test.ts`

**Interfaces:**
- Produces, `SpellMechanics` new optional fields:
  - `targetsPerSlot: z.number().int().min(1)` — extra targets per slot above the spell's level (Hold Person).
  - `rays: z.object({ count: z.number().int().min(1), perSlot: z.number().int().min(1).optional(), cantripLevels: z.boolean().optional() })` — one attack (or dart) per ray; `cantripLevels` = Eldritch Blast's 1/2/3/4.
  - `autoHit: z.boolean()` — no attack roll (Magic Missile).
  - `selfHeal: z.literal('half-damage')` — Vampiric Touch.
  - `area.width: z.string()` — line width text ("1,5 m").
  - `castOnly: z.string()` — the reason a spell stays "conjurar" (kept for the coverage test; the catalogue treats the spell as `'cast'`).
- `parseAreaText(area: { shape: string; size: string; width?: string }): AreaSpec | null` — Portuguese shapes: `esfera`→sphere, `cilindro`/`círculo`→cylinder, `cubo`/`quadrado`→cube, `cone`→cone, `linha`→line. Size text: `"6 m de raio"`, `"4,5 m"`, `"18 metros"`, `"3 m de lado"` → feet via `metresToFeet`. Unknown → null.

- [ ] **Step 1: Failing tests:** schema accepts a level-3 spell with `mechanics: { save: 'dex', damage: [{ dice: '8d6', type: 'fogo' }], halfOnSave: true, area: { shape: 'esfera', size: '6 m de raio' }, scaling: { perSlot: '1d6' } }`; accepts `rays`, `autoHit`, `castOnly`; `parseAreaText({shape:'esfera',size:'6 m de raio'})` → `{shape:'sphere',sizeFt:20}`; `{shape:'linha',size:'30 m',width:'1,5 m'}` → `{shape:'line',sizeFt:100,widthFt:5}`; `{shape:'quadrado',size:'3 m'}` → `{shape:'cube',sizeFt:10}`; `{shape:'hexágono',size:'3 m'}` → null.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `src/compendium src/rules/actions/__tests__/areaText.test.ts` → PASS.
- [ ] **Step 5: Commit** — "Let spell mechanics describe rays, extra targets and areas at every level".

### Task 3: Curate 3rd–9th level spells (git-ignored data)

**Files:**
- Modify (git-ignored): `materiais/.compendio/curation/21-spell-mechanics.json`, `materiais/.compendio/curation/21-spell-mechanics.js` (drop the `level > 2` throw)
- Create: `backend/src/compendium/__tests__/spellCoverage.test.ts` (skips when `materiais/.compendio/data/phb/spell.json` is absent, like P5a's monster coverage test)

**Interfaces:**
- Consumes: Task 2's schema fields.
- Produces: every PHB spell of level 3–9 has `mechanics` **or** `mechanics.castOnly` with a reason. Level 0–2 spells gain `rays`/`autoHit` where they need them (Eldritch Blast `rays: { count: 1, cantripLevels: true }`, Magic Missile `rays: { count: 3, perSlot: 1 }, autoHit: true`, Scorching Ray `rays: { count: 3, perSlot: 1 }`).

- [ ] **Step 1: Failing test** `spellCoverage.test.ts`: reads `data/phb/spell.json`; for each spell of level ≥ 3, expects `mechanics` to exist; lists the slugs that fail in the assertion message. Also: `bola-de-fogo` has `save: 'dex'`, `halfOnSave: true`, damage `8d6` fogo, area sphere 20 ft, `perSlot: '1d6'`; `relampago` (Lightning Bolt) line 100×5 ft; `imobilizar-pessoa` `save: 'wis'`, `targets: 1`, `targetsPerSlot: 1`, no damage; `toque-vampirico` `attack: 'melee'`, `selfHeal: 'half-damage'`; `chuva-de-meteoros` has `castOnly`. Use the slugs the data actually has (look them up in `spell.json`; the names above are the pt-BR book names).
- [ ] **Step 2: Run, expect FAIL** (213 slugs missing).
- [ ] **Step 3: Curate** by reading each spell's text in `materiais/.compendio/data/phb/spell.json` and adding its entry, using only what happens at cast time (spec: "a barra resolve só o que acontece ao conjurar"); repeats (Call Lightning, Sunbeam) give the first effect. Mass Cure Wounds / Mass Heal: `healing`, `targets: 6` and no `area` (spec). Chain Lightning: `targets: 4`. Re-run the curation script and the import exactly as P5a Task 3 did (curation scripts run against `/compendio` = `materiais/.compendio`; then `compendium:validate` and `compendium:import -- <dataDir> --force` in `cozyvtt-backend`). Never copy spell text into git.
- [ ] **Step 4: Run** `src/compendium/__tests__/spellCoverage.test.ts src/compendium` → PASS.
- [ ] **Step 5: Commit** only the test file — "Check every 3rd–9th level spell has mechanics or a reason to stay cast-only". Record the counts (with mechanics / cast-only) in the report.

### Task 4: Monster save actions, save riders and recharge

**Files:**
- Modify: `backend/src/rules/actions/monsterActions.ts`
- Test: `backend/src/rules/actions/__tests__/monsterActions.test.ts`, and the existing coverage test file (extend)

**Interfaces:**
- Produces:
  - `type Ability = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha'`
  - `interface SaveEffect { ability: Ability; dc: number; damage: { dice: string; type: string }[]; halfOnSave: boolean; extraText?: string }`
  - `MonsterAttack.onHitSave?: SaveEffect` — "Acerto: … e o alvo deve realizar um teste de resistência de Constituição CD 11, sofrendo 9 (2d8) de dano de veneno se falhar, ou metade desse dano se obtiver sucesso".
  - `interface MonsterSaveAction { save: SaveEffect; area?: AreaSpec; origin: 'self'; targets: 'one' | 'many'; rangeFeet?: number; recharge?: { min: number } }`
  - `parseMonsterSaveAction(name: string, description: string): MonsterSaveAction | null`
  - `parseRecharge(name: string): { min: number } | null` — `"(Recarrega 5–6)"`, `"(Recarga 5-6)"`, `"(Recarrega 6)"`.
  - Ability names: Força/str, Destreza/dex, Constituição/con, Inteligência/int, Sabedoria/wis, Carisma/cha. "teste de resistência de X CD N".
  - Area phrases: "num cone de 18 metros", "numa linha de 18 metros de comprimento e 1,5 metro de largura", "num raio de 6 metros", "esfera de 6 metros de raio", "cubo de 3 metros". Range for "a até 36 metros" → `rangeFeet`.

- [ ] **Step 1: Failing tests:** the Adult Red Dragon's "Sopro Flamejante (Recarrega 5–6)" text (write a paraphrased fixture in the test with the same structure — not the book's sentence) → `{ save: { ability:'dex', dc:21, damage:[{dice:'18d6',type:'fogo'}], halfOnSave:true }, area:{shape:'cone',sizeFt:60}, origin:'self', targets:'many', recharge:{min:5} }`; a line breath → line 60×5; a bite with a poison rider → `onHitSave` dc 11 con `2d8` veneno half; "Presença Aterradora"-shaped text (save, no damage, "a até 36 metros") → `targets:'many'`, `rangeFeet: 120`, damage `[]`; `parseRecharge('Sopro (Recarga 6)')` → `{min:6}`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Extend the MM coverage test: of the actions with "teste de resistência … CD", count how many `parseMonsterSaveAction` or `onHitSave` reads; assert the rest equal a named `KNOWN_SAVE_DEFECTS` list (as P5a did for attacks). Expect most of the 239.
- [ ] **Step 4: Run** `src/rules/actions` → PASS.
- [ ] **Step 5: Commit** — "Read monster breath weapons, save riders and recharge from the stat block text".

### Task 5: Saves and the catalogue

**Files:**
- Create: `backend/src/rules/actions/savingThrow.ts`
- Modify: `backend/src/rules/actions/catalogue.ts` (and `CompendiumSpell` there), `backend/src/services/actionResolver/catalogueFor.ts`
- Test: `backend/src/rules/actions/__tests__/savingThrow.test.ts`, `catalogue.test.ts`

**Interfaces:**
- Produces (`savingThrow.ts`):
  - `rollSave(bonus: number, mode: RollMode, rng?: Rng): { d20s: number[]; natural: number; total: number }`
  - `saveSucceeds(total: number, dc: number): boolean`
  - `characterSaveBonus(sheet: Sheet, ability: Ability): number` — `savingThrows.<long name>.bonus`, else the ability modifier (generalises P5a's `constitutionSave`, which then calls it).
  - `monsterSaveBonus(statBlock: Record<string, unknown> | null | undefined, ability: Ability): number` — `savingThrows[ability]` if present, else `attributeModifiers[ability]`, else from `abilities[ability]`, else 0.
  - `hasMagicResistance(statBlock): boolean` — a `traits[]` entry named "Resistência à Magia" (case/accent-insensitive).
  - `damageAfterSave(total: number, saved: boolean, halfOnSave: boolean): number`
- Produces (catalogue):
  - `ActionOption.resolution` gains `'save'`.
  - `ActionOption.targeting?: { kind: 'single' } | { kind: 'multi'; count: number; perSlot?: number; distinct: boolean } | { kind: 'area'; area: AreaSpec; origin: 'self' | 'point'; rangeFeet?: number }` (absent = P5a single target or none).
  - `ActionOption.recharge?: { min: number; spent: boolean }`; `ActionOption.saveAbility?: Ability`; `ActionOption.saveDc?: number` (character spells only — public to the caster; omitted on NPC options for players, who never get NPC options anyway).
  - `ResolvedActionSpec` gains `save?: SaveEffect`, `onHitSave?: SaveEffect`, `rays?: { count: number; perSlot?: number; cantripLevels?: boolean }`, `autoHit?: boolean`, `selfHeal?: 'half-damage'`, `source: 'spell' | 'monster' | 'weapon'` (for Magic Resistance).
  - `characterActions` builds save spells (DC from `fifthEditionSpellSaveDC`), multi/ray/area targeting from mechanics (`parseAreaText`; "Pessoal (cone…)" range → `origin: 'self'`; otherwise `'point'` with `rangeFeet` from the spell's range); `castOnly` spells stay `'cast'`. Eldritch Blast with `cantripLevels` → `count` 1/2/3/4 by `characterLevel`.
  - `npcActions` builds `'save'` options from `parseMonsterSaveAction` (option id `npc:save:<index>` style consistent with P5a ids) with `recharge.spent` read from the token (`token.rechargeSpent?: string[]` of option ids — pass the token or that list into `npcActions`/`catalogueFor`).

- [ ] **Step 1: Failing tests:** `rollSave(3,'normal',fixed(20))` total 23, and `saveSucceeds(4, 5)` false with natural 20 not special (`rollSave(-20,'normal',fixed(20))` total 0 → fails DC 5); `characterSaveBonus` reads the cleric fixture's `wisdom` save; `monsterSaveBonus` prefers `savingThrows`; `hasMagicResistance` on a stat block with that trait; `damageAfterSave(17,true,true)` = 8. Catalogue: a level-5 wizard fixture with Fireball (`compendiumRef` phb) → option `{ resolution:'save', saveAbility:'dex', saveDc: <8+prof+INT mod>, targeting:{kind:'area', area:{shape:'sphere',sizeFt:20}, origin:'point', rangeFeet:150} }`; Burning Hands → cone 15 ft `origin:'self'`; warlock level 5 Eldritch Blast → `targeting:{kind:'multi',count:2,distinct:false}`; Hold Person → `{kind:'multi',count:1,perSlot:1,distinct:true}`; Meteor Swarm → `'cast'`; an NPC stat block with a breath → `'save'` option with `recharge:{min:5,spent:false}`, and `spent:true` when its id is in `rechargeSpent`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Add `rechargeSpent?: string[]` to the backend `Token` (`websocket/shared.ts`) and the frontend token type; make sure the token update path keeps it GM-only on write, like `obscured`.
- [ ] **Step 4: Run** `src/rules/actions src/services/__tests__/actionResolver` → PASS (P5a tests unchanged).
- [ ] **Step 5: Commit** — "List save spells, rays, areas and breath weapons on the bar".

### Task 6: The card carries saves, and players see only what they may

**Files:**
- Modify: `backend/src/rules/actions/actionCard.ts`, `backend/src/services/actionMessages.ts`
- Test: `backend/src/rules/actions/__tests__/actionCard.test.ts`

**Interfaces:**
- Produces, `ActionCardTarget` new optional fields:
  - `controllerUserIds?: string[]` (GM-only; owner and `controlledBy`, set at resolve time)
  - `concealed?: boolean` (GM-only; true when `maskFor(token) === 'something-invisible'` at resolve time)
  - `save?: { ability: Ability; dc: number; bonus: number; status: 'pending' | 'rolled'; mode?: RollMode; advantageReason?: 'magic-resistance'; d20s?: number[]; total?: number; success?: boolean; rolledBy?: 'auto' | 'owner' | 'gm'; rolledAt?: string }`
  - `rays?: number` (how many rays/darts hit this target), `attacks?: AttackResult[]` (one per ray)
  - `undoneAt?: string` (per-target undo)
- `ActionCard` new optional: `save?: { ability: Ability; dc: number; halfOnSave: boolean }`, `damageRoll?: DamagePart[]` (the one roll for all), `area?: AreaSpec`, `recharge?: { tokenId: string; optionId: string }`.
- `UndoRecord` new optional: `recharge?: { mapId: string; tokenId: string; optionId: string }`.
- Player projection (`projectActionCard`): drops every target with `concealed`; never copies `controllerUserIds`, `save.bonus`; copies `save.dc` (the caster's DC is public), `status`, `success`, `mode`; copies `d20s`/`total` only when the target `isCharacter` or is controlled by a player; adds `yourSave: true` on a pending target whose `controllerUserIds` include the viewer; adds card-level `pendingSaves` = pending targets left after dropping concealed ones. GM view unchanged plus the new fields.

- [ ] **Step 1: Failing tests:** a card with a concealed goblin and a visible character → the player's projection has one target and `pendingSaves` counts only visible ones; JSON of the projection contains neither the goblin's id nor `"bonus"`; the owner gets `yourSave: true`, another player does not; a goblin's save shows `success` but no `total`; the GM sees everything.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** `src/rules/actions/__tests__/actionCard.test.ts src/services` → PASS.
- [ ] **Step 5: Commit** — "Carry each target's saving throw on the card, and keep concealed targets off players' cards".

### Task 7: Resolving saves, rays, areas, recharge and per-target undo

**Files:**
- Create: `backend/src/services/actionResolver/saves.ts` (save/area/multi resolution and the pending-save events), `backend/src/services/actionResolver/areaTargets.ts` (which tokens an area catches), `backend/src/services/actionResolver/recharge.ts`
- Modify: `backend/src/services/actionResolver.ts` (dispatch `'save'` and multi/ray requests to the new files; per-target undo and recharge restore in `undoAction`), `backend/src/validators/actions.ts`, `backend/src/websocket/handlers/actions.ts`, `backend/docs/WEBSOCKET_DOCUMENTATION.md`, `docs/ARCHITECTURE.md`
- Test: `backend/src/services/__tests__/actionResolver.saves.e2e.test.ts`, `backend/src/websocket/__tests__/actions.e2e.test.ts` (extend)

**Interfaces:**
- Consumes: Tasks 1, 4, 5, 6.
- Request: `ActionRequestSchema` gains `targetTokenIds: z.array(id).min(1).max(20).optional()` and `area: z.object({ anchor: point, aim: point.optional() }).optional()` (finite numbers). Refuse `'Invalid target'` when an area action gets `targetTokenIds` or a non-area action gets `area`.
- Produces (services):
  - `areaTargets(tokens: Token[], actor: Token, option: ActionOption & { targeting: { kind: 'area' } }, placement: { anchor: Pt; aim?: Pt }, map: MapRow): Token[]` — Global Constraints' catch rule; `OUT_OF_RANGE` when a `'point'` anchor is beyond `rangeFeet` from the actor (P5a distance, actor footprint to the anchor's square).
  - `resolveSaveAction(...)` inside P5a's `resolveAction` lock: spend slot / recharge, set concentration, roll damage once (with `scaling.perSlot`), build targets: monsters roll at once (Magic Resistance advantage when `source === 'spell'`) and take damage; characters and player-controlled monsters get `save.status: 'pending'`. Concentration checks (P5a rule) on each damaged concentrating character.
  - Rays: one `rollAttack` per ray against its target's AC (`autoHit` skips the roll), damage per ray; `targetTokenIds.length` must equal the ray count for the chosen slot / level.
  - Multi-target: up to `count + perSlot × (slot − level)` distinct ids.
  - Attack with `onHitSave`, and Vampiric Touch's `selfHeal`: on hit, as above.
  - `rollPendingSave(campaignId, requester, { messageId, targetTokenId, mode }, rng?)` — refuses `NOT_YOUR_TOKEN` unless GM or in `controllerUserIds`; `ALREADY_ROLLED` when not pending; `ALREADY_UNDONE` when the card or target is undone. Bonus from the stored sheet / stat block.
  - `rollRemainingSaves(campaignId, requester, { messageId }, rng?)` — GM only; rolls every pending target with `mode: 'normal'`, `rolledBy: 'gm'`.
  - `undoTarget(campaignId, requester, { messageId, targetTokenId })` — GM only; P5a rule per target (HP changed since → leave it, mark partial); a pending target just becomes undone.
  - `undoAction` also skips targets with `undoneAt`, cancels pending ones, and clears the recharge it spent.
  - `listPendingSaves(campaignId, requester): { messageId: string; card: PlayerActionCard | ActionCard }[]` — cards with a target pending for this requester (GM: every pending), projected.
  - `rollRecharge(campaignId, requester, { mapId, tokenId, optionId }, rng?)` — GM only; 1d6 ≥ min removes the id from `rechargeSpent`; posts a small chat message; `resetRecharge(...)` removes it without rolling.
  - Every write to a card re-reads its message **inside** `withMapsLocked([mapId])` before updating (as P5a `undoAction` does), so two concurrent saves never lose one.
- Socket events (each with an ack, a flood ceiling in the docs table `keepInStep` checks, and the same `announceUpdate` for card changes): `action.save`, `action.saveRemaining`, `action.undoTarget`, `action.pendingSaves`, `action.recharge`, `action.rechargeReset`. Ceilings: saves 10/s and 200/min; pendingSaves and recharge 20/s and 300/min.

- [ ] **Step 1: Failing e2e tests** (fixed rng; level-5 wizard fixture; goblins from the compendium stat block; a cleric player character):
  - `'Fireball catches the goblins, the hidden goblin and the cleric, and leaves the cleric's save pending'`: visible goblins take full or half by their auto saves; cleric's HP unchanged until `rollPendingSave` by its owner, then reduced; the GM card lists 4 targets, the caster's player card 3 (no hidden goblin), slot 3 spent.
  - `'a player cannot roll another player's pending save'`, `'a save is rolled once'`.
  - `'two owners roll their saves at once and both damages land'` (Promise.all).
  - `'roll the rest is GM only and finishes the card'`.
  - `'an area request with targetTokenIds is refused'`; `'an anchor beyond 150 ft is out of range'`.
  - `'Burning Hands from the caster does not catch the caster'`; `'a Fireball centred on the caster catches the caster'`.
  - `'a token on the spirit layer is not caught by a token-layer caster'`; `'an object token is not caught'`.
  - `'the red dragon's breath in a cone: monsters roll, the option becomes spent, recharge 5 brings it back'` (rng 5) and `'recharge 4 keeps it spent'`.
  - `'Scorching Ray at 3rd level needs four target ids and rolls four attacks; one target twice'`; `'Magic Missile darts always hit'`; `'Eldritch Blast at level 5 adds the sheet's +3 to each beam'`.
  - `'Hold Person posts pass/fail and no damage'`.
  - `'a spider bite that hits leaves the poison save pending on a character'`.
  - `'undo one target, then undo all: no double restore, the pending prompt is gone'`.
  - `'listPendingSaves gives the owner their pending card'`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement**, docs included (events, payloads, ceilings in `WEBSOCKET_DOCUMENTATION.md`; a P5b paragraph in `docs/ARCHITECTURE.md`).
- [ ] **Step 4: Run** `src/services/__tests__/actionResolver src/websocket/__tests__/actions.e2e.test.ts src/websocket/__tests__/socketCeilings.integration.test.ts src/rules/actions` → PASS; backend `tsc` clean.
- [ ] **Step 5: Commit** (one or more) — e.g. "Resolve save spells and breath weapons with pending player saves the GM can finish or undo".

### Task 8: Picking several targets and aiming an area

**Files:**
- Modify: `frontend/src/types/actions.ts`, `frontend/src/services/actions.service.ts`, `frontend/src/stores/actionStore.ts`, `frontend/src/utils/actionTargeting.ts`, `frontend/src/components/campaign/MapCanvas.tsx`, `frontend/src/components/campaign/map/layers/drawOverlays.ts` (an action-area preview), `frontend/src/components/campaign/actionBar/TargetingHint.tsx`, `frontend/src/i18n/*`
- Test: `frontend/src/stores/__tests__/actionStore.test.ts`, `frontend/src/utils/__tests__/actionTargeting.test.ts`

**Interfaces:**
- Consumes: Task 1 `placeAreaAtPoint`, `placeAreaFromCaster`, `rectInArea`; Task 5 option fields; Task 7 request shape.
- Produces (store): `pending` gains `picked: string[]` (multi/ray picks) and `area: { anchor: Pt; aim?: Pt } | null`; `pickTarget(tokenId)` (adds up to the count; when `distinct`, a second click on the same token removes it; never resolves by itself), `confirmPending()` (sends; refuses locally when fewer picks than needed for rays, allows 1..count for multi), `setAreaAim(p: Pt)`, `placeArea(p: Pt)` (a click fixes and resolves at once on desktop), and `targetsNeeded(pending): number` from the option and `slotLevel`/character level.
- `tokensInArea(tokens, actor, option, placement, map, grid): Token[]` in `actionTargeting.ts` — the preview's highlight over the tokens the client has, same catch rule.
- Behaviour: area option → the template follows the cursor (point areas) or turns around the caster (self areas); out-of-range anchors draw in the refusal colour and a click does nothing; Esc / right-click cancel (P5a). Multi/ray → the hint says "2 of 3"; Enter or the hint's "Confirm" button sends; Backspace removes the last pick. Compact (mobile) table: a tap aims, the hint's "Confirm" resolves.
- New i18n keys under `actionBar.targeting.*` (`pickCount`, `confirm`, `outOfRange`) and `actionBar.errors.*` for the new refusals.

- [ ] **Step 1: Failing tests:** store: a Scorching Ray at slot 3 needs 4 picks, `confirmPending` sends `targetTokenIds` with a repeat; Hold Person `distinct` toggles a second click off; an area option sends `{ area: { anchor, aim } }` and no `targetTokenIds`; utils: `tokensInArea` matches the server rule for a 20 ft sphere and skips object tokens.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** `src/stores/__tests__/actionStore.test.ts src/utils/__tests__/actionTargeting.test.ts src/components/campaign` → PASS; frontend `tsc` clean.
- [ ] **Step 5: Commit** — "Aim spell areas and pick several targets from the action bar".

### Task 9: Save prompts, save cards, recharge and per-target undo in the UI

**Files:**
- Create: `frontend/src/components/campaign/actionBar/SavePrompt.tsx` (the banner over the map), `frontend/src/stores/pendingSaveStore.ts`
- Modify: `frontend/src/components/campaign/chat/ActionCardMessage.tsx`, `frontend/src/components/campaign/actionBar/ActionBar.tsx` / `ActionButton.tsx` (recharge state), `DesktopTable`/`CompactTable` (mount the prompt), `frontend/src/i18n/*`
- Test: `frontend/src/components/campaign/chat/__tests__/ActionCardMessage.test.tsx`, `frontend/src/stores/__tests__/pendingSaveStore.test.ts`, `frontend/src/components/campaign/actionBar/__tests__/SavePrompt.test.tsx`

**Interfaces:**
- Consumes: Task 6 projected fields (`yourSave`, `pendingSaves`, `save`), Task 7 events.
- Produces: `usePendingSaveStore` with `load()` (asks `action.pendingSaves` on join and reconnect), `apply(card)` (from `chat.message.new` / `chat.message.updated`), `roll(messageId, targetTokenId, mode)`; the banner shows one row per pending save of the user ("Bola de Fogo de Merlin — Salvaguarda de Destreza CD 15", buttons Normal / Advantage / Disadvantage).
- Card: per target "passed/failed", the total when projected, damage taken; "waiting for N saves" while `pendingSaves > 0`; `yourSave` → the roll buttons inline; GM: "Roll the rest", per-target "Undo", "Undo all" (P5a's button).
- Bar: an option with `recharge.spent` shows "Roll recharge (5–6)" (GM) and a small "reset" control; not spent → normal button.

- [ ] **Step 1: Failing tests:** `pendingSaveStore` loads a pending card from `action.pendingSaves` (a message not in the chat page) and drops it when an update arrives with the save rolled or the card undone; `SavePrompt` sends `action.save` with the picked mode; `ActionCardMessage` shows "waiting for 2 saves", hides totals for a monster target, shows "Roll the rest" and per-target Undo only to the GM; the bar shows "Roll recharge (5–6)" for a spent breath.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** the three test files plus `src/components/campaign` → PASS; frontend `tsc` clean.
- [ ] **Step 5: Commit** — "Let players roll their pending saves and the GM finish, undo and recharge".

### Task 10: The done-when turn, end to end

**Files:**
- Create: `backend/src/services/__tests__/actionResolver.p5b.e2e.test.ts`

- [ ] **Step 1: Write the test** for the spec's "Pronto quando" list with fixed rng and numbers checked against the book (cite page numbers in comments, no book text): level-5 wizard Fireball on 3 goblins and the cleric (DC, 8d6, half on success, slot 3 spent, cleric pending then rolled by owner, undo all restores); Adult Red Dragon breath cone (DC 21, 18d6, half, recharge spent, recharge roll 6 restores); cleric Hold Person (DC, pass/fail, no damage); sorcerer Scorching Ray (3 rays, one target twice, 2d6 each); Eldritch Blast at warlock 5 (2 beams, +3 each). Plus a sample of five 3rd–9th level save spells from the catalogue resolving without refusal (Lightning Bolt, Cone of Cold, Ice Storm, Chain Lightning, Mass Cure Wounds).
- [ ] **Step 2: Run** → it should pass on the Tasks 1–9 code; a failure is a bug in those tasks: fix it there (with its own failing test) and note it in the report.
- [ ] **Step 3: Commit** — "Play the P5b done-when turn end to end".
