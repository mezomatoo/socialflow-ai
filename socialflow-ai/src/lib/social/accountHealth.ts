import prisma from '../prisma';
import { getProvider } from './registry';
import { fromCipherText } from '../crypto';
import { notify } from '../services/notifications';
import { audit } from '../security/audit';
import { PLATFORM_META } from '../platforms/platforms';
import type { ContentType } from '../platforms/platforms';

/**
 * AccountHealthService (Faz 2, §27-§29)
 * ---------------------------------------------------------------------------
 * Bağlı sosyal medya hesabının sağlığını denetler:
 *   1. Bağlantı durumu (ACTIVE / NEEDS_REAUTH / ...)
 *   2. Token varlığı + geçerliliği (sağlayıcı validateToken)
 *   3. Profil erişimi (fetchAccountProfiles — externalId eşleşmesi)
 *   4. Yetenek envanteri (desteklenen içerik türleri → capabilities)
 *
 * Token yenilenemiyorsa hesap ASLA sessizce silinmez (§29): NEEDS_REAUTH'e
 * çekilir ve Türkçe bildirim oluşturulur. Sonuç `lastSyncedAt` ile saklanır.
 */

export interface HealthCheckRow {
  key: string;
  label: string;
  level: 'OK' | 'WARNING' | 'ERROR';
  message: string;
}

export interface AccountHealthResult {
  ok: boolean;
  accountId: string;
  connectionStatus: string;
  checks: HealthCheckRow[];
  checkedAt: string;
}

/** Hesabın desteklediği içerik türlerini JSON olarak saklar (§19, §21). */
function capabilitySnapshot(platform: string): string {
  try {
    const provider = getProvider(platform);
    const types: ContentType[] = ['POST', 'STORY', 'REEL', 'SHORTS', 'VIDEO', 'PIN', 'THREAD']
      .filter((t): t is ContentType => {
        try {
          return provider.supports(t as ContentType);
        } catch {
          return false;
        }
      });
    return JSON.stringify({ contentTypes: types, apiVersion: provider.apiVersion, label: provider.label });
  } catch {
    return '[]';
  }
}

