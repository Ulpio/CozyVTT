# P4 — Criação de personagem guiada (design)

Parte do roadmap (`2026-11-14-mesa-roadmap-design.md`, P4). Depende do
compêndio (P2) e dos livros por campanha (P3), já na `main`.

## Intenção

Cada jogador cria o próprio personagem de 3º nível de D&D 5e no app, passo a
passo, em português, sem digitar números à mão. O resultado é a ficha 5e que
já existe, preenchida, com magias, ataques e itens ligados às entradas do
compêndio (não só nomes), para o P5 (barra de ações) poder usá-los.

**Pronto quando** um jogador cria um personagem de 3º nível de qualquer uma
das 12 classes do Livro do Jogador sem digitar números à mão, e a ficha sai
válida e coerente com as regras de 2014.

## Metas, não-metas, anti-metas

- **Metas:** guiar raça, sub-raça, classe, subclasse, antecedente, atributos,
  perícias, idiomas e ferramentas, equipamento inicial, truques e magias; mostrar
  um resumo vivo da ficha durante o caminho; respeitar os livros ativos da
  campanha; o mestre escolhe os métodos de atributo permitidos.
- **Não-metas:** subir de nível depois de criado; multiclasse; talentos fora do
  humano variante; criar raças/classes novas; outros sistemas além do 5e.
- **Anti-metas:** o assistente não pode produzir uma ficha que a ficha 5e de
  hoje recusa ou mostra errada; não pode travar o jogador num passo sem saída
  (sempre dá para voltar); não pode colocar texto dos livros no git (os dados
  continuam vindo do compêndio no banco).

## Abordagens

1. **Assistente no frontend, montando a ficha a partir do compêndio**
   (escolhida). Um componente de passos lê raças, classes etc. pela rota do
   compêndio já filtrada pela campanha, calcula tudo com funções puras (testáveis
   sem tela) e cria o personagem pela rota de hoje (`POST /characters`), que já
   valida a ficha com o Zod do 5e. O servidor só ganha o que precisa guardar
   (método de atributos da campanha, referências ao compêndio na ficha).
2. Servidor monta a ficha a partir das escolhas (`POST /characters/guided`).
   Mais protegido contra fichas montadas à mão, mas duplica no backend a lógica
   que o frontend precisa de qualquer jeito para o resumo vivo. Os jogadores são
   amigos e a ficha já é editável à mão, então a proteção extra não paga o custo.
3. Modelos prontos por classe (como o "Guerreiro de exemplo" de hoje). Rápido,
   mas não guia escolhas e não cobre subclasses e antecedentes.

## Decidido

### Do dono
- Método de atributos: **o mestre escolhe por campanha** quais valem, entre
  compra de pontos (27), conjunto padrão (15, 14, 13, 12, 10, 8) e rolagem
  (4d6, descarta o menor). Campanha nova começa com **compra de pontos e
  conjunto padrão**.
- Nível inicial 3; regras de 2014; nomes da tradução em português do grupo.
- **Rolagem de atributos não se refaz**, em nenhum modo: o resultado fica
  guardado no servidor no momento da rolagem (um rascunho por jogador e
  campanha), e fechar ou recarregar o assistente traz a mesma rolagem de volta.
- **Personagem criado não faz respec**, em nenhum modo. Depois de criado, a ficha
  é a ficha 5e de sempre (o mestre e o dono continuam podendo editá-la à mão).
- **Nível de detalhe da campanha** (pedido do dono): o mestre escolhe entre
  **Fiel** (controla tudo que as regras controlam: peso e carga, rações, munição,
  componentes com custo) e **Flexível** (estilo BG3: esses controles somem para
  não tirar o dinamismo do jogo). Não mexe nas regras de criação — as duas
  fazem o mesmo personagem. No P4 ele só decide o que o passo de equipamento e
  o inventário mostram (peso, rações, munição contadas ou não). O grosso dele é
  no inventário e na barra de ações (P5), que leem a mesma configuração.

### Escolhas minhas (o dono pode corrigir)
- **Onde aparece:** no "Novo personagem", quando o sistema é 5e, uma terceira
  opção "Criação guiada" ao lado de "Ficha em branco" e "Guerreiro de exemplo".
  Abre o assistente em tela cheia (modal grande), passos na esquerda, conteúdo no
  meio, resumo da ficha na direita (no celular, o resumo vira um botão).
- **Fora de campanha:** sem campanha, o assistente usa todos os livros do
  sistema e todos os métodos de atributo.
- **Passos, nesta ordem:** 1) Raça e sub-raça; 2) Classe; 3) Subclasse (todas as
  classes têm a subclasse até o 3º nível); 4) Antecedente; 5) Atributos;
  6) Perícias, idiomas e ferramentas; 7) Escolhas da classe; 8) Equipamento;
  9) Magias (só para quem conjura); 10) Detalhes (nome, tendência, aparência,
  personalidade — os traços do antecedente podem ser sorteados ou escritos);
  11) Revisão e criar. Dá para voltar a qualquer passo; mudar algo anterior
  limpa só as escolhas que deixaram de valer, e avisa.
- **Atributos:** compra de pontos com os custos do Livro do Jogador (8–15, 27
  pontos); conjunto padrão distribuído; rolagem com os dados do app (aparece no
  chat da campanha, para todos verem que foi honesto), uma vez por personagem,
  sem rolar de novo dentro do assistente. Os bônus raciais entram depois e
  aparecem separados.
