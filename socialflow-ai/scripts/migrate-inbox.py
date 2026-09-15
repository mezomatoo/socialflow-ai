#!/usr/bin/env python3
"""Non-destructive SQLite upgrade for the checked-in Phase 1–4 schema.
Checks baseline columns, backs up before any change, records Prisma history.
Never resets or seeds. For PostgreSQL use reviewed provider-specific migrations.
"""
import datetime, hashlib, pathlib, sqlite3, sys, uuid
root = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    sys.exit('Kullanım: python3 scripts/migrate-inbox.py prisma/dev.db')
path = pathlib.Path(sys.argv[1]).resolve()
if not path.is_file():
    sys.exit('Mevcut SQLite dosyası gerekli; bu komut veritabanı oluşturmaz.')
names = ['202609150001_baseline', '202609150002_inbox_foundation']
scripts = [(name, (root / 'prisma/migrations' / name / 'migration.sql').read_text()) for name in names]
connection = sqlite3.connect(path)
connection.execute('PRAGMA foreign_keys=ON')
tables = {row[0] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
if '_prisma_migrations' in tables:
    applied = dict(connection.execute('SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL'))
else:
    applied = {}
for name, sql in scripts:
    if name in applied and applied[name] != hashlib.sha256(sql.encode()).hexdigest():
        sys.exit('Migration sağlama toplamı uyuşmuyor. İşlem durduruldu.')
if names[1] in applied:
    print('Gelen Kutusu migration zaten uygulanmış. Değişiklik yapılmadı.')
    sys.exit(0)
if 'SocialConversation' in tables:
    sys.exit('Kayıtsız Gelen Kutusu şeması var. Elle doğrulama gerekli.')
reference = sqlite3.connect(':memory:')
reference.executescript(scripts[0][1])
expected = {row[0] for row in reference.execute("SELECT name FROM sqlite_master WHERE type='table'")}
if tables - {'_prisma_migrations', 'sqlite_sequence'} != expected:
    sys.exit('Başlangıç tabloları beklenen Faz 1–4 şemasıyla eşleşmiyor. İşlem durduruldu.')
for table in expected:
    actual = list(connection.execute(f'PRAGMA table_info("{table}")'))
    wanted = list(reference.execute(f'PRAGMA table_info("{table}")'))
    if actual != wanted:
        sys.exit(f'Başlangıç şeması farklı: {table}. İşlem durduruldu.')
counts = {table: connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] for table in expected}
backup_dir = path.parent / 'backups'
backup_dir.mkdir(exist_ok=True)
backup = backup_dir / f'{path.stem}-{datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%S%f")}.db'
with sqlite3.connect(backup) as target:
    connection.backup(target)
try:
    connection.executescript('BEGIN IMMEDIATE;\n' + scripts[1][1])
    connection.execute('''CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, finished_at DATETIME,
      migration_name TEXT NOT NULL, logs TEXT, rolled_back_at DATETIME,
      started_at DATETIME NOT NULL DEFAULT current_timestamp, applied_steps_count INTEGER NOT NULL DEFAULT 0)''')
    now = int(datetime.datetime.now(datetime.timezone.utc).timestamp() * 1000)
    for name, sql in scripts:
        if name not in applied:
            connection.execute('INSERT INTO _prisma_migrations (id,checksum,finished_at,migration_name,started_at,applied_steps_count) VALUES (?,?,?,?,?,1)', (str(uuid.uuid4()), hashlib.sha256(sql.encode()).hexdigest(), now, name, now))
    assert not list(connection.execute('PRAGMA foreign_key_check')), 'Foreign key ihlali'
    for table, count in counts.items():
        assert connection.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0] == count, f'Kayıt sayısı değişti: {table}'
    connection.commit()
except BaseException:
    connection.rollback()
    raise
finally:
    connection.close()
print(f'Migration tamamlandı. {len(counts)} mevcut tablonun kayıt sayısı korundu. Yedek: {backup.name}')
