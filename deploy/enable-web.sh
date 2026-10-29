#!/bin/bash
set -euo pipefail
test "$(id -u)" = 0
python3 - <<'PY'
from pathlib import Path
from datetime import datetime
import subprocess
import shutil
p = Path('/etc/nftables.conf')
old = p.read_text()
rule = '        tcp dport { 80, 443 } ct state new accept # Snake Club web\n'
if '# Snake Club web' not in old:
    marker = '        ct state established,related accept\n'
    if 'table inet gamebot_filter' not in old or marker not in old:
        raise SystemExit('Unexpected firewall layout; inspect manually.')
    new = old.replace(marker, marker + rule, 1)
    staged = Path('/etc/nftables.snake-staged.conf')
    staged.write_text(new)
    subprocess.run(['nft', '--check', '-f', str(staged)], check=True)
    shutil.copy2(p, '/root/nftables-before-snake-' + datetime.now().strftime('%Y%m%d-%H%M%S') + '.conf')
    staged.replace(p)
    subprocess.run(['nft', '-f', str(p)], check=True)
print('Web ports enabled; existing SSH and egress rules preserved.')
PY
