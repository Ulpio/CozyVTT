# P7 — Iluminação dinâmica pronta para jogar (design)

Parte do roadmap (`2026-11-14-mesa-roadmap-design.md`, P7), depois da P6, já
na `main`.

## Intenção

Paredes, portas, janelas, luzes fixas, visão dos tokens, névoa e a memória do
que já foi explorado já existem, e o servidor já esconde do jogador os tokens
que o personagem dele não enxerga. Falta deixar isso pronto para uma sessão de
verdade: hoje um token novo não tem visão no escuro (nem um anão), ninguém pode
carregar uma tocha, um mapa novo vem com a iluminação desligada e "tudo
iluminado", e os painéis de paredes, luz e névoa usam cores soltas, fora do
tema.

O mapa da oneshot ainda não está definido, então a P7 prepara o que serve para
qualquer um: uma masmorra escura com tochas ou um lugar iluminado com salas
fechadas.

**Pronto quando**, num mapa novo:
- o mestre desenha as paredes de uma pequena masmorra (com uma porta) e põe
  uma fogueira em uma sala, em poucos minutos;
- liga "Escuro" no mapa e põe os tokens de três personagens criados pela
  criação guiada: o anão enxerga 12 quadrados no escuro sem o mestre mexer
  em nada, o humano não enxerga nada fora da luz;
- o humano põe uma tocha na mão (inventário da P5d): o token dele passa a
  iluminar 4/8 quadrados e a luz anda com ele;
- cada jogador, andando com o próprio token, vê as salas se revelarem pela
  linha de visão, o que já viu fica esmaecido, e atrás da porta fechada
  nada aparece até ela ser aberta;
- os painéis de paredes, luz e névoa estão nas cores do tema;
- um teste automático cobre essa revelação do lado do jogador.

## Metas, não-metas, anti-metas

**Metas**
- Visão no escuro automática pela ficha 5e: a raça (e a sub-raça, quando ela
  muda o valor) dá o alcance; o token ligado ao personagem recebe esse alcance.
- Luz no token: uma "Luz" (nenhuma ou uma predefinição: vela, tocha, lampião,
  lanterna, ou raio próprio e cor), que anda com o token e entra no mesmo
  cálculo das luzes fixas.
- Atalho do inventário: pôr uma tocha, lampião ou lanterna na mão liga a luz do
  token com a predefinição do item; guardar o item apaga, se a luz ainda for a
  que o item ligou.
- Padrões de mapa novo prontos para jogar e um interruptor "Escuro" fácil.
- Painéis de paredes, luz e névoa nas cores do tema.
- Um teste de ponta a ponta da revelação do lado do jogador.

**Não-metas**
- Paredes de um sentido e portas secretas.
- Luz de magia automática (a magia *Luz* não liga nada sozinha; o jogador ou
  o mestre usa a "Luz" do token).
- Visão no escuro de outros sistemas (só 5e).
- Sombras suaves, cores de luz misturadas ou outros efeitos visuais novos.

**Anti-metas**
- O jogador ver através da luz de outro token algo que o personagem dele não
  enxerga pela linha de visão (a luz ilumina, mas não dá visão).
- Um jogador mudar a visão no escuro do próprio token (continua campo restrito
  do mestre).
- A luz de um token do mestre revelar a posição de um monstro escondido: um
  token que o jogador não pode ver não vira luz visível para ele... **exceto**
  a área iluminada no chão, que o jogador vê se estiver na linha de visão
  (como na mesa de verdade, ver luz vindo de um corredor é uma pista).

## Decisões do dono

- **Luz no token (abordagem A)**, que o dono do token ou o mestre liga e
  desliga, com o **atalho do inventário**: tocha, lampião ou lanterna na mão
  liga a luz com a predefinição do item.
- **Visão no escuro automática pela ficha (abordagem A)**, com o mestre
  podendo mudar o valor no token.

## Abordagens consideradas

- **Luz:** A (no token) foi escolhida, porque serve a monstros e NPCs sem
  ficha e não depende do inventário; B (só pelo inventário) ficou como atalho
  dentro de A.
- **Visão no escuro:** A (pela ficha) foi escolhida porque torna a montagem
  rápida; B (só manual) faria o mestre ajustar cada token.

## Como funciona

### Visão no escuro pela ficha
- O alcance vem do compêndio: a raça da ficha (`origin.race`) tem
  `darkvision` em metros (18 para anão, elfo, gnomo, meio-elfo, meio-orc,
  tiefling); a sub-raça que tenha o próprio valor (ex.: drow, 36) vence.
  Metros → quadrados: `metros / 1,5` (18 m = 12 quadrados), arredondado para
  baixo.
- O servidor aplica esse valor ao `sightRadius` dos tokens ligados ao
  personagem (`characterId`) quando o token é posto no mapa e quando a raça da
  ficha muda. Uma ficha sem raça do compêndio, ou de outro sistema, não muda
  nada.
