# P1 — No ar pela Tailscale: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mesa roda em produção no PC do dono e um amigo, de fora de casa, entra por `https://<máquina>.<tailnet>.ts.net` e abre a campanha.

**Architecture:** O stack de produção (`docker-compose.yml`, com nginx) roda numa pasta separada do repositório de desenvolvimento (um `git worktree` em `C:\Users\Usuario\MesaServer`, branch `mesa/servidor`), com nome de projeto e de contêineres próprios, para não dividir banco, uploads nem nomes com o stack de dev. O nginx escuta só em `127.0.0.1:8088`; o `tailscale serve` publica esse endereço na tailnet com HTTPS e certificado válido. Um script de backup diário (Agendador de Tarefas do Windows + Git Bash) guarda o banco e os uploads fora do repositório.

**Tech Stack:** Docker Desktop (Windows), Docker Compose, nginx (já no stack), Tailscale (`tailscale serve`), Git Bash, `backend/scripts/backup.sh`, Agendador de Tarefas (`schtasks`).

**Spec:** `docs/superpowers/specs/2026-11-14-mesa-roadmap-design.md` (seção P1)

## Global Constraints

- `ADMIN_MFA_REQUIRED=false` no `.env` de produção.
- Nenhum segredo no git: `.env` de produção, senhas e tokens ficam só em `C:\Users\Usuario\MesaServer\.env` (ignorado pelo git).
- As portas do nginx de produção ficam presas ao próprio PC: `HTTP_PORT=127.0.0.1:8088`, `HTTPS_PORT=127.0.0.1:8443`. Nada é publicado em outra interface.
- Produção e desenvolvimento nunca dividem dados: projeto Compose `mesa`, contêineres `mesa-*`, volume `mesa_postgres_data`, uploads em `C:\Users\Usuario\MesaServer\backend\uploads`.
- Texto para pessoas (README de operação e guia dos amigos) em português.
- Backups fora do repositório, em `C:\Users\Usuario\MesaBackups`, mantidos por 30 dias.
- Ações que só o dono pode fazer (entrar na Tailscale, ligar MagicDNS e HTTPS no painel da Tailscale, compartilhar a máquina com os amigos, criar a própria conta de admin com a própria senha) aparecem nos passos como **[dono]**; quem executa o plano para e pede.

## Review Focus

1. **O PC reinicia ou o Docker Desktop fecha antes da sessão.** Esperado: o stack volta sozinho quando o dono entra no Windows. Teste na Task 2, passo 7.
2. **Um amigo nos dados móveis, fora de casa.** Esperado: o certificado é válido e a conexão ao vivo (socket.io) funciona pelo `tailscale serve`; o cabeçalho da campanha mostra "Connected". Teste na Task 5, passo 4.
3. **Todos os visitantes contados como um só endereço.** Sem `NGINX_TRUSTED_PROXIES` certo, cinco senhas erradas de qualquer um bloqueiam todo mundo. Esperado: o log do nginx mostra o endereço `100.x` de cada visitante. Teste na Task 3, passo 7.
4. **O PC está desligado na hora do backup.** Esperado: o backup roda assim que o PC volta (`StartWhenAvailable`). Teste na Task 4, passo 6.
5. **Um mapa grande enviado de fora.** Esperado: um envio de 20 MB passa pelo `tailscale serve` e pelo nginx. Teste na Task 3, passo 8.

---

### Task 1: Modelos de configuração de produção no repositório

**Files:**
- Create: `deploy/mesa/docker-compose.override.yml`
- Create: `deploy/mesa/env.mesa.example`
- Create: `deploy/mesa/update.sh`
- Create: `deploy/mesa/README.md`

**Interfaces:**
- Produces: `deploy/mesa/docker-compose.override.yml`, que renomeia os contêineres para `mesa-database`, `mesa-backend`, `mesa-frontend`, `mesa-nginx`; `deploy/mesa/env.mesa.example`, com todas as chaves que as Tasks 2 e 3 preenchem; `deploy/mesa/update.sh`, que atualiza o servidor a partir de `mesa/quick-fixes`.

- [ ] **Step 1: Escrever `deploy/mesa/docker-compose.override.yml`**

Só `services.<nome>.container_name` para os quatro serviços (`database`, `backend`, `frontend`, `nginx`), com os nomes acima. Nada mais: o resto vem do `docker-compose.yml`.

- [ ] **Step 2: Escrever `deploy/mesa/env.mesa.example`**

Partir do `.env.example` da raiz e fixar estes valores (os demais como no exemplo):

