import { walletRepository } from '../repositories/walletRepository';
import { Wallet } from '../../types';

export async function getWalletsForUser(userId: string): Promise<Wallet[]> {
  return await walletRepository.getWallets(userId);
}

export async function ensureDefaultWalletForUser(userId: string): Promise<Wallet> {
  return await walletRepository.ensureDefaultWallet(userId);
}

export async function createWalletForUser(userId: string, payload: Omit<Wallet, 'id'> & { id?: string }): Promise<Wallet> {
  return await walletRepository.createWallet(userId, payload);
}

export async function updateWalletBalance(userId: string, walletId: string, amountChange: number): Promise<number> {
  return await walletRepository.updateWalletBalanceTransactional(userId, walletId, amountChange);
}

export async function syncInstaPayBankAccounts(userId: string): Promise<{ status: string; syncedAt: string; count: number }> {
  const wallets = await walletRepository.getWallets(userId);
  return {
    status: 'success',
    syncedAt: new Date().toISOString(),
    count: wallets.length,
  };
}


export async function updateWalletForUser(userId: string, walletId: string, payload: Partial<Wallet>): Promise<Wallet | null> {
  return await walletRepository.updateWallet(userId, walletId, payload);
}

export async function archiveWalletForUser(userId: string, walletId: string): Promise<boolean> {
  return await walletRepository.archiveWallet(userId, walletId);
}
