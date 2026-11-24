# P8 — Tradução do que acontece em jogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every text a player or the GM sees during a session (5e sheet, table, P7 panels, compact layout, in-game server refusals) shows in Portuguese, while the English UI keeps today's wording.

**Architecture:** Frontend text moves to the existing i18next keys (`frontend/src/i18n/locales/en.ts` types the keys, `pt-BR.ts` must match). Labels held in `.ts` constants become keys translated at render. Server refusals sent to the client during play are rewritten directly in Portuguese (approach A); strings the client compares stay as they are.

**Tech Stack:** React 19, i18next/react-i18next, Vitest + Testing Library (frontend); Node/Express/Socket.IO, Jest (backend).

**Spec:** `docs/superpowers/specs/2026-11-23-p8-traducao-em-jogo-design.md`

## Global Constraints

- Text only: no change of behaviour, layout, event names, payload shapes or `code` fields.
- Every new key exists in both `en.ts` and `pt-BR.ts` (the typecheck enforces it). The `en` value is today's on-screen text, letter for letter.
- Existing frontend tests run in English and must pass **unchanged**. A frontend test may change only if it asserted a server refusal text this plan rewrites; say so in the report.
- Reuse an existing key only when its English text is identical; otherwise add a key under the screen's group, reusing the same Portuguese term.
- Strings the client compares are protocol and never change: `'Unauthorized'` (`frontend/src/services/socket.ts:140`), the `'Rate limit exceeded'` prefix (`DiceRoller.tsx:442`), every English key of `frontend/src/utils/gmToolRefusal.ts` `KEYS`, `'Esse item não vai nesse espaço.'` (`ActionBar.tsx:148`). Before rewriting any server string, grep the frontend for it; a match means it stays.
- Files listed in `frontend/src/utils/__tests__/visionParity.test.ts` (shared front/back copies) are not edited; translate their labels at display.
- Server logs (`logger.*`, `console.*`) stay in English.
- Interpolation and plurals use i18next (`{{name}}`, `_one`/`_other`); pt-BR may reorder words. Dates/numbers on in-scope screens use the app language (`i18n.language`).
- Compendium names and dice-expression text (`1d20+3`) are shown as they come.
- No book text in git. Do not run the whole backend suite.
- Vocabulary (pt-BR), matching what `pt-BR.ts` already uses:
  Ability Scores → Atributos · Saving Throw(s) → Salvaguarda(s) · Skills → Perícias · Armor Class → Classe de Armadura · Initiative → Iniciativa · Proficiency Bonus → Bônus de proficiência · Inspiration → Inspiração · Hit Points → Pontos de vida (PV) · Temporary HP → PV temporários · Hit Dice → Dados de vida · Speed → Deslocamento · Experience → Experiência · Level → Nível · Spellcasting → Conjuração · Spell Slots → Espaços de magia · Cantrips → Truques · Advantage/Disadvantage → Vantagem/Desvantagem · Death Saves → Salvaguardas contra a morte · Conditions → Condições · Passive Perception → Percepção passiva · Fog of War → Névoa · Wall/Door/Window → Parede/Porta/Janela · Light (bright/dim) → Luz (forte/penumbra) · Token → token · GM → mestre · Player → jogador · Roll → rolar/rolagem · Saved rolls → Rolagens salvas · Everyone → Todos · Whisper → Sussurro. Ability abbreviations FOR, DES, CON, INT, SAB, CAR.
- Commits: `git -c user.name=CheekyChinchilla -c user.email=154020855+CheekyChinchilla@users.noreply.github.com commit`, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never commit `.superpowers/`.

**Commands**
- Frontend tests: `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 <paths>` (foreground, never `-u`/watch).
- Frontend typecheck: `MSYS_NO_PATHCONV=1 docker exec -e NODE_OPTIONS=--max-old-space-size=2048 cozyvtt-frontend npx tsc --noEmit -p tsconfig.json` — only the known character-export/horror-d100 error may remain.
- Backend tests: `bash C:/Users/Usuario/AppData/Local/Temp/claude/44e4d72f1b5153f0/90da892d-7ec9-477b-8e57-853a2ce536d7/scratchpad/berepo.sh --runInBand --forceExit <paths>`.
- Leftover scan (Task 1): `docker run --rm -v "C:/Users/Usuario/Projects/CozyVTT:/w" -w /w node:20-alpine node scripts/i18n-leftovers.mjs [--server]`.

