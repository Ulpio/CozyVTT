# P5a — Barra de ações: ataques, cura e testes (design)

Parte do roadmap (`2026-11-14-mesa-roadmap-design.md`, P5). O P5 foi dividido
em três, nesta ordem (decidido com o dono):

- **P5a (este):** a barra, testes com um clique, ataques contra o alvo, dano
  aplicado, magias de ataque e de cura, espaços de magia gastos, concentração.
  Vale para os personagens dos jogadores **e para os monstros do mestre**.
- **P5b:** magias de salvaguarda, vários alvos, moldes de área estilo BG3 (e a
  curadoria de `mechanics` das magias de 3º círculo para cima).
- **P5c:** economia de ações do turno, botões que somam dados ou marcam estado
  (Ataque Furtivo, Golpe Divino, Fúria…), inventário com ícones, munição e
  rações contadas no modo Fiel.

Depende do P2 (compêndio), do P4 (ficha com `compendiumRef`), já na `main`.

## Intenção

Na sessão, cada um joga o próprio turno clicando, como no BG3: escolhe a ação
na barra embaixo do mapa, clica no alvo, e o app rola, compara com a CA, aplica
o dano e conta no chat. O mestre faz o mesmo com os monstros. Tira da mesa a
conta de cabeça e o "quanto de CA ele tem?", sem tirar do mestre a palavra
final (tudo que o app aplica, o mestre desfaz).

**Pronto quando** um personagem de cada classe do Livro do Jogador, criado pelo
P4, faz um turno de ataque (arma, truque de ataque ou magia de ataque, e cura
quando a classe tem) só pela barra contra um monstro do compêndio, e o mestre
responde com o ataque do monstro pela barra dele, com os números conferidos
contra o livro.

## Metas, não-metas, anti-metas

- **Metas:** barra gerada da ficha (ataques, magias, itens com ataque, testes)
  e do bloco do monstro; escolher a ação e depois o alvo no mapa; ataque contra
  a CA com crítico e vantagem/desvantagem; dano aplicado nos PV do alvo; cura
  aplicada; espaço de magia gasto, inclusive em círculo maior; concentração
  marcada; cartão no chat diferente para jogador e mestre; o mestre desfaz.
- **Não-metas (agora):** salvaguardas de magia, área, vários alvos (P5b);
  economia de ações, trava de turno, botões de característica, ícones,
  munição (P5c); resistências, vulnerabilidades, condições e reações
  automáticas (ficam com o mestre, como decidido no roadmap); cobertura e
  linha de visão; outros sistemas além do 5e.
- **Anti-metas:** o computador do jogador nunca recebe a CA, os PV nem a
  chance de acerto de um token do mestre (nem no cartão, nem no estado do
  combate, nem na resposta da ação); um jogador não consegue mandar números
  inventados (bônus, dados) para o servidor; o app nunca aplica algo que o
  mestre não consiga desfazer; a barra não pode quebrar as fichas e tokens que
  já existem (ficha sem `compendiumRef`, NPC feito à mão).

## Abordagens

1. **O servidor resolve a ação inteira** (escolhida). O app manda só "quem,
   qual ação, qual alvo, que modo (normal/vantagem/desvantagem), que círculo".
   O servidor lê o bônus e o dano da ficha ou do bloco do monstro, rola, compara
   com a CA, aplica, grava e manda um cartão por papel. É o único jeito em que a
   CA não sai do servidor e ninguém manda um "+50".
2. O app do jogador calcula e o servidor só aplica o dano. Descartada: o app
   precisaria da CA do alvo para dizer acertou/errou, e ela vazaria.
3. O app manda os números prontos (bônus, dados) e o servidor rola. Descartada:
   qualquer jogador poderia mandar números inventados.

## Decidido

### Do dono
- O P5 se divide em P5a, P5b e P5c, nesta ordem, com o escopo acima.
- **O mestre também usa a barra**, para os monstros e NPCs.
- **Ação primeiro, depois o alvo (estilo BG3):** clica na ação, o cursor vira
  mira, os tokens ao alcance acendem, clica no alvo e resolve. Esc ou clique
  direito cancela.
- Do roadmap (já decidido): ataques contra a CA, crítico, vantagem e
  desvantagem automáticos; dano rolado e aplicado direto nos PV, o mestre
  desfaz; o jogador vê só o estado do monstro ("ileso / ferido / muito ferido"),
  nunca PV, CA nem chance de acerto; o mestre vê tudo; conjurar em círculo
  maior e espaços gastos; concentração marcada; resistências, condições e
  reações à mão do mestre.

