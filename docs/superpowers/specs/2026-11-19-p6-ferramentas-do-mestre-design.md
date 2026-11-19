# P6 — Ferramentas do mestre (design)

Parte do roadmap (`2026-11-14-mesa-roadmap-design.md`, P6), depois da P5d, já
na `main`.

## Intenção

O mestre precisa conduzir a mesa sem entregar o jogo: rolar a Percepção do
grupo sem que os jogadores saibam que houve um teste, contar a um jogador só o
que o personagem dele percebeu, e entregar um item achado sem abrir a ficha de
ninguém. Hoje ele faz isso de fora (rola por conta própria, olha a ficha de cada
um, sussurra à mão, edita o inventário), o que é lento e às vezes denuncia o
teste.

**Pronto quando**, numa campanha com três personagens:
- o mestre abre "Teste secreto", deixa os três marcados, escolhe Percepção e
  rola: vê um resultado por personagem, com o bônus da ficha de cada um, e a
  percepção passiva dos três no topo do painel;
- nenhum jogador vê nada: nem rolagem, nem linha no chat, nem aviso;
- o mestre clica "Avisar…" no resultado da patrulheira, escreve "Você percebe um
  brilho atrás da estante" e envia: só a jogadora da patrulheira vê um cartão
  por cima do mapa com o texto, e a mensagem fica no chat dela e no do mestre;
  os outros não veem nada;
- o mestre, no menu de clique direito do guerreiro na coluna do grupo, usa
  "Dar item…", escolhe "Poção de Cura" no compêndio, quantidade 2: a poção entra
  na mochila do guerreiro (com o ícone), e o jogador dele vê o cartão "Você
  recebeu: Poção de Cura ×2", também registrado no chat dos dois;
- dar um item livre ("Mapa rasgado") funciona do mesmo jeito.

## Metas, não-metas, anti-metas

**Metas**
- Teste secreto para um ou mais personagens da campanha, por perícia, atributo
  ou salvaguarda, com o bônus da ficha de cada um; só o mestre vê.
- Percepção passiva de todos à vista do mestre no painel.
- Aviso privado do mestre para o jogador de um personagem: cartão na tela dele e
  registro no chat, só para os dois.
- Dar item (do compêndio ou livre, com quantidade) ao inventário de um
  personagem, com o mesmo aviso ao jogador.
- Funciona no layout compacto (celular), não só no de mesa.

**Não-metas**
- Rolar contra uma CD e marcar sucesso ou falha: o mestre lê os números e
  decide.
- Teste secreto para criaturas do mestre (NPCs): só personagens.
- Tirar item do inventário de alguém: o mestre continua usando o editor da
  ficha.
- Avisos agendados ou automáticos (ex.: "quem passar por aqui percebe…").

**Anti-metas** (o que faria a P6 falhar mesmo funcionando)
- O jogador perceber que houve um teste: qualquer rolagem, linha de chat,
  notificação, som ou mudança visível do lado dele antes do aviso.
- Um aviso ou item chegar ao jogador errado, ou ser visto por outro jogador.
- Um item dado quebrar a ficha (sem id, fora do formato da P5d, munição sem ser
  separada em unidades).

## Decisões do dono

- **O jogador não sabe de nada até o aviso.** A rolagem do teste secreto não
  deixa rastro do lado dele.
- **O aviso chega como destaque com registro no chat:** um cartão por cima do
  mapa, que ele fecha, e a mesma mensagem no chat, visível só para ele e para o
  mestre. Vale para o aviso escrito e para o "Você recebeu…".
- **Onde as ferramentas ficam (abordagem A):** um painel "Teste secreto" aberto
  pelo menu "Mesa" do cabeçalho do mestre; "Dar item…" no menu de clique direito
  de cada personagem na coluna do grupo.

## Abordagens consideradas

- **A. Painel "Teste secreto" + menu de cada personagem (escolhida).** O teste
  quase sempre é para o grupo, e um painel com a lista, a perícia e os
  resultados deixa os resultados à vista para os avisos. Dar item é sempre para
  uma pessoa, e o menu dela é o lugar natural.
- **B. Tudo pela coluna do grupo.** Mais rápido para um personagem só, mas a
  coluna não tem seleção múltipla, e os resultados não teriam onde ficar à
  vista.

## Como funciona

### Teste secreto
- O painel lista os personagens da campanha (os da coluna do grupo), todos
  marcados; o mestre desmarca quem não entra. Escolhe o teste num seletor
  agrupado (Perícias, Atributos, Salvaguardas), com a vantagem/desvantagem como
  na barra de ações.
