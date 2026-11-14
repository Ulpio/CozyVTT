# P2 — Compêndio 5e — design

Data: 2026-11-14 · Roadmap: `docs/superpowers/specs/2026-11-14-mesa-roadmap-design.md` (seção P2)

## Intenção e porquê

Hoje a ficha 5e do app é um formulário livre: raça e classe são texto, o
bônus de ataque é digitado, uma magia é só nome e círculo. Não há nenhum dado
de regras por trás, então a mesa não consegue calcular nada pelo jogador. O
P2 transforma os livros do dono (em `materiais/`, em português) em dados que
o app entende, cada entrada marcada com o livro de onde veio. É a base de
tudo que o dono quer sentir na oneshot: criação guiada (P4), barra de ações
com ataque, dano e espaços de magia automáticos (P5), itens dados pelo mestre
(P6) e livros ativados por campanha (P3).

## Objetivos, não-objetivos e anti-objetivos

**Objetivos**

- Estes livros no banco, completos para o que o M1 usa:
  - **Livro do Jogador** (edição "Impressão Ecônomica - Sem Imagens"): raças e
    sub-raças, classes, subclasses, antecedentes, talentos, equipamento
    (armas, armaduras, equipamento de aventura, ferramentas, pacotes), magias,
    condições.
  - **Manual dos Monstros**: todos os blocos de estatística.
  - **Guia do Mestre**: itens mágicos.
- Mecânica estruturada onde o M1 calcula: truques e magias de 1º e 2º círculo;
  classes e subclasses até o 3º nível; armas e armaduras; itens mágicos
  comuns (poções de cura, armas, armaduras e escudos +1/+2/+3, munição +1/+2/+3).
- O resto com texto completo e os campos básicos de cada tipo.
- Busca por nome em português e em inglês.
- Um editor simples para o dono corrigir uma entrada no app.
- Um caminho repetível para acrescentar livros depois (Xanathar, CoC).

**Não-objetivos**

- Ativar livros por campanha (P3), telas de criação (P4) e barra de ações (P5).
  O P2 entrega os dados e a leitura deles; não muda a ficha.
- Ataques de monstro automatizados: os ataques dos monstros ficam como texto,
  como já são hoje na biblioteca de criaturas.
- Outros livros além dos três.
- Imagens dos livros.

**Anti-objetivos**

- Texto dos livros no repositório (código, testes ou dados).
- Números errados em magias, armas ou monstros que o grupo descubra em jogo.
- Uma importação nova apagar uma correção que o dono fez no editor.
- Os jogadores verem os monstros pelo compêndio.

## Restrições

- **Uso privado.** Os dados extraídos ficam em `materiais/.compendio/`
  (`materiais/` já é ignorado pelo git). O repositório leva só o código das
  ferramentas, os esquemas e testes com textos inventados para o teste.
- **Backend aditivo**, como manda o roadmap: tabelas novas e uma migração;
  a biblioteca de criaturas recebe linhas novas, sem mudar de forma.
- **Nomes da tradução Biblioteca Élfica**, que é a que o grupo usa (regras de
  2014). O nome em inglês vem junto para a busca.
- Ambiente: Windows + Git Bash com `pdftotext` (`/ucrt64/bin/pdftotext`);
  backend Node/TypeScript/Prisma; testes de backend no banco `cozyvtt_test`.

## Abordagens consideradas

- **A. Só scripts que reconhecem padrões.** Repetível, ótimo para conteúdo de
  formato fixo, mas não dá conta de classes, raças e antecedentes (prosa) nem
  da mecânica escondida em frases ("causa 1d4 + 1 de dano de energia").
- **B. Tudo estruturado por mim (Claude), entrada por entrada.** Bom com
  prosa, mas lento e caro para ~360 magias, ~420 monstros e ~260 itens, e
  sujeito a inconsistência entre entradas parecidas.
