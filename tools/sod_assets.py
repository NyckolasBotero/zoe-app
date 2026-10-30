"""Gera os atlas de pixel art do Sod a partir de assets livres (LPC).
Fontes (clonar antes):
  git clone --depth 1 https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator /tmp/lpc
  git clone --depth 1 https://github.com/ElizaWy/LPC /tmp/elz
Saída: assets/sod/{char.png,tools.png,room.png,manifest.json,CREDITS.txt}
"""
import json, os, glob, sys
from PIL import Image, ImageDraw
LPC = os.environ.get('LPC', '/tmp/lpc') + '/'
ELZ = os.environ.get('ELZ', '/tmp/elz') + '/'
S = LPC + 'spritesheets/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sod') + '/'
# animações (nome, nº de quadros, linha: 2=frente, 3=direita)
ANIMS = [('idle', 2, 2), ('slash', 6, 3), ('sit', 3, 3), ('emote', 3, 2), ('thrust', 8, 3), ('walk', 9, 3)]
NF = sum(a[1] for a in ANIMS)
OFF = {}; o = 0
for a, n, r in ANIMS: OFF[a] = [o, n]; o += n
idx = {}
for f in glob.glob(LPC + 'sheet_definitions/**/*.json', recursive=True):
    try: d = json.load(open(f))
    except Exception: continue
    rec = d.get('recolors'); mat = None
    if isinstance(rec, dict) and rec.get('material'): mat = rec['material']
    for k, v in d.items():
        if k.startswith('layer') and isinstance(v, dict):
            for sx in ('male', 'female'):
                if v.get(sx): idx[v[sx].rstrip('/')] = (v.get('zPos', 50), mat, d.get('credits', []))
# catálogo: (categoria, id, nome, caminho masculino, caminho feminino)
CAT = []
def add(cat, iid, nome, m, f=None): CAT.append((cat, iid, nome, m, f or m))
add('corpo', 'm', 'Masculino', 'body/bodies/male', 'body/bodies/male'); add('corpo', 'f', 'Feminino', 'body/bodies/female', 'body/bodies/female')
add('cabeca', 'm', '', 'head/heads/human/male'); add('cabeca', 'f', '', 'head/heads/human/female')
HAIR = [('curto', 'Curto', 'plain'), ('repartido', 'Repartido', 'parted'), ('franja', 'Franja', 'bangs'), ('rabo', 'Rabo de cavalo', 'ponytail'), ('coque', 'Coque com franja', 'bangs_bun'),
        ('cacheado', 'Cacheado', 'curly_short'), ('afro', 'Black power', 'afro'), ('longo', 'Longo', 'long'), ('chanel', 'Chanel', 'bob'), ('moicano', 'Moicano', 'shorthawk'),
        ('raspado', 'Raspado', 'buzzcut'), ('espetado', 'Espetado', 'spiked'), ('tranca', 'Trança', 'braid'), ('pixie', 'Pixie', 'pixie'), ('dreads', 'Dreads', 'dreadlocks_short'), ('ondulado', 'Ondulado longo', 'wavy')]
for iid, nome, p in HAIR:
    base = 'hair/%s/adult' % p
    if os.path.isdir(S + base + '/fg'): add('cabelo', iid, nome, base + '/fg'); add('cabelo_bg', iid, '', base + '/bg')
    else: add('cabelo', iid, nome, base)
TOR = [('camiseta', 'Camiseta', 'torso/clothes/shortsleeve/tshirt'), ('gola_v', 'Camiseta gola V', 'torso/clothes/shortsleeve/tshirt_vneck'), ('polo', 'Camisa polo', 'torso/clothes/shortsleeve/shortsleeve_polo'),
       ('regata', 'Regata', 'torso/clothes/sleeveless/sleeveless1'), ('manga_longa', 'Manga longa', 'torso/clothes/longsleeve/longsleeve2'), ('cardigan', 'Cardigã', 'torso/clothes/longsleeve/longsleeve2_cardigan'),
       ('social', 'Camisa social', 'torso/clothes/longsleeve/longsleeve2_buttoned')]
