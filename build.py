#!/usr/bin/env python3
"""Build the standalone Traditional Chinese system-design reader (stdlib only)."""
from __future__ import annotations
import argparse
import html
import json
import os
import re
import stat
import tempfile
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
HIGHLIGHT_COMPONENTS = ('core', 'python', 'sql', 'json', 'http', 'promql')
CHAPTERS = [('建立系統設計的思考框架', 'Introduction', '先把問題說清楚，再讓架構回應問題。', '基礎'), ('把需求轉成設計約束', 'Requirements', '量化流量、延遲、可用性與成長假設。', '基礎'), ('理解硬體與效能邊界', 'Hardware', '用 CPU、記憶體、磁碟與網路建立量級感。', '基礎'), ('讓元件正確溝通', 'Communication', '從協定、API 到分散式呼叫的失敗語意。', '基礎'), ('用快取換取速度', 'Caching', '在命中率、時效性與一致性之間做選擇。', '擴充'), ('以佇列拆開時間耦合', 'Queues', '理解非同步、重試、順序與交付保證。', '擴充'), ('深入儲存引擎的內部', 'Storage', '從存取模式與資料模型推導儲存方案。', '擴充'), ('讓通訊更有效率', 'Efficient communication', '降低等待、傳輸與扇出成本。', '擴充'), ('讓資料可靠地抵達', 'Reliability', '用複寫、隔離與復原處理不可避免的失敗。', '可靠'), ('批次與壓縮的取捨', 'Batching and compression', '攤薄成本，同時守住延遲與資源預算。', '可靠'), ('切分資料與工作負載', 'Partitioning', '處理熱點、路由、重新平衡與跨分區成本。', '可靠'), ('保護伺服器與下游', 'Server protection', '以限流、背壓與降級控制系統負載。', '可靠'), ('保護客戶端與使用者', 'Client protection', '設定逾時、退避與容錯，避免放大故障。', '可靠'), ('把元件連成設計方法', 'Epilogue', '用可驗證的取捨，完成端到端設計敘事。', '實戰'), ('設計短網址服務', 'URL shortener', '從編碼、唯一性一路走到擴充與濫用治理。', '實戰'), ('反詐、認證與監控實戰', 'Fraud, auth and monitoring', '把安全邊界與營運訊號納入完整架構。', '實戰')]


def validate_outline(outline):
    chapters = outline.get('chapters') if isinstance(outline, dict) else None
    if not isinstance(chapters, list) or len(chapters) != len(CHAPTERS):
        raise ValueError('outline.json 的 chapters 必須是含 16 章的陣列')
    for i, chapter in enumerate(chapters, 1):
        if not isinstance(chapter, dict) or chapter.get('id') != f'{i:02}':
            raise ValueError(f'outline.json 第 {i} 章的 id 必須為 {i:02}，並依序排列')
        if not isinstance(chapter.get('title'), str) or not chapter['title'].strip():
            raise ValueError(f'outline.json 第 {i} 章的 title 必須是非空字串')
        topics = chapter.get('topics')
        if not isinstance(topics, list) or not topics or any(
            not isinstance(topic, str) or not topic.strip() for topic in topics
        ):
            raise ValueError(f'outline.json 第 {i} 章的 topics 必須是非空字串陣列')


def embedded_url(value):
    value = value.strip()
    return not value or value.startswith('#') or value.lower().startswith('data:')


def srcset_urls(value):
    """Read candidate URLs without treating a data URL's comma as a separator."""
    position = 0
    while position < len(value):
        while position < len(value) and value[position] in ' \t\r\n\f,':
            position += 1
        start = position
        while position < len(value) and value[position] not in ' \t\r\n\f':
            position += 1
        url = value[start:position]
        if not url:
            break
        yield url.rstrip(',')
        if url.endswith(','):
            continue
        # Skip density/width descriptors until the next candidate.
        parentheses = 0
        while position < len(value):
            char = value[position]
            position += 1
            if char == '(':
                parentheses += 1
            elif char == ')':
                parentheses = max(0, parentheses - 1)
            elif char == ',' and not parentheses:
                break


