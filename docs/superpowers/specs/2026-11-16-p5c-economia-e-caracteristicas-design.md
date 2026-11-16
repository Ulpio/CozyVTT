# P5c — Economia do turno e botões de característica (design)

Parte do roadmap (`2026-11-14-mesa-roadmap-design.md`, P5), depois da P5a
(`2026-11-15-p5a-barra-de-acoes-design.md`) e da P5b
(`2026-11-16-p5b-salvaguardas-e-areas-design.md`), as duas na `main`.
**Divisão decidida pelo dono agora:** o que o roadmap chamava de P5c vira duas
partes. Esta P5c traz a economia do turno e os botões de característica. A P5d
traz o inventário com ícones e a munição e as rações contadas no modo Fiel.

## Intenção

Depois da P5b, a barra resolve ataques, magias e áreas, mas não sabe de quem é a
vez nem o que cada um já gastou no turno. As características que mais marcam as
classes também não estão lá: Fúria, Ataque Furtivo, Golpe Divino, Surto de Ação,
Rajada de Golpes. A P5c fecha o "pronto quando" do P5 inteiro: um turno de
combate de cada classe jogado só pela barra. Como no BG3, em combate a barra sabe
o que cada um ainda pode fazer neste turno e apaga o que já foi gasto. Fora de
combate, nada trava. O mestre continua com a palavra final: ele devolve uma ação
a quem quiser.

**Pronto quando**, numa sessão de teste com os números conferidos contra o
livro, com um personagem de 3º nível de cada uma das 12 classes do Livro do
Jogador:
- cada um joga um turno de combate inteiro só pela barra: a ação, a ação bônus
  quando a classe tem uma, o deslocamento e pelo menos uma característica da
  classe;
- o bárbaro entra em Fúria (ação bônus, 1 dos 3 usos) e soma o dano da Fúria nos
  ataques corpo a corpo de Força;
- o ladino soma o Ataque Furtivo uma vez no turno, e a segunda tentativa no mesmo
  turno é recusada;
- o paladino acerta e gasta um espaço de magia no Golpe Divino, e o dano extra
  sai do tamanho certo para o círculo;
- o guerreiro usa Surto de Ação e faz uma segunda ação no mesmo turno, e usa
  Retomar o Fôlego como ação bônus;
- o monge gasta 1 de Ki na Rajada de Golpes e faz os dois ataques desarmados;
- um descanso curto devolve o Surto de Ação, o Ki e os espaços do bruxo, e um
  descanso longo devolve a Fúria, os espaços de magia, os PV e metade dos dados
  de vida;
- o servidor reinicia no meio do combate e a rodada, a vez e o que cada um gastou
  continuam lá.

## Metas, não-metas, anti-metas

- **Metas:**
  - economia do turno em combate (ação, ação bônus, reação, deslocamento);
  - as ações comuns como botões: Disparada, Desengajar, Esquivar, Ajudar,
    Esconder, Ataque (com Ataque Extra);
  - botões das características de classe e subclasse do Livro do Jogador do 1º
    ao 5º nível;
  - recursos contados que travam o botão quando acabam;
  - descanso curto e longo;
  - estado do combate gravado no banco;
  - o mestre devolve ações e usos.
- **Não-metas (agora):**
  - inventário com ícones, munição e rações (P5d);
  - características do 6º nível em diante;
  - características de raça, talento e antecedente (exceto se a curadoria achar
    uma de combate trivial, como o Sopro do draconato, que entra como "usar");
  - características dos monstros e as ações lendárias e de covil (ficam com o
    mestre);
  - condições, resistências e vantagem que a característica dá (a resistência da
    Fúria, a vantagem do Esquivar): o app marca o estado, o mestre aplica o
    efeito, como no roadmap;
  - reação disparada pelo app: o app nunca pergunta "quer fazer o ataque de
    oportunidade?", o jogador clica;
  - a regra da magia de ação bônus mais truque;
  - multiclasse além do que cai de graça (cada classe conta os próprios níveis);
  - outros sistemas além do 5e.
- **Anti-metas:**
  - todas as da P5a e da P5b continuam valendo: o jogador nunca recebe a CA, os
    PV, os bônus nem a recarga de um token do mestre;
  - o jogador nunca vê a economia nem os recursos dos monstros, nem a dos outros
    jogadores além de "de quem é a vez";
  - a trava nunca impede o mestre de agir, e nunca impede alguém de mover um token
    no mapa;
  - uma vez ou um gasto nunca se perde: servidor reiniciado, página recarregada;
  - nenhum texto do livro no git: a mecânica curada das características mora em
    `materiais/`, como a das magias.

## Abordagens

1. **Mecânica curada no compêndio, com um motor único** (escolhida pelo dono).
   Cada característica do livro ganha um bloco `mechanics` declarativo na
   curadoria fora do git, como as magias na P5b. Um motor só, no servidor, lê o
   bloco e resolve. A ficha acha as características pela classe, subclasse e
   nível que já tem, então os personagens da P4 ganham os botões sem refazer
   nada. O que não cabe no vocabulário vira "usar": gasta o recurso e posta o
   nome no chat. Custo: uma curadoria grande.
