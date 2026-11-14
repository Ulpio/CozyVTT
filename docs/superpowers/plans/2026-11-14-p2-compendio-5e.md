# P2 — Compêndio 5e: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os livros do dono (Livro do Jogador, Manual dos Monstros, Guia do Mestre) viram dados no banco, buscáveis em português e inglês, com mecânica estruturada onde o M1 calcula e um editor de correções.

**Architecture:** Tabelas novas `CompendiumBook` e `CompendiumEntry` para tudo menos monstros; monstros como linhas globais de `CreatureTemplate` (`source = 'mm'`). Ferramentas em `backend/src/compendium/` (esquemas zod, parsers puros, importador, CLI) produzem e leem JSON em `materiais/.compendio/` (fora do git). A curadoria (feita por Claude lendo o texto extraído) escreve nos mesmos JSON. Rotas de leitura em `/api/compendium`, uma aba "Compêndio" no admin para corrigir entradas, e o editor de criaturas passa a aceitar correções do admin em criaturas globais de livro.

**Tech Stack:** Node/TypeScript, Express, Prisma/PostgreSQL, zod 4, Jest + supertest (backend), React 19 + Vitest (frontend), `pdftotext` (poppler, Git Bash).

**Spec:** `docs/superpowers/specs/2026-11-14-p2-compendio-5e-design.md`

## Global Constraints

- Nenhum texto dos livros no repositório: testes usam textos inventados no formato dos livros; dados reais só em `materiais/.compendio/` (já ignorado pelo git).
- Livros: `phb` "Livro do Jogador", `mm` "Manual dos Monstros", `dmg` "Guia do Mestre", `srd` "SRD 5.1 (inglês)"; todos `gameSystem = FIFTH_EDITION`.
- Tipos de entrada, exatamente: `spell`, `race`, `subrace`, `class`, `subclass`, `background`, `feat`, `weapon`, `armor`, `gear`, `tool`, `pack`, `magicItem`, `condition`.
- Unicidade de entrada: (`bookId`, `type`, `slug`). Monstros: (`source`, `name`) entre as linhas globais.
- Mecânica estruturada (`mechanics`) só em magias de nível 0 a 2; itens mágicos comuns com `bonus`/`effect`.
- Uma entrada ou criatura com `editedAt` não é sobrescrita por `import` sem `--force`.
- Itens mágicos: a busca só os mostra ao admin (`platformRole === 'ADMIN'`).
- Backend aditivo: uma migração com tabelas e colunas novas; a única mudança de comportamento numa rota existente é a do Task 8.
- Texto de interface novo em pt-BR e en (`frontend/src/i18n/locales/`); testes do frontend leem em inglês.
- Testes do backend rodam no contêiner de dev contra `cozyvtt_test`: `docker exec -i cozyvtt-backend sh -c 'export DATABASE_URL=$(echo "$DATABASE_URL" | sed "s#/cozyvtt\$#/cozyvtt_test#"); npx jest <caminhos>'`. Frontend: `docker exec cozyvtt-frontend npx vitest run --maxWorkers=4 <caminhos>`. No Git Bash, pôr `/c/Program Files/Docker/Docker/resources/bin` no `PATH`.
- Commits com o autor `CheekyChinchilla <154020855+CheekyChinchilla@users.noreply.github.com>` e a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Uma entrada partida por quebra de página** (o texto extraído põe uma linha em branco e continua o parágrafo depois). Esperado: o parser junta o texto; a magia seguinte não engole o resto. Teste no Task 3, `joins a spell split by a page break`.
2. **Busca sem acento ou com outra caixa** ("misseis magicos", "MÍSSEIS MÁGICOS", "Misseis"). Esperado: acha "Mísseis Mágicos". Teste no Task 7, `finds by name without accents or case`.
3. **Mesmo nome em tipos diferentes** ("Escudo" magia e "Escudo" armadura). Esperado: as duas entradas existem e a busca devolve as duas, cada uma com seu `type`. Teste no Task 6 (import) e no Task 7 (busca).
4. **Modificadores de monstro com travessão** (`FOR 8 (–1)` com "–" U+2013, às vezes "-"). Esperado: lidos como −1. Teste no Task 4, `reads modifiers written with an en dash`.
5. **Reimportar depois de uma correção.** Esperado: a correção fica, o relatório diz que pulou. Teste no Task 6 (entradas e monstros).

