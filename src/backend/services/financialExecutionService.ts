import { db } from '../config/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { PaymentMethod, Transaction } from '../../types';

const ALLOWED_PAYMENT_METHODS: PaymentMethod[] = [
  'InstaPay',
  'Vodafone Cash',
  'CIB Bank',
  'Fawry',
  'Cash',
  'Visa/Mastercard',
  'Valu',
  'B.TECH / Aman',
];

function httpError(message: string, statusCode: number) {
  const err = new Error(message);
  (err as any).statusCode = statusCode;
  return err;
}

function normalizePaymentMethod(value: unknown, fallback: PaymentMethod = 'Cash'): PaymentMethod {
  return ALLOWED_PAYMENT_METHODS.includes(value as PaymentMethod)
    ? (value as PaymentMethod)
    : fallback;
}

async function resolveWalletId(userId: string, walletId?: string): Promise<string> {
  if (walletId && walletId.trim()) return walletId.trim();

  const snapshot = await db
    .collection('users')
    .doc(userId)
    .collection('wallets')
    .get();

  if (snapshot.empty) {
    throw httpError('لا توجد محفظة مسجلة لاستخدامها في عملية السداد.', 400);
  }

  const primary = snapshot.docs.find((doc) => doc.data()?.isPrimary === true);
  return (primary || snapshot.docs[0]).id;
}

export interface ExecuteBillPaymentInput {
  billId: string;
  walletId?: string;
  paymentMethod?: PaymentMethod | string;
  date?: string;
  idempotencyKey?: string;
  source?: 'telegram' | 'api' | 'web' | 'system';
}

export interface ExecuteDebtPaymentInput {
  debtId: string;
  amount: number;
  walletId?: string;
  paymentMethod?: PaymentMethod | string;
  date?: string;
  idempotencyKey?: string;
  source?: 'telegram' | 'api' | 'web' | 'system';
}