CSS_ESCAPE = r'\\(?:[0-9a-fA-F]{1,6}(?:\r\n|[ \t\r\n\f])?|[^\r\n\f])'
CSS_IDENT = rf'(?:[-_a-zA-Z]|{CSS_ESCAPE})(?:[-_a-zA-Z0-9]|{CSS_ESCAPE})*'
CSS_TOKEN = re.compile(
    rf'(?P<comment>/\*.*?\*/)|(?P<string>"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\')'
    rf'|(?P<ident>{CSS_IDENT})|(?P<char>.)', re.S
)
CSS_URL = re.compile(r'\s*\(\s*(?:"((?:\\.|[^"\\])*)"|\'((?:\\.|[^\'\\])*)\'|((?:\\.|[^)\\])*))\s*\)', re.S)


def css_unescape(value):
    def replace(match):
        hexadecimal, literal = match.groups()
        if hexadecimal:
            codepoint = int(hexadecimal, 16)
            return chr(codepoint) if 0 < codepoint <= 0x10ffff and not 0xd800 <= codepoint <= 0xdfff else '\ufffd'
        return '' if literal in ('\n', '\r', '\r\n', '\f') else literal
    return re.sub(r'\\(?:([0-9a-fA-F]{1,6})(?:\r\n|[ \t\r\n\f])?|(\r\n|.))', replace, value, flags=re.S)


def css_references(css):
    """Inspect resource-bearing CSS tokens, leaving comments and content strings alone."""
    urls, functions = [], []
    previous, skip_until = '', 0
    for token in CSS_TOKEN.finditer(css):
        if token.start() < skip_until or token.lastgroup == 'comment':
            continue
        if token.lastgroup == 'string':
            if functions and functions[-1] in ('image-set', '-webkit-image-set', 'image'):
                urls.append(css_unescape(token.group()[1:-1]))
        elif token.lastgroup == 'ident':
            name = css_unescape(token.group()).lower()
            if previous == '@' and name == 'import':
                urls.append('@import')
            opening = re.match(r'\s*\(', css[token.end():])
            if opening:
                if name in ('url', 'src'):
                    argument = CSS_URL.match(css, token.end())
                    if not argument:
                        urls.append('無法解析的 url()')
                    else:
                        urls.append(css_unescape(next(group for group in argument.groups() if group is not None)).strip())
                        skip_until = argument.end()
                else:
                    functions.append(name)
                    skip_until = token.end() + opening.end()
        elif token.group() == '(':
            functions.append('')
        elif token.group() == ')' and functions:
            functions.pop()
        if not token.group().isspace():
            previous = token.group()
    return urls