- **C. Misto** — **escolhida pelo dono.** Scripts tiram o esqueleto do
  conteúdo de formato fixo (magias, monstros, tabelas de armas e armaduras,
  cabeçalhos de itens mágicos); eu estruturo o que exige leitura (mecânica das
  magias até o 2º círculo, classes, subclasses, raças, antecedentes, talentos,
  itens mágicos comuns); uma validação automática confere tudo; o dono revisa
  por amostragem.

## O que o texto extraído mostra (reconhecimento feito)

- Livro do Jogador: cada magia sai como `NOME EM MAIÚSCULAS`, uma linha com
  "`1° nível de evocação`" (ou "`Truque de …`") seguida de `Tempo de
  Conjuração:`, `Alcance:`, `Componentes:`, `Duração:`, o texto, e às vezes um
  parágrafo `Em Níveis Superiores.`. Cerca de 360 cabeçalhos.
- Manual dos Monstros: `NOME`, linha de tipo/tamanho/tendência, `Classe de
  Armadura … Pontos de Vida … Deslocamento …`, os seis atributos `FOR 8 (–1)`,
  depois perícias, sentidos, idiomas, `Nível de Desafio`, traços e `AÇÕES`.
  Cerca de 420 blocos.
- Guia do Mestre: cada item mágico tem uma linha de categoria e raridade
  ("`Arma (espada longa), rara`"). Cerca de 260.
- O Compêndio de Magia sai com o texto embaralhado; não é usado.
- O Livro do Jogador traz as listas de magias por classe (`MAGIAS DE BARDO`,
  `MAGIAS DE BRUXO`…, por círculo, cada magia com a escola entre
  parênteses). O campo `classes` de cada magia sai dessas listas, pelo
  parser.

## Desenho

### Onde os dados moram

- **Livros:** tabela nova `CompendiumBook` — `id` (texto curto e estável:
  `phb`, `mm`, `dmg`, `srd`), `name` ("Livro do Jogador"), `gameSystem`
  (`FIFTH_EDITION`). O P3 vai ligar campanhas a estas linhas.
- **Entradas:** tabela nova `CompendiumEntry` — `id`, `bookId`, `type`
  (`spell`, `race`, `subrace`, `class`, `subclass`, `background`, `feat`,
  `weapon`, `armor`, `gear`, `tool`, `pack`, `magicItem`, `condition`), `slug`
  (estável, do nome em português), `name`, `nameEn`, `text` (texto completo em
  português), `data` (JSON com os campos do tipo), `editedAt` e `editedById`
  (preenchidos quando o dono corrige pelo app). Único por (`bookId`, `type`,
  `slug`). Índices para busca por `type`, `bookId`, `name` e `nameEn`.
- **Monstros:** linhas novas em `CreatureTemplate`, globais
  (`campaignId = null`), com `source = 'mm'`, `gameSystem = FIFTH_EDITION` e o
  `statBlock` no formato que a biblioteca já usa (`NpcStatBlock`). Assim o
  visualizador e "pôr no mapa" já funcionam. A importação identifica um
  monstro por (`source`, `name`). As criaturas SRD em inglês que o app já tem
  mantêm `source = 'srd'`; o livro correspondente tem `id = 'srd'` e o nome
  "SRD 5.1 (inglês)", então nada nelas muda.
- **Correção de monstros:** hoje a rota de edição de criaturas só edita as de
  uma campanha, e as globais não têm marca de edição. O P2 acrescenta a
  `CreatureTemplate` duas colunas opcionais, `editedAt` e `editedById`, e
  permite ao admin editar uma criatura global de um livro (`source` igual ao
  `id` de um `CompendiumBook`) pelo editor de criaturas que já existe,
  gravando a marca. A importação não sobrescreve uma criatura marcada, como
  faz com as entradas. É uma mudança pequena numa rota existente, permitida
  pelo roadmap quando necessária.

### O que cada tipo guarda em `data`

Cada tipo tem um esquema de validação (zod) no backend; a importação recusa
uma entrada que não passe. Os campos que o M1 usa:

