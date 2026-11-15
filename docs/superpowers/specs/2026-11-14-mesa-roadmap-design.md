# Roadmap da Mesa dos Amigos — design

Data: 2026-11-14 · Branch de trabalho: `mesa/quick-fixes`

## Intenção e porquê

Este fork do CozyVTT vira a mesa privada de um grupo de amigos, jogada pela
Tailscale. O dono do fork mestra; os amigos jogam. Eles acham o Roll20
"básico, genérico, sem vida" e gostam do Foundry VTT (o dono jogou nele como
jogador). O objetivo é uma mesa que pareça viva, no espírito do Foundry e do
Baldur's Gate 3, em português, com a ficha trabalhando pelo jogador.

O que o dono citou como "vida", nas palavras dele:

- iluminação dinâmica revelando o mapa conforme o token anda;
- escolher ações e o jogo calcular sozinho dano, dados e chance de acerto
  ("tipo Baldur's Gate mesmo"); testes feitos de maneira automática;
- gerenciamento mais claro de magias e truques, subir de nível, cada jogador
  organizar a própria ficha;
- como mestre: passar itens a um jogador com facilidade, avisá-lo, mandar um
  sussurro, rolar um teste por ele sem que ele saiba (percepção passiva e
  afins) e avisar em particular o que ele percebeu;
- inventário com ícones (o dono fornece os ícones: gerados por IA ou assets
  prontos);
- iniciativa mais clara, mostrando quanto cada um rolou;
- um d20 grande no centro da tela em algumas rolagens específicas, opcional;
- uma barra de camadas do mapa à esquerda;
- peles visuais por sistema (prioridade baixa).

Os livros do dono, em `materiais/` (192 PDFs, 642 imagens, quase tudo em
português), são a fonte de regras. O dono pediu explicitamente que sejam
usados.

## Marcos

| Marco | O que é | Estado |
|---|---|---|
| M0 | Base: diagnóstico de UX, ajustes rápidos, tradução pt-BR inicial, moldura nova da tela da sessão | Feito (commits até `2a2220da`) |
| **M1** | **Oneshot de D&D 5e**, "em algumas semanas" (sem data fixa) | Próximo |
| M2 | Campanha de Chamado de Cthulhu 7e, refinando o que a oneshot ensinou | Depois |
| M3 | Tormenta20, Cyberpunk RED, peles por sistema e o resto | Sem data |

A lore da oneshot ainda não existe e não é parte deste roadmap; o foco é o
sistema.

## Objetivos, não-objetivos e anti-objetivos

**Objetivos do M1**

- O grupo joga a oneshot de 5e nesta mesa, do começo ao fim, pela Tailscale.
- Cada jogador cria o próprio personagem de 3º nível no app, guiado, em
  português, só com opções dos livros que o mestre ativou na campanha.
- Em jogo, o jogador escolhe uma ação e a mesa resolve: ataque contra a CA do
  alvo, dano aplicado, espaço de magia gasto, teste rolado com os bônus certos.
- O mestre tem à mão: testes secretos pelos jogadores com aviso privado, e
  dar itens a um personagem.
- A iluminação dinâmica funciona do lado do jogador e é fácil de montar.

**Não-objetivos do M1** (podem vir depois)

- Subir de nível depois de criado (os personagens nascem no 3º nível).
- Peles por sistema, barra de camadas do mapa, d20 grande no centro.
- Tormenta20, Cyberpunk RED; CoC fica para o M2.
- O layout de celular/tablet (abaixo de 1024 px) continua como está.
- Lore, aventura e conteúdo narrativo.

**Anti-objetivos** (o que faria o M1 fracassar mesmo funcionando)

- Os jogadores precisarem digitar a ficha inteira à mão, como hoje.
- Números errados no compêndio (dano, CD, CA) que o grupo descubra em jogo e
  que quebrem a confiança na automação.
- Texto dos livros publicado no GitHub.
- Uma interface ainda em inglês onde o jogador mexe (login, criação, ficha,
  chat, dados).
- A sessão cair no meio por falta de memória, rede ou backup.

## Restrições

- **Uso privado, conteúdo protegido.** O texto extraído dos livros só existe
  no banco do servidor e em arquivos ignorados pelo git (como `materiais/`).
  Nada do compêndio entra no repositório; o código que importa sim.
