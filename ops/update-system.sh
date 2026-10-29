#!/bin/bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a
apt-get -o DPkg::Lock::Timeout=120 -o Dpkg::Options::=--force-confold full-upgrade -y
apt-get -o DPkg::Lock::Timeout=120 install --no-install-recommends -y nftables apparmor-utils unattended-upgrades ca-certificates curl logrotate
dpkg --audit
echo SYSTEM_UPDATE_COMPLETE
