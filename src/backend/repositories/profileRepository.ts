import { db } from '../config/firebaseAdmin';
import { UserProfile } from '../../types';

export const profileRepository = {
  async getProfile(userId: string): Promise<UserProfile | null> {
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) return null;
    return { uid: doc.id, ...doc.data() } as UserProfile;
  },

  async createProfileOnboarding(
    userId: string,
    email: string,
    payload: {
      displayName?: string;
      salary?: number;
      monthlyIncome?: number;
      currency?: string;
      country?: string;
      language?: string;
    }
  ): Promise<UserProfile> {
    const docRef = db.collection('users').doc(userId);
    const existing = await docRef.get();
    const now = new Date().toISOString();

    if (existing.exists) {
      const data = existing.data() as UserProfile;
      const updated: UserProfile = {
        ...data,
        displayName: payload.displayName || data.displayName || email.split('@')[0] || 'User',
        salary: payload.salary !== undefined ? payload.salary : (data.salary || 0),
        monthlyIncome: payload.monthlyIncome !== undefined ? payload.monthlyIncome : (data.monthlyIncome || payload.salary || 0),
        updatedAt: now,
      };
      await docRef.set(updated, { merge: true });
      return updated;
    }

    const newProfile: UserProfile = {
      uid: userId,
      displayName: payload.displayName || email.split('@')[0] || 'User',
      email: email || '',
      country: payload.country || 'EG',
      currency: (payload.currency as any) || 'EGP',
      language: (payload.language as any) || 'ar',
      role: 'user', // Assigned server-side only
      salary: payload.salary || 0,
      monthlyIncome: payload.monthlyIncome || payload.salary || 0,
      emergencyFundMonths: 3,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(newProfile);
    return newProfile;
  },

  async updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const docRef = db.collection('users').doc(userId);
    const doc = await docRef.get();
    const now = new Date().toISOString();

    // Sanitize: strip out privileged fields
    const { role, uid, createdAt, ...sanitized } = updates as any;
    sanitized.updatedAt = now;

    if (!doc.exists) {
      const initial: UserProfile = {
        uid: userId,
        displayName: sanitized.displayName || 'User',
        email: sanitized.email || '',
        country: sanitized.country || 'EG',
        currency: sanitized.currency || 'EGP',
        language: sanitized.language || 'ar',
        role: 'user',
        salary: sanitized.salary || 0,
        monthlyIncome: sanitized.monthlyIncome || 0,
        emergencyFundMonths: sanitized.emergencyFundMonths || 3,
        createdAt: now,
        updatedAt: now,
      };
      await docRef.set(initial);
      return initial;
    }

    await docRef.set(sanitized, { merge: true });
    const refreshed = await docRef.get();
    return { uid: refreshed.id, ...refreshed.data() } as UserProfile;
  },

  async deleteProfileAndAllUserData(userId: string): Promise<boolean> {
    const userRef = db.collection('users').doc(userId);
    const collectionsToDelete = [
      'wallets',
      'transactions',
      'budgets',
      'goals',
      'bills',
      'installments',
      'memory',
      'ai_memories',
    ];

    for (const subColName of collectionsToDelete) {
      const snap = await userRef.collection(subColName).get();
      const batch = db.batch();
      snap.docs.forEach((d) => batch.delete(d.ref));
      if (snap.size > 0) {
        await batch.commit();
      }
    }

    await userRef.delete();
    return true;
  },
};
