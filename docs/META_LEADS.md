# Integrazione Meta Lead Ads — receiver, sicurezza, architettura

## Stato attuale

- Il receiver è **implementato e testato ma NON collegato alla dashboard Meta**.
- Nessuna configurazione dell'app Meta è stata modificata: callback principale, subscriptions, token,
  App Secret e verify token restano intatti. Il codice non chiama mai le API di configurazione delle subscriptions.
- Finché le variabili d'ambiente non sono impostate, gli endpoint rispondono `503 not_configured`
  (il GET risponde `503` e non verifica nulla).

Dati non segreti: App ID `1842181417134760`, Page ID `1039357632750262` (Gruppo P&C), Graph API `v26.0`,
oggetto `page`, campo `leadgen`, form autorizzato `1280816026986939` (Modulo generale P&C – Catalogo).

## Endpoint

| Percorso | Metodo | Scopo |
|---|---|---|
| `/api/lead/meta` | GET | Handshake Meta (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`) |
| `/api/lead/meta` | POST | Notifiche `leadgen` firmate da Meta (`X-Hub-Signature-256`) |
| `/api/lead/meta/internal` | POST | Evento interno firmato gateway → questo CRM (non usa segreti Meta) |
| `/api/lead/meta/retry` | GET/POST | Ritentativi (lead da recuperare, consegne ai CRM a valle). `Authorization: Bearer META_RETRY_SECRET` |
| `/api/lead` | POST | Ingresso generico lead (Zapier/Make/form), chiave in Impostazioni → Lead |

## Variabili d'ambiente (nomi, mai valori)

Obbligatorie per il receiver Meta:

| Variabile | Uso |
|---|---|
| `META_APP_ID` | Identificativo app (diagnostica) |
| `META_APP_SECRET` | HMAC delle notifiche in ingresso e `appsecret_proof` verso Graph. Mai inoltrato ai CRM a valle |
| `META_ACCESS_TOKEN` | Token utente di sistema, solo per `Authorization: Bearer` verso Graph. Mai nell'URL |
| `META_WEBHOOK_VERIFY_TOKEN` | Verifica del GET. Mai nei log |
| `META_PAGE_ID` | Allowlist pagina (`1039357632750262`) |
| `META_ALLOWED_FORM_IDS` | Allowlist form, separati da virgola (inizialmente `1280816026986939`) |

Opzionali:

| Variabile | Default | Uso |
|---|---|---|
| `META_GRAPH_API_VERSION` | `v26.0` | Versione Graph (formato `vNN.N`) |
| `META_DEFAULT_BRAND` | `P&C` | Brand dei lead |
| `META_FORM_BRANDS` | – | Brand per form: `1280816026986939=P&C,42=Solaris` |
| `META_LOCAL_INGEST` | `true` | `false` = questo servizio fa solo da gateway e non crea lead locali |
| `META_INTERNAL_SECRET` | – | Segreto con cui questo CRM accetta eventi interni firmati (modalità downstream) |
| `META_RETRY_SECRET` | `CRON_SECRET` | Protegge `/api/lead/meta/retry` |
| `META_DOWNSTREAMS` | – | Nomi dei CRM a valle, es. `crm-vecchio,crm-nuovo` |
| `META_DOWNSTREAM_<NOME>_URL` / `_SECRET` | – | URL https e segreto HMAC **distinto per ciascun CRM**. `<NOME>` in maiuscolo, non alfanumerici → `_` |

Tutte vanno impostate solo su Vercel → Settings → Environment Variables. Non committare mai `.env`.

## Comportamento del receiver

1. **GET**: accetta solo `hub.mode=subscribe` e token corretto (confronto a tempo costante), risponde `hub.challenge` in `text/plain` 200.
2. **POST**: legge il corpo grezzo (max 256 KB), verifica `X-Hub-Signature-256` = HMAC-SHA256(corpo, `META_APP_SECRET`) a tempo costante, **prima** del parsing. Firma assente/errata → 401. Non ci si fida dell'IP.
3. **Parsing**: `object=page`, solo `entry[].changes[]` con `field=leadgen`; estrae `leadgen_id`, `page_id`, `form_id`, `ad_id`, `adgroup_id`, `created_time`.
   Page/Form non in allowlist → evento ignorato (risposta 200, niente persistenza, contatore nel log: rispondere errore farebbe ritentare Meta all'infinito e potrebbe far disattivare la subscription).
4. **Persistenza prima di tutto**: la notifica è salvata (`MetaDelivery`, stato `RECEIVED`, solo ID) prima di rispondere 200. Se il salvataggio fallisce → 500 e Meta ritenta.
5. **Elaborazione dopo la risposta** (`after`): recupero lead da Graph v26.0 con `Authorization: Bearer` + `appsecret_proof`; verifica che `id` e `form_id` coincidano con la notifica; creazione lead idempotente (`Lead.metaLeadgenId` unico); fan-out ai CRM a valle.
6. **Stati**: `RECEIVED → PROCESSING → PROCESSED | FAILED`. Si conservano tentativi e codice d'errore (es. `graph_500_c2`, `lead_id_mismatch`), mai dati sensibili.
   Errori temporanei (rete, 5xx, 429, codici Graph 1/2/4/17/32/341/368/613) → backoff 30 s … 6 h, max 8 tentativi. Permanenti (token 190, permessi, mismatch, lead senza contatto) → `retriabile=false`.
7. **Dati personali**: il lead completo è in `MetaDelivery.leadJson` (archivio per audit, mai esposto). Nei log solo codici e contatori; chiavi come token/secret/email/telefono sono scartate dal logger.
8. **Ritentativi**: `/api/lead/meta/retry` va richiamato ogni pochi minuti. Vercel Cron richiede un piano che permetta frequenze sotto il giorno (il piano Hobby no): in alternativa uno scheduler esterno con `Authorization: Bearer ...`. Ogni notifica nuova avvia comunque un piccolo ciclo di recupero.

## Architettura: come far convivere due CRM con un solo callback Meta

Meta consente **un solo callback** per app + oggetto `page`. Fino a scelta esplicita **non si tocca**.

### 1. Gateway stabile con fan-out (raccomandata)

```
Meta ──POST firmato──▶ GATEWAY (verifica Meta UNA volta, salva, risponde 200)
                          ├─ firma HMAC segreto A ─▶ CRM vecchio  (/hook)
                          └─ firma HMAC segreto B ─▶ CRM nuovo    (/api/lead/meta/internal)
```

- Il gateway è l'unico ricevente Meta e l'unico a conoscere App Secret e token Meta. Resta stabile mentre i CRM cambiano.
- Per ogni evento crea una consegna **per destinatario**, con stato, backoff e idempotenza separati: un CRM giù non blocca l'altro.
- Contratto verso i CRM (già implementato in `deliverDownstream`): `POST` JSON con
  `event_id`/`leadgen_id`, `page_id`, `form_id`, `ad_id`, `adgroup_id`, `created_time`, `forwarded_at`, `lead` (dati Graph);
  intestazioni `X-GPC-Event-Id`, `X-GPC-Timestamp` (secondi), `X-GPC-Signature: v1=HMAC-SHA256(segreto_del_CRM, "<timestamp>.<corpo>")`, `X-GPC-Attempt`.
  Il CRM deve verificare firma e finestra temporale (±5 min) ed essere idempotente su `event_id`; risponde 2xx (o 409 se già visto).
- **Questo repository può fare da gateway**: `src/lib/meta` è indipendente da Next/Prisma (usa l'interfaccia `MetaStore`). Per un gateway vero conviene un piccolo servizio separato (stesso modulo, DB proprio) così non dipende dal ciclo di rilascio di nessun CRM.
- Questo CRM, come downstream, espone già `/api/lead/meta/internal` (richiede `META_INTERNAL_SECRET`, `META_PAGE_ID`, `META_ALLOWED_FORM_IDS`).
- Passi per attivarla: scegliere dove ospitare il gateway → impostare le variabili → registrare il **gateway** come callback Meta (decisione e operazione manuale, da autorizzare) → verificare con il Lead Ads Testing Tool → collegare i due CRM.

### 2. Soluzione transitoria: inoltro dal CRM che riceve Meta

Il CRM che oggi è il callback principale inoltra l'evento a questo CRM. Con questo codice basta, in questo CRM, `META_INTERNAL_SECRET` (e `/api/lead/meta/internal` come destinazione).
Nel CRM attuale occorre aggiungere l'inoltro con la stessa firma HMAC (`X-GPC-*`, segreto indipendente da quello Meta). Svantaggi: dipende dal CRM vecchio e va smontato alla dismissione.

### 3. Cutover

Questo CRM diventa l'unico ricevente Meta (`META_APP_SECRET`, `META_ACCESS_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN` impostati e callback ripuntato) **solo dopo** la dismissione del precedente. Checklist: freeze del vecchio, ultimo evento consegnato, ripuntamento del callback, verifica handshake, lead di test, monitoraggio dei primi eventi.

## Test (nessuna modifica a Meta)

```
npm run test:meta
```

33 test con fixture firmate usando segreti **finti** (`tests/meta/helpers.ts`): handshake GET corretto/errato, firma valida/mancante/alterata/riformattata, payload non valido/troppo grande, Page/Form non autorizzati, lead duplicato e doppia elaborazione, errore Graph temporaneo e permanente con backoff, mismatch lead/form, fan-out con segreti distinti, CRM non disponibile che non blocca l'altro, nessun reinvio duplicato, evento interno firmato, assenza di segreti e dati personali nei log.

## Limiti noti

- `prismaStore` (persistenza su Postgres) è verificato dal typecheck e dalla build ma **non testato contro un database reale**; i test usano uno store in memoria con la stessa interfaccia. Prima del collegamento: prova con un evento firmato di test su un database di staging.
- Il comportamento di Meta (formato reale della notifica, permessi `leads_retrieval` del token di sistema) va confermato con un lead di test dallo strumento Lead Ads Testing di Meta, dopo l'autorizzazione al collegamento.
- Senza scheduler il ritentativo avviene solo quando arriva una nuova notifica.
