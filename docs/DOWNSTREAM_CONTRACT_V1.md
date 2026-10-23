# Contratto downstream v1 — gateway → CRM

Stato: **proposta per approvazione**, implementata e verificata dai test (`tests/meta/contract.test.ts`). Dominio gateway: `meta-leads.gruppopec.com`. Nessuna credenziale Meta reale inserita; nessuna modifica a callback o subscription.
File di riferimento in `docs/contract/`: `downstream-v1.schema.json`, `example-full.json`, `example-minimal-nulls.json`, `example-no-lead.json`, `test-vector.json`.

## Trasporto
- `POST <URL del CRM>`, solo `https://`, `Content-Type: application/json; charset=utf-8`, timeout del gateway 10 s, corpo massimo 256 KB.
- I CRM **non** ricevono né usano token Meta, App Secret o firma Meta. Il gateway legge il lead da Graph **una sola volta** e invia dati normalizzati.
- Nomi header case-insensitive. Il ricevente ignora campi JSON sconosciuti (compatibilità in avanti).

## 1. JSON Schema
`docs/contract/downstream-v1.schema.json` (Draft 2020-12). Campi sempre presenti: `schema_version, event_id, source, mode, leadgen_id, page_id, form_id, ad_id, adgroup_id, created_time, received_at, lead`. Possono essere `null`: `ad_id, adgroup_id, created_time, lead` e, dentro `lead`, `created_time, ad_id, campaign_name`. `lead` è `null` solo se il lead non è ancora stato letto (non accade in consegna normale). Obbligatori dentro `lead`: `id, form_id, field_data`.

## 2. Esempi
- Completo: `example-full.json` (tutti i campi valorizzati, mode `live`).
- Minimo con null: `example-minimal-nulls.json` (mode `shadow`).
- `lead: null`: `example-no-lead.json`.
Tutti i dati sono fittizi e validati contro lo schema dal test.

## 3. Test vector firma
Vedi `docs/contract/test-vector.json`. Segreto fittizio `TEST_ONLY_secret_0123456789abcdef0123456789abcdef`, timestamp `1760436005`, corpo grezzo = contenuto di `example-full.json` **senza** newline finale, stringa firmata = `1760436005.<corpo>`.
Firma attesa: `v1=f2bb377ece9ef55d057324c8c3ef96d2b85dd065e575dd05aead796d13aaf307` (verificata anche con `openssl dgst -sha256 -hmac`).

## 4. Codifica firma
**Esadecimale minuscolo**, 64 caratteri, con prefisso letterale `v1=`. Non Base64. HMAC-SHA256 calcolato sui **byte grezzi** del corpo (prima di qualsiasi parsing), confronto a tempo costante.

## 5. Timestamp
`X-GPC-Timestamp`: intero decimale, **secondi Unix UTC** (9–12 cifre). Rigenerato a ogni tentativo (anche la firma cambia; il corpo no). Il ricevente rifiuta con 401 se |ora_locale − timestamp| > **300 s**.

## 6. Valori ammessi
- `X-GPC-Mode` (e `mode` nel corpo, devono coincidere): `shadow` | `live`. Altro → 400.
- `X-GPC-Schema-Version` (e `schema_version` nel corpo): `1`. Altro → 422 `unsupported_schema_version`.
- `X-GPC-Attempt`: numero del tentativo (informativo). `source`: sempre `meta_lead_ads`.

## 7. Regola degli identificativi
`X-GPC-Event-Id` = `event_id` (corpo) = `"meta_leadgen_" + leadgen_id`; `leadgen_id` = `/^[0-9]{1,30}$/`; se `lead` non è null, `lead.id` = `leadgen_id`. Qualsiasi difformità → 400 `invalid_payload`. `event_id` è la chiave di idempotenza.

