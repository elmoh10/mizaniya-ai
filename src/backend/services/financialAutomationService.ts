import { transactionRepository } from '../repositories/transactionRepository';
import { subscriptionRepository } from '../repositories/budgetAndGoalRepositories';
import { buildSmartFinancialInsights } from './smartFinancialInsightsService';

const money=(n:number)=>Math.round((Number(n)||0)*100)/100;
const dateOnly=(v:any)=>String(v||'').slice(0,10);
const daysBetween=(a:string,b:string)=>Math.round((new Date(b+'T12:00:00Z').getTime()-new Date(a+'T12:00:00Z').getTime())/86400000);
const normalize=(s:any)=>String(s||'').toLowerCase().replace(/[\d٠-٩.,،]/g,'').replace(/جنيه|ج\.م|egp|من الكاش|كاش|بطاقه|بطاقة/g,'').replace(/\s+/g,' ').trim();

export async function detectRecurringSubscriptions(userId:string){
  const txs:any[]=(await transactionRepository.getTransactions(userId) as any[]||[]).filter(t=>!t.isDeleted&&t.type==='expense'&&Number(t.amount)>0&&dateOnly(t.date));
  const groups=new Map<string,any[]>();
  for(const t of txs){ const key=normalize(t.description||t.title||t.notes||t.category); if(key.length<2) continue; const a=groups.get(key)||[]; a.push(t); groups.set(key,a); }
  const candidates:any[]=[];
  for(const [key,items0] of groups){
    const items=[...items0].sort((a,b)=>dateOnly(a.date).localeCompare(dateOnly(b.date))); if(items.length<2) continue;
    const amounts=items.map(x=>Number(x.amount)); const avg=amounts.reduce((a,b)=>a+b,0)/amounts.length; const variance=Math.max(...amounts.map(a=>Math.abs(a-avg)/Math.max(1,avg)));
    const gaps=items.slice(1).map((x,i)=>daysBetween(dateOnly(items[i].date),dateOnly(x.date))); const avgGap=gaps.reduce((a,b)=>a+b,0)/gaps.length;
    const monthly=avgGap>=24&&avgGap<=38, yearly=avgGap>=330&&avgGap<=400; if(!monthly&&!yearly||variance>.2) continue;
    const last=dateOnly(items[items.length-1].date); const next=new Date(last+'T12:00:00Z'); monthly?next.setUTCMonth(next.getUTCMonth()+1):next.setUTCFullYear(next.getUTCFullYear()+1);
    candidates.push({key,name:items[items.length-1].description||items[items.length-1].title||key,amount:money(avg),cycle:monthly?'monthly':'yearly',occurrences:items.length,confidence:Math.min(99,Math.round(70+Math.min(20,items.length*5)+(variance<.05?9:0))),lastChargedAt:last,nextExpectedDate:next.toISOString().slice(0,10),category:items[items.length-1].category||'Other'});
  }
  return candidates.sort((a,b)=>b.confidence-a.confidence);
}

export async function buildSmartAlerts(userId:string){
  const x:any=await buildSmartFinancialInsights(userId); const subs=await detectRecurringSubscriptions(userId); const alerts:any[]=[];
  if(x.projectedMonthEndBalance<0) alerts.push({id:'cash-crunch',severity:'critical',titleAr:'عجز متوقع قبل نهاية الشهر',messageAr:`لو استمر نفس نمط الصرف، العجز المتوقع ${money(Math.abs(x.projectedMonthEndBalance))} ج.م.`,actionAr:'قلل الصرف المرن وراجع الفواتير والالتزامات القادمة.'});
  if(x.safeDaily>0&&x.dailyBurn>x.safeDaily) alerts.push({id:'burn-rate',severity:'warning',titleAr:'معدل الصرف أعلى من الآمن',messageAr:`متوسطك ${money(x.dailyBurn)} ج.م يوميًا مقابل ${money(x.safeDaily)} ج.م آمن.`,actionAr:`حاول تخفض الصرف اليومي بحوالي ${money(x.dailyBurn-x.safeDaily)} ج.م.`});
  if(x.topCategory) alerts.push({id:'top-category',severity:'info',titleAr:'أعلى فئة صرف',messageAr:`${x.topCategory.category}: ${money(x.topCategory.amount)} ج.م هذا الشهر.`,actionAr:'راجع العمليات داخل الفئة وابحث عن مصروفات قابلة للتقليل.'});
  if(subs.length) alerts.push({id:'subscriptions',severity:'info',titleAr:'اشتراكات متكررة محتملة',messageAr:`اكتشفت ${subs.length} نمط دفع متكرر محتمل.`,actionAr:'راجعها وألغِ أي اشتراك لا تستخدمه.'});
  return {generatedAt:new Date().toISOString(),risk:x.risk,alerts,subscriptions:subs.slice(0,10)};
}

export async function buildWeeklyFinancialReport(userId:string){
  const txs:any[]=(await transactionRepository.getTransactions(userId) as any[]||[]).filter(t=>!t.isDeleted);
  const end=new Date(); const start=new Date(end); start.setDate(end.getDate()-6); const s=start.toISOString().slice(0,10), e=end.toISOString().slice(0,10);
  const week=txs.filter(t=>dateOnly(t.date)>=s&&dateOnly(t.date)<=e); const expenses=week.filter(t=>t.type==='expense').reduce((a,t)=>a+Number(t.amount||0),0); const income=week.filter(t=>t.type==='income').reduce((a,t)=>a+Number(t.amount||0),0);
  const by=new Map<string,number>(); week.filter(t=>t.type==='expense').forEach(t=>by.set(t.category||'Other',(by.get(t.category||'Other')||0)+Number(t.amount||0))); const top=[...by.entries()].sort((a,b)=>b[1]-a[1])[0];
  const smart:any=await buildSmartFinancialInsights(userId); const auto=await buildSmartAlerts(userId);
  const actions:string[]=[]; if(smart.dailyBurn>smart.safeDaily&&smart.safeDaily>0) actions.push(`خلي سقفك اليومي حوالي ${money(smart.safeDaily)} ج.م.`); if(top) actions.push(`راجع ${top[0]} لأنها أعلى فئة هذا الأسبوع.`); if(auto.subscriptions.length) actions.push(`راجع ${auto.subscriptions.length} اشتراك/دفع متكرر محتمل.`); if(!actions.length) actions.push('استمر على نفس نمط الصرف ووجّه أي فائض لهدف ادخار.');
  return {period:{from:s,to:e},income:money(income),expenses:money(expenses),net:money(income-expenses),topCategory:top?{category:top[0],amount:money(top[1])}:null,monthEndForecast:smart.projectedMonthEndBalance,risk:smart.risk,actions:actions.slice(0,3)};
}
