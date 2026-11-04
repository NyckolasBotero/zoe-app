# Feed da Zoe no Início (computador): o bloco cresce com o conteúdo e o deslize ao centro não é cortado
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1300,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("()=>{S.posts=[];for(let i=0;i<40;i++)S.posts.push({id:'t'+i,titulo:'Notícia '+i,texto:'Texto '+i+' lorem ipsum dolor sit amet',iso:'2026-10-'+String(28-(i%28)).padStart(2,'0')+'T10:00:00',data:'2026-10-01',autor:'x'});go('feed')}")
    pg.wait_for_selector('#fu_wrap'); pg.wait_for_timeout(500)
    pg.evaluate("document.querySelectorAll('[class*=cq],#cq,.badge-pop,#bpop').forEach(e=>e.remove())")
    if pg.query_selector('text=Que incrível!'): pg.click('text=Que incrível!')
    ov=pg.evaluate("getComputedStyle(document.querySelector('.hb.sf-blk .hbi')).overflowY"); assert ov=='visible', ov
    for _ in range(14): pg.mouse.wheel(0,700); pg.wait_for_timeout(200)
    pg.wait_for_timeout(500)
    r=pg.evaluate("(()=>{const w=document.querySelector('#fu_wrap'),k=w.closest('.hb'),a=w.getBoundingClientRect(),bk=k.getBoundingClientRect();return {wh:a.height,bh:bk.height,n:document.querySelectorAll('#fu_lista>*:not(.sf-more)').length}})()")
    print(r); assert r['bh']>=r['wh']-2 and r['n']>8, r
    pg.evaluate("scrollTo({top:document.querySelector('#fu_wrap').getBoundingClientRect().top+scrollY+900,behavior:'instant'})"); pg.wait_for_timeout(500)
    pg.screenshot(path=OUT+'/feed_bloco.png'); assert not errs, errs
print('OK')