2. **Código por característica.** Um módulo por característica. Lida melhor com
   as esquisitas, mas são dezenas de módulos, os números do livro entram no git
   dentro do código e cada característica nova pede programação.
3. **Botões livres na ficha.** O jogador escreve "Ataque Furtivo: +2d6, 1 por
   turno". Sem curadoria, mas o jogador digita números, contra o "sem digitar
   números à mão" da P4, e os erros só aparecem na mesa.

## Decididas com o dono

- **Economia: trava em combate, livre fora** (opção c). Sem combate ativo no
  rastreador, a barra fica como hoje.
- **Na sua vez:** uma ação, uma ação bônus, uma reação e o deslocamento. Gastou a
  ação, os botões que custam ação apagam até o seu próximo turno. O mesmo para a
  ação bônus.
- **Fora da sua vez:** só os botões que custam reação ficam ligados. A reação
  volta no começo do seu turno.
- **O mestre devolve** a ação, a ação bônus, a reação, o deslocamento ou um uso
  de característica de qualquer combatente.
- **Recursos contados e travados** (opção a): cada recurso aparece como bolinhas
  na barra; acabou, o botão apaga. A ficha ganha "Descanso curto" e "Descanso
  longo", que devolvem o que o livro diz.
- **P5c e P5d separadas**, nesta ordem.

## Decididas por mim (o dono pode corrigir)

### Estado do combate
- **Gravado no banco**, numa tabela de combate por campanha, no lugar do estado
  na memória do `websocket/initiativeState.ts`. Guarda o que já guarda hoje
  (ativo, rodada, vez, ordem) e, por combatente, o gasto do turno: ação, ação
  bônus, reação, metros andados, ações extras, ataques que sobram da ação de
  Ataque e as características "uma vez por turno" já usadas. Com a trava, perder
  a vez num reinício travaria a mesa.
- **Começo do turno de um combatente** (quando o rastreador passa a vez para
  ele): zera a ação, a ação bônus, a reação, os metros, os ataques e os "uma vez
  por turno" dele.
- **"Uma vez por turno" vale para cada turno, não só o seu:** como no livro, um
  ladino que faz um ataque de oportunidade na vez de outro pode somar o Ataque
  Furtivo de novo. O que já foi usado zera quando a vez passa, para todos.
- **Quem entra no combate no meio** (adicionado ao rastreador) começa com tudo
  disponível.
- **O mestre também está na economia** com os monstros: a mesma trava, para o
  jogo ficar parecido dos dois lados. Ele se devolve a ação com um clique.
- **Multiataque dos monstros:** o primeiro ataque gasta a ação; os outros
  ataques do mesmo monstro no mesmo turno ficam liberados, sem contar quantos.
  Ler o texto do Multiataque fica para depois.

### Custos das ações
- **Cada opção da barra ganha um custo:** ação, ação bônus, reação, nenhum.
  Magias: do tempo de conjuração do compêndio ("1 ação", "1 ação bônus",
  "1 reação"); magia de 1 minuto ou mais não aparece em combate como botão
  ativo (aparece apagada, com o tempo escrito). Ataques com arma: a ação de
  Ataque.
- **Ação de Ataque:** dá 1 ataque com arma, 2 com Ataque Extra no 5º nível. O
  primeiro ataque gasta a ação e deixa "ataque 2 de 2" na barra até o fim do
  turno. Outra ação no meio (uma magia) encerra os ataques que sobravam.
- **Ataque de oportunidade:** fora da sua vez, os ataques corpo a corpo com arma
  ficam ligados custando a reação.
- **Ações comuns** (Disparada, Desengajar, Esquivar, Ajudar, Esconder): botões
  num grupo próprio da barra, custam a ação, postam no chat. A Disparada soma o
  deslocamento de novo. O resto é só marcado; o efeito é do mestre.