---

## Parte A — Código

### Task 1: Tabelas do compêndio e marca de edição em criaturas

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20261114120000_compendium/migration.sql`
- Test: `backend/src/compendium/__tests__/compendiumSchema.e2e.test.ts`

**Interfaces:**
- Produces: modelos Prisma `CompendiumBook { id String @id; name String; gameSystem GameSystem; entries CompendiumEntry[] }` e `CompendiumEntry { id String @id @default(uuid()); bookId String; type String; slug String; name String; nameEn String?; search String; text String; data Json; editedAt DateTime?; editedById String?; createdAt; updatedAt; @@unique([bookId, type, slug]); @@index([type]); @@index([bookId]); @@index([search]) }`. `search` = nome e nome em inglês sem acento, em minúsculas, separados por espaço (preenchido por `searchKey`, Task 2). `CreatureTemplate` ganha `editedAt DateTime?` e `editedById String?`.

- [ ] **Step 1: Escrever o teste**

```ts
it('has the four books after migrating', async () => {
  const ids = (await prisma.compendiumBook.findMany({ orderBy: { id: 'asc' } })).map((b) => b.id);
  expect(ids).toEqual(['dmg', 'mm', 'phb', 'srd']);
});
it('refuses a second entry with the same book, type and slug', async () => {
  const base = { bookId: 'phb', type: 'spell', slug: 'teste-p2', name: 'Teste', search: 'teste', text: '', data: {} };
  await prisma.compendiumEntry.create({ data: base });
  await expect(prisma.compendiumEntry.create({ data: base })).rejects.toThrow();
});
```
(Apagar as entradas `slug: 'teste-p2'` no `afterAll`.)

- [ ] **Step 2: Rodar e ver falhar** — Expected: erro de tipo/`compendiumBook` inexistente.
- [ ] **Step 3: Modelos no `schema.prisma` e a migração em SQL escrita à mão**, que cria as tabelas, as colunas novas de `CreatureTemplate` e insere os quatro livros com os nomes das Global Constraints. Aplicar no dev e no test com `npx prisma migrate deploy` (as duas `DATABASE_URL`) e `npx prisma generate`; reiniciar `cozyvtt-backend`.
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `Add compendium tables and an edited mark on creatures`

### Task 2: Esquemas e validação das entradas

**Files:**
- Create: `backend/src/compendium/types.ts`, `backend/src/compendium/schemas.ts`, `backend/src/compendium/searchKey.ts`
- Test: `backend/src/compendium/__tests__/schemas.test.ts`, `backend/src/compendium/__tests__/searchKey.test.ts`

**Interfaces:**
- Produces:
  - `type CompendiumType` (os 14 da Global Constraints); `interface RawEntry { type: CompendiumType; slug: string; name: string; nameEn?: string; text: string; data: unknown }`; `interface RawMonster { name: string; creatureType?: string; alignment?: string; challengeRating?: string; statBlock: unknown }`; `interface Issue { where: string; message: string }`.
  - `entryDataSchemas: Record<CompendiumType, z.ZodType>` com os campos do spec (seção "O que cada tipo guarda em `data`"); `spell.mechanics` opcional e recusado quando `level > 2`.
  - `validateEntries(entries: RawEntry[], known: { classSlugs: Set<string> }): Issue[]` — esquema por tipo + checagens: dado `^\d+d\d+( ?[+-] ?\d+)?$`, tipos de dano da lista 5e em pt-BR (ácido, contundente, cortante, elétrico, energia, fogo, frio, necrótico, perfurante, psíquico, radiante, trovejante, veneno), CA 5–30, slug único por tipo, `spell.data.classes` ⊂ `known.classSlugs`.
  - `validateMonsters(monsters: RawMonster[]): Issue[]` — `NpcStatBlockSchema` (de `validators/statBlock`) + ND na lista `0, 1/8, 1/4, 1/2, 1…30`.
  - `searchKey(...names: (string | undefined)[]): string` — sem acento (NFD sem marcas), minúsculas, espaços simples.
  - `slugify(name: string): string` — `searchKey` com hífens no lugar de espaços e sem pontuação.

- [ ] **Step 1: Testes** (dados inventados): `accepts a valid level-1 spell with mechanics`; `rejects mechanics on a level-3 spell`; `rejects damage dice "1d"`; `rejects an unknown damage type`; `rejects armor with AC 40`; `reports a spell naming an unknown class`; `rejects a monster with challenge rating "3/7"`; `searchKey("Mísseis Mágicos", "Magic Missile") === "misseis magicos magic missile"`; `slugify("Riso Histérico de Tasha") === "riso-histerico-de-tasha"`.
- [ ] **Step 2: Rodar e ver falhar.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `Add compendium entry schemas and validation`

### Task 3: Parser de magias e das listas por classe

**Files:**
- Create: `backend/src/compendium/parse/spells.ts`
- Test: `backend/src/compendium/parse/__tests__/spells.test.ts` (fixture inventada em `__tests__/fixtures/spells.txt`)

**Interfaces:**
- Consumes: `RawEntry`, `slugify`.
- Produces: `parseSpells(text: string): { entries: RawEntry[]; unrecognized: string[] }` — cada magia com `data: { level, school, castingTime, range, components: { v, s, m, material? }, duration, concentration, ritual, classes: [] , higherLevels? }` e `text`; `parseClassSpellLists(text: string): Map<string /*slug da magia*/, string[] /*slugs de classe*/>` a partir de `MAGIAS DE <CLASSE>`; `CLASS_SLUGS` (`barbaro`, `bardo`, `bruxo`, `clerigo`, `druida`, `feiticeiro`, `guerreiro`, `ladino`, `mago`, `monge`, `paladino`, `patrulheiro`).

Formato reconhecido: título em maiúsculas sozinho na linha; linha seguinte começando com `N° nível de <escola>` ou `Truque de <escola>`, com `Tempo de Conjuração:`, `Alcance:`, `Componentes:`, `Duração:` na mesma linha ou nas próximas; `Concentração,` em Duração liga `concentration`; `(ritual)` liga `ritual`; parágrafo `Em Níveis Superiores.` vai para `higherLevels`. Lista por classe: `MAGIAS DE X`, depois blocos `TRUQUES (NÍVEL 0)` / `N° NÍVEL` com `Nome (escola[, ritual])` em sequência.

- [ ] **Step 1: Testes:** `parses a cantrip and a leveled spell`; `marks concentration and ritual`; `keeps the higher-levels paragraph apart`; `joins a spell split by a page break`; `lists a header it cannot read as unrecognized`; `maps spells to classes from the class lists`.
- [ ] **Step 2: Ver falhar. Step 3: Implementar. Step 4: Ver passar.**
- [ ] **Step 5: Commit** — `Parse spells and class spell lists from the Player's Handbook text`

