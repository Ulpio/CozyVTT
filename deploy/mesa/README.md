# Servidor da Mesa dos Amigos

O servidor de produção roda no PC do mestre, numa pasta separada do
repositório de desenvolvimento: `C:\Users\Usuario\MesaServer`, um `git worktree`
na branch `mesa/servidor`. Ele tem contêineres, banco e uploads próprios, e
não mexe no stack de desenvolvimento.

## Os arquivos desta pasta

| Arquivo | Para que serve |
|---|---|
| `compose-override.yml` | Dá nomes `mesa-*` aos contêineres. Copie para a raiz do servidor com o nome `docker-compose.override.yml` (o git ignora esse nome, por isso o modelo tem outro). |
| `env.mesa.example` | Modelo do `.env` de produção. Copie para `.env` na raiz do servidor e troque os `TROQUE_POR_*`. |
| `update.sh` | Atualiza o servidor com o que está em `mesa/quick-fixes` e reconstrói. |

## Primeira instalação

1. Criar a pasta do servidor, a partir do repositório de desenvolvimento:
   ```bash
   git branch mesa/servidor mesa/quick-fixes
   git worktree add /c/Users/Usuario/MesaServer mesa/servidor
   ```
2. Na pasta do servidor, copiar `deploy/mesa/compose-override.yml` como `docker-compose.override.yml` na
   raiz e `deploy/mesa/env.mesa.example` para `.env`, trocando a senha do banco
   (32 caracteres hex) e o `SESSION_SECRET` (64).
3. `docker compose up -d --build`, depois abrir `http://127.0.0.1:8088/setup` e
   criar a conta de admin. O token de setup está em
   `docker compose logs backend | grep "setup token"`.
4. Publicar na Tailscale e ajustar o `CORS_ORIGIN` (seção abaixo).

## Atualizar o servidor

Depois de commitar em `mesa/quick-fixes` no repositório de desenvolvimento:

```bash
cd /c/Users/Usuario/MesaServer
bash deploy/mesa/update.sh
```

## Backups

Todo dia às 04:00 a tarefa agendada "Mesa - Backup" roda
`deploy/mesa/backup.sh`, que guarda o banco e os uploads em
`C:\Users\Usuario\MesaBackups` por 30 dias. Se o PC estiver desligado nessa
hora, roda quando ele voltar. O resultado de cada dia fica em
`MesaBackups\backup.log`. Para registrar a tarefa de novo:
`powershell -ExecutionPolicy Bypass -File deploy\mesa\install-backup-task.ps1`.

## Restaurar um backup

Os backups ficam em `C:\Users\Usuario\MesaBackups`: o banco em `db\` e os
uploads em `uploads\`. Para voltar a um dia, na pasta do servidor:

```bash
# O banco (pede confirmação e substitui o banco atual)
./backend/scripts/restore.sh /c/Users/Usuario/MesaBackups/db/cozyvtt_AAAAMMDD_HHMMSS.sql.gz
# Os uploads, com o stack parado
docker compose stop
rm -rf backend/uploads && tar -xzf /c/Users/Usuario/MesaBackups/uploads/uploads_AAAAMMDD_HHMMSS.tar.gz -C backend
docker compose up -d
```

Use o banco e os uploads do mesmo dia.

## Se o site não abrir

- O Docker Desktop está aberto? Ele precisa abrir junto com o Windows
  (Settings → General → "Start Docker Desktop when you sign in").
- `docker compose ps` na pasta do servidor: os quatro `mesa-*` estão `Up`?
- `curl http://127.0.0.1:8088/api/setup/status` responde? Se sim, o problema
  é a Tailscale: `tailscale serve status` deve mostrar o endereço publicado.
