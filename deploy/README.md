# Produção na Debian (servidor em casa)

Guia para colocar a API numa máquina Debian da rede de casa, com o MongoDB na mesma máquina e a internet
chegando pelo Cloudflare Tunnel (sem abrir portas no roteador). Copie e cole os comandos na ordem.

No fim você terá:

| Serviço | O que faz |
| --- | --- |
| `mongod` | MongoDB, só acessível pela própria Debian, com usuário e senha |
| `checkins-api` | A API (Node), sobe com a máquina e volta sozinha se cair |
| `cloudflared-quick` ou `cloudflared` | Túnel do Cloudflare: o endereço público da API |
| `checkins-backup.timer` | Backup diário do banco e das fotos/cardápios às 4h |

Arquivos desta pasta: `checkins-api.service`, `cloudflared-quick.service`, `checkins-backup.service` e
`.timer` (systemd), `update.sh` (instala e atualiza a API), `backup.sh` e `env.production.example`.

## 0. Antes de começar

- Debian 12 ou 13, 64 bits (`cat /etc/debian_version`), com uns 2 GB de memória livres.
- O MongoDB 8 só roda em processador com AVX. Confira; tem que aparecer `avx`:

```bash
grep -o -m1 avx /proc/cpuinfo
```

- Os comandos usam `sudo`. Se a Debian não tiver (instalação com senha de root), entre como root uma vez:

```bash
su -
apt-get install -y sudo
usermod -aG sudo SEU_USUARIO   # troque pelo seu usuário
exit                            # saia e entre de novo na sessão para valer
```

## 1. Pacotes básicos

```bash
sudo apt-get update
sudo apt-get install -y curl git gnupg ca-certificates openssl
```

## 2. MongoDB

Instala o MongoDB 8.0 do repositório oficial. Ele ainda não publica o servidor para o Debian 13, então
os dois usam o pacote do Debian 12 (bookworm), que funciona nos dois.

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
  | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-8.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] http://repo.mongodb.org/apt/debian bookworm/mongodb-org/8.0 main" \
  | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list
sudo apt-get update
sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod
```

Por padrão o MongoDB só aceita conexões da própria máquina (`bindIp: 127.0.0.1` em `/etc/mongod.conf`).
Deixe assim.

### Usuários e senha

Gere duas senhas e guarde num lugar seguro (gerenciador de senhas). Elas têm só letras e números, então
cabem na URL do `.env` sem escapar nada:

```bash
echo "admin:    $(openssl rand -hex 24)"
echo "checkins: $(openssl rand -hex 24)"
```

Crie os usuários (troque `SENHA_ADMIN` e `SENHA_CHECKINS`):

```bash
mongosh --quiet <<'EOF'
db.getSiblingDB('admin').createUser({ user: 'admin', pwd: 'SENHA_ADMIN', roles: ['root'] });
db.getSiblingDB('checkins').createUser({
  user: 'checkins', pwd: 'SENHA_CHECKINS', roles: [{ role: 'readWrite', db: 'checkins' }],
});
EOF
```

Ligue a senha obrigatória e reinicie:

```bash
printf '\nsecurity:\n  authorization: enabled\n' | sudo tee -a /etc/mongod.conf
sudo systemctl restart mongod
mongosh "mongodb://checkins:SENHA_CHECKINS@127.0.0.1:27017/checkins?authSource=checkins" --eval 'db.runCommand({ ping: 1 })'
```

O último comando tem que mostrar `{ ok: 1 }`.

## 3. Node.js 22 e npm 11

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt-get install -y nodejs
sudo npm install -g npm@11
node -v && npm -v   # v22.x e 11.x
```

## 4. Usuário da API e código

A API roda com um usuário próprio, sem login, dono do código em `/opt/checkins` e dos dados em
`/var/lib/checkins`.

```bash
sudo useradd --system --home-dir /var/lib/checkins --create-home --shell /usr/sbin/nologin checkins
sudo mkdir -p /opt/checkins
sudo chown checkins:checkins /opt/checkins
sudo -u checkins -H git clone https://github.com/antonionicampos/checkins.git /opt/checkins
```

