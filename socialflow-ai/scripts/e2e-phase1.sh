#!/usr/bin/env bash
# SocialFlow AI — Faz 1 uçtan uca kabul senaryosu (§99)
#
# Çalıştırma:  bash scripts/e2e-phase1.sh            (dev sunucu 3000'de olmalı)
#              BASE=http://localhost:3000 bash scripts/e2e-phase1.sh
#
# Kapsam (Faz 2): kayıt → marka ("Demo Beauty") → product.jpg yükleme → tek ana
#         metin (%20 / 20 Eylül 2026) → 5 hedef (IG Feed, IG Story, FB Post, LI
#         Post, X Post) → "Platformlara Uyarla" → bilgi korunumu → medya varyantı
#         → demo hesap bağlama → ön kontrol 5/5 → LinkedIn'de bağımsız düzenleme
#         → Taslaklar → GERÇEK YAYIN (demo sağlayıcı; 5/5 PUBLISHED) → kapılar.
set -e

BASE=${BASE:-http://localhost:3000}
API="$BASE/api/v1"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
JAR=$(mktemp /tmp/sf-e2e-jar.XXXXXX)
ADAPT=/tmp/sf-e2e-adapt.json
MEDIA_JSON=/tmp/sf-e2e-media.json
VARIANT_JSON=/tmp/sf-e2e-variant.json
GATE_JSON=/tmp/sf-e2e-gate.json
EMAIL="e2e-$(date +%s)@ornek.test"
FAIL=0

cd "$APP_DIR"

step() { printf '\n=== %s ===\n' "$1"; }
check() { if [ "$2" = "True" ]; then echo "  ✓ $1"; else echo "  ✗ $1"; FAIL=1; fi; }

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
CONTENT=$(curl -s -b "$JAR" -X POST "$API/contents" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "$(python3 -c "
import json,sys
print(json.dumps({'brandId': sys.argv[1], 'title': 'Demo Beauty — Sonbahar Bakım Seti',
 'masterCaption': 'Demo Beauty yeni sezon bakım setinde 20 Eylül 2026 tarihine kadar %20 indirim! Cilt bakım rutinine nemlendirici, serum ve temizleme jeli dahil. Ürünlerimiz dermatolojik olarak test edilmiştir.',
 'mediaIds': [sys.argv[2]],
 'selections': [{'platform':'INSTAGRAM','contentType':'FEED'},{'platform':'INSTAGRAM','contentType':'STORY'},
                {'platform':'FACEBOOK','contentType':'FEED'},{'platform':'LINKEDIN','contentType':'POST'},
                {'platform':'X','contentType':'POST'}]}, ensure_ascii=False))
" "$BRAND" "$MEDIA")" \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['data']['id'] if d.get('ok') else json.dumps(d))")
echo "  content=$CONTENT"

step "5) PLATFORMLARA UYARLA"
curl -s -b "$JAR" -X POST "$API/contents/$CONTENT/adapt" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"preserveManual":true}' > "$ADAPT"
python3 - "$ADAPT" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
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
assert len({x['caption'] for x in r['results']}) == 5, 'metinler platforma göre farklılaşmalı'
print('  ✓ 5 hedefte bilgi korundu, hiçbiri kesilmedi, metinler farklılaştı, X ≤ 280')
PY

