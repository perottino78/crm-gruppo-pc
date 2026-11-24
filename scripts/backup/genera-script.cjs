// Rigenera src/lib/backup/script.ts da scripts/backup/backup-one.sh (lo script che gira sul NAS).
const fs = require("fs");
const path = require("path");
const radice = path.join(__dirname, "..", "..");
const s = fs.readFileSync(path.join(radice, "scripts/backup/backup-one.sh"), "utf8");
fs.writeFileSync(path.join(radice, "src/lib/backup/script.ts"),
  "// Script del NAS servito da /api/backup/script. NON modificare qui: la fonte è scripts/backup/backup-one.sh;\n" +
  "// dopo averla cambiata rigenera questo file con  node scripts/backup/genera-script.cjs  (il test controlla che siano uguali).\n" +
  `export const SCRIPT_NAS: string = ${JSON.stringify(s)};\n\n` +
  'export const scriptPer = (url: string) => SCRIPT_NAS.replace("__URL__", url.replace(/\\/+$/, ""));\n');
