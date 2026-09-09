"""Two original stylized Blender bottle studies; no downloaded product art is shipped.
Run with Python providing bpy (Blender 5.0) and Pillow. Font paths accept BOTTLE_ART_FONTS.
"""
import math, os, tempfile
from pathlib import Path
import bpy
from mathutils import Vector
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets' / 'bottles'
OUT.mkdir(parents=True, exist_ok=True)
TMP = Path(tempfile.mkdtemp(prefix='bs-bottle-art-'))
FONTS = Path(os.environ.get('BOTTLE_ART_FONTS', 'C:/Windows/Fonts'))

def font(size, kind='serif'):
    name = {'serif': 'georgiab.ttf', 'sans': 'arialbd.ttf', 'script': 'georgiai.ttf'}[kind]
    return ImageFont.truetype(str(FONTS / name), size)

def center(draw, y, text, size, fill, kind='serif', width=900):
    f = font(size, kind)
    while draw.textbbox((0,0), text, font=f)[2] > width - 80:
        size -= 1; f = font(size, kind)
    draw.text((width/2, y), text, font=f, fill=fill, anchor='mt')

def texture(name):
    cream, ink, red = '#e7d49b', '#29251b', '#913c27'
    if name == 'eh':
        im = Image.new('RGB', (900, 1450), cream); d=ImageDraw.Draw(im)
        d.rounded_rectangle((22,22,877,1427), radius=35, outline='#917747', width=6)
        d.rounded_rectangle((36,36,863,1413), radius=26, outline='#b49b61', width=2)
        center(d,75,'COLONEL E.H.',63,ink,'sans'); center(d,155,'TAYLOR',133,ink,'sans')
        center(d,302,'SMALL BATCH',49,ink,'sans')
        d.line((160,393,740,393),fill=red,width=3)
        center(d,424,'1ST',61,red); center(d,500,'AND ONLY',27,red,'sans')
        # Original typographic flourish, deliberately not a copy of the signature.
        center(d,653,'E.H. Taylor',91,red,'script'); center(d,768,'Jr.',110,red,'script')
        d.arc((165,624,736,1068),10,171,fill=red,width=4)
        d.arc((199,644,704,1085),3,179,fill=red,width=2)
        center(d,1112,'KENTUCKY STRAIGHT',29,ink,'sans');center(d,1158,'BOURBON WHISKEY',29,ink,'sans')
        center(d,1258,'BOTTLED IN BOND',58,red,'sans');center(d,1350,'100 PROOF',30,ink,'sans')
    elif name == 'rr':
        im=Image.new('RGB',(900,730),'#f0e8d4');d=ImageDraw.Draw(im)
        d.rectangle((17,17,882,712),outline='#c4ad86',width=3)
        center(d,48,'KENTUCKY STRAIGHT',30,'#332a21','sans')
        center(d,92,'BOURBON WHISKEY',30,'#332a21','sans')
        center(d,184,"RUSSELL’S",132,'#782321','serif');center(d,355,'R E S E R V E',56,'#782321','sans')
        d.line((200,467,700,467),fill='#b89661',width=3)
        center(d,518,'SMALL BATCH',41,'#49372b','serif');center(d,614,'90 PROOF',32,'#49372b','sans')
    elif name == 'rr-age':
        im=Image.new('RGB',(900,290),'#852f2a');d=ImageDraw.Draw(im)
        for y in (14,275):d.line((0,y,900,y),fill='#cfb38d',width=4)
        center(d,38,'10 YEARS OLD',119,'#f7e4be','sans');center(d,210,'RUSSELL’S RESERVE',26,'#edd3ad','sans')
    elif name == 'rr-neck':
        im=Image.new('RGB',(500,410),'#e5d3ac');d=ImageDraw.Draw(im)
        d.ellipse((114,65,386,337),fill='#80332c',outline='#bb9970',width=6)
        center(d,131,'RR',108,'#eee0c5','serif',width=500)
    else:
        im=Image.new('RGB',(220,1000),'#d7c697');d=ImageDraw.Draw(im)
        for x in (15,28,192,205):d.line((x,0,x,1000),fill='#ae6750',width=4)
        for y in range(10,1000,20):d.line((44,y,176,y+6),fill='#b78761',width=2)
        d.rectangle((36,758,183,974),fill='#bb7657');center(d,799,'100',60,'#efe2bd','sans',width=220)
    path=TMP/(name+'.png');im.save(path);return path