- **Fork que acompanha o original no backend e diverge no frontend.** No
  backend, prefira o aditivo: tabelas, campos, rotas e eventos novos, com
  migrações Prisma. Mudar o comportamento de uma rota ou evento existente é
  permitido quando um projeto precisa (por exemplo, a regra de PV do P5),
  desde que a mudança seja pequena e o motivo fique escrito no commit, para
  facilitar os merges do original.
- **Português primeiro.** Todo texto novo nasce traduzido (`frontend/src/i18n`,
  pt-BR padrão, inglês como reserva; os testes rodam em inglês).
- **Ambiente de desenvolvimento:** Windows + Docker Desktop (8 GB, 12 núcleos).
  Vitest com `--maxWorkers=4`; o backend em dev precisa de reinício manual
  após mudanças; testes de backend rodam no banco `cozyvtt_test`.
- **Servidor:** o PC do dono, acessado pela Tailscale.

## Projetos do M1

Cada projeto terá seu próprio design detalhado na hora de construir. Aqui está o
escopo, o que ele depende e quando está pronto.

### P1 — No ar pela Tailscale

Stack de produção (`docker-compose.yml`) no PC do dono, acessível pelo nome da
máquina na tailnet; `CORS_ORIGIN`/`APP_URL` apontando para esse nome;
`ADMIN_MFA_REQUIRED=false`; backup automático do banco e de `uploads/`.
**Pronto quando** um amigo, de fora de casa, entra, cria conta pelo convite e
abre a campanha.

### P2 — Compêndio 5e

Dados estruturados de regras, cada entrada com o livro de origem. Primeiro o
Livro do Jogador (raças, classes e subclasses até o 3º nível com as
características completas, antecedentes, equipamento, magias de todos os
círculos com o texto, truques) e o Manual dos Monstros (blocos de
estatística). Os outros livros entram depois, um por vez.

- Extração: `pdftotext` do PDF, conversão para dados estruturados por mim,
  checagem automática (dados no formato certo, CD e bônus plausíveis, campos
  obrigatórios) e revisão por amostragem pelo dono.
- Fonte preferida para texto: a edição "Impressão Econômica - Sem Imagens" do
  Livro do Jogador; o Compêndio de Magia para magias (a Lista de Magias parece
  ser imagem).
- Os dados extraídos ficam num arquivo fora do git e são importados para o
  banco por um comando.
- Um editor simples no app para o mestre corrigir uma entrada.
- **Profundidade da mecânica:** truques e magias de 1º e 2º círculo (o que
  um personagem de 3º nível conjura) entram com a mecânica estruturada —
  tipo de ataque ou salvaguarda e atributo, dado e tipo de dano, metade no
  sucesso, alcance, área, concentração, escala ao conjurar em círculo maior
  ou ao subir de nível. Magias de 3º círculo em diante entram com o texto e
  os campos básicos (círculo, escola, tempo de conjuração, alcance,
  componentes, duração), sem mecânica executável por enquanto. Monstros do
  Manual dos Monstros entram com o bloco de estatística completo e os
  ataques estruturados (bônus, dano, tipo).
- **Onde ficam:** numa tabela própria de compêndio, separada de
  `CreatureTemplate` (que continua sendo a lista de criaturas do mestre).
  Um monstro do compêndio vira criatura/token pelo mesmo caminho de hoje.
  As criaturas SRD em inglês que já vêm com o app passam a contar como um
  livro, "SRD 5.1 (inglês)", desativado por padrão nas campanhas novas.
- **Como a conversão é feita:** a extração de texto (`pdftotext`, por
  página) é um script repetível. A estruturação é feita por mim (Claude)
  nesta conversa ou nas próximas, lendo o texto extraído — o dono pediu que
  os livros fossem usados, então o texto passar pelo modelo está coberto. O
  resultado é um conjunto de dados revisado, guardado fora do git; não é
  preciso refazer, só acrescentar livros novos (M2, M3) do mesmo jeito.
- **Nomes:** os da tradução que o grupo usa (a tradução em português dos livros,
  regras de 2014). A busca aceita também o nome em inglês.

**Pronto quando** o Livro do Jogador e o Manual dos Monstros estão no banco,
a checagem passa, e o dono revisou uma amostra de cada tipo de entrada.

### P3 — Livros ativados por campanha

Ao criar ou configurar a campanha, o mestre marca quais livros valem. A
criação de personagem e a biblioteca de criaturas só mostram o que vem
desses livros. Dá para mudar depois.
**Depende de** P2. **Pronto quando** desativar um livro tira as opções dele da
criação de personagem.

### P4 — Criação de personagem guiada

