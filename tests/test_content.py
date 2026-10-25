#!/usr/bin/env python3
"""Check textbook coverage, stable links, SVG sources, and visual interactions.

Run: python tests/test_content.py [--html path/to/index.html]
Uses Python's standard library and Node. Content may be revised or expanded;
public anchors and working learning activities remain part of the reader contract.
"""
from __future__ import annotations
import argparse
import html
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
import unittest
from urllib.parse import urlsplit
from xml.etree import ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
ARGS = None

# Published deep links, independent of wording and asset contents.
STABLE_ANCHORS = {
    '01': 'chapter-01 ch01-course-introduction ch01-who-will-benefit ch01-course-overview visual-01-map ch01-references'.split(),
    '02': 'chapter-02 ch02-system-requirements ch02-functional-requirements ch02-high-availability ch02-fault-tolerance-resilience-reliability ch02-scalability ch02-performance visual-02-latency ch02-durability ch02-consistency story-replica visual-02-replica ch02-maintainability-security-cost ch02-summary-system-requirements ch02-references'.split(),
    '03': 'chapter-03 ch03-regions-zones-datacenters-racks-servers visual-03-domains ch03-physical-vm-container-serverless ch03-references'.split(),
    '04': 'chapter-04 c04-sync-async c04-messaging-patterns visual-04-fanout c04-network-protocols c04-blocking-io c04-encoding c04-acknowledgment visual-04-ack'.split(),
    '05': 'chapter-05 c05-deduplication-cache visual-05-race c05-metadata-cache story-cache visual-05-cache'.split(),
    '06': 'chapter-06 c06-queue c06-full-empty lab-queue visual-06-backlog c06-start-simple c06-blocking-producer-consumer c06-thread-pool visual-06-pool c06-big-compute'.split(),
    '07': 'chapter-07 c07-learning-goals c07-log c07-index c07-time-series c07-simple-kv c07-btree visual-07-btree c07-embedded c07-rocksdb visual-07-lsm c07-lsm-btree story-lsm c07-page-cache c07-capstone c07-references'.split(),
    '08': 'chapter-08 c08-learning-goals c08-push-pull c08-host-discovery c08-service-discovery c08-peer-discovery c08-choose-protocol c08-real-protocols c08-video-http c08-cdn visual-08-cdn c08-push-technologies c08-real-push-pull c08-large-push c08-capstone c08-references'.split(),
    '09': 'chapter-09 ch09-reliable-systems ch09-timeouts visual-09-budget ch09-failed-requests ch09-when-retry ch09-how-retry visual-09-jitter ch09-delivery-guarantees story-retry ch09-consumer-offsets visual-09-offset'.split(),
    '10': 'chapter-10 ch10-batching visual-10-batch ch10-compression'.split(),
    '11': 'chapter-11 ch11-scale-consumption ch11-real-world-partitioning ch11-partitioning-strategies lab-shards visual-11-hotkey ch11-request-routing ch11-rebalancing ch11-consistent-hashing visual-11-ring'.split(),
    '12': 'chapter-12 c12-system-overload c12-autoscaling visual-12-scale c12-autoscaling-system-design c12-load-shedding c12-rate-limiting story-token visual-12-token'.split(),
    '13': 'chapter-13 c13-sync-async-clients c13-circuit-breaker story-breaker visual-13-breaker c13-fail-fast c13-bulkhead visual-13-bulkhead c13-shuffle-sharding'.split(),
    '14': 'chapter-14 c14-the-end visual-14-loop'.split(),
    '15': 'chapter-15 c15-guidelines c15-url-shortening visual-15-revoke'.split(),
    '16': 'chapter-16 c16-guidelines c16-fraud-detection c16-auth-system visual-16-auth c16-monitoring-system visual-16-observe'.split(),
}
STORY_FRAMES = {'cache': 5, 'replica': 5, 'retry': 4, 'breaker': 5, 'lsm': 4, 'token': 5}
PRIMARY_SOURCE_HOSTS = {
    'aws.amazon.com', 'kubernetes.io', 'sre.google', 'rfc-editor.org',
    'postgresql.org', 'sqlite.org', 'rabbitmq.com', 'learn.microsoft.com',
    'docs.python.org', 'docs.oracle.com', 'openid.net', 'opentelemetry.io',
    'prometheus.io', 'research.google', 'docs.kernel.org', 'owasp.org',
}