## Review Focus

1. A screen in English after the change (language set to `en`) shows a raw key (`chat.to`) or a reworded text — the English test files are the guard; each task runs its screen's existing tests unchanged.
2. A server string the client compares gets translated and silently breaks a flow (re-login on `Unauthorized`, dice cooldown, GM-tool refusals mapped by `gmToolRefusal`) — Task 10 pins these with a test.
3. Text built by concatenation (`'Roll ' + name`) translated piecewise reads wrong in Portuguese — tasks must use one interpolated key per sentence; the pt-BR tests assert whole sentences.
4. Labels from `.ts` constants (menus, tabs, tools, conditions) still English in the compact "Mais" sheet and the token menu — Tasks 6 and 9 assert them in pt-BR.
5. Toasts and `aria-label`/`title` (invisible in a quick look) left in English — the leftover scan covers attributes, and each task's pt-BR test asserts at least one `title`/`aria-label`.

---

### Task 1: Leftover scan and the pt-BR test helper

**Files:**
- Create: `scripts/i18n-leftovers.mjs`
- Create: `frontend/src/test/inPortuguese.ts`
- Test: `frontend/src/test/__tests__/inPortuguese.test.ts`

**Interfaces:**
- Produces: `inPortuguese<T>(fn: () => T | Promise<T>): Promise<T>` — switches i18n to `pt-BR`, runs `fn`, always restores `en`.
- Produces: the scan, which prints `path:line: text` for each English leftover and a final `N leftovers` line; exit code 0 always (support tool).

- [ ] **Step 1: Write the failing test** `inPortuguese.test.ts`: `it('runs in pt-BR and restores English')` — inside, `expect(i18n.language).toBe('pt-BR')` and `expect(i18n.t('common.cancel')).not.toBe(i18n.getFixedT('en')('common.cancel'))` (use any `common` key whose texts differ); after, `expect(i18n.language).toBe('en')`. Second case `it('restores English when the body throws')`.
- [ ] **Step 2: Run** the test → FAIL (module missing).
- [ ] **Step 3: Implement `inPortuguese`.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Write `scripts/i18n-leftovers.mjs`.** No dependencies. Holds two lists:
  - `UI_SCOPE`: the in-scope frontend files/globs — `frontend/src/components/character-sheets/fifth-edition/**`, `frontend/src/components/campaign/{ChatPanel,ChatMessage,DiceRoller,DiceMacroManager,CharacterRollPicker,NpcRollPicker,InitiativeTracker,PersonalNotes,SessionHistory,EndSessionModal,CampaignRoster,TokenRoster,InvitePlayerModal,MapCanvas,TokenManager,MapManager,CreateMapModal,EditMapModal,CampaignSettingsModal,GmWallControls,GmLightControls,GmFogControls,SessionToolbar,TableRefusals}.tsx`, `frontend/src/components/campaign/{sessionTabs.ts,map/tokenMenuItems.ts,map/doorMenuItems.ts,map/previewSelection.ts}`, `frontend/src/components/campaign/compact/**`, `frontend/src/contexts/CampaignContext.tsx`, `frontend/src/pages/{CampaignPage,CharactersPage,CharacterEditorPage}.tsx`, `frontend/src/components/character/NewCharacterModal.tsx`, `frontend/src/utils/conditions.ts`; skip `__tests__` and `*.test.*`.
  - `SERVER_SCOPE` (with `--server`): `backend/src/websocket/**`, `backend/src/routes/{maps,characters,campaigns,campaignMacros,invitations,abilityRolls}.ts`, and `backend/src/services/**`; skip tests.
  - UI patterns: JSX text `>Capitalised English words<`, attributes `title|placeholder|aria-label|label="…"`, `label: '…'`, and string args of `showToast(`/`toast(`/`setError(`. Server patterns: `(message|error|reason): '…'` and `new Error('…')`/`throw …('…')` whose text starts with an English word. A line is a leftover when the text has an ASCII English word of 3+ letters from a small stop-list-free heuristic: no `ã õ ç á é í ó ú â ê ô à` and at least one word in a built-in list of common English words (`the, to, of, not, only, can, cannot, no, add, edit, delete, remove, save, cancel, close, roll, map, token, wall, light, fog, found, failed, invalid, must, is, are, you, your, select, show, hide, new, name, search`…). `ALLOW` array for protocol strings (`Unauthorized`, `Rate limit exceeded`) and the `gmToolRefusal` English keys.
