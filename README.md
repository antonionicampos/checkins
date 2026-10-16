# Check-ins

App mobile para descobrir, recomendar e conversar sobre lugares da cidade. A pessoa faz check-in
no local, vê quem está ali e puxa conversa. O app também terá grupos abertos no estabelecimento,
fotos e cardápios.

> "Check-ins" é um nome provisório.

## Onde estamos

| Parte | Situação |
| --- | --- |
| Estrutura do monorepo, CI e documentação | Pronto |
| Login com Firebase (e-mail/senha, esqueci a senha, Google) | Pronto, falta configurar o projeto no Firebase |
| Perfil do usuário no MongoDB (`GET/PATCH /me`) | Pronto |
| Lugares perto de você (busca por distância) | Pronto, com lugares de exemplo |
| Socket.IO com login obrigatório | Base pronta (só entra e sai de salas) |
| Importar lugares do OpenStreetMap | Pronto (`npm run import:osm`); São Paulo é a primeira cidade |
| Check-in e quem está no local agora | A fazer (modelo `Checkin` já existe) |
| Conversa direta, grupos no local, chat | A fazer |
| Fotos e cardápios (salvos no disco de casa) | A fazer |
| Denúncia/moderação e notificações push | A fazer |

Decisões já tomadas: Firebase só para login; dados na API em casa com MongoDB (sem Docker);
lugares do OpenStreetMap; fotos e cardápios no disco da máquina de casa.

## Arquitetura

```
Celular (Expo)  ──login──▶  Firebase Auth
      │  ID token (Authorization: Bearer)
      ▼
API Node (Fastify + Socket.IO), na máquina de casa  ──▶  MongoDB (local ou servidor da rede)
      ▲
Cloudflare Tunnel (HTTPS público, sem abrir portas)
```

- O app faz login no Firebase e manda o ID token em toda chamada. A API valida o token com
  firebase-admin (só precisa do `FIREBASE_PROJECT_ID`) e guarda o perfil no MongoDB, ligado ao `firebaseUid`.
- Localizações ficam em GeoJSON com índice `2dsphere`. Check-in e criação de grupo vão exigir estar
  a até 100 m do lugar, e a presença dura 3 horas (constantes em `packages/shared`).

## Estrutura

| Pasta | O que é |
| --- | --- |
| `apps/mobile` | App React Native com Expo SDK 57 e Expo Router (TypeScript) |
| `apps/mobile/src/app` | Telas: `sign-in.tsx` (login) e `index.tsx` (lugares perto de você) |
| `apps/mobile/src/auth`, `src/lib` | Contexto de login, Firebase, Google e cliente da API |
| `apps/api` | API Node.js com Fastify, MongoDB (Mongoose) e Socket.IO |
| `apps/api/src/routes` | Rotas e seus testes |
| `apps/api/src/models` | `Place`, `Checkin` e `User` |
| `apps/api/src/auth` | Validação do token do Firebase e `requireAuth` |
| `apps/api/src/realtime` | Socket.IO |
| `packages/shared` | Tipos, validações (zod) e constantes usados pelo app e pela API |

## Rotas da API

| Rota | Login | O que faz |
| --- | --- | --- |
| `GET /health` | Não | Estado da API e do MongoDB (503 se o banco cair) |
| `GET /places/nearby?lat=&lng=&radius=&category=` | Não | Lugares no raio (50 a 5000 m, padrão 1000), do mais perto ao mais longe |
| `GET /places/:placeId` | Não | Um lugar |
| `GET /me` | Sim | Perfil de quem está logado; cria o perfil no primeiro acesso |
| `PATCH /me` | Sim | Muda o nome exibido (`{ "displayName": "..." }`) |

O Socket.IO exige o token na conexão: `io(url, { auth: { token } })`.

## Requisitos

- Node.js 22 e **npm 11** (`npm install -g npm@11`; o npm 10 falha ao instalar este monorepo)
- Um MongoDB acessível: a instância desta máquina em desenvolvimento, um servidor da rede em produção
- Um projeto no Firebase (veja abaixo)
- Expo Go no celular, ou o build de desenvolvimento para testar o login com Google

## Configuração

Copie `.env.example` para `.env` (raiz, usado pela API) e `apps/mobile/.env.example` para
`apps/mobile/.env` (usado pelo app).

