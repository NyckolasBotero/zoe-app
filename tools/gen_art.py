#!/usr/bin/env python3
"""Gera as ilustrações vetoriais (SVG) padrão dos ministérios: personagens originais, alegres e diversos, em estilo flat.
Saída: assets/img/ministerios/<slug>.svg e assets/img/ministerios/_all.json (usado para embutir no app)."""
import json, os, math
VERDE, VERDE2, VERM = '#1D904F', '#0B6B35', '#DD3326'
SKIN = ['#F3C9A5', '#E2A877', '#B97C57', '#8B5A3C', '#5E3B2A']
HAIR = ['#2A1A14', '#6B4226', '#C48A3A', '#1B1B1F', '#8A3B1E']
DARK = '#2A2118'

def person(x, y, s=1.0, skin=0, hair=0, style='short', shirt=VERDE, pants='#3A4A63', arms='up', legs='stand', extra='', flip=False, beard=False, hat=None, shoe='#2A2118'):
    sk, hr = SKIN[skin], HAIR[hair]
    L = []  # peças desenhadas do fundo para a frente
    # pernas
    if legs == 'stand': ends = [(-20, 0), (20, 0)]
    elif legs == 'jump': ends = [(-34, -18), (30, -52)]
    elif legs == 'jump2': ends = [(-30, -40), (34, -12)]
    elif legs == 'kids': ends = [(-16, 0), (16, 0)]
    else: ends = [(-20, 0), (20, 0)]
    for ex, ey in ends:
        L.append(f'<path d="M{ex*0.35:.0f} -92 L{ex} {ey-8}" stroke="{pants}" stroke-width="22" stroke-linecap="round" fill="none"/>')
        L.append(f'<ellipse cx="{ex+(6 if ex>0 else -6)}" cy="{ey-2}" rx="15" ry="8" fill="{shoe}"/>')
    # tronco
    L.append(f'<rect x="-34" y="-176" width="68" height="94" rx="30" fill="{shirt}"/>')
    L.append(f'<rect x="-34" y="-110" width="68" height="28" rx="14" fill="{pants}"/>' if False else '')
    # pescoço
    L.append(f'<rect x="-8" y="-186" width="16" height="16" rx="6" fill="{sk}"/>')
    # braços
    def arm(side, mode):
        sx = 30 * side
        if mode == 'up': pts = [(sx, -160), (sx + 28 * side, -200), (sx + 40 * side, -246)]
        elif mode == 'wave': pts = [(sx, -160), (sx + 38 * side, -196), (sx + 30 * side, -250)]
        elif mode == 'down': pts = [(sx, -160), (sx + 16 * side, -120), (sx + 12 * side, -84)]
        elif mode == 'hold': pts = [(sx, -160), (sx + 10 * side, -120), (sx - 14 * side, -112)]
        elif mode == 'fist': pts = [(sx, -160), (sx + 30 * side, -190), (sx + 22 * side, -232)]
        else: pts = [(sx, -160), (sx + 16 * side, -120), (sx + 12 * side, -84)]
        d = 'M' + ' L'.join(f'{a} {b}' for a, b in pts)
        return f'<path d="{d}" stroke="{shirt}" stroke-width="19" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="{pts[-1][0]}" cy="{pts[-1][1]}" r="10" fill="{sk}"/>', pts[-1]
    am = arms if isinstance(arms, tuple) else (arms, arms)
    a1, h1 = arm(-1, am[0]); a2, h2 = arm(1, am[1])
    # cabeça
    head = [f'<circle cx="0" cy="-208" r="28" fill="{sk}"/>']
    hs = {
        'short': f'<path d="M-29 -212 Q-30 -246 0 -246 Q30 -246 29 -212 Q18 -230 0 -230 Q-18 -230 -29 -212Z" fill="{hr}"/>',
        'bun': f'<circle cx="0" cy="-250" r="13" fill="{hr}"/><path d="M-29 -210 Q-30 -243 0 -243 Q30 -243 29 -210 Q16 -230 0 -230 Q-16 -230 -29 -210Z" fill="{hr}"/>',
        'long': f'<path d="M-30 -204 Q-34 -248 0 -248 Q34 -248 30 -204 L33 -160 Q22 -150 18 -170 L18 -214 Q0 -232 -18 -214 L-18 -170 Q-22 -150 -33 -160Z" fill="{hr}"/>',
        'curly': ''.join(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{hr}"/>' for cx, cy, r in [(-22, -222, 13), (-10, -240, 14), (6, -243, 14), (21, -232, 13), (27, -214, 10), (-28, -206, 9)]),
        'afro': f'<circle cx="0" cy="-226" r="38" fill="{hr}"/>',
        'bald': '',
        'wavy': f'<path d="M-30 -208 Q-36 -252 0 -250 Q36 -252 30 -208 Q22 -232 6 -228 Q-8 -240 -30 -208Z" fill="{hr}"/>',
    }
    if style == 'afro':  # afro fica atrás do rosto
        head = [hs['afro'], head[0]]
    else:
        head.append(hs.get(style, ''))
    if beard: head.append(f'<path d="M-24 -200 Q0 -170 24 -200 Q22 -184 0 -180 Q-22 -184 -24 -200Z" fill="{hr}"/>')
    head += [f'<circle cx="-10" cy="-210" r="3" fill="{DARK}"/><circle cx="10" cy="-210" r="3" fill="{DARK}"/>',
             f'<path d="M-11 -198 Q0 -186 11 -198 Q0 -193 -11 -198Z" fill="{DARK}"/>',
             '<circle cx="-18" cy="-200" r="5" fill="#FF7A7A" opacity=".35"/><circle cx="18" cy="-200" r="5" fill="#FF7A7A" opacity=".35"/>']
    if hat == 'chef':
        head.append('<g fill="#fff" stroke="#E3E3E3" stroke-width="2"><circle cx="-16" cy="-252" r="16"/><circle cx="2" cy="-262" r="18"/><circle cx="18" cy="-252" r="15"/><rect x="-26" y="-250" width="52" height="22" rx="5"/></g>')
    if hat == 'headphones':
        head.append(f'<path d="M-33 -208 Q-33 -258 0 -258 Q33 -258 33 -208" stroke="#2A2A33" stroke-width="7" fill="none"/><rect x="-40" y="-218" width="14" height="28" rx="7" fill="{VERM}"/><rect x="26" y="-218" width="14" height="28" rx="7" fill="{VERM}"/>')
    if hat == 'cap':
        head.append(f'<path d="M-30 -218 Q-30 -250 0 -250 Q30 -250 30 -218Z" fill="{VERM}"/><path d="M8 -222 Q38 -224 40 -214 L8 -214Z" fill="#B3261E"/>')
    if hat == 'bandana':
        head.append(f'<path d="M-30 -218 Q0 -246 30 -218 Q0 -230 -30 -218Z" fill="{VERM}"/><circle cx="30" cy="-214" r="6" fill="{VERM}"/>')
    parts = ''.join(L) + a1 + a2 + ''.join(head) + (extra(h1, h2) if callable(extra) else extra)
    t = f'translate({x} {y}) scale({-s if flip else s} {s})'
    return f'<g transform="{t}">{parts}</g>'

def confetti(seed, w=640, h=360, n=26):
    import random
    r = random.Random(seed); cols = [VERDE, VERM, '#F5C542', '#3B82C4', '#FFFFFF']; o = []
    for _ in range(n):
        x, y = r.uniform(10, w - 10), r.uniform(10, h * .55); c = r.choice(cols); k = r.random()
        if k < .4: o.append(f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r.uniform(3,6):.1f}" fill="{c}" opacity=".85"/>')
        elif k < .75: o.append(f'<rect x="{x:.0f}" y="{y:.0f}" width="{r.uniform(8,14):.0f}" height="4" rx="2" fill="{c}" transform="rotate({r.randint(0,170)} {x:.0f} {y:.0f})" opacity=".85"/>')
        else: o.append(f'<path d="M{x:.0f} {y-6:.0f} L{x+2:.0f} {y-2:.0f} L{x+6:.0f} {y:.0f} L{x+2:.0f} {y+2:.0f} L{x:.0f} {y+6:.0f} L{x-2:.0f} {y+2:.0f} L{x-6:.0f} {y:.0f} L{x-2:.0f} {y-2:.0f}Z" fill="{c}" opacity=".9"/>')
    return ''.join(o)

def frame(bg1, bg2, body, seed=1, floor='#FFFFFF'):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" role="img" preserveAspectRatio="xMidYMid slice">'
            f'<defs><linearGradient id="g{seed}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{bg1}"/><stop offset="1" stop-color="{bg2}"/></linearGradient></defs>'
            f'<rect width="640" height="360" fill="url(#g{seed})"/>'
            f'<circle cx="90" cy="60" r="120" fill="#fff" opacity=".35"/><circle cx="580" cy="300" r="150" fill="#fff" opacity=".28"/>'
            f'{confetti(seed)}<ellipse cx="320" cy="346" rx="300" ry="14" fill="#000" opacity=".07"/>{body}</svg>')