- **Servidor confere** a trava: um pedido que custa o que já foi gasto, ou fora
  da vez sem ser reação, é recusado com uma mensagem ("Você já usou a ação neste
  turno"). A tela só apaga os botões.

### Deslocamento
- **O servidor soma** os metros que o token do combatente da vez anda, a cada
  `token.move.end`, com a mesma medida da régua do mapa (quadrados × pés por
  quadrado, a regra de diagonal do mapa).
- **Passou do limite:** aviso só para o mestre no chat, sem travar o token. O
  mapa também serve para o mestre arrumar a cena.
- **Mover um token fora da vez** não conta (o mestre arrumando a cena, um
  empurrão).
- **A barra mostra** "Deslocamento: 6 de 9 m".

### Características
- **Vocabulário da mecânica** (o construtor pode ajustar os nomes, não a ideia):
  - `cost`: ação, ação bônus, reação, nenhum.
  - `resource`: o que gasta e quanto. O máximo vem do nível (tabela por nível da
    classe), de um modificador de atributo, do bônus de proficiência ou de um
    número; volta no descanso curto ou no longo.
  - `addDamage`: dados somados ao dano de um ataque que acertou, com tabela por
    nível, "uma vez por turno" quando o livro diz, e o filtro do ataque (corpo a
    corpo, com arma, de Força, de acuidade ou à distância). Pode gastar um espaço
    de magia (Golpe Divino: dados por círculo, com teto).
  - `state`: liga um estado no token (Fúria), com o bônus de dano que ele dá e o
    filtro do ataque, até o jogador desligar, o combate acabar ou um descanso.
  - `heal`: cura com dados e somas (Retomar o Fôlego); ou uma reserva de pontos
    gastos à escolha (Cura pelas Mãos).
  - `extraAction`: dá mais uma ação neste turno (Surto de Ação).
  - `makeBonus`: deixa ações comuns custarem ação bônus (Ação Ardilosa).
  - `attacks`: ataques próprios (Rajada de Golpes: dois desarmados; Artes
    Marciais: um desarmado como ação bônus depois da ação de Ataque).
  - `passive`: muda os números da barra sem botão: Ataque Extra, Crítico
    Aprimorado (19 ou 20), Estilos de Luta que somam no ataque ou no dano. O
    construtor confere o que a P5a já aplica para não somar duas vezes.
  - `use`: só gasta o recurso e posta o nome no chat (Forma Selvagem,
    Inspiração de Bardo, Canalizar Divindade e as opções dela).
  - `none`: sem botão, com o motivo anotado (fora de combate, ou já na ficha,
    como Especialização).
- **Ataque Furtivo, Golpe Divino e parecidos:** são marcados antes do ataque,
  como uma opção do ataque ("com Ataque Furtivo"); só somam se acertar. O app não
  confere a vantagem ou o aliado ao lado que o Ataque Furtivo pede: o jogador
  marca, o mestre julga. O Golpe Divino pergunta o círculo do espaço ao marcar.
  O dano extra contra mortos-vivos e corruptores fica com o mestre.
- **Estado no token:** a Fúria aparece como marcador no token, visível para
  todos (já é visível na mesa). Acaba no clique, no fim do combate ou num
  descanso. A duração de 1 minuto e o "acaba se não atacar" ficam com o mestre.
- **Onde aparecem:** um grupo "Características" na barra, com as bolinhas dos
  recursos ao lado do nome.
- **A ficha acha as características** pelas `classes` (classe, subclasse e
  nível, com o `compendiumRef` da P4). Um personagem da ficha antiga sem
  `compendiumRef` tenta pelo nome da classe; não achou, fica sem botões, como
  hoje.
- **O mestre corrige** uma mecânica no editor de correções do compêndio, como já
  faz com as magias.

### Recursos e descanso
- **Gastos gravados na ficha** do personagem (quantos usos foram gastos, por
  característica). O máximo é calculado na hora, então subir de nível já muda o
  máximo.
- **Descanso curto:** devolve os recursos "descanso curto" e os espaços de magia
  do bruxo; mostra os dados de vida que sobram para gastar, um por clique, rolando
  o dado mais o modificador de Constituição e curando.
- **Descanso longo:** PV ao máximo, todos os espaços de magia, todos os recursos,
  metade dos dados de vida gastos (no mínimo 1), desliga os estados.
- **Quem descansa:** o jogador, no próprio personagem; o mestre, em qualquer um,
  e com "Descanso para o grupo" no rastreador ou na lista de personagens. Em
  combate os botões de descanso ficam apagados.
- **Cartão no chat:** "Fulano fez um descanso curto" com o que voltou, como as
  outras ações.

### Desfazer
- **Desfazer um cartão** devolve também o uso de característica e o espaço de
  magia que ele gastou (o Golpe Divino), como a P5a já devolve o espaço.
- **Devolve a ação** gasta só se ainda for o mesmo turno do mesmo combatente; se
  a vez já passou, a economia fica como está.

### O que cada um vê
- **Jogador:** a economia e os recursos do próprio personagem, e de quem é a vez
  (o rastreador já mostra). Os cartões das características dos outros jogadores,
  como qualquer ação.
- **Mestre:** a economia de todos os combatentes no rastreador, com o
  "devolver".
- **Monstros:** os gastos e a economia nunca saem do servidor para o jogador.

## Fica para quem constrói

- Os nomes da tabela de combate e dos campos.
- Os nomes exatos do vocabulário da mecânica, desde que caiba tudo acima.
- O desenho dos botões e das bolinhas, seguindo a barra da P5a.
- O teto de eventos por segundo dos novos eventos de socket, seguindo os da P5b.
- Os testes: um de cobertura igual ao `spellCoverage` (toda característica de
  classe e subclasse do 1º ao 5º nível tem uma decisão de curadoria), um e2e por
  item do "pronto quando", um de "o estado volta depois de reiniciar".
