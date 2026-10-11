/* Run: node tests/test_labs.js. Uses Node built-ins only; no browser/network required. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const labs = require('../source/labs.js');
const {algorithms, config} = labs;
let traces = 0, framesChecked = 0, assertions = 0;
function ok(value, message) {assertions++; assert.ok(value, message);}
function equal(actual, expected, message) {assertions++; assert.deepEqual(actual, expected, message);}
function run(key, input, minFrames = 1) {
  const original = JSON.stringify(input);
  const frames = algorithms[key](input); traces++;
  equal(JSON.stringify(input), original, `${key}: input must not mutate`);
  ok(frames.length >= minFrames && frames.length <= 512, `${key}: bounded, meaningful trace`);
  frames.forEach((f, i) => {
    framesChecked++;
    equal(f.kind, key);
    equal(f.done, i === frames.length - 1, `${key}: only the last frame is terminal`);
    ok(f.phase.length > 0 && f.explanation.length >= 8);
    ok(f.lanes.length >= 2 && Object.keys(f.vars).length >= 3);
    ok(f.checks.length >= 2 && f.checks.every(c => c.ok && c.label));
    if (!f.done) equal(f.result, null);
    if (i) ok(f.state !== frames[i - 1].state, 'state snapshots are independent');
    ok(JSON.stringify(f).indexOf('undefined') < 0);
  });
  ok(frames.at(-1).result !== null);
  return frames;
}
function last(key, input) {return run(key, input).at(-1);}
function sequences(length, max) {
  if (!length) return [[]];
  return sequences(length - 1, max).flatMap(xs => Array.from({length: max + 1}, (_, i) => [...xs, i]));
}

// Every shipped example has enough observable events, valid checks and one terminal state.
for (const c of config) {
  const frames = run(c.key, c.defaults, 8);
  equal(frames, algorithms[c.key](c.defaults), `${c.key}: traces must be deterministic`);
  const lastSnapshot = JSON.stringify(frames.at(-1));
  frames[0].state.testMutation = true;
  equal(JSON.stringify(frames.at(-1)), lastSnapshot, `${c.key}: changing a previous frame cannot affect later frames`);
  ok(c.assumption.length > 35 && c.principle.length > 25 && c.stop.length > 15);
}
equal(config.map(c => c.key), Object.keys(algorithms));

// Cache: stale is about the committed version, including writes with the same value.
for (const invalidation of ['immediate', 'delayed', 'none']) for (const initial of [-99, 0, 10, 999]) for (const updated of [-99, 0, 10, 999]) {
  const f = last('cache', {initial, updated, invalidation});
  equal(f.result.reads.map(r => r.value), [initial, invalidation === 'immediate' ? updated : initial, invalidation === 'none' ? initial : updated]);
  equal(f.result.reads.map(r => r.version), [1, invalidation === 'immediate' ? 2 : 1, invalidation === 'none' ? 1 : 2]);
  equal(f.result.stale, {immediate: 0, delayed: 1, none: 2}[invalidation]);
  equal(f.state.invalidation, false);
  equal(f.state.pendingRead, null);
  equal(f.state.hits + f.state.misses, 3);
}

// Queue: independent count-only oracle plus frame-level ownership and FIFO checks.
function queueReference(arrivals, capacity, service, policy) {
  let waiting = 0, queued = 0, completed = 0, rejected = 0;
  for (const count of arrivals) {
    waiting += count;
    const admitted = Math.min(capacity - queued, waiting); waiting -= admitted; queued += admitted;
    if (policy === 'reject') {rejected += waiting; waiting = 0;}
    const done = Math.min(service, queued); completed += done; queued -= done;
  }
  if (service > 0) {completed += waiting + queued; waiting = 0; queued = 0;}
  return {completed, rejected, backlog: waiting + queued};
}
for (const arrivals of sequences(3, 3)) for (let capacity = 1; capacity <= 4; capacity++) for (let service = 0; service <= 4; service++) for (const policy of ['pause', 'reject']) {
  const trace = run('queue', {arrivals, capacity, service, policy});
  equal(trace.at(-1).result, queueReference(arrivals, capacity, service, policy));
  const total = arrivals.reduce((a, b) => a + b, 0), result = trace.at(-1).result;
  equal(result.completed + result.rejected + result.backlog, total);
  for (const {state: s} of trace) {
    ok(s.queue.length <= capacity);
    const inventory = [...s.pending, ...s.queue, ...s.completed, ...s.rejected];
    equal(inventory.length, s.offered.length);
    equal(new Set(inventory).size, inventory.length);
    ok(s.completed.every((id, i, a) => i === 0 || Number(id.slice(1)) > Number(a[i - 1].slice(1))));
  }
  if (policy === 'pause') equal(result.rejected, 0);
  if (service > 0) equal(result.backlog, 0);
}
for (const policy of ['pause', 'reject']) for (const service of [0, 4]) run('queue', {arrivals: Array(8).fill(6), capacity: 1, service, policy});

// Retry: atomic dedupe protects one operation ID; identical payload with a different ID is distinct.
for (const amount of [1, 5, 100]) for (let lostAcks = 0; lostAcks <= 3; lostAcks++) for (const dedupe of ['on', 'off']) {
  const frames = run('retry', {amount, lostAcks, dedupe});
  const end = frames.at(-1);
  equal(end.result.deliveries, lostAcks + 2);
  equal(end.result.commits, dedupe === 'on' ? 2 : lostAcks + 2);
  equal(end.result.balance, end.result.commits * amount);
  equal(end.state.acked, ['M1', 'M2']);
  equal(end.state.records, dedupe === 'on' ? ['M1', 'M2'] : []);
  for (const {state: s} of frames) {
    equal(s.balance, s.commits.length * amount);
    if (dedupe === 'on') {equal(s.records, [...new Set(s.commits)]); equal(s.commits.length, new Set(s.commits).size);}
    ok(s.acked.every(id => s.commits.includes(id)));
  }
  equal(frames.filter(f => f.phase === 'ACK 遺失').length, lostAcks);
  equal(frames.filter(f => f.phase === '略過重複效果').length, dedupe === 'on' ? lostAcks : 0);
}

// Replication: journal suffix, prefix application, monotone offsets and per-read session guarantees.
for (const writes of [[1], [0], [-99, 999], [1, 1, 1, 1], [40, 0, -10, 12]]) for (let lag = 0; lag <= 3; lag++) for (const readMode of ['replica', 'leader', 'session']) {
  const frames = run('replication', {writes, lag, readMode});
  let primary = 0, replica = 0, clock = 0;
  for (const {state: s} of frames) {
    ok(s.primary.version >= primary && s.replica.version >= replica && s.clock >= clock);
    [primary, replica, clock] = [s.primary.version, s.replica.version, s.clock];
    equal(s.pending.map(x => x.version), Array.from({length: primary - replica}, (_, i) => replica + i + 1));
    equal(s.replica.value, replica === 0 ? 0 : writes[replica - 1]);
    equal(s.primary.value, primary === 0 ? 0 : writes[primary - 1]);
    if (readMode === 'leader') ok(s.reads.every(r => r.version === r.primaryVersion && r.source === '主節點'));
    if (readMode === 'session') ok(s.reads.every(r => r.version >= r.token));
  }
  const end = frames.at(-1);
  equal(end.state.primary, end.state.replica);
  equal(end.state.pending, []);
  equal(end.result.version, writes.length);
  equal(end.result.reads.length, writes.length + 1);
  if (readMode === 'replica') equal(end.result.stale, lag >= 2 ? writes.length : 0);
  else equal(end.result.stale, 0);
}

// Token bucket: independent arithmetic oracle, overflow handling, zero refill and impossible request costs.
function tokenReference(arrivals, capacity, rate, cost) {
  let tokens = capacity, granted = 0, rejected = 0;
  arrivals.forEach((count, tick) => {
    if (tick) tokens = Math.min(capacity, tokens + rate);
    const admitted = Math.min(count, Math.floor(tokens / cost));
    tokens -= admitted * cost; granted += admitted; rejected += count - admitted;
  });
  return {granted, rejected, tokens, consumed: granted * cost};
}
for (const arrivals of sequences(3, 3)) for (let capacity = 1; capacity <= 4; capacity++) for (let rate = 0; rate <= 3; rate++) for (let cost = 1; cost <= 5; cost++) {
  const frames = run('token-bucket', {arrivals, capacity, rate, cost});
  equal(frames.at(-1).result, tokenReference(arrivals, capacity, rate, cost));
  for (const {state: s} of frames) {
    ok(s.tokens >= 0 && s.tokens <= capacity);
    equal(s.tokens, capacity + s.added - s.consumed);
    equal(s.consumed, s.granted.length * cost);
    equal(s.granted.length + s.rejected.length, s.offered);
    ok(s.consumed <= capacity + s.tick * rate);
  }
}
const overflow = last('token-bucket', {arrivals: [0, 0, 0, 6], capacity: 4, rate: 3, cost: 1});
equal(overflow.state.spilled, 9); equal(overflow.result, {granted: 4, rejected: 2, tokens: 0, consumed: 4});
run('token-bucket', {arrivals: Array(8).fill(6), capacity: 8, rate: 4, cost: 8});

// Consistent hashing: interval ownership oracle with explicit wraparound and exact endpoint coverage.
function modularOwner(nodes, key) {
  return nodes.reduce((best, node) => ((node.position - key + 100) % 100) < ((best.position - key + 100) % 100) ? node : best).id;
}
for (const nodes of [[15, 45, 80], [0, 1], [1, 99], [0, 50, 99], [98, 99]]) for (let added = 0; added < 100; added++) {
  if (nodes.includes(added)) continue;
  // Every ring coordinate is exercised over ten small, valid user inputs.
  for (let start = 0; start < 100; start += 10) {
    const keys = Array.from({length: 10}, (_, i) => start + i);
    const end = last('hashing', {nodes, added, keys});
    const oldNodes = end.state.oldNodes, newNodes = end.state.newNodes;
    const predecessor = newNodes[(newNodes.findIndex(n => n.id === 'N') - 1 + newNodes.length) % newNodes.length].position;
    keys.forEach((key, i) => {
      const id = 'K' + (i + 1), before = modularOwner(oldNodes, key), after = modularOwner(newNodes, key);
      equal(end.result.before[id], before); equal(end.result.after[id], after);
      const inInterval = predecessor < added ? key > predecessor && key <= added : key > predecessor || key <= added;
      equal(end.result.moved.includes(id), inInterval);
      ok(before === after || after === 'N');
    });
    equal(new Set(end.result.moved).size, end.result.moved.length);
  }
}
const duplicateKeys = last('hashing', {nodes: [80, 15, 45], added: 60, keys: [50, 50]});
equal(duplicateKeys.result.moved, ['K1', 'K2']);

// Reject malformed and out-of-range input without silently coercing or dropping fields.
function invalid(key, patch) {
  const input = {...config.find(c => c.key === key).defaults, ...patch};
  assertions++; assert.throws(() => algorithms[key](input), Error, `${key}: ${JSON.stringify(patch)}`);
}
for (const raw of ['', ' ', '1e2', '0x10', '1.5', 'NaN', 'Infinity', null, undefined, true, '<img>']) {
  invalid('cache', {initial: raw}); invalid('token-bucket', {capacity: raw});
}
for (const raw of ['', '1,,2', ',1', '1,', '1， ，2', '1x', [], Array(11).fill(1)]) invalid('hashing', {keys: raw});
invalid('queue', {arrivals: '-1,2'}); invalid('queue', {arrivals: '7'}); invalid('queue', {arrivals: Array(9).fill(0)});
invalid('queue', {service: -1}); invalid('queue', {capacity: 0}); invalid('queue', {policy: 'unbounded'});
invalid('cache', {updated: 1000}); invalid('cache', {invalidation: 'sometimes'});
invalid('retry', {amount: 0}); invalid('retry', {lostAcks: 4}); invalid('retry', {dedupe: 'maybe'});
invalid('replication', {writes: Array(5).fill(1)}); invalid('replication', {lag: 4}); invalid('replication', {readMode: 'quorum'});
invalid('token-bucket', {rate: 5}); invalid('token-bucket', {cost: 0});
invalid('hashing', {nodes: '15,15,80'}); invalid('hashing', {nodes: '1'}); invalid('hashing', {added: 15}); invalid('hashing', {keys: '100'});
equal(labs.numbers('1， 2 3,4', 'test', 0, 9), [1, 2, 3, 4]);

// Escaping is tested separately from numeric validation so renderers remain safe if data changes.
const escaped = labs.visualHTML({lanes: [{label: '<img onerror="x">', cells: [{label: '<script>alert(1)</script>', status: ''}]}]});
ok(!escaped.includes('<script>') && !escaped.includes('<img'));
ok(escaped.includes('&lt;script&gt;'));
equal(labs.escape('a&b"\'<>'), 'a&amp;b&quot;&#39;&lt;&gt;');

// DOM controller contract. A tiny event-capable element stub checks controls without installing a DOM package.
class Element {
  constructor(data = {}) {Object.assign(this, {dataset: {}, value: '', innerHTML: '', textContent: '', hidden: false, disabled: false, attributes: {}, events: {}}, data);}
  addEventListener(type, fn) {(this.events[type] ||= []).push(fn);}
  setAttribute(key, value) {this.attributes[key] = value;}
  removeAttribute(key) {delete this.attributes[key];}
  fire(type) {for (const fn of this.events[type] || []) fn({preventDefault() {}});}
}
function fixture(c) {
  const fields = c.fields.map(field => new Element({name: field.name, value: c.defaults[field.name]}));
  const form = new Element(); form.querySelectorAll = selector => selector === 'input, select' ? fields : [];
  const controls = ['prev', 'next', 'reset', 'last'].map(action => new Element({dataset: {sdAction: action}}));
  const found = {'form': form};
  for (const cls of ['error', 'visual', 'vars', 'checks', 'explanation', 'phase', 'step']) found['.sd-lab-' + cls] = new Element();
  for (const button of controls) found[`[data-sd-action="${button.dataset.sdAction}"]`] = button;
  const container = new Element({dataset: {sdLab: c.key}});
  container.querySelector = selector => found[selector] || null;
  container.querySelectorAll = selector => selector === '[data-sd-action]' ? controls : [];
  return {container, fields, form, controls, found};
}
for (const c of config) {
  const f = fixture(c), controller = labs.mount(f.container);
  const button = action => f.controls.find(b => b.dataset.sdAction === action);
  equal(controller.position, 0); equal(f.container.dataset.step, '0'); equal(f.container.dataset.done, 'false');
  ok(button('prev').disabled && !button('next').disabled);
  const originalFrames = controller.frames, originalInitial = f.found['.sd-lab-visual'].innerHTML;
  button('next').fire('click'); equal(controller.position, 1);
  button('prev').fire('click'); equal(controller.position, 0); equal(f.found['.sd-lab-visual'].innerHTML, originalInitial);
  button('prev').fire('click'); equal(controller.position, 0);
  button('last').fire('click'); equal(controller.position, originalFrames.length - 1);
  equal(f.container.dataset.done, 'true'); ok(button('next').disabled && button('last').disabled);
  button('next').fire('click'); equal(controller.position, originalFrames.length - 1);
  button('reset').fire('click'); equal(controller.position, 0); equal(f.found['.sd-lab-visual'].innerHTML, originalInitial);
  button('next').fire('click'); const position = controller.position, visual = f.found['.sd-lab-visual'].innerHTML;
  const oldValue = f.fields[0].value; f.fields[0].value = 'invalid'; f.form.fire('submit');
  equal(controller.position, position); equal(controller.frames, originalFrames); equal(f.found['.sd-lab-visual'].innerHTML, visual);
  equal(f.found['.sd-lab-error'].hidden, false); ok(f.fields.every(field => field.attributes['aria-invalid'] === 'true'));
  f.fields[0].value = oldValue; f.form.fire('submit'); equal(controller.position, 0);
  equal(f.found['.sd-lab-error'].hidden, true); ok(f.fields.every(field => !field.attributes['aria-invalid']));
  const copy = controller.frames; copy[0].state.corrupt = true; ok(!controller.frames[0].state.corrupt);
  equal(labs.mount(f.container), controller); equal(f.form.events.submit.length, 1);
  equal(labs.init({querySelectorAll: selector => selector === '[data-sd-lab]' ? [f.container] : []}), [controller]);
  button('next').fire('click'); equal(controller.position, 1, 'remount must not add duplicate event listeners');
  // All control boundaries stay stable under repeated clicks.
  for (let i = 0; i < originalFrames.length + 3; i++) button('next').fire('click');
  equal(controller.position, originalFrames.length - 1);
  for (let i = 0; i < originalFrames.length + 3; i++) button('prev').fire('click');
  equal(controller.position, 0);
}
assertions++; assert.throws(() => labs.mount(new Element({dataset: {sdLab: 'unknown'}})), /未知/);

// Browser UMD branch, no implicit global document access and no CommonJS requirement.
const source = fs.readFileSync(path.join(__dirname, '../source/labs.js'), 'utf8');
const context = {}; vm.createContext(context); vm.runInContext(source, context);
ok(context.SystemDesignLabs && typeof context.SystemDesignLabs.init === 'function');
equal(JSON.stringify(context.SystemDesignLabs.algorithms.cache(config[0].defaults)), JSON.stringify(algorithms.cache(config[0].defaults)));
ok(!/\b(fetch|XMLHttpRequest|WebSocket|setInterval|setTimeout|eval)\s*\(/.test(source));

// Shipped static mount: unique IDs, complete labels and no collision with the preserved legacy labs.
const html = fs.readFileSync(path.join(__dirname, '../source/labs.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../source/labs.css'), 'utf8');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
equal(ids.length, new Set(ids).size);
equal([...html.matchAll(/data-sd-lab="([^"]+)"/g)].map(m => m[1]), config.map(c => c.key));
equal((html.match(/<section class="sd-lab"/g) || []).length, 6);
ok(!html.includes('<article') && !html.includes('data-lab=') && !html.includes('class="lab-controls"'));
for (const c of config) {
  ok(ids.includes(`lab-sd-${c.key}`));
  for (const f of c.fields) ok(html.includes(`for="lab-sd-${c.key}-${f.name}"`));
  ok(html.includes(labs.escape(c.assumption)) && html.includes(labs.escape(c.stop)));
}
equal((html.match(/role="status"/g) || []).length, 6); equal((html.match(/role="alert"/g) || []).length, 6);
ok(css.includes('@media print') && css.includes('@media(max-width:650px)') && css.includes('focus-visible'));
console.log(`System design labs: PASS — ${traces.toLocaleString()} traces, ${framesChecked.toLocaleString()} frames, ${assertions.toLocaleString()} assertions; six DOM controllers and UMD/HTML contracts checked.`);