- **spell:** `level` (0 a 9), `school`, `castingTime`, `range`, `components`
  (`v`, `s`, `m` e o texto do material), `duration`, `concentration`,
  `ritual`, `classes` (lista de slugs de classe). Para nível 0 a 2, também
  `mechanics`: `attack` (`melee` | `ranged`) ou `save` (atributo), `damage`
  (lista de `{ dice, type }`), `halfOnSave`, `targets` / `area`, `scaling`
  (dado extra por círculo acima do base; para truques, os níveis 5/11/17).
- **race / subrace:** aumentos de atributo, tamanho, deslocamento, idiomas,
  proficiências, visão no escuro, traços (nome e texto), e para sub-raça a
  raça-mãe.
- **class:** dado de vida, salvaguardas, proficiências (armas, armaduras,
  ferramentas), perícias (escolher N de uma lista), equipamento inicial (as
  opções), atributo de conjuração e a tabela de espaços por nível quando
  conjura, truques e magias conhecidas por nível, nível da subclasse, e as
  características por nível de 1 a 20 (nome e texto; as do 1º ao 3º com o que
  o P4/P5 precisam calcular).
- **subclass:** classe-mãe e características por nível (como a classe).
- **background:** proficiências, idiomas, equipamento, característica.
- **feat:** pré-requisito e texto; os efeitos que mudam números (aumento de
  atributo, proficiência) estruturados.
- **weapon:** categoria (simples/marcial, corpo a corpo/à distância), dano
  (`dice`, `type`), propriedades (acuidade, leve, arremesso, versátil com o
  dado, alcance normal/longo, munição…), preço, peso.
- **armor:** categoria, CA base, se soma Destreza e o limite, força mínima,
  desvantagem em Furtividade, preço, peso.
- **gear / tool / pack:** preço, peso, conteúdo (pacotes).
- **magicItem:** categoria, raridade, sintonização; para os comuns, `bonus`
  (+1/+2/+3 em ataque e dano, ou em CA) e `effect` (poções de cura: os dados
  de cura).
- **condition:** só o texto.

### O caminho de extração

Ferramentas no repositório, em `backend/src/compendium/` (código e esquemas)
e comandos `npm run compendium:<passo>` no backend:

1. **extract:** `pdftotext` de cada livro para
   `materiais/.compendio/raw/<livro>.txt`.
2. **parse:** os parsers dos conteúdos de formato fixo escrevem
   `materiais/.compendio/data/<livro>/<tipo>.json` — magias (todas, com os
   campos básicos e o texto), monstros, tabelas de armas e armaduras, itens
   mágicos (cabeçalho e texto).
3. **curadoria (eu):** acrescento a mecânica das magias até o 2º círculo e
   dos itens mágicos comuns, e escrevo as entradas de prosa (classes,
   subclasses, raças, sub-raças, antecedentes, talentos, equipamento de
   aventura, pacotes, condições) nos mesmos arquivos JSON, lendo o texto
   extraído. O resultado é revisado e fica fora do git.
4. **validate:** passa cada entrada pelo esquema do tipo e por checagens de
   coerência (dados no formato `NdM`, tipos de dano conhecidos, CA entre 5 e
   30, NDs válidos, classes citadas por magias existem) e lista o que falhou.
5. **import:** grava no banco, criando ou atualizando por (`bookId`, `type`,
   `slug`). Uma entrada com `editedAt` (corrigida no app) não é sobrescrita;
   o comando lista quais pulou. `--force` sobrescreve.

Para um livro novo depois: um parser novo se o formato for fixo, curadoria
para o resto, e os mesmos `validate` e `import`.

**Como os dados chegam a cada banco.** No desenvolvimento, `import` roda no
contêiner do backend de dev, lendo `materiais/.compendio/data` montado só
para leitura. Na produção (o banco só é alcançável dentro da rede do
Compose), o mesmo comando roda num contêiner de uso único do backend de
produção, com a pasta montada só para leitura:
`docker compose run --rm -v <caminho>/materiais/.compendio/data:/compendio:ro backend npm run compendium:import -- /compendio`.
Os dados nunca entram no contexto de build da imagem (o contexto é
`backend/`, e `materiais/` fica fora dele). O `deploy/mesa/README.md` ganha
esse comando.

