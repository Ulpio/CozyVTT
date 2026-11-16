# P5c — Economia do turno e botões de característica Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In combat the action bar knows whose turn it is and what each combatant has spent (action, bonus action, reaction, movement), locks what is spent, and offers the PHB class and subclass features of levels 1–5 as buttons with counted uses, plus short and long rests; the combat state survives a server restart.

**Architecture:** The in-memory combat state (`backend/src/websocket/initiativeState.ts`) keeps its synchronous API but is written through to a new Prisma table and loaded at boot; each combatant gains a per-turn spend record. The pure economy rules live in a new shared `utils/turnEconomy.ts` (byte-identical in backend and frontend, like `areaGeometry.ts`), so the server enforces and the bar greys out with the same code. Class features get a declarative `mechanics.action` block curated in git-ignored `materiais/` (like spell mechanics in P5b); one engine in `backend/src/services/actionResolver/features.ts` resolves them. Spent uses and active states live on the character sheet.

**Tech Stack:** Node/Express/Prisma 7/Socket.IO (backend, Jest), React 19 + Zustand + Tailwind 4 + i18next (frontend, Vitest).

**Spec:** `docs/superpowers/specs/2026-11-16-p5c-economia-e-caracteristicas-design.md` (builds on the P5a and P5b specs in the same folder; roadmap P5).

## Global Constraints

