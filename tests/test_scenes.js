'use strict';
const assert=require('node:assert/strict');
const {models,definitions,graphHTML}=require('../source/scenes.js');
const end=(key,n,mode=0)=>models[key](n,mode).at(-1);
let scenarios=0,frames=0;
assert.equal(Object.keys(models).length,16);
for(const [key,def] of Object.entries(definitions)){
  for(let n=def.min;n<=def.max;n++){
    for(let mode=0;mode<2;mode++){
      const trace=models[key](n,mode);
      assert.ok(trace.length>=3,key);
      for(const state of trace){
        assert.ok(state.title && state.why,key);
        assert.ok(state.nodes.length>=3 && state.nodes.length<=5,key);
        assert.ok(state.focus>=0 && state.focus<state.nodes.length,key);
        assert.ok(Object.keys(state.metrics).length>0,key);
        for(const value of Object.values(state.metrics))if(typeof value==='number')assert.ok(Number.isFinite(value),key);
        assert.ok(!/undefined|NaN|Infinity/.test(graphHTML(state,key)),key);
        frames++;
      }
      scenarios++;
    }
  }
}
assert.equal(end('capacity',1).metrics['規劃核心'],331);
assert.equal(end('capacity',1,1).metrics['規劃核心'],166);
assert.equal(end('slo',10).metrics['是否達標'],'是');
assert.equal(end('slo',11).metrics['是否達標'],'否');
assert.equal(end('slo',1,1).metrics['是否達標'],'是');
assert.equal(end('slo',2,1).metrics['是否達標'],'否');
assert.equal(end('zones',60).metrics['可形成多數'],'是');
assert.equal(end('zones',60).metrics['容量足夠'],'是');
assert.equal(end('zones',70).metrics['容量足夠'],'否');
assert.equal(end('zones',60,1).metrics['可形成多數'],'否');
for(let n=20;n<=100;n++)for(let mode=0;mode<2;mode++){
  let previous=0;
  for(const state of models.queue(n,mode).slice(1)){
    const m=state.metrics;
    assert.equal(m['總完成']+m['積壓'],m['總到達']);
    assert.ok(m['總完成']>=previous);previous=m['總完成'];
  }
}
assert.equal(end('ack',30,1).metrics['任務總數'],1);
assert.equal(end('ack',30,1).metrics['已完成'],1);
assert.equal(end('cache',3).metrics['讀者版本'],1);
assert.equal(end('cache',3,1).metrics['讀者版本'],2);
assert.equal(end('storage',1).metrics['已確認更新遺失'],'否');
assert.equal(end('storage',1,1).metrics['已確認更新遺失'],'是');
for(let n=2;n<=3;n++)for(let mode=0;mode<2;mode++)assert.equal(end('storage',n,mode).metrics['恢復版本'],2);
assert.equal(end('delivery',3).metrics['客戶游標'],44);
assert.equal(end('retries',3).metrics['底層最大呼叫'],27);
assert.equal(end('retries',3,1).metrics['底層最大呼叫'],3);
for(let n=1;n<=6;n++)for(let mode=0;mode<2;mode++){
  const trace=models.batching(n,mode);
  const sends=trace.filter(state=>'本批筆數'in state.metrics);
  assert.equal(sends.reduce((sum,state)=>sum+state.metrics['本批筆數'],0),6);
  for(const state of sends){
    assert.ok(state.metrics['本批筆數']<=n);
    assert.ok(parseFloat(state.metrics['本批最久等待'])<=(mode?5:25));
  }
}
assert.equal(end('batching',4).metrics['批次數'],2);
assert.equal(end('batching',4,1).metrics['批次數'],6);
assert.equal(end('sharding',180).metrics['最熱區超量'],110);
assert.equal(end('sharding',180,1).metrics['最熱區超量'],0);
assert.equal(models.autoscale(120).at(-2).metrics['還要清空'],'240秒');
assert.equal(end('autoscale',120).metrics['經過時間'],'360秒');
assert.equal(end('autoscale',120,1).metrics['經過時間'],'200秒');
assert.equal(end('breaker',3).metrics['狀態'],'Closed');
assert.equal(end('breaker',3,1).metrics['狀態'],'Open');
assert.equal(models.fanout(100)[2].metrics['至少一個超時'],'63.4%');
assert.equal(end('shortener',30).metrics['是否立即停用'],'否');
assert.equal(end('shortener',30,1).metrics['是否立即停用'],'是');
assert.equal(end('auth',30).metrics['文件是否回傳'],'是');
assert.equal(end('auth',30,1).metrics['文件是否回傳'],'否');
assert.equal(end('auth',0).metrics['文件是否回傳'],'否');
console.log('System design scenes: PASS — '+scenarios+' parameter scenarios, '+frames+' states; capacity, SLO, quorum, conservation, WAL, retry, batching, recovery and authorization boundaries checked.');
