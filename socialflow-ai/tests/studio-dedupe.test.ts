/**
 * AI Studio — özdeş üretim tekilleştirmesi (Faz 7 kenar durumu)
 * ---------------------------------------------------------------------------
 * Aynı girdiyle tekrar üretilen kreatif, içerik hash'i aynı olan MediaAsset'i
 * P2002 çakışması YARATMADAN yeniden kullanır; her üretim kendi MasterCreative
 * kaydını açar (orijinal varlık dokunulmaz, sahte çoğaltma yapılmaz).
 */
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import prisma from '../src/lib/prisma';
import { getSeedContext, type SeedContext } from './helpers';
import { generateStudioImages } from '../src/lib/ai/studioService';

describe('AI Studio: özdeş üretim tekilleştirmesi', () => {
  let ctx: SeedContext;
  const masterIds: string[] = [];
  const generationPrompts: string[] = [];
  let sharedAssetId: string | null = null;
  let sharedStorageKey: string | null = null;

  after(async () => {
    await prisma.creativeVariant.deleteMany({ where: { workspaceId: ctx.workspaceId, masterCreativeId: { in: masterIds } } });
    await prisma.creativeQualityScore.deleteMany({ where: { workspaceId: ctx.workspaceId, masterCreativeId: { in: masterIds } } });
    await prisma.masterCreative.deleteMany({ where: { id: { in: masterIds } } });
    if (sharedAssetId) await prisma.mediaAsset.deleteMany({ where: { id: sharedAssetId } });
    await prisma.aiImageGeneration.deleteMany({ where: { workspaceId: ctx.workspaceId, prompt: { contains: 'TESTDEDUPE' } } });
    if (sharedStorageKey) {
      try {
        fs.unlinkSync(path.join(process.cwd(), 'storage', sharedStorageKey));
      } catch {
        /* dosya zaten yok */
      }
    }
  });

  it('aynı girdiyle iki üretim P2002 patlatmaz; tek MediaAsset, iki MasterCreative', async () => {
    ctx = await getSeedContext();
    const input = {
      workspaceId: ctx.workspaceId,
      userId: ctx.userId,
      brandId: ctx.brandId,
      prompt: 'TESTDEDUPE özdeş lansman görseli',
      aspectRatio: '1:1' as const,
      count: 1
    };
    generationPrompts.push(input.prompt);

    const [first] = await generateStudioImages(input);
    const [second] = await generateStudioImages(input);

    assert.ok(first && second, 'her iki üretim de tamamlanmalı (hata yok)');
    assert.equal(first.mediaAssetId, second.mediaAssetId, 'özdeş çıktı AYNI MediaAsset\'e bağlanmalı');
    assert.notEqual(first.masterId, second.masterId, 'her üretim kendi MasterCreative kaydını açmalı');

    sharedAssetId = first.mediaAssetId;
    masterIds.push(first.masterId, second.masterId);

    const asset = await prisma.mediaAsset.findUnique({ where: { id: sharedAssetId } });
    assert.ok(asset);
    sharedStorageKey = asset.storageKey;

    const duplicates = await prisma.mediaAsset.count({
      where: { workspaceId: ctx.workspaceId, contentHash: asset.contentHash }
    });
    assert.equal(duplicates, 1, 'aynı hash için tek varlık olmalı (P2002 hiç oluşmadı)');

    const secondGen = await prisma.aiImageGeneration.findUnique({ where: { id: second.generationId } });
    assert.equal(secondGen?.status, 'DONE', 'ikinci üretim de DONE olmalı');
  });
});
