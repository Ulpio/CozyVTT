# P5d — Inventário com ícones, espaços do corpo, munição e rações (design)

Parte do roadmap (`2026-11-14-mesa-roadmap-design.md`, P5), depois da P5c
(`2026-11-16-p5c-economia-e-caracteristicas-design.md`), já na `main`. A P5c
deixou para cá o inventário com ícones e a munição e as rações contadas no
modo Fiel.

## Intenção

O dono pediu, desde o roadmap, um inventário com ícones, no estilo do BG3. Hoje
o inventário da ficha 5e é uma lista de texto, e a marca "equipado" não muda
nada: a CA é um número guardado na ficha, e a barra de ações lista todos os
ataques da ficha, esteja a arma na mão ou não. No modo Fiel, que o mestre
escolhe por campanha (P4), munição e rações deveriam ser contadas, e não são.

A P5d faz o inventário parecer de jogo e faz o que está equipado valer: o que
está nas mãos é o que a barra ataca, a armadura vestida é o que dá a CA. No modo
Fiel, cada flecha disparada e cada dia de comida saem do inventário.

**Pronto quando**, numa sessão de teste com uma campanha Fiel e personagens de
3º nível feitos pela criação guiada:
- a patrulheira com arco longo vê a ficha com espaços do corpo (mão principal,
  outra mão, armadura, munição) e a mochila em grade, cada item com um ícone, e
  o pacote de explorador já aberto em itens (10 rações, 10 tochas, corda...);
- ela ataca três vezes com o arco: as flechas vão de 20 para 17, e desfazer um
  dos ataques devolve uma;
- sem flechas, o ataque é recusado com "Sem flechas.";
- quando o combate acaba, "Recuperar munição" devolve metade das gastas,
  arredondada para baixo;
- um guerreiro troca a espada longa e o escudo por uma espada grande: a barra
  passa a mostrar só a espada grande, a CA cai 2, e as duas mãos ficam ocupadas;
- o guerreiro troca a cota de malha por couro batido fora de combate e a CA
  muda pela regra do livro; em combate a troca de armadura é recusada;
- um descanso longo (sozinho ou "Descanso para o grupo") gasta 1 ração de cada
  personagem; quem não tem ração descansa mesmo assim e o mestre recebe um
  aviso; desfazer o descanso devolve a ração;
- numa campanha Flexível, nada é contado (munição, rações, carga), mas os
  ícones, os espaços do corpo e a CA pela armadura valem igual.

## Metas, não-metas, anti-metas

- **Metas:**
  - ícones em todo item do inventário 5e: genéricos por categoria e
    específicos para os itens comuns do Livro do Jogador, do game-icons.net;
  - a ficha 5e com espaços do corpo e mochila em grade (modelo C), na
    visualização e na edição;
  - os espaços valem: as mãos decidem os ataques da barra, a armadura e o
    escudo decidem a CA;
  - pacotes abertos em itens na criação guiada, e "Abrir pacote" para fichas
    que já existem;
  - munição contada por unidade e gasta pelo ataque, no modo Fiel;
  - recuperar metade da munição depois do combate;
  - descanso longo gasta 1 ração, no modo Fiel;
  - o menu "Itens" da barra com os mesmos ícones.
- **Não-metas (agora):**
  - os ícones do dono (ele ainda vai gerar). O caminho para eles, ligar um
    ícone a um item no editor do compêndio, vem quando eles existirem;
  - espaços para anel, amuleto, capa e outros itens mágicos (o 5e não tem
    esses espaços; a sintonização continua como está);
  - usar itens pela barra (beber poção, acender tocha) e consumir componentes
    de magia com custo;
  - inventário de monstros e munição de NPCs;
  - exaustão por fome, peso da comida por dia, água;
  - fichas de outros sistemas (fantasy-d20, flexível, horror-d100).