ALIASES = {
    ('01', 'Who will benefit from the course and how'): ['Who will benefit'],
    ('02', 'Summary of system requirements'): ['Summary of system requirements', 'Summary system requirements'],
    ('08', 'How to choose a network protocol'): ['How to choose network protocol'],
    ('09', 'What else to know to build reliable, scalable, and fast systems'): ['What else to know to build reliable scalable fast systems', 'Reliability and completion'],
    ('15', 'Guidelines for part 1 problems'): ['Guidelines'],
    ('16', 'Guidelines for part 2 problems'): ['Guidelines'],
}

def plain(source):
    return html.unescape(re.sub(r'<[^>]+>', ' ', source))

def normalized(source):
    return ' '.join(re.findall(r'[a-z0-9]+', plain(source).lower()))

class Tree(HTMLParser):
    VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = {'tag': 'document', 'attrs': {}, 'children': []}
        self.stack = [self.root]
    def handle_starttag(self, tag, attrs):
        node = {'tag': tag, 'attrs': dict(attrs), 'children': []}
        self.stack[-1]['children'].append(node)
        if tag not in self.VOID: self.stack.append(node)
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in self.VOID: self.handle_endtag(tag)
    def handle_endtag(self, tag):
        for i in range(len(self.stack)-1, 0, -1):
            if self.stack[i]['tag'] == tag:
                del self.stack[i:]
                break
    def handle_data(self, text):
        self.stack[-1]['children'].append(text)

def nodes(node):
    if isinstance(node, str):
        return
    yield node
    for child in node['children']:
        yield from nodes(child)


def has_class(node, name):
    return name in node['attrs'].get('class', '').split()


