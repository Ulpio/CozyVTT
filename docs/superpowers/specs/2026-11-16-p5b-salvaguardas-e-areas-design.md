# P5b — Salvaguardas, vários alvos e áreas (design)

Parte do roadmap (`2026-11-14-mesa-roadmap-design.md`, P5), depois da P5a
(`2026-11-15-p5a-barra-de-acoes-design.md`, já na `main`). Escopo da P5b,
decidido com o dono na divisão do P5: magias de salvaguarda, vários alvos,
moldes de área estilo BG3 e a curadoria das `mechanics` das magias de 3º
círculo para cima. **Acrescentado pelo dono agora:** os sopros e as outras
ações de salvaguarda dos monstros.

## Intenção

Na P5a a barra resolve um ataque contra um alvo. A P5b leva a barra às magias
que mais marcam um combate de 5e: a Bola de Fogo que pega um grupo, o sopro do
dragão, o Imobilizar Pessoa, o Raio Ardente com três raios. Do jeito do BG3: o
molde da área segue o mouse, quem está dentro vira alvo, e cada jogador atingido
rola a própria salvaguarda. O mestre continua com a palavra final: tudo que o
app aplica, o mestre desfaz.

**Pronto quando**, numa sessão de teste com os números conferidos contra o
livro:
- um mago de 5º nível conjura Bola de Fogo num grupo com goblins e um
  personagem de jogador; os goblins rolam sozinhos, o jogador rola a própria
  salvaguarda pelo aviso, cada um leva dano inteiro ou metade, e o mestre
  desfaz tudo de uma vez;
- um Dragão Vermelho Adulto usa o Sopro Flamejante em cone pela barra do
  mestre, o botão fica "gasto", e o mestre rola a recarga;
- um clérigo conjura Imobilizar Pessoa e o cartão diz quem passou e quem falhou;
- um feiticeiro conjura Raio Ardente com três raios em alvos escolhidos, um
  repetido;
- toda magia de dano, cura ou salvaguarda de 3º a 9º círculo do Livro do Jogador
  aparece na barra como ação, não só como "conjurar", menos as da lista
  "ficam como conjurar" abaixo.

## Metas, não-metas, anti-metas

- **Metas:** magias de salvaguarda com CD de quem conjura; metade do dano no
  sucesso quando a magia diz; jogador rola a própria salvaguarda; monstros
  rolam sozinhos; vários alvos (escolhidos um a um, ou pela área); raios e
  dardos com um alvo cada; moldes de área estilo BG3 com alcance; ações de
  salvaguarda dos monstros (sopros e parecidas) com recarga; curadoria das
  magias de 3º a 9º círculo; o mestre desfaz tudo.
- **Não-metas (agora):** economia de ações, recarga automática no começo do
  turno, ações lendárias, botões de característica (P5c); efeitos que duram e
  repetem a salvaguarda a cada turno (Guardiões Espirituais, Nuvem Mortal, a
  salvaguarda de fim de turno do Imobilizar Pessoa): a barra resolve só o que
  acontece ao conjurar, o resto é do mestre; condições, resistências,
  vulnerabilidades e imunidades aplicadas pelo app (ficam com o mestre, como no
  roadmap); cobertura e linha de visão; magias conjuradas por monstros
  (o bloco "Conjuração" do monstro); outros sistemas além do 5e.
- **Anti-metas (as da P5a continuam valendo):** o computador do jogador nunca
  recebe a CA, os PV, os bônus de salvaguarda nem a posição de um token do
  mestre que ele não vê; nenhuma área pode revelar ao jogador que há algo
  escondido dentro dela; um jogador nunca rola a salvaguarda de um personagem
  que não controla nem manda números para o servidor; o app nunca aplica algo
  que o mestre não consiga desfazer; uma salvaguarda pendente nunca se perde
  (servidor reiniciado, página recarregada, jogador ausente).

## Abordagens

1. **Ação pendente gravada no banco** (escolhida pelo dono). A ação vira um
   registro com cada alvo e o estado dele (aguardando, passou, falhou). Cada
   salvaguarda que chega aplica o dano daquele alvo e atualiza o cartão. Nada
   se perde num reinício ou numa página recarregada; o desfazer usa o mesmo
   registro e cancela as salvaguardas que faltam.