step "6) MEDYA VARYANTI (orijinal değişmez)"
# Tarayıcı canvas'ı hedef oranı üretir; burada aynı API akışı doğrulanır:
#   POST /media/upload {mode:variant} → MediaVariant + PlatformContent.renderedKey
STORY_PC=$(python3 -c "
import json; d=json.load(open('$ADAPT'))['data']
print([x['platformContentId'] for x in d['results'] if x['contentType']=='STORY'][0])")
cp public/demo/demo-1-square.jpg /tmp/sf-e2e-story.jpg
curl -s -b "$JAR" -X POST "$API/media/upload" -H "x-csrf-token: $CSRF" \
  -F "mode=variant" -F "parentMediaId=$MEDIA" -F "platform=INSTAGRAM" -F "contentType=STORY" \
  -F "ratio=9:16" -F "width=1080" -F "height=1920" -F "cropMode=SMART" \
  -F "method=USER_FOCAL_POINT" -F 'focalPoint={"x":0.5,"y":0.4}' \
  -F "blob=@/tmp/sf-e2e-story.jpg;type=image/jpeg" > "$VARIANT_JSON"
KEY=$(python3 -c "import json;d=json.load(open('$VARIANT_JSON'));assert d.get('ok'),d;print(d['data']['storageKey'])")
URL=$(python3 -c "import json;print(json.load(open('$VARIANT_JSON'))['data'].get('publicUrl') or '')")
curl -s -b "$JAR" -X PATCH "$API/contents/$CONTENT/platform-content/$STORY_PC" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "{\"aspectRatio\":\"9:16\",\"renderedKey\":\"$KEY\",\"renderedUrl\":\"$URL\",\"targetWidth\":1080,\"targetHeight\":1920}" > /dev/null

curl -s -b "$JAR" "$API/media/$MEDIA" -H "x-csrf-token: $CSRF" > "$MEDIA_JSON"
python3 - "$MEDIA_JSON" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))['data']
variants = d.get('variants', [])
print(f"  varyant={len(variants)} orijinal={d['storageKey']} hash={d['contentHash'][:12]}")
assert variants, 'varyant kaydı oluşmalı'
for v in variants:
    assert v.get('storageKey') != d['storageKey'], 'VARYANT ORİJİNALİN ÜZERİNE YAZILMIŞ'
    assert v.get('processingMethod') != 'AI_SMART_CROP', 'yanlış etiketleme (AI denmemeli)'
    assert v.get('aspectRatio') == '9:16' and v.get('processingStatus') == 'READY'
print('  ✓ varyant orijinali referans alıyor, orijinal dosya değişmedi')
PY

