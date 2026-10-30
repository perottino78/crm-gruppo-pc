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
- Email: `nodemailer` via SMTP (`src/lib/mail/invio.ts`), si attiva solo se ci sono le variabili SMTP.

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
- **Fornitori**: `Soggetto` con `ruoli: ["FORNITORE"]`; 55 importati da BConsole (rotta `api/admin/importa-fornitori-bconsole`).

## Comandi
```bash
npm install                     # genera anche il client Prisma
npx tsc --noEmit -p .           # controllo tipi
npx tsx --test tests/*/*.test.ts   # test unitari (oggi 134, tutti verdi)
npx next build                  # build (in locale senza db push)

# Collaudi end-to-end su Postgres LOCALE (svuotano le tabelle! mai sul DB di produzione)
DATABASE_URL=postgresql://t:t@localhost:5432/crmtest npx prisma db push --skip-generate
DATABASE_URL=postgresql://t:t@localhost:5432/crmtest node --require ./tests/collaudo/registra.cjs --import tsx tests/collaudo/<nome>.collaudo.ts
# <nome>: conferma (17), magazzino (33), ordini (43), articoli (48), calendario (16, con server SMTP finto), utenti (15)
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
- Inserire su Vercel le variabili SMTP, poi provare un invito di calendario verso Ugo.
- Inserire `ANTHROPIC_API_KEY` su Vercel (lettura AI di bolle e fatture).
- Consigliato: database di sviluppo separato (ramo Neon) per non far girare le anteprime sul DB di produzione.
- Documento "flusso pratica per ufficio": cosa fa ciascun ufficio e come usare il CRM.
- Rilievi/assistenze inseriti prima del 30/10/2026 possono risultare spostati di un'ora (vecchio errore di fuso orario).
- Fatturazione elettronica verso SDI: avvio previsto 1° gennaio 2027.
- Foto guida ferro zincato da aggiungere: `public/immagini/tapparelle/guida-ferro-zincato.jpg`.
