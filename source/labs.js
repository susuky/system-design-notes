/* Six deterministic teaching models. No network, randomness, clock or external dependency. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SystemDesignLabs = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  function integer(raw, name, min, max) {
    const text = String(raw == null ? '' : raw).trim();
    if (!/^-?\d+$/.test(text)) throw new Error(`${name} 請填完整整數。`);
    const value = Number(text);
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} 必須介於 ${min} 與 ${max}。`);
    return value;
  }
  function numbers(raw, name, min, max, minLength = 1, maxLength = 8) {
    let parts;
    if (Array.isArray(raw)) parts = raw;
    else {
      const text = String(raw == null ? '' : raw).trim();
      if (!text || /^[,，]|[,，]$|[,，]\s*[,，]/.test(text)) throw new Error(`${name} 請用逗號或空白分隔完整整數。`);
      parts = text.split(/[,，\s]+/);
    }
    if (parts.length < minLength || parts.length > maxLength) throw new Error(`${name} 請提供 ${minLength}–${maxLength} 個數字。`);
    return parts.map(value => integer(value, name, min, max));
  }
  function choice(raw, name, allowed) {
    if (!allowed.includes(raw)) throw new Error(`${name} 請選擇清單中的選項。`);
    return raw;
  }
  const cell = (label, status = '') => ({label: String(label), status});
  const lane = (label, cells, empty = '空') => ({label, cells: cells.length ? cells : [cell(empty, 'empty')]});
  const check = (label, ok) => ({label, ok: !!ok});
  const versionText = item => item ? `${item.value} · v${item.version}` : '空';
  function trace(kind, state, inspect) {
    const frames = [];
    return {
      frames,
      push(phase, explanation, done = false, result = null) {
        const detail = inspect();
        if (detail.checks.some(item => !item.ok)) throw new Error('模型的不變量檢查失敗，請重設實驗。');
        frames.push(clone({kind, phase, state, ...detail, explanation, done, result}));
      }
    };
  }

  function cache(input) {
    const initial = integer(input.initial, '原值', -99, 999);
    const updated = integer(input.updated, '更新值', -99, 999);
    const mode = choice(input.invalidation, '失效時機', ['delayed', 'immediate', 'none']);
    const s = {db: {value: initial, version: 1}, cache: null, pendingRead: null, invalidation: false, reads: [], hits: 0, misses: 0, mode};
    const t = trace('cache', s, () => ({
      lanes: [lane('資料庫', [cell(versionText(s.db), 'active')]), lane('快取', s.cache ? [cell(versionText(s.cache), s.cache.version < s.db.version ? 'warning' : 'active')] : []), lane('傳遞中', [...(s.pendingRead ? [cell('讀取 ' + versionText(s.pendingRead))] : []), ...(s.invalidation ? [cell('刪除快取訊息', 'warning')] : [])]), lane('已回覆', s.reads.map(r => cell(`${r.id}: ${r.value} · v${r.version}${r.stale ? '（舊版）' : ''}`, r.stale ? 'warning' : '')))],
      vars: {'資料庫版本': s.db.version, '快取版本': s.cache ? s.cache.version : '空', '命中 / 未命中': `${s.hits} / ${s.misses}`, '讀到舊版': s.reads.filter(r => r.stale).length},
      checks: [check('快取中的版本不超過資料庫版本', !s.cache || s.cache.version <= s.db.version), check('每個回覆都來自已提交的版本', s.reads.every(r => r.version <= r.dbVersion))]
    }));
    function read(id) {
      const hit = s.cache !== null;
      if (hit) s.hits++; else s.misses++;
      t.push('查快取', `${id} 查詢同一個 key。${hit ? `命中 ${versionText(s.cache)}，這一步沒有向資料庫確認是否更新。` : '快取沒有資料，要回資料庫讀取。'}`);
      let value;
      if (hit) value = clone(s.cache);
      else {
        s.pendingRead = clone(s.db);
        t.push('讀資料庫', `${id} 從資料庫取得 ${versionText(s.pendingRead)}，先放在這次讀取的暫存區。`);
        s.cache = clone(s.pendingRead); s.pendingRead = null; value = clone(s.cache);
        t.push('回填快取', `把 ${versionText(s.cache)} 寫入快取。這個模型依序執行請求，回填期間沒有另一個寫入插進來。`);
      }
      s.reads.push({id, ...value, dbVersion: s.db.version, stale: value.version < s.db.version});
      t.push('回覆讀取', `${id} 回覆 ${value.value}（v${value.version}）。${value.version < s.db.version ? `資料庫已是 v${s.db.version}；快取命中仍可能回傳舊版本。` : '此刻與資料庫版本相同。'}`);
    }
    t.push('初始化', `資料庫存放 ${initial}（v1），快取為空。先讀一次，再更新資料庫，觀察後續兩次讀取。`);
    read('R1');
    s.db = {value: updated, version: 2};
    t.push('提交寫入', `W 把資料庫改成 ${updated}（v2）。快取仍保留 v1，寫入資料庫不會自動改掉快取。`);
    if (mode === 'immediate') {
      s.cache = null;
      t.push('刪除快取', '寫入流程在下一次讀取前刪除快取。這裡固定操作順序，不代表兩個系統之間有原子交易。');
    } else if (mode === 'delayed') {
      s.invalidation = true;
      t.push('失效訊息在途', '已送出刪除快取訊息，但還沒送達。讓 R2 在這段空窗中讀取。');
    } else t.push('略過失效', '這次刻意不刪除快取，也沒有 TTL。後續命中會繼續使用 v1。');
    read('R2');
    if (s.invalidation) {
      s.cache = null; s.invalidation = false;
      t.push('失效訊息送達', '刪除快取訊息現在送達，v1 被移除。R2 已經回覆的舊值不會因此被撤回。');
    }
    read('R3');
    const stale = s.reads.filter(r => r.stale).length;
    t.push('停止', `三次讀取都已回覆，共 ${stale} 次讀到當時資料庫的舊版本。${mode === 'none' ? '觀測結束時快取仍舊；沒有 TTL 或失效機制，不會自行追上。' : '觀測結束時快取與資料庫皆為 v2。'}`, true, {reads: s.reads, stale, version: s.cache.version});
    return t.frames;
  }

  function queue(input) {
    const arrivals = numbers(input.arrivals, '每拍新工作數', 0, 6, 1, 8);
    const capacity = integer(input.capacity, '佇列容量', 1, 6);
    const service = integer(input.service, '每拍處理量', 0, 4);
    const mode = choice(input.policy, '滿載策略', ['pause', 'reject']);
    const s = {tick: 0, capacity, service, mode, offered: [], pending: [], queue: [], completed: [], rejected: [], backpressured: false};
    const t = trace('queue', s, () => {
      const partition = [...s.pending, ...s.queue, ...s.completed, ...s.rejected];
      return {
        lanes: [lane('來源尚未送入', s.pending.map(id => cell(id, s.backpressured ? 'warning' : ''))), lane(`佇列 ${s.queue.length} / ${capacity} · 左端先出`, Array.from({length: capacity}, (_, i) => s.queue[i] ? cell(s.queue[i], i === 0 ? 'active' : '') : cell('空位', 'empty'))), lane('已完成', s.completed.map(id => cell(id))), lane('已拒絕', s.rejected.map(id => cell(id, 'warning')))],
        vars: {'邏輯拍': s.tick, '已提出': s.offered.length, '來源待送': s.pending.length, '佇列長度': s.queue.length, '完成 / 拒絕': `${s.completed.length} / ${s.rejected.length}`},
        checks: [check(`佇列長度介於 0 與 ${capacity}`, s.queue.length <= capacity), check('每份工作只在一個位置，總數守恆', partition.length === s.offered.length && new Set(partition).size === partition.length && partition.every(id => s.offered.includes(id))), check('完成工作仍依 FIFO 順序', s.completed.every((id, i, list) => i === 0 || Number(id.slice(1)) > Number(list[i - 1].slice(1))))]
      };
    });
    function tick(count, draining = false) {
      s.tick++; s.backpressured = false;
      for (let i = 0; i < count; i++) {const id = 'J' + (s.offered.length + 1); s.offered.push(id); s.pending.push(id);}
      t.push(draining ? '排空階段' : '新工作到達', `第 ${s.tick} 拍：${draining ? '不再產生新工作，繼續處理既有積壓。' : `來源新增 ${count} 份工作。先嘗試送入佇列，再讓 worker 處理。`}`);
      while (s.pending.length && s.queue.length < capacity) {
        const id = s.pending.shift(); s.queue.push(id);
        t.push('工作入列', `${id} 進入佇列。現在有 ${s.queue.length} / ${capacity} 格；後來的工作不能插到前面。`);
      }
      if (s.pending.length) {
        if (mode === 'pause') {
          s.backpressured = true;
          t.push('回傳背壓', `佇列滿了，來源保留 ${s.pending.length} 份尚未送入的工作，這拍停止送入。工作沒有丟棄；積壓留在來源。`);
        } else {
          const rejected = s.pending.splice(0); s.rejected.push(...rejected);
          t.push('拒絕新工作', `佇列滿了，明確拒絕 ${rejected.join('、')}。拒絕的工作不會自動重試，也不計入完成。`);
        }
      }
      const countToServe = Math.min(service, s.queue.length);
      for (let i = 0; i < countToServe; i++) {
        const id = s.queue.shift(); s.completed.push(id);
        t.push('worker 完成', `worker 完成佇列最前面的 ${id}，釋放一格。本拍剩下的處理額度為 ${service - i - 1}。`);
      }
      if (!countToServe) t.push(service ? 'worker 閒置' : 'worker 停住', service ? '佇列為空，這拍沒有工作可處理。' : '每拍處理量設為 0，worker 不會消化積壓。有限佇列也無法讓工作自行完成。');
    }
    t.push('初始化', `使用容量 ${capacity} 的 FIFO 佇列，每拍最多完成 ${service} 份。來源需求與佇列分開計數。`);
    arrivals.forEach(value => tick(value));
    if (service > 0) while (s.pending.length || s.queue.length) tick(0, true);
    const backlog = s.pending.length + s.queue.length;
    t.push('停止', backlog ? `輸入的 ${arrivals.length} 拍已走完，但 worker 處理量是 0，仍有 ${backlog} 份積壓。停止的是觀測，工作尚未完成。` : `所有輸入工作已完成或明確拒絕。完成 ${s.completed.length} 份，拒絕 ${s.rejected.length} 份；來源與佇列皆已清空。`, true, {completed: s.completed.length, rejected: s.rejected.length, backlog});
    return t.frames;
  }

  function retry(input) {
    const amount = integer(input.amount, '每筆增加量', 1, 100);
    const lostAcks = integer(input.lostAcks, 'M1 遺失 ACK 次數', 0, 3);
    const dedupe = choice(input.dedupe, '冪等處理', ['on', 'off']) === 'on';
    const s = {amount, dedupe, balance: 0, attempt: 0, current: null, wire: '尚未傳送', records: [], commits: [], acked: [], deliveries: 0};
    const t = trace('retry', s, () => ({
      lanes: [lane('傳送端 / 通道', [cell(s.current ? `${s.current} · 第 ${s.attempt} 次` : '等待訊息'), cell(s.wire, /遺失/.test(s.wire) ? 'warning' : '')]), lane('業務狀態', [cell(`累計值 ${s.balance}`, 'active')]), lane('去重紀錄', s.records.map(id => cell(id)), dedupe ? '尚無紀錄' : '已停用'), lane('已提交的效果', s.commits.map((id, i) => cell(`${i + 1}: ${id} +${amount}`, s.commits.indexOf(id) < i ? 'warning' : ''))), lane('傳送端已收 ACK', s.acked.map(id => cell(id)))],
      vars: {'投遞次數': s.deliveries, '提交次數': s.commits.length, '累計值': s.balance, '不同業務操作': new Set(s.commits).size},
      checks: [check('累計值 = 實際提交次數 × 每筆增加量', s.balance === s.commits.length * amount), check('收到 ACK 的操作都曾提交', s.acked.every(id => s.commits.includes(id))), check(dedupe ? '同一 ID 的業務效果最多提交一次' : '已關閉去重：不保證同一 ID 只提交一次', !dedupe || new Set(s.commits).size === s.commits.length), check('去重紀錄與業務效果在同一交易保存', !dedupe || s.records.length === s.commits.length && s.records.every(id => s.commits.includes(id)))]
    }));
    function deliver(id, attempt, loseAck) {
      s.current = id; s.attempt = attempt; s.wire = '訊息在途';
      t.push('傳送訊息', `${id} 第 ${attempt} 次傳送，內容是增加 ${amount}。${attempt > 1 ? '重試沿用相同 ID，沒有建立新的業務操作。' : '這是一個新的業務操作 ID。'}`);
      s.deliveries++; s.wire = '消費者已收到';
      const duplicate = dedupe && s.records.includes(id);
      t.push('查詢去重紀錄', dedupe ? `${id} ${duplicate ? '已有提交紀錄；可重用成功結果。' : '尚未處理；準備寫入業務效果及去重紀錄。'}` : '去重已停用。消費者無法僅憑內容相同判斷是否重送。');
      if (!duplicate) {
        s.balance += amount; s.commits.push(id); if (dedupe) s.records.push(id);
        t.push('原子提交', `累計值增加 ${amount}，變成 ${s.balance}。${dedupe ? `同一筆資料庫交易也保存 ${id} 的去重紀錄；兩者一起成功。` : '沒有保存去重紀錄；下次重送仍可能再次執行。'}`);
      } else t.push('略過重複效果', `${id} 的效果已提交過，這次不再增加累計值，仍回覆先前的成功結果。`);
      s.wire = 'ACK 在途';
      t.push('送出 ACK', `消費者提交完成後才送出 ${id} 的 ACK。送出不等於傳送端已經收到。`);
      if (loseAck) {
        s.wire = 'ACK 遺失，等待逾時';
        t.push('ACK 遺失', 'ACK 在通道中遺失。傳送端只知道逾時，無法據此推論業務操作有沒有成功；稍後使用相同 ID 重試。');
      } else {
        s.acked.push(id); s.wire = 'ACK 已收到';
        t.push('確認成功', `傳送端收到 ${id} 的 ACK，不再重送這個操作。`);
      }
    }
    t.push('初始化', `累計值從 0 開始。M1 的前 ${lostAcks} 次 ACK 會遺失；M2 內容相同，但有不同 ID，應另外執行。`);
    for (let attempt = 1; attempt <= lostAcks + 1; attempt++) deliver('M1', attempt, attempt <= lostAcks);
    deliver('M2', 1, false);
    t.push('停止', `M1、M2 都已收到 ACK。投遞 ${s.deliveries} 次，業務效果提交 ${s.commits.length} 次，累計值 ${s.balance}。${dedupe ? '在這個原子交易與紀錄保留的假設下，重送沒有重複增加。' : `原本兩個操作只需增加 ${amount * 2}；遺失 ACK 造成的重送可能多算。`}`, true, {balance: s.balance, commits: s.commits.length, deliveries: s.deliveries, expected: amount * 2});
    return t.frames;
  }

  function replication(input) {
    const writes = numbers(input.writes, '依序寫入的值', -99, 999, 1, 4);
    const lag = integer(input.lag, '複寫延遲（拍）', 0, 3);
    const mode = choice(input.readMode, '讀取策略', ['replica', 'leader', 'session']);
    const s = {clock: 0, lag, mode, primary: {value: 0, version: 0}, replica: {value: 0, version: 0}, token: 0, log: [], pending: [], reads: []};
    const t = trace('replication', s, () => ({
      lanes: [lane('主節點', [cell(versionText(s.primary), 'active')]), lane('副本', [cell(versionText(s.replica), s.replica.version < s.primary.version ? 'warning' : 'active')]), lane('待套用的日誌', s.pending.map(entry => cell(`v${entry.version}=${entry.value} · t${entry.due} 到達`))), lane('讀取回覆', s.reads.map(r => cell(`R${r.id}: ${r.value} · v${r.version} / ${r.source}${r.stale ? '（落後）' : ''}`, r.stale ? 'warning' : '')))],
      vars: {'邏輯時間': s.clock, '主節點 / 副本版本': `${s.primary.version} / ${s.replica.version}`, '工作階段 token': s.token, '待套用筆數': s.pending.length},
      checks: [check('副本只套用主節點日誌的連續前綴', s.replica.version <= s.primary.version && (s.replica.version === 0 ? s.replica.value === 0 : s.replica.value === s.log[s.replica.version - 1].value)), check('尚未套用的版本連續且沒有遺失', s.pending.length === s.primary.version - s.replica.version && s.pending.every((e, i) => e.version === s.replica.version + i + 1)), check(mode === 'session' ? '帶 token 的讀取至少看見自己已確認的寫入' : mode === 'leader' ? '主節點讀取看見本模型當時最新版本' : '副本回覆來自已套用的版本，允許落後', s.reads.every(r => mode === 'session' ? r.version >= r.token : mode === 'leader' ? r.version === r.primaryVersion : r.version <= r.primaryVersion))]
    }));
    function deliverDue() {
      while (s.pending.length && s.pending[0].due <= s.clock) {
        const entry = s.pending.shift(); s.replica = {value: entry.value, version: entry.version};
        t.push('套用複寫日誌', `副本依序套用 v${entry.version}，值更新為 ${entry.value}。這裡不會跳過尚未套用的前一個版本。`);
      }
    }
    function read() {
      s.clock++; deliverDue();
      t.push('送出讀取', `t=${s.clock}，讀取攜帶已確認寫入的 token=${s.token}。${mode === 'replica' ? '本次策略直接使用副本，不檢查 token。' : mode === 'leader' ? '本次策略固定讀主節點。' : '本次先檢查副本是否已追上 token。'}`);
      let source = '副本';
      if (mode === 'leader' || mode === 'session' && s.replica.version < s.token) source = '主節點';
      if (mode === 'session' && source === '主節點') t.push('改讀主節點', `副本只有 v${s.replica.version}，低於 token ${s.token}。這個模型選擇改讀主節點；其他設計也可能等待或明確回覆暫時無法滿足。`);
      const value = source === '主節點' ? s.primary : s.replica;
      s.reads.push({id: s.reads.length + 1, source, ...value, token: s.token, primaryVersion: s.primary.version, stale: value.version < s.primary.version});
      t.push('回覆讀取', `${source} 回覆 ${versionText(value)}。${value.version < s.token ? `低於自己剛確認的 v${s.token}，這次沒有 read-your-writes。` : '這次讀取看得見自己已確認的寫入。'}`);
    }
    t.push('初始化', '主節點與副本皆為 0（v0）。單一寫入者依序提交，每筆日誌在指定的邏輯拍數後送達。');
    writes.forEach(value => {
      s.clock++; deliverDue();
      const version = s.primary.version + 1;
      s.primary = {value, version}; s.log.push({value, version}); s.pending.push({value, version, due: s.clock + lag});
      t.push('主節點提交', `t=${s.clock}，主節點提交 ${value}（v${version}），日誌預計在 t=${s.clock + lag} 送達副本。寫入不等待副本確認。`);
      s.token = version;
      t.push('確認寫入', `用戶端收到 v${version} 的成功回覆，保存 token=${version}。這個 ACK 只代表主節點已提交。`);
      deliverDue(); read();
    });
    while (s.pending.length) {
      s.clock = Math.max(s.clock, s.pending[0].due);
      t.push('等待複寫', `沒有新寫入，推進到 t=${s.clock}，讓下一筆日誌送達。延遲是這組輸入的固定假設。`);
      deliverDue();
    }
    read();
    t.push('停止', `所有 ${writes.length} 筆日誌已套用，主節點與副本同為 v${s.primary.version}；最後一次讀取也已回覆。此前回傳的舊版本仍保留在紀錄中。`, true, {reads: s.reads, version: s.primary.version, stale: s.reads.filter(r => r.stale).length});
    return t.frames;
  }

  function tokenBucket(input) {
    const capacity = integer(input.capacity, '桶容量', 1, 8);
    const rate = integer(input.rate, '每拍補充量', 0, 4);
    const cost = integer(input.cost, '每次請求成本', 1, 8);
    const arrivals = numbers(input.arrivals, '每拍請求數', 0, 6, 1, 8);
    const s = {tick: 0, capacity, rate, cost, tokens: capacity, added: 0, spilled: 0, consumed: 0, offered: 0, granted: [], rejected: [], current: null};
    const t = trace('token-bucket', s, () => ({
      lanes: [lane(`權杖桶 ${s.tokens} / ${capacity}`, Array.from({length: capacity}, (_, i) => cell(i < s.tokens ? '●' : '空', i < s.tokens ? 'active' : 'empty'))), lane('本次請求', s.current ? [cell(`${s.current} · 成本 ${cost}`)] : []), lane('已放行', s.granted.map(id => cell(id))), lane('已拒絕（429）', s.rejected.map(id => cell(id, 'warning')))],
      vars: {'邏輯拍 t': s.tick, '剩餘 token': s.tokens, '有效補入 / 滿桶丟棄': `${s.added} / ${s.spilled}`, '放行 / 拒絕': `${s.granted.length} / ${s.rejected.length}`, '已消耗權杖': s.consumed},
      checks: [check(`權杖數介於 0 與 ${capacity}`, s.tokens >= 0 && s.tokens <= capacity), check('剩餘 = 初始容量 + 有效補入 − 已消耗', s.tokens === capacity + s.added - s.consumed), check('消耗權杖不超過初始容量 + 已發生的補充', s.consumed <= capacity + s.tick * rate), check('每次請求都恰好放行或拒絕一次', s.granted.length + s.rejected.length === s.offered)]
    }));
    t.push('初始化', `t=0 時桶內有 ${capacity} 個權杖。每次請求要 ${cost} 個，之後每拍開始補入 ${rate} 個；超過桶容量就丟棄。`);
    arrivals.forEach((count, tick) => {
      s.tick = tick; s.current = null;
      if (tick > 0) {
        t.push('推進一拍', `時間來到 t=${tick}。先補充權杖，再依序判斷本拍 ${count} 次請求。`);
        const added = Math.min(rate, capacity - s.tokens), spilled = rate - added;
        s.tokens += added; s.added += added; s.spilled += spilled;
        t.push('補充權杖', `本拍有效補入 ${added} 個，${spilled} 個因桶滿而丟棄。目前有 ${s.tokens} / ${capacity} 個。`);
      } else t.push('第一批請求', `t=0 已用滿桶初始化，不額外補充；現在處理 ${count} 次請求。`);
      if (!count) t.push('沒有新請求', '這拍沒有新請求，保留目前權杖。閒置只能存到桶容量，不能無限累積。');
      for (let i = 0; i < count; i++) {
        const id = 'R' + (s.offered + 1); s.current = id; s.offered++;
        if (s.tokens >= cost) {
          s.tokens -= cost; s.consumed += cost; s.granted.push(id);
          t.push('放行', `${id} 需要 ${cost} 個權杖，餘額足夠。一次扣除後剩 ${s.tokens} 個，請求立即通過。`);
        } else {
          s.rejected.push(id);
          t.push('拒絕', `${id} 需要 ${cost} 個權杖，但只剩 ${s.tokens} 個。回覆 429，不扣到負數，也不放進等待佇列。`);
        }
      }
    });
    s.current = null;
    t.push('停止', `${arrivals.length} 拍內的 ${s.offered} 次請求都已判定：放行 ${s.granted.length} 次、拒絕 ${s.rejected.length} 次。${cost > capacity ? '單次成本高於桶容量，即使等再久也無法通過。' : `剩餘 ${s.tokens} 個權杖可供後續使用，但本次觀測到此結束。`}`, true, {granted: s.granted.length, rejected: s.rejected.length, tokens: s.tokens, consumed: s.consumed});
    return t.frames;
  }

  function owner(nodes, key) {return (nodes.find(node => node.position >= key) || nodes[0]).id;}
  function hashing(input) {
    const positions = numbers(input.nodes, '既有節點位置', 0, 99, 2, 5).sort((a, b) => a - b);
    if (new Set(positions).size !== positions.length) throw new Error('既有節點位置不能重複。');
    const added = integer(input.added, '新增節點 N 的位置', 0, 99);
    if (positions.includes(added)) throw new Error('新節點 N 不能與既有節點放在同一個位置。');
    const keys = numbers(input.keys, 'key 的雜湊位置', 0, 99, 1, 10).map((position, i) => ({id: 'K' + (i + 1), position}));
    const oldNodes = positions.map((position, i) => ({id: String.fromCharCode(65 + i), position}));
    const newNodes = [...oldNodes, {id: 'N', position: added}].sort((a, b) => a.position - b.position);
    const predecessor = newNodes[(newNodes.findIndex(node => node.id === 'N') - 1 + newNodes.length) % newNodes.length];
    const s = {oldNodes, newNodes, nodes: clone(oldNodes), keys, before: {}, after: {}, moved: [], current: null, added: false};
    const t = trace('hashing', s, () => ({
      ring: {nodes: s.nodes, current: s.current, predecessor, added},
      lanes: [lane('順時針節點順序', s.nodes.map(node => cell(`${node.id} @ ${node.position}`, node.id === 'N' ? 'active' : ''))), lane('各 key 的路由', keys.map(key => cell(`${key.id} @ ${key.position}: ${s.before[key.id] || '待查'} → ${s.after[key.id] || '待查'}`, s.moved.includes(key.id) ? 'warning' : s.current && s.current.id === key.id ? 'active' : '')))],
      vars: {'原有 / 目前節點數': `${oldNodes.length} / ${s.nodes.length}`, '已重算 key': Object.keys(s.after).length, '路由改變': `${s.moved.length} / ${keys.length}`, '新增節點接手區間': `(${predecessor.position}, ${added}]${predecessor.position > added ? '（跨越 99 → 0）' : ''}`},
      checks: [check('原路由使用順時針第一個節點（含相等位置）', keys.every(key => !s.before[key.id] || s.before[key.id] === owner(oldNodes, key.position))), check('新路由使用加入 N 後的相同規則', keys.every(key => !s.after[key.id] || s.after[key.id] === owner(newNodes, key.position))), check('加入一個節點後，改變的 key 只會移向 N', keys.every(key => !s.after[key.id] || s.after[key.id] === s.before[key.id] || s.after[key.id] === 'N'))]
    }));
    t.push('初始化', '使用 0–99 的環，位置 99 的下一格是 0。key 歸順時針第一個位置大於或等於它的節點；找不到就繞回起點。');
    keys.forEach(key => {
      s.current = key;
      t.push('查詢原路由', `${key.id} 的雜湊位置是 ${key.position}，從這裡順時針尋找第一個既有節點。`);
      s.before[key.id] = owner(oldNodes, key.position);
      const node = oldNodes.find(node => node.id === s.before[key.id]);
      t.push('記錄原路由', `${key.id} → ${node.id} @ ${node.position}。${node.position < key.position ? '這次跨過 99 → 0，回到環的前段。' : node.position === key.position ? 'key 恰好落在節點位置，直接歸給該節點。' : '到這個節點就停止搜尋。'}`);
    });
    s.current = null; s.nodes = clone(newNodes); s.added = true;
    t.push('加入新節點', `在 ${added} 加入 N。它會接手前一個節點 ${predecessor.id} @ ${predecessor.position} 之後、直到 ${added}（含）的區間。畫面接著計算新路由，尚未執行資料搬移。`);
    keys.forEach(key => {
      s.current = key; s.after[key.id] = owner(newNodes, key.position);
      const moved = s.after[key.id] !== s.before[key.id]; if (moved) s.moved.push(key.id);
      t.push(moved ? '路由需要改變' : '路由維持原樣', `${key.id} @ ${key.position}：${s.before[key.id]} → ${s.after[key.id]}。${moved ? '落在 N 接手的區間，需要另外規劃資料搬移。' : '不在新增節點接手的區間，原負責節點不變。'}`);
    });
    s.current = null;
    t.push('停止', `${keys.length} 個 key 的新路由都已算完，其中 ${s.moved.length} 個改向 N。這只是這組位置的結果；節點間隔不平均或 key 偏斜時，比例不一定接近 1 / 節點數。`, true, {before: s.before, after: s.after, moved: s.moved});
    return t.frames;
  }

  const config = [
    {key: 'cache', title: '快取命中了，怎麼還是舊值？', subtitle: 'Cache-aside 與失效空窗', chapter: '05', defaults: {initial: '10', updated: '20', invalidation: 'delayed'}, fields: [{name: 'initial', label: '資料庫原值', min: -99, max: 999}, {name: 'updated', label: '寫入後的新值', min: -99, max: 999}, {name: 'invalidation', label: '失效時機', options: [['delayed', 'R2 讀完才刪除'], ['immediate', 'R2 讀取前刪除'], ['none', '完全不刪除']]}], assumption: '單一 key、單一快取、請求依序執行；資料庫讀寫已提交，沒有 TTL、故障或讀寫競爭。版本比對是教學觀察，實際 cache-aside 不一定會查版本。', principle: '快取可以落後於資料庫。更新資料庫與刪除快取之間的空窗，會影響下一次讀取；命中率高不代表資料新。', stop: 'R1、寫入 W、R2、R3 依序完成就停止。沒有失效時，停止觀測不表示資料已一致。', challenge: '改成「完全不刪除」，再把原值和新值設成相同數字。回覆數字一樣，能證明版本一樣嗎？'},
    {key: 'queue', title: '佇列滿了，工作留在哪裡？', subtitle: '有界佇列、背壓與拒絕', chapter: '06', defaults: {arrivals: '4, 3, 0, 2', capacity: '3', service: '1', policy: 'pause'}, fields: [{name: 'arrivals', label: '每拍新工作數（1–8 拍，各 0–6）'}, {name: 'capacity', label: '佇列容量', min: 1, max: 6}, {name: 'service', label: '每拍處理量', min: 0, max: 4}, {name: 'policy', label: '佇列滿載時', options: [['pause', '來源暫停送入'], ['reject', '明確拒絕新工作']]}], assumption: '單一 FIFO 佇列；每拍先接收，再處理。每份工作成本相同，沒有 worker 失敗。來源待送代表尚未送入的需求；此模型沒有保證來源儲存空間也有限。', principle: '佇列不能超過容量；提出的工作必須能在來源待送、佇列、已完成或已拒絕中找到。背壓會把等待往上游傳，無法憑空消除需求。', stop: '輸入停止後，有處理能力就繼續排空；處理量為 0 時，明確以「仍有積壓」結束觀測。', challenge: '把處理量設成 0，比較暫停與拒絕。哪一種還保留工作？哪個位置會持續累積？'},
    {key: 'retry', title: 'ACK 不見了，能直接再做一次嗎？', subtitle: '至少一次投遞與冪等效果', chapter: '09', defaults: {amount: '5', lostAcks: '1', dedupe: 'on'}, fields: [{name: 'amount', label: '每筆增加量', min: 1, max: 100}, {name: 'lostAcks', label: 'M1 遺失 ACK 次數', min: 0, max: 3}, {name: 'dedupe', label: '冪等處理', options: [['on', '同一交易保存去重紀錄'], ['off', '不保存去重紀錄']]}], assumption: '只有 ACK 會遺失；重送沿用相同 ID，訊息內容不變。啟用去重時，業務效果與去重紀錄在同一資料庫交易提交，紀錄全程保留。未模擬外部付款、寄信或跨系統交易。', principle: '傳送端逾時不代表消費者沒執行。相同操作 ID 應重用原結果；M2 即使內容和 M1 一樣，仍是另一個合法操作。', stop: 'M1 最終收到 ACK，再完成 M2 即停止。只能說本模型的業務效果沒有重複，不能推成端到端 exactly-once 保證。', challenge: '關閉去重，把 ACK 遺失次數改成 3。投遞次數、提交次數與原本預期的兩筆操作各是多少？'},
    {key: 'replication', title: '寫入成功，副本為什麼還看不到？', subtitle: '非同步複寫與 read-your-writes', chapter: '02', defaults: {writes: '10, 20', lag: '2', readMode: 'replica'}, fields: [{name: 'writes', label: '依序寫入的值（1–4 筆，−99–999）'}, {name: 'lag', label: '複寫延遲（拍）', min: 0, max: 3}, {name: 'readMode', label: '讀取策略', options: [['replica', '直接讀副本'], ['leader', '固定讀主節點'], ['session', '帶 token，落後就改讀主節點']]}], assumption: '單一寫入者、同一個 key、單一主節點與副本；日誌依序送達，沒有故障或主節點切換。每次寫入與讀取各推進一拍，時間到就套用日誌。', principle: '副本套用的是主節點日誌的前綴。工作階段 token 記錄自己已確認的版本；副本未追上時，讀取策略要決定等待、改讀或失敗。', stop: '所有寫入完成，待複寫日誌排空，再讀一次即停止。這組排程的結果不能證明多寫入者下的線性一致性。', challenge: '先用延遲 3 拍讀副本，再改成帶 token。回覆由哪個節點提供？付出了什麼負載或延遲上的代價？'},
    {key: 'token-bucket', title: '同樣一批流量，哪些請求能通過？', subtitle: 'Token bucket 的突發額度', chapter: '12', defaults: {arrivals: '6, 2, 4, 0, 3', capacity: '4', rate: '2', cost: '1'}, fields: [{name: 'arrivals', label: '每拍請求數（1–8 拍，各 0–6）'}, {name: 'capacity', label: '桶容量', min: 1, max: 8}, {name: 'rate', label: '每拍補充量', min: 0, max: 4}, {name: 'cost', label: '每次請求成本', min: 1, max: 8}], assumption: '桶一開始是滿的，t=0 不再補充；後續每拍先補入整數權杖，再依序處理請求。只有單一原子計數器；拒絕後不排隊、不重試，未模擬多節點時鐘。', principle: '餘額不可為負，也不能超過桶容量。已放行的總成本受初始突發額度加上時間補充量限制；權杖不足就明確拒絕。', stop: '輸入各拍的請求全部判定後停止；即使桶仍有餘額，也不憑空產生新請求。', challenge: '把單次成本設得比桶容量大，再加入幾拍 0 請求。等得更久能讓它通過嗎？'},
    {key: 'hashing', title: '加一台機器，哪些 key 必須改路由？', subtitle: '一致性雜湊的區間變化', chapter: '11', defaults: {nodes: '15, 45, 80', added: '60', keys: '5, 18, 32, 50, 72, 91'}, fields: [{name: 'nodes', label: '既有節點位置（2–5 個，不重複）'}, {name: 'added', label: '新增節點 N 的位置', min: 0, max: 99}, {name: 'keys', label: 'key 的雜湊位置（1–10 個，各 0–99）'}], assumption: '位置直接輸入在 0–99 的環上，每台機器只有一個位置。key 歸順時針第一個節點，包含相等位置；沒有虛擬節點、副本或實際資料搬移。', principle: '加入 N 後，只有落在其前一節點到 N 之間的 key 改向 N。其他 key 的原負責節點不變；負載是否平均要另外觀察。', stop: '每個 key 的舊路由與新路由都算完即停止。這是搬移計畫，不代表資料已複製或線上切換已安全完成。', challenge: '把 N 改放到 0，並加入位置 99、0、1 的 key。跨過環的起點時，開區間與閉區間各包含誰？'}
  ];
  const algorithms = {cache, queue, retry, replication, 'token-bucket': tokenBucket, hashing};

  function ringHTML(ring) {
    const point = (position, radius) => {const angle = position / 100 * Math.PI * 2 - Math.PI / 2; return [160 + Math.cos(angle) * radius, 148 + Math.sin(angle) * radius];};
    let result = '<div class="sd-lab-ring"><svg viewBox="0 0 320 300" role="img" aria-label="0 到 99 的順時針雜湊環；節點位置與各 key 路由也列於下方"><circle class="sd-lab-ring-track" cx="160" cy="148" r="100"/><text class="sd-lab-ring-caption" x="160" y="140" text-anchor="middle">0 → 99</text><text class="sd-lab-ring-caption" x="160" y="161" text-anchor="middle">順時針，含相等位置</text>';
    for (const node of ring.nodes) {
      const [x, y] = point(node.position, 100);
      result += `<g class="sd-lab-ring-node${node.id === 'N' ? ' sd-lab-ring-new' : ''}"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="18"/><text x="${x.toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="middle">${node.id}</text></g>`;
    }
    if (ring.current) {
      const [x, y] = point(ring.current.position, 75);
      result += `<circle class="sd-lab-ring-key" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="7"/><text class="sd-lab-ring-key-label" x="160" y="283" text-anchor="middle">目前 ${ring.current.id} @ ${ring.current.position}</text>`;
    }
    return result + '</svg></div>';
  }
  function visualHTML(frame) {
    return (frame.ring ? ringHTML(frame.ring) : '') + '<div class="sd-lab-lanes">' + frame.lanes.map(row => `<div class="sd-lab-lane"><strong>${escape(row.label)}</strong><div class="sd-lab-cells">${row.cells.map(item => `<span class="sd-lab-cell${item.status ? ' sd-lab-cell-' + escape(item.status) : ''}">${escape(item.label)}</span>`).join('')}</div></div>`).join('') + '</div>';
  }
  function render(container, frame, index, total) {
    container.querySelector('.sd-lab-visual').innerHTML = visualHTML(frame);
    container.querySelector('.sd-lab-vars').innerHTML = Object.entries(frame.vars).map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(value)}</dd></div>`).join('');
    container.querySelector('.sd-lab-checks').innerHTML = frame.checks.map(item => `<li><span aria-hidden="true">✓</span> ${escape(item.label)}</li>`).join('');
    container.querySelector('.sd-lab-explanation').textContent = frame.explanation;
    container.querySelector('.sd-lab-phase').textContent = frame.phase;
    container.querySelector('.sd-lab-step').textContent = `步驟 ${index + 1} / ${total}${frame.done ? ' · 已停止' : ''}`;
    container.querySelector('[data-sd-action="prev"]').disabled = index === 0;
    container.querySelector('[data-sd-action="next"]').disabled = index === total - 1;
    container.querySelector('[data-sd-action="last"]').disabled = index === total - 1;
    container.dataset.step = String(index); container.dataset.done = String(!!frame.done);
  }
  const mounted = new WeakMap();
  function mount(container) {
    if (mounted.has(container)) return mounted.get(container);
    const key = container.dataset.sdLab;
    if (!Object.prototype.hasOwnProperty.call(algorithms, key)) throw new Error('未知的系統設計實驗。');
    let frames = [], position = 0;
    const form = container.querySelector('form');
    const error = container.querySelector('.sd-lab-error');
    const fields = () => Array.from(form.querySelectorAll('input, select'));
    function apply() {
      const input = Object.fromEntries(fields().map(field => [field.name, field.value]));
      try {
        const candidate = algorithms[key](input);
        frames = candidate; position = 0;
        error.hidden = true; error.textContent = '';
        fields().forEach(field => field.removeAttribute('aria-invalid'));
        render(container, frames[0], 0, frames.length);
        return true;
      } catch (reason) {
        error.textContent = reason.message + ' 畫面保留上一組有效輸入。'; error.hidden = false;
        fields().forEach(field => field.setAttribute('aria-invalid', 'true'));
        return false;
      }
    }
    form.addEventListener('submit', event => {event.preventDefault(); apply();});
    container.querySelectorAll('[data-sd-action]').forEach(button => button.addEventListener('click', () => {
      if (!frames.length) return;
      const action = button.dataset.sdAction;
      if (action === 'prev') position = Math.max(0, position - 1);
      if (action === 'next') position = Math.min(frames.length - 1, position + 1);
      if (action === 'reset') position = 0;
      if (action === 'last') position = frames.length - 1;
      render(container, frames[position], position, frames.length);
    }));
    const controller = {get frames() {return clone(frames);}, get position() {return position;}, apply};
    mounted.set(container, controller); apply();
    return controller;
  }
  function init(document) {return Array.from(document.querySelectorAll('[data-sd-lab]')).map(mount);}
  return {algorithms, config, integer, numbers, owner, escape, visualHTML, init, mount, render};
});
