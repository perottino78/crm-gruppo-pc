#!/bin/sh
# Backup notturno di P&C ONE sul NAS dell'ufficio.
# Lo installa una volta l'amministratore (Impostazioni › Backup sul NAS); poi gira da solo ogni notte alle 2:
#   - tutti i giorni i dati (clienti, offerte, pratiche, contabilità...), la domenica anche foto e documenti;
#   - ogni backup in una cartella con la data, accanto a questa cartella «.one»;
#   - tiene gli ultimi 30 backup dei dati e gli ultimi 5 completi, i più vecchi si cancellano da soli;
#   - alla fine avvisa P&C ONE com'è andata (se per 36 ore non arriva niente, ONE manda un'email agli amministratori).
# Uso a mano:  sh backup-one.sh            (dati; la domenica completo)
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
  if crontab -l | grep -q "backup-one.sh"; then echo "FATTO: il backup partirà ogni notte alle 2:00."; else echo "ERRORE: attività pianificata non salvata."; exit 1; fi
}

if [ "$1" = "--installa" ]; then installa; exit 0; fi

TIPO=dati
[ "$(date +%u)" = "7" ] && TIPO=completo
[ "$1" = "--completo" ] && TIPO=completo
[ "$1" = "--dati" ] && TIPO=dati
NOME=$(date +%Y-%m-%d)
[ "$TIPO" = "completo" ] && NOME="$NOME-completo"
TMP="$RADICE/.in-corso-$NOME"
DEST="$RADICE/$NOME"
LOG="$DIR/ultimo.log"
INIZIO=$(date +%s)
rm -rf "$TMP" && mkdir -p "$TMP" || exit 1
exec > "$LOG" 2>&1
echo "Backup P&C ONE ($TIPO) iniziato $(date)"

FILE=0; BYTE=0; ERR=0
if curl -fsS --retry 3 --retry-delay 20 --max-time 120 -H "X-Backup-Key: $CHIAVE" "$URL/api/backup/elenco?tipo=$TIPO" -o "$TMP/elenco.txt"; then
  while read -r T P N; do
    case "$T" in ''|'#'*) continue ;; esac
    F="$TMP/$T.$P.ndjson.gz"
    if curl -fsS --retry 3 --retry-delay 20 --max-time 295 -H "X-Backup-Key: $CHIAVE" "$URL/api/backup/tabella?nome=$T&parte=$P&parti=$N" -o "$F" && gzip -t "$F" 2>/dev/null; then
      FILE=$((FILE + 1)); BYTE=$((BYTE + $(wc -c < "$F")))
    else
      ERR=$((ERR + 1)); echo "ERRORE: $T parte $P"
    fi
  done < "$TMP/elenco.txt"
else
  ERR=1; echo "ERRORE: elenco non scaricato (P&C ONE non risponde o chiave sbagliata)"
fi

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
