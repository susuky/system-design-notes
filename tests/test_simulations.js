/* Run: node tests/test_simulations.js. Tests all six live system-design simulation models. */
'use strict';
const assert = require('node:assert/strict');
const { definitions } = require('../source/simulations.js');

const keys = Object.keys(definitions);
assert.deepEqual(keys, ['routing', 'cache', 'queue', 'quorum', 'breaker', 'hashing']);

// 1. Routing: least-work avoids slow server B backlog compared to round-robin
{
  const d = definitions.routing;
  const roundCfg = { arrivals: 6, strategy: 'round' };
  const sRound = d.start(roundCfg);
  d.action(sRound, roundCfg, 'step');
  d.action(sRound, roundCfg, 'step');
  assert.equal(sRound.workers[1].queue.length, 2);

  const workCfg = { arrivals: 6, strategy: 'work' };
  const sWork = d.start(workCfg);
  d.action(sWork, workCfg, 'step');
  d.action(sWork, workCfg, 'step');
  assert.equal(sWork.workers.reduce((sum, w) => sum + w.queue.length, 0), 0);
}

// 2. Cache TTL: write leaves stale v1 until TTL expires unless invalidate is chosen
{
  const d = definitions.cache;
  const ttlCfg = { ttl: 2, policy: 'ttl' };
  const s = d.start(ttlCfg);
  d.action(s, ttlCfg, 'write');
  d.action(s, ttlCfg, 'read');
  assert.equal(s.returned, 1);
  assert.equal(s.stale, 1);
  d.action(s, ttlCfg, 'time');
  d.action(s, ttlCfg, 'time');
  d.action(s, ttlCfg, 'read');
  assert.equal(s.returned, 2);

  const invCfg = { ttl: 4, policy: 'invalidate' };
  const s2 = d.start(invCfg);
  d.action(s2, invCfg, 'write');
  d.action(s2, invCfg, 'read');
  assert.equal(s2.returned, 2);
  assert.equal(s2.stale, 0);
}

// 3. Queue backpressure: pause retains pending at source, reject refuses overflow
{
  const d = definitions.queue;
  const pauseCfg = { arrivals: 7, service: 3, policy: 'pause' };
  const s = d.start(pauseCfg);
  d.action(s, pauseCfg, 'step');
  d.action(s, pauseCfg, 'step');
  assert.equal(s.depth, 5);
  assert.equal(s.pending, 3);
  assert.equal(s.refused, 0);

  const rejectCfg = { arrivals: 7, service: 3, policy: 'reject' };
  d.action(s, rejectCfg, 'step');
  assert.equal(s.pending, 0);
  assert.equal(s.refused, 7);
}

// 4. Quorum: W+R <= 3 can return stale, W+R > 3 guarantees latest
{
  const d = definitions.quorum;
  const weakCfg = { writes: 1, reads: 1 };
  const s = d.start(weakCfg);
  d.action(s, weakCfg, 'write');
  d.action(s, weakCfg, 'read');
  assert.equal(s.stale, 1);

  const strongCfg = { writes: 2, reads: 2 };
  d.action(s, strongCfg, 'write');
  d.action(s, strongCfg, 'read');
  assert.equal(s.stale, 1); // no new stale read
}

// 5. Breaker: storm multiplies downstream calls; breaker opens after 3 failures, cools to Half-Open, closes on recovery
{
  const d = definitions.breaker;
  const stormCfg = { arrivals: 4, mode: 'storm' };
  const sStorm = d.start(stormCfg);
  d.action(sStorm, stormCfg, 'step');
  assert.equal(sStorm.downstreamHits, 12);
  assert.equal(sStorm.fastFailed, 0);

  const brkCfg = { arrivals: 4, mode: 'breaker' };
  const sBrk = d.start(brkCfg);
  d.action(sBrk, brkCfg, 'step');
  assert.equal(sBrk.status, 'Open');
  assert.equal(sBrk.downstreamHits, 3);
  assert.equal(sBrk.fastFailed, 1);

  d.action(sBrk, brkCfg, 'step');
  assert.equal(sBrk.downstreamHits, 3);
  assert.equal(sBrk.fastFailed, 5);

  d.action(sBrk, brkCfg, 'cool');
  d.action(sBrk, brkCfg, 'cool');
  assert.equal(sBrk.status, 'Half-Open');
  d.action(sBrk, brkCfg, 'toggle-downstream'); // healthy = true
  d.action(sBrk, brkCfg, 'step');
  assert.equal(sBrk.status, 'Closed');
  assert.equal(sBrk.succeeded, 4);
}

// 6. Hashing: scaling from 3 to 4 shards moves fewer keys on consistent ring than modulo
{
  const d = definitions.hashing;
  const modCfg = { strategy: 'modulo', vnodes: 3 };
  const sMod = d.start(modCfg);
  d.action(sMod, modCfg, 'toggle-d');
  const modMoved = sMod.moved;

  const ringCfg = { strategy: 'ring', vnodes: 3 };
  const sRing = d.start(ringCfg);
  d.action(sRing, ringCfg, 'toggle-d');
  const ringMoved = sRing.moved;

  assert.ok(modMoved > ringMoved, `expected modulo (${modMoved}) to move more keys than ring (${ringMoved})`);
  assert.ok(ringMoved > 0 && ringMoved <= 5);
}

console.log('System design simulations: PASS — all 6 live simulation models verified.');
