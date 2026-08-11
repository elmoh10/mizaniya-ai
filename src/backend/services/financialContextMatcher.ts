import { getTrustedFinancialContext } from './financialContextService';
import { billRepository } from '../repositories/budgetAndGoalRepositories';

export type ContextualMatchType =
  | 'BILL'
  | 'OBLIGATION'
  | 'AMBIGUOUS'
  | 'NONE';

export interface ContextualFinancialMatch {
  type: ContextualMatchType;

  bill?: any;

  obligation?: any;

  bills?: any[];

  obligations?: any[];

  confidence: number;
}

// ============================================================
// Normalize Arabic
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
// Remove generic financial words
// ============================================================

function extractSearchText(text: string): string {
  return normalizeArabicText(
    text
      .replace(/\d+(?:[.,]\d+)?/g, '')
      .replace(
        /جنيه|جنية|جنيها|ج\.م/gi,
        ''
      )
      .replace(
        /دفعت|سددت|سداد|صرفت|اشتريت|سجلت|سجل|من|على|علي/gi,
        ''
      )
      .replace(
        /فاتورة|فاتوره|التزام|التزامات/gi,
        ''
      )
      .replace(/\s+/g, ' ')
      .trim()
  );
}

// ============================================================
// Word similarity
// ============================================================

function calculateMatchScore(
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

  let matchedWords = 0;

  for (const word of targetWords) {
    if (
      sourceWords.some(
        (sourceWord) =>
          sourceWord === word ||
          sourceWord.includes(word) ||
          word.includes(sourceWord)
      )
    ) {
      matchedWords++;
    }
  }

  return (
    matchedWords /
    Math.max(
      sourceWords.length,
      targetWords.length
    )
  );
}

// ============================================================
// Contextual Matcher
// ============================================================

export async function matchFinancialContext(
  userId: string,
  text: string
): Promise<ContextualFinancialMatch> {
  const searchText =
    extractSearchText(text);

  if (!searchText) {
    return {
      type: 'NONE',
      confidence: 0,
    };
  }

  const [
    context,
    bills,
  ] = await Promise.all([
    getTrustedFinancialContext(userId),
    billRepository.getBills(userId),
  ]);

  // ==========================================================
  // Active Bills
  // ==========================================================

  const unpaidBills =
    bills.filter(
      (bill: any) =>
        !bill.isPaid
    );

  const billMatches =
    unpaidBills
      .map((bill: any) => {
        const title =
          String(
            bill.titleAr ||
            bill.title ||
            ''
          );

        const biller =
          String(
            bill.biller ||
            ''
          );

        const titleScore =
          calculateMatchScore(
            searchText,
            title
          );

        const billerScore =
          calculateMatchScore(
            searchText,
            biller
          );

        return {
          bill,
          score:
            Math.max(
              titleScore,
              billerScore
            ),
        };
      })
      .filter(
        (item) =>
          item.score >= 0.55
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  // ==========================================================
  // Active Obligations
  // ==========================================================

  const activeObligations =
    (
      context.obligations || []
    )
      .filter(
        (ob: any) =>
          ob.status === 'ACTIVE' ||
          ob.status === 'active'
      );

  const obligationMatches =
    activeObligations
      .map((obligation: any) => {
        const name =
          String(
            obligation.name ||
            ''
          );

        return {
          obligation,
          score:
            calculateMatchScore(
              searchText,
              name
            ),
        };
      })
      .filter(
        (item) =>
          item.score >= 0.55
      )
      .sort(
        (a, b) =>
          b.score - a.score
      );

  // ==========================================================
  // Nothing found
  // ==========================================================

  if (
    billMatches.length === 0 &&
    obligationMatches.length === 0
  ) {
    return {
      type: 'NONE',
      confidence: 0,
    };
  }

  // ==========================================================
  // Only Bill
  // ==========================================================

  if (
    billMatches.length > 0 &&
    obligationMatches.length === 0
  ) {
    const best =
      billMatches[0];

    return {
      type: 'BILL',
      bill: best.bill,
      bills:
        billMatches.map(
          (x) => x.bill
        ),
      confidence:
        best.score,
    };
  }

  // ==========================================================
  // Only Obligation
  // ==========================================================

  if (
    obligationMatches.length > 0 &&
    billMatches.length === 0
  ) {
    const best =
      obligationMatches[0];

    return {
      type: 'OBLIGATION',
      obligation:
        best.obligation,
      obligations:
        obligationMatches.map(
          (x) =>
            x.obligation
        ),
      confidence:
        best.score,
    };
  }

  // ==========================================================
  // Both exist
  // ==========================================================

  const bestBill =
    billMatches[0];

  const bestObligation =
    obligationMatches[0];

  const difference =
    Math.abs(
      bestBill.score -
      bestObligation.score
    );

  // One is clearly stronger
  if (difference >= 0.25) {
    if (
      bestBill.score >
      bestObligation.score
    ) {
      return {
        type: 'BILL',
        bill:
          bestBill.bill,
        bills:
          billMatches.map(
            (x) => x.bill
          ),
        confidence:
          bestBill.score,
      };
    }

    return {
      type: 'OBLIGATION',
      obligation:
        bestObligation.obligation,
      obligations:
        obligationMatches.map(
          (x) =>
            x.obligation
        ),
      confidence:
        bestObligation.score,
    };
  }

  // ==========================================================
  // Ambiguous
  // ==========================================================

  return {
    type: 'AMBIGUOUS',

    bill:
      bestBill.bill,

    obligation:
      bestObligation.obligation,

    bills:
      billMatches.map(
        (x) => x.bill
      ),

    obligations:
      obligationMatches.map(
        (x) =>
          x.obligation
      ),

    confidence:
      Math.max(
        bestBill.score,
        bestObligation.score
      ),
  };
}
