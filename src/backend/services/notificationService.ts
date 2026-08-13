import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin';
import { buildSmartAlerts } from './financialAutomationService';

const collectionFor = (userId: string) => db.collection('users').doc(userId).collection('notifications');

export async function syncSmartNotifications(userId: string) {
  const result: any = await buildSmartAlerts(userId);
  const col = collectionFor(userId);
  const batch = db.batch();

  for (const alert of result.alerts || []) {
    const ref = col.doc(`smart_${alert.id}`);
    const current = await ref.get();
    const previous = current.exists ? current.data() : null;
    const signature = JSON.stringify([alert.severity, alert.titleAr, alert.messageAr, alert.actionAr]);
    const changed = !previous || previous.signature !== signature;
    batch.set(ref, {
      source: 'smart_financial_engine',
      alertId: alert.id,
      severity: alert.severity || 'info',
      titleAr: alert.titleAr || 'تنبيه مالي',
      messageAr: alert.messageAr || '',
      actionAr: alert.actionAr || '',
      signature,
      isRead: changed ? false : Boolean(previous?.isRead),
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
      ...(current.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true });
  }

  const activeIds = new Set((result.alerts || []).map((a: any) => `smart_${a.id}`));
  const existing = await col.where('source', '==', 'smart_financial_engine').get();
  for (const doc of existing.docs) {
    if (!activeIds.has(doc.id)) batch.set(doc.ref, { active: false, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  return result;
}

export async function getNotifications(userId: string) {
  await syncSmartNotifications(userId);
  const snap = await collectionFor(userId).where('active', '==', true).get();
  const notifications = snap.docs.map(d => ({ id: d.id, ...d.data() } as any))
    .sort((a: any, b: any) => String(b.updatedAt?.toDate?.()?.toISOString?.() || '').localeCompare(String(a.updatedAt?.toDate?.()?.toISOString?.() || '')));
  return { notifications, unreadCount: notifications.filter((n: any) => !n.isRead).length };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const ref = collectionFor(userId).doc(notificationId);
  const doc = await ref.get();
  if (!doc.exists) throw new Error('NOTIFICATION_NOT_FOUND');
  await ref.set({ isRead: true, readAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

export async function markAllNotificationsRead(userId: string) {
  const snap = await collectionFor(userId).where('active', '==', true).get();
  const batch = db.batch();
  for (const doc of snap.docs) batch.set(doc.ref, { isRead: true, readAt: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
}