Passo a passo em português: raça, classe e subclasse, antecedente, atributos
(método a definir no design do P4), perícias, equipamento inicial, magias e
truques, nível inicial 3. O resultado é a ficha 5e existente, preenchida, com
ataques e magias ligados às entradas do compêndio (não só nomes).
**Depende de** P2 e P3. **Pronto quando** um jogador cria um personagem de 3º
nível de qualquer classe do Livro do Jogador sem digitar números à mão.

### P5 — Ficha em jogo, estilo BG3/Foundry

Barra de ações embaixo da tela da sessão, gerada da ficha: ataques, magias,
itens e habilidades. Clicar resolve: ataque contra a CA do token-alvo, chance
de acerto, dano rolado e aplicado nos PV do alvo, espaço de magia gasto,
concentração marcada. Testes de atributo, perícia e salvaguarda com um clique.
Economia de ações do turno (ação, ação bônus, reação, deslocamento). Inventário
com ícones (os ícones vêm da biblioteca de arquivos). Magias organizadas por
círculo, com truques à parte e espaços restantes visíveis.
**O que a barra automatiza no M1** (decidido pelo dono):

- *Automático:* ataques com arma e de magia contra a CA do alvo; crítico;
  vantagem e desvantagem; dano rolado e aplicado; magias de salvaguarda (o
  alvo rola contra a CD, metade do dano no sucesso quando a magia diz, vários
  alvos selecionados); conjurar em círculo maior; espaços de magia gastos;
  concentração marcada.
- *Botões que somam dados ou marcam um estado, sem regra própria:* Ataque
  Furtivo, Golpe Divino, Fúria e características parecidas.
- *À mão do mestre:* resistências, vulnerabilidades, condições e reações.
- *Magias de área, estilo BG3* (pedido do dono): ao escolher uma magia com
  área (Bola de Fogo, Mãos Flamejantes...), o molde certo (esfera, cone,
  linha, cubo, do tamanho do livro) segue o mouse; o alcance a partir do
  conjurador aparece e o app recusa um centro fora dele; os tokens dentro
  da área viram os alvos da salvaguarda. Parte do mapa já existe: a
  ferramenta manual de área (`map/aoeGeometry.ts`, `map/tools/useMeasureTools.ts`)
  desenha e encaixa os moldes na grade. Falta ligá-la à magia, medir o
  alcance e escolher os alvos. Os dados vêm do campo `area` da magia no
  compêndio, que hoje só está preenchido nas magias de círculo 0 a 2; as
  de círculo maior (a Bola de Fogo é de 3º) precisam de área e alcance
  estruturados antes do P5.

**Dano e o que o jogador vê** (decidido pelo dono): o dano de um acerto entra
direto nos PV do alvo e o mestre pode desfazer. O jogador vê só o estado do
monstro ("ileso / ferido / muito ferido"), nunca os PV nem a CA, e não vê a
chance de acerto (ela revelaria a CA); o mestre vê tudo. Isso pede uma regra
nova no servidor: um ataque resolvido pelo app pode alterar os PV de um token
do mestre, coisa que hoje só o mestre faz.

**Pronto quando** um turno de combate inteiro de um personagem de cada classe
do Livro do Jogador é jogado só pela barra, com os números conferidos contra o
livro.

### P6 — Ferramentas do mestre

- Teste secreto pelos jogadores: escolher um ou mais personagens e uma
  perícia/atributo; o app rola com o bônus da ficha de cada um, só o mestre vê;
  a percepção passiva de todos à vista do mestre.
- Aviso privado: a partir do resultado, um clique manda ao jogador um texto
  ("você percebe…"). Sussurros e rolagens secretas já existem no chat
  (`utils/chatWhisper.ts`, `utils/secretRolls.ts`); o novo é rolar *pelo*
  jogador e o atalho para avisar.
- Dar item: escolher uma entrada do compêndio (ou um item livre) e um
  personagem; o item vai para o inventário dele e ele é notificado.

**Depende de** P2 (para itens do compêndio); o teste secreto não depende de
nada novo. Pesa ainda mais no M2 (CoC), então o design já considera testes de
porcentagem.

### P7 — Iluminação dinâmica pronta para jogar

Paredes, luzes, visão dos tokens e névoa já existem. O trabalho é: conferir
que a revelação funciona do lado do jogador; tornar fácil montar (desenhar
paredes, pôr luz, dar visão aos tokens dos jogadores); trazer os painéis de
névoa, paredes e luz para as cores do tema.
**Pronto quando** o dono monta um mapa da oneshot com paredes e luz em pouco
tempo e um jogador vê o mapa se revelar ao andar.