def write_atomic(output, content):
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', newline='\n',
                                         dir=output.parent, prefix=f'.{output.name}.',
                                         suffix='.tmp', delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        mode = stat.S_IMODE(output.stat().st_mode) if output.exists() else 0o644
        temporary.chmod(mode)
        os.replace(temporary, output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


class ChapterParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.articles, self.headings, self.ids, self.refs = [], [], [], []
        self.forbidden, self.resources = [], []
        self.current = None
        self.title = ''
        self.in_title = False
        self.css = []
        self.in_style = False
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        for key in ('href', 'xlink:href'):
            if attrs.get(key, '').strip().startswith('#'):
                self.refs.append(attrs[key].strip()[1:])
        if tag == 'article':
            self.articles.append(attrs)
        if tag == 'h2':
            self.in_title = True
        if tag == 'style':
            self.in_style = True
        if tag == 'h3':
            self.current = {'id': attrs.get('id'), 'text': ''}
        if tag in ('script', 'style', 'iframe', 'html', 'head', 'body', 'object', 'embed', 'base'):
            self.forbidden.append(tag)
        if any(k.lower().startswith('on') for k in attrs):
            self.forbidden.append('inline event handler')
        for key in ('src', 'poster'):
            if attrs.get(key) and not embedded_url(attrs[key]):
                self.resources.append(attrs[key])
        for url in srcset_urls(attrs.get('srcset', '')):
            if not embedded_url(url):
                self.resources.append(url)
        if tag in ('image', 'use', 'feimage'):
            for key in ('href', 'xlink:href'):
                if attrs.get(key) and not embedded_url(attrs[key]):
                    self.resources.append(attrs[key])
        for key in ('style', 'fill', 'stroke', 'filter', 'clip-path', 'mask', 'marker',
                    'marker-start', 'marker-mid', 'marker-end', 'cursor'):
            if attrs.get(key):
                self.css.append(attrs[key])
        if tag == 'link' and attrs.get('href'):
            self.resources.append(attrs['href'])
    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
    def handle_data(self, data):
        if self.current is not None:
            self.current['text'] += data
        if self.in_title:
            self.title += data
        if self.in_style:
            self.css.append(data)
    def handle_endtag(self, tag):
        if tag == 'h3' and self.current is not None:
            self.current['text'] = ' '.join(self.current['text'].split())
            self.headings.append(self.current)
            self.current = None
        if tag == 'h2':
            self.in_title = False
        if tag == 'style':
            self.in_style = False

def build(root: Path = ROOT, output: Path | None = None):
    root = Path(root)
    output = Path(output) if output else root / 'index.html'
    required = ['outline.json'] + [f'chapters/{i:02}.html' for i in range(1, 17)] + [f'source/{name}' for name in ['shell.html', 'styles.css', 'app.js', 'labs.html', 'labs.css', 'labs.js', 'visuals.js', 'legacy-visuals.css', 'highlight.css', 'highlight.js']]
    required += [f'source/vendor/prism/prism-{name}.min.js' for name in HIGHLIGHT_COMPONENTS]
    required.append('source/vendor/prism/LICENSE')
    missing = [name for name in required if not (root / name).is_file()]
    if missing:
        raise ValueError('無法建置：缺少 ' + ', '.join(missing))
    outline = json.loads((root / 'outline.json').read_text(encoding='utf-8'))
    validate_outline(outline)
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
        cards.append(f'<li><a href="#{chapter_id}"><span class="map-number">{i:02}</span><span class="map-content"><strong>{html.escape(short)}</strong></span><span class="map-arrow" aria-hidden="true">↗</span></a></li>')
    source = root / 'source'
    prism = source / 'vendor' / 'prism'
    highlight_js = '\n'.join([
        '/* Prism 1.30.0 — https://prismjs.com/\n' + (prism / 'LICENSE').read_text(encoding='utf-8') + '\n*/',
        'var Prism = {manual: true};',
        *((prism / f'prism-{name}.min.js').read_text(encoding='utf-8') for name in HIGHLIGHT_COMPONENTS),
        (source / 'highlight.js').read_text(encoding='utf-8'),
    ])
    topic_count = sum(len(ch['topics']) for ch in outline['chapters'])
    replacements = {
        'STYLES': '\n'.join((source / name).read_text(encoding='utf-8') for name in ['styles.css', 'legacy-visuals.css', 'labs.css', 'highlight.css']),
        'HIGHLIGHT_JS': highlight_js,
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
    for css in final.css:
        for url in css_references(css):
            if url.startswith('#'):
                final.refs.append(url[1:])
            elif not embedded_url(url):
                final.resources.append(url)
    ids = set()
    for identifier in final.ids:
        if identifier in ids:
            raise ValueError(f'整合後 id 重複: {identifier}')
        ids.add(identifier)
    broken = sorted({ref for ref in final.refs if ref and ref not in ids})
    if broken:
        raise ValueError('無效的內部連結: ' + ', '.join(broken))
    if final.resources:
        raise ValueError('必須完整離線，不可載入外部檔案')
    write_atomic(output, rendered)
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
