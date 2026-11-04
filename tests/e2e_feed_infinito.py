# Feed da Zoe: rolagem infinita (carrega mais ao chegar no fim) e cartões que se centralizam em movimento ao rolar
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':800}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',os.environ.get('ZE','admin@zoe.com')); pg.fill('#lg_s',os.environ.get('ZS','SenhaForte123')); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("""()=>{S.posts=[];for(let i=0;i<40;i++)S.posts.push({id:'t'+i,titulo:'Notícia '+i,texto:'Texto '+i+' '.repeat(2)+'lorem ipsum dolor sit amet',iso:'2026-10-'+String(28-(i%28)).padStart(2,'0')+'T10:00:00',data:'2026-10-01',autor:'x'});go('noticias')}""")
    pg.evaluate("go('familia','noticias')") if pg.query_selector('#fu_lista')==None else None
    if not pg.query_selector('#fu_lista'): pg.evaluate("go('feed')")
    pg.wait_for_selector('#fu_lista'); pg.wait_for_timeout(1500)
    n0=pg.evaluate("document.querySelectorAll('#fu_lista>*:not(.sf-more)').length"); assert pg.query_selector('#fu_mais') or n0<=8, n0
    print('inicial',n0)
    for _ in range(12):
        pg.mouse.wheel(0,900); pg.wait_for_timeout(250)
    n1=pg.evaluate("document.querySelectorAll('#fu_lista>*:not(.sf-more)').length"); print('depois',n1)
    assert n1>n0, (n0,n1)
    pg.evaluate("scrollTo({top:document.querySelector('#fu_wrap').getBoundingClientRect().top+scrollY+600,behavior:'instant'})"); pg.wait_for_function('SF.p>0.99',timeout=15000)
    r=pg.evaluate("(()=>{const w=document.querySelector('#fu_wrap'),v=document.querySelector('#view').getBoundingClientRect(),b=w.getBoundingClientRect();return {tx:parseFloat(w.dataset.tx),dc:Math.abs((b.left+b.width/2)-(v.left+v.width/2))}})()")
    print(r); assert abs(r['tx'])<60 and r['dc']<2, r
    pg.screenshot(path=OUT+'/feed_infinito.png')
    assert not errs, errs
print('OK')
