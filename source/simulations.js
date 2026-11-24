(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SystemDesignSimulation = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const workerCapacity = [3, 1, 3];
  const nodeNames = ['A', 'B', 'C'];
  const shardNames = ['A', 'B', 'C', 'D'];
  const hashRingKeys = [17, 43, 68, 95, 124, 151, 188, 214, 249, 276, 307, 341];
  const queueCapacity = 8;
  const workerQueueLimit = 8;
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#sd-icon-${name}"></use></svg>`;
  const slots = (filled, total) => `<span class="sim-slots">${Array.from({length: total}, (_, index) =>
    `<i${index < filled ? ' class="is-filled"' : ''}></i>`).join('')}</span>`;

  function node(id, label, glyph, action = '') {
    const tag = action ? 'button' : 'div';
    const attrs = action ? ` type="button" data-sim-node-action="${action}"` : '';
    const marks = '<span class="sim-node-marks" aria-hidden="true"></span>';
    const art = glyph === 'queue' ? marks : `<svg viewBox="0 0 80 60" focusable="false"><use href="#sd-art-${glyph}"></use></svg>`;
    return `<${tag} class="sim-node sim-node-${glyph} sd-art-${glyph}" data-sim-node="${id}" style="grid-area:${id}"${attrs}>
      <span class="sim-node-art" aria-hidden="true">${art}</span>
      <strong class="sim-node-label">${label}</strong>
      <span class="sim-node-value"></span><span class="sim-node-detail"></span>${glyph === 'queue' ? '' : marks}
    </${tag}>`;
  }

  function diagram(id, kind, nodes, links) {
    return `<div class="sim-map sim-map-${kind}">
      <svg class="sim-connections" aria-hidden="true" focusable="false">
        <defs>${['idle', 'flow', 'warn'].map(tone => `<marker id="${id}-${tone}" markerUnits="userSpaceOnUse"
          markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto-start-reverse">
          <path class="sim-arrow-${tone}" d="M1 1 6 4 1 7z"/></marker>`).join('')}</defs>
        ${links.map(([from, to, shape, compact, label], index) => `<path class="sim-wire${index === 0 ? ' sim-entry-wire' : ''}"
          ${index ? `data-sim-wire="${index - 1}"` : ''} data-from="${from}" data-to="${to}"
          data-shape="${shape}"${compact ? ` data-compact="${compact}"` : ''}/>${label ? `<text class="sim-wire-note">${label}</text>` : ''}`).join('')}
      </svg>${nodes.join('')}</div>`;
  }

  // The wires use the rendered picture and label bounds, including wrapped lines.
  function drawWires(map, nodes) {
    const frame = map.getBoundingClientRect();
    if (!frame.width) return;
    const compact = getComputedStyle(map).getPropertyValue('--compact-links').trim() === '1';
    const ports = new Map();
    nodes.forEach((node, key) => {
      const art = node.querySelector('.sim-node-art').getBoundingClientRect();
      const edge = node.getBoundingClientRect();
      ports.set(key, {
        x: art.left + art.width / 2 - frame.left, y: art.top + art.height / 2 - frame.top,
        left: art.left - frame.left, right: art.right - frame.left, top: art.top - frame.top,
        bottom: edge.bottom - frame.top
      });
    });
    map.querySelectorAll('.sim-wire').forEach(wire => {
      const a = ports.get(wire.dataset.from), b = ports.get(wire.dataset.to);
      const shape = compact && wire.dataset.compact || wire.dataset.shape;
      let d;
      if (shape === 'down') {
        const middle = (a.bottom + b.top) / 2;
        d = `M${a.x} ${a.bottom + 2}V${middle}H${b.x}V${b.top - 2}`;
      } else if (shape === 'up') {
        d = `M${a.x} ${a.top - 1}V${b.bottom + 3}`;
      } else if (shape === 'under') {
        d = `M${a.x} ${a.bottom + 2}V${b.y}H${b.left - 2}`;
      } else if (shape === 'return') {
        d = `M${a.left - 1} ${a.y}H${b.x}V${b.bottom + 3}`;
      } else {
        const middle = (a.right + b.left) / 2;
        d = `M${a.right} ${a.y}H${middle}V${b.y}H${b.left - 2}`;
      }
      wire.setAttribute('d', d);
      const note = wire.nextElementSibling;
      if (note?.classList.contains('sim-wire-note')) {
        const up = shape === 'up';
        note.setAttribute('x', up ? a.x + 7 : (a.x + b.left) / 2);
        note.setAttribute('y', up ? (a.top + b.bottom) / 2 + 4 : b.y - 6);
        note.setAttribute('text-anchor', up ? 'start' : 'middle');
      }
    });
  }

  function routingStart(config, previous) {
    return {
      tick: 0, turn: 0, sent: 0, completed: 0, failed: 0, elapsed: 0,
      workers: workerCapacity.map((capacity, index) => ({
        capacity, online: previous?.workers[index].online ?? true, queue: [], routed: 0
      })),
      message: 'B 每拍只能完成 1 件。用輪詢送幾批，看看哪一台先開始排隊。'
    };
  }

  function routeBatch(state, config) {
    state.tick++;
    state.sent += config.arrivals;
    state.workers.forEach(worker => { worker.routed = 0; });
    const ready = state.workers.filter(worker => worker.online);
    let refused = 0;
    for (let i = 0; i < config.arrivals; i++) {
      if (!ready.length) { refused += config.arrivals - i; break; }
      const candidates = config.strategy === 'round' ? ready : ready.filter(worker => worker.queue.length < workerQueueLimit);
      if (!candidates.length) { refused++; continue; }
      const worker = config.strategy === 'round'
        ? candidates[state.turn++ % candidates.length]
        : candidates.reduce((best, item) => (item.queue.length + 1) / item.capacity < (best.queue.length + 1) / best.capacity ? item : best);
      if (worker.queue.length === workerQueueLimit) { refused++; continue; }
      worker.queue.push(state.tick);
      worker.routed++;
    }
    let completed = 0;
    for (const worker of ready) {
      const served = worker.queue.splice(0, worker.capacity);
      completed += served.length;
      state.elapsed += served.reduce((total, start) => total + state.tick - start + 1, 0);
    }
    state.completed += completed;
    state.failed += refused;
    const pending = state.workers.reduce((total, worker) => total + worker.queue.length, 0);
    const split = state.workers.map(worker => worker.routed).join('／');
    state.message = `A／B／C 分到 ${split} 件，這拍完成 ${completed} 件，還有 ${pending} 件在等。${refused ? `另有 ${refused} 件因離線或佇列滿而失敗。` : ''}`;
  }

  function toggleWorker(state, index) {
    const worker = state.workers[index];
    worker.online = !worker.online;
    const lost = worker.queue.splice(0).length;
    state.failed += lost;
    state.workers.forEach(item => { item.routed = 0; });
    state.message = worker.online
      ? `${nodeNames[index]} 已上線，下批請求會重新納入分派。`
      : `${nodeNames[index]} 已離線。${lost ? `原本排隊的 ${lost} 件計為失敗。` : ''}新請求只會送到上線的伺服器。`;
  }

  function cacheStart(config) {
    return {
      time: 0, version: 1, cached: 1, expires: config.ttl, cachedAt: 0, hits: 0, misses: 0, stale: 0,
      returned: null, latency: null, action: '',
      message: '先寫入 v2，再送出讀取。快取裡的 v1 何時會被換掉？'
    };
  }

  function cacheAction(state, config, action) {
    state.action = action;
    if (action === 'read') {
      if (state.cached !== null) {
        state.returned = state.cached;
        state.latency = 5;
        state.hits++;
        const stale = state.cached !== state.version;
        if (stale) state.stale++;
        state.message = `命中快取，5 ms 讀回 v${state.cached}。${stale ? `資料庫已是 v${state.version}，這次讀到舊版。` : ''}`;
      } else {
        state.action = 'miss';
        state.misses++;
        state.cached = state.version;
        state.returned = state.version;
        state.cachedAt = state.time;
        state.expires = state.time + config.ttl;
        state.latency = 70;
        state.message = `未命中，回資料庫讀 v${state.version} 並回填。這次花 70 ms，新快取保留 ${config.ttl} 秒。`;
      }
    } else if (action === 'write') {
      state.version++;
      if (config.policy === 'invalidate') state.cached = null;
      state.message = `資料庫已寫入 v${state.version}。${config.policy === 'invalidate' ? '快取同時失效，下次讀取會回源。' : '現有快取會留到原本的到期時間。'}`;
    } else if (action === 'time') {
      state.time++;
      if (state.cached !== null && state.time >= state.expires) {
        state.cached = null;
        state.message = `來到第 ${state.time} 秒，快取已到期。下一次讀取會回資料庫。`;
      } else {
        state.message = `來到第 ${state.time} 秒。${state.cached === null ? '快取目前是空的。' : `v${state.cached} 還可使用 ${state.expires - state.time} 秒。`}`;
      }
    } else if (action === 'clear') {
      state.cached = null;
      state.message = '已清除快取。下一次讀取會從資料庫取得最新版本。';
    }
  }

  function queueStart() {
    return {
      tick: 0, depth: 0, pending: 0, done: 0, refused: 0,
      admitted: 0, processed: 0, blocked: 0,
      message: '每拍先入列，再由 worker 處理。連走幾拍，觀察佇列滿後工作留在哪裡。'
    };
  }

  function queueBatch(state, config) {
    state.tick++;
    const offered = state.pending + config.arrivals;
    state.admitted = Math.min(offered, queueCapacity - state.depth);
    state.blocked = offered - state.admitted;
    state.lastPolicy = config.policy;
    state.pending = config.policy === 'pause' ? state.blocked : 0;
    if (config.policy === 'reject') state.refused += state.blocked;
    state.depth += state.admitted;
    state.processed = Math.min(state.depth, config.service);
    state.depth -= state.processed;
    state.done += state.processed;
    state.message = `這拍入列 ${state.admitted} 件，完成 ${state.processed} 件，還有 ${state.depth} 件在佇列。`;
    if (state.blocked) {
      state.message += config.policy === 'pause'
        ? `另有 ${state.blocked} 件留在來源，等待下一拍重送。`
        : `另有 ${state.blocked} 件被拒絕。`;
    }
  }

  function quorumStart(config, previous) {
    return {
      confirmed: 1, versions: [1, 1, 1], online: previous?.online.slice() || [true, true, true],
      contacted: [], result: '—', elapsed: '—', stale: 0, failed: 0, status: '',
      message: '把 W 和 R 都設成 1，寫入後立刻讀取，看看兩次操作找的是哪一個副本。'
    };
  }

  function quorumAction(state, config, action) {
    state.operation = action;
    const isWrite = action === 'write';
    const order = isWrite ? [0, 1, 2] : [2, 1, 0];
    const target = isWrite ? config.writes : config.reads;
    const available = order.filter(index => state.online[index]);
    if (action === 'sync') {
      state.contacted = available;
      for (const index of available) state.versions[index] = state.confirmed;
      state.result = available.length ? '同步完成' : '無上線副本';
      state.status = available.length ? 'flow' : 'warn';
      state.elapsed = '—';
      state.message = `把已確認的 v${state.confirmed} 送到 ${available.length} 個上線副本。離線副本保留原來的版本。`;
      return;
    }
    state.contacted = available.slice(0, target);
    if (available.length < target) {
      state.failed++;
      state.result = '仲裁失敗';
      state.elapsed = '—';
      state.status = 'warn';
      state.message = `${isWrite ? '寫入' : '讀取'}需要 ${target} 個回應，目前只有 ${available.length} 個副本上線。`;
      return;
    }

    const responseTimes = [14, 37, 68];
    state.elapsed = Math.max(...state.contacted.map(index => responseTimes[order.indexOf(index)])) + ' ms';
    const names = state.contacted.map(index => nodeNames[index]).join('、');
    if (isWrite) {
      state.confirmed++;
      for (const index of state.contacted) state.versions[index] = state.confirmed;
      state.result = '已確認 v' + state.confirmed;
      state.status = 'flow';
      state.message = `${names} 回應後，v${state.confirmed} 確認寫入。其他副本等到同步才會追上。`;
    } else {
      const version = Math.max(...state.contacted.map(index => state.versions[index]));
      if (version < state.confirmed) state.stale++;
      state.result = '讀到 v' + version;
      state.status = version < state.confirmed ? 'warn' : 'flow';
      state.message = `從 ${names} 取回的最高版本是 v${version}。${version < state.confirmed ? `最新已確認版本是 v${state.confirmed}。` : '已讀到最新的確認版本。'}`;
    }
  }

  const range = (key, name, min, max, value, unit) => ({key, name, min, max, value, unit});
  const select = (key, name, value, choices) => ({key, name, value, choices});

  function breakerStart(config, previous) {
    return {
      tick: 0, status: 'Closed', healthy: previous?.healthy ?? false,
      failures: 0, cooldown: 0, downstreamHits: 0, fastFailed: 0, succeeded: 0, failed: 0,
      lastHits: 0, lastFastFailed: 0,
      message: '下游目前正在故障。先用預設斷路器或切到「無保護重試」送幾批請求，再點下游讓它恢復。'
    };
  }

  function breakerAction(state, config, action) {
    if (action === 'toggle-downstream') {
      state.healthy = !state.healthy;
      state.lastHits = 0;
      state.lastFastFailed = 0;
      state.message = state.healthy
        ? '下游服務已恢復正常。若斷路器還在 Open，可先推進冷卻再試探。'
        : '下游服務開始故障（所有請求都會失敗）。';
      return;
    }
    if (action === 'cool') {
      state.tick++;
      state.lastHits = 0;
      state.lastFastFailed = 0;
      if (state.status === 'Open') {
        state.cooldown = Math.max(0, state.cooldown - 1);
        if (state.cooldown === 0) {
          state.status = 'Half-Open';
          state.message = '冷卻結束，斷路器切進 Half-Open，下一批只放 1 件探測請求過去。';
        } else {
          state.message = `冷卻中，還剩 ${state.cooldown} 拍才會進 Half-Open。`;
        }
      } else {
        state.message = state.status === 'Half-Open'
          ? '已經是 Half-Open，點「送一批請求」進行單筆探測。'
          : '目前是 Closed 狀態，不需冷卻。';
      }
      return;
    }
    state.tick++;
    state.lastHits = 0;
    state.lastFastFailed = 0;
    if (config.mode === 'storm') {
      if (state.healthy) {
        state.downstreamHits += config.arrivals;
        state.lastHits = config.arrivals;
        state.succeeded += config.arrivals;
        state.message = `無保護模式：${config.arrivals} 件一次通過，下游承受 ${config.arrivals} 次呼叫。`;
      } else {
        const hits = config.arrivals * 3;
        state.downstreamHits += hits;
        state.lastHits = hits;
        state.failed += config.arrivals;
        state.message = `無保護＋重試 3 次：${config.arrivals} 件全失敗，卻對故障下游打出了 ${hits} 次呼叫！`;
      }
      return;
    }
    if (state.status === 'Open') {
      state.fastFailed += config.arrivals;
      state.lastFastFailed = config.arrivals;
      state.message = `斷路器 Open：${config.arrivals} 件直接快速失敗，下游收到 0 次呼叫（冷卻剩 ${state.cooldown} 拍）。`;
      return;
    }
    if (state.status === 'Half-Open') {
      state.downstreamHits += 1;
      state.lastHits = 1;
      const rest = config.arrivals - 1;
      if (state.healthy) {
        state.status = 'Closed';
        state.failures = 0;
        state.cooldown = 0;
        state.downstreamHits += rest;
        state.lastHits += rest;
        state.succeeded += config.arrivals;
        state.message = `探測成功！斷路器回到 Closed，本批 ${config.arrivals} 件全數完成。`;
      } else {
        state.status = 'Open';
        state.cooldown = 2;
        state.failed += 1;
        state.fastFailed += rest;
        state.lastFastFailed = rest;
        state.message = `探測失敗，立刻退回 Open 重新冷卻 2 拍；其餘 ${rest} 件直接快速失敗。`;
      }
      return;
    }
    let batchFailed = 0;
    for (let i = 0; i < config.arrivals; i++) {
      if (state.status === 'Open') {
        state.fastFailed++;
        state.lastFastFailed++;
        continue;
      }
      state.downstreamHits++;
      state.lastHits++;
      if (state.healthy) {
        state.succeeded++;
        state.failures = 0;
      } else {
        state.failed++;
        batchFailed++;
        state.failures++;
        if (state.failures >= 3) {
          state.status = 'Open';
          state.cooldown = 2;
        }
      }
    }
    state.message = state.status === 'Open'
      ? `連續失敗達 3 次，斷路器跳開成 Open！本拍擋下後面 ${state.lastFastFailed} 件。`
      : state.healthy
        ? `斷路器 Closed：${config.arrivals} 件全部成功。`
        : `下游失敗 ${batchFailed} 次（連敗 ${state.failures}／3），還差 ${3 - state.failures} 次跳開。`;
  }

  function assignHashOwners(online, config) {
    const active = shardNames.map((_, index) => index).filter(index => online[index]);
    if (config.strategy === 'modulo') {
      return hashRingKeys.map(key => active[key % active.length]);
    }
    const ring = [];
    for (const shard of active) {
      for (let v = 0; v < config.vnodes; v++) {
        ring.push({ pos: (shard * 97 + v * 139 + 29) % 360, shard });
      }
    }
    ring.sort((a, b) => a.pos - b.pos || a.shard - b.shard);
    return hashRingKeys.map(key => {
      const hit = ring.find(node => node.pos >= key) || ring[0];
      return hit.shard;
    });
  }

  function hashingStart(config) {
    const online = [true, true, true, false];
    return {
      online,
      owners: assignHashOwners(online, config),
      moved: 0,
      changes: 0,
      lastStrategy: config.strategy,
      lastVnodes: config.vnodes,
      message: '目前有 A、B、C 三個分片承接 12 筆鍵。試著讓「分片 D」上線，比較取模與一致性雜湊環的搬移量。'
    };
  }

  function hashingAction(state, config, action) {
    const index = action === 'toggle-d' ? 3 : Number(action.slice(-1));
    if (state.online[index] && state.online.filter(Boolean).length <= 1) {
      state.message = '至少要保留 1 個在線分片，否則資料無處可放。';
      return;
    }
    state.online[index] = !state.online[index];
    const nextOwners = assignHashOwners(state.online, config);
    const moved = nextOwners.filter((owner, i) => owner !== state.owners[i]).length;
    state.owners = nextOwners;
    state.moved = moved;
    state.changes++;
    const label = shardNames[index];
    const verb = state.online[index] ? '上線擴容' : '下線縮容';
    const pct = Math.round(moved * 100 / hashRingKeys.length);
    state.message = `分片 ${label} ${verb}（${config.strategy === 'modulo' ? '取模 hash % N' : `雜湊環・每節點 ${config.vnodes} 虛擬點`}）：12 筆鍵搬移了 ${moved} 筆（${pct}%）。`;
  }

  const definitions = {
    routing: {
      title: '負載平衡', chapter: 'chapter-03', chapterTitle: '硬體與效能',
      hint: '點伺服器切換上線狀態。用同樣的流量比較輪詢和依排隊量分派。',
      controls: [
        range('arrivals', '每批請求', 1, 12, 6, '件'),
        select('strategy', '分派策略', 'round', [['round', '輪詢'], ['work', '預估最早完成']])
      ],
      actions: [['step', '送一批請求'], ['reset', '重設']],
      metrics: ['累計完成', '目前排隊', '累計失敗', '平均完成時間'],
      map: id => diagram(id, 'routing', [
        node('client', '請求來源', 'client'), node('router', '負載平衡器', 'router'),
        ...nodeNames.map((name, i) => node('server' + i, '伺服器 ' + name, 'server', 'worker-' + i))
      ], [['client', 'router', 'across'], ...nodeNames.map((_, i) => ['router', 'server' + i, 'across', 'down'])]),
      start: routingStart,
      action(state, config, action) {
        if (action === 'step') routeBatch(state, config);
        else toggleWorker(state, Number(action.slice(-1)));
      },
      render(state, config, update) {
        const {values, wire, metrics, clock, entry} = update;
        values('client', config.arrivals + ' 件／批', '');
        values('router', config.strategy === 'round' ? '輪詢' : '預估最早完成', state.tick ? `已送 ${state.sent} 件` : '等待請求');
        let pending = 0;
        state.workers.forEach((worker, index) => {
          pending += worker.queue.length;
          values('server' + index, worker.online ? `排隊 ${worker.queue.length}` : '已離線',
            `${worker.capacity} 件／拍${worker.routed ? ` · 本批 ${worker.routed} 件` : ''} `, !worker.online ? 'warn' : worker.routed ? 'flow' : '',
            slots(worker.queue.length, workerQueueLimit), worker.online);
          wire(index, !worker.online ? 'warn' : worker.routed ? 'flow' : 'idle', false, !worker.online);
        });
        entry(state.workers.some(worker => worker.routed) ? 'flow' : '');
        metrics([state.completed + ' 件', pending + ' 件', state.failed + ' 件',
          state.completed ? (state.elapsed / state.completed).toFixed(1) + ' 拍' : '—']);
        clock(`第 ${state.tick} 拍`);
      }
    },
    cache: {
      title: '快取 TTL', chapter: 'c05-metadata-cache', chapterTitle: '快取',
      hint: '點快取可清除內容。「推進 1 秒」會消耗 TTL，調整滑桿則從下次回填開始生效。',
      controls: [
        range('ttl', '下次回填的 TTL', 1, 12, 4, '秒'),
        select('policy', '資料庫更新後', 'ttl', [['ttl', '等 TTL 到期'], ['invalidate', '立即刪除快取']])
      ],
      actions: [['read', '發送讀取'], ['write', '寫入新版本'], ['time', '推進 1 秒'], ['reset', '重設']],
      metrics: ['快取命中率', '讀到舊版', '讀回版本', '讀取耗時'],
      map: id => diagram(id, 'cache', [
        node('client', '應用程式', 'client'), node('cache', '快取', 'cache', 'clear'),
        node('result', '回應', 'check'), node('db', '資料庫', 'db')
      ], [['client', 'cache', 'across'], ['cache', 'result', 'across'], ['db', 'cache', 'up', null, '回填'], ['client', 'db', 'under', null, '寫入／回源']]),
      start: cacheStart, action: cacheAction,
      render(state, config, update) {
        const {values, wire, metrics, clock, entry} = update;
        const cached = state.cached !== null;
        const isStale = cached && state.cached !== state.version;
        const reading = state.action === 'read' || state.action === 'miss';
        const remaining = cached ? state.expires - state.time : 0;
        const life = cached ? 100 * remaining / (state.expires - state.cachedAt) : 0;
        values('client', '同一筆資料', '');
        values('cache', cached ? 'v' + state.cached : '空', cached ? `剩 ${remaining} 秒${isStale ? ' · 舊版' : ''}` : '等待回填',
          isStale ? 'warn' : reading && cached ? 'flow' : '', `<span class="sim-life"><i style="inline-size:${life}%"></i></span>`);
        values('result', state.returned === null ? '等待讀取' : `v${state.returned} · ${state.latency} ms`,
          state.returned === null ? '' : state.latency === 5 ? '上次命中' : '上次未命中', reading && isStale ? 'warn' : reading ? 'flow' : '');
        values('db', 'v' + state.version, '最新版本', state.action === 'write' || state.action === 'miss' ? 'flow' : '');
        wire(0, reading ? 'flow' : 'idle');
        wire(1, state.action === 'miss' ? 'flow' : 'idle');
        wire(2, state.action === 'write' || state.action === 'miss' ? 'flow' : 'idle');
        entry(reading ? 'flow' : '');
        const total = state.hits + state.misses;
        metrics([total ? Math.round(100 * state.hits / total) + '%' : '—', state.stale + ' 次',
          state.returned === null ? '—' : 'v' + state.returned, state.latency === null ? '—' : state.latency + ' ms']);
        clock(`第 ${state.time} 秒`);
      }
    },
    queue: {
      title: '佇列背壓', chapter: 'c06-full-empty', chapterTitle: '佇列與非同步',
      hint: '佇列有 8 格。把到達速率降為 0，再推進幾拍，看看要多久才清空。',
      controls: [
        range('arrivals', '每拍新工作', 0, 12, 7, '件'),
        range('service', '每拍處理上限', 0, 8, 3, '件'),
        select('policy', '佇列滿載時', 'pause', [['pause', '來源保留待送工作'], ['reject', '拒絕多出的工作']])
      ],
      actions: [['step', '推進 1 拍'], ['five', '推進 5 拍'], ['reset', '重設']],
      metrics: ['佇列積壓', '來源待送', '累計完成', '累計拒絕'],
      map: id => diagram(id, 'queue', [
        node('source', '工作來源', 'client'), node('queue', '佇列', 'queue'),
        node('worker', 'Worker', 'server'), node('overflow', '回壓訊號', 'pause')
      ], [['source', 'queue', 'across'], ['queue', 'overflow', 'down'], ['queue', 'worker', 'across'], ['overflow', 'source', 'return']]),
      start: queueStart,
      action(state, config, action) {
        const turns = action === 'five' ? 5 : 1;
        for (let index = 0; index < turns; index++) queueBatch(state, config);
      },
      render(state, config, update) {
        const {values, wire, metrics, clock, entry} = update;
        const policy = state.lastPolicy || config.policy;
        update.overflow(policy);
        values('source', config.arrivals + ' 件／拍', state.pending ? `${state.pending} 件待送` : '目前無待送', state.pending ? 'warn' : '');
        values('queue', `${state.depth}／${queueCapacity} 格`, `本拍入列 ${state.admitted} 件`,
          state.depth >= queueCapacity - 2 ? 'warn' : state.admitted ? 'flow' : '',
          slots(state.depth, queueCapacity));
        values('overflow', state.blocked ? state.blocked + ' 件' : '—',
          policy === 'pause' ? '留在來源' : '當拍拒絕', state.blocked ? 'warn' : '');
        values('worker', `完成 ${state.processed} 件`, `上限 ${config.service} 件／拍`, state.processed ? 'flow' : '');
        wire(0, state.blocked ? 'warn' : 'idle');
        wire(1, state.processed ? 'flow' : 'idle');
        wire(2, state.blocked && policy === 'pause' ? 'warn' : 'idle');
        entry(state.admitted ? 'flow' : '');
        metrics([state.depth + ' 件', state.pending + ' 件', state.done + ' 件', state.refused + ' 件']);
        clock(`第 ${state.tick} 拍`);
      }
    },
    quorum: {
      title: '複本仲裁', chapter: 'ch03-regions-zones-datacenters-racks-servers', chapterTitle: '跨區與多數票',
      hint: '寫入優先等 A，讀取優先等 C。點副本模擬故障，再試讀寫。',
      controls: [
        range('writes', '寫入回應數 W', 1, 3, 2, '個'),
        range('reads', '讀取回應數 R', 1, 3, 1, '個')
      ],
      actions: [['write', '寫入新版本'], ['read', '讀取版本'], ['sync', '同步副本'], ['reset', '重設']],
      metrics: ['上線副本', '最近結果', '仲裁耗時', '累計失敗'],
      map: id => diagram(id, 'quorum', [
        node('client', '客戶端', 'client'), node('hub', '協調器', 'router'),
        ...nodeNames.map((name, i) => node('replica' + i, '副本 ' + name, 'db', 'replica-' + i))
      ], [['client', 'hub', 'across'], ...nodeNames.map((_, i) => ['hub', 'replica' + i, 'down'])]),
      start: quorumStart,
      action(state, config, action) {
        if (!action.startsWith('replica-')) { quorumAction(state, config, action); return; }
        const index = Number(action.slice(-1));
        state.online[index] = !state.online[index];
        state.contacted = [];
        state.message = `${nodeNames[index]} ${state.online[index] ? '已重新上線' : '已離線'}，保存的版本是 v${state.versions[index]}。`;
      },
      render(state, config, update) {
        const {values, wire, metrics, clock, entry} = update;
        values('client', `已確認 v${state.confirmed}`, `讀到舊版 ${state.stale} 次`);
        values('hub', `W=${config.writes} · R=${config.reads}`, config.writes + config.reads > 3 ? '讀寫必有交集' : '讀寫可能分開');
        const returning = state.operation === 'read';
        state.online.forEach((online, index) => {
          const contacted = state.contacted.includes(index);
          const lag = state.confirmed - state.versions[index];
          const condition = !online ? '已離線' : contacted ? '已回應' : '上線';
          values('replica' + index, 'v' + state.versions[index], condition + (online && lag ? ` · 落後 ${lag} 版` : ''),
            !online || lag ? 'warn' : contacted ? 'flow' : '', '', online);
          wire(index, !online ? 'warn' : contacted ? state.status : 'idle', contacted && returning, !online);
        });
        entry(state.contacted.length ? state.status : '', state.contacted.length && returning);
        metrics([state.online.filter(Boolean).length + '／3', state.result, state.elapsed, state.failed + ' 次']);
        clock('固定 3 個副本');
      }
    },
    breaker: {
      title: '斷路器與重試風暴', chapter: 'c13-circuit-breaker', chapterTitle: '斷路器',
      hint: '點「下游服務」切換正常／故障。試試先用無保護重試打垮下游，再改切斷路器保護。',
      controls: [
        range('arrivals', '每批請求', 1, 10, 4, '件'),
        select('mode', '防護策略', 'breaker', [['breaker', '斷路器（連敗 3 次開路）'], ['storm', '無保護＋每件重試 3 次']])
      ],
      actions: [['step', '送一批請求'], ['cool', '推進冷卻 1 拍'], ['reset', '重設']],
      metrics: ['斷路器狀態', '下游累計承受', '快速失敗', '成功完成'],
      map: id => diagram(id, 'breaker', [
        node('client', '客戶端', 'client'), node('breaker', '斷路器', 'router'),
        node('downstream', '下游服務', 'server', 'toggle-downstream'), node('result', '回應', 'check')
      ], [['client', 'breaker', 'across'], ['breaker', 'downstream', 'across'], ['breaker', 'result', 'down']]),
      start: breakerStart,
      action: breakerAction,
      render(state, config, update) {
        const {values, wire, metrics, clock, entry} = update;
        const storm = config.mode === 'storm';
        values('client', `${config.arrivals} 件／批`, '');
        values('breaker', storm ? '未啟用' : state.status,
          storm ? '每件重試 3 次' : state.status === 'Open' ? `冷卻剩 ${state.cooldown} 拍` : state.status === 'Half-Open' ? '放行 1 筆探測' : `連敗 ${state.failures}／3`,
          storm ? 'warn' : state.status === 'Open' ? 'warn' : state.status === 'Half-Open' ? 'flow' : '');
        values('downstream', state.healthy ? '正常回應' : '故障中', `本拍承受 ${state.lastHits} 次`,
          state.healthy ? (state.lastHits ? 'flow' : '') : 'warn', '', state.healthy);
        values('result', state.lastFastFailed ? `快速失敗 ${state.lastFastFailed}` : state.lastHits ? `送出 ${state.lastHits} 次` : '待命',
          `累計成功 ${state.succeeded} 件`, state.lastFastFailed ? 'warn' : state.healthy && state.lastHits ? 'flow' : '');
        entry(state.tick ? 'flow' : '');
        wire(0, state.lastHits ? (state.healthy ? 'flow' : 'warn') : 'idle', false, !storm && state.status === 'Open');
        wire(1, state.lastFastFailed ? 'warn' : state.lastHits && state.healthy ? 'flow' : 'idle');
        metrics([storm ? '無保護' : state.status, `${state.downstreamHits} 次`, `${state.fastFailed} 件`, `${state.succeeded} 件`]);
        clock(`第 ${state.tick} 拍`);
      }
    },
    hashing: {
      title: '一致性雜湊與搬移量', chapter: 'ch11-consistent-hashing', chapterTitle: '一致性雜湊',
      hint: '點分片 A–D 可直接切換上線／離線，觀察擴容或掉節點時，12 筆鍵有多少筆需要重搬。',
      controls: [
        select('strategy', '路由方式', 'modulo', [['modulo', '取模 hash % N'], ['ring', '一致性雜湊環']]),
        range('vnodes', '每節點虛擬點數', 1, 8, 3, '個')
      ],
      actions: [['toggle-d', '切換分片 D'], ['reset', '重設']],
      metrics: ['上線分片', '本次搬移鍵數', '搬移比例', '最熱分片負載'],
      map: id => diagram(id, 'hashing', [
        node('client', '12 筆鍵', 'client'), node('router', '分片路由器', 'router'),
        ...shardNames.map((name, i) => node('shard' + i, '分片 ' + name, 'db', 'shard-' + i))
      ], [['client', 'router', 'across'], ...shardNames.map((_, i) => ['router', 'shard' + i, 'down'])]),
      start: hashingStart,
      action: hashingAction,
      render(state, config, update) {
        const {values, wire, metrics, clock, entry} = update;
        if (state.lastStrategy !== config.strategy || state.lastVnodes !== config.vnodes) {
          state.owners = assignHashOwners(state.online, config);
          state.moved = 0;
          state.lastStrategy = config.strategy;
          state.lastVnodes = config.vnodes;
          state.message = config.strategy === 'modulo'
            ? '已切成「取模 hash % N」。現在切換分片 D，看看會搬動多少比例的鍵。'
            : `已切成「一致性雜湊環（每節點 ${config.vnodes} 虛擬點）」。切換分片 D，看看搬移範圍是不是只剩新節點接手的那一段。`;
        }
        const counts = [0, 0, 0, 0];
        state.owners.forEach(owner => { counts[owner]++; });
        const onlineCount = state.online.filter(Boolean).length;
        const hottest = Math.max(...counts);
        values('client', `${hashRingKeys.length} 筆鍵`, 'K0–K11');
        values('router', config.strategy === 'modulo' ? `hash % ${onlineCount}` : `${onlineCount * config.vnodes} 虛擬點`,
          state.changes ? `已切換 ${state.changes} 次` : '尚未擴縮容');
        state.online.forEach((online, index) => {
          values('shard' + index, online ? `${counts[index]} 鍵` : '離線',
            online ? `${Math.round(counts[index] * 100 / hashRingKeys.length)}% 負載` : '點此上線',
            !online ? 'warn' : counts[index] >= 6 ? 'warn' : 'flow', '', online);
          wire(index, !online ? 'warn' : counts[index] ? 'flow' : 'idle', false, !online);
        });
        entry('flow');
        metrics([`${onlineCount}／4`, `${state.moved} 筆`, `${Math.round(state.moved * 100 / hashRingKeys.length)}%`, `${hottest} 鍵`]);
        clock(config.strategy === 'modulo' ? '取模路由' : `雜湊環 · ${config.vnodes} vnodes`);
      }
    }
  };

  function controlHTML(control, id) {
    const key = id + '-' + control.key;
    const label = `<label for="${key}">${control.name}</label>`;
    if (control.choices) {
      return `<div class="sim-control">${label}<select id="${key}" name="${control.key}">
        ${control.choices.map(([value, text]) => `<option value="${value}"${value === control.value ? ' selected' : ''}>${text}</option>`).join('')}
      </select></div>`;
    }
    return `<div class="sim-control"><div class="sim-range-label">${label}<output for="${key}" aria-live="off"></output></div>
      <input id="${key}" type="range" name="${control.key}" min="${control.min}" max="${control.max}" value="${control.value}" step="1">
    </div>`;
  }

  function mount(panel) {
    const definition = definitions[panel.dataset.sdSimulation];
    const id = panel.id;
    const config = Object.fromEntries(definition.controls.map(control => [control.key, control.value]));
    let state = definition.start(config);
    panel.innerHTML = `
      <header class="sim-head">
        <h3 id="${id}-title">${definition.title}</h3>
        <a href="#${definition.chapter}">${definition.chapterTitle} ${icon('arrow')}</a>
      </header>
      <div class="sim-workspace">
        <div class="sim-main">
          <figure class="sim-stage">
            <div class="sim-canvas"><div class="sim-clock"></div>${definition.map(id)}</div>
            <figcaption class="sim-message" role="status"></figcaption>
          </figure>
          <div class="sim-actions" role="group" aria-label="${definition.title}操作">
            ${definition.actions.map(([action, label], index) =>
              `<button type="button" data-sim-action="${action}"${index === 0 ? ' class="sim-primary"' : ''}>
                ${index === 0 ? icon('play') : action === 'reset' ? icon('reset') : ''}<span>${label}</span></button>`).join('')}
          </div>
        </div>
        <div class="sim-sidebar">
          <div class="sim-settings" role="group" aria-label="${definition.title}參數">${definition.controls.map(control => controlHTML(control, id)).join('')}</div>
          <p class="sim-hint">${definition.hint}</p>
        </div>
      </div>
      <dl class="sim-metrics" aria-label="${definition.title}量測">
        ${definition.metrics.map(label => `<div><dt>${label}</dt><dd></dd></div>`).join('')}
      </dl>`;

    const find = selector => panel.querySelector(selector);
    const graphs = new Map([...panel.querySelectorAll('[data-sim-node]')].map(element => [element.dataset.simNode, element]));
    for (const [key, element] of graphs) {
      if (element.tagName !== 'BUTTON') continue;
      const details = element.querySelector('.sim-node-detail');
      const value = element.querySelector('.sim-node-value');
      details.id = `${id}-${key}-detail`;
      value.id = `${id}-${key}-value`;
      const label = element.querySelector('strong').textContent;
      element.setAttribute('aria-label', element.dataset.simNodeAction === 'clear' ? '清除快取' : `切換${label}`);
      element.setAttribute('aria-describedby', `${value.id} ${details.id}`);
    }
    const map = find('.sim-map');
    const paths = [...panel.querySelectorAll('[data-sim-wire]')];
    const fields = [...panel.querySelectorAll('.sim-metrics dd')];
    const status = find('.sim-message');
    const entry = find('.sim-entry-wire');
    const clock = find('.sim-clock');
    // Each route appears on demand, so its first measurable size can arrive after mount.
    const redraw = () => drawWires(map, graphs);
    new ResizeObserver(redraw).observe(map);
    const signal = (path, tone, reverse = false, cut = false) => {
      path.dataset.tone = tone;
      path.toggleAttribute('data-cut', cut);
      path.removeAttribute(reverse ? 'marker-end' : 'marker-start');
      path.setAttribute(reverse ? 'marker-start' : 'marker-end', `url(#${id}-${tone || 'idle'})`);
    };
    const view = {
      values(key, value, detail, tone = '', marks = '', pressed) {
        const element = graphs.get(key);
        element.dataset.tone = tone;
        element.querySelector('.sim-node-value').textContent = value;
        element.querySelector('.sim-node-detail').textContent = detail;
        element.querySelector('.sim-node-marks').innerHTML = marks;
        if (pressed !== undefined) element.setAttribute('aria-pressed', String(pressed));
      },
      overflow(policy) {
        const element = graphs.get('overflow');
        const rejecting = policy === 'reject';
        element.querySelector('.sim-node-label').textContent = rejecting ? '拒絕工作' : '回壓訊號';
        element.querySelector('use').setAttribute('href', rejecting ? '#sd-art-reject' : '#sd-art-pause');
        map.dataset.policy = policy;
      },
      wire(index, tone, reverse, cut) { signal(paths[index], tone, reverse, cut); },
      metrics(values) { values.forEach((value, index) => { fields[index].textContent = value; }); },
      clock(value) { clock.textContent = value; },
      entry(tone, reverse) { signal(entry, tone, reverse); }
    };
    function render() {
      definition.render(state, config, view);
      redraw();
      if (status.textContent !== state.message) status.textContent = state.message;
    }
    for (const control of definition.controls) {
      const field = find('#' + id + '-' + control.key);
      const numeric = !control.choices;
      const output = numeric ? find(`output[for="${field.id}"]`) : null;
      function apply() {
        config[control.key] = numeric ? Number(field.value) : field.value;
        if (output) {
          output.textContent = `${field.value} ${control.unit}`;
          field.setAttribute('aria-valuetext', output.textContent);
        }
        render();
      }
      field.addEventListener(numeric ? 'input' : 'change', apply);
      apply();
    }
    panel.addEventListener('click', event => {
      const button = event.target.closest('[data-sim-action], [data-sim-node-action]');
      if (!button) return;
      const action = button.dataset.simAction || button.dataset.simNodeAction;
      if (action === 'reset') state = definition.start(config, state);
      else definition.action(state, config, action);
      render();
      if (window.matchMedia('(prefers-reduced-motion: no-preference)').matches) {
        panel.querySelectorAll('svg path[data-tone="flow"], .sim-entry-wire[data-tone="flow"]').forEach(path => {
          path.animate([{opacity: .28}, {opacity: 1}], {duration: 420, easing: 'ease-out'});
        });
      }
    });
  }

  return {
    init(doc) { doc.querySelectorAll('[data-sd-simulation]').forEach(mount); },
    definitions
  };
});
