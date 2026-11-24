import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stateAt,packetAt,timeStops,timeline} from '../site/routing-demo/model.mjs';
const data=JSON.parse(fs.readFileSync(new URL('../site/routing-demo/scenarios.json',import.meta.url)));
const first=data.scenes.find(s=>s.id==='surviving-contact'),second=data.scenes.find(s=>s.id==='stale-backup');

test('processed traces cover all policies with and without retained backups',()=>{
  assert.equal(data.schema,1);assert.equal(data.scenes.length,2);
  for(const scene of data.scenes){assert.equal(Object.keys(scene.cases).length,6);
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
