/**
 * Seed — demo çalışma alanı, markalar, hesaplar, kurallar, medya ve örnek içerikler.
 * Çalıştırma: npm run db:seed
 *
 * NOT: Analitik verisi ÜRETMEZ. "Analizler" ekranı demo modunda boş kalır ve
 * bunu kullanıcıya açıkça belirtir.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BUILTIN_RULES } from '../src/lib/platforms/builtinRules';
import { isSeedAllowed } from './seed-guard';

import prisma from '../src/lib/prisma';

const TZ = 'Europe/Istanbul';

function slugify(s: string) {
  const map: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
  return s
    .replace(/[çğıöşü]/g, (c) => map[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64);
  return `scrypt:${salt.toString('hex')}:${derived.toString('hex')}`;
}

const BUILTIN: any[] = BUILTIN_RULES as any[];

async function main() {
  // Üretim güvenlik kapısı (§15/§62): seed TÜM tabloları siler; üretimde
  // yalnızca SEED_ALLOW_PRODUCTION=true ile açıkça onaylanmışsa çalışır.
  const gate = isSeedAllowed({
    isProduction: process.env.APP_ENV === 'production',
    allowProductionSeed: process.env.SEED_ALLOW_PRODUCTION === 'true'
  });
  if (!gate.allowed) {
    console.error(`✋ ${gate.reason}`);
    process.exit(1);
  }
  if (gate.reason) console.warn(`⚠️ ${gate.reason}`);

  console.log('→ Veritabanı temizleniyor...');
  // Sıralama: bağımlılıklara göre
  await prisma.publicationAttempt.deleteMany();
  await prisma.publication.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.platformContent.deleteMany();
  await prisma.contentVersion.deleteMany();
  await prisma.contentMedia.deleteMany();
  await prisma.content.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.mediaFolder.deleteMany();
  await prisma.analyticsSnapshot.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.job.deleteMany();
  await prisma.platformRule.deleteMany();
  await prisma.hashtagEntry.deleteMany();
  await prisma.hashtagSet.deleteMany();
  await prisma.savedMention.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.providerIntegration.deleteMany();
  await prisma.socialProviderToken.deleteMany();
  await prisma.socialAccount.deleteMany();
  await prisma.brandVoice.deleteMany();
  await prisma.brand.deleteMany();
  await prisma.oAuthState.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.appSettings.deleteMany();
  await prisma.workspace.deleteMany();

  console.log('→ Çalışma alanı oluşturuluyor...');
  const workspace = await prisma.workspace.create({
    data: {
      name: 'Kahve Dükkanı Ajans',
      slug: 'demo-ajans',
      plan: 'AGENCY',
      demoMode: false,
      timezone: TZ,
      locale: 'tr-TR'
    }
  });

  await prisma.appSettings.create({
    data: {
      workspaceId: workspace.id,
      appName: 'SocialFlow AI',
      logoMark: 'SF',
      primaryColor: '#6D28D9',
      secondaryColor: '#0EA5E9',
      accentColor: '#F59E0B',
      radius: '16px',
      fontFamily: 'Inter',
      defaultLanguage: 'tr',
      defaultTimezone: TZ,
      demoBanner: false,
      aiProvider: 'deterministic'
    }
  });

  console.log('→ Kullanıcılar oluşturuluyor...');
  const owner = await prisma.user.create({
    data: {
      workspaceId: workspace.id,
      email: 'demo@socialflow.ai',
      passwordHash: hashPassword('Sosyal2026!'),
      name: 'Deniz Yılmaz',
      role: 'OWNER',
      locale: 'tr-TR',
      timezone: TZ
    }
  });
  await prisma.user.createMany({
    data: [
      {
        workspaceId: workspace.id,
        email: 'editor@socialflow.ai',
        passwordHash: hashPassword('Sosyal2026!'),
        name: 'Elif Kaya',
        role: 'EDITOR',
        locale: 'tr-TR',
        timezone: TZ
      },
      {
        workspaceId: workspace.id,
        email: 'onaylayici@socialflow.ai',
        passwordHash: hashPassword('Sosyal2026!'),
        name: 'Mert Demir',
        role: 'APPROVER',
        locale: 'tr-TR',
        timezone: TZ
      }
    ]
  });

  console.log('→ Marka profilleri oluşturuluyor...');
  const brand = await prisma.brand.create({
    data: {
      workspaceId: workspace.id,
      name: 'Kahve Dükkanı',
      slug: 'kahve-dukkani',
      logoUrl: '/demo/logo.jpg',
      primaryColor: '#7C4DFF',
      secondaryColor: '#0EA5E9',
      fontStyle: 'Inter',
      website: 'https://kahvedukkani.example.com',
      defaultCta: 'Detaylar için kahvedukkani.example.com adresini ziyaret edin.',
      description:
        'Üçüncü nesil kahve dükkanı. Tek çekirdek kaynaklı filtre kahveler, ev yapımı tatlılar ve atölye çalışmaları.',
      targetAudience: '25-40 yaş, şehirli, nitelikli kahve ve deneyim arayan profesyoneller',
      defaultStyle: 'FRIENDLY',
      defaultHashtags: 'kahve nitelikkahve kahvedukkani istanbul',
      requiredHashtags: 'kahvedukkani',
      bannedHashtags: 'like4follow takipci satin',
      defaultMentions: '@kahvedukkani',
      isDefault: true,
      voice: {
        create: {
          tone: 'sıcak, bilgili ve samimi; abartısız',
          personality: 'İşi bilen mahalle kahvecisi',
          audience: '25-40 yaş şehirli kahve severler',
          allowedTerms: 'nitelikli kahve, tek çekirdek, taze kavrulmuş, atölye, demleme',
          bannedTerms: 'süper, muhteşem, efsane, en iyi, inanılmaz',
          mustKeepTerms: 'Kahve Dükkanı',
          formality: 'NEUTRAL',
          emojiLevel: 'MEDIUM',
          language: 'tr'
        }
      }
    }
  });

  const brand2 = await prisma.brand.create({
    data: {
      workspaceId: workspace.id,
      name: 'Aurora Tekstil',
      slug: 'aurora-tekstil',
      primaryColor: '#0EA5E9',
      secondaryColor: '#6D28D9',
      website: 'https://auroratekstil.example.com',
      defaultCta: 'Koleksiyonu inceleyin.',
      description: 'Sürdürülebilir kumaşlardan üretilen kadın giyim koleksiyonu.',
      targetAudience: '25-45 yaş, sürdürülebilir modayı önemseyen kadınlar',
      defaultStyle: 'PREMIUM',
      defaultHashtags: 'aurora sürdürülebilirmoda',
      requiredHashtags: 'auroratekstil',
      voice: {
        create: {
          tone: 'rafine, sade, kendinden emin',
          formality: 'FORMAL',
          emojiLevel: 'NONE',
          mustKeepTerms: 'Aurora',
          bannedTerms: 'ucuz, indirim çılgınlığı'
        }
      }
    }
  });

  console.log('→ Platform kuralları yükleniyor...');
  for (const r of BUILTIN) {
    await prisma.platformRule.create({
      data: {
        workspaceId: workspace.id,
        platform: r.platform,
        contentType: r.contentType,
        label: r.label,
        maxCaptionLength: r.maxCaptionLength,
        recommendedCaptionLength: r.recommendedCaptionLength,
        minCaptionLength: r.minCaptionLength ?? 0,
        supportedAspectRatios: JSON.stringify(r.supportedAspectRatios),
        recommendedAspectRatio: r.recommendedAspectRatio,
        minWidth: r.minWidth,
        minHeight: r.minHeight,
        maxWidth: r.maxWidth ?? 4096,
        maxHeight: r.maxHeight ?? 4096,
        maxFileSizeKb: Math.round(r.maxFileSize / 1024),
        maxVideoFileSizeKb: r.maxVideoFileSize != null ? Math.round(r.maxVideoFileSize / 1024) : null,
        supportedMimeTypes: JSON.stringify(r.supportedMimeTypes),
        supportedImageFormats: JSON.stringify(r.supportedImageFormats ?? []),
        supportedVideoFormats: JSON.stringify(r.supportedVideoFormats ?? []),
        maxVideoDuration: r.maxVideoDuration ?? null,
        minVideoDuration: r.minVideoDuration ?? null,
        maxMediaCount: r.maxMediaCount ?? 1,
        maxHashtags: r.maxHashtags ?? 0,
        recommendedHashtags: r.recommendedHashtags ?? 0,
        hashtagRecommendation: JSON.stringify(r.hashtagRecommendation ?? []),
        supportsLinks: r.supportsLinks ?? false,
        clickableLinks: r.clickableLinks ?? false,
        supportsStories: r.supportsStories ?? false,
        supportsCarousel: r.supportsCarousel ?? false,
        supportsReels: r.supportsReels ?? false,
        supportsScheduling: r.supportsScheduling ?? true,
        supportsFirstComment: r.supportsFirstComment ?? false,
        supportsLocation: r.supportsLocation ?? false,
        supportsMentions: r.supportsMentions ?? true,
        supportsAltText: r.supportsAltText ?? false,
        supportsThreads: r.supportsThreads ?? false,
        safeArea: r.safeArea ? JSON.stringify(r.safeArea) : null,
        restrictions: JSON.stringify(r.restrictions ?? []),
        apiVersion: r.apiVersion ?? 'v1',
        capabilities: JSON.stringify(r.capabilities ?? []),
        source: 'BUILTIN',
        lastUpdatedAt: new Date()
      }
    });
  }

  console.log('→ Entegrasyon durumları kaydediliyor...');
  for (const p of ['INSTAGRAM', 'FACEBOOK', 'X', 'LINKEDIN', 'TIKTOK', 'YOUTUBE', 'THREADS', 'PINTEREST', 'GOOGLE_BUSINESS']) {
    await prisma.providerIntegration.create({
      data: {
        workspaceId: workspace.id,
        platform: p,
        status: 'NOT_CONFIGURED',
        credentialsSet: false,
        message: 'API kimlik bilgileri tanımlanmadı. Kimlik bilgileri tanımlanana kadar bu platform simülasyon olarak çalışır.'
      }
    });
  }

  console.log('→ Sosyal medya hesapları bağlanıyor...');
  const accounts: Record<string, string> = {};
  const accountDefs: [string, string, string, string, string][] = [
    ['INSTAGRAM', '@kahvedukkani', 'Kahve Dükkanı', 'BUSINESS', brand.id],
    ['FACEBOOK', 'Kahve Dükkanı', 'Kahve Dükkanı', 'PAGE', brand.id],
    ['X', '@kahvedukkani', 'Kahve Dükkanı', 'PROFILE', brand.id],
    ['LINKEDIN', 'kahve-dukkani', 'Kahve Dükkanı A.Ş.', 'PAGE', brand.id],
    ['TIKTOK', '@kahvedukkani', 'Kahve Dükkanı', 'PROFILE', brand.id],
    ['YOUTUBE', '@kahvedukkani', 'Kahve Dükkanı', 'CHANNEL', brand.id],
    ['THREADS', '@kahvedukkani', 'Kahve Dükkanı', 'PROFILE', brand.id],
    ['PINTEREST', 'kahvedukkani', 'Kahve Dükkanı', 'PROFILE', brand.id],
    ['GOOGLE_BUSINESS', 'Kadıköy Şubesi', 'Kahve Dükkanı Kadıköy', 'BUSINESS', brand.id],
    ['INSTAGRAM', '@auroratekstil', 'Aurora Tekstil', 'BUSINESS', brand2.id]
  ];

  for (const [platform, handle, displayName, accountType, brandId] of accountDefs) {
    const a = await prisma.socialAccount.create({
      data: {
        workspaceId: workspace.id,
        brandId,
        platform,
        handle,
        displayName,
        accountType,
        connectionStatus: 'ACTIVE',
        demoAccount: false,
        externalId: `demo_${platform.toLowerCase()}_${slugify(handle)}`,
        scopes: 'demo_scopes',
        lastValidatedAt: new Date()
      }
    });
    accounts[`${platform}:${handle}`] = a.id;
  }
  const ig = accounts['INSTAGRAM:@kahvedukkani'];
  const fb = accounts['FACEBOOK:Kahve Dükkanı'];
  const x = accounts['X:@kahvedukkani'];
  const li = accounts['LINKEDIN:kahve-dukkani'];
  const tt = accounts['TIKTOK:@kahvedukkani'];
  const yt = accounts['YOUTUBE:@kahvedukkani'];
  const th = accounts['THREADS:@kahvedukkani'];
  const pi = accounts['PINTEREST:kahvedukkani'];
  const igAurora = accounts['INSTAGRAM:@auroratekstil'];

  console.log('→ Hashtag setleri ve mentionlar ekleniyor...');
  const setGenel = await prisma.hashtagSet.create({
    data: { workspaceId: workspace.id, brandId: brand.id, name: 'Kahve — Genel', group: 'GENERAL', isDefault: true }
  });
  for (const tag of ['kahve', 'nitelikkahve', 'filtrekahve', 'espresso', 'kahvekeyfi', 'barista', 'üçüncünesilkahve']) {
    await prisma.hashtagEntry.create({ data: { workspaceId: workspace.id, setId: setGenel.id, tag, group: 'GENERAL', language: 'tr', usageCount: Math.floor(Math.random() * 30) + 5 } });
  }
  for (const tag of ['kadikoy', 'istanbul', 'moda', 'kadıköykahve']) {
    await prisma.hashtagEntry.create({ data: { workspaceId: workspace.id, tag, group: 'LOCATION', language: 'tr', usageCount: Math.floor(Math.random() * 20) + 3 } });
  }
  for (const tag of ['kahvemolasi', 'sabahkahvesi', 'haftasonu', 'yeniürün']) {
    await prisma.hashtagEntry.create({ data: { workspaceId: workspace.id, tag, group: 'TREND', language: 'tr', usageCount: Math.floor(Math.random() * 40) + 10 } });
  }
  for (const tag of ['like4like', 'follow4follow', 'takipçisatın']) {
    await prisma.hashtagEntry.create({ data: { workspaceId: workspace.id, tag, group: 'GENERAL', blocked: true } });
  }

  await prisma.savedMention.createMany({
    data: [
      { workspaceId: workspace.id, handle: '@kahvedukkani', platform: null, label: 'Ana marka hesabı', required: true },
      { workspaceId: workspace.id, handle: '@kadikoybelediyesi', platform: 'INSTAGRAM', label: 'Lokasyon ortağı', required: false },
      { workspaceId: workspace.id, handle: '@auroratekstil', platform: null, label: 'Kardeş marka', required: false }
    ]
  });

  console.log('→ Kampanyalar ekleniyor...');
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      name: 'Yeni Sezon Etiyopya',
      code: 'YENI-SEZON-2026',
      startDate: new Date(Date.now() - 3 * 86400_000),
      endDate: new Date(Date.now() + 17 * 86400_000),
      budget: 45000,
      currency: 'TRY',
      notes: 'Etiyopya Yirgacheffe tek çekirdek lansmanı. %15 lansman indirimi 20 Eylül 2026 tarihine kadar geçerli.'
    }
  });

  console.log('→ Medya kütüphanesi dolduruluyor...');
  const demoDir = path.resolve(process.cwd(), 'storage/demo');
  const mediaDefs: [string, string, number, number, string][] = [
    ['demo-1-square.jpg', 'aurora-serisi-1600x1600.jpg', 1600, 1600, 'IMAGE'],
    ['demo-2-portrait.jpg', 'sonsuz-konfor-1440x1800.jpg', 1440, 1800, 'IMAGE'],
    ['demo-3-story.jpg', 'son-gun-1080x1920.jpg', 1080, 1920, 'IMAGE'],
    ['demo-4-landscape.jpg', 'stüdyo-cekim-1920x1080.jpg', 1920, 1080, 'IMAGE'],
    ['demo-5-pin.jpg', 'pin-tasarim-1000x1500.jpg', 1000, 1500, 'IMAGE']
  ];
  const mediaIds: string[] = [];
  for (const [file, name, w, h, kind] of mediaDefs) {
    const filePath = path.join(demoDir, file);
    const bytes = fs.readFileSync(filePath);
    const storageKey = `demo/${file}`;
    const asset = await prisma.mediaAsset.create({
      data: {
        workspaceId: workspace.id,
        brandId: brand.id,
        kind,
        filename: file,
        originalName: name,
        storageKey,
        publicUrl: `/api/media/file/${storageKey}`,
        mimeType: 'image/jpeg',
        format: 'jpg',
        bytes: bytes.length,
        width: w,
        height: h,
        aspectRatio: w / h,
        contentHash: crypto.createHash('sha256').update(bytes).digest('hex'),
        focalPoint: JSON.stringify({ x: 0.5, y: 0.42, method: 'SUBJECT', confidence: 0.82 }),
        analysis: JSON.stringify({
          focalPoint: { x: 0.5, y: 0.42, method: 'SUBJECT', confidence: 0.82 },
          faces: [],
          hasText: true,
          textRegions: [{ x: 0.18, y: 0.66, w: 0.64, h: 0.16 }],
          logoRegion: { x: 0.42, y: 0.86, w: 0.16, h: 0.06 },
          brightness: 0.52,
          blurScore: 0.08,
          analyzedAt: new Date().toISOString()
        }),
        tags: 'demo,kampanya,yeni-sezon',
        campaign: campaign.name,
        status: 'READY',
        createdBy: owner.id
      }
    });
    mediaIds.push(asset.id);
  }
  const logoAsset = await prisma.mediaAsset.create({
    data: {
      workspaceId: workspace.id,
      brandId: brand.id,
      kind: 'LOGO',
      filename: 'logo.jpg',
      originalName: 'kahve-dukkani-logo.jpg',
      storageKey: `demo/logo.jpg`,
      publicUrl: `/api/media/file/demo/logo.jpg`,
      mimeType: 'image/jpeg',
      format: 'jpg',
      bytes: fs.statSync(path.join(demoDir, 'logo.jpg')).size,
      width: 512,
      height: 512,
      aspectRatio: 1,
      contentHash: crypto.createHash('sha256').update(fs.readFileSync(path.join(demoDir, 'logo.jpg'))).digest('hex'),
      tags: 'logo,marka',
      status: 'READY'
    }
  });

  console.log('→ Örnek içerikler oluşturuluyor...');

  // 1) Planlanmış — tam çoklu platform senaryosu
  const masterCaption = `Yeni sezon Etiyopya Yirgacheffe çekirdeklerimiz bugün itibarıyla raflarda ve online mağazamızda!

Bu çekirdeği seçmemizin sebebi oldukça net: bergamot ve yasemin notaları, orta gövde ve uzun, temiz bir bitiş. Her partiyi Kadıköy'deki kavurma evimizde 200 kg'lık partiler hâlinde, siparişten sonra kavuruyoruz. Böylece fincana giden kahve en fazla 7 günlük oluyor.

Lansmana özel olarak 250 gramlık paketlerde %15 indirim uyguluyoruz. Kampanya 20 Eylül 2026 tarihine kadar geçerli ve stoklarla sınırlıdır.

Cumartesi saat 14:00'te kavurma evimizde ücretsiz demleme atölyemiz var. V60, Chemex ve Aeropress ile aynı çekirdeğin üç farklı profilini birlikte tadacağız. Katılım için rezervasyon gerekmiyor, ama yer sayısı 20 kişi ile sınırlı.

Kahvenizi nasıl demlediğinizi yorumlarda paylaşın — en sevdiğimiz üç demleme yöntemine birer paket hediye ediyoruz.

Detaylı bilgi almak için web sitemizi ziyaret edebilirsiniz: https://kahvedukkani.example.com/yeni-sezon`;

  const content1 = await prisma.content.create({
    data: {
      workspaceId: workspace.id,
      brandId: brand.id,
      campaignId: campaign.id,
      title: 'Yeni Sezon Etiyopya Yirgacheffe Lansmanı',
      masterCaption,
      storyText: 'Yeni sezon geldi! Son gün 20 Eylül.',
      linkUrl: 'https://kahvedukkani.example.com/yeni-sezon',
      utm: JSON.stringify({ source: 'socialflow', medium: 'social', campaign: 'yeni-sezon-2026', content: 'lansman' }),
      defaultStyle: 'FRIENDLY',
      defaultCta: 'Yeni sezonu keşfedin.',
      hashtagPlacement: 'INLINE',
      timezone: TZ,
      scheduleMode: 'SCHEDULE',
      scheduledFor: atHour(18, 0),
      status: 'SCHEDULED',
      adaptState: 'NONE',
      version: 1,
      createdById: owner.id,
      media: { create: [{ mediaId: mediaIds[0], position: 0 }] },
      versions: {
        create: {
          version: 1,
          kind: 'ORIGINAL',
          note: 'Orijinal ana açıklama',
          payload: JSON.stringify({ masterCaption }),
          createdById: owner.id
        }
      }
    }
  });

  const selections1: [string, string, string][] = [
    ['INSTAGRAM', 'FEED', ig],
    ['INSTAGRAM', 'STORY', ig],
    ['FACEBOOK', 'FEED', fb],
    ['FACEBOOK', 'STORY', fb],
    ['LINKEDIN', 'POST', li],
    ['X', 'POST', x]
  ];
  for (const [platform, contentType, accountId] of selections1) {
    const rule = BUILTIN.find((r) => r.platform === platform && r.contentType === contentType);
    await prisma.platformContent.create({
      data: {
        contentId: content1.id,
        key: `${platform}:${contentType}`,
        platform,
        contentType,
        socialAccountId: accountId,
        status: 'SCHEDULED',
        scheduledFor: atHour(18, 0),
        charLimit: rule.maxCaptionLength,
        aspectRatio: rule.recommendedAspectRatio,
        mediaAssetId: mediaIds[0],
        hashtagPlacement: 'INLINE'
      }
    });
    const pc = await prisma.platformContent.findFirst({ where: { contentId: content1.id, key: `${platform}:${contentType}` } });
    if (pc) {
      await prisma.schedule.create({
        data: {
          contentId: content1.id,
          platformContentId: pc.id,
          scheduledFor: atHour(18, 0),
          timezone: TZ,
          status: 'PENDING'
        }
      });
    }
  }

  // 2) Yayınlanmış + bir hedefi hatalı (kısmi başarı senaryosu)
  const content2 = await prisma.content.create({
    data: {
      workspaceId: workspace.id,
      brandId: brand.id,
      title: 'Cumartesi Demleme Atölyesi',
      masterCaption:
        'Cumartesi 14:00 — kavurma evimizde ücretsiz V60 atölyesi. Aynı Etiyopya çekirdeğini üç farklı demleme yöntemiyle tadacağız. Yer sayısı 20 kişi ile sınırlı, rezervasyon gerekmiyor.',
      defaultStyle: 'FRIENDLY',
      timezone: TZ,
      status: 'PARTIALLY_PUBLISHED',
      publishedAt: new Date(Date.now() - 26 * 3600_000),
      version: 2,
      createdById: owner.id,
      media: { create: [{ mediaId: mediaIds[3], position: 0 }] }
    }
  });
  const c2Targets: [string, string, string, string | null, string | null][] = [
    ['INSTAGRAM', 'FEED', 'PUBLISHED', 'demo_ig_post_1', null],
    ['FACEBOOK', 'FEED', 'PUBLISHED', 'demo_fb_post_1', null],
    ['LINKEDIN', 'POST', 'PUBLISHED', 'demo_li_post_1', null],
    ['X', 'POST', 'FAILED', null, 'X oturumunuzun süresi dolmuş. Hesabınızı yeniden bağlamanız gerekiyor.']
  ];
  for (const [platform, contentType, status, extId, lastError] of c2Targets) {
    const rule = BUILTIN.find((r) => r.platform === platform && r.contentType === contentType);
    const accountId = platform === 'INSTAGRAM' ? ig : platform === 'FACEBOOK' ? fb : platform === 'LINKEDIN' ? li : x;
    await prisma.platformContent.create({
      data: {
        contentId: content2.id,
        key: `${platform}:${contentType}`,
        platform,
        contentType,
        socialAccountId: accountId,
        caption: 'Cumartesi 14:00 — ücretsiz V60 atölyesi. Yer sayısı 20 ile sınırlı.',
        captionSource: 'AI',
        hashtags: 'kahve nitelikkahve atölye',
        status,
        publishedAt: status === 'PUBLISHED' ? new Date(Date.now() - 26 * 3600_000) : null,
        externalPostId: extId,
        permalink: extId ? `https://example.com/${extId}` : null,
        lastError,
        lastErrorCode: lastError ? 'OAuthException 190' : null,
        charLimit: rule.maxCaptionLength,
        charUsed: 62,
        aspectRatio: rule.recommendedAspectRatio,
        mediaAssetId: mediaIds[3]
      }
    });
  }

  // 3) Taslak
  await prisma.content.create({
    data: {
      workspaceId: workspace.id,
      brandId: brand2.id,
      title: 'Aurora Sonbahar Koleksiyonu',
      masterCaption:
        'Aurora sonbahar koleksiyonu hazırlanıyor. Geri dönüştürülmüş kaşmir karışımlı dokular, nötr bir palet ve zamansız kesimler. Koleksiyonun tamamını önümüzdeki hafta paylaşacağız.',
      defaultStyle: 'PREMIUM',
      timezone: TZ,
      status: 'DRAFT',
      version: 1,
      createdById: owner.id,
      media: { create: [{ mediaId: mediaIds[1], position: 0 }] }
    }
  });

  // 4) Dün yayınlanmış
  const content4 = await prisma.content.create({
    data: {
      workspaceId: workspace.id,
      brandId: brand.id,
      title: 'Hafta Sonu Kahvaltı Menüsü',
      masterCaption:
        'Hafta sonu kahvaltı menümüz yenilendi: ev yapımı granola, taze meyve, filtre kahve ve sınırsız demleme. Cumartesi ve Pazar 09:00-13:00 arası.',
      defaultStyle: 'FRIENDLY',
      timezone: TZ,
      status: 'PUBLISHED',
      publishedAt: new Date(Date.now() - 30 * 3600_000),
      version: 1,
      createdById: owner.id,
      media: { create: [{ mediaId: mediaIds[2], position: 0 }] }
    }
  });
  for (const [platform, contentType, accountId] of [
    ['INSTAGRAM', 'STORY', ig],
    ['FACEBOOK', 'STORY', fb]
  ] as [string, string, string][]) {
    const rule = BUILTIN.find((r) => r.platform === platform && r.contentType === contentType);
    await prisma.platformContent.create({
      data: {
        contentId: content4.id,
        key: `${platform}:${contentType}`,
        platform,
        contentType,
        socialAccountId: accountId,
        caption: 'Hafta sonu kahvaltısı yenilendi. 09:00-13:00',
        captionSource: 'AI',
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - 30 * 3600_000),
        externalPostId: `demo_${platform.toLowerCase()}_story_1`,
        charLimit: rule.maxCaptionLength,
        charUsed: 46,
        aspectRatio: rule.recommendedAspectRatio,
        mediaAssetId: mediaIds[2]
      }
    });
  }

  // 5) Yarın planlanmış (TikTok + YouTube Shorts video senaryosu)
  const content5 = await prisma.content.create({
    data: {
      workspaceId: workspace.id,
      brandId: brand.id,
      title: 'Barista Arkası — V60 Demleme',
      masterCaption:
        'Baristamız Emre, aynı Etiyopya çekirdeğiyle V60 demlemesinin tüm adımlarını 45 saniyede anlatıyor. Öğütme kalınlığı, su sıcaklığı ve dökme hızı: üçü de tadı değiştiriyor.',
      storyText: 'V60 nasıl demlenir? 45 saniyede anlatıyoruz.',
      defaultStyle: 'INFORMATIVE',
      timezone: TZ,
      status: 'SCHEDULED',
      scheduleMode: 'SCHEDULE',
      scheduledFor: atHour(12, 30, 1),
      version: 1,
      createdById: owner.id,
      media: { create: [{ mediaId: mediaIds[3], position: 0 }] }
    }
  });
  for (const [platform, contentType, accountId] of [
    ['TIKTOK', 'VIDEO', tt],
    ['YOUTUBE', 'SHORTS', yt],
    ['INSTAGRAM', 'REEL', ig],
    ['THREADS', 'POST', th]
  ] as [string, string, string][]) {
    const rule = BUILTIN.find((r) => r.platform === platform && r.contentType === contentType);
    await prisma.platformContent.create({
      data: {
        contentId: content5.id,
        key: `${platform}:${contentType}`,
        platform,
        contentType,
        socialAccountId: accountId,
        status: 'SCHEDULED',
        scheduledFor: atHour(12, 30, 1),
        charLimit: rule.maxCaptionLength,
        aspectRatio: rule.recommendedAspectRatio,
        mediaAssetId: mediaIds[3]
      }
    });
  }

  // 6) Onay bekliyor (takım iş akışı)
  await prisma.content.create({
    data: {
      workspaceId: workspace.id,
      brandId: brand.id,
      title: 'Sadakat Kartı Duyurusu',
      masterCaption:
        'Sadakat kartımız yenilendi. 10 kahve alana 1 kahve hediye, ayrıca doğum gününüzde filtre kahve bizden. Kartı kasadan ücretsiz alabilirsiniz.',
      defaultStyle: 'ANNOUNCEMENT',
      timezone: TZ,
      status: 'APPROVAL_PENDING',
      version: 1,
      createdById: owner.id
    }
  });

  console.log('→ Bildirimler ekleniyor...');
  await prisma.notification.createMany({
    data: [
      {
        workspaceId: workspace.id,
        userId: owner.id,
        type: 'PUBLISH_FAILED',
        severity: 'ERROR',
        title: 'X yayını başarısız',
        message: 'X oturumunuzun süresi dolmuş. Hesabınızı yeniden bağlamanız gerekiyor.',
        actionLabel: 'Hesabı Yeniden Bağla',
        actionRoute: '/sosyal-hesaplar'
      },
      {
        workspaceId: workspace.id,
        userId: owner.id,
        type: 'PUBLISHED',
        severity: 'SUCCESS',
        title: 'Instagram gönderiniz başarıyla yayınlandı.',
        message: 'Cumartesi Demleme Atölyesi içeriği Instagram gönderisi olarak yayınlandı.'
      },
      {
        workspaceId: workspace.id,
        userId: owner.id,
        type: 'SCHEDULED',
        severity: 'INFO',
        title: 'LinkedIn paylaşımı planlandı.',
        message: 'Yeni Sezon Etiyopya Yirgacheffe Lansmanı LinkedIn için planlandı.'
      },
      {
        workspaceId: workspace.id,
        type: 'REMINDER',
        severity: 'INFO',
        title: 'Yaklaşan paylaşımlar',
        message: 'Bugün saat 18:00 için 6 paylaşımınız bulunuyor.',
        actionLabel: 'Takvimi Aç',
        actionRoute: '/takvim'
      },
      {
        workspaceId: workspace.id,
        userId: owner.id,
        type: 'ACCOUNT_REAUTH',
        severity: 'WARNING',
        title: 'Hesap bağlantısı yenilenmeli',
        message: 'X hesabınızın bağlantısının yenilenmesi gerekiyor.'
      }
    ]
  });

  console.log('→ Denetim kaydı yazılıyor...');
  await prisma.auditLog.create({
    data: {
      workspaceId: workspace.id,
      userId: owner.id,
      action: 'seed.demo',
      entityType: 'Workspace',
      entityId: workspace.id,
      metadata: JSON.stringify({ contents: 6, accounts: accountDefs.length, rules: BUILTIN.length })
    }
  });

  console.log('');
  console.log('✅ Seed tamamlandı.');
  console.log('   Giriş: demo@socialflow.ai / Sosyal2026!');
  console.log(`   Marka: ${brand.name}, ${brand2.name}`);
  console.log(`   Hesap: ${accountDefs.length} · Kural: ${BUILTIN.length} · Medya: ${mediaIds.length + 1}`);
  console.log(`   Logo medya kimliği: ${logoAsset.id}`);
}

function atHour(hour: number, minute: number, dayOffset = 0): Date {
  // Europe/Istanbul (UTC+3) için bugün/yarın belirtilen saat
  const now = new Date();
  const istanbulNow = new Date(now.getTime() + (3 * 60 + now.getTimezoneOffset()) * 60_000);
  istanbulNow.setDate(istanbulNow.getDate() + dayOffset);
  istanbulNow.setHours(hour, minute, 0, 0);
  // Gerçek UTC'ye çevir
  return new Date(istanbulNow.getTime() - 3 * 3600_000);
}

main()
  .catch((e) => {
    console.error('❌ Seed hatası:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
