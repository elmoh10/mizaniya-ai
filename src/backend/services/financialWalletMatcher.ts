import { getWalletsForUser } from './walletService';

// ============================================================
// Types
// ============================================================

export interface WalletMatchResult {
  wallet: any | null;
  wallets: any[];
  confidence: number;
  searchText: string;
  ambiguous: boolean;
}

// ============================================================
// Arabic Normalization
// ============================================================

function normalizeArabicText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/[؟?!،,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ============================================================
// Known Wallet Brands
// ============================================================

function detectExplicitWalletBrand(
  text: string
): string | null {
  const normalized = normalizeArabicText(text);

  if (
    normalized.includes('فودافون كاش') ||
    normalized.includes('vodafone cash')
  ) {
    return 'vodafone';
  }

  if (
    normalized.includes('انستا باي') ||
    normalized.includes('انستاباي') ||
    normalized.includes('instapay')
  ) {
    return 'instapay';
  }

  if (
    normalized.includes('اورنج كاش') ||
    normalized.includes('orange cash')
  ) {
    return 'orange';
  }

  if (
    normalized.includes('اتصالات كاش') ||
    normalized.includes('etisalat cash') ||
    normalized.includes('e& cash')
  ) {
    return 'etisalat';
  }

  if (
    normalized.includes('cib') ||
    normalized.includes('سي اي بي')
  ) {
    return 'cib';
  }

  return null;
}

// ============================================================
// Detect Wallet Brand From Wallet
// ============================================================

function detectWalletBrand(
  wallet: any
): string | null {
  const normalized = normalizeArabicText(
    `${wallet.name || ''} ${wallet.nameAr || ''}`
  );

  if (
    normalized.includes('فودافون') ||
    normalized.includes('vodafone')
  ) {
    return 'vodafone';
  }

  if (
    normalized.includes('انستا') ||
    normalized.includes('instapay')
  ) {
    return 'instapay';
  }

  if (
    normalized.includes('اورنج') ||
    normalized.includes('orange')
  ) {
    return 'orange';
  }

  if (
    normalized.includes('اتصالات') ||
    normalized.includes('etisalat') ||
    normalized.includes('e&')
  ) {
    return 'etisalat';
  }

  if (
    normalized.includes('cib') ||
    normalized.includes('سي اي بي')
  ) {
    return 'cib';
  }

  return null;
}

// ============================================================
// Wallet Aliases
// ============================================================

function getWalletAliases(wallet: any): string[] {
  const aliases: string[] = [];

  const name = String(wallet.name || '').trim();
  const nameAr = String(wallet.nameAr || '').trim();

  if (name) aliases.push(name);
  if (nameAr) aliases.push(nameAr);

  const normalizedName = normalizeArabicText(
    `${name} ${nameAr}`
  );

  const brand = detectWalletBrand(wallet);

  // Vodafone
  if (brand === 'vodafone') {
    aliases.push(
      'فودافون كاش',
      'فودافون',
      'vodafone cash',
      'vodafone'
    );
  }

  // InstaPay
  if (brand === 'instapay') {
    aliases.push(
      'انستا باي',
      'انستاباي',
      'انستا',
      'instapay'
    );
  }

  // Orange Cash
  if (brand === 'orange') {
    aliases.push(
      'اورنج كاش',
      'اورنج',
      'orange cash',
      'orange'
    );
  }

  // Etisalat / e&
  if (brand === 'etisalat') {
    aliases.push(
      'اتصالات كاش',
      'اتصالات',
      'etisalat cash',
      'etisalat',
      'e& cash'
    );
  }

  // CIB
  if (brand === 'cib') {
    aliases.push(
      'cib',
      'سي اي بي',
      'بنك cib',
      'حساب cib'
    );
  }

  // Generic Cash
  // Important: don't add generic cash aliases to branded wallets.
  if (
    wallet.type === 'cash' &&
    !brand
  ) {
    aliases.push(
      'كاش',
      'نقدي',
      'نقد',
      'cash'
    );
  }

  // Generic Bank
  if (
    wallet.type === 'bank' &&
    !brand
  ) {
    aliases.push(
      'البنك',
      'حساب البنك',
      'حساب بنكي'
    );
  }

  // Card / Credit
  if (
    wallet.type === 'card' ||
    wallet.type === 'credit'
  ) {
    aliases.push(
      'الفيزا',
      'فيزا',
      'الكارت',
      'الكريدت',
      'credit card'
    );
  }

  // Savings
  if (wallet.type === 'savings') {
    aliases.push(
      'الادخار',
      'التحويش',
      'حساب الادخار'
    );
  }

  // Generic wallet name support
  if (
    normalizedName.includes('محفظه') ||
    normalizedName.includes('محفظتي')
  ) {
    aliases.push(
      name,
      nameAr
    );
  }

  return Array.from(
    new Set(
      aliases
        .map(normalizeArabicText)
        .filter(Boolean)
    )
  );
}

// ============================================================
// Similarity
// ============================================================

function calculateScore(
  source: string,
  target: string
): number {
  const a = normalizeArabicText(source);
  const b = normalizeArabicText(target);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 1;
  }

  if (a.includes(b)) {
    const ratio = b.length / a.length;

    return Math.min(
      0.98,
      0.75 + ratio * 0.23
    );
  }

  if (b.includes(a)) {
    const ratio = a.length / b.length;

    return Math.min(
      0.94,
      0.70 + ratio * 0.24
    );
  }

  const sourceWords = a
    .split(' ')
    .filter(Boolean);

  const targetWords = b
    .split(' ')
    .filter(Boolean);

  if (
    sourceWords.length === 0 ||
    targetWords.length === 0
  ) {
    return 0;
  }

  let matches = 0;

  for (const targetWord of targetWords) {
    if (
      sourceWords.some(
        (sourceWord) =>
          sourceWord === targetWord
      )
    ) {
      matches++;
    }
  }

  const wordRatio =
    matches /
    Math.max(
      sourceWords.length,
      targetWords.length
    );

  return wordRatio * 0.8;
}

