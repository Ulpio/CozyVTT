# P8 — Tradução do que acontece em jogo (design)

Parte do roadmap (`2026-11-14-mesa-roadmap-design.md`, P8), depois da P7, já
na `main`.

## Intenção

A mesa é para um grupo de amigos que joga em português. Da P3 à P7 as telas
novas já nasceram traduzidas, mas muito do que se vê durante uma sessão ainda
está em inglês: a ficha 5e inteira ("Ability Scores", "Saving Throws",
"Armor Class"), o chat ("To", "Everyone"), o rolador de dados, a iniciativa
("Initiative Tracker"), os botões do mapa, os painéis de paredes, luz e névoa
e as recusas que o servidor manda ("Only the GM can modify initiative").
A P8 fecha isso antes da oneshot.

**Pronto quando**, com o app em português:
- um jogador entra na campanha, abre a ficha 5e do personagem, rola dados,
  conversa no chat, entra na iniciativa e anda pelo mapa, no layout de mesa e
  no compacto (celular), sem ver texto em inglês;
- o mestre conduz a mesma sessão (mapa, tokens, iniciativa, paredes, luz,
  névoa, gerenciar mapas, configurar a campanha) sem ver texto em inglês;
- quando o servidor recusa algo durante o jogo, a mensagem que aparece está em
  português;
- com o app em inglês, as telas traduzidas continuam em inglês, com os mesmos
  textos de hoje (as recusas do servidor ficam em português; ver Decisões).

## Metas, não-metas, anti-metas

**Metas**
- Todo texto visível das telas usadas em jogo passa pelo i18n, com pt-BR e en:
  rótulos, botões, dicas (`title`), `placeholder`, `aria-label`, mensagens de
  aviso (toasts) e estados vazios.
- As recusas que o servidor manda ao cliente durante o jogo, escritas direto em
  português.
- Uma conferência no navegador, em português, como jogador e como mestre, no
  layout de mesa e no compacto.

**Não-metas** (decisão do dono: só o que acontece em jogo)
- Telas de preparação do mestre: biblioteca de criaturas, modelos de tokens,
  fichas de NPC (stat blocks e seu editor), ferramentas de pintura e de
  desenho, atmosfera/vibe e trilha sonora.
- Administração, perfil, biblioteca de assets, documentos, modelos de
  personagem, assistente de instalação.
- As fichas de outros sistemas (fantasy-d20, horror-d100, flexível).
- Erros das rotas REST fora do jogo (login, cadastro, admin, upload).
- Textos dos livros (continuam fora do git) e nomes vindos do compêndio.

**Anti-metas** (o que faria a P8 falhar mesmo "traduzida")
- Mudar o comportamento de alguma tela: a P8 só troca texto.
- Quebrar o inglês: com o app em inglês, um texto sumir, virar a chave crua
  ("chat.to") ou mudar de redação.
