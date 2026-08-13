import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { CategoryType, Transaction } from '../../types';

function httpError(message: string, statusCode: number) {
  const err = new Error(message);
  (err as any).statusCode = statusCode;
  return err;
}

type StoredTransaction = Transaction & {
  destinationWalletId?: string;
  isDeleted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string;
  restoredAt?: string;
};

function assertStandaloneTransaction(tx: StoredTransaction) {
  if (
    tx.relatedBillId ||
    tx.relatedDebtId ||
    tx.relatedObligationId ||
    tx.relatedInstallmentId
  ) {
    throw httpError(
      'العملية مرتبطة بفاتورة أو دين أو التزام، لذلك لا يمكن تعديلها أو حذفها مباشرة من Telegram حتى لا تختلف البيانات المحاسبية.',
      409
    );
  }
}

async function getWalletSnapshots(
  trx: FirebaseFirestore.Transaction,
  userId: string,
  tx: StoredTransaction
) {
  const wallets = db.collection('users').doc(userId).collection('wallets');
  const sourceRef = wallets.doc(tx.walletId);
  const sourceSnap = await trx.get(sourceRef);
  if (!sourceSnap.exists) throw httpError('المحفظة الأصلية غير موجودة.', 404);

  let destinationRef: FirebaseFirestore.DocumentReference | null = null;
  let destinationSnap: FirebaseFirestore.DocumentSnapshot | null = null;

  if (tx.type === 'transfer') {
    if (!tx.destinationWalletId) throw httpError('عملية التحويل لا تحتوي على محفظة مستلمة.', 400);
    destinationRef = wallets.doc(tx.destinationWalletId);
    destinationSnap = await trx.get(destinationRef);
    if (!destinationSnap.exists) throw httpError('المحفظة المستلمة غير موجودة.', 404);
  }

  return { sourceRef, sourceSnap, destinationRef, destinationSnap };
}

export async function editTransactionAtomic(
  userId: string,
  txId: string,
  patch: {
    amount?: number;
    title?: string;
    category?: CategoryType;
  }
) {
  const userRef = db.collection('users').doc(userId);
  const txRef = userRef.collection('transactions').doc(txId);

  return db.runTransaction(async (trx) => {
    const txSnap = await trx.get(txRef);
    if (!txSnap.exists) throw httpError('العملية غير موجودة.', 404);

    const current = txSnap.data() as StoredTransaction;
    if (current.isDeleted) throw httpError('العملية محذوفة بالفعل.', 409);
    assertStandaloneTransaction(current);

    const oldAmount = Number(current.amount || 0);
    const newAmount = patch.amount === undefined ? oldAmount : Number(patch.amount);
    if (!Number.isFinite(newAmount) || newAmount <= 0) {
      throw httpError('المبلغ الجديد غير صالح.', 400);
    }

    const { sourceRef, sourceSnap, destinationRef, destinationSnap } =
      await getWalletSnapshots(trx, userId, current);

    const sourceBalance = Number(sourceSnap.data()?.balance || 0);
    const delta = newAmount - oldAmount;

    if (delta !== 0) {
      if (current.type === 'expense') {
        trx.update(sourceRef, { balance: sourceBalance - delta, updatedAt: new Date().toISOString() });
      } else if (current.type === 'income') {
        trx.update(sourceRef, { balance: sourceBalance + delta, updatedAt: new Date().toISOString() });
      } else if (current.type === 'transfer') {
        if (!destinationRef || !destinationSnap) throw httpError('بيانات التحويل غير مكتملة.', 400);
        const destinationBalance = Number(destinationSnap.data()?.balance || 0);
        trx.update(sourceRef, { balance: sourceBalance - delta, updatedAt: new Date().toISOString() });
        trx.update(destinationRef, { balance: destinationBalance + delta, updatedAt: new Date().toISOString() });
      }
    }

    const update: Record<string, unknown> = {
      amount: newAmount,
      updatedAt: FieldValue.serverTimestamp(),
      lastEditedBy: 'telegram',
    };
    if (patch.title?.trim()) update.title = patch.title.trim();
    if (patch.category) update.category = patch.category;

    trx.update(txRef, update);

    return {
      id: txId,
      oldAmount,
      newAmount,
      difference: newAmount - oldAmount,
      type: current.type,
      title: String(update.title || current.title || 'عملية مالية'),
      walletId: current.walletId,
    };
  });
}

