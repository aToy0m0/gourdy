// Pick a quiet boundary near the nominal minute. Padding stays inside the same
// measured silence, so overlapping audio cannot duplicate spoken words.
function quietBoundary(pcm, start, nominal, duration) {
 const frame=320, frames=Math.floor(pcm.length/4/frame), runs=[];
 let begin=null;
 for(let i=0;i<=frames;i++){
  let power=0;
  if(i<frames)for(let k=0;k<frame;k++){const v=pcm.readFloatLE((i*frame+k)*4);power+=v*v;}
  const quiet=i<frames&&Math.sqrt(power/frame)<0.003;
  if(quiet&&begin===null)begin=i;
  if(!quiet&&begin!==null){
   const a=start+begin*.02,b=start+i*.02;
   if(b-a>=.4&&b>=nominal-4&&a<=nominal+4)runs.push({a,b});
   begin=null;
  }
 }
 const choices=runs.map(({a,b})=>({at:Math.max(a+.2,Math.min(b-.2,nominal)),a,b}))
  .filter(x=>x.at>start+1&&x.at<duration&&Math.abs(x.at-nominal)<=4)
  .sort((a,b)=>Math.abs(a.at-nominal)-Math.abs(b.at-nominal));
 if(!choices.length)return {at:nominal,padding:0,reason:'no-silence'};
 return {at:Math.round(choices[0].at*1000)/1000,padding:.1,reason:'silence'};
}
module.exports={quietBoundary};
