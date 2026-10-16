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

## Requisitos

- Node.js 22 e **npm 11** (`npm install -g npm@11`; o npm 10 falha ao instalar este monorepo)
- MongoDB acessível pela máquina (a instância local em desenvolvimento; um servidor da rede em produção)
- Expo Go no celular para testar o app

## Rodando em desenvolvimento

```bash
cp .env.example .env            # ajuste MONGO_URL para o seu MongoDB
npm install                      # também compila packages/shared
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

O CI (GitHub Actions) roda typecheck, testes com um MongoDB próprio do GitHub, build da API e o bundle do app.

## Servidor em casa

```bash
npm ci
npm run build -w @checkins/shared && npm run build -w @checkins/api
npm start -w @checkins/api        # lê o .env da raiz
```

Em produção, `MONGO_URL` aponta para o servidor MongoDB da rede local. Para a API reiniciar sozinha
e subir com a máquina, use um gerenciador de processos (por exemplo, `npx pm2 start npm --name checkins-api -- start -w @checkins/api`
e `pm2 save`). Para publicar a API na internet, instale o `cloudflared` como serviço e aponte o túnel
para `http://localhost:3000`; o MongoDB nunca fica exposto.
