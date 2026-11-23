#!/usr/bin/env bash
# A repository to look at the web client with: a lane that went in, a
# note, and two open lanes, one of them commented and asked to change.
# It needs Kito built next to this repository (`../kito`, or KITO_BIN),
# and `scripts/build.sh` run here.
#
#   scripts/demo.sh [--port N]      # serves until stopped
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${KITO_BIN:-$HERE/../kito/target/release}"
export PATH="$BIN:$PATH"
export KITO_NO_CLAUDE=1 KITO_AUTHOR="${KITO_AUTHOR:-ada}"
DEMO="${KITO_WEB_DEMO:-${TMPDIR:-/tmp}/kito-web-demo}"
# Plugins are installed for a person: for the demo, in a place of its own.
export KITO_CONFIG_DIR="$DEMO/config"
APP="$DEMO/shop"

kito --repo "$APP" daemon stop >/dev/null 2>&1 || true
rm -rf "$DEMO"
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
cat > src/cart.ts <<'TS'
import { total } from "./shop";

export function checkout(prices: number[]): string {
  return `to pay: ${total(prices)}`;
}
TS
printf '# Shop\n\nPrices and what is taken off them.\n' > README.md
kito init >/dev/null
printf '.kito/\n' > .gitignore
kito checkpoint -m "first version" >/dev/null

# Something already went in through a lane, and a note was left on the code.
kito lane open carol --intent "say what the shop takes off" --scope README.md >/dev/null
printf '# Shop\n\nPrices, and the discounts taken off them.\n' > "$APP/.kito/lanes/1/work/README.md"
# Each change says why (Kito 0.42 holds a lane that does not; an older Kito has no `explain`).
kito explain README.md --lane 1 -m "Readers took what is taken off for taxes: it says discounts." >/dev/null 2>&1 || true
kito integrate 1 >/dev/null
kito lane close 1 >/dev/null
kito note src/shop.ts:total "Called by the nightly billing job, outside this repository: do not rename." >/dev/null

# Alice's agent puts the prices in cents, and renames a function on the way.
kito lane open alice --intent "prices in cents" --scope ./ --assistant claude-code --model claude-opus-5 >/dev/null
WORK="$APP/.kito/lanes/2/work"
sed -i.bak 's/sum += price;/sum += Math.floor(price * 100);/' "$WORK/src/shop.ts" && rm "$WORK/src/shop.ts.bak"
kito rename src/shop.ts:discount rebate --lane 2 >/dev/null
printf '\nPrices are kept in cents.\n' >> "$WORK/README.md"
kito lane comment 2 "Half a cent is lost: round, do not floor." --on src/shop.ts:4 >/dev/null
kito lane comment 2 "Say in the README why cents." >/dev/null
kito lane request-changes 2 "See the comment on line 4." >/dev/null

# Bob's agent writes a receipt, and has asked to be integrated.
kito lane open bob --intent "a receipt that lists every price" --scope src/cart.ts --assistant codex --model gpt-5-codex >/dev/null
WORK2="$APP/.kito/lanes/3/work"
cat >> "$WORK2/src/cart.ts" <<'TS'

export function receipt(prices: number[]): string {
  return prices.map((price) => `- ${price}`).join("\n");
}
TS

# Meanwhile the same line went in another way: alice's lane will not
# compose with it, and has a conflict to decide when it asks to go in.
kito lane open dana --intent "prices rounded to whole units" --scope src/shop.ts:total >/dev/null
WORK4="$APP/.kito/lanes/4/work"
sed -i.bak 's/sum += price;/sum += Math.round(price);/' "$WORK4/src/shop.ts" && rm "$WORK4/src/shop.ts.bak"
kito explain src/shop.ts:total --lane 4 -m "Rounded per price, not on the sum: the till rounds each line, and the two must agree." >/dev/null 2>&1 || true
kito integrate 4 >/dev/null
kito lane close 4 >/dev/null

kito plugin add --path "$HERE/plugin" >/dev/null
kito plugin enable web >/dev/null
exec kito web "$@"
