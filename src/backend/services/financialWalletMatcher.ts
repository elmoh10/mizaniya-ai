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

  // Cash
  if (
    normalizedName.includes('كاش') ||
    wallet.type === 'cash'
  ) {
    aliases.push(
      'كاش',
      'نقدي',
      'نقد',
      'cash'
    );
  }

  // Vodafone Cash
  if (
    normalizedName.includes('فودافون')
  ) {
    aliases.push(
      'فودافون كاش',
      'vodafone cash',
      'فودافون'
    );
  }

  // InstaPay
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

  // CIB
  if (
    normalizedName.includes('cib')
  ) {
    aliases.push(
      'cib',
      'سي اي بي',
      'بنك cib'
    );
  }

  // Bank
  if (wallet.type === 'bank') {
    aliases.push(
      'البنك',
      'حساب البنك',
      'حساب بنكي'
    );
  }

  // Card
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

  if (
    a.includes(b) ||
    b.includes(a)
  ) {
    return 0.95;
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
          sourceWord === targetWord ||
          sourceWord.includes(targetWord) ||
          targetWord.includes(sourceWord)
      )
    ) {
      matches++;
    }
  }

  return (
    matches /
    Math.max(
      sourceWords.length,
      targetWords.length
    )
  );
}

// ============================================================
// Extract Wallet Phrase
// ============================================================

export function extractWalletSearchText(
  text: string
): string {
  const normalized =
    normalizeArabicText(text);

  const patterns = [
    /من\s+(.+)$/,
    /على\s+(.+)$/,
    /علي\s+(.+)$/,
    /بواسطة\s+(.+)$/,
    /باستخدام\s+(.+)$/,
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
// Detect explicit wallet intent
// ============================================================

export function hasExplicitWalletReference(
  text: string
): boolean {
  const normalized =
    normalizeArabicText(text);

  return (
    normalized.includes(' من ') ||
    normalized.includes(' علي ') ||
    normalized.includes(' على ') ||
    normalized.includes('بواسطه') ||
    normalized.includes('باستخدام')
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
  // No wallet explicitly mentioned
  // ==========================================================

  if (!searchText) {
    const primary =
      wallets.find(
        (wallet: any) =>
          wallet.isPrimary === true
      ) || wallets[0];

    return {
      wallet: primary,
      wallets: [primary],
      confidence: 0.5,
      searchText: '',
      ambiguous: false,
    };
  }

  // ==========================================================
  // Score wallets
  // ==========================================================

  const scored =
    wallets
      .map((wallet: any) => {
        const aliases =
          getWalletAliases(wallet);

        let bestScore = 0;

        for (const alias of aliases) {
          const score =
            calculateScore(
              searchText,
              alias
            );

          if (score > bestScore) {
            bestScore = score;
          }
        }

        return {
          wallet,
          score: bestScore,
        };
      })
      .filter(
        (item) =>
          item.score >= 0.5
      )
      .sort(
        (a, b) =>
          b.score - a.score
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

  if (scored.length === 1) {
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

  if (difference >= 0.2) {
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
