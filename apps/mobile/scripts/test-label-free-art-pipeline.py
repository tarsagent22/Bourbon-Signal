"""Local pipeline regression checks; run with Python and Pillow installed."""
import importlib.util
import json
from pathlib import Path
import shutil
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('art', Path(__file__).with_name('prepare-label-free-art.py'))
art = importlib.util.module_from_spec(spec)
spec.loader.exec_module(art)
mobile = Path(__file__).resolve().parents[1]

class RegistrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / 'src/components').mkdir(parents=True)
        (self.root / 'src/cellar').mkdir()
        shutil.copy(mobile / 'src/cellar/bottle-catalog-seed.json', self.root / 'src/cellar')
        for folder in (mobile / 'assets/bottles').glob('label-free-v*'):
            shutil.copytree(folder, self.root / 'assets/bottles' / folder.name)

    def tearDown(self):
        self.temp.cleanup()

    def change_catalog(self, change):
        path = self.root / 'assets/bottles/label-free-v3/catalog.json'
        data = json.loads(path.read_text())
        change(data)
        path.write_text(json.dumps(data))

    def test_all_batches_register_deterministically(self):
        self.assertEqual(art.register(self.root), {'registeredShapes': 38, 'totalCatalogEntries': 172})
        files = [self.root / 'src/components' / name for name in ['label-free-artwork-assets.ts', 'label-free-artwork-catalog.ts']]
        before = [path.read_bytes() for path in files]
        art.register(self.root)
        self.assertEqual(before, [path.read_bytes() for path in files])

    def test_duplicate_product_fails_closed(self):
        self.change_catalog(lambda data: data['products'].append(data['products'][0].copy()))
        with self.assertRaisesRegex(ValueError, 'Duplicate or stale'):
            art.register(self.root)

    def test_cross_batch_alias_collision_fails_closed(self):
        self.change_catalog(lambda data: data['products'][0].setdefault('names', []).append('Eagle Rare 10 Year'))
        with self.assertRaisesRegex(ValueError, 'Conflicting artwork alias'):
            art.register(self.root)

    def test_changed_catalog_name_fails_closed(self):
        self.change_catalog(lambda data: data['products'][0].update(name='Incorrect edition'))
        with self.assertRaisesRegex(ValueError, 'Duplicate or stale'):
            art.register(self.root)

    def test_corrupt_export_fails_closed(self):
        path = self.root / 'assets/bottles/label-free-v3/bare-neutral.png'
        path.write_bytes(path.read_bytes() + b'corruption')
        with self.assertRaisesRegex(ValueError, 'Export hash mismatch'):
            art.register(self.root)

if __name__ == '__main__':
    unittest.main()