// ============================================================
// Extract Wallet Phrase
// ============================================================

export function extractWalletSearchText(
  text: string
): string {
  const normalized =
    normalizeArabicText(text);

  // Explicit brands first
  if (
    normalized.includes('فودافون كاش')
  ) {
    return 'فودافون كاش';
  }

  if (
    normalized.includes('انستا باي') ||
    normalized.includes('انستاباي')
  ) {
    return 'انستا باي';
  }

  if (
    normalized.includes('اورنج كاش')
  ) {
    return 'اورنج كاش';
  }

  if (
    normalized.includes('اتصالات كاش')
  ) {
    return 'اتصالات كاش';
  }

  const patterns = [
    /(?:من|على|علي|بواسطه|باستخدام)\s+(كاش)$/,
    /(?:من|على|علي|بواسطه|باستخدام)\s+(محفظتي)$/,
    /(?:من|على|علي|بواسطه|باستخدام)\s+(.+)$/,
  ];

  for (const pattern of patterns) {
    const match =
      normalized.match(pattern);

    if (
      match &&
      match[1]
    ) {
      return match[1].trim();
    }
  }

  return '';
}

// ============================================================
// Explicit Wallet Reference
// ============================================================

export function hasExplicitWalletReference(
  text: string
): boolean {
  const normalized =
    normalizeArabicText(text);

  if (
    normalized.includes('فودافون كاش') ||
    normalized.includes('انستا باي') ||
    normalized.includes('انستاباي') ||
    normalized.includes('اورنج كاش') ||
    normalized.includes('اتصالات كاش')
  ) {
    return true;
  }

  return (
    /(?:من|على|علي|بواسطه|باستخدام)\s+(?:كاش|محفظتي|البنك|الفيزا|الكارت|حساب\s+\S+)/.test(
      normalized
    )
  );
}

// ============================================================
// Wallet Matcher
// ============================================================

