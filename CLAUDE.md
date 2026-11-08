@AGENTS.md

# P&C ONE (CRM Gruppo P&C) — guida per Claude Code

**P&C ONE** («Tutto il Gruppo, in un clic.») è il CRM gestionale di **Gruppo P&C** (Rosta, TO), titolare **Ugo Perottino**. Tutto in **italiano**: interfaccia, testi,
commenti nel codice, messaggi di commit. Ugo non è uno sviluppatore: spiegagli le cose in modo semplice, mostra il
risultato (screenshot) e non chiedergli dettagli tecnici che puoi verificare da solo.

Divisioni / brand: **P&C** (serramenti, pergole, vetrate, tende, zanzariere, blindati…), **Solaris** (fotovoltaico,
pompe di calore), **PTC** (climatizzazione), **Purafonte** (depurazione acqua), più **Plasma30** e **Work & Services**.

Produzione: https://crm-gruppo-pc.vercel.app · repo `perottino78/crm-gruppo-pc` · deploy automatico Vercel da `main`.

Marchio: `src/lib/marchio.ts` (`NOME_APP`, `MOTTO`, colori). P&C ONE è solo il nome dell'app (titolo, accesso, menu, icona):
email e calendari restano "[CRM P&C]" / "CRM P&C — nome" (scelta di Ugo, non cambiarli).
logo `src/components/LogoOne.tsx` (simbolo di accensione = "1"), icone `src/app/icon.svg|icon.png|apple-icon.png` e `public/icone/`,
`src/app/manifest.ts` (app installabile dal telefono). Nei testi sempre "P&C ONE", mai "PEC ONE". Icone e manifest sono esclusi dal
login nel `matcher` del middleware.

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
6. Permessi e visibilità dati: `src/lib/permessi/catalogo.ts` (`puo(u, "sezione")`, `visibilitaDi`) e `src/lib/scope.ts`
   (PROPRI | ZONA | TUTTI). Non scrivere controlli `ruolo === …` nuovi: aggiungi la voce al catalogo (`AREE`) e usa `puo`.
   Ruoli: AMMINISTRATORE (sempre tutto), AMMINISTRATIVO, COMMERCIALE, TELEFONISTA, MARKETING, TECNICO, POSATORE. Uffici (`Utente.ufficio`): COMMERCIALE, FATTURAZIONE, TECNICO, ORDINI,
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
  cambia incaricato. Link calendario personale `GET /api/calendario/<token>` (token in `Utente.calendarioToken`); chi vede tutti
  (`vedeTutti`: non commerciali/posatori) aggiunge anche `?persona=<id>` (un collega, calendario a parte su Google) e `?team=1`
  (tutto il team, titolo con il nome). Pagina «Su Google / telefono»: pulsanti Google/iPhone/Outlook, calendari dei colleghi e, per
  l'amministratore, `inviaLinkCalendarioATutti` (crea i link mancanti e manda a ognuno la sua email con le istruzioni).
- **Telefono**: menu laterale a scomparsa (☰, `Sidebar.tsx`), `main` con margini stretti; nel calendario settimana e giorno diventano
  `ListaGiorni` sotto `md`, il mese mostra pallini colorati. Controllo: nessuna pagina più larga dello schermo (iPhone 13, 390 px).
- **Clienti e lead da BConsole** (rotta `api/admin/importa-clienti-bconsole`, logica `src/lib/clienti/bconsole.ts`): provenienza in
  `Cliente.origine`, stato lead in `Cliente.statoLead`, n. anagrafica in `Cliente.bconsoleId` (per agganciare offerte/ordini/fatture).
  Commerciale dalla sigla BConsole, se manca va a Ugo.
- **Filtri campagne** (pagina Clienti, `src/lib/clienti/provenienza.ts`): provenienza, stato lead, commerciale, periodo;
  esportazione `GET /api/clienti/esporta` (Excel `;` o `formato=facebook` per i pubblici personalizzati Meta). Ogni ingresso
  (form, lead convertito, landing `?utm_source=`, Meta, simulatore) passa da `provenienzaDaFonte()`.
