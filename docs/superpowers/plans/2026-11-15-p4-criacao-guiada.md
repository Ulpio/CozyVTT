# P4 — Criação de personagem guiada Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player builds a valid 3rd-level D&D 5e (2014) character of any Player's Handbook class through a step-by-step wizard fed by the compendium, without typing a number; the GM sets per campaign which ability-score methods are allowed and the detail level (Faithful / Flexible).

**Architecture:** The wizard is frontend-only: pure rule functions in `frontend/src/utils/guidedCreation/` compute every number from the compendium entries plus a rules table in code, and `buildSheet()` turns the choices into the existing `FifthEditionCharacterData`, saved through today's `POST /api/characters`. The backend gains two campaign settings, an ability-roll draft (rolled server-side, never re-rolled), optional compendium references on the sheet, typed curated data on class/background/subclass entries, and a `full` flag on the compendium list.

**Tech Stack:** Prisma/PostgreSQL, Express + zod, React 19 + Tailwind + i18next, Jest e2e (supertest), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-15-p4-criacao-guiada-design.md` (roadmap: `docs/superpowers/specs/2026-11-14-mesa-roadmap-design.md`, P4)

## Global Constraints

- 3rd level, 2014 rules, Player's Handbook options only; no multiclass, no level-up, no respec; feats only for the variant human.
- Ability methods: `POINT_BUY` (27 points, scores 8–15, costs 8:0 9:1 10:2 11:3 12:4 13:5 14:7 15:9), `STANDARD_ARRAY` (15, 14, 13, 12, 10, 8), `ROLL` (4d6 drop lowest, six times). New campaign default: `['POINT_BUY','STANDARD_ARRAY']`. Outside a campaign: all three.
- A roll is never re-rolled: stored server-side per player and scope (campaign or none) at the moment it is made; reopening the wizard returns the same roll; creating the character consumes it.
- Detail level: `FAITHFUL` | `FLEXIBLE`, new campaign default `FLEXIBLE`; changing it deletes nothing.
- Only the GM (owner included) changes campaign settings.
- HP: max hit die at 1st level, then the die's average rounded up at 2nd and 3rd, plus CON modifier per level, plus per-level bonuses (hill dwarf, Draconic Bloodline, Tough).
- Every effect that changes a number on the sheet is computed; effects with no number go in `featuresAndTraits` with the book text from the compendium.
- Wizard spellbook at 3rd level: 10 spells. Eldritch Knight and Arcane Trickster cast from 3rd level (third-caster table).
- The wizard offers only entries from the campaign's enabled books (`campaignId` on the compendium search); outside a campaign, every book of the system.
- No book text in git. Curated data lives in `materiais/.compendio/curation/` (git-ignored) and reaches the database through the importer. Code may hold slugs, numbers and short option names, never descriptions.
- Old sheets stay valid: every new sheet field is optional.
- UI copy in pt-BR and en (`frontend/src/i18n/locales/{pt-BR,en}.ts`); tests run in English.
- Test commands: backend `bash <berepo.sh> --runInBand --forceExit <paths relative to backend/>` (`<berepo.sh>` = the session's throwaway-container runner; never the whole suite at once); frontend `docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 <paths relative to frontend/>`.
- The sheet learns the campaign's detail level from `useCampaign()` when shown inside a campaign; outside one it shows weights.
- Doc-sync tests are updated in the task that causes them: `routeInventory.test.ts` TESTED + `routeInventory.expected.json`, `campaignRoleGuards.e2e.test.ts` lists, `keepInStep.test.ts` (broadcast fields, sheet type parity), `documentedFacts.test.ts`, `backend/docs/API_DOCUMENTATION.yaml`, `docs/API_REFERENCE.md`, `backend/prisma/README.md`, `backend/DATABASE_MIGRATIONS.md`, `docs/ARCHITECTURE.md`.

## Review Focus

- Changing an earlier step (race, class) after later choices: choices that no longer apply are cleared, the rest kept, and the review never shows a skill/spell the new class cannot have.
- A campaign whose GM removed `ROLL` after a player already rolled: the stored roll is still offered to that player (it was made under the old setting), no new roll is allowed.
- A campaign with a book turned off mid-wizard (e.g. `phb` off): the wizard shows an empty-state message, never crashes on missing entries.
- Duplicate skill from background and class: the class list offers a replacement choice, and the sheet never marks a skill twice.
- Two tabs rolling at once for the same scope: exactly one roll is stored and both tabs show it.

---

### Task 1: Campaign settings — backend

**Files:**
- Modify: `backend/prisma/schema.prisma` (`Campaign`: `abilityScoreMethods String[] @default(["POINT_BUY","STANDARD_ARRAY"])`, `detailLevel CampaignDetailLevel @default(FLEXIBLE)`; enum `CampaignDetailLevel { FAITHFUL FLEXIBLE }`)
- Create: `backend/prisma/migrations/20261115120000_campaign_creation_settings/migration.sql` (existing campaigns get the defaults)
- Modify: `backend/src/validators/campaigns.ts` (`CreateCampaignSchema`, `UpdateCampaignSchema`: `abilityScoreMethods: z.array(z.enum(['POINT_BUY','STANDARD_ARRAY','ROLL'])).min(1).max(3)` deduped, `detailLevel: z.enum(['FAITHFUL','FLEXIBLE'])`)
- Modify: `backend/src/routes/campaigns.ts` (POST and PUT `/:campaignId` copy both; add both to the `campaign.settings.updated` trigger list and to `CampaignSettingsUpdatedBroadcast`)
- Modify docs: `backend/docs/API_DOCUMENTATION.yaml` (Campaign schema + PUT body), `docs/API_REFERENCE.md` (PUT field list), `backend/prisma/README.md`, `backend/DATABASE_MIGRATIONS.md` if the migration writes rows
- Test: `backend/src/routes/__tests__/campaignCreationSettings.e2e.test.ts`

**Interfaces:**
- Produces: `Campaign.abilityScoreMethods: ('POINT_BUY'|'STANDARD_ARRAY'|'ROLL')[]`, `Campaign.detailLevel: 'FAITHFUL'|'FLEXIBLE'` on every campaign response; both in `CampaignSettingsUpdatedBroadcast`.

- [ ] **Step 1: Write the failing e2e test** — cases:
  - a campaign created through the API has `abilityScoreMethods` `['POINT_BUY','STANDARD_ARRAY']` and `detailLevel` `'FLEXIBLE'`;
  - the GM's PUT `{ abilityScoreMethods: ['ROLL'], detailLevel: 'FAITHFUL' }` → 200 and GET returns them;
  - PUT `{ abilityScoreMethods: [] }` → 400; `['DICE']` → 400; `['ROLL','ROLL']` stored as `['ROLL']`;
  - a player's PUT with either field → 403, nothing changed.
- [ ] **Step 2: Run** `bash <berepo.sh> --runInBand --forceExit src/routes/__tests__/campaignCreationSettings.e2e.test.ts` — Expected: FAIL (unknown fields stripped / defaults missing).
- [ ] **Step 3: Implement** schema, migration, validators, route and broadcast; update `frontend/src/types/index.ts` `CampaignSettingsUpdatedBroadcast`, `Campaign` and `UpdateCampaignRequest` so `keepInStep` holds; update the docs listed above.
- [ ] **Step 4: Run** the new test plus `src/__tests__/keepInStep.test.ts src/__tests__/documentedFacts.test.ts src/routes/__tests__/campaignRoleGuards.e2e.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `Let the GM pick ability methods and detail level per campaign`