### Task 4: Parser de monstros

**Files:**
- Create: `backend/src/compendium/parse/monsters.ts`
- Test: `backend/src/compendium/parse/__tests__/monsters.test.ts` (fixture inventada)

**Interfaces:**
- Consumes: `RawMonster`.
- Produces: `parseMonsters(text: string): { monsters: RawMonster[]; unrecognized: string[] }` — `statBlock` no formato `NpcStatBlock`: `ac`, `hp`/`hpMax`, `hitDice`, `speed`, `abilities`, `savingThrows`, `skills`, resistências/imunidades, `senses`, `languages`, `challengeRating`, `xp`, `traits`, `actions`, `reactions`, `legendaryActions` (nome + descrição, como hoje).

Formato: nome em maiúsculas; linha `<tipo e tamanho>, <tendência>`; `Classe de Armadura N (…) Pontos de Vida N (XdY + Z) Deslocamento …`; `FOR/DES/CON/INT/SAB/CAR N (±M)`; linhas `Testes de Resistência`, `Perícias`, `Resistência a Dano`, `Imunidade a Dano`, `Imunidade a Condição`, `Sentidos`, `Idiomas`, `Nível de Desafio N (X XP)`; traços em `Nome. texto`; seções `AÇÕES`, `REAÇÕES`, `AÇÕES LENDÁRIAS`.

- [ ] **Step 1: Testes:** `parses a small monster block`; `reads modifiers written with an en dash`; `splits traits, actions and reactions`; `reads challenge rating 1/4 with its XP`; `lists a block without Armor Class as unrecognized`.
- [ ] **Step 2: Ver falhar. Step 3: Implementar. Step 4: Ver passar.**
- [ ] **Step 5: Commit** — `Parse monster stat blocks from the Monster Manual text`

