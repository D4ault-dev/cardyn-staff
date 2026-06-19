#!/bin/bash
set -e
cd /www/wwwroot/cardyn.net/downloads

EXE=$(ls "Cardyn Staff Setup"*.exe 2>/dev/null | sort -V | tail -1)
if [ -z "$EXE" ]; then EXE=$(ls *.exe 2>/dev/null | sort -V | tail -1); fi
if [ -z "$EXE" ] || [ ! -f "$EXE" ]; then
  echo "ERROR: no exe found"
  ls -la
  exit 1
fi

VERSION=$(echo "$EXE" | grep -oP '\d+\.\d+\.\d+' | head -1)
RELEASE_DATE=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
SIZE=$(stat -c%s "$EXE")
SHA512=$(sha512sum "$EXE" | awk '{print $1}' | xxd -r -p | base64 -w0)
EXE_ENCODED=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$EXE")

cat > latest.yml << YMLEOF
version: '$VERSION'
files:
  - url: $EXE_ENCODED
    sha512: $SHA512
    size: $SIZE
path: $EXE_ENCODED
sha512: $SHA512
releaseDate: '$RELEASE_DATE'
YMLEOF

echo "Done: version=$VERSION file=$EXE"
cat latest.yml