def mat(name,color,metal=0,rough=.3,trans=0,coat=.25):
    m=bpy.data.materials.new(name);m.use_nodes=True;p=m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value=(*color,1);p.inputs['Metallic'].default_value=metal
    p.inputs['Roughness'].default_value=rough;p.inputs['Transmission Weight'].default_value=trans
    p.inputs['Coat Weight'].default_value=coat;p.inputs['IOR'].default_value=1.46
    return m

def lathe(name,profile,material,n=96):
    verts=[]
    for z,r in profile:
        for i in range(n):
            t=2*math.pi*i/n;verts.append((r*math.sin(t),-r*math.cos(t),z))
    faces=[]
    for j in range(len(profile)-1):
        for i in range(n):faces.append((j*n+i,j*n+(i+1)%n,(j+1)*n+(i+1)%n,(j+1)*n+i))
    faces.extend([tuple(reversed(range(n))),tuple((len(profile)-1)*n+i for i in range(n))])
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update()
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(material)
    for poly in mesh.polygons:poly.use_smooth=True
    bevel=obj.modifiers.new('Soft manufactured edges','BEVEL');bevel.width=.012;bevel.segments=3
    obj.modifiers.new('Weighted normals','WEIGHTED_NORMAL');return obj

def label(name,r,z,height,angle,path):
    n=80; verts=[]
    for h in (0,height):
        for i in range(n+1):
            t=-angle/2+angle*i/n;verts.append((r*math.sin(t),-r*math.cos(t),z+h))
    faces=[(i,i+1,n+2+i,n+1+i) for i in range(n)]
    mesh=bpy.data.meshes.new(name);mesh.from_pydata(verts,[],faces);mesh.update();uv=mesh.uv_layers.new()
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            vi=mesh.loops[li].vertex_index;uv.data[li].uv=(vi%(n+1)/n,vi//(n+1))
    obj=bpy.data.objects.new(name,mesh);bpy.context.collection.objects.link(obj)
    m=mat(name+' parchment',(1,1,1),rough=.68,coat=0);nodes=m.node_tree.nodes
    image=nodes.new('ShaderNodeTexImage');image.image=bpy.data.images.load(str(path));image.image.pack()
    m.node_tree.links.new(image.outputs['Color'],nodes.get('Principled BSDF').inputs['Base Color']);obj.data.materials.append(m)
    for poly in mesh.polygons:poly.use_smooth=True

def light(name,loc,power,size,color,target=(0,0,1.7),shape='DISK',size_y=None):
    d=bpy.data.lights.new(name,'AREA');d.energy=power;d.shape=shape;d.size=size;d.color=color
    if size_y is not None:d.size_y=size_y
    o=bpy.data.objects.new(name,d);bpy.context.collection.objects.link(o);o.location=loc;o.rotation_euler=(Vector(target)-o.location).to_track_quat('-Z','Y').to_euler()

def render(key):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    eh=key=='eh-taylor-small-batch'
    amber=mat('Illustrated warm amber',(.13,.038,.005),rough=.22,trans=.32,coat=.38)
    clear=mat('Warm thick glass',(.48,.35,.16),rough=.18,trans=.63,coat=.4)
    dark=mat('Walnut cork top',(.042,.018,.009),rough=.46)
    cork=mat('Natural cork',(.39,.24,.11),rough=.8)
    if eh:
        profile=[(.12,.36),(.14,.455),(.2,.49),(.28,.5),(2.22,.5),(2.34,.488),(2.46,.445),(2.56,.37),(2.66,.24),(2.71,.19),(3.12,.19),(3.23,.16),(3.46,.15)]
        lathe('Taylor tall rounded bottle',profile,amber)
        lathe('Taylor heavy glass foot',[(.08,.36),(.105,.47),(.15,.49),(.23,.49)],clear)
        lathe('Taylor clear upper neck',[(3.08,.193),(3.24,.169),(3.49,.158)],clear)
        lathe('Taylor cork',[(3.42,.127),(3.6,.127)],cork)
        lathe('Taylor bronze cap',[(3.49,.165),(3.61,.165),(3.63,.155)],mat('Bronze cap',(.22,.145,.062),metal=.25,rough=.44))
        label('Taylor cream identification label',.503,.32,1.76,2.20,texture('eh'))
        label('Taylor vertical neck seal',.201,2.99,.63,.72,texture('seal'))
        height=3.72
    else:
        profile=[(.11,.39),(.14,.52),(.23,.56),(.31,.565),(1.99,.565),(2.1,.55),(2.24,.49),(2.35,.38),(2.43,.235),(2.49,.19),(2.99,.18)]
        lathe('Russells broad rounded bottle',profile,amber)
        lathe('Russells heavy glass base',[(.07,.39),(.1,.52),(.16,.56),(.26,.565)],clear)
        lathe('Russells exposed neck',[(2.42,.235),(2.5,.193),(3.02,.18)],clear)
        lathe('Russells cork',[(2.88,.15),(3.15,.15)],cork)
        lathe('Russells walnut stopper',[(3.03,.215),(3.2,.215),(3.23,.19)],dark)
        label('Russells cream wordmark label',.568,.96,1.02,2.5,texture('rr'))
        label('Russells burgundy age band',.569,.33,.43,2.8,texture('rr-age'))
        label('Russells neck medallion',.196,2.54,.38,2.5,texture('rr-neck'))
        height=3.34
    scene=bpy.context.scene;scene.render.engine='CYCLES';scene.cycles.samples=48;scene.cycles.use_denoising=True
    scene.cycles.max_bounces=8;scene.render.film_transparent=True
    scene.world=bpy.data.worlds.new('Studio ambient');scene.world.use_nodes=True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.34,.30,.25,1)
    scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
    light('Large warm key',(-3,-4,5),300,2,(1,.9,.76),shape='RECTANGLE',size_y=4)
    light('Cream rim',(2,1,4),650,2,(1,.81,.55),shape='RECTANGLE',size_y=4)
    light('Narrow glass reflection',(-2,-1,2.4),120,.45,(1,.96,.88),shape='RECTANGLE',size_y=3.5)
    light('Soft frontal fill',(1,-4,2.8),100,3,(.85,.9,1))
    camdata=bpy.data.cameras.new('Portrait');cam=bpy.data.objects.new('Portrait',camdata);bpy.context.collection.objects.link(cam)
    cam.location=(.28,-9,height*.61);cam.rotation_euler=(Vector((0,0,height*.50))-cam.location).to_track_quat('-Z','Y').to_euler();camdata.type='ORTHO';camdata.ortho_scale=height*1.12;scene.camera=cam
    scene.view_settings.view_transform='AgX'
    scene.render.resolution_x=512;scene.render.resolution_y=768;scene.render.resolution_percentage=100
    scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA';scene.render.filepath=str(OUT/(key+'.png'))
    # Editable source kept with review evidence, not bundled into the mobile app.
    blend_dir=Path(os.environ.get('BOTTLE_ART_BLEND_DIR',str(TMP)));blend_dir.mkdir(parents=True,exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_dir/(key+'.blend')))
    bpy.ops.render.render(write_still=True)
    im=Image.open(OUT/(key+'.png'));im.save(OUT/(key+'.png'),optimize=True)
    print('RENDERED',key,im.size,(OUT/(key+'.png')).stat().st_size,flush=True)

if __name__=='__main__':
    for key in ['eh-taylor-small-batch','russells-reserve-10']:render(key)