- **Aumenti listini** (`/prodotti/aumenti`, `src/app/listini-actions.ts`, `src/lib/listini/aumenti.ts`, solo AMMINISTRATORE):
  percentuale del fornitore (aumenti fino al +100%, ribassi fino al -50%) su griglie `Prodotto.prezzoBase`, optional a prezzo fisso del listino (`Optional.listino` = tipologia o
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
  Preheader (`Campagna.preheader`), formato TESTO (grafica P&C) o HTML (template incollato o file .html caricato, `{disiscrizione}` o piede
  aggiunto da `htmlCampagna`, testo semplice da `testoDaHtml`), anteprima in iframe. Tracciamento (`src/lib/mail/tracciamento.ts`, rotta
  `GET /api/traccia/<c|l>-<id>.<firma>`): pixel per le aperture e link riscritti per i clic (`apertaIl/aperture/clicIl/clic` su
  `CampagnaInvio` ed `EmailLead`; il clic conta anche come apertura; codice firmato HMAC, niente redirect con codice falso); spegnibile per
  campagna (`tracciamento`). Le email automatiche al cliente sono tracciate e hanno il preheader personalizzabile (Marketing › Testi).
  Rimbalzi (`src/lib/mail/rimbalzi.ts` puro, `rimbalzi-server.ts`): ogni email parte con `X-CRM-Invio: c-<invio>|l-<emailLead>` e busta
  `envelope.from` = casella aziendale; `controllaRimbalzi` (in `eseguiCampagne`, max ogni 10 min, o «Controlla ora» in Email automatiche)
  legge la casella via IMAP (`imapflow`, stesso server/password, porta 993, `IMAP_HOST`/`IMAP_PORT` facoltative) dall'ultimo UID
  (`rimbalzi_ultimo_uid`), riconosce i «mancato recapito» (RFC 3464 o a parole), segna l'invio RIMBALZATA con il motivo e, se permanente,
  `Cliente/Lead.emailRimbalzata`: niente più email finché l'indirizzo della scheda resta quello (`rimbalzato()`). Collaudi con casella simulata
  (`globalThis.__casellaFinta`): il protocollo IMAP vero è da verificare in produzione.
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
- **Marketing** (ruolo `MARKETING` o ufficio MARKETING; `puoMarketing`/`eMarketing` in `src/lib/utenti/stato.ts`): pagina `/marketing`
  (numeri dei lead, percorso a tappe come la tela di Keap con le email di ogni tappa, fonti, campagne, strumenti) e `/marketing/email`
  (testi di tutte le email automatiche modificabili con segnaposto `{nome}`, `{data_appuntamento}`…, anteprima mentre si scrive, ritorno allo
  standard; `src/lib/automazioni/personalizza.ts`, chiavi `email_testo:<modello>[:<variante>]`, applicati in `eseguiInviiScaduti`).
  Il marketing vede tutti i clienti e lead (scope), gestisce email automatiche (non la posta aziendale), promozione del recupero, avvisi,
  campagne, lead da pubblicità (`/impostazioni/lead`), articoli/listini e aumenti, e crea utenti non amministrativi (`RUOLI_CREABILI_MARKETING`).
- **Ruoli e permessi** (come i Gruppi di BConsole; `/impostazioni/ruoli`, `/impostazioni/zone`, `src/app/permessi-actions.ts`,
  `src/lib/permessi/`, solo AMMINISTRATORE): `ProfiloAccesso` (permessi a spunta per sezione + visibilità PROPRI/ZONA/TUTTI), copiati
  sull'utente (`Utente.profiloId/permessi/visibilita`); senza profilo valgono `permessiPredefiniti(ruolo)` = comportamento di prima.
  Il layout blocca le pagine non spuntate (`permessoPagina`, header `x-percorso` dal middleware), la Sidebar mostra solo le sezioni
  permesse. `ZonaCommerciale` (regioni + province extra, responsabile; tabella `src/lib/zone/regioni.ts`): `ricalcolaVisibilita` scrive
  `Utente.visibileProvince/visibileUtenti` per chi vede «La sua zona». `Utente.responsabileUfficio` (es. Rocco per il Marketing).
  Profili e zone di partenza creati da `assicuraIniziali` alla prima apertura. Il team di una zona si spunta nel riquadro della zona
  (`membri` + `conTeam` in `salvaZona`); dopo il salvataggio la riga/zona mostra «✓ Salvato» (`?salvato=<id>`).
- **Invia offerta e firme email** (`src/app/offerte-email-actions.ts`, `src/lib/mail/firma.ts` puro, `src/lib/mail/link-offerta.ts`,
  pagina `/preventivi/[id]/invia` con `EditorInvioOfferta`): pulsante «✉️ Invia offerta» nella scheda dell'offerta → editor con A/Cc/oggetto/testo,
  firma di chi manda, pulsante «Vedi e scarica l'offerta» (link firmato `/offerta/<id>.<firma>`, pubblico, stessa vista della stampa
  `components/preventivi/StampaOfferta.tsx`; aperture del cliente in `Preventivo.vistoIl/visite`) e allegati (documenti dell'offerta/cliente o
  file dal computer, salvati in «Corrispondenza»). Parte dalla casella di chi manda (`inviaMail` con `cc` e `allegati`); storico `EmailOfferta`,
  `Preventivo.inviatoIl/inviatoA`; email mancante del cliente salvata nella scheda. Firme: `Utente.firmaEmail` (righe di testo o HTML incollato;
  vuota = `firmaPredefinita` dai dati della scheda), dal Profilo o per tutti in Impostazioni › Firme email (`/impostazioni/firme`, permesso
  `firme` o marketing). BConsole: firma per utente nella scheda agente (campo «Firma»).
