#!/usr/bin/env bash
# SocialFlow AI — Faz 1 uçtan uca kabul senaryosu (§99)
#
# Çalıştırma:  bash scripts/e2e-phase1.sh            (dev sunucu 3000'de olmalı)
#              BASE=http://localhost:3000 bash scripts/e2e-phase1.sh
#
# Kapsam: kayıt → marka ("Demo Beauty") → product.jpg yükleme → tek ana metin
#         (%20 / 20 Eylül 2026) → 5 hedef (IG Feed, IG Story, FB Post, LI Post, X Post)
#         → "Platformlara Uyarla" → bilgi korunumu, medya varyantları, ön kontrol,
#         → LinkedIn'de bağımsız düzenleme, Taslaklar'da görünürlük, yayın 501.
set -e

BASE=${BASE:-http://localhost:3000}
API="$BASE/api/v1"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
JAR=$(mktemp /tmp/sf-e2e-jar.XXXXXX)
EMAIL="e2e-$(date +%s)@ornek.test"
FAIL=0

cd "$APP_DIR"

step() { printf '\n=== %s ===\n' "$1"; }
check() { # check <etiket> <python-ifadesi-ile-dogru>  -> "true" ise geçer
  if [ "$2" = "True" ]; then echo "  ✓ $1"; else echo "  ✗ $1"; FAIL=1; fi
}

step "1) KAYIT (yeni çalışma alanı)"
REG=$(curl -s -c "$JAR" -X POST "$API/auth/register" -H 'content-type: application/json' \
  -d "{\"name\":\"E2E Kullanıcı\",\"email\":\"$EMAIL\",\"password\":\"Sosyal2026!\",\"workspaceName\":\"Demo Güzellik Ajansı\"}")
WS=$(echo "$REG" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['workspace']['slug'] if d.get('ok') else '')")
echo "  workspace=$WS email=$EMAIL"
check "kayıt başarılı" "$(echo "$REG" | python3 -c "import json,sys; print(json.load(sys.stdin).get('ok'))")"

CSRF=$(grep sf_csrf "$JAR" | awk '{print $7}')
echo "  csrf=${CSRF:0:8}…"

step "2) MARKA"
BRAND=$(curl -s -b "$JAR" -X POST "$API/brands" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"name":"Demo Beauty","primaryColor":"#db2777","description":"Cilt bakım ürünleri","targetAudience":"18-34 yaş","defaultCta":"Koleksiyonu inceleyin."}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['id'] if d.get('ok') else json.dumps(d))")
echo "  brand=$BRAND"

step "3) MEDYA YÜKLEME (product.jpg)"
MEDIA=$(curl -s -b "$JAR" -X POST "$API/media/upload" -H "x-csrf-token: $CSRF" \
  -F "file=@public/demo/demo-1-square.jpg;type=image/jpeg" -F "brandId=$BRAND" -F "tags=urun,product" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['asset']['id'] if d.get('ok') else json.dumps(d))")
echo "  media=$MEDIA"

step "4) ANA İÇERİK (tek master metin → 5 hedef)"
MASTER='Demo Beauty yeni sezon bakım setinde 20 Eylül 2026 tarihine kadar %20 indirim! Cilt bakım rutinine nemlendirici, serum ve temizleme jeli dahil. Ürünlerimiz dermatolojik olarak test edilmiştir.'
CONTENT=$(curl -s -b "$JAR" -X POST "$API/contents" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "$(python3 -c "
import json,sys
print(json.dumps({'brandId': sys.argv[1], 'title': 'Demo Beauty — Sonbahar Bakım Seti', 'masterCaption': sys.argv[2],
 'mediaIds': [sys.argv[3]],
 'selections': [{'platform':'INSTAGRAM','contentType':'FEED'},{'platform':'INSTAGRAM','contentType':'STORY'},
                {'platform':'FACEBOOK','contentType':'FEED'},{'platform':'LINKEDIN','contentType':'POST'},
                {'platform':'X','contentType':'POST'}]}, ensure_ascii=False))
" "$BRAND" "$MASTER" "$MEDIA")" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['id'] if d.get('ok') else json.dumps(d))")
echo "  content=$CONTENT"

step "5) PLATFORMLARA UYARLA"
curl -s -b "$JAR" -X POST "$API/contents/$CONTENT/adapt" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"preserveManual":true}' > /tmp/sf-e2e-adapt.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/sf-e2e-adapt.json'))
assert d.get('ok'), json.dumps(d, ensure_ascii=False)
r = d['data']
print('  aiProvider=', r.get('aiProvider'), 'aiNotice=', r.get('aiNotice'))
rows = {}
for x in r['results']:
    rows[(x['platform'], x['contentType'])] = x
    facts = all(f in x['caption'] for f in ['%20', '20 Eylül 2026'])
    print(f"  {x['platform']}/{x['contentType']}: {x['charactersUsed']}/{x['limit']} engine={x['engine']} bilgiKorundu={facts} truncated={x['truncated']}")
    assert facts, 'BİLGİ KAYBI: ' + x['platform']
    assert not x['truncated'], 'KESİLMİŞ METİN: ' + x['platform']
assert len(rows) == 5, rows.keys()
assert rows[('INSTAGRAM','STORY')]['charactersUsed'] < rows[('INSTAGRAM','FEED')]['charactersUsed']
assert rows[('X','POST')]['charactersUsed'] <= 280
print('  ✓ 5 hedefte bilgi korundu, hiçbiri kesilmedi, IG Story < IG Feed, X ≤ 280')
PY
head -c 400 /dev/null