## 5. `.env` de produção

```bash
sudo -u checkins cp /opt/checkins/deploy/env.production.example /opt/checkins/.env
sudo chmod 600 /opt/checkins/.env
sudo nano /opt/checkins/.env
```

No editor, troque `SENHA` em `MONGO_URL` pela senha do usuário `checkins` e preencha `FIREBASE_PROJECT_ID`
(o mesmo do `.env` da máquina de desenvolvimento). Salve com Ctrl+O, Enter e saia com Ctrl+X.

## 6. Serviço da API

```bash
sudo cp /opt/checkins/deploy/checkins-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable checkins-api
sudo /opt/checkins/deploy/update.sh
```

O `update.sh` instala as dependências (só da API, sem o app), compila, inicia o serviço e confere o
`/health`. No fim tem que aparecer `API no ar: {"status":"ok",...}`.

## 7. Trazer os dados do desenvolvimento (opcional)

Pule se quiser começar com o banco vazio; nesse caso, importe os lugares direto na Debian:

```bash
cd /opt/checkins && sudo -u checkins -H npm run import:osm -w @checkins/api -- "São Paulo"
```

Para levar usuários, check-ins, conversas, fotos e cardápios do computador de desenvolvimento (Windows),
no **PowerShell**, dentro da pasta do repositório:

```powershell
winget install MongoDB.DatabaseTools   # só se o mongodump ainda não existir; abra outro PowerShell depois
mongodump --uri="mongodb://localhost:27017/checkins" --archive=checkins.archive.gz --gzip
tar -czf media.tar.gz media
scp checkins.archive.gz media.tar.gz SEU_USUARIO@IP_DA_DEBIAN:/tmp/
```

Se o `MEDIA_DIR` do `.env` de desenvolvimento aponta para outra pasta, troque `media` no `tar` por ela.
Depois, na **Debian**:

```bash
sudo systemctl stop checkins-api
sudo -u checkins bash -c 'set -a; . /opt/checkins/.env; mongorestore --uri="$MONGO_URL" --archive=/tmp/checkins.archive.gz --gzip --nsInclude="checkins.*" --drop'
sudo tar -xzf /tmp/media.tar.gz -C /var/lib/checkins
sudo chown -R checkins:checkins /var/lib/checkins/media
sudo systemctl start checkins-api
rm /tmp/checkins.archive.gz /tmp/media.tar.gz
```

## 8. Publicar na internet (Cloudflare Tunnel)

Instale o `cloudflared` (o pacote oficial do GitHub do Cloudflare):

```bash
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb
sudo apt-get install -y /tmp/cloudflared.deb
cloudflared --version
```

### Com domínio: endereço fixo (o definitivo)

1. Compre o domínio. Para `.com.br`, no https://registro.br (com CPF); para `.com` e outros, dá para comprar
   direto na Cloudflare (**Domain Registration**), e aí o passo seguinte já está feito. Comprado fora da
   Cloudflare: crie uma conta gratuita em https://dash.cloudflare.com, clique em **Adicionar um domínio**,
   escolha o plano **Free** e, no registro.br, troque os servidores DNS pelos dois que a Cloudflare mostrar.
   A Cloudflare avisa por e-mail quando o domínio ficar ativo (costuma levar de minutos a algumas horas).
2. No painel, vá em **Zero Trust > Networks > Tunnels > Create a tunnel**, escolha **Cloudflared**, dê o nome
   `checkins` e copie o comando que aparece em **Debian**: `sudo cloudflared service install <TOKEN>`. Rode só
   esse comando na Debian (o `cloudflared` já está instalado).
3. Em **Public hostnames** do túnel (em painéis mais novos, **Published application routes**), adicione: subdomínio `api`, seu domínio, tipo **HTTP**, URL
   `127.0.0.1:3000`.
4. Se usou o túnel temporário enquanto esperava, desligue-o. E teste:

```bash
sudo systemctl disable --now cloudflared-quick 2>/dev/null
curl https://api.SEUDOMINIO/health
```

### Enquanto o domínio não fica pronto: endereço temporário