- **Contratti e provvigioni** (`/contratti`, `src/lib/provvigioni/calcoli.ts` puro e testato, `server.ts`, `src/app/provvigioni-actions.ts`):
  area del commerciale con i suoi contratti = commesse del CRM (commerciale dell'offerta) + storico BConsole (fatture con la sua sigla
  `SIGLE_COMMERCIALI`, raggruppate per progetto `ProgettoBC`; chiave contratto `C:<commessa>` | `BC:<progetto>` | `FV:<fattura>`), pagamenti del
  cliente dalle scadenze INCASSO (commessa o fatture; senza scadenze, acconto/saldo segnati nella commessa), ricerca libera (tutte le parole,
  senza accenti) e filtri. Provvigioni (`Provvigione` + `LiquidazioneProvvigione`): le inserisce la fatturazione «al controllo del contratto»
  (% sull'imponibile, `Utente.provvigionePercentuale` = abituale proposta), maturano in proporzione a quanto ha pagato il cliente, si liquidano
  anche in più volte. Chi gestisce: permesso `provvigioni` (AMMINISTRATIVO, uffici FATTURAZIONE/AMMINISTRAZIONE) o `amministrazione`; gli altri
  vedono solo i propri (il responsabile di zona anche i venditori della zona; il marketing NO, anche se vede tutti i clienti).
- **Comunicazioni interne** (`/comunicazioni`, `src/app/comunicazioni-actions.ts`, `src/lib/comunicazioni/testo.ts` puro e testato,
  `password.ts`, `components/comunicazioni/EditorComunicazione.tsx`): l'amministratore e il marketing (permesso `comunicazioni` o `marketing`)
  scrivono al team scegliendo le persone (gruppi: commerciali, telefoniste, uffici, tecnici, marketing), con segnaposto `{nome}` `{username}`
  `{password}` `{link}`…, modello pronto «Invito a scaricare P&C ONE», prova a sé stessi, e facoltativo un task per ognuno (`Comunicazione` +
  `ComunicazioneDestinatario`: inviata/letta/fatto). Password provvisoria nuova (`{password}`) solo per l'amministratore: cambiata solo se l'email
  parte, mai quella di chi manda, mai salvata nello storico, `mustChangePassword`. Le ricevute (e i task) le vede ognuno in «💬 Comunicazioni» e sulla Dashboard.
- **Storico BConsole nella scheda cliente** (sezione «Storico BConsole», `src/lib/clienti/storico-bconsole.ts`): fatture di vendita importate
  (per `clienteId`, codice fiscale/P.IVA o nome anche rovesciato «COGNOME NOME», `variantiNome`) con pagato/da incassare dalle scadenze, e progetti
  `ProgettoBC`; in sola lettura. Offerte e ordini clienti BConsole del 2026 in `DocumentoBC` (id `OFF|<id>`/`ORD|<id>`, righe in JSON,
  offerta di partenza e progetto), agganciati al cliente con `indiceClienti` (n. anagrafica, email, telefono, nome in qualsiasi ordine); import
  rilanciabile da rotta `api/admin/importa-documenti-bconsole` (dati da `bc/estrai-off.js` + `bc/prepara-documenti.py` in scratchpad).
- **Trafila task dagli incassi** (`avanzaDopoIncasso` / `praticaDiIncasso` in `src/app/flusso-actions.ts`): ogni incasso su una pratica
  (`registraPagamento`, abbinamento di un movimento di banca, «acconto incassato» in commessa; anche su fatture di vendita agganciate alla
  commessa) segna l'acconto incassato e chiude da solo il task aperto «Fattura acconto» (poi «Fattura saldo» quando è pagato tutto):
  `completa()` crea il task dell'ufficio successivo. Collaudo `trafila-incassi`.
- **Presa in carico dei lavori BConsole** (`prendiInCaricoOrdineBC` in `commesse-actions.ts`, pulsante nello «Storico BConsole» degli ordini,
  solo amministrazione/fatturazione): dall'ordine `DocumentoBC` nascono offerta confermata (righe in testo libero) e commessa
  (`Commessa.ordineBC`, `DocumentoBC.commessaId`), si agganciano le fatture BConsole dello stesso progetto e parte il task della fase scelta.
  Le commesse con `ordineBC` non hanno rate acconto/saldo automatiche (`sincronizzaScadenzeCommesse` le salta): gli incassi sono quelli delle fatture.
- **File e pagamenti delle fatture d'acquisto BConsole** (`src/lib/amministrazione/file-acquisti-bconsole.ts`, rotta
  `api/admin/importa-file-acquisti-bconsole`, dati da `bc/estrai-ffo.js` + `bc/prepara-file-acquisti.py`): XML della fattura elettronica, PDF
  allegati in BConsole e PDF dentro l'XML come `Documento` (cartella «Fattura»), e per ogni rata `Scadenza.pagataIl/metodoPagamento/bancaPagamento`
  (solo se vuoti). Nella fattura: pulsanti «Apri il PDF» / «Fattura elettronica (XML)» in alto e «✓ Pagata il … · metodo · banca» nel Pagamento.
