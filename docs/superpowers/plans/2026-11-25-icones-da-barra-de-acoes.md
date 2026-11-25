# Ícones da barra de ações — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spells, common actions, checks and class features on the action bar show an icon left of their name, as items already do.

**Architecture:** The server's spell option gains two additive fields from the compendium (`damageType`, `school`). A pure front helper picks a game-icons.net icon (`react-icons/gi`, already used by `frontend/src/utils/itemIcons.ts`) for an option or a check; a small `ActionIcon` component draws it; the bar's menus put it beside each name.

**Tech Stack:** Node/Express (Jest) for the catalogue; React 19, Tailwind 4, react-icons, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-icones-da-barra-de-acoes-design.md`

## Global Constraints

- Free icons only: `react-icons/gi` (game-icons.net, CC BY 3.0, already credited in `THIRD_PARTY_CREDITS.md`); nothing from the books in git.
- The icon is decorative: `aria-hidden="true"`; button names and labels do not change (existing tests that find buttons by name keep passing).
- Size 24 px, like the item icons on the bar; drawn in the button's own text colour (`currentColor`), light and dark themes.
- Additive server change: `ActionOption` gains optional `damageType?: string` and `school?: string`, set only on character spell options built from a compendium entry; nothing in the database.
- Icons only on the action bar (not the sheet); 5e only.
- Commits: `git -c user.name=CheekyChinchilla -c user.email=154020855+CheekyChinchilla@users.noreply.github.com commit`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `.superpowers/`.

**Commands:**
- Front tests: `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 <paths>`
- Typecheck: `MSYS_NO_PATHCONV=1 docker exec -e NODE_OPTIONS=--max-old-space-size=2048 cozyvtt-frontend npx tsc --noEmit -p tsconfig.json` (only the known character-export error may remain)
- Back tests: `bash C:/Users/Usuario/AppData/Local/Temp/claude/44e4d72f1b5153f0/90da892d-7ec9-477b-8e57-853a2ce536d7/scratchpad/berepo.sh --runInBand --forceExit <paths>` (never the whole suite)

## Review Focus

1. A spell typed by hand on the sheet (no compendium entry): no `school`/`damageType` → generic spell icon, no crash — Task 1 (server omits the fields) and Task 2 test.
2. A damage type or school outside the known lists (a typo, another book's word, different case or accent) → the next rule in the order, never a missing icon — Task 2 test.
3. A healing spell that also has a damage line → heart wins — Task 2 test.
4. A common action taken as a bonus action (`common:dash:bonus`) → same icon as `common:dash` — Task 2 test.
5. A check whose `testName` is unknown (another system's roll) → a generic d20 icon — Task 2 test.

---

### Task 1: Spell options carry their damage type and school

**Files:**
- Modify: `backend/src/rules/actions/catalogue.ts` (`ActionOption` interface ~line 28; `spellSpec` ~line 240)
- Modify: `frontend/src/types/actions.ts` (`ActionOption`, same two fields)
- Test: `backend/src/rules/actions/__tests__/catalogue.test.ts`

**Interfaces:**
- Produces: `ActionOption.damageType?: string` — the first entry of `entry.data.mechanics.damage[].type` (Portuguese, as stored: 'fogo', 'radiante'…); `ActionOption.school?: string` — `entry.data.school` as stored (lowercase Portuguese: 'evocação'…). Both absent when the spell has no compendium entry or the value is missing/empty.

- [ ] **Step 1: Failing tests** in `catalogue.test.ts` (reuse its `spell(...)` fixture helper, adding `school` to the fixtures that need it):
  - `gives a damaging spell its first damage type and school`: Raio de Fogo with `school: 'evocação'` → option `damageType === 'fogo'`, `school === 'evocação'`.
  - `gives a spell without damage only its school`: Luz with `school: 'evocação'` → `damageType` undefined, `school === 'evocação'`.
  - `leaves a spell with no compendium entry without either`: a sheet spell whose ref is not in the map → both undefined (`not.toHaveProperty`).
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Add the fields to both `ActionOption` types and set them in `spellSpec` only when present.
- [ ] **Step 4:** Run `catalogue.test.ts` and `actionCard.test.ts` → PASS; front typecheck → only the known error.
- [ ] **Step 5:** Commit "Send each spell option's damage type and school to the action bar".

### Task 2: Choosing an icon

**Files:**
- Create: `frontend/src/utils/actionIcons.ts`
- Test: `frontend/src/utils/__tests__/actionIcons.test.ts`

**Interfaces:**
- Consumes: `ActionOption` (Task 1); `FIFTH_EDITION_SKILLS`, `ABILITY_LABELS` from `frontend/src/utils/rules/fifthEdition.ts`.
- Produces:
  ```ts
  export function actionIconFor(option: Pick<ActionOption, 'id' | 'group' | 'resolution' | 'damageType' | 'school'>): IconType;
  export function checkIconFor(testName: string | undefined): IconType;
  ```
  Plus exported constants `DAMAGE_ICONS` (keys: the 13 Portuguese damage types 'ácido', 'concussão', 'cortante', 'elétrico', 'energia', 'fogo', 'frio', 'necrótico', 'perfurante', 'psíquico', 'radiante', 'trovejante', 'veneno'), `SCHOOL_ICONS` (keys: 'abjuração', 'adivinhação', 'conjuração', 'encantamento', 'evocação', 'ilusão', 'necromancia', 'transmutação'), `COMMON_ICONS` (keys: 'common:dash', 'common:disengage', 'common:dodge', 'common:help', 'common:hide'), `ABILITY_ICONS` (keys: the six `AbilityKey`s), and `SPELL_ICON`, `FEATURE_ICON`, `CHECK_ICON`, `ACTION_ICON` fallbacks. Every value a `react-icons/gi` icon; each map's values distinct within the map.

Order in `actionIconFor`:
- `group === 'spell'`: `resolution === 'heal'` → heart; else `DAMAGE_ICONS[damageType]`; else `SCHOOL_ICONS[school]`; else `SPELL_ICON`. Lookup normalises case and trims.
- `group === 'common'`: `COMMON_ICONS[id without a trailing ':bonus']`, else `ACTION_ICON`.
- `group === 'feature'`: `FEATURE_ICON`.
- anything else: `ACTION_ICON`.

`checkIconFor`: an ability's English name (`ABILITY_LABELS` value, e.g. 'Strength') or a skill's label (`FIFTH_EDITION_SKILLS[].label`, mapped to its `ability`) → `ABILITY_ICONS[ability]`; otherwise `CHECK_ICON`.

- [ ] **Step 1: Failing tests** in `actionIcons.test.ts`:
  - `every damage type, school, common action and ability has its own icon`: each map has exactly the keys listed above and no two values equal within a map.
  - `a healing spell shows the heart even with a damage line`: `{group:'spell', resolution:'heal', damageType:'radiante'}` → the heal icon (not `DAMAGE_ICONS.radiante`).
  - `a damaging spell shows its damage type`: `damageType:'fogo', school:'evocação'` → `DAMAGE_ICONS.fogo`; `'Fogo '` → same.
  - `a spell without damage shows its school`: `school:'Ilusão'` → `SCHOOL_ICONS['ilusão']`.
  - `an unknown damage type falls back to the school, then the generic spell`: `damageType:'fire', school:'evocação'` → `SCHOOL_ICONS['evocação']`; nothing known → `SPELL_ICON`.
  - `a bonus-action common action shares its action's icon`: `common:dash:bonus` → `COMMON_ICONS['common:dash']`; `common:other` → `ACTION_ICON`.
  - `a feature shows the feature icon`.
  - `a check shows its ability's icon`: 'Strength' → `ABILITY_ICONS.str`; 'Sleight of Hand' → `ABILITY_ICONS.dex`; 'Luck' and undefined → `CHECK_ICON`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `actionIcons.ts`.
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit "Choose an icon for each spell, common action, check and feature".