2. Ação pendente só na memória do servidor. Descartada: um reinício no meio da
   sessão perde as salvaguardas abertas e o dano nunca entra.
3. Dano só no fim, quando todos rolarem. Descartada: um jogador ausente trava o
   dano de todos até o mestre intervir.

## Decidido

### Do dono
- **O jogador rola a própria salvaguarda.** Quando um personagem de jogador é
  alvo, quem o controla recebe um aviso com "Rolar salvaguarda" (normal,
  vantagem ou desvantagem). Monstros e NPCs rolam sozinhos na hora. O mestre
  tem "Rolar pelos que faltam" para quem está ausente ou demorando.
- **Os sopros dos monstros entram**, e as outras ações de monstro com
  salvaguarda e CD no texto.
- **A área pega todos que estão dentro, sem exceção**: aliados, o próprio
  conjurador se estiver dentro, e tokens escondidos. Ninguém desmarca alvos.
  Esculpir Magia e parecidos: o mestre desfaz os aliados.
- **Abordagem 1:** a ação pendente fica gravada no banco.

### Escolhas minhas (o dono pode corrigir)
- **Onde a ação pendente fica gravada:** no próprio cartão da ação (o
  `metadata` da mensagem `CHARACTER_ACTION`), como a P5a já grava ataques e o
  desfazer, com cada alvo ganhando o estado da salvaguarda. É banco, sobrevive a
  reinício, e não pede tabela nova. Se quem constrói achar que o cartão fica
  pesado demais, uma tabela própria também atende à decisão do dono.
- **Quem calcula quem está na área é o servidor.** O app do jogador não recebe
  os tokens ocultos do mestre, então não sabe quem está dentro. O app manda só
  o ponto de origem e a direção do molde; o servidor encaixa o molde na grade
  pela mesma regra do app e escolhe os alvos. A geometria das áreas
  (`map/aoeGeometry.ts` hoje no app) passa a existir igual no servidor, com um
  teste de paridade que falha se as duas cópias divergirem, como já se faz com
  o leitor de dados e a visão.
- **Quem está dentro:** um quadrado da grade está na área se o centro dele está
  dentro do molde encaixado; um token está na área se qualquer quadrado que ele
  ocupa está (uma criatura Grande ocupa 2×2). A pré-visualização no app acende
  os quadrados e os tokens que o jogador vê pela mesma regra.
- **Moldes do livro:** esfera e cilindro e "círculo" usam o raio; cubo e
  "quadrado" usam o lado; cone usa a regra "largura igual à distância" (a que o
  mapa já usa para 5e); linha usa o comprimento e a largura do texto (1,5 m se
  o texto não disser).
- **Origem e alcance:** esfera, cilindro e cubo à distância ("36 metros",
  ponto escolhido): o centro segue o mouse e o app recusa um centro além do
  alcance, medido como na P5a a partir do token de quem conjura. Cone, linha e
  as áreas "Pessoal (cone de 4,5 metros)" saem de quem conjura e giram com o
  mouse. Pelo livro, a origem de um cone ou linha não fica na área, então quem
  conjura não é atingido pelo próprio cone; numa esfera, sim, se estiver
  dentro.
- **Fluxo do clique:** escolhe a magia (e o círculo); o molde aparece e segue o
  mouse; clique fixa e resolve. Esc ou clique direito cancela, como a mira da
  P5a.
- **Vários alvos sem área:** magia com número de alvos (Imobilizar Pessoa em
  círculo maior, Riso Histérico…) clica em até N tokens diferentes, com a
  contagem na dica ("2 de 3"), e confirma com Enter ou um botão. Raios e
  dardos (Raio Ardente, Mísseis Mágicos, a Rajada Mística de níveis 5, 11 e 17)
  escolhem um alvo por raio, podendo repetir. Cada raio de ataque rola contra a
  CA separadamente; os dardos dos Mísseis Mágicos acertam sempre. Isso fecha o
  que a P5a deixou de fora: a Rajada Mística passa a ter um raio por faixa de
  nível, cada um com o +3 da ficha quando a ficha tiver.