- **Anti-metas:**
  - travar o jogo por contagem: sem ração, o descanso acontece; quem passa da
    carga só vê o aviso que já existe;
  - perder bônus que já estão na CA (item mágico, Estilo de Luta Defesa) ao
    trocar de armadura;
  - arte do BG3 ou de qualquer jogo comercial dentro do projeto.

## Abordagens

**Ícones** (decidido pelo dono: 1):
1. *Ícones no código.* O pacote `react-icons` (MIT) traz a coleção do
   game-icons.net (CC BY 3.0) como componentes React. Uma tabela no frontend
   liga categoria → ícone e slug do compêndio → ícone específico. Pequeno,
   funciona sem internet, não mexe no banco. Os ícones do dono, quando vierem,
   pedem o caminho de envio que fica para depois.
2. *Ícones como arquivos na biblioteca*, com um tipo novo de arquivo e um
   seletor no editor do compêndio já agora. Os ícones do dono entrariam sem
   código novo, mas é bem mais trabalho para ícones que ainda não existem.
3. *Ícone escolhido item a item na ficha*: descartado, dá trabalho a cada
   jogador e cada um faria de um jeito.

**Layout do inventário** (decidido pelo dono: C, mostrado em modelos):
- A. Grade de ícones, estilo BG3.
- B. Lista com ícone.
- C. Espaços do corpo em cima (mão principal, outra mão, armadura, munição) e
  a mochila em grade embaixo. **Escolhido.**

**O que os espaços fazem** (decidido pelo dono: 2):
1. Só organizam; CA e ataques não mudam.
2. Valem: as mãos decidem os ataques da barra e a armadura e o escudo decidem
   a CA. **Escolhido.**

## Decididas com o dono

- Ícones genéricos do game-icons.net por enquanto; os do dono depois.
- Ícones no código (abordagem 1).
- Modelo C: espaços do corpo e mochila em grade.
- Os espaços valem para CA e ataques.
- Munição: cada ataque com arma de munição gasta 1 da pilha certa, acertando ou
  errando; sem munição, recusa com "Sem flechas." (ou o nome da munição);
  desfazer o ataque devolve; depois do combate, "Recuperar munição" devolve
  metade, arredondada para baixo.
- Rações: o descanso longo gasta 1 ração por personagem; sem ração, descansa e
  o mestre é avisado; desfazer o descanso devolve.
- Pacotes abertos em itens na criação guiada; fichas que já existem ganham
  "Abrir pacote".
- No modo Flexível nada disso é contado; ícones, pacotes abertos e espaços
  valem nos dois modos.

## Decididas por mim (o dono pode corrigir)

### Ícones

- Categorias genéricas: arma corpo a corpo, arma à distância, armadura,
  escudo, munição, poção, comida, ferramenta, pergaminho, recipiente, luz,
  item (o resto). A categoria sai do tipo do compêndio (`weapon`, `armor`,
  `gear`, `tool`, `pack`, `magicItem`) e, para `gear` e `magicItem`, de uma
  tabela de slugs e do prefixo do item mágico ("Poção", "Pergaminho",
  "Munição"...).
- Ícones específicos para as armas e armaduras do livro e para os itens
  comuns de aventura (mochila, saco de dormir, rações, tochas, corda, cantil,
  caixa de fogo, lanterna, aljava, porta-virotes, kit de herbalismo...). O
  construtor escolhe os desenhos; o critério é reconhecer o item de relance.
- Item sem vínculo com o compêndio (digitado à mão) fica com o ícone "item".
- Os ícones aparecem sobre um quadrado escuro com o desenho claro, como nos
  modelos. A atribuição aos autores vai para o `THIRD_PARTY_CREDITS.md`.

### Espaços do corpo

