# Lives e Vídeos: carrossel, aba Transmissões e player dentro do site
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':850}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    assert pg.query_selector('.nv:has-text("Lives e Vídeos")'), 'nome do menu'
    for t,u,tp,av in [('Como conduzir','https://www.youtube.com/watch?v=M7lc1UVf-VE','video',False),('Recepção','https://youtu.be/jNQXAC9IVRw','video',False),('Culto de domingo','https://www.youtube.com/watch?v=aqz-KE-bpKQ','live',True),('Culto de quarta','https://www.youtube.com/live/YE7VzlLtp-4','live',False)]:
        r=pg.evaluate("([t,u,tp,av])=>api('saveVideo',{titulo:t,url:u,tipo:tp,aoVivo:av}).then(()=>1)",[t,u,tp,av]); assert r==1
    pg.evaluate("api('listVideos').then(v=>{S.videos=v.map(mapV)})"); pg.wait_for_timeout(600)
    pg.click('.nv:has-text("Lives e Vídeos")'); pg.wait_for_selector('#vcar .vc'); pg.wait_for_timeout(500)
    assert pg.evaluate("document.querySelectorAll('#vcar .vc').length")==2, 'carrossel só com vídeos'
    assert pg.evaluate("document.querySelector('.tabs .on').textContent").startswith('Transmiss')
    assert pg.evaluate("document.querySelectorAll('.grid.w .vc').length")==2, 'aba transmissões'
    assert pg.query_selector('.grid.w .vlive'), 'etiqueta ao vivo'
    pg.screenshot(path=OUT+'/m_videos.png')
    pg.click('.tabs button:has-text("Todos")'); pg.wait_for_timeout(500)
    assert pg.evaluate("document.querySelectorAll('.grid.w .vc').length")==4
    pg.click('.grid.w .vc >> nth=0'); pg.wait_for_selector('.vplayer iframe')
    src=pg.get_attribute('.vplayer iframe','src'); print('SRC',src); assert 'youtube-nocookie.com/embed/' in src
    pg.screenshot(path=OUT+'/m_videos_player.png')
    pg.click('button[aria-label="Fechar"]'); pg.wait_for_selector('.vplayer',state='detached')
    # auto-avanço do carrossel (4s)
    pg.evaluate("go('tutoriais')"); pg.wait_for_selector('#vcar .vc')
    pg.set_viewport_size({'width':420,'height':800}); pg.wait_for_timeout(300)
    x0=pg.evaluate("document.querySelector('#vcar .vtrack').scrollLeft"); pg.wait_for_timeout(4800)
    x1=pg.evaluate("document.querySelector('#vcar .vtrack').scrollLeft"); print('SCROLL',x0,x1); assert x1>x0, 'carrossel avança sozinho'
    print('E2E VIDEOS OK' if not errs else 'ERROS: %s'%errs); b.close()
