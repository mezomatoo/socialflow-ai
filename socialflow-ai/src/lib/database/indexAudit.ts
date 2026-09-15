/**
 * Veritabanı İndeks ve Performans Denetimi (§119-§120)
 * ---------------------------------------------------------------------------
 * Dashboard, takvim, planlama ve içerik sorgularının indeks kullanımını
 * EXPLAIN QUERY PLAN ile doğrular; eksik veya tam tablo taraması (SCAN TABLE)
 * durumlarını tespit eder.
 */

import prisma from '../prisma';

export interface QueryPlanResult {
  queryName: string;
  sql: string;
  usesIndex: boolean;
  indexName?: string;
  details: string[];
}

export interface IndexAuditReport {
  timestamp: string;
  allQueriesUseIndex: boolean;
  queries: QueryPlanResult[];
  verifiedIndexes: string[];
}

/**
 * Takvim ve dashboard kritik sorgularının indeks kullanımını denetler.
 */
export async function auditCriticalQueryIndexes(): Promise<IndexAuditReport> {
  const isPostgres = process.env.DATABASE_URL?.startsWith('postgresql://') || false;

  const testQueries = [
    {
      name: 'Takvim Tarih Aralığı ve Etkin Hedef Sorgusu',
      sql: isPostgres
        ? `EXPLAIN SELECT * FROM "PlatformContent" WHERE "enabled" = true AND "scheduledFor" >= NOW() AND "scheduledFor" <= NOW() + INTERVAL '30 days' ORDER BY "scheduledFor" ASC;`
        : `EXPLAIN QUERY PLAN SELECT * FROM PlatformContent WHERE enabled = 1 AND scheduledFor >= 1725148800000 AND scheduledFor <= 1727740800000 ORDER BY scheduledFor ASC;`
    },
    {
      name: 'Dashboard Son İçerikler ve Güncelleme Sıralaması',
      sql: isPostgres
        ? `EXPLAIN SELECT * FROM "Content" WHERE "workspaceId" = 'demo-workspace' ORDER BY "updatedAt" DESC LIMIT 6;`
        : `EXPLAIN QUERY PLAN SELECT * FROM Content WHERE workspaceId = 'demo-workspace' ORDER BY updatedAt DESC LIMIT 6;`
    },
    {
      name: 'İçerik Listesi Marka Filtreleme',
      sql: isPostgres
        ? `EXPLAIN SELECT * FROM "Content" WHERE "workspaceId" = 'demo-workspace' AND "brandId" = 'demo-brand' LIMIT 20;`
        : `EXPLAIN QUERY PLAN SELECT * FROM Content WHERE workspaceId = 'demo-workspace' AND brandId = 'demo-brand' LIMIT 20;`
    },
    {
      name: 'Planlayıcı İçerik Takvimi Tarih Filtreleme',
      sql: isPostgres
        ? `EXPLAIN SELECT * FROM "ContentPlanItem" WHERE "workspaceId" = 'demo-workspace' AND "date" >= NOW() LIMIT 30;`
        : `EXPLAIN QUERY PLAN SELECT * FROM ContentPlanItem WHERE workspaceId = 'demo-workspace' AND date >= 1725148800000 LIMIT 30;`
    },
    {
      name: 'Kuyruk İşleri Çalışma Alanı ve Durum Sorgusu',
      sql: isPostgres
        ? `EXPLAIN SELECT * FROM "Job" WHERE "workspaceId" = 'demo-workspace' AND "status" = 'QUEUED' LIMIT 10;`
        : `EXPLAIN QUERY PLAN SELECT * FROM Job WHERE workspaceId = 'demo-workspace' AND status = 'QUEUED' LIMIT 10;`
    }
  ];

  const results: QueryPlanResult[] = [];
  const verifiedIndexes = new Set<string>();

  for (const q of testQueries) {
    try {
      const rows: any[] = await prisma.$queryRawUnsafe(q.sql);
      const details = rows.map((r) => r.detail || r['QUERY PLAN'] || JSON.stringify(r));
      const detailsStr = details.join(' ');

      const usesIndex =
        detailsStr.includes('USING INDEX') ||
        detailsStr.includes('Index Scan') ||
        detailsStr.includes('Bitmap Index Scan');

      let indexName: string | undefined;
      const match = detailsStr.match(/USING INDEX ([a-zA-Z0-9_]+)/i) || detailsStr.match(/Index Scan.*on ([a-zA-Z0-9_]+)/i);
      if (match) {
        indexName = match[1];
        verifiedIndexes.add(indexName);
      }

      results.push({
        queryName: q.name,
        sql: q.sql,
        usesIndex,
        indexName,
        details
      });
    } catch (err: any) {
      results.push({
        queryName: q.name,
        sql: q.sql,
        usesIndex: false,
        details: [`Sorgu planı alınamadı: ${err?.message || err}`]
      });
    }
  }

  const allQueriesUseIndex = results.every((r) => r.usesIndex);

  return {
    timestamp: new Date().toISOString(),
    allQueriesUseIndex,
    queries: results,
    verifiedIndexes: Array.from(verifiedIndexes)
  };
}