### Task 5: Parsers de armas, armaduras e itens mágicos

**Files:**
- Create: `backend/src/compendium/parse/equipment.ts`, `backend/src/compendium/parse/magicItems.ts`
- Test: `backend/src/compendium/parse/__tests__/equipment.test.ts`, `.../magicItems.test.ts`

**Interfaces:**
- Produces: `parseWeapons(text: string): { entries: RawEntry[]; unrecognized: string[] }` (`data: { category: 'simple'|'martial', range: 'melee'|'ranged', damage: { dice, type }, properties: string[], versatile?, normalRange?, longRange?, cost, weight }`); `parseArmor(text: string)` (`data: { category: 'light'|'medium'|'heavy'|'shield', baseAc, addDex, maxDex?, strength?, stealthDisadvantage, cost, weight }`); `parseMagicItems(text: string)` (`data: { category, rarity, attunement, attunementBy? }` + `text`).

- [ ] **Step 1: Testes** com tabelas e cabeçalhos inventados no formato dos livros: `reads a versatile martial weapon`; `reads a ranged weapon with its ranges`; `reads medium armor with a Dex cap`; `reads a shield as +2`; `reads an item that requires attunement by a class`.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar.
- [ ] **Step 5: Commit** — `Parse weapons, armor and magic items`

### Task 6: Importador e linha de comando

**Files:**
- Create: `backend/src/compendium/importer.ts`, `backend/src/compendium/cli.ts`, `backend/scripts/compendium-extract.sh`, `docker-compose.dev.compendio.yml`
- Modify: `backend/package.json` (scripts `compendium:parse`, `compendium:validate`, `compendium:import`, todos `ts-node src/compendium/cli.ts <passo>`)

O `pdftotext` existe no Git Bash do Windows, não no contêiner. Por isso a extração é um script bash que roda no host, e os demais passos rodam no contêiner de dev, que enxerga os dados por um arquivo de compose extra (`docker-compose.dev.compendio.yml`, só com `services.backend.volumes: ["./materiais/.compendio:/compendio"]`), usado com `docker compose -f docker-compose.dev.yml -f docker-compose.dev.compendio.yml up -d backend`.
- Test: `backend/src/compendium/__tests__/importer.e2e.test.ts`

**Interfaces:**
- Consumes: `RawEntry`, `RawMonster`, `validateEntries`, `validateMonsters`, `searchKey`, parsers dos Tasks 3–5.
- Produces:
  - Pastas: `<dir>/raw/<livro>.txt`; `<dir>/data/<livro>/<tipo>.json` (array de `RawEntry`) e `<dir>/data/mm/monster.json` (array de `RawMonster`).
  - `importCompendium(dataDir: string, opts: { force?: boolean }): Promise<ImportReport>` com `ImportReport { created: number; updated: number; skippedEdited: string[]; monstersCreated: number; monstersUpdated: number; monstersSkippedEdited: string[] }`. Recusa (lança) se `validate` acusar problemas.
  - `backend/scripts/compendium-extract.sh <pdfDir> <outDir>`: `pdftotext -enc UTF-8` em `D&D 5E - Livro do Jogador (Impressão Ecônomica - Sem Imagens) - Biblioteca Élfica.pdf` → `raw/phb.txt`, `D&D 5E - Manual dos Monstros (D&D Beyond 2.1) - Biblioteca Élfica.pdf` → `raw/mm.txt`, `D&D 5E - Guia do Mestre - Biblioteca Élfica.pdf` → `raw/dmg.txt`.
  - CLI: `parse <outDir>` (escreve os JSON dos parsers sem apagar entradas de curadoria já presentes no mesmo arquivo: junta por `slug`, a curadoria vence), `validate <outDir>` (imprime os problemas, sai 1 se houver), `import <dataDir> [--force]`.

- [ ] **Step 1: Testes** (pasta temporária com JSON inventados): `imports entries and monsters`; `updates an entry on a second import`; `skips an entry edited in the app unless forced`; `skips a monster edited in the app unless forced`; `keeps a spell and an armor with the same name`; `refuses data that fails validation`.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar.
- [ ] **Step 5: Commit** — `Import the compendium from data files, keeping edits made in the app`

### Task 7: Rotas de leitura e de correção