step "6b) SOSYAL HESAP BAĞLAMA (demo) + hedeflere atama"
for PAIR in "INSTAGRAM demo.beauty" "FACEBOOK Demo Beauty" "LINKEDIN demo-beauty" "X demobeauty"; do
  PLAT=${PAIR%% *}
  HANDLE=${PAIR#* }
  curl -s -b "$JAR" -X POST "$API/accounts" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
    -d "{\"platform\":\"$PLAT\",\"handle\":\"$HANDLE\",\"demoAccount\":true}" | python3 -c "
import json,sys
r=json.load(sys.stdin)
assert r.get('ok'), r
d=r['data']
assert d['demoAccount'] is True and d['connectionStatus']=='ACTIVE', d
print('  ✓', '$PLAT', '@'+d['handle'], '(demo, ACTIVE)')
"
done
# Hesapları içerik hedeflerine ata (INSTAGRAM hesabı FEED+STORY'yi karşılar).
curl -s -b "$JAR" "$API/accounts" -H "x-csrf-token: $CSRF" > /tmp/sf-e2e-accounts.json
E2E_JAR="$JAR" E2E_CSRF="$CSRF" E2E_API="$API" E2E_CONTENT="$CONTENT" E2E_ACCOUNTS="$(cat /tmp/sf-e2e-accounts.json)" \
  python3 - "$ADAPT" <<'PY'
import json, subprocess, sys, os
d = json.load(open(sys.argv[1]))['data']
jar, csrf, base = os.environ['E2E_JAR'], os.environ['E2E_CSRF'], os.environ['E2E_API']
accs = json.loads(os.environ['E2E_ACCOUNTS'])['data']['items']
by_plat = {a['platform']: a['id'] for a in accs}
targets = [(r['platformContentId'], r['platform']) for r in d['results']]
for pc_id, plat in targets:
    acc = by_plat.get(plat)
    assert acc, plat + ' hesabi yok'
    r = subprocess.run(['curl', '-s', '-b', jar, '-X', 'PATCH',
        f'{base}/contents/{os.environ["E2E_CONTENT"]}',
        '-H', 'content-type: application/json', '-H', f'x-csrf-token: {csrf}',
        '-d', json.dumps({'accountAssignments': [{'platformContentId': pc_id, 'accountId': acc}]})],
        capture_output=True, text=True)
    out = json.loads(r.stdout)
    assert out.get('ok'), (plat, out)
print('  ✓ 5 hedefe hesap atandı')
PY

step "7) ÖN KONTROL (hesaplar bağlandı)"
curl -s -b "$JAR" "$API/contents/$CONTENT/validate" -H "x-csrf-token: $CSRF" > /tmp/sf-e2e-validate.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/sf-e2e-validate.json'))['data']
print('  ', d['headline'], '| blocking=', d['blocking'], '| hazır=', d['readyCount'], '/', d['totalCount'], '| faz1=', d['phase1Mode'])
assert d['readyCount'] == d['totalCount'] == 5, d
assert d['blocking'] is False, d
story = [t for t in d['targets'] if t['contentType'] == 'STORY'][0]
codes = {c['code']: c['level'] for c in story['checks']}
assert codes.get('VARIANT_OK') == 'OK', codes
assert 'VARIANT_MISSING' not in codes, codes
print('  ✓ STORY hedefi: varyant üretildi (VARIANT_OK); hesap ataması ile hesap bilgisi (INFO)')
PY

step "8) BAĞIMSIZ DÜZENLEME (LinkedIn) + diğerlerinin korunumu"
LI_PC=$(python3 -c "
import json; d=json.load(open('$ADAPT'))['data']
print([x['platformContentId'] for x in d['results'] if x['platform']=='LINKEDIN'][0])")
summary() {
  curl -s -b "$JAR" "$API/contents/$CONTENT" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
pcs=json.load(sys.stdin)['data']['platformContents']
print(json.dumps({p['key']: p['caption'] for p in pcs}, ensure_ascii=False))"
}
BEFORE=$(summary)
curl -s -b "$JAR" -X PATCH "$API/contents/$CONTENT/platform-content/$LI_PC" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d '{"caption":"Demo Beauty sonbahar bakım seti: 20 Eylül 2026 tarihine kadar %20 avantaj. Profesyoneller için hazırlanan rutin, dermatolojik testlerden geçti."}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('   düzenleme ok=', d.get('ok'), d.get('error'))"
AFTER=$(summary)
python3 - "$BEFORE" "$AFTER" <<'PY'
import json, sys
before, after = json.loads(sys.argv[1]), json.loads(sys.argv[2])
li = [k for k in after if k.startswith('LINKEDIN')][0]
assert before[li] != after[li], 'LinkedIn düzenlemesi kaydedilmedi'
changed = [k for k in before if before[k] != after[k]]
assert changed == [li], f'bağımsızlık ihlali: {changed}'
assert '%20' in after[li] and '20 Eylül 2026' in after[li], 'elle düzenlemede bilgi korunmalı'
print('  ✓ yalnızca LinkedIn değişti, diğer 4 hedef korundu')
PY

step "9) SINIR AŞIMI ENGELLENİR (metin kesilmez, 422)"
# Sınırı aşan hedef: X POST (280 karakter). LinkedIn'in sınırı 3000'dir.
X_PC=$(python3 -c "
import json; d=json.load(open('$ADAPT'))['data']
print([x['platformContentId'] for x in d['results'] if x['platform']=='X'][0])")
OVER=$(python3 -c "print('x' * 400)")
CODE=$(curl -s -o /tmp/sf-e2e-over.json -w '%{http_code}' -b "$JAR" -X PATCH "$API/contents/$CONTENT/platform-content/$X_PC" \
  -H 'content-type: application/json' -H "x-csrf-token: $CSRF" \
  -d "$(python3 -c "import json,sys; print(json.dumps({'caption': sys.argv[1]}))" "$OVER")")
python3 - "$CODE" <<'PY'
import json, sys
d = json.load(open('/tmp/sf-e2e-over.json'))
err = d.get('error', {})
print('  ', sys.argv[1], err.get('code'), '|', err.get('message'))
assert sys.argv[1] == '422', sys.argv[1]
assert err.get('code') == 'PLATFORM_RULE_VIOLATION', err
PY
curl -s -b "$JAR" "$API/contents/$CONTENT" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
x=[p for p in json.load(sys.stdin)['data']['platformContents'] if p['key'].startswith('X:')][0]
assert len(x['caption']) < 400, 'sınır aşan metin kaydedilmemeli'
assert x['charUsed'] == len(x['caption'])
print('  ✓ reddedilen metin kaydedilmedi, sınır aşımı 422 ile bildirildi')
"

step "10) TASLAKLAR"
curl -s -b "$JAR" "$API/contents?status=DRAFT,READY&limit=5" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
items=json.load(sys.stdin)['data']['items']
print('  taslak sayısı=', len(items), '| ilk=', items[0]['title'] if items else '-')
assert items and items[0]['id'] == '$CONTENT'
"
curl -s -b "$JAR" "$API/contents/$CONTENT" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print('  durum=', d['status'], '| hedef=', len(d['platformContents']), '| sürüm=', len(d['versions']))
assert d['status'] == 'DRAFT'
assert len(d['platformContents']) == 5
assert len(d['versions']) >= 1
"

step "11) GERÇEK YAYIN (demo sağlayıcı — 5/5 PUBLISHED)"
curl -s -b "$JAR" -X POST "$API/contents/$CONTENT/publish" -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d '{}' | python3 -c "
import json,sys
r=json.load(sys.stdin)
assert r.get('ok'), r
d=r['data']
print('  hazır=', d['ready'], '/', d['total'], '| içerik durumu=', d['contentStatus'])
assert d['total'] == 5 and d['ready'] == 5, d
assert d['contentStatus'] == 'PUBLISHED', d
for res in d['results']:
    assert res['ok'] is True and res['status'] == 'PUBLISHED', res
print('  ✓ 5 hedef de yayınlandı (demo modu); hiçbir hedef atlanmadı')
"
curl -s -b "$JAR" "$API/contents/$CONTENT" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print('  içerik durumu=', d['status'], '| hedef durumları=', sorted({p['status'] for p in d['platformContents']}))
assert d['status'] == 'PUBLISHED', d['status']
assert all(p['status']=='PUBLISHED' for p in d['platformContents'])
"

step "12) MODÜL KAPI DURUMLARI (Faz 2)"
curl -s -b "$JAR" "$API/bootstrap" -H "x-csrf-token: $CSRF" | python3 -c "
import json,sys
m=json.load(sys.stdin)['data'].get('modules', {})
print('  modüller:', ', '.join(f\"{k}={'açık' if v['enabled'] else 'kapalı'}\" for k,v in sorted(m.items())))
assert m.get('socialPublishing',{}).get('enabled') is True, m.get('socialPublishing')
assert m.get('scheduling',{}).get('enabled') is True, m.get('scheduling')
assert m.get('socialAccounts',{}).get('enabled') is True, m.get('socialAccounts')
assert m.get('analytics',{}).get('enabled') is False, m.get('analytics')
"
probe_gate() { # probe_gate <yöntem> <yol>
  local method="$1" path="$2" code body
  if [ "$method" = "GET" ]; then
    code=$(curl -s -o "$GATE_JSON" -w '%{http_code}' -b "$JAR" "$API/$path" -H "x-csrf-token: $CSRF")
  else
    code=$(curl -s -o "$GATE_JSON" -w '%{http_code}' -b "$JAR" -X "$method" "$API/$path" \
      -H 'content-type: application/json' -H "x-csrf-token: $CSRF" -d '{}')
  fi
  body=$(python3 -c "import json;d=json.load(open('$GATE_JSON'));print(d.get('error',{}).get('code',''))" 2>/dev/null || echo '?')
  echo "  $method $path -> $code $body"
  if [ "$code" != "501" ]; then echo "  ✗ $path kapatılmalıydı (501)"; FAIL=1; fi
}
probe_gate GET analytics/summary
probe_gate GET analytics/daily

rm -f "$JAR" "$ADAPT" "$MEDIA_JSON" "$VARIANT_JSON" "$GATE_JSON" /tmp/sf-e2e-story.jpg /tmp/sf-e2e-validate.json /tmp/sf-e2e-over.json
printf '\n'
if [ "$FAIL" = "0" ]; then echo "SONUÇ: Faz 2 kabul senaryosu BAŞARILI ✓"; else echo "SONUÇ: BAŞARISIZ ✗"; fi
exit "$FAIL"