- **Foto di rilievi e pose**: salvate come data URI (`RilievoAllegato`, `PosaFoto`) ma servite da `GET /api/foto/<rilievo|posa>/<id>` (solo utenti
  collegati): la pagina della commessa NON deve mai includere i data URI (con poche foto superava il limite di Vercel e non si apriva).
  `FotoRilievo` riduce a 1280 px JPEG 0,7 e tiene ogni invio sotto ~3,4 MB (limite richieste Vercel 4,5 MB).
- **Area telefoniste** (richieste di Cristina e Rocco, nov 2026): `/lead` = «Task di oggi» compatto (da fare entro oggi + scaduti, «In programma»
  e «✓ Lavorati oggi» a scomparsa, ricerca e Chiusi/Tutti); ogni riga apre `/lead/[id]` (attività dedicata: contatto, provenienza, risposte del modulo
  a elenco `components/lead/RisposteModulo.tsx` + `src/lib/automazioni/note-lead.ts` puro, esito con `EsitoLead` che mostra solo i campi utili, ultima/prossima
  attività con `spostaProssimaAttivita`, `riassegnaLead`, cronologia con `aggiungiNotaLead`). `/lead?id=` reindirizza. Dopo l'esito si torna a `/lead?fatto=`.
  Lead nuovi: telefonista del marchio da Impostazioni › Lead (anche marketing), altrimenti la prima TELEFONISTA in ordine alfabetico; `passaLeadAperti`
  sposta in blocco. Password di default: `login` segna `mustChangePassword` (lista `PASSWORD_DEBOLI`), finestra bloccante `CambioPasswordObbligatorio`;
  rotta una tantum `api/admin/segna-password-deboli`. `InvioInCorso` (layout): barra blu e pulsante spento dopo ogni invio/clic. Classe `btn-indietro`
  per i link «← …». Calendario: annullati nascosti (`?annullati=1` per vederli). Clienti: pagine `?pc=`/`?pl=`. Collaudo `telefoniste` (20).
