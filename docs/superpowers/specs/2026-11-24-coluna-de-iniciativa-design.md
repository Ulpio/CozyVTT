# Coluna de iniciativa sobre o mapa (design curto)

Extra do roadmap (`2026-11-14-mesa-roadmap-design.md`, "Extras se sobrar
tempo"), depois da P8.

## Intenção
Durante o combate, todos (mestre e jogadores) veem a ordem de iniciativa e o
valor que cada um rolou sem sair do chat ou dos dados: hoje a ordem só existe
na aba "Iniciativa" do painel lateral, que divide espaço com eles.

## Abordagens
- **A. Faixa horizontal no alto do mapa** — compacta, mas rola com muitos
  combatentes.
- **B. Coluna vertical na borda do mapa (escolhida pelo dono)** — cabem nome,
  número e PV; no celular começa recolhida.
- **C. Estender a faixinha de turno da barra de ações** — só aparece para quem
  tem token no combate e espreme a barra.

## Como funciona
- Borda **esquerda** do mapa, por cima dele (a direita já tem o painel).
- Aparece sozinha quando o combate está ativo; some quando acaba.
- Topo: "Rodada N". Uma linha por combatente, na ordem: retrato, nome e o
  número rolado em destaque; quem está na vez com borda e seta; sem rolagem
  ainda, "–".
- Barra de PV só para o mestre e, para jogadores, só em personagens de
  jogadores (`type: 'player'`); nunca PV de monstro para jogador.
- Cada um vê só os combatentes que o servidor já lhe manda
  (`projectCombatState`): monstro escondido não aparece.
- Botão de recolher: recolhida mostra só retratos e números; a escolha fica
  lembrada no navegador (`localStorage`, com try/catch).
- Celular (layout compacto): começa recolhida; um toque abre os nomes.
- Tocar numa linha centraliza o mapa no token, se ele estiver no mapa atual.

## Não-metas
- Editar iniciativa pela coluna (continua na aba "Iniciativa").
- Mudanças no servidor ou no banco.

## Restrições
- Só front, a partir do estado de combate que já existe (`useCombatState`).
- i18n pt-BR e en; testes do front em inglês; cores do tema (claro e escuro).

## Fica para quem constrói
- Nome do componente, tamanhos, animação, ícones.
- Como centralizar o mapa (reaproveitar o que o mapa já usa para trazer um
  token à vista).
- O nome da chave no `localStorage`.
