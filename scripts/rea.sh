#!/usr/bin/env bash
set -euo pipefail

# Prefer an explicitly selected installation; otherwise use the installed Nix bundle.
rea_toolchain="${XDG_DATA_HOME:-$HOME/.local/share}/quicktone-rea-toolchain"
export GHIDRA_INSTALL_DIR="${GHIDRA_INSTALL_DIR:-$rea_toolchain/lib/ghidra}"
export JAVA_HOME="${JAVA_HOME:-$rea_toolchain/lib/openjdk}"
export PATH="$JAVA_HOME/bin:$rea_toolchain/bin:$PATH"
# The 190 MB QuickTone image exceeds REA's default cold-start analysis deadline.
export REA_GHIDRA_STARTUP_TIMEOUT_MS="${REA_GHIDRA_STARTUP_TIMEOUT_MS:-1200000}"
export GHIDRA_HEADLESS_MAXMEM="${GHIDRA_HEADLESS_MAXMEM:-4G}"

if [[ ! -x "$GHIDRA_INSTALL_DIR/support/analyzeHeadless" || ! -x "$JAVA_HOME/bin/javac" ]]; then
  echo 'Ghidra/JDK missing. See docs/ReverseEngineering.md or run inside nix-shell.' >&2
  exit 1
fi

exec npx -y rea-agents@6.7.0 "$@"
