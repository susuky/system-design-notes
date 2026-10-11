#!/usr/bin/env python3
"""Build the standalone Traditional Chinese system-design reader (stdlib only)."""
from __future__ import annotations
import argparse
import html
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
CHAPTERS = [('建立系統設計的思考框架', 'Introduction', '先把問題說清楚，再讓架構回應問題。', '基礎'), ('把需求轉成設計約束', 'Requirements', '量化流量、延遲、可用性與成長假設。', '基礎'), ('理解硬體與效能邊界', 'Hardware', '用 CPU、記憶體、磁碟與網路建立量級感。', '基礎'), ('讓元件正確溝通', 'Communication', '從協定、API 到分散式呼叫的失敗語意。', '基礎'), ('用快取換取速度', 'Caching', '在命中率、時效性與一致性之間做選擇。', '擴充'), ('以佇列拆開時間耦合', 'Queues', '理解非同步、重試、順序與交付保證。', '擴充'), ('深入儲存引擎的內部', 'Storage', '從存取模式與資料模型推導儲存方案。', '擴充'), ('讓通訊更有效率', 'Efficient communication', '降低等待、傳輸與扇出成本。', '擴充'), ('讓資料可靠地抵達', 'Reliability', '用複寫、隔離與復原處理不可避免的失敗。', '可靠'), ('批次與壓縮的取捨', 'Batching and compression', '攤薄成本，同時守住延遲與資源預算。', '可靠'), ('切分資料與工作負載', 'Partitioning', '處理熱點、路由、重新平衡與跨分區成本。', '可靠'), ('保護伺服器與下游', 'Server protection', '以限流、背壓與降級控制系統負載。', '可靠'), ('保護客戶端與使用者', 'Client protection', '設定逾時、退避與容錯，避免放大故障。', '可靠'), ('把元件連成設計方法', 'Epilogue', '用可驗證的取捨，完成端到端設計敘事。', '實戰'), ('設計短網址服務', 'URL shortener', '從編碼、唯一性一路走到擴充與濫用治理。', '實戰'), ('反詐、認證與監控實戰', 'Fraud, auth and monitoring', '把安全邊界與營運訊號納入完整架構。', '實戰')]

class ChapterParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.articles, self.headings, self.ids, self.refs = [], [], [], []
        self.forbidden, self.resources = [], []
        self.current = None
        self.title = ''
        self.in_title = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if attrs.get('href', '').startswith('#'):
            self.refs.append(attrs['href'][1:])
        if tag == 'article':
            self.articles.append(attrs)
        if tag == 'h2':
            self.in_title = True
        if tag == 'h3':
            self.current = {'id': attrs.get('id'), 'text': ''}
        if tag in ('script', 'style', 'iframe', 'html', 'head', 'body', 'object', 'embed', 'base'):
            self.forbidden.append(tag)
        if any(k.lower().startswith('on') for k in attrs):
            self.forbidden.append('inline event handler')
        for key in ('src', 'srcset', 'poster'):
            if attrs.get(key) and not attrs[key].startswith('data:'):
                self.resources.append(attrs[key])
        if tag == 'link' and attrs.get('href'):
            self.resources.append(attrs['href'])
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
    def handle_data(self, data):
        if self.current is not None:
            self.current['text'] += data
        if self.in_title:
            self.title += data
    def handle_endtag(self, tag):
        if tag == 'h3' and self.current is not None:
            self.current['text'] = ' '.join(self.current['text'].split())
            self.headings.append(self.current)
            self.current = None
        if tag == 'h2':
            self.in_title = False

