# P5d — Inventário com ícones, espaços do corpo, munição e rações Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The 5e inventory shows every item with an icon, has body slots (main hand, off hand, armour, ammunition) above a backpack grid, and the slots count: the hands decide the bar's weapon attacks and the armour and shield decide the AC; in a Faithful campaign each shot spends ammunition (half recoverable) and each long rest eats a ration; packs open into their items.

**Architecture:** A pure, deterministic normaliser shared byte-identically by backend and frontend (`utils/inventory.ts`) gives every inventory item an id and a slot, splits ammunition bundles into units and links attacks to items, so both sides agree on old sheets without a data migration. Equipping, opening a pack and recovering ammunition are server-side socket events (`services/inventory.ts`) that check the hand rules, recompute the AC by difference, and charge the P5c turn economy in a Faithful fight. The resolver spends ammunition next to the turn economy and records it on the undo; the rest service eats a ration. Icons are `react-icons/gi` (game-icons.net) chosen by a frontend table.

**Tech Stack:** Node/Express/Prisma 7/Socket.IO (backend, Jest), React 19 + Zustand + Tailwind 4 + i18next (frontend, Vitest), `react-icons` (new dependency).

**Spec:** `docs/superpowers/specs/2026-11-19-p5d-inventario-municao-racoes-design.md` (builds on the P5a, P5b and P5c specs and plans in the same folders; roadmap P5).

## Global Constraints

- Every P5a, P5b and P5c Global Constraint still binds (see their plans in `docs/superpowers/plans/`): act only through a controlled character (owner or GM); everything the app applies is undoable by the GM; no book text in git; i18n pt-BR and en, frontend tests in English; commits authored as `CheekyChinchilla <154020855+CheekyChinchilla@users.noreply.github.com>` with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer, subjects as plain sentences; never run the whole backend suite (use the scratchpad `berepo.sh` with explicit paths); files under `backend/src/utils` that have a frontend twin stay byte-identical (`visionParity.test.ts`).
- **Detail level:** `Campaign.detailLevel` (`FAITHFUL` | `FLEXIBLE`). Ammunition, rations, carrying weight and the in-combat equip limits apply **only** in `FAITHFUL`. Icons, opened packs, slots, hand-filtered attacks and AC by armour apply in both.
- **Slots:** `type InventorySlot = 'main' | 'off' | 'both' | 'armor' | 'ammo'`. `both` = a weapon held in both hands (two-handed, or versatile held with two). An item without `slot` is in the backpack. `equipped` is derived: `equipped === (slot !== undefined)`; writers keep it in step.
- **Hand rules:** two-handed weapon → only `both`; versatile → `main` or `both`; shield → only `off`; other weapons and unlinked equippable items → `main` or `off`; armour (not shield) → only `armor`; ammunition → only `ammo`; anything else → refused. Putting an item where something is: what was there goes to the backpack; `both` empties `main` and `off`, and `main`/`off` empties a `both`.
- **AC by difference:** `newAc = storedAc − contribution(before) + contribution(after)`, where contribution of the worn body armour is `baseAc + dex` (light: whole dex; medium: `min(dex, maxDex ?? 2)`; heavy: none), with no body armour `10 + dex`, or unarmoured defence: barbarian `10 + dex + con`, monk `10 + dex + wis` (only with no shield); a shield adds 2. Body armour without a compendium link contributes "unknown": its change leaves the AC as it is and the event's ack says so (`acUnknown: true`). Ability modifiers come from `sheet.stats.<ability>.modifier`. Barbarian/monk = `origin.class.slug` `barbaro`/`monge`, or the class name (accent/case-insensitive) `Bárbaro`/`Monge`.
- **Faithful fight equip costs** (only when the campaign's combat is active **and** the character's token is the current combatant; off-turn in an active fight the change is refused with "Não é a sua vez."): each weapon that enters or leaves a hand is one object interaction; the first of the turn is free, any further one needs the action (refused with the P5c "Você já usou a ação neste turno." if spent); putting on or taking off a shield spends the action; body armour is refused with **"Leva minutos para vestir ou tirar armadura."**. Outside an active fight, or in Flexible, everything is free.
- **Ammunition:** bundle sizes in names: a trailing `(N)` on a gear item whose compendium entry is ammunition ("Flechas (20)" → name "Flechas", quantity × N, `compendiumRef` unchanged). Weapon → ammunition gear slug comes from the compendium weapon's `data.ammunition` (curated). Refusal copy: `Sem <nome da munição em minúsculas>.` — "Sem flechas.", "Sem virotes.", "Sem balas de funda.", "Sem agulhas de zarabatana.". Recovery gives back `floor(n / 2)` per kind, never during an active fight (refused with "Não dá para recolher munição durante o combate."), and zeroes the count.
- **Rations:** a long rest in Faithful eats 1 from the first item whose `compendiumRef.slug` is `racoes-de-viagem-1-dia`, else whose plain name (accent/case-insensitive) starts with `racao` or `racoes`. None → the rest still happens; card line "<nome> ficou sem ração." and one GM whisper.
- New sheet fields (backend zod `fifthEdition.schema.ts` and frontend `types/game-systems/fifthEdition.ts`): inventory item `id?: string` (≤ 64 chars), `slot?: InventorySlot`; attack `itemId?: string`; sheet `ammoToRecover?: Record<string /*gear slug*/, number>` (integers ≥ 0).
- **Spec correction (ruling):** the spec mentions an existing off-hand (two-weapon) attack rule from P5a/P5c. None exists. P5d adds none: a light weapon in `off` just lists its attack like any weapon in hand. Two-weapon fighting stays out of scope.
- **Spec correction (ruling):** the sheet editor (`FifthEditionCharacterEditor`) keeps its list; it shows the icon, keeps `id`, `slot`, `itemId` and `ammoToRecover` untouched, and does not edit slots. Slots change only through the view's equip controls (the server event), so AC and the combat rules always apply.

