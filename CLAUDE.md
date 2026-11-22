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
- **Flusso pratica fra uffici** (`src/lib/flusso.ts`, `FlussoFase` configurabile in Impostazioni › Flusso; flusso reale descritto da Ugo il 16/11/2026):
  Accettazione (Commerciale) → in parallelo **Fattura acconto** (Fatturazione, Giorgia: la chiude lei, non si chiude da sola) e **Incasso acconto e creazione progetto**
  (`PROGETTO`, Amministrazione, Debora: registra il pagamento con la spunta (non preselezionata) «✉️ Manda il ringraziamento al cliente» in pratica, scadenzario e fattura di vendita (`ringrazia` → `avanzaDopoIncasso(…, { ringrazia })`, `praticheDaRingraziare` in `src/lib/pratica/ringraziamento.ts`); il ringraziamento parte da fatturazione@ (`EMAIL_FATTURAZIONE`, casella dell'utente con quell'email o aziendale con quel mittente, firma «Ufficio fatturazione»); nella pratica «✉️ Ringraziamento inviato il …» o il pulsante `inviaRingraziamentoAcconto`; il task si chiude da solo, niente «Fatto») → **Appuntamento di rilievo**
  (`RILIEVO_APP`, Centralino, Alessia: sceglie il rilevatore; mail al cliente; il task di rilievo va a quel tecnico) → **Rilievo** (Tecnico: «carica rilievo» = eseguito) →
  **Conferma materiale e ordini** (`ORDINI`, Ufficio ordini, Laura: conferma il materiale, ordina, carica i costi; chiuso quando tutte le righe sono inviate) →
  **Arrivo materiale** (`MAGAZZINO`: bolle e fatture; chiuso da `verificaMaterialeCommessa` a materiale completo, che crea il task di saldo per la Fatturazione e `POSA_APP`
  per il Centralino) → **Appuntamento di posa** (`POSA_APP`, Alessia: `programmaPosa`, mail al cliente con come far trovare l'ambiente di lavoro e conferma della data; task alla squadra)
  → **Posa** (squadra, consegna i documenti in azienda; Alessia li carica e in `completaPosa` sceglie «Finita» o «Parziale») → se finita: mail di recensione al cliente
  (`recensioneRichiestaIl`) e task + mail al commerciale per consegnare il **kit di manutenzione** (`KIT`); se parziale: scuse al cliente e nuovo task `POSA_APP`.
  Mail al cliente in `src/lib/pratica/mail-cliente.ts` (testi puri) e `mail-cliente-server.ts` (`inviaMailPratica`, dalla casella del responsabile, mai bloccante; ringraziamento una sola
  volta con `Commessa.ringraziamentoInviatoIl`). `chiudiTaskFase(commessaId, fase, assegnaA?)` in `flusso-actions.ts` chiude il task di una fase e fa partire la successiva;
  `assicuraFlusso` aggiunge da solo le fasi mancanti; per allineare le fasi già salvate rotta `api/admin/allinea-flusso` (GET prova, POST esegue: solo ufficio, catena e testi,
  mai le mail). `FATT_SALDO` non è più nella catena: il saldo lo chiede il magazzino a materiale completo e si chiude con l'incasso completo (`avanzaDopoIncasso`).
  Le pratiche prese da BConsole (`ordineBC`) non hanno il task `PROGETTO`. Collaudo `flusso-uffici` (20).
- **Flusso definitivo, correzioni di Ugo del 21/11/2026**: Giorgia prima crea il progetto e DENTRO fa fattura di acconto e chiamata di benvenuto (`passi.ts`: PROGETTO → FATTURA → BENVENUTO; `registraFatturaAcconto` rifiuta senza progetto, `creaProgetto` non chiede più la fattura). Incassi: modalità = tendina `METODI_PAGAMENTO` anche nella pratica, causale scritta da sola «ACCONTO FT n. …» / «SALDO FT n. …» (`src/lib/amministrazione/causale.ts` puro e testato, `causaliIncassi` in `causale-server.ts`; nella pratica numero e data della fattura di saldo dalle `FatturaVendita` della commessa). Il saldo (passo 9) si può fare in ogni momento, anche prima del materiale (stato ORA). Ufficio ordini: invia gli ordini (email o «🌐 Caricato sul portale del fornitore» = `segnaOrdineInviatoAMano`). Posa parziale a due strade (`completaPosa` esito `PARZIALE` → nuovo `POSA_APP`; `PARZIALE_MATERIALE` + `materialeServe` → `Commessa.riordinoIl/riordinoNote`, `materialeCompletoIl` azzerato, task `ORDINI` a Laura; `verificaMaterialeCommessa` richiede una riga nuova dopo `riordinoIl`, poi azzera il riordino e crea `POSA_APP` senza doppioni; nel percorso `DatiPassi.riordino` riporta a «Materiale e invio ordini» e «Arrivo»). Posa finita/fissata in `passi-server.ts`: una posa parziale (COMPLETATA ma pratica in POSA) non conta come finita. Testi delle fasi FATT_ACCONTO/PROGETTO/ORDINI riallineati da soli una volta (`allineaTestiFlusso`, chiave `flusso_testi_versione`). Test `tests/amministrazione/causale.test.ts`, `tests/pratica/passi.test.ts`, collaudo `flusso-uffici` (36).
- **Giorgia: progetto → chiamata → fattura e interventi del progetto** (Ugo 21/11/2026, seconda correzione): ordine dei passi PROGETTO → BENVENUTO → FATTURA; il task `FATT_ACCONTO` si chiude quando ci sono sia benvenuto che fattura (`registraFatturaAcconto` / `registraBenvenuto`), testi fasi `VERSIONE_TESTI_FLUSSO` «2026-11-21b». **Interventi del progetto** = modello `Assistenza` con `tipo` (FINE_POSA, MANUTENZIONE, SOPRALLUOGO, SECONDO_RILIEVO, ASSISTENZA, ALTRO; `src/lib/pratica/interventi.ts` puro e testato), `serveMateriale`, `lavoroFinito`; riquadro `#interventi` nella pratica (nuovo intervento con motivo, cosa fare, chi va, giorno, «serve materiale»; «📅 Fissa l'intervento»; «✅ Chiudi con il report» = `esito`). `creaAssistenza`: con materiale → `IN_ATTESA_RICAMBIO` + `apriRiordino` (task ORDINI, `riordinoIl`), senza giorno → task al centralino «Fissare l'intervento n.N (…)» (faseChiave null, si chiude da solo quando si fissa, `chiudiTaskFissare`); con giorno e incaricato → invito .ics (`inviaInvito("ASSISTENZA:<id>")`, calendario con il nome del tipo e link alla pratica `#interventi`). `aggiornaAssistenza`: chiusura di un FINE_POSA con «lavoro finito» e nessun altro fine posa aperto → LAVORI_ESEGUITI, recensione (con la spunta) e task KIT (`chiusuraIntervento`). Posa parziale (`completaPosa`): non più un nuovo `POSA_APP` ma un intervento FINE_POSA (con materiale: riordino; senza: task di fissare); `verificaMaterialeCommessa` a materiale arrivato rimette APERTA gli interventi in attesa e crea il task di fissarli. Percorso: `DatiPassi.interventoFinePosa` tiene la pratica al passo POSA. `/assistenza` = «Interventi e assistenza». Collaudo `flusso-uffici` (43), test `tests/pratica/interventi.test.ts`.
- **Risposte di Debora del 21/11/2026 (incassi e rilievo)**: il rilievo parte solo con il **50% del totale incassato** (acconto + rate intermedie + altro; `src/lib/pratica/soglia.ts` puro e testato `viaLiberaRilievo`/`sogliaRilievo`, `statoSogliaRilievo` in `soglia-server.ts` = max tra scadenze pagate e incassi segnati in pratica), con il finanziamento approvato o con lo **sblocco dell'amministratore** (`Commessa.rilievoSbloccoRichiestoIl/Motivo`, `rilievoSbloccatoIl/DaNome`; `chiediSbloccoRilievo` = task «Sbloccare il rilievo senza il 50% incassato» al primo amministratore + email agli amministratori, `sbloccaRilievo` solo AMMINISTRATORE). Usato da `avviaRilievoSePronto`, `dopoIncassoAcconto` (chiude il task di Debora solo a soglia raggiunta; chiamato a ogni incasso da `avanzaDopoIncasso`), `ricalcolaStato`, `programmaRilievo`, `passi-server`, `percorso-server`. **Rate intermedie**: scadenze INCASSO `COMMESSA_RATA_<n>` (`aggiungiRataIntermedia`/`togliRataIntermedia`), tolte dal saldo in `sincronizzaScadenzeCommesse(soloCommessa?)`. **Finanziamento approvato** lo segna la fatturazione (`aggiornaFinanziamento`: `puo(u, "fatturazione")`). **Ritenute 11%**: contano come pagate senza movimento, elenco per anno/mese in `/amministrazione/ritenute`. **Pagamenti a mano senza prima nota**: `Scadenza.manualeDaControllare/controllatoEstrattoIl/controllatoDaNome` (`whereDaControllare` in `src/lib/amministrazione/da-controllare.ts`, anche dalla nota per i vecchi), lista `/amministrazione/da-controllare` con «✓ Controllato con l'estratto» (`segnaControllatoEstratto`) e promemoria in Dashboard. Collaudo `soglia-rilievo` (13), `trafila-incassi` (10), test `tests/pratica/soglia.test.ts`.
- **Sconto dell'offerta** (`aggiornaSconto`): percentuale fino a 5 decimali (per far quadrare il totale con una cifra concordata), mostrata con `percentuale()` di `src/lib/numeri.ts`.
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
  Le email al VENDITORE (conferma, promemoria, annullato…) portano al suo appuntamento (`linkAppuntamento`, `/calendario/appuntamento/<id>`), non al lead:
  il commerciale con visibilità «suoi» non vede i lead della telefonista e la pagina dava errore (segnalazione di Bruno, 16/11/2026); i vecchi link
  `/lead?id=` (`/lead/[id]`): lead non visibile → appuntamento dell'utente per quel lead (`appuntamentoId` o il cliente nato dal lead), altrimenti scheda del lead
  se è il venditore, altrimenti messaggio «Questo contatto non è fra i tuoi» (mai più pagina d'errore).
  Visibilità dei lead per chi vede «solo i suoi» (Rocco 16/11/2026): `scopeLeadWhere` = lead di cui è telefonista, più quelli in «chiamata con commerciale»
  di cui è il venditore; il commerciale NON vede la scheda del lead (storico, note): `/lead/[id]` lo porta sempre al suo appuntamento per quel cliente
  (`appuntamentoId` o il cliente nato dal lead), che mostra nome, luogo, telefono, email e la nota della telefonista; altrimenti «Questo contatto lo segue il centralino».
  Nei «Task di oggi» (`taskLeadWhere`) al venditore arrivano solo le sue «chiamate con commerciale». «Appuntamenti senza esito» (`/lead/senza-esito`): chi ha
  `calendario.tutti` (centralino, uffici) vede tutti, il commerciale solo i suoi (`utentiVisibili`); lead inesistente → «Contatto non trovato».
  Nota dell'appuntamento nella cronologia: l'esito porta «\nNota: …» nel corpo; «Nuovo appuntamento» dal calendario per un cliente nato da un lead scrive
  nella cronologia del lead «Appuntamento fissato — … \nNota: …» (collaudo `calendario` (17)). Collaudo `appuntamenti` (21).
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
  campagna (`tracciamento`). «🚫 Escludi chi ha già ricevuto un'altra campagna» (`Campagna.escludiCampagne`, `conEsclusi`/`STATI_RICEVUTA` in `regole.ts`, applicata in `filtriCampagna`: chi ha un invio INVIATA/IN_ATTESA/IN_CORSO nelle campagne spuntate non riceve questa; copiata nel duplica; collaudo `campagne-escludi` (5)).
  Invii presi da un controllo interrotto (`CampagnaInvio.presoIl`) tornano in coda dopo 10 minuti (dopo 3 interruzioni FALLITA «invio interrotto
  più volte»); `eseguiDopoRisposta` su Vercel passa il lavoro alla rotta `/api/automazioni/esegui` (60 s) invece di farlo dentro la pagina; stato della coda in sola
  lettura `GET /api/admin/stato-campagne` (x-seed-key). Collaudo `campagne-ripresa` (7). Le email automatiche al cliente sono tracciate e hanno il preheader personalizzabile (Marketing › Testi).
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
- **Prima nota e scadenzario, richieste di Rocco (nov 2026)**: scadenzario con «Ordine: ↑ Crescente / ↓ Decrescente» (`?ordine=desc`); prima nota
  con la legenda dei bollini (`STATI_MOVIMENTO.spiega`, anche come tooltip) e, nel movimento a mano (`components/amministrazione/MovimentoAMano.tsx`),
  il «Chi»: ricerca mentre si scrive in fornitori (`Soggetto`) e clienti (`GET /api/amministrazione/chi?q=`), poi le sue scadenze aperte
  (`?scadenze=S:<id>|C:<id>&tipo=PAGAMENTO|INCASSO`, per collegamento o per nome della controparte); quelle spuntate si saldano con il movimento
  (`nuovoMovimento` → `abbina` dalla più vecchia, l'ultima anche in parte), importo proposto = somma, descrizione vuota = «Pagamento <chi>», nota «Chi: …».
  Collaudo `prima-nota-chi` (9).
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
  (testi di tutte le email automatiche modificabili, in testo o in HTML incollato/caricato da file: `TestoPersonalizzato.formato`, `riempiHtml` con valori protetti, `htmlEmail` usa `e.html` e aggiunge il piede di disiscrizione se manca `{disiscrizione}`, testo semplice da `testoDaHtml` in `src/lib/mail/html.ts`, anteprima in iframe; con segnaposto `{nome}`, `{data_appuntamento}`…, anteprima mentre si scrive, ritorno allo
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
- **Preventivi, richieste di Rocco parte 1 (nov 2026)**: nuovo preventivo in una pagina a sé (`/preventivi/nuovo`, cliente cercato con `ClientePicker`
  che mette anche il marchio del cliente, commerciale di partenza = chi è collegato, oggetto facoltativo; `?cliente=` lo precompila); nell'elenco solo
  ricerca, colonne e «➕ Nuovo preventivo». Numero progressivo per marchio e anno di Roma con `_max` (prima `orderBy desc` metteva in testa le offerte
  senza numero e ripartiva sempre da 1). Pagina dell'offerta nell'ordine: intestazione → commerciale e stato (`SelectAutoInvio`, si salva da solo) →
  immagine/render (`aggiornaImmagineOfferta`, `SelettoreImmagine inviaSubito`) → «Il cliente ha firmato?» solo se inviata/confermata/non aperta o `?firma=1`
  → righe → prezzo, IVA e sconto → validità → condizioni → «👁️ Guarda anteprima» / «✉️ Invia al cliente». In stampa l'immagine va sotto l'intestazione;
  accanto al totale «Previa fattibilità tecnica» e «Offerta valida fino al …» (`testoValidita`), sotto la clausola spese di istruttoria € 400
  (`src/lib/condizioniOfferta.ts`). In tutto il CRM, ai salvataggi (moduli inviati, non GET) `InvioInCorso` mostra un velo con la rotella al centro finché
  la pagina non si aggiorna; i salvataggi automatici lo accendono/spengono con gli eventi `attesa:inizio`/`attesa:fine`. Collaudo `preventivi-nuovo` (8).
- **Preventivi, richieste di Rocco parte 2 (nov 2026)**: niente più pulsanti «salva» per IVA, sconto, prezzo manuale, validità, condizioni e nome delle
  stanze: `components/FormAutoSalva.tsx` (tendine/spunte/date subito, numeri e testi all'uscita dal campo o con Invio; `key` con i valori salvati per
  ripartire da quelli nuovi). «💶 Prezzo, IVA e sconto» (`#prezzo`): campi a sinistra, a destra «Come lo vede il cliente» (totale prodotti, − sconto,
  imponibile, + IVA, totale, fattibilità e clausola). Prezzo manuale = un solo campo: pieno → offerta «a corpo» (`aggiornaPrezzoManuale` senza spunta,
  IVA invariata se non nel modulo), vuoto → calcolo dalle righe; in stampa a corpo spariscono prezzi unitari, totali di riga e di stanza (`aCorpo` in
  `StampaOfferta`). Righe: in fondo a ogni stanza (e alle righe senza sezione) `components/preventivi/AggiungiRiga.tsx` con «🧩 Prodotto» (porta a
  `?sezione=<id>#aggiungi-prodotto`: il prodotto scelto va in quella stanza, `SelettoreProdotto sezioneId` → campo `sezioneId` → `posizioneNuovaRiga`
  in `aggiungiRigaPreventivo`/`…PerMisura`, solo stanze della stessa offerta) e «📝 Testo» (testo + importo + Aggiungi); righe di testo con
  modifica/duplica/elimina (`components/preventivi/RigaTesto.tsx`, `modificaRigaPreventivo` gestisce anche il testo). «👁️ Guarda anteprima» apre
  `/preventivi/[id]/stampa` con in alto «← Torna all'offerta» e «✉️ Invia al cliente». Collaudo `preventivi-righe` (13).
- **Preventivi, richieste di Rocco parte 3 (nov 2026)**: prodotti «come un negozio online»: `SelettoreProdotto finestra` (solo nell'offerta; nella pratica
  resta il vecchio elenco) = pulsante «➕ Aggiungi prodotto» che apre una finestra: tessere Indoor/Outdoor → categorie (gruppi) → sottogruppi → modelli
  con la foto (`NodoTipologia.immagine` da `ModelloProdotto.immagineUrl`, esclusi i data URI) → configuratore di sempre (`elencoTipologie`: tendine a
  cascata se il listino le prevede) → «🛒 Aggiungi al preventivo»; dentro la finestra «va in» la stanza (`sezioni`), il pulsante «🧩 Prodotto» di una
  stanza la apre con l'evento `scegli-prodotto`. `aggiungiRigaPreventivo`/`…PerMisura` restituiscono `{ rigaId }`: dopo l'aggiunta la finestra offre
  «⚙️ Scegli gli optional» (evento `apri-optional` + `window.__apriOptional`), «Aggiungi un altro prodotto», «Chiudi». Gli optional di ogni riga prodotto
  stanno in `components/preventivi/FinestraOptional.tsx` (pulsante «⚙️ Optional (n)», gli stessi moduli di prima dentro una finestra; nascosto se il
  prodotto non ne ha). Stampa: ogni prodotto con nome leggibile e elenco puntato Tipo (gruppo — sottogruppo) / Colore / Misure / Optional
  (`src/lib/preventivi/riepilogo-stampa.ts` puro, test `tests/preventivi/riepilogo-stampa.test.ts`); la scheda tecnica completa non va più in stampa,
  solo il testo personalizzato della riga («✏️ testo per il cliente»).
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
- **Servizi e pratiche, obiettivi e premi** (richiesta di Ugo, nov 2026): `ModelloProdotto.inProvvigione` e `Optional.inProvvigione` (di serie sì; spunta
  «Va in provvigione» nella scheda del modello, solo con `listini.modifica`). Famiglia del listino `SERVIZI` › «SERVIZI E PRATICHE» (pratica ENEA 350, autoscala
  250/500/800/+300, facchinaggio 70 al piano; `src/lib/provvigioni/servizi.ts`, rotta `api/admin/seed-servizi` GET prova/POST, per ogni marchio): fuori provvigione.
  Gli optional ENEA/autoscala/facchinaggio dei vecchi listini → `Optional.attivo=false` (non più proposti nell'offerta) e fuori provvigione; voci «Facchinaggio»
  W&S tolte se mai usate. In Contratti la base proposta = imponibile − servizi (`serviziDelleOfferte`, `importoFuoriProvvigione`: tolti per intero, non scontati);
  provvigione rata per rata (`provvigioneSulleRate`: acconto e saldo maturano quando il cliente paga); `/contratti/stampa` (per cliente e per contratto,
  stessi filtri). Obiettivi: `Obiettivo` mese «AAAA-MM», anno «AAAA» o su misura «AAAA-MM-GG~AAAA-MM-GG» (date scelte con il commerciale, `Obiettivo.titolo`,
  `eSuMisura`/`suMisuraInCorso`, `creaObiettivoSuMisura`/`eliminaObiettivoSuMisura`, riquadro `#su-misura` della pagina obiettivi; nel riquadro e nell'email del lunedì
  quelli in corso, test `tests/provvigioni/obiettivi-su-misura.test.ts`) con `premio`, pagina `/contratti/obiettivi` (gestisceProvvigioni), riquadro
  `RiquadroObiettivi` con tabella di marcia (`src/lib/provvigioni/obiettivi.ts`: atteso = obiettivo × giorni passati/giorni del periodo; in linea, quasi ≥80%,
  indietro, raggiunto) e venduto mese per mese; venduto = imponibile dei contratti (commesse CRM + progetti BConsole) nel periodo. Email del lunedì
  (`inviaEmailObiettivi` in `obiettivi-server.ts`, chiamata da `/api/automazioni/esegui`; una volta a settimana `obiettivi_mail_settimana`, spegnibile
  `obiettivi_mail_attiva`, «Manda adesso»). Test `tests/provvigioni/servizi-obiettivi.test.ts`, collaudo `servizi-obiettivi` (25, SMTP finto). Venditori: ruolo COMMERCIALE, spunta «Vende anche» (`Utente.vende`, Team › scheda persona, es. Laura Pinto tecnica che vende Solaris; usata da `commercialiAttivi`, obiettivi, lead; rotta `api/admin/vende-anche`) + `VENDONO_ANCHE` (Ugo, UPE) con `eVenditore`; sigle agganciate anche con nome più corto o rovesciato (`stessaPersona`), verifica `GET api/admin/stato-venditori`; in Team & performance colonna «Venduto <anno> CRM + BConsole» (`contrattiDi`, link ai Contratti).
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
  per i link «← …». Calendario: annullati nascosti (`?annullati=1` per vederli). Clienti: pagine `?pc=`/`?pl=`. Esito «Chiamata con commerciale» (`APPUNTAMENTO_TELEFONICO`, richiesta di Rocco: il cliente vuole parlare direttamente col commerciale): giorno/ora, commerciale obbligatorio e note; vale come un appuntamento (`ESITI_APPUNTAMENTO`/`FASI_APPUNTAMENTO` in `percorsi.ts`), nessuna email, `sincronizzaCalendario` mette nel calendario del commerciale una telefonata TELEFONICO di 15 minuti col numero. Il task è del commerciale: con visibilità «suoi» vede i lead in questa fase dove è `venditoreId` (`scopeLeadWhere`), nei «Task di oggi» la chiamata compare solo a lui, in Dashboard «📞 Chiamate con commerciale». Lui esita: appuntamento CASA/SHOWROOM (la telefonata in calendario resta COMPLETATO e la visita è un appuntamento nuovo), nuova chiamata, NON_RISPONDE (torna alla telefonista nella fase da richiamare), annullato, non interessato. Collaudo `chiamata-commerciale` (11). Richieste di Rocco (nov 2026, PDF «modifiche per PC ONE»): pagina del lead `/lead/[id]` con gerarchia visiva (titolo = azione da fare in maiuscolo, sottotitolo «Lead assegnato a» + stato, «← Torna ai task di oggi» a destra; riquadro contatto grigio con nome, telefono, email, arrivo, provenienza e le risposte del modulo nello stesso elenco puntato, note del centralino, modifica dati / passa a un collega a scomparsa; il task al centro in un riquadro blu in evidenza; cronologia in fondo con data/ora, titolo e testo distanziati). «♻️ Recupero contatti» (`/lead/recupero`): non interessati, non hanno risposto (`nonGestitoIl`, non più nei task di oggi) e già in recupero, con ricerca e la data in cui tornano da soli; si esitano in ogni momento come alla prima chiamata (`esitiPossibili(NON_INTERESSATO)` = prequalifica; `?da=recupero` torna all'elenco) e l'esito annulla il recupero automatico (`avviaPercorso`). Disiscrizione solo dalle email commerciali: `Modello.commerciale` (lettere di vendita, promozione del recupero, «restiamo in contatto») e campagne; le email di servizio (richiesta ricevuta, ricontatto, appuntamento…) partono anche ai disiscritti. Collaudo `recupero-contatti` (7). Anagrafica del lead modificabile senza farlo cliente («✏️ Modifica i dati del lead», `modificaDatiLead`, evento `lead.dati` con prima → dopo). Collaudo `telefoniste` (20).
- **Lead e calendario, richieste di Rocco (PDF «modifiche PC per lead e calendario», nov 2026)**: nell'appuntamento «❌ Appuntamento annullato»
  (`rifissaDalCentralino` con `annullato=1`: appuntamento ANNULLATO, lead APPUNTAMENTO_ANNULLATO con scadenza adesso) → task del centralino «Motiva l'annullamento»
  (`FASI_LEAD`); `esitiPossibili(APPUNTAMENTO_ANNULLATO)` = DA_RICHIAMARE, NON_INTERESSATO (+ rifissare subito); con l'appuntamento fissato niente più «non
  interessato». DA_RICHIAMARE con la spunta «Non inviare il promemoria al cliente» (`senzaEmailCliente` → passi EMAIL al CLIENTE SALTATI in `programmaDa`).
  Pagina del lead: niente note del centralino nell'intestazione (sono in cronologia); cronologia con titolo = esito e corpo solo se ci sono dettagli
  (`voceEsito`, `src/lib/lead/cronologia.ts`). Ricerca che perdona gli errori (`src/lib/ricerca/fuzzy.ts` Damerau-Levenshtein per parola, 0 errori fino a 3
  lettere, 1 con 4-5, 2 da 6; `server.ts` `clientiSimili`/`leadSimili`): se la ricerca esatta trova meno di 5 risultati si aggiungono i nomi simili (Clienti,
  `/lead` Tutti, `/lead/recupero`), con avviso «forse hai sbagliato una lettera». Calendario: colore per persona (`coloriPersone`, `PALETTE_PERSONE` in
  `eventi.ts`, `stileEvento`) con legenda; pulsanti dei tipi neutri (l'emoji dice il tipo). «+ Nuovo appuntamento» apre una finestra: «Con un cliente»
  (`FormAppuntamento`, ora client, con `GiorniOccupati`: 3 settimane con gli impegni del giorno della persona scelta) o «Riunione interna» (`FormRiunione`,
  modello `Riunione` con `partecipanti` = id utenti, tipo evento RIUNIONE 👥 per ogni partecipante, `creaRiunione`/`annullaRiunione`, `invitaRiunione` .ics a
  tutti, pagina `/calendario/riunione/[id]`). Sincronizzazione bidirezionale: con Nextcloud (vedi «Calendari Nextcloud»). Collaudo `rocco-calendario` (20).
- **Usando solo ONE, richieste di Ugo (nov 2026)**: calendario con la lente (`?cerca=`, `cercaEventi` in `src/lib/calendario/eventi.ts`: tutte le parole fra
  cliente, titolo, luogo = paese/città/via, note, incaricato e telefono del cliente `EventoCal.telefono`; ≥5 cifre senza lettere = ricerca per telefono sulle
  sole cifre), 2 anni indietro e 1 avanti, risultati «In programma» / «Già passati». Colore e «calendario attivo» per persona in Impostazioni › Utenti
  (`Utente.coloreCalendario` #rrggbb o vuoto = automatico, `Utente.inCalendario`; `salvaCalendarioUtente` in `team-actions.ts`, solo amministratore;
  `coloriPersone` accetta `{ id, colore }`: lo scelto vince, gli altri prendono i colori liberi della tavolozza); chi ha la spunta tolta non compare nel
  calendario del team né nella tendina delle persone. Scheda cliente: «✅ Task» apre «Nuovo task» (`#nuovo-task`, `src/app/task-clienti-actions.ts`
  `creaTaskCliente`/`completaTaskCliente`: `Attivita` TASK con incaricato attivo, `creatoDaId/creatoDaNome`, `completataIl`, scadenza `daOraRoma`,
  email di avviso al collega) che l'incaricato trova in `/task` («📌 I miei task sui clienti», con «dati da me ai colleghi») e in Dashboard.
  «✉️ Email» apre `/clienti/[id]/email` (`EditorEmailCliente`, `inviaEmailCliente` in `src/app/cliente-email-actions.ts`): dalla casella di chi scrive con
  firma, Cc, allegati (documenti del cliente e delle sue offerte o dal computer → «Corrispondenza»), anteprima; resta nelle attività (`Attivita` EMAIL con il
  testo, «mostra il testo» nel diario: `VoceDiario.dettaglio`). Collaudo `scheda-cliente` (14, SMTP finto), test `tests/calendario/ricerca-colori.test.ts`.
- **Assistenza del team** (richiesta di Ugo, nov 2026): in basso nel menu, sotto il nome, «🆘 Segnala un problema» (`components/SegnalaProblema.tsx`, finestra
  in `createPortal` su body: testo, link della pagina preso da solo, schermata con `getDisplayMedia` sul computer, incolla Cmd/Ctrl+V o file, immagini ridotte a
  1600 px JPEG) → `inviaSegnalazione` (`src/app/segnalazioni-actions.ts`, modelli `Segnalazione` + `SegnalazioneAllegato`, max 5 file / 3,8 MB, solo immagini o PDF):
  email a chi segue l'assistenza (`destinatarioAssistenza` in `src/lib/segnalazioni/server.ts`: `Configurazione.assistenza_destinatario` scelto in Impostazioni
  `#assistenza`, altrimenti il responsabile del Marketing = Rocco, altrimenti un amministratore) con gli amministratori in Cc, schermate allegate e «rispondi a» chi
  scrive. `/segnalazioni`: chi gestisce (`gestisceSegnalazioni`: destinatario e amministratori) le vede tutte con le schermate (`GET /api/segnalazioni/allegato/<id>`)
  e le chiude con «✓ Risolta» + risposta (email a chi ha scritto) o le riapre; gli altri vedono le proprie. Nel menu «📥 Segnalazioni del team» con il numero di
  aperte (dal layout), in Dashboard il riquadro rosso. Collaudo `segnalazioni` (15, SMTP finto).
- **Calendari Nextcloud** (richiesta di Ugo, nov 2026: i calendari dei commerciali sono su Nextcloud businesscloudonline.it, utente di Ugo
  amministratore; sostituisce l'idea di Google OAuth): CalDAV nei due sensi. `src/lib/calendario/caldav.ts` (PROPFIND calendari, REPORT con `expand` dei
  ricorrenti, PUT/DELETE/GET, Basic con «password per app»), `ical.ts` puro (lettura VEVENT/multistatus, `abbinaCalendario` per nome «Marco Piccatti BCONSOLE»
  con `stessaPersona`, `uidOne` «one-<tipo>-<id>@crm-gruppo-pc», `esterniDaMostrare` toglie i doppioni ±30 min degli impegni di ONE, `decisione`), `nextcloud.ts`
  (`sincronizzaNextcloud`: da −7 a +120 giorni; impegni di ONE scritti nel calendario «✍️ Scrivi qui» della persona, impronta sha1 per non riscrivere; P&C ONE ha sempre la
  precedenza (scelta di Ugo, 12/11/2026): un impegno di ONE spostato o cancellato su Nextcloud si riscrive com'è in ONE (prima spostava/annullava gli appuntamenti; ripristino con
  `api/admin/nextcloud-ripristino`, GET diagnosi `?persona=`, POST `?esegui=1` rimette PROGRAMMATO gli annullati «Cancellato sul calendario Nextcloud»); impegni solo-Nextcloud in `EventoNextcloud` (chiave vuota)
  mostrati come tipo ESTERNO «Da Nextcloud» 🗓️, pagina `/calendario/esterno/[id]`, esclusi dal link .ics). Quando: dopo ogni `inviaInvito`/`invitaRiunione`
  (`sincronizzaDopoRisposta` con `after`), all'apertura del CRM (max ogni 5 min, `nextcloud_ultima`) e in `/api/automazioni/esegui`. Configurazione chiavi
  `nextcloud_*` (password cifrata con `cifra`), pagina `/impostazioni/nextcloud` (permesso `calendario.nextcloud`, `src/app/nextcloud-actions.ts`).
  Il server Nextcloud non è raggiungibile dall'ambiente di sviluppo: collaudo `nextcloud` (16) con un Nextcloud simulato; test `tests/calendario/nextcloud.test.ts`.
- **Google Calendar nei due sensi** (richiesta di Ugo 13/11/2026, al posto di Nextcloud: account Google dell'amministrazione; `src/lib/calendario/googlecal.ts`
  puro e testato, `google.ts`, `src/app/google-actions.ts`, pagina `/impostazioni/google`, permesso `calendario.google`): app OAuth web con Client ID/secret inseriti nella
  pagina (secret e refresh token cifrati con `cifra`, chiavi `google_*`), «Collega Google» → `GET /api/google/collega` → consenso (offline) → `GET /api/google/callback`
  (`state` firmato HMAC, 30 min) → `completaConsenso` (+ `google_dal` = da quando si scrive). Solo i calendari con «BCONSOLE» nel nome (`proponiAbbinamenti`: persona attiva
  dal nome, se ne ha due vince «finale», abbinamenti salvati tenuti). Google → ONE: tutti gli impegni non scritti da ONE, non annullati né «liberi» (anche un semplice
  «occupato» del commerciale) in `EventoNextcloud` con `calendario = "google:<id>"`, mostrati come ESTERNO «Da Google» e contano come occupato. ONE → Google: solo
  APPUNTAMENTO/RIUNIONE creati in ONE dopo `google_dal` e non importati da BConsole (`daScrivere`), id fisso `one<sha1>` + `extendedProperties.private.one`; vince ONE
  (`azioneGoogle`: spostato/cancellato su Google → riscritto, annullato in ONE → tolto). Mai toccati gli impegni non scritti da ONE, né gli appuntamenti esistenti.
  Quando: come Nextcloud (`eseguiDopoRisposta`, `/api/automazioni/esegui`, dopo gli inviti), max ogni 5 min. Scollegare Nextcloud non toglie le righe `google:`.
  Indirizzi simulabili (`GOOGLE_API_BASE`, `GOOGLE_OAUTH_BASE`, `GOOGLE_AUTH_URL`, `GOOGLE_REDIRECT_BASE`): collaudo `google` (27, Google simulato), test `tests/calendario/google.test.ts`.
  L'app Google va «pubblicata» (in «Test» il refresh token scade dopo 7 giorni); avviso «app non verificata» normale.
- **Servizio di invio Brevo per campagne ed email automatiche** (15/11/2026: l'hosting della posta aziendale ha bloccato gli invii massivi; BConsole usava
  MailUp incluso nel suo servizio): `src/lib/mail/servizio.ts` (chiavi `servizio_*`, chiave SMTP cifrata, `servizio_webhook` = chiave del webhook), sezione
  «🚀 Servizio di invio» in Impostazioni › Email automatiche (`#servizio`, `salvaServizioInvio` prova subito e non salva se Brevo rifiuta). `inviaMail({ servizio: true })`
  parte da Brevo (trasporto in pool, busta lasciata a Brevo, `X-Mailin-custom` = codice `X-CRM-Invio`) senza ripiegare sulla posta aziendale; lo usano le campagne
  (blocco fino a 40 secondi per controllo invece di 40 email) e le email automatiche al CLIENTE. Mittente `mittenteCampagna(marchi)`: solo Solaris →
  promozionale@solarisfotovoltaico.com, altrimenti promozionale@gruppopec.com (domini gruppopec.com e solarisfotovoltaico.com autenticati in Brevo, DNS su
  dominiodioccasione.it/ISPConfig). Webhook `POST /api/brevo/eventi?k=` (`azioneBrevo` puro in `eventi-brevo.ts`): rimbalzi → `applicaRimbalzo`, disiscritti/spam →
  `disiscritto`. Test `tests/mail/eventi-brevo.test.ts`, collaudo `brevo` (18, due SMTP finti e API Brevo finta; «🔗 Crea il webhook in Brevo» = `creaWebhookBrevo` con chiave API non salvata).
- **Cestino e registro «chi ha fatto cosa»** (richiesta di Ugo 15/11/2026, dopo una newsletter cancellata per errore): `src/lib/cestino.ts` — prima di eliminare
  una campagna (`eliminaCampagna`), un lead o un cliente (`elimina-contatti-actions.ts`) o un'offerta (`eliminaPreventivo`: con sezioni, righe, optional, email, progetto Solaris Studio e sue foto; prima il progetto Solaris bloccava l'eliminazione con la pagina di errore; collaudo `elimina-offerta` (6)) `mettiNelCestino` salva una copia completa con i dati collegati
  (modello `Cestino`: `dati` JSON {tabelle in ordine di ripristino, collega}, chi, quando, `scadeIl` = +30 giorni) e scrive in `RegistroAmministrazione`.
  Pagina `/impostazioni/registro` (permesso `registro`, di serie solo amministratore): cestino con «♻️ Ripristina» (`ripristina`: `createMany skipDuplicates` e
  ricollegamenti, poi «RIPRISTINATO» nel registro) e registro con ricerca. `svuotaScaduti` in `/api/automazioni/esegui`. Collaudo `cestino` (13).
- **Lead e clienti, richieste di Rocco (PDF «modifiche per PC ONE», nov 2026)**: `/lead` a schede «Oggi» (nuovi + da fare oggi, «Lavorati oggi»
  a scomparsa), «Scaduti», «In programma», «Chiusi», «Tutti» (come un estratto conto: nome/telefono/email, giorno da `CalendarioConteggi` con
  il numero di task per giorno indipendente dagli altri filtri, spunte degli stati raggruppate per azione, «Cerca», risultati per giorno dal più
  recente; logica pura `src/lib/lead/elenco.ts`, data del task = `scadenzaAzione` o arrivo). Nella pagina del lead si cambiano anche marchio e
  provenienza (`modificaDatiLead`, nella cronologia). Eliminare (permesso `clienti.elimina`: amministratore e marketing; `src/app/elimina-contatti-actions.ts`):
  lead dall'elenco Clienti o dalla sua pagina (il cliente nato dal lead resta scollegato); cliente dall'elenco o da Anagrafica, solo se senza
  preventivi, pratiche, fatture, DDT, scadenze, progetti Solaris (`bloccaEliminazioneCliente`), con contatti/indirizzi/attività/appuntamenti;
  traccia in `RegistroAmministrazione`. Collaudo `lead-clienti` (12).
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
  «*» = primo prezzo disponibile, «-» = non eseguibile; refuso F2A 900×800 «937» corretto a 1.073,60 seguendo la progressione, `CORREZIONI` nello script). Optional in `src/lib/listini/fidra.ts` (listini `FIDRA` comune, `FIDRA_F` finestre, `FIDRA_PF`
  portefinestre, `FIDRA_WAS` wasistas; `listiniFidra`): colori standard compresi, fuori standard +30%, due lati diversi +100%, vetro STC, satinato
  90 €/anta finestre e 150 €/anta portefinestre (su tutte le tipologie), maniglia passante 500 € su tutte, motoriduttore, traversi, pannello fisso, fuori misura, sagomati +40%, minimo
  di produzione, autoscala, ENEA, smaltimento. Rotta `api/admin/seed-fidra` (GET prova, POST carica). Disegni in `public/immagini/fidra/`, brochure e
  dispositivi Matter in `public/cataloghi/fidra/`. Nell'offerta stesso riquadro a tendine del raso muro. Fidra = «Inversa» di Biemme Finestre
  (fornitore, mai nominato al cliente): scheda tecnica `Fidra-scheda-tecnica.pdf` (2 pagine, fatta da noi il 16/11/2026 con logo e dati di P&C, valori e foto dalla
  pagina pubblica biemmefinestre.it/inversa e dalla brochure; la scheda del fornitore è riservata ai rivenditori; HTML sorgente in scratchpad `inversa/scheda.html`),
  `DESCRIZIONE_CLIENTE_FIDRA`, voce in `SCHEDE`. Test `tests/listini/fidra.test.ts`, collaudo `fidra` (8).
- **Serramenti PVC Optima 70** («Optima 1.3»: 5 camere, 70 mm, Uf 1,3; gruppo SERRAMENTI, sottogruppo «PVC — Optima 70»; ha sostituito il segnaposto
  `SERRAMENTI_PVC_OPTIMA_PLACEHOLDER`): 12 tipologie `OPTIMA_<F1A|F2A|F3A|FF|W|PF1A|PF2A|PF3A>[_SOGLIA]|OPTIMA_TRASLANTE` come Fidra, griglie L×H in mm dal file
  «OPTIMA70_PREMIUM_FINALE.xlsx» (valori dei fogli = base × 1,35 del file, stessa base del listino Fidra che è × 2,2; due celle diverse dal Fidra lasciate come
  nel file: PF3A soglia 2400×2300; F2A 900×800 è giusta, era il Fidra ad avere il refuso) in `prisma/seed-data/optima_prodotti.json` (`python3 -I scripts/listini/estrai_optima.py <file.xlsx> prisma/seed-data/optima_prodotti.json`).
  `src/lib/listini/optima.ts` (puro): bianco massa compreso, tutte le pellicole +20% (codici AP), fuori standard +30% / due lati +100%, vetro STC 150 €/vetro,
  satinato 90 €/anta finestre e 150 €/anta portefinestre, maniglia passante 500 € su tutte, motore wasistas 350, antifurto 45, foro passagatto 150, traversi 90/120,
  pannello fisso 100 (portefinestre), oltre misura 300 €/10 cm, minimo di produzione 450, trasporto fuori sagoma 350, autoscala 700/900 (+500 suolo pubblico), ENEA 350,
  smaltimento cartongesso 300/m², smontaggio veranda 500 a corpo (listini `OPTIMA`, `OPTIMA_F`, `OPTIMA_PF`, `OPTIMA_WAS`; `listiniOptima`). Disegni = quelli di Fidra,
  scheda tecnica in `public/cataloghi/optima/` (v3, piè di pagina corretto con i dati di P&C srl). Nell'offerta stampata sotto l'elenco puntato:
  descrizione tecnica breve `DESCRIZIONE_CLIENTE_OPTIMA` (sempre, anche con testo personalizzato o foto/testo nascosti) e link «📄 Scheda tecnica» (`src/lib/preventivi/scheda-cliente.ts`,
  una voce per listino in `SCHEDE`); `/cataloghi` è pubblico nel middleware perché il cliente lo apre dal link dell'offerta.
  Il commerciale vede la scheda (anteprima, descrizione, link) nel configuratore della finestra «Aggiungi prodotto». Nell'offerta ogni prodotto con scheda ha la spunta
  «📄 Allega la scheda tecnica» (`RigaPreventivo.allegaScheda`, `aggiornaSchedaRiga`; `Preventivo.schedeAllegate` non più usato): quelle spuntate si stampano in fondo all'offerta una volta per listino
  (pagine JPG in `public/cataloghi/<listino>/pagine/`, una per foglio) e nell'«Invia offerta» sono già spuntate come allegato PDF (`pdfPubblico`: disco o sito).
  Rotta `api/admin/seed-optima` (GET prova, POST carica, rilanciabile). Test `tests/listini/optima.test.ts`, collaudo `optima` (9).
- **Serramenti PVC Zenith come l'Optima** (richiesta di Ugo 16/11/2026, dopo la prova dei listini): griglie di sempre (`zenith_prodotti.json`), optional nuovi in
  `src/lib/listini/zenith.ts` (`optionalZenith`, `listiniZenith`: `ZENITH` comune + `ZENITH_F|_PF` + `ZENITH_DOPPIO|_TRIPLO` (UKW13/UKW10) + `ZENITH_WAS` + `ZENITH_PF3A`):
  «Colore esterno» (bianco massa compreso, pellicole e fuori standard +20%, PF3A fuori standard un lato +30%) e «Colore interno» (bianco o uguale all'esterno compreso,
  pellicola con esterno bianco +20%, diversa da quella esterna +80% = +100% in tutto), vetri, accessori, lavorazioni, servizi (ENEA/autoscala restano in «Servizi e pratiche»).
  Comuni a Zenith/Optima/Fidra/Plasma 30 (`src/lib/listini/serramenti-comuni.ts`): vetri speciali ad anta finestre/portefinestre (stratificato 3+3, antisfondamento 4+4 P2A,
  insonorizzante, decorativo: prezzi STIMATI, da confermare col fornitore) e forme trapezoidale/curva +40%; nell'offerta le tendine `tendinaDi` (maniglie, ferramenta,
  traversi e pannelli → «Accessori»; «Lavorazioni e misure»), ordine colore → vetri → accessori → lavorazioni → servizi, nome della tendina sopra e «+ Aggiungi» (prima i
  pulsanti uscivano dal riquadro). Allineamento senza rotte seed: `assicuraOptionalSerramenti` (`allinea-optional.ts`, all'apertura di un'offerta, una volta per
  `VERSIONE_OPTIONAL_SERRAMENTI`, chiave `optional_serramenti_versione`): crea solo le voci mancanti (mai i prezzi esistenti, che possono essere aumentati) e spegne le
  vecchie voci Zenith (`ZENITH_WASISTAS`, `ZENITH_PF3A_SOGLIA`, le due pellicole PF3A); `seed-zenith` usa la stessa funzione. Al rilievo e nell'ordine: `assicuraRigheOfferta`
  scrive nella descrizione del materiale le scelte dell'offerta (`sceltePerRilievo`: «Colore esterno: … · Vetri: … ×2»). Scheda tecnica «Zenith 72» (1 pagina, già con i dati
  di P&C) in `public/cataloghi/zenith/`, `DESCRIZIONE_CLIENTE_ZENITH`, voce in `SCHEDE`: vetro stratificato di sicurezza 3+3 BE / 18 argon / 3+3 DI SERIE, quindi per lo Zenith
  niente sovrapprezzi stratificato. Poi (Ugo, stesso giorno) lo stratificato 3+3 è DI SERIE su TUTTI i serramenti (norma in Italia): `VETRI_SPECIALI` non ha più lo
  stratificato, `VETRO_STRATIFICATO_DI_SERIE` a 0 € negli altri listini (versione «2026-11-16c» spegne i sovrapprezzi già creati). Listini serramenti unificati nella
  scelta: Optima, Fidra e Plasma 30 usano le stesse 2 tendine dello Zenith (Finestre/Portefinestre → tipo di anta, `assiSerramentoListino` dentro `assiSelezioneZenith`).
  Test `tests/listini/zenith.test.ts`, collaudo `zenith-optional` (6).
- **Serramenti PVC Plasma 30** (telaio e anta 74 mm, Uf 1,0; gruppo SERRAMENTI, sottogruppi «PVC — Plasma 30» e «PVC — Plasma 30 triplo vetro»; ha sostituito il
  segnaposto `SERRAMENTI_PVC_PLASMA30_PLACEHOLDER`): 24 tipologie `PLASMA30_<apertura>` (doppio vetro, file «PLASMA 30 UKW 1.3 - 2025», coeff. 2,7 = base Optima × 2,7)
  e `PLASMA30TV_<apertura>` (triplo vetro, «UKW 1.0», coeff. 3, base propria), aperture come Optima/Fidra; griglie già al cliente in
  `prisma/seed-data/plasma30_prodotti.json` (`python3 -I scripts/listini/estrai_plasma30.py <ukw13.xlsx> <ukw10.xlsx> prisma/seed-data/plasma30_prodotti.json`;
  refuso F2A 900×800 «937» corretto a 1.317,60 in `CORREZIONI`). Attenzione: «PLASMA30_» non comprende «PLASMA30TV_» → usare `ePlasma30()`.
  `src/lib/listini/plasma30.ts` (puro): optional sulla falsa riga dell'Optima (richiesta di Ugo) ma colori del listino Plasma: avorio +5%, pellicole standard
  +15% un lato / +20% due lati uguali, fuori standard +30% un lato, diverse sui due lati +100%; STC, satinato 90/150, maniglia passante, motore wasistas, antifurto,
  traversi, pannello fisso, passagatto, oltre misura 300 €/10 cm (triplo PF3A soglia 400: listino `PLASMA30_FUORI400`), curvi/sagomati +40%, minimo 450, trasporto,
  servizi al contratto. Scheda tecnica `public/cataloghi/plasma30/` (16 pagine; ripulita con `pulisci_plasma.py` in scratchpad: tolti i dati nascosti del fornitore
  Kompany/Korus, «Win Box» → «Plasma 30», pagine 3/6/11/16 rese immagine), una voce in `SCHEDE` per prefisso con la stessa chiave «PLASMA30» (allegata una volta).
  Rotta `api/admin/seed-plasma30` (GET prova, POST carica). Test `tests/listini/plasma30.test.ts`, collaudo `plasma30` (10).
- **Porte a vetro per vetrate** (OUTDOOR › VETRATE › «Porte a vetro», gruppo modello `VETRATE PORTE` in `GRUPPI_VETRATE`): `PORTAVETRO_PAL` (vetro e
  alluminio, varianti telaio 3/4 lati) e `PORTAVETRO_PTV` (tutto vetro), prezzo fisso = listino fornitore +60% (`src/lib/listini/porte-vetro.ts`, test
  `tests/listini/porte-vetro.test.ts`); optional: apertura, maniglione antipanico (solo PAL), colore RAL di serie, altezza oltre 2500 +5%. Rotta
  `api/admin/seed-porte-vetro` (GET prova, POST carica). Finiture vetro (pag. 19 del listino fornitore) non ancora a listino. Collaudo `porte-vetro` (6).
- **Vetrate Chirenti con vetrocamera** (OUTDOOR › VETRATE › «Book Pro Cam (a libro, vetrocamera)» e «Solco Pro Cam (scorrevole, vetrocamera)», gruppi `VETRATE BOOK PRO CAM` /
  `VETRATE SOLCO PRO CAM` in `GRUPPI_VETRATE`): 4 tipologie `VETRATA_<BOOKPROCAM|SOLCOPROCAM>_<TEMP|STRAT>`, tariffa al m² (`MQ_CON_MINIMI`, cm arrotondati ai 5 cm) ricavata dai
  preventivi Chirenti 90216/26-3694, -3694a, -3694b (2500×2400 = 6 m²): listino 650 €/m² temperato, 545 stratificato, sconto 50%, imballo casse 200 + trasporto Piemonte 150 a spedizione
  spalmati sui 6 m² → costo 383,33 / 330,83 €/m² × `RICARICO_CHIRENTI` 3,2 (scelta di Ugo 13/11/2026, come le porte a vetro) = 1.227 / 1.059 €/m², minimo fatturabile
  `AREA_MINIMA_CHIRENTI` 3 m² (Solco temperato stimato come Book: «da confermare»). Optional per gruppo (colori di serie, configurazione, serratura con cilindro passante Solco 192 €). `src/lib/listini/chirenti.ts` (puro, test `tests/listini/chirenti.test.ts` che ricostruisce gli imponibili dei preventivi),
  rotta `api/admin/seed-chirenti` (GET prova, POST carica): crea/completa il fornitore CHIRENTI SRL (`FORNITORE_CHIRENTI`: P.IVA, indirizzo, email ordini, IBAN; solo campi vuoti) e lo mette sui
  modelli con `scontoAcquisto` 68,75 (= vendita ÷ 3,2; aggiorna anche il 50 messo col vecchio ricarico). Foto `public/immagini/vetrate/book-pro-cam.jpg|solco-pro-cam.jpg`, schede tecniche dal sito chirenti.it in `public/cataloghi/book-pro-cam|solco-pro-cam/`
  (voci in `SCHEDE`). Nell'offerta nome leggibile e misura al posto della «fascia listino»; in stampa le righe «TARIFFA AL …» non diventano più un colore (`coloreLeggibile`). Collaudo `chirenti` (11).
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
- **Coprifili, angolari e listelli in PVC per la posa** (richiesta di Ugo 18/11/2026: «solo il listino dei coprifili ed angolari, piatte da 30/60… con i colori,
  da aggiungere all'ordine fornitore»; INDOOR › COPRIFILI E ANGOLARI): 81 articoli EXTE (listino pubblico «Exte Catalogo-Listino Italiano 2023-2024», prezzi per 100 m, colonne
  bianco / bianco con pellicola protettiva / rivestito) in `prisma/seed-data/coprifili_exte.json` (`python3 -I scripts/listini/estrai_coprifili_exte.py exte.txt <json>` da `pdftotext -layout`):
  coprifili piatti 20–150 (anche adesivi), angolari a lati uguali e diversi, piegabili, scatolati 7 mm (anche con baffo, adesivi). `src/lib/listini/coprifili.ts` (puro): tipologie
  `COPRIF_<codice EXTE>`, varianti «<colore> — al metro» (bianco, protettiva, bianco Salamander +15%, pellicolati con il sovrapprezzo EXTE della pellicola 0/5/15%, «Altro colore
  pellicolato +15/20/50%»; solo dove il catalogo ha il prezzo), vendita = costo × `RICARICO_COPRIFILI` 2, modello con fornitore EXTE (creato per nome), `codiceFornitore` = codice EXTE e
  `scontoAcquisto` 50% → costo previsto negli ordini = listino EXTE. Al metro come la lattoneria (`lattAlMetro` vale anche per `COPRIF_`: lunghezza del pezzo in cm). Nome leggibile
  «Coprifilo piatto 30 x 2,5 (EXTE 65025030)». Rotta `api/admin/seed-coprifili` (GET prova, POST carica, rilanciabile). Test `tests/listini/coprifili.test.ts`, collaudo `coprifili` (9).
- **Serramenti alluminio a taglio freddo e verande** (INDOOR › SERRAMENTI › «Alluminio — Taglio freddo e verande»; ha sostituito il segnaposto
  `SERRAMENTI_ALLUMINIOFREDDO_PLACEHOLDER`): listino P&C già di vendita al m² in `src/lib/listini/taglio-freddo.ts` (puro). 10 tipologie
  `TAGLIOFREDDO_<SCORR|SCORRTT|BATT|BATTTT|PIEG|FISSO>_<33|VC>` (sistema × vetro 3+3 / vetrocamera 2+2/12/4; le combinazioni «/» del listino non ci sono),
  `MQ_CON_MINIMI` (una riga «TARIFFA AL M²», misure in cm arrotondate ai 5 cm, nessuna area minima), 2 tendine sistema → vetro. Optional listino `TAGLIOFREDDO`:
  colori (bianco/argento/avorio compresi, altri +10%), supplementi (doppio telaio 720, foro vetrocamera 100, wasistas 245 cad. oltre al m², centinate +40%),
  smontaggio veranda 24 €/m² (quantità = m²), sconti per quantità −5/−10/−15% (percentuali negative, da mettere su ogni riga oltre 10/20/30 m² totali).
  Rotta `api/admin/seed-taglio-freddo` (GET prova, POST carica), foto in `public/immagini/taglio-freddo/`. Test `tests/listini/taglio-freddo.test.ts`, collaudo `taglio-freddo` (11).
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
  (`fileRilievo`); servizio API Resend/Brevo solo di riserva. Collaudo `ordine-da-rilievo` (30, SMTP finto).
  Dopo la prova di Ugo (pratica Armentano): il rilievo è un modulo unico `components/commesse/CaricaRilievo.tsx` (misure, PDF/foto, «già nella pratica»
  = righe d'ordine o, prima del rilievo, righe dell'offerta, e «da aggiungere» con `ScegliMateriale.tsx`, lista solo nel browser) con un solo «💾 Salva»:
  `caricaRilievo` riceve `complementi` (JSON) e li crea con `creaComplemento` (errori in `?avvisoRilievo=`, conferma in `?fatto=`). Il materiale con le spunte
  sta nella sezione «4 · Evasione ordini» (`#evasione`, `#materiale-pratica`); `TaskCard` porta i task RILIEVO a `#rilievo` e ORDINI a `#evasione`. Nell'invio
  si scelgono i file del rilievo da allegare (`fileRilievo: id[]`, di partenza i PDF). Offerta sbloccata con la commessa già aperta: pannello arancione
  «💾 Salva la variante» (`salvaVariante`, solo amministratore; anche `confermaOrdinePreventivo` ci passa): riblocca, aggiorna totali della commessa e
  acconto se non incassato, rigenera le righe non ordinate tenendo il fornitore, aggiunge le nuove; quelle già ordinate non si toccano (avviso nel log).
- **Progetti come in BConsole** (richiesta di Ugo, nov 2026): ogni commessa (= offerta confermata) è un progetto con i suoi ordini; nella scheda cliente
  la sezione «📁 Progetti» (prima scheda, `?sez=progetti`) con N. progetto, data, descrizione, tipologia (marchio), consegna, ordini fornitori, totale e stato,
  più i progetti di BConsole (`storico.progetti`, sola lettura). `Commessa.consegnaPrevista` (deadline, `salvaConsegnaPrevista`, spostamenti nello storico;
  `statoConsegna` in `lib/commesse.ts`: rossa se scaduta, arancione entro 7 giorni), mostrata anche nell'elenco commesse. Nella pratica: intestazione
  «📁 Progetto», pulsanti veloci (`#rilievo #evasione #acconto #costi #posa #storico #documenti`), materiale dal listino con lo stesso `SelettoreProdotto`
  dell'offerta (albero in `src/lib/listini/tassonomia.ts` `tassonomiaListino`, condiviso con la pagina dell'offerta; azioni `complementoDaListino` /
  `complementoDaListinoPerMisura`, il campo «preventivoId» porta l'id della commessa; complemento tipo «PR» = prodotto già individuato) e barra delle righe
  spuntate (`components/commesse/BarraAzioniMateriale.tsx`, sticky in fondo al riquadro): ordine al fornitore, sposta in un altro progetto dello stesso cliente
  (`spostaRigheProgetto`, solo righe non ordinate), task a un ufficio con l'elenco (`taskDaRighe`), togli il materiale aggiunto (`eliminaRigheMateriale`).
  File del progetto come in BConsole: cartelle della commessa «Rilievi misura», «Foto rilievi», «Conferme d'ordine fornitori», «Foto posa», «Documenti posa»,
  «Contratto firmato», «Documentazione finanziamento» + quelle di prima (`CARTELLE.COMMESSA`; nel progetto si vedono tutte, anche vuote); in fondo alla pratica
  «📷 Foto del progetto» (`components/commesse/FotoProgetto.tsx`: rilievi, posa, immagini dei documenti di pratica e offerta). Nell'invio dell'ordine si scelgono
  anche i file delle cartelle (`documentiProgetto` in `lib/ordini/server.ts`, opzione `documenti: id[]`, di partenza quelli di «Rilievi misura»).
  Distinta base / prodotti correlati (kit): modello `ComponenteKit` (brandId+tipologia del modello, descrizione, quantità, `calcolo` PEZZO|METRO|MQ|FISSO,
  `facoltativo`, articolo/fornitore/costo), gestita nella scheda del modello (`/prodotti/modello/[tipologia]#kit`, `src/app/kit-actions.ts`, permesso
  `listini.modifica`). Quantità con `quantitaComponente` (`src/lib/listini/kit.ts`, puro e testato: metri/m² dalle misure della riga nell'unità del listino, per
  eccesso). `aggiungiKit` (commesse-actions) mette i pezzi «sempre» nel materiale come righe `complemento` con `RigaOrdine.kitDiId` = riga madre, quando entrano
  le righe dell'offerta (`assicuraRigheOfferta`, che ora salva `RigaOrdine.prodottoId`) o un prodotto dal listino (`creaComplemento` P/PR); i facoltativi si
  propongono nel riquadro «🔗 Correlati suggeriti» (`aggiungiCorrelato`). Togliendo una riga vanno via i suoi pezzi non ordinati; nella variante i pezzi già
  ordinati si ricollegano alla riga rigenerata senza doppioni. Collaudo `kit` (15).
  Da fare (chiesto da Ugo): bolla di consegna al cliente e fattura dalle righe, «crea progetto» dalle righe.
  Collaudo `progetti` (14).
- **Percorso guidato del progetto** (richiesta di Ugo 16/11/2026, dopo aver guardato i progetti di BConsole in sola lettura: lì il progetto nasce dall'ordine cliente, ha
  8 fasi fisse, report economico, prodotti utilizzati, correlazioni e file; qui si sceglie un percorso più semplice): riquadro «📁 Progetto» (`#progetto`,
  `components/commesse/PercorsoProgetto.tsx`) in cima alla pratica. Dopo l'incasso dell'acconto (o finanziamento approvato) compare «➕ Crea progetto» (`creaProgetto`,
  `Commessa.progettoCreatoIl/DaNome`; lo preme Debora e chiude il task `PROGETTO`); dentro 5 passi in ordine (`src/lib/progetti/percorso.ts` puro e testato, dati in `percorso-server.ts` `percorsoDiCommessa`):
  1 appuntamento di rilievo (`programmaRilievo`, bloccato finché non si crea il progetto), 2 caricamento rilievi (`caricaRilievo` → rilievo ESEGUITO), 3 prodotti e materiale
  (righe con il fornitore; «✅ Conferma materiale» = `confermaMaterialeProgetto`, `materialeConfermatoIl`, chiude il task RILIEVO e fa partire quello dell'ufficio ordini),
  4 ordini ai fornitori (`creaOrdineDaRighe` bloccato finché il materiale non è confermato; passo fatto quando tutte le righe sono `ordinato`), 5 arrivo in magazzino
  (`materialeCompletoIl` da `verificaMaterialeCommessa`: parte da solo il task di saldo e posa). Pratiche già avviate (rilievo, materiale, ordini o ordine BConsole presenti,
  `praticaLegacy`) non hanno i blocchi. Test `tests/progetti/percorso.test.ts`, collaudo `progetto-percorso` (20). Da fare: etichetta del passo nell'elenco commesse.
- **Appuntamenti da BConsole** (richiesta di Ugo per Cristina, nov 2026: passaggio definitivo del centralino su ONE): calendario di BConsole letto in sola
  lettura (`attivita/listCalend` a settimane, script in scratchpad `bc/estrai-cal.js`; eventi «calendario» di origine bconsole, niente interventi né Google) e
  portato con la rotta `api/admin/importa-appuntamenti-bconsole` (POST `{ eventi, staff }`, `?prova=1` conta, `?aggiorna=1` riprende data/durata/stato/incaricato
  da BConsole). Conversione pura `convertiEventoBC` (`src/lib/calendario/bconsole.ts`, test): «Cliente - oggetto», stato (ANNULLATO / completata → COMPLETATO /
  CONFERMATO / PROGRAMMATO), tipo (chiamata → TELEFONICO…), durata, note con n. attività; impegni interni (a nome di un collega in `staff`) esclusi. Incaricato
  per nome (`chiaveNome`, ordine delle parole libero), «Info P&C» = la telefonista; cliente per telefono o nome (`indiceClienti`), altrimenti creato.
  `Appuntamento.chiaveImport` = «BC|<n. attività>»: niente doppioni ai rilanci, quanto cambiato nel CRM resta. Nessun invito né email. «Info P&C» = `?centralino=<nome>`
  (es. cristina; senza, la prima telefonista attiva). Caricati in produzione il 9/11/2026 da settembre in avanti. Collaudo `appuntamenti-bconsole` (12).
  Riordino dopo l'import (rotta `api/admin/riordina-appuntamenti`, GET prova con l'elenco, POST esegue, rilanciabile; regole pure in
  `src/lib/calendario/riordino.ts`, test): `doppioniImportati` toglie gli appuntamenti «BC|» che doppiano uno di P&C ONE (stessa persona per cliente,
  telefono, email o nome in qualsiasi ordine, stesso giorno di Roma; non se quello di ONE è annullato) e i clienti creati dall'import rimasti vuoti;
  `leadDaAvanzare` porta i lead appesi (`FASI_DA_FISSARE`) ad APPUNTAMENTO_CASA/SHOWROOM quando la persona ha un appuntamento (non di una telefonista; quelli telefonici del commerciale → APPUNTAMENTO_TELEFONICO) dopo l'arrivo del lead (dopo l'ultimo esito solo per DA_RICHIAMARE / APPUNTAMENTO_ANNULLATO; diagnosi in sola lettura con `?diagnosi=1`)
  (storico «aggiornato in automatico», utente «Automatico», invii in coda annullati, nessuna email, cliente collegato con `leadOrigineId`).
  Nei «Task di oggi» i lead con appuntamento già passato non compaiono più (li esita il venditore). Collaudo `riordino-appuntamenti` (15).
- **Passaggio da Keap** (nov 2026): `api/admin/verifica-keap` (sola lettura: GET coda delle email e cosa partirebbe, POST abbina contatti Keap a
  lead/clienti per email/telefono/nome) e `api/admin/switch-keap` (una tantum; POST con i dati nel corpo, senza `?esegui=1` è una prova): annulla la coda
  creata prima dello switch, programma solo i promemoria (cliente + venditore) degli appuntamenti futuri con venditore (subito se l'ora è passata e mancano
  almeno 3 ore; `escludiLead` per i casi dubbi; lead creato per i clienti con appuntamento solo in calendario), crea i ricontatti Keap come lead
  DA_RICHIAMARE della telefonista senza email (ID Keap e abbinamento nelle note, fonte `keap`), `?attiva=1` accende le email. Collaudo `switch-keap` (12).
- **Pratica da BConsole, riquadri uniti e aggancio dell'offerta** (Ugo 22/11/2026, pratica Alberto Abramo): `DatiPassi.daBConsole` (`Commessa.ordineBC`) segna fatti progetto, benvenuto e fattura di acconto, `statoSogliaRilievo` dà via libera al rilievo; `passoDaMostrare` apre RILIEVO anche se il passo corrente è l'appuntamento (il «Carica il rilievo» del task non resta più muto) e la sezione mostra il modulo «Programma rilievo» se non c'è ancora un rilievo. Il riquadro «📁 Progetto» è ora solo una fascia con le azioni (Crea progetto, Conferma materiale); stato e «📊 Report economico» stanno nell'unica riga «✅ Avanzamento e progetto». `agganciaOffertaONE` (`commesse-actions.ts`, riquadro ambra `#offerta-one` in cima alla pratica, sempre visibile per `ordineBC`): COPIA sezioni, righe e optional di un'offerta di ONE dello stesso cliente (anche già legata a un'altra pratica, che resta com'è) nell'offerta della pratica al posto delle righe di testo dell'import, tiene i totali di BConsole e porta le righe nel materiale (`assicuraRigheOfferta`); rifiutata con ordini già fatti. Collaudo `presa-in-carico-bc` (14), test `tests/pratica/passi.test.ts`.
- **Coprifili in Serramenti con due tendine** (Ugo 22/11/2026: «non trovo il listino… andava in serramenti PVC, scelto con le tendine»): i 81 articoli EXTE stanno in INDOOR › SERRAMENTI › «PVC — Coprifili e angolari» (`GRUPPO_COPRIFILI` = SERRAMENTI, `SOTTOGRUPPO_COPRIFILI`), scelti con `assiSelezioneCoprifili` (tendina «tipo di profilo» → «misura», poi colore e lunghezza in cm; passa dallo stesso `assiIsomax` della tassonomia). Il listino si carica da solo (`assicuraCoprifili` in `coprifili-server.ts`, una volta per `VERSIONE_COPRIFILI`, chiave `coprifili_versione`) aprendo un'offerta, il listino del rilievo (`/api/listino/albero`) o la ricerca del materiale; prima serviva lanciare la rotta `seed-coprifili` a mano e in produzione non era mai stata lanciata. Collaudo `coprifili` (12).
- **«Sfoglia il listino» a due tendine** (Ugo 22/11/2026, dal listino della pratica: Optima era un elenco di 12 voci): `/api/listino/albero` porta in ogni voce `assi` (da `assiZenith` = categoria → modello, o `assiIsomax` = modello → misura/apertura) e `VociATendine` (`ScegliMateriale.tsx`) mostra due menu a cascata (es. Finestre → 1 anta) quando tutte le voci del sottogruppo li hanno: serramenti PVC (Zenith, Optima, Fidra, Plasma 30), porte, coprifili; gli altri sottogruppi restano elenco.
- **Serramenti divisi per materiale** (Ugo 22/11/2026): nell'albero mostrato il gruppo SERRAMENTI si divide in «SERRAMENTI · PVC», «· PVC Alluminio», «· Alluminio», «· Legno», «· Legno-Alluminio» (+ Acciaio, Cassonetti) con dentro le famiglie (Optima 70, Zenith…, i coprifili in «SERRAMENTI · PVC › Coprifili e angolari») e poi le tendine; `dividiSerramentiPerMateriale` in `tassonomia.ts`, solo visualizzazione: nel database i modelli restano gruppo SERRAMENTI e i sottogruppi «Materiale — Famiglia» (optional e ricambi usano il gruppo del database).
- **«SERRAMENTI» con la tendina del materiale nel «Sfoglia il listino»** (Ugo 22/11/2026): in `ScegliMateriale.tsx` i gruppi «SERRAMENTI · PVC/Alluminio/…» sono una sola voce «SERRAMENTI» (`raggruppaSerramenti`, `SerramentiATendina`): tendina del materiale, poi le famiglie e le due tendine. Nella finestra «Aggiungi prodotto» dell'offerta restano tessere separate per materiale.
- **Coprifili a barra intera** (Ugo 22/11/2026: «sono in barre da 6000 mm, si compra la barra intera, il prezzo è a metro»): le varianti si chiamano «<colore> — barra da 6 m» e `prezzoBase` è PER BARRA = costo EXTE al metro × 6 × `RICARICO_COPRIFILI` (`LUNGHEZZA_BARRA_M`); niente più lunghezza in cm (`lattAlMetro` non vale più per `COPRIF_`), la quantità è il numero di barre e il costo previsto negli ordini è la barra intera (sconto 50%). `assicuraCoprifili` `VERSIONE_COPRIFILI` «2026-11-22b» ricarica da solo il listino e toglie le vecchie voci «al metro» non usate.
- **Materiale aggiunto a mano: modifica, duplica, elimina** (Ugo 22/11/2026, «in evasione ordini ho solo la scritta togli che non funziona»): nella tabella «Materiale della pratica» ogni riga `complemento` non ancora ordinata ha `AzioniRigaMateriale` (client, dentro il modulo con le spunte: «✏️ modifica» apre descrizione/quantità/nota, «⧉ duplica», «🗑 elimina» con conferma; Invio nei campi salva la riga e non crea l'ordine). Azioni `modificaComplemento` (il costo previsto segue la quantità), `duplicaComplemento`, `eliminaComplemento` (toglie anche i pezzi kit non ordinati) in `commesse-actions.ts`: rifiutano le righe già ordinate e rimandano alla pratica con il messaggio verde/rosso (`?fattoMateriale=`/`?avviso=`, `passo=MATERIALE#evasione`). Collaudo `rilievo-complementi` (39).
- **Ordine senza blocco e niente task doppi** (Ugo 22/11/2026, pratica Alberto Abramo): `creaOrdineDaRighe` non rifiuta più con «Prima conferma il materiale»: se il progetto c'è, ordinare le righe scelte conferma da solo il materiale (`materialeConfermatoIl`); `praticaLegacy` è sempre vero per le pratiche da BConsole (`ordineBC`), anche dopo «Crea progetto». `avviaFaseFlusso` non crea un secondo task se quello della stessa fase è già aperto (prima «Confermare il materiale» compariva due volte). Collaudi `progetto-percorso` (21), `flusso-uffici` (43).
- **Un solo passaggio per fase in «Avanzamento»** (Ugo 22/11/2026, «una per ogni avanzamento e basta»): `scegliTaskDoppi` (`src/lib/pratica/task-doppi.ts`, puro, test `tests/pratica/task-doppi.test.ts`) tiene per ogni `faseChiave` un solo task (l'aperto con costo o «in corso», poi il più vecchio aperto, poi l'ultimo chiuso); aprendo la pratica i doppioni ancora aperti vengono ANNULLATI e non si mostrano; tolto il paragrafo introduttivo.
- **Foto vetrate panoramiche** (Brillante/Scintilla/Fisso, fornitore Vepa): `public/immagini/vetrate/` dalle schede tecniche PDF (immagini CMYK invertite: canali
  da invertire prima di convertire in RGB); messe in produzione con `api/admin/immagini-vetrate` (solo immagini mancanti, non tocca i prezzi). Fisso: foto generica.
- **Fatturazione: fatture emesse e DDT di uscita** (ufficio Giorgia; `/fatturazione`, permesso `fatturazione` = AMMINISTRATIVO, uffici FATTURAZIONE/AMMINISTRAZIONE
  o chiunque abbia `amministrazione`; `src/app/fatturazione-actions.ts`, `src/lib/fatturazione/`: `tabelle.ts` (come BConsole, letto il 9/11/2026: cedente, sezionali
  P&C «FE», Fotovoltaico «FO», Sconto in fattura «SCF», Plasma «PL», Pura Fonte «PF», R.A «A»; tipi FATTURA/ACCONTO TD02/SALDO/ACCOMPAGNATORIA/DIFFERITA TD24/NOTA_CREDITO TD04/
  NOTA_DEBITO/PROFORMA; codici IVA con natura; metodi di pagamento con MP e rate F.M.; causali di trasporto, porto, aspetto beni), `calcoli.ts` puro (righe, riepilogo IVA,
  bollo 2 € oltre 77,47 € esenti, rate, numerazione «N/EST/anno»), `xml.ts` (FatturaPA FPR12, validato con l'XSD 1.2.2 ufficiale), `pdf.ts` (copia di cortesia e DDT),
  `server.ts` (numeri, `emetti`, righe dall'offerta)). Modelli `FatturaEmessa`/`RigaFatturaEmessa` (BOZZA → PROVA | EMESSA) e `DdtUscita`/`RigaDdtUscita`
  (BOZZA → DA_FATTURARE → PARZ_FATTURATO/FATTURATO, o CHIUSO). Emissione vera solo con `fatturazione_reale` = "1" (Fatture e DDT › Numerazione, la accende solo
  l'amministratore): altrimenti numeri «PROVA …», niente vendite. Vera: numero dopo il più alto fra FatturaVendita importate (`progressivoDa`), CRM e ultimo indicato
  (`fatt_ultimo_<sez>_<anno>`, `ddt_ultimo_<anno>`), lock advisory; crea la `FatturaVendita` (origine `CRM`, chiave `CRM|<id>`, XML) e le scadenze con `creaScadenzeVendita`.
  Acconto dalla commessa (`propostaDaCommessa`), saldo = righe dell'offerta − acconti fatturati (CRM o BConsole TD02), fattura differita da più DDT dello stesso cliente,
  nota di credito che storna (fattura collegata). Emessa = non si modifica né elimina. PDF `GET /api/fatturazione/fattura/<id>/pdf`, XML `/xml`, DDT `/api/fatturazione/ddt/<id>/pdf`;
  ricerca clienti senza scope `/api/fatturazione/clienti`. Fino allo SDI (2027) l'XML si carica a mano. Test `tests/fatturazione/calcoli.test.ts`, collaudo `fatturazione` (29).
- **Campagne, richieste di Rocco (nov 2026)**: nome modificabile dal titolo della campagna (`rinominaCampagna`, `FormAutoSalva`; `salvaCampagna` non tocca più il nome),
  «⧉ Duplica» e «🗑 Elimina» (con conferma, anche le già inviate: vanno via invii e statistiche) su ogni riga dell'elenco. A/B test (`Campagna.abTest`,
  `CampagnaVariante` nome/oggetto/preheader/formato/testo/html, `CampagnaInvio.varianteId`): scheda «🧪 A/B test» e «+ Nuovo A/B test» nell'elenco, o «Fai un A/B test»
  dentro la campagna (`impostaAbTest`, i gruppi partono dalla versione salvata); `components/campagne/GruppiAB.tsx` con «Numero gruppi» (2-10, a mano o +/−), nome e versione
  per gruppo (`CampiEmail prefisso="g<i>_"`, campi `gruppi` + `g<i>_…` nel modulo di `salvaCampagna`). `accodaCampagna` divide i nuovi contatti in parti uguali
  (`assegnaGruppi` in `src/lib/campagne/abtest.ts`, puro e testato: ordine da impronta campagna+cliente, al gruppo che ne ha meno), `contenutoDi` sceglie la versione
  all'invio; prova = una email per gruppo; risultati per gruppo con 🏆. Gruppi già partiti non si tolgono. Invio programmato (`Campagna.programmataIl`,
  stato PROGRAMMATA; `programmaCampagna`/`annullaProgrammazione`, controlli comuni in `primaDiInviare`): `eseguiCampagne` mette in coda le programmate arrivate all'ora
  (destinatari calcolati in quel momento), quindi parte al primo controllo dopo l'ora (CRM aperto, cron o controllo esterno). Collaudo `campagne-ab` (19, SMTP finto).
- **Svolta appuntamenti senza Facebook** (richiesta di Ugo, nov 2026: nuovo commerciale da riempire di appuntamenti, Meta troppo cara):
  nelle Campagne la «Situazione del contatto» (`Campagna.situazione` OFFERTA_APERTA | HA_COMPRATO | MAI_COMPRATO, periodo `offerteDal/offerteAl`):
  `src/lib/campagne/situazione.ts` (chi ha comprato = commessa non annullata, offerta confermata, ordine BConsole `DocumentoBC` ORDINE o OFFERTA «Confermato»/«Parz.Confermato», fattura di
  vendita non TD04; chi ha un'offerta = preventivo CRM o `DocumentoBC` OFFERTA nel periodo) + `clientiPerSituazione` puro (`soloClienti`/`escludiClienti`
  in `whereCampagna`; `filtriCampagna` asincrona in `motore.ts`). «Chi clicca diventa una chiamata» (`Campagna.richiama`, `richiamaTelefonistaId`):
  al primo clic (rotta `api/traccia`) `richiamaDaCampagna` (`src/lib/campagne/richiamo.ts`, regola pura `azioneRichiamo`): lead del cliente
  (`leadOrigineId`) chiuso → riaperto in RECUPERO con scadenza adesso (invii in coda annullati), aperto → scadenza anticipata a oggi, con appuntamento →
  solo nota, nessun lead → creato (fonte `campagna`, fase RECUPERO) e agganciato al cliente; evento `campagna.clic`. Costo per canale
  (`/marketing/costi`, permesso marketing): `SpesaMarketing` (mese+canale unico, `salvaSpeseMarketing` in `src/app/spese-marketing-actions.ts`), calcoli puri
  `src/lib/marketing/costi.ts` (lead del mese per `provenienzaDaFonte`, appuntamenti, contratti = commessa/offerta confermata del cliente nato dal lead,
  € per lead/appuntamento/contratto, resa). Test `tests/marketing/svolta.test.ts`, collaudo `svolta-appuntamenti` (14).
- **Esito degli appuntamenti** (segnalazione di Cristina, decisione di Ugo nov 2026; `src/lib/appuntamenti/esiti.ts` puro e testato, `esiti-server.ts`,
  `src/app/esiti-actions.ts`, `components/lead/RegoleEsiti.tsx`): «✅ Svolto» del commerciale (`esitoAppuntamento` COMPLETATO) → `chiudiLeadDopoVisita` porta il lead
  collegato (`appuntamentoId`, o `leadOrigineId` del cliente con lo stesso venditore) nella fase chiusa `APPUNTAMENTO_SVOLTO`, annulla gli invii in coda, evento in cronologia.
  Visite PROGRAMMATO/CONFERMATO non esitate (dal giorno `esiti_dal`, default 9/11/2026; le telefoniste escluse): dopo `esiti_giorni_promemoria` (1) riquadro rosso in Dashboard
  e email ogni mattina feriale (`inviaPromemoriaEsiti` in `/api/automazioni/esegui`, una al giorno `esiti_mail_giorno`); dopo `esiti_giorni_lista` (2) nella pagina
  `/lead/senza-esito` del centralino (pulsante nei task). Blocco facoltativo (`esiti_blocco_attivo`, spento di serie; `esiti_blocco_soglia` 3; `esiti_sbloccati` JSON):
  `controlloBlocco` in `registraEsito`/`assegnaVenditore`. Regole in Impostazioni › Lead `#esiti`, permesso `lead.esiti` (solo amministratore). Una tantum
  `POST api/admin/lead-scaduti?esegui=1` chiude i lead già svolti; `GET ?persona=` diagnosi dei lead scaduti. Collaudo `esiti-appuntamenti` (12).
- **Consumo del database** (richiesta di Ugo 15/11/2026: Neon ha bloccato il CRM per i 5 GB di traffico del piano gratuito; ora piano Launch, gestito da
  Vercel › Storage › neon-bistre-pocket, Neon ID `dry-frog-66834498`): `/impostazioni/database` (permesso `database`, solo amministratore) con costo fin qui, previsione a
  fine mese, traffico, ore di calcolo e budget (`src/lib/database/consumi.ts` puro e testato: `consumoDaNeon`, `stimaCosto` con `PREZZI_LAUNCH`, `valutaAvviso` 80%/oltre,
  `daAvvisare` una volta al giorno per livello; `consumi-server.ts`: chiave dell'API di Neon cifrata `neon_api_key`, GET `/projects/{id}`, `NEON_API_BASE` simulabile).
  `controllaConsumi` in `/api/automazioni/esegui` (una lettura all'ora, email agli amministratori o a `neon_avvisi_a`). Misure interne (spazio, tabelle più lette
  da `pg_stat_user_tables`) anche senza chiave; diagnosi `GET /api/admin/stato-database` (x-seed-key, + `pg_stat_statements` se attivo). `/api/automazioni/esegui`
  risponde 503 se il database non risponde (cron-job.org con «Notify me when the cronjob fails» avvisa). Collaudo `consumi-database` (10).
  **Stato del collegamento (18/11/2026)**: il database è il Neon gestito da Vercel (team `ugo9`, progetto `dry-frog-66834498`, eu-central-1): NON compare nell'account Neon di Ugo (l'organizzazione «Ugo» è vuota) e Vercel non fornisce nessuna chiave dell'API di Neon (`NEON_API_KEY` assente; solo `DATABASE_URL`, `NEON_PROJECT_ID`, credenziali `PG*`/`POSTGRES_*`, `NEON_AUTH_BASE_URL`). Quindi la lettura di costi/traffico dentro ONE non è attiva: in Impostazioni › Database il pulsante «Vedi i consumi su Vercel» (Storage › neon-bistre-pocket › Usage) e le misure interne. Diagnosi di sola lettura: `GET /api/admin/stato-collegamento-neon` (x-seed-key, solo nomi di variabili e host). Ugo non vuole più creare chiavi: non chiedergliene altre per Neon.
  **Da tenere a mente**: ogni nuova pagina/controllo deve leggere solo i campi che servono (`select`), mai data URI, HTML delle email, XML o file
  (`Documento.contenuto`) negli elenchi; dopo modifiche grosse guardare la pagina dei consumi.
  Alleggerimenti fatti (16/11/2026): albero del listino e optional del marchio 5 minuti in memoria (`src/lib/listini/cache.ts` `inMemoriaListino`,
  `tassonomiaListino`/`optionalAttiviDelMarchio`; `svuotaCacheListino()` in aumenti e scheda modello), `omit: { immagineCopertinaUrl: true }` (preview `omitApi`)
  negli elenchi delle offerte (Preventivi, Dashboard, Commesse, scheda cliente), promemoria campagne con `select`.
- **I miei progetti** (`/progetti`, richiesta di Ugo dopo la presentazione, nov 2026; `src/lib/progetti/miei.ts` puro e testato, `server.ts` `progettiDi`): il commerciale
  (visibilità PROPRI; chi vede di più ha la tendina dei commerciali e il titolo «Progetti dei clienti») vede tutte le commesse dei suoi clienti con le tappe del flusso
  (`Stepper` di `components/clienti/PraticaCard.tsx` + `passiPratica`), «Adesso: fase · ufficio», consegna prevista col semaforo (`semaforoConsegna`: scaduta, entro 7 giorni,
  nei tempi) e quanto ha pagato il cliente (scadenze INCASSO della commessa o delle fatture di vendita agganciate, `residuoScadenza`; senza scadenze i flag acconto/saldo).
  Schede In corso / Conclusi / Tutti, ricerca, ordine: scadute, vicine, poi per consegna. In Dashboard il riquadro «📁 I miei progetti in corso» (solo visibilità PROPRI).
  Test `tests/progetti/miei.test.ts`.
- **Raccolta punti «kit al cliente»** (richiesta di Ugo, nov 2026; da non confondere con il «kit» = distinta base dei prodotti): a lavoro finito (commessa POSA,
  LAVORI_ESEGUITI o CHIUSA, `puoConsegnareKit`) il commerciale consegna il kit P&C al cliente e lo registra nella pratica (riquadro `#kit-cliente`,
  `components/commesse/KitCliente.tsx`, `src/app/kit-cliente-actions.ts`): modello `ConsegnaKit` (una per commessa), foto facoltativa nei Documenti cartella
  «Consegna kit», recensione segnabile anche dopo (ricalcola i punti), evento nello storico. Punti `puntiConsegna` (di serie 10, +5 foto, +10 recensione) e premi
  del mese/anno in Configurazione `kit_*`, modificabili in `/kit` › Regole e premi (permesso `kit.regole`, di serie solo amministratore; i punti già dati non cambiano;
  annullare una consegna solo con lo stesso permesso, nel registro). Pagina `/kit` «🎁 Raccolta punti kit» (permesso `commesse`): i tuoi punti, classifica del mese
  e dell'anno (`classifica`, pari merito), lavori finiti senza kit (`praticheSenzaKit`), ultime consegne. In «I miei progetti» il pulsante «🎁 Registra il kit».
  Spunta veloce dell'ufficio (richiesta di Ugo): «✅ Kit consegnato» con un clic nella pratica e nella lista dei lavori finiti (`torna=kit` riporta alla lista),
  punti sempre al commerciale dell'offerta; chi in ufficio non vende (`vedeSoloISuoiKit`: visibilità PROPRI ma non `eVenditore`) vede tutti i lavori finiti;
  il commerciale vede «✅ 🎁» accanto al cliente in «I miei progetti».
  `src/lib/kit/punti.ts` puro (test `tests/kit/punti.test.ts`), collaudo `kit-cliente` (20).
- **Solaris Studio** (`public/solaris-studio/studio.html` servito da `api/solaris/studio/[id]`, documentazione in `docs/solaris-studio/`):
  «🛰️ Foto dal satellite» = indirizzo del passo 1 → `GET /api/solaris/geocodifica` (Esri, riserva OpenStreetMap) → tessere Esri World Imagery da
  `GET /api/solaris/satellite?z&x&y` (zoom 20, se manca 19; solo sessione, niente DB), falda disegnata da sola e misure dai pixel (`P.mpp`); scatto
  automatico aprendo «Foto del tetto» e alla riapertura (`P.sat`; l'immagine non va in `statoJson`). Conti puri in `src/lib/solaris/satellite.ts`.
  Con la chiave Google (Impostazioni › Google `#mappe`, `salvaChiaveMappe` la prova e la salva cifrata in `solaris_google_maps_key`, o env `GOOGLE_MAPS_API_KEY`;
  `src/lib/solaris/google-mappe.ts`) la foto arriva da Maps Static API (`?fonte=google`, 1280 px, zoom 17–21) e `GET /api/solaris/tetto` chiede la falda
  a Google Solar API (`faldeDaSolar`/`faldaMigliore`/`misureFalda`: angoli, inclinazione e orientamento da soli); senza chiave Esri. L'indirizzo all'uscita
  dal campo dà il comune (`S.cityGps`, salvato) e la posizione (`S.addrPos`); alla riapertura `ripristinaCampi` rimette nome, indirizzo, località e scelte.
  Come Reonic: al passo 1 mappa Leaflet (`#mappaCasa`, tessere `?fonte=gtile` = Google Map Tiles API con sessione creata dal server in `tesseraGoogle`, o Esri senza
  chiave; `googleMappe` in `SOLARIS_INIT`) con il segnaposto 📍 da trascinare o toccare sul tetto (`puntoTetto` → `S.addrPos.manuale`, la foto del passo 2 riparte da lì).
  Al passo 2 anche «🖥️ Cattura dallo schermo» (`getDisplayMedia`, come «Segnala un problema») e incolla con Ctrl/Cmd+V (`fotoDaImmagine` → `caricaFotoTetto`, vista dall'alto).
  Prodotti Stealth Energy (`src/lib/solaris/stealth.ts`, inverter ST-INV-S/T e batterie SP-HEV50…, prezzi a 0 da completare): creati da soli in
  `SolarisComponente` alla prima apertura dello Studio (`createMany skipDuplicates`); batterie scelte nello Studio (`S.battId`, moduli con `moduliPer`)
  e portate in offerta. Pannelli sulla foto alla misura vera (`postiFalda`: falda P.w × P.l in metri, margine 30 cm, fughe 2 cm, verticali o
  orizzontali `P.orient`): i posti liberi tratteggiati, quelli scelti in `P.celle` («fila,colonna», dalla grondaia e dal centro, `ordinePosti`); il numero
  resta quello scelto o «Dimensiona sui consumi» (`P.voluti`, limitato ai posti della falda) e un tocco sulla foto aggiunge o toglie il singolo pannello.
  «← Torna al preventivo» (`src/lib/solaris/porta-in-offerta.ts` `portaSolarisInOfferta`, rotta `POST /api/solaris/progetto/[id]/offerta`, anche «↓ Importa nel
  preventivo»): salva subito lo Studio (`salvaOra`), porta le righe ☀️ (pannelli anche di serie non a catalogo, nome/prezzo dallo Studio; inverter, batteria a moduli,
  installazione, kit) sostituendo quelle portate prima (niente doppioni, spunta della scheda tenuta per tipo) e la foto del tetto con i pannelli in copertina
  (`SolarisFoto` tipo OFFERTA servita da `GET /api/solaris/foto/<id>`, pubblica solo per quel tipo; un render messo a mano non si tocca). Schede tecniche del
  fotovoltaico dai dati dello Studio (`statoJson.schedeOfferta`, `src/lib/solaris/schede-offerta.ts`): come gli altri listini, spunta «📄 Allega la scheda tecnica» sulle
  righe pannello/inverter/batteria → in fondo all'offerta stampata (`components/preventivi/SchedeSolaris.tsx`), altrimenti solo dal link `/preventivi/[id]/schede-solaris`.
  Totali dell'offerta in `src/lib/preventivi/totali.ts`. Test `tests/solaris/porta-in-offerta.test.ts`, collaudo `solaris-offerta` (14).
  Test `tests/solaris/`.
- **Listino Solaris da BConsole** (16/11/2026, export «export_pro.xls» dell'anagrafica articoli di BConsole): 104 articoli in `prisma/seed-data/solaris_bconsole.json`
  (preparati con scratchpad `export_pro/prepara.py`: esclusi climatizzatori già a listino, voci a 0 €, copie «… copy» e MHPP14RP24P3ST1 a 948.100 €), foto ridotte in
  `public/immagini/solaris-bc/`. Ogni articolo = un modello `SOLBC_<FV|PDC>_<TIPO>_<codice>` (famiglia SOLARIS; gruppi «FOTOVOLTAICO» con sottogruppi kit/pannelli/inverter/
  batterie e BMS/quadri/strutture e cavi/posa e pratiche e «POMPE DI CALORE E CALDAIE AMG»), una variante «Standard»/«Al metro»/«Al kW installato» con il prezzo di vendita
  di BConsole; fornitore (per nome), codice e `scontoAcquisto` = costo BConsole. `src/lib/listini/solaris-bconsole.ts` (puro: `posizioneSolarisBC`, `labelSolarisBC`,
  `nomePulito` corregge i refusi, `PREZZI_STEALTH_BC`). Rotta `api/admin/seed-solaris-bconsole` (GET prova, POST carica, rilanciabile: mai sopra prezzi esistenti, del
  modello solo i campi vuoti; in Solaris Studio prezzi Stealth solo dove sono a 0). In BConsole SP-HEHV27 è il controller BMS e il modulo da 2,76 kWh è «SP HE10227».
  Schede tecniche Stealth (16/11/2026, dai PDF ufficiali di it.stealthenergy.cn › Scaricamento, file su thefastfile.com: serve il Referer della pagina): lo Studio le costruisce
  dai dati del catalogo (`misureJson.specs` in `src/lib/solaris/stealth.ts`: MPPT e campo di tensione, tensione batteria, EPS, IP65, dimensioni, peso, garanzia 7 anni
  estendibile; batteria SP-HEHV27 640×220×380 mm 30,5 kg per modulo, 10 anni/10.000 cicli) e le porta in offerta con la spunta «Allega la scheda tecnica»; la rotta
  `seed-solaris-bconsole` aggiorna i dati delle righe già a catalogo (`schedeStealthAggiornate`, mai i prezzi). Nessun PDF del produttore nel CRM (hanno il suo marchio).
  Pannello VDS 460 W Total Black: misure (2095 × 1039 × 30 mm) e peso (28,5 kg) dalla scheda VDS-S144/M6H-BG 430–450 W della stessa famiglia (non cita il 460 W: da confermare); dati elettrici non inseriti.
  Test `tests/listini/solaris-bconsole.test.ts`, collaudo `solaris-bconsole` (13).
- **Familiari con lo stesso telefono** (18/11/2026, caso Matta Roberto / Scorda Antonella): negli import da BConsole telefono ed email riconoscono lo stesso cliente solo se il nome è compatibile (`nomiCompatibili`: almeno una parola in comune), e il C.F. di una fattura aggancia la scheda solo se il nome è compatibile. Riparazione di fatture già collegate male: rotta `api/admin/ricollega-fatture-vendita` (POST con i documenti di vendita; senza `?esegui=1` è una prova; toglie il C.F. dalla scheda sbagliata e ricollega fattura e scadenze). Collaudo `ricollega-fatture` (7).
- **Servizi: posa, trasporto, assistenza tecnica** (richiesta di Ugo 18/11/2026, come su BConsole): nel listino SERVIZI › «SERVIZI E PRATICHE» ora anche `SERVIZI_POSA` (a corpo / a ore / a giornata), `SERVIZI_TRASPORTO` (a corpo / per km) e `SERVIZI_ASSISTENZA` (costo chiamata 80 € a chiamata e assistenza a orario 80 €/ora); prezzi a 0 = «da definire». Immagini leggere SVG in `public/immagini/servizi/` (`ModelloProdotto.immagineUrl`). Il seed `api/admin/seed-servizi` ora è rilanciabile senza riscrivere nulla: crea le voci di un servizio solo se non ne ha ancora, non tocca prezzi, nomi e voci cambiati a mano, imposta immagine e descrizione solo se vuote. Dalla scheda del servizio (`/prodotti/modello/SERVIZI_…`, «Voci di questo servizio», `src/app/servizi-actions.ts`) chi ha `listini.modifica` rinomina, cambia il prezzo, aggiunge o toglie le voci (valgono per tutti i marchi; una voce già usata in un'offerta non si toglie). Collaudo `servizi-voci` (8).
- **Foto dell'articolo dal computer** (richiesta di Ugo 18/11/2026): nella scheda articolo (anche nuovo) «📁 Scegli foto dal computer…» (`SelettoreImmagine` con `maxLato` 900 e qualità 0,78: il browser la riduce a JPEG leggero); `salvaArticolo` mette la foto nei Documenti (cartella «Foto») e nell'articolo salva solo il link `/api/documenti/<id>`, mai il data URI. Collaudo `articoli` (52).
- **Appuntamento collegato al progetto** (richiesta di Ugo 18/11/2026: un rilievo fissato dal calendario restava «libero» e da lì non si caricava il rilievo):
  nella pagina `/calendario/appuntamento/[id]` il riquadro «📁 Progetto» propone le pratiche aperte del cliente (non CHIUSA/ANNULLATA) e «🔗 Collega al progetto»
  (`collegaAppuntamentoProgetto` in `calendario-actions.ts`: `Appuntamento.commessaId`; per un SOPRALLUOGO nasce il `Rilievo` della pratica con stesso tecnico, giorno, ora,
  note e indirizzo, il task «Appuntamento di rilievo» passa al tecnico, i documenti «Rilievi misura» caricati nella scheda del cliente dopo l'appuntamento passano nella pratica);
  collegato → «➡️ Portami al progetto» (`linkProgetto`: `/commesse/<id>?passo=RILIEVO#rilievo`). Spostando, cambiando tecnico o annullando l'appuntamento il rilievo collegato
  segue (`rilievoCollegato`); il riquadro dei documenti dell'appuntamento mostra solo la cartella «Rilievi misura» (`Documenti soloCartelle`, senza «nuova cartella»: le altre restano nel progetto); nel calendario si vede una volta sola (`rilieviDoppioni` in `src/lib/calendario/rilievo-progetto.ts`, puro e testato). Per chi va (Ugo 20/11/2026): riquadro «📍 Dove andare» in ogni appuntamento con «🧭 Portami» (Google Maps) e «✏️ Correggi l'indirizzo» (`aggiornaIndirizzoAppuntamento`: `Appuntamento.luogo` e indirizzo del rilievo collegato; vuoto = indirizzo della scheda; solo l'incaricato o chi ha `calendario.tutti`); nel rilievo «📏 Il rilievo» → «✅ Eseguito: carica il rilievo» (`rilievoEseguito`: COMPLETATO, collega al progetto scelto se serve, apre `/commesse/<id>?passo=RILIEVO#rilievo`; senza progetti aperti resta sull'appuntamento). Riquadro «📄 Contratto: cosa rilevare» (solo rilievi, progetto collegato o quelli aperti del cliente): «Apri il contratto» = link firmato `/offerta/<codice>` in un'altra scheda (non conta come visita del cliente se si è collegati) e i file della cartella «Contratto firmato» di pratica e offerta (`/api/documenti/<id>`, solo quelli che `puoVedereEntita` permette). Collaudo `rilievo-progetto` (15).
- **Foto sempre in WebP** (richiesta di Ugo 18/11/2026): nel browser `canvasInWebp`/`canvasInWebpBlob` (`src/lib/immagini/webp-client.ts`, ripiego JPEG se il browser non sa) in `SelettoreImmagine`, `FotoRilievo` (rilievi, pose, kit) e `SegnalaProblema`; sul server `convertiInWebp` (`src/lib/immagini/webp.ts`, `sharp`, max 2000 px, mai errore: se non riesce resta l'originale; PDF, GIF, SVG e WebP non si toccano) per i Documenti caricati (`caricaDocumenti`) e la foto dell'articolo. Test `tests/immagini/webp.test.ts`.
- **Stampa dell'offerta in PDF** (segnalazione di Ugo 18/11/2026: firme e totali tagliati fra le pagine): `StampaOfferta` ha `@page` A4 con margini, classe `.no-spezza` (break-inside avoid) su righe, totali, condizioni e firme, e in stampa il riquadro della prima pagina senza bordo e `overflow` nascosto (tagliavano il contenuto al cambio pagina). Per provarla: `page.pdf()` di Playwright su `/preventivi/<id>/stampa`.
- **Allegati nel nuovo task** (richiesta di Ugo 18/11/2026): «📎 Allega file e foto» (`components/task/AllegatiTask.tsx`) nel nuovo task della scheda cliente e di `/task`: le foto si riducono a WebP nel browser (max 5 MB in tutto, il modulo ne regge 6), `creaTaskCliente` le salva come `Documento` entità `TASK` (scheda «File» del task) e l'email di avviso dice quanti allegati ci sono. Collaudo `scheda-cliente` (17). Più persone su un task (Ugo 20/11/2026): «Per chi» è `components/task/ScegliPersone.tsx` (nella scheda cliente e in `/task`): scegli un collega, va nell'elenco sotto e la tendina torna libera; il primo è l'incaricato (`utenteId`), gli altri coinvolti (`inCopiaA`, email «Sei coinvolto in un task», senza doppioni né disattivati); nessuno scelto = task tuo.
- **Richieste di Debora (amministrazione, 18/11/2026, PDF «Aggiornamenti per CRM PC One») — parte conti**: tendina «Come» dei pagamenti = tutte le voci di BConsole (`METODI_PAGAMENTO`, chiavi vecchie valide);
  ritenuta del bonifico parlante = importo lordo ÷ 1,22 × 11% (`ritenutaPrevista(lordo)`, campo sempre modificabile; con IVA diversa dal 22% la formula di Debora dà una cifra diversa dalla ritenuta sull'imponibile vero);
  spunta «non generare un movimento in prima nota» in `registraPagamento` (`senzaPrimaNota`: il pagamento resta sulla scadenza come `pagatoManuale` con data, metodo e banca; si toglie con `azzeraPagatoManuale`);
  stato della scadenza come la tendina di BConsole (`STATI_BCONSOLE` in `costanti.ts`, `Scadenza.statoEtichetta`, `impostaStatoScadenza`: Saldata/Chiusa/Compensata chiudono, Rit. Fis Compensazione chiude con la ritenuta, Stornata annulla solo senza pagamenti, gli altri sono etichette; filtro `stato=bc:<nome>` nello scadenzario);
  fatture d'acquisto con pagamento «Da pagare / Insoluta (scaduta) / Pagata in parte / Saldata» e filtri (`STATI_ACQUISTO`, `?pag=`), centro di costo (`FatturaAcquisto.centroCosto`, `Soggetto.centroCosto` proposto dal fornitore, `salvaCentroCostoFattura`);
  fattura di vendita registrata per errore: «🗑 Elimina la fattura (cestino)» annulla gli incassi fatti a mano, la mette nel cestino 30 giorni (tipo `FATTURA_VENDITA`, Ripristina in Impostazioni › Registro e cestino), mai le fatture emesse dal CRM;
  banca Carige → «Banca BPER P&C» con la rotta `api/admin/rinomina-banca` (GET prova, POST rinomina, `?da=carige&a=…`). Collaudo `debora-conti` (19).
- **Fattura cointestata** (richiesta di Ugo 18/11/2026): nella fattura da emettere (Fatturazione) spunta «Fattura cointestata» → finestra con i dati del secondo intestatario (`CointestatoFattura`, `FatturaEmessa.cointestatario` JSON, `src/lib/fatturazione/cointestato.ts`): nome, cognome e codice fiscale obbligatori per emettere, il testo «Fattura cointestata a: …» va nella causale dell'XML, della fattura di vendita e della copia di cortesia. Test `tests/fatturazione/cointestato.test.ts`.
- **Richieste di Debora, parte offerta e listini** (18/11/2026): nell'offerta stampata ogni optional ha il suo prezzo accanto («Bianco massa + 1.250,50 €») e sotto «Prodotto X + optional Y = totale» (non con l'offerta «a corpo»); clausola in `CLAUSOLA_ISTRUTTORIA` = «spese di istruttoria ai sensi dell'articolo n. 1 delle condizioni generali del contratto (nel caso di recesso) di € 400,00 + IVA»; tutti i prezzi del CRM con il punto delle migliaia anche a 4 cifre (`useGrouping: "always"`: l'it-IT di JavaScript non raggruppa 1000); tapparelle in PVC tolte dal listino (`tassonomiaListino` salta `TAPPARELLE_PVC_PLACEHOLDER`). Vetro antisfondamento (P2A) e listino vetri già su Zenith, Optima, Fidra e Plasma 30 (`serramenti-comuni.ts`). Da fare, servono dati: misure del timpano della pergola, serramento ad arco e persiane centinate, Cristal delle tende, specifica tecnica vetri per detrazione sì/no, pannelli dei portoncini PVC, tabelle dei finanziamenti e calcolatore Deutsche Bank; Plasma 30: nella scheda tecnica non risulta il vetro selettivo.
- **Fornitori**: `Soggetto` con `ruoli: ["FORNITORE"]`; 55 importati da BConsole (rotta `api/admin/importa-fornitori-bconsole`).
- **Articoli/complementi da BConsole** (richiesta di Ugo 19/11/2026: complementi da ordinare a parte, es. coprifili, divisi per categoria come in BConsole):
  Prodotti › Articoli › Importa accetta l'esportazione «Prodotti» di BConsole `.xls` così com'è (lettore BIFF8 senza librerie `src/lib/articoli/xls.ts`,
  tollerante alle catene di settori ripetute che BConsole produce; `leggiFile` lo usa per ogni file con firma OLE). `adattaBConsole` (importa.ts) rinomina
  Nome → descrizione, Descrizione → descrizione estesa, ignora «Listino» (nome del listino) e l'immagine interna, prezzi a 0 = vuoti. Categorie fino a 3 livelli
  (colonna `categoria3` «TERZO LIVELLO» / «Cat. 3 Liv.», `DatiArticolo.categoriaPercorso` creato livello per livello alla conferma, `alberoCategorie` ricorsivo,
  `nomeCategoria` col percorso intero). Fornitore cercato anche a parole invertite (`trovaFornitore`), se manca si crea alla conferma (`fornitoreNuovo`, Soggetto
  FORNITORE: serve per gli ordini). La ricerca del materiale per pratica/ordine (`/api/complementi`) trova gli articoli anche per nome di categoria (3 livelli).
  Test `tests/articoli/bconsole.test.ts` (file di prova `tests/articoli/bconsole-prodotti.xls`, dati inventati), collaudo `articoli` (52).

- **Richieste di Ugo del 17/11/2026**: Campagne con «🗄 Archivia»/Archivio (`Campagna.archiviataIl`) e report `/campagne/report` per settimana o mese (`src/lib/campagne/report.ts` puro, Excel `api/campagne/report`);
  pellicola interna Zenith diversa dall'esterna a +0% (il +20% è già nell'esterno; `allineaOptionalSerramenti` riporta a 0 le voci già salvate); rilievo (appuntamento SOPRALLUOGO) con etichetta «RILIEVO · inserito da», allegati in «Rilievi misura» e senza esito né rimando al centralino;
  spunta «✉️ Invia al cliente» (`conSpuntaCliente`/`inviaCliente`) su rilievo, posa e fine posa; `avvisaCommerciale` (task `faseChiave` null + mail per conoscenza) a rilievo e posa fissati; date dei passaggi fra uffici nel riquadro del flusso; ricerca per prodotto (`FiltriClienti.prodotto`, lead);
  scheda prodotto leggera `/schede/<tipologia>` (pubblica, `BottoneStampa`); portoncini PVC: `Optional.immagineUrl` (foto dei 75 pannelli, maniglioni WALA, maniglie, buca lettere, spioncino in `public/immagini/portoncini-pvc/`, `src/lib/listini/portoncini-foto.ts`,
  rotta `api/admin/immagini-portoncini` GET prova/POST) e scelta con la foto nell'offerta (`ScegliOptionalConFoto`).

- **Percorso guidato della pratica a passi** (richiesta di Ugo 18/11/2026, dopo aver parlato con Debora; `src/lib/pratica/passi.ts` puro e testato, `passi-server.ts`,
  `components/commesse/PercorsoPratica.tsx` e `PannelloApertura.tsx`): la pagina della pratica mostra SOLO il passo in corso (`?passo=<CHIAVE>` per rivedere uno già fatto o uno in parallelo);
  i passi dopo non si aprono finché il corrente non è salvato; in ogni passo «← Torna a: <passo prima>». 12 passi: 1 fattura di acconto, 2 creazione progetto, 3 chiamata di benvenuto (tutti di Giorgia, Fatturazione),
  4 incasso (Debora, in parallelo), 5 appuntamento di rilievo, 6 rilievo eseguito, 7 materiale e ordini, 8 arrivo in magazzino, 9 saldo (in parallelo), 10 appuntamento di posa, 11 posa, 12 kit.
  Un passo è fatto se lo dice il suo dato o se è fatto un passo più avanti (pratiche già avviate non restano ferme). Il PROGETTO non aspetta più l'incasso: `creaProgetto` richiede `Commessa.fatturaAccontoIl`
  (`registraFatturaAcconto`, con annulla=1 si rimette da fare) e `registraBenvenuto` (`benvenutoIl/benvenutoNote`, rivedibile) chiude il task FATT_ACCONTO; il rilievo parte (`avviaRilievoSePronto`) quando ci sono
  progetto E acconto incassato (`dopoIncassoAcconto` chiude il task di Debora, fase PROGETTO ora «Incasso acconto»). Dopo il deploy: `api/admin/allinea-flusso` POST per aggiornare le fasi. Test `tests/pratica/passi.test.ts`.
- **Articoli: categorie al volo e listino visibile a chi** (richiesta di Ugo 18/11/2026, ricambi di vetrate e pergole): nella scheda articolo «➕ Nuova categoria» (`creaCategoriaRapida`, eredita regola e visibilità
  della madre) e link a «gestisci categorie»; `CategoriaArticolo.visibileA` (token «RUOLO:…»/«UFFICIO:…», vuoto = tutti; `src/lib/articoli/visibilita.ts` puro e testato, `ScegliVisibilita` nella pagina Categorie).
  Chi non vede la categoria non ne vede gli articoli in elenco, esportazione, scheda e ricerca complementi (`visibilitaArticoliWhere`); chi ha `listini.modifica` vede tutto. Non filtrati (per ora): ordini fornitori e magazzino.
- **Articoli collegati al listino delle offerte** (richiesta di Ugo 18/11/2026): `CategoriaArticolo.famiglia` + `gruppoListino` (stessi nomi dell'albero «Aggiungi prodotto», es. OUTDOOR › VETRATE; `posizioniListino()` in `src/lib/articoli/server.ts`,
  `posizione.ts` puro: la sottocategoria usa la posizione della madre; `ScegliPosizioneListino` nella pagina Categorie, nella creazione al volo e in «📍 Nel listino» della scheda articolo). Nella finestra «Aggiungi prodotto» (`SelettoreProdotto`, livello famiglia e livello gruppo)
  il riquadro «🔧 Ricambi e articoli» (`RicambiDelGruppo`, `GET /api/articoli/listino?famiglia=&gruppo=`, solo articoli visibili a chi chiede) aggiunge l'articolo come riga di testo con il suo prezzo (`aggiungiArticoloPreventivo` in `actions.ts`, nella stanza scelta). Collaudo `articoli` (51), test `tests/articoli/posizione.test.ts`.
- **Task come corrispondenza interna** (richiesta di Ugo 18/11/2026, sul modello dei task di BConsole: «teniamo traccia dell'avanzamento, rispondiamo dicendo cosa abbiamo fatto e chiudiamo»):
  pagina `/task/[id]` per i task di cliente (`Attivita` TASK) con schede Descrizione · Commenti · File · Info sul task (`src/app/task-actions.ts`: `commentaTask` con «Commenta e chiudi il task» = risposta di chiusura,
  `salvaInfoTask`, `salvaDescrizioneTask`; modello `TaskCommento`; `Attivita.inCopiaA/categoria/orePreviste/notifica/statoTask`; categorie e stato mostrato «Scaduta» in `src/lib/task/categorie.ts`; chi lo vede `puoVedereTask`: autore, incaricato, in copia,
  amministratori e chi vede il cliente; File = `Documento` entità `TASK`). Email di avviso (mai bloccanti) a incaricato, in copia e autore per task nuovo, commenti e chiusura, con link `/task/<id>`. «➕ Nuovo task» anche in `/task` (cliente cercato con `ClientePicker`,
  assegna a, categoria, scadenza, ore, in copia) e elenco «In copia a me». I task di pratica (`TaskPratica`) hanno il pulsante d'azione della fase (`src/lib/pratica/link-task.ts`: RILIEVO «📏 Carica il rilievo» → `?passo=RILIEVO#rilievo`, ORDINI «📦 Materiale e ordini» → `?passo=MATERIALE#evasione`), «💬 Commenti» e «Commenta e segna Fatto» nella `TaskCard` (`commentaTaskPratica`, chiude con `fattoTask`). Collaudo `task-corrispondenza` (13, SMTP finto), test `tests/task/stato.test.ts`.

- **Pratica a sezioni, rilievo e schede articolo come BConsole** (richieste di Ugo 18/11/2026): la pagina della pratica ha le sezioni a scomparsa (`<details class="card-fase">`, si apre solo quella del passo in corso; `ApriDaAncora` apre la sezione dei link `#rilievo`, `#evasione`…); la spunta «✉️ Invia al cliente» non è più preselezionata (rilievo, posa, fine posa: la mette chi lavora). Nel riquadro del rilievo c'è la cartella «Rilievi misura» (file + caricamento) e nel materiale da aggiungere «📂 Sfoglia il listino» (`GET /api/listino/albero?brandId=`, un prodotto → `GET /api/complementi?tipologia=&brandId=`), lo stesso percorso Indoor/Outdoor → categoria → prodotto dell'offerta. Scheda articolo (`/prodotti/articoli/[id]`): «🧰 Distinta base (kit)» (`ComponenteArticolo`, `src/lib/articoli/distinta.ts` puro e testato, `src/app/distinta-actions.ts`: pezzi con quantità, «Ricalcola prezzi da distinta» = somma di costo e vendita dei pezzi, prezzo poi correggibile a mano, niente kit dentro se stessi) e «🔗 Prodotti correlati» (`ArticoloCorrelato`, legame nei due sensi); ricerca `GET /api/articoli/cerca`. Modelli come in BConsole (scheda con Dati generali, Distinta base, Correlazioni, Gallery, File…); da fare: espandere un kit nei pezzi quando entra nel materiale/ordine. Collaudo `distinta` (7), test `tests/articoli/distinta.test.ts`.

- **Schede di produzione HTML per il fornitore** (richiesta di Ugo 18/11/2026: misure definitive per la produzione): modelli `SchedaProduzioneModello` (nome, fornitore facoltativo, HTML) modificabili in `/ordini-fornitori/schede` (anteprima, segnaposto `{{ordine}} {{cliente}} {{righe}} {{misure_rilievo}}…` riempiti dal CRM, ogni altro `{{campo}}` diventa una casella; `src/lib/ordini/scheda-produzione.ts` puro e testato, modello di partenza `MODELLO_PREDEFINITO`). Nell'ordine fornitore (`#scheda-produzione`) si sceglie il modello, si scrivono le misure definitive e `creaSchedaProduzione` salva l'HTML compilato come `Documento` della pratica (cartella «Schede produzione», mime text/html, aperto in linea con CSP sandbox) che compare già tra i documenti allegabili in «Invia ordine». Collaudo `scheda-produzione` (9). Modelli pronti (`MODELLI_PRONTI`, «Parti da» nell'editor): standard, NEW LIPARI (pergola Lucilla, tabella unica con campi `tab_<gruppo>_<riga>_<colonna>` compilati come piccole tabelle) e SEEGLASS RUN (vetrata scorrevole Scintilla, C3 Systems). Scelte a spunta nel modello: `{{sc:nome|A|B}}` (una) e `{{multi:nome|A|B}}` (più), che nell'ordine diventano radio/checkbox e nella scheda ☒ ☐ (`descriviCampi`). Per l'ufficio ordini (Ugo 20/11/2026, «non trovo i moduli di rilievo»): `assicuraModelliPronti` (`src/lib/ordini/schede-server.ts`, una volta sola, chiave `schede_pronte_versione`) crea i modelli pronti mancanti per nome all'apertura di un ordine o della pagina dei modelli (prima l'ordine diceva «Nessun modello»); in Ordini fornitori il pulsante «📐 Moduli di rilievo per i fornitori» e la colonna «📐 Modulo» (`#scheda-produzione`); nell'ordine «📐 Compila il modulo di rilievo» e «📏 Rilievo della pratica». Modulo «Ordine legno piallato per vetrate» (Ugo 20/11/2026; `src/lib/ordini/legno.ts` puro e testato `tests/ordini/legno.test.ts`): 26 sezioni 30×50…30×170 e 50×50…50×170 mm (passo 10) in righe `tab_legno_<n>_pezzi|_lunghezza` (3000 di serie), essenza/lavorazione/trattamenti a spunta; nell'ordine `components/ordini/TabellaLegno.tsx` calcola mentre si scrive m³, € a barra e totale sullo sviluppo (m³ × €/m³; senza prezzo concordato stima con `PREZZO_M3_INDICATIVO` 900 €/m³ che resta solo in ONE); nella scheda il segnaposto fisso `{{riepilogo_legno}}` (`htmlRiepilogoLegno`) con pezzi, metri, m³ e prezzi solo se è scritto `prezzo_m3`. Modelli pronti per versione (`DA_VERSIONE` in `schede-server.ts`, legno = 2: all'aggiornamento arriva solo lui). Legno collegato agli articoli (Ugo 20/11/2026): `assicuraArticoliLegno` (`legno-server.ts`, una volta, chiave `legno_articoli_versione`) crea in Articoli › «Complementi vetrate» (OUTDOOR › VETRATE) › «Legni piallati» (ricarico ×2) i 26 articoli `LEGNO-<s>X<l>-3000` (costo = sviluppo × 900 €/m³, solo quelli mancanti); nel modulo il pulsante «💾 Salva il legno nell'ordine» (`salvaLegnoInOrdine` in `schede-produzione-actions.ts`) riscrive le righe LEGNO-… dell'ordine (una per misura, prezzo a barra = sviluppo × prezzo concordato o 900, articolo collegato, non tocca le arrivate né le altre righe) e aggiorna la scheda (sostituisce quella con lo stesso nome); all'apertura il modulo si riempie dalle righe LEGNO-… (`valoriDaRighe`, `codiceLegno`/`leggiCodiceLegno`; se l'ordine non ha legno, quello del materiale della pratica non ancora ordinato, anche messo dal rilevatore). Modulo «Ordine angolari in alluminio per i legni (Il Mastro)» (Ugo 20/11/2026, versione 3 dei modelli pronti; `src/lib/ordini/angolari.ts` puro e testato `tests/ordini/angolari.test.ts`, `components/ordini/TabellaAngolari.tsx`, `salvaAngolariInOrdine`): 12 righe `tab_ang_<n>_<forma|a|b|c|spessore|bello|colore|lunghezza|pezzi>` (forme L/U/Z/piatto con la legenda `LEGENDA_SVG`, bello interno/esterno/entrambi, colori e €/kg della lattoneria), costo di Il Mastro a peso (sviluppo × spessore × lunghezza × 2,7 × €/kg, ai 5 cent) e vendita ×2 mentre si scrive; righe d'ordine `ANGALL-<forma>-<a>X<b>X<c>-<sp×10>-<bello>-C<colore>-<lunghezza>` con il costo a barra; il modulo parte dalle righe salvate o, se non ce ne sono, propone un angolare a L spessore × larghezza per ogni legno dell'ordine o della pratica (`valoriAngolari`); nella scheda (`{{riepilogo_angolari}}`) forme, lati, kg, senza prezzi (le colonne stanno in una tabella nascosta del modello). In vendita e al rilievo (Ugo 20/11/2026): nell'offerta, finestra «Aggiungi prodotto» › OUTDOOR › VETRATE, i legni piallati sono tra i «Ricambi e articoli» (`assicuraArticoliLegno` chiamata anche da `/api/articoli/listino` e `/api/complementi`) e c'è «🔩 Angolare in alluminio su misura» (`components/ordini/ConfiguraAngolare.tsx`, `aggiungiAngolarePreventivo` in `actions.ts`: riga di testo al prezzo di vendita ricalcolato dal codice); al rilievo, nel materiale da aggiungere (`ScegliMateriale`), lo stesso configuratore al costo (complemento tipo `ANG` in `creaComplemento`: codice ANGALL-…, costo a barra, fornitore Il Mastro cercato per nome) e i legni si trovano cercando «legno piallato»; il modulo angolari dell'ordine parte anche dagli angolari messi nel materiale della pratica. Poi (stesso giorno): forma «Copertina a punta» (`PUNTA`: falde A e B, angolo in cima, risvolto C facoltativo sui due lati, chiesta come «a spicchio»), «Misure esterne/interne» (sviluppo − / + uno spessore per piega; codice con `-ME|-MI` e `-G<gradi>`, i codici vecchi valgono esterne), nota e file (foto o PDF del disegno, ≤1,5 MB) nel configuratore: nell'offerta la nota va nel testo della riga, al rilievo nella nota del materiale e il file in «Rilievi misura» della pratica; nell'offerta «Angolari in alluminio» e «Legni piallati» sono categorie del listino OUTDOOR (tessere virtuali in `SelettoreProdotto`, solo con `finestra`; la categoria «Legni piallati» ha posizione propria OUTDOOR › LEGNI PIALLATI, `legno_articoli_versione` = 2) e gli angolari della lattoneria (`sottogruppo` «Angolari») sono tolti dal listino (`tassonomiaListino`). Legno su misura (Ugo 20/11/2026, «liberi e non vincolati dalla scelta»): `components/ordini/ConfiguraLegno.tsx` (spessore, larghezza, lunghezza, pezzi, nota) nella tessera OUTDOOR › LEGNI PIALLATI dell'offerta (`aggiungiLegnoPreventivo`, vendita = sviluppo × 900 €/m³ × 2, `venditaLegno`) e al rilievo (complemento tipo `LEG`, costo `costoLegno`, collegato all'articolo se la misura è standard); codice `LEGNO-<s>X<l>-<lunghezza>` anche fuori dalle 26 sezioni (`leggiLegnoLibero`); nel modulo dell'ordine 6 righe «Misure libere» `tab_legnol_<n>_<spessore|larghezza|lunghezza|pezzi>` (`RIGHE_LIBERE`, in `riepilogoLegno`/`valoriDaRighe`); le proposte degli angolari partono anche dai legni su misura. Collaudo `scheda-produzione` (28).

- **Angolari e legni nel listino della pratica** (Ugo 20/11/2026: «nell'evasione ordine non ci sono legni e angolari»): in «📚 Aggiungi materiale dal listino» della pratica, sotto le famiglie, ci sono «🔩 Angolari in alluminio» e «🪵 Legni piallati» (`SelettoreProdotto` senza `finestra`, `ConfiguraAngolare/ConfiguraLegno prezzo="costo" nomi`) che usano `complementoAngolareDaListino` / `complementoLegnoDaListino` (`commesse-actions.ts`, tipi `ANG`/`LEG` di `creaComplemento`, solo acquisto, vendita invariata). Nell'offerta restano le tessere in vendita. Collaudo `rilievo-complementi` (24). Nel rilievo «DA AGGIUNGERE» ogni voce ha modifica/duplica/togli (`CaricaRilievo`).
- **Ordini ai fornitori dalla pratica: invio, file e «ricevuto»** (Ugo 20/11/2026): in «Stato acquisti» il riquadro «📨 Ordini ai fornitori di questa pratica» (numero, fornitore, stato, email ordini, pulsante «✉ Invia per email» → `/ordini-fornitori/<id>#invia`, avviso se manca l'email) e la spunta «Ricevuto dal fornitore?» (`OrdineFornitore.ricevutoIl/ricevutoDaNome`, `segnaOrdineRicevuto`, anche nella pagina dell'ordine, nello storico della pratica). Nell'invio (`InviaOrdine`) «📎 Allega file dal computer» (PDF/foto, ≤3,4 MB in tutto, `opz.extra` di `inviaOrdineEmail`): vanno in allegato e restano nei documenti dell'ordine, cartella «Ordine cartaceo e disegni». Collaudi `rilievo-complementi` (27) e `ordine-da-rilievo` (32).
- **Modulo del fornitore al «Carica rilievo»** (Ugo 20/11/2026: «la compilazione e l'aggiunta dei prodotti deve essere fatta al carica rilievo, così all'ordine il modulo è già lì»): nella sezione Rilievo della pratica il riquadro `#modulo-fornitore` (`ModuloScheda` in `components/ordini/`, lo stesso modulo dell'ordine, estratto in un componente; scelta del modello con `?scheda=`) compila la scheda con `creaSchedaDaRilievo` (`schede-produzione-actions.ts`, `compilaPerPratica`: documento della pratica cartella «Schede produzione», nome con modello, fornitore e numero pratica, risalvando si sostituisce) e con `salvaLegnoInPratica` / `salvaAngolariInPratica` legno e angolari entrano nel materiale della pratica come complementi non ancora ordinati (costo previsto, fornitore del modello o Il Mastro). Al rilievo il modulo ha la tendina «Fornitore di questo modulo» (`ModuloScheda fornitori`): la tabella «materiale» della scheda ha SOLO le righe non ordinate di quel fornitore e mai legno/angolari (hanno il loro modulo e un altro fornitore; segnalazione di Ugo 21/11/2026 sul modulo SEEGLASS); senza fornitore la tabella resta vuota. All'invio dell'ordine (`InviaOrdine fornitore`) la scheda con il nome di quel fornitore è già spuntata come allegato. Collaudo `scheda-produzione` (33).
- **Rilievo a passi e verbale di sopralluogo** (Ugo 21/11/2026, dal modulo «Verbale_Sopralluogo_PEC v3»): nella pratica il rilievo ha il pulsante «📋 Carica il rilievo» (`?carica=<rilievoId>`) che apre una schermata sola a 4 passi (`CaricaRilievo`: 1 prodotti venduti e da aggiungere, 2 verbale, 3 misure e file, 4 salva); il verbale (`src/lib/rilievo/verbale.ts` puro e testato, `VerbaleCompilazione.tsx`: sezioni 2-5 e 7 a fisarmonica con spunte, tabella dei prodotti da installare precompilata dalle righe vendute, `Rilievo.verbale` Json, `verbaleDaForm` in `caricaRilievo`) si stampa insieme a misure e foto da `/commesse/<id>/rilievo/<rilievoId>/stampa`. Dopo il salvataggio si torna alla schermata del rilievo con «Stampa» e il «Modulo del fornitore» (visibile a ufficio ordini, amministratori e al tecnico di quel rilievo: `puoModuloRilievo` in `lib/ordini/server.ts`, guardia `rilevatore()`). Test `tests/rilievo/verbale.test.ts`, collaudo `rilievo-complementi` (30).
- **File del rilievo anche nelle cartelle della pratica** (Ugo 21/11/2026, «collegamento con la cartella»): `caricaRilievo` salva i PDF caricati anche come `Documento` in «Rilievi misura» e le foto in «Foto rilievi» (senza doppioni per nome); nell'invio dell'ordine i documenti di cartella con lo stesso nome dei file del rilievo non si ripetono (`docProgetto` filtrato nella pagina dell'ordine). Collaudo `rilievo-complementi` (32).
- **Colori MV Living sui componenti struttura** (Ugo 21/11/2026, «mancano i colori a tendina come sulle staffe a ragno»): i prodotti `COMPSFUSI_…` (profili L/M/S, piantone, agganci, piastre) avevano solo «STANDARD»; `assicuraColoriCompsfusi` (`src/lib/listini/compsfusi-server.ts`, puro `compsfusi.ts`, una volta per versione `compsfusi_colori_versione`, chiamata dalla ricerca del materiale `/api/complementi`, dall'offerta e dal seed) crea per ogni misura una riga per colore (Bianco 9010 e Avorio 1013 lucido, Bianco 9010, Avorio 1013, Grigio antracite 7016, Marrone 8017 soft, Corten — dalla scheda del profilo L) allo STESSO prezzo; lo «STANDARD» di prima resta. Se un colore avesse un sovrapprezzo si corregge nel listino. Test `tests/listini/compsfusi.test.ts`, collaudo `rilievo-complementi` (35). Rilievo: l'avviso «prodotto non ancora aggiunto» è una finestra nella pagina (`CaricaRilievo`), Invio nei campi aggiunge alla lista, i profili non chiedono l'altezza (`conAltezza`).
- **Riscontro «sto caricando» e velocità** (Ugo 21/11/2026: i commerciali non capiscono se la pagina sta lavorando): `InvioInCorso` (barra blu in alto, ora alta 4 px) dopo mezzo secondo mostra anche la pillola «Sto caricando… un attimo» con la rotella (`.pill-attesa`); `src/app/(app)/loading.tsx` mostra subito rotella e scheletro mentre si apre un'altra pagina; i salvataggi hanno sempre il velo «Salvataggio in corso…». Velocità: `vercel.json` ha `"regions": ["fra1"]` (funzioni a Francoforte, vicino al database Neon eu-central-1; prima senza regione = di solito Washington, ogni query faceva un viaggio oltre oceano).
- **Profili e pezzi a barre: barra che copre la misura** (Ugo 21/11/2026, «i profili sono in barre, metti la misura più vicina»): per i prodotti con la sola lunghezza (altezza 0: `COMPSFUSI_PROFILO_*`, piantone…) il materiale aggiunto al rilievo (`creaComplemento` P e `complementoDaListinoPerMisura`) non dà più «misura fuori listino»: `trovaBarraPiuVicina`/`barraPiuVicina` (`src/lib/prezzoPerMisura.ts`) prende la barra di listino che COPRE la misura, la più corta tra quelle uguali o più lunghe (430 → 500, mai una più corta: correzione di Ugo); chi scrive in millimetri (4000 per 400 cm) viene letto in mm; oltre la barra più lunga resta «fuori listino». Nella descrizione «(barra 400 cm, richiesto 4000 mm)». Solo per il materiale del rilievo: le offerte restano «per eccesso» (`trovaFasciaPrezzo`). Test `tests/listini/barre.test.ts`, collaudo `rilievo-complementi` (37).
- **Ordine al fornitore a passi** (Ugo 21/11/2026, «come il rilievo: una pagina focalizzata»): la pagina `/ordini-fornitori/<id>` mostra un passo alla volta con `?passo=` (`righe` dati e righe · `modulo` scheda del fornitore · `invio` email e «ricevuto dal fornitore» · `conferma` · `arrivo` merce · `documenti` e annulla), barra dei passi in alto (✓ se fatto; conferma e arrivo solo dopo l'invio) e «← / →» in fondo; senza `?passo` parte da `righe` (bozza) o `conferma`; con `?scheda=` apre `modulo`. «Crea ordine» dalla pratica porta a `?passo=righe`, «Invia per email» a `?passo=invio`. Collaudo `ordine-da-rilievo` (32).
- **Invio ordine più curato e pratica più lineare** (Ugo 21/11/2026): `InviaOrdine` a 3 passi (A chi · Messaggio con anteprima «come lo vede il fornitore» in iframe sandbox · Allegati a schede, nessuna spunta di partenza) con barra fissa Invia / «Scarica PDF con gli allegati» (`scaricaOrdineCompleto` + `src/lib/ordini/unisci-pdf.ts`, pdf-lib). L'email dell'ordine parte in HTML con firma e logo del marchio (`firmaOrdine` in `lib/ordini/server.ts` → `emailOfferta`; firma del Profilo se scritta, altrimenti quella pronta «Ufficio ordini»). Nella pratica i riquadri «Flusso pratica · task fra uffici» e «Fasi della commessa» sono uno solo, «✅ Avanzamento della pratica» (`#avanzamento`): linea del tempo fra uffici (pallino verde chiuso / blu in corso / rosso in ritardo, date e giorni), task libero e costi di manodopera (fasi con ore o forfait) a scomparsa; numerazione dei riquadri riallineata (1 Acconto … 7 Chiusura). Al fornitore vanno nominativo del cliente e riferimento «Commessa N/anno», mai l'indirizzo (`nominativoCliente`, `riferimentoPerFornitore`).
- **Costo dell'operatore su ogni passaggio** (Ugo 21/11/2026): sotto la card di ogni passaggio fra uffici in «Avanzamento della pratica» la riga «⏱ Costo operatore» (`components/commesse/CostoLavoroTask.tsx`): minuti × costo orario (€/h, proposto dal costo orario dell'incaricato in anagrafica; si vede anche il €/min) = totale mentre si scrive; `salvaCostoTask` (`flusso-actions.ts`) salva `TaskPratica.minuti/costoOrario/costoLavoro/lavoroDaNome` (calcolo puro in `src/lib/pratica/costo-lavoro.ts`, test `tests/pratica/costo-lavoro.test.ts`, collaudo `ordine-da-rilievo` 3c) e il costo entra come «Manodopera» nella scheda costi della commessa e in `costiCommesse` (report, margini) insieme alle fasi `FaseCommessa`: per non contarlo due volte, lo stesso lavoro va scritto o nel passaggio o nella fase. Nella pratica «Ordini ai fornitori di questa pratica» (`StatoAcquisti`) è chiuso di partenza.
- **Report economico del progetto** (Ugo 21/11/2026, «come in BConsole»): pagina `/commesse/<id>/report` (`src/lib/commesse/report-economico.ts`: `reportEconomico` = venduto imponibile, costi per voce — fasi con costo, costo operatore dei passaggi, materiale, fatture fornitori, altro — margine € e %; `puoVedereReportEconomico` = amministratore o permesso `report`/`amministrazione`), con stampa. Pulsante «📊 Report economico» in alto a destra nella pratica, nel riquadro «📁 Progetto» e, nella scheda cliente › Progetti, in una colonna «Costi». Il riquadro «📁 Progetto» (`PercorsoProgetto`) è un `<details>`: aperto solo se c'è da fare (Crea progetto, Conferma materiale) o un messaggio; altrimenti una riga col riepilogo, perché i passi sono già nel percorso in alto.
- **Modulo d'ordine serramenti PVC** (Ugo 21/11/2026, dal modulo cartaceo «MODULO SERRAMENTI P.V.C.»): modello pronto «Modulo d'ordine serramenti PVC» (`src/lib/ordini/serramenti.ts` puro, test `tests/ordini/serramenti.test.ts`; versione 4 dei modelli pronti): intestazione (destinazione = indirizzo, riferimento = cliente/ordine/pratica, responsabile ordine, data rilievo, rilievo eseguito da), tipologia vetro e colore maniglie a scelta singola, fori a scelta multipla, fino a 12 finestre (`tab_fin_<n>_<colonna>`: pos, stanza, q.tà, L, H, telaio L/Z, codice apertura, H traverso, rifilo alletta dx/sx/sup/inf, celino, cassonetto, colori interno/esterno, vetro STC, note), coprifili disponibili (`tab_cop_<n>_qta|col`) e note. Nella pagina dell'ordine e al «Carica rilievo» `TabellaSerramenti` (in `ModuloScheda`, gruppo `fin`) mostra una scheda per finestra con «➕ Aggiungi un'altra finestra», menu dei codici apertura per gruppo (battente, traslante, alzante) e «📖 Vedi i codici apertura e il cassonetto» (disegni del modulo in `public/immagini/serramenti/`); prima i dati generali, poi le finestre. La scheda stampata (`compilaScheda`) toglie i blocchi `<tbody data-vuoto="auto">` senza campi scritti (resta sempre il primo) e riporta i disegni con indirizzo assoluto (`APP_URL`); i documenti HTML ora ammettono immagini `https:` e `data:` (CSP). Collaudo `scheda-produzione` (39).
- **Pagamento con finanziamento** (richiesta di Ugo 18/11/2026, dal simulatore Deutsche Bank «SIMULATORE_.xlsx», prodotto Casa grandi interventi): pagamento splittato nell'offerta,
  riquadro «🏦 Pagamento con finanziamento» (`#finanziamento`, `salvaFinanziamento` in `actions.ts`, `Preventivo.finanziamento` Json `{ tabellaId, rate, importoFinanziato }`): una parte la paga subito il cliente,
  il resto in rate. Calcolo puro in `src/lib/finanziamenti/calcoli.ts` (rata per eccesso al centesimo, contributo del negoziante = valore attuale sul «tasso rendimento» della tabella, netto erogato, TAEG da tasso interno)
  e `tabelle.ts` (3 tabelle: TAN 6,99% e tasso zero a 90 giorni, 12–120 rate, 1.000–55.000 €; promo zero a 30 giorni con 10 o 20 rate; spese incasso 2 € a rata); test `tests/finanziamenti/`
  (10.000 € a tasso zero in 60 rate: rata 166,67, contributo 1.573,01, netto 8.426,99 come il foglio; TAEG 0,44 contro 0,45 del foglio, che conta le spese in modo un po' diverso). Il costo per noi (contributo) lo vede solo
  l'amministratore o chi ha `amministrazione`; in stampa compare la riga «Pagamento con finanziamento» senza costi. «Il cliente paga subito» è la cifra mista scelta dal commerciale (`pagaSubito`: il finanziato è sempre totale − quella cifra, anche se il totale cambia). Le tabelle si modificano in Impostazioni › Tabelle di finanziamento (`/impostazioni/finanziamenti`, amministratore o `amministrazione`, `src/app/finanziamenti-actions.ts`, salvate in `Configurazione.finanziamento_tabelle`, `leggiTabelleFinanziamento`; senza modifiche valgono `TABELLE_PREDEFINITE`, «Ripristina» le rimette). Il pagamento sta nel riquadro «Condizioni dell'offerta» (💳 Modalità di pagamento) e prende il posto del pagamento standard: in stampa «Condizioni di pagamento» mostra il piano di rate e le «Condizioni di consegna» diventano «…da finanziamento approvato» (`CONDIZIONI_CONSEGNA_FINANZIAMENTO`). Attenzione: `leggiTabelleFinanziamento` restituisce copie di `TABELLE_PREDEFINITE` (modificarla in memoria cambiava le tabelle per tutte le richieste). Regole del foglio ricalcolate con LibreOffice (18/11/2026): contributo = 0 se il TAN non è sotto il tasso di rendimento (tabella TAN 6,99%), rata all'euro con TAN uguale al rendimento e ai 50 centesimi con TAN minore, interessi di differimento sulle rate (TAN effettivo da IRR), spese di incasso a rata per tabella (1,5; promo 0), rendicontazione 1 €/anno e bollo 16 € + 2 €/anno fino a 25 € (`pianoFinanziamento`, `contributoENetto`). Limiti della tabella (rate, importo finanziato minimo e massimo) bloccano il salvataggio con avviso nel riquadro (`?finerr=`), il vecchio piano resta; se dopo il totale cambia e il piano esce dai limiti, in stampa tornano le condizioni standard. Vale per tutti i marchi (Solaris, Purafonte…). Collaudo `finanziamento` (22). Da fare: il foglio «prodotti» PI (piccoli interventi) e le polizze.
- **Persiane: forma centinata +60% e trapezio +50%** (Ugo 18/11/2026): optional percentuali per `PERSIANE_BLINDATE` e `PERSIANE_GOCCIA` (`optionalFormePersiane` in `allinea-optional.ts`, create da sole all'apertura di un'offerta); le vecchie voci «ad arco» a prezzo fisso restano.

- **Importazione contatti da file CSV** (richiesta di Ugo 18/11/2026: «un pulsante dove ti carico i file, un csv impostato e tu controlli i doppi»; poi «sono per fare le campagne, se vanno alle telefoniste imballi il loro lavoro, e ne dobbiamo caricare oltre 10.000»): pagina `/lead/importa` (link «📥 Importa contatti da un file» in `/lead`; permesso `lead.importa`, di serie amministratore e marketing), modello scaricabile `GET /api/lead/modello-csv` (Nome e cognome · Telefono · Email · Marchio · Provenienza · Comune · CAP · Prodotto · Note). Si sceglie la destinazione (`Modo`): **CAMPAGNE** (predefinita: `Cliente` con `categoria "Lead"`, `origine` = provenienza, `tag "import AAAA-MM-GG"`, `responsabile` = chi importa; serve l'email, chiave dei doppioni = solo email; NESSUN `Lead`, quindi niente task alle telefoniste; si trovano nelle Campagne filtrando per tipo Lead e provenienza) oppure **TELEFONISTE** (`Lead` in fase NUOVO, scadenza 18:30, telefonista del marchio; chiave = telefono o email). File grandi: il CSV si legge e si controlla nel browser (`ImportaLead`, `righeDaCsv`/`classifica` sono funzioni pure usate anche lì: errori e doppioni dentro il file) e si manda a pezzi da 3.000 righe a `POST /api/lead/importa` (JSON `{ modo, esegui, nomeFile, righe }`, `importaRighe` in `importa-server.ts`: ricontrolla i doppioni contro Lead e Cliente sui dati di adesso e salva con `createMany` a gruppi di 500; si può interrompere e rilanciare senza creare doppioni, limite file 250.000 righe). UTF-8 o Windows-1252 (CSV di Excel), gli .xlsx sono rifiutati con le istruzioni. Telefono: prefisso +39 ignorato, più numeri nella stessa cella. Marchio vuoto o sconosciuto → P&C con avviso. Nessuna email automatica (niente `avviaNuovoLead`). Test `tests/lead/importa.test.ts`, collaudo `lead-importa` (18, compreso un file da 7.000 righe a pezzi).

- **Categorie articoli = listino delle offerte** (richiesta di Ugo 19/11/2026): `assicuraCategorieListino` (`src/lib/articoli/server.ts`, chiamata aprendo Categorie e la scheda articolo) crea una categoria madre per ogni famiglia (INDOOR, OUTDOOR…) e una sottocategoria per ogni gruppo (PERGOLE, VETRATE…) già collegate al listino; solo quelle mancanti, mai rinomina le tue, si riallinea solo se il listino cambia (`categorie_listino_firma`).

- **Schede tecniche Scintilla e Brillante** (richiesta di Ugo 20/11/2026, vetrate panoramiche): PDF e pagine JPG in `public/cataloghi/scintilla/` (8 pagine) e `public/cataloghi/brillante/` (12), voci in `SCHEDE` da `src/lib/listini/schede-vetrate.ts` (prefissi `VETRATA_SCINTILLA` e `VETRATA_BRILLANTE`, descrizione breve per il cliente). Dai PDF del fornitore sono stati tolti nome del sistema e dell'azienda produttrice, Spagna, QR, social, loghi e certificati con la sua ragione sociale; il sistema si chiama col nome P&C (carattere Montserrat), l'azzurro è diventato l'arancio del logo P&C (233,123,54) e sono stati corretti i refusi e le parti in spagnolo/inglese dei PDF originali (elenco `CORREZIONI` nello script: clienti molto attenti). Non corretti perché non si capisce cosa volessero dire: la riga «Mezza estero» della tabella di Brillante e «UNE-EN 1932:214» (forse 2014): da chiedere al fornitore. Ripetibile con `python3 -I scripts/listini/pulisci_schede_vetrate.py <scintilla.pdf> <brillante.pdf> <uscita> <cartella-font reg/semi/bold.ttf>` (serve `pip install pymupdf`; font Montserrat da Google Fonts). Test `tests/listini/schede-vetrate.test.ts`.

- **Province e comuni multipli nel pubblico delle campagne** (richiesta di Ugo 20/11/2026, dopo l'import di ~600 lead da file): `Campagna.province` (sigle) e `Campagna.comuni` (liste, vuote = ovunque; il vecchio `provincia` di testo resta per le campagne di prima); in `whereCampagna` basta stare in uno qualsiasi dei luoghi scelti (sigla o nome della provincia, maiuscole indifferenti, `scritturePerRicerca`). Pagina della campagna: `components/campagne/ScegliLuoghi.tsx` (province per regione con il numero di contatti, «tutta la regione», ricerca, comuni a chip con suggerimenti). Dati: `src/lib/geo/` — `province.ts` e `comuni-data.ts` generati da `scripts/geo/genera_comuni.py` dall'elenco ISTAT dei comuni (github.com/matteocontrini/comuni-json, MIT); `localita.ts` ricava la provincia dal testo, dal CAP (anche con lo zero tolto da Excel) o dal comune (`provinciaDelContatto`; i comuni con lo stesso nome in due province non si indovinano). L'importazione CSV ha la colonna facoltativa «Provincia» e, per le campagne, riempie `Cliente.provincia` da CAP e comune; il pulsante «📍 Completa le province dai CAP e dai comuni» (`completaProvince`) sistema quelli già importati (solo campi vuoti). Collaudo `campagne-luoghi` (19), test `tests/geo/localita.test.ts`.

## Procedura fissa: scheda tecnica di un prodotto (decisa da Ugo, nov 2026)
Ogni volta che Ugo carica la scheda tecnica (PDF) di un prodotto/listino si fa SEMPRE tutto questo, come per l'Optima 70:
1. **Dati aziendali**: nel PDF tutti i dati diversi da quelli di P&C vanno tolti o corretti con quelli veri (`CEDENTE` in
   `src/lib/fatturazione/tabelle.ts`: P&C srl unipersonale, Corso Moncenisio 28 Rosta, P.IVA 10741080013, tel. 011 19887497,
   info@gruppopec.com, PEC gruppopec@cert.ica-net.it). Niente telefoni/REA segnaposto. Controllare ogni pagina (anche righe «Info tecniche»).
2. **File**: PDF in `public/cataloghi/<listino>/` e pagine in JPG `public/cataloghi/<listino>/pagine/p-<n>.jpg`
   (`pdftoppm -jpeg -jpegopt quality=80 -r 110 <pdf> <cartella>/pagine/p`).
3. **Descrizione tecnica breve** per il cliente (3-4 righe dai dati della scheda) nel modulo del listino (es. `DESCRIZIONE_CLIENTE_OPTIMA`).
4. **Una voce in `SCHEDE`** (`src/lib/preventivi/scheda-cliente.ts`): prefisso delle tipologie, chiave, nome, descrizione, PDF, numero pagine.
   Da sola dà: riquadro nel configuratore per il commerciale, descrizione + link «📄 Scheda tecnica» sempre in stampa sotto il prodotto,
   spunta «Allega la scheda tecnica» su ogni riga (stampa in fondo all'offerta + PDF allegato all'email).
5. Test in `tests/listini/<listino>.test.ts` (schedaCliente della tipologia), screenshot, PR.

## Comandi
```bash
npm install                     # genera anche il client Prisma
npx tsc --noEmit -p .           # controllo tipi
npx tsx --test tests/*/*.test.ts   # test unitari (oggi 532, tutti verdi)
npx next build                  # build (in locale senza db push)

# Collaudi end-to-end su Postgres LOCALE (svuotano le tabelle! mai sul DB di produzione)
DATABASE_URL=postgresql://t:t@localhost:5432/crmtest npx prisma db push --skip-generate
DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/<nome>.collaudo.ts
# <nome>: conferma (17), finanziamento (22), lead-importa (18), magazzino (33), ordini (43), articoli (56), calendario (17, con server SMTP finto), utenti (18), clienti (11), campagne (9), aumenti (15), fornitori-modelli (5), automazioni (23, SMTP finto e orologio simulato), appuntamenti (21), recupero (13), campagne-email (34), posta (17, tre server SMTP finti), fornitore-alternativo (15), team (26), fatture-incassi (32), posta-tls (13, server SMTP con certificati veri), contabilita-bconsole (19), marketing (20, SMTP finto), calendario-telefono (13, SMTP finto), permessi (17), tracciamento (15, SMTP finto), rimbalzi (13, SMTP finto e casella simulata), invia-offerta (21, SMTP finto), provvigioni (24), comunicazioni (16, SMTP finto), storico-bconsole (5), documenti-bconsole (6), trafila-incassi (11), presa-in-carico-bc (9), file-acquisti-bc (5), telefoniste (20), moduli-meta (28), dopo-appuntamento (13), isomax-luce (5), rasomuro (11), fidra (8), porte-vetro (6), tempra (6), pedane (5), pavimenti-galleggianti (7), lattoneria (12), taglio-freddo (11), rilievo-complementi (21), ordine-da-rilievo (30, SMTP finto), progetti (14), kit (15), appuntamenti-bconsole (12), riordino-appuntamenti (15), chiamata-commerciale (11), fatturazione (29), svolta-appuntamenti (14), switch-keap (12), lead-clienti (12), prima-nota-chi (9), preventivi-nuovo (8), preventivi-righe (13), servizi-obiettivi (25), optima (9), plasma30 (10), rocco-calendario (20), scheda-cliente (17, SMTP finto), segnalazioni (15, SMTP finto), campagne-ripresa (7, SMTP finto), esiti-appuntamenti (12), campagne-ab (19, SMTP finto), chirenti (11), google (27, Google simulato), nextcloud (16), brevo (18, due SMTP finti e API finta), cestino (13), kit-cliente (22), campagne-escludi (5, SMTP finto), elimina-offerta (6), zenith-optional (6), consumi-database (10, Neon simulata e SMTP finto), coprifili (9), solaris-bconsole (13), solaris-offerta (14), progetto-percorso (20), flusso-uffici (43), rilievo-progetto (15), soglia-rilievo (13)
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
- Controllo esterno attivo da 12/11/2026: cron-job.org ogni 5 minuti su `GET /api/automazioni/esegui` (risponde subito e lavora dopo con `after`, `?attendi=1` per il resoconto).
- Inserire `ANTHROPIC_API_KEY` su Vercel (lettura AI di bolle e fatture).
- Consigliato: database di sviluppo separato (ramo Neon) per non far girare le anteprime sul DB di produzione.
- Documento "flusso pratica per ufficio": cosa fa ciascun ufficio e come usare il CRM.
- Rilievi/assistenze inseriti prima del 30/10/2026 possono risultare spostati di un'ora (vecchio errore di fuso orario).
- Fatturazione elettronica verso SDI: avvio previsto 1° gennaio 2027. Le fatture si emettono già dal CRM (Fatture e DDT, oggi in modalità PROVA):
  il giorno del passaggio da BConsole indicare gli ultimi numeri usati e accendere l'emissione vera; scegliere l'intermediario per l'invio allo SDI.
- Collegamento automatico cassetto fiscale / SDI per le fatture dei fornitori: da scegliere l'intermediario (per ora zip caricati a mano).
- Foto guida ferro zincato da aggiungere: `public/immagini/tapparelle/guida-ferro-zincato.jpg`.
