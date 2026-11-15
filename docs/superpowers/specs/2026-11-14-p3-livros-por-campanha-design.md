# P3 — Livros ativados por campanha (design curto)

Aprovado pelo dono em 2026-11-14 ("Pode seguir").

## Intenção

O mestre escolhe quais livros valem numa campanha. A biblioteca de criaturas e,
a partir do P4, a criação de personagem só oferecem o que vem desses livros.
Muda-se a qualquer momento. Parte do roadmap
(`2026-11-14-mesa-roadmap-design.md`, P3).

## Decidido

- **Guardado** numa tabela própria `CampaignBook (campaignId, bookId)`, chave
  composta, as duas com cascata ao apagar.
- **Campanha nova:** os livros do sistema dela, menos o `srd`. Uma campanha
  sem sistema não tem livros.
- **Campanhas existentes:** a migração marca todos os livros do sistema delas,
  `srd` incluído, para nada sumir.
- **Onde se marca:** caixas "Livros desta campanha" na janela de criar campanha
  e nas configurações da campanha; só os livros do sistema da campanha.
- **Biblioteca de criaturas:** criaturas globais de um livro inativo saem da
  lista; criaturas que não vêm de livro (feitas pelo mestre, de campanha ou
  globais) continuam. A busca por `source` de um livro inativo devolve nada.
- **Compêndio:** `GET /api/compendium/entries` aceita `campaignId`; com ele,
  só entradas dos livros ativos dessa campanha (quem pede precisa ser membro).
- **Desligar não apaga nada:** tokens no mapa e fichas prontas ficam como
  estão; só as listas de escolha mudam.
- **Quem muda:** só o mestre (e o dono). Os membros leem a lista.
- **Trocar o sistema da campanha** troca os livros para o padrão do sistema
  novo.

## Abordagens

1. **Tabela `CampaignBook`** (escolhida): integridade pelas chaves estrangeiras,
   filtro direto no Prisma.
2. Coluna `String[]` em `Campaign`: mais simples, mas sem integridade e um id
   de livro apagado ficaria para trás.
3. Desligar livros só no frontend: não protege a API, e o P4 precisaria
   repetir o filtro.

## Fica para quem constrói

Nomes das rotas e dos componentes; texto da interface em pt-BR e en; testes
e2e no padrão do projeto.

**Pronto quando** desativar um livro tira as criaturas dele da biblioteca e as
entradas dele da busca do compêndio feita com a campanha (a criação de
personagem do P4 lê por aí).
