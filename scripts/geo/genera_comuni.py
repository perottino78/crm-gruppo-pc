"""Genera src/lib/geo/province.ts e comuni-data.ts dall'elenco dei comuni italiani (ISTAT, formato di github.com/matteocontrini/comuni-json, licenza MIT).
Uso: python3 -I scripts/geo/genera_comuni.py comuni.json"""
import json, sys, collections

d = json.load(open(sys.argv[1], encoding="utf-8"))
province = {}
comuni = collections.defaultdict(list)
caps = collections.defaultdict(set)
for c in d:
    s = c["sigla"]
    province[s] = (c["provincia"]["nome"], c["regione"]["nome"])
    comuni[s].append(c["nome"])
    for p in c["cap"]: caps[s].add(p)

ordine = sorted(province.items(), key=lambda kv: (kv[1][1], kv[1][0]))
with open("src/lib/geo/province.ts", "w", encoding="utf-8") as f:
    f.write("// Province italiane con regione (generato da scripts/geo/genera_comuni.py dai dati ISTAT: non modificare a mano).\n")
    f.write("export type Provincia = { sigla: string; nome: string; regione: string };\n")
    f.write("export const PROVINCE: Provincia[] = [\n")
    for s, (n, r) in ordine:
        f.write("  { sigla: %s, nome: %s, regione: %s },\n" % (json.dumps(s), json.dumps(n, ensure_ascii=False), json.dumps(r, ensure_ascii=False)))
    f.write("];\n")

def intervalli(lista):
    nums = sorted(int(x) for x in lista)
    out, i = [], 0
    while i < len(nums):
        j = i
        while j + 1 < len(nums) and nums[j + 1] == nums[j] + 1: j += 1
        out.append("%05d" % nums[i] if i == j else "%05d-%05d" % (nums[i], nums[j]))
        i = j + 1
    return ",".join(out)

with open("src/lib/geo/comuni-data.ts", "w", encoding="utf-8") as f:
    f.write("// Comuni e CAP italiani per provincia (generato da scripts/geo/genera_comuni.py dai dati ISTAT: non modificare a mano).\n")
    f.write("// Servono a ricavare la provincia di un contatto dal suo comune o dal suo CAP.\n")
    f.write("export const COMUNI_PER_PROVINCIA = %s;\n" % json.dumps({s: "|".join(sorted(v)) for s, v in sorted(comuni.items())}, ensure_ascii=False, separators=(",", ":")))
    f.write("export const CAP_PER_PROVINCIA = %s;\n" % json.dumps({s: intervalli(v) for s, v in sorted(caps.items())}, separators=(",", ":")))
print(len(province), "province", sum(len(v) for v in comuni.values()), "comuni")