| Variável | Onde | Para quê |
| --- | --- | --- |
| `MONGO_URL` | `.env` | Banco da API, por exemplo `mongodb://localhost:27017/checkins` |
| `MONGO_URL_TEST` | `.env` | Banco dos testes. O nome precisa ter "test", porque os testes apagam os dados dele |
| `FIREBASE_PROJECT_ID` | `.env` | ID do projeto no Firebase, para validar os logins |
| `PORT`, `CORS_ORIGIN` | `.env` | Porta da API (3000) e origens liberadas |
| `EXPO_PUBLIC_API_URL` | `apps/mobile/.env` | Endereço da API visto pelo celular (IP da máquina na rede, ou o domínio do túnel) |
| `EXPO_PUBLIC_FIREBASE_*` | `apps/mobile/.env` | Configuração do app da Web no Firebase |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | `apps/mobile/.env` | Cliente OAuth "Web" do Google, para o login com Google |
| `GOOGLE_IOS_URL_SCHEME` | `apps/mobile/.env` | Só para iPhone: "reversed client ID" do cliente iOS |

### Configurar o login (Firebase)

1. Crie um projeto em https://console.firebase.google.com (o plano gratuito basta).
2. Em **Authentication > Método de login**, ative **E-mail/senha** e **Google**.
3. Em **Configurações do projeto > Seus apps**, adicione um app da **Web** e copie `apiKey`, `authDomain`,
   `projectId` e `appId` para `apps/mobile/.env`. Coloque o mesmo `projectId` em `FIREBASE_PROJECT_ID` no `.env` da raiz.
4. Para o Google, copie o "ID do cliente da Web" (em Authentication > Google) para `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
   Depois adicione um app **Android** com o pacote `com.antonionicampos.checkins` e a impressão digital SHA-1
   que `npx eas-cli@latest credentials` mostra.

## Rodando em desenvolvimento

```bash
npm install                      # também compila packages/shared
npm run dev:api                  # API em http://localhost:3000 com recarga automática
npm run import:osm -w @checkins/api -- "São Paulo"   # lugares reais do OpenStreetMap
npm run seed -w @checkins/api    # ou só 4 lugares de exemplo (SEED_LAT/SEED_LNG mudam a posição)
npm run dev:mobile               # leia o QR code com o Expo Go (mesma rede Wi-Fi da máquina)
```

O login com Google usa um módulo nativo e só funciona no build de desenvolvimento. No Expo Go,
o botão do Google não aparece e o login por e-mail funciona normalmente.

```bash
cd apps/mobile
npx eas-cli@latest build --profile development --platform android   # instale o APK gerado no celular
npx expo start --dev-client
```

Depois de mudar algo em `packages/shared`, rode `npm run build -w @checkins/shared`.

## Testes e checagens

```bash
npm run typecheck
npm test        # os testes de banco usam MONGO_URL_TEST do .env; sem ele, são pulados
```

O CI (GitHub Actions) roda typecheck, testes com um MongoDB próprio do GitHub, build da API e o
bundle do app em cada PR.

## Produção (servidor em casa)

```bash
npm ci
npm run build -w @checkins/shared && npm run build -w @checkins/api
npm start -w @checkins/api        # lê o .env da raiz
```

Em produção, `MONGO_URL` aponta para o servidor MongoDB da rede local. Para a API reiniciar sozinha
e subir junto com a máquina, use um gerenciador de processos, por exemplo
`npx pm2 start apps/api/dist/server.js --name checkins-api --node-args="--env-file=.env"` (na raiz)
seguido de `pm2 save`. Para publicar a API na internet, instale o `cloudflared` como serviço e aponte
o túnel para `http://localhost:3000`. O MongoDB nunca fica exposto.

## Trabalhando com o Claude Code

O `CLAUDE.md` descreve a arquitetura e as regras do projeto: uma funcionalidade por PR, com testes,
entradas da API validadas pelos schemas de `packages/shared` e textos para o usuário em português.

## Lugares do OpenStreetMap

`npm run import:osm -w @checkins/api -- "<município>"` baixa da Overpass API os bares, pubs,
restaurantes, lanchonetes, cafés, sorveterias, baladas e academias que têm nome dentro do município,
e grava tudo no MongoDB de `MONGO_URL`. Rodar de novo atualiza os lugares que já existem (pelo ID do
OSM) em vez de duplicar, então dá para repetir de tempos em tempos. A mesma cidade inteira de São Paulo
pode levar alguns minutos; se a Overpass estiver ocupada (erro 429 ou 504), tente mais tarde ou use outro
servidor com `OVERPASS_URL`. Os dados do OpenStreetMap exigem a atribuição "© OpenStreetMap contributors"
no app.
