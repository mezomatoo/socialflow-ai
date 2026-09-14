/**
 * PHASE 4 — Brand Kit modül testi.
 * ensureBrandKit (idempotent + backfill), doluluk skoru, yetki matrisi (§138),
 * çoklu-marka izolasyonu (§134), genel koleksiyon CRUD + validasyon, marka
 * kilidi (§41-§42) ve sürümleme (§45-§46) doğrulanır. test.db üzerinde koşar.
 */
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import { getSeedContext, type SeedContext } from './helpers';
import type { SessionContext } from '../src/lib/auth/session';
import { ensureBrandKit, getBrandKit, updateBrandKit, createBrandKitVersion, listBrandKitVersions } from '../src/lib/brandkit/service';
import { computeCompleteness } from '../src/lib/brandkit/completeness';
import { canBrandKit } from '../src/lib/brandkit/permissions';
import { createItem, updateItem, deleteItem, ValidationError } from '../src/lib/brandkit/mutations';
import { COLLECTIONS } from '../src/lib/brandkit/collections';

function makeSession(ctx: SeedContext, role: string): SessionContext {
  return {
    sessionId: 'test',
    csrfToken: 'test',
    user: {
      id: ctx.userId,
      email: `${role.toLowerCase()}@test.local`,
      name: role,
      role: role as any,
      avatarUrl: null,
      workspaceId: ctx.workspaceId,
      workspaceName: 'test',
      workspaceSlug: 'demo-ajans',
      demoMode: true,
      timezone: 'Europe/Istanbul',
      locale: 'tr'
    }
  } as SessionContext;
}

describe('Brand Kit: servis, yetki, izolasyon, CRUD, kilit, sürüm', () => {
  let ctx: SeedContext;
  let kitId: string;

  before(async () => {
    ctx = await getSeedContext();
  });

  it('ensureBrandKit oluşturur, idempotenttir ve mevcut marka verisini backfill eder', async () => {
    const kit = await ensureBrandKit({ workspaceId: ctx.workspaceId, brandId: ctx.brandId });
    assert.ok(kit, 'kit oluşturulmalı');
    kitId = kit!.id;
    // Brand.primaryColor + secondaryColor → en az 2 renk backfill
    assert.ok(kit!.colors.length >= 2, `renkler backfill edilmeli (bulunan: ${kit!.colors.length})`);
    assert.ok(kit!.colors.some((c) => c.category === 'PRIMARY'), 'birincil renk olmalı');

    const before = kit!.colors.length;
    const kit2 = await ensureBrandKit({ workspaceId: ctx.workspaceId, brandId: ctx.brandId });
    assert.equal(kit2!.id, kitId, 'idempotent: aynı kit');
    assert.equal(kit2!.colors.length, before, 'ikinci çağrı renkleri çoğaltmamalı');
  });

  it('doluluk skoru 0-100 arasında ve 12 bölüm içerir', async () => {
    const kit = await getBrandKit({ workspaceId: ctx.workspaceId, brandId: ctx.brandId });
    const c = computeCompleteness(kit!);
    assert.ok(c.score >= 0 && c.score <= 100, 'skor aralığı');
    assert.equal(c.sections.length, 12, '12 ağırlıklı bölüm');
    assert.equal(c.sections.reduce((s, x) => s + x.weight, 0), 100, 'ağırlık toplamı 100');
  });

  it('yetki matrisi (§138) doğru çalışır', () => {
    assert.equal(canBrandKit('OWNER', 'edit'), true);
    assert.equal(canBrandKit('VIEWER', 'edit'), false);
    assert.equal(canBrandKit('EDITOR', 'edit'), true);
    assert.equal(canBrandKit('APPROVER', 'approve'), true);
    assert.equal(canBrandKit('EDITOR', 'approve'), false);
    assert.equal(canBrandKit('ADMIN', 'lock'), true);
    assert.equal(canBrandKit('EDITOR', 'lock'), false);
    assert.equal(canBrandKit('VIEWER', 'view'), true);
  });

  it('çoklu-marka izolasyonu: yabancı workspace erişemez', async () => {
    const leaked = await getBrandKit({ workspaceId: 'olmayan-workspace', brandId: ctx.brandId });
    assert.equal(leaked, null, 'başka workspace kiti görememeli');
  });

  it('genel koleksiyon CRUD + validasyon', async () => {
    const owner = makeSession(ctx, 'OWNER');
    const def = COLLECTIONS.colors;

    const created: any = await createItem(owner, ctx.brandId, def, { name: 'Test Rengi', hex: '#010203', category: 'ACCENT' });
    assert.ok(created.id, 'oluşturulan kaydın idsi olmalı');
    assert.equal(created.hex, '#010203');
    assert.equal(created.workspaceId, ctx.workspaceId, 'workspaceId damgalanmalı');

    const updated: any = await updateItem(owner, ctx.brandId, def, created.id, { prohibited: true, name: 'Test Rengi 2' });
    assert.equal(updated.prohibited, true);
    assert.equal(updated.name, 'Test Rengi 2');

    // Eksik zorunlu alan → ValidationError
    await assert.rejects(
      () => createItem(owner, ctx.brandId, def, { hex: '#999999' }),
      (e: any) => e instanceof ValidationError && /zorunludur/.test(e.message)
    );

    const del: any = await deleteItem(owner, ctx.brandId, def, created.id);
    assert.equal(del.deleted, true);
  });

  it('marka kilidi STRICT: EDITOR düzenleyemez, OWNER düzenler', async () => {
    const owner = makeSession(ctx, 'OWNER');
    const editor = makeSession(ctx, 'EDITOR');
    await updateBrandKit({ workspaceId: ctx.workspaceId, brandId: ctx.brandId }, { lockMode: 'STRICT' });

    await assert.rejects(
      () => createItem(editor, ctx.brandId, COLLECTIONS.colors, { name: 'X', hex: '#000000' }),
      (e: any) => e.name === 'ForbiddenError'
    );

    const okItem: any = await createItem(owner, ctx.brandId, COLLECTIONS.colors, { name: 'Owner Rengi', hex: '#0A0A0A' });
    assert.ok(okItem.id);
    await deleteItem(owner, ctx.brandId, COLLECTIONS.colors, okItem.id);

    // kilidi geri al
    await updateBrandKit({ workspaceId: ctx.workspaceId, brandId: ctx.brandId }, { lockMode: 'OFF' });
  });

  it('sürümleme: createBrandKitVersion sürümü artırır', async () => {
    const before = await getBrandKit({ workspaceId: ctx.workspaceId, brandId: ctx.brandId });
    const res = await createBrandKitVersion({ workspaceId: ctx.workspaceId, brandId: ctx.brandId, note: 'test', createdBy: ctx.userId });
    assert.ok(res);
    assert.equal(res!.version, before!.currentVersion + 1);
    const versions = await listBrandKitVersions({ workspaceId: ctx.workspaceId, brandId: ctx.brandId });
    assert.ok(versions.length >= 1, 'en az bir sürüm');
    assert.equal(versions[0].version, res!.version, 'liste yeni sürümü içermeli');
  });
});