### Task 3: Icons on the bar's buttons

**Files:**
- Create: `frontend/src/components/campaign/actionBar/ActionIcon.tsx`
- Modify: `frontend/src/components/campaign/actionBar/SpellMenu.tsx` (~line 58), `FeatureMenu.tsx` (~line 63), `ChecksMenu.tsx` (~line 86), `ActionBar.tsx` (common actions ~line 183)
- Test: `frontend/src/components/campaign/actionBar/__tests__/ActionIcons.test.tsx`

**Interfaces:**
- Consumes: `actionIconFor`, `checkIconFor` (Task 2).
- Produces: `export default function ActionIcon({ icon, size = 24 }: { icon: IconType; size?: number }): JSX.Element` — `<span aria-hidden="true" data-testid="action-icon">` with the icon at `size` in `currentColor`. Each button's content becomes `<span className="flex items-center gap-1.5"><ActionIcon …/><span className="truncate">{name}</span></span>`, the same shape the Items menu uses.

- [ ] **Step 1: Failing tests** in `ActionIcons.test.tsx`, rendering the bar through the existing `__tests__/barHarness.tsx` with a caster that has a spell, a feature, the common actions and the checks:
  - `shows an icon beside every spell`: open "Spells" → each spell button contains one `action-icon`, and is still found by `getByRole('button', { name: <spell name> })`.
  - `shows an icon beside each common action, feature and check` (open each menu in turn).
  - `the icon is hidden from screen readers`: every `action-icon` has `aria-hidden="true"`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Create `ActionIcon` and put it in the four menus.
- [ ] **Step 4:** Run this test, `ActionBar.test.tsx`, `useBarActor.test.tsx` and the typecheck → PASS.
- [ ] **Step 5:** Commit "Show icons beside spells, common actions, checks and features on the action bar".