- **Moduli istantanei di Meta** (Impostazioni › Lead, sezione `#meta`, `components/lead/ModuliMeta.tsx`, `src/app/meta-actions.ts`, permesso
  `pubblicita`): Meta → gateway (progetto Vercel `gpc-meta-gateway`, cartella `gateway/`, ha le chiavi Meta) → ONE `/api/lead/meta/internal`
  (`META_INTERNAL_MODE=live`). Moduli collegati dal CRM in `Configurazione.meta_moduli` (con marchio), uniti a `META_ALLOWED_FORM_IDS`
  (`unisciModuli`, `src/lib/meta/moduli.ts` puro + `moduli-server.ts`). Il gateway chiede a ONE i moduli collegati (`POST /api/lead/meta/moduli`,
  firmato con il segreto del destinatario ONE = `META_INTERNAL_SECRET`, memoria 60 s; se ONE non risponde accetta e ONE ricontrolla) e ogni
  5 minuti (tick) porta l'elenco dei moduli letti da Meta (`fetchPageForms`) e il proprio indirizzo (`meta_catalogo`, `meta_gateway_url`).
  ONE chiede al gateway `POST /api/internal/one` (`catalogo` | `lead` di un modulo per N giorni → `importaLeadDaGraph`, senza doppioni).
  Lead di moduli non collegati: annotati in `meta_scartati`. Pagine: quelle delle variabili di ONE (`META_PAGE_ID`/`META_EXTRA_PAGE_IDS`) arrivano al gateway con la risposta di `/moduli` (non serve toccare il gateway); `azione: "pagine"` controlla in sola lettura se la pagina è iscritta ai lead dell'app. Rotta tecnica `api/admin/meta-moduli` (GET conteggi, POST collega/recupera).
  Chiavi delle pagine (il `META_ACCESS_TOKEN` del gateway è la chiave della sola pagina Gruppo P&C, app «CRM Interno P&C» 1842181417134760): «🔑 Chiave di Meta»
  in `#meta` → gateway `azione: "chiave"` (`chiaviPagineDa`: scambio fb_exchange_token con l'App Secret, poi chiavi di pagina senza scadenza da `/me/accounts`, Business Manager `owned_pages`/`client_pages` e pagine già note; se nessuna, `permessi_mancanti:` da `/me/permissions`)
  → salvate cifrate (`cifra` di `mail/caselle.ts`) in `Configurazione.meta_pagine` con il marchio; `/moduli` le passa al gateway (`token`), che le usa
  per lead, moduli e iscrizione (`deps.tokenPagina`). «📡 Attiva l'arrivo dei lead» = `azione: "iscrivi"` (`POST /{page}/subscribed_apps`).
  Diagnostica: `GET /api/admin/stato-meta` (x-seed-key, niente dati personali). Test `tests/meta/moduli.test.ts`, collaudo `moduli-meta` (28).
- **Dopo l'appuntamento** (`/calendario/appuntamento/[id]`): riquadro «ℹ️ Da sapere prima di andare» (risposte del modulo e note del centralino,
  sola lettura) e tre strade per chi è andato: ✅ Svolto (`esitoAppuntamento`), 📞 Da rifissare dal centralino (`rifissaDalCentralino`: appuntamento
  ANNULLATO con il motivo, lead → APPUNTAMENTO_ANNULLATO con `registraEsito` se possibile, `scadenzaAzione` = giorno scelto; senza lead se ne crea
  uno per la telefonista del marchio, collegato a `Cliente.leadOrigineId`), ↪ Lo rifisso io (`spostaAppuntamentoA`). Il modulo «Nuovo appuntamento»
  si apre solo con `?nuovo=` (clic sull'agenda o pulsante), nella scheda cliente con `?fissa=1`; `?cliente=` resta nei link del calendario.
  La modifica completa (tipo, incaricato, luogo, note) si apre solo dal pulsante «Modifica» (`?modifica=1`); «Lo rifisso io» ha la spunta «manda la conferma anche al cliente». Collaudo `dopo-appuntamento` (13).
- **Porte interne Isomax**: listino a prezzo fisso 80×210 (`ISOMAX_<modello>_<apertura>`, gruppi A/B/L); nell'offerta si sceglie la luce netta
  (`luceNetta`: 70/80 standard, 60/90 → `aggiungiRigaPreventivo` aggiunge da sola la «Riduzione a 60» / «Allargamento a 90» del listino e scrive la misura
  sulla riga). Mancano a listino maniglie, cerniere a scomparsa e vetri (serve il listino Isomax). Collaudo `isomax-luce` (5).
- **Porte raso muro** (MYA porte, KIUSO chiusure, STRIP battiscopa; gruppo PORTE INTERNE, sottogruppi «Raso muro — …»): listino già di vendita in
  `src/lib/listini/rasomuro.ts` (puro, test `tests/listini/rasomuro.test.ts`), caricato dalla rotta `api/admin/seed-rasomuro` (GET prova, POST carica,
  rilanciabile). Tipologie `RASOMURO_<MYA|KIUSO>_<apertura>[2A]_<riga misura>` (2 ante = prezzi × 2), varianti = telai, finiture/su misura come optional
  con `listino` = tipologia, accessori per listino `RASOMURO_MYA|_BPB|_SC|_BATT|_LAV|_TRASP` (`listiniRasomuro`). Nell'offerta si sceglie L e H di listino
  (`rmL`/`rmH`, scritte sulla riga) e c'è una tendina per gruppo di voci + link ai cataloghi (`public/cataloghi/rasomuro/`, foto in `public/immagini/rasomuro/`).
  `seed-isomax` non tocca le voci RASOMURO. Refusi del PDF corretti: telaio muratura SCI H210 «110» → 1.110, RAL bilico bidirezionale H245 «725» → 1.349. Collaudo `rasomuro` (11).
- **Serramenti Fidra** (alluminio con cuore PVC, gruppo SERRAMENTI, sottogruppo «Alluminio — Fidra»; ha sostituito il segnaposto
  `SERRAMENTI_PVCALLUMINIO_FIDRA_PLACEHOLDER`): 12 tipologie `FIDRA_<F1A|F2A|F3A|FF|W|PF1A|PF2A|PF3A>[_SOGLIA]|FIDRA_TRASLANTE`, griglie L×H in mm già
  al cliente finale (×2,2 del fornitore) in `prisma/seed-data/fidra_prodotti.json` (estratte dal file Excel UKW 1.3 con `python3 -I scripts/listini/estrai_fidra.py <file.xlsx> prisma/seed-data/fidra_prodotti.json`:
  «*» = primo prezzo disponibile, «-» = non eseguibile). Optional in `src/lib/listini/fidra.ts` (listini `FIDRA` comune, `FIDRA_F` finestre, `FIDRA_PF`
  portefinestre, `FIDRA_WAS` wasistas; `listiniFidra`): colori standard compresi, fuori standard +30%, due lati diversi +100%, vetro STC, satinato
  90 €/anta finestre e 150 €/anta portefinestre (su tutte le tipologie), maniglia passante 500 € su tutte, motoriduttore, traversi, pannello fisso, fuori misura, sagomati +40%, minimo
  di produzione, autoscala, ENEA, smaltimento. Rotta `api/admin/seed-fidra` (GET prova, POST carica). Disegni in `public/immagini/fidra/`, brochure e
  dispositivi Matter in `public/cataloghi/fidra/`. Nell'offerta stesso riquadro a tendine del raso muro. Test `tests/listini/fidra.test.ts`, collaudo `fidra` (8).
- **Porte a vetro per vetrate** (OUTDOOR › VETRATE › «Porte a vetro», gruppo modello `VETRATE PORTE` in `GRUPPI_VETRATE`): `PORTAVETRO_PAL` (vetro e
  alluminio, varianti telaio 3/4 lati) e `PORTAVETRO_PTV` (tutto vetro), prezzo fisso = listino fornitore +60% (`src/lib/listini/porte-vetro.ts`, test
  `tests/listini/porte-vetro.test.ts`); optional: apertura, maniglione antipanico (solo PAL), colore RAL di serie, altezza oltre 2500 +5%. Rotta
  `api/admin/seed-porte-vetro` (GET prova, POST carica). Finiture vetro (pag. 19 del listino fornitore) non ancora a listino. Collaudo `porte-vetro` (6).
- **Pergola Tempra** (= sistema STABYLA, copertura a pannelli termici coibentati; OUTDOOR › PERGOLE › «Tempra (pannelli coibentati)»): 8 tipologie
  `STABYLA_<A701|A703|A705|A707>_<AD|AU>` (base/245/Maxy/Maxy 260 × addossata/autoportante), griglie larghezza × sporgenza in mm = listino fornitore +60%
  in `prisma/seed-data/tempra_prodotti.json` (dal PDF con `pdftotext -layout` + `scripts/listini/estrai_tempra.py`, campo `listino` = prezzo fornitore).
  `src/lib/listini/tempra.ts`: tendine modello → installazione (via `assiSelezioneIsomax`), descrizioni, optional `TEMPRA` (pannello acustico +3%, strip LED
  5/4 m, profili spot RGB 4/5 m, centralina). Rotta `api/admin/seed-tempra` (GET prova, POST carica). Foto in `public/immagini/tempra/`.
  Possibile refuso del PDF lasciato com'è: A703 autoportante 3780×3000 = 8.886.
  Nel riquadro a tendine (raso muro/Fidra/porte a vetro/Tempra/pedane/galleggianti) tutte le voci «(Work&Service)» stanno in un'unica tendina «Posa e servizi» con `optgroup` per tipo. Test `tests/listini/tempra.test.ts`, collaudo `tempra` (6).
- **Pedane autoportanti per dehors** (OUTDOOR › PAVIMENTI › «Pedane autoportanti (bar e ristoranti)»): `PEDANA_BETULLA|GRES|WPC|IPE`, griglia A × B
  in cm (200–600 × 200–1100) = listino fornitore × 2 (per ora, `RICARICO_PEDANE`). Il listino fornitore è a m²: 320 €/m² betulla/gres, 450 €/m² WPC/Ipè
  arrotondato ai 10 € (`listinoPedana`, verificato sulle tabelle di pag. 319). `src/lib/listini/pedane.ts`, rotta `api/admin/seed-pedane` (GET prova,
  POST carica), foto in `public/immagini/pedane/`. Cementine a preventivo. Test `tests/listini/pedane.test.ts`, collaudo `pedane` (5).
- **Pavimenti galleggianti** (OUTDOOR › PAVIMENTI › «Pavimenti galleggianti»; ha sostituito il segnaposto `PAVGALLEGGIANTI_PLACEHOLDER`): piastrelle
  CERAMICA LA FAENZA 2025 da esterno 2 cm antiscivolo (codici «AS», ≥40 kg/m²) estratte dal listino con `scripts/listini/estrai_pavgal.py` in
  `prisma/seed-data/pavgal_articoli.json` (prezzo = «1^ Sc.», già al cliente). Tipologie `PAVGAL_<codice collezione>_<formato>` (13: Party=ALGAR, Blanco, Cocoon=FVNT,
  Dama, Gea, Couture=LOIRA, Maxxi, Vis, Yakisugi=YKSG in 60×60/90×90/30×120), varianti = colori al m² (quantità = m²) con il nome del colore
  (`COLORI`/`nomeColore`, presi dal sito lafaenzaceramica.com; Yakisugi «TN» da confermare) e foto di ambientazione per collezione dal sito. Optional (`listiniPavgal`): pezzi speciali
  della collezione (`PAVGAL_<coll>`: square border, gradone, bordo/griglia piscina, al pezzo), piedini al m² del formato (`PAVGAL_F<formato>`, 4 per
  piastrella, 4 € il 60×60, 6 € i formati lunghi), comuni `PAVGAL` (piedino singolo, angolari 15 €/ml, posa 50 €/m², trasferta 150, autoscala 250/500).
  Optional con `gruppiApplicabili` vuoto e `seed-wpc` li esclude (cancellava tutti gli optional PAVIMENTI non suoi). Rotta `api/admin/seed-pavimenti-galleggianti`.
  Attenzione: in Prisma `startsWith: "X_"` diventa LIKE e «_» vale qualsiasi carattere → ricontrollare il prefisso in JS. Host del sito La Faenza aggiunti alla rete dell'ambiente.
  Test `tests/listini/pavimenti-galleggianti.test.ts`, collaudo `pavimenti-galleggianti` (7).
- **Lattoneria in alluminio a peso** (OUTDOOR › LATTONERIA, 11 famiglie = sottogruppi `FAMIGLIE_LATTONERIA` da `famigliaDi(codice)`: angolari, profili
  U/Z/piatti/lamiere, scossaline, copertine, fasce e carter, gronde, pluviali, curve e terminali, tappi e testate, angoli/giunti/bocchettoni, staffe e collari):
  61 articoli pressopiegati `LATT_<codice>` in `src/lib/listini/lattoneria.ts` (puro), varianti = 12 colori (nome «Bianco — al metro»: niente €/kg, li vede il cliente).
  Costo IL MASTRO srls a peso (`costoLatt`: kg × €/kg ai 5 cent, standard 14, RAL 16, bronzo 18, RAL fuori standard 18 «da confermare», tinta legno a preventivo;
  peso = sviluppo × spessore × 2,7, i pezzi con lunghezza equivalente). Vendita = costo × `RICARICO_LATTONERIA` (2, scelta di Ugo). Il costo resta solo per il
  guadagno: il modello ha fornitore Il Mastro (Soggetto creato se manca, per nome), `codiceFornitore` e `scontoAcquisto` 50% → `costoPrevisto` negli ordini
  = prezzo del fornitore (campi riempiti solo se vuoti). Al metro: nell'offerta si scrive la lunghezza del pezzo in cm (`lattCm` → prezzo al metro × lunghezza,
  `misuraLarghezza` senza altezza); curve/tappi/staffe al pezzo. Rotta `api/admin/seed-lattoneria` (GET prova, POST carica). Test `tests/listini/lattoneria.test.ts`,
  collaudo `lattoneria` (12).
