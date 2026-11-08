import { chromium } from '@playwright/test';
const S='/tmp/claude-1000/-home-hjung-orca-workspaces-analytics-platform-lane-release/75004714-d2d4-40c5-8605-4a15977357b1/scratchpad/shots';
const DS='14810000-0000-4000-8000-000000000001', RUN='14810000-0000-4000-8000-000000000401', FAILED='14810000-0000-4000-8000-000000000403';
const inv=n=>'/log/explorer/14730000-0000-4000-8000-00000000000'+n+'?v=1';
const routes={
 explorer:'/log/explorer?v=1', inv1:inv(1), inv8:inv(8), inv6:inv(6),
 datasets:'/log-dev/log-datasets', dsdetail:'/log-dev/log-dataset/'+DS, run:'/log-dev/log-dataset-run/'+DS+'/'+RUN, failed:'/log-dev/log-dataset-run/'+DS+'/'+FAILED,
 tokens:'/operations/service-tokens', equipment:'/equipment?v=1&scopeId=MEM&focus=MEM-PHOTO-0103',
};
const b=await chromium.launch(); 
for (const role of ['admin','viewer']) {
 const ctx=await b.newContext({viewport:{width:1440,height:900}});
 await ctx.addInitScript(r=>localStorage.setItem('platform:role',JSON.stringify(r)),role);
 for (const [k,u] of Object.entries(routes)) {
  const p=await ctx.newPage(); const errs=[];
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text().slice(0,200))}); p.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,200)));
  await p.goto('http://127.0.0.1:4590'+u); await p.waitForTimeout(1800);
  const h=await p.evaluate(()=>({h:document.querySelector('main h1')?.textContent, len:document.body.innerText.length, ov:document.documentElement.scrollWidth>innerWidth}));
  console.log(role,k,JSON.stringify(h),errs.length?errs:'');
  await p.screenshot({path:S+'/'+role+'-'+k+'.png'}); await p.close();
 }
 await ctx.close();
}
await b.close();
