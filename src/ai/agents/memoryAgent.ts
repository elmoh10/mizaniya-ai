import { aiMemoryRepository } from '../../backend/repositories/budgetAndGoalRepositories';

export interface UserFinancialMemory {
  userId: string;
  preferredLanguage: 'ar' | 'en';
  primaryBank?: string;
  monthlyIncomeAverage?: number;
  frequentCategories?: string[];
  savingsTargetGoal?: string;
  familyMembersCount?: number;
  lastUpdated: string;
}

export async function getUserMemory(userId: string): Promise<UserFinancialMemory | null> {
  if (!userId) return null;
  const memories = await aiMemoryRepository.getMemories(userId);
  if (!memories || memories.length === 0) return null;
  return memories[0] as UserFinancialMemory;
}

export async function updateUserMemory(
  userId: string,
  partial: Partial<UserFinancialMemory>
): Promise<UserFinancialMemory> {
  const current = (await getUserMemory(userId)) || {
    userId,
    preferredLanguage: 'ar',
    lastUpdated: new Date().toISOString(),
  };

  const updated: UserFinancialMemory = {
    ...current,
    ...partial,
    userId,
    lastUpdated: new Date().toISOString(),
  };

  await aiMemoryRepository.saveMemory(userId, updated);
  return updated;
}
