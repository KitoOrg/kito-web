#!/usr/bin/env bash
# A Kito server to look at the web client behind: two repositories, ada
# who may do everything and carol who may read one of them, and lanes in
# `shop`. It needs Kito built next to this repository (`../kito`, or
# KITO_BIN), and `scripts/build.sh` run here.
#
#   scripts/demo-team.sh [http address]     # serves until stopped
#
# The server here is in the clear, on this machine (--plain): a real one
# encrypts with its certificate.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${KITO_BIN:-$HERE/../kito/target/release}"
export PATH="$BIN:$PATH"
export KITO_NO_CLAUDE=1 KITO_AUTHOR="${KITO_AUTHOR:-ada}"
DEMO="${KITO_WEB_DEMO:-${TMPDIR:-/tmp}/kito-web-team-demo}"
HTTP="${1:-127.0.0.1:7443}"
export KITO_CONFIG_DIR="$DEMO/config"
SERVER="$DEMO/server"
APP="$SERVER/repos/shop"

kito --repo "$APP" daemon stop >/dev/null 2>&1 || true
rm -rf "$DEMO"
mkdir -p "$DEMO"
kito-server init "$SERVER" >/dev/null
kito-server --dir "$SERVER" repo add shop >/dev/null
kito-server --dir "$SERVER" repo add books >/dev/null

mkdir -p "$APP/src"
cd "$APP"
cat > src/shop.ts <<'TS'
export function total(prices: number[]): number {
  let sum = 0;
  for (const price of prices) {
    sum += price;
  }
  return sum;
}

export function discount(amount: number, percent: number): number {
  return amount - (amount * percent) / 100;
}
TS
printf '# Shop\n\nPrices and what is taken off them.\n' > README.md
printf '.kito/\n' > .gitignore
kito checkpoint -m "first version" >/dev/null

# Something already went in through a lane, and a note was left on the code.
kito lane open carol --intent "say what the shop takes off" --scope README.md >/dev/null
printf '# Shop\n\nPrices, and the discounts taken off them.\n' > "$APP/.kito/lanes/1/work/README.md"
kito integrate 1 >/dev/null
kito lane close 1 >/dev/null
kito note src/shop.ts:total "Called by the nightly billing job, outside this repository: do not rename." >/dev/null

# Alice's agent puts the prices in cents; somebody asked for a change.
kito lane open alice --intent "prices in cents" --scope ./ >/dev/null
WORK="$APP/.kito/lanes/2/work"
sed -i.bak 's/sum += price;/sum += Math.floor(price * 100);/' "$WORK/src/shop.ts" && rm "$WORK/src/shop.ts.bak"
printf '\nPrices are kept in cents.\n' >> "$WORK/README.md"
kito lane comment 2 "Half a cent is lost: round, do not floor." --on src/shop.ts:4 >/dev/null
kito lane request-changes 2 "See the comment on line 4." >/dev/null
cd "$DEMO"

kito-server --dir "$SERVER" plugin add --path "$HERE/plugin" >/dev/null
kito-server --dir "$SERVER" plugin enable web >/dev/null
echo "ada, who may do everything:"
kito-server --dir "$SERVER" user add ada | grep '^kito_'
echo "carol, who may read shop:"
kito-server --dir "$SERVER" user add carol --role read --repo shop | grep '^kito_'
echo "Open http://$HTTP/ and sign in with one of the tokens."
exec kito-server --dir "$SERVER" serve --plain --listen 127.0.0.1:0 --http "$HTTP"
