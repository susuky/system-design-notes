#!/usr/bin/env node
/* Optional real Chromium regression suite. Requires Playwright and Chromium.
 * CHROMIUM_PATH selects an installed browser; COURSE_SCREENSHOTS saves review images.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const file=path.resolve(process.argv[2]||path.join(__dirname,'../index.html'));
const screenshots=process.env.COURSE_SCREENSHOTS||process.env.DSA_SCREENSHOTS;
const checks=[],errors=[],requests=[];
function pass(label){checks.push(label);console.log('PASS '+label);}
async function run(){
 const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
 const page=await context.newPage();
 page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));
 page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const url=pathToFileURL(file).href;
 await page.goto(url);
 const kind=await page.locator('body').getAttribute('data-course');
 const chapters=await page.locator('#course-meta').evaluate(e=>JSON.parse(e.textContent));
 const topics=chapters.flatMap(c=>c.topics);
 const count=kind==='sd'?16:13;
 const gallery=kind==='sd'?'system-labs':'algorithm-labs';
 if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
 const shot=async name=>{if(screenshots)await page.screenshot({path:path.join(screenshots,kind+'-'+name+'.png'),fullPage:false});};
 const overflow=async label=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+' document overflow');
 const waitUnit=id=>page.waitForFunction(id=>{const e=document.getElementById(id);return e&&!e.closest('[hidden]');},id);
 const visibleUnits=()=>page.locator('#chapters .lesson-unit').evaluateAll(es=>es.filter(e=>!e.closest('[hidden]')).map(e=>e.dataset.lesson));
 async function go(id){
  await page.evaluate(id=>{if(location.hash==='#'+id)window.dispatchEvent(new HashChangeEvent('hashchange'));else location.hash=id;},id);
  await page.waitForFunction(id=>{const e=document.getElementById(id);return e&&!e.closest('[hidden]');},id);
 }
 assert.equal(chapters.length,count);
 assert.equal(await page.locator('#chapters>article').count(),count);
 assert.equal(await page.locator('#chapters .lesson-unit').count(),topics.length);
 assert.ok(await page.locator('#course-home').isVisible());
 await overflow('desktop home');await shot('desktop-home');
 pass('Standalone home, chapter and unit inventory');
 if(kind==='sd'){
  await page.locator('.hero-actions a[href="#system-labs"]').click();
  await page.waitForURL(/#system-labs$/);
  await waitUnit('sim-sd-routing');
  assert.ok(await page.locator('#sim-sd-routing').isVisible());
  await go('course-home');
 }
 await page.locator('.hero-actions').getByRole('link',{name:'開始學習'}).click();
 await page.waitForURL(/#chapter-01$/);await waitUnit(topics[0].id);
 assert.deepEqual(await visibleUnits(),[topics[0].id]);
 await page.locator('#next-chapter').click();await page.waitForURL(new RegExp('#'+topics[1].id+'$'));await waitUnit(topics[1].id);
 assert.deepEqual(await visibleUnits(),[topics[1].id]);
 await page.goBack();await waitUnit(topics[0].id);assert.deepEqual(await visibleUnits(),[topics[0].id]);
 await page.locator('button[data-reading-view="chapter"]').click();
 assert.equal((await visibleUnits()).length,chapters[0].topics.length);
 assert.equal(await page.locator('#next-chapter').getAttribute('href'),'#chapter-02');
 await page.locator('button[data-reading-view="unit"]').click();
 assert.deepEqual(await visibleUnits(),[topics[0].id]);
 await page.locator('.skip-link').focus();await page.keyboard.press('Enter');
 assert.ok(await page.locator('#chapter-01').isVisible());
 pass('Unit next, browser Back, whole chapter toggle, skip link');
 await page.locator('#bookmark-button').click();await page.locator('#complete-button').click();await page.reload();
 assert.equal(await page.locator('#bookmark-button').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#course-progress-text').innerText(),'1 / '+count);
 await page.locator('#show-bookmarks').click();
 assert.equal(await page.locator('#bookmark-list a').count(),1);
 await page.locator('#bookmark-list a').click();assert.ok(await page.locator('#bookmark-dialog').isHidden());
 pass('Bookmark, chapter completion, reload and bookmark route');
 await page.keyboard.press('/');await page.locator('#search-input').fill(kind==='dsa'?'binary search':'快取旁路');
 await page.waitForFunction(()=>document.querySelectorAll('.search-result').length>0);
 await page.locator('.search-result').first().click();
 assert.ok(await page.locator('#search-dialog').isHidden());
 const foundHash=await page.evaluate(()=>location.hash.slice(1));
 await waitUnit(foundHash);assert.ok(await page.locator('#'+foundHash).isVisible());
 await page.locator('#search-button').click();await page.locator('#search-input').fill('zzzzz987654321');
 await page.waitForFunction(()=>document.querySelectorAll('.search-result').length===0);
 await page.keyboard.press('Escape');
 pass('Search result opens its unit; empty result and Escape work');
 await page.locator('#theme-select').selectOption('dark');await page.reload();
 assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await shot('dark-reader');
 await page.locator('#theme-select').selectOption('light');
 pass('Theme persistence');
 await go(chapters[2].topics[0].id);
 await page.locator('button[data-reading-view="chapter"]').click();
 assert.equal(await page.locator('#prev-chapter').getAttribute('href'),'#chapter-02');
 assert.equal(await page.locator('#next-chapter').getAttribute('href'),'#chapter-04');
 await page.locator('button[data-reading-view="unit"]').click();
 pass('Whole chapter previous and next use chapter identity');
 await page.locator('button[data-reading-view="chapter"]').click();
 const scrolledTopic=chapters[2].topics[2].id;
 await page.locator('#'+scrolledTopic).evaluate(e=>e.scrollIntoView({block:'start'}));
 // Click the sticky toolbar in place; locator auto-scroll changes the reading position.
 const modeButton=await page.locator('button[data-reading-view="unit"]').boundingBox();
 await page.mouse.click(modeButton.x+modeButton.width/2,modeButton.y+modeButton.height/2);await waitUnit(scrolledTopic);
 assert.deepEqual(await visibleUnits(),[scrolledTopic]);
 pass('Returning from whole chapter keeps the unit being read');
 for(const topic of topics){
  await go(topic.id);
  assert.deepEqual(await visibleUnits(),[topic.id],topic.id);
  await overflow(topic.id);
 }
 pass('All '+topics.length+' direct unit URLs show exactly one unit without desktop overflow');
 await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
 assert.equal(await page.locator('#chapters details:not([open])').count(),0);
 await page.emulateMedia({media:'print'});
 assert.ok(await page.locator('#chapter-01').isVisible());
 assert.ok(await page.locator('#chapter-'+String(count).padStart(2,'0')).isVisible());
 assert.equal(await page.locator('#chapters .lesson-unit:visible').count(),topics.length);
 await page.emulateMedia({media:'screen'});await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
 assert.ok(await page.locator('#chapters details:not([open])').count()>0);
 pass('Print shows every unit and answer, then restores disclosures');
 await go(gallery);
 const galleryPanels=await page.locator('#'+gallery+' [data-lab], #'+gallery+' [data-sd-lab]').evaluateAll(es=>es.map(e=>e.id));
 assert.equal(galleryPanels.length,6);
 for(const id of galleryPanels){
  await go(id);
  assert.equal(await page.locator('#'+gallery+' [data-lab]:visible, #'+gallery+' [data-sd-lab]:visible').count(),1);
 }
 assert.equal(await page.locator('.scenario-directory a').count(),kind==='sd'?16:8);
 const directoryTarget=await page.locator('.scenario-directory a').first().getAttribute('href');
 await page.locator('.scenario-directory a').first().click();await page.waitForURL(new RegExp(directoryTarget+'$'));await waitUnit(directoryTarget.slice(1));
 assert.ok(await page.locator(directoryTarget).isVisible());
 pass('Six gallery selections and chapter experiment directory');
 if(kind==='dsa'){
  const labs=await page.locator('#chapters [data-lab]').evaluateAll(es=>es.map(e=>({id:e.id,key:e.dataset.lab})));
  assert.equal(new Set(labs.map(e=>e.key)).size,14);
  for(const {id,key} of labs){
   await go(id);const lab=page.locator('#'+id);
   await lab.locator('[data-action="reset"]').click();
   assert.equal(await lab.getAttribute('data-step'),'0');
   await lab.locator('[data-action="next"]').click();assert.equal(await lab.getAttribute('data-step'),'1');
   await lab.locator('[data-action="prev"]').click();assert.equal(await lab.getAttribute('data-step'),'0');
   const steps=await lab.evaluate(el=>{const next=el.querySelector('[data-action="next"]');let n=0;while(!next.disabled&&n<500){next.click();n++;}return n;});
   assert.ok(steps<500,key+' terminates');
   assert.equal(await lab.getAttribute('data-done'),'true',key);
   await lab.locator('[data-action="reset"]').click();
   await overflow(key);
  }
  pass('All 14 algorithm views: next, previous, result, reset');
  await go('lab-two-pointers');
  const pair=page.locator('#lab-two-pointers');
  await pair.locator('input[name="array"]').fill('9, 1');await pair.locator('button[type="submit"]').click();
  assert.ok(await pair.locator('.lab-error').isVisible());
  await pair.locator('input[name="array"]').fill('1, 9');await pair.locator('button[type="submit"]').click();
  assert.ok(await pair.locator('.lab-error').isHidden());
  await pair.locator('[data-action="play"]').click();
  await page.waitForFunction(()=>+document.querySelector('#lab-two-pointers').dataset.step>0);
  await go(topics[0].id);
  assert.equal(await pair.locator('[data-action="play"]').innerText(),'播放');
  await go('lab-binary-search');
  const binary=page.locator('#lab-binary-search');
  await binary.locator('input[name="array"]').fill('');await binary.locator('button[type="submit"]').click();
  await binary.locator('[data-action="next"]').click();assert.equal(await binary.getAttribute('data-done'),'true');
  pass('Custom input errors, empty input, playback and route pause');
 }else{
  const simulationIDs=['sim-sd-routing', 'sim-sd-cache', 'sim-sd-queue', 'sim-sd-quorum', 'sim-sd-breaker', 'sim-sd-hashing'];
  assert.equal(await page.locator('#system-labs [data-sd-simulation]').count(),simulationIDs.length);
  const simulation=id=>page.locator('#sim-sd-'+id);
  const activate=(panel,action)=>panel.locator('[data-sim-action="'+action+'"]').click();
  const metric=(panel,index)=>panel.locator('.sim-metrics dd').nth(index).innerText();
  const value=(panel,key)=>panel.locator('[data-sim-node="'+key+'"] .sim-node-value').innerText();
  const wire=(panel,index)=>panel.locator('[data-sim-wire="'+index+'"]').getAttribute('data-tone');

  await go('sim-sd-routing');
  const routing=simulation('routing');
  const serverB=routing.getByRole('button',{name:'切換伺服器 B'});
  await activate(routing,'step');
  await activate(routing,'step');
  assert.equal(await metric(routing,0),'10 件');
  assert.equal(await value(routing,'server1'),'排隊 2');
  await serverB.press('Space');
  assert.equal(await serverB.getAttribute('aria-pressed'),'false');
  assert.equal(await metric(routing,2),'2 件');
  await activate(routing,'step');
  assert.equal(await wire(routing,1),'warn');
  assert.equal(await metric(routing,0),'16 件');
  await shot('routing-offline');
  await serverB.press('Enter');
  assert.equal(await serverB.getAttribute('aria-pressed'),'true');
  await routing.locator('select').selectOption('work');
  await activate(routing,'reset');
  await activate(routing,'step');
  await activate(routing,'step');
  assert.equal(await metric(routing,0),'12 件');
  assert.equal(await metric(routing,1),'0 件');

  await go('sim-sd-cache');
  const cache=simulation('cache');
  await cache.getByRole('slider').press('ArrowRight');
  assert.equal(await cache.getByRole('slider').getAttribute('aria-valuetext'),'5 秒');
  await activate(cache,'write');
  await activate(cache,'read');
  assert.equal(await value(cache,'db'),'v2');
  assert.equal(await metric(cache,1),'1 次');
  assert.equal(await metric(cache,2),'v1');
  assert.equal(await metric(cache,3),'5 ms');
  await shot('cache-stale');
  for(let time=0;time<4;time++)await activate(cache,'time');
  assert.equal(await value(cache,'cache'),'空');
  await activate(cache,'read');
  assert.equal(await wire(cache,1),'flow');
  assert.equal(await metric(cache,2),'v2');
  assert.equal(await metric(cache,3),'70 ms');
  await cache.locator('select').selectOption('invalidate');
  await activate(cache,'write');
  assert.equal(await value(cache,'cache'),'空');
  await activate(cache,'read');
  assert.equal(await metric(cache,2),'v3');

  await go('sim-sd-queue');
  const queue=simulation('queue');
  await activate(queue,'step');
  assert.equal(await metric(queue,0),'4 件');
  await activate(queue,'step');
  assert.equal(await metric(queue,0),'5 件');
  assert.equal(await metric(queue,1),'3 件');
  assert.equal(await wire(queue,0),'warn');
  await shot('queue-backpressure');
  await queue.locator('select').selectOption('reject');
  await activate(queue,'step');
  assert.equal(await metric(queue,1),'0 件');
  assert.equal(await metric(queue,3),'7 件');
  await queue.locator('input[name="arrivals"]').press('Home');
  await activate(queue,'five');
  assert.equal(await metric(queue,0),'0 件');

  await go('sim-sd-quorum');
  const quorum=simulation('quorum');
  await activate(quorum,'write');
  assert.equal(await metric(quorum,1),'已確認 v2');
  await activate(quorum,'read');
  assert.equal(await metric(quorum,1),'讀到 v1');
  assert.equal(await wire(quorum,2),'warn');
  await quorum.getByRole('button',{name:'切換副本 C'}).click();
  await quorum.getByRole('button',{name:'切換副本 B'}).click();
  await activate(quorum,'read');
  assert.equal(await metric(quorum,1),'讀到 v2');
  await activate(quorum,'write');
  assert.equal(await metric(quorum,1),'仲裁失敗');
  assert.equal(await metric(quorum,0),'1／3');
  await shot('quorum-offline');
  await quorum.getByRole('button',{name:'切換副本 B'}).click();
  await activate(quorum,'write');
  assert.equal(await metric(quorum,1),'已確認 v3');

  await go('sim-sd-breaker');
  const breaker=simulation('breaker');
  await activate(breaker,'step');
  assert.equal(await metric(breaker,0),'Open');
  assert.equal(await metric(breaker,1),'3 次');
  await activate(breaker,'cool');
  await activate(breaker,'cool');
  assert.equal(await metric(breaker,0),'Half-Open');
  await breaker.getByRole('button',{name:'切換下游服務'}).click();
  await activate(breaker,'step');
  assert.equal(await metric(breaker,0),'Closed');

  await go('sim-sd-hashing');
  const hashing=simulation('hashing');
  await hashing.locator('select').selectOption('ring');
  await activate(hashing,'toggle-d');
  assert.equal(await metric(hashing,0),'4／4');

  pass('Six live simulations: re-routing, TTL and invalidation, backpressure and rejection, read/write quorums, circuit breaker, and consistent hashing');
  await go('lab-sd-cache');
  const cacheTrace=page.locator('#lab-sd-cache');
  assert.ok(await cacheTrace.locator('form').isHidden());
  await cacheTrace.locator('.sd-lab-settings summary').click();
  await cacheTrace.locator('select').selectOption('race');
  await cacheTrace.locator('button[type="submit"]').click();
  await cacheTrace.locator('[data-sd-action="last"]').click();
  assert.match(await cacheTrace.locator('.sd-lab-explanation').innerText(),/v1/);
  await cacheTrace.locator('.sd-lab-settings summary').click();
  await shot('trace-cache-race');
  pass('Stepwise trace opens a parameter disclosure and applies the cache race');
  for(const id of galleryPanels){
   await go(id);const lab=page.locator('#'+id);
   await lab.locator('[data-sd-action="reset"]').click();
   const initial=await lab.locator('.sd-lab-phase').innerText();
   await lab.locator('[data-sd-action="next"]').click();
   assert.notEqual(await lab.locator('.sd-lab-phase').innerText(),initial);
   await lab.locator('[data-sd-action="prev"]').click();
   assert.equal(await lab.locator('.sd-lab-phase').innerText(),initial);
   await lab.locator('[data-sd-action="last"]').click();
   assert.ok(await lab.locator('[data-sd-action="next"]').isDisabled());
  }
  const scenes=await page.locator('[data-sd-scene]').evaluateAll(es=>es.map(e=>({id:e.id,key:e.dataset.sdScene})));
  assert.equal(scenes.length,16);
  for(const {id,key} of scenes){
   await go(id);const scene=page.locator('#'+id);
   assert.equal(await scene.getAttribute('data-scene-step'),'0');
   await scene.locator('[data-scene-action="next"]').click();
   assert.equal(await scene.getAttribute('data-scene-step'),'1');
   await scene.locator('[data-scene-action="prev"]').click();
   assert.equal(await scene.getAttribute('data-scene-step'),'0');
   await scene.locator('.scene-timeline button').last().click();
   assert.ok(await scene.locator('[data-scene-action="next"]').isDisabled());
   await scene.locator('[data-scene-action="reset"]').click();
   await scene.locator('select').selectOption('1');
   await scene.locator('input[type="range"]').evaluate(e=>{e.value=e.max;e.dispatchEvent(new Event('input',{bubbles:true}));});
   assert.equal(await scene.getAttribute('data-scene-step'),'0');
   assert.ok((await scene.locator('.scene-why').innerText()).trim().length>0,key);
   await overflow(key);
  }
  pass('Six original labs and all 16 scenarios: state, back, timeline, reset and parameter controls');
  const first=page.locator('#'+scenes[0].id);await go(scenes[0].id);
  await first.locator('[data-scene-action="play"]').click();
  assert.equal(await first.locator('.scene-why').getAttribute('aria-live'),'off');
  await page.waitForFunction(id=>+document.getElementById(id).dataset.sceneStep>0,scenes[0].id);
  await go(topics[1].id);
  assert.equal(await first.getAttribute('data-playing'),'false');
  assert.equal(await first.locator('.scene-why').getAttribute('aria-live'),'polite');
  pass('Scenario playback advances and pauses on unit navigation');
 }
 await page.setViewportSize({width:390,height:844});await go('course-home');await overflow('mobile home');await shot('mobile-home');
 await page.locator('#menu-button').click();assert.equal(await page.locator('#sidebar').getAttribute('aria-modal'),'true');
 await page.locator('.chapter-link[href="#chapter-06"]').click();await waitUnit(chapters[5].topics[0].id);
 assert.ok(await page.locator('#chapter-06').isVisible());
 assert.equal(await page.locator('#main-content').evaluate(e=>e.inert),false);
 for(const topic of topics){await go(topic.id);await overflow('390px '+topic.id);}
 pass('390px drawer and all '+topics.length+' units without document overflow');
 await go(topics[0].id);await shot('mobile-reader');
 await page.locator('#search-button').click();
 assert.equal(await page.locator('#search-input').evaluate(e=>e===document.activeElement),true);
 await page.keyboard.press('Escape');
 await go(gallery);
 for(const id of galleryPanels){await go(id);await overflow('390px '+id);}
 await shot('mobile-lab');
 pass('390px dialog focus and six gallery labs without overflow');
 if(kind==='sd'){
  for(const width of [320,390]){
   await page.setViewportSize({width,height:844});
   for(const key of ['routing','cache','queue','quorum','breaker','hashing']){
    await go('sim-sd-'+key);
    assert.ok(await page.locator('#sim-sd-'+key+' .sim-stage').isVisible());
    await overflow(width+'px simulation '+key);
   }
  }
  await go('sim-sd-routing');await shot('mobile-routing');
  await go('scene-cache');await shot('mobile-cache-scene');
  assert.equal(await page.locator('#scene-cache .scene-graph-compact').count(),1);
  pass('Six simulations at 320px and 390px, plus a reflowed chapter diagram');
 }
 const nojs=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
 const staticPage=await nojs.newPage();await staticPage.goto(url);
 assert.ok(await staticPage.locator('#chapter-01').isVisible());
 assert.ok(await staticPage.locator('#chapter-'+String(count).padStart(2,'0')).isVisible());
 assert.ok(await staticPage.locator('#search-button').isHidden());
 assert.ok(await staticPage.locator('noscript').first().isVisible());
 assert.ok(await staticPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 pass('No JavaScript: all chapters readable at 390px');
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
 pass('No JavaScript exceptions or external requests');
 console.log(JSON.stringify({file,course:kind,verification:'Real Chromium',passed:checks.length,units:topics.length,checks,errors,requests},null,2));
 }finally{await browser.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