export async function softDeleteTransactionAtomic(userId: string, txId: string) {
  const userRef = db.collection('users').doc(userId);
  const txRef = userRef.collection('transactions').doc(txId);

  return db.runTransaction(async (trx) => {
    const txSnap = await trx.get(txRef);
    if (!txSnap.exists) throw httpError('العملية غير موجودة.', 404);

    const tx = txSnap.data() as StoredTransaction;
    if (tx.isDeleted) throw httpError('العملية محذوفة بالفعل.', 409);
    assertStandaloneTransaction(tx);

    const { sourceRef, sourceSnap, destinationRef, destinationSnap } =
      await getWalletSnapshots(trx, userId, tx);
    const amount = Number(tx.amount || 0);
    const sourceBalance = Number(sourceSnap.data()?.balance || 0);
    const nowIso = new Date().toISOString();

    if (tx.type === 'expense') {
      trx.update(sourceRef, { balance: sourceBalance + amount, updatedAt: nowIso });
    } else if (tx.type === 'income') {
      trx.update(sourceRef, { balance: sourceBalance - amount, updatedAt: nowIso });
    } else if (tx.type === 'transfer') {
      if (!destinationRef || !destinationSnap) throw httpError('بيانات التحويل غير مكتملة.', 400);
      const destinationBalance = Number(destinationSnap.data()?.balance || 0);
      trx.update(sourceRef, { balance: sourceBalance + amount, updatedAt: nowIso });
      trx.update(destinationRef, { balance: destinationBalance - amount, updatedAt: nowIso });
    }

    trx.update(txRef, {
      isDeleted: true,
      deletedAt: FieldValue.serverTimestamp(),
      reversedAt: nowIso,
      deletedBy: 'telegram',
    });

    return { id: txId, amount, type: tx.type, title: tx.title, walletId: tx.walletId };
  });
}

export async function restoreTransactionAtomic(userId: string, txId: string) {
  const userRef = db.collection('users').doc(userId);
  const txRef = userRef.collection('transactions').doc(txId);

  return db.runTransaction(async (trx) => {
    const txSnap = await trx.get(txRef);
    if (!txSnap.exists) throw httpError('العملية غير موجودة.', 404);

    const tx = txSnap.data() as StoredTransaction;
    if (!tx.isDeleted) throw httpError('العملية ليست محذوفة.', 409);
    assertStandaloneTransaction(tx);

    const { sourceRef, sourceSnap, destinationRef, destinationSnap } =
      await getWalletSnapshots(trx, userId, tx);
    const amount = Number(tx.amount || 0);
    const sourceBalance = Number(sourceSnap.data()?.balance || 0);
    const nowIso = new Date().toISOString();

    if (tx.type === 'expense') {
      trx.update(sourceRef, { balance: sourceBalance - amount, updatedAt: nowIso });
    } else if (tx.type === 'income') {
      trx.update(sourceRef, { balance: sourceBalance + amount, updatedAt: nowIso });
    } else if (tx.type === 'transfer') {
      if (!destinationRef || !destinationSnap) throw httpError('بيانات التحويل غير مكتملة.', 400);
      const destinationBalance = Number(destinationSnap.data()?.balance || 0);
      trx.update(sourceRef, { balance: sourceBalance - amount, updatedAt: nowIso });
      trx.update(destinationRef, { balance: destinationBalance + amount, updatedAt: nowIso });
    }

    trx.update(txRef, {
      isDeleted: false,
      restoredAt: FieldValue.serverTimestamp(),
      restoredBy: 'telegram',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { id: txId, amount, type: tx.type, title: tx.title, walletId: tx.walletId };
  });
}
