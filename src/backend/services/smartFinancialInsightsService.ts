import { getTrustedFinancialContext } from './financialContextService';
import { transactionRepository } from '../repositories/transactionRepository';

const money = (n:number) => Math.round((Number(n)||0)*100)/100;
const cairoToday = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Africa/Cairo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());

export async function buildSmartFinancialInsights(userId:string) {
  const context:any = await getTrustedFinancialContext(userId);
  const txs:any[] = (await transactionRepository.getTransactions(userId) as any[]) || [];
  const today = cairoToday(); const monthKey=today.slice(0,7); const day=Math.max(1,Number(today.slice(8,10)));
  const [y,m]=monthKey.split('-').map(Number); const daysInMonth=new Date(y,m,0).getDate(); const remainingDays=Math.max(0,daysInMonth-day);
  const monthTx=txs.filter(t=>!t.isDeleted && String(t.date||'').startsWith(monthKey));
  const expenses=monthTx.filter(t=>t.type==='expense').reduce((s,t)=>s+Number(t.amount||0),0);
  const income=monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+Number(t.amount||0),0);
  const walletBalance=(context.wallets||[]).filter((w:any)=>(w.currency||'EGP')==='EGP').reduce((s:number,w:any)=>s+Number(w.balance||0),0);
  const dailyBurn=expenses/day; const projectedSpend=dailyBurn*remainingDays;
  const commitments=Number(context.outstandingMonthlyCommitments||0)+Number(context.unpaidBillsThisMonthTotal||0);
  const projectedBalance=walletBalance-projectedSpend-commitments;
  const safe=Number(context.safeToSpend||0); const safeDaily=safe/Math.max(1,remainingDays+1);
  const baselineDailyBurn = Math.max(0, dailyBurn);
  const optimizedDailyBurn = safeDaily > 0 ? Math.min(baselineDailyBurn, safeDaily) : baselineDailyBurn * 0.85;
  const stressDailyBurn = baselineDailyBurn * 1.2;
  const optimizedProjection = walletBalance - (optimizedDailyBurn * remainingDays) - commitments;
  const stressProjection = walletBalance - (stressDailyBurn * remainingDays) - (commitments * 1.1);
  const runwayDays = baselineDailyBurn > 0 ? Math.max(0, Math.floor(Math.max(0, walletBalance - commitments) / baselineDailyBurn)) : null;
  let estimatedCashCrunchDate: string | null = null;
  if (runwayDays !== null && runwayDays <= remainingDays && baselineDailyBurn > 0) {
    const crunch = new Date(`${today}T12:00:00Z`);
    crunch.setUTCDate(crunch.getUTCDate() + runwayDays);
    estimatedCashCrunchDate = crunch.toISOString().slice(0, 10);
  }
  const scenarios = {
    optimized: money(optimizedProjection),
    baseline: money(projectedBalance),
    stress: money(stressProjection),
  };
  const byCategory=new Map<string,number>(); monthTx.filter(t=>t.type==='expense').forEach(t=>byCategory.set(t.category||'Other',(byCategory.get(t.category||'Other')||0)+Number(t.amount||0)));
  const top=[...byCategory.entries()].sort((a,b)=>b[1]-a[1])[0];
  const goals=(context.goals||[]).filter((g:any)=>!g.isArchived); const goalsProgress=goals.length?goals.reduce((s:number,g:any)=>s+(Number(g.targetAmount)>0?Math.min(1,Number(g.currentAmount||0)/Number(g.targetAmount)):0),0)/goals.length:0;
  const savingsRate=income>0?Math.max(-1,(income-expenses)/income):0;
  let risk:'LOW'|'MEDIUM'|'HIGH'=projectedBalance<0?'HIGH':projectedBalance<commitments||safeDaily<dailyBurn*0.7?'MEDIUM':'LOW';
  const timeline:any[]=[];
  if(projectedBalance<0) timeline.push({id:'cash-crunch',type:'warning',title:'Cash crunch risk',titleAr:'تنبيه عجز متوقع',description:`Projected month-end balance ${money(projectedBalance)} EGP.`,descriptionAr:`بالمعدل الحالي الرصيد المتوقع آخر الشهر ${money(projectedBalance)} ج.م. قلل الصرف المرن وراجع الالتزامات القادمة.`,date:today,amountImpact:money(projectedBalance),icon:'TriangleAlert',color:'bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900 dark:text-rose-300'});
  else timeline.push({id:'forecast',type:'prediction',title:'Month-end forecast',titleAr:'توقع نهاية الشهر',description:`Projected balance ${money(projectedBalance)} EGP.`,descriptionAr:`الرصيد المتوقع آخر الشهر ${money(projectedBalance)} ج.م، والمتاح الآمن ${money(safe)} ج.م.`,date:today,amountImpact:money(projectedBalance),icon:'TrendingUp',color:'bg-cyan-50 border-cyan-200 text-cyan-800 dark:bg-cyan-950/30 dark:border-cyan-900 dark:text-cyan-300'});
  if(top) timeline.push({id:'top-category',type:'warning',title:'Top spending category',titleAr:'أعلى فئة صرف',description:`${top[0]}: ${money(top[1])} EGP`,descriptionAr:`أعلى فئة صرف هذا الشهر هي ${top[0]} بإجمالي ${money(top[1])} ج.م.`,date:today,amountImpact:money(top[1]),icon:'ChartPie',color:'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-300'});
  if(goals.length) timeline.push({id:'goals',type:goalsProgress>=1?'achievement':'milestone',title:'Savings goals',titleAr:'تقدم أهداف الادخار',description:`Average progress ${Math.round(goalsProgress*100)}%.`,descriptionAr:`متوسط تقدم أهدافك ${Math.round(goalsProgress*100)}% عبر ${goals.length} هدف.`,date:today,icon:'Target',color:'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300'});
  return {today,monthKey,income:money(income),expenses:money(expenses),netCashFlow:money(income-expenses),walletBalance:money(walletBalance),dailyBurn:money(dailyBurn),safeToSpend:money(safe),safeDaily:money(safeDaily),projectedRemainingSpend:money(projectedSpend),remainingCommitments:money(commitments),projectedMonthEndBalance:money(projectedBalance),runwayDays,estimatedCashCrunchDate,scenarios,risk,topCategory:top?{category:top[0],amount:money(top[1])}:null,goalsCount:goals.length,goalsProgressPercent:Math.round(goalsProgress*100),savingsRatePercent:Math.round(savingsRate*100),timeline};
}