**Files:**
- Create: `backend/src/routes/compendium.ts`
- Modify: `backend/src/app.ts` (montar em `/api/compendium`), `backend/src/__tests__/helpers/routeInventory.expected.json`
- Test: `backend/src/routes/__tests__/compendium.e2e.test.ts`

**Interfaces:**
- Produces:
  - `GET /api/compendium/books` → `{ id, name, gameSystem }[]` (qualquer conta).
  - `GET /api/compendium/entries?type=&book=&q=&page=&pageSize=` → `{ items: { id, bookId, type, slug, name, nameEn }[], total }`; `q` comparado com `search` (via `searchKey(q)`, `contains`); `pageSize` padrão 50, máximo 200; sem admin, `type=magicItem` e itens mágicos na busca geral não aparecem.
  - `GET /api/compendium/entries/:id` → a entrada inteira; 404 para item mágico sem admin.
  - `PATCH /api/compendium/entries/:id` (só admin) com `{ name?, nameEn?, text?, data? }`; valida `data` pelo esquema do tipo; grava `search`, `editedAt`, `editedById`.

- [ ] **Step 1: Testes:** `lists the four books`; `finds by name without accents or case`; `finds by English name`; `returns a spell and an armor that share a name`; `hides magic items from a player and shows them to the admin`; `lets only the admin correct an entry`; `refuses a correction that breaks the schema`; `marks a corrected entry as edited`.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar; atualizar `routeInventory.expected.json` com as quatro rotas e rodar o teste do inventário.
- [ ] **Step 5: Commit** — `Read and correct the compendium over the API`

### Task 8: Admin corrige criaturas globais de livro

**Files:**
- Modify: `backend/src/routes/creatures.ts` (PUT `/:creatureId`)
- Test: `backend/src/routes/__tests__/creatureBookEdits.e2e.test.ts`

**Interfaces:**
- Produces: no PUT, uma criatura global (`campaignId === null`) cujo `source` é `id` de um `CompendiumBook` pode ser editada por quem tem `platformRole === 'ADMIN'` (e é mestre da campanha da rota, como hoje); a edição grava `editedAt` e `editedById`. Para os demais, a resposta de hoje (403) continua. Criaturas `srd` entram nessa regra.

- [ ] **Step 1: Testes:** `lets the admin correct a Monster Manual creature and marks it edited`; `still refuses a non-admin GM`; `still refuses another campaign's creature`.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar; rodar também os testes de criaturas que já existem (`src/routes/__tests__/*creature*`).
- [ ] **Step 5: Commit** — `Let the admin correct a book's creatures`

### Task 9: Aba "Compêndio" no admin

**Files:**
- Create: `frontend/src/components/admin/CompendiumPanel.tsx`
- Modify: `frontend/src/pages/AdminPage.tsx` (tipo `Tab` ganha `'compendium'`, aba e painel), `frontend/src/services/api.ts` (`getCompendiumBooks`, `searchCompendium`, `getCompendiumEntry`, `updateCompendiumEntry`), `frontend/src/types/index.ts` (tipos de resposta), `frontend/src/i18n/locales/en.ts` e `pt-BR.ts` (chaves `compendium.*`)
- Test: `frontend/src/components/admin/__tests__/CompendiumPanel.test.tsx`

**Interfaces:**
- Consumes: as rotas do Task 7.
- Produces: painel com busca (texto + filtro de tipo e livro), lista paginada, e a entrada aberta com campos de nome, nome em inglês, texto e `data` como JSON num `textarea` (validado pelo servidor; o erro do servidor aparece no painel). Indica "Corrigido em <data>" quando `editedAt` existe. Formulários específicos por tipo ficam para quando o P4/P5 pedirem.

- [ ] **Step 1: Testes:** `searches and lists entries`; `saves a corrected text`; `shows the server's message when the data is invalid`; `shows when an entry was corrected`.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar; lint e typecheck do frontend.
- [ ] **Step 5: Commit** — `Add the compendium tab to the admin panel`

### Task 10: Biblioteca de criaturas mostra o livro e deixa o admin corrigir

**Files:**
- Modify: `frontend/src/components/campaign/CreatureLibrary.tsx` (filtro de origem com `mm` "Manual dos Monstros"; selo com o nome do livro em vez de "SRD"/"Custom" para fontes de livro; botão de editar numa criatura global de livro só para o admin), `frontend/src/i18n/locales/*`
- Test: `frontend/src/components/campaign/__tests__/CreatureLibraryBooks.test.tsx`

