#!/usr/bin/env bash
# Tests for preflight-credentials (RP-52). Self-contained: stub gh + docker on
# PATH. Covers the session-36 WALL 1 acceptance (nonzero on a token missing
# write:packages), fail-closed cannot-prove paths (API failure, absent
# X-OAuth-Scopes header, missing docker), and the login-is-not-proof property
# (docker login Succeeded + rejected push still fails the probe).
set -uo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$DIR/preflight-credentials"
PASS=0
FAIL=0
ok() { PASS=$((PASS+1)); printf '  ok   %s\n' "$1"; }
nok() { FAIL=$((FAIL+1)); printf '  FAIL %s\n     %s\n' "$1" "$2"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DOCKERLOG="$TMP/docker-calls"
: > "$DOCKERLOG"

# Stub gh: GH_STUB_SCOPES drives the X-OAuth-Scopes header value;
# GH_STUB_NO_HEADER omits the header entirely (fine-grained PAT shape);
# GH_STUB_FAIL forces the API probe failure.
cat > "$TMP/gh" <<STUB
#!/usr/bin/env bash
if [ "\$1 \$2" = "auth token" ]; then
  echo "gho_stub_token"
  exit 0
fi
if [ "\${GH_STUB_FAIL:-0}" = "1" ]; then
  echo "HTTP 401: Bad credentials" >&2
  exit 1
fi
printf 'HTTP/2.0 200 OK\r\n'
printf 'Content-Type: application/json; charset=utf-8\r\n'
if [ "\${GH_STUB_NO_HEADER:-0}" != "1" ]; then
  printf 'X-Oauth-Scopes: %s\r\n' "\${GH_STUB_SCOPES-repo, gist}"
fi
printf '\r\n'
printf '{"login": "stub-user"}\n'
STUB
chmod +x "$TMP/gh"

# Stub docker: records calls; login ALWAYS prints "Login Succeeded" (the
# session-36 false positive); push controlled by DOCKER_STUB_PUSH_FAIL.
cat > "$TMP/docker" <<STUB
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "$DOCKERLOG"
case "\$1" in
  build) echo "sha256:stubdigest" ;;
  login) cat >/dev/null; echo "Login Succeeded" ;;
  push)
    if [ "\${DOCKER_STUB_PUSH_FAIL:-0}" = "1" ]; then
      echo "denied: permission_denied: write_package" >&2
      exit 1
    fi
    echo "preflight: digest: sha256:stubdigest size: 123"
    ;;
  rmi) : ;;
  *) echo "unexpected docker call: \$*" >&2; exit 2 ;;
esac
STUB
chmod +x "$TMP/docker"

run() {
  PATH="$TMP:$PATH" bash "$SCRIPT" "$@" 2>&1
  rc=$?
  printf 'EXIT=%s\n' "$rc"
}

# 1. ACCEPTANCE (session-36 WALL 1 class): token missing write:packages exits
#    nonzero (65) and names the missing scope + the unblock one-liner.
out="$(PATH="$TMP:$PATH" GH_STUB_SCOPES="repo, gist, read:packages" bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=65' \
  && printf '%s' "$out" | grep -q 'MISSING: write:packages' \
  && printf '%s' "$out" | grep -q 'gh auth refresh -h github.com -s write:packages,read:packages'; then
  ok "token missing write:packages exits 65 with the unblock one-liner"
else
  nok "missing write:packages" "$out"
fi

# 2. Both required scopes present: scope check passes, exit 0 (no probe).
out="$(PATH="$TMP:$PATH" GH_STUB_SCOPES="repo, write:packages, read:packages" bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'token scopes OK' \
  && printf '%s' "$out" | grep -q 'preflight-credentials: PASS'; then
  ok "required scopes present exits 0"
else
  nok "scopes present" "$out"
fi

# 3. Absent X-OAuth-Scopes header: cannot prove, exit 70 (fail closed).
out="$(PATH="$TMP:$PATH" GH_STUB_NO_HEADER=1 bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=70' \
  && printf '%s' "$out" | grep -qi 'header ABSENT'; then
  ok "absent scopes header exits 70 (cannot prove, fail closed)"
else
  nok "absent header" "$out"
fi

# 4. Present-but-empty header is a PROVABLE zero-scope token: exit 65, not 70.
out="$(PATH="$TMP:$PATH" GH_STUB_SCOPES="" bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=65'; then
  ok "empty scope list exits 65 (provably missing, not cannot-prove)"
else
  nok "empty scope list" "$out"
fi

# 5. GitHub API probe failure: exit 70 (fail closed).
out="$(PATH="$TMP:$PATH" GH_STUB_FAIL=1 bash "$SCRIPT" 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=70' \
  && printf '%s' "$out" | grep -qi 'cannot prove token scopes'; then
  ok "API probe failure exits 70 (fail closed)"
else
  nok "api failure" "$out"
fi

# 6. LOGIN IS NOT PROOF: login Succeeded + rejected push exits 66.
: > "$DOCKERLOG"
out="$(PATH="$TMP:$PATH" GH_STUB_SCOPES="write:packages, read:packages" DOCKER_STUB_PUSH_FAIL=1 \
  bash "$SCRIPT" --registry-probe 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=66' \
  && printf '%s' "$out" | grep -q 'registry write FAILED' \
  && printf '%s' "$out" | grep -q 'login success does not count' \
  && grep -q '^login ghcr.io' "$DOCKERLOG" \
  && grep -q '^push ghcr.io/cura-care-oriented-stack/preflight-scratch:preflight-' "$DOCKERLOG"; then
  ok "rejected push exits 66 even after Login Succeeded (push is the proof)"
else
  nok "login-not-proof" "$out calls=$(cat "$DOCKERLOG")"
fi

# 7. Probe success: scratch tag pushed to the custom --image-repo, exit 0.
: > "$DOCKERLOG"
out="$(PATH="$TMP:$PATH" GH_STUB_SCOPES="write:packages, read:packages" \
  bash "$SCRIPT" --registry-probe --image-repo ghcr.io/acme/scratch 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=0' \
  && printf '%s' "$out" | grep -q 'registry write OK' \
  && grep -q '^push ghcr.io/acme/scratch:preflight-' "$DOCKERLOG"; then
  ok "registry probe success exits 0 with the scratch tag pushed"
else
  nok "probe success" "$out calls=$(cat "$DOCKERLOG")"
fi

# 8. Probe requested but docker missing: exit 70 (cannot prove, fail closed).
NODOCKER="$TMP/nodocker"
mkdir -p "$NODOCKER"
cp "$TMP/gh" "$NODOCKER/gh"
out="$(PATH="$NODOCKER:/usr/bin:/bin" GH_STUB_SCOPES="write:packages, read:packages" \
  bash "$SCRIPT" --registry-probe 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=70' \
  && printf '%s' "$out" | grep -qi 'docker not found'; then
  ok "registry probe without docker exits 70 (cannot prove)"
else
  nok "docker missing" "$out"
fi

# 9. Custom --scopes is honored (cosign-class lanes can demand their own set).
out="$(PATH="$TMP:$PATH" GH_STUB_SCOPES="repo" bash "$SCRIPT" --scopes repo 2>&1; printf 'EXIT=%s\n' "$?")"
if printf '%s' "$out" | grep -q 'EXIT=0'; then
  ok "--scopes overrides the required set"
else
  nok "custom scopes" "$out"
fi

# 10. Unknown flag exits 2 (usage).
out="$(run --bogus)"
if printf '%s' "$out" | grep -q 'EXIT=2'; then
  ok "unknown flag exits 2"
else
  nok "usage" "$out"
fi

echo ""
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ]
