import {EPS,stateAt,packetAt,timeStops,timeline,formatMs} from './model.mjs';
const $=id=>document.getElementById(id);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let data,scene,runs,stops,events,time=0,playing=false,lastFrame=0,selected=0,frameId=0;
const policies=['poisoned_reverse','simple_split_horizon','none'];
const rules={poisoned_reverse:'Advertise ∞ back to every active successor',simple_split_horizon:'Omit the reverse entry; silence is not withdrawal',none:'Advertise the finite metric in both directions'};
const colors={active:'#19755a',backup:'#8055a9',packet:'#c23785',message:'#c2771b',poison:'#b44848'};
const outcomeLabel=s=>({pending:'Not injected',in_flight:'In flight',delivered:'Delivered',no_route:'Dropped: no route',ttl_expired:'Dropped: TTL'})[s];
const edgeKey=(a,b)=>[a,b].sort((x,y)=>x-y).join(':');
function line(a,b,offset=0,trim=0){let x=b.x-a.x,y=b.y-a.y,d=Math.hypot(x,y)||1,nx=-y/d,ny=x/d;return {x1:a.x+nx*offset+x/d*trim,y1:a.y+ny*offset+y/d*trim,x2:b.x+nx*offset-x/d*trim,y2:b.y+ny*offset-y/d*trim};}
function position(a,b,p,offset=0){const l=line(a,b,offset);return {x:l.x1+(l.x2-l.x1)*p,y:l.y1+(l.y2-l.y1)*p};}
function svgLine(points,extra=''){return `<line x1="${points.x1}" y1="${points.y1}" x2="${points.x2}" y2="${points.y2}" ${extra}/>`;}
function graph(run,index){
  const states=stateAt(run,time).nodes,packet=packetAt(scene,run,time),nodes=scene.nodes;
  const withdrawn=new Set(scene.withdrawals.filter(w=>w.time<=time+EPS).map(w=>edgeKey(w.source,w.target)));
  let svg=`<svg class="graph" viewBox="0 0 500 310" role="img" aria-label="${escape(data.policies[index].label)} topology at ${formatMs(time)}"><defs><marker id="active-${index}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6" fill="${colors.active}"/></marker><marker id="backup-${index}" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L6,3 L0,6" fill="${colors.backup}"/></marker></defs>`;
  for(const e of scene.links){const a=nodes[e.source],b=nodes[e.target],l=line(a,b);const off=withdrawn.has(edgeKey(a.id,b.id));
    svg+=svgLine(l,`stroke="${off?'#c28a43':'#dce1e3'}" stroke-width="${off?2:3}" ${off?'stroke-dasharray="5 5"':''}`);
    const center=position(a,b,.5);svg+=`<text x="${center.x}" y="${center.y+(e.kind==='isl'?-13:0)}" text-anchor="middle" fill="#83909a" font-size="10">${e.delay_ms} ms${off?' · withdrawn':''}</text>`;
  }
  for(const node of nodes){if(node.kind!=='satellite')continue;
    for(const [kind,targets] of [['backup',states[node.id].standby],['active',states[node.id].active]]){
      for(const dest of targets){const l=line(node,nodes[dest],5,25);svg+=svgLine(l,`stroke="${colors[kind]}" stroke-width="${node.id===selected?2.5:1.6}" opacity="${node.id===selected?1:.55}" ${kind==='backup'?'stroke-dasharray="4 4"':''} marker-end="url(#${kind}-${index})"`);}
    }
  }
  if($('updates').checked){for(const m of run.messages){if(time<m.sent-EPS||time>=m.arrival-EPS)continue;
    const p=position(nodes[m.source],nodes[m.target],(time-m.sent)/(m.arrival-m.sent),-13),poison=m.metric>=data.constants.infinity;
    const text=m.kind==='request'?'?':m.metric===null?'–':poison?'∞':m.metric;
    svg+=`<g><title>${escape(`${nodes[m.source].label} → ${nodes[m.target].label}: ${m.kind==='request'?'request':`metric ${text}`}; arrives ${formatMs(m.arrival)}`)}</title><circle cx="${p.x}" cy="${p.y}" r="10" fill="${m.kind==='request'?'#4e789c':poison?colors.poison:colors.message}" stroke="white" stroke-width="2"/><text x="${p.x}" y="${p.y+3.5}" fill="white" font-size="10" text-anchor="middle" font-weight="700">${text}</text></g>`;
  }}
  for(const node of nodes){const s=states[node.id],selectedNode=node.id===selected;
    svg+=`<g role="button" tabindex="0" data-node="${node.id}" aria-label="Inspect ${node.kind} ${escape(node.label)}" aria-pressed="${selectedNode}"><title>Inspect ${escape(node.label)} in all three policies</title>`;
    if(selectedNode)svg+=`<circle cx="${node.x}" cy="${node.y}" r="28" fill="none" stroke="#567a9b" stroke-width="1.5" stroke-dasharray="3 3"/>`;
    if(node.kind==='gateway')svg+=`<rect x="${node.x-21}" y="${node.y-19}" width="42" height="38" rx="8" fill="#e7f2ee" stroke="#27785e" stroke-width="1.8"/>`;
    else svg+=`<circle cx="${node.x}" cy="${node.y}" r="21" fill="white" stroke="${s.metric>=9?'#ba6666':'#697d8c'}" stroke-width="1.8"/>`;
    svg+=`<text x="${node.x}" y="${node.y+5}" text-anchor="middle" fill="#2e4251" font-size="15" font-weight="650">${escape(node.label)}</text><text x="${node.x}" y="${node.y+39}" text-anchor="middle" fill="${s.metric>=9?'#b44848':'#73808a'}" font-size="10">${node.kind==='gateway'?'shared anycast prefix':`metric ${s.metric>=9?'∞':s.metric}`}</text></g>`;
  }
  if(packet.node!==null){const p=packet.leg?position(nodes[packet.leg.source],nodes[packet.leg.target],packet.leg.progress):nodes[packet.node];const color=packet.status==='delivered'?colors.active:packet.status.startsWith('no_')||packet.status==='ttl_expired'?colors.poison:colors.packet;
    svg+=`<circle cx="${p.x}" cy="${p.y}" r="9" fill="${color}" stroke="white" stroke-width="3" pointer-events="none"><title>Data packet: ${outcomeLabel(packet.status)}</title></circle>`;
  }
  return svg+'</svg>';
}
function inspection(run){
  const node=scene.nodes[selected],state=stateAt(run,time).nodes[selected],metric=state.metric>=9?'∞':state.metric;
  if(node.kind==='gateway')return `<h4>${escape(node.label)} · prefix origin</h4><p class="node-state">Origin metric 1. All gateways in this scene advertise the same destination prefix.</p>`;
  const names=ids=>ids.map(i=>scene.nodes[i].label).join(', ')||'none';
  let html=`<h4>Inspect ${escape(node.label)} <span style="font-weight:400;color:#7a8490">· click any node above</span></h4><p class="node-state">Metric <strong>${metric}</strong> · active: <strong>${escape(names(state.active))}</strong><br>Standby: ${escape(names(state.standby))}</p><table><thead><tr><th>Via</th><th>Local cost</th><th>Role</th><th>Receipt age</th></tr></thead><tbody>`;
  const peers=scene.links.filter(e=>e.source===selected||e.target===selected).map(e=>e.source===selected?e.target:e.source);
  for(const peer of peers){const candidate=state.candidates.find(c=>c.neighbor===peer),role=state.active.includes(peer)?'active':state.standby.includes(peer)?'backup':null;
    const received=run.messages.filter(m=>m.kind!=='request'&&m.source===peer&&m.target===selected&&m.delivered&&m.arrival<=time+EPS).at(-1);
    const cost=candidate?candidate.cost:received?.metric>=9?'∞':'—';
    const age=candidate?`${Math.max(0,(time-candidate.received)/1000).toFixed(3)} s`:'—';
    html+=`<tr><td>${escape(scene.nodes[peer].label)}</td><td>${cost}</td><td>${role?`<span class="tag ${role}">${role}</span>`:'not retained'}</td><td>${age}</td></tr>`;
  }
  return html+'</tbody></table>';
}
function render(){
  $('time').value=time;$('clock').textContent=formatMs(time);
  policies.forEach((policy,index)=>{
    const run=runs[index],packet=packetAt(scene,run,time),panel=document.querySelector(`[data-policy="${policy}"]`);
    panel.querySelector('.isls').textContent=packet.isls;panel.querySelector('.revisits').textContent=packet.revisits;
    const status=panel.querySelector('.status');status.textContent=outcomeLabel(packet.status);status.className='status '+(packet.status==='delivered'?'delivered':['no_route','ttl_expired'].includes(packet.status)?'dropped':'');
    panel.querySelector('.graph-host').innerHTML=graph(run,index);panel.querySelector('.inspect').innerHTML=inspection(run);
    const visible=events[index].filter(e=>e.time<=time+EPS).slice(-5).reverse();
    panel.querySelector('.event-list').innerHTML=visible.map(e=>`<div class="event ${e.type}"><time>${formatMs(e.time)}</time><span>${escape(e.text)}</span></div>`).join('')||'<p style="font-size:11px;color:#778291">Routes are prepared. Packet has not been injected.</p>';
  });
  $('previous').disabled=!stops.some(x=>x<time-EPS);$('next').disabled=!stops.some(x=>x>time+EPS);
  const url=new URL(location.href);url.searchParams.set('scene',scene.id);url.searchParams.set('backups',$('backups').checked?'1':'0');url.searchParams.set('t',time.toFixed(3));url.searchParams.set('node',selected);history.replaceState(null,'',url);
}
function setTime(t){time=Math.max(scene.view[0],Math.min(scene.view[1],t));render();}
function pause(){playing=false;cancelAnimationFrame(frameId);$('play').textContent='▶ Play';$('play').setAttribute('aria-label','Play animation');}
function play(){if(time>=scene.view[1]-EPS)setTime(scene.view[0]);playing=true;lastFrame=performance.now();$('play').textContent='Ⅱ Pause';$('play').setAttribute('aria-label','Pause animation');frameId=requestAnimationFrame(frame);}
function frame(now){if(!playing)return;const dt=Math.min(150,now-lastFrame);lastFrame=now;
  setTime(time+dt/15000*(scene.view[1]-scene.view[0])*Number($('speed').value));
  if(time>=scene.view[1]-EPS)pause();else frameId=requestAnimationFrame(frame);
}
function chooseScene(reset=true){
  pause();scene=data.scenes.find(s=>s.id===$('scene').value);if(selected>=scene.nodes.length)selected=0;
  runs=policies.map(p=>scene.cases[`${p}:${$('backups').checked?1:0}`]);events=runs.map(r=>timeline(scene,r));stops=timeStops(scene,runs);
  $('time').min=scene.view[0];$('time').max=scene.view[1];$('start-time').textContent=formatMs(scene.view[0]);$('end-time').textContent=formatMs(scene.view[1]);
  $('scene-title').textContent=scene.title;$('scene-description').textContent=scene.description;
  $('scene-note').textContent=$('backups').checked?'All learned higher-cost backups are retained. Orange contacts are withdrawn from routing; the physical 5-second guard remains.':'Higher-cost backups are discarded. Equal-cost multipath remains enabled. Compare the final outcomes with backups turned on.';
  $('panels').innerHTML=policies.map((p,i)=>`<article class="panel" data-policy="${p}"><div class="panel-head"><h3>${escape(data.policies[i].label)}</h3><p class="policy-rule">${rules[p]}</p></div><div class="metrics"><div>ISL hops sent<strong class="isls">0</strong></div><div>Revisits<strong class="revisits">0</strong></div><div>Packet state<strong class="status">Pending</strong></div></div><div class="graph-host"></div><div class="inspect"></div><div class="events"><h4>Latest events · simulated clock</h4><div class="event-list"></div></div></article>`).join('');
  $('comparison').innerHTML=runs.map((r,i)=>`<tr><td>${escape(data.policies[i].label)}</td><td>${outcomeLabel(r.packet.outcome)}</td><td>${r.packet.isls}</td><td>${r.packet.revisits}</td><td>${(r.packet.finished-r.packet.injected).toFixed(2)} ms</td></tr>`).join('');
  setTime(reset?scene.view[0]:time);
}
$('play').addEventListener('click',()=>playing?pause():play());$('time').addEventListener('input',e=>{pause();setTime(Number(e.target.value));});
$('previous').addEventListener('click',()=>{pause();setTime(stops.filter(x=>x<time-EPS).at(-1)??scene.view[0]);});
$('next').addEventListener('click',()=>{pause();setTime(stops.find(x=>x>time+EPS)??scene.view[1]);});
$('reset').addEventListener('click',()=>{pause();setTime(scene.view[0]);});
$('scene').addEventListener('change',()=>chooseScene());$('backups').addEventListener('change',()=>chooseScene(false));$('updates').addEventListener('change',()=>render());
document.querySelectorAll('[data-jump]').forEach(button=>button.addEventListener('click',()=>{pause();const target=button.dataset.jump;setTime(target==='injection'?runs[0].packet.injected:target==='withdrawal'?0:Math.max(...runs.map(r=>r.packet.finished)));}));
function selectNode(e){const target=e.target.closest('[data-node]');if(!target)return;if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;if(e.type==='keydown')e.preventDefault();selected=Number(target.dataset.node);render();}
$('panels').addEventListener('click',selectNode);$('panels').addEventListener('keydown',selectNode);
try{
  const response=await fetch('./scenarios.json');if(!response.ok)throw new Error(`Trace request failed (${response.status})`);data=await response.json();
  if(data.schema!==1)throw new Error('Unsupported trace schema');
  const params=new URLSearchParams(location.search);if(data.scenes.some(s=>s.id===params.get('scene')))$('scene').value=params.get('scene');
  $('backups').checked=params.get('backups')!=='0';selected=Math.max(0,Math.min(3,Number(params.get('node'))||0));
  const c=data.constants;$('assumptions').innerHTML=`<ul><li>ISL propagation: ${c.isl_delay_ms} ms</li><li>GSL propagation: ${c.gsl_delay_ms} ms</li><li>Infinity: ${c.infinity}; unit link costs, origin metric 1</li><li>TTL: ${c.ttl} (at most 63 transmissions)</li><li>Triggered-update cooldown: ${c.trigger_cooldown_ms} ms</li><li>Receipt timeout: ${c.route_timeout_seconds} s</li><li>Periodic update: 30 ± 5 s</li><li>Frozen preparation: ${c.frozen_warmup_seconds} s</li><li>Stable per-flow hashing; flow ${c.flow_id}</li><li>All equal-cost active hops; optional higher-cost standbys</li></ul>`;
  chooseScene();if(params.has('t')&&Number.isFinite(Number(params.get('t'))))setTime(Number(params.get('t')));
  window.routingDemo={get time(){return time;},get scene(){return scene.id;},get playing(){return playing;},setTime,
    snapshot:()=>runs.map(r=>packetAt(scene,r,time))};
}catch(error){pause();$('error').hidden=false;$('error').textContent=`The processed trace could not be loaded. ${error.message}`;console.error(error);}
