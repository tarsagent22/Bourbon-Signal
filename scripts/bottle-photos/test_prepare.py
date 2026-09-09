import hashlib
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from prepare import prepare, UnsuitableSource
from contact_sheet import contact_sheet

class PrepareTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
    def source(self, name='source.png', mode='RGBA', size=(100, 200), color=(210, 40, 60, 255)):
        path = self.root / name
        image = Image.new(mode, size, color)
        if mode == 'RGBA':
            canvas = Image.new('RGBA', (size[0]+20, size[1]+20), (0,0,0,0))
            canvas.paste(image,(10,10))
            image = canvas
        image.save(path)
        return path
    def test_alpha_aspect_padding_hashes_and_determinism(self):
        p = self.source()
        a = prepare(p, self.root/'a.png'); b = prepare(p, self.root/'b.png')
        self.assertEqual(a['processedSha256'], b['processedSha256'])
        self.assertEqual(a['originalSha256'], hashlib.sha256(p.read_bytes()).hexdigest())
        with Image.open(self.root/'a.png') as im:
            self.assertEqual(im.size, (400, 600))
            self.assertEqual(im.mode, 'RGBA')
            self.assertEqual(im.getpixel((0,0))[3], 0)
            box = im.getbbox()
            self.assertEqual((box[2]-box[0],box[3]-box[1]), (100,200))
            self.assertEqual(box[3], 576)
            self.assertEqual(im.getpixel((box[0],box[1])), (210,40,60,255))
    def test_resize_wide_and_translucent_without_clipping(self):
        p = self.source(size=(1000,500), color=(80,90,100,128))
        prepare(p, self.root/'out.png')
        with Image.open(self.root/'out.png') as im:
            b = im.getbbox(); self.assertEqual((b[2]-b[0],b[3]-b[1]), (352,176))
            self.assertEqual(im.getpixel((200,500))[3],128)
    def test_reuse_and_contact_sheet_determinism(self):
        p = self.source()
        out = self.root/'out.png'
        prepare(p,out)
        before = out.stat().st_mtime_ns
        self.assertTrue(prepare(p,out)['reused'])
        self.assertEqual(out.stat().st_mtime_ns,before)
        rows = [{'id':'fixture','path':str(out),'sourcePage':'https://example.com/product'}]
        a = contact_sheet(rows,self.root/'a.png'); b = contact_sheet(rows,self.root/'b.png')
        self.assertEqual(a['sha256'],b['sha256'])
    def test_opaque_white_requires_manual_processing_no_guessing(self):
        p = self.source(mode='RGB', color='white')
        with self.assertRaises(UnsuitableSource): prepare(p,self.root/'out.png')
        self.assertFalse((self.root/'out.png').exists())
    def test_empty_tiny_animated_corrupt_svg_remote_and_limits(self):
        p = self.source(); empty = self.source('empty.png',color=(0,0,0,0))
        tiny = self.source('tiny.png',size=(1,1))
        svg = self.root/'bad.svg'; svg.write_text('<svg/>')
        fake = self.root/'fake.png'; fake.write_bytes(b'not an image')
        animated = self.root/'animated.png'
        Image.new('RGBA',(100,200),'red').save(animated,save_all=True,append_images=[Image.new('RGBA',(100,200),'blue')],duration=50)
        for source in [empty,tiny,svg,fake,animated,'https://example.com/a.png']:
            with self.subTest(source=source), self.assertRaises(UnsuitableSource): prepare(source,self.root/'out.png')
        with self.assertRaises(UnsuitableSource): prepare(p,self.root/'out.png',max_bytes=5)
        with self.assertRaises(UnsuitableSource): prepare(p,self.root/'out.png',max_pixels=50)
        with self.assertRaises(UnsuitableSource): prepare(p,p)
    def test_decompression_bomb_is_error(self):
        p = self.source()
        before = Image.MAX_IMAGE_PIXELS
        try:
            Image.MAX_IMAGE_PIXELS = 100
            with self.assertRaises(UnsuitableSource): prepare(p,self.root/'out.png')
        finally: Image.MAX_IMAGE_PIXELS = before
    def test_contact_sheet_bounded_labeled_and_reproducible(self):
        p = self.source(); prepare(p,self.root/'out.png')
        rows = [{'id':'fixture', 'path':str(self.root/'out.png'), 'sourcePage':'https://example.com/product'}]
        result = contact_sheet(rows,self.root/'sheet.png')
        self.assertEqual(result['count'],1)
        self.assertEqual(result['references'][0]['sourcePage'],rows[0]['sourcePage'])
        with Image.open(self.root/'sheet.png') as im: self.assertEqual(im.getpixel((0,0)),(15,17,21))
        with self.assertRaises(ValueError): contact_sheet(rows*51,self.root/'big.png')
        with self.assertRaises(ValueError): contact_sheet([],self.root/'empty.png')

if __name__ == '__main__': unittest.main()