- Quatro espaços: **mão principal**, **outra mão**, **armadura**, **munição**.
- Na ficha, cada item do inventário guarda em que espaço está (nenhum = na
  mochila). A marca `equipped` de hoje passa a ser derivada do espaço: um item
  num espaço está equipado. Fichas antigas: no primeiro carregamento, armas
  marcadas como equipadas vão para as mãos na ordem da lista (a de duas mãos
  ocupa as duas), a armadura equipada vai para o espaço de armadura, o escudo
  equipado para a outra mão; o que não couber volta para a mochila.
- Regras das mãos:
  - arma de duas mãos ocupa as duas mãos;
  - arma versátil pode ficar numa mão ou nas duas; com as duas, ataca com o
    dano maior, e a pergunta "uma mão ou duas" da P5a some para ela;
  - escudo só na outra mão;
  - arma leve na outra mão é o que permite o ataque com a outra mão (a regra
    da ação bônus da P5a/P5c continua; só passa a exigir a arma na mão);
  - arma de munição (arco, besta) ocupa as mãos como diz a propriedade dela.
- O espaço de munição recebe uma pilha de munição. Ao atacar, a munição sai
  do espaço se ela servir para a arma; se não, da primeira pilha certa na
  mochila. Sem nenhuma, recusa.
- Equipar e desequipar: arrastar entre mochila e espaço, ou clicar no item e
  escolher "Equipar" / "Guardar" (para teclado e toque).
- Espaço ocupado: o que estava lá volta para a mochila sozinho, como no BG3.
  Pôr uma arma de duas mãos manda as duas mãos para a mochila. Soltar um
  escudo na mão principal, ou algo que não é munição no espaço de munição, é
  recusado com a razão.
- Migrar uma ficha antiga para os espaços não recalcula a CA: a CA guardada já
  conta a armadura que estava equipada. Se a CA foi editada à mão de um jeito
  que não bate com a armadura, a conta da diferença herda o erro; o mestre
  corrige à mão, como hoje.
- O dono da ficha e o mestre mudam os espaços, como já mudam a ficha.

### Ataques da barra

- A barra mostra os ataques das armas nas mãos e o ataque desarmado, nada da
  mochila. Para arremessar uma adaga, ela vai para a mão. Ataques da ficha
  que não vêm de arma do inventário (ataques digitados à mão, de magia,
  naturais) continuam aparecendo como hoje.
- O vínculo entre o ataque da ficha e o item do inventário passa a ser
  explícito: o ataque guarda qual item do inventário o gera. A criação guiada
  grava esse vínculo; fichas antigas ganham o vínculo no primeiro carregamento
  pelo nome (o que a P5a já faz), e um ataque sem item com o mesmo nome fica
  sem vínculo e aparece sempre, como os digitados à mão. Duas adagas são um
  item com quantidade 2 e um ataque só.
- A barra ganha um atalho "Trocar arma" que abre os espaços das mãos, para não
  ir até a ficha no meio do combate.

### CA

- Trocar a armadura ou o escudo recalcula a CA pela diferença: a CA nova é a
  CA guardada, menos o que a peça que sai dava, mais o que a peça que entra dá.
  Assim os bônus que já estão na CA continuam.
- O que uma armadura dá: `baseAc` + Destreza (sem limite na leve, até +2 na
  média, nada na pesada), dos dados do compêndio. Escudo: +2. Sem armadura:
  10 + Destreza, ou a Defesa sem Armadura do bárbaro (10 + Des + Con) e do
  monge (10 + Des + Sab, só sem escudo).
- Armadura sem vínculo com o compêndio não muda a CA ao entrar ou sair; a
  ficha mostra um aviso para o mestre ajustar à mão.
- A CA continua editável à mão; a conta da diferença parte do número que
  estiver lá.

### Em combate

- Só no modo Fiel e só em combate ativo (o mesmo combate ativo da P5c), na
  vez do personagem, com a economia da P5c:
  - sacar ou guardar uma arma é livre uma vez no turno (a interação com
    objeto); a segunda no mesmo turno gasta a ação. Cada arma que entra ou
    sai de uma mão conta uma interação: trocar a espada longa pela espada
    grande são duas (guardar uma, sacar a outra), então a troca gasta a ação.
    O `TurnSpend` da P5c ganha a contagem de interações com objeto, e o
    "Devolver" do mestre também a devolve;
  - escudo: vestir ou tirar gasta a ação;
  - armadura: recusada ("Leva minutos para vestir ou tirar armadura.").