export async function checkAccountHealth(
  accountId: string,
  options: { workspaceId?: string; userId?: string | null; notifyOnFailure?: boolean } = {}
): Promise<AccountHealthResult> {
  const account = await prisma.socialAccount.findUnique({ where: { id: accountId }, include: { token: true } });
  if (!account) throw new Error('Hesap bulunamadı.');
  if (options.workspaceId && account.workspaceId !== options.workspaceId) throw new Error('Hesap bulunamadı.');

  const checks: HealthCheckRow[] = [];
  const platformName = PLATFORM_META[account.platform as keyof typeof PLATFORM_META]?.name ?? account.platform;
  let status = account.connectionStatus;

  // 1) Bağlantı durumu
  if (status === 'ACTIVE' || status === 'ERROR') {
    checks.push({ key: 'connection', label: 'Bağlantı', level: 'OK', message: 'Hesap bağlantısı kayıtlı.' });
  } else {
    checks.push({
      key: 'connection',
      label: 'Bağlantı',
      level: 'ERROR',
      message: `Hesap bağlantısı ${status} durumunda. Karttaki “Yetkilendir” düğmesiyle resmî OAuth akışını başlatabilir; OAuth'u beklemek istemezseniz “Simülasyon Olarak Bağla” ile hesabı hemen kullanılabilir yapabilirsiniz.`
    });
  }

  // 2) Token
  let accessToken: string | null = null;
  if (account.demoAccount) {
    checks.push({ key: 'token', label: 'Erişim anahtarı', level: 'OK', message: 'Demo hesap — gerçek token gerekmez.' });
  } else if (!account.token) {
    checks.push({ key: 'token', label: 'Erişim anahtarı', level: 'ERROR', message: 'Kayıtlı erişim anahtarı bulunamadı. Hesabı yeniden bağlayın.' });
    status = 'NEEDS_REAUTH';
  } else {
    try {
      accessToken = fromCipherText(account.token.accessTokenEnc);
      checks.push({ key: 'token', label: 'Erişim anahtarı', level: 'OK', message: 'Erişim anahtarı çözümlendi.' });
      if (account.token.expiresAt) {
        const ms = account.token.expiresAt.getTime() - Date.now();
        if (ms <= 0) {
          checks.push({ key: 'expiry', label: 'Anahtar süresi', level: 'ERROR', message: 'Erişim anahtarının süresi dolmuş. Yeniden bağlayın.' });
          status = 'TOKEN_EXPIRED';
        } else if (ms < 24 * 3600_000) {
          checks.push({ key: 'expiry', label: 'Anahtar süresi', level: 'WARNING', message: 'Erişim anahtarının süresi 24 saat içinde dolacak.' });
        } else {
          checks.push({ key: 'expiry', label: 'Anahtar süresi', level: 'OK', message: 'Anahtar süresi yeterli.' });
        }
      }
    } catch {
      checks.push({ key: 'token', label: 'Erişim anahtarı', level: 'ERROR', message: 'Erişim anahtarı çözülemedi. Hesabı yeniden bağlayın.' });
      status = 'NEEDS_REAUTH';
      accessToken = null;
    }
  }

  // 3) Sağlayıcı tarafı doğrulama + profil erişimi
  const provider = getProvider(account.platform, { forceReal: !account.demoAccount });
  let tokenValid = account.demoAccount; // demo hesapta sağlayıcı çağrısı gereksiz
  if (!account.demoAccount && accessToken) {
    try {
      const v = await provider.validateToken(accessToken);
      tokenValid = v.valid;
      checks.push({
        key: 'provider',
        label: `${platformName} doğrulaması`,
        level: v.valid ? 'OK' : 'ERROR',
        message: v.valid ? 'Sağlayıcı anahtarı doğruladı.' : v.message || 'Sağlayıcı anahtarı geçersiz bildirdi.'
      });
      if (!v.valid) status = 'NEEDS_REAUTH';
    } catch (err) {
      tokenValid = false;
      const message = err instanceof Error ? err.message : String(err);
      checks.push({ key: 'provider', label: `${platformName} doğrulaması`, level: 'ERROR', message: 'Sağlayıcıya ulaşılamadı: kısa süre sonra tekrar denenecek.' });
      status = status === 'ACTIVE' ? 'ERROR' : status;
      checks.push({ key: 'provider-detail', label: 'Ayrıntı', level: 'WARNING', message: message.slice(0, 160) });
    }

    if (tokenValid && account.externalId) {
      try {
        const profiles = await provider.fetchAccountProfiles(accessToken);
        const match = profiles.find((p) => p.externalId === account.externalId);
        checks.push(
          match
            ? { key: 'profile', label: 'Profil erişimi', level: 'OK', message: `Profil erişilebilir (${match.displayName || match.handle}).` }
            : { key: 'profile', label: 'Profil erişimi', level: 'ERROR', message: 'Hesaba ait profil artık erişilebilir listede yok. İzinler kısılmış olabilir.' }
        );
        if (!match) status = 'PERMISSION_ERROR';
      } catch {
        checks.push({ key: 'profile', label: 'Profil erişimi', level: 'WARNING', message: 'Profil bilgisi şu an okunamadı (geçici olabilir).' });
      }
    }
  } else if (account.demoAccount) {
    checks.push({ key: 'provider', label: `${platformName} doğrulaması`, level: 'OK', message: 'Demo modu — simülasyon hesabı sağlıklı.' });
  }

  // 4) Yetenekler
  checks.push({ key: 'capabilities', label: 'Yetenekler', level: 'OK', message: 'Desteklenen içerik türleri güncellendi.' });

  const ok = checks.every((c) => c.level !== 'ERROR');
  const now = new Date();

  await prisma.socialAccount.update({
    where: { id: account.id },
    data: {
      connectionStatus: ok && status !== 'PERMISSION_ERROR' ? 'ACTIVE' : status,
      lastValidatedAt: now,
      lastSyncedAt: now,
      capabilities: capabilitySnapshot(account.platform),
      lastError: ok ? null : checks.find((c) => c.level === 'ERROR')?.message ?? null
    }
  });

  if (!ok && options.notifyOnFailure !== false) {
    // §29: hesap sessizce silinmez; Türkçe bildirimle yeniden bağlama istenir.
    await notify(account.workspaceId, {
      type: 'ACCOUNT_REAUTH',
      severity: 'WARNING',
      title: `${platformName} hesabı yeniden bağlanmalı`,
      message: `${account.displayName} (${account.handle}) hesabında sorun bulundu: ${checks.find((c) => c.level === 'ERROR')?.message ?? 'bağlantı doğrulanamadı'}`,
      actionLabel: 'Hesabı Yeniden Bağla',
      actionRoute: '/app/hesaplar'
    });
    await audit({
      workspaceId: account.workspaceId,
      userId: options.userId ?? null,
      action: 'account.health.failed',
      entityType: 'SocialAccount',
      entityId: account.id,
      metadata: { status, failed: checks.filter((c) => c.level === 'ERROR').map((c) => c.key) }
    });
  } else {
    await audit({
      workspaceId: account.workspaceId,
      userId: options.userId ?? null,
      action: 'account.health.ok',
      entityType: 'SocialAccount',
      entityId: account.id
    });
  }

  // TOKEN_EXPIRING paritesi: anahtar 24 saat içinde doluyorsa uyar (günde bir kez)
  const expiringSoon = checks.find((c) => c.key === 'expiry' && c.level === 'WARNING');
  if (ok && expiringSoon && options.notifyOnFailure !== false) {
    const recent = await prisma.notification.findFirst({
      where: {
        workspaceId: account.workspaceId,
        type: 'TOKEN_EXPIRING',
        createdAt: { gte: new Date(Date.now() - 20 * 3600_000) }
      }
    });
    if (!recent) {
      await notify(account.workspaceId, {
        type: 'TOKEN_EXPIRING',
        severity: 'WARNING',
        title: `${platformName} erişim anahtarının süresi doluyor`,
        message: `${account.displayName} (${account.handle}) hesabının erişim anahtarı 24 saat içinde dolacak. Yeniden bağlamazsanız planlanan yayınlar başarısız olur.`,
        actionLabel: 'Hesabı Yeniden Bağla',
        actionRoute: '/app/hesaplar'
      });
    }
  }

  return {
    ok,
    accountId: account.id,
    connectionStatus: ok && status !== 'PERMISSION_ERROR' ? 'ACTIVE' : status,
    checks,
    checkedAt: now.toISOString()
  };
}

/** Tüm gerçek hesapların sağlığını denetler (zamanlanmış iş için). */
export async function checkAllAccountHealth(workspaceId?: string): Promise<{ checked: number; failed: number }> {
  const accounts = await prisma.socialAccount.findMany({
    where: { demoAccount: false, connectionStatus: 'ACTIVE', ...(workspaceId ? { workspaceId } : {}) },
    select: { id: true }
  });
  let failed = 0;
  for (const a of accounts) {
    try {
      const result = await checkAccountHealth(a.id, { notifyOnFailure: true });
      if (!result.ok) failed++;
    } catch (err) {
      console.error('[AccountHealth]', a.id, err);
      failed++;
    }
  }
  return { checked: accounts.length, failed };
}
