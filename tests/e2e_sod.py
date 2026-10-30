# Sod Adonai: janela no início, aba no perfil, caixa, mochila, personagem, estados (preso, atrasado, sentado, livre)
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def pixels(pg,sel):
    return pg.evaluate("""s=>{const c=document.querySelector(s),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;const set=new Set();for(let i=0;i<d.length;i+=4)set.add(d[i]+','+d[i+1]+','+d[i+2]);return set.size}""",sel)
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1100,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_TUNNEL' not in m.text else None)
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.wait_for_selector('#sd_home canvas'); pg.wait_for_function('SDA.st===1',timeout=15000); pg.wait_for_timeout(500); assert pixels(pg,'#sd_mini')>12, 'cena vazia'
    pg.screenshot(path=OUT+'/sod_home.png')
    pg.click('#sd_home'); pg.wait_for_selector('#sd_cv'); pg.wait_for_timeout(600); assert 'Sod Adonai' in pg.inner_text('#view') and pixels(pg,'#sd_cv')>12
    assert 'Entrar no app hoje' in pg.inner_text('#view'); pg.screenshot(path=OUT+'/sod_cena.png',full_page=True)
    # caixa
    n0=pg.evaluate("SD.d.itens.length"); pg.click('button:has-text("Abrir caixa")'); pg.wait_for_selector('.sdnovo'); pg.screenshot(path=OUT+'/sod_caixa.png'); pg.click('button:has-text("Guardar na mochila")')
    assert pg.evaluate("SD.d.itens.length")==n0+1 and pg.evaluate("SD.d.caixas")==0
    # mochila
    pg.click('.pf-tabs button:has-text("Mochila")'); pg.wait_for_selector('.sdi'); assert 'Equipada' in pg.inner_text('#view'); pg.screenshot(path=OUT+'/sod_mochila.png',full_page=True)
    # personagem
    pg.click('.pf-tabs button:has-text("Personagem")'); pg.wait_for_selector('#sd_pv'); pg.wait_for_selector('.sdsel button:has-text("Moicano")'); pg.click('.sdsel button:has-text("Moicano")'); pg.wait_for_timeout(900)
    assert pg.evaluate("api('sodGet').then(r=>r.aparencia.cabelo)")=='moicano'; pg.screenshot(path=OUT+'/sod_perso.png',full_page=True)
    pg.click("button[onclick=\"sdSetAp('corBlusa','red')\"]"); pg.wait_for_timeout(900); assert pg.evaluate("api('sodGet').then(r=>r.aparencia.corBlusa)")=='red'
    pg.click('.sdsel button:has-text("Feminino")'); pg.wait_for_timeout(900); assert pg.evaluate("api('sodGet').then(r=>r.aparencia.corpo)")=='f'; pg.wait_for_timeout(300); assert pixels(pg,'#sd_pv')>20; pg.screenshot(path=OUT+'/sod_perso.png',full_page=True)
    # estados visuais
    pg.click('.pf-tabs button:has-text("O Sod")'); pg.wait_for_selector('#sd_cv')
    for nome,patch in [('atraso1',{'atraso':1,'nerf':.6,'pedra':1500}),('sentado',{'atraso':3,'nerf':0,'sentado':True,'pedra':2600}),('livre',{'livre':True,'pedra':0,'seq':7,'livreDesde':'2026-10-29'})]:
        pg.evaluate("p=>{Object.assign(SD.d,p);SD.loc=SD.d.pedra;render()}",patch); pg.wait_for_selector('#sd_cv'); pg.wait_for_timeout(500); assert pixels(pg,'#sd_cv')>12; pg.locator('#sd_cv').screenshot(path=OUT+f'/sod_{nome}.png')
    # o laço de animação para ao sair da tela
    pg.evaluate("go('feed')"); pg.wait_for_timeout(500); pg.evaluate("go('aniversarios')"); pg.wait_for_timeout(500); assert pg.evaluate("SD.iv")==0
    print('ERRS',errs); assert not errs
print('OK')
