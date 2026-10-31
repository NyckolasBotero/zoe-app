# Árvore Zoe + lista de Pessoas com foto + ficha rápida do membro da célula
from playwright.sync_api import sync_playwright
exec(open('tests/e2e_agendas.py').read().split('with sync_playwright')[0])
with sync_playwright() as p:
    b=p.chromium.launch(); pg=entra(b,1280,900)
    pg.add_style_tag(content='#pushbar{display:none!important}')
    ids={}
    for k,n in [('f','Fábio Nyckolas Figueiredo Botero'),('i','Isabela Santos Brito Botero'),('a','Avana Hadassa Santos Botero'),('c','Claudio Lucas Nicacio'),('n','Ana Nicacio')]:
        r=pg.evaluate("api('createUser',{email:'%s@zoe.com',nome:%r,senha:'Temp12345',papel:'membro'})"%(k,n)); ids[k]=r['membroId']
    pg.evaluate("api('saveKin',{a:'%s',b:'%s',rel:'pai'})"%(ids['a'],ids['f'])); pg.evaluate("api('saveKin',{a:'%s',b:'%s',rel:'mae'})"%(ids['a'],ids['i']))
    r=pg.evaluate("api('saveKin',{a:'%s',b:'%s',rel:'irma'})"%(ids['c'],ids['n'])); assert r['id']
    # Pessoas: todos com acesso, com avatar
    pg.evaluate("go('pessoas')"); pg.wait_for_selector('#ps_r .opt',timeout=10000); print('PESSOAS',pg.locator('#ps_r .opt').count(),pg.locator('#ps_r .opt .fa').count(),pg.inner_text('#ps_r')[:200]); assert pg.locator('#ps_r .opt').count()>=5 and pg.locator('#ps_r .opt .av').count()>=5
    # Árvore da família da Avana (visão da liderança) e da igreja
    pg.evaluate("go('arvore')"); pg.wait_for_selector('#av_arv'); pg.click('.tabs >> text=Toda a igreja'); pg.wait_for_selector('text=famílias na Árvore Zoe')
    assert pg.locator('.opt:has-text("Família Botero")').count()==1 and pg.locator('.opt:has-text("Família Nicacio")').count()==1
    pg.click('.opt:has-text("Família Botero")'); pg.wait_for_selector('.avn',timeout=10000); assert pg.locator('.avn').count()==3, pg.locator('.avn').count()
    pg.screenshot(path=OUT+'/arvore.png',full_page=True)
    # sugestão por sobrenome ao digitar um nome
    pg.fill('#kin_q','Isabela Santos'); pg.wait_for_selector('#kin_sug:has-text("Parece ser a pessoa")',timeout=8000)
    pg.fill('#kin_q','Claudio Lucas Nicacio'); pg.wait_for_selector('#kin_sug:has-text("Mesmo sobrenome: Nicacio")',timeout=8000)
    # ficha rápida da célula (renderização)
    pg.evaluate("cmDesenha({id:'x1',nome:'Maria Souza',apelido:'Maria',nasc:'1990-05-02',tel:'61999990000',email:'m@x.com',foto:0,membro:true,celula:'Norte',temAcesso:true,end:{endereco:'Quadra 1',bairro:'Centro',cidade:'Brasília',uf:'DF',cep:''},lat:null,lng:null})")
    pg.wait_for_selector('.modal:has-text("Onde mora")'); t=pg.inner_text('.modal'); assert 'Ir para o perfil' in t and 'Quadra 1' in t and 'WhatsApp' in t, t
    print('ERRS',errs); assert not errs
print('OK arvore')