```
COMPOSE_PROJECT_NAME=mesa
NODE_ENV=production
DATABASE_PASSWORD=TROQUE_POR_32_HEX
SESSION_SECRET=TROQUE_POR_64_HEX
HTTP_PORT=127.0.0.1:8088
HTTPS_PORT=127.0.0.1:8443
CORS_ORIGIN=https://NOME-DA-MAQUINA.NOME-DA-TAILNET.ts.net
ADMIN_MFA_REQUIRED=false
NGINX_TRUSTED_PROXIES=172.16.0.0/12
RATE_LIMIT_MAX_REQUESTS=1500
```

Um comentário em português acima de `RATE_LIMIT_MAX_REQUESTS` explica: cada imagem de mapa conta como requisição, e numa mesa de cinco pessoas 300 por minuto por pessoa é pouco no carregamento de um mapa grande.

- [ ] **Step 3: Escrever `deploy/mesa/update.sh`**

Bash, `set -euo pipefail`, roda dentro de `C:\Users\Usuario\MesaServer`. Começa pondo `/c/Program Files/Docker/Docker/resources/bin` no `PATH` (o Git Bash não acha o `docker` sem isso). Depois: `git merge --ff-only mesa/quick-fixes`, depois `docker compose up -d --build`, depois espera até 120 s por `curl -fsS http://127.0.0.1:8088/api/auth/appearance` responder 200 e sai com erro se não responder.

- [ ] **Step 4: Escrever `deploy/mesa/README.md`** (português)

Seções: o que é cada arquivo; primeira instalação (resumo das Tasks 2 a 4); atualizar o servidor (`bash deploy/mesa/update.sh`); restaurar um backup (`./backend/scripts/restore.sh <arquivo.sql.gz>` e `tar -xzf` dos uploads em `backend/uploads`, com o stack parado, depois `docker compose up -d`); o que fazer se o site não abrir (Docker Desktop aberto? `docker compose ps`; `tailscale serve status`).

- [ ] **Step 5: Verificar que o Compose aceita o override**

Run (na raiz do repositório): `COMPOSE_PROJECT_NAME=mesa docker compose --env-file deploy/mesa/env.mesa.example -f docker-compose.yml -f deploy/mesa/docker-compose.override.yml config | grep container_name`
Expected: quatro linhas, `mesa-database`, `mesa-backend`, `mesa-frontend`, `mesa-nginx`.

- [ ] **Step 6: Commit**

```bash
git add deploy/mesa
git commit -m "Add production config templates for the friends' server"
```

### Task 2: Pasta de produção e primeira subida

**Files:**
- Create (fora do git): `C:\Users\Usuario\MesaServer\` (worktree), `C:\Users\Usuario\MesaServer\.env`, `C:\Users\Usuario\MesaServer\docker-compose.override.yml` (cópia do modelo)

**Interfaces:**
- Consumes: os arquivos da Task 1.
- Produces: o stack `mesa` no ar em `http://127.0.0.1:8088`, com o admin do dono criado.

- [ ] **Step 1: Criar a branch e o worktree**

```bash
git branch mesa/servidor mesa/quick-fixes
git worktree add /c/Users/Usuario/MesaServer mesa/servidor
```

- [ ] **Step 2: Copiar o override e gerar o `.env`**

Copiar `deploy/mesa/docker-compose.override.yml` para a raiz do worktree e `deploy/mesa/env.mesa.example` para `.env`. Trocar `DATABASE_PASSWORD` por 32 caracteres hex aleatórios e `SESSION_SECRET` por 64, gerados com `tr -dc 'a-f0-9' </dev/urandom | head -c N`. `CORS_ORIGIN` fica com o marcador até a Task 3.

- [ ] **Step 3: Subir**

Run: `cd /c/Users/Usuario/MesaServer && docker compose up -d --build`
Expected: os quatro contêineres `mesa-*` em `docker compose ps`, `mesa-database` como `healthy`. O stack de dev (`cozyvtt-*`) continua rodando ao lado.

- [ ] **Step 4: Conferir que responde**

Run: `curl -fsS http://127.0.0.1:8088/api/auth/appearance`
Expected: JSON com `instanceName`.

- [ ] **Step 5: [dono] Criar o admin**

Pegar o token de setup com `docker compose logs backend | grep "setup token"` e passar ao dono. O dono abre `http://127.0.0.1:8088/setup` e cria a própria conta de admin, com a própria senha, e o nome da instância "Mesa dos Amigos". Quem executa o plano não digita essa senha.

- [ ] **Step 6: Confirmar que produção e dev não se misturam**

Run: `docker volume ls | grep postgres_data`
Expected: `mesa_postgres_data` e `cozyvtt_postgres_data`, dois volumes distintos.

- [ ] **Step 7: [dono] Testar o reinício**

O dono confirma que o Docker Desktop abre ao entrar no Windows (Settings → General → "Start Docker Desktop when you sign in"). Fechar o Docker Desktop, abrir de novo e rodar o `curl` do passo 4.
Expected: responde em até 2 minutos, sem `docker compose up`.

