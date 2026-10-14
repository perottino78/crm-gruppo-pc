# Deploy di prova del gateway su Vercel Pro (senza collegare Meta)

Prerequisiti: Vercel Pro attivo, account Vercel e GitHub intestati all'azienda. Nessun valore reale di Meta in questa fase.

## 1. Database dedicato
Crea un nuovo progetto Postgres (Neon, via Vercel → Storage, oppure direttamente su neon.tech), **separato** da quello del CRM. Copia due stringhe: pooled (`DATABASE_URL`) e diretta (`DIRECT_DATABASE_URL`).

## 2. Progetto Vercel del gateway
1. Vercel → Add New → Project → repo `perottino78/crm-gruppo-pc`.
2. **Root Directory:** `gateway`.
3. Settings → General → attiva **"Include source files outside of the Root Directory in the Build Step"** (il gateway importa `../src/lib/meta`).
4. Framework Preset: Other. Build/Output restano quelli di `gateway/vercel.json` (`npm run build` → `prisma generate && prisma migrate deploy`).
5. Region delle funzioni: la stessa del database (es. `fra1`).

## 3. Variabili d'ambiente (inserite a mano nel pannello Vercel, mai in chat/DB/UI)
Per questa **prova** usa valori finti dove indicato:
- `DATABASE_URL`, `DIRECT_DATABASE_URL` (reali, del DB dedicato)
- `CRON_SECRET` (≥ 32 caratteri casuali; Vercel lo invia come Bearer al cron)
- `META_LOCAL_INGEST=false`, `META_GRAPH_API_VERSION=v26.0`, `META_PAGE_ID=1039357632750262`, `META_ALLOWED_FORM_IDS=1280816026986939`, `META_APP_ID=1842181417134760`
- `META_APP_SECRET`, `META_ACCESS_TOKEN`: **valori finti** finché non autorizzi il collegamento reale
- `META_WEBHOOK_VERIFY_TOKEN`: valore finto di prova (quello reale esistente verrà inserito solo al cutover)
- `META_DOWNSTREAMS=crm-a,crm-b` e per ciascuno `META_DOWNSTREAM_CRM_A_URL`, `_SECRET` (≥ 32, distinto), `_MODE=shadow` (idem CRM_B)

## 4. Verifiche dopo il deploy
- `GET https://<progetto>.vercel.app/api/health` → 200.
- Settings → Cron Jobs: compare `/api/internal/tick` ogni minuto; "Run" manuale → risposta 200 con soli contatori.
- `POST /api/internal/tick` senza Bearer → 401.
- `GET /api/meta/webhook?hub.mode=subscribe&hub.verify_token=<finto>&hub.challenge=abc` → `abc`.
- Webhook POST firmato con il segreto finto (script in `gateway/tests`) → 200 e riga su DB; poi il tick consegna ai CRM di prova.
- Prova di indisponibilità: ricevitore B spento → A riceve; B recupera al ritorno.

## 5. Dominio
Aggiungi il dominio scelto nel progetto (Settings → Domains) e crea il CNAME indicato da Vercel presso chi gestisce il DNS. HTTPS automatico. Il dominio definitivo va deciso **prima** di registrare l'URL in Meta.

## 6. Cosa NON fare in questa fase
Nessun valore Meta reale, nessuna modifica a callback o subscription, nessuna chiamata a `subscribed_apps`.
