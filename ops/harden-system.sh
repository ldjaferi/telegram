#!/bin/bash
# Specific to the new, dedicated Debian VPS. Run once, then verify a NEW SSH session.
# Cancel gamebot-hardening-rollback.timer only after successful verification.
set -euo pipefail
test "$(id -u)" = 0
test "$(hostname)" = ov-c992dc
backup=/root/gamebot-hardening-before
test ! -e "$backup"
install -d -m 700 "$backup"
cp -a /etc/nftables.conf "$backup/nftables.conf"
nft list ruleset > "$backup/ruleset.nft"
test ! -e /etc/ssh/sshd_config.d/00-gamebot-hardening.conf
cat > "$backup/rollback.sh" <<'EOF'
#!/bin/bash
set -eu
rm -f /etc/ssh/sshd_config.d/00-gamebot-hardening.conf
/usr/sbin/sshd -t && systemctl reload ssh.service
cp -a /root/gamebot-hardening-before/nftables.conf /etc/nftables.conf
{ echo 'flush ruleset'; cat /root/gamebot-hardening-before/ruleset.nft; } | /usr/sbin/nft -f -
logger -t gamebot-hardening 'SSH/firewall configuration rolled back'
EOF
chmod 700 "$backup/rollback.sh"
systemd-run --unit=gamebot-hardening-rollback --on-active=10m /bin/bash "$backup/rollback.sh"

if ! id gamebot >/dev/null 2>&1; then
    useradd --system --user-group --home-dir /var/lib/gamebot --shell /usr/sbin/nologin gamebot
fi
install -d -m 755 -o root -g root /opt/gamebot
install -d -m 700 -o root -g root /etc/gamebot
install -d -m 750 -o gamebot -g gamebot /var/lib/gamebot

cat > /etc/ssh/sshd_config.d/00-gamebot-hardening.conf <<'EOF'
# Port 1986 is configured separately in 20-telegram-ssh-port.conf.
AddressFamily inet
PermitRootLogin no
AllowUsers debian@31.10.147.51
AuthenticationMethods publickey
PubkeyAuthentication yes
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitEmptyPasswords no
DisableForwarding yes
X11Forwarding no
PermitTunnel no
PermitUserEnvironment no
MaxAuthTries 3
MaxSessions 4
MaxStartups 3:50:10
LoginGraceTime 30
ClientAliveInterval 120
ClientAliveCountMax 2
LogLevel VERBOSE
EOF
chmod 644 /etc/ssh/sshd_config.d/00-gamebot-hardening.conf
/usr/sbin/sshd -t

cat > /etc/nftables.conf <<'EOF'
#!/usr/sbin/nft -f
# Dedicated game VPS. HTTPS will be opened when the actual web application is deployed.
flush ruleset
table inet gamebot_filter {
    chain input {
        type filter hook input priority filter; policy drop;
        iifname "lo" accept
        ct state invalid drop
        ct state established,related accept
        ip saddr 31.10.147.51 tcp dport 1986 ct state new accept
        # Retain DHCP and IPv6 neighbour discovery / path MTU operation.
        udp sport 67 udp dport 68 accept
        ip6 saddr fe80::/10 udp sport 547 udp dport 546 accept
        meta l4proto ipv6-icmp accept
        ip protocol icmp accept
        counter drop
    }
    chain forward {
        type filter hook forward priority filter; policy drop;
    }
    chain gamebot_egress {
        # The bot may resolve names through the system resolver and call public HTTPS APIs.
        ip daddr { 127.0.0.53, 127.0.0.54 } udp dport 53 accept
        ip daddr { 127.0.0.53, 127.0.0.54 } tcp dport 53 accept
        ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12, 192.168.0.0/16, 224.0.0.0/4, 240.0.0.0/4, 83.228.205.38, 91.214.190.222 } counter reject
        ip6 daddr { ::/128, ::1/128, fc00::/7, fe80::/10, ff00::/8, 2001:1600:13:101::c29 } counter reject
        tcp dport 443 accept
        counter reject
    }
    chain output {
        type filter hook output priority filter; policy accept;
        ct state established,related accept
        meta skuid "gamebot" jump gamebot_egress
    }
}
EOF
nft --check -f /etc/nftables.conf
nft -f /etc/nftables.conf
systemctl enable nftables.service
systemctl reload ssh.service

cat > /etc/sysctl.d/60-gamebot-hardening.conf <<'EOF'
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
kernel.yama.ptrace_scope = 1
kernel.unprivileged_bpf_disabled = 2
kernel.perf_event_paranoid = 3
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
fs.protected_fifos = 2
fs.protected_regular = 2
net.ipv4.ip_forward = 0
net.ipv6.conf.all.forwarding = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 2
net.ipv4.conf.default.rp_filter = 2
net.ipv4.tcp_syncookies = 1
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_source_route = -1
net.ipv6.conf.default.accept_source_route = -1
EOF
sysctl -p /etc/sysctl.d/60-gamebot-hardening.conf

install -d -m 755 /etc/systemd/resolved.conf.d /etc/systemd/journald.conf.d /etc/systemd/coredump.conf.d
cat > /etc/systemd/resolved.conf.d/60-gamebot-hardening.conf <<'EOF'
[Resolve]
LLMNR=no
MulticastDNS=no
EOF
cat > /etc/systemd/journald.conf.d/60-gamebot-hardening.conf <<'EOF'
[Journal]
Storage=persistent
SystemMaxUse=128M
SystemKeepFree=1G
RuntimeMaxUse=32M
MaxRetentionSec=30day
Compress=yes
EOF
cat > /etc/systemd/coredump.conf.d/60-gamebot-hardening.conf <<'EOF'
[Coredump]
Storage=none
ProcessSizeMax=0
EOF
cat > /etc/apt/apt.conf.d/52gamebot-unattended-upgrades <<'EOF'
#clear Unattended-Upgrade::Origins-Pattern;
Unattended-Upgrade::Origins-Pattern {
    "origin=Debian,codename=${distro_codename},label=Debian-Security";
    "origin=Debian,codename=${distro_codename}-security,label=Debian-Security";
};
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF
systemctl restart systemd-resolved.service systemd-journald.service
systemctl enable --now apt-daily.timer apt-daily-upgrade.timer apparmor.service

# A direct systemd service, not a container. These restrictions apply once gamebot.service exists.
install -d -m 755 /etc/systemd/system/gamebot.service.d
cat > /etc/systemd/system/gamebot.service.d/hardening.conf <<'EOF'
[Service]
User=gamebot
Group=gamebot
WorkingDirectory=/opt/gamebot
StateDirectory=gamebot
StateDirectoryMode=0750
UMask=0077
NoNewPrivileges=yes
CapabilityBoundingSet=
AmbientCapabilities=
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/var/lib/gamebot
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
RestrictSUIDSGID=yes
RestrictRealtime=yes
RestrictNamespaces=yes
LockPersonality=yes
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
SystemCallArchitectures=native
LimitCORE=0
LimitNOFILE=4096
TasksMax=64
MemoryHigh=512M
MemoryMax=768M
MemorySwapMax=0
CPUQuota=80%
StandardOutput=journal
StandardError=journal
EOF
install -d -m 755 /etc/systemd/system-generators
# Only the explicit TCP SSH service is needed; disable automatic VM/local SSH sockets.
ln -s /dev/null /etc/systemd/system-generators/systemd-ssh-generator
systemctl daemon-reload
echo HARDENING_APPLIED_VERIFY_NEW_SSH_BEFORE_CANCELING_ROLLBACK