### Escolhas minhas (o dono aprovou o resumo; pode corrigir)
- **Onde fica:** uma faixa embaixo do mapa na mesa do computador (entre o mapa e
  a borda, abaixo das três colunas de hoje), com o retrato e PV/CA do ator à
  esquerda, os botões no meio e o modo (Normal / Vantagem / Desvantagem) à
  direita. Botões de ataque ficam soltos; Magias, Itens e Testes abrem menus.
  No celular (mesa compacta) a barra abre como uma folha pela barra de baixo que
  já existe.
- **De quem é a barra:** jogador vê a barra do próprio personagem (se tiver mais
  de um na campanha, troca pelo retrato); o mestre vê a do token selecionado no
  mapa (personagem ou NPC). Sem token selecionado, o mestre não vê barra.
- **Ações de personagem:** cada `attacks[]` da ficha vira um botão (o bônus e o
  dano vêm da ficha, que o P4 já calcula; quem editou a ficha à mão vê seus
  números). Magias e truques da ficha que têm `compendiumRef` e `mechanics` com
  `attack` ou `healing` viram ações; as demais aparecem no menu de magias só
  como "conjurar" (gasta o espaço, marca concentração, posta o texto no chat).
- **Ações de monstro:** lidas do texto do bloco (`statBlock.actions`,
  `bonusActions`, `reactions`) no servidor, pelo formato do livro em português:
  "Ataque Corpo-a-Corpo com Arma: +4 para atingir, alcance 1,5 m, um alvo.
  Acerto: 5 (1d6 + 2) de dano cortante." Lê tipo (corpo-a-corpo/distância),
  bônus, alcance ou distância normal/longa, a fórmula de dano entre parênteses e
  o tipo, e danos extras "mais 7 (2d6) de dano de veneno". O que sobra do texto
  (ex.: "teste de Força CD 11 para não cair no chão") vai no cartão do mestre
  para ele aplicar. Ação que o leitor não entende vira botão "Usar" que só
  posta o nome e o texto no chat. Vale para monstros importados, NPCs feitos à
  mão e tokens já no mapa, sem migração.
- **Alcance:** medido no mapa de centro a centro dos tokens, pela escala da
  grade. Corpo-a-corpo: alcance da arma (1,5 m, 3 m com "alcance"). Distância:
  até o normal, normal; entre o normal e o longo, desvantagem automática (no
  cartão: "desvantagem: longe"); além do longo, o alvo não acende e o servidor
  recusa. Magias: o alcance do texto (`range`, "36 metros", "Toque" = corpo a
  corpo, "Pessoal" = só em si). Cobertura e linha de visão: à mão do mestre.
- **Ataque:** d20 + bônus (2d20 com vantagem/desvantagem; vantagem e
  desvantagem juntas se anulam); 20 natural sempre acerta e é crítico (dobra os
  dados de dano, não o bônus); 1 natural sempre erra; acerta se total ≥ CA.
  CA do personagem: `armorClass` da ficha; do NPC: `statBlock.ac`.
- **Truques que crescem:** dano pelo nível do personagem (5, 11, 17), pela
  `scaling.cantrip`. **Círculo maior:** o jogador escolhe o círculo entre os que
  têm espaço livre; soma `scaling.perSlot` por círculo acima.
- **Espaços de magia:** o servidor gasta o espaço na ficha ao conjurar (acerto ou
  erro). Sem espaço livre, o botão daquele círculo fica indisponível. Truque não
  gasta. Bruxo usa os espaços de pacto como já estão na ficha.
- **Cura:** escolhe o aliado (ou a si) como alvo; rola a cura + modificador de
  conjuração quando a magia diz; sobe os PV até o máximo.
- **Concentração:** a ficha ganha um campo opcional "concentrando em" (nome da
  magia e ref). Conjurar outra magia de concentração pergunta antes de trocar.
  Quando um personagem concentrado leva dano pela barra, o cartão mostra o botão
  "Teste de concentração (CD x)" (CD = maior entre 10 e metade do dano) para o
  dono rolar com a salvaguarda de CON da ficha; falhar limpa o campo. O mestre e
  o dono também limpam à mão.
- **Testes com um clique:** o menu Testes da barra reusa as rolagens que já
  existem (`getCharacterRolls` / `npcRolls`) com o modo da barra. Não muda nada
  na rolagem, só o lugar.
