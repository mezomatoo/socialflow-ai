#!/usr/bin/env python3
"""Reviewed additive Reklam migration for an existing inbox-enabled SQLite DB.
Stop app/workers first. No reset, no seed; backup and record counts verified.
"""
import datetime, hashlib, pathlib, sqlite3, sys, uuid
root = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    sys.exit('Kullanım: python3 scripts/migrate-advertising.py prisma/dev.db')
path = pathlib.Path(sys.argv[1]).resolve()
if not path.is_file():
    sys.exit('Mevcut veritabanı gerekli.')
name = '202609150004_advertising_foundation'
sql = (root / 'prisma/migrations' / name / 'migration.sql').read_text()
checksum = hashlib.sha256(sql.encode()).hexdigest()
c = sqlite3.connect(path)
c.execute('PRAGMA foreign_keys=ON')
try:
    rows = list(c.execute('SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations'))
except sqlite3.OperationalError:
    sys.exit('Önce inbox migration geçmişi doğrulanmalı.')
for migration, digest, finished, rolled_back in rows:
    if rolled_back is None and finished is None:
        sys.exit('Tamamlanmamış migration var; işlem durduruldu.')
    if finished is not None and rolled_back is None:
        existing = root / 'prisma/migrations' / migration / 'migration.sql'
        if not existing.is_file() or hashlib.sha256(existing.read_bytes()).hexdigest() != digest:
            sys.exit('Migration geçmişi değişmiş; işlem durduruldu.')
        if migration == name:
            print('Reklam migration zaten uygulanmış; değişiklik yapılmadı.')
            sys.exit(0)
if not any(r[0] == '202609150003_oauth_binding' and r[2] is not None and r[3] is None for r in rows):
    sys.exit('Önce OAuth binding migration uygulanmalı.')
existing_tables = {r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table'")}
if existing_tables & {'AdAccount', 'AdAccountCredential', 'AdProviderCapability'}:
    sys.exit('Kayıtsız reklam şema değişikliği var; işlem durduruldu.')

tables = [r[0] for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name != '_prisma_migrations'")]
counts = {t: c.execute('SELECT count(*) FROM "' + t.replace('"', '""') + '"').fetchone()[0] for t in tables}
backup_dir = path.parent / 'backups'; backup_dir.mkdir(exist_ok=True)
backup = backup_dir / (path.stem + '-ads-' + datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%f') + '.db')
with sqlite3.connect(backup) as destination:
    c.backup(destination)
try:
    c.executescript('BEGIN IMMEDIATE;\n' + sql)
    now = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
    c.execute('INSERT INTO _prisma_migrations (id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES (?,?,?,?,?,1)', (str(uuid.uuid4()), checksum, name, now, now))
    if list(c.execute('PRAGMA foreign_key_check')):
        raise RuntimeError('Foreign key doğrulaması başarısız.')
    for table, count in counts.items():
        if c.execute('SELECT count(*) FROM "' + table.replace('"', '""') + '"').fetchone()[0] != count:
            raise RuntimeError('Mevcut kayıt sayısı değişti.')
    c.commit()
except BaseException:
    c.rollback(); raise
finally:
    c.close()
print(f'Reklam migration tamamlandı; {len(counts)} tablonun kayıt sayısı korundu. Yedek: {backup.name}')