- [ ] **Step 6: Run the scan** (UI, then `--server`) and save both outputs to the plan workspace as the baseline. Expected: a non-zero count each (hundreds), no crash.
- [ ] **Step 7: Commit** the three files: "Add the leftover scan and a helper that renders a test in Portuguese".

### Task 2: 5e sheet (view)

**Files:**
- Modify: `frontend/src/components/character-sheets/fifth-edition/FifthEditionCharacterView.tsx`, `components/{SpellcastingBlock,InventoryList,AttacksList,SkillsList,StatBlock,InventoryPanel}.tsx`, `FifthEditionCharacterSheet.tsx`
- Modify: `frontend/src/i18n/locales/{en,pt-BR}.ts` (group `sheet5e`)
- Test: `frontend/src/components/character-sheets/fifth-edition/__tests__/FifthEditionCharacterView.pt.test.tsx`

**Interfaces:** Consumes `inPortuguese` (Task 1). Produces the `sheet5e` key group, reused by Task 3 for identical English texts.

- [ ] **Step 1: Failing test** `it('shows the sheet in Portuguese')`: render the view with a 5e fixture (reuse the fixture of the existing view test) inside `inPortuguese`; assert visible `Atributos`, `Salvaguardas`, `Perícias`, `Classe de Armadura`, `Iniciativa`, `Bônus de proficiência`, `Inspiração`, `Experiência`, and `getByTitle('Editar personagem')`; assert `queryByText('Ability Scores')`, `'Saving Throws'`, `'Armor Class'` are null. Second case for spells/attacks/inventory headings with a fixture that has a spell, an attack and an item.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Move every visible text** in the files above to `sheet5e.*` keys (skill and ability names: use existing keys if the app has them, else add `sheet5e.skills.<id>` / `sheet5e.abilities.<id>`); damage types and conditions shown here translate at display via a key map, not by editing shared files.
- [ ] **Step 4: Run** the new test and every existing test under `fifth-edition/__tests__` → PASS, existing ones unchanged. Typecheck.
- [ ] **Step 5: Commit** "Show the 5e sheet in Portuguese".

### Task 3: 5e sheet (editor)

**Files:**
- Modify: `frontend/src/components/character-sheets/fifth-edition/FifthEditionCharacterEditor.tsx`; locales (`sheet5eEditor`, reusing `sheet5e` where English matches)
- Test: `.../fifth-edition/__tests__/FifthEditionCharacterEditor.pt.test.tsx`

- [ ] **Step 1: Failing test** `it('shows the editor in Portuguese')`: render the editor with a 5e fixture in `inPortuguese`; assert section headings (`Atributos`, `Salvaguardas`, `Perícias`, `Pontos de vida`, `Dados de vida`, `Conjuração`, `Espaços de magia`), the save and cancel buttons by role name, one `placeholder` and one `aria-label`; assert 5 of today's English headings are absent.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Translate** all 137 hits of the file (scan list from Task 1), including validation and toast texts.
- [ ] **Step 4: Run** new + existing editor tests, typecheck → PASS.
- [ ] **Step 5: Commit** "Show the 5e sheet editor in Portuguese".

### Task 4: Chat and dice

**Files:**
- Modify: `frontend/src/components/campaign/{ChatPanel,ChatMessage,DiceRoller,DiceMacroManager,CharacterRollPicker,NpcRollPicker}.tsx`; locales (`chat`, `dice`, `savedRolls`, `rollPicker`)
- Test: `frontend/src/components/campaign/__tests__/chatAndDice.pt.test.tsx`

- [ ] **Step 1: Failing tests**: ChatPanel in pt-BR shows the recipient select options `Todos` and the input `aria-label` `Mensagem do chat`; DiceRoller in pt-BR shows `placeholder` `Personagem`, `aria-label` `Expressão de dados`, title `Rolagens salvas — adicionar, editar ou apagar`; DiceMacroManager shows `Adicionar uma rolagem`. Mock the socket/context the way the existing tests of these components do.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Translate** the six files. The rate-limit message the DiceRoller shows is the client's own text (keep the `startsWith('Rate limit exceeded')` test on the server string).
- [ ] **Step 4: Run** new + existing tests of these components, typecheck → PASS.
- [ ] **Step 5: Commit** "Show the chat and the dice in Portuguese".

