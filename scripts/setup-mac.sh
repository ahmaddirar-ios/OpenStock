#!/usr/bin/env bash
#
# Bootstrap a fresh Mac for Rovex development.
#
# Run it from the repository root, after cloning:
#
#   git clone https://github.com/ahmaddirar-ios/OpenStock.git
#   cd OpenStock
#   bash scripts/setup-mac.sh
#
# It is idempotent: every step checks first and skips what is already there. It installs
# Homebrew, Node 22, MongoDB, the Vercel CLI and a Playwright Chromium, then `npm ci`.
# It never touches .env — secrets are copied by hand, on purpose.

set -euo pipefail

say() { printf '\n\033[1m==> %s\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "This script is for macOS. On Linux, install node 22, mongodb and npm ci by hand." >&2
    exit 1
fi

ARCH="$(uname -m)"
if [[ "$ARCH" == "arm64" ]]; then
    BREW_PREFIX="/opt/homebrew"
else
    BREW_PREFIX="/usr/local"
fi
say "macOS on $ARCH (Homebrew prefix $BREW_PREFIX)"

# --- 1. Command line tools ---------------------------------------------------
if ! xcode-select -p >/dev/null 2>&1; then
    say "Installing Xcode command line tools (a dialog will open; re-run this script when it finishes)"
    xcode-select --install || true
    exit 0
fi

# --- 2. Homebrew -------------------------------------------------------------
if ! have brew; then
    say "Installing Homebrew"
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    eval "$("$BREW_PREFIX/bin/brew" shellenv)"
else
    say "Homebrew already installed"
fi

# --- 3. Node 22 --------------------------------------------------------------
# The Docker image runs Node 22 LTS, so development matches production.
export NVM_DIR="$HOME/.nvm"
if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    say "Installing nvm"
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
fi
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh"
if ! nvm ls 22 >/dev/null 2>&1; then
    say "Installing Node 22"
    nvm install 22
fi
nvm use 22 >/dev/null
nvm alias default 22 >/dev/null
say "Node $(node -v), npm $(npm -v)"

# --- 4. MongoDB --------------------------------------------------------------
if ! have mongod; then
    say "Installing MongoDB Community"
    brew tap mongodb/brew
    brew install mongodb-community
else
    say "MongoDB already installed ($(mongod --version | head -1))"
fi
if ! brew services list | grep -q '^mongodb-community.*started'; then
    say "Starting MongoDB as a background service"
    brew services start mongodb-community
fi

# --- 5. Vercel CLI -----------------------------------------------------------
if ! have vercel; then
    say "Installing the Vercel CLI"
    npm install -g vercel
fi

# --- 6. Project dependencies -------------------------------------------------
if [[ ! -f package.json ]]; then
    echo "Run this from the repository root (package.json not found)." >&2
    exit 1
fi
say "Installing project dependencies (npm ci)"
npm ci

# --- 7. A browser for the end-to-end sweep -----------------------------------
# playwright-core ships no browser; the sweep finds one under ~/Library/Caches/ms-playwright.
if [[ ! -d "$HOME/Library/Caches/ms-playwright" ]] || ! ls "$HOME/Library/Caches/ms-playwright" | grep -q '^chromium'; then
    say "Downloading a Chromium for the e2e sweep"
    npx --yes playwright install chromium
else
    say "Playwright Chromium already present"
fi

# --- 8. What is still manual -------------------------------------------------
say "Done. Two things are left, both deliberate:"
cat <<'EOF'

  1. Copy .env from the old machine (AirDrop is fine). It is gitignored and holds the
     secrets. For development it should say:
         MONGODB_URI=mongodb://127.0.0.1:27017/openstock
         BETTER_AUTH_URL=http://localhost:3000
     Check it with:  node scripts/check-env.mjs

  2. Bring the local database across (it is small):
         # on the old machine
         mongodump --uri="mongodb://127.0.0.1:27017/openstock" --out=./rovex-dump
         # on this one
         mongorestore --uri="mongodb://127.0.0.1:27017" ./rovex-dump

  Then:  npm run dev        (http://localhost:3000)
         npm test           (unit tests)
         npm run build      (production build)

  Hosting the public site from this Mac is a separate job: see docs/SELF-HOSTING.md.
EOF
