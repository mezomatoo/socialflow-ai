import prisma from '@/lib/prisma';
import { fromCipherText } from '@/lib/crypto';
import type { PlatformCode } from '@/lib/platforms/platforms';

export type ExternalMediaType = 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'TEXT';

export interface ExternalPost {
  id: string;
  provider: string;
  externalId: string;
  caption: string;
  mediaType: ExternalMediaType;
  mediaUrls: string[];
  thumbnailUrl?: string | null;
  permalink: string;
  publishedAt: string;
  likes: number;
  comments: number;
  shares: number;
  hasCopyrightedAudio?: boolean;
  hasBrandedContentTag?: boolean;
  videoDurationSeconds?: number;
  aspectRatio?: string;
}

export interface AdEligibilityResult {
  eligible: boolean;
  reason: string;
  code: 'ELIGIBLE' | 'COPYRIGHTED_AUDIO' | 'INVALID_DURATION' | 'BRANDED_CONTENT' | 'MISSING_MEDIA' | 'RESOLUTION_TOO_LOW';
  recommendedPlacements: string[];
  warnings: string[];
}

/**
 * Evaluates whether an existing organic post is eligible to be turned into an ad / boosted post.
 */
export function checkAdEligibility(post: ExternalPost, targetProvider = 'META'): AdEligibilityResult {
  const warnings: string[] = [];

  // 1. Copyrighted Audio / Music restrictions
  if (post.hasCopyrightedAudio) {
    return {
      eligible: false,
      code: 'COPYRIGHTED_AUDIO',
      reason: 'Gönderide telifli müzik veya lisanslı ticari olmayan ses kullanıldığı için resmî reklam politikaları gereği reklama dönüştürülemez.',
      recommendedPlacements: [],
      warnings
    };
  }

  // 2. Missing Media for image/video platforms
  if (post.mediaType === 'TEXT' && (targetProvider === 'META' || targetProvider === 'TIKTOK')) {
    return {
      eligible: false,
      code: 'MISSING_MEDIA',
      reason: 'Instagram, Facebook ve TikTok reklamları için en az bir görsel veya video varlığı zorunludur.',
      recommendedPlacements: [],
      warnings
    };
  }

  // 3. Branded Content / Paid Partnership tags
  if (post.hasBrandedContentTag) {
    warnings.push('Bu gönderi ücretli ortaklık etiketi içeriyor; reklamveren ortağınızın onay vermesi gerekebilir.');
  }

  // 4. Video duration limitations
  if (post.mediaType === 'VIDEO' && post.videoDurationSeconds !== undefined) {
    if (post.videoDurationSeconds > 120) {
      return {
        eligible: false,
        code: 'INVALID_DURATION',
        reason: `Video süresi (${Math.round(post.videoDurationSeconds)} sn) Reels/Hikaye reklam sınırlarını aşıyor (maksimum 120 sn).`,
        recommendedPlacements: [],
        warnings
      };
    }
    if (post.videoDurationSeconds < 3) {
      return {
        eligible: false,
        code: 'INVALID_DURATION',
        reason: 'Video süresi 3 saniyenin altında olduğu için reklam gösterimi yapılamaz.',
        recommendedPlacements: [],
        warnings
      };
    }
  }

  // Determine recommended placements
  const recommendedPlacements: string[] = [];
  if (post.mediaType === 'VIDEO') {
    recommendedPlacements.push('REELS', 'STORY', 'FEED_VIDEO');
  } else if (post.mediaType === 'CAROUSEL') {
    recommendedPlacements.push('FEED_CAROUSEL');
  } else if (post.mediaType === 'IMAGE') {
    recommendedPlacements.push('FEED', 'STORY');
  } else {
    recommendedPlacements.push('FEED');
  }

  return {
    eligible: true,
    code: 'ELIGIBLE',
    reason: 'Gönderi reklam tanıtımı için tamamen uygundur.',
    recommendedPlacements,
    warnings
  };
}

/**
 * Fetch recent organic published posts from the official provider API for a given SocialAccount.
 */