Opcional, para testar já. Não precisa de conta. O endereço é do tipo
`https://palavras-aleatorias.trycloudflare.com` e **muda toda vez que o serviço ou a Debian reinicia**.

```bash
sudo cp /opt/checkins/deploy/cloudflared-quick.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cloudflared-quick
sleep 10
journalctl -u cloudflared-quick | grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' | tail -n1
```

Teste o endereço que apareceu (de qualquer rede, até no 4G do celular): `https://ENDERECO/health`.

O Socket.IO (tempo real) passa pelo túnel sem configurar nada.

## 9. Apontar o app para a produção

No computador de desenvolvimento, em `apps/mobile/.env`:

```
EXPO_PUBLIC_API_URL=https://ENDERECO_DO_TUNEL
```

e suba o app limpando o cache (o endereço fica gravado no bundle):

```powershell
npm run build -w @checkins/shared
cd apps/mobile
npx expo start --clear
```

O Expo Go e o build de desenvolvimento leem esse valor ao abrir o app. Com o túnel temporário, repita este
passo sempre que o endereço mudar. A API de desenvolvimento (`npm run dev:api`) pode continuar existindo no
computador, só não é mais usada pelo app.

## 10. Backup diário

```bash
sudo cp /opt/checkins/deploy/checkins-backup.service /opt/checkins/deploy/checkins-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now checkins-backup.timer
sudo systemctl start checkins-backup         # um backup agora, para testar
journalctl -u checkins-backup -n 20 --no-pager
sudo ls -lh /var/lib/checkins/backups
```

Cada backup é uma pasta `AAAA-MM-DD_HHMM` com `mongo.archive.gz` (banco) e `media.tar.gz` (fotos e
cardápios); os com mais de 14 dias são apagados. O backup fica no mesmo disco da API: copie a pasta
`/var/lib/checkins/backups` de tempos em tempos para outro lugar (HD externo, outro computador), senão um
defeito no disco leva os dois.

Para restaurar um backup:

```bash
B=/var/lib/checkins/backups/AAAA-MM-DD_HHMM   # a pasta escolhida
sudo systemctl stop checkins-api
sudo -u checkins bash -c "set -a; . /opt/checkins/.env; mongorestore --uri=\"\$MONGO_URL\" --archive=$B/mongo.archive.gz --gzip --drop"
sudo tar -xzf $B/media.tar.gz -C /var/lib/checkins
sudo systemctl start checkins-api
```

## 11. Dia a dia

```bash
sudo /opt/checkins/deploy/update.sh             # depois de cada merge na main
sudo /opt/checkins/deploy/update.sh abc1234     # volta para um commit (o update.sh mostra o anterior)
systemctl status checkins-api                   # está rodando?
journalctl -u checkins-api -f                   # log ao vivo (Ctrl+C para sair)
curl http://127.0.0.1:3000/health

# Moderação e importação de lugares (rodam na Debian, com o .env de produção)
cd /opt/checkins
sudo -u checkins -H npm run moderation -w @checkins/api
sudo -u checkins -H npm run import:osm -w @checkins/api -- "São Paulo"
```

Atualizar o sistema e o `cloudflared` de vez em quando:

```bash
sudo apt-get update && sudo apt-get upgrade -y
curl -fsSL -o /tmp/cloudflared.deb \
  https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$(dpkg --print-architecture).deb
sudo apt-get install -y /tmp/cloudflared.deb && sudo systemctl restart cloudflared-quick cloudflared 2>/dev/null
```

## Segurança

- Nenhuma porta precisa ser aberta no roteador: o `cloudflared` conecta para fora. A API escuta só em
  `127.0.0.1` e o MongoDB também.
- Firewall opcional na Debian (libera só o SSH, para você continuar acessando pela rede):

```bash
sudo apt-get install -y ufw
sudo ufw allow OpenSSH
sudo ufw enable
```

- Fotos e cardápios passam pelo cache do Cloudflare. Se a moderação apagar uma foto, o link antigo pode
  continuar abrindo por um tempo; com domínio próprio, limpe em **Caching > Configuration > Purge Cache**
  pela URL.
