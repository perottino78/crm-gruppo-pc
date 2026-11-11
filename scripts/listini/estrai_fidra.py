import openpyxl, re, json, sys
src, out = sys.argv[1], sys.argv[2]
wb = openpyxl.load_workbook(src, data_only=True)
# foglio -> [(tipologia per il 1° gruppo di tabelle, tipologia per il 2° gruppo)]; PF1A ha due tabelle con le stesse larghezze (la seconda = soglia ribassata)
FOGLI = {"FF": "FIDRA_FF", "w": "FIDRA_W", "F1A": "FIDRA_F1A", "F2A": "FIDRA_F2A", "F3A": "FIDRA_F3A", "PF1A": "FIDRA_PF1A", "PF2A": "FIDRA_PF2A",
         "PF2ASoglia": "FIDRA_PF2A_SOGLIA", "PF3A": "FIDRA_PF3A", "PF3ASoglia": "FIDRA_PF3A_SOGLIA", "TRASLANTE": "FIDRA_TRASLANTE"}
prodotti = []; riepilogo = {}
for foglio, tip in FOGLI.items():
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
# refusi del file del fornitore, corretti seguendo la progressione delle misure vicine (richiesta di Ugo, nov 2026)
CORREZIONI = {("FIDRA_F2A", 900, 800): 1073.6}  # nel file 937 (più basso di 900×700, 900×900 e 1000×800); = 488 di base × 2,2 come Optima
for p in prodotti:
    k = (p["tipologia"], p["larghezzaMm"], p["altezzaMm"])
    if k in CORREZIONI: p["prezzoBase"] = CORREZIONI[k]
json.dump(prodotti, open(out, "w"), ensure_ascii=False)
for k, v in riepilogo.items(): print(k, v)
print("totale", len(prodotti))