def build(root: Path = ROOT, output: Path | None = None):
    root = Path(root)
    output = Path(output) if output else root / 'index.html'
    required = ['outline.json'] + [f'chapters/{i:02}.html' for i in range(1, 17)] + [f'source/{name}' for name in ['shell.html', 'styles.css', 'app.js', 'labs.html', 'labs.css', 'labs.js', 'visuals.js', 'legacy-visuals.css']]
    missing = [name for name in required if not (root / name).is_file()]
    if missing:
        raise ValueError('無法建置：缺少 ' + ', '.join(missing) + '。不會以假內容替代。')
    outline = json.loads((root / 'outline.json').read_text(encoding='utf-8'))
    if len(outline['chapters']) != 16:
        raise ValueError('outline.json 必須含 16 章')
    all_ids = set()
    contents, meta, sidebar, cards = [], [], [], []
    previous_group = None
    for i, (short, english, description, group) in enumerate(CHAPTERS, 1):
        path = root / 'chapters' / f'{i:02}.html'
        content = path.read_text(encoding='utf-8')
        parser = ChapterParser()
        parser.feed(content)
        chapter_id = f'chapter-{i:02}'
        if len(parser.articles) != 1 or parser.articles[0].get('id') != chapter_id:
            raise ValueError(f'{path.name}: 必須恰有一個 article，id 為 {chapter_id}')
        if parser.forbidden:
            raise ValueError(f'{path.name}: 不可包含 {parser.forbidden}')
        if parser.resources:
            raise ValueError(f'{path.name}: 不可依賴外部資源 {parser.resources}')
        if not parser.title.strip() or not parser.headings:
            raise ValueError(f'{path.name}: 缺少 h2 章標題或 h3 小節')
        if any(not heading['id'] for heading in parser.headings):
            raise ValueError(f'{path.name}: 每個 h3 都需要穩定的 id')
        for identifier in parser.ids:
            if identifier in all_ids:
                raise ValueError(f'重複 id: {identifier}')
            all_ids.add(identifier)
        title = parser.articles[0].get('data-title', parser.title.strip())
        public = outline['chapters'][i - 1]
        meta.append({'id': chapter_id, 'number': f'{i:02}', 'title': title, 'short': short, 'keywords': ' '.join([english, public['title'], *public['topics']]), 'topics': parser.headings, 'syllabusTopics': public['topics']})
        # Keep the entire source body, including every SVG, story and exercise.
        contents.append(content)
        if group != previous_group:
            sidebar.append(f'<li class="nav-group">{group}</li>')
            previous_group = group
        sidebar.append(f'<li><a class="chapter-link" data-chapter="{chapter_id}" href="#{chapter_id}"><span class="chapter-number">{i:02}</span><span>{html.escape(short)}</span><span class="nav-done" aria-hidden="true"></span></a></li>')
        cards.append(f'<li><a href="#{chapter_id}"><span class="map-number">{i:02}</span><span class="map-content"><strong>{html.escape(short)}</strong><span class="map-summary">{html.escape(description)}</span></span><small class="map-part">{group}</small><span class="map-arrow" aria-hidden="true">↗</span></a></li>')
    source = root / 'source'
    topic_count = sum(len(ch['topics']) for ch in outline['chapters'])
    replacements = {
        'STYLES': '\n'.join((source / name).read_text(encoding='utf-8') for name in ['styles.css', 'legacy-visuals.css', 'labs.css']),
        'APP_JS': (source / 'app.js').read_text(encoding='utf-8'),
        'LABS_JS': (source / 'labs.js').read_text(encoding='utf-8'),
        'VISUALS_JS': (source / 'visuals.js').read_text(encoding='utf-8'),
        'CHAPTERS': '\n'.join(contents),
        'CHAPTER_META': json.dumps(meta, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029'),
        'SIDEBAR': '\n'.join(sidebar),
        'CHAPTER_MAP': '\n'.join(cards),
        'LABS': (source / 'labs.html').read_text(encoding='utf-8'),
        'TOPIC_COUNT': str(topic_count),
    }
    rendered = (source / 'shell.html').read_text(encoding='utf-8')
    for key, value in replacements.items():
        rendered = rendered.replace('{{' + key + '}}', value)
    if re.search(r'\{\{[A-Z_]+\}\}', rendered):
        raise ValueError('有未替換的建置變數')
    final = ChapterParser()
    final.feed(rendered)
    ids = set()
    for identifier in final.ids:
        if identifier in ids:
            raise ValueError(f'整合後 id 重複: {identifier}')
        ids.add(identifier)
    broken = sorted({ref for ref in final.refs if ref and ref not in ids})
    if broken:
        raise ValueError('無效的內部連結: ' + ', '.join(broken))
    if final.resources or re.search(r'@import\s|url\([\s\"\']*https?://', replacements['STYLES'], re.I):
        raise ValueError('必須完整離線，不可載入外部檔案')
    output.write_text(rendered, encoding='utf-8')
    return {'chapters': len(meta), 'topics': topic_count, 'headings': sum(len(ch['topics']) for ch in meta), 'bytes': output.stat().st_size, 'path': str(output)}

if __name__ == '__main__':
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--root', type=Path, default=ROOT)
    cli.add_argument('--output', type=Path)
    args = cli.parse_args()
    try:
        result = build(args.root.resolve(), args.output)
    except (ValueError, OSError, KeyError) as error:
        cli.exit(1, str(error) + '\n')
    print(json.dumps(result, ensure_ascii=False))
