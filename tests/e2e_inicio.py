# Início personalizável: o admin move, redimensiona e oculta cards e salva para todos; anotações dos cultos em rolagem vertical infinita
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None,vw=1300):
    pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
def box(pg,sel):
    pg.locator(sel).first.scroll_into_view_if_needed(); pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();if(r.bottom>innerHeight-60)scrollBy(0,r.bottom-innerHeight+160)}",sel)
    return pg.evaluate("s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}}",sel)
def span(pg,i): return pg.evaluate("i=>document.querySelector('.hb[data-id=\"'+i+'\"]').style.gridColumn",i)
def ordem(pg): return pg.evaluate("[...document.querySelectorAll('.hb')].map(e=>e.dataset.id)")
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{await api('createUser',{email:'ana@zoe.com',nome:'Ana Souza',senha:'Temp12345',papel:'membro'})}""")
    adm.evaluate("go('feed')"); adm.wait_for_selector('#hgrid .hb')
    assert 'Minhas escalas' in adm.inner_text('#hgrid') and adm.query_selector('#car')
    # --- anotações dos cultos: compartilhadas pela Ana aparecem em rolagem vertical
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123')
    for n,(d,tx) in enumerate([('2026-10-04','Primeiro culto'),('2026-10-11','Segundo culto'),('2026-10-18','Terceiro culto'),('2026-10-25','Quarto culto')]):
        ana.evaluate("a=>api('saveNote',{data:a[0],tema:'T'+a[0].slice(8),texto:a[1],igreja:true})",[d,tx])
    ana.evaluate("api('saveNote',{data:'2026-10-25',texto:'Anotação privada',igreja:false})")
    adm.evaluate("go('feed')"); adm.wait_for_function("document.querySelector('#cm_box .cmi')",timeout=8000)
    t=adm.inner_text('#cm_box'); assert 'Quarto culto' in t and 'Segundo culto' in t and 'Primeiro culto' not in t and 'privada' not in t, t
    assert adm.query_selector('#cm_box .cm-in') and adm.evaluate("getComputedStyle(document.querySelector('#cm_box .cm-in')).animationName")=='cmUp'
    # --- modo edição
    adm.click('button:has-text("Personalizar início")'); adm.wait_for_selector('.hltb'); adm.wait_for_selector('.hb.ed .hbr')
    adm.screenshot(path=OUT+'/inicio_edicao.png',full_page=True)
    w0=span(adm,'proxevento'); r=box(adm,'.hb[data-id="proxevento"] .hbr'); g=box(adm,'#hgrid'); col=(g['w']+14)/12
    adm.mouse.move(r['x']+8,r['y']+r['h']/2); adm.mouse.down(); adm.mouse.move(r['x']+8+col*1.1,r['y']+r['h']/2,steps=6); adm.mouse.up()
    adm.wait_for_selector('.hb.ed'); w1=span(adm,'proxevento'); assert w0=='span 3' and w1=='span 4', (w0,w1)
    # altura (borda de baixo)
    r=box(adm,'.hb[data-id="aniv"] .hbb'); adm.mouse.move(r['x']+r['w']/2,r['y']+8); adm.mouse.down(); adm.mouse.move(r['x']+r['w']/2,r['y']+8-34*2,steps=6); adm.mouse.up()
    assert adm.evaluate("document.querySelector('.hb[data-id=\"aniv\"]').style.gridRow")=='span 11'
    # mover: aniv para antes de proxevento
    o0=ordem(adm); t2=box(adm,'.hb[data-id="proxevento"]'); r=box(adm,'.hb[data-id="aniv"] .grip'); t2=box(adm,'.hb[data-id="proxevento"]'); r=box(adm,'.hb[data-id="aniv"] .grip'); adm.wait_for_timeout(300); t2=box(adm,'.hb[data-id="proxevento"]'); r=box(adm,'.hb[data-id="aniv"] .grip')
    adm.mouse.move(r['x']+8,r['y']+8); adm.mouse.down(); adm.mouse.move(t2['x']+20,t2['y']+t2['h']/2,steps=8); adm.mouse.up()
    o1=ordem(adm); assert o1.index('aniv')<o1.index('proxevento') and o0.index('aniv')>o0.index('proxevento'),(o0,o1)
    # ocultar o card de domingo
    adm.click('.hb[data-id="domingo"] .hbx button'); assert 'domingo' not in ordem(adm); adm.wait_for_selector('.hltb >> text=Programação de domingo')
    adm.click('button:has-text("Salvar para todos")'); adm.wait_for_selector('.hltb',state='detached'); adm.wait_for_timeout(300)
    assert 'domingo' not in ordem(adm) and span(adm,'proxevento')=='span 4'
    # --- vale para todos: a Ana recarrega e vê o mesmo Início, sem botão de edição
    ana.reload(); ana.wait_for_selector('#hgrid .hb',timeout=15000); ana.wait_for_selector('#splash',state='detached',timeout=15000)
    assert 'domingo' not in ordem(ana) and span(ana,'proxevento')=='span 4' and not ana.query_selector('button:has-text("Personalizar início")')
    o=ordem(ana); assert o.index('aniv')<o.index('proxevento'),o
    ana.screenshot(path=OUT+'/inicio_ana.png',full_page=True)
    # --- restaurar o padrão
    adm.click('button:has-text("Personalizar início")'); adm.click('button:has-text("Restaurar padrão")'); adm.wait_for_selector('.hltb',state='detached'); assert 'domingo' in ordem(adm) and span(adm,'proxevento')=='span 3'
    # --- celular: uma coluna
    m=entra(b,'admin@zoe.com','SenhaForte123',vw=390); m.evaluate("go('feed')"); m.wait_for_selector('#hgrid .hb'); assert m.query_selector('button:has-text("Personalizar início")'); m.screenshot(path=OUT+'/inicio_mobile.png',full_page=True)
    print('ERRS',errs); assert not errs
print('OK')
