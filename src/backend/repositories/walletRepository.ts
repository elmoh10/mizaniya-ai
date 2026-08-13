import { db } from '../config/firebaseAdmin';
import { Wallet } from '../../types';

export class WalletRepository {
  private getCollection(userId: string) {
    return db.collection('users').doc(userId).collection('wallets');
  }

  async getWallets(userId: string): Promise<Wallet[]> {
    const snapshot = await this.getCollection(userId).get();
    return snapshot.docs
      .map((doc) => doc.data() as Wallet)
      .filter((wallet) => wallet.isArchived !== true);
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

    await docRef.update({
      isArchived: true,
      archivedAt: new Date().toISOString(),
      isPrimary: false,
    });
    return true;
  }

  async ensureDefaultWallet(userId: string): Promise<Wallet> {
    const wallets = await this.getWallets(userId);
    if (wallets.length > 0) {
      return wallets[0];
    }

    const defaultWalletId = 'default_cash_wallet';
    const userWalletsRef = this.getCollection(userId);

    return await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(userWalletsRef);
      const activeDocs = snap.docs.filter((doc) => doc.data()?.isArchived !== true);
      if (activeDocs.length > 0) {
        return activeDocs[0].data() as Wallet;
      }

      const defaultDocRef = userWalletsRef.doc(defaultWalletId);
      const defaultDoc = await transaction.get(defaultDocRef);
      if (defaultDoc.exists) {
        const data = defaultDoc.data() as Wallet;
        transaction.update(defaultDocRef, { isArchived: false, archivedAt: null, isPrimary: true });
        return { ...data, isArchived: false, archivedAt: undefined, isPrimary: true };
      }

      const defaultWallet: Wallet = {
        id: defaultWalletId,
        name: 'كاش',
        nameAr: 'كاش',
        type: 'cash',
        currency: 'EGP',
        balance: 0,
        icon: 'Wallet',
        color: 'bg-emerald-600',
        isPrimary: true,
      };

      transaction.set(defaultDocRef, defaultWallet);
      return defaultWallet;
    });
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
