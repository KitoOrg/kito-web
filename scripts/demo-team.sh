#!/usr/bin/env bash
# A Kito server to look at the web client behind: two repositories; ada
# who may do everything, bob who may write in `shop` and carol who may
# read it; and lanes that stand in every way a lane can: one asked to
# change and that will not merge, two on the same code, one that waits
# for somebody who may integrate it. It needs Kito built next to this
# repository (`../kito`, or KITO_BIN), `scripts/build.sh` run here, and
# curl.
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
# Her lane says what her agent runs in (Kito 0.25): the others say theirs, and frank's nothing.
kito lane open alice --intent "prices in cents" --scope ./ --assistant claude-code --model claude-opus-5 >/dev/null
WORK="$APP/.kito/lanes/2/work"
sed -i.bak 's/sum += price;/sum += Math.floor(price * 100);/' "$WORK/src/shop.ts" && rm "$WORK/src/shop.ts.bak"
printf '\nPrices are kept in cents.\n' >> "$WORK/README.md"
kito lane comment 2 "Half a cent is lost: round, do not floor." --on src/shop.ts:4 >/dev/null
kito lane request-changes 2 "See the comment on line 4." >/dev/null

# Meanwhile the line alice's lane changes went in another way: her lane
# will not merge with it, and has a conflict to decide.
kito lane open gus --intent "prices rounded to whole units" --scope src/shop.ts:total --assistant codex >/dev/null
WORK="$APP/.kito/lanes/3/work"
sed -i.bak 's/sum += price;/sum += Math.round(price);/' "$WORK/src/shop.ts" && rm "$WORK/src/shop.ts.bak"
kito integrate 3 >/dev/null
kito lane close 3 >/dev/null
kito integrate 2 >/dev/null 2>&1 || true

# The other repository has its own work in progress.
BOOKS="$SERVER/repos/books"
cd "$BOOKS"
printf '# Books

1. Opening
3. The storm
2. The crossing
' > README.md
printf '.kito/
' > .gitignore
kito checkpoint -m "first version" >/dev/null
kito lane open frank --intent "chapters in the order they are read" --scope README.md >/dev/null
printf '# Books

1. Opening
2. The crossing
3. The storm
' > "$BOOKS/.kito/lanes/1/work/README.md"
kito sync >/dev/null
cd "$DEMO"

# A registry of files next to the server, with the plugins built beside
# this repository (`../kito-kitchen/plugin`, …): what the page of the
# server's plugins installs from.
REGISTRY="$DEMO/registry"
mkdir -p "$REGISTRY/plugins"
PLATFORM="$(uname -s | tr '[:upper:]' '[:lower:]' | sed 's/darwin/macos/')-$(uname -m | sed 's/arm64/aarch64/')"
[ "${PLATFORM%%-*}" = macos ] && PLATFORM="$(echo "$PLATFORM" | sed 's/aarch64/arm64/')"
INDEX=""
for built in "$HERE"/../kito-*/plugin; do
  [ -f "$built/kito-plugin.toml" ] || continue
  name="$(sed -n 's/^name = "\(.*\)"/\1/p' "$built/kito-plugin.toml" | head -1)"
  version="$(sed -n 's/^version = "\(.*\)"/\1/p' "$built/kito-plugin.toml" | head -1)"
  about="$(sed -n 's/^description = "\(.*\)"/\1/p' "$built/kito-plugin.toml" | head -1)"
  api="$(sed -n 's/^api = \(.*\)/\1/p' "$built/kito-plugin.toml" | head -1)"
  [ "$name" = web ] && continue
  mkdir -p "$DEMO/pack/kito-$name" && cp "$built"/* "$DEMO/pack/kito-$name/"
  tar -czf "$REGISTRY/kito-$name-$version.tar.gz" -C "$DEMO/pack" "kito-$name"
  sum="$(sha256sum "$REGISTRY/kito-$name-$version.tar.gz" | cut -d' ' -f1)"
  printf '{"name":"%s","about":"%s","versions":{"%s":{"api":%s,"files":{"%s":{"url":"kito-%s-%s.tar.gz","sha256":"%s"}}}}}\n' \
    "$name" "$about" "$version" "$api" "$PLATFORM" "$name" "$version" "$sum" > "$REGISTRY/plugins/$name.json"
  INDEX="$INDEX${INDEX:+,}\"$name\":{\"about\":\"$about\",\"latest\":\"$version\"}"
done
printf '{"registry":1,"plugins":{%s}}\n' "$INDEX" > "$REGISTRY/index.json"
export KITO_REGISTRY="file://$REGISTRY"

kito-server --dir "$SERVER" plugin add --path "$HERE/plugin" >/dev/null
kito-server --dir "$SERVER" plugin enable web >/dev/null
echo "ada, who may do everything, and is an administrator of the server:"
kito-server --dir "$SERVER" user add ada | grep '^kito_'
kito-server --dir "$SERVER" user admin ada >/dev/null
echo "bob, who may write in shop, and not integrate:"
BOB="$(kito-server --dir "$SERVER" user add bob --role write --repo shop | grep '^kito_')"
echo "$BOB"
echo "carol, who may read shop:"
kito-server --dir "$SERVER" user add carol --role read --repo shop | grep '^kito_'
echo "Open http://$HTTP/ and sign in with one of the tokens."
kito-server --dir "$SERVER" serve --plain --listen 127.0.0.1:0 --http "$HTTP" &
SERVING=$!
trap 'kill "$SERVING" 2>/dev/null' EXIT
trap 'exit 0' INT TERM
for _ in $(seq 1 100); do
  curl -s -o /dev/null "http://$HTTP/-/sign-in" && break
  sleep 0.1
done

# Bob's agents work through the server, as bob. One writes a receipt with
# `total`, which alice's lane is changing: two lanes on the same code. The
# other caps a discount, and bob asks for it to go in: he may not
# integrate, so it waits for somebody who may, and ada finds it among
# what needs her.
bob() {
  curl -s -o /dev/null -H "authorization: Bearer $BOB" -H 'content-type: application/json' -H 'x-kito: 1'     -d "{\"method\":\"$1\",\"params\":$2}" "http://$HTTP/-/api/shop" || true
}
bob open_lane '{"agent":"dana","intent":"a receipt that lists every price","scope":["src/receipt.ts","src/shop.ts:total"],"assistant":{"name":"codex-mcp-client","version":"0.171.0","model":"gpt-5-codex"}}'
cat > "$APP/.kito/lanes/4/work/src/receipt.ts" <<'TS'
import { total } from "./shop";

export function receipt(prices: number[]): string {
  return [...prices.map((price) => price.toFixed(2)), `total ${total(prices).toFixed(2)}`].join("\n");
}
TS
bob open_lane '{"agent":"erin","intent":"a discount never takes more than the price","scope":["src/shop.ts:discount"],"assistant":{"name":"zcode"}}'
WORK="$APP/.kito/lanes/5/work"
sed -i.bak 's|return amount - (amount \* percent) / 100;|return Math.max(0, amount - (amount * percent) / 100);|' "$WORK/src/shop.ts" && rm "$WORK/src/shop.ts.bak"
kito --repo "$APP" sync >/dev/null
bob request_integration '{"lane":"lane/5"}'
wait "$SERVING"
