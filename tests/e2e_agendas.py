# Agendas de transmissão, tela de pausa, imagens e eventos no telão
from playwright.sync_api import sync_playwright
import os,base64
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
PNG=OUT+'/ag_teste.png'
open(PNG,'wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC'))
def entra(b,vw,vh):
    pg=b.new_page(viewport={'width':vw,'height':vh}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); pc=entra(b,1280,900)
    for t,l in [('Santo','Santo\nSanto'),('Grande','Grande\nSenhor')]: pc.evaluate("api('saveSong',{titulo:%r,artista:'Zoe',letra:%r})"%(t,l))
    pc.evaluate("go('multimidia')"); pc.wait_for_selector('.tabs'); pc.click('.tabs >> text=Agendas'); pc.wait_for_selector('text=Nova agenda')
    pc.screenshot(path=OUT+'/ag_lista.png')
    pc.click('text=Nova agenda'); pc.wait_for_selector('#ag_data')
    pc.click('.ag-pk:has-text("Santo")'); pc.click('.ag-pk:has-text("Grande")')
    pc.set_input_files('#ag_pick input[type=file]',PNG) if pc.query_selector('#ag_pick input[type=file]') else None
    pc.wait_for_timeout(800)
    pc.fill('#ag_nome','Culto de domingo'); pc.click('text=Criar agenda de transmissão'); pc.wait_for_selector('.ag-row, .opt:has-text("Culto de domingo")',timeout=8000)
    ag=pc.evaluate("api('listAgendas')"); print(ag); assert len(ag)==1 and len(ag[0]['itens'])>=2
    # passado: cria agenda de sábado antigo e confere histórico
    pc.evaluate("api('saveAgenda',{data:'2026-10-24',nome:'Culto de jovens',itens:[]})"); pc.evaluate("agCarrega&&agCarrega(true)"); pc.wait_for_timeout(600)
    pc.screenshot(path=OUT+'/ag_lista2.png'); txt=pc.inner_text('#view'); print(txt[:500]); assert 'Histórico' in txt and 'Culto de jovens' in txt
    # divulga imagem + evento direto
    pc.evaluate("api('saveMidia',{titulo:'Convite',foto:'data:image/png;base64,iVBORw0KGgo=',mini:'data:image/png;base64,iVBORw0KGgo='})")
    mid=pc.evaluate("api('listMidias')"); assert mid
    r=pc.evaluate("api('addAgendaItem',{t:'imagem',id:%r})"%mid[0]['id']); assert any(i['t']=='imagem' for i in r['itens']),r
    # tela de pausa
    pc.click('.tabs >> text=Tela de pausa'); pc.wait_for_selector('#mmprev canvas'); pc.screenshot(path=OUT+'/ag_pausa.png')
    pc.click('.chip[aria-label="Direção 90 graus"]'); pc.click('button:has-text("Salvar")')
    pc.wait_for_timeout(600); assert pc.evaluate("api('listSongs')")['pausa']['dir']==90
    print('ERRS',errs); assert not errs
print('OK')
