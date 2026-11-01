@AGENTS.md

# CRM Gruppo P&C — guida per Claude Code

CRM gestionale di **Gruppo P&C** (Rosta, TO), titolare **Ugo Perottino**. Tutto in **italiano**: interfaccia, testi,
commenti nel codice, messaggi di commit. Ugo non è uno sviluppatore: spiegagli le cose in modo semplice, mostra il
risultato (screenshot) e non chiedergli dettagli tecnici che puoi verificare da solo.

Divisioni / brand: **P&C** (serramenti, pergole, vetrate, tende, zanzariere, blindati…), **Solaris** (fotovoltaico,
pompe di calore), **PTC** (climatizzazione), **Purafonte** (depurazione acqua), più **Plasma30** e **Work & Services**.

Produzione: https://crm-gruppo-pc.vercel.app · repo `perottino78/crm-gruppo-pc` · deploy automatico Vercel da `main`.

## Stack
- **Next.js 16** (App Router, Server Components + Server Actions) — vedi AGENTS.md: leggi la doc in `node_modules/next/dist/docs/` prima di usare API che non conosci.
- **Prisma + PostgreSQL (Neon)**. Lo schema è `prisma/schema.prisma`; **non ci sono migrazioni**: la build fa `prisma db push`.
- Tailwind; stile dei pulsanti "3D" in `src/app/globals.css` (`btn-3d btn-3d-green|blue|purple|amber|teal|dark|orange|pink|red|outline`, `tile-3d` per le tessere grandi, `card-fase` per i riquadri sezione).
- Login con sessione firmata (`src/lib/session.ts`, cookie `gpc_session`, payload `{ utenteId, exp }`); `src/middleware.ts` protegge tutto tranne `/login`, `/api`, `/simula`, `/richiedi`.
- Email: `nodemailer` via SMTP (`src/lib/mail/invio.ts`). Casella aziendale da Impostazioni › Email automatiche › Posta aziendale
  (chiavi `posta_*`, password cifrata) o, in mancanza, dalle variabili SMTP di Vercel. `mailConfigurata()` è **async**.

## Regole che NON vanno violate
1. **Mai `prisma db push --accept-data-loss` in produzione.** Le anteprime Vercel usano lo **stesso database di produzione**:
   se una modifica allo schema dà l'avviso di data loss (es. nuovo `@unique` su colonna esistente) la build si ferma. Cambia
   l'approccio (es. niente `@unique`, `findFirst`) invece di forzare. Prima di toccare lo schema prova il push su un DB copia
   con lo schema di `origin/main` e qualche riga dentro.
2. **Ora di Roma.** Il server gira in UTC. Per leggere date dai form usa `daOraRoma()`, per i valori dei campi
   `perInput()`, per mostrare le date sempre `toLocale…String("it-IT", { timeZone: "Europe/Rome", … })`.
   Helper in `src/lib/calendario/tempo.ts`.
3. **Offerta confermata = bloccata.** Dopo "Conferma ordine" (`Preventivo.confermatoIl`) righe, sconti, IVA, condizioni ed
   eliminazione vengono rifiutati (guard `offertaBloccata` in `src/app/actions.ts`); solo l'AMMINISTRATORE può sbloccare.
4. **Import senza doppioni**: riconosci per P.IVA o nome normalizzato, completa solo i campi vuoti, non sovrascrivere ciò che
   è stato scritto a mano (esempio: `src/lib/fornitori/bconsole.ts`).
5. **Le email non devono mai bloccare il lavoro**: `inviaMail()` non lancia errori, ritorna `{ inviata, motivo }`.
6. Visibilità dati per ruolo: `src/lib/scope.ts` (AMMINISTRATORE vede tutto). Ruoli: AMMINISTRATORE, AMMINISTRATIVO,
   COMMERCIALE, TELEFONISTA, TECNICO, POSATORE. Uffici (`Utente.ufficio`): COMMERCIALE, FATTURAZIONE, TECNICO, ORDINI,
   MAGAZZINO, POSA, AMMINISTRAZIONE.

