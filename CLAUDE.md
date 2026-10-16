# CLAUDE.md

Guia para o Claude Code neste repositório. Projeto de uma pessoa só (Antonioni), em português.

## Produto

App mobile de lugares: check-in com comentário/nota, ver quem fez check-in no mesmo local agora,
conversa direta após aceite, grupos abertos no estabelecimento (só cria quem está no local; temporário
ou sem prazo), perfil com fotos de lugares, cardápio em foto/PDF. Foco em socializar, não em paquera.

## Arquitetura

- Monorepo com npm workspaces (npm 11). `apps/mobile` (Expo), `apps/api` (Fastify), `packages/shared`.
- `packages/shared` é compilado para `dist/` (o app e a API consomem o JS compilado). Rode
  `npm run build -w @checkins/shared` depois de alterá-lo.
- Tudo que o app e a API precisam concordar (schemas zod de entrada/saída, constantes como o raio de
  presença) fica em `packages/shared`.
- MongoDB via Mongoose. Localização em GeoJSON `[lng, lat]` com índice `2dsphere`; no app e na API,
  use `{ lat, lng }` e converta com `toGeoPoint`.
- Regra de presença: check-in e criação de grupo exigem estar a até `PRESENCE_RADIUS_METERS` do lugar,
  conferido no servidor; presença dura `CHECKIN_PRESENCE_HOURS`.
- Tempo real com Socket.IO na própria API (`apps/api/src/realtime`), uma sala por lugar/grupo.
- Backend roda em Docker Compose numa máquina em casa, exposto só pelo Cloudflare Tunnel.

## Regras

- Uma funcionalidade por PR, com testes. Rotas da API testadas com `app.inject` (`buildApp` não abre porta).
- Valide toda entrada da API com os schemas de `packages/shared`; erros de zod viram 400.
- Mensagens para o usuário e comentários em português; nomes de código em inglês.
- No app, siga `apps/mobile/AGENTS.md` (Expo Router em `src/app`; instale pacotes com versões do SDK).
- Antes de concluir: `npm run typecheck` e `npm test` (com `MONGO_URL_TEST` para os testes de banco).
- Não use Firebase/Supabase; a pilha é Expo + Node + MongoDB em casa.
