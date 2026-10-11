"""Standard-library build regression tests; fixtures never enter chapters/."""
import importlib.util
import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

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
        self.assertEqual(info['headings'], 90)
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
    def test_cli_missing_reports_nonzero(self):
        (self.root / 'chapters' / '16.html').unlink()
        result = subprocess.run(['python', str(ROOT / 'build.py'), '--root', str(self.root)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertIn('16.html', result.stderr)

if __name__ == '__main__':
    unittest.main()