- **Rilievo, complementi e costi dalla conferma del fornitore** (richiesta di Ugo, nov 2026, come «carica rilievo» di BConsole): nel rilievo si caricano
  anche PDF (`FotoRilievo pdf`, salvati in `RilievoAllegato` come data URI, max ~2,5 MB l'uno; nella pratica il riquadro 📄 si riconosce dal nome `.pdf`).
  «🧩 Complementi trovati al rilievo» (`components/commesse/AggiungiComplemento.tsx`, ricerca `GET /api/complementi?q=` su articoli e modelli di listino
  con colori, `aggiungiComplemento`/`eliminaComplemento` in `commesse-actions.ts`): righe d'ordine `RigaOrdine.complemento` senza riga di preventivo
  (solo acquisto, la vendita non cambia), da articolo (costo anagrafica), da listino (colore + misura → `trovaFasciaPrezzo`, costo come `datiAcquisto`) o testo libero.
  Conferma del fornitore: `OrdineFornitore.totaleConfermato` (+ `totaleConfermatoIl/DaNome`, in `registraConfermaFornitore`) = costo della commessa per
  quell'ordine al posto delle sue righe, finché non c'è una fattura registrata (riga d'ordine in fattura o fattura dello stesso fornitore sulla commessa):
  regola pura `vociMateriale` (`src/lib/ordini/costi-materiale.ts`, test) + `costiMaterialeCommesse` (`lib/ordini/server.ts`), usata da scheda costi e report
  (`costiCommesse`). Il «modo rapido» (ACQUISTO_MATERIALE) continua a escludere righe e conferme. Collaudo `rilievo-complementi` (21).
  Dal rilievo all'ordine come in BConsole (ordine cliente → righe spuntate → «Crea ordine fornitore» → «Invia ordine»): nel rilievo il riquadro
  «📦 Materiale della pratica» (`#materiale-pratica`) mostra le righe dell'offerta (portate dentro da sole da `assicuraRigheOfferta` quando si carica il
  rilievo o un complemento) più i complementi, con le spunte; `creaOrdineDaRighe` (ordini-actions, permesso ordini) crea la bozza al fornitore
  delle righe spuntate (un solo fornitore, o quello scelto nella tendina) e apre l'ordine su `#invia`. Invio (`inviaOrdineEmail` con `senzaPrezzi`/
  `conRilievo`): parte con `inviaMail` da `EMAIL_ORDINI` (default ordini@gruppopec.com, dalla casella dell'utente con quell'email se collegata,
  altrimenti aziendale con `da`), rispondi-a ordini@, PDF senza prezzi (`senzaPrezzi`, anche `?prezzi=0` nella rotta del PDF) e file del rilievo
  (`fileRilievo`); servizio API Resend/Brevo solo di riserva. Collaudo `ordine-da-rilievo` (29, SMTP finto).
  Dopo la prova di Ugo (pratica Armentano): il rilievo è un modulo unico `components/commesse/CaricaRilievo.tsx` (misure, PDF/foto, «già nella pratica»
  = righe d'ordine o, prima del rilievo, righe dell'offerta, e «da aggiungere» con `ScegliMateriale.tsx`, lista solo nel browser) con un solo «💾 Salva»:
  `caricaRilievo` riceve `complementi` (JSON) e li crea con `creaComplemento` (errori in `?avvisoRilievo=`, conferma in `?fatto=`). Il materiale con le spunte
  sta nella sezione «4 · Evasione ordini» (`#evasione`, `#materiale-pratica`); `TaskCard` porta i task RILIEVO a `#rilievo` e ORDINI a `#evasione`. Nell'invio
  si scelgono i file del rilievo da allegare (`fileRilievo: id[]`, di partenza i PDF). Offerta sbloccata con la commessa già aperta: pannello arancione
  «💾 Salva la variante» (`salvaVariante`, solo amministratore; anche `confermaOrdinePreventivo` ci passa): riblocca, aggiorna totali della commessa e
  acconto se non incassato, rigenera le righe non ordinate tenendo il fornitore, aggiunge le nuove; quelle già ordinate non si toccano (avviso nel log).
