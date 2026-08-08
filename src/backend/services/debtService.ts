import { db } from '../config/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

export const debtInputSchema = z.object({
  amountOriginal: z.number().positive('يجب أن يكون مبلغ الدين الأصلي أكبر من صفر'),
  remainingAmount: z.number().positive('يجب أن يكون المبلغ المتبقي أكبر من صفر'),
  creditorName: z.string().min(2, 'اسم الدائن يجب أن يكون حرفين على الأقل').max(100),
  type: z.enum(['PERSONAL', 'BANK', 'CREDIT_CARD', 'INSTALLMENT', 'OTHER']),
  interestRate: z.number().min(0, 'نسبة الفائدة لا يمكن أن تكون سالبة').max(150, 'نسبة فائدة غير منطقية'), // Reject absurd interest rates (>150%)
  minimumPayment: z.number().nonnegative('القسط الأدنى لا يمكن أن يكون سالباً'),
  dueDate: z.string().optional(),
});

export type DebtInput = z.infer<typeof debtInputSchema>;

export async function createDebt(userId: string, input: any) {
  // Use Zod to validate input fields
  const validated = debtInputSchema.parse(input);

  const debtDoc = {
    ...validated,
    status: 'ACTIVE',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await db.collection('users').doc(userId).collection('debts').add(debtDoc);
  return { id: docRef.id, ...debtDoc };
}

export async function getActiveDebts(userId: string) {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('debts')
    .where('status', '==', 'ACTIVE')
    .get();

  return snap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
      updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt) : null,
    };
  });
}

export async function updateDebt(userId: string, debtId: string, input: any) {
  const validated = debtInputSchema.partial().parse(input);
  const updateData = {
    ...validated,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db
    .collection('users')
    .doc(userId)
    .collection('debts')
    .doc(debtId)
    .update(updateData);

  return { id: debtId, ...updateData };
}

export async function markDebtPaid(userId: string, debtId: string) {
  await db
    .collection('users')
    .doc(userId)
    .collection('debts')
    .doc(debtId)
    .update({
      status: 'PAID_OFF',
      remainingAmount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
}