def prop_pan(h, side=1):
    x, y = h; return f'<g transform="translate({x} {y})"><rect x="{0 if side>0 else -52}" y="-6" width="52" height="12" rx="6" fill="#555"/><ellipse cx="{-6 if side>0 else 6}" cy="-6" rx="30" ry="10" fill="#8C8C94" transform="translate({0 if side>0 else 0} 0)"/></g>'

# ---------- cenas ----------
def sc_gourmet():
    b = '<rect x="30" y="268" width="580" height="16" rx="8" fill="#C9884D"/><rect x="60" y="284" width="14" height="62" fill="#B06F38"/><rect x="566" y="284" width="14" height="62" fill="#B06F38"/>'
    # panela com vapor
    b += '<g><path d="M262 232 h116 v40 q0 12 -12 12 h-92 q-12 0 -12 -12Z" fill="#8C8C94"/><rect x="254" y="226" width="132" height="12" rx="6" fill="#A7A7B0"/><path d="M300 210 q-10 -16 0 -28 M322 212 q-10 -18 0 -32 M344 210 q-10 -16 0 -28" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none" opacity=".9"/></g>'
    b += '<g><circle cx="470" cy="256" r="22" fill="#F5C542"/><circle cx="500" cy="262" r="16" fill="#DD3326"/><circle cx="440" cy="266" r="14" fill="#1D904F"/></g>'
    bread = lambda h, hh: f'<g transform="translate({h[0]} {h[1]})"><ellipse cx="0" cy="-10" rx="30" ry="9" fill="#E8E8EC"/><path d="M-22 -14 q0 -26 22 -26 q22 0 22 26Z" fill="#E7A94F"/></g>'
    b += person(150, 330, 1.0, 1, 0, 'bun', '#F5E6C8', '#3A4A63', 'up', 'stand', hat='chef')
    b += person(320, 330, 1.0, 3, 4, 'curly', VERDE, '#2F3B4A', ('up', 'hold'), 'stand', hat=None, extra=lambda h1, h2: f'<g transform="translate({h2[0]} {h2[1]})"><ellipse cx="0" cy="6" rx="34" ry="8" fill="#E8E8EC"/><path d="M-24 2 q0 -26 24 -26 q24 0 24 26Z" fill="#E7A94F"/></g>')
    b += person(490, 330, 1.0, 2, 1, 'short', VERM, '#3A4A63', 'up', 'stand', beard=True, hat='chef')
    return frame('#E6F4EA', '#FBE7D3', b, 11)