### Task 2: Campaign settings — frontend

**Files:**
- Create: `frontend/src/components/campaign/CampaignCreationSettings.tsx` (props `{ methods: AbilityScoreMethod[]; detailLevel: DetailLevel; onChange(patch: Partial<{abilityScoreMethods: AbilityScoreMethod[]; detailLevel: DetailLevel}>): void; disabled?: boolean }`)
- Modify: `frontend/src/components/campaign/CampaignSettingsModal.tsx` (render it in the general tab right after `CampaignBooksPicker`, only when `campaign.gameSystem === FIFTH_EDITION`; save at once via `campaignService.updateCampaign` + `refreshCampaign()`, revert on failure as `handleBooks` does)
- Modify: `frontend/src/types/index.ts` (`export type AbilityScoreMethod = 'POINT_BUY'|'STANDARD_ARRAY'|'ROLL'; export type DetailLevel = 'FAITHFUL'|'FLEXIBLE'`)
- Modify: `frontend/src/i18n/locales/{en,pt-BR}.ts` (namespace `campaignCreation`)
- Test: `frontend/src/components/campaign/__tests__/CampaignCreationSettings.test.tsx`

**Interfaces:**
- Consumes: Task 1 fields.
- Produces: `AbilityScoreMethod`, `DetailLevel` types.

