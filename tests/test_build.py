"""Standard-library build regression tests; fixtures never enter chapters/."""
import importlib.util
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('course_build', ROOT / 'build.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)

class BuildTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='system-design-build-test-')
        self.root = Path(self.temp.name)
        for directory in ['source', 'chapters']:
            shutil.copytree(ROOT / directory, self.root / directory)
        shutil.copyfile(ROOT / 'outline.json', self.root / 'outline.json')
    def tearDown(self):
        self.temp.cleanup()
    def modify(self, chapter, before, after):
        path = self.root / 'chapters' / f'{chapter:02}.html'
        path.write_text(path.read_text().replace(before, after, 1))
    def test_standalone_deterministic_build_preserves_entire_sources(self):
        info = builder.build(self.root)
        output = (self.root / 'index.html').read_text()
        self.assertEqual(info['chapters'], 16)
        self.assertEqual(info['topics'], 81)
        self.assertGreaterEqual(info['headings'], info['chapters'])
        for chapter in (self.root / 'chapters').glob('*.html'):
            self.assertIn(chapter.read_text(), output)
        self.assertEqual(output.count('data-sd-lab="'), 6)
        self.assertNotIn('<script src=', output)
        self.assertNotIn('<link rel="stylesheet"', output)
        self.assertNotIn('{{CHAPTERS}}', output)
        builder.build(self.root)
        self.assertEqual(output, (self.root / 'index.html').read_text())
    def test_missing_chapter_fails_without_output(self):
        (self.root / 'chapters' / '07.html').unlink()
        with self.assertRaisesRegex(ValueError, '07.html'):
            builder.build(self.root)
        self.assertFalse((self.root / 'index.html').exists())
    def test_missing_labs_never_silently_skips_feature(self):
        (self.root / 'source' / 'labs.js').unlink()
        with self.assertRaisesRegex(ValueError, 'labs.js'):
            builder.build(self.root)
    def test_duplicate_id_is_rejected(self):
        self.modify(3, '</article>', '<span id="chapter-01"></span></article>')
        with self.assertRaisesRegex(ValueError, '重複'):
            builder.build(self.root)
    def test_broken_deep_anchor_is_rejected(self):
        self.modify(2, '</article>', '<a href="#missing">bad</a></article>')
        with self.assertRaisesRegex(ValueError, '無效的內部連結'):
            builder.build(self.root)
    def test_embedded_script_is_rejected(self):
        self.modify(5, '</article>', '<script>1</script></article>')
        with self.assertRaisesRegex(ValueError, '不可包含'):
            builder.build(self.root)
    def test_external_resource_is_rejected(self):
        self.modify(5, '</article>', '<img src="https://example.com/x.png"></article>')
        with self.assertRaisesRegex(ValueError, '外部資源'):
            builder.build(self.root)
    def test_outline_shape_and_chapter_order_are_validated(self):
        path = self.root / 'outline.json'
        original = json.loads(path.read_text(encoding='utf-8'))
        chapters = original['chapters']
        invalid = [
            [],
            {'chapters': {}},
            {'chapters': [chapters[1], chapters[0], *chapters[2:]]},
            {'chapters': [None, *chapters[1:]]},
            {'chapters': [{**chapters[0], 'title': 12}, *chapters[1:]]},
            {'chapters': [{**chapters[0], 'topics': 'not a list'}, *chapters[1:]]},
            {'chapters': [{**chapters[0], 'topics': ['']}, *chapters[1:]]},
        ]
        for outline in invalid:
            with self.subTest(outline=outline):
                path.write_text(json.dumps(outline), encoding='utf-8')
                with self.assertRaisesRegex(ValueError, 'outline.json'):
                    builder.build(self.root)
                self.assertFalse((self.root / 'index.html').exists())
    def test_svg_and_srcset_cannot_hide_external_resources(self):
        path = self.root / 'chapters' / '05.html'
        original = path.read_text(encoding='utf-8')
        additions = [
            '<svg><image href="images/diagram.png"/></svg>',
            '<svg><use xlink:href="//example.com/icons.svg#icon"/></svg>',
            '<svg><feImage href="https://example.com/filter.svg"/></svg>',
            '<img srcset="data:image/png;base64,AA== 1x, remote.png 2x">',
        ]
        for addition in additions:
            with self.subTest(addition=addition):
                path.write_text(original.replace('</article>', addition + '</article>'), encoding='utf-8')
                with self.assertRaisesRegex(ValueError, '外部資源'):
                    builder.build(self.root)
    def test_css_resources_are_checked_in_styles_and_svg_attributes(self):
        path = self.root / 'source' / 'styles.css'
        original = path.read_text(encoding='utf-8')
        additions = [
            'body { background: url(../background.png); }',
            'body { background: url("//example.com/background.png"); }',
            '@import"theme.css";',
            r'body { background: u\72l("https://example.com/background.png"); }',
            'body { background: image-set("remote.webp" 1x, url("data:image/png;base64,AA==") 2x); }',
        ]
        for addition in additions:
            with self.subTest(addition=addition):
                path.write_text(original + '\n' + addition, encoding='utf-8')
                with self.assertRaisesRegex(ValueError, '外部檔案'):
                    builder.build(self.root)
        path.write_text(original, encoding='utf-8')
        chapter = self.root / 'chapters' / '05.html'
        original = chapter.read_text(encoding='utf-8')
        for addition in ['<p style="background:url(local.png)">text</p>',
                         '<svg><rect fill="url(palette.svg#color)"/></svg>']:
            with self.subTest(addition=addition):
                chapter.write_text(original.replace('</article>', addition + '</article>'), encoding='utf-8')
                with self.assertRaisesRegex(ValueError, '外部檔案'):
                    builder.build(self.root)
    def test_embedded_resources_and_css_text_remain_valid(self):
        self.modify(5, '</article>', '''<svg><defs><linearGradient id="test-gradient"/></defs>
            <use href="#test-gradient"/><rect fill="url(#test-gradient)"/>
            <image href="DATA:image/png;base64,AA=="/></svg>
            <img srcset="data:image/png;base64,AA== 1x, data:image/png;base64,BB== 2x"></article>''')
        path = self.root / 'source' / 'styles.css'
        with path.open('a', encoding='utf-8') as stream:
            stream.write('''/* @import "unused.css"; */
                body::after { content: "url(example.png)"; }
                .test { background: image-set("data:image/png;base64,AA==" 1x,
                    url("data:image/svg+xml,%3Csvg%3E%3C/svg%3E") 2x); }''')
        builder.build(self.root)
        self.modify(5, 'href="#test-gradient"', 'href="#missing-svg-symbol"')
        with self.assertRaisesRegex(ValueError, 'missing-svg-symbol'):
            builder.build(self.root)
    def test_event_handler_is_rejected(self):
        self.modify(5, '</article>', '<button onclick="alert(1)">bad</button></article>')
        with self.assertRaisesRegex(ValueError, '不可包含'):
            builder.build(self.root)
    def test_failed_build_preserves_existing_output(self):
        output=self.root / 'index.html'
        output.write_text('known good')
        (self.root / 'chapters' / '07.html').unlink()
        with self.assertRaises(ValueError):
            builder.build(self.root)
        self.assertEqual(output.read_text(), 'known good')
    def test_failed_atomic_write_preserves_output_and_cleans_temporary_file(self):
        output = self.root / 'index.html'
        output.write_text('known good', encoding='utf-8')
        for operation in ('fsync', 'replace'):
            with self.subTest(operation=operation), patch.object(builder.os, operation, side_effect=OSError('write failed')):
                with self.assertRaisesRegex(OSError, 'write failed'):
                    builder.build(self.root)
                self.assertEqual(output.read_text(encoding='utf-8'), 'known good')
                self.assertEqual(list(self.root.glob('.index.html.*.tmp')), [])
    def test_cli_missing_reports_nonzero(self):
        (self.root / 'chapters' / '16.html').unlink()
        result = subprocess.run([sys.executable, str(ROOT / 'build.py'), '--root', str(self.root)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('16.html', result.stderr)

if __name__ == '__main__':
    unittest.main()