### Task 3: HTTPS pela Tailscale

**Files:**
- Modify (fora do git): `C:\Users\Usuario\MesaServer\.env` (`CORS_ORIGIN`, e `NGINX_TRUSTED_PROXIES` se o passo 6 pedir)
- Modify: `deploy/mesa/README.md` (o endereço e o comando de `tailscale serve`)

**Interfaces:**
- Consumes: o stack da Task 2 em `127.0.0.1:8088`.
- Produces: `https://<máquina>.<tailnet>.ts.net` servindo a mesa.

- [ ] **Step 1: [dono] Entrar na Tailscale e ligar HTTPS**

O dono entra na Tailscale no PC e, no painel da Tailscale (DNS), liga MagicDNS e HTTPS Certificates.

- [ ] **Step 2: Ler o nome da máquina**

Run: `"/c/Program Files/Tailscale/tailscale.exe" status --json | grep '"DNSName"' | head -1`
Expected: algo como `"DNSName": "pc-do-dono.tail1234.ts.net."`. Esse nome, sem o ponto final, é `<nome>` daqui em diante.

- [ ] **Step 3: Publicar com `tailscale serve`**

Run: `"/c/Program Files/Tailscale/tailscale.exe" serve --bg http://127.0.0.1:8088`
Expected: `tailscale serve status` mostra `https://<nome>` → `http://127.0.0.1:8088`. O `--bg` mantém a publicação depois de reinícios.

- [ ] **Step 4: Apontar a mesa para o endereço**

No `.env`: `CORS_ORIGIN=https://<nome>`. Run: `docker compose up -d`.

- [ ] **Step 5: Conferir pelo HTTPS**

Run: `curl -fsS https://<nome>/api/auth/appearance`
Expected: o mesmo JSON da Task 2, sem erro de certificado.

- [ ] **Step 6: Descobrir de onde o `tailscale serve` chega ao nginx**

Abrir `https://<nome>` no navegador, depois rodar `docker compose logs --tail 5 nginx`. O `.env` já confia em `172.16.0.0/12`. Se as linhas começam com um endereço `100.x.y.z`, esse intervalo cobre o `tailscale serve` e não há nada a mudar. Se começam com outro endereço (no Docker Desktop costuma ser algo como `192.168.65.1`), é esse o endereço de onde o `tailscale serve` chega: seguir "The range for a proxy on the same server" em `docs/DEPLOYMENT.md` para achar o intervalo dele, pô-lo em `NGINX_TRUSTED_PROXIES` (separado do anterior por espaço) e rodar `docker compose up -d`. Se mesmo confiando no endereço certo o log continuar sem o `100.x`, o `tailscale serve` não está mandando `X-Forwarded-For`: parar e relatar, sem afrouxar outra regra.

- [ ] **Step 7: Conferir que cada visitante é contado pelo próprio endereço**

Entrar na mesa pelo HTTPS (o dono), depois rodar `docker compose logs --tail 5 nginx`.
Expected: as linhas novas começam com um endereço `100.x.y.z` (o do aparelho na tailnet), não com o endereço do passo 6.

- [ ] **Step 8: Enviar um mapa de 20 MB pelo HTTPS**

Com o admin, criar um mapa a partir de uma imagem de cerca de 20 MB tirada de `materiais/D&D 5E/Mapas`.
Expected: o mapa aparece; nenhum erro 413 ou 504.

- [ ] **Step 9: Commit**

```bash
git add deploy/mesa/README.md
git commit -m "Document the Tailscale address and serve command for the server"
```

### Task 4: Backup diário

**Files:**
- Create: `deploy/mesa/backup.sh`
- Create: `deploy/mesa/install-backup-task.ps1`
- Modify: `deploy/mesa/README.md` (onde ficam os backups, como restaurar)

**Interfaces:**
- Consumes: o stack `mesa` da Task 2; `backend/scripts/backup.sh` (respeita `BACKUP_DIR` e `BACKUP_RETAIN_DAYS`).
- Produces: `C:\Users\Usuario\MesaBackups\db\cozyvtt_<data>.sql.gz` e `C:\Users\Usuario\MesaBackups\uploads\uploads_<data>.tar.gz`, um de cada por dia, e a tarefa agendada "Mesa - Backup".

- [ ] **Step 1: Escrever `deploy/mesa/backup.sh`**