- No modo Flexível, trocar é livre a qualquer hora.

### Munição

- Pilhas do compêndio com tamanho no nome ("Flechas (20)", "Agulhas de
  zarabatana (50)") viram unidades: o item passa a se chamar "Flechas" com a
  quantidade multiplicada (1 × 20 = 20). Isso vale na criação guiada e na
  primeira leitura de uma ficha antiga.
- Qual munição cada arma usa: arco curto e longo → flechas; besta leve, de mão
  e pesada → virotes; funda → balas de funda; zarabatana → agulhas. A tabela
  fica nos dados (slug da arma → slug da munição), não espalhada no código.
- Quem gasta é o servidor, no resolvedor de ações, a cada ataque com arma de
  munição no modo Fiel, em combate ou fora dele (o livro gasta a munição a
  cada disparo); o cartão do ataque guarda quanto gastou para o desfazer.
- "Recuperar munição": o servidor guarda, por personagem, quantas de cada tipo
  foram gastas desde a última recuperação. Fora de combate ativo, com alguma
  munição a recuperar, a ficha (e a barra) mostram o botão; ele devolve
  metade, arredondada para baixo, e zera a conta. Começar um combate não zera:
  um disparo antes da luta ainda pode ser recolhido depois dela. Desfazer um
  ataque tira o disparo da conta.
- Armas de arremesso não gastam munição.

### Rações

- O descanso longo do personagem e o "Descanso para o grupo" gastam 1 de
  "Rações de viagem (1 dia)" de cada personagem. O item é reconhecido pelo
  slug do compêndio ou, sem vínculo, por um nome que comece com "Ração" ou
  "Rações" (sem acento e sem diferença de maiúsculas). O "Descanso para o
  grupo" cobre os mesmos personagens que já cobre na P5c.
- O cartão do descanso diz quem comeu e quem ficou sem; o aviso ao mestre é
  um sussurro como os da P5c.
- O desfazer do descanso (P5c) devolve a ração junto.

### Pacotes

- A curadoria dos pacotes (em `materiais/`, fora do git) passa a listar o
  conteúdo como dados: `{ ref: { type, slug }, quantity }` para o que existe
  no compêndio e `{ name, quantity }` para o resto. O texto do pacote continua.
  Esses dados ainda não existem: quem constrói escreve a curadoria (um script
  em `materiais/.compendio/curation/`, como o das características da P5c), a
  partir do texto de cada pacote, e o validador do compêndio passa a aceitar
  o campo. Um teste no git confere que todo pacote tem conteúdo e que cada
  `ref` existe, sem copiar texto do livro.
- A criação guiada coloca os itens do pacote no inventário em vez do pacote.
- Fichas com um item de pacote ganham "Abrir pacote" no menu do item: troca o
  pacote pelos itens, somando aos que já existem.

### O que cada um vê

- O jogador vê e mexe no inventário do próprio personagem; o mestre em todos,
  como hoje.
- A carga continua só no modo Fiel; a barra de carga fica embaixo da mochila.

## Fica para quem constrói

- O formato exato do campo de espaço no item da ficha e a migração das fichas
  antigas (no carregamento ou numa migração de dados).
- Quais desenhos do game-icons.net para cada categoria e item.
- O arrastar e soltar (biblioteca ou HTML nativo) e como fica no celular.
- Onde o servidor guarda a munição gasta no combate (junto do estado do
  combate da P5c é o lugar natural).
- Como a edição da ficha (o editor) mostra os espaços: o mesmo modelo C ou a
  lista de hoje com um seletor de espaço.