- [ ] **Step 1: Write the failing test** — three checkboxes (`Point buy`, `Standard array`, `Roll 4d6`) and a radio pair (`Faithful`, `Flexible`) reflect props; unticking the last ticked method is refused (the box stays ticked, `onChange` not called); ticking `Roll 4d6` calls `onChange({ abilityScoreMethods: ['POINT_BUY','STANDARD_ARRAY','ROLL'] })`; `disabled` disables every control.
- [ ] **Step 2: Run** `docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 src/components/campaign/__tests__/CampaignCreationSettings.test.tsx` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** the component, wire it in the modal (players see it disabled), add copy in both locales.
- [ ] **Step 4: Run** the new test plus `src/components/campaign/__tests__/CampaignSettingsModal.test.tsx src/components/campaign/__tests__/CampaignSettingsBooks.test.tsx`, then `npx tsc --noEmit -p .` — Expected: PASS; only the known horror-d100 fixture error.
- [ ] **Step 5: Commit** `Show creation settings in campaign settings`

### Task 3: Compendium references on the sheet

**Files:**
- Modify: `backend/src/validators/game-systems/fifthEdition.schema.ts`:
  - `compendiumRefSchema = z.object({ bookId: z.string().max(40), slug: z.string().max(120) })`;
  - optional `compendiumRef` on `spellSchema`, `attackSchema`, `inventoryItemSchema`;
  - `spellcastingSchema.cantripRefs: sheetList(z.object({ name: shortText.min(1), compendiumRef: compendiumRefSchema }))` optional (cantrips stay a name list);
  - top-level `origin: z.object({ race, subrace, class, subclass, background }: each compendiumRefSchema.optional() })` optional.
- Modify: `frontend/src/types/game-systems/fifthEdition.ts` (same fields; `export interface CompendiumRef { bookId: string; slug: string }`)
- Modify: `frontend/src/components/character-sheets/fifth-edition/FifthEditionCharacterEditor.tsx` (save normalisation ~l.1031 keeps the new fields; renaming a spell/attack/item by hand drops its `compendiumRef`)
- Test: `backend/src/validators/game-systems/__tests__/fifthEditionRefs.test.ts`, `frontend/src/components/character-sheets/fifth-edition/__tests__/compendiumRefs.test.tsx`

**Interfaces:**
- Produces: `CompendiumRef`, `FifthEditionCharacterData.origin`, `.spellcasting.cantripRefs`, `compendiumRef` on spell/attack/item — consumed by Task 9 (`buildSheet`).

- [ ] **Step 1: Write the failing tests** — backend: a sheet with refs parses and keeps them; a sheet without them still parses unchanged; a `slug` of 121 chars → error. Frontend: opening and saving an unchanged sheet with refs saves them unchanged; renaming a spell row saves it without `compendiumRef`.
- [ ] **Step 2: Run** both (backend via berepo.sh, frontend via vitest) — Expected: FAIL (refs stripped).
- [ ] **Step 3: Implement** schema, types, editor normalisation.
- [ ] **Step 4: Run** the new tests plus `src/__tests__/keepInStep.test.ts` (backend) and `src/components/character-sheets/fifth-edition/__tests__/editorLeavesSheetAlone.test.tsx` (frontend) — Expected: PASS.
- [ ] **Step 5: Commit** `Let a sheet point at compendium entries`

### Task 4: Typed curated data and the `full` list

**Files:**
- Modify: `backend/src/compendium/schemas.ts`:
  - `Class.startingEquipmentChoices?: EquipmentChoice[]`, `Background.startingEquipmentChoices?: EquipmentChoice[]`, where `EquipmentChoice = { options: EquipmentBundle[] }` (one option = fixed item), `EquipmentBundle = { items: { ref?: {type: 'weapon'|'armor'|'gear'|'tool'|'pack', slug: string}; anyOf?: 'simpleWeapon'|'martialWeapon'|'simpleMeleeWeapon'|'martialMeleeWeapon'|'instrument'|'artisanTool'|'gamingSet'; quantity: number }[]; gp?: number }`;
  - `Background.personality?: { traits: string[]; ideals: string[]; bonds: string[]; flaws: string[] }`;
  - feature `mechanics` stays `unknown` but when it has `spellsBySpellLevel` it must be `Record<'1'..'5', string[]>` of spell slugs (refine).
- Modify: `backend/src/routes/compendium.ts` (`GET /entries?full=true` returns `text` and `data` per item; with `full` the max `pageSize` is 200 as today)
- Modify: `frontend/src/services/api.ts` (`searchCompendium` accepts `full?: boolean`; return type `CompendiumEntry` items when full), `frontend/src/types/index.ts`
- Modify (git-ignored, not committed): `materiais/.compendio/curation/30-classes.data.json`, `40-backgrounds.data.json`, `30-subclasses.data.json` and their scripts — add `startingEquipmentChoices` for the 12 classes and 13 backgrounds, `personality` for the 13 backgrounds, and `spellsBySpellLevel` for every subclass with always-prepared or expanded spells (the 7 cleric domains, 3 paladin oaths, Circle of the Land per terrain as `spellsByTerrain`, the 3 warlock patrons). Then `run-all.sh` and `compendium:import -- /compendio/data --force`.
- Modify docs: `backend/docs/API_DOCUMENTATION.yaml` (`full` parameter)
- Test: `backend/src/compendium/__tests__/schemas.test.ts` (extend), `backend/src/routes/__tests__/compendiumFull.e2e.test.ts`

