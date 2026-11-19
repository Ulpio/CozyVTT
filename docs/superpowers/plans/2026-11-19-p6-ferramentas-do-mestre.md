# P6 — Ferramentas do mestre Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The GM can roll a secret check for several characters at once with each sheet's bonus (the players see nothing), see everyone's passive Perception, send a player a private notice that pops up over their map and stays in the chat, and give an item from the compendium or a free one straight into a character's backpack.

**Architecture:** Two new server services: `gmNotice.ts` stores a GM→owner `WHISPER` with `metadata.kind = 'gmNotice'` and sends it only to the owner's and the GMs' sockets; `giveItem` in `services/inventory.ts` adds an item to the backpack through the P5d normaliser under the character's row lock and then sends the notice. Secret checks reuse the client's per-system check list (`getCharacterRolls`) to build one expression per character and a new GM-only socket event that rolls them all as secret dice rolls and acks the results. The client adds a "Teste secreto" panel (GM header "Mesa" menu and compact More list), a "Dar item…" dialog in the roster's character menu, and a notice card layer for the player.

**Tech Stack:** Node/Express/Prisma 7/Socket.IO (backend, Jest), React 19 + Zustand + Tailwind 4 + i18next (frontend, Vitest).

**Spec:** `docs/superpowers/specs/2026-11-19-p6-ferramentas-do-mestre-design.md`

## Global Constraints

- Every earlier Global Constraint still binds (see the P5d plan, `docs/superpowers/plans/2026-11-19-p5d-inventario-municao-racoes.md` lines 13-25): no book text in git; i18n pt-BR and en, frontend tests in English; commits authored as `CheekyChinchilla <154020855+CheekyChinchilla@users.noreply.github.com>` with the `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` trailer, subjects as plain sentences; never run the whole backend suite (scratchpad `berepo.sh` with explicit paths); `backend/src/utils` files with a frontend twin stay byte-identical.
- Only a GM of the campaign may roll a secret check, send a notice or give an item; anyone else is refused with **"Só o mestre pode fazer isso."**.
- A secret check leaves nothing on a player's side: no `dice.rolled`, no chat line, no toast. The server is the boundary: secret rolls go only to the roller (the GM) and the campaign's GMs.
- A notice is a `WHISPER` from the GM to the character's owner with `metadata: { kind: 'gmNotice', characterId: string, item?: { name: string; quantity: number } }`; no new message type, no migration. It reaches only the owner's sockets and the GMs'. Text 1–500 characters after trim; empty or longer → **"O aviso precisa ter de 1 a 500 caracteres."**.
- A notice needs an owner who is a PLAYER member of the campaign now; otherwise **"Esse personagem não tem jogador na mesa."** (a GM's own character, or an owner who left).
- Given items go to the backpack (no `slot`), through `normalizedSheet` (P5d): an `id`, ammunition bundles split into units, the same `compendiumRef` already in the backpack adds to its quantity. Quantity integer 1–999. A pack goes in closed.
- Item notice text: quantity 1 → `Você recebeu: <nome>`; more → `Você recebeu: <nome> ×<n>`.
- Passive Perception (5e only): the sheet's `passivePerception` when present; else `10 + <Perception skill bonus> + (passivePerceptionBonus ?? 0)`. Other systems show none.
- Unknown character in any event → **"Personagem não encontrado."**.

## Review Focus

1. A player's client, listening to every socket event during a secret check of their character, receives nothing — not `dice.rolled`, not `dice.rolled.secret`, not `chat.message` (Task 2 e2e asserts on a real player socket).
2. A notice to Ana's character with two players connected → only Ana's sockets and the GM's get it; the chat history fetched later by Bruno does not contain it, Ana's does (Task 1 e2e).
3. The GM gives "Flechas (20)" ×1 to a ranger who already has 5 "Flechas" in the backpack → one stack of 25, not two (Task 3 e2e).
4. The player has the sheet open when the GM gives an item → the item appears without a reload and is not lost on the player's next save (Task 3: `character.updated` emitted with the new inventory; Task 6 client test that the open sheet takes the update).
5. A character whose owner left the campaign → "Avisar…" is not offered and "Dar item…" still adds the item with no notice (Tasks 1, 3, 5).

---

### Task 1: The GM's private notice (server)

**Files:**
- Create: `backend/src/services/gmNotice.ts`
- Modify: `backend/src/websocket/handlers/characters.ts` (or a new `handlers/gm.ts` registered where the others are), the flood-ceiling table (`websocket/handlers/shared.ts` or wherever `withinCeiling` reads limits), `backend/docs/WEBSOCKET_DOCUMENTATION.md`, the chat-history route so a `WHISPER`'s `metadata` reaches its reader
- Test: `backend/src/services/__tests__/gmNotice.e2e.test.ts`

**Interfaces:**
- `export const GM_ONLY = 'Só o mestre pode fazer isso.'`, `NOTICE_LENGTH = 'O aviso precisa ter de 1 a 500 caracteres.'`, `NO_PLAYER = 'Esse personagem não tem jogador na mesa.'`, `NO_CHARACTER = 'Personagem não encontrado.'` (exported from `gmNotice.ts`; Task 3 imports `GM_ONLY` and `NO_CHARACTER`).
- `export async function noticeRecipient(campaignId: string, characterId: string): Promise<string | null>` — the owner's userId when they are a PLAYER member now, else null.
- `export async function sendNotice(campaignId: string, requester: Viewer, characterId: string, text: string, item?: { name: string; quantity: number }): Promise<{ ok: true; messageId: string } | Refusal>` — stores and emits `chat.message` with the usual payload plus `metadata`.
- Socket `gm.notice { characterId: string; text: string }` → ack `{ ok: true }` or the refusal.

- [ ] **Step 1: Failing tests** (real DB like `rest.e2e.test.ts`, with sockets or the emit spy the P5c/P5d e2e tests use): GM sends "Você percebe um brilho" to Ana's character → one `WHISPER` row, `recipientId` Ana, `metadata.kind === 'gmNotice'`, emitted to Ana's and the GM's sockets only (Bruno's socket gets nothing); a player sending → `GM_ONLY`; "" and 501 chars → `NOTICE_LENGTH`; the GM's own character and a character whose owner left → `NO_PLAYER`; unknown id → `NO_CHARACTER`; Review Focus 2: history for Bruno lacks it, for Ana has it with `metadata.kind`.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/services/__tests__/gmNotice.e2e.test.ts` → FAIL.
- [ ] **Step 3: Implement** (the sending to sockets follows `services/gmWhisper.ts`).
- [ ] **Step 4: Run** it plus the existing chat handler tests (`src/websocket/__tests__` files matching `chat`) → PASS. Backend tsc.
- [ ] **Step 5: Commit** — "Let the GM send a player a private notice about their character".