def sc_infantil():
    b = ''
    for cx, cy, c in [(150, 70, VERM), (210, 50, '#F5C542'), (440, 60, '#3B82C4'), (500, 84, VERDE)]:
        b += f'<g><ellipse cx="{cx}" cy="{cy}" rx="24" ry="30" fill="{c}"/><path d="M{cx} {cy+30} q-8 40 6 80" stroke="#8A8A8A" stroke-width="2" fill="none"/></g>'
    b += '<g><rect x="262" y="300" width="42" height="42" rx="6" fill="#F5C542"/><rect x="304" y="300" width="42" height="42" rx="6" fill="#3B82C4"/><rect x="283" y="258" width="42" height="42" rx="6" fill="#DD3326"/></g>'
    b += person(120, 332, 1.0, 0, 2, 'long', '#F29D52', '#5B6C8F', 'up', 'jump')
    b += person(525, 332, 1.0, 4, 3, 'afro', VERDE, '#2F3B4A', 'up', 'jump2')
    b += person(230, 332, .62, 2, 1, 'curly', VERM, '#3A4A63', 'up', 'kids')
    b += person(410, 332, .62, 1, 0, 'bun', '#3B82C4', '#7FA38C', 'wave', 'kids')
    return frame('#FFF3D6', '#E3F2E8', b, 12)