**Interfaces:**
- Produces: `searchCompendium({ type, campaignId, full: true, pageSize: 200, page })` → `{ items: CompendiumEntry[]; total }`; the data shapes above, mirrored as TS types in `frontend/src/utils/guidedCreation/compendiumData.ts` (`ClassData`, `SubclassData`, `RaceData`, `SubraceData`, `BackgroundData`, `SpellData`, `WeaponData`, `ArmorData`, `FeatData`).

- [ ] **Step 1: Write the failing tests** — schemas: a class with a valid `startingEquipmentChoices` passes; an item with neither `ref` nor `anyOf` fails; a background `personality` with a non-string fails; `spellsBySpellLevel` with key `'7'` fails. e2e: `full=true` returns `data` and `text`; without it, items have neither; with `campaignId` the book filter still applies.
- [ ] **Step 2: Run** them — Expected: FAIL.
- [ ] **Step 3: Implement** schemas, route flag, api/types; then curate the data in `materiais/` and re-import.
- [ ] **Step 4: Run** the tests, then `docker exec cozyvtt-backend npm run compendium:validate -- /compendio/data` — Expected: PASS, 0 issues; a SQL count shows 12 classes and 13 backgrounds with `startingEquipmentChoices`, 13 backgrounds with `personality`.
- [ ] **Step 5: Commit** (code and docs only) `Type the curated equipment, personality and subclass spells`

### Task 5: Ability-roll draft

**Files:**
- Modify: `backend/prisma/schema.prisma` (model `AbilityRoll { id, userId → User cascade, scope String /* campaignId or "none" */, campaignId String? → Campaign cascade, rolls Json /* six {dice:number[4], kept:number[3], total:number} */, createdAt; @@unique([userId, scope]) }`)
- Create: migration `20261115121000_ability_roll`
- Create: `backend/src/routes/abilityRolls.ts`, mounted at `/api/characters/ability-roll`:
  - `GET ?campaignId=` → `200 { roll: AbilityRollDto | null }`;
  - `POST { campaignId? }` → creates once (unique constraint; on conflict returns the existing one) → `200 { roll }`; refused `403` when the campaign's `abilityScoreMethods` lacks `ROLL` and no roll exists; non-member → 404 like characters;
  - in a campaign, a new roll also writes a `DiceRoll` (expression `4d6kh3`, purpose `Atributos`) per score and emits `dice.rolled` to the campaign.
- Modify: `backend/src/validators/characters.ts` + `routes/characters.ts` (`POST /characters` accepts `abilityRollId?`; deletes that roll in the same transaction when it belongs to the caller)
- Modify docs: API_DOCUMENTATION.yaml, API_REFERENCE.md, prisma README, ARCHITECTURE.md if it lists models, routeInventory TESTED + expected.json
- Test: `backend/src/routes/__tests__/abilityRolls.e2e.test.ts`

**Interfaces:**
- Produces: `api.getAbilityRoll(campaignId?: string): Promise<AbilityRollDto|null>`, `api.rollAbilities(campaignId?: string): Promise<AbilityRollDto>`, `AbilityRollDto = { id: string; rolls: { dice: number[]; kept: number[]; total: number }[] }`; `CreateCharacterRequest.abilityRollId?: string`.

