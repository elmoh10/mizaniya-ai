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

export async function getDebt(userId: string, debtId: string) {
  const doc = await db
    .collection('users')
    .doc(userId)
    .collection('debts')
    .doc(debtId)
    .get();

  if (!doc.exists) return null;
  const data = doc.data() as any;
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
    updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt) : null,
  };
}

export async function recordDebtPayment(
  userId: string,
  debtId: string,
  amount: number,
  paymentMethod?: string,
  date?: string,
  idempotencyKey?: string
) {
  if (amount <= 0) {
    const err = new Error('يجب أن يكون مبلغ الدفع أكبر من صفر');
    (err as any).statusCode = 400;
    throw err;
  }

  const debtRef = db
    .collection('users')
    .doc(userId)
    .collection('debts')
    .doc(debtId);

  const opRef = idempotencyKey
    ? db
        .collection('users')
        .doc(userId)
        .collection('financial_operations')
        .doc(idempotencyKey)
    : null;

  const paymentCollRef = debtRef.collection('payments');

  return await db.runTransaction(async (transaction) => {
    // 1. Check operation does not already exist if idempotency key is provided
    if (opRef) {
      const opSnap = await transaction.get(opRef);
      if (opSnap.exists) {
        const opData = opSnap.data() as any;
        return {
          debtId: opData.debtId,
          paymentId: opData.paymentId,
          remainingAmount: opData.remainingAmount,
          status: opData.status,
          isIdempotentResponse: true,
        };
      }
    }

    // 2. Read debt
    const debtSnap = await transaction.get(debtRef);
    if (!debtSnap.exists) {
      const err = new Error('الدين غير موجود');
      (err as any).statusCode = 404;
      throw err;
    }

    const debtData = debtSnap.data() as any;
    if (debtData.remainingAmount <= 0 || debtData.status === 'PAID') {
      const err = new Error('هذا الدين مدفوع بالكامل بالفعل');
      (err as any).statusCode = 400;
      throw err;
    }

    // Reject payment where amount > remainingAmount
    if (amount > debtData.remainingAmount) {
      const err = new Error('مبلغ الدفعة أكبر من المبلغ المتبقي على الدين.');
      (err as any).statusCode = 400;
      throw err;
    }

    // 3. Apply payment
    const newRemainingAmount = Math.max(0, debtData.remainingAmount - amount);
    const newStatus = newRemainingAmount === 0 ? 'PAID' : debtData.status;

    transaction.update(debtRef, {
      remainingAmount: newRemainingAmount,
      status: newStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // 4. Create payment
    const paymentDocRef = paymentCollRef.doc();
    const paymentData = {
      amount,
      paymentMethod: paymentMethod || 'Cash',
      date: date || new Date().toISOString().split('T')[0],
      createdAt: FieldValue.serverTimestamp(),
    };

    transaction.set(paymentDocRef, paymentData);

    const result = {
      debtId,
      paymentId: paymentDocRef.id,
      remainingAmount: newRemainingAmount,
      status: newStatus,
    };

    // 5. Create operation result if idempotency key is provided
    if (opRef) {
      transaction.set(opRef, {
        ...result,
        idempotencyKey,
        createdAt: FieldValue.serverTimestamp(),
      });
    }

    return result;
  });
}

export async function markDebtPaid(userId: string, debtId: string) {
  await db
    .collection('users')
    .doc(userId)
    .collection('debts')
    .doc(debtId)
    .update({
      status: 'PAID',
      remainingAmount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function archiveDebt(userId: string, debtId: string) {
  await db
    .collection('users')
    .doc(userId)
    .collection('debts')
    .doc(debtId)
    .update({
      status: 'ARCHIVED',
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function getDebtPayments(userId: string, debtId: string) {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('debts')
    .doc(debtId)
    .collection('payments')
    .orderBy('date', 'desc')
    .get();

  return snap.docs.map(doc => {
    const data = doc.data();
    return {
      id: doc.id,
      ...data,
      createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
    };
  });
}
