#!/bin/bash
set -euo pipefail
test "$(id -un)" = gamebot
grep -Eq '^NoNewPrivs:[[:space:]]+1$' /proc/self/status
grep -Eq '^CapEff:[[:space:]]+0000000000000000$' /proc/self/status
test ! -r /etc/shadow
test ! -r /home/debian/.ssh/authorized_keys
test ! -w /opt/gamebot
test ! -w /etc
test "$(findmnt -n -o VFS-OPTIONS -T /opt/gamebot | cut -d, -f1)" = ro
probe=$(mktemp /var/lib/gamebot/security-check.XXXXXX)
printf 'state write works\n' > "$probe"
rm "$probe"
echo 'PASS: non-root, no privilege escalation, no capabilities, protected files, read-only application, writable state'
curl --silent --show-error --connect-timeout 5 --max-time 15 --output /dev/null https://api.telegram.org/
echo 'PASS: DNS and public Telegram HTTPS reachable'
python3 - <<'PY'
import errno
import socket
for host, port in [('169.254.169.254', 80), ('83.228.205.38', 443), ('127.0.0.1', 1986)]:
    try:
        with socket.create_connection((host, port), timeout=3):
            raise SystemExit(f'FAIL: forbidden destination reachable: {host}:{port}')
    except OSError as exc:
        if exc.errno not in (errno.ECONNREFUSED, errno.EACCES, errno.EPERM):
            raise SystemExit(f'FAIL: destination did not produce an explicit rejection: {host}:{port}: {exc}')
        print(f'PASS: forbidden destination rejected: {host}:{port}')
PY
echo GAMEBOT_SECURITY_CHECK_PASSED
