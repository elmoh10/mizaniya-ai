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
    normalized.includes('e& cash') ||
    normalized.includes('etisalat cash')
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
  const name = normalizeArabicText(
    `${wallet.name || ''} ${wallet.nameAr || ''}`
  );

  if (
    name.includes('فودافون') ||
    name.includes('vodafone')
  ) {
    return 'vodafone';
  }

  if (
    name.includes('انستا') ||
    name.includes('instapay')
  ) {
    return 'instapay';
  }

  if (
    name.includes('اورنج') ||
    name.includes('orange')
  ) {
    return 'orange';
  }

  if (
    name.includes('اتصالات') ||
    name.includes('etisalat') ||
    name.includes('e&')
  ) {
    return 'etisalat';
  }

  if (
    name.includes('cib') ||
    name.includes('سي اي بي')
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

  const name =
    String(wallet.name || '').trim();

  const nameAr =
    String(wallet.nameAr || '').trim();

  if (name) {
    aliases.push(name);
  }

  if (nameAr) {
    aliases.push(nameAr);
  }

  const normalizedName =
    normalizeArabicText(
      `${name} ${nameAr}`
    );

  // ==========================================================
  // Vodafone Cash
  // ==========================================================

  if (
    normalizedName.includes('فودافون') ||
    normalizedName.includes('vodafone')
  ) {
    aliases.push(
      'فودافون كاش',
      'vodafone cash',
      'فودافون'
    );
  }

  // ==========================================================
  // InstaPay
  // ==========================================================

  if (
    normalizedName.includes('instapay') ||
    normalizedName.includes('انستا')
  ) {
    aliases.push(
      'انستا باي',
      'انستاباي',
      'instapay',
      'انستا'
    );
  }

  // ==========================================================
  // Orange Cash
  // ==========================================================

  if (
    normalizedName.includes('اورنج') ||
    normalizedName.includes('orange')
  ) {
    aliases.push(
      'اورنج كاش',
      'orange cash',
      'اورنج'
    );
  }

  // ==========================================================
  // Etisalat / e& Cash
  // ==========================================================

  if (
    normalizedName.includes('اتصالات') ||
    normalizedName.includes('etisalat') ||
    normalizedName.includes('e&')
  ) {
    aliases.push(
      'اتصالات كاش',
      'etisalat cash',
      'e& cash',
      'اي اند كاش'
    );
  }

  // ==========================================================
  // CIB
  // ==========================================================

  if (
    normalizedName.includes('cib') ||
    normalizedName.includes('سي اي بي')
  ) {
    aliases.push(
      'cib',
      'سي اي بي',
      'بنك cib',
      'حساب cib'
    );
  }

  // ==========================================================
  // Generic Cash
  //
  // IMPORTANT:
  // Generic "كاش" aliases are only added to a real cash wallet
  // that does NOT belong to a branded wallet such as Vodafone.
  // ==========================================================

  const walletBrand =
    detectWalletBrand(wallet);

  if (
    wallet.type === 'cash' &&
    !walletBrand
  ) {
    aliases.push(
      'كاش',
      'النقدي',
      'نقدي',
      'نقد',
      'cash'
    );
  }

  // ==========================================================
  // Generic Bank
  // ==========================================================

  if (
    wallet.type === 'bank' &&
    !walletBrand
  ) {
    aliases.push(
      'البنك',
      'حساب البنك',
      'حساب بنكي'
    );
  }

  // ==========================================================
  // Card
  // ==========================================================

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

  // ==========================================================
  // Savings
  // ==========================================================

  if (
    wallet.type === 'savings'
  ) {
    aliases.push(
      'الادخار',
      'التحويش',
      'حساب الادخار'
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
  const a =
    normalizeArabicText(source);

  const b =
    normalizeArabicText(target);

  if (!a || !b) {
    return 0;
  }

  // Exact
  if (a === b) {
    return 1;
  }

  // ==========================================================
  // Full phrase contained
  // Longer aliases receive better scores.
  // ==========================================================

  if (a.includes(b)) {
    const ratio =
      b.length / a.length;

    return Math.min(
      0.98,
      0.75 + ratio * 0.23
    );
  }

  if (b.includes(a)) {
    const ratio =
      a.length / b.length;

    return Math.min(
      0.94,
      0.70 + ratio * 0.24
    );
  }

  const sourceWords =
    a
      .split(' ')
      .filter(Boolean);

  const targetWords =
    b
      .split(' ')
      .filter(Boolean);

  if (
    sourceWords.length === 0 ||
    targetWords.length === 0
  ) {
    return 0;
  }

  let matches = 0;

  for (
    const targetWord
    of targetWords
  ) {
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

  // ==========================================================
  // Explicit branded wallets should be detected before
  // generic "من ..." extraction.
  // ==========================================================

  const brand =
    detectExplicitWalletBrand(
      normalized
    );

  if (brand === 'vodafone') {
    return 'فودافون كاش';
  }

  if (brand === 'instapay') {
    return 'انستا باي';
  }

  if (brand === 'orange') {
    return 'اورنج كاش';
  }

  if (brand === 'etisalat') {
    return 'اتصالات كاش';
  }

  if (brand === 'cib') {
    // Don't immediately return CIB here,
    // because "من دين CIB" could mean creditor, not wallet.
  }

  const patterns = [
    /(?:من|على|علي|بواسطه|باستخدام)\s+(فودافون كاش)$/,
    /(?:من|على|علي|بواسطه|باستخدام)\s+(انستا باي|انستاباي|instapay)$/,
    /(?:من|على|علي|بواسطه|باستخدام)\s+(اورنج كاش)$/,
    /(?:من|على|علي|بواسطه|باستخدام)\s+(اتصالات كاش)$/,
    /(?:من|على|علي|بواسطه|باستخدام)\s+(كاش)$/,
    /(?:من|على|علي|بواسطه|باستخدام)\s+(.+)$/,
  ];

  for (
    const pattern
    of patterns
  ) {
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
    detectExplicitWalletBrand(
      normalized
    )
  ) {
    return true;
  }

  return (
    /(?:من|على|علي|بواسطه|باستخدام)\s+(?:كاش|البنك|الفيزا|الكارت|حساب\s+\S+)/.test(
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
    await getWalletsForUser(
      userId
    );

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
    extractWalletSearchText(
      text
    );

  // ==========================================================
  // User did not specify wallet
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
  // Brand Priority
  //
  // If the message says "Vodafone Cash", branded wallets
  // automatically beat generic Cash.
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
  }

  // ==========================================================
  // Score All Wallets
  // ==========================================================

  const scored =
    wallets
      .map(
        (wallet: any) => {
          const aliases =
            getWalletAliases(
              wallet
            );

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
              score > bestScore
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
          b.score - a.score
      );

  // ==========================================================
  // No Match
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
  // One Match
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

  const best =
    scored[0];

  const second =
    scored[1];

  const difference =
    best.score -
    second.score;

  // ==========================================================
  // Strong winner
  // ==========================================================

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
  // Real Ambiguity
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