- O mestre pode mudar o valor no token (como hoje). Uma mudança manual vence:
  o token guarda que foi ajustado à mão, e a ficha não o sobrescreve mais.
  *(Decisão do construtor: sem isso, mudar a ficha apagaria o ajuste do
  mestre.)*
- Se a raça muda para uma sem visão no escuro (anão → humano), o token volta a
  0, a menos que tenha sido ajustado à mão. *(Decisão do construtor.)*
- Vale para todos os tokens ligados ao personagem, em qualquer mapa.

### Luz no token
- Campo novo no token: `light` — nada, ou `{ brightRadius, dimRadius, color,
  source: 'manual' | 'item', itemId? }` em quadrados, como as luzes fixas.
- No cálculo de luz (cliente e servidor, que já têm a mesma lógica), cada
  token com `light` é uma luz na posição do token, igual a uma luz fixa. As
  regras de parede e linha de visão das luzes fixas valem igual.
- Quem pode mudar: o mestre em qualquer token; um jogador só nos tokens que ele
  controla (os que o servidor já trata como dele para mover). A mudança vai por
  um evento próprio de "luz do token", não pela edição geral do token, que
  continua restrita para o jogador. *(Decisão do construtor.)* Pelo menu do
  token (clique direito / toque longo): "Luz" com nenhuma, as predefinições e
  "personalizar".
- O brilho fixo ao redor do próprio token, que hoje é só enfeite (desenhado em
  `drawLights.ts`, sem efeito na visão), sai: quem não tem luz não brilha.
- O servidor continua mandando a luz só como área iluminada: um token que o
  jogador não vê não é mandado a ele, mas a luz dele entra no cálculo da área
  iluminada que o jogador vê pela linha de visão.

### Atalho do inventário (P5d)
- Itens com luz, pelo slug do compêndio: `tocha` (4/8 quadrados), `lampada`
  (3/6), `lanterna-coberta` (6/12), `vela` (1/2); itens digitados à mão cujo
  nome começa com "Tocha", "Lampião"/"Lâmpada", "Lanterna" ou "Vela" (ou
  "Torch", "Lamp", "Lantern", "Candle") também contam. A lanterna furta-fogo
  (luz em cone) não entra: a mesa não tem luz em cone; o jogador usa a "Luz"
  manual. *(Decisões do construtor.)*
- Regra: sempre que as mãos do personagem mudam (equipar, guardar, trocar de
  mão), a luz de item dos tokens dele é recalculada: a maior luz entre os itens
  de luz nas mãos (pelo raio fraco), com o `itemId` dela; sem item de luz na
  mão, a luz de item apaga. Uma pilha de tochas conta como um item.
- Uma luz posta à mão (`source: 'manual'`) nunca é trocada nem apagada pelo
  inventário. *(Decisão do construtor.)*

### Mapa novo e o interruptor "Escuro"
- Um mapa novo nasce com iluminação ligada (paredes bloqueiam a visão) e névoa
  e memória do explorado ligadas, com "tudo iluminado" ligado (lugar claro).
  *(Decisão do construtor.)* Mapas existentes não mudam, e só a criação de
  mapa pelo app usa os padrões novos; mapas importados ou duplicados mantêm os
  valores que trazem. "Tudo iluminado" é o `globalIllumination` do mapa.
- No painel de luz do mestre, um interruptor visível "Escuro" desliga o "tudo
  iluminado" desse mapa: daí só luzes e visão no escuro revelam.

### Painéis nas cores do tema
- Os painéis de paredes, luz e névoa trocam as classes de cor soltas pelas do
  tema (as mesmas dos outros painéis do mestre, claro e escuro). As cores que
  são dado (a cor de uma luz, a cor de um tipo de parede no mapa) continuam.

### Revelação do lado do jogador
- Um teste de integração com o servidor de verdade e sockets de jogador (como
  os testes da P6), mais casos novos no arquivo de cenários de visão
  compartilhado entre front e servidor, garante: o jogador só recebe os tokens que os tokens dele
  enxergam; a porta fechada bloqueia; com "Escuro", o humano sem luz não vê
  além de uma sala escura e o anão vê 12 quadrados; com a tocha, o humano vê a
  área iluminada.
- Uma conferência no navegador (o mestre e um jogador) antes de entregar.

## Restrições

- `sightRadius` continua campo restrito: só o mestre muda à mão.
- A luz de um token nunca dá visão; só ilumina (a regra que separa luz e visão
  já existe e continua).
- i18n pt-BR e en; testes do front em inglês.
- Nada de texto dos livros no git.
- Os arquivos de visão compartilhados entre front e servidor continuam
  idênticos.

## O que fica para quem constrói
- O nome e o formato exatos do campo de luz do token e da migração.
- Onde a marca de "ajustado à mão" da visão fica no token.
- O desenho do submenu "Luz" e o mapeamento exato das classes de cor do tema.
