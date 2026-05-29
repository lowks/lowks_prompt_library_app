#!/usr/bin/env bash
# install.sh — Install and configure the Prompt Library App for production.
#
# Supported platforms: Debian/Ubuntu/Raspberry Pi OS
# Requires: Python 3.10+ and pip
#
# Usage:
#   chmod +x install.sh && ./install.sh
#
# Optional environment overrides:
#   APP_DIR        — directory to install into  (default: ~/prompt-library)
#   PORT           — HTTP port                  (default: 5000)
#   AUTH_USERNAME  — basic-auth username        (default: admin)
#   AUTH_PASSWORD  — basic-auth password        (default: admin123456)

set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/prompt-library}"
PORT="${PORT:-5000}"
AUTH_USERNAME="${AUTH_USERNAME:-admin}"
AUTH_PASSWORD="${AUTH_PASSWORD:-admin123456}"
VENV_DIR="$APP_DIR/venv"
SERVICE_NAME="prompt-library"

YELLOW='\033[1;33m'; GREEN='\033[1;32m'; RED='\033[0;31m'; NC='\033[0m'

info()    { echo -e "${GREEN}[INFO]${NC}  $*"; }
warning() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Prerequisites
# ---------------------------------------------------------------------------

check_python() {
    local py
    py=$(command -v python3 2>/dev/null || true)
    if [[ -z "$py" ]]; then
        error "python3 is not installed. Install it with: sudo apt install python3"
    fi
    local ver
    ver=$("$py" -c 'import sys; print(sys.version_info[:2])')
    info "Found $py ($ver)"
}

# ---------------------------------------------------------------------------
# Install
# ---------------------------------------------------------------------------

info "=== Prompt Library App — Installation ==="
info "Install directory : $APP_DIR"
info "Port              : $PORT"
info "Auth username     : $AUTH_USERNAME"

check_python

# Copy application files
info "Copying application files …"
mkdir -p "$APP_DIR"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
rsync -a --exclude='.git' --exclude='venv' --exclude='__pycache__' \
    --exclude='data' --exclude='*.pyc' \
    "$SCRIPT_DIR/" "$APP_DIR/"

# Create virtual environment
info "Creating Python virtual environment …"
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip --quiet
"$VENV_DIR/bin/pip" install -r "$APP_DIR/requirements.txt" --quiet
info "Python dependencies installed."

# Create data directory
mkdir -p "$APP_DIR/data"

# Initialize the database
info "Initialising database …"
DATABASE_PATH="$APP_DIR/data/prompts.db" "$VENV_DIR/bin/python" - <<'PYEOF'
import sys, os
sys.path.insert(0, os.environ.get('APP_DIR', os.path.expanduser('~/prompt-library')))
os.environ['DATABASE_PATH'] = os.path.join(
    os.environ.get('APP_DIR', os.path.expanduser('~/prompt-library')), 'data', 'prompts.db'
)
from db import init_db
init_db()
print("Database initialised.")
PYEOF

# Optionally seed with sample data
if [[ -f "$APP_DIR/prompt.json" ]]; then
    read -rp "Seed the database with sample prompts from prompt.json? [y/N] " seed_answer
    if [[ "${seed_answer,,}" == "y" ]]; then
        APP_DIR="$APP_DIR" DATABASE_PATH="$APP_DIR/data/prompts.db" \
            "$VENV_DIR/bin/python" "$APP_DIR/seed.py" "$APP_DIR/prompt.json" <<< "y"
        info "Database seeded."
    fi
fi

# Write a .env file with runtime settings
ENV_FILE="$APP_DIR/.env"
cat > "$ENV_FILE" <<EOF
PORT=$PORT
AUTH_USERNAME=$AUTH_USERNAME
AUTH_PASSWORD=$AUTH_PASSWORD
DATABASE_PATH=$APP_DIR/data/prompts.db
DEBUG=false
EOF
chmod 600 "$ENV_FILE"
info "Environment file written to $ENV_FILE"

# ---------------------------------------------------------------------------
# Optional systemd service
# ---------------------------------------------------------------------------

if command -v systemctl &>/dev/null; then
    read -rp "Install as a systemd service (requires sudo)? [y/N] " svc_answer
    if [[ "${svc_answer,,}" == "y" ]]; then
        SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
        sudo tee "$SERVICE_FILE" > /dev/null <<EOF
[Unit]
Description=Prompt Library App
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=$VENV_DIR/bin/python $APP_DIR/app.py
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
        sudo systemctl daemon-reload
        sudo systemctl enable "$SERVICE_NAME"
        sudo systemctl restart "$SERVICE_NAME"
        info "systemd service '$SERVICE_NAME' installed and started."
        info "Manage it with: sudo systemctl {start|stop|status|restart} $SERVICE_NAME"
    fi
else
    warning "systemd not found — skipping service installation."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------

info ""
info "=== Installation complete ==="
info ""
info "To start the app manually:"
info "  cd $APP_DIR"
info "  source .env && $VENV_DIR/bin/python app.py"
info ""
info "Then open http://localhost:$PORT in your browser."
info "Login with username: $AUTH_USERNAME  and password: $AUTH_PASSWORD"
info ""
