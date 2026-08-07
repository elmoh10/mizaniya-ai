import { db } from '../config/firebaseAdmin';
import { Budget, Goal, Bill, Subscription } from '../../types';

export class BudgetRepository {
  private getCollection(userId: string) {
    return db.collection('users').doc(userId).collection('budgets');
  }

  async getBudget(userId: string, monthKey: string): Promise<Budget | null> {
    const doc = await this.getCollection(userId).doc(monthKey).get();
    if (!doc.exists) return null;
    return doc.data() as Budget;
  }

  async setBudget(userId: string, budget: Budget): Promise<Budget> {
    await this.getCollection(userId).doc(budget.id).set(budget, { merge: true });
    return budget;
  }
}

export class GoalRepository {
  private getCollection(userId: string) {
    return db.collection('users').doc(userId).collection('goals');
  }

  async getGoals(userId: string): Promise<Goal[]> {
    const snapshot = await this.getCollection(userId).get();
    return snapshot.docs.map((doc) => doc.data() as Goal);
  }

  async saveGoal(userId: string, goal: Goal): Promise<Goal> {
    const docRef = goal.id ? this.getCollection(userId).doc(goal.id) : this.getCollection(userId).doc();
    const newGoal = { ...goal, id: docRef.id };
    await docRef.set(newGoal, { merge: true });
    return newGoal;
  }
}

export class BillRepository {
  private getCollection(userId: string) {
    return db.collection('users').doc(userId).collection('bills');
  }

  async getBills(userId: string): Promise<Bill[]> {
    const snapshot = await this.getCollection(userId).get();
    return snapshot.docs.map((doc) => doc.data() as Bill);
  }

  async saveBill(userId: string, bill: Bill): Promise<Bill> {
    const docRef = bill.id ? this.getCollection(userId).doc(bill.id) : this.getCollection(userId).doc();
    const newBill = { ...bill, id: docRef.id };
    await docRef.set(newBill, { merge: true });
    return newBill;
  }

  async payBill(userId: string, billId: string): Promise<Bill | null> {
    const docRef = this.getCollection(userId).doc(billId);
    const doc = await docRef.get();
    if (!doc.exists) return null;
    const updatedBill = {
      ...(doc.data() as Bill),
      isPaid: true,
      paidAt: new Date().toISOString(),
    };
    await docRef.update(updatedBill);
    return updatedBill;
  }
}

export class SubscriptionRepository {
  private getCollection(userId: string) {
    return db.collection('users').doc(userId).collection('subscriptions');
  }

  async getSubscriptions(userId: string): Promise<Subscription[]> {
    const snapshot = await this.getCollection(userId).get();
    return snapshot.docs.map((doc) => doc.data() as Subscription);
  }

  async saveSubscription(userId: string, sub: Subscription): Promise<Subscription> {
    const docRef = sub.id ? this.getCollection(userId).doc(sub.id) : this.getCollection(userId).doc();
    const newSub = { ...sub, id: docRef.id };
    await docRef.set(newSub, { merge: true });
    return newSub;
  }
}

export class AIMemoryRepository {
  private getCollection(userId: string) {
    return db.collection('users').doc(userId).collection('ai_memories');
  }

  async getMemories(userId: string): Promise<any[]> {
    const snapshot = await this.getCollection(userId).get();
    return snapshot.docs.map((doc) => doc.data());
  }

  async saveMemory(userId: string, memory: Record<string, any>): Promise<any> {
    const docRef = memory.id ? this.getCollection(userId).doc(memory.id) : this.getCollection(userId).doc();
    const record = { ...memory, id: docRef.id };
    await docRef.set(record, { merge: true });
    return record;
  }
}

export const budgetRepository = new BudgetRepository();
export const goalRepository = new GoalRepository();
export const billRepository = new BillRepository();
export const subscriptionRepository = new SubscriptionRepository();
export const aiMemoryRepository = new AIMemoryRepository();