Bash, `set -euo pipefail`, roda de `C:\Users\Usuario\MesaServer` com `MESA_BACKUP_DIR` (padrão `/c/Users/Usuario/MesaBackups`) e `BACKUP_RETAIN_DAYS` (padrão 30). Começa pondo `/c/Program Files/Docker/Docker/resources/bin` no `PATH`, como o `update.sh`; sem isso, rodando pela tarefa agendada, o `backup.sh` do backend não acha o `docker` e tenta usar `DATABASE_URL`.
1. `BACKUP_DIR="$MESA_BACKUP_DIR/db" ./backend/scripts/backup.sh` (o banco, de dentro do contêiner);
2. `tar -czf "$MESA_BACKUP_DIR/uploads/uploads_$(date +%Y%m%d_%H%M%S).tar.gz" -C backend uploads`;
3. apagar de `$MESA_BACKUP_DIR/uploads` os `uploads_*.tar.gz` com mais de `BACKUP_RETAIN_DAYS` dias (`find -mtime +N -delete`);
4. escrever uma linha com data e resultado em `$MESA_BACKUP_DIR/backup.log`.

- [ ] **Step 2: Rodar uma vez e conferir os arquivos**

Run: `cd /c/Users/Usuario/MesaServer && bash deploy/mesa/backup.sh && gzip -t /c/Users/Usuario/MesaBackups/db/cozyvtt_*.sql.gz && tar -tzf /c/Users/Usuario/MesaBackups/uploads/uploads_*.tar.gz | head -3`
Expected: sem erro; o `tar -tzf` lista caminhos começando com `uploads/` (o mapa da Task 3, passo 8).

- [ ] **Step 3: Conferir a limpeza dos antigos**

Run: `touch -d "40 days ago" /c/Users/Usuario/MesaBackups/uploads/uploads_20000101_000000.tar.gz && bash deploy/mesa/backup.sh && ls /c/Users/Usuario/MesaBackups/uploads`
Expected: `uploads_20000101_000000.tar.gz` sumiu; os de hoje continuam.

- [ ] **Step 4: Escrever `deploy/mesa/install-backup-task.ps1`**

PowerShell que registra (ou substitui) a tarefa "Mesa - Backup" com `Register-ScheduledTask`: gatilho diário às 04:00; ação `"C:\Program Files\Git\bin\bash.exe" -lc "cd /c/Users/Usuario/MesaServer && bash deploy/mesa/backup.sh"`; `New-ScheduledTaskSettingsSet -StartWhenAvailable`; roda como o usuário atual, só quando ele está conectado (o Docker Desktop precisa estar aberto).

- [ ] **Step 5: Registrar a tarefa**

Run (PowerShell): `powershell -ExecutionPolicy Bypass -File deploy\mesa\install-backup-task.ps1; Get-ScheduledTask -TaskName "Mesa - Backup" | Select-Object -ExpandProperty Settings | Select-Object StartWhenAvailable`
Expected: `StartWhenAvailable : True`.

- [ ] **Step 6: Rodar pela tarefa**

Run: `Start-ScheduledTask -TaskName "Mesa - Backup"`, esperar 1 minuto, ler a última linha de `C:\Users\Usuario\MesaBackups\backup.log`.
Expected: uma linha de agora dizendo que deu certo.

- [ ] **Step 7: Commit**

```bash
git add deploy/mesa/backup.sh deploy/mesa/install-backup-task.ps1 deploy/mesa/README.md
git commit -m "Back up the server's database and uploads every day"
```

### Task 5: Os amigos entram

**Files:**
- Create: `deploy/mesa/COMO-ENTRAR.md` (guia para os amigos, em português)

**Interfaces:**
- Consumes: `https://<nome>` da Task 3.
- Produces: o critério de pronto do P1, conferido.

- [ ] **Step 1: Escrever `deploy/mesa/COMO-ENTRAR.md`**

Curto, para quem não é técnico: instalar a Tailscale no computador ou celular; aceitar o convite de compartilhamento que o mestre mandar; abrir `https://<nome>`; entrar com o e-mail e a senha temporária que o mestre passar e escolher a própria senha; o convite da campanha aparece no painel inicial. Sem SMTP no M1, as contas são criadas pelo mestre em Admin → Usuários → Criar usuário.

- [ ] **Step 2: [dono] Compartilhar a máquina com um amigo**

No painel da Tailscale, o dono compartilha a máquina com o primeiro amigo (Share), e cria a conta dele em Admin → Usuários.

- [ ] **Step 3: [dono] Convidar o amigo para uma campanha de teste**

O dono cria uma campanha de teste e convida o amigo pelo nome.

- [ ] **Step 4: Teste de aceitação com o amigo fora de casa**

O amigo, fora da rede de casa (por exemplo, nos dados móveis), abre `https://<nome>`, entra, troca a senha, aceita o convite e abre a campanha.
Expected: a campanha abre; o cabeçalho mostra "Connected"; uma mensagem no chat aparece na tela do dono; o log do nginx mostra o endereço `100.x` do amigo.

- [ ] **Step 5: Commit**

```bash
git add deploy/mesa/COMO-ENTRAR.md
git commit -m "Add the friends' guide to joining the table"
```
