# Árvore Zoe: um só galho principal por sobrenome; as outras famílias Botero viram ramos dele
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
def kin(pg,a,b,rel):
    r=pg.evaluate("api('saveKin',{a:'%s',b:'%s',rel:'%s'})"%(a,b,rel)); assert r['id'],r
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,1500)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    I={}
    for k,n in [('fb','Fabiano Botero'),('av','Avana Botero'),('na','Nathan Botero'),('ny','Nyckolas Botero'),('bl','Isabela Botero'),('lr','Lara Botero'),('ab','Avana Beatriz Botero'),('ka','Karen Botero'),('si','Ana Silva'),('jo','Jorge Silva')]:
        I[k]=pg.evaluate("api('createUser',{email:'%s@zoe.com',nome:%r,senha:'Temp12345',papel:'membro'})"%(k,n))['membroId']
    # componente 1: Fabiano + Avana e o filho Nathan (sem ligação com os outros)
    kin(pg,I['fb'],I['av'],'conjuge'); kin(pg,I['fb'],I['na'],'filho'); kin(pg,I['av'],I['na'],'filho')
    # componente 2: Nyckolas + Isabela e a filha Lara
    kin(pg,I['ny'],I['bl'],'conjuge'); kin(pg,I['ny'],I['lr'],'filho'); kin(pg,I['bl'],I['lr'],'filho')
    # componente 3: Avana Beatriz e a filha Karen
    kin(pg,I['ab'],I['ka'],'filho')
    # outra família, outro sobrenome: continua no tronco
    kin(pg,I['si'],I['jo'],'conjuge')
    pg.evaluate("go('arvore')"); pg.wait_for_selector('#av_arv'); pg.click('.tabs >> text=Toda a igreja'); pg.wait_for_selector('#av_orgs .avn',timeout=10000)
    labs=pg.evaluate("[...document.querySelectorAll('#av_orgs .avf')].map(x=>x.dataset.n)"); print(labs)
    assert labs.count('Família Botero')==1, labs
    assert labs.count('Família Silva')==1
    assert any('Nyckolas' in l for l in labs) and any('Avana Beatriz' in l or 'Avana e filhos' in l for l in labs), labs
    pg.screenshot(path=OUT+'/arvore_um_ramo.png',full_page=False)
    print('ERRS',errs); assert not errs
print('OK um ramo')
