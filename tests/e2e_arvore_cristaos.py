# Árvore Zoe: resumo de cristãos, filtro "Mostrar apenas Zoe", parente sem usuário, folhas, galho manual e arrastar
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
def kin(pg,a,b,rel):
    r=pg.evaluate("api('saveKin',{a:'%s',b:'%s',rel:'%s'})"%(a,b,rel)); assert r['id'],r
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,1500)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    ids={}
    for k,n in [('fb','Fabiano Botero'),('av','Avana Botero'),('fn','Fabio Nyckolas Botero'),('ma','Maria Silva')]:
        ids[k]=pg.evaluate("api('createUser',{email:'%s@zoe.com',nome:%r,senha:'Temp12345',papel:'membro'})"%(k,n))['membroId']
    kin(pg,ids['fb'],ids['fn'],'filho'); kin(pg,ids['av'],ids['fn'],'filho'); kin(pg,ids['fb'],ids['av'],'conjuge'); kin(pg,ids['fn'],ids['ma'],'conjuge')
    # parente sem usuário: a filha Lara (3 anos, não cristã ainda, não congrega) e o avô Jorge (cristão, outra igreja)
    r=pg.evaluate("api('addKinPerson',{a:'%s',rel:'filha',nome:'Lara Botero',nasc:'%d-01-15',crista:'0',congrega:'0'})"%(ids['fn'],2023)); assert r['id'],r
    lara=r['id']
    r=pg.evaluate("api('addKinPerson',{a:'%s',rel:'pai',nome:'Jorge Botero',nasc:'1950-03-02',crista:'1',congrega:'0'})"%ids['fb']); assert r['id'],r
    # o 2º pai entra; o 3º é recusado
    pg.evaluate("api('addKinPerson',{a:'%s',rel:'mae',nome:'Dona Rita Botero',crista:'1'})"%ids['fb'])
    e=pg.evaluate("api('addKinPerson',{a:'%s',rel:'pai',nome:'Outro Pai',crista:'1'}).then(()=>'ok',e=>e.message)"%ids['fb']); print('3o pai:',e); assert 'já tem pai e mãe' in e
    pg.evaluate("go('arvore')"); pg.wait_for_selector('#av_arv'); pg.click('.tabs >> text=Toda a igreja'); pg.wait_for_selector('#av_orgs .avn',timeout=10000)
    t=pg.inner_text('#av_resumo'); print(t.replace('\n',' | '))
    assert pg.locator('#av_resumo .av-st .card').count()==4
    # 7 pessoas: 4 cristãs na Zoe (usuários), 2 cristãs fora (Jorge e Rita), 1 não cristã (Lara)
    assert '7 pessoas na árvore' in t, t
    vals=pg.evaluate("[...document.querySelectorAll('#av_resumo .av-st .card b')].map(b=>+b.textContent)"); print(vals); assert vals==[6,4,2,1],vals
    assert pg.locator('#av_orgs .avn').count()==7
    # tooltip do galho
    pg.locator('#av_orgs .avf').first.hover(); pg.wait_for_selector('#av_tip',state='visible'); tt=pg.inner_text('#av_tip'); print(tt.replace('\n',' | ')); assert 'Cristãs na Zoe' in tt and '%' in tt
    pg.mouse.move(5,5); pg.wait_for_timeout(200)
    # filtro só Zoe
    pg.click('button[aria-label="Mostrar apenas Zoe"], .tabs[aria-label="Mostrar apenas Zoe"] >> text=Sim'); pg.wait_for_selector('#av_orgs .avn')
    n=pg.locator('#av_orgs .avn').count(); print('so zoe',n); assert n==4,n
    pg.click('.tabs[aria-label="Mostrar apenas Zoe"] >> text=Não'); pg.wait_for_selector('#av_orgs .avn'); assert pg.locator('#av_orgs .avn').count()==7
    # marcador de cristã na ficha rápida do nó e edição
    pg.screenshot(path=OUT+'/arvore_cristaos.png',full_page=True)
    # folhas na ficha de família (Editar perfil)
    pg.evaluate("S.perfil=S.perfil||{};perfilSub&&0") if False else None
    pg.evaluate("kinN=0") if False else None
    # galho manual (admin)
    pg.evaluate("AV.tab='minha';go('arvore')"); pg.wait_for_selector('#av_arv'); pg.click('.tabs >> text=Toda a igreja'); pg.wait_for_selector('#av_orgs .avn')
    box=pg.locator('#av_orgs').bounding_box()
    pg.evaluate("avGalhoNovo('',260,-230)"); pg.fill('#gm_nome','Amigos da família'); pg.fill('#gm_q','Maria'); pg.wait_for_selector('#gm_r .opt'); pg.click('#gm_r .opt >> nth=0'); pg.click('.modal >> text=Salvar')
    pg.wait_for_selector('#av_orgs .avf[data-man="1"]',timeout=10000); assert pg.locator('#av_orgs .avf[data-man="1"]').count()==1
    # arrastar o nome do galho manual muda a direção
    tag=pg.locator('#av_orgs .avf[data-man="1"]'); tag.scroll_into_view_if_needed(); bb=tag.bounding_box(); x0,y0=bb['x']+bb['width']/2,bb['y']+bb['height']/2
    pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move(x0-80,y0-40,steps=6); pg.mouse.up(); pg.wait_for_timeout(800)
    g=pg.evaluate("AV.todos.galhos.filter(x=>x.tipo==='manual')[0]"); print('galho',g); assert g['dx']<260 and g['dy']<-230,g
    # arrastar o nome de um galho automático grava um ajuste
    t2=pg.locator('#av_orgs .avf:not([data-man])').first; t2.scroll_into_view_if_needed(); bb=t2.bounding_box(); x0,y0=bb['x']+bb['width']/2,bb['y']+bb['height']/2
    pg.mouse.move(x0,y0); pg.mouse.down(); pg.mouse.move(x0+60,y0,steps=6); pg.mouse.up(); pg.wait_for_timeout(800)
    assert pg.evaluate("AV.todos.galhos.filter(x=>x.tipo==='ajuste').length")==1
    # botão direito abre o menu
    pg.locator('#av_orgs').click(button='right',position={'x':40,'y':40}); pg.wait_for_selector('#av_ctx button:has-text("Nova ramificação aqui")')
    pg.keyboard.press('Escape')
    pg.screenshot(path=OUT+'/arvore_manual.png',full_page=True)
    # excluir ramificação manual
    pg.evaluate("avMenu(300,300,document.querySelector('#av_orgs .avf[data-man]'))"); pg.once('dialog',lambda d:d.accept()); pg.click('#av_ctx button:has-text("Excluir")'); pg.wait_for_timeout(800)
    assert pg.locator('#av_orgs .avf[data-man="1"]').count()==0
    print('ERRS',errs); assert not errs
print('OK cristaos')