### Task 5: Initiative, notes, sessions and the party

**Files:**
- Modify: `frontend/src/components/campaign/{InitiativeTracker,PersonalNotes,SessionHistory,EndSessionModal,CampaignRoster,TokenRoster,InvitePlayerModal}.tsx`; locales
- Test: `frontend/src/components/campaign/__tests__/tableSide.pt.test.tsx`

- [ ] **Step 1: Failing tests**: InitiativeTracker heading `Iniciativa` and titles `Subir uma posição`/`Remover da iniciativa`; SessionHistory heading `Sessões anteriores`; PersonalNotes title `Nova nota`; EndSessionModal confirm button in Portuguese; CampaignRoster/TokenRoster one label each.
- [ ] **Step 2: Run** → FAIL. **Step 3: Translate.** **Step 4: Run** new + existing tests, typecheck → PASS.
- [ ] **Step 5: Commit** "Show the initiative, notes, sessions and party in Portuguese".

### Task 6: The map and its menus

**Files:**
- Modify: `frontend/src/components/campaign/MapCanvas.tsx` (visible text and toasts only), `TokenManager.tsx`, `map/{tokenMenuItems,doorMenuItems,previewSelection}.ts`, `frontend/src/utils/conditions.ts` (only if not in the parity list; else translate where shown); locales
- Test: `frontend/src/components/campaign/map/__tests__/menus.pt.test.ts` and `frontend/src/components/campaign/__tests__/TokenManager.pt.test.tsx`

**Interfaces:** Produces the pattern for constants: a constant's `label: string` becomes `labelKey: string` (an i18n key) and the renderer calls `t(labelKey)`. Task 9 uses the same pattern.