def sc_midia():
    cam = lambda h1, h2: f'<g transform="translate({(h1[0]+h2[0])/2:.0f} {(h1[1]+h2[1])/2:.0f})"><rect x="-30" y="-20" width="60" height="38" rx="8" fill="#2F3340"/><circle cx="0" cy="0" r="13" fill="#9AA5B8"/><circle cx="0" cy="0" r="7" fill="#3B82C4"/><rect x="-20" y="-28" width="22" height="10" rx="3" fill="#2F3340"/></g>'
    ph = lambda h1, h2: f'<g transform="translate({h2[0]} {h2[1]})"><rect x="-14" y="-30" width="28" height="50" rx="6" fill="#2F3340"/><rect x="-10" y="-25" width="20" height="38" rx="3" fill="#9FD3B3"/></g>'
    b = '<g><rect x="400" y="52" width="190" height="112" rx="14" fill="#fff"/><rect x="412" y="64" width="166" height="88" rx="8" fill="#2F3340"/><path d="M478 90 L478 126 L510 108Z" fill="#fff"/><circle cx="406" cy="58" r="0" fill="none"/></g>'
    b += '<g><rect x="60" y="70" width="90" height="60" rx="8" fill="#fff"/><circle cx="105" cy="100" r="16" fill="#DD3326"/><circle cx="105" cy="100" r="6" fill="#fff"/></g>'
    b += person(160, 332, 1.0, 1, 1, 'short', '#3B82C4', '#2F3B4A', ('hold', 'hold'), 'stand', hat='cap', extra=cam)
    b += person(330, 332, 1.0, 3, 0, 'wavy', VERM, '#3A4A63', ('up', 'hold'), 'stand', extra=ph)
    b += person(500, 332, 1.0, 0, 4, 'bun', VERDE, '#5B6C8F', ('up', 'up'), 'jump')
    return frame('#E2EEF9', '#E6F4EA', b, 13)

def sc_musica():
    notes = ''.join(f'<g fill="{c}" transform="translate({x} {y})"><ellipse cx="0" cy="0" rx="9" ry="7"/><rect x="7" y="-34" width="4" height="34"/><path d="M11 -34 q16 4 10 20" stroke="{c}" stroke-width="4" fill="none"/></g>' for x, y, c in [(70, 90, VERM), (570, 70, VERDE), (320, 60, '#F5C542'), (520, 150, '#3B82C4')])
    guitar = lambda h1, h2: f'<g transform="translate(-6 -108) rotate(-28)"><ellipse cx="0" cy="28" rx="34" ry="28" fill="#C8782E"/><ellipse cx="0" cy="-8" rx="24" ry="20" fill="#C8782E"/><circle cx="0" cy="22" r="10" fill="#2A1A14"/><rect x="-4" y="-120" width="8" height="112" fill="#3B2A1E"/><rect x="-8" y="-134" width="16" height="22" rx="4" fill="#3B2A1E"/></g>'
    mic = lambda h1, h2: f'<g transform="translate({h2[0]} {h2[1]-6})"><rect x="-5" y="-6" width="10" height="38" rx="5" fill="#555"/><circle cx="0" cy="-14" r="13" fill="#B8BCC6"/></g>'
    tamb = lambda h1, h2: f'<g transform="translate({h2[0]} {h2[1]-10})"><circle r="22" fill="#F5C542" stroke="#C99A17" stroke-width="5"/><circle r="5" cx="0" cy="-16" fill="#C99A17"/><circle r="5" cx="15" cy="9" fill="#C99A17"/><circle r="5" cx="-15" cy="9" fill="#C99A17"/></g>'
    b = notes
    b += person(130, 332, 1.0, 2, 3, 'short', VERM, '#2F3B4A', ('hold', 'hold'), 'stand', extra=guitar)
    b += person(320, 332, 1.0, 4, 4, 'curly', '#F5E6C8', '#3A4A63', ('up', 'up'), 'jump', extra=mic)
    b += person(510, 332, 1.0, 0, 2, 'long', VERDE, '#5B6C8F', ('up', 'up'), 'jump2', extra=tamb)
    return frame('#FDE8E6', '#E8F4EC', b, 14)

