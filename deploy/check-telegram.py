#!/usr/bin/env python3
"""Read-only Telegram setup verification. Never prints credentials or request URLs."""
import json
import sys
import urllib.request
from pathlib import Path

try:
    token = Path('/etc/gamebot/bot-token').read_text().strip()
    if not token:
        raise RuntimeError('missing credential')
    def call(method):
        request = urllib.request.Request(
            'https://api.telegram.org/bot' + token + '/' + method,
            data=b'{}', headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.load(response)
        if not data.get('ok'):
            raise RuntimeError('Telegram rejected request')
        return data['result']
    me = call('getMe')
    menu = call('getChatMenuButton')
    commands = call('getMyCommands')
    webhook = call('getWebhookInfo')
    print(json.dumps({
        'username': me['username'],
        'has_main_web_app': me.get('has_main_web_app', False),
        'menu_type': menu.get('type'),
        'menu_url': menu.get('web_app', {}).get('url'),
        'commands': [item['command'] for item in commands],
        'webhook_configured': bool(webhook.get('url')),
        'pending_updates': webhook.get('pending_update_count', 0)
    }))
except Exception:
    print('Telegram verification failed; credential and request URL suppressed.', file=sys.stderr)
    sys.exit(1)
