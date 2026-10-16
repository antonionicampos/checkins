# Check-ins

App mobile para descobrir, recomendar e conversar sobre lugares da cidade: check-in no local,
ver quem está ali, puxar conversa, grupos abertos no estabelecimento, fotos e cardápios.

> "Check-ins" é um nome provisório.

## Estrutura

| Pasta | O que é |
| --- | --- |
| `apps/mobile` | App React Native com Expo (Expo Router, TypeScript) |
| `apps/api` | API Node.js com Fastify, MongoDB (Mongoose) e Socket.IO |
| `packages/shared` | Tipos, validações (zod) e constantes usados pelo app e pela API |
| `docker-compose.yml` | API + MongoDB (+ Cloudflare Tunnel opcional) para a máquina de casa |

## Requisitos

- Node.js 22 e **npm 11** (`npm install -g npm@11`; o npm 10 falha ao instalar este monorepo)
- Docker com Docker Compose
- Expo Go no celular para testar o app

## Rodando em desenvolvimento

```bash
cp .env.example .env
npm install                      # também compila packages/shared
docker compose up -d mongo       # só o banco
npm run dev:api                  # API em http://localhost:3000 com recarga automática
npm run seed -w @checkins/api    # lugares de exemplo (SEED_LAT/SEED_LNG para mudar a posição)
```

App no celular (mesma rede Wi-Fi da máquina):

```bash
cp apps/mobile/.env.example apps/mobile/.env   # coloque o IP da máquina em EXPO_PUBLIC_API_URL
npm run dev:mobile                              # leia o QR code com o Expo Go
```

Login com Google só funciona no build de desenvolvimento (no Expo Go, use e-mail e senha):

```bash
cd apps/mobile
npx eas-cli@latest build --profile development --platform android   # instale o APK gerado no celular
npx expo start --dev-client
```

Depois de mudar algo em `packages/shared`, rode `npm run build -w @checkins/shared`.

## Configurar o login (Firebase)

1. Crie um projeto em https://console.firebase.google.com (o plano gratuito basta).
2. Em **Authentication > Método de login**, ative **E-mail/senha** e **Google**.
3. Em **Configurações do projeto > Seus apps**, adicione um app da **Web** e copie `apiKey`, `authDomain`,
   `projectId` e `appId` para `apps/mobile/.env`. Coloque o mesmo `projectId` em `FIREBASE_PROJECT_ID` no `.env` da raiz.
4. Para o Google: copie o "ID do cliente da Web" (em Authentication > Google) para `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
   adicione um app **Android** com o pacote `com.antonionicampos.checkins` e a impressão digital SHA-1 que
   `npx eas-cli@latest credentials` mostra.

## Testes e checagens

```bash
npm run typecheck
npm test                                   # testes que precisam do banco são pulados sem MONGO_URL_TEST
MONGO_URL_TEST=mongodb://localhost:27017/checkins_test npm test -w @checkins/api
```

O CI (GitHub Actions) roda typecheck, testes com MongoDB, build da API e o bundle do app.

## Servidor em casa

```bash
docker compose up -d --build                  # API + MongoDB, reiniciam sozinhos
docker compose --profile tunnel up -d         # também publica a API pelo Cloudflare Tunnel
```

O MongoDB só escuta em `127.0.0.1`. A API fica na porta 3000 da rede local (para o Expo Go) e,
com o perfil `tunnel`, no domínio configurado no Cloudflare (`CLOUDFLARE_TUNNEL_TOKEN` no `.env`).
