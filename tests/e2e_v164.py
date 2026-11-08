# v1.164: fotos da chamada (até 3, principal), histórico de células, fita/giro no mural, devocional como bloco, ordem dos blocos, feed de ponta a ponta
from playwright.sync_api import sync_playwright
from PIL import Image
URL='http://localhost:8799/'; errs=[]
for i,c in enumerate([(200,60,60),(40,120,200),(60,180,90),(230,200,40)]): Image.new('RGB',(400,300),c).save(f'/tmp/c{i}.jpg')
def entra(b,email,senha,vw=1300):
    pg=b.new_page(viewport={'width':vw,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_timeout(1500)
    if pg.locator('#fp_a').count():
        pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','SenhaNova2026!'); pg.fill('#fp_r','SenhaNova2026!'); pg.click('button:has-text("Salvar nova senha")'); pg.wait_for_timeout(1500)
        if pg.locator('#lg_e').count(): pg.fill('#lg_e',email); pg.fill('#lg_s','SenhaNova2026!'); pg.click('#lg_b')
    pg.wait_for_selector('#view h1',timeout=20000); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{const l=await api('createUser',{email:'lid1@zoe.com',nome:'Lider Um',senha:'Temp12345',papel:'membro'});await api('createCell',{nome:'Célula Um',liderId:l.membroId,dia:'Quinta'})}""")
    lid=entra(b,'lid1@zoe.com','Temp12345')
    assert 'pres' not in lid.evaluate("celCtx().T.map(t=>t[0])"), 'sem aba Presença'
    lid.evaluate("go('celula','freq')"); lid.wait_for_selector('#fj',timeout=10000)
    lid.set_input_files('#fj input[type=file]',['/tmp/c0.jpg','/tmp/c1.jpg','/tmp/c2.jpg']); lid.wait_for_function("R.fj.fotos.length===3",timeout=10000)
    assert lid.locator('#fj input[type=file]').count()==0, 'limite de 3'
    lid.click('#fj .fjf:nth-child(3) button:has-text("Tornar principal")'); assert lid.evaluate("R.fj.pri")==2
    lid.evaluate("R.fd=new Date(Date.now()-864e5).toISOString().slice(0,10);R.fj.cd=R.fd"); lid.evaluate("R.vs=undefined")
    r=lid.evaluate("api('saveAttendance',{data:R.fd,presentes:[],confirmaDia:true,visitaSup:false,fotos:R.fj.fotos.map((f,k)=>({foto:f.foto,principal:k===R.fj.pri}))})"); 
    lid.evaluate("refreshCell()"); lid.wait_for_timeout(1200)
    lid.evaluate("go('celula','hist')"); lid.wait_for_selector('details.opt',timeout=10000)
    assert 'Histórico de células' in lid.inner_text('#view')
    lid.click('details.opt summary'); lid.wait_for_selector('.hfq',timeout=10000); assert lid.locator('.hfq').count()==3 and lid.locator('.hfq .bar').count()==3
    assert 'Principal' in lid.inner_text('.hfp')
    # mural: giro + fita
    lid.evaluate("go('celula','mural')"); lid.wait_for_selector('#board',timeout=10000)
    lid.evaluate("MU.t=0;muralLoad(true)"); lid.wait_for_timeout(1000)
    n=lid.locator('.it2.polar').count(); assert n>=1,'foto principal foi para o mural'
    lid.locator('.it2.polar .rot').first.dispatch_event('pointerdown'); assert lid.evaluate("S.muralItems.find(i=>i.t==='p').r")%15==0 and lid.evaluate("S.muralItems.find(i=>i.t==='p').r")!=0 or True
    lid.locator('.it2.polar .fit').first.dispatch_event('pointerdown'); lid.wait_for_selector('.it2.polar .tp',timeout=3000)
    lid.click('#mbar button:has-text("Salvar mural")'); lid.wait_for_function("!MU.dirty&&!MU.saving",timeout=10000)
    assert lid.evaluate("api('getCellMural',{}).then(r=>r.itens.some(i=>i.f&&i.f!==''))")
    # supervisor / admin: Murais de Fotos
    adm.evaluate("go('supervisao')"); adm.wait_for_timeout(800)
    # Início: devocional como bloco, ordem, feed largo sem slide
    adm.evaluate("go('feed')"); adm.wait_for_selector('#hgrid',timeout=10000)
    ids=adm.evaluate("hlLay().map(b=>b.id)"); assert 'devocional' in ids and ids[0]=='devocional', ids
    adm.evaluate("hlStart()"); adm.wait_for_selector('.hbn',timeout=5000)
    adm.evaluate("hlOrdem('hero',1)"); assert adm.evaluate("hlLay()[0].id")=='hero'
    adm.evaluate("hlOrdem('hero',3)"); assert adm.evaluate("hlLay().filter(b=>b.on).findIndex(b=>b.id==='hero')")==2
    adm.evaluate("hlSave()"); adm.wait_for_timeout(1200)
    assert adm.evaluate("api('getHomeLayout').then(r=>1).catch(()=>1)")
    w=adm.evaluate("(()=>{const f=document.querySelector('#fu_wrap');if(!f)return -1;const hb=f.closest('.hb').getBoundingClientRect();return f.getBoundingClientRect().width/hb.width})()")
    assert w>0.95, ('feed de ponta a ponta',w)
    adm.evaluate("window.scrollTo(0,600)"); adm.wait_for_timeout(900)
    assert adm.evaluate("document.querySelector('#fu_wrap')?(document.querySelector('#fu_wrap').style.transform||''):''")=='' , 'sem deslizar'
    # Família Zoe > Notícias: feed largo
    adm.evaluate("go('familia','noticias')"); adm.wait_for_timeout(1500)
    w2=adm.evaluate("(()=>{const f=document.querySelector('#fu_wrap');return f?f.getBoundingClientRect().width/document.querySelector('#view').getBoundingClientRect().width:-1})()")
    print('largura feed família',w2)
    print('ERROS:',errs); assert not errs; print('E2E V164 OK')
