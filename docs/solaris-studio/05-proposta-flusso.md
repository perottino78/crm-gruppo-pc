# Proposta: nuovo flusso di Solaris Studio

Il flusso attuale va bene per il residenziale monofase. Per coprire tutti i casi serve un **selettore della categoria
d'impianto al primo passo**, che adatta il resto: taglie disponibili, checklist normativa, avvisi nel preventivo.

## Passi del wizard

| # | Passo | Stato | Cosa fa |
|---|---|---|---|
| 1 | **Categoria impianto** | NUOVO | Tre tessere: **Monofase** (casa/appartamento, ≤ 9 kWp), **Trifase residenziale** (villa/condominio, 6–20 kWp), **Trifase industriale** (capannone/azienda, 20–100 kWp). Filtra le taglie del passo dopo. |
| 2 | **Potenza** | ESPANSO | Taglie secondo la categoria (Monofase 4,5/6/9 · Trifase res. 6/9/12/15/20 · Trifase ind. 20/30/50/100). Per ogni taglia: pannelli calcolati, inverter suggerito, avviso SPI se > 11,08 kW. |
| 3 | **Dati cliente e consumi** | INVARIATO | Come oggi «Casa e consumi»: nome, indirizzo, consumo annuo, prezzo energia, orientamento, inclinazione. |
| 4 | **Componenti e simulazione** | ESPANSO | Pannello e inverter dal catalogo (da aggiungere i modelli trifase). Accumulo facoltativo per l'industriale. Stessa logica di simulazione, valori coerenti con le taglie grandi. |
| 5 | **Checklist normativa** | NUOVO, solo industriale | La checklist di [04-trifase-industriale.md](04-trifase-industriale.md) con le spunte, salvata nel progetto e visibile nel banner del CRM. Punti critici non spuntati → avviso arancione nel preventivo. |
| 6 | **Riepilogo e ritorno al preventivo** | INVARIATO | Come oggi «Proposta» + «← Torna al preventivo» con importazione delle righe. |

> Da allineare: oggi i passi sono 4 (Casa e consumi → Tetto e sole → Risparmio → Proposta). Nella proposta «Tetto e sole»
> si divide fra il passo 2 (potenza/pannelli) e il 4 (componenti); «Risparmio» resta dentro il 4.

## Campi da aggiungere a `SolarisProgetto`

| Campo | Tipo Prisma | Valori | Note |
|---|---|---|---|
| `categoriaImpianto` | `String?` | `MONOFASE` / `TRIFASE_RESIDENZIALE` / `TRIFASE_INDUSTRIALE` | Guida il wizard. Vuoto = progetti esistenti → trattati come MONOFASE. |
| `checklistJson` | `Json?` | `{ vvf, officinaEl, pas, telecontrollo, dnsh, terna, strutturale, vincoli }` | Sì/no per ogni punto della checklist industriale (eventualmente con data e chi). |
| `spiEsterno` | `Boolean?` | true / false | Calcolato da solo se kWp > 11,08 (modificabile dal tecnico). |

Regola del progetto (CLAUDE.md): niente migrazioni, la build fa `prisma db push` sul database di produzione → **solo campi
facoltativi**, nessun `@unique`, nessun nuovo enum obbligatorio. Per questo `categoriaImpianto` è proposto come `String?`
invece di un enum (si può validare nel codice).

## Ordine di lavoro proposto
1. Campi nuovi in `schema.prisma` (push di prova su DB copia con lo schema di `origin/main`).
2. Regole pure in `src/lib/solaris/categorie.ts` (taglie per categoria, pannelli, inverter suggerito, SPI, soglie) con test
   in `tests/solaris/categorie.test.ts`.
3. `studio.html`: passo «Categoria», taglie filtrate, passo «Checklist» solo industriale; salvataggio dei campi nuovi in `save`.
4. Catalogo `SolarisComponente`: inverter trifase 6–100 kW, SPI esterno, telecontrollo come voci di preventivo.
5. Banner del CRM e preventivo: stato della checklist e avviso arancione sui punti critici aperti.
6. Collaudo `solaris-categorie` e screenshot su telefono (390 px).
