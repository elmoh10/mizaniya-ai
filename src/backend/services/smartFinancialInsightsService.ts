import { getTrustedFinancialContext } from './financialContextService';
import { transactionRepository } from '../repositories/transactionRepository';

const money = (n:number) => Math.round((Number(n)||0)*100)/100;
const cairoToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const monthBefore = (monthKey:string) => { const [y,m]=monthKey.split('-').map(Number); const d=new Date(Date.UTC(y,m-2,1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; };

export async function buildSmartFinancialInsights(userId:string) {
  const context:any = await getTrustedFinancialContext(userId);
  const txs:any[] = (await transactionRepository.getTransactions(userId) as any[]) || [];
  const today = cairoToday(); const monthKey=today.slice(0,7); const previousMonthKey=monthBefore(monthKey); const day=Math.max(1,Number(today.slice(8,10)));
  const [y,m]=monthKey.split('-').map(Number); const daysInMonth=new Date(y,m,0).getDate(); const remainingDays=Math.max(0,daysInMonth-day);
  const activeTx=txs.filter(t=>!t.isDeleted);
  const monthTx=activeTx.filter(t=>String(t.date||'').startsWith(monthKey));
  const prevTx=activeTx.filter(t=>String(t.date||'').startsWith(previousMonthKey));
  const sumType=(items:any[],type:string)=>items.filter(t=>t.type===type).reduce((s,t)=>s+Number(t.amount||0),0);
  const expenses=sumType(monthTx,'expense'); const income=sumType(monthTx,'income'); const previousExpenses=sumType(prevTx,'expense');
  const walletBalance=(context.wallets||[]).filter((w:any)=>(w.currency||'EGP')==='EGP').reduce((s:number,w:any)=>s+Number(w.balance||0),0);
  const dailyBurn=expenses/day; const projectedSpend=dailyBurn*remainingDays;
  const commitments=Number(context.outstandingMonthlyCommitments||0)+Number(context.unpaidBillsThisMonthTotal||0);
  const projectedBalance=walletBalance-projectedSpend-commitments;
  const safe=Number(context.safeToSpend||0); const safeDaily=safe/Math.max(1,remainingDays+1);
  const baselineDailyBurn=Math.max(0,dailyBurn); const optimizedDailyBurn=safeDaily>0?Math.min(baselineDailyBurn,safeDaily):baselineDailyBurn*0.85; const stressDailyBurn=baselineDailyBurn*1.2;
  const scenarios={optimized:money(walletBalance-(optimizedDailyBurn*remainingDays)-commitments),baseline:money(projectedBalance),stress:money(walletBalance-(stressDailyBurn*remainingDays)-(commitments*1.1))};
  const runwayDays=baselineDailyBurn>0?Math.max(0,Math.floor(Math.max(0,walletBalance-commitments)/baselineDailyBurn)):null;
  let estimatedCashCrunchDate:string|null=null; if(runwayDays!==null&&runwayDays<=remainingDays&&baselineDailyBurn>0){const crunch=new Date(`${today}T12:00:00Z`);crunch.setUTCDate(crunch.getUTCDate()+runwayDays);estimatedCashCrunchDate=crunch.toISOString().slice(0,10);}

  const categoryMap=(items:any[])=>{const map=new Map<string,number>();items.filter(t=>t.type==='expense').forEach(t=>map.set(t.category||'Other',(map.get(t.category||'Other')||0)+Number(t.amount||0)));return map;};
  const byCategory=categoryMap(monthTx); const prevByCategory=categoryMap(prevTx); const top=[...byCategory.entries()].sort((a,b)=>b[1]-a[1])[0];
  const categoryIntelligence=[...byCategory.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8).map(([category,amount])=>{const previous=prevByCategory.get(category)||0;const changePercent=previous>0?Math.round(((amount-previous)/previous)*100):null;const suggestedMonthlyLimit=safe>0?money(Math.max(amount*0.75,Math.min(amount,safe*0.35))):money(amount*0.85);return{category,amount:money(amount),previousAmount:money(previous),changePercent,suggestedMonthlyLimit};});
  const monthChangePercent=previousExpenses>0?Math.round(((expenses-previousExpenses)/previousExpenses)*100):null;

  const expenseRows=monthTx.filter(t=>t.type==='expense'&&Number(t.amount)>0); const mean=expenseRows.length?expenses/expenseRows.length:0; const variance=expenseRows.length?expenseRows.reduce((s,t)=>s+Math.pow(Number(t.amount)-mean,2),0)/expenseRows.length:0; const sd=Math.sqrt(variance);
  const anomalies=expenseRows.filter(t=>expenseRows.length>=4&&Number(t.amount)>Math.max(mean+1.5*sd,mean*2)).sort((a,b)=>Number(b.amount)-Number(a.amount)).slice(0,5).map(t=>({id:t.id,title:t.title||t.description||'مصروف غير معتاد',amount:money(t.amount),date:t.date,category:t.category||'Other',reasonAr:`المبلغ أعلى بوضوح من متوسط العملية هذا الشهر (${money(mean)} ج.م).`,reason:`Amount is materially above this month's average transaction (${money(mean)} EGP).`}));

  const goals=(context.goals||[]).filter((g:any)=>!g.isArchived); const goalsProgress=goals.length?goals.reduce((s:number,g:any)=>s+(Number(g.targetAmount)>0?Math.min(1,Number(g.currentAmount||0)/Number(g.targetAmount)):0),0)/goals.length:0;
  const goalIntelligence=goals.map((g:any)=>{const target=Number(g.targetAmount||0),current=Number(g.currentAmount||0),remaining=Math.max(0,target-current);const due=new Date(`${g.targetDate||g.deadline||today}T12:00:00Z`);const now=new Date(`${today}T12:00:00Z`);const months=Math.max(1,Math.ceil((due.getTime()-now.getTime())/(30.44*86400000)));const monthlyNeeded=remaining/months;const affordability=safe>0?Math.min(100,Math.round((safe/Math.max(monthlyNeeded,1))*100)):0;return{id:g.id,title:g.title||g.name||'Goal',target:money(target),current:money(current),remaining:money(remaining),monthlyNeeded:money(monthlyNeeded),monthsRemaining:months,successProbabilityPercent:remaining<=0?100:Math.max(5,Math.min(95,affordability))};});
  const savingsRate=income>0?Math.max(-1,(income-expenses)/income):0; const risk:'LOW'|'MEDIUM'|'HIGH'=projectedBalance<0?'HIGH':projectedBalance<commitments||safeDaily<dailyBurn*0.7?'MEDIUM':'LOW';
  const recommendations:string[]=[]; if(projectedBalance<0) recommendations.push(`خفض المصروفات المرنة بنحو ${money(Math.abs(projectedBalance))} ج.م لتجنب العجز المتوقع.`); if(safeDaily>0&&dailyBurn>safeDaily) recommendations.push(`استهدف سقفًا يوميًا ${money(safeDaily)} ج.م بدل ${money(dailyBurn)} ج.م.`); if(top) recommendations.push(`راجع فئة ${top[0]}؛ تمثل أعلى صرف هذا الشهر بقيمة ${money(top[1])} ج.م.`); if(monthChangePercent!==null&&monthChangePercent>15) recommendations.push(`مصروفاتك أعلى ${monthChangePercent}% من الشهر السابق.`); if(!recommendations.length) recommendations.push('نمط الصرف الحالي مستقر؛ وجّه أي فائض للأهداف وصندوق الطوارئ.');
  const timeline:any[]=[]; if(projectedBalance<0)timeline.push({id:'cash-crunch',type:'warning',title:'Cash crunch risk',titleAr:'تنبيه عجز متوقع',description:`Projected month-end balance ${money(projectedBalance)} EGP.`,descriptionAr:`بالمعدل الحالي الرصيد المتوقع آخر الشهر ${money(projectedBalance)} ج.م.`,date:today,amountImpact:money(projectedBalance),icon:'TriangleAlert',color:'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300'}); else timeline.push({id:'forecast',type:'prediction',title:'Month-end forecast',titleAr:'توقع نهاية الشهر',description:`Projected balance ${money(projectedBalance)} EGP.`,descriptionAr:`الرصيد المتوقع آخر الشهر ${money(projectedBalance)} ج.م، والمتاح الآمن ${money(safe)} ج.م.`,date:today,amountImpact:money(projectedBalance),icon:'TrendingUp',color:'bg-cyan-50 border-cyan-200 text-cyan-800 dark:bg-cyan-950/30 dark:border-cyan-900 dark:text-cyan-300'});
  anomalies.forEach((a,i)=>timeline.push({id:`anomaly-${i}`,type:'warning',title:'Unusual spending',titleAr:'مصروف غير معتاد',description:a.reason,descriptionAr:`${a.title}: ${a.amount} ج.م. ${a.reasonAr}`,date:a.date||today,amountImpact:a.amount,icon:'TriangleAlert',color:'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300'}));
  return {today,monthKey,previousMonthKey,income:money(income),expenses:money(expenses),previousMonthExpenses:money(previousExpenses),monthChangePercent,netCashFlow:money(income-expenses),walletBalance:money(walletBalance),dailyBurn:money(dailyBurn),safeToSpend:money(safe),safeDaily:money(safeDaily),projectedRemainingSpend:money(projectedSpend),remainingCommitments:money(commitments),projectedMonthEndBalance:money(projectedBalance),runwayDays,estimatedCashCrunchDate,scenarios,risk,topCategory:top?{category:top[0],amount:money(top[1])}:null,categoryIntelligence,anomalies,goalIntelligence,recommendations,goalsCount:goals.length,goalsProgressPercent:Math.round(goalsProgress*100),savingsRatePercent:Math.round(savingsRate*100),timeline};
}