### P8 — Tradução contínua

Cada tela tocada por P3 a P7 sai traduzida. Antes da oneshot, também: o chat,
os dados, a iniciativa, a coluna do grupo e as mensagens do mapa que o
jogador vê.

### Extras se sobrar tempo

Faixa de iniciativa sobre o mapa mostrando o valor rolado de cada um (pequena,
reaproveita `InitiativeTracker` e o estado de combate).

## Ordem e dependências

```
P1 (deploy) ─────────────────────────────────────────────┐
P2 (compêndio) ─┬─ P3 (livros) ─ P4 (criação) ─ P5 (ficha em jogo)
                └──────────────────────────── P6 (itens do mestre)
P6 (teste secreto) — independente
P7 (iluminação) — independente
P8 — acompanha cada um
```

Proposta de sequência: P1 cedo (para o grupo já testar), P2 em seguida porque
destrava quase tudo, P6 (teste secreto) e P7 em paralelo quando houver espera
pela revisão do compêndio, depois P3 → P4 → P5. P5 é o maior e o mais visível.

O dono avalia que o prazo comporta tudo isso ("vai dar tempo"), então não há
plano de corte. Se o tempo apertar mesmo assim, o que encolhe é a
profundidade da automação do P5, nunca a criação guiada do P4.

## Compêndio: abordagens consideradas

- **A. SRD 5.1 em inglês como esqueleto + livros por cima.** Números do núcleo
  confiáveis e rápidos, mas exige casar cada entrada em inglês com o nome
  oficial em português, e o SRD cobre bem menos que o Livro do Jogador (uma
  subclasse por classe, um antecedente), então a extração dos PDFs seria
  necessária de qualquer jeito.
- **B. Tudo extraído dos livros em português** — **escolhida.** Uma fonte só,
  tudo em português, cada entrada já com o livro de origem (o que os livros
  ativados pedem). Custo: mais trabalho por livro e risco de erro, mitigado
  pela checagem automática e pela revisão por amostragem.
- **C. O mestre cadastra pelo app.** Lento demais como fonte principal para o
  prazo; entra só como editor de correções.

O dono escolheu B com o editor de correções de C.

## Decisões

**Do dono**

- M1 é uma oneshot de D&D 5e em algumas semanas; M2 é uma campanha de CoC.
- Os jogadores criam os próprios personagens.
- Livros ativados por campanha, no estilo do Roll20.
- Os livros em `materiais/` são a fonte de regras.
- Compêndio pelo caminho B, com editor de correções.
- Inventário com ícones fornecidos por ele.
- Automação do P5 como descrita no P5; dano entra direto, mestre desfaz;
  jogador vê só o estado do monstro, sem PV, CA ou chance de acerto.
- Sem plano de corte: o prazo comporta o M1.
- Peles por sistema com prioridade baixa; aparência neutra ou do sistema, com
  o mestre definindo o padrão e cada jogador podendo trocar para a neutra.
- Foco no sistema; lore depois.

**Minhas (o dono pode corrigir)**

- Nível inicial 3 (aceito pelo dono com "pode seguir").
- Fora do M1: subir de nível após criado, peles, barra de camadas, d20 grande.
- Primeiro o Livro do Jogador e o Manual dos Monstros; outros livros depois.
- Compêndio fora do git, importado por comando, numa tabela própria.
- Mecânica estruturada só até magias de 2º círculo; o resto com texto.
- Criaturas SRD em inglês viram o livro "SRD 5.1 (inglês)", desativado por
  padrão.
- A estruturação dos livros é feita por mim (Claude), e o texto passar pelo
  modelo está coberto pelo pedido do dono de usar os livros.
- Nomes da tradução em português que o grupo usa, com busca também em inglês.
- Backend: aditivo por preferência, mudanças de comportamento pequenas e
  documentadas quando necessárias.
- Ícones: atribuídos no editor do compêndio, com casamento pelo nome do
  arquivo como atalho; enquanto não houver ícone, um ícone genérico por
  categoria (arma, armadura, poção, item).

## Deixado para quem constrói

- O formato exato dos dados do compêndio e o desenho das tabelas.
- O método de atributos na criação (compra de pontos, rolagem, conjunto
  padrão) e se o mestre escolhe por campanha — a decidir no design do P4.
- Como a barra de ações aparece no layout de celular (o M1 é desktop).
- A ferramenta de backup do P1.