### Task 2: Secret checks rolled by the server (server)

**Files:**
- Modify: `backend/src/websocket/handlers/dice.ts` (new event next to `dice.roll`, reusing its roller and the `DiceRoll` row with `secret: true`), ceiling table, websocket docs
- Test: `backend/src/websocket/__tests__/secretCheck.integration.test.ts`

**Interfaces:**
- Socket `gm.secretCheck { rolls: Array<{ characterId: string; expression: string; purpose: string; characterName: string }> }` (1–20 rolls; each expression validated like `dice.roll`'s) → ack `{ ok: true; results: Array<{ characterId: string; total: number; dice: number[]; breakdown: string }> }` or a refusal. Each roll is stored as a secret `DiceRoll` by the GM and sent with `dice.rolled` to the GM's own socket and `dice.rolled.secret` to the other GMs, exactly as a secret `dice.roll` is; nothing to anyone else.

- [ ] **Step 1: Failing tests:** GM rolls two characters' `1d20+5` / `1d20+2` → ack with two results whose totals match the stored rows, both rows `secret: true`; Review Focus 1: a connected player socket records zero events during the call; a player calling it → `GM_ONLY`; 21 rolls or a bad expression → refused, nothing stored.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/websocket/__tests__/secretCheck.integration.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus the existing dice handler tests → PASS. Backend tsc.
- [ ] **Step 5: Commit** — "Roll a secret check for several characters at once, seen by the GM alone".

### Task 3: Giving an item (server)

**Files:**
- Modify: `backend/src/services/inventory.ts` (`giveItem`), `backend/src/websocket/handlers/characters.ts`, ceiling table, websocket docs
- Test: `backend/src/services/__tests__/giveItem.e2e.test.ts`

**Interfaces:**
- Consumes: Task 1 `sendNotice`, `GM_ONLY`, `NO_CHARACTER`, `noticeRecipient`; P5d `normalizedSheet`, `holdSheets`/`writeSheets`, `emitCharacterUpdated`.
- `export async function giveItem(campaignId: string, requester: Viewer, characterId: string, item: { ref: { bookId: string; slug: string } } | { name: string; notes?: string }, quantity: number): Promise<{ ok: true; itemId: string; noticeSent: boolean } | Refusal>` — a ref must be a `weapon|armor|gear|tool|pack|magicItem` entry of a book enabled in the campaign, else **"Item não encontrado no compêndio."**; the new item takes the entry's `name`, weight (kg×2 → lb, as `openPack`) and `compendiumRef`; then `sendNotice` with the item when `noticeRecipient` is not null.
- Socket `character.item.give { characterId, ref?: { bookId, slug }, name?: string, notes?: string, quantity: number }` (exactly one of `ref`/`name`) → ack `{ ok: true, noticeSent }`.

- [ ] **Step 1: Failing tests:** GM gives `pocao-de-cura` ×2 → backpack has "Poção de Cura" quantity 2 with an `id` and no `slot`, `character.updated` emitted, Ana got the notice "Você recebeu: Poção de Cura ×2"; free "Mapa rasgado" ×1 → notice "Você recebeu: Mapa rasgado"; Review Focus 3 (5 "Flechas" + "Flechas (20)" ×1 → one stack of 25); a pack goes in with no slot and still opens with `openPack`; Review Focus 5 (owner left → item added, `noticeSent: false`); player → `GM_ONLY`; quantity 0 / 1000 → refused; a ref from a book not enabled → refused.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/services/__tests__/giveItem.e2e.test.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `src/services/__tests__/inventory.e2e.test.ts` → PASS. Backend tsc.
- [ ] **Step 5: Commit** — "Let the GM give a character an item from the compendium or a free one".

### Task 4: The player's notice card (client)

**Files:**
- Create: `frontend/src/components/campaign/GmNoticeCards.tsx`, a small store or slice for pending notices
- Modify: the desktop and compact tables (`DesktopTable.tsx`, `compact/CompactTable.tsx`) to render it; `ChatMessage.tsx` (a notice shows with a distinct label, "Aviso do mestre"); the frontend chat message type (`metadata?`); i18n
- Test: `frontend/src/components/campaign/__tests__/GmNoticeCards.test.tsx`

**Interfaces:**
- A live `chat.message` whose `metadata.kind === 'gmNotice'` and `recipientId` is the viewer adds a card (text, or the item line with its `ItemIcon` when `metadata.item` exists); cards stack newest on top; each has "Fechar"; history loaded on page open never raises cards. The GM (sender) gets no card.

- [ ] **Step 1: Failing tests:** a notice for me shows a card with its text and closes on "Close"; two notices stack; a notice for someone else or a plain whisper shows no card; an item notice shows "Você recebeu…" with an icon; the chat row shows the "GM notice" label.
- [ ] **Step 2: Run** `MSYS_NO_PATHCONV=1 docker exec cozyvtt-frontend npx vitest run src/components/campaign/__tests__/GmNoticeCards.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus the existing `ChatMessage`/`ChatPanel` tests → PASS. Frontend tsc.
- [ ] **Step 5: Commit** — "Show the GM's notice as a card over the player's map".

### Task 5: The "Teste secreto" panel (client)

**Files:**
- Create: `frontend/src/utils/secretCheck.ts`, `frontend/src/components/campaign/SecretCheckPanel.tsx`
- Modify: `SessionToolbar.tsx` (`SessionToolKey` gains `'secretCheck'`, in the compact More list), `GmToolMenus.tsx` (the `table` menu's first entry), the page that opens tools (`SessionPanels.tsx` or wherever `onOpen(key)` mounts panels), socket helpers for `gm.secretCheck` and `gm.notice`, i18n
- Test: `frontend/src/utils/__tests__/secretCheck.test.ts`, `frontend/src/components/campaign/__tests__/SecretCheckPanel.test.tsx`

**Interfaces:**
- `export type CheckKey = { group: 'skills' | 'abilities' | 'savingThrows'; label: string }`; `export function checkChoices(sheets: Array<{ gameSystem: string | null; data: unknown }>): CheckKey[]` (the union, in the order `getCharacterRolls` gives, grouped); `export function checkFor(gameSystem, data, key: CheckKey): RollOption | null`; `export function passivePerception(gameSystem, data): number | null` (Global Constraints rule).
- Panel: the campaign's characters (the roster's), all ticked; a grouped select; normal/advantage/disadvantage like the bar (`applyRollMode`); "Rolar" sends one `gm.secretCheck` with a roll per ticked character that has the check (`purpose` = `Teste secreto: <check>`), shows per character name, total, the die and bonus (natural 20/1 marked), "não tem esse teste" for the others; passive Perception list on top; "Avisar…" per result opens an inline text box (500 max) sending `gm.notice`, hidden with a hint when the character has no player at the table (owner not a PLAYER member); ack refusals show in the panel.

- [ ] **Step 1: Failing tests:** `checkChoices` for a 5e fighter and wizard lists Percepção under skills once; `passivePerception` uses the stored value, else computes; a d100 sheet's skill appears with its percentage roll; panel: ticking two and rolling Percepção emits one `gm.secretCheck` with two rolls; results render from the ack; "Avisar…" sends `gm.notice { characterId, text }`; no "Avisar…" for a GM-owned character; the entry appears in the "Table" menu for the GM only.
- [ ] **Step 2: Run** `… vitest run src/utils/__tests__/secretCheck.test.ts src/components/campaign/__tests__/SecretCheckPanel.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** them plus `GmToolMenus`/`SessionToolbar` tests → PASS. Frontend tsc.
- [ ] **Step 5: Commit** — "Add the GM's secret check panel with passive Perception and private notices".

### Task 6: "Dar item…" in the character menu (client)

**Files:**
- Create: `frontend/src/components/campaign/GiveItemDialog.tsx`
- Modify: `CampaignRoster.tsx` (`characterMenuItems`: "Dar item…" for the GM), socket helper for `character.item.give`, i18n
- Test: `frontend/src/components/campaign/__tests__/GiveItemDialog.test.tsx`

**Interfaces:**
- Dialog: a search over `api.searchCompendium` limited to `weapon|armor|gear|tool|pack|magicItem` and the campaign's books, results with `ItemIcon`; or "Item livre" (name ≤ 120, notes ≤ 500); quantity 1–999; "Dar" sends `character.item.give`; the ack's refusal shows in the dialog; success closes and says "Item entregue" (or "Item entregue, sem aviso: ninguém joga com esse personagem" when `noticeSent` is false).
- The open sheet takes `character.updated` (already the case since P5d; Review Focus 4 test pins it).

- [ ] **Step 1: Failing tests:** the GM's roster menu has "Give item…", a player's has not; picking "Poção de Cura" ×2 emits `character.item.give { characterId, ref: { bookId: 'phb', slug: 'pocao-de-cura' }, quantity: 2 }`; free item emits `{ name, notes, quantity }`; a refusal shows; Review Focus 4: an open `FifthEditionCharacterView` re-renders the backpack when the store gets `character.updated` with a new item.
- [ ] **Step 2: Run** `… vitest run src/components/campaign/__tests__/GiveItemDialog.test.tsx` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** it plus `CampaignRoster` tests → PASS. Frontend tsc.
- [ ] **Step 5: Commit** — "Let the GM give an item from a character's menu".

### Task 7: The done-when session (server, end to end)

**Files:**
- Create: `backend/src/services/__tests__/p6.e2e.test.ts`

- [ ] **Step 1: Write the test** following the spec's "Pronto quando" with three characters (two players): one `gm.secretCheck` for the three → results to the GM, nothing to either player socket; a notice to the ranger → only her player and the GM; give "Poção de Cura" ×2 to the fighter (compendium, skipped when `/compendio/data` is absent, like the P5d one) → backpack and notice; give "Mapa rasgado" → same.
- [ ] **Step 2: Run** `berepo.sh --runInBand --forceExit src/services/__tests__/p6.e2e.test.ts` → PASS (fix the owning task's code, not the test).
- [ ] **Step 3: Commit** — "Play the P6 done-when session end to end".