- [ ] **Step 1: Failing tests**: token-menu items built for a GM token, rendered through the menu component in pt-BR, have Portuguese labels (assert 3, e.g. the light submenu's existing `Luz` plus two that are English today); the door menu likewise; condition names shown on the token menu in pt-BR; TokenManager heading and `Sem personagem`. Zoom buttons: `getByRole('button', { name: 'Aproximar' })` / `'Afastar'` and the ping title, via the smallest render the existing MapCanvas tests already use.
- [ ] **Step 2: Run** → FAIL. **Step 3: Translate.** **Step 4: Run** new + existing map/menu/TokenManager tests, typecheck → PASS.
- [ ] **Step 5: Commit** "Show the map, its menus and the token manager in Portuguese".

### Task 7: Maps and campaign settings

**Files:**
- Modify: `frontend/src/components/campaign/{MapManager,CreateMapModal,EditMapModal,CampaignSettingsModal}.tsx`; locales
- Test: `frontend/src/components/campaign/__tests__/mapsAndSettings.pt.test.tsx`

- [ ] **Step 1: Failing tests**: each of the four in pt-BR shows its title and its main button in Portuguese and one field label; 2 English texts absent each.
- [ ] **Step 2–4:** Run → FAIL; translate; run new + existing, typecheck → PASS.
- [ ] **Step 5: Commit** "Show the map manager, the map modals and the campaign settings in Portuguese".

### Task 8: Walls, light and fog panels

**Files:**
- Modify: `frontend/src/components/campaign/{GmWallControls,GmLightControls,GmFogControls}.tsx`; locales (extend `gmLights`; add `gmWalls`, `gmFog`)
- Test: `frontend/src/components/campaign/__tests__/gmPanels.pt.test.tsx`

- [ ] **Step 1: Failing tests**: walls panel mode buttons by `aria-label` (`Desenhar paredes`, `Selecionar parede`, `Dividir parede`) and wall-type names; light panel `Predefinições`, `Forte`, `Penumbra`, `Cor`; fog panel heading `Névoa` and `aria-label` `Revelar área`/`Esconder área`.
- [ ] **Step 2–4:** Run → FAIL; translate; run new + existing panel tests, typecheck → PASS.
- [ ] **Step 5: Commit** "Show the walls, light and fog panels in Portuguese".

### Task 9: Compact layout, toolbar, campaign page and character entry

**Files:**
- Modify: `frontend/src/components/campaign/compact/*`, `sessionTabs.ts`, `SessionToolbar.tsx` (`TOOL_GROUPS` labels → `labelKey`), `frontend/src/contexts/CampaignContext.tsx` (toasts), `frontend/src/pages/{CampaignPage,CharactersPage,CharacterEditorPage}.tsx`, `frontend/src/components/character/NewCharacterModal.tsx`; locales
- Test: `frontend/src/components/campaign/compact/__tests__/MoreSheet.pt.test.tsx`, `frontend/src/components/character/__tests__/NewCharacterModal.pt.test.tsx`

**Interfaces:** Consumes the `labelKey` pattern from Task 6.

- [ ] **Step 1: Failing tests**: MoreSheet for a GM in pt-BR lists every panel and tool with a Portuguese label (assert none of today's English labels appear); BottomBar tab names in Portuguese; NewCharacterModal title and button.
- [ ] **Step 2–4:** Run → FAIL; translate; run new + existing compact/toolbar/page tests, typecheck → PASS.
- [ ] **Step 5: Commit** "Show the compact layout, the toolbar and character entry in Portuguese".

### Task 10: In-game socket refusals

**Files:**
- Modify: `backend/src/websocket/handlers/*.ts`, `backend/src/websocket/{events,auth}.ts`, and the `services/**` messages those handlers forward to the client
- Modify: backend tests asserting those texts (`backend/src/__tests__/**`)
- Test: `backend/src/__tests__/websocket/protocolStrings.test.ts`

- [ ] **Step 1: Pin test** `protocolStrings.test.ts`: the auth-failure error the socket middleware sends is exactly `'Unauthorized'`; the dice rate-limit refusal starts with `'Rate limit exceeded'`; the give-item/notice/secret-check flood and failure texts equal the `gmToolRefusal` keys (read them from the source where they are defined). Run → PASS (pins today's behaviour).
- [ ] **Step 2: Update test expectations first**: for every handler message to be rewritten, change the asserting test lines to the Portuguese text; run those tests → FAIL.
- [ ] **Step 3: Rewrite** each message in Portuguese (reuse `GM_ONLY` "Só o mestre pode fazer isso." from `services/gmNotice.ts` for every "Only the GM can …" refusal), skipping the pinned strings. Examples: "Map not found" → "Mapa não encontrado."; "Token not found" → "Token não encontrado."; "Token is already in initiative" → "Esse token já está na iniciativa."; "Spectators cannot roll initiative" → "Espectadores não rolam iniciativa."
- [ ] **Step 4: Run** the touched test files and `protocolStrings.test.ts` → PASS; `--server` scan shows no leftover under `websocket/`.
- [ ] **Step 5: Commit** "Write the in-game socket refusals in Portuguese".

### Task 11: Map routes

**Files:**
- Modify: `backend/src/routes/maps.ts` and its tests

- [ ] **Step 1:** Update test expectations of rewritten texts → run → FAIL.
- [ ] **Step 2:** Rewrite every client-facing message in `maps.ts` in Portuguese (validation messages included; reuse `GM_ONLY`), skipping strings the frontend compares (grep first).
- [ ] **Step 3:** Run the maps route tests → PASS; scan shows no leftover in `maps.ts`.
- [ ] **Step 4: Commit** "Write the map route refusals in Portuguese".

### Task 12: Character, campaign, saved-roll and invitation routes

**Files:**
- Modify: `backend/src/routes/{characters,campaigns,campaignMacros,invitations,abilityRolls}.ts` and their tests

- [ ] **Steps 1–3** as Task 11 for these five files.
- [ ] **Step 4: Commit** "Write the character, campaign, saved-roll and invitation refusals in Portuguese".

### Task 13: Leftover check and browser pass (controller)

- [ ] **Step 1:** Run the scan (UI and `--server`). Every remaining line is either fixed (new commit, with its pt-BR assertion in the owning task's test file) or justified in the ledger (proper noun, protocol, data).
- [ ] **Step 2:** In the browser at the dev stack, language pt-BR: as a player (test account) open the campaign, the 5e sheet, roll dice, chat, join initiative, move the token; as the GM use map, tokens, initiative, walls, light, fog, map manager, campaign settings; repeat at mobile width (`resize_window` mobile). Note any English text; fix it as in Step 1.
- [ ] **Step 3:** Switch to English and spot-check the same screens show today's wording.
- [ ] **Step 4:** Full frontend run of the touched test folders and typecheck → PASS (pre-existing failures listed in the ledger excepted).