for iid, nome, p in TOR: add('blusa', iid, nome, p + '/male', p + '/female')
SOB = [('jardineira', 'Jardineira', 'torso/aprons/overalls'), ('suspensorio', 'Suspensório', 'torso/aprons/suspenders'), ('couro', 'Colete de couro', 'torso/armour/leather'),
       ('cota', 'Cota de malha', 'torso/chainmail'), ('couraca', 'Couraça da justiça', 'torso/armour/plate')]
for iid, nome, p in SOB: add('sobre', iid, nome, p + '/male', p + '/female')
for iid, nome, p in [('classico', 'Óculos', 'glasses'), ('redondo', 'Óculos redondo', 'round'), ('nerd', 'Óculos nerd', 'nerd'), ('sol', 'Óculos de sol', 'sunglasses'), ('escuro', 'Óculos escuro', 'shades')]: add('oculos', iid, nome, 'facial/glasses/%s/adult' % p)
add('pescoco', 'gravata', 'Gravata', 'neck/tie/necktie/male', 'neck/tie/necktie/female'); add('pescoco', 'borboleta', 'Gravata-borboleta', 'neck/tie/bowtie/adult'); add('pescoco', 'colar', 'Colar', 'neck/necklace/beaded_small/male', 'neck/necklace/beaded_small/thin'); add('pescoco', 'cachecol', 'Cachecol', 'neck/scarf')
add('luvas', 'luvas', 'Luvas', 'arms/hands/gloves/male', 'arms/hands/gloves/thin')
LEG = [('calca', 'Calça', 'pants'), ('bermuda', 'Bermuda', 'shorts/shorts'), ('dobrada', 'Calça dobrada', 'cuffed'), ('social', 'Calça social', 'formal'), ('listrada', 'Calça listrada', 'formal_striped'), ('legging', 'Legging', 'leggings'), ('saia', 'Saia', 'skirts/plain')]
for iid, nome, p in LEG: add('calca', iid, nome, 'legs/%s/male' % p, 'legs/%s/thin' % p)
FEET = [('sapato', 'Sapato', 'shoes/basic'), ('bota', 'Bota', 'boots/basic'), ('sandalia', 'Sandália', 'sandals'), ('chinelo', 'Chinelo', 'slippers'), ('bota_dobrada', 'Bota dobrada', 'boots/fold'), ('botina', 'Botina', 'boots/rimmed'), ('armadura', 'Calçado da paz', 'armour/plate')]
for iid, nome, p in FEET: add('tenis', iid, nome, 'feet/%s/male' % p, 'feet/%s/thin' % p)
HAT = [('bandana', 'Bandana', 'cloth/bandana'), ('boina', 'Boina de couro', 'cloth/leather_cap'), ('capuz', 'Capuz', 'cloth/hood'), ('chapeu', 'Chapéu-coco', 'formal/bowler'), ('cartola', 'Cartola', 'formal/tophat'),
       ('tiara', 'Tiara', 'formal/tiara'), ('coroa', 'Coroa', 'formal/crown'), ('capacete', 'Capacete da salvação', 'helmet/kettle'), ('faixa', 'Faixa', 'headband/thick')]
for iid, nome, p in HAT: add('bone', iid, nome, 'hat/%s/adult' % p)
EYES = ['blue', 'brown', 'green', 'gray']
def strip(path, eye=None):
    out = Image.new('RGBA', (NF * 64, 64)); ok = 0
    for a, n, r in ANIMS:
        p = S + (path + '/' + a + '/' + eye + '.png' if eye else path + '/' + a + '.png')
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGBA'); ok += 1
        for k in range(n):
            if (k + 1) * 64 <= im.width and (r + 1) * 64 <= im.height: out.alpha_composite(im.crop((k * 64, r * 64, k * 64 + 64, r * 64 + 64)), ((OFF[a][0] + k) * 64, 0))
    return out if ok else None
