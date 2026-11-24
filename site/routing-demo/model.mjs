/** Pure readers of the exported event trace. No routing is simulated here. */
export const EPS = 1e-7;
export function stateAt(run, time) {
  let lo=0, hi=run.states.length;
  while(lo<hi){const m=(lo+hi)>>1;if(run.states[m].time<=time+EPS)lo=m+1;else hi=m;}
  return run.states[Math.max(0,lo-1)];
}
export function packetAt(scene, run, time) {
  const p=run.packet;
  if(time<p.injected-EPS)return {status:'pending',isls:0,hops:0,revisits:0,path:[],node:null,leg:null};
  let arrived=0;while(arrived<p.arrivals.length&&p.arrivals[arrived]<=time+EPS)arrived++;
  const path=p.path.slice(0,arrived), finished=time>=p.finished-EPS;
  const sent=Math.min(p.path.length-1,arrived);
  let isls=0;for(let j=1;j<=sent;j++)if(scene.nodes[p.path[j]].kind==='satellite')isls++;
  let leg=null;
  if(!finished&&arrived<p.path.length){const i=arrived-1;leg={source:p.path[i],target:p.path[i+1],progress:Math.max(0,Math.min(1,(time-p.arrivals[i])/(p.arrivals[i+1]-p.arrivals[i])))};}
  return {status:finished?p.outcome:'in_flight',isls,hops:sent,revisits:path.length-new Set(path).size,
    path,node:path.at(-1),leg};
}
export function timeStops(scene, runs) {
  const times=[...scene.view,...scene.withdrawals.map(x=>x.time)];
  for(const run of runs){times.push(...run.states.map(x=>x.time),...run.packet.arrivals,run.packet.injected,run.packet.finished,
    ...run.messages.flatMap(x=>[x.sent,x.arrival]),...run.omissions.map(x=>x.time));}
  return [...new Set(times.map(x=>Math.round(x*1e7)/1e7))].filter(t=>t>=scene.view[0]&&t<=scene.view[1]).sort((a,b)=>a-b);
}
export function timeline(scene, run) {
  const name=i=>scene.nodes[i].label, metric=m=>m===null?'empty':m>=9?'∞':String(m);
  const items=scene.withdrawals.map(e=>({time:e.time,type:'contact',text:`${name(e.source)}–${name(e.target)} withdrawn from routing`}));
  for(const m of run.messages){
    items.push({time:m.sent,type:'send',text:m.kind==='request'?`${name(m.source)} → ${name(m.target)}: request`:`${name(m.source)} → ${name(m.target)}: advertise ${metric(m.metric)}`});
    items.push({time:m.arrival,type:'receive',text:`${name(m.target)} ${m.delivered?'receives':'does not receive'} ${m.kind==='request'?'request':metric(m.metric)} from ${name(m.source)}`});
  }
  for(const e of run.omissions)items.push({time:e.time,type:'omit',text:`${name(e.source)} → ${name(e.target)}: prefix omitted; no notification`});
  const seen=new Set();
  run.packet.path.forEach((node,i)=>{items.push({time:run.packet.arrivals[i],type:'packet',text:`Packet ${seen.has(node)?'revisits':'at'} ${name(node)}`});seen.add(node);});
  items.push({time:run.packet.finished,type:'outcome',text:run.packet.outcome==='delivered'?'Packet delivered':run.packet.outcome==='ttl_expired'?'Packet dropped: TTL exhausted':'Packet dropped: no route'});
  return items.filter(e=>e.time>=scene.view[0]-EPS&&e.time<=scene.view[1]+EPS).sort((a,b)=>a.time-b.time);
}
export const formatMs=t=>`${t<0?'−':''}${Math.abs(t).toFixed(2)} ms`;
