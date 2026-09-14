// Simple in-memory mock for Prisma when native engine is unavailable (offline dev/preview).
// Covers the delegates used by the app's server components and API routes so the UI can render
// without a real database connection. All methods are workspace-isolated and return plausible demo data.

const DEMO_WORKSPACE_ID = 'demo-workspace-id';
const DEMO_USER_ID = 'demo-user-id';
const DEMO_BRAND_ID = 'demo-brand-id';
const DEMO_BRAND2_ID = 'demo-brand2-id';

const demoWorkspace = {
  id: DEMO_WORKSPACE_ID,
  name: 'Demo Ajans',
  slug: 'demo-ajans',
  plan: 'PRO',
  demoMode: true,
  timezone: 'Europe/Istanbul',
  locale: 'tr-TR',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const demoUser = {
  id: DEMO_USER_ID,
  workspaceId: DEMO_WORKSPACE_ID,
  email: 'demo@socialflow.ai',
  passwordHash: 'mock',
  name: 'Demo Kullanıcı',
  avatarUrl: null,
  role: 'OWNER',
  locale: 'tr-TR',
  timezone: 'Europe/Istanbul',
  isActive: true,
  lastLoginAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  workspace: demoWorkspace,
};

const demoBrands = [
  {
    id: DEMO_BRAND_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    name: 'Kahve Dükkanı',
    slug: 'kahve-dukkani',
    logoUrl: '/demo/logo.svg',
    primaryColor: '#6D28D9',
    secondaryColor: '#0EA5E9',
    fontStyle: 'Inter',
    website: 'https://kahvedukkani.example.com',
    defaultCta: 'Hemen Keşfet',
    description: 'Üçüncü nesil kahve dükkanı — nitelikli kahve ve samimi deneyim.',
    targetAudience: '25-40 yaş, şehirli kahve severler',
    defaultStyle: 'PROFESSIONAL',
    defaultHashtags: 'kahve nitelikkahve',
    requiredHashtags: 'kahvedukkani',
    bannedHashtags: '',
    defaultMentions: '@kahvedukkani',
    isDefault: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    voice: {
      id: 'voice-1',
      brandId: DEMO_BRAND_ID,
      tone: 'samimi, sıcak, uzman',
      personality: 'dostane ve bilgili',
      audience: 'kahve tutkunları',
      styleGuide: null,
      allowedTerms: 'filtre, espresso, kavurma',
      bannedTerms: 'ucuz, bayat',
      mustKeepTerms: 'Kahve Dükkanı',
      formality: 'NEUTRAL',
      emojiLevel: 'MEDIUM',
      language: 'tr',
      updatedAt: new Date(),
    },
    _count: { contents: 12, socialAccounts: 8 },
  },
  {
    id: DEMO_BRAND2_ID,
    workspaceId: DEMO_WORKSPACE_ID,
    name: 'Aurora Tekstil',
    slug: 'aurora-tekstil',
    logoUrl: null,
    primaryColor: '#0EA5E9',
    secondaryColor: '#6D28D9',
    fontStyle: 'Poppins',
    website: 'https://auroratekstil.example.com',
    defaultCta: 'Koleksiyonu İncele',
    description: 'Sürdürülebilir kumaşlardan premium kadın giyim.',
    targetAudience: '25-45 yaş, sürdürülebilir modayı önemseyen kadınlar',
    defaultStyle: 'PREMIUM',
    defaultHashtags: 'aurora sürdürülebilirmoda',
    requiredHashtags: 'auroratekstil',
    bannedHashtags: '',
    defaultMentions: '@auroratekstil',
    isDefault: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    voice: {
      id: 'voice-2',
      brandId: DEMO_BRAND2_ID,
      tone: 'rafine, sade, kendinden emin',
      personality: 'premium ve minimal',
      audience: 'modern kadınlar',
      styleGuide: null,
      allowedTerms: 'sürdürülebilir, premium',
      bannedTerms: 'ucuz',
      mustKeepTerms: 'Aurora',
      formality: 'FORMAL',
      emojiLevel: 'NONE',
      language: 'tr',
      updatedAt: new Date(),
    },
    _count: { contents: 4, socialAccounts: 1 },
  },
];

const demoBrandKit = {
  id: 'kit-1',
  workspaceId: DEMO_WORKSPACE_ID,
  brandId: DEMO_BRAND_ID,
  status: 'ACTIVE',
  currentVersion: 2,
  completenessScore: 84,
  lockMode: 'OFF',
  strictMode: false,
  consistencyGate: 'WARNING',
  learnFromApproved: false,
  shortName: 'KD',
  legalName: 'Kahve Dükkanı A.Ş.',
  mainSlogan: 'Her yudumda bir hikâye',
  subSlogan: 'Nitelikli kahve, samimi deneyim',
  longDescription: 'Kahve Dükkanı, üçüncü nesil kahve kültürünü samimi bir deneyimle buluşturur.',
  shortDescription: 'Nitelikli kahve ve samimi deneyim.',
  industry: 'Yiyecek & İçecek',
  subIndustry: 'Kahve',
  foundedYear: 2018,
  country: 'Türkiye',
  mainMarket: 'Türkiye',
  targetMarkets: '["TR"]',
  mainLanguage: 'tr',
  supportedLanguages: '["tr","en"]',
  phone: '+90 212 000 0000',
  email: 'info@kahvedukkani.example.com',
  whatsapp: '+90 532 000 0000',
  address: 'Kadıköy, İstanbul',
  supportLine: '+90 212 000 0000',
  workingHours: '09:00 - 22:00',
  createdAt: new Date(),
  updatedAt: new Date(),
  brand: demoBrands[0],
  logos: [
    { id: 'logo-1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', usageType: 'PRIMARY', name: 'Birincil Logo', fileUrl: '/demo/logo.svg', format: 'svg', width: 512, height: 512, transparentBg: true, isPrimary: true, approvalStatus: 'APPROVED', order: 0 },
    { id: 'logo-2', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', usageType: 'LIGHT_BG', name: 'Açık Zemin', fileUrl: '/demo/logo.svg', format: 'svg', width: 512, height: 512, transparentBg: false, isPrimary: false, approvalStatus: 'APPROVED', order: 1 },
  ],
  colors: [
    { id: 'c1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', name: 'Birincil Mor', hex: '#6D28D9', rgb: '109,40,217', cmyk: '50,82,0,15', pantone: '268 C', category: 'PRIMARY', usage: 'Başlıklar', priority: 1, prohibited: false, approvalStatus: 'APPROVED', order: 0 },
    { id: 'c2', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', name: 'İkincil Mavi', hex: '#0EA5E9', rgb: '14,165,233', category: 'SECONDARY', usage: 'Vurgu', priority: 2, prohibited: false, approvalStatus: 'APPROVED', order: 1 },
    { id: 'c3', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', name: 'Vurgu Turuncu', hex: '#F59E0B', rgb: '245,158,11', category: 'ACCENT', usage: 'CTA', priority: 3, prohibited: false, approvalStatus: 'APPROVED', order: 2 },
  ],
  typography: [
    { id: 't1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', role: 'HEADING', fontFamily: 'Inter', fontWeight: '700', approvalStatus: 'APPROVED', order: 0 },
    { id: 't2', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', role: 'BODY', fontFamily: 'Inter', fontWeight: '400', approvalStatus: 'APPROVED', order: 1 },
  ],
  messages: [
    { id: 'm1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', type: 'MAIN_SLOGAN', text: 'Her yudumda bir hikâye', language: 'tr', isPrimary: true, approvalStatus: 'APPROVED', order: 0 },
    { id: 'm2', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', type: 'VALUE_PROPOSITION', text: 'Etekten fincana izlenebilir nitelikli kahve', language: 'tr', isPrimary: false, approvalStatus: 'APPROVED', order: 1 },
  ],
  ctas: [
    { id: 'cta1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', text: 'Hemen Keşfet', platform: null, category: 'PREFERRED', isPreferred: true, approvalStatus: 'APPROVED', order: 0 },
    { id: 'cta2', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', text: 'Mağazayı Ziyaret Et', platform: 'INSTAGRAM', category: 'PREFERRED', isPreferred: false, approvalStatus: 'APPROVED', order: 1 },
  ],
  hashtags: [
    { id: 'h1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', tag: 'kahvedukkani', category: 'REQUIRED', approvalStatus: 'APPROVED', order: 0 },
    { id: 'h2', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', tag: 'nitelikkahve', category: 'DEFAULT', approvalStatus: 'APPROVED', order: 1 },
  ],
  mentions: [
    { id: 'men1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', handle: '@kahvedukkani', platform: null, type: 'OFFICIAL', label: 'Resmi hesap', required: true, approvalStatus: 'APPROVED', order: 0 },
  ],
  visualRules: [
    { id: 'v1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', category: 'PHOTOGRAPHY', title: 'Doğal ışık, sıcak ton', description: 'Stüdyo aydınlatması yumuşak, gölgeler doğal.', recommendedKeywords: '["warm","natural light","premium"]', avoidKeywords: '["harsh neon","cartoonish"]', config: '{}', approvalStatus: 'APPROVED', order: 0 },
  ],
  platformRules: [
    { id: 'pr1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', platform: 'INSTAGRAM', contentType: null, guidance: 'Görsel odaklı, kısa ve samimi.', toneOverride: null, ctaOverride: null, emojiLevel: 'MEDIUM', config: '{}', approvalStatus: 'APPROVED', order: 0 },
  ],
  legalRules: [
    { id: 'lr1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', category: 'LEGAL_INFO', key: 'KVKK_URL', value: 'https://kahvedukkani.example.com/kvkk', required: false, approvalStatus: 'APPROVED', order: 0 },
  ],
  assets: [],
  references: [
    { id: 'ref1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', kind: 'LIKED', title: 'Minimal premium kahve ambalajı', note: 'Sade, premium his.', fileUrl: null, approvalStatus: 'APPROVED', order: 0 },
  ],
  memories: [],
};

function matchesWhere(item: any, where: any): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // handle { contains: 'x' } or { in: [...] }
      if ('contains' in (v as any)) {
        if (!String(item[k] ?? '').toLowerCase().includes(String((v as any).contains).toLowerCase())) return false;
      } else if ('in' in (v as any)) {
        if (!(v as any).in.includes(item[k])) return false;
      } else if ('equals' in (v as any)) {
        if (item[k] !== (v as any).equals) return false;
      }
    } else {
      if (item[k] !== v) return false;
    }
  }
  return true;
}

function createDelegate(name: string, store: any[]) {
  return {
    findFirst: async (args: any = {}) => {
      const where = args.where ?? {};
      // handle OR
      if (where.OR) {
        for (const item of store) {
          for (const cond of where.OR) if (matchesWhere(item, cond)) return item;
        }
        return null;
      }
      // nested where like { brandId, workspaceId }
      // also handle { id, workspaceId }
      const found = store.find((it) => matchesWhere(it, where));
      if (found) return found;
      // for brandKit: need to handle findFirst with brandId + workspaceId
      if (name === 'brandKit' && where.brandId) {
        if (where.brandId === DEMO_BRAND_ID || where.brandId === demoBrands[0].id) return demoBrandKit;
        if (where.brandId === DEMO_BRAND2_ID) return null;
      }
      if (name === 'user' && where.email) {
        if (where.email === 'demo@socialflow.ai' || where.email === 'DEMO@socialflow.ai') return demoUser;
        return null;
      }
      if (name === 'workspace' && where.id === DEMO_WORKSPACE_ID) return demoWorkspace;
      return null;
    },
    findUnique: async (args: any = {}) => {
      const where = args.where ?? {};
      if (where.id) return store.find((i) => i.id === where.id) ?? (where.id === DEMO_BRAND_ID ? demoBrands[0] : null);
      if (where.brandId) {
        if (where.brandId === DEMO_BRAND_ID) return demoBrandKit;
      }
      if (where.workspaceId) {
        if (where.workspaceId === DEMO_WORKSPACE_ID && name === 'appSettings') return null;
      }
      return null;
    },
    findMany: async (args: any = {}) => {
      const where = args.where ?? {};
      if (name === 'brand' && where.workspaceId === DEMO_WORKSPACE_ID) return demoBrands;
      if (name === 'brand' && !where.workspaceId) return demoBrands;
      if (name === 'socialAccount') return [
        { id: 'acc-ig', workspaceId: DEMO_WORKSPACE_ID, platform: 'INSTAGRAM', handle: '@kahvedukkani', displayName: 'Kahve Dükkanı', connectionStatus: 'ACTIVE', demoAccount: true, avatarUrl: null, brandId: DEMO_BRAND_ID, accountType: 'BUSINESS' },
        { id: 'acc-fb', workspaceId: DEMO_WORKSPACE_ID, platform: 'FACEBOOK', handle: 'Kahve Dükkanı', displayName: 'Kahve Dükkanı', connectionStatus: 'ACTIVE', demoAccount: true, avatarUrl: null, brandId: DEMO_BRAND_ID, accountType: 'PAGE' },
        { id: 'acc-x', workspaceId: DEMO_WORKSPACE_ID, platform: 'X', handle: '@kahvedukkani', displayName: 'Kahve Dükkanı', connectionStatus: 'ACTIVE', demoAccount: true, avatarUrl: null, brandId: DEMO_BRAND_ID, accountType: 'PROFILE' },
      ];
      if (name === 'mediaAsset') return [
        { id: 'media-1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, kind: 'IMAGE', filename: 'demo-1.jpg', originalName: 'demo.jpg', storageKey: 'demo/demo-1-square.jpg', publicUrl: '/api/media/file/demo/demo-1-square.jpg', mimeType: 'image/jpeg', format: 'jpg', bytes: 120000, width: 1600, height: 1600, status: 'READY', createdAt: new Date() },
      ];
      if (name === 'content') return [];
      if (name === 'platformContent') return [];
      if (name === 'hashtagEntry') return [{ id: 'he1', workspaceId: DEMO_WORKSPACE_ID, tag: 'kahve', group: 'GENERAL' }];
      if (name === 'campaign') return [{ id: 'camp1', workspaceId: DEMO_WORKSPACE_ID, name: 'Yeni Sezon', code: 'YENI-SEZON-2026' }];
      if (name === 'notification') return [];
      if (name === 'analyticsSnapshot') return [];
      if (name === 'platformRule') return [];
      if (name === 'providerIntegration') return [
        { id: 'pi-ig', workspaceId: DEMO_WORKSPACE_ID, platform: 'INSTAGRAM', status: 'NOT_CONFIGURED', credentialsSet: false, message: 'Demo Modu' },
      ];
      if (name === 'appSettings') return [];
      // brandKit collections
      if (['brandLogo', 'brandColor', 'brandTypography', 'brandMessage', 'brandCTA', 'brandHashtag', 'brandMention', 'brandVisualRule', 'brandPlatformRule', 'brandLegalRule', 'brandAsset', 'brandReference', 'brandMemory', 'brandKitVersion'].includes(name)) {
        // return related array from demoBrandKit
        const map: Record<string, any> = {
          brandLogo: demoBrandKit.logos,
          brandColor: demoBrandKit.colors,
          brandTypography: demoBrandKit.typography,
          brandMessage: demoBrandKit.messages,
          brandCTA: demoBrandKit.ctas,
          brandHashtag: demoBrandKit.hashtags,
          brandMention: demoBrandKit.mentions,
          brandVisualRule: demoBrandKit.visualRules,
          brandPlatformRule: demoBrandKit.platformRules,
          brandLegalRule: demoBrandKit.legalRules,
          brandAsset: demoBrandKit.assets,
          brandReference: demoBrandKit.references,
          brandMemory: demoBrandKit.memories,
          brandKitVersion: [{ id: 'ver-1', version: 2, label: 'v2', note: 'Sonbahar güncellemesi', createdAt: new Date(), createdBy: DEMO_USER_ID }],
        };
        let arr = map[name] ?? [];
        if (where.brandKitId) arr = arr.filter((x: any) => x.brandKitId === where.brandKitId);
        if (where.brandId) arr = arr.filter((x: any) => x.brandId === where.brandId);
        if (where.workspaceId) arr = arr.filter((x: any) => x.workspaceId === where.workspaceId);
        return arr;
      }
      // generic filter
      if (where.workspaceId) return store.filter((i) => i.workspaceId === where.workspaceId);
      return store;
    },
    count: async (args: any = {}) => {
      const items: any[] = await (createDelegate(name, store).findMany as any)(args);
      return Array.isArray(items) ? items.length : 0;
    },
    findUniqueOrThrow: async (args: any = {}) => {
      const found = await (createDelegate(name, store).findUnique as any)(args);
      if (found) return found;
      // for brandKit findUniqueOrThrow with where: { brandId } — return mock if matches
      if (name === 'brandKit' && args.where?.brandId === DEMO_BRAND_ID) return demoBrandKit;
      throw new Error(`Mock not found for ${name} findUniqueOrThrow`);
    },
    findFirstOrThrow: async (args: any = {}) => {
      const found = await (createDelegate(name, store).findFirst as any)(args);
      if (found) return found;
      throw new Error(`Mock not found for ${name} findFirstOrThrow`);
    },
    create: async (args: any = {}) => {
      const data = args.data ?? {};
      const item = { id: `mock-${Date.now()}`, ...data, createdAt: new Date(), updatedAt: new Date() };
      store.push(item);
      return item;
    },
    createMany: async (args: any = {}) => ({ count: (args.data ?? []).length }),
    update: async (args: any = {}) => {
      const idx = store.findIndex((i) => i.id === args.where?.id);
      if (idx >= 0) {
        store[idx] = { ...store[idx], ...args.data, updatedAt: new Date() };
        return store[idx];
      }
      return { id: args.where?.id ?? 'mock', ...args.data };
    },
    updateMany: async () => ({ count: 0 }),
    upsert: async (args: any = {}) => {
      const existing = store.find((i) => i.id === args.where?.id || i.brandId === args.where?.brandId);
      if (existing) return { ...existing, ...args.update };
      const created = { id: `mock-${Date.now()}`, ...args.create };
      store.push(created);
      return created;
    },
    delete: async (args: any = {}) => {
      const idx = store.findIndex((i) => i.id === args.where?.id);
      if (idx >= 0) store.splice(idx, 1);
      return { id: args.where?.id };
    },
    deleteMany: async () => ({ count: 0 }),
  };
}

const stores: Record<string, any[]> = {
  user: [demoUser],
  workspace: [demoWorkspace],
  brand: demoBrands as any,
  brandVoice: demoBrands.map((b) => b.voice).filter(Boolean) as any,
  brandKit: [demoBrandKit] as any,
  brandLogo: demoBrandKit.logos as any,
  brandColor: demoBrandKit.colors as any,
  brandTypography: demoBrandKit.typography as any,
  brandMessage: demoBrandKit.messages as any,
  brandCTA: demoBrandKit.ctas as any,
  brandHashtag: demoBrandKit.hashtags as any,
  brandMention: demoBrandKit.mentions as any,
  brandVisualRule: demoBrandKit.visualRules as any,
  brandPlatformRule: demoBrandKit.platformRules as any,
  brandLegalRule: demoBrandKit.legalRules as any,
  brandAsset: demoBrandKit.assets as any,
  brandReference: demoBrandKit.references as any,
  brandMemory: demoBrandKit.memories as any,
  brandKitVersion: [{ id: 'ver-2', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', version: 2, label: 'v2', note: 'Demo sürüm', snapshot: '{}', createdBy: DEMO_USER_ID, createdAt: new Date() }, { id: 'ver-1', workspaceId: DEMO_WORKSPACE_ID, brandId: DEMO_BRAND_ID, brandKitId: 'kit-1', version: 1, label: 'v1', note: 'İlk sürüm', snapshot: '{}', createdBy: DEMO_USER_ID, createdAt: new Date(Date.now() - 86400000) }] as any,
  session: [] as any,
  socialAccount: [] as any,
  mediaAsset: [] as any,
  content: [] as any,
  platformContent: [] as any,
  schedule: [] as any,
  publication: [] as any,
  platformRule: [] as any,
  hashtagSet: [] as any,
  hashtagEntry: [] as any,
  savedMention: [] as any,
  campaign: [] as any,
  notification: [] as any,
  analyticsSnapshot: [] as any,
  auditLog: [] as any,
  job: [] as any,
  appSettings: [] as any,
  providerIntegration: [] as any,
};

export function createMockPrisma(): any {
  const handler: ProxyHandler<any> = {
    get(target: any, prop: string) {
      if (prop === '$transaction') return async (ops: any) => {
        if (Array.isArray(ops)) return Promise.all(ops.map((p: any) => (p instanceof Promise ? p : Promise.resolve(p))));
        if (typeof ops === 'function') return ops(createMockPrisma());
        return ops;
      };
      if (prop === '$queryRaw' || prop === '$executeRaw' || prop === '$queryRawUnsafe') return async () => [];
      if (prop === '$connect' || prop === '$disconnect') return async () => {};
      if (prop in target) return target[prop];
      // delegate
      if (prop in stores || /^[a-z]/.test(prop)) {
        const store = (stores as any)[prop] ?? [];
        return createDelegate(prop, store);
      }
      return undefined;
    },
  };
  return new Proxy({}, handler);
}

export const mockPrisma = createMockPrisma();
export { DEMO_WORKSPACE_ID, DEMO_USER_ID, DEMO_BRAND_ID, DEMO_BRAND2_ID };