step "6) MEDYA VARYANTLARI (orijinal değişmez)"
curl -s -b "$JAR" "$API/media/$MEDIA" -H "x-csrf-token: $CSRF" > /tmp/sf-e2e-media.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/sf-e2e-media.json'))
a = d['data']['asset'] if 'asset' in d.get('data', {}) else d['data']
variants = a.get('variants', [])
print(f"  varyant={len(variants)} orijinal={a['storageKey']}")
for v in variants:
    assert v.get('storageKey') != a['storageKey'], 'VARYANT ORİJİNALİN ÜZERİNE YAZILMIŞ'
    assert not v.get('method') == 'AI_SMART_CROP', 'yanlış etiketleme'
print('  ✓ varyantlar orijinali referans alıyor, üzerine yazmıyor')
PY

step "7) ÖN KONTROL (Faz 1)"
curl -s -b "$JAR" "$API/contents/$CONTENT/validate" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print('  ', d['headline'], '| blocking=', d['blocking'], '| hazır=', d['readyCount'], '/', d['totalCount'], '| faz1=', d['phase1Mode'])
assert d['readyCount'] == d['totalCount'] == 5, d
assert d['blocking'] is False, d
"

step "8) BAĞIMSIZ DÜZENLEME (LinkedIn) + diğerlerinin korunumu"
LI_ID=$(python3 -c "
import json; d=json.load(open('/tmp/sf-e2e-adapt.json'))['data']
print([x['platformContentId'] for x in d['results'] if x['platform']=='LINKEDIN'][0])")
BEFORE=$(curl -s -b "$JAR" "$API/contents/$CONTENT" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys; pcs=json.load(sys.stdin)['data']['platformContents']
print(json.dumps({p['platform']: p['caption'] for p in pcs}, ensure_ascii=False))")
curl -s -b "$JAR" -X PATCH "$API/contents/$CONTENT/platform-content/$LI_ID" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"caption":"Demo Beauty sonbahar bakım seti: 20 Eylül 2026 tarihine kadar %20 avantaj. Profesyoneller için hazırlanan rutin, dermatolojik testlerden geçti."}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('   düzenleme ok=', d.get('ok'), d.get('error'))"
AFTER=$(curl -s -b "$JAR" "$API/contents/$CONTENT" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys; pcs=json.load(sys.stdin)['data']['platformContents']
print(json.dumps({p['platform']: p['caption'] for p in pcs}, ensure_ascii=False))")
python3 - "$BEFORE" "$AFTER" <<'PY'
import json, sys
before, after = json.loads(sys.argv[1]), json.loads(sys.argv[2])
assert before['LINKEDIN'] != after['LINKEDIN'], 'LinkedIn düzenlemesi kaydedilmedi'
changed = [k for k in before if before[k] != after[k]]
assert changed == ['LINKEDIN'], f'bağımsızlık ihlali: {changed}'
assert '%20' in after['LINKEDIN'] and '20 Eylül 2026' in after['LINKEDIN']
print('  ✓ yalnızca LinkedIn değişti, diğer 4 hedef korundu')
PY

step "9) TASLAKLAR"
curl -s -b "$JAR" "$API/contents?status=DRAFT,READY&limit=5" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
items=json.load(sys.stdin)['data']['items']
print('  taslak sayısı=', len(items), '| ilk=', items[0]['title'] if items else '-')
assert items and items[0]['id'] == '$CONTENT'
"
curl -s -b "$JAR" "$API/contents/$CONTENT" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print('  durum=', d['content']['status'], '| hedef=', len(d['platformContents']), '| sürüm=', len(d['versions']))
assert d['content']['status'] == 'DRAFT'
assert len(d['platformContents']) == 5
"

step "10) YAYINLAMA KAPALI MI? (Faz 2)"
curl -s -b "$JAR" -X POST "$API/contents/$CONTENT/publish" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d '{}' | python3 -c "
import json,sys
e=json.load(sys.stdin).get('error',{})
print('  ', e.get('code'), '|', e.get('message'))
assert e.get('code') == 'MODULE_NOT_ENABLED', e
"

step "11) KAPATILMIŞ MODÜL UÇ NOKTALARI"
curl -s -b "$JAR" "$API/bootstrap" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
m=json.load(sys.stdin)['data'].get('modules', {})
off=[k for k,v in m.items() if not v.get('enabled')]
print('  modüller:', ', '.join(f\"{k}={'açık' if v['enabled'] else 'kapalı'}\" for k,v in sorted(m.items())))
print('  kapatılmış modül sayısı=', len(off))
assert m.get('notifications',{}).get('enabled') is False, m.get('notifications')
"
for ep in "ai/generate:aiAssistant" "notifications:notifications"; do
  path=${ep%%:*}
  body='{}'
  [ "$path" = "notifications" ] && body=''
  code=$(curl -s -o /tmp/sf-e2e-gate.json -w '%{http_code}' -b "$JAR" -X POST "$API/$path" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d "$body")
  echo "  POST $path -> $code $(python3 -c "import json;print(json.load(open('/tmp/sf-e2e-gate.json')).get('error',{}).get('code',''))" 2>/dev/null || true)"
done

rm -f "$JAR"
printf '\n'
if [ "$FAIL" = "0" ]; then echo "SONUÇ: Faz 1 kabul senaryosu BAŞARILI ✓"; else echo "SONUÇ: BAŞARISIZ ✗"; fi
exit "$FAIL"
