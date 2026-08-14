import { db } from '../config/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';

export const obligationInputSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل').max(100),
  amount: z.number().positive('يجب أن يكون مبلغ الالتزام أكبر من صفر'),
  category: z.string().min(2, 'الفئة مطلوبة'),
  dueDate: z.string().min(1, 'تاريخ الاستحقاق مطلوب'), // typically "1" to "31" or a specific date
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'CUSTOM']).default('MONTHLY'),
  notes: z.string().optional(),
});

export type ObligationInput = z.infer<typeof obligationInputSchema>;

export async function createObligation(userId: string, input: any) {
  const validated = obligationInputSchema.parse(input);

  const obligationDoc = {
    ...validated,
    status: 'ACTIVE',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const docRef = await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
    .add(obligationDoc);

  return { id: docRef.id, ...obligationDoc };
}

export async function getObligations(userId: string) {
  const snap = await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
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

export async function getObligation(userId: string, obligationId: string) {
  const doc = await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
    .doc(obligationId)
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

export async function updateObligation(userId: string, obligationId: string, input: any) {
  const validated = obligationInputSchema.partial().parse(input);
  const updateData = {
    ...validated,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
    .doc(obligationId)
    .update(updateData);

  return { id: obligationId, ...updateData };
}

export async function pauseObligation(userId: string, obligationId: string) {
  await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
    .doc(obligationId)
    .update({
      status: 'PAUSED',
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function resumeObligation(userId: string, obligationId: string) {
  await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
    .doc(obligationId)
    .update({
      status: 'ACTIVE',
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function deleteObligation(userId: string, obligationId: string) {
  await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
    .doc(obligationId)
    .delete();
}

export async function completeObligation(userId: string, obligationId: string) {
  await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
    .doc(obligationId)
    .update({
      status: 'COMPLETED',
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export async function archiveObligation(userId: string, obligationId: string) {
  await db
    .collection('users')
    .doc(userId)
    .collection('obligations')
    .doc(obligationId)
    .update({
      status: 'ARCHIVED',
      updatedAt: FieldValue.serverTimestamp(),
    });
}