- **Salvaguarda do alvo:** d20 + bônus de salvaguarda. Personagem: o bônus da
  ficha (o mesmo das rolagens que já existem). Monstro: a salvaguarda do bloco
  quando ele tem proficiência, senão o modificador do atributo. Sem crítico na
  salvaguarda (20 ou 1 naturais não são automáticos no 5e 2014). Passa se o
  total ≥ CD.
- **Resistência à Magia:** um monstro com o traço "Resistência à Magia" rola com
  vantagem contra magias (não contra o sopro de outro monstro). É o único traço
  lido pelo app; o cartão do mestre diz "vantagem: Resistência à Magia".
- **CD de quem conjura:** personagem, 8 + proficiência + modificador de
  conjuração (o mesmo modificador da P5a). Ação de monstro: a CD do texto.
- **Dano:** rolado uma vez para todos os alvos, como manda o livro; quem falha
  leva tudo, quem passa leva metade arredondada para baixo quando a magia diz,
  ou nada. Aplicado do mesmo jeito da P5a (PV temporários primeiro, até 0;
  teste de concentração quando o alvo concentra). Cada alvo leva o dano no
  momento em que a salvaguarda dele sai.
- **Magia de salvaguarda sem dano** (Imobilizar Pessoa, Riso Histérico): o cartão diz quem passou e quem falhou. A condição é do mestre.
- **Espaço de magia e concentração:** gastos e marcados ao conjurar, como na
  P5a, mesmo com salvaguardas pendentes.
- **O aviso de salvaguarda:** aparece para o dono do personagem (e para
  `controlledBy`) no próprio cartão do chat, com o botão, e num aviso por cima
  do mapa enquanto houver salvaguarda dele pendente. Volta ao recarregar a
  página. Sem prazo: fica pendente até o jogador rolar, o mestre rolar pelos
  que faltam, ou o mestre desfazer. O servidor só aceita a rolagem de quem
  controla aquele personagem, e só uma vez por alvo.