**Interfaces:**
- Consumes: `GET /api/compendium/books` (nomes dos livros); o PUT do Task 8.

- [ ] **Step 1: Testes:** `labels a Monster Manual creature with its book`; `offers Edit on a book creature to the admin only`; `filters by the Monster Manual`.
- [ ] **Step 2–4:** ver falhar, implementar, ver passar; rodar `src/components/campaign/__tests__/CreatureLibrary*`.
- [ ] **Step 5: Commit** — `Show a creature's book and let the admin correct it`

## Parte B — Dados

Os dados ficam em `materiais/.compendio/` e nunca são commitados. Cada task desta parte termina com `npm run compendium:validate` limpo para o que ela tocou e uma linha no ledger com as contagens.

### Task 11: Extrair e rodar os parsers nos livros

- [ ] **Step 1:** No Git Bash: `bash backend/scripts/compendium-extract.sh "materiais/D&D 5E" materiais/.compendio`. Subir o backend de dev com `docker-compose.dev.compendio.yml`.
- [ ] **Step 2:** No contêiner: `npm run compendium:parse -- /compendio`. Expected: ~360 magias, ~420 monstros, ~260 itens mágicos, as tabelas de armas e armaduras; a lista de `unrecognized` de cada parser.
- [ ] **Step 3:** Resolver os `unrecognized`: ajustar o parser (com teste novo no Task correspondente, commit próprio) quando for padrão; curadoria manual no JSON quando for exceção.
- [ ] **Step 4:** `validate` limpo para `spell` (sem `mechanics` ainda), `weapon`, `armor`, `magicItem` e monstros.

### Task 12: Curadoria A — mecânica das magias de nível 0 a 2

- [ ] **Step 1:** Para cada magia de nível 0 a 2 (lote por nível), ler o texto e preencher `mechanics` e `nameEn`; preencher `nameEn` também nas demais magias.
- [ ] **Step 2:** `validate` limpo; conferir à mão 10 magias sorteadas contra o texto extraído.

### Task 13: Curadoria B — classes, subclasses, raças, antecedentes, talentos

- [ ] **Step 1:** Escrever `class` (12) e `subclass` (todas do Livro do Jogador) com características de 1 a 20 e o que P4/P5 calculam no 1º–3º nível; `race`/`subrace`; `background`; `feat`.
- [ ] **Step 2:** `validate` limpo (agora `spell.data.classes` confere com `class`).

### Task 14: Curadoria C — equipamento, condições e itens mágicos comuns

- [ ] **Step 1:** `gear`, `tool`, `pack`, `condition`; `bonus`/`effect` nos itens mágicos comuns (poções de cura; armas, armaduras, escudos e munição +1/+2/+3); `nameEn` onde faltar.
- [ ] **Step 2:** `validate` limpo nos três livros.

### Task 15: Importar no dev e conferir

- [ ] **Step 1:** `npm run compendium:import -- /compendio/data` no contêiner de dev. Expected: relatório com as contagens do Task 11 e do Task 13/14.
- [ ] **Step 2:** Conferir pela API: "bola de fogo" e "fireball" acham a mesma magia; um jogador de teste não acha "Poção de Cura"; o admin acha; a biblioteca de criaturas lista "Goblin" com o selo do Manual dos Monstros.
- [ ] **Step 3:** Acrescentar ao `deploy/mesa/README.md` o comando de importação em produção do spec (`docker compose run --rm -v …:/compendio:ro backend npm run compendium:import -- /compendio`) e commitar — `Document importing the compendium on the server`.

### Task 16: Revisão do dono e correções

- [ ] **Step 1: [dono]** Revisar contra o livro, no app, a amostra do spec: 10 magias (6 de nível 0 a 2), 5 monstros, 2 classes até o 3º nível, 3 raças, 5 armas, 3 armaduras, 5 itens mágicos; corrigir pelo editor o que achar.
- [ ] **Step 2:** Rodar `import` de novo sem `--force`. Expected: as correções do dono aparecem em `skippedEdited`/`monstersSkippedEdited` e continuam no app.
- [ ] **Step 3:** Erros que se repetem em vários itens (padrão do parser ou da curadoria) voltam para o Task 11–14 correspondente, e o import é refeito.
