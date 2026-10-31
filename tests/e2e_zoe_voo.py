# Zoe voadora: foge de botões, fica tonta ao girar, voa para longe ao chacoalhar
from playwright.sync_api import sync_playwright
import math
URL='http://localhost:8799/'; errs=[]
def entra(b):
    ctx=b.new_context(viewport={'width':1280,'height':800}); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("zMount()"); pg.wait_for_selector('#zav'); pg.evaluate("ZV.esc=.25"); return pg
def centro(pg): return pg.evaluate("(()=>{const r=document.querySelector('#zav').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()")
def fala(pg): return pg.evaluate("(document.querySelector('#zbub')&&!document.querySelector('#zbub').hidden)?document.querySelector('#zbub').textContent:''")
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b); pg.wait_for_timeout(800)
    pd=centro(pg)
    # 1) nunca fica em cima de algo clicável: um botão cobre o canto e ela sai de lá sozinha
    pg.evaluate("(()=>{const x=document.createElement('button');x.id='bloq';x.textContent='Enviar';x.style.cssText='position:fixed;right:0;bottom:0;width:170px;height:170px;z-index:50';document.body.appendChild(x)})()")
    pg.wait_for_function("(()=>{const c=zCentro();return !zOcupado(c.x,c.y,c.w,c.h)&&Math.hypot(c.x-%f,c.y-%f)>60})()"%(pd[0],pd[1]),timeout=9000); pg.wait_for_function("!ZV.anim",timeout=5000)
    c=centro(pg); assert not pg.evaluate("(()=>{const c=zCentro();return zOcupado(c.x,c.y,c.w,c.h)})()"),c
    pg.evaluate("document.querySelector('#bloq').remove()")
    # 2) gira umas 5 vezes e solta: piruetas, volta ao canto padrão e diz que ficou tonta
    pg.evaluate("zPosAplica(null)"); pg.wait_for_timeout(300); x,y=centro(pg)
    pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(740,400,steps=10)
    for i in range(0,5*48+1):
        a=i/48*2*math.pi; pg.mouse.move(640+100*math.cos(a),400+100*math.sin(a))
    assert pg.evaluate("document.querySelector('#zav .zfx')&&document.querySelector('#zav .zfx').textContent")=='💫'
    pg.mouse.up(); pg.wait_for_selector('#zoe.voa',timeout=3000)
    pg.wait_for_function("document.querySelector('#zbub')&&!document.querySelector('#zbub').hidden&&/tonta/.test(document.querySelector('#zbub').textContent)",timeout=12000)
    pg.wait_for_function("!ZV.anim",timeout=5000); c2=centro(pg); assert abs(c2[0]-pd[0])<12 and abs(c2[1]-pd[1])<12,(c2,pd)
    pg.wait_for_timeout(4500)
    # 3) chacoalha de lado a lado e solta: sai da tela e volta aos poucos dizendo que foi para longe
    pg.evaluate("zFecha()"); x,y=centro(pg)
    pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(600,400,steps=10)
    for i in range(8):
        pg.mouse.move(800 if i%2==0 else 450,400+(i%3)*4,steps=7)
    assert pg.evaluate("document.querySelector('#zav .zfx')&&document.querySelector('#zav .zfx').textContent")=='😱'
    pg.mouse.move(900,400,steps=4); pg.mouse.up()
    pg.wait_for_function("(()=>{const c=zCentro();return c&&(c.x>innerWidth+20||c.x<-20)})()",timeout=4000)   # saiu da visão
    pg.wait_for_function("ZV.fora===true",timeout=4000)
    pg.wait_for_function("/longe/.test(document.querySelector('#zbub').textContent)&&!document.querySelector('#zbub').hidden",timeout=15000)
    pg.wait_for_function("!ZV.anim",timeout=5000); c3=centro(pg); assert 0<c3[0]<1280 and 0<c3[1]<800,c3
    assert not errs,errs
    print('OK zoe voo')
