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
  return String(text || '')
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
// Canonical wallet phrase
//
// Makes natural Arabic references such as "الكاش" match a wallet
// literally named "كاش", and also repairs matching for legacy wallet
// names that accidentally included an opening-balance phrase.
// ============================================================

function canonicalWalletPhrase(text: string): string {
  let value = normalizeArabicText(text);

  // Remove accidental legacy suffixes such as:
  // "فودافون كاش ورصيدها 1000 جنيه" -> "فودافون كاش"
  value = value
    .replace(/\s+(?:و\s*)?(?:رصيدها|رصيده|برصيد|رصيد)\s*[:：-]?\s*\d+(?:[.,]\d+)?(?:\s*(?:جنيه|جنيهات|egp|usd|sar|eur))?.*$/i, '')
    .trim();

  // Arabic definite article: "الكاش" -> "كاش".
  // Keep this narrowly scoped to the beginning of the phrase.
  if (value.startsWith('ال') && value.length > 3) {
    value = value.slice(2).trim();
  }

  return value;
}

// ============================================================
// Unique normalized strings
// ============================================================

function uniqueNormalized(values: string[]): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => normalizeArabicText(value))
        .filter(Boolean)
    )
  );
}

// ============================================================
// Explicit Wallet Names
//
// IMPORTANT:
// These are the real names of the wallet.
// They must always have priority over generic aliases.
// ============================================================

function getWalletExplicitNames(wallet: any): string[] {
  const names: string[] = [];

  const name = String(wallet?.name || '').trim();
  const nameAr = String(wallet?.nameAr || '').trim();

  if (name) {
    names.push(name);
    names.push(canonicalWalletPhrase(name));
  }

  if (nameAr) {
    names.push(nameAr);
    names.push(canonicalWalletPhrase(nameAr));
  }

  return uniqueNormalized(names);
}

// ============================================================
// Generic Wallet Aliases
//
// These aliases describe wallet TYPE / provider.
// They are weaker than the actual wallet name.
// ============================================================

function getWalletGenericAliases(wallet: any): string[] {
  const aliases: string[] = [];

  const name = String(wallet?.name || '');
  const nameAr = String(wallet?.nameAr || '');

  const normalizedName = normalizeArabicText(
    `${name} ${nameAr}`
  );

  const walletType = String(
    wallet?.type || ''
  ).toLowerCase();

  // ----------------------------------------------------------
  // Vodafone Cash
  // ----------------------------------------------------------

  if (
    normalizedName.includes('فودافون') ||
    normalizedName.includes('vodafone')
  ) {
    aliases.push(
      'فودافون كاش',
      'فودافون',
      'vodafone cash',
      'vodafone'
    );
  }

  // ----------------------------------------------------------
  // InstaPay
  // ----------------------------------------------------------

  if (
    normalizedName.includes('instapay') ||
    normalizedName.includes('انستا')
  ) {
    aliases.push(
      'انستا باي',
      'انستاباي',
      'انستا',
      'instapay'
    );
  }

  // ----------------------------------------------------------
  // CIB
  // ----------------------------------------------------------

  if (
    normalizedName.includes('cib') ||
    normalizedName.includes('سي اي بي')
  ) {
    aliases.push(
      'cib',
      'سي اي بي',
      'بنك cib'
    );
  }

  // ----------------------------------------------------------
  // Generic Cash
  //
  // IMPORTANT:
  // "كاش" is a generic alias ONLY.
  //
  // If a wallet is literally named "كاش", it will already win
  // in the explicit-name matching stage before this is reached.
  // ----------------------------------------------------------

  if (walletType === 'cash') {
    aliases.push(
      'كاش',
      'نقدي',
      'نقد',
      'cash'
    );
  }

  // ----------------------------------------------------------
  // Bank
  // ----------------------------------------------------------

  if (walletType === 'bank') {
    aliases.push(
      'البنك',
      'بنك',
      'حساب البنك',
      'حساب بنكي'
    );
  }

  // ----------------------------------------------------------
  // Card / Credit
  // ----------------------------------------------------------

  if (
    walletType === 'card' ||
    walletType === 'credit'
  ) {
    aliases.push(
      'الفيزا',
      'فيزا',
      'الكارت',
      'كارت',
      'الكريدت',
      'credit card'
    );
  }

  // ----------------------------------------------------------
  // Savings
  // ----------------------------------------------------------

  if (walletType === 'savings') {
    aliases.push(
      'الادخار',
      'تحويش',
      'التحويش',
      'حساب الادخار'
    );
  }

  return uniqueNormalized(aliases);
}