- Every P5a and P5b Global Constraint still binds (see their plans in this folder): no AC/HP/bonus/recharge of a GM token to a player; act only through a controlled token; everything the app applies is undoable by the GM; no book text in git; i18n pt-BR and en, frontend tests in English; commits authored as `CheekyChinchilla <154020855+CheekyChinchilla@users.noreply.github.com>` with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer, subjects as plain sentences; never run the whole backend suite (use the scratchpad `berepo.sh` with explicit paths).
- **Spec correction (ruling):** the spec says the sheet has `classes` (class, subclass, level). It does not: the 5e sheet has a single `class`, `level`, and `origin.class` / `origin.subclass` (`compendiumRef {bookId, slug}`). Features are found from `origin.class`/`origin.subclass` and `level`; a sheet without `origin.class` tries the compendium class whose `name` equals `sheet.class` (accent/case-insensitive) in an enabled book; no match → no feature buttons.
- The lock applies **only** when the campaign's combat is `active` **and** the actor token is in `combatants`. Otherwise the bar behaves exactly as after P5b.
- Turn rule: when `currentTokenId` becomes X (start, next, removal of the current one), X's `action`, `bonus`, `reaction`, `movedFeet`, `dashes`, `extraActions`, `attacksLeft`, `attackActionTaken` reset; `oncePerTurn` is cleared for **every** combatant. A combatant added mid-fight starts fresh. Ending combat deletes all spend records and ends every `state` feature (Rage).
- Off-turn, only options whose cost is `reaction` pass, plus melee weapon attacks, which then cost the reaction (opportunity attack).
- Attack action: the first weapon attack spends the action and leaves `attacksLeft = attacksPerAction − 1`; `attacksPerAction = 1 + Σ passive.extraAttacks` of the actor's features (Extra Attack at 5th level → 2). Any other `action`-cost option sets `attacksLeft = 0`. Monsters (NPC actors) get `attacksLeft = 99` after their first attack (Multiattack honour system).
- Extra action (Action Surge): an `action` cost with `action` already spent consumes one `extraActions` instead.
- Movement budget = speed × (1 + dashes); speed is the sheet's `speed` (feet), or the first number of a stat block's speed (metres ×10/3 → feet, rounded to 5) for monsters. Shown in metres as `ft × 0.3` with one decimal dropped when whole ("6 de 9 m").
- Movement counts only for the combatant whose turn it is, with `footprintDistanceFeet` between the 1×1 start and end squares (map's `feetPerSquare` and `diagonalRule`). Over budget: one GM whisper per turn, never a block.
- Error copy (pt-BR, the `error` string of the ack): "Você já usou a ação neste turno.", "Você já usou a ação bônus neste turno.", "Você já usou a reação.", "Não é a sua vez.", "Sem usos restantes.", "Não dá para descansar durante o combate.", "Uma vez por turno.". English keys in i18n for the client copies.
- Rests: short = resources with `recovers: 'short'` back, warlock (`origin.class.slug === 'bruxo'` or class name "Bruxo") spell slots back, hit dice offered (existing `character.hitdice.spend`). Long = HP to maximum, temporary HP 0, every slot back, every resource back, `max(1, floor(total/2))` hit dice back per `hitDice` row (capped at its maximum), every active state ended. Refused while combat is active.
- A player never receives another character's or any monster's spend record; `initiative.state` carries `spend` only for combatants the viewer controls (GM: all).
- Feature ids: `feature:<bookId>/<classOrSubclassSlug>/<action.key>`. Resource keys are per character (`rage`, `ki`, …) and shared across features that spend them.
- Fighting styles are already baked into attack rows by guided creation (`frontend/src/utils/guidedCreation/classRules.ts`); `passive` covers only `extraAttacks` and `critMin`. Do not add fighting-style numbers again.

## Review Focus

1. The server restarts mid-turn after the rogue used Sneak Attack and the fighter spent his action → after boot `initiative.state` shows the same round and turn, the fighter's action is still spent, and Sneak Attack is still refused this turn (Task 1 hydrate test, Task 13 e2e).
2. Two attack requests from the same fighter arrive at once with `attacksLeft = 1` → exactly one passes; the economy read-modify-write happens under the campaign's combat lock (Task 4 concurrency test).
3. The GM undoes an attack card after the turn moved on → HP and the rider's slot come back, the action does not (Task 4 test); undo in the same turn gives the action back.
4. A player listens to `initiative.state` while a goblin acts → the payload has no `spend` for the goblin nor for the other player's character (Task 1 projection test).
5. A level 3 character from an older sheet without `origin.class` but `class: "Ladino"` → Sneak Attack appears; a homebrew class name → no feature buttons, no error (Task 6 test).

---

### Task 1: Combat state in the database, with a spend record per combatant

**Files:**
- Modify: `backend/prisma/schema.prisma`; Create: `backend/prisma/migrations/20261116120000_combat_state/migration.sql`
- Modify: `backend/src/websocket/initiativeState.ts`, `backend/src/websocket/handlers/initiative.ts`, server boot (where sockets are set up, `backend/src/websocket/index.ts` or `server.ts`)
- Test: `backend/src/websocket/__tests__/combatPersistence.integration.test.ts`, existing initiative tests

**Interfaces:**
- Prisma: `model CombatState { campaignId String @id; state Json; updatedAt DateTime @updatedAt; campaign Campaign @relation(..., onDelete: Cascade) }` (a back-relation on `Campaign`).
- `TurnSpend { action: boolean; bonus: boolean; reaction: boolean; movedFeet: number; dashes: number; extraActions: number; attacksLeft: number; attackActionTaken: boolean; oncePerTurn: string[]; overBudgetWarned: boolean }`; `freshSpend(): TurnSpend`.
- `CombatState` gains `spend: Record<string /*tokenId*/, TurnSpend>`.
- `setState` stays synchronous and queues a write-through (per-campaign promise chain; the newest version wins). New: `hydrateCombatStates(): Promise<void>` (boot, loads every row into the map), `flushCombatWrites(campaignId?): Promise<void>` (tests and shutdown), `withCombatLock<T>(campaignId, fn: (state) => Promise<T> | T): Promise<T>` (serialises economy read-modify-write per campaign; used by Tasks 4, 5, 8).
- `beginTurn(state, tokenId): CombatState` (pure, applies the turn rule from Global Constraints); `initiative.start`, `initiative.next` and removal of the current combatant call it; `initiative.add` mid-fight gives the new one `freshSpend()`; `initiative.end`/`clearState` delete the row.
- `projectCombatState(state, tokens, isGM, viewerControls?: (tokenId) => boolean)`: GM keeps all `spend`; a player keeps only entries where `viewerControls` is true.
- New GM-only socket event `combat.restore { tokenId: string; what: 'action' | 'bonus' | 'reaction' | 'movement' | 'attack' }` → sets that part back to fresh (`attack`: `attacksLeft += 1`), broadcasts `initiative.state`. Ceiling `gmEvent` like the initiative ones; docs row "GM only"; a payload in `gmOnlyEvents.integration.test.ts`.

- [ ] **Step 1: Failing tests:** start combat with A, B → row exists, `spend[A]` fresh; mark `spend[A].action = true`, `flushCombatWrites`, clear the in-memory map, `hydrateCombatStates()` → `getState` returns round 1, current A, `spend[A].action === true`; `next` → `spend[B]` reset and every `oncePerTurn` empty; a player projection while it is the goblin's turn has no `spend.goblin` and no `spend` of the other player's token, the GM projection has all; `combat.restore {what:'action'}` from a player is refused, from the GM resets it; `end` deletes the row.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Run `npx prisma migrate dev --name combat_state` inside the backend container (or hand-write the SQL with that folder name) and regenerate the client.
- [ ] **Step 4: Run** `src/websocket/__tests__/combatPersistence.integration.test.ts src/websocket/__tests__/gmOnlyEvents.integration.test.ts` plus every test file matching `initiative` under `src/websocket` → PASS. Update `backend/docs/WEBSOCKET_DOCUMENTATION.md` (event table and flood-ceiling table) and run `scripts/websocket-events.py` if it checks the table.
- [ ] **Step 5: Commit** — "Keep the combat order, the turn and each combatant's spending in the database".

### Task 2: Shared turn-economy rules

**Files:**
- Create: `frontend/src/utils/turnEconomy.ts` and a byte-identical `backend/src/utils/turnEconomy.ts`
- Modify: `backend/src/utils/__tests__/visionParity.test.ts` (add the pair)
- Test: `frontend/src/utils/__tests__/turnEconomy.test.ts`

**Interfaces:**
- `type ActionCost = 'action' | 'bonus' | 'reaction' | 'none' | 'attack'` (`attack` = a weapon attack under the Attack action).
- `type EconomyRefusal = 'action-spent' | 'bonus-spent' | 'reaction-spent' | 'not-your-turn' | 'once-per-turn'`
- `canSpend(spend: TurnSpend, cost: ActionCost, ctx: { yourTurn: boolean; meleeWeapon?: boolean; oncePerTurnKey?: string }): { ok: true; as: ActionCost } | { ok: false; refusal: EconomyRefusal }` — off-turn: `reaction` passes if unspent; an `attack` with `meleeWeapon` passes as `reaction`; anything else `not-your-turn`. On turn: `attack` passes if `attacksLeft > 0` or the action (or an extra action) is free.
- `applySpend(spend, as: ActionCost, ctx: { attacksPerAction: number; oncePerTurnKey?: string }): TurnSpend` (pure; rules from Global Constraints).
- `movementBudgetFeet(speedFeet: number, spend): number`; `feetToMetresLabel(feet: number): string` ("9", "4,5").
- `TurnSpend`/`freshSpend` move here (Task 1 imports them from `utils/turnEconomy`).
- `REFUSAL_MESSAGES: Record<EconomyRefusal, string>` with the pt-BR copy from Global Constraints (server ack text).

- [ ] **Step 1: Failing tests:** on turn, `attack` with fresh spend → ok as `attack`, `applySpend(...,{attacksPerAction:2})` → `action: true, attacksLeft: 1, attackActionTaken: true`; second `attack` → ok, `attacksLeft: 0`; third → `action-spent`; with `extraActions: 1` the third passes and consumes it; an `action` after one attack sets `attacksLeft: 0`; off-turn `bonus` → `not-your-turn`, off-turn melee `attack` → ok as `reaction`, a second → `reaction-spent`; `oncePerTurnKey` already listed → `once-per-turn`; `movementBudgetFeet(30, {dashes:1})` = 60; `feetToMetresLabel(30)` = "9", `feetToMetresLabel(15)` = "4,5".
- [ ] **Step 2: Run** `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run src/utils/__tests__/turnEconomy.test.ts` → FAIL.
- [ ] **Step 3: Implement**, copy to backend, add to the parity test.
- [ ] **Step 4: Run** the frontend test and `src/utils/__tests__/visionParity.test.ts` → PASS.
- [ ] **Step 5: Commit** — "Write the turn-economy rules once for the server and the bar".

### Task 3: Every bar option has a cost, and the common actions join the bar

**Files:**
- Modify: `backend/src/rules/actions/catalogue.ts`
- Test: `backend/src/rules/actions/__tests__/catalogue.test.ts`

**Interfaces:**
- `ActionOption` gains `cost: ActionCost`, `castingTime?: string` (spells), `combatUnavailable?: true` (casting time of 1 minute or more), `meleeWeapon?: true`.
- `ActionOption.group` gains `'common'`. Common options: `common:dash`, `common:disengage`, `common:dodge`, `common:help`, `common:hide`, resolution `'post'`, cost `'action'`, names "Disparada", "Desengajar", "Esquivar", "Ajudar", "Esconder". Task 8 adds `common:<x>:bonus` variants.
- `costFromCastingTime(text: string): { cost: ActionCost; combatUnavailable?: true }` — "1 ação" → action, "1 ação bônus" → bonus, "1 reação…" → reaction, anything in minutes/hours → `{ cost: 'action', combatUnavailable: true }`.
- Weapon attack options: `cost: 'attack'`, `meleeWeapon` when not `:thrown` and the weapon is not ranged (compendium weapon properties/category; sheet row without weapon → melee when its reach is not a range pair). NPC: `actions` → `'attack'` for attack resolutions, `'action'` otherwise; `bonusActions` → `'bonus'`; `reactions` → `'reaction'`.
- `characterActions` and `npcActions` return the common options too (for NPCs as well).

- [ ] **Step 1: Failing tests:** Fireball cost `action`; Healing Word cost `bonus`; Shield cost `reaction`; a ritual with "10 minutos" → `combatUnavailable`; a longsword row `cost:'attack', meleeWeapon:true`; its `:thrown` sibling (handaxe) not melee; a goblin bonus action → `bonus`; the five common options present for a character and an NPC.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** Frontend `ActionOption` type mirrors the new fields.
- [ ] **Step 4: Run** `src/rules/actions src/services/__tests__/actionResolver.e2e.test.ts` → PASS.
- [ ] **Step 5: Commit** — "Give every bar option its cost in the turn, and add the common actions".

### Task 4: The resolver enforces the economy, and undo gives the action back in the same turn

**Files:**
- Create: `backend/src/services/actionResolver/economy.ts`
- Modify: `backend/src/services/actionResolver.ts`, `backend/src/services/actionResolver/saves.ts`, `backend/src/services/actionResolver/undo.ts`, `backend/src/rules/actions/actionCard.ts`
- Test: `backend/src/services/__tests__/actionResolver.economy.e2e.test.ts`

**Interfaces:**
- `checkAndSpend(campaignId, actor: Token, option: ActionOption, opts: { attacksPerAction: number; oncePerTurnKey?: string }): Promise<{ ok: true; economy?: EconomyUndo } | { ok: false; error: string }>` — inside `withCombatLock`; no-op `{ ok: true }` when the lock does not apply; broadcasts `initiative.state` after a change.
- `UndoRecord` gains `economy?: { campaignId: string; tokenId: string; round: number; before: TurnSpend }`. Undo restores `before` only when the combat is still active, `round` matches and `currentTokenId` is still that token (or the spend was a reaction taken in that same round); otherwise leaves the economy alone.
- `listActions` adds `combat?: { yourTurn: boolean; spend: TurnSpend; attacksPerAction: number; budgetFeet: number }` to its reply for the actor (the reply becomes `{ options, combat? }`; update `action.list` ack, `actionsService.list` and `useActionOptions` accordingly). Common options resolve as `'post'` cards; Dash also increments `dashes`.
- Spend happens before the roll and inside the same flow as the slot spend; a refused resolve spends nothing.

- [ ] **Step 1: Failing tests** (direct service calls, like the P5b e2e): with combat active and the fighter current: attack 1 ok, attack 2 refused "Você já usou a ação neste turno."; the goblin (not current) casting an action spell refused "Não é a sua vez."; the goblin's melee attack off-turn ok once, then "Você já usou a reação."; two concurrent attacks with `attacksLeft: 1` → exactly one ok; undo in the same turn → `spend.action` false again; `next` then undo of the earlier card → HP back, action stays spent; no combat → the same calls pass as before; Dash raises the budget reply to 60 ft.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.**
- [ ] **Step 4: Run** `src/services/__tests__/actionResolver.economy.e2e.test.ts src/services/__tests__/actionResolver.e2e.test.ts src/services/__tests__/actionResolver.saves.e2e.test.ts src/services/__tests__/actionResolver.p5b.e2e.test.ts src/websocket/__tests__/actions.e2e.test.ts` → PASS.
- [ ] **Step 5: Commit** — "Refuse what a combatant already spent this turn, and give it back on an undo in the same turn".

### Task 5: Counting movement on the current combatant's turn

**Files:**
- Modify: `backend/src/websocket/handlers/tokens.ts` (`token.move.end`), the REST token update in `backend/src/routes/maps.ts`; Create: `backend/src/services/combatMovement.ts`
- Test: `backend/src/websocket/__tests__/combatMovement.integration.test.ts`

**Interfaces:**
- `recordMove(campaignId, mapId, token: Token, from: {x,y}, to: {x,y}, map: { feetPerSquare: number; diagonalRule: string }): Promise<void>` — when the lock applies and `token.id === currentTokenId`, adds `footprintDistanceFeet` (1×1 squares) to `movedFeet` under `withCombatLock`, broadcasts `initiative.state`; when `movedFeet` first exceeds the budget this turn, sets `overBudgetWarned` and posts a GM whisper (pattern of `actionResolver/recharge.ts`): "<nome> andou X m de Y m neste turno." Called after the map write commits; failures are logged, never undo the move.
- `speedFeetFor(token: Token, sheet: Sheet | null): number` (Global Constraints rule; 30 when nothing is readable).

- [ ] **Step 1: Failing tests:** combat active, fighter current, speed 30, flat diagonal: move 3 squares → `movedFeet 15`; move 4 more → 35, one GM whisper, no player receives it; a further move → no second whisper; a non-current token moves → nothing counted; no combat → nothing; the REST update path counts too.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** the new test and `src/websocket/__tests__/obscuredMover.integration.test.ts src/websocket/__tests__/events.integration.test.ts` → PASS.
- [ ] **Step 5: Commit** — "Count the metres a combatant walks on their turn and tell the GM when they go over".

### Task 6: Feature mechanics schema, the actor's features and uses on the sheet

**Files:**
- Modify: `backend/src/compendium/schemas.ts` (validate `mechanics.action` when present), `backend/src/validators/game-systems/fifthEdition.schema.ts`, `frontend/src/types/game-systems/*` (5e sheet type), `backend/src/services/actionResolver/catalogueFor.ts`
- Create: `backend/src/rules/actions/features.ts`
- Test: `backend/src/rules/actions/__tests__/features.test.ts`, `backend/src/compendium/__tests__/schemas.test.ts`, the sheet type-parity test

**Interfaces:**
- `ByLevel<T> = Record<string, T>` (value for the highest key ≤ class level).
- `FeatureAction` (zod, in `schemas.ts`):
  - `key: string` (slug), `kind: 'addDamage' | 'state' | 'heal' | 'extraAction' | 'makeBonus' | 'attacks' | 'passive' | 'use' | 'none'`, `cost?: ActionCost` (default `'none'`), `reason?: string` (required for `none`)
  - `resources?: { key: string; max: number | 'classLevel' | 'proficiency' | { ability: Ability; min?: number } | { perLevel: number } | ByLevel<number>; recovers: 'short' | 'long' | ByLevel<'short' | 'long'> }[]` (declares a pool)
  - `spends?: { key: string; amount?: number /*default 1*/; chosen?: true /*Lay on Hands*/ }`
  - `dice?: ByLevel<string>`, `addAbility?: Ability | 'best-str-dex'`, `addClassLevel?: true` (heal and attacks)
  - `oncePerTurn?: true`, `filter?: { melee?: true; ranged?: true; finesseOrRanged?: true; strength?: true }`
  - `slot?: { base: string; perSlot: string; maxDice: number }` (Divine Smite)
  - `damageBonus?: ByLevel<number>`, `stateName?: string` (state)
  - `attacks?: { count: number; unarmedDice: ByLevel<string>; requiresAttackAction?: true }`
  - `makeBonus?: ('dash' | 'disengage' | 'hide')[]`, `passive?: { extraAttacks?: number; critMin?: number }`
- Sheet: `featureUses?: Record<string /*resource key*/, number /*spent*/>`, `activeStates?: string[]` (feature ids), both optional.
- `actorFeatures(sheet, classEntry: CompendiumClass | null, subclassEntry: CompendiumSubclass | null): ActorFeature[]` where `ActorFeature { id: string; name: string; level: number; action: FeatureAction }` — features with `level ≤ sheet.level` and `mechanics.action`.
- `resourcePools(features, sheet): Record<string, { max: number; spent: number; recovers: 'short' | 'long' }>`; `attacksPerAction(features)`, `critMin(features)` (default 20).
- `catalogueFor` loads the class and subclass entries (`origin.class`/`origin.subclass`, else the name fallback from Global Constraints) from enabled books and returns features with the specs; feature options: `id` = feature id, `group: 'feature'`, `resolution: 'feature'`, `cost`, `uses?: { left: number; max: number }`, `active?: true` for a running state. `passive` and `none` produce no option. `addDamage` features produce no option either: they appear as `riders?: { featureId; name; uses?; slot?: true }[]` on each weapon attack option that passes their `filter`.

- [ ] **Step 1: Failing tests:** schema rejects `kind:'none'` without `reason` and an unknown `kind`; with an invented class entry (no book text) carrying a Rage-like state (`resources:[{key:'rage',max:{'1':2,'3':3},recovers:'long'}]`, `spends:{key:'rage'}`, `cost:'bonus'`) a level 3 sheet gets an option with `uses:{left:3,max:3}`, and `featureUses:{rage:1}` → `left:2`; a level 1 sheet → `max 2`; an old sheet with `class:"Ladino"` and no `origin` finds the rogue entry; a homebrew class → no feature options, no throw; a Sneak-Attack-like `addDamage` with `finesseOrRanged` appears as a rider on a rapier and a shortbow option but not on a greataxe; `attacksPerAction` with an `extraAttacks:1` passive at level 5 = 2, at level 4 = 1.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** Add both sheet fields to the Zod schema and the frontend type (parity test).
- [ ] **Step 4: Run** `src/rules/actions src/compendium/__tests__/schemas.test.ts` and the sheet parity test under `src/__tests__` → PASS.
- [ ] **Step 5: Commit** — "Describe class features as data and list an actor's features with their uses".

### Task 7: Curate the PHB class and subclass features of levels 1–5 (git-ignored data)

**Files:**
- Create (git-ignored): `materiais/.compendio/curation/31-feature-actions.json`, `materiais/.compendio/curation/31-feature-actions.js`; Modify (git-ignored): `materiais/.compendio/curation/run-all.sh`
- Create: `backend/src/compendium/__tests__/featureCoverage.test.ts` (skips when the data is absent, like `spellCoverage.test.ts`)

**Interfaces:**
- The JSON maps `<classSlug or subclassSlug>` → `<feature name>` → `FeatureAction`. The script merges each into `data.features[i].mechanics.action` of `30-classes`/`30-subclasses` output, failing loudly on a name it cannot find. Existing `mechanics` keys stay.
- Book numbers are read from `materiais/` by the curator; the JSON is not committed.

- [ ] **Step 1: Failing test:** every class and subclass feature with `level ≤ 5` in `materiais/.compendio/data/phb/class.json` and `subclass.json` has `mechanics.action` that parses with `FeatureAction`; specific checks: barbaro Rage (`state`, bonus, `rage` pool 2/3/3 at 1/3/5, `damageBonus` 2 at 1–5, filter `melee`+`strength`), Reckless Attack (`none` or `use`), Extra Attack at 5 (`passive.extraAttacks:1`) for barbaro, guerreiro, monge, paladino, patrulheiro; ladino Sneak Attack (`addDamage`, `oncePerTurn`, `finesseOrRanged`, dice 1d6/2d6/3d6 at 1/3/5), Cunning Action (`makeBonus` all three); paladino Divine Smite (`addDamage`, `slot {base:'2d8', perSlot:'1d8', maxDice:5}`, filter `melee`), Lay on Hands (`heal`, pool `perLevel:5`, `chosen`); guerreiro Second Wind (`heal`, bonus, `1d10` + `addClassLevel`, short), Action Surge (`extraAction`, short); Champion Improved Critical (`passive.critMin:19`); monge Ki (pool `classLevel` from 2, short), Flurry of Blows (`attacks` count 2, bonus, `requiresAttackAction`, spends ki), Martial Arts (`attacks` count 1, bonus, `requiresAttackAction`, unarmed dice 1d4/1d6 at 1/5); bardo Bardic Inspiration (`use`, pool `{ability:'cha',min:1}`, recovers long, short from 5); clerigo and paladino Channel Divinity options (`use`, shared `channel-divinity` pool); druida Wild Shape (`use`, 2, short); bruxo, feiticeiro (Font of Magic points: `use` with `sorcery-points` pool `classLevel` from 2), mago Arcane Recovery (`none`, out of combat), patrulheiro features (`none` with reasons where out of combat).
- [ ] **Step 2: Run** `src/compendium/__tests__/featureCoverage.test.ts` → FAIL.
- [ ] **Step 3: Curate**, then `docker exec cozyvtt-backend sh /compendio/curation/run-all.sh`, `npm run compendium:validate -- /compendio` and `compendium:import -- /compendio/data --force` in the backend container.
- [ ] **Step 4: Run** the coverage test and `src/compendium/__tests__/schemas.test.ts` → PASS.
- [ ] **Step 5: Commit** only the test — "Check that every class feature up to 5th level has a curated mechanic".

### Task 8: Resolving feature buttons

**Files:**
- Create: `backend/src/services/actionResolver/features.ts`
- Modify: `backend/src/services/actionResolver.ts`, `backend/src/services/actionResolver/undo.ts`, `backend/src/rules/actions/actionCard.ts`, `backend/src/validators/actions.ts`, `backend/src/rules/actions/catalogue.ts` (common `:bonus` variants)
- Test: `backend/src/services/__tests__/actionResolver.features.e2e.test.ts`

**Interfaces:**
- `ActionRequest` gains `amount?: number` (Lay on Hands, 1..pool left).
- `resolveFeature(campaignId, requester, req, actor, feature: ActorFeature, rng): Promise<ResolveOutcome>` — spends the economy (`feature.action.cost`), then the pool (`spends`), refusing "Sem usos restantes." when short; by kind:
  - `use`: card with the feature name;
  - `heal`: rolls `dice` + `addAbility` mod + class level when `addClassLevel`, or heals `amount` from the pool; target = self or a single target (Lay on Hands: touch);
  - `extraAction`: `spend.extraActions += 1`;
  - `state`: adds the id to `activeStates`, adds `stateName` to the token's `conditions`; clicking an active state ends it (no cost, no use);
  - `attacks`: refuses when `requiresAttackAction` and `!spend.attackActionTaken`; rolls `count` unarmed attacks (bonus = proficiency + best of STR/DEX, damage = `unarmedDice` + that mod, bludgeoning) against one chosen target each, through the P5a attack path;
- `makeBonus` features add `common:dash:bonus` etc. options (cost `bonus`) to the catalogue.
- `UndoRecord` gains `uses?: { characterId: string; key: string; amount: number }[]`, `state?: { characterId: string; featureId: string; tokenId: string; mapId: string; stateName: string; started: boolean }`, `extraAction?: true` (undo restores each).
- Ending combat ends every state (Task 1's `end` calls a hook exported here: `endAllStates(campaignId)`).

- [ ] **Step 1: Failing tests** (invented compendium entries, no book text): Rage at level 3 → `featureUses.rage = 1`, the barbarian's token gets condition "Fúria", `activeStates` has the id, bonus action spent; fourth Rage after three → "Sem usos restantes."; clicking the active Rage ends it without spending; Second Wind heals `1d10 + 3` (fixed rng) as bonus; Action Surge → a second action spell passes in the same turn; Flurry before attacking → refused, after an attack → two attacks, `ki` spent 1; Lay on Hands `amount: 7` heals 7, pool left 8 at level 3; Cunning Action rogue sees `common:dash:bonus` and it spends the bonus; undo of each restores the use/state/extra action; `initiative.end` removes "Fúria".
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.**
- [ ] **Step 4: Run** the new test plus the economy and P5b e2e tests → PASS.
- [ ] **Step 5: Commit** — "Resolve class feature buttons: rage, second wind, action surge, flurry, lay on hands and more".

### Task 9: Attack riders and passives — Sneak Attack, Divine Smite, Rage damage, Extra Attack, Improved Critical

**Files:**
- Modify: `backend/src/rules/actions/attackRoll.ts`, `backend/src/services/actionResolver.ts`, `backend/src/services/actionResolver/common.ts`, `backend/src/validators/actions.ts`
- Test: `backend/src/rules/actions/__tests__/attackRoll.test.ts`, `backend/src/services/__tests__/actionResolver.features.e2e.test.ts`

**Interfaces:**
- `attackHits(roll, ac, critMin = 20)`; `hitChance(..., critMin = 20)`.
- `ActionRequest` gains `riders?: { featureId: string; slotLevel?: number }[]` (only on weapon attack options listing that rider; otherwise refused as `CANNOT_RESOLVE`).
- On a hit: each rider adds its dice (`dice` by class level, or `slot.base` + `slot.perSlot` × (slotLevel − 1), capped at `slot.maxDice` dice) as a damage line of the weapon's type, doubled on a crit like the weapon dice; spends its pool, its `oncePerTurn` key (`feature id`) and, for `slot`, the spell slot (same path as `spendSlotAndConcentration`, recorded in undo). On a miss nothing is spent and the card says the rider was not used. A rider already used this turn → refused "Uma vez por turno." before rolling.
- Active `state` with `damageBonus` adds its flat bonus to qualifying attacks (filter by melee + attack ability = STR, where attack ability is DEX for ranged, the higher of STR/DEX for finesse, else STR).
- `attacksPerAction` and `critMin` from Task 6 feed Task 4's economy and the roll.

- [ ] **Step 1: Failing tests:** `attackHits` natural 19 with `critMin 19` → crit; rogue level 3 with Sneak Attack rider hits → damage lines include `2d6`, a second rider the same turn → "Uma vez por turno.", next turn allowed again, an off-turn reaction attack in the same round after `next` allowed; a miss spends nothing; paladin smite with `slotLevel: 2` → `3d8` extra, slot 2 `expended` +1, undo gives the slot back; raging barbarian greataxe hit → +2, a raging barbarian's thrown handaxe → no bonus; level 5 fighter attacks twice under one action; Champion level 3 crits on 19.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** `src/rules/actions` and the features, economy, P5a and P5b e2e tests → PASS.
- [ ] **Step 5: Commit** — "Add Sneak Attack, Divine Smite and Rage to attacks, and let Extra Attack and Improved Critical change the roll".

### Task 10: Short and long rests

**Files:**
- Create: `backend/src/services/rest.ts`
- Modify: `backend/src/websocket/handlers/characters.ts`, `backend/src/websocket/shared.ts` (ceilings), `backend/docs/WEBSOCKET_DOCUMENTATION.md`
- Test: `backend/src/services/__tests__/rest.e2e.test.ts`

**Interfaces:**
- `takeRest(campaignId, requester: Viewer, characterIds: string[], kind: 'short' | 'long'): Promise<{ ok: true; messageId: string } | { ok: false; error: string }>` — a player only for characters they own; the GM for any; refused with "Não dá para descansar durante o combate." while combat is active; applies Global Constraints' rest rules under the character row locks (`holdSheets`), ends active states (and their token conditions on the current map), posts one `CHARACTER_ACTION` card per call: "Descanso curto" / "Descanso longo" with each character and what came back. Undo of a rest card restores the sheets' previous `hp`, `spellcasting.slots`, `featureUses`, `hitDice`, `activeStates` (UndoRecord gains `sheets?: { characterId: string; before: Partial<Sheet> }[]`).
- Socket: `character.rest { characterIds: string[]; kind: 'short' | 'long' }` (players and GM; ceiling 5/s, 60/min), ack `{ ok, messageId? , error? }`.

- [ ] **Step 1: Failing tests:** monk with ki spent 2 and a level 3 warlock with both slots spent → short rest restores ki and the warlock's slots, not the barbarian's rage; long rest → HP max, temp 0, all slots, rage back, hit dice `remaining 1 → 2` for a level 3 fighter (`total 3`), Rage state ended and "Fúria" removed from the token; during active combat → refused; a player resting another player's character → refused; the GM resting three at once → one card; undo restores the previous values.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** the new test and `src/websocket/__tests__/floodCeilings.integration.test.ts src/websocket/__tests__/busyTable.integration.test.ts` → PASS.
- [ ] **Step 5: Commit** — "Add short and long rests that give back what the book says".

### Task 11: The bar shows the turn, the features and the riders

**Files:**
- Modify: `frontend/src/components/campaign/actionBar/ActionBar.tsx`, `ActionButton.tsx`, `useActionOptions.ts`, `frontend/src/stores/actionStore.ts`, `frontend/src/services/*` (actions service/socket types), i18n `pt-BR` and `en` files, `frontend/src/components/campaign/compact/` bar equivalent
- Create: `frontend/src/components/campaign/actionBar/TurnStrip.tsx`, `FeatureMenu.tsx`, `RiderToggles.tsx`
- Test: `frontend/src/components/campaign/actionBar/__tests__/ActionBar.test.tsx`, `TurnStrip.test.tsx`, `frontend/src/stores/__tests__/actionStore.test.ts`

**Interfaces:**
- `TurnStrip` (shown only when `combat` is in the `action.list` reply): "Ação", "Bônus", "Reação" pips (filled = free), "Ataque 2 de 2" when `attacksLeft > 0` after an attack, "Deslocamento: 6 de 9 m", "Sua vez" / "Fora da sua vez".
- Buttons greyed with the `turnEconomy.canSpend` result as title text (same pt-BR copy) and for `combatUnavailable` spells ("Leva 1 minuto"); greyed also when `uses.left === 0`.
- `FeatureMenu`: a "Características" group with each feature button and its uses as pips; an active state shows "Encerrar <name>".
- `RiderToggles`: on an attack option with `riders`, checkboxes "com Ataque Furtivo"; a `slot` rider opens a slot-level picker of available slots; the store sends `riders` in the request. Lay on Hands asks the amount (number input, 1..left).
- A "Ações comuns" group with the five commons (and the `:bonus` variants labelled "… (bônus)").
- `refreshKey` also includes `initiative.state`'s version so the bar re-lists when the turn changes.

- [ ] **Step 1: Failing tests:** with a `combat` reply where `spend.action` is true, an action spell button is disabled with title "Você já usou a ação neste turno." and a bonus spell is enabled; off-turn only reaction options are enabled; `TurnStrip` renders "Deslocamento: 4,5 de 9 m" for 15 of 30 ft; a Rage button shows 2 of 3 pips; ticking "com Ataque Furtivo" sends `riders:[{featureId}]`; a smite rider asks the slot and sends `slotLevel`; without `combat` nothing is greyed.
- [ ] **Step 2: Run** `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 src/components/campaign/actionBar src/stores/__tests__/actionStore.test.ts` → FAIL. **Step 3: Implement.** **Step 4: Run** again plus `src/components/campaign/compact` → PASS; frontend tsc shows only the known horror-d100 fixture error.
- [ ] **Step 5: Commit** — "Show the turn, the class features and Sneak Attack-style options on the bar".

### Task 12: The GM's tracker and the rest buttons

**Files:**
- Modify: `frontend/src/components/campaign/InitiativeTracker.tsx`, `frontend/src/services/socket.ts`, the 5e character sheet view (`frontend/src/components/character-sheets/fifth-edition/FifthEditionCharacterView.tsx`), the bar's `ActorSummary.tsx`, i18n
- Test: `frontend/src/components/campaign/__tests__/InitiativeTracker.test.tsx` (create if absent), the sheet view test

**Interfaces:**
- GM tracker row: small "A B R" pips and movement for each combatant with `spend`, and a "Devolver" menu (Ação, Ação bônus, Reação, Deslocamento, Ataque) → `combat.restore`.
- "Descanso curto" / "Descanso longo" buttons on the sheet view and on `ActorSummary` (owner and GM), disabled with the refusal text while combat is active; the short rest dialog lists hit dice to spend with the existing `character.hitdice.spend`.
- GM: "Descanso para o grupo" in the tracker header when no combat is active (choose short/long; sends every character of the campaign's current map's player tokens).

- [ ] **Step 1: Failing tests:** the GM sees "Devolver → Ação" and it emits `combat.restore {tokenId, what:'action'}`; a player never sees the pips of another token (state without `spend`); rest buttons disabled with "Não dá para descansar durante o combate." when `combat.active`; "Descanso para o grupo" emits `character.rest` with the player characters' ids.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** **Step 4: Run** the tests → PASS.
- [ ] **Step 5: Commit** — "Let the GM give back a spent action and call rests, and let players rest their own characters".

### Task 13: The done-when turn, end to end

**Files:**
- Test: `backend/src/services/__tests__/actionResolver.p5c.e2e.test.ts` (skips without `materiais/.compendio/data`, like the P5b one)

- [ ] **Step 1: Write the test** with the real curated data and the 12 level-3 sheet fixtures in `frontend/src/utils/guidedCreation/__tests__/fixtures/sheets/` (with `origin` set): combat with all 12 and two goblins; for each class in order, its turn: one action from the bar, a bonus action where the class has one at level 3 (barbaro Rage, ladino Cunning Action Dash, guerreiro Second Wind, monge Flurry after an attack, bardo Bardic Inspiration, feiticeiro/bruxo/clerigo/druida/mago/paladino/patrulheiro: their level-3 feature or a bonus spell where they have one, else none), a move within budget, then `next`. Asserts: Rage spends 1 of 3 and adds +2 to the greataxe; Sneak Attack once, the second refused; Divine Smite with slot 1 adds 2d8 and spends the slot; Action Surge gives a second action, Second Wind heals; Flurry spends 1 ki and makes two attacks; then `initiative.end`, a short rest restores Action Surge, ki and the warlock's slots, and a long rest restores Rage, slots, HP and half the hit dice. Restart: mid-combat `flushCombatWrites`, clear memory, `hydrateCombatStates` → same round, turn and spend.
- [ ] **Step 2: Run** it → PASS (fix anything it finds in the owning task's files, with a test in that task's suite).
- [ ] **Step 3: Commit** — "Play the P5c done-when turn for every class end to end".
