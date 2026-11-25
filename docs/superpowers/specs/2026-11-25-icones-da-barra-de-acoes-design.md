# Ícones na barra de ações (design curto)

Pedido do dono depois da P5 e da coluna de iniciativa: na barra de ações só os
itens e as armas têm ícone; magias, ações comuns, testes e características
aparecem só como texto.

## Intenção
Achar a magia ou a ação certa batendo o olho, como no BG3, sem ler cada botão.

## Abordagens
- **A. Ícone pelo efeito (escolhida pelo dono).** Ícone embutido do
  game-icons.net (o mesmo pacote dos itens, `react-icons/gi`), escolhido pelo
  que a magia faz: cura, tipo de dano, senão a escola.
- **B. Símbolo da escola.** Os 8 símbolos das cartas de escola dos materiais,
  recortados para a pasta local. Diferencia pouco (a maioria é Evocação) e não
  pode ir para o git.
- **C. Um ícone por magia vindo da mesa.** Não há esses ícones nos materiais
  (as cartas de magia são só texto).

## Como funciona
- **Magias**, na ordem:
  1. magia de cura → coração;
  2. com dano → ícone do primeiro tipo de dano (fogo: chama; frio: floco;
     elétrico: raio; trovejante: onda; ácido: gota; veneno: frasco;
     necrótico: caveira; radiante: sol; psíquico: cérebro; energia: estrela;
     concussão/cortante/perfurante: martelo/lâmina/flecha);
  3. sem dano → ícone da escola (8);
  4. sem nada disso (magia escrita à mão, fora do compêndio) → ícone genérico
     de magia.
- **Ações comuns:** um ícone fixo por ação (Disparada, Desengajar, Esquivar,
  Ajudar, Esconder e as demais da lista do servidor); as versões "(bônus)" usam
  o mesmo da ação.
- **Testes:** ícone pelo atributo (FOR, DES, CON, INT, SAB, CAR); perícias e
  salvaguardas usam o do seu atributo; iniciativa tem o seu.
- **Características de classe:** um ícone genérico (não há dado para escolher).
- O ícone fica à esquerda do nome no botão, do mesmo tamanho dos itens (24 px),
  na cor do texto do botão (tema claro e escuro).

## Dados
- O servidor já tem, no compêndio, a escola (`school`, em português) e os
  tipos de dano (`mechanics.damage[].type`, em português) de cada magia. A
  opção de magia que ele manda passa a levar, a mais, `damageType` (o primeiro)
  e `school`. Mudança aditiva; nada no banco.
- A escolha do ícone fica no front, numa função pura com testes, como
  `itemIcons.ts`.

## Não-metas
- Ícones na ficha (lista de magias da ficha); fica só na barra.
- Camada da mesa para magias (pasta local); os ícones de item continuam como
  estão.
- Ícones para outros sistemas.

## Restrições
- Só ícones livres (game-icons.net, CC BY 3.0, já creditado em
  `THIRD_PARTY_CREDITS.md`); nada dos livros no git.
- Nomes de ação e rótulos continuam como estão; o ícone é decorativo
  (`aria-hidden`), o nome do botão não muda.

## Fica para quem constrói
- O ícone exato de cada tipo, escola, ação e atributo.
- O ícone de magia sem compêndio e o das características.