## 8. Comportamento del ricevente (risposte esatte)
Ordine dei controlli: configurazione → dimensione → firma/timestamp → JSON → versione → id → allowlist → modalità.
| Caso | Risposta | Effetti |
|---|---|---|
| Non configurato | 503 `not_configured` | nessuno; il gateway ritenta |
| Corpo > 256 KB | 413 | nessuno, non ritentabile |
| Firma/timestamp non validi o fuori finestra | 401 `invalid_signature` | nessuno, non ritentabile |
| JSON non valido / id incoerenti / mode non valido | 400 `invalid_payload` | nessuno, non ritentabile |
| Versione sconosciuta | 422 | nessuno, non ritentabile |
| page/form fuori allowlist | 200 `{ignored:true}` | nessuno |
| **shadow** (mode `shadow`, **oppure** mode `live` ma ricevente con `META_INTERNAL_MODE` ≠ `live`) | **202** `{shadow:true}` | registra `event_id` in `MetaInboundEvent`; **nessun** lead, notifica, email, automazione |
| **live** (gateway `live` **e** ricevente `live`) | **200** `{ok:true,duplicate:false}` | crea/associa il lead (idempotente su `metaLeadgenId`), registra l'evento; richiede `lead` non null (altrimenti 400) |
| **duplicato** (`event_id` già registrato, lead già creato o registrato in shadow) | **200** `{ok:true,duplicate:true}` | nessun effetto |
| Errore temporaneo (DB, ecc.) | 503 | il gateway ritenta |
| Lead non ingeribile (es. senza telefono né email) | 422 | non ritentabile |
Il gateway considera **consegnato** ogni 2xx e il 409; ritenta 5xx, 408, 425, 429 (rispettando `Retry-After`); gli altri 4xx sono definitivi (dead-letter).
**Replay**: rilettura manuale via Graph di un leadgen_id reale già gestito altrove. Il gateway lo marca `REPLAY` e invia **sempre `mode: "shadow"`**, qualunque sia la configurazione del destinatario; se l'ID è già noto al gateway non reinvia nulla. Un replay non crea mai lead. Gli ID usati per i replay non devono più essere attesi come lead live.

## 9. Variabili d'ambiente (solo nomi)
**Gateway** (progetto Vercel `meta-leads`): `META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN, META_WEBHOOK_VERIFY_TOKEN, META_PAGE_ID, META_GRAPH_API_VERSION, META_ALLOWED_FORM_IDS, META_LOCAL_INGEST (=false), META_DOWNSTREAMS, META_DOWNSTREAM_<N>_URL, META_DOWNSTREAM_<N>_SECRET, META_DOWNSTREAM_<N>_MODE, DATABASE_URL, DIRECT_DATABASE_URL`; scheduler: `CRON_SECRET` (Vercel Cron) oppure `META_SCHEDULER_SECRET` + `QSTASH_CURRENT_SIGNING_KEY` + `QSTASH_NEXT_SIGNING_KEY` (QStash).
**CRM ricevente**: `META_INTERNAL_SECRET, META_INTERNAL_SECRET_NEXT` (solo durante la rotazione), `META_INTERNAL_MODE` (shadow|live), `META_PAGE_ID, META_ALLOWED_FORM_IDS`, opzionali `META_DEFAULT_BRAND, META_FORM_BRANDS`. **Non** servono `META_APP_SECRET` né `META_ACCESS_TOKEN`.
Ogni segreto ≥ 32 caratteri, **distinto per ciascun CRM**. Tutti inseriti a mano nelle variabili Vercel.

## 10. Rotazione separata dei segreti (senza fermo)
Per il CRM X (l'altro non viene toccato):
1. Generare il nuovo segreto (≥ 32 car. casuali) fuori chat.
2. **Ricevente X**: aggiungere `META_INTERNAL_SECRET_NEXT = nuovo`, redeploy. Ora accetta vecchio e nuovo.
3. **Gateway**: sostituire `META_DOWNSTREAM_<X>_SECRET` col nuovo, redeploy. Il gateway firma col nuovo; i tentativi in coda usano comunque firma ricalcolata.
4. Verificare: `/api/internal/status` senza errori 401 sul destinatario; una consegna di prova in shadow.
5. **Ricevente X**: `META_INTERNAL_SECRET = nuovo`, rimuovere `_NEXT`, redeploy. Il vecchio segreto è revocato.
Segreto compromesso: saltare il periodo di doppia accettazione (passi 2→5 ravvicinati) e rimettere in coda gli eventi falliti (§11). La rotazione dei segreti Meta è una procedura separata e non fa parte di questo contratto.

## 11. Rimessa in coda dei dead-letter
Dopo 15 tentativi (~38 h) o un 4xx definitivo, la consegna passa a FAILED non ritentabile. Procedura:
1. `GET /api/internal/status` (Bearer `CRON_SECRET`/`META_SCHEDULER_SECRET`): conteggi per stato e destinatario.
2. Rimuovere la causa (ricevente di nuovo raggiungibile, segreto corretto, versione compatibile).
3. `POST /api/internal/requeue` (stessa autenticazione), corpo `{}` per tutti i destinatari oppure `{"destinatario":"crm-a"}`. Azzera i tentativi, rimette `retriabile=true` e `nextRetryAt=ora`. Restituisce quante consegne e quante righe-destinatario sono state riaccodate.
4. Il tick successivo (entro 1–2 minuti) riconsegna con timestamp e firma nuovi; l'idempotenza su `event_id` impedisce lead doppi.
5. Verificare con `status` che non restino FAILED. Mai rimettere in coda prima di aver risolto la causa.
