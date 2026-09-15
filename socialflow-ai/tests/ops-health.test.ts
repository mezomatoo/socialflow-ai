/**
 * Sistem sağlığı toplayıcısı (Faz 7 §114-§115)
 * ---------------------------------------------------------------------------
 * - İş kuyruğu sayaçları GERÇEK Job kayıtlarından gelir ve ÇALIŞMA ALANI
 *   İZOLELİDİR (başka çalışma alanının işleri sayılmaz).
 * - Başarısız işler gizlenmez: son hatalar gerçek lastError ile döner.
 * - DB erişilemezse kısmi durum dürüstçe `databaseReachable:false` döner.
 * - Nav'da yönetici öğeleri adminOnly işaretlidir.
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

import prisma from '../src/lib/prisma';
import { getSeedContext, type SeedContext } from './helpers';
import { gatherSystemHealth } from '../src/lib/ops/systemHealth';
import { NAV_GROUPS } from '../src/lib/ui/nav';

describe('Sistem sağlığı (yönetici operasyon)', () => {
  let ctx: SeedContext;
  let otherWorkspaceId: string;
  const jobIds: string[] = [];

  after(async () => {
    await prisma.job.deleteMany({ where: { id: { in: jobIds } } });
    if (otherWorkspaceId) await prisma.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => undefined);
  });

  it('kuyruk sayaçları gerçek ve çalışma alanı izoleli; hatalı işler görünür', async () => {
    ctx = await getSeedContext();

    // Diğer çalışma alanı + onun FAILED işi (izolasyon karşıtı)
    otherWorkspaceId = (await prisma.workspace.create({
      data: { name: 'OpsOther-' + randomUUID().slice(0, 8), slug: randomUUID() }
    })).id;
    const foreign = await prisma.job.create({
      data: { workspaceId: otherWorkspaceId, type: 'PublishContentJob', status: 'FAILED', lastError: 'yabancı hata', idempotencyKey: 'ops-foreign-' + randomUUID() }
    });
    jobIds.push(foreign.id);

    const before = await gatherSystemHealth(ctx.workspaceId);
    const failedBase = before.jobs.failed24h;

    // Bu çalışma alanına 1 QUEUED + 1 FAILED iş
    const q = await prisma.job.create({
      data: { workspaceId: ctx.workspaceId, type: 'AnalyticsSyncJob', status: 'QUEUED', idempotencyKey: 'ops-q-' + randomUUID() }
    });
    const f = await prisma.job.create({
      data: { workspaceId: ctx.workspaceId, type: 'PublishContentJob', status: 'FAILED', attempts: 3, maxAttempts: 3, lastError: 'Sağlayıcı 503', idempotencyKey: 'ops-f-' + randomUUID() }
    });
    jobIds.push(q.id, f.id);

    const snap = await gatherSystemHealth(ctx.workspaceId);
    assert.equal(snap.databaseReachable, true);
    assert.equal(snap.jobs.queued, before.jobs.queued + 1, 'QUEUED sayacı artmalı');
    assert.equal(snap.jobs.failed24h, failedBase + 1, 'FAILED sayacı yalnız bu çalışma alanı için artmalı');
    const found = snap.recentFailedJobs.find((j) => j.id === f.id);
    assert.ok(found, 'hatalı iş listede görünmeli (§115 gizleme yok)');
    assert.equal(found?.lastError, 'Sağlayıcı 503');
    assert.ok(!snap.recentFailedJobs.some((j) => j.id === foreign.id), 'başka çalışma alanının işi SIZMAMALI');
  });

  it('nav yönetici öğeleri adminOnly işaretli ve sistem gurubunda', () => {
    const system = NAV_GROUPS.find((g) => g.id === 'system');
    assert.ok(system);
    const adminItems = system.items.filter((i) => i.href.startsWith('/app/admin/'));
    assert.ok(adminItems.length >= 2, 'yönetici öğeleri mevcut olmalı');
    for (const item of adminItems) assert.equal(item.adminOnly, true, `${item.href} adminOnly olmalı`);
  });
});