export async function matchWalletForUser(
  userId: string,
  text: string
): Promise<WalletMatchResult> {
  const wallets =
    await getWalletsForUser(userId);

  if (!wallets.length) {
    return {
      wallet: null,
      wallets: [],
      confidence: 0,
      searchText: '',
      ambiguous: false,
    };
  }

  const searchText =
    extractWalletSearchText(text);

  // ==========================================================
  // No explicit wallet mentioned
  // ==========================================================

  if (!searchText) {
    const primary =
      wallets.find(
        (wallet: any) =>
          wallet.isPrimary === true
      ) ||
      wallets[0];

    return {
      wallet: primary,
      wallets: [primary],
      confidence: 0.5,
      searchText: '',
      ambiguous: false,
    };
  }

  // ==========================================================
  // Explicit Brand Handling
  // ==========================================================

  const explicitBrand =
    detectExplicitWalletBrand(
      searchText
    );

  if (explicitBrand) {
    const brandedWallets =
      wallets.filter(
        (wallet: any) =>
          detectWalletBrand(wallet) ===
          explicitBrand
      );

    // Exact brand exists
    if (
      brandedWallets.length === 1
    ) {
      return {
        wallet:
          brandedWallets[0],
        wallets:
          brandedWallets,
        confidence: 1,
        searchText,
        ambiguous: false,
      };
    }

    // Multiple wallets same brand
    if (
      brandedWallets.length > 1
    ) {
      return {
        wallet: null,
        wallets:
          brandedWallets,
        confidence: 1,
        searchText,
        ambiguous: true,
      };
    }

    // IMPORTANT:
    // User explicitly mentioned a branded wallet,
    // but no such wallet exists.
    // Do NOT fuzzy match "Vodafone Cash" with generic "Cash".
    return {
      wallet: null,
      wallets: [],
      confidence: 0,
      searchText,
      ambiguous: false,
    };
  }

  // ==========================================================
  // Score wallets
  // ==========================================================

  const scored =
    wallets
      .map(
        (wallet: any) => {
          const aliases =
            getWalletAliases(wallet);

          let bestScore = 0;

          for (
            const alias
            of aliases
          ) {
            const score =
              calculateScore(
                searchText,
                alias
              );

            if (
              score >
              bestScore
            ) {
              bestScore =
                score;
            }
          }

          return {
            wallet,
            score:
              bestScore,
          };
        }
      )
      .filter(
        (item) =>
          item.score >= 0.55
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  // ==========================================================
  // No match
  // ==========================================================

  if (!scored.length) {
    return {
      wallet: null,
      wallets: [],
      confidence: 0,
      searchText,
      ambiguous: false,
    };
  }

  // ==========================================================
  // One match
  // ==========================================================

  if (
    scored.length === 1
  ) {
    return {
      wallet:
        scored[0].wallet,
      wallets: [
        scored[0].wallet,
      ],
      confidence:
        scored[0].score,
      searchText,
      ambiguous: false,
    };
  }

  // ==========================================================
  // Multiple matches
  // ==========================================================

  const best =
    scored[0];

  const second =
    scored[1];

  const difference =
    best.score -
    second.score;

  if (
    best.score >= 0.9 &&
    difference >= 0.1
  ) {
    return {
      wallet:
        best.wallet,
      wallets:
        scored.map(
          (item) =>
            item.wallet
        ),
      confidence:
        best.score,
      searchText,
      ambiguous: false,
    };
  }

  if (
    difference >= 0.18
  ) {
    return {
      wallet:
        best.wallet,
      wallets:
        scored.map(
          (item) =>
            item.wallet
        ),
      confidence:
        best.score,
      searchText,
      ambiguous: false,
    };
  }

  // ==========================================================
  // True ambiguity
  // ==========================================================

  return {
    wallet: null,
    wallets:
      scored.map(
        (item) =>
          item.wallet
      ),
    confidence:
      best.score,
    searchText,
    ambiguous: true,
  };
}
