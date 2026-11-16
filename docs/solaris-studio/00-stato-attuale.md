# Solaris Studio oggi

## Dove sta nel codice
- Pagina: `src/app/(studio)/solaris/progetto/[id]/page.tsx` — controlla l'accesso (amministratore e tecnico Solaris vedono
  tutti i progetti, il commerciale solo i suoi, `getSolarisLivello`) e apre lo Studio in un iframe.
- Studio vero e proprio: `public/solaris-studio/studio.html` servito da `GET /api/solaris/studio/[id]`.
- Salvataggio: `POST /api/solaris/progetto/[id]/save`; foto: `/api/solaris/progetto/[id]/foto`.
- Simulatore pubblico per i lead: `/api/solaris/simula/lead` (pagina `/simula`).
- Tabella: `SolarisProgetto` in `prisma/schema.prisma` (una per preventivo, `preventivoId` unico).

## Passi del wizard attuale
1. **Casa e consumi** — nome, indirizzo, coordinate, zona climatica, consumo kWh, prezzo energia, fascia F1, presenza di giorno, quiz abitudini.
2. **Tetto e sole** — orientamento, inclinazione, numero pannelli, batteria (0/5/10/15 kWh), pannello e inverter dal catalogo `SolarisComponente`.
3. **Risparmio** — produzione stimata, risparmio anno 1 e 25 anni, rientro, autonomia.
4. **Proposta** — riepilogo e «← Torna al preventivo»: nel CRM il banner verde importa le righe nell'offerta.

Costi (€/kWp, €/kWh batteria, detrazione) visibili solo all'amministratore.

## Limite
Pensato per il **residenziale monofase**: nessuna distinzione monofase/trifase, nessun avviso per SPI esterno,
nessuna checklist per gli impianti ≥ 20 kWp.
