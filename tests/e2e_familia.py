# Família Zoe: pastores em estilo mural, Quem somos com vídeo automático e carrossel de fotos
from playwright.sync_api import sync_playwright
import os,base64
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
PNG='data:image/png;base64,'+'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=8000)
    pg.evaluate("""async(png)=>{await api('adminSave',{tipo:'pastores',valores:{Nome:'Pr. João',Cargo:'Pastor titular',Foto:png,Ordem:'1'}});await api('adminSave',{tipo:'pastores',valores:{Nome:'Pra. Maria',Cargo:'Pastora titular',Ordem:'2'}});
      await api('adminSave',{tipo:'familia',valores:{Tipo:'video',Url:'https://youtu.be/M7lc1UVf-VE',Legenda:'Nosso culto',Ordem:'1'}});
      await api('adminSave',{tipo:'familia',valores:{Tipo:'foto',Foto:png,Legenda:'Batismo',Ordem:'2'}});await api('adminSave',{tipo:'familia',valores:{Tipo:'foto',Foto:png,Legenda:'Célula',Ordem:'3'}});await hydrate();go('familia','pastores')}""",PNG)
    pg.wait_for_selector('.mfit.polar'); pg.wait_for_timeout(300)
    assert pg.locator('.mfit.polar').count()==1 and 'Pr. João' in pg.inner_text('.mfb'), 'sem mural salvo, o mural mostra os pastores cadastrados (os que têm foto)'
    pg.screenshot(path=OUT+'/m_pastores.png')
    pg.evaluate("go('familia','quem')"); pg.wait_for_selector('.famv iframe'); src=pg.get_attribute('.famv iframe','src'); print(src); assert 'autoplay=1' in src and 'mute=1' in src and 'loop=1' in src
    pg.wait_for_selector('#famcar .fs.on'); assert pg.locator('#famcar .fs').count()==2
    a=pg.evaluate("[...document.querySelectorAll('#famcar .fs')].findIndex(x=>x.classList.contains('on'))"); pg.wait_for_timeout(5200)
    c=pg.evaluate("[...document.querySelectorAll('#famcar .fs')].findIndex(x=>x.classList.contains('on'))"); print(a,c); assert a!=c
    pg.screenshot(path=OUT+'/m_quem.png')
    print('ERROS',errs); assert not errs
print('OK')