## Mappa del codice
- `src/app/(app)/…` pagine: `clienti` (scheda cliente con barra sezioni e percorso pratiche), `preventivi` (offerte, stampa,
  pannello conferma ordine), `commesse` (pratica: flusso, rilievi, ordini, posa, documenti), `task`, `calendario`,
  `ordini-fornitori`, `magazzino` (bolle, consegne, giacenze, movimenti), `amministrazione` (banche, prima nota, scadenzario,
  costi/ricavi, fatture d'acquisto), `archivio`, `lavori`, `assistenza`, `prodotti` (listini, fornitori dei modelli),
  `commerciali`, `report`, `impostazioni` (anagrafica, flusso, lead), `profilo`. `(studio)` = Solaris Studio.
- Server Actions in `src/app/*-actions.ts` (`actions.ts` = preventivi/clienti, `commesse-actions.ts`, `flusso-actions.ts`,
  `calendario-actions.ts`, `magazzino-actions.ts`, `fatture-actions.ts`, `ordini-actions.ts`, …).
- Logica in `src/lib/…`; le parti "pure" (senza DB) hanno i test in `tests/<area>/*.test.ts`.
- Route admin `src/app/api/admin/*`: protette da header `x-seed-key` (env `SEED_SECRET`), usate per seed/backfill.

## Funzioni principali (stato attuale)
- **Flusso pratica fra uffici** (`src/lib/flusso.ts`, `FlussoFase` configurabile in Impostazioni › Flusso):
  Accettazione (Commerciale) → Fattura acconto (Fatturazione) → Rilievo misure (Tecnico) → Evasione ordini (Ordini) →
  Fattura saldo (Fatturazione) → Posa (Posa). "Fatto" su un task crea il task dell'ufficio successivo. Ogni fase può
  preparare/inviare un'email (`mailAttiva`, `mailAutomatica`) e avvisare l'ufficio (`avvisaUfficio`).
- **Conferma ordine dall'offerta** (`confermaOrdinePreventivo` in `commesse-actions.ts`): richiede contratto firmato in
  cartella "Contratto firmato" (offerta o commessa) o la spunta "firmato su carta"; blocca l'offerta, apre la commessa, chiude
  l'Accettazione e crea il task Fattura acconto con la nota del commerciale.
- **Documenti**: modello `Documento` con cartelle per entità (`CARTELLE` in `src/lib/ordini/calcoli.ts`).
- **Magazzino e fatture d'acquisto**: bolle in entrata, movimenti, FatturaPA XML (`src/lib/fatture/`), lettura AI di bolle e
  fatture (serve `ANTHROPIC_API_KEY`).
- **Calendario** (`src/lib/calendario/`): unisce Appuntamenti, Rilievi, Pose, Assistenze; viste giorno (colonne per persona),
  settimana, mese, agenda. Inviti `.ics` via email all'incaricato (e al cliente se richiesto), annullamento quando si sposta o
  cambia incaricato. Link calendario personale `GET /api/calendario/<token>` (token in `Utente.calendarioToken`).
- **Clienti e lead da BConsole** (rotta `api/admin/importa-clienti-bconsole`, logica `src/lib/clienti/bconsole.ts`): provenienza in
  `Cliente.origine`, stato lead in `Cliente.statoLead`, n. anagrafica in `Cliente.bconsoleId` (per agganciare offerte/ordini/fatture).
  Commerciale dalla sigla BConsole, se manca va a Ugo.
- **Filtri campagne** (pagina Clienti, `src/lib/clienti/provenienza.ts`): provenienza, stato lead, commerciale, periodo;
  esportazione `GET /api/clienti/esporta` (Excel `;` o `formato=facebook` per i pubblici personalizzati Meta). Ogni ingresso
  (form, lead convertito, landing `?utm_source=`, Meta, simulatore) passa da `provenienzaDaFonte()`.
- **Aumenti listini** (`/prodotti/aumenti`, `src/app/listini-actions.ts`, `src/lib/listini/aumenti.ts`, solo AMMINISTRATORE):
  percentuale del fornitore su griglie `Prodotto.prezzoBase`, optional a prezzo fisso del listino (`Optional.listino` = tipologia o
  `listinoDiTipologia`) e articoli del fornitore; storico in `AumentoListino` con i valori di prima → "Annulla".
  Attenzione: le rotte `seed-*` riscrivono i prezzi di griglia dai dati originali (cancellerebbero gli aumenti).
- **Lead da lavorare + email automatiche (ex Keap, Fase 1)** (`/lead`, `/impostazioni/automazioni`, `src/lib/automazioni/`):
  fasi `Lead.fase` NUOVO → IN_TARGET/FUORI_REGIONE → NON_RISPONDE/DA_RICHIAMARE/APPUNTAMENTO_*/NON_INTERESSATO; ogni esito
  (`registraEsito`) annulla gli invii futuri e avvia il percorso (`PERCORSI`); invii persistenti in `InvioProgrammato`, registro
  `EmailLead`, storico `LeadEvento`. Tempi Keap in `tempi.ts` (lun–sab 08:00, task alle 18:30, R/R+1/R+2). Esecuzione:
  `eseguiInviiScaduti()` dopo ogni esito, all'apertura del CRM (max 1/min), cron Vercel giornaliero e `GET /api/automazioni/esegui`.
  Accensione in Impostazioni (chiave `automazioni_lead_attive`, default pausa finché Keap è attivo). Testi in `email.ts`
  (dal dossier Keap `crm-interno/docs/automazioni/lead-generation`).
  Fase 2 (appuntamenti): esito CASA/SHOWROOM con venditore → conferme cliente+venditore, 4 lettere di vendita (`letteraDiVendita`,
  versioni P&C/Solaris/Purafonte, una al giorno lavorativo, mai nel giorno del promemoria), promemoria il giorno prima; senza
  venditore → percorso `ASSEGNA_VENDITORE_*` (avviso al centralino) e poi `assegnaVenditore`. `sincronizzaCalendario` crea il
  cliente e l'`Appuntamento` del venditore (spostato/annullato con il lead). Passi saltati decisi in `programmaDa` (stato SALTATO).
  Recupero (Recovery Keap, qui dopo N mesi, default 3): passo `RECUPERO` in coda a NON_INTERESSATO e ai percorsi che finiscono
  con il timeout "non gestito"; manda la promozione del momento (E-18, testo e "valida fino al" in Impostazioni, chiavi
  `recupero_*`; senza promozione valida riprova ogni 7 giorni) e rimette il lead in fase RECUPERO (E-19 ×3 al centralino).
  Massimo `MAX_RECUPERI` = 2. Da fare: Referee (decisione A-02 del dossier). Variabili facoltative: `RECENSIONI_URL` (default gruppopec.com/recensioni), `SITO_URL`. Conferma e promemoria al cliente
  riportano telefono ed email del consulente (`contattiConsulente`) per il sabato e gli orari di ufficio chiuso.
- **Campagne email** (`/campagne`, `src/app/campagne-actions.ts`, `src/lib/campagne/`, AMMINISTRATORE o ufficio MARKETING):
  filtri marchio, stato (`Cliente.statoLead`, anche "senza stato"), tipo (`categoria` Lead/Cliente/Account), provenienza,
  commerciale, provincia; `{nome}` nel testo; prova; invio a blocchi da 40 (`CampagnaInvio`, unico per campagna+cliente: niente
  doppioni) a ogni controllo (`eseguiCampagne` insieme a `eseguiInviiScaduti`); disiscrizione cliente `?c=` (`Cliente.disiscritto`).
  Avvisi di scadenza (`validaFino`) ai giorni di Impostazioni › Email automatiche (default 3,2,1, chiavi `campagne_promemoria_*`,
  una volta per giorno in `promemoriaInviati`), anche per la promozione del recupero. Funzionano anche con le automazioni in pausa.
- **Caselle email personali** (`src/lib/mail/caselle.ts`, `src/app/posta-actions.ts`, `src/components/CasellaEmail.tsx`): ogni utente
  nel Profilo (o l'amministratore in Impostazioni › Utenti) inserisce la password della sua email; server/porta vuoti = quelli
  aziendali. Password cifrata AES-GCM con `MAIL_SECRET` o `SESSION_SECRET` (se cambia, vanno reinserite). `inviaMail({ daUtenteId })`
  spedisce dalla sua casella; se non c'è o fallisce (errore salvato in `Utente.smtpErrore`) parte dall'aziendale con "rispondi a" lui.
  Usata per le email di fase della pratica (responsabile della commessa) e per l'invito dell'appuntamento al cliente (venditore).
  Connessione: `cercaImpostazioni` (invio.ts) + `src/lib/mail/diagnosi.ts` provano da sole il nome del server letto dal certificato
  (hosting condiviso), l'altra cifratura/porta (465 SSL, 587 STARTTLS) e, solo con la spunta "collega comunque", il certificato non
  riconosciuto (`posta_tls_libero`, `tls.rejectUnauthorized=false`, sempre cifrato); salvano ciò che funziona (`posta_sicura`).
  Gli errori mostrano il dettaglio tecnico e l'elenco delle prove.
- **Fornitore alternativo in ordine** (`spostaRigaAFornitore` in `ordini-actions.ts`): in un ordine in BOZZA ogni riga si può
  ordinare da un altro fornitore; va nella bozza già aperta per quel fornitore e commessa o in un nuovo ordine con gli stessi dati;
  prezzo/codice/costo previsto azzerati, sconto del nuovo fornitore; bozza rimasta vuota (senza documenti) eliminata. Il fornitore
  predefinito del prodotto non cambia. Ordini già inviati: rifiutato.
- **Gestione del team** (solo AMMINISTRATORE; `src/app/team-actions.ts`, `src/lib/utenti/stato.ts`, `components/team/GestioneUtente.tsx`,
  pagina Team › scheda persona): `Utente.stato` ATTIVO | PAUSA | DISATTIVATO (+ `statoDal`, `statoNota`). Chi non è attivo non entra
  (`login` rifiuta, `getCurrentUser` → null, layout → `/api/esci` che chiude la sessione) e non compare nelle tendine per lavoro nuovo
  (`soloAttivi(lista, giàAssegnato)`), né riceve lead (`telefonistaDefaultPerBrand`) o avvisi d'ufficio. Cambio mansione (ruolo+ufficio),
  email di lavoro modificabile con ruolo e ufficio (`cambiaMansioneUtente`, anche da Impostazioni › Utenti;
  email unica, se cambia la casella collegata alla vecchia email si scollega); "passa il lavoro" aperto a un collega attivo (clienti, offerte aperte, pratiche, lead aperti, appuntamenti/rilievi/pose futuri, task,
  assistenze), elimina solo senza dati collegati (`datiCollegati`). In Impostazioni › Utenti: elenco compatto (nome, ✉️ stato casella,
  stato, ruolo) che si apre sul nome; disattivati in una lista a parte in fondo con "Riattiva". Mai sé stessi, sempre almeno un amministratore attivo.
- **Pagamenti e incassi a mano** (`src/app/pagamenti-actions.ts`, `src/lib/amministrazione/pagamenti.ts`, `components/amministrazione/RegistraPagamento.tsx`,
  come in BConsole): su ogni scadenza (scadenzario, fattura d'acquisto, fattura di vendita) data, importo totale/parziale, banca, metodo
  (`METODI_PAGAMENTO`), commissione (movimento a parte, `commissioneDiId`) e, per gli incassi, ritenuta 11% dei bonifici per detrazione
  (`Scadenza.ritenuta`, conta come incassata in `residuoScadenza`). Sulle banche il movimento resta `daConfermare` finché l'estratto
  importato non lo ritrova (`confermePagamentiManuali`: stesso importo, ±7 giorni → prende l'impronta della banca, niente doppioni).
  `annullaPagamento` solo se non confermato e mese aperto.
- **Proforma fornitori** (`FatturaAcquisto.tipoDocumento = "PROFORMA"`): si registra e si paga come una fattura; la fattura definitiva si
  collega (`proformaId`, `collegaProforma`) e alla registrazione `trasferisciProforma` sposta i pagamenti, chiude le scadenze della proforma
  (stato `SOSTITUITA`) e toglie i suoi costi dalla commessa. Commessa cercata per nome cliente o numero (`C2026-012`).
- **Fatture di vendita** (`/amministrazione/fatture-vendita`, `FatturaVendita`, `src/lib/fatture/vendite.ts`, `src/app/vendite-actions.ts`):
  fatte da Giorgia in BConsole e caricate dagli XML (o a mano) fino all'emissione dal CRM con SDI (2027). Cliente per P.IVA/CF/nome,
  commessa aperta unica, detrazione dalla causale, sezionale dal numero; scadenze INCASSO (`origine FATTURA_VENDITA`, `fatturaVenditaId`)
  o aggancio all'acconto/saldo della commessa con lo stesso importo (±1 €). Gli XML emessi da noi sono rifiutati tra gli acquisti e viceversa.
  Arrivo automatico dal cassetto fiscale/SDI: non ancora (per ora carico manuale degli zip).
- **Contabilità da BConsole** (rotta `api/admin/importa-contabilita-bconsole`, logica `src/lib/amministrazione/bconsole.ts`): fatture di
  vendita e d'acquisto con lo stato di ogni rata (lette in sola lettura dalle liste JSON di BConsole, script in scratchpad
  `bc/estrai*.js` + `prepara-contabilita.py`). Rilanciabile: chiavi `BCV|id` / `BCA|id`, scadenze `BCV:<rata>` / `FA:<id>:bc<rata>`;
  ai rilanci aggiorna solo gli stati delle rate (`allineaScadenza`, mai sopra i pagamenti registrati nel CRM). Saldate →
  `pagatoManuale` con nota "Saldata in BConsole il …"; "Rit. Fis Compensazione" → `ritenuta`; Stornata → ANNULLATA; parziali → aperte
  con nota "verificare". Vendite agganciate all'acconto/saldo della commessa con lo stesso importo; fornitori per P.IVA/CF/nome
  (creati se mancano). Gli XML caricati dopo riconoscono le fatture già importate (fornitore/numero/anno/segno).
- **Report** (`/report`, solo amministrazione; `src/lib/report/`: `categorie.ts` linea di prodotto dal testo, `calcoli.ts` puro e testato,
  `server.ts` dati, `components/report/Grafici.tsx` e `Simulatore.tsx`): KPI, "in breve", vendite/acquisti per mese, fatturato e margine per
  venditore (`FatturaVendita.venditore` = sigla BConsole) e per linea di prodotto (`categoria`), commesse con più/meno margine (progetti
  BConsole in `ProgettoBC`, costi = `costoAttuale` o fatture d'acquisto con `progetto`; giudicate solo se fatturate ≥70% e, se aperte, con costi),
  clienti/marchi/provenienza, anzianità crediti e debiti, fornitori, costo delle banche (`bancaDi`), simulatore (prezzi, costi, volumi, incassi,
  cassa prevista 13 settimane). Dati: import contabilità (campi report riempiti solo se vuoti) + rotta `api/admin/importa-progetti-bconsole`.
  Grafici secondo la skill dataviz (palette fissa in `src/lib/report/formato.ts`, tooltip, tabella sotto ogni grafico).
- **Fornitori**: `Soggetto` con `ruoli: ["FORNITORE"]`; 55 importati da BConsole (rotta `api/admin/importa-fornitori-bconsole`).

## Comandi
```bash
npm install                     # genera anche il client Prisma
npx tsc --noEmit -p .           # controllo tipi
npx tsx --test tests/*/*.test.ts   # test unitari (oggi 195, tutti verdi)
npx next build                  # build (in locale senza db push)

# Collaudi end-to-end su Postgres LOCALE (svuotano le tabelle! mai sul DB di produzione)
DATABASE_URL=postgresql://t:t@localhost:5432/crmtest npx prisma db push --skip-generate
DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/<nome>.collaudo.ts
# <nome>: conferma (17), magazzino (33), ordini (43), articoli (48), calendario (16, con server SMTP finto), utenti (18), clienti (11), campagne (9), aumenti (15), fornitori-modelli (5), automazioni (23, SMTP finto e orologio simulato), appuntamenti (20), recupero (13), campagne-email (34), posta (17, tre server SMTP finti), fornitore-alternativo (15), team (26), fatture-incassi (32), posta-tls (13, server SMTP con certificati veri), contabilita-bconsole (19)
```
`tests/collaudo/registra.cjs` sostituisce sessione e cache di Next: l'utente simulato si imposta con `globalThis.__utente`.

## Prima di ogni pubblicazione
tipi ✓ · test unitari ✓ · collaudi toccati ✓ · `next build` ✓ · se cambia lo schema: push di prova da schema `origin/main` ✓
· controllo visivo della pagina (screenshot) ✓ · PR su `main`, attendere il check Vercel verde, poi merge.

## Variabili d'ambiente (Vercel)
`DATABASE_URL`, `SESSION_SECRET`, `SEED_SECRET`, `APP_URL` (default https://crm-gruppo-pc.vercel.app),
`ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`, `SMTP_HOST` (`mail.gruppopec.com`), `SMTP_PORT` (465), `SMTP_USER`, `SMTP_PASS`,
`MAIL_FROM`. La posta aziendale è su hosting proprio (nome.cognome@gruppopec.com), non Google Workspace.

## In sospeso (ottobre 2026)
- Collegare la posta aziendale in Impostazioni › Email automatiche (o variabili SMTP su Vercel; deve poter spedire come
  promozionale@ e marketing@gruppopec.com) e far collegare a ognuno la sua casella dal Profilo, poi
  spegnere in Keap i percorsi e accendere le email automatiche in Impostazioni › Email automatiche.
- Consigliato: un controllo esterno ogni 5-10 minuti su `GET /api/automazioni/esegui` (es. cron-job.org) per gli invii a orario.
- Inserire `ANTHROPIC_API_KEY` su Vercel (lettura AI di bolle e fatture).
- Consigliato: database di sviluppo separato (ramo Neon) per non far girare le anteprime sul DB di produzione.
- Documento "flusso pratica per ufficio": cosa fa ciascun ufficio e come usare il CRM.
- Rilievi/assistenze inseriti prima del 30/10/2026 possono risultare spostati di un'ora (vecchio errore di fuso orario).
- Fatturazione elettronica verso SDI: avvio previsto 1° gennaio 2027 (emissione fatture di vendita dal CRM).
- Collegamento automatico cassetto fiscale / SDI per le fatture dei fornitori: da scegliere l'intermediario (per ora zip caricati a mano).
- Foto guida ferro zincato da aggiungere: `public/immagini/tapparelle/guida-ferro-zincato.jpg`.