### Leitura pelo app

- `GET /api/compendium/books` — os livros.
- `GET /api/compendium/entries?type=&book=&q=` — busca paginada; `q` compara
  com `name` e `nameEn`, sem acento e sem caixa.
- `GET /api/compendium/entries/:id` — uma entrada.
- Qualquer conta lê os tipos do Livro do Jogador. Itens mágicos, pela busca,
  só o admin lê até o P6 decidir como o mestre os entrega (no app qualquer um
  pode criar uma campanha e virar mestre, então "mestre de alguma campanha"
  não seria barreira). Um jogador verá um item quando o tiver, pelo P6.
  Monstros continuam só na biblioteca de criaturas, que já é do mestre.

### O editor de correções

Uma página do admin, "Compêndio": busca por nome, abre a entrada, permite
editar o nome, o nome em inglês, o texto e os campos de `data` (um formulário
por tipo para os campos do M1; o resto num campo de JSON validado pelo
esquema). Salvar grava `editedAt` e `editedById`. Monstros se corrigem pelo
editor de criaturas que já existe. Em português.

## Pronto quando

- `validate` passa sem erros nos três livros.
- No banco: todas as magias do Livro do Jogador; as 12 classes com suas
  subclasses; as raças e sub-raças; os antecedentes; os talentos; armas,
  armaduras, equipamento de aventura, ferramentas e pacotes; as condições;
  os itens mágicos do Guia do Mestre; os monstros do Manual dos Monstros na
  biblioteca de criaturas, marcados `mm`.
- O dono revisou por amostragem, contra o livro: 10 magias (das quais 6 de
  nível 0 a 2), 5 monstros, 2 classes até o 3º nível, 3 raças, 5 armas, 3
  armaduras e 5 itens mágicos, e corrigiu o que achou pelo editor.
- Uma correção feita pelo editor sobrevive a um `import` sem `--force`.
- Um jogador busca "Bola de Fogo" e "Fireball" e encontra a mesma magia; não
  encontra itens mágicos nem monstros.

## Decisões

**Do dono**

- Caminho C (misto).
- Itens mágicos do Guia do Mestre incluídos, com mecânica para os comuns.
- O resto vem do roadmap: livros como fonte, mecânica até o 2º círculo,
  editor de correções, nomes da Biblioteca Élfica com busca em inglês.

**Minhas (o dono pode corrigir)**

- Monstros na biblioteca de criaturas existente (`CreatureTemplate`), e não
  numa tabela própria como o roadmap dizia — troquei porque a biblioteca já
  tem visualizador, editor e "pôr no mapa". As demais entradas numa tabela
  nova.
- Magias tiradas do Livro do Jogador, não do Compêndio de Magia.
- Dados em `materiais/.compendio/`, fora do git.
- Itens mágicos fora da busca dos jogadores: só o admin os lê pela busca até
  o P6.
- O editor é do admin (o dono).
- Monstros identificados por (`source`, `name`); `CreatureTemplate` ganha
  `editedAt`/`editedById`, e o admin pode editar criaturas globais de livro.
- As criaturas SRD mantêm `source = 'srd'`; o livro delas tem `id = 'srd'`.
- `classes` das magias vem das listas por classe do Livro do Jogador.
- Importação em produção por `docker compose run` com a pasta de dados
  montada só para leitura.
- Condições incluídas (texto), por serem baratas e úteis no P5.

## Deixado para quem constrói

- O nome exato das colunas, dos arquivos e dos comandos além do que está aqui.
- A forma dos formulários do editor.
- A heurística de cada parser, desde que `validate` passe.
- Como tratar uma magia ou monstro que o parser não reconhece (listar para
  curadoria manual é o esperado).
