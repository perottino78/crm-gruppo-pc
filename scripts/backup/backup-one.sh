#!/bin/sh
# Backup notturno di P&C ONE sul NAS dell'ufficio.
# Lo installa una volta l'amministratore (Impostazioni › Backup sul NAS); poi il NAS lo lancia ogni notte alle 2 e
# P&C ONE dice se stanotte tocca e cosa (scelta in Impostazioni › Backup sul NAS: una volta a settimana o ogni notte):
#   - backup completo (dati, foto e documenti) o solo dati;
#   - ogni backup in una cartella con la data, accanto a questa cartella «.one»;
#   - tiene gli ultimi 30 backup dei dati e gli ultimi 5 completi, i più vecchi si cancellano da soli;
#   - alla fine avvisa P&C ONE com'è andata (se per 36 ore non arriva niente, ONE manda un'email agli amministratori).
# Uso a mano:  sh backup-one.sh            (come di notte: decide P&C ONE)
#              sh backup-one.sh --dati      (solo i dati, subito)
#              sh backup-one.sh --completo  (anche foto e documenti)
#              sh backup-one.sh --installa  (prova la chiave e lo mette nelle attività pianificate)
URL="__URL__"
DIR=$(cd "$(dirname "$0")" && pwd)
RADICE=$(dirname "$DIR")
SCRIPT="$DIR/backup-one.sh"
TIENI_DATI=30
TIENI_COMPLETI=5
[ -f "$DIR/indirizzo" ] && URL=$(cat "$DIR/indirizzo")
CHIAVE=$(cat "$DIR/chiave" 2>/dev/null)
if [ -z "$CHIAVE" ]; then echo "Manca il file $DIR/chiave"; exit 1; fi

installa() {
  echo "Provo la chiave su $URL ..."
  if ! curl -fsS --max-time 60 -H "X-Backup-Key: $CHIAVE" "$URL/api/backup/elenco?tipo=dati" -o "$DIR/prova.txt"; then
    echo "ERRORE: P&C ONE non risponde o la chiave non è giusta."; exit 1
  fi
  echo "Chiave giusta: $(grep -vc '^#' "$DIR/prova.txt") parti da scaricare."
  rm -f "$DIR/prova.txt"
  CRON=/etc/config/crontab
  grep -v "backup-one.sh" "$CRON" > "$DIR/crontab.nuovo"
  echo "0 2 * * * /bin/sh \"$SCRIPT\" >/dev/null 2>&1" >> "$DIR/crontab.nuovo"
  cat "$DIR/crontab.nuovo" > "$CRON" && rm -f "$DIR/crontab.nuovo"
  crontab "$CRON" && /etc/init.d/crond.sh restart >/dev/null 2>&1
  if crontab -l | grep -q "backup-one.sh"; then echo "FATTO: il NAS chiamerà P&C ONE ogni notte alle 2:00."; else echo "ERRORE: attività pianificata non salvata."; exit 1; fi
}

if [ "$1" = "--installa" ]; then installa; exit 0; fi

RICHIESTA=""
[ "$1" = "--completo" ] && RICHIESTA="completo"
[ "$1" = "--dati" ] && RICHIESTA="dati"
LOG="$DIR/ultimo.log"
INIZIO=$(date +%s)
# prima l'elenco: dice anche se stanotte tocca («# salta») e che tipo di backup è
if ! curl -fsS --retry 3 --retry-delay 20 --max-time 120 -H "X-Backup-Key: $CHIAVE" "$URL/api/backup/elenco?tipo=$RICHIESTA" -o "$DIR/elenco.txt"; then
  rm -f "$DIR/elenco.txt"
  echo "ERRORE $(date): elenco non scaricato (P&C ONE non risponde o chiave sbagliata)" > "$LOG"
  curl -fsS --max-time 60 -H "X-Backup-Key: $CHIAVE" -d "tipo=dati&cartella=nessuna&file=0&byte=0&errori=1&durata=0" "$URL/api/backup/fatto" >/dev/null 2>&1
  exit 1
fi
if grep -q '^# salta' "$DIR/elenco.txt"; then
  echo "$(date): stanotte niente backup (frequenza scelta in P&C ONE)" > "$DIR/ultima-chiamata.log"
  rm -f "$DIR/elenco.txt"; exit 0
fi
TIPO=dati
grep -q '^# tipo completo' "$DIR/elenco.txt" && TIPO=completo
NOME=$(date +%Y-%m-%d)
[ "$TIPO" = "completo" ] && NOME="$NOME-completo"
TMP="$RADICE/.in-corso-$NOME"
DEST="$RADICE/$NOME"
rm -rf "$TMP" && mkdir -p "$TMP" || exit 1
mv "$DIR/elenco.txt" "$TMP/elenco.txt"
exec > "$LOG" 2>&1
echo "Backup P&C ONE ($TIPO) iniziato $(date)"

FILE=0; BYTE=0; ERR=0
  while read -r T P N; do
    case "$T" in ''|'#'*) continue ;; esac
    F="$TMP/$T.$P.ndjson.gz"
    if curl -fsS --retry 3 --retry-delay 20 --max-time 295 -H "X-Backup-Key: $CHIAVE" "$URL/api/backup/tabella?nome=$T&parte=$P&parti=$N" -o "$F" && gzip -t "$F" 2>/dev/null; then
      FILE=$((FILE + 1)); BYTE=$((BYTE + $(wc -c < "$F")))
    else
      ERR=$((ERR + 1)); echo "ERRORE: $T parte $P"
    fi
  done < "$TMP/elenco.txt"

if [ "$ERR" = "0" ]; then
  rm -rf "$DEST" && mv "$TMP" "$DEST"
else
  rm -rf "$DEST-incompleto" && mv "$TMP" "$DEST-incompleto"
  NOME="$NOME-incompleto"
fi
cp "$LOG" "$RADICE/$NOME/registro.txt" 2>/dev/null

# pulizia: si tengono gli ultimi backup, i più vecchi si cancellano
ls -1d "$RADICE"/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9] 2>/dev/null | sort -r | tail -n +$((TIENI_DATI + 1)) | while read -r D; do rm -rf "$D"; done
ls -1d "$RADICE"/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]-completo 2>/dev/null | sort -r | tail -n +$((TIENI_COMPLETI + 1)) | while read -r D; do rm -rf "$D"; done
ls -1d "$RADICE"/20[0-9][0-9]-[0-9][0-9]-[0-9][0-9]*-incompleto 2>/dev/null | sort -r | tail -n +4 | while read -r D; do rm -rf "$D"; done

DURATA=$(( $(date +%s) - INIZIO ))
LIBERO=$(df -k "$RADICE" | tail -1 | awk '{print $(NF-2)}')
echo "Finito $(date): $FILE file, $BYTE byte, $ERR errori, $DURATA secondi"
curl -fsS --retry 3 --max-time 60 -H "X-Backup-Key: $CHIAVE" -d "tipo=$TIPO&cartella=$NOME&file=$FILE&byte=$BYTE&errori=$ERR&durata=$DURATA&libero=$LIBERO" "$URL/api/backup/fatto" >/dev/null