export async function fetchExistingOrganicPosts(
  socialAccountId: string,
  options: { limit?: number; workspaceId?: string } = {}
): Promise<Array<ExternalPost & { eligibility: AdEligibilityResult }>> {
  const account = await prisma.socialAccount.findFirst({
    where: {
      id: socialAccountId,
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {})
    },
    include: { token: true }
  });

  if (!account || !account.token || !account.externalId) {
    return [];
  }

  let accessToken = '';
  try {
    accessToken = fromCipherText(account.token.accessTokenEnc);
  } catch {
    return [];
  }

  const limit = options.limit || 15;
  const platform = account.platform as PlatformCode;
  const rawPosts: ExternalPost[] = [];

  try {
    if (platform === 'INSTAGRAM') {
      const url = `https://graph.facebook.com/v21.0/${account.externalId}/media?fields=id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,is_commercial&limit=${limit}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        const data = Array.isArray(json?.data) ? json.data : [];

        for (const item of data) {
          const isVideo = item.media_type === 'VIDEO';
          const isCarousel = item.media_type === 'CAROUSEL_ALBUM';

          rawPosts.push({
            id: `ig_${item.id}`,
            provider: 'META',
            externalId: String(item.id),
            caption: item.caption || '',
            mediaType: isVideo ? 'VIDEO' : isCarousel ? 'CAROUSEL' : 'IMAGE',
            mediaUrls: item.media_url ? [item.media_url] : [],
            thumbnailUrl: item.thumbnail_url || item.media_url || null,
            permalink: item.permalink || `https://instagram.com/p/${item.id}`,
            publishedAt: item.timestamp || new Date().toISOString(),
            likes: Number(item.like_count || 0),
            comments: Number(item.comments_count || 0),
            shares: 0,
            hasCopyrightedAudio: false,
            hasBrandedContentTag: Boolean(item.is_commercial)
          });
        }
      }
    } else if (platform === 'FACEBOOK') {
      const url = `https://graph.facebook.com/v21.0/${account.externalId}/published_posts?fields=id,message,attachments{media,type,url},permalink_url,created_time,shares&limit=${limit}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        const data = Array.isArray(json?.data) ? json.data : [];

        for (const item of data) {
          const attachment = item.attachments?.data?.[0];
          const mediaUrl = attachment?.media?.image?.src || attachment?.url || null;

          rawPosts.push({
            id: `fb_${item.id}`,
            provider: 'META',
            externalId: String(item.id),
            caption: item.message || '',
            mediaType: attachment?.type?.includes('video') ? 'VIDEO' : mediaUrl ? 'IMAGE' : 'TEXT',
            mediaUrls: mediaUrl ? [mediaUrl] : [],
            thumbnailUrl: mediaUrl,
            permalink: item.permalink_url || `https://facebook.com/${item.id}`,
            publishedAt: item.created_time || new Date().toISOString(),
            likes: 0,
            comments: 0,
            shares: Number(item.shares?.count || 0)
          });
        }
      }
    } else if (platform === 'X') {
      const url = `https://api.x.com/2/users/${account.externalId}/tweets?tweet.fields=created_at,public_metrics,attachments&expansions=attachments.media_keys&media.fields=url,preview_image_url,type&max_results=${Math.min(limit, 100)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000)
      }).catch(() => null);

      if (res && res.ok) {
        const json = await res.json().catch(() => null);
        const data = Array.isArray(json?.data) ? json.data : [];
        const mediaMap = new Map<string, any>();
        if (Array.isArray(json?.includes?.media)) {
          for (const m of json.includes.media) {
            mediaMap.set(m.media_key, m);
          }
        }

        for (const item of data) {
          const mediaKeys = item.attachments?.media_keys || [];
          const firstMedia = mediaKeys.length > 0 ? mediaMap.get(mediaKeys[0]) : null;
          const mediaUrl = firstMedia?.url || firstMedia?.preview_image_url || null;

          rawPosts.push({
            id: `x_${item.id}`,
            provider: 'X',
            externalId: String(item.id),
            caption: item.text || '',
            mediaType: firstMedia?.type === 'video' ? 'VIDEO' : mediaUrl ? 'IMAGE' : 'TEXT',
            mediaUrls: mediaUrl ? [mediaUrl] : [],
            thumbnailUrl: mediaUrl,
            permalink: `https://x.com/i/status/${item.id}`,
            publishedAt: item.created_at || new Date().toISOString(),
            likes: Number(item.public_metrics?.like_count || 0),
            comments: Number(item.public_metrics?.reply_count || 0),
            shares: Number(item.public_metrics?.retweet_count || 0)
          });
        }
      }
    }
  } catch (err) {
    console.error(`[fetchExistingOrganicPosts] Error fetching posts for ${account.platform}:`, err);
  }

  // Attach eligibility analysis to each post
  return rawPosts.map(post => ({
    ...post,
    eligibility: checkAdEligibility(post, post.provider)
  }));
}
