#!/bin/bash
# Seeds a local in-memory server with sample donations and runs one council session.
set -euo pipefail
B=${1:-http://localhost:8787}
d() { curl -s -X POST "$B/api/donations" -H 'content-type: application/json' -H "x-forwarded-for: $1" -d "$2" >/dev/null; }
d 49.36.0.1 '{"amount":250,"name":"Meera","message":"Clean water first, please.","agentId":"hearth","elapsed":5000}'
d 81.2.69.142 '{"amount":120,"name":"Tom","message":"The reefs cannot wait.","agentId":"tide","elapsed":5000}'
d 8.8.8.8 '{"amount":500,"agentId":"verdant","elapsed":5000}'
d 177.0.0.1 '{"amount":80,"name":"Luiza","message":"Protect the Amazon corridors","agentId":"kindred","elapsed":5000}'
d 1.1.1.1 '{"amount":40,"name":"Kai","agentId":"horizon","elapsed":5000}'
C=$(curl -s -i -X POST "$B/api/admin/login" -H 'content-type: application/json' -d '{"key":"local-admin-key"}' | grep -i '^set-cookie' | sed 's/^[Ss]et-[Cc]ookie: //; s/;.*//')
curl -s -X POST "$B/api/admin/council" -H "cookie: $C" | head -c 160; echo
d 103.21.244.1 '{"amount":75,"name":"Arjun","message":"More for early warning systems","agentId":"horizon","elapsed":5000}'
d 2.16.0.1 '{"amount":30,"name":"Lena","agentId":"kindred","elapsed":5000}'