- **Escolhas raciais que os dados não trazem estruturadas:** meio-elfo (+1 em
  dois atributos, duas perícias), humano variante (+1 em dois, uma perícia, um
  talento do compêndio), draconato (ancestral dracônico → tipo de dano e sopro),
  alto elfo (truque de mago), idiomas "à sua escolha". O assistente oferece essas
  escolhas; a tabela delas fica num arquivo de regras no código, por `slug`.
- **PV:** máximo no 1º nível e a média arredondada para cima nos níveis 2 e 3,
  mais CON em cada nível (anão da colina +1 por nível). Sem rolar PV.
- **Perícias:** antecedente primeiro (fixas); depois as da classe, escolhidas da
  lista dela; uma perícia repetida libera outra escolha, como diz a regra.
- **Escolhas da classe e da subclasse até o 3º nível** (arquivo de regras no
  código, por classe, subclasse e talento): Estilo de Luta, Especialização,
  Inimigo Favorito, Explorador Natural, Invocações Místicas, Dádiva do Pacto,
  Metamagia, e as escolhas dentro de subclasses (perícias do Colégio do
  Conhecimento, especialização do Domínio do Conhecimento, terreno do Círculo da
  Terra, manobras do Mestre de Batalha, animal totem, disciplinas dos Quatro
  Elementos, Presa do Caçador, companheiro do Mestre das Feras etc.).
- **Regra para efeitos:** todo efeito que muda um número da ficha é calculado
  (PV, CA, proficiências que liberam armaduras, perícias, iniciativa, ataques,
  dano, magias). Exemplos: Linhagem Dracônica (+1 PV por nível, CA 13 + DES),
  Domínios da Vida/Tempestade (armadura pesada), Versátil (Pau para Toda Obra),
  Rajada Agonizante, Pacto da Lâmina, ataque desarmado do monge, talentos do
  humano variante (Robusto, Alerta, Observador, Móvel, Resiliente, Habilidoso,
  Iniciado em Magia…). Efeitos sem número (só narrativos ou de situação) entram
  como características com o texto do livro. Isso vale só para opções do Livro
  do Jogador até o 3º nível.
- **Equipamento inicial:** as opções "(a)… ou (b)…" de cada classe e o pacote de
  cada antecedente viram dados estruturados apontando para entradas do compêndio
  (armas, armaduras, pacotes, itens). Esse mapeamento é feito uma vez, guardado
  no `data` das entradas de classe/antecedente (`startingEquipmentChoices`) pelo
  importador do compêndio, a partir de um arquivo de correspondência em
  `materiais/` (fora do git), como o resto do compêndio. Sem a opção de trocar
  por ouro.
- **Ataques:** cada arma do equipamento gera um ataque na ficha com bônus e dano
  calculados (FOR ou DES conforme a arma, acuidade escolhe a melhor), mais o
  Estilo de Luta quando se aplica. Truques de ataque geram ataque também.
- **CA:** calculada da armadura e escudo escolhidos; sem armadura, 10 + DES, ou
  defesa sem armadura do bárbaro/monge.
- **Magias:** truques pelo `cantripsKnown` da classe; magias conhecidas pelo
  `spellsKnown` (bardo, bruxo, feiticeiro, patrulheiro); preparadas para
  clérigo, druida, paladino e mago (mago: 10 no grimório no 3º nível — 6 no 1º
  mais 2 por nível —, prepara mod INT + nível). Cavaleiro Místico e Trapaceiro
  Arcano conjuram desde o 3º nível, com escolas restritas e tabela de terço de
  conjurador; essas tabelas (só números) ficam no arquivo de regras no código.
  Só magias da lista da classe, dos livros ativos, de círculos que o personagem
  já pode conjurar. Magias de subclasse sempre preparadas (domínio, juramento,
  terra) entram automáticas: vêm do `mechanics.spellsBySpellLevel` das
  características de subclasse no compêndio, e onde faltar, o arquivo de
  correspondência em `materiais/` completa pelo importador. Espaços de magia
  preenchidos pela tabela da classe (bruxo usa a tabela de pacto).
- **Traços de personalidade:** as tabelas d8/d6 de cada antecedente entram no
  `data` do antecedente pelo importador (curadas de `materiais/`, fora do git).
  O assistente sorteia ou deixa escolher/escrever.
- **Rolagem de atributos fora de campanha:** rola no servidor, guardada como
  rascunho do jogador, sem chat. Dentro de campanha, também aparece no chat.
- **Nível de detalhe padrão:** campanha nova começa em **Flexível** (é uma mesa
  de amigos e o dono quer dinamismo); o mestre troca nas Configurações da
  campanha a qualquer momento, e trocar não apaga dados (o peso e as contagens
  continuam guardados na ficha, só deixam de aparecer e de ser cobrados).
- **Ligação com o compêndio:** a ficha ganha campos opcionais
  `compendiumRef: { bookId, slug }` em magia, ataque e item do inventário (e nos
  truques, que hoje são só texto, passam a aceitar o mesmo objeto), mais
  `origin: { race, subrace, class, subclass, background }` como refs. Opcionais,
  para toda ficha antiga continuar válida.
- **Configuração da campanha:** `Campaign.abilityScoreMethods` (lista) e
  `Campaign.detailLevel` (`FAITHFUL` | `FLEXIBLE`), editadas nas Configurações
  da campanha ao lado dos livros, só pelo mestre.

## Fica para quem constrói

Nomes de componentes e funções, layout fino, textos em pt-BR e en, a forma
exata do arquivo de correspondência de equipamento, testes no padrão do
projeto (funções de regra com testes unitários por classe; um teste de ponta a
ponta criando um personagem de cada classe e validando com o Zod do 5e).