// ============================================================
// Similarity
// ============================================================

function calculateScore(
  source: string,
  target: string
): number {
  const a = canonicalWalletPhrase(source);
  const b = canonicalWalletPhrase(target);

  if (!a || !b) {
    return 0;
  }

  // Exact
  if (a === b) {
    return 1;
  }

  // Strong containment
  if (
    a.includes(b) ||
    b.includes(a)
  ) {
    return 0.92;
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
// Explicit wallet mention anywhere in natural text
//
// This is intentionally based on REAL wallet names only.
// It lets phrases such as:
//   "قبضت 500 جنيه على فودافون كاش"
// resolve the destination wallet without treating every Arabic
// word after "على" as a wallet reference. Longer wallet names
// win over shorter contained names ("فودافون كاش" > "كاش").
// ============================================================

function findWalletMentionInText(
  wallets: any[],
  text: string
): any | null {
  const normalizedText = normalizeArabicText(text);

  if (!normalizedText) {
    return null;
  }

  const candidates: Array<{
    wallet: any;
    length: number;
  }> = [];

  for (const wallet of wallets) {
    const names = getWalletExplicitNames(wallet);
    let bestLength = 0;

    for (const rawName of names) {
      const name = canonicalWalletPhrase(rawName);

      if (!name) {
        continue;
      }

      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const phrasePattern = new RegExp(`(?:^|\\s)${escaped}(?:$|\\s)`);

      if (phrasePattern.test(normalizedText)) {
        bestLength = Math.max(bestLength, name.length);
      }
    }

    if (bestLength > 0) {
      candidates.push({
        wallet,
        length: bestLength,
      });
    }
  }

  if (!candidates.length) {
    return null;
  }

  candidates.sort((a, b) => b.length - a.length);

  const bestLength = candidates[0].length;
  const best = candidates.filter((item) => item.length === bestLength);

  return best.length === 1 ? best[0].wallet : null;
}

// ============================================================
// Extract Wallet Phrase
// ============================================================

export function extractWalletSearchText(
  text: string
): string {
  const normalized =
    normalizeArabicText(text);

  // ----------------------------------------------------------
  // Payment source phrases
  // ----------------------------------------------------------

  const patterns = [
    /(?:من|عن طريق|بواسطه|باستخدام)\s+(.+)$/,
    /(?:دفعت ب|دفعت من)\s+(.+)$/,
    /(?:خصمت من)\s+(.+)$/,
    /(?:اتخصم من)\s+(.+)$/,
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
// Detect explicit wallet reference
// ============================================================

export function hasExplicitWalletReference(
  text: string
): boolean {
  return Boolean(
    extractWalletSearchText(text)
  );
}

// ============================================================
// Find exact wallet name
//
// This is the most important part of V2.
// ============================================================

function findExactWalletName(
  wallets: any[],
  searchText: string
): any | null {
  const normalizedSearch =
    canonicalWalletPhrase(searchText);

  if (!normalizedSearch) {
    return null;
  }

  const exactMatches =
    wallets.filter((wallet: any) => {
      const names =
        getWalletExplicitNames(wallet);

      return names.some(
        (name) =>
          name === normalizedSearch
      );
    });

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  return null;
}

// ============================================================
// Strong explicit-name matching
// ============================================================

function scoreExplicitWalletNames(
  wallet: any,
  searchText: string
): number {
  const names =
    getWalletExplicitNames(wallet);

  let bestScore = 0;

  for (const name of names) {
    const score =
      calculateScore(
        searchText,
        name
      );

    if (score > bestScore) {
      bestScore = score;
    }
  }

  return bestScore;
}

// ============================================================
// Generic alias matching
// ============================================================

function scoreGenericWalletAliases(
  wallet: any,
  searchText: string
): number {
  const aliases =
    getWalletGenericAliases(wallet);

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

  return bestScore;
}

// ============================================================
// Wallet Matcher V2
// ============================================================

export async function matchWalletForUser(
  userId: string,
  text: string
): Promise<WalletMatchResult> {
  const wallets =
    await getWalletsForUser(userId);

  // ----------------------------------------------------------
  // No wallets
  // ----------------------------------------------------------

  if (!wallets.length) {
    return {
      wallet: null,
      wallets: [],
      confidence: 0,
      searchText: '',
      ambiguous: false,
    };
  }

  // First, look for an actual registered wallet name anywhere in
  // the natural-language message. This handles destination-style
  // income phrases such as "على فودافون كاش" safely.
  const mentionedWallet =
    findWalletMentionInText(wallets, text);

  if (mentionedWallet) {
    return {
      wallet: mentionedWallet,
      wallets: [mentionedWallet],
      confidence: 1,
      searchText:
        mentionedWallet.nameAr ||
        mentionedWallet.name ||
        mentionedWallet.id ||
        '',
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
  // LEVEL 1
  // Exact real wallet name
  //
  // Example:
  // Wallets:
  //   "محفظتي"
  //   "كاش"
  //
  // User:
  //   "من الكاش"
  //
  // Result:
  //   "كاش"
  // ==========================================================

  const exactWallet =
    findExactWalletName(
      wallets,
      searchText
    );

  if (exactWallet) {
    return {
      wallet: exactWallet,
      wallets: [exactWallet],
      confidence: 1,
      searchText,
      ambiguous: false,
    };
  }

  // ==========================================================
  // LEVEL 2
  // Explicit wallet-name similarity
  // ==========================================================

  const explicitScored =
    wallets
      .map((wallet: any) => ({
        wallet,

        score:
          scoreExplicitWalletNames(
            wallet,
            searchText
          ),
      }))
      .filter(
        (item) =>
          item.score >= 0.72
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  if (explicitScored.length === 1) {
    return {
      wallet:
        explicitScored[0].wallet,

      wallets: [
        explicitScored[0].wallet,
      ],

      confidence:
        explicitScored[0].score,

      searchText,

      ambiguous: false,
    };
  }

  if (explicitScored.length > 1) {
    const best =
      explicitScored[0];

    const second =
      explicitScored[1];

    const difference =
      best.score -
      second.score;

    if (difference >= 0.15) {
      return {
        wallet:
          best.wallet,

        wallets:
          explicitScored.map(
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
        explicitScored.map(
          (item) =>
            item.wallet
        ),

      confidence:
        best.score,

      searchText,

      ambiguous: true,
    };
  }

  // ==========================================================
  // LEVEL 3
  // Generic aliases
  //
  // Only reached if no actual wallet name matched.
  // ==========================================================

  const aliasScored =
    wallets
      .map((wallet: any) => ({
        wallet,

        score:
          scoreGenericWalletAliases(
            wallet,
            searchText
          ),
      }))
      .filter(
        (item) =>
          item.score >= 0.65
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  // ----------------------------------------------------------
  // No alias match
  // ----------------------------------------------------------

  if (!aliasScored.length) {
    return {
      wallet: null,
      wallets: [],
      confidence: 0,
      searchText,
      ambiguous: false,
    };
  }

  // ----------------------------------------------------------
  // One alias match
  // ----------------------------------------------------------

  if (aliasScored.length === 1) {
    return {
      wallet:
        aliasScored[0].wallet,

      wallets: [
        aliasScored[0].wallet,
      ],

      confidence:
        aliasScored[0].score,

      searchText,

      ambiguous: false,
    };
  }

  // ==========================================================
  // Multiple generic matches
  //
  // This is genuinely ambiguous.
  //
  // Example:
  // user says "نقدي"
  // and has two cash wallets.
  // ==========================================================

  const best =
    aliasScored[0];

  const second =
    aliasScored[1];

  const difference =
    best.score -
    second.score;

  if (difference >= 0.2) {
    return {
      wallet:
        best.wallet,

      wallets:
        aliasScored.map(
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
      aliasScored.map(
        (item) =>
          item.wallet
      ),

    confidence:
      best.score,

    searchText,

    ambiguous: true,
  };
}