- Um termo de regra diferente do que o app já usa (ex.: "Teste de
  resistência" numa tela e "Salvaguarda" em outra).

## Decisões do dono

- **Escopo: só o que acontece em jogo** (ver Não-metas).
- **Recusas do servidor escritas direto em português (abordagem A)**, como a
  P6 já fez ("Só o mestre pode fazer isso."). Quem escolher inglês no app vê
  essas recusas em português; aceito para esta mesa.

## Abordagens consideradas (recusas do servidor)

- **A. Português direto no servidor (escolhida).** Só troca texto, sem mexer
  no fluxo dos eventos; coerente com a P6. Custo: o inglês do app mostra
  recusas em português.
- **B. Código no servidor, tradução no app.** O mais correto para dois
  idiomas, mas mexe em cada ponto de recusa (~120), nos testes do servidor e
  na exibição no app; umas 3× o trabalho de A nessa parte. Fica para se o app
  um dia sair do círculo de amigos.
- **C. O app reconhece a frase em inglês e troca.** Barato, mas quebra calado
  quando alguém muda o texto no servidor. Descartada.

Para as telas há um só caminho: o i18n que o projeto já usa
(`frontend/src/i18n`, `locales/en.ts` e `locales/pt-BR.ts`, agrupados por
tela; o inglês tipa as chaves e o pt-BR precisa ter as mesmas).

## Como funciona

### O que entra (telas em jogo)
O critério é: aparece para o jogador ou para o mestre enquanto a sessão
acontece. O levantamento de hoje aponta, sem esgotar:
- **Ficha 5e:** visualização e editor (`FifthEditionCharacterView`,
  `FifthEditionCharacterEditor` e os componentes deles: magias, ataques,
  inventário).
- **Mesa:** `ChatPanel`, `DiceRoller`, `DiceMacroManager` (rolagens salvas),
  `InitiativeTracker`, `PersonalNotes`, `SessionHistory`, `MapCanvas`
  (zoom, ping, avisos), `TokenManager`, `TokenRoster`, `CampaignRoster`
  (coluna do grupo), `MapManager`, `CreateMapModal`, `EditMapModal`,
  `CampaignSettingsModal`, `EndSessionModal`, `InvitePlayerModal`,
  `CharacterRollPicker`, `NpcRollPicker` e `contexts/CampaignContext`.
- **Painéis da P7:** `GmWallControls`, `GmLightControls`, `GmFogControls`.
- **Layout compacto:** `compact/*` (barra inferior, "Mais", folhas de ações),
  inclusive os rótulos que vêm de constantes em arquivos `.ts`
  (ex.: os painéis e ferramentas listados na folha "Mais").
- Telas de personagem usadas para entrar no jogo: `NewCharacterModal`,
  `CharactersPage`/`CharacterEditorPage` no que mostram da ficha 5e.

Um componente que mistura jogo e preparação é traduzido inteiro (ex.: um
modal de mapa). Um componente só de preparação fica como está.

### Vocabulário
- Os termos de regra seguem os que o app já usa em pt-BR (`locales/pt-BR.ts`):
  Salvaguarda, Classe de Armadura, perícias, atributos, bônus de proficiência,
  inspiração, vantagem/desvantagem, PV, etc. Onde o app ainda não tem o termo,
  usa-se o da edição brasileira do livro do jogador de 5e (2014).
- Abreviações de atributo seguem as do app (FOR, DES, CON, INT, SAB, CAR).
- Texto direto e curto, no tom das telas já traduzidas.

### O inglês continua igual
- A versão em inglês de cada chave nova é o texto que a tela mostra hoje,
  letra por letra. Os testes do front rodam em inglês, então continuam lendo
  o mesmo texto; um teste só muda se a tela mudou de fato.

### Recusas do servidor
- Toda mensagem de recusa ou erro que um tratador de evento de jogo
  (`backend/src/websocket/**`) e os serviços que ele chama mandam ao cliente
  passa a ser em português. O levantamento aponta ~120, concentradas em
  `initiative.ts`, `characters.ts`, `tokens.ts`, `spirit.ts`, `vibe.ts`,
  `lights.ts`, `exploration.ts`, `walls.ts`, `maps.ts`, `atmosphere.ts`,
  `fog.ts`, `pings.ts`, `events.ts` e `auth.ts` do websocket.
- Uma recusa que já existe em português (P5–P7) e diz a mesma coisa é
  reaproveitada (ex.: o `GM_ONLY` da P6), em vez de outra redação.
- Logs do servidor continuam em inglês (não são vistos por jogadores).
- Os testes do servidor que conferem esses textos passam a conferir o texto
  novo.

- **Textos que o app compara não mudam.** Uma string do servidor que o
  cliente testa por igualdade (ex.: `'Unauthorized'` em `socket.ts`, que
  dispara o novo login) é protocolo, não recusa: fica como está, e um teste
  prende esse valor. *(Decisão do construtor.)*
- **Rotas REST usadas durante o jogo entram.** Recusas das rotas que as telas
  do escopo chamam (ex.: `routes/maps.ts` com "Only the GM can change token
  layer", as rotas de campanha usadas pelos modais de configurar, convidar e
  encerrar sessão) seguem a mesma regra das do websocket. Rotas só de telas
  fora do escopo ficam. *(Decisão do construtor, pelo critério "acontece em
  jogo".)*
- **Mensagens de reserva do próprio app** (falha de rede, "algo deu errado")
  mostradas numa tela do escopo também são traduzidas. *(Decisão do
  construtor.)*

### Rótulos de dados
- Rótulos que vêm de constantes (tipos de dano, condições, escolas de magia,
  propriedades de arma, perícias) e aparecem numa tela do escopo são
  traduzidos na hora de mostrar, no front. Os arquivos compartilhados entre
  front e servidor não mudam; o valor guardado continua o mesmo.
  *(Decisão do construtor.)*
- Nomes do compêndio e o texto da expressão de dados (`1d20+3`) ficam como
  vêm.

### Detalhes de escrita
- Texto com número ou nome usa interpolação e plural do i18next; o pt-BR pode
  mudar a ordem das palavras.
- Datas e números mostrados nas telas do escopo seguem o idioma do app.
- Uma chave que já existe é reaproveitada só se o texto em inglês for o mesmo;
  senão cria-se uma chave nova, com o mesmo termo em português (o inglês de
  hoje fica intacto). *(Decisão do construtor.)*

### Conferência
- Uma varredura automática que lista texto em inglês que ficou nas telas do
  escopo (texto entre tags, `title`, `placeholder`, `aria-label`), para
  orientar o trabalho e a revisão. É uma ferramenta de apoio; não precisa
  virar teste. *(Decisão do construtor.)*
- Uma passada no navegador em português: jogador e mestre, layout de mesa e
  compacto, cobrindo o roteiro do "Pronto quando". Faz parte da entrega: o
  que ficou em inglês vira correção ou nota no relatório final.

## Restrições

- Só troca texto: nenhuma mudança de comportamento, layout ou evento.
- `en.ts` e `pt-BR.ts` com as mesmas chaves (o typecheck já exige).
- Testes do front em inglês; nada de texto dos livros no git.
- Não rodar a suíte inteira do servidor; rodar os testes dos arquivos tocados.
- Os arquivos compartilhados entre front e servidor continuam idênticos.

## O que fica para quem constrói
- Como agrupar as chaves novas por tela nos arquivos de idioma.
- A redação exata de cada texto, dentro do vocabulário acima.
- A ordem de trabalho e o corte em tarefas.
- Onde a varredura de texto em inglês fica (script de apoio fora do app).