- Os testes disponíveis e os bônus vêm do mesmo cálculo que o menu "Testes" da
  barra já usa (`frontend/src/utils/characterRolls.ts`, `getCharacterRolls`),
  por sistema de jogo. Assim o d100 do Chamado de Cthulhu entra sem trabalho
  novo quando o sistema chegar (M2): o teste dele é a rolagem de porcentagem que
  o sistema já define. Um personagem cujo sistema não tem aquele teste aparece
  na lista com "não tem esse teste" e não rola.
- Cada personagem é uma rolagem **secreta** do mestre, pelo caminho de rolagem
  que já existe (o servidor só manda rolagem secreta a quem rolou e aos
  mestres), rotulada com o nome do personagem e do teste. Nada vai ao jogador.
- Os resultados ficam no painel até o mestre rolar outro teste ou fechar: nome,
  total, o d20 (ou o d100) e o bônus, com destaque para o natural 20/1. Ficam
  também no histórico secreto de rolagens do mestre.
- **Percepção passiva** no topo: o `passivePerception` que a ficha 5e já guarda
  (10 + Percepção + `passivePerceptionBonus`); se a ficha não tiver o campo,
  `10 + bônus de Percepção + passivePerceptionBonus`. Sistemas sem Percepção
  não mostram. Atualiza quando a ficha muda. *(Decisão do construtor: ler o
  valor da ficha evita divergir de talentos e itens.)*

### Aviso privado
- "Avisar…" num resultado abre um campo de texto (até 500 caracteres) já
  endereçado ao jogador daquele personagem. O mestre escreve e envia.
- O servidor grava a mensagem no chat como um sussurro do mestre (`WHISPER`)
  ao **dono do personagem**, com `metadata` marcando que é um aviso (e, para
  item dado, qual item), e a manda só ao dono e aos mestres. Sem tipo novo de
  mensagem, logo sem migração do banco. *(Decisão do construtor.)*
- Só há "Avisar…" quando o dono do personagem é um jogador que ainda é membro
  da campanha. Personagem de um mestre, ou de um jogador que saiu, não tem
  "Avisar…" (o botão some, com uma dica do porquê). *(Decisão do construtor.)*
- O cliente do jogador mostra o cartão por cima do mapa ao receber o aviso,
  com o texto e um botão para fechar. Avisos que chegam com o jogador fora da
  mesa ficam só no chat (sem cartão depois). Vários avisos seguidos empilham.

### Dar item
- "Dar item…" no menu do personagem abre: busca no compêndio (armas, armaduras,
  equipamento, ferramentas, pacotes, itens mágicos dos livros da campanha, com
  os ícones) ou um item livre (nome e notas), e a quantidade (1–999).
- O servidor acrescenta o item à **mochila** (sem espaço do corpo), pelo mesmo
  normalizador da P5d (id, munição separada em unidades; o mesmo item do
  compêndio já na mochila soma na quantidade), e grava a ficha como o
  "Equipar" da P5d grava: com a linha do personagem presa e
  `character.updated` para todos que veem a ficha, que assim recebem o item na
  hora. Um pacote entra fechado, com "Abrir pacote".
- Em seguida manda ao jogador o aviso "Você recebeu: <nome> ×<n>" pelo mesmo
  caminho do aviso privado. Personagem sem dono que seja membro recebe o item
  sem aviso.
- No layout compacto, "Dar item…" fica no mesmo menu do personagem, aberto
  pelo toque longo na coluna do grupo (que já abre esse menu como uma folha de
  ações).
- Só o mestre pode dar item. Desfazer é o mestre remover o item no editor da
  ficha, como hoje; dar item é um ato do mestre, não uma automação do app.

## Restrições

- Só o mestre da campanha usa as três ferramentas; o servidor recusa o resto.
- Um aviso ou rolagem secreta nunca chega a um socket que não seja do dono do
  personagem ou de um mestre (o servidor é a fronteira, não o cliente).
- i18n pt-BR e en; testes do front em inglês.
- Nada de texto dos livros no git.
- Itens dados seguem o formato da P5d (id, sem espaço, `equipped` em sincronia).

## O que fica para quem constrói
- A forma exata dos eventos de socket e do tipo de mensagem do aviso.
- O desenho do painel e do cartão, nas cores do tema, seguindo o padrão dos
  menus e cartões que já existem.
- Onde o painel aparece no layout compacto (folha inferior, como os outros
  painéis do mestre).
