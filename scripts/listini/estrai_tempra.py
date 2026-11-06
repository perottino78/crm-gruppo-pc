# Estrae le 8 tabelle prezzi del listino STABYLA (pergola «Tempra») dal testo del PDF (pdftotext -layout)
# e scrive le righe Prodotto a prezzo di vendita (listino fornitore × 1,6).
# Uso: pdftotext -layout listino.pdf t.txt && python3 -I scripts/listini/estrai_tempra.py t.txt prisma/seed-data/tempra_prodotti.json
import re, sys, json
righe = open(sys.argv[1], encoding="utf-8").read().splitlines()
RICARICO = 1.6
out, tip = [], None
i = 0
while i < len(righe):
    m = re.search(r"MODULO (ADDOSSATO|AUTOPORTANTE) • (A70\d) •", righe[i])
    if m: tip = f"STABYLA_{m.group(2)}_{'AD' if m.group(1) == 'ADDOSSATO' else 'AU'}"
    if "TABELLA PREZZI" in righe[i]:
        j = i + 1
        while not re.match(r"^\s*\d{4}(\s+\d{4,5})+\s*$", righe[j]): j += 1
        larghezze = [int(x) for x in righe[j].split()]
        j += 1
        while j < len(righe):
            r = righe[j].strip()
            if not r: j += 1; continue
            parti = r.split()
            if not re.fullmatch(r"\d{4}", parti[0]) or len(parti) != len(larghezze) + 1: break
            H = int(parti[0])
            for L, v in zip(larghezze, parti[1:]):
                listino = int(v.replace(".", ""))
                out.append({"tipologia": tip, "colore": "STANDARD", "larghezzaMm": L, "altezzaMm": H, "prezzoBase": round(listino * RICARICO, 2), "listino": listino})
            j += 1
        i = j
        continue
    i += 1
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False)
from collections import Counter
print(Counter(p["tipologia"] for p in out), len(out))
