import { db } from '../config/firebaseAdmin';
import { InstallmentDebt } from '../../types';

export const installmentRepository = {
  async getInstallments(userId: string): Promise<InstallmentDebt[]> {
    const snap = await db.collection('users').doc(userId).collection('installments').get();
    return snap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    })) as InstallmentDebt[];
  },

  async saveInstallment(userId: string, payload: Partial<InstallmentDebt> & { id?: string }): Promise<InstallmentDebt> {
    const userRef = db.collection('users').doc(userId);
    const installmentsCol = userRef.collection('installments');
    const docRef = payload.id ? installmentsCol.doc(payload.id) : installmentsCol.doc();

    const now = new Date().toISOString();
    const installmentData: InstallmentDebt = {
      id: docRef.id,
      title: payload.title || 'قسط جديد',
      titleAr: payload.titleAr || payload.title || 'قسط جديد',
      principalAmount: Number(payload.principalAmount || 0),
      remainingAmount: Number(payload.remainingAmount || payload.principalAmount || 0),
      monthlyPayment: Number(payload.monthlyPayment || 0),
      interestRate: Number(payload.interestRate || 0),
      dueDay: Number(payload.dueDay || 1),
      provider: payload.provider || 'عام',
      status: payload.status || 'ACTIVE',
      notes: payload.notes || '',
      createdAt: payload.createdAt || now,
      updatedAt: now,
    };

    await docRef.set(installmentData, { merge: true });
    return installmentData;
  },

  async deleteInstallment(userId: string, installmentId: string): Promise<boolean> {
    const docRef = db.collection('users').doc(userId).collection('installments').doc(installmentId);
    const doc = await docRef.get();
    if (!doc.exists) return false;
    await docRef.delete();
    return true;
  },
};