JS_TEST = r'''
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const payload=JSON.parse(fs.readFileSync(0,'utf8'));const checks=[];
function check(label,fn){fn();checks.push(label);}
const listeners={},timers=new Map();let nextTimer=0;
function matches(el,selector){
  if(!el.tag)return false;
  return selector.split(',').some(s=>{
    s=s.trim();const attrs=[...s.matchAll(/\[([^=\]]+)(?:="([^"]*)")?\]/g)];
    for(const [,key,value] of attrs)if(!(key in el.attrs)||(value!==undefined&&el.attrs[key]!==value))return false;
    s=s.replace(/\[[^\]]+\]/g,'');
    const id=s.match(/#([\w-]+)/);if(id&&el.attrs.id!==id[1])return false;
    for(const [,c]of s.matchAll(/\.([\w-]+)/g))if(!el.classList.contains(c))return false;
    const tag=s.match(/^[a-zA-Z][\w-]*/);return !tag||tag[0]===el.tag;
  });
}
class Element{
  constructor(tag,attrs={}){this.tag=tag;this.attrs={...attrs};this.children=[];this.parentElement=null;this.style={};this.events={};this.value=attrs.value||'';this.checked='checked'in attrs;
    this.classList={contains:c=>(this.attrs.class||'').split(/\s+/).includes(c),toggle:(c,force)=>{const set=new Set((this.attrs.class||'').split(/\s+/).filter(Boolean));if(force===undefined? !set.has(c):force)set.add(c);else set.delete(c);this.attrs.class=[...set].join(' ');}};
    this.dataset=new Proxy({}, {get:(_,k)=>this.attrs['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())],set:(_,k,v)=>{this.attrs['data-'+k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())]=String(v);return true;}});
  }
  get textContent(){return this.children.map(x=>typeof x==='string'?x:x.textContent).join('');}set textContent(v){this.children=[String(v)];}
  get hidden(){return 'hidden'in this.attrs;}set hidden(v){if(v)this.attrs.hidden='';else delete this.attrs.hidden;}
  get disabled(){return 'disabled'in this.attrs;}set disabled(v){if(v)this.attrs.disabled='';else delete this.attrs.disabled;}
  setAttribute(k,v){this.attrs[k]=String(v);}getAttribute(k){return this.attrs[k]??null;}
  append(...items){for(const x of items){if(typeof x!=='string')x.parentElement=this;this.children.push(x);}}
  replaceChildren(...items){this.children=[];this.append(...items);}
  querySelectorAll(s){const out=[];const walk=e=>{for(const c of e.children){if(typeof c==='string')continue;if(matches(c,s))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
  closest(s){let e=this;while(e){if(matches(e,s))return e;e=e.parentElement;}return null;}
  contains(e){while(e){if(e===this)return true;e=e.parentElement;}return false;}
  addEventListener(type,fn){(this.events[type]||=[]).push(fn);}dispatch(type){for(const fn of this.events[type]||[])fn({target:this});}click(){if(!this.disabled)this.dispatch('click');}
}
function from(x){if(typeof x==='string')return x;const n=new Element(x.tag,x.attrs);n.append(...x.children.map(from));return n;}
const doc=from(payload.tree);doc.getElementById=id=>doc.querySelector('#'+id);doc.createElement=t=>new Element(t);doc.visibilityState='visible';doc.addEventListener=(type,fn)=>(listeners['doc:'+type]||=[]).push(fn);
const window={addEventListener:(type,fn)=>(listeners[type]||=[]).push(fn)};
const context={document:doc,window,console,setTimeout:fn=>{const id=++nextTimer;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)};
vm.runInNewContext(payload.source,context,{filename:'visuals.js'});
const event=type=>{for(const fn of listeners[type]||[])fn();};const tick=()=>{for(const [id,fn]of [...timers]){timers.delete(id);fn();}};
const $=id=>doc.getElementById(id),model=window.SystemDesignVisuals;
check('All stories initialize with exactly one frame and keyboard-scrollable diagrams',()=>{
 assert.ok(doc.querySelectorAll('.live-story').length>=6);
 for(const p of doc.querySelectorAll('.live-story')){assert.equal(p.querySelectorAll('.story-frame').filter(f=>!f.hidden).length,1);assert.equal(p.querySelector('.story-controls').hidden,false);assert.equal(p.querySelector('.scene-scroll').getAttribute('tabindex'),'0');}
});
const story=$('story-cache'),frames=story.querySelectorAll('.story-frame'),action=n=>story.querySelector(`[data-story-action="${n}"]`);
check('Previous, next, reset, and direct reveal preserve selected-frame state',()=>{
 action('next').click();assert.equal(story.dataset.currentStep,'1');action('prev').click();assert.equal(story.dataset.currentStep,'0');assert.equal(action('prev').disabled,true);
 model.reveal(frames[3].querySelector('p'));assert.equal(story.dataset.currentStep,'3');model.reveal(null);action('reset').click();assert.equal(story.dataset.currentStep,'0');
});
check('Autoplay stops at the last frame and does not accumulate timers',()=>{
 action('play').click();for(let i=0;i<frames.length+2;i++)tick();assert.equal(story.dataset.currentStep,String(frames.length-1));assert.equal(action('play').getAttribute('aria-pressed'),'false');assert.equal(timers.size,0);assert.equal(action('next').disabled,true);
 action('play').click();assert.equal(story.dataset.currentStep,'0');action('play').click();tick();assert.equal(story.dataset.currentStep,'0');assert.equal(timers.size,0);
});
check('Route changes, hidden chapters, and background tabs stop playback',()=>{
 action('play').click();event('hashchange');assert.equal(timers.size,0);
 action('play').click();story.closest('article').hidden=true;tick();assert.equal(action('play').getAttribute('aria-pressed'),'false');story.closest('article').hidden=false;
 action('play').click();doc.visibilityState='hidden';event('doc:visibilitychange');assert.equal(timers.size,0);doc.visibilityState='visible';
});
check('Printing reveals every frame and restores each selected frame',()=>{
 action('next').click();const selected=story.dataset.currentStep;event('beforeprint');assert.equal(doc.querySelectorAll('.story-frame').filter(f=>!f.hidden).length,doc.querySelectorAll('.story-frame').length);event('afterprint');assert.equal(story.dataset.currentStep,selected);assert.equal(frames.filter(f=>!f.hidden).length,1);
});
const q=$('lab-queue'),qq=n=>q.querySelector(`[data-q="${n}"]`);
check('Original queue experiment rejects overflow, drains, and resets',()=>{
 for(let i=0;i<6;i++)qq('tick').click();assert.equal(qq('backlog').textContent,'120 / 120');assert.equal(qq('done').textContent,'180');assert.equal(qq('rejected').textContent,'0');
 qq('tick').click();assert.equal(qq('rejected').textContent,'20');qq('workers').value='8';qq('workers').dispatch('input');for(let i=0;i<4;i++)qq('tick').click();assert.equal(qq('backlog').textContent,'0 / 120');assert.equal(qq('rejected').textContent,'20');qq('reset').click();assert.equal(qq('time').textContent,'0');assert.equal(qq('done').textContent,'0');
});
check('Queue conservation and capacity hold for 616 input combinations',()=>{
 let combinations=0;for(let a=0;a<=100;a+=10)for(let w=1;w<=8;w++)for(let b=0;b<=120;b+=20){const old={time:4,backlog:b,done:29,rejected:7};const n=model.queueStep(old,a,w);assert.equal(b+a,n.backlog+n.done-old.done+n.rejected-old.rejected);assert.ok(n.backlog>=0&&n.backlog<=120);assert.ok(n.done-old.done<=w*10);assert.equal(n.time,5);assert.equal(old.backlog,b);combinations++;}assert.equal(combinations,616);
});
const s=$('lab-shards'),ss=n=>s.querySelector(`[data-s="${n}"]`);
check('Original partition experiment preserves hot-key and total-overload semantics',()=>{
 assert.equal(ss('rate-0').textContent,'210/s · 過載');ss('split').checked=true;ss('split').dispatch('change');for(let i=0;i<4;i++)assert.equal(ss('rate-'+i).textContent,'75/s');ss('hot').value='240';ss('other').value='240';ss('hot').dispatch('input');for(let i=0;i<4;i++)assert.equal(ss('rate-'+i).textContent,'120/s · 過載');assert.ok(ss('warning').classList.contains('split-warning'));
 for(let hot=0;hot<=240;hot+=20)for(let other=0;other<=240;other+=40)for(const split of [false,true]){const loads=model.partitionLoads(hot,other,split);assert.equal(loads.reduce((a,b)=>a+b,0),hot+other);if(split)assert.ok(loads.every(x=>x===(hot+other)/4));}
});
console.log(JSON.stringify({passed:checks.length,checks}));
'''

class ContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.chapters = {p.stem: p.read_text(encoding='utf-8')
                        for p in sorted((ROOT / 'chapters').glob('*.html'))}
        cls.all = '\n'.join(cls.chapters.values())
        cls.trees = {}
        for number, source in cls.chapters.items():
            tree = Tree()
            tree.feed(source)
            cls.trees[number] = tree.root
        cls.elements = [node for tree in cls.trees.values() for node in nodes(tree)]
        cls.svgs = re.findall(r'<svg\b.*?</svg>', cls.all, re.S)

    def test_chapters_and_published_anchors(self):
        self.assertEqual(set(self.chapters), set(STABLE_ANCHORS))
        for number, tree in self.trees.items():
            with self.subTest(chapter=number):
                elements = list(nodes(tree))
                articles = [n for n in elements if n['tag'] == 'article']
                self.assertEqual(len(articles), 1)
                self.assertEqual(articles[0]['attrs'].get('id'), 'chapter-' + number)
                self.assertTrue(any(n['tag'] == 'h2' for n in elements))
                ids = {n['attrs'].get('id') for n in elements}
                self.assertFalse(set(STABLE_ANCHORS[number]) - ids, 'Missing published anchor')
                heading_ids = {n['attrs'].get('id') for n in elements if n['tag'] == 'h3'}
                required_headings = {anchor for anchor in STABLE_ANCHORS[number]
                                     if not anchor.startswith(('chapter-', 'visual-', 'story-', 'lab-'))}
                self.assertFalse(required_headings - heading_ids, 'Published section must remain a heading')
        ids = [n['attrs']['id'] for n in self.elements if n['attrs'].get('id')]
        self.assertEqual(len(ids), len(set(ids)), 'Duplicate chapter/SVG IDs')
        self.assertFalse({n['tag'] for n in self.elements} & {'script', 'iframe', 'embed', 'object'})

    def test_all_81_public_topics_are_covered(self):
        outline = json.loads((ROOT / 'outline.json').read_text(encoding='utf-8'))
        self.assertEqual({ch['id'] for ch in outline['chapters']}, set(STABLE_ANCHORS))
        count = 0
        for chapter in outline['chapters']:
            headings = [normalized(h) for h in re.findall(
                r'<h[34]\b[^>]*>(.*?)</h[34]>', self.chapters[chapter['id']], re.S)]
            for topic in chapter['topics']:
                candidates = [topic] + ALIASES.get((chapter['id'], topic), [])
                with self.subTest(chapter=chapter['id'], topic=topic):
                    self.assertTrue(any(normalized(c) in h for c in candidates for h in headings))
                count += 1
        self.assertEqual(count, 81)

    def test_learning_activities_remain_available(self):
        minimums = {'exercise': 49, 'live-story': 6, 'story-frame': 28,
                    'visual-lab': 2, 'visual-explainer': 27}
        for name, minimum in minimums.items():
            self.assertGreaterEqual(sum(has_class(n, name) for n in self.elements), minimum, name)
        by_id = {n['attrs']['id']: n for n in self.elements if n['attrs'].get('id')}
        for name, minimum in STORY_FRAMES.items():
            story = by_id['story-' + name]
            self.assertTrue(has_class(story, 'live-story'))
            frames = [n for n in nodes(story) if has_class(n, 'story-frame')]
            self.assertGreaterEqual(len(frames), minimum, name)
        for target in ('lab-queue', 'lab-shards'):
            self.assertTrue(has_class(by_id[target], 'visual-lab'), target)

    def test_svg_accessibility_and_standalone_sources(self):
        embedded = {}
        for source in self.svgs:
            svg = ET.fromstring(source)
            self.assertEqual(svg.get('role'), 'img')
            labels = svg.get('aria-labelledby', '').split()
            self.assertTrue(labels, 'SVG needs an accessible name')
            by_id = {n.get('id'): n for n in svg.iter() if n.get('id')}
            for label in labels:
                self.assertIn(label, by_id)
                self.assertTrue(''.join(by_id[label].itertext()).strip(), label)
            embedded[labels[0]] = ET.canonicalize(source, strip_text=True)
        required = {f'visuals/{anchor}.svg' for anchors in STABLE_ANCHORS.values()
                    for anchor in anchors if anchor.startswith('visual-')}
        required.update(f'scenes/story-{name}-{step}.svg'
                        for name, count in STORY_FRAMES.items() for step in range(1, count + 1))
        self.assertEqual(len(required), 55)
        assets = {p.relative_to(ROOT).as_posix(): p
                  for directory in ('visuals', 'scenes') for p in (ROOT / directory).glob('*.svg')}
        self.assertFalse(required - assets.keys(), 'Missing standalone SVG source')
        for name, path in assets.items():
            with self.subTest(asset=name):
                source = path.read_text(encoding='utf-8')
                svg = ET.fromstring(source)
                labels = svg.get('aria-labelledby', '').split()
                self.assertTrue(labels)
                self.assertIn(labels[0], embedded, 'Asset is absent from chapter content')
                self.assertEqual(ET.canonicalize(source, strip_text=True), embedded[labels[0]],
                                 'Standalone and embedded SVG differ')

    def test_each_chapter_has_a_primary_reference(self):
        for number, tree in self.trees.items():
            links = [urlsplit(n['attrs'].get('href', '')) for n in nodes(tree) if n['tag'] == 'a']
            with self.subTest(chapter=number):
                self.assertTrue(any(link.scheme == 'https' and any(
                    link.hostname == host or (link.hostname or '').endswith('.' + host)
                    for host in PRIMARY_SOURCE_HOSTS) for link in links),
                    'Chapter needs a link to primary technical documentation')

    def test_visual_models_and_interaction_lifecycle(self):
        tree = Tree()
        tree.feed(self.all)
        payload = json.dumps({'tree': tree.root,
                              'source': (ROOT / 'source/visuals.js').read_text(encoding='utf-8')})
        result = subprocess.run(['node', '-e', JS_TEST], input=payload, text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report['passed'], 8)
        print('\nVisual interactions:', json.dumps(report, ensure_ascii=False))

    def test_build_contains_current_chapters_and_shared_assets(self):
        if not ARGS or not ARGS.html:
            self.skipTest('Supply --html to check the completed build')
        built = ARGS.html.read_text(encoding='utf-8')
        for number, source in self.chapters.items():
            self.assertTrue(source in built, 'Stale or incomplete chapter ' + number)
        for name in ('styles.css', 'legacy-visuals.css', 'labs.css', 'app.js',
                     'labs.js', 'visuals.js', 'labs.html'):
            self.assertTrue((ROOT / 'source' / name).read_text(encoding='utf-8') in built,
                            'Stale shared asset ' + name)
        shell = (ROOT / 'source/shell.html').read_text(encoding='utf-8')
        for part in re.split(r'\{\{[A-Z_]+\}\}', shell):
            if part.strip():
                self.assertTrue(part in built, 'Stale reader shell')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--html', type=Path)
    ARGS, remaining = parser.parse_known_args()
    unittest.main(argv=[__file__] + remaining, verbosity=2)