rows = []; man = {'nf': NF, 'anims': OFF, 'itens': {}, 'cred': set()}
def put(im):
    rows.append(im); return len(rows) - 1
for cat, iid, nome, m, f in CAT:
    e = {'nome': nome}
    for sx, p in (('m', m), ('f', f)):
        im = strip(p)
        if im is None: print('faltou', p); continue
        z, mat, cr = idx.get(p, (50, None, []))
        if cat == 'cabeca': z, mat = 100, 'body'
        if cat == 'corpo': z, mat = 10, 'body'
        e[sx] = put(im); e['z'] = z; e['mat'] = mat
        for c in cr: man['cred'].add('%s — %s (%s) %s' % (c.get('file', ''), ', '.join(c.get('authors', [])), ', '.join(c.get('licenses', [])), ' '.join(c.get('urls', []))))
    man['itens'].setdefault(cat, {})[iid] = e
for ey in EYES:
    man['itens'].setdefault('olhos', {})[ey] = {'m': put(strip('eyes/human/adult/default', ey)), 'z': 105, 'mat': None}
    man['itens']['olhos'][ey]['f'] = man['itens']['olhos'][ey]['m']
os.makedirs(OUT, exist_ok=True)
A = Image.new('RGBA', (NF * 64, len(rows) * 64))
for i, im in enumerate(rows): A.alpha_composite(im, (0, i * 64))
A.save(OUT + 'char.png', optimize=True)
# ---------- ferramentas (quadros de 128 px, linha virada para a direita) ----------
T = []; tman = {}
def tput(name, im, n, anim, seq):
    T.append(im); tman[name] = {'row': len(T) - 1, 'n': n, 'anim': anim, 'seq': seq}
def big(src, n):
    im = Image.open(S + src).convert('RGBA'); return im.crop((0, 3 * 128, n * 128, 4 * 128))
def small(src, n):
    im = Image.open(S + src).convert('RGBA'); out = Image.new('RGBA', (n * 128, 128))
    for k in range(n): out.alpha_composite(im.crop((k * 64, 3 * 64, k * 64 + 64, 4 * 64)), (k * 128 + 32, 32))
    return out
tput('picareta_bg', big('tools/pickaxe/bg.png', 6), 6, 'slash', [5, 5, 4, 4, 3, 1, 0, 0, 0, 0]); tput('picareta_fg', big('tools/pickaxe/fg.png', 6), 6, 'slash', None)
tput('marreta_bg', big('tools/hammer/bg.png', 6), 6, 'slash', [5, 5, 4, 4, 1, 0, 0, 0, 0]); tput('marreta_fg', big('tools/hammer/fg.png', 6), 6, 'slash', None)
tput('pa_bg', small('tools/shovel/bg/thrust.png', 8), 8, 'thrust', [0, 1, 2, 3, 4, 5, 6, 7]); tput('pa_fg', small('tools/shovel/fg/thrust.png', 8), 8, 'thrust', None)
# furadeira e britadeira: desenhadas no estilo LPC com a rampa "steel" (recolorível como metal)
MET = json.load(open(LPC + 'palette_definitions/metal/metal_ulpc.json'))['steel']
def hx(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)
PAL = {'0': hx(MET[0]), '1': hx(MET[1]), '2': hx(MET[2]), '3': hx(MET[3]), '4': hx(MET[4]), '5': hx(MET[min(5, len(MET) - 1)]),
       'k': (34, 30, 40, 255), 'g': (62, 58, 70, 255), 'y': (232, 170, 40, 255), 'Y': (250, 208, 90, 255), 'o': (176, 112, 22, 255), 'r': (120, 70, 20, 255), '.': None}