- **Foto vetrate panoramiche** (Brillante/Scintilla/Fisso, fornitore Vepa): `public/immagini/vetrate/` dalle schede tecniche PDF (immagini CMYK invertite: canali
  da invertire prima di convertire in RGB); messe in produzione con `api/admin/immagini-vetrate` (solo immagini mancanti, non tocca i prezzi). Fisso: foto generica.
- **Fornitori**: `Soggetto` con `ruoli: ["FORNITORE"]`; 55 importati da BConsole (rotta `api/admin/importa-fornitori-bconsole`).

## Comandi
```bash
npm install                     # genera anche il client Prisma
npx tsc --noEmit -p .           # controllo tipi
npx tsx --test tests/*/*.test.ts   # test unitari (oggi 287, tutti verdi)
npx next build                  # build (in locale senza db push)

# Collaudi end-to-end su Postgres LOCALE (svuotano le tabelle! mai sul DB di produzione)
DATABASE_URL=postgresql://t:t@localhost:5432/crmtest npx prisma db push --skip-generate
DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/<nome>.collaudo.ts
# <nome>: conferma (17), magazzino (33), ordini (43), articoli (48), calendario (16, con server SMTP finto), utenti (18), clienti (11), campagne (9), aumenti (15), fornitori-modelli (5), automazioni (23, SMTP finto e orologio simulato), appuntamenti (20), recupero (13), campagne-email (34), posta (17, tre server SMTP finti), fornitore-alternativo (15), team (26), fatture-incassi (32), posta-tls (13, server SMTP con certificati veri), contabilita-bconsole (19), marketing (20, SMTP finto), calendario-telefono (13, SMTP finto), permessi (17), tracciamento (15, SMTP finto), rimbalzi (13, SMTP finto e casella simulata), invia-offerta (18, SMTP finto), provvigioni (24), comunicazioni (16, SMTP finto), storico-bconsole (5), documenti-bconsole (6), trafila-incassi (11), presa-in-carico-bc (9), file-acquisti-bc (5), telefoniste (20), moduli-meta (28), dopo-appuntamento (13), isomax-luce (5), rasomuro (11), fidra (8), porte-vetro (6), tempra (6), pedane (5), pavimenti-galleggianti (7), lattoneria (12), rilievo-complementi (21), ordine-da-rilievo (29, SMTP finto)
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
