import { db } from '../config/firebaseAdmin';
import { Transaction } from '../../types';

export class TransactionRepository {
  private getCollection(userId: string) {
    return db.collection('users').doc(userId).collection('transactions');
  }

  async getTransactions(userId: string, limitCount = 50): Promise<Transaction[]> {
    const snapshot = await this.getCollection(userId)
      .orderBy('date', 'desc')
      .limit(limitCount)
      .get();
    return snapshot.docs
      .map((doc) => doc.data() as Transaction & { isDeleted?: boolean })
      .filter((tx) => !tx.isDeleted);
  }

  async getTransaction(userId: string, txId: string): Promise<Transaction | null> {
    const doc = await this.getCollection(userId).doc(txId).get();
    if (!doc.exists) return null;
    const data = doc.data() as Transaction & { isDeleted?: boolean };
    if (data.isDeleted) return null;
    return data;
  }

  async createTransaction(
    userId: string,
    tx: Omit<Transaction, 'id'> & { id?: string; destinationWalletId?: string }
  ): Promise<Transaction> {
    const userRef = db.collection('users').doc(userId);
    const txsColRef = userRef.collection('transactions');
    const walletsColRef = userRef.collection('wallets');

    const sourceWalletRef = walletsColRef.doc(tx.walletId);
    const destWalletRef =
      tx.type === 'transfer' && tx.destinationWalletId
        ? walletsColRef.doc(tx.destinationWalletId)
        : null;

    return await db.runTransaction(async (transaction) => {
      const sourceWalletDoc = await transaction.get(sourceWalletRef);
      if (!sourceWalletDoc.exists) {
        throw new Error(`Source wallet '${tx.walletId}' not found for user.`);
      }

      let destWalletDoc: FirebaseFirestore.DocumentSnapshot | null = null;
      if (destWalletRef) {
        destWalletDoc = await transaction.get(destWalletRef);
        if (!destWalletDoc.exists) {
          throw new Error(`Destination wallet '${tx.destinationWalletId}' not found for user.`);
        }
      }

      const docRef = tx.id ? txsColRef.doc(tx.id) : txsColRef.doc();
      const newTx: Transaction = {
        ...tx,
        id: docRef.id,
      };

      transaction.set(docRef, {
        ...newTx,
        isDeleted: false,
        createdAt: new Date().toISOString(),
      });

      const sourceBalance = Number(sourceWalletDoc.data()?.balance || 0);

      if (tx.type === 'income') {
        transaction.update(sourceWalletRef, { balance: sourceBalance + tx.amount });
      } else if (tx.type === 'expense') {
        transaction.update(sourceWalletRef, { balance: sourceBalance - tx.amount });
      } else if (tx.type === 'transfer') {
        if (!destWalletRef || !destWalletDoc) {
          throw new Error('Transfer requires a valid destination wallet.');
        }
        const destBalance = Number(destWalletDoc.data()?.balance || 0);
        transaction.update(sourceWalletRef, { balance: sourceBalance - tx.amount });
        transaction.update(destWalletRef, { balance: destBalance + tx.amount });
      }

      return newTx;
    });
  }

  async deleteTransaction(userId: string, txId: string): Promise<boolean> {
    const userRef = db.collection('users').doc(userId);
    const txRef = userRef.collection('transactions').doc(txId);
    const walletsColRef = userRef.collection('wallets');

    return await db.runTransaction(async (transaction) => {
      const txDoc = await transaction.get(txRef);
      if (!txDoc.exists) return false;

      const txData = txDoc.data() as Transaction & { isDeleted?: boolean; destinationWalletId?: string };
      if (txData.isDeleted) return false;

      const sourceWalletRef = walletsColRef.doc(txData.walletId);
      const sourceWalletDoc = await transaction.get(sourceWalletRef);

      const destWalletRef =
        txData.type === 'transfer' && txData.destinationWalletId
          ? walletsColRef.doc(txData.destinationWalletId)
          : null;
      const destWalletDoc = destWalletRef ? await transaction.get(destWalletRef) : null;

      transaction.update(txRef, {
        isDeleted: true,
        reversedAt: new Date().toISOString(),
      });

      if (txData.type === 'income') {
        if (sourceWalletDoc.exists) {
          const cur = Number(sourceWalletDoc.data()?.balance || 0);
          transaction.update(sourceWalletRef, { balance: cur - txData.amount });
        }
      } else if (txData.type === 'expense') {
        if (sourceWalletDoc.exists) {
          const cur = Number(sourceWalletDoc.data()?.balance || 0);
          transaction.update(sourceWalletRef, { balance: cur + txData.amount });
        }
      } else if (txData.type === 'transfer') {
        if (sourceWalletDoc.exists) {
          const curSource = Number(sourceWalletDoc.data()?.balance || 0);
          transaction.update(sourceWalletRef, { balance: curSource + txData.amount });
        }
        if (destWalletRef && destWalletDoc && destWalletDoc.exists) {
          const curDest = Number(destWalletDoc.data()?.balance || 0);
          transaction.update(destWalletRef, { balance: curDest - txData.amount });
        }
      }

      return true;
    });
  }
}

export const transactionRepository = new TransactionRepository();