- **Cartão no chat:** um só cartão por ação, que se completa sozinho ("aguardando
  2 salvaguardas" → resultado). O jogador vê a magia, a CD, o dano rolado, e por
  alvo: o nome, o total da salvaguarda quando é personagem de jogador (o dele
  com os dados), passou/falhou, o dano levado e o estado (regras de PV da P5a).
  **Alvos que o jogador não vê** (escondidos, de outro plano, fora da visão)
  **não aparecem no cartão dele**, nem como "Algo": o app não revela que havia
  algo na área. O mestre vê todos, com os bônus, os PV antes → depois e o
  Desfazer. Se quem conjura é um monstro escondido, o cartão do jogador usa o
  nome mascarado, como na P5a.
- **Desfazer:** só o mestre, a ação inteira: devolve os PV de quem já levou dano
  (com a regra da P5a: se os PV daquele alvo mudaram depois, avisa e pula esse
  alvo), cancela as salvaguardas pendentes (o aviso some dos jogadores), devolve
  o espaço e a concentração, e devolve a recarga gasta do monstro.
- **Ações de salvaguarda dos monstros:** lidas do texto do bloco pelo formato
  do livro em português, no mesmo leitor da P5a: "teste de resistência de
  Destreza CD 21", área ("num cone de 18 metros", "numa linha de 18 metros de
  comprimento e 1,5 metro de largura", "raio de 6 metros"), dano "63 (18d6) de
  dano de fogo se falhar… ou metade desse dano caso obtenha sucesso", e recarga
  no nome ("(Recarrega 5–6)", "(Recarga 6)"). Sem área no texto, escolhe os
  alvos como uma magia de vários alvos (um alvo quando o texto diz "um alvo").
  O que o leitor não entende continua virando "Usar", que posta o texto. Hoje
  o Livro dos Monstros tem 239 ações com teste e CD, 81 com área, 157 com dados,
  51 com recarga; um teste conta quantas o leitor entende, com a lista nomeada
  das que não entende por defeito do texto, como na P5a.
- **Recarga:** ao usar uma ação com recarga, ela fica "gasta" naquele token e o
  botão mostra "Rolar recarga (5–6)". O mestre clica, o app rola 1d6 e posta no
  chat; se tirar o número, a ação volta. O mestre também pode liberar à mão. O
  estado fica no token, para dois dragões iguais não dividirem o sopro.
- **Curadoria das magias de 3º a 9º círculo:** as 213 magias do Livro do
  Jogador recebem `mechanics` quando têm ataque, salvaguarda, dano, cura ou
  área no que acontece ao conjurar; as outras continuam "conjurar". A trava de
  esquema que só aceita `mechanics` até o 2º círculo sai. Os campos novos que a
  leitura pedir (raios por nível, acerto automático, largura da linha) entram
  no esquema como campos opcionais; o texto da curadoria fica em
  `materiais/` (fora do git), como o resto. As 68 magias de círculo 0 a 2
  ganham os mesmos campos novos quando precisarem (Mísseis Mágicos, Rajada
  Mística).
### Decididas depois da leitura do revisor (escolhas minhas)
- **Desfazer por alvo, além do todo:** o cartão do mestre tem "Desfazer" em cada
  alvo (devolve os PV daquele alvo, ou cancela a salvaguarda pendente dele) e
  "Desfazer tudo". É o que torna "o mestre desfaz os aliados" (Esculpir Magia) e
  as resistências, imunidades e Evasão, que ficam com o mestre, um clique por
  alvo. Desfazer tudo depois pula os alvos já desfeitos.
- **Ataques de monstro com salvaguarda no acerto** (a picada da aranha: "Acerto:
  … e o alvo deve fazer um teste de Constituição CD 11, sofrendo 2d8 de veneno
  se falhar, ou metade se passar"): entram. O ataque resolve como na P5a; se
  acertar, a salvaguarda do alvo fica pendente (ou rola sozinha, para monstro)
  e o dano extra entra pelo resultado. Sem acerto, não há salvaguarda. O mesmo
  vale para magias com ataque e salvaguarda.
- **Magias que o modelo não expressa bem:**
  - Entram com aproximação:
    - **Relâmpago em Cadeia:** até 4 alvos escolhidos.
    - **Curar Ferimentos em Massa e Cura Completa em Massa:** até N alvos escolhidos ao alcance, sem molde. A cura não segue "a área pega todos": quem escolhe os alvos é o conjurador.
    - **Toque Vampírico:** ataque e, se acertar, cura quem conjura em metade do dano.
    - **Convocar Relâmpagos, Raio Solar e parecidas:** só o que acontece ao conjurar; as repetições são do mestre.
  - **Ficam como "conjurar"**, postando o texto: Chuva de Meteoros, Rajada Prismática, Muralha Prismática, as muralhas que o conjurador desenha (Muralha de Fogo, de Gelo…), Bola de Fogo Controlável e as que dependem de sorteio. A curadoria lista o que ficou de fora.
- **Quem a área pega:**
  - Só tokens da camada de tokens que estão no mesmo plano de quem conjura. Um token do outro plano (camada espiritual) não é atingido por uma magia do plano material, e vice-versa.
  - Tokens sem ficha nem bloco de monstro (objetos, cenário) não são alvos e não aparecem no cartão.
- **Token de monstro controlado por um jogador** (`controlledBy`, um familiar ou uma criatura invocada): conta como do jogador. Quem controla rola a salvaguarda pelo aviso, e o cartão dele mostra o total. Ele já age por esse token pela barra da P5a.
- **Resistência à Magia:** dá vantagem só quando a fonte é uma magia do compêndio conjurada por um personagem. Nunca vale contra ações de monstro, mesmo as mágicas. O mestre ajusta à mão se quiser.
- **Celular (mesa compacta):** o aviso de salvaguarda e o botão funcionam igual.
  O molde de área segue o dedo: toca para mirar, toca de novo no botão
  "Confirmar" para resolver.

## Fica para quem constrói

Nomes de eventos, componentes e funções; a forma exata do registro pendente e
do cartão; como o app pede ao servidor a lista de salvaguardas pendentes ao
entrar; o desenho do aviso e da pré-visualização; textos em pt-BR e en; os
limites de envio dos eventos novos (no padrão da P5a e documentados onde o teste
`keepInStep` confere); como o leitor de monstro extrai os moldes; a ordem de
fazer a curadoria das 213 magias; os testes no padrão do projeto, incluindo
"o jogador não recebe nada sobre um token escondido atingido pela área", "o
jogador não rola a salvaguarda de quem não controla", "a salvaguarda pendente
volta depois de recarregar" e o de paridade da geometria.
