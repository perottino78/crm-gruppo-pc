# Gateway Meta Lead Ads → CRM (assetto 1: gateway centrale con fan-out)

Stato: **costruito e collaudato in locale. NON collegato a Meta. Nessuna modifica alla dashboard Meta.**
Il passaggio del callback al gateway è un cutover coordinato che richiede autorizzazione esplicita.

## 1. URL stabile proposto
Progetto Vercel dedicato (cartella `gateway/` del repo), con dominio proprio e stabile, non un tunnel:

- Callback Meta (da registrare SOLO al cutover): `https://meta-leads.<dominio-aziendale>/api/meta/webhook`
- Fino a quel momento (collaudo senza Meta): `https://<progetto>.vercel.app/api/meta/webhook`
- Salute: `GET /api/health` · Stato (autenticato): `/api/internal/status`

Consigliato un sottodominio aziendale (CNAME verso Vercel): se un giorno cambia il progetto Vercel, l'URL registrato in Meta non cambia.

## 2. Contratto del webhook downstream (gateway → CRM), versione 1
- **Metodo/URL**: `POST <URL del CRM>` (nel CRM di questo repo: `/api/lead/meta/internal`). Solo `https://` (o `http://localhost` per i test).
- **Header**
  - `X-GPC-Signature: v1=<hex>` = HMAC-SHA256 con il **segreto proprio di quel CRM** su `"<timestamp>.<corpo grezzo>"`
  - `X-GPC-Timestamp`: secondi unix, rigenerato a ogni tentativo (firma nuova a ogni tentativo)
  - `X-GPC-Event-Id: meta_leadgen_<leadgen_id>` (chiave di idempotenza)
  - `X-GPC-Schema-Version: 1`, `X-GPC-Mode: shadow|live`, `X-GPC-Attempt: n`
- **Anti-replay**: timestamp entro ±300 s dall'orologio del ricevente + idempotenza su `event_id`. La firma si verifica sul **corpo grezzo** (prima del parsing), con confronto a tempo costante.
- **Corpo** (JSON deterministico): `schema_version, event_id, mode, leadgen_id, page_id, form_id, ad_id?, adgroup_id?, created_time?, lead{ id, created_time, form_id, ad_id, campaign_name, field_data[{name,values[]}] }`.
  Non contiene mai App Secret, token Meta o firma originale Meta.
- **Risposte del CRM**: `200` ricevuto/già ricevuto (anche duplicato) · `409` già presente (trattato come consegnato) · `401` firma/timestamp non valido · `400/422` payload o versione non valida (non ritentare) · `413` troppo grande · `5xx/408/425/429` ritenta (rispetta `Retry-After`).
- **Retry (gateway)**: backoff 30 s·2^(n-1), massimo 6 h, jitter ±20 %, **15 tentativi (~38 h)**; poi stato FAILED non ritentabile (dead-letter) e rimessa in coda con `/api/internal/requeue`. Stato, tentativi e idempotenza sono **separati per destinatario**.
- **Idempotenza lato CRM**: `event_id` unico (tabella `MetaInboundEvent`) + `Lead.metaLeadgenId` unico.
- Il ricevente nel “CRM attuale” verrà implementato dopo accordo su questo contratto.

## 3. Scheduler / coda scelti
- **Coda durevole = tabelle Postgres** (`MetaDelivery`, `MetaDownstream`) del database dedicato del gateway. Ogni evento è su DB **prima** del `200` a Meta; nessuna elaborazione dipende dal codice eseguito dopo la risposta HTTP.
- **Tick**: `/api/internal/tick` rilegge lo stato dal DB e riprende tutto (lead non recuperati, PROCESSING abbandonati, consegne scadute). I retry non dipendono da un nuovo webhook.
- **Trigger**: Vercel Cron ogni minuto se il progetto è **Pro**; altrimenti **Upstash QStash** (ogni 2 min rientra nel piano gratuito). Il Hobby di Vercel consente solo cron giornalieri: non usarlo.
- **Autenticazione tick**: `Authorization: Bearer <META_SCHEDULER_SECRET ≥ 32 car.>` oppure firma `Upstash-Signature` (JWT HS256, URL + hash corpo, scadenza). Altrimenti `401`. Risposta: solo contatori.

