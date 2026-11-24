import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stateAt,packetAt,timeStops,timeline} from '../site/routing-demo/model.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../site/routing-demo/scenarios.json',import.meta.url)));
const first=data.scenes.find(s=>s.id==='surviving-contact'),second=data.scenes.find(s=>s.id==='stale-backup');

test('processed traces cover all policies with and without retained backups',()=>{
  assert.equal(data.schema,2);assert.equal(data.scenes.length,5);
  for(const scene of data.scenes){assert.equal(Object.keys(scene.cases).length,scene.comparisons.length*2);
    const physical=new Set(scene.links.map(e=>[e.source,e.target].sort().join(':')));
    for(const run of Object.values(scene.cases)){
      assert.ok(run.packet.native_verified);assert.ok(run.states.length>0);
      assert.ok(run.states.every((s,i,a)=>!i||s.time>=a[i-1].time));
      assert.equal(run.packet.path.length,run.packet.arrivals.length);
      assert.equal(run.packet.transmissions,run.packet.path.length-1);
      assert.equal(run.packet.revisits,run.packet.path.length-new Set(run.packet.path).size);
      for(let i=1;i<run.packet.path.length;i++)assert.ok(physical.has([run.packet.path[i-1],run.packet.path[i]].sort().join(':')));
    }
  }
});
test('cached backup recovers through one revisit and three ISLs',()=>{
  const run=first.cases['none:1'];assert.equal(run.packet.outcome,'delivered');
  assert.deepEqual(run.packet.path,[1,0,1,2,3]);assert.equal(run.packet.isls,3);assert.equal(run.packet.revisits,1);
  const after=packetAt(first,run,first.view[1]);assert.equal(after.status,'delivered');assert.equal(after.isls,3);assert.equal(after.revisits,1);
});
test('the first packet drops without a usable retained backup',()=>{
  for(const key of ['poisoned_reverse:1','simple_split_horizon:1','none:0'])assert.equal(first.cases[key].packet.outcome,'no_route');
});
test('the packet returns to B after B changes its active set',()=>{
  const run=first.cases['none:1'];const returnTime=run.packet.arrivals[2];
  assert.deepEqual(stateAt(run,returnTime).nodes[1].active,[2]);
  assert.ok(stateAt(run,-3).nodes[0].standby.includes(1));
  assert.ok(!stateAt(first.cases['poisoned_reverse:1'],-3).nodes[0].standby.includes(1));
});
test('simple split horizon leaves the mutually dependent candidates cached',()=>{
  const run=second.cases['simple_split_horizon:1'];assert.equal(run.packet.outcome,'ttl_expired');
  assert.equal(run.packet.isls,63);assert.deepEqual(stateAt(run,100).nodes[0].active,[1]);assert.deepEqual(stateAt(run,100).nodes[1].active,[0]);
  assert.ok(run.omissions.length>0);assert.equal(run.messages.length,0);
});
test('no suppression can terminate by losing its route, not by delivery',()=>{
  const run=second.cases['none:1'];assert.equal(run.packet.outcome,'no_route');assert.ok(run.packet.revisits>0);
  assert.ok(run.packet.isls<63);assert.ok(second.cases['none:1'].messages.some(m=>m.metric===9));
});
test('timeline seek reconstructs the same state without accumulated animation history',()=>{
  const run=first.cases['none:1'],end=packetAt(first,run,30);packetAt(first,run,-10);
  assert.deepEqual(packetAt(first,run,30),end);assert.equal(packetAt(first,run,-10).status,'pending');
  const stops=timeStops(first,Object.values(first.cases));assert.ok(stops.includes(0));assert.ok(stops.includes(run.packet.finished));
  assert.ok(timeline(first,first.cases['simple_split_horizon:1']).some(e=>e.type==='omit'));
});
test('in-flight packet position and counters follow exact recorded departure times',()=>{
  const run=first.cases['none:1'];const p=packetAt(first,run,0);assert.equal(p.leg.source,1);assert.equal(p.leg.target,0);assert.ok(Math.abs(p.leg.progress-.5)<1e-8);
  assert.equal(p.isls,1);assert.equal(p.revisits,0);
});
test('source payload is limited to synthetic trace fields',()=>{
  const text=JSON.stringify(data);
  for(const forbidden of ['/home/','/tmp/','users.csv','gateway-candidates','population.tif','prepared.json','rip_ocm_'])assert.ok(!text.includes(forbidden),forbidden);
});

test('same-time response is ordered before the receive that changes the sender route',()=>{
  const run=first.cases['poisoned_reverse:1'];
  const response=run.messages.find(m=>m.source===1&&m.target===0&&m.kind==='response');
  const poison=run.messages.find(m=>m.source===0&&m.target===1&&m.metric===9);
  assert.equal(response.sent,poison.arrival);
  assert.ok(response.sent_order<poison.receive_order);
  const events=timeline(first,run);
  assert.ok(events.findIndex(e=>e.message_id===response.id&&e.phase==='send')<events.findIndex(e=>e.message_id===poison.id&&e.phase==='receive'));
  assert.deepEqual(stateAt(run,response.sent).nodes[1].active,[2]);
});
test('each delivered control message has its own recorded receive order',()=>{
  for(const scene of data.scenes)for(const run of Object.values(scene.cases)){
    const orders=[];
    for(const message of run.messages){
      assert.ok(Number.isInteger(message.sent_order));orders.push(message.sent_order);
      if(message.delivered){assert.ok(message.receive_order>message.sent_order);orders.push(message.receive_order);}
    }
    assert.equal(orders.length,new Set(orders).size);
  }
});
test('timing sweep discloses phases where every policy already delivers',()=>{
  const sweep=data.timing_sensitivity;assert.equal(sweep.flows,1000);
  for(const t of [-10,10,15])for(const policy of data.policies){
    assert.equal(sweep.rows.find(r=>r.injection_ms===t).results[policy.id].delivered,1000);
  }
  const selected=sweep.rows.find(r=>r.injection_ms===-2.5);
  assert.equal(selected.results.poisoned_reverse.delivered,505);
  assert.equal(selected.results.none.delivered,1000);
});

test('new comparisons retain both successful and failed paths',()=>{
 const find=id=>data.scenes.find(s=>s.id===id);
 assert.equal(find('neighbor-exports').cases['neighbor_specific:1'].packet.outcome,'delivered');
 for(const r of Object.values(find('shared-exit').cases))assert.notEqual(r.packet.outcome,'delivered');
 for(const [id,hops,outcome] of [['cooldown_0',3,'delivered'],['cooldown_50',9,'delivered'],['cooldown_500',63,'ttl_expired']]){
  const r=find('trigger-cooldown').cases[id+':1'];assert.equal(r.packet.isls,hops);assert.equal(r.packet.outcome,outcome);
 }
 for(const scene of data.scenes)for(const row of scene.timing_sensitivity.rows)for(const c of scene.comparisons){
  const r=row.results[c.id];assert.equal(r.delivered+r.no_route+r.ttl_drops,scene.timing_sensitivity.flows);
 }
});

test('advertisement scene compares all four distinct methods',()=>{
 const s=data.scenes.find(s=>s.id==='neighbor-exports');
 assert.deepEqual(s.comparisons.map(c=>c.id),['poisoned_reverse','simple_split_horizon','none','neighbor_specific']);
 assert.equal(Object.keys(s.cases).length,8);
});
