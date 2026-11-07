# Árvore Zoe em galhos: Cristo é o tronco; nova família = galho ligado ao galho de origem
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
def kin(pg,a,b,rel):
    r=pg.evaluate("api('saveKin',{a:'%s',b:'%s',rel:'%s'})"%(a,b,rel)); assert r['id'],r
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    ids={}
    for k,n in [('fb','Fabiano Botero'),('av','Avana Botero'),('fn','Fabio Nyckolas Botero'),('fa','Fabio Nathan Botero'),('ma','Maria Silva'),('la','Lara Botero'),('jo','Joana Costa')]:
        ids[k]=pg.evaluate("api('createUser',{email:'%s@zoe.com',nome:%r,senha:'Temp12345',papel:'membro'})"%(k,n))['membroId']
    for pai in('fb','av'):
        for f in('fn','fa'): kin(pg,ids[pai],ids[f],'filho')
    kin(pg,ids['fb'],ids['av'],'conjuge'); kin(pg,ids['fn'],ids['ma'],'conjuge')
    kin(pg,ids['fn'],ids['la'],'filho'); kin(pg,ids['ma'],ids['la'],'filho')
    def igreja():
        pg.evaluate("AV.todos=null;AV.d=null;AV.tab='minha';AV.sc=null;go('arvore')"); pg.wait_for_selector('#av_arv'); pg.click('.tabs >> text=Toda a igreja'); pg.wait_for_selector('#av_orgs .avn',timeout=10000)
    igreja()
    ys=lambda: pg.evaluate("[...document.querySelectorAll('#av_orgs .avn')].map(n=>[n.dataset.id,+n.dataset.g,n.getBoundingClientRect().y])")
    tags=pg.locator('#av_orgs .avf').count(); print('TAGS',tags,pg.evaluate("[...document.querySelectorAll('#av_orgs .avf')].map(x=>x.getAttribute('aria-label'))")); assert tags==2,tags   # Família Botero + galho de Fabio e Maria
    n=pg.locator('#av_orgs .avn').count(); assert n==6,n   # Nathan e Joana ainda não ligados? Joana não tem vínculo => fora
    g={i:(gg,y) for i,gg,y in ys()}
    assert g[ids['fb']][0]==0 and g[ids['fn']][0]==1 and g[ids['la']][0]==2
    assert g[ids['fb']][1]>g[ids['fn']][1]>g[ids['la']][1], 'gerações sobem na tela'
    assert 'Cristo Jesus' in pg.text_content('#av_orgs')
    pg.screenshot(path=OUT+'/arvore_galhos1.png',full_page=True)
    # Nathan casa: ganha o próprio galho
    kin(pg,ids['fa'],ids['jo'],'conjuge'); kin(pg,ids['fa'],ids['jo'],'conjuge') if False else None
    la2=pg.evaluate("api('createUser',{email:'ba@zoe.com',nome:'Bia Botero',senha:'Temp12345',papel:'membro'})")['membroId']
    kin(pg,ids['fa'],la2,'filho'); kin(pg,ids['jo'],la2,'filho')
    igreja(); t2=pg.locator('#av_orgs .avf').count(); print('TAGS2',t2); assert t2==3,t2
    pg.screenshot(path=OUT+'/arvore_galhos2.png',full_page=True)
    # visão da minha família: um galho só
    pg.locator('#av_orgs .avf').first.click(); pg.wait_for_selector('.avn',timeout=10000)
    print('FAM',pg.locator('.avn').count()); pg.screenshot(path=OUT+'/arvore_galhos_fam.png',full_page=True)
    print('ERRS',errs); assert not errs
print('OK galhos')
