(() => {
  'use strict';
  // Deliberately deterministic toy models. No requests, credentials or external state.
  function queueStep(old, arrival, workers) {
    const offered = old.backlog + arrival;
    const done = Math.min(offered, workers * 10);
    const remaining = offered - done;
    return {time:old.time+1, backlog:Math.min(120,remaining), done:old.done+done, rejected:old.rejected+Math.max(0,remaining-120)};
  }
  function partitionLoads(hot, other, split) {
    return Array.from({length:4},(_,i)=>other/4+(split?hot/4:(i===0?hot:0)));
  }
  // Native scroll regions let keyboard readers inspect wide SVGs as well.
  for (const region of document.querySelectorAll('.scene-scroll, figure.visual-explainer')) {
    region.setAttribute('tabindex', '0');
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', '可橫向捲動的圖解');
  }
  const controllers = new Map();
  for (const panel of document.querySelectorAll('.live-story')) {
    const frames = [...panel.querySelectorAll('.story-frame')];
    const controls = panel.querySelector('.story-controls');
    if (!frames.length || !controls) continue;
    const action = name => controls.querySelector(`[data-story-action="${name}"]`);
    let index=0, timer=null, playing=false;
    function stop() {
      if(timer!==null)clearTimeout(timer);
      timer=null;playing=false;panel.dataset.playing="false";
      action('play').textContent='自動播放';action('play').setAttribute('aria-pressed','false');
    }
    function render() {
      frames.forEach((frame,i)=>{frame.hidden=i!==index;});
      controls.querySelector('.story-position').textContent=`第 ${index+1} / ${frames.length} 幕`;
      action('prev').disabled=index===0;action('next').disabled=index===frames.length-1;
      panel.dataset.currentStep=String(index);
    }
    function tick() {
      if (!playing) return;
      const chapter=panel.closest('article');
      if(document.visibilityState==='hidden' || (chapter && chapter.hidden)){stop();return;}
      if(index>=frames.length-1){stop();return;}
      index++;render();
      if(index>=frames.length-1)stop();else timer=setTimeout(tick,2400);
    }
    action('prev').addEventListener('click',()=>{stop();index=Math.max(0,index-1);render();});
    action('next').addEventListener('click',()=>{stop();index=Math.min(frames.length-1,index+1);render();});
    action('reset').addEventListener('click',()=>{stop();index=0;render();});
    action('play').addEventListener('click',()=>{
      if(playing){stop();return;}
      if(index===frames.length-1){index=0;render();}
      playing=true;panel.dataset.playing='true';action('play').textContent='暫停播放';action('play').setAttribute('aria-pressed','true');timer=setTimeout(tick,2400);
    });
    controls.hidden=false;render();
    controllers.set(panel,{stop,render,frames,reveal(target){const n=frames.findIndex(f=>f===target||f.contains(target));if(n>=0){stop();index=n;render();}}});
  }
  const pauseAll=()=>controllers.forEach(c=>c.stop());
  window.addEventListener('hashchange',pauseAll);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')pauseAll();});
  window.addEventListener('beforeprint',()=>{pauseAll();controllers.forEach(c=>c.frames.forEach(f=>f.hidden=false));});
  window.addEventListener('afterprint',()=>controllers.forEach(c=>c.render()));
  window.SystemDesignVisuals=Object.freeze({queueStep,partitionLoads,reveal(target){if(!target || typeof target.closest!=='function')return;const panel=target.closest('.live-story');if(panel&&controllers.has(panel))controllers.get(panel).reveal(target);}});

  const q=document.getElementById('lab-queue');
  if(q){
    const $=name=>q.querySelector(`[data-q="${name}"]`);
    let state={time:0,backlog:0,done:0,rejected:0};
    const values=()=>({arrival:Number($('arrival').value),workers:Number($('workers').value)});
    function render(){
      const {arrival,workers}=values();
      $('arrival-label').textContent=String(arrival);$('worker-label').textContent=String(workers);
      $('arriving').textContent=`${arrival} 件／秒`;$('capacity').textContent=`${workers*10} 件／秒`;
      $('backlog').textContent=`${state.backlog} / 120`;$('water').style.height=`${state.backlog/120*100}%`;
      $('water').classList.toggle('overloaded',state.backlog>=120);
      $('time').textContent=String(state.time);$('done').textContent=String(state.done);$('rejected').textContent=String(state.rejected);
      $('icons').replaceChildren();for(let i=0;i<workers;i++){const icon=document.createElement('span');icon.textContent='⚙';$('icons').append(icon);}
      const delta=arrival-workers*10;
      $('verdict').textContent=delta>0?`到達量比處理能力多 ${delta} 件／秒，積壓會增加；滿載後會拒絕超量工作。`:delta===0?'到達量剛好等於處理能力；既有積壓不會自動消失。':`每秒有 ${-delta} 件剩餘處理能力，可消化既有積壓；清空後只能完成實際抵達的工作。`;
    }
    $('arrival').addEventListener('input',render);$('workers').addEventListener('input',render);
    $('tick').addEventListener('click',()=>{const {arrival,workers}=values();state=queueStep(state,arrival,workers);render();});
    $('reset').addEventListener('click',()=>{state={time:0,backlog:0,done:0,rejected:0};render();});
    q.querySelector('.lab-controls').hidden=false;render();
  }
  const s=document.getElementById('lab-shards');
  if(s){
    const $=name=>s.querySelector(`[data-s="${name}"]`);
    function render(){
      const hot=Number($('hot').value),other=Number($('other').value),split=!!$('split').checked;
      $('hot-label').textContent=String(hot);$('other-label').textContent=String(other);
      const loads=partitionLoads(hot,other,split);
      loads.forEach((v,i)=>{$('bar-'+i).style.height=`${v/300*100}%`;$('bar-'+i).classList.toggle('overloaded',v>100);$('rate-'+i).textContent=`${v}/s${v>100?' · 過載':''}`;});
      const count=loads.filter(v=>v>100).length;
      $('verdict').textContent=`總流量 ${hot+other}/s，總容量 400/s；${count?`${count} 個分區超過各自 100/s 容量。`:'目前沒有分區超過容量。'}${split?' 熱鍵已按假設平均拆分。':' 熱鍵仍集中在分區 0。'}`;
      $('warning').classList.toggle('split-warning',split);
    }
    $('hot').addEventListener('input',render);$('other').addEventListener('input',render);$('split').addEventListener('change',render);
    s.querySelector('.lab-controls').hidden=false;render();
  }
})();