FUR = ["......kkkkkkkkkkkkk........",
       ".....kYYYYYYYYYYYYYk.......",
       "....kYyyyyyyyyyyyyyykk.....",
       "....kyygggggggggyyyyk5k....",
       "....kyyyyyyyyyyyyyyyk4kkkk.",
       "....kyyyyyyyyyyyyyyyk3k2221",
       "....kooooyyyyooooooyk4kkkk.",
       ".....kkkkoyyyokkkkkkk5k....",
       "........kgggggk.....kk.....",
       "........kgggggk............",
       ".......kgggggk.............",
       ".......kggg5k..............",
       "......kgggggk..............",
       "......kkkkkk..............."]
JAC = ["kkkkkkkkkkkkkkkkkk",
       "kgggggggkkgggggggk",
       "kkkkkkkkYYkkkkkkkk",
       "......kYYYYk......",
       ".....kYYyyyyk.....",
       ".....kYyyyyyk.....",
       ".....kyyggyyk.....",
       ".....kyyyyyyk.....",
       ".....kyyggyyk.....",
       ".....kyyyyyyk.....",
       ".....kooooook.....",
       "......kk55kk......",
       ".......k44k.......",
       ".......k43k.......",
       ".......k33k.......",
       ".......k32k.......",
       ".......k22k.......",
       ".......k21k.......",
       ".......k21k.......",
       "........k1k.......",
       "........k0k.......",
       ".........k........"]
def spr(rows):
    im = Image.new('RGBA', (max(len(r) for r in rows), len(rows)))
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if PAL.get(c): im.putpixel((x, y), PAL[c])
    return im