def sc_som():
    waves = ''.join(f'<path d="M{x} {y} q14 -18 0 -36 M{x+16} {y+8} q22 -26 0 -52" stroke="{c}" stroke-width="6" stroke-linecap="round" fill="none"/>' for x, y, c in [(70, 140, VERDE), (545, 120, VERM)])
    mixer = '<g><rect x="205" y="232" width="230" height="70" rx="12" fill="#2F3340"/>' + ''.join(f'<rect x="{225+i*36}" y="244" width="8" height="46" rx="4" fill="#555B6B"/><rect x="{219+i*36}" y="{250+(i*13)%22}" width="20" height="10" rx="4" fill="{VERM if i%2 else VERDE}"/>' for i in range(6)) + '<rect x="190" y="302" width="260" height="14" rx="7" fill="#C9884D"/><rect x="214" y="316" width="12" height="30" fill="#B06F38"/><rect x="414" y="316" width="12" height="30" fill="#B06F38"/></g>'
    spk = '<g><rect x="500" y="212" width="72" height="130" rx="12" fill="#2F3340"/><circle cx="536" cy="250" r="14" fill="#555B6B"/><circle cx="536" cy="300" r="26" fill="#555B6B"/><circle cx="536" cy="300" r="12" fill="#2F3340"/></g>'
    b = waves + spk
    b += person(120, 332, 1.0, 3, 3, 'afro', '#3B82C4', '#2F3B4A', 'up', 'jump', hat='headphones')
    b += person(320, 330, 1.0, 0, 4, 'bun', VERM, '#3A4A63', ('hold', 'wave'), 'stand', hat='headphones')
    b += mixer
    return frame('#E4E9F7', '#E6F4EA', b, 15)

def sc_limpeza():
    bubbles = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#fff" stroke="#9FD0F2" stroke-width="3" opacity=".9"/>' for x, y, r in [(80, 80, 16), (110, 130, 10), (560, 70, 18), (520, 120, 9), (320, 50, 12), (360, 90, 7)])
    sparkle = ''.join(f'<path d="M{x} {y-14} L{x+4} {y-4} L{x+14} {y} L{x+4} {y+4} L{x} {y+14} L{x-4} {y+4} L{x-14} {y} L{x-4} {y-4}Z" fill="#F5C542"/>' for x, y in [(220, 100), (430, 80), (600, 160)])
    bucket = lambda h1, h2: f'<g transform="translate({h2[0]} {h2[1]+4})"><path d="M-22 0 h44 l-6 38 h-32Z" fill="#3B82C4"/><path d="M-22 0 q22 -26 44 0" stroke="#555" stroke-width="4" fill="none"/></g>'
    broom = lambda h1, h2: f'<g transform="translate({h2[0]} {h2[1]})"><rect x="-3" y="-130" width="6" height="190" rx="3" fill="#B06F38"/><path d="M-20 56 h40 l10 34 h-60Z" fill="#E0B24D"/></g>'
    spray = lambda h1, h2: f'<g transform="translate({h2[0]} {h2[1]-14})"><rect x="-10" y="0" width="20" height="40" rx="6" fill="#DD3326"/><rect x="-6" y="-12" width="22" height="12" rx="4" fill="#555"/></g>'
    b = bubbles + sparkle
    b += person(140, 332, 1.0, 2, 1, 'bandana', VERDE, '#3A4A63', ('up', 'hold'), 'stand', extra=broom, hat='bandana') if False else person(140, 332, 1.0, 2, 1, 'short', VERDE, '#3A4A63', ('up', 'hold'), 'stand', extra=broom)
    b += person(320, 332, 1.0, 4, 3, 'curly', '#F5E6C8', '#2F3B4A', ('up', 'hold'), 'stand', extra=spray)
    b += person(500, 332, 1.0, 0, 2, 'bun', VERM, '#5B6C8F', ('up', 'hold'), 'stand', extra=bucket)
    return frame('#E1F1FB', '#E8F6EC', b, 16)