export async function executeBillPayment(
  userId: string,
  input: ExecuteBillPaymentInput
) {
  const billId = String(input.billId || '').trim();
  if (!billId) throw httpError('معرف الفاتورة مطلوب.', 400);

  const walletId = await resolveWalletId(userId, input.walletId);
  const userRef = db.collection('users').doc(userId);
  const billRef = userRef.collection('bills').doc(billId);
  const walletRef = userRef.collection('wallets').doc(walletId);
  const txRef = userRef.collection('transactions').doc();
  const opRef = input.idempotencyKey
    ? userRef.collection('financial_operations').doc(input.idempotencyKey)
    : null;

  return db.runTransaction(async (transaction) => {
    if (opRef) {
      const opSnap = await transaction.get(opRef);
      if (opSnap.exists) {
        return { ...(opSnap.data() as any), isIdempotentResponse: true };
      }
    }

    const billSnap = await transaction.get(billRef);
    const walletSnap = await transaction.get(walletRef);

    if (!billSnap.exists) throw httpError('الفاتورة غير موجودة.', 404);
    if (!walletSnap.exists) throw httpError('المحفظة غير موجودة.', 404);

    const bill = billSnap.data() as any;
    if (bill.isPaid === true) {
      throw httpError('الفاتورة مدفوعة بالفعل.', 409);
    }

    const amount = Number(bill.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw httpError('مبلغ الفاتورة غير صالح.', 400);
    }

    const wallet = walletSnap.data() as any;
    const currentBalance = Number(wallet.balance || 0);
    const paymentMethod = normalizePaymentMethod(
      input.paymentMethod,
      normalizePaymentMethod(bill.paymentMethod, 'Cash')
    );
    const date = input.date || new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    const txData: Transaction = {
      id: txRef.id,
      title: `سداد فاتورة ${bill.titleAr || bill.title || 'فاتورة'}`,
      amount,
      currency: wallet.currency || 'EGP',
      type: 'expense',
      category: 'Bills & Subscriptions',
      walletId,
      paymentMethod,
      date,
      merchant: bill.biller || undefined,
      notes: `سداد فاتورة ${billId} عبر ${input.source || 'system'}`,
      aiTag: `${input.source || 'system'}-bill-payment`,
      relatedBillId: billId,
    };

    transaction.set(txRef, {
      ...txData,
      isDeleted: false,
      createdAt: nowIso,
    });

    transaction.update(walletRef, {
      balance: currentBalance - amount,
      updatedAt: nowIso,
    });

    transaction.update(billRef, {
      isPaid: true,
      paidAt: nowIso,
      paidTransactionId: txRef.id,
      paidWalletId: walletId,
      updatedAt: nowIso,
    });

    const result = {
      actionType: 'bill_payment',
      billId,
      transactionId: txRef.id,
      walletId,
      walletName: wallet.nameAr || wallet.name || walletId,
      amount,
      newWalletBalance: currentBalance - amount,
      paidAt: nowIso,
    };

    if (opRef) {
      transaction.set(opRef, {
        ...result,
        idempotencyKey: input.idempotencyKey,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return result;
  });
}

export async function executeDebtPayment(
  userId: string,
  input: ExecuteDebtPaymentInput
) {
  const debtId = String(input.debtId || '').trim();
  const amount = Number(input.amount || 0);

  if (!debtId) throw httpError('معرف الدين مطلوب.', 400);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError('يجب أن يكون مبلغ الدفع أكبر من صفر.', 400);
  }

  const walletId = await resolveWalletId(userId, input.walletId);
  const userRef = db.collection('users').doc(userId);
  const debtRef = userRef.collection('debts').doc(debtId);
  const walletRef = userRef.collection('wallets').doc(walletId);
  const paymentRef = debtRef.collection('payments').doc();
  const txRef = userRef.collection('transactions').doc();
  const opRef = input.idempotencyKey
    ? userRef.collection('financial_operations').doc(input.idempotencyKey)
    : null;

  return db.runTransaction(async (transaction) => {
    if (opRef) {
      const opSnap = await transaction.get(opRef);
      if (opSnap.exists) {
        return { ...(opSnap.data() as any), isIdempotentResponse: true };
      }
    }

    const debtSnap = await transaction.get(debtRef);
    const walletSnap = await transaction.get(walletRef);

    if (!debtSnap.exists) throw httpError('الدين غير موجود.', 404);
    if (!walletSnap.exists) throw httpError('المحفظة غير موجودة.', 404);

    const debt = debtSnap.data() as any;
    const remainingBefore = Number(debt.remainingAmount || 0);

    if (remainingBefore <= 0 || debt.status === 'PAID') {
      throw httpError('هذا الدين مدفوع بالكامل بالفعل.', 409);
    }
    if (amount > remainingBefore) {
      throw httpError('مبلغ الدفعة أكبر من المبلغ المتبقي على الدين.', 400);
    }

    const wallet = walletSnap.data() as any;
    const currentBalance = Number(wallet.balance || 0);
    const newRemainingAmount = Math.max(0, remainingBefore - amount);
    const newStatus = newRemainingAmount === 0 ? 'PAID' : debt.status || 'ACTIVE';
    const paymentMethod = normalizePaymentMethod(input.paymentMethod, 'Cash');
    const date = input.date || new Date().toISOString().split('T')[0];
    const nowIso = new Date().toISOString();

    const txData: Transaction = {
      id: txRef.id,
      title: `سداد دين ${debt.creditorName || 'دين'}`,
      amount,
      currency: wallet.currency || 'EGP',
      type: 'expense',
      category: 'Installments & Debt',
      walletId,
      paymentMethod,
      date,
      merchant: debt.creditorName || undefined,
      notes: `سداد دين ${debtId} عبر ${input.source || 'system'}`,
      aiTag: `${input.source || 'system'}-debt-payment`,
      relatedDebtId: debtId,
    };

    transaction.set(txRef, {
      ...txData,
      isDeleted: false,
      createdAt: nowIso,
    });

    transaction.update(walletRef, {
      balance: currentBalance - amount,
      updatedAt: nowIso,
    });

    transaction.update(debtRef, {
      remainingAmount: newRemainingAmount,
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    transaction.set(paymentRef, {
      amount,
      paymentMethod,
      walletId,
      transactionId: txRef.id,
      date,
      createdAt: FieldValue.serverTimestamp(),
    });

    const result = {
      actionType: 'debt_payment',
      debtId,
      paymentId: paymentRef.id,
      transactionId: txRef.id,
      walletId,
      walletName: wallet.nameAr || wallet.name || walletId,
      amount,
      remainingAmount: newRemainingAmount,
      status: newStatus,
      newWalletBalance: currentBalance - amount,
    };

    if (opRef) {
      transaction.set(opRef, {
        ...result,
        idempotencyKey: input.idempotencyKey,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return result;
  });
}