fur, jac = spr(FUR), spr(JAC)
# mão da frente em cada quadro do "thrust" (procura o pixel mais à direita do corpo entre as linhas 36 e 46)
body = Image.open(S + 'body/bodies/male/thrust.png').convert('RGBA')
hands = []
for k in range(8):
    fr = body.crop((k * 64, 192, k * 64 + 64, 256)); best = (30, 42)
    for x in range(63, 0, -1):
        col = [y for y in range(34, 48) if fr.getpixel((x, y))[3]]
        if col: best = (x, col[len(col) // 2]); break
    hands.append(best)
F = Image.new('RGBA', (8 * 128, 128)); J = Image.new('RGBA', (8 * 128, 128))
for k, (x, y) in enumerate(hands):
    j = k % 2
    F.alpha_composite(fur, (k * 128 + 32 + x - 10, 32 + y - 4 + j))
    J.alpha_composite(jac, (k * 128 + 32 + x - 6, 32 + y - 1 + j))
tput('martelete_fg', F, 8, 'thrust', [3, 4, 5, 6, 5, 4]); tput('broca_fg', F, 8, 'thrust', [3, 4, 5, 6, 5, 4]); tput('britadeira_fg', J, 8, 'thrust', [4, 5, 4, 5, 4, 5])
TA = Image.new('RGBA', (8 * 128, len(T) * 128))
for i, im in enumerate(T): TA.alpha_composite(im, (0, i * 128))
TA.save(OUT + 'tools.png', optimize=True)
man['tools'] = tman
man['cred'].add('tools/hand tools — bluecarrot16, JaidynReiman, Pierre Vigier, Tuomo Untinen (OGA-BY 3.0, CC-BY 4.0, CC-BY-SA 3.0, GPL) https://opengameart.org/content/lpc-hand-tools')
# ---------- sala (LPC Revised, CC-BY 3.0 / OGA-BY 3.0) ----------
R = Image.new('RGBA', (512, 512)); rman = {}; cur = [0, 0, 0]
def rput(name, src, box):
    im = Image.open(ELZ + src).convert('RGBA').crop(box); w, h = im.size
    if cur[0] + w > 512: cur[0] = 0; cur[1] += cur[2]; cur[2] = 0
    R.alpha_composite(im, (cur[0], cur[1])); rman[name] = [cur[0], cur[1], w, h]; cur[0] += w; cur[2] = max(cur[2], h)
for k, n in enumerate(['creme', 'azul', 'marinho', 'lilas']): rput('parede_' + n, 'Structure/Walls/Striped Wallpaper A.png', (k * 96, 0, k * 96 + 96, 96))
for k, n in enumerate(['escuro', 'mel', 'claro', 'carvalho', 'palha']): rput('piso_' + n, 'Structure/Floor/Wood Floor A.png', (k * 32, 0, k * 32 + 32, 64))
rput('tapete_azul', 'Objects/Furniture/Rugs/Swirling Vine Rug.png', (0, 0, 160, 64)); rput('tapete_rosa', 'Objects/Furniture/Rugs/Swirling Vine Rug.png', (0, 64, 160, 128))
rput('janela', 'Structure/Windows/Ornamental Windows B.png', (32, 32, 64, 128)); rput('janela_noite', 'Structure/Windows/Ornamental Windows B.png', (0, 32, 32, 128))
rput('quadro', 'Objects/Wall Items/Paintings, Landscape.png', (0, 64, 96, 96)); rput('quadro2', 'Objects/Wall Items/Paintings, Landscape.png', (0, 96, 96, 128))
for k, n in enumerate(['amarela', 'vermelha', 'azul', 'verde']): rput('poltrona_' + n, 'Objects/Furniture/Seating/Chair, Sofa D.png', (k * 64, 0, k * 64 + 32, 32))
rput('planta', 'Objects/Furniture/Planter.png', (32, 0, 64, 64)); rput('planta2', 'Objects/Furniture/Planter.png', (64, 0, 96, 64))
rput('abajur', 'Objects/Furniture/Lighting, Floor.png', (64, 64, 96, 128)); rput('estante', 'Objects/Furniture/Shelf.png', (0, 0, 96, 32))
RK = 'Terrain/Rocks, Grasslands.png'
for nm, b in [('rocha_g1', (64, 0, 128, 64)), ('rocha_g2', (128, 0, 192, 64)), ('rocha_m1', (64, 64, 128, 96)), ('rocha_m2', (0, 96, 64, 128)), ('rocha_p1', (128, 64, 160, 96)), ('rocha_p2', (160, 72, 192, 96)), ('rocha_p3', (128, 96, 160, 128))]: rput(nm, RK, b)
R = R.crop((0, 0, 512, cur[1] + cur[2])); R.save(OUT + 'room.png', optimize=True)
man['room'] = rman
man['cred'].add('Sala, móveis e rochas — LPC Revised (ElizaWy e colaboradores), CC-BY 3.0 / OGA-BY 3.0 — https://github.com/ElizaWy/LPC')
man['cred'].add('Personagens — Universal LPC Spritesheet Character Generator (vários autores; ver CREDITS.csv) — https://github.com/LiberatedPixelCup/Universal-LPC-Spritesheet-Character-Generator')
man['cred'].add('Furadeira e britadeira — desenhadas para o app no estilo LPC (CC-BY-SA 4.0)')
cred = sorted(man['cred']); man['cred'] = len(cred)
pal = {}
for mat, fn, base in (('hair', 'hair/hair_ulpc.json', 'orange'), ('cloth', 'cloth/cloth_ulpc.json', 'white'), ('body', 'body/body_ulpc.json', 'light'), ('metal', 'metal/metal_ulpc.json', 'steel')):
    d = json.load(open(LPC + 'palette_definitions/' + fn)); pal[mat] = {'base': base, 'cores': d}
man['pal'] = pal
json.dump(man, open(OUT + 'manifest.json', 'w'), ensure_ascii=False, separators=(',', ':'))
open(OUT + 'CREDITS.txt', 'w').write('Créditos da arte do Sod (assets livres)\n\n' + '\n'.join(cred) + '\n')
print('linhas', len(rows), 'char', A.size, 'tools', TA.size, 'room', R.size)
