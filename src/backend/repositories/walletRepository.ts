import { db } from '../config/firebaseAdmin';
import { Wallet } from '../../types';

export class WalletRepository {
  private getCollection(userId: string) {
    return db.collection('users').doc(userId).collection('wallets');
  }

  async getWallets(userId: string): Promise<Wallet[]> {
    const snapshot = await this.getCollection(userId).get();
    return snapshot.docs.map((doc) => doc.data() as Wallet);
  }

  async getWallet(userId: string, walletId: string): Promise<Wallet | null> {
    const doc = await this.getCollection(userId).doc(walletId).get();
    if (!doc.exists) return null;
    return doc.data() as Wallet;
  }

  async createWallet(userId: string, wallet: Omit<Wallet, 'id'> & { id?: string }): Promise<Wallet> {
    const docRef = wallet.id
      ? this.getCollection(userId).doc(wallet.id)
      : this.getCollection(userId).doc();
    
    const newWallet: Wallet = {
      ...wallet,
      id: docRef.id,
    };

    await docRef.set(newWallet);
    return newWallet;
  }

  async updateWallet(userId: string, walletId: string, payload: Partial<Wallet>): Promise<Wallet | null> {
    const docRef = this.getCollection(userId).doc(walletId);
    const existing = await docRef.get();
    if (!existing.exists) return null;

    await docRef.update(payload);
    const updated = await docRef.get();
    return updated.data() as Wallet;
  }

  async archiveWallet(userId: string, walletId: string): Promise<boolean> {
    const docRef = this.getCollection(userId).doc(walletId);
    const doc = await docRef.get();
    if (!doc.exists) return false;

    await docRef.delete();
    return true;
  }

  async updateWalletBalanceTransactional(
    userId: string,
    walletId: string,
    amountDelta: number
  ): Promise<number> {
    const docRef = this.getCollection(userId).doc(walletId);

    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) {
        throw new Error(`Wallet ${walletId} not found`);
      }

      const currentBalance = doc.data()?.balance || 0;
      const newBalance = currentBalance + amountDelta;

      transaction.update(docRef, { balance: newBalance });
      return newBalance;
    });
  }
}

export const walletRepository = new WalletRepository();
