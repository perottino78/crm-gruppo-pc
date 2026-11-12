# Listino serramenti PVC Plasma 30: griglie larghezza × altezza dai file Excel «PLASMA 30 UKW 1.3 - 2025» (doppio vetro, prefisso PLASMA30_)
# e «PLASMA 30 UKW 1.0 - 2025» (triplo vetro, prefisso PLASMA30TV_). I prezzi dei fogli sono già al cliente (base × coefficiente del file).
# Uso: python3 -I scripts/listini/estrai_plasma30.py <ukw13.xlsx> <ukw10.xlsx> prisma/seed-data/plasma30_prodotti.json
import openpyxl, re, json, sys
# foglio -> [(tipologia per il 1° gruppo di tabelle, tipologia per il 2° gruppo)]; PF1A ha due tabelle con le stesse larghezze (la seconda = soglia ribassata)
BASE = {"FF": "FF", "w": "W", "F1A": "F1A", "F2A": "F2A", "F3A": "F3A", "PF1A": "PF1A", "PF2A": "PF2A",
         "PF2ASoglia": "PF2A_SOGLIA", "PF3A": "PF3A", "PF3ASoglia": "PF3A_SOGLIA", "TRASLANTE": "TRASLANTE"}
prodotti = []; riepilogo = {}
FILE = [(sys.argv[1], "PLASMA30_"), (sys.argv[2], "PLASMA30TV_")]
out = sys.argv[3]
for src, prefisso in FILE:
  wb = openpyxl.load_workbook(src, data_only=True)
  for foglio, base in BASE.items():
    tip = prefisso + base
    ws = wb[foglio]
    griglie = {}  # tipologia -> {(L,H): valore|'*'}
    header = None; corrente = tip; visti = set()
    for row in ws.iter_rows(values_only=True):
        if row[0] == "H/L":
            header = {}
            for i, v in enumerate(row):
                if isinstance(v, str) and re.fullmatch(r"L\d+", v.strip()): header[i] = int(v.strip()[1:])
            larg = tuple(sorted(header.values()))
            # PF1A: seconda tabella con le stesse larghezze = soglia ribassata
            corrente = tip + "_SOGLIA" if (foglio == "PF1A" and larg in visti) else tip
            visti.add(larg)
            continue
        if header and isinstance(row[0], (int, float)):
            H = int(row[0])
            g = griglie.setdefault(corrente, {})
            for i, L in header.items():
                v = row[i] if i < len(row) else None
                if isinstance(v, (int, float)): g[(L, H)] = round(float(v), 2)
                elif isinstance(v, str) and v.strip() == "*": g[(L, H)] = "*"
    for t, g in griglie.items():
        # «*» = prendere il primo prezzo disponibile: stessa altezza a destra, altrimenti stessa larghezza più in alto
        Ls = sorted({k[0] for k in g}); Hs = sorted({k[1] for k in g})
        def primo(L, H):
            for L2 in Ls:
                if L2 >= L and isinstance(g.get((L2, H)), float): return g[(L2, H)]
            for H2 in Hs:
                if H2 > H and isinstance(g.get((L, H2)), float): return g[(L, H2)]
            for H2 in Hs:
                if H2 > H:
                    for L2 in Ls:
                        if L2 >= L and isinstance(g.get((L2, H2)), float): return g[(L2, H2)]
            return None
        n = 0
        for (L, H), v in sorted(g.items(), key=lambda x: (x[0][1], x[0][0])):
            p = v if isinstance(v, float) else primo(L, H)
            if p is None: continue
            prodotti.append({"tipologia": t, "colore": "STANDARD", "larghezzaMm": L, "altezzaMm": H, "prezzoBase": p}); n += 1
        riepilogo[t] = (n, min(Ls), max(Ls), min(Hs), max(Hs))
# refusi del file: F2A 900×800 «937» (lo stesso del listino Fidra) = 488 di base × 2,7 come le celle vicine e l'Optima
CORREZIONI = {("PLASMA30_F2A", 900, 800): 1317.6}
for p in prodotti:
    k = (p["tipologia"], p["larghezzaMm"], p["altezzaMm"])
    if k in CORREZIONI: p["prezzoBase"] = CORREZIONI[k]
json.dump(prodotti, open(out, "w"), ensure_ascii=False)
for k, v in riepilogo.items(): print(k, v)
print("totale", len(prodotti))