- [ ] **Step 1: Write the failing e2e test** — POST twice returns the same id and totals; GET after POST returns it; totals are each 3..18 and equal the sum of `kept`, which are the 3 highest of `dice`; two concurrent POSTs → one row; campaign without `ROLL` → 403 with no roll, but an existing roll is still returned by GET and POST; a non-member's `campaignId` → 404; creating a character with `abilityRollId` deletes it and the next POST makes a new one; another user's `abilityRollId` is not deleted; in a campaign, POST creates 6 `DiceRoll` rows.
- [ ] **Step 2: Run** it — Expected: FAIL (404 route).
- [ ] **Step 3: Implement** model, migration, routes, character hook, docs; add the frontend api methods and types.
- [ ] **Step 4: Run** it plus `src/routes/__tests__/routeInventory.test.ts src/__tests__/documentedFacts.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit** `Roll ability scores once on the server`

### Task 6: Rules core — abilities, race, HP, AC, skills

**Files:**
- Create: `frontend/src/utils/guidedCreation/types.ts` — `CreationChoices` (everything the wizard picks: `raceSlug, subraceSlug?, classSlug, subclassSlug, backgroundSlug, method, baseScores: Record<AbilityKey, number>, abilityRollId?, racialChoices: Record<string, unknown>, skillPicks: SkillKey[], expertisePicks: SkillKey[], languagePicks: string[], toolPicks: string[], optionPicks: Record<string, string[]>, equipmentPicks: number[] /* option index per choice */, anyOfPicks: Record<string, string>, cantripSlugs: string[], spellSlugs: string[], details: {...} }`) and the `Effect` union:
  `ability | abilityChoice{count,amount,exclude?} | skill | skillChoice{count,from?} | expertiseChoice{count} | save | armorProficiency{armor:'light'|'medium'|'heavy'|'shield'} | weaponProficiency | toolChoice{count} | language | languageChoice{count} | hpPerLevel{amount} | unarmoredAC{base,abilities} | acBonus{amount,whenArmored} | initiative{amount} | passivePerception{amount} | speed{meters} | jackOfAllTrades | cantripChoice{count,list,ability} | spellChoice{count,level,list} | alwaysPrepared{slugs} | option{id,choose,options:{id,name,effects}[]} | attackBonus{attack:'eldritchBlast'|'unarmed'|'all',damage?:'ability'}`.
- Create: `frontend/src/utils/guidedCreation/abilities.ts` — `POINT_BUY_COST`, `STANDARD_ARRAY`, `pointBuySpent(scores): number`, `validateBaseScores(method, scores, roll?): string[]` (error keys), `finalScores(base, effects, picks): Record<AbilityKey, number>` (cap 20).
- Create: `frontend/src/utils/guidedCreation/raceRules.ts` — `RACE_EFFECTS: Record<slug, Effect[]>` for choices the data lacks: `meio-elfo` (abilityChoice 2×+1 excluding cha, skillChoice 2, languageChoice 1), `humano-variante` (abilityChoice 2×+1, skillChoice 1, feat 1), `draconato` (option `ancestry` ×1 of the 10 dragons with damage type), `alto-elfo` (cantripChoice 1 list `mago` ability int, languageChoice 1), `anao-da-colina` (hpPerLevel 1), `anao-da-montanha` (armorProficiency light, medium), `elfo-da-floresta` (speed +1.5); numbers from `abilityIncreases` in data.
- Create: `frontend/src/utils/guidedCreation/derived.ts` — `maxHitPoints(hitDie, level, conMod, perLevelBonus): number`, `armorClass(armor?, shield, dex, effects): number`, `resolveSkills(backgroundSkills, classPicks, extra, expertise)`, `proficiencyBonusFor(3) = 2` (reuse `proficiencyBonusForLevel` from `utils/rules/fifthEdition`).
- Test: `frontend/src/utils/guidedCreation/__tests__/{abilities,raceRules,derived}.test.ts`

**Interfaces:**
- Consumes: Task 4 TS data types; `abilityModifier`, `proficiencyBonusForLevel`, `FIFTH_EDITION_SKILLS` from `@/utils/rules/fifthEdition`.
- Produces: the signatures above.

- [ ] **Step 1: Write the failing tests** — `pointBuySpent({15,15,15,8,8,8}) === 27`; 16 or 7 in point buy → error key `outOfRange`; spent 28 → `overBudget`; standard array not a permutation → `notStandardArray`; ROLL scores not a permutation of the roll totals → `notRolled`; half-elf with +1 pick on cha → error; hill dwarf fighter CON 14: `maxHitPoints(10, 3, 2, 1) === 10+6+6+2*3+3 = 31`; wizard d6 CON 12 lvl 3 → `6+4+4+3 = 17`; AC: no armor DEX 16 → 13; barbarian unarmored DEX 14 CON 16 → 15; monk DEX 16 WIS 16 → 16; chain mail + shield + Defense → 19; scale mail DEX 18 → 16 (cap 2); a skill in both background and class picks counts once.
- [ ] **Step 2: Run** `docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 src/utils/guidedCreation` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** again — Expected: PASS.
- [ ] **Step 5: Commit** `Add the guided-creation rules core`

### Task 7: Class, subclass and feat rules up to 3rd level

**Files:**
- Create: `frontend/src/utils/guidedCreation/classRules.ts` — `CLASS_EFFECTS: Record<classSlug, Effect[]>` for levels 1–3: fighting style options (guerreiro: Arquearia, Defesa, Duelismo, Combate com Armas Grandes, Proteção, Combate com Duas Armas; paladino and patrulheiro their subsets), expertise (ladino 2 at 1st; bardo 2 at 3rd), Pau para Toda Obra (bardo), patrulheiro favored enemy and natural explorer options, bruxo invocations (2) and pact boon, feiticeiro metamagic (2), monge unarmed (attack with DEX and d4), bárbaro and monge unarmored AC.
- Create: `frontend/src/utils/guidedCreation/subclassRules.ts` — `SUBCLASS_EFFECTS: Record<subclassSlug, Effect[]>` with every PHB subclass whose 1st–3rd-level features change numbers or add choices (Linhagem Dracônica hpPerLevel 1 + unarmoredAC 13 dex; Vida/Tempestade heavy armor; Conhecimento expertise 2 + languages 2; Natureza cantrip druida + skill; Colégio do Conhecimento 3 skills; Mestre de Batalha 3 maneuvers + tool; Círculo da Terra terrain option → spells; Totem animal option; Quatro Elementos 1 discipline; Caçador prey option; Mestre das Feras companion option; Cavaleiro Místico and Trapaceiro Arcano casting — see Task 8).
- Create: `frontend/src/utils/guidedCreation/featRules.ts` — `FEAT_EFFECTS: Record<featSlug, Effect[]>` for every PHB feat with a number (robusto hpPerLevel 2, alerta initiative 5, observador passivePerception 5 + abilityChoice int|wis, movel speed 3, resiliente abilityChoice+save, habilidoso 3 skill-or-tool, iniciado-em-magia cantrips 2 + spell 1, and each half-feat's +1).
- Create: `frontend/src/utils/guidedCreation/collectEffects.ts` — `collectEffects(choices, data): { effects: Effect[]; pending: PendingChoice[] }`, where `PendingChoice = { id: string; kind: Effect['kind']; count: number; options?: {id,name}[] }` lists what the player still has to pick.
- Test: `frontend/src/utils/guidedCreation/__tests__/{classRules,collectEffects}.test.ts`

**Interfaces:**
- Consumes: Task 6 `Effect`, `CreationChoices`.
- Produces: `collectEffects`, `PendingChoice`; every slug in these tables exists in the compendium (test against a fixture list of PHB slugs saved under `__tests__/fixtures/phbSlugs.json`, slugs only).

- [ ] **Step 1: Write the failing tests** — every key in the three tables is a slug in `phbSlugs.json`; a fighter with no style picked has a pending `fightingStyle` with 6 options; a rogue has pending expertise 2 whose options are only its proficient skills; a sorcerer (Draconic) gets `hpPerLevel 1` and unarmored AC 13+DEX; a variant human with Tough gets `hpPerLevel 2`; switching class from fighter to wizard drops `optionPicks.fightingStyle` (via `pruneChoices(choices, data): CreationChoices`, also in `collectEffects.ts`).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** Option names are the short PHB names; descriptions come from the compendium feature text at render time.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `Add class, subclass and feat rules up to 3rd level`

### Task 8: Spells and equipment rules

**Files:**
- Create: `frontend/src/utils/guidedCreation/spellRules.ts` —
  - `spellcastingAt3(classSlug, subclassSlug, classData, abilityMod): { ability; cantrips: number; known?: number; prepared?: number; spellbook?: number; maxLevel: number; slots: number[] /* by level 1..9 */; pact?: { slots: 2; level: 2 } } | null`;
  - prepared = mod + level (clérigo, druida, mago), mod + floor(level/2) (paladino), min 1; mago spellbook 10; bruxo pact 2 slots of 2nd level; Cavaleiro Místico and Trapaceiro Arcano: 2 / 3 cantrips (Trapaceiro gets Mãos Mágicas fixed), 3 known, slots [2], schools abjuração/evocação and encantamento/ilusão with 1 free-school pick, list `mago`;
  - `availableSpells(spells, list, maxLevel, schools?): SpellEntry[]`;
  - `alwaysPreparedFor(subclassData, optionPicks): string[]` (reads `spellsBySpellLevel`/`spellsByTerrain` up to `maxLevel`).
- Create: `frontend/src/utils/guidedCreation/equipmentRules.ts` — `resolveEquipment(classData, backgroundData, picks, anyOfPicks, items): { inventory: InventoryItem[]; armor?; shield: boolean; weapons: WeaponEntry[]; gp: number }`; `attacksFor(weapons, scores, proficiencies, effects): Attack[]` (finesse uses the better of STR/DEX; ranged DEX; Archery +2 to hit ranged; Dueling +2 damage one-handed melee; proficiency only if proficient); cantrip attacks (e.g. Rajada Mística with Agonizing → +CHA damage).
- Test: `frontend/src/utils/guidedCreation/__tests__/{spellRules,equipmentRules}.test.ts`

**Interfaces:**
- Consumes: Task 4 data types, Task 7 effects.
- Produces: the functions above, consumed by Task 9.

- [ ] **Step 1: Write the failing tests** — cleric WIS 16 lvl 3: cantrips 3, prepared 6, slots [4,2]; wizard INT 16: spellbook 10, prepared 6; paladin CHA 14: prepared 3, slots [3]; warlock: known 4, cantrips 2, pact 2×2nd; Eldritch Knight: cantrips 2, known 3, slots [2], schools filter; ranger: known 3, slots [3], cantrips 0; Life domain gets its 1st and 2nd-level domain spells always prepared; `availableSpells` never returns a 3rd-level spell at 3rd level; rapier with DEX 16 STR 10, proficient: +5 to hit, `1d8+3`; longbow with Archery: +7 at DEX 16; Agonizing Blast at CHA 16: `1d10+3`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `Add spell and equipment rules for creation`

### Task 9: `buildSheet`

**Files:**
- Create: `frontend/src/utils/guidedCreation/buildSheet.ts` — `buildSheet(choices: CreationChoices, data: CreationData): FifthEditionCharacterData` (level 3, proficiencyBonus 2, stats with modifiers, saves, skills with bonuses, hp {max,current=max,temporary 0}, hitDice `[{class, die:'d<n>', maximum:3, remaining:3}]`, AC, initiative, speed (meters → the sheet's unit as `fifthEditionCharacterData.speed` uses today), passive perception, proficiencies boxes, languages, attacks, inventory, currency gp, featuresAndTraits with book text for race traits, class/subclass features ≤ 3rd level and picked options, spellcasting with refs, `origin` refs, details/personality).
- Create: `frontend/src/utils/guidedCreation/__tests__/fixtures/creationData.ts` — a hand-written `CreationData` with invented placeholder text (never book text) covering the 12 classes.
- Create: `frontend/src/utils/guidedCreation/__tests__/fixtures/sheets/<class>.json` — written by the test (one per class) for Task 9's backend check.
- Test: `frontend/src/utils/guidedCreation/__tests__/buildSheet.test.ts`, `backend/src/validators/game-systems/__tests__/guidedSheets.test.ts` (reads `../../frontend/src/utils/guidedCreation/__tests__/fixtures/sheets/*.json` and parses each with `fifthEditionCharacterDataSchema`)

**Interfaces:**
- Consumes: Tasks 3, 6, 7, 8.
- Produces: `buildSheet`, `CreationData = { race, subrace?, class, subclass, background, spells, weapons, armor, gear, packs, tools, feats }` (entries as `CompendiumEntry` with typed `data`).

- [ ] **Step 1: Write the failing tests** — for each of the 12 classes a sample `CreationChoices` builds a sheet where: level 3, no `NaN`, every skill bonus = mod + prof×(proficient + expertise), hp matches `maxHitPoints`, every spell has a `compendiumRef`, `origin.class.slug` is the class; the fighter sample (STR 16, chain mail, longsword, Defense) has AC 17 and longsword `+5`, `1d8+3`. Backend: all 12 JSON sheets parse.
- [ ] **Step 2: Run** frontend then backend — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both — Expected: PASS.
- [ ] **Step 5: Commit** `Build a 5e sheet from the creation choices`

### Task 10: Wizard shell and steps 1–5

**Files:**
- Create: `frontend/src/components/character/guided/GuidedCreationModal.tsx` (props `{ isOpen; onClose; onCreated(character: Character): void; campaign?: Campaign }`; full-screen `Modal`; left step list, centre step, right `SheetSummary`; on narrow screens the summary is a button that opens it)
- Create: `frontend/src/components/character/guided/useCreationData.ts` (`useCreationData(campaignId?): { data: CreationData | null; loading; error }` — loads every needed type with `searchCompendium({ full: true, pageSize: 200, campaignId })`, paging until `total`)
- Create: `frontend/src/components/character/guided/useCreationState.ts` (`useReducer` over `CreationChoices`; every change runs `pruneChoices` and reports what was cleared so the step shows a notice)
- Create: steps `RaceStep.tsx`, `ClassStep.tsx`, `SubclassStep.tsx`, `BackgroundStep.tsx`, `AbilitiesStep.tsx`, and `SheetSummary.tsx` under `guided/`
- Modify: i18n (namespace `guidedCreation`)
- Test: `frontend/src/components/character/guided/__tests__/{GuidedCreationSteps1to5,AbilitiesStep}.test.tsx` (mock `@/services/api` with `creationData` fixture)

**Interfaces:**
- Consumes: Tasks 2, 4, 5, 6, 7.
- Produces: `GuidedCreationModal`, `useCreationData`, `useCreationState(): { choices; dispatch; cleared: string[] }`.

- [ ] **Step 1: Write the failing tests** — the race step lists the fixture races and, after picking `Anão`, its subraces; Next is disabled until a required pick is made; going back to Class and changing fighter → wizard shows the notice "Some choices were cleared" and the fighting style is gone; abilities step shows only the campaign's methods (`['STANDARD_ARRAY']` → no point buy tab); point buy shows remaining points and blocks Next above 27; Roll calls `api.rollAbilities` once, shows six totals, and offers no re-roll button; reopening with an existing roll (`api.getAbilityRoll` resolves) shows it without calling `rollAbilities`; racial bonuses appear as separate `+2`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.** An empty compendium (books off) shows `guidedCreation.noBooks` instead of the steps.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `Add the guided-creation wizard, steps 1 to 5`

### Task 11: Steps 6–9

**Files:**
- Create: `guided/SkillsStep.tsx` (background skills shown fixed; class picks from its list; duplicates offer a replacement; languages and tools), `guided/ClassChoicesStep.tsx` (every `PendingChoice` of kind `option`/`expertiseChoice`/`cantripChoice` from race/class/subclass/feat, with the compendium feature text beside each option), `guided/EquipmentStep.tsx` (one radio group per `EquipmentChoice`; `anyOf` opens a select of matching compendium items; in `FAITHFUL` campaigns shows weight per item and total vs carrying capacity, in `FLEXIBLE` hides weight), `guided/SpellsStep.tsx` (hidden for non-casters; counters for cantrips/known/prepared/spellbook from `spellcastingAt3`; always-prepared spells shown locked; filter by level and text; spell text in a side panel)
- Test: `frontend/src/components/character/guided/__tests__/{SkillsStep,EquipmentStep,SpellsStep}.test.tsx`

**Interfaces:**
- Consumes: Tasks 6–10.

- [ ] **Step 1: Write the failing tests** — Acolyte (Insight, Religion) + cleric: Religion is not offered among class picks; picking 3 when the class allows 2 is blocked; equipment step for the fighter shows the "(a)/(b)" groups as radios and a martial weapon select; weight column visible only with `detailLevel 'FAITHFUL'`; spells step for the wizard counts 0/10 spellbook and blocks Next until 10 and 3 cantrips; a 3rd-level spell is never listed; for a fighter without Eldritch Knight the step is skipped.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `Add skills, class choices, equipment and spells steps`

### Task 12: Details, review, create — and the entry point

**Files:**
- Create: `guided/DetailsStep.tsx` (name required, alignment, appearance, personality with a "draw" button per field from `background.data.personality`, editable), `guided/ReviewStep.tsx` (the `buildSheet` result rendered with the existing `FifthEditionCharacterView` read-only; Create calls `api.createCharacter({ name, campaignId, gameSystem: FIFTH_EDITION, data: buildSheet(...), abilityRollId })`)
- Modify: `frontend/src/components/character/NewCharacterModal.tsx` (5e option `guided` labelled "Guided creation"; choosing it and pressing the main button opens `GuidedCreationModal` with the selected campaign instead of creating)
- Modify: `frontend/src/components/character-sheets/fifth-edition/components/InventoryList.tsx` (hides weight when the character's campaign is `FLEXIBLE`; prop `showWeight?: boolean`, default true)
- Test: `frontend/src/components/character/guided/__tests__/{ReviewStep,GuidedEntry}.test.tsx`, `.../fifth-edition/__tests__/inventoryWeight.test.tsx`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Write the failing tests** — Create is disabled while any step has pending choices, and the review lists them; Create posts the built sheet and `abilityRollId`, then calls `onCreated`; a server error keeps the wizard open with the message and every choice intact; NewCharacterModal with 5e shows "Guided creation" and opens the wizard; `InventoryList showWeight={false}` renders no weight.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them, the whole `src/components/character` and `src/utils/guidedCreation` folders, and `npx tsc --noEmit -p .` — Expected: PASS (only the known horror-d100 fixture error).
- [ ] **Step 5: Verify in the real app** (`docker restart cozyvtt-backend`, http://localhost:3000, test campaign `37ee8cec-e715-4518-8435-202fdb704e62`): set methods to standard array + roll and detail Faithful; create one character of each of the 12 classes through the wizard (one with Roll), open each sheet and check HP, AC, attacks and spells against the review; reopen the wizard after rolling and confirm the same roll returns.
- [ ] **Step 6: Commit** `Open the guided creation from New Character`