- **Dano e PV:** dano tira primeiro dos PV temporários, depois dos atuais, até
  0. Personagem: na ficha (`hp`). NPC: no token (`hp`). Ao chegar a 0, só o
  cartão avisa ("caiu"); salvaguardas contra a morte e condições continuam à mão.
- **Regra nova de permissão no servidor:** uma ação resolvida pela barra pode
  mudar os PV de um token do mestre ou do personagem de outro jogador. O
  servidor só aceita a ação se quem pede controla o ator (dono do personagem,
  `controlledBy`, ou o mestre); o alvo pode ser qualquer token do mapa atual. É
  a mudança pequena no código original que o roadmap previu; o motivo vai no
  commit.
- **Desfazer:** cada ação resolvida grava o que mudou (PV antes e depois de cada
  alvo, espaço gasto, concentração). O cartão do mestre tem "Desfazer", que
  devolve tudo da ação, se os PV do alvo não mudaram de novo desde então (se
  mudaram, avisa e desfaz só o espaço e a concentração, ou o mestre corrige à
  mão). Desfazer só pelo mestre.
- **Cartão no chat:** um tipo de mensagem novo, com projeção por papel feita no
  servidor (como a iniciativa já faz). Jogador vê: ator → alvo, ação, total do
  ataque e os dados, acertou/errou/crítico, dano e tipo, estado do alvo (só
  "ileso / ferido / muito ferido / caído" para tokens do mestre; os PV quando o
  alvo é um personagem de jogador). Mestre vê também a CA, a chance de acerto,
  os PV antes → depois, o texto extra do monstro e o Desfazer. Se o ator é um
  monstro, o jogador alvo vê o ataque e o dano no próprio personagem.
- **Estado do monstro:** ileso (PV cheios), ferido (acima da metade), muito
  ferido (metade ou menos), caído (0).
- **Fora de combate:** a barra funciona sempre, sem trava de turno nem de
  movimento (a economia chega no P5c). Fora de campanha não há barra.

### Decididas depois da leitura do revisor (escolhas minhas)
- **Alvo que o jogador não vê:** o jogador só mira tokens que ele recebe hoje
  (o servidor usa o mesmo filtro de `filterTokensByRole`/`tokenSentTo`: nada
  escondido, de outro plano ou fora da visão com iluminação). Um alvo fora disso
  é recusado como "alvo inválido", sem dizer se existe. Quando um token
  escondido ou mascarado age contra um jogador, o cartão desse jogador usa o
  nome como ele vê o token (mascarado → "Algo"; escondido → "Algo invisível").
- **PV de personagem no cartão:** seguem a regra de hoje. O dono e o mestre
  sempre veem; os outros jogadores só se a barra de PV daquele token estiver
  visível (`showHpBar`). **PV de monstro:** se o mestre ligou a barra de PV
  daquele monstro, o cartão mostra os PV (o mestre já escolheu mostrar); senão,
  só o estado. A CA e a chance de acerto nunca.
- **Distância:** contada em quadrados entre as bordas mais próximas dos tokens
  (criatura Grande ocupa 2×2), pela regra de diagonal do mapa (`diagonalRule`),
  vezes a escala (`feetPerSquare`). Um ogro ao lado de um personagem está a 1,5 m.
- **Cura + modificador:** as magias de cura de círculo 0–2 do Livro do Jogador
  somam o modificador de conjuração. Isso vira dado: `mechanics.healingAddsModifier`
  (opcional, booleano) no esquema do compêndio, preenchido pela curadoria em
  `materiais/` (fora do git), como o resto.
- **Armas versáteis:** a barra mostra a arma com a escolha "uma mão / duas mãos"
  quando a ficha tem a linha de dano marcada como versátil (como o P4 grava); a
  linha versátil substitui o dano principal, nunca soma. As outras linhas de
  `additionalDamage` somam.

## Fica para quem constrói

Nomes de eventos, componentes e funções; a forma exata do registro de ação (para
o desfazer) e do cartão; o layout fino da barra e do menu de magias; textos em
pt-BR e en; como a escala do mapa vira metros; o leitor de texto de monstro
(com testes sobre os 428 monstros do banco, contando quantos ele entende); os
testes no padrão do projeto, incluindo os de "o jogador nunca recebe CA/PV do
monstro" e "o jogador não age por um token que não controla".
