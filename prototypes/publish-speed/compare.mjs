import fs from 'node:fs'; import path from 'node:path';
const [a,b]=process.argv.slice(2);
const text=f=>fs.readFileSync(f,'utf8').replace(/<script[\s\S]*?<\/script>/g,'').replace(/<style[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const links=f=>[...fs.readFileSync(f,'utf8').matchAll(/href="([^"]+)"/g)].map(m=>m[1]).filter(h=>!h.includes('_astro')).join('\n');
let n=0,d=0,l=0;
for (const f of fs.readdirSync(a,{recursive:true})) { if(!String(f).endsWith('.html')) continue; n++;
  const A=path.join(a,f),B=path.join(b,f); if(!fs.existsSync(B)){console.log('MISSING',f);d++;continue;}
  if(text(A)!==text(B)){d++; if(d<4){const x=text(A),y=text(B);let i=0;while(x[i]===y[i])i++;console.log('TEXT DIFF',f,'\n A:',x.slice(i-60,i+120),'\n B:',y.slice(i-60,i+120));}}
  if(links(A)!==links(B)) l++; }
console.log({pages:n,textDiffers:d,linksDiffer:l});