def sc_recepcao():
    bunt = '<g>' + ''.join(f'<path d="M{40+i*52} {20+ (10 if i%2 else 0)} l26 0 l-13 34Z" fill="{[VERDE,VERM,"#F5C542","#fff"][i%4]}"/>' for i in range(12)) + '<path d="M30 20 Q320 56 620 20" stroke="#8A8A8A" stroke-width="3" fill="none"/></g>'
    door = '<g><rect x="262" y="120" width="116" height="226" rx="10" fill="#C9884D"/><rect x="274" y="132" width="92" height="206" rx="6" fill="#E0A863"/><circle cx="352" cy="240" r="6" fill="#fff"/></g><g><circle cx="320" cy="96" r="30" fill="#fff"/><path d="M320 112 C298 94 302 78 314 80 C318 81 320 84 320 84 C320 84 322 81 326 80 C338 78 342 94 320 112Z" fill="#DD3326"/></g>'
    flowers = ''.join(f'<g transform="translate({x} 346)"><path d="M0 0 v-50" stroke="{VERDE2}" stroke-width="5"/>' + ''.join(f'<circle cx="{round(14*math.cos(a))}" cy="{-58+round(14*math.sin(a))}" r="9" fill="{c}"/>' for a in [0, 1.26, 2.51, 3.77, 5.03]) + f'<circle cx="0" cy="-58" r="8" fill="#F5C542"/></g>' for x, c in [(230, VERM), (410, '#F29D52'), (250, '#fff')])
    b = bunt + door + flowers
    b += person(130, 332, 1.0, 1, 0, 'short', '#F29D52', '#2F3B4A', ('wave', 'down'), 'stand')
    b += person(510, 332, 1.0, 3, 1, 'wavy', VERDE, '#3A4A63', ('down', 'wave'), 'stand', flip=False)
    b += person(60, 332, .01, 0, 0, 'bald') if False else ''
    return frame('#FFF1DB', '#E4F3E8', b, 17)

def sc_geral():
    b = person(110, 332, 1.0, 0, 4, 'long', '#E86B5A', '#3A4A63', 'up', 'jump')
    b += person(250, 332, 1.0, 1, 2, 'short', '#F5E6C8', '#3B82C4', ('fist', 'up'), 'jump2', beard=True)
    b += person(395, 332, 1.0, 4, 3, 'curly', '#3B82C4', '#2F3B4A', 'up', 'jump')
    b += person(535, 332, 1.0, 2, 1, 'wavy', VERDE, '#7FA38C', ('up', 'wave'), 'jump2')
    return frame('#E6F4EA', '#FBE9E5', b, 18)

SCENES = {'gourmet': sc_gourmet, 'infantil': sc_infantil, 'midia': sc_midia, 'musica': sc_musica, 'som': sc_som, 'limpeza': sc_limpeza, 'recepcao': sc_recepcao, 'geral': sc_geral}
if __name__ == '__main__':
    out = os.path.join(os.path.dirname(__file__), '..', 'assets', 'img', 'ministerios'); os.makedirs(out, exist_ok=True); allj = {}
    for k, fn in SCENES.items():
        svg = fn(); open(os.path.join(out, k + '.svg'), 'w', encoding='utf-8').write(svg); allj[k] = svg
    json.dump(allj, open(os.path.join(out, '_all.json'), 'w', encoding='utf-8'), ensure_ascii=False)
    print({k: len(v) for k, v in allj.items()})