## Review Focus

1. A sheet made before P5d (equipped longsword, equipped shield, equipped chain mail, "Flechas (20)" ×1, "Pacote de Explorador" ×1) after the boot backfill → ids and slots stored, the AC not changed, arrows read 20, the pack shows "Abrir pacote"; the backfill run twice changes nothing; an item added later in the sheet editor gets an id on save (Task 2 normaliser test, Task 4 backfill and save-path tests).
2. The player and the GM click "Equipar" on two different items of the same character at once → both land, the AC reflects both, nothing is lost; equip runs under the character's row lock like the resolver's held sheets (Task 4 concurrency test).
3. The GM undoes a bow attack after the player already recovered ammunition → the arrow goes back to the stack, `ammoToRecover` never goes below 0, and the stack is recreated if the player removed it (Task 6 test).
4. A long rest for the group in Faithful where one character has no rations and another has a hand-typed "Ração" → the first gets the "ficou sem ração" line and the GM one whisper for the rest, the second eats from the hand-typed item; the undo puts both inventories back (Task 7 test).
5. A Flexible campaign: the ranger shoots 30 arrows, rests, swaps armour mid-fight → no ammunition or ration is touched, no refusal, AC still follows the armour (Tasks 4, 6, 7 Flexible tests).

---

### Task 1: Pack contents and weapon ammunition in the compendium

**Files:**
- Modify: `backend/src/compendium/schemas.ts` (`Pack`, `Weapon`)
- Create (git-ignored): `materiais/.compendio/curation/51-packs-ammunition.js`
- Test: `backend/src/compendium/__tests__/packContents.test.ts`, existing `backend/src/compendium/__tests__/schemas.test.ts`

