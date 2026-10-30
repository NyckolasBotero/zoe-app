# Arrastar a Zoe (mouse e toque): muda de posição, guarda no aparelho, e o toque simples ainda abre o chat
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def entra(b,vw,vh,touch=False):
    ctx=b.new_context(viewport={'width':vw,'height':vh},has_touch=touch,is_mobile=touch); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("zMount()"); pg.wait_for_selector('#zav'); return pg,ctx
def centro(pg): return pg.evaluate("(()=>{const r=document.querySelector('#zav').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
with sync_playwright() as p:
    b=p.chromium.launch()
    # computador (mouse)
    pg,_=entra(b,1280,800); x,y=centro(pg); assert x>1100 and y>650,(x,y)
    pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x-300,y-400,steps=8); pg.mouse.move(200,150,steps=8); pg.mouse.up()
    x2,y2=centro(pg); assert abs(x2-200)<6 and abs(y2-150)<6,(x2,y2)
    assert pg.evaluate("document.querySelector('#zoe').classList.contains('zesq')&&document.querySelector('#zoe').classList.contains('zalto')")
    assert pg.evaluate("document.querySelector('#zchat').hidden"),'arrastar não deve abrir o chat'
    assert pg.evaluate("JSON.parse(localStorage.zoePos).x")<.25
    pg.click('#zav'); pg.wait_for_function("!document.querySelector('#zchat').hidden")  # toque simples abre
    r=pg.evaluate("(()=>{const a=document.querySelector('#zchat').getBoundingClientRect();return [a.x,a.y,a.right,a.bottom]})()"); assert r[0]>=0 and r[3]<=800 and r[2]<=1280,r
    pg.reload(); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("zMount()"); pg.wait_for_selector('#zav'); pg.wait_for_timeout(300)
    x3,y3=centro(pg); assert abs(x3-200)<8 and abs(y3-150)<8,(x3,y3)  # lembrou
    pg.set_viewport_size({'width':390,'height':700}); pg.wait_for_timeout(200); x4,y4=centro(pg); assert 0<x4<390 and 0<y4<700,(x4,y4)
    # celular (toque)
    pm,ctx=entra(b,390,844,True); x,y=centro(pm); cdp=ctx.new_cdp_session(pm)
    def tq(t,px,py): cdp.send('Input.dispatchTouchEvent',{'type':t,'touchPoints':[] if t=='touchEnd' else [{'x':px,'y':py}]})
    tq('touchStart',x,y)
    for i in range(1,11): tq('touchMove',x-20*i,y-45*i)
    tq('touchEnd',0,0); pm.wait_for_timeout(200)
    x2,y2=centro(pm); assert x2<x-150 and y2<y-300,((x,y),(x2,y2))
    assert pm.evaluate("document.querySelector('#zchat').hidden")
    pm.touchscreen.tap(x2,y2); pm.wait_for_function("!document.querySelector('#zchat').hidden")
    assert not errs,errs
    print('OK zoe arrasta')