## 4. Risultati delle prove (sandbox, Postgres 18 reale)
- Migrazione gateway (`prisma migrate deploy`) e `db push` CRM applicate su Postgres reale.
- 20 `upsert` concorrenti → 1 riga; 15 `claim` concorrenti → 1 vincitore; 10 `ensureDownstreams` concorrenti → 2 righe; 12 `claimDownstream` concorrenti → 1 vincitore; PROCESSING abbandonato ripreso; requeue; stats; unicità `MetaInboundEvent` (10 insert → 1).
- E2E su HTTP reale: handshake GET; firma errata → 401 e nulla salvato; firma valida → 200 con riga già su DB; reinvio Meta identico → nessun duplicato; tick senza/errato → 401; Graph chiamato **una sola volta**; token mai nell'URL; CRM-B spento (503) non blocca CRM-A; CRM-B riceve dopo il ripristino con firma valida; firma di A non valida per B; nessun segreto nel corpo; 6 tick concorrenti → 1 consegna per destinatario; funzione morta a metà → ripresa dallo scheduler.
- 50 test unitari + 5 di integrazione/E2E passano. **Non verificato**: comportamento su Vercel/Neon reali, piano Vercel, dominio, Graph reale (nessuna chiamata a Meta è stata fatta).

## 5. Shadow mode e prevenzione duplicati
- Ogni destinatario ha `META_DOWNSTREAM_<N>_MODE` (default **shadow**). In shadow il CRM registra l'evento (`MetaInboundEvent`) ma **non crea lead, notifiche, email o automazioni**.
- `META_INTERNAL_MODE` sul CRM ricevente è un secondo interruttore: anche se il gateway dice `live`, il CRM resta shadow finché non è abilitato.
- I `replay` (rilettura via Graph di leadgen_id reali già gestiti dal CRM attuale) sono **sempre shadow** e non rinviano se l'ID è già noto.
- Collaudo senza toccare Meta: fixture firmate + replay operatore. Passaggio a live **un CRM alla volta**, dopo confronto dei numeri.
- Il CRM attuale continua a ricevere da Meta finché il callback non cambia; nessun doppio invio perché il gateway non è ancora il callback.

## 6. Checklist di cutover (solo dopo tua autorizzazione esplicita)
1. Deploy gateway su progetto Vercel dedicato + database Neon dedicato; `prisma migrate deploy` ok.
2. Variabili inserite **a mano** su Vercel (mai in chat, DB o UI): `META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN, META_WEBHOOK_VERIFY_TOKEN (quello esistente), META_PAGE_ID=1039357632750262, META_GRAPH_API_VERSION=v26.0, META_ALLOWED_FORM_IDS=1280816026986939, META_LOCAL_INGEST=false, META_SCHEDULER_SECRET, META_DOWNSTREAMS, META_DOWNSTREAM_<N>_URL/_SECRET/_MODE=shadow` (un segreto distinto ≥ 32 car. per CRM), `DATABASE_URL, DIRECT_DATABASE_URL`, e QStash o `CRON_SECRET`.
3. Impostazione Vercel “Include source files outside of the Root Directory” attiva (il gateway importa `../src/lib/meta`).
4. Scheduler attivo; `/api/internal/status` autenticato risponde.
5. Ricevente implementato nel CRM attuale; invio di fixture firmate → `200`; firma errata → `401`; replay timestamp vecchio → `401`.
6. Prova di indisponibilità indipendente di ciascun CRM sul gateway deployato.
7. Replay in shadow di leadgen_id reali recenti; confronto con quanto ha ricevuto il CRM attuale.
8. Lead di prova dalla stessa identità tecnica (assegnazione temporanea Inserzioni/ADVERTISE all'utente di sistema) o invio reale controllato — solo dopo autorizzazione.
9. **Autorizzazione esplicita** → in Meta si sostituisce **solo** il Callback URL con l'URL del gateway (verify token invariato, nessuna chiamata a `subscribed_apps`, nessuna rigenerazione di token/segreti). Verifica handshake.
10. Primo lead reale: presente nel gateway, consegnato in shadow ai due CRM; poi passaggio a live un CRM alla volta.

### Rollback
- Meta → ripristinare il Callback URL **precedente** (tunnel del CRM attuale) con lo stesso verify token. Annotare l'URL attuale prima del cutover.
- Gli eventi già nel gateway restano su DB: ritentati dallo scheduler o rigiocabili con `/api/internal/requeue` / `replay`.
- Riportare i destinatari a `MODE=shadow` per fermare ogni effetto live; l'idempotenza (event_id, `metaLeadgenId`) evita duplicati se un lead arriva da entrambi i percorsi.

## Nota sul Testing Tool
Il lead sintetico del profilo umano ha dato Graph 100/33; l'utente di sistema ha MANAGE_LEADS e CREATE_CONTENT ma non ADVERTISE. Non è un difetto del ricevitore. Test riproducibile: lead di prova dalla stessa identità tecnica (con ADVERTISE temporaneo) o invio reale controllato.