**Interfaces:**
- Produces: `Pack` data `{ cost: string; contents: string[]; items?: PackItem[] }` with `PackItem = { ref: { type: 'gear' | 'tool' | 'weapon' | 'armor'; slug: string }; quantity: number } | { name: string; quantity: number }` (quantity integer ≥ 1); weapon data gains `ammunition?: string` (a `gear` slug in the same book).
- The curation script patches `/compendio/data/phb/pack.json` (every pack gets `items`, read from its own `contents` lines, e.g. "10 dias de rações" → `{ ref: {type:'gear', slug:'racoes-de-viagem-1-dia'}, quantity: 10 }`, "15 metros de corda de cânhamo" → the rope's gear entry) and `weapon.json` (`arco-curto`, `arco-longo` → `flechas-20`; `besta-leve`, `besta-de-mao`, `besta-pesada` → `virotes-20`; `funda` → `balas-de-funda-20`; `zarabatana` → `agulhas-de-zarabatana-50`). It is idempotent like the others (`run-all.sh` order).

- [ ] **Step 1: Failing tests:** `schemas.test.ts`: a pack with `items: [{ ref: { type: 'gear', slug: 'x' }, quantity: 10 }, { name: 'Saco com esferas', quantity: 1 }]` validates; `quantity: 0` fails; a weapon with `ammunition: 'flechas-20'` validates. `packContents.test.ts` (reads `/compendio/data/phb` like `featureCoverage.test.ts`, skipped when absent): every pack has `items` with one entry per `contents` line; every `ref` exists in its type's file; every weapon whose `properties` include `munição` has an `ammunition` that is a gear slug in `gear.json`; no item `name` is longer than 60 characters (no book text copied).
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/compendium/__tests__/schemas.test.ts src/compendium/__tests__/packContents.test.ts` → FAIL.
- [ ] **Step 3: Implement** the schema fields and the curation script; run `docker exec cozyvtt-backend sh /compendio/curation/run-all.sh`, `compendium:validate`, `compendium:import -- /compendio/data --force`.
- [ ] **Step 4: Run** the two tests → PASS.
- [ ] **Step 5: Commit** (git files only) — "Describe what each pack holds and which ammunition each weapon fires".

### Task 2: Shared inventory normaliser and the new sheet fields

**Files:**
- Create: `frontend/src/utils/inventory.ts` and a byte-identical `backend/src/utils/inventory.ts`
- Modify: `backend/src/utils/__tests__/visionParity.test.ts` (add `inventory.ts`), `backend/src/validators/game-systems/fifthEdition.schema.ts`, `frontend/src/types/game-systems/fifthEdition.ts`
- Test: `frontend/src/utils/__tests__/inventory.test.ts`, `backend/src/validators/__tests__` (the existing 5e schema test file, or a new `fifthEditionInventory.test.ts`)

**Interfaces:**
- `export type InventorySlot = 'main' | 'off' | 'both' | 'armor' | 'ammo'`.
- `export interface InventoryHints { kindOf(item): 'weapon' | 'shield' | 'armor' | 'ammo' | 'pack' | 'other'; twoHanded(item): boolean }` — what the caller knows from the compendium (backend: DB entries, Task 4 `inventoryHintsFor`; frontend: the guided creation's data, Task 8). Without hints an item is `other` and not two-handed. Every persisted sheet is normalised by the server (Task 4 backfill and save path), so the frontend never has to normalise a stored sheet itself; it reads `id`/`slot` as stored.
- `export function normalizeInventory<T extends SheetLike>(sheet: T, hints?: InventoryHints): T` — pure, idempotent, never mutates its input. Does, in order: (1) split ammunition bundles (`kindOf === 'ammo'` and name ends with ` (N)`) into units; (2) give each item without `id` the id `inv-<index>` (index in the list after step 1), keeping existing ids; (3) when **no** item has `slot` and some have `equipped: true`, assign slots: first equipped body armour → `armor`; first equipped shield → `off`; equipped weapons in list order → two-handed to `both` (if both hands free), others to `main` then `off`; equipped ammo → `ammo`; anything that does not fit gets `equipped: false`; (4) set `equipped = slot !== undefined` on equippable items; (5) attacks without `itemId` whose trimmed lower-case name equals one item's name get that item's id.
- `export function itemsInHands(sheet): Item[]`, `export function ammoBundleSize(name: string): number | null` ("Flechas (20)" → 20, "Corda" → null).

- [ ] **Step 1: Failing tests** (`inventory.test.ts`): the Review Focus 1 sheet (hints marking longsword weapon, shield, chain mail armor, arrows ammo, pack pack) → arrows item `{ name: 'Flechas', quantity: 20 }`, ids `inv-0…`, longsword `main`, shield `off`, chain mail `armor`, pack untouched, the "Espada longa" attack gets the longsword's id; running it twice gives the same object; a sheet that already has a `slot` anywhere keeps every slot as is; two equipped two-handed weapons → the first `both`, the second back to the backpack with `equipped: false`; input object is not mutated. Schema test: an item with `id: 'inv-0', slot: 'both'` validates, `slot: 'head'` fails; `ammoToRecover: { 'flechas-20': 3 }` validates, `-1` fails.
- [ ] **Step 2: Run** `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run src/utils/__tests__/inventory.test.ts` → FAIL.
- [ ] **Step 3: Implement**, copy to backend, add to the parity test, add the schema fields and types.
- [ ] **Step 4: Run** the frontend test, `berepo.sh … src/utils/__tests__/visionParity.test.ts` and the schema test → PASS.
- [ ] **Step 5: Commit** — "Give every inventory item an id and a body slot, the same way on both sides".

### Task 3: Hand rules and AC by difference (pure)

**Files:**
- Create: `backend/src/rules/inventory/equip.ts`
- Test: `backend/src/rules/inventory/__tests__/equip.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- `export interface ItemFacts { kind: 'weapon' | 'shield' | 'armor' | 'ammo' | 'other'; twoHanded: boolean; versatile: boolean; armor?: { category: 'light' | 'medium' | 'heavy'; baseAc: number; addDex: boolean; maxDex?: number } }`
- `export function planEquip(inventory: Item[], itemId: string, slot: InventorySlot | null, facts: (item: Item) => ItemFacts): { ok: true; inventory: Item[]; handMoves: number; shieldMoved: boolean; armorMoved: boolean } | { ok: false; error: string }` — applies the hand rules (Global Constraints); `slot: null` stows. `handMoves` = weapons entering or leaving a hand, including those bumped to the backpack. Refusal copies: "Esse item não vai nesse espaço." (wrong slot), "Item não encontrado." (unknown id).
- `export function acContribution(body: ItemFacts['armor'] | undefined, shield: boolean, sheet: SheetLike): number | 'unknown'` and `export function acAfter(sheet, before: Item[], after: Item[], facts): { ac: number; unknown: boolean }` (Global Constraints formula; an unlinked body armour on either side → `unknown: true`, AC unchanged).

- [ ] **Step 1: Failing tests:** longsword `main` + shield `off`, equip greatsword (two-handed) to `both` → longsword and shield in the backpack, `handMoves: 2` (longsword out, greatsword in), `shieldMoved: true`, and `acAfter` lowers AC by 2; shield to `main` → refused; versatile longsword to `both` → ok; arrows to `armor` → refused; chain mail (heavy 16) → studded leather (light 12, dex +3) on a sheet with AC 18 and a shield → 17; no armour on a monk with dex +3 wis +2 and stored AC 15 → equipping leather (11) gives 14, and the monk with a shield keeps `10 + dex` as "before"; barbarian dex +2 con +3, no armour, AC 15 → equipping hide (medium 12, dex cap 2) → 14; unlinked body armour → `unknown: true`, AC unchanged.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/rules/inventory/__tests__/equip.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — "Work out where an item can go and what it does to the armour class".

### Task 4: Equip and open a pack, on the server

**Files:**
- Create: `backend/src/services/inventory.ts`, `backend/src/services/inventoryBackfill.ts` (run at boot the way `creatureProficiencyBackfill.ts` is)
- Modify: the character create/update routes (`backend/src/routes/characters.ts` or where 5e sheets are saved), `backend/src/utils/turnEconomy.ts` + frontend twin (`objectInteractions: number` in `TurnSpend`, `freshSpend` 0, reset by `beginTurn`), `backend/src/websocket/handlers/characters.ts`, `backend/src/websocket/handlers/initiative.ts` (`combat.restore` accepts `what: 'interaction'` → `objectInteractions = 0`), `backend/docs/WEBSOCKET_DOCUMENTATION.md`, the flood-ceiling table
- Test: `backend/src/services/__tests__/inventory.e2e.test.ts`, `backend/src/websocket/__tests__/gmOnlyEvents.integration.test.ts` (restore payload), `frontend/src/utils/__tests__/turnEconomy.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3; P5c `withCombatLock`, `getState`, `REFUSAL_MESSAGES`, `holdSheets`/`writeSheets`, `emitCharacterUpdated`.
- `export async function inventoryHintsFor(campaignId: string | null, sheet): Promise<InventoryHints>` — looks up each item's `compendiumRef` (`bookId`, `slug`) in the compendium: `weapon` → `weapon` (two-handed when its properties include `duas mãos`), `armor` with category `shield` → `shield`, other `armor` → `armor`, `gear` whose slug some weapon's `ammunition` names → `ammo`, `pack` → `pack`, else `other`.
- Backfill: every 5e character whose sheet differs from `normalizeInventory(sheet, hints)` is written once; idempotent; logged count. Save path: creating or updating a 5e character stores the normalised sheet (an editor-added item gets its id).
- `export async function equipItem(campaignId, requester: Viewer, characterId: string, itemId: string, slot: InventorySlot | null): Promise<{ ok: true; ac: number; acUnknown: boolean } | Refusal>` — loads the character with its row held, normalises (hints from the compendium entries of the items' `compendiumRef`), `planEquip`, the Faithful fight costs from Global Constraints under `withCombatLock` (first hand move free via `objectInteractions`, extra moves or a shield need `action`), writes `inventory`, `armorClass`, the attack `itemId`s. Not the owner and not GM → "Not your token".
- `export async function openPack(campaignId, requester, characterId, itemId): Promise<{ ok: true } | Refusal>` — replaces one pack item (quantity 1; with quantity > 1 opens one) by its `items` (ref items take the entry's name and weight; ammunition bundles become units; same `compendiumRef` merges into the existing item's quantity). A pack without `items` → "Esse pacote não tem conteúdo conhecido.".
- Socket events (ack, `withinCeiling`, owner-or-GM): `character.equip { characterId, itemId, slot: InventorySlot | null }` → ack `{ ok: true, ac, acUnknown }`; `character.pack.open { characterId, itemId }`. On success `emitCharacterUpdated`, and in an active fight broadcast `initiative.state` (the spend changed).

- [ ] **Step 1: Failing tests** (`inventory.e2e.test.ts`, real DB like `rest.e2e.test.ts`): Faithful, combat active, fighter's turn: longsword+shield → greatsword to `both` → action spent (two hand moves + shield), AC −2, the bar's `action.list` lists the greatsword attack and not the longsword; same swap off-turn → "Não é a sua vez."; chain mail → leather in the fight → "Leva minutos para vestir ou tirar armadura."; out of combat it passes and the AC follows the formula; one sword drawn then nothing else → `objectInteractions: 1`, action free; Flexible in combat → everything free; a stranger player → refused; Review Focus 2 (two concurrent `equipItem` on one character → both slots set); Review Focus 1 (old sheet with equipped longsword+shield+chain mail+"Flechas (20)": after the backfill the slots and ids are stored, the AC is the same, arrows read 20, a second backfill writes nothing; saving the sheet with a new id-less item stores it with an id); `openPack` on "Pacote de Explorador" → 10 rations, 10 torches, rope… and the pack gone; GM `combat.restore {what:'interaction'}` resets the count. `turnEconomy.test.ts`: `freshSpend().objectInteractions === 0`.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/services/__tests__/inventory.e2e.test.ts src/websocket/__tests__/gmOnlyEvents.integration.test.ts src/utils/__tests__/visionParity.test.ts` → FAIL.
- [ ] **Step 3: Implement** (the attack filtering it asserts on is Task 5; write Task 5's catalogue change first if you prefer, or mark that assertion and finish it in Task 5).
- [ ] **Step 4: Run** the three plus `src/websocket/__tests__/initiativeState.test.ts` and the frontend `turnEconomy.test.ts` → PASS. Update the websocket docs table.
- [ ] **Step 5: Commit** — "Equip, stow and open packs through the server, with the fight's costs in a Faithful campaign".

### Task 5: The bar attacks with what is in hand

**Files:**
- Modify: `backend/src/rules/actions/catalogue.ts` (`characterActions`), `backend/src/services/actionResolver/catalogueFor.ts` (normalise the sheet before the catalogue)
- Test: `backend/src/rules/actions/__tests__/catalogue.test.ts`, `backend/src/services/__tests__/actionResolver.e2e.test.ts`

**Interfaces:**
- `catalogueFor` normalises the sheet (with `inventoryHintsFor`) before building the catalogue, so a sheet saved by an older client still lists right.
- `characterActions` skips an attack row whose `itemId` names an item not in `main`/`off`/`both`; rows without `itemId` (hand-typed, natural, spell) stay. A row whose item is in `both` and has versatile damage: no `grips`, and the resolver uses the versatile damage (`grip` forced to `'two'`); in `main`/`off` the versatile item offers no grip either and uses the one-hand damage. Attack options gain `ammunition?: { slug: string; label: string }` on the spec (not the option) when the weapon's compendium entry has `ammunition`; `label` is the plural name in lower case from the gear entry's name without the `(N)` ("flechas").
- Unarmed strike: unchanged (it comes from the sheet rows today; if the sheet has none, none is added).

- [ ] **Step 1: Failing tests:** a sheet with longsword (`main`, versatile) and dagger (backpack) → options list the longsword with no `grips` and not the dagger; longsword in `both` → resolving it rolls the versatile die (`1d10`); a hand-typed "Mordida" row with no `itemId` is listed; the longbow's spec carries `ammunition: { slug: 'flechas-20', label: 'flechas' }`.
- [ ] **Step 2: Run** `berepo.sh … src/rules/actions/__tests__/catalogue.test.ts src/services/__tests__/actionResolver.e2e.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** those plus `src/services/__tests__/actionResolver.p5c.e2e.test.ts src/services/__tests__/actionResolver.classes.e2e.test.ts` → PASS (the class turns' sheets must still find their weapons: their fixtures get slots through the normaliser; fix fixtures only where a weapon was not equipped).
- [ ] **Step 5: Commit** — "List only the weapons in hand on the bar, with two hands where the weapon is held so".

### Task 6: Ammunition spent, given back and recovered

**Files:**
- Modify: `backend/src/services/actionResolver.ts` (attack path), `backend/src/rules/actions/actionCard.ts` (`UndoRecord.ammo`), `backend/src/services/actionResolver/undo.ts`, `backend/src/services/inventory.ts` (`recoverAmmo`), `backend/src/websocket/handlers/characters.ts`
- Test: `backend/src/services/__tests__/actionResolver.ammo.e2e.test.ts`

**Interfaces:**
- In `resolveAction`, for a spec with `ammunition`, campaign `FAITHFUL`, actor with a sheet: before `checkAndSpend` (with the rider check), find the stack — the item in `ammo` if its `compendiumRef.slug` is the weapon's ammunition, else the first backpack item with that slug — none or quantity 0 → refuse `Sem ${label}.`; else quantity −1 and `ammoToRecover[slug] += 1` on the held sheet; `undo.ammo = { characterId, itemId, slug, amount: 1 }`. Hit or miss alike.
- Undo: quantity +1 on the item with `itemId` (recreated as `{ name: <label capitalised>, quantity: 1, compendiumRef }` if gone), `ammoToRecover[slug] = max(0, n − 1)`.
- `export async function recoverAmmo(campaignId, requester, characterId): Promise<{ ok: true; recovered: Record<string, number> } | Refusal>` — refused in an active fight ("Não dá para recolher munição durante o combate."), gives `floor(n/2)` of each slug back to its stack (created if gone), clears `ammoToRecover`, posts a chat line "<nome> recolhe 3 flechas." the way the rest card is announced. Socket `character.ammo.recover { characterId }` with ack.

- [ ] **Step 1: Failing tests:** Faithful ranger with longbow in `both` and 20 arrows shoots three times → 17, `ammoToRecover['flechas-20'] === 3`; undo one → 18 and 2; 0 arrows → "Sem flechas." and no action spent; a hand crossbow with 0 bolts → "Sem virotes."; `recoverAmmo` after 7 shots → +3, count cleared; during an active fight → refused; Review Focus 3 (recover, then GM undoes an earlier shot → +1 arrow, count stays 0; stack removed → recreated); a thrown dagger spends nothing; Flexible → nothing spent.
- [ ] **Step 2: Run** `berepo.sh … src/services/__tests__/actionResolver.ammo.e2e.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `src/services/__tests__/actionResolver.e2e.test.ts src/services/__tests__/actionResolver.economy.e2e.test.ts` → PASS.
- [ ] **Step 5: Commit** — "Spend an arrow on every shot in a Faithful campaign and recover half after the fight".

### Task 7: A long rest eats a ration

**Files:**
- Modify: `backend/src/services/rest.ts`
- Test: `backend/src/services/__tests__/rest.e2e.test.ts`

**Interfaces:**
- `snapshot` also keeps `inventory`; a long rest in `FAITHFUL` eats 1 ration per character (Global Constraints); the card line "comeu 1 ração" in that character's list, or "<nome> ficou sem ração."; the characters without one go in one GM whisper per rest ("Sem ração no descanso: A, B."), reusing the whisper helper `combatMovement.ts` uses (move it to a shared place if needed). The undo restores the inventory with the rest of the snapshot.

- [ ] **Step 1: Failing tests:** Faithful, two characters, one with 10 rations and one with none → 9 and an unchanged inventory, card lines as above, exactly one GM whisper; Review Focus 4 (hand-typed "Ração" eaten; undo restores both inventories); short rest eats nothing; Flexible long rest eats nothing.
- [ ] **Step 2: Run** `berepo.sh … src/services/__tests__/rest.e2e.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — "Eat a ration on every long rest in a Faithful campaign".

### Task 8: Guided creation opens packs, counts arrows and fills the slots

**Files:**
- Modify: `frontend/src/utils/guidedCreation/equipmentRules.ts`, `frontend/src/utils/guidedCreation/buildSheet.ts`, the compendium types/loader the guided creation uses for packs (`items`) and weapons (`ammunition`)
- Test: `frontend/src/utils/guidedCreation/__tests__/` (the existing equipment and build-sheet tests)

**Interfaces:**
- A picked pack adds its `items` (ref → the entry's name and weight; name-only → `{ name, quantity }`) instead of the pack; a pack without `items` stays as one item. Ammunition bundles become units. `buildSheet` runs `normalizeInventory` (Task 2) with hints from the creation data, then sets the slots the creation chose: worn armour `armor`, shield `off`, first weapon in `main` (two-handed → `both`; a second one-handed weapon → `off` when the off hand is free), first ammunition `ammo`; each weapon attack gets `itemId`. The AC stays the one `derived.armorClass` computes.

- [ ] **Step 1: Failing tests:** a ranger with explorer's pack, longbow and 20 arrows → inventory has "Rações de viagem (1 dia)" ×10, no "Pacote de Explorador", "Flechas" ×20 in `ammo`, longbow in `both`, the longbow attack's `itemId` is the longbow's id; a fighter with longsword and shield → `main` and `off`, chain mail `armor`, AC unchanged from today's expectation.
- [ ] **Step 2: Run** `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run src/utils/guidedCreation` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — "Open packs and fill the body slots when a character is created".

### Task 9: Item icons

**Files:**
- Modify: `frontend/package.json` (add `react-icons`, exact current version 5.7.0), `THIRD_PARTY_CREDITS.md`, `THIRD_PARTY_NOTICES.txt` (CC BY 3.0 notice for game-icons.net authors)
- Create: `frontend/src/utils/itemIcons.ts`, `frontend/src/components/character-sheets/fifth-edition/components/ItemIcon.tsx`
- Test: `frontend/src/utils/__tests__/itemIcons.test.ts`

**Interfaces:**
- `export type ItemCategory = 'meleeWeapon' | 'rangedWeapon' | 'armor' | 'shield' | 'ammo' | 'potion' | 'food' | 'tool' | 'scroll' | 'container' | 'light' | 'item'`.
- `export function itemCategory(item: { name: string; compendiumRef?: { slug: string } }, entryType?: string, entryData?: unknown): ItemCategory` (compendium type, then the gear slug table, then the magic-item name prefix "Poção"/"Pergaminho"/"Munição"…, else `item`).
- `export function itemIconFor(item, entryType?, entryData?): IconType` (`react-icons/gi`): a slug table for the PHB weapons, armour and common gear (≥ 40 entries, including every weapon in `weapon.json` and the items of every pack), falling back to the category icon.
- `<ItemIcon item={…} size={…} />`: the icon light on a dark rounded square, as in the mockups; `aria-hidden` (the name is next to it).

- [ ] **Step 1: Failing tests:** "Arco Longo" (`weapon`, ranged) → `rangedWeapon` and the bow icon; "Flechas" → `ammo`; "Rações de viagem (1 dia)" → `food`; "Poção de Cura" (magic item) → `potion`; an unlinked "Amuleto da vovó" → `item` and the generic icon; every slug in the table resolves to a defined component.
- [ ] **Step 2: Run** `… vitest run src/utils/__tests__/itemIcons.test.ts` → FAIL (install the dependency inside the container: `docker exec cozyvtt-frontend npm install react-icons@5.7.0`, keep `package-lock.json` in step).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — "Pick an icon from game-icons.net for every inventory item".

### Task 10: The sheet's slots and backpack grid

**Files:**
- Create: `frontend/src/components/character-sheets/fifth-edition/components/InventoryPanel.tsx` (replaces `InventoryList` in the view), `frontend/src/services/` socket helpers for `character.equip`, `character.pack.open`, `character.ammo.recover` (next to the existing rest helper)
- Modify: `FifthEditionCharacterView.tsx`, `FifthEditionCharacterEditor.tsx` (icon in the list rows; keep `id`/`slot`/`itemId`/`ammoToRecover`), i18n `pt-BR.ts`/`en.ts`
- Test: `frontend/src/components/character-sheets/fifth-edition/__tests__/InventoryPanel.test.tsx`

**Interfaces:**
- Layout of mockup C: four slot squares labelled "Mão principal", "Outra mão", "Armadura", "Munição" (an item in `both` shows in both hand squares, dimmed in the second); "Mochila" grid of 64 px squares with the quantity at the bottom right (when > 1); the currency block as today; in Faithful the "Carga: X de Y kg" bar under the grid (the existing `carryingCapacity`).
- Clicking an item opens its detail (name, quantity, weight in Faithful, notes) with the actions the viewer may take (owner or GM): "Equipar" (one button per allowed slot: "Na mão principal", "Na outra mão", "Com as duas mãos", "Vestir", "Preparar munição"), "Guardar", "Abrir pacote" for packs. HTML5 drag from the grid to a slot and back sends the same events. Refusals from the ack show in the panel (the bar's report pattern). `acUnknown` shows "A CA não foi ajustada: essa armadura não está no compêndio."
- "Recuperar munição (metade: 3 de 7)" under the ammo slot when `ammoToRecover` has any count, Faithful only; hidden while the campaign's combat is active.
- Read-only viewers see the panel without actions.

- [ ] **Step 1: Failing tests:** renders the four slots and the backpack for the Task 8 ranger (longbow in both hand squares, arrows ×20 in "Munição"); clicking the dagger and "Na mão principal" emits `character.equip { itemId, slot: 'main' }`; a refusal ack shows its text; "Abrir pacote" emits `character.pack.open`; the recover button shows "metade: 3 de 7" for 7 and is hidden in Flexible and during an active fight; no weight bar in Flexible; a viewer who is neither owner nor GM sees no action buttons.
- [ ] **Step 2: Run** `… vitest run src/components/character-sheets/fifth-edition/__tests__/InventoryPanel.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `src/components/character-sheets/fifth-edition/__tests__/restButtons.test.tsx` and the existing view/editor tests in that folder → PASS.
- [ ] **Step 5: Commit** — "Show the inventory as body slots over a backpack grid, with icons".

### Task 11: The bar's items, the weapon swap and the ammunition left

**Files:**
- Modify: `frontend/src/components/campaign/actionBar/ActionBar.tsx`, i18n
- Test: `frontend/src/components/campaign/actionBar/__tests__/ActionBar.test.tsx`

**Interfaces:**
- The "Itens" menu shows the backpack and slot items as icon squares (Task 9) with the quantity; an item with an attack in hand still runs it on click.
- A "Trocar arma" button next to the menus (characters only, owner or GM) opens a small group with the hand slots and the weapons in the backpack; picking one sends `character.equip` with `main` (or `both` for two-handed); the refusal shows in the bar's report.
- In Faithful, an attack button whose weapon fires ammunition shows the count left ("Arco longo · 17").

- [ ] **Step 1: Failing tests:** the items menu renders icons and "×20"; "Trocar arma" → picking the greatsword emits `character.equip { slot: 'both' }`; the longbow button reads "· 17" in Faithful and has no count in Flexible.
- [ ] **Step 2: Run** `… vitest run src/components/campaign/actionBar/__tests__/ActionBar.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `TurnStrip.test.tsx` and `RestControls.test.tsx` → PASS.
- [ ] **Step 5: Commit** — "Show item icons, a weapon swap and the arrows left on the action bar".

### Task 12: The done-when session, end to end

**Files:**
- Create: `backend/src/services/__tests__/actionResolver.p5d.e2e.test.ts`

- [ ] **Step 1: Write the test** against the real compendium data (skipped when `/compendio/data` is absent, like the P5c one), following the spec's "Pronto quando" in order: a Faithful campaign; a ranger built the guided-creation way (longbow `both`, 20 arrows `ammo`, explorer's pack opened) and a fighter (longsword `main`, shield `off`, chain mail `armor`); combat: the ranger shoots three times (17), the GM undoes one (18), arrows set to 0 → "Sem flechas."; combat ends → `recoverAmmo` returns half of the shots left on the count; the fighter, out of combat, swaps to the greatsword (`both`) → AC −2 and `action.list` shows only the greatsword; chain mail → studded leather → AC by the formula; in a new fight the armour swap → "Leva minutos para vestir ou tirar armadura."; a group long rest → each loses 1 ration; a character without one → the rest happens and the GM gets the whisper; undo the rest → rations back; the same steps in a Flexible campaign → nothing counted, slots and AC still work.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/services/__tests__/actionResolver.p5d.e2e.test.ts` → PASS (fix the owning task's code, not the test, if a step fails).
- [ ] **Step 3: Commit** — "Play the P5d done-when session end to end".
