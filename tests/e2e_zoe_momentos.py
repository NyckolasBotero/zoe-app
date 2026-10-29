# Zoe participativa: aniversário, datas especiais, decisão/batismo e perfil completo
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None):
    pg=b.new_page(viewport={'width':1200,'height':860}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept()); pg.add_init_script("localStorage.setItem('zoe-force','1')")
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{const a=await api('createUser',{nome:'Ana Souza',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'});const e=await api('createUser',{nome:'Erik Lima',email:'erik@zoe.com',senha:'Temp12345',papel:'membro'});
      await api('adminSave',{tipo:'membros',id:e.membroId,valores:{Nome:'Erik Lima',Nascimento:'1990-'+TODAY.slice(5)}});await api('guideDone')}""")
    # datas especiais (função pura)
    for dt,k in [('2026-12-25','natal:'),('2026-06-14','pastor:'),('2026-09-07','indep:')]:
        ks=adm.evaluate("d=>zMomList(d).map(m=>m.key)",dt); print(dt,ks); assert any(x.startswith(k) for x in ks),(dt,ks)
    assert not any(x.startswith('pastor:') for x in adm.evaluate("zMomList('2026-06-07').map(m=>m.key)"))
    txt=adm.evaluate("zMomList('2026-12-25')[0].x"); assert 'Lucas 2:11' in txt and 'Natal' in txt
    assert 'Salmos 33:12' in adm.evaluate("zMomList('2026-09-07')[0].x")
    # a Ana vê o aniversário do Erik e o parabeniza
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); ana.evaluate("S.guiaVisto=true;zMomRun()")
    ana.wait_for_selector('#zbub:not([hidden]) .zbt button:has-text("Enviar parabéns")',timeout=15000); ana.wait_for_function("document.querySelector('#zx').textContent.includes('Salmos 118:24')",timeout=15000)
    t=ana.inner_text('#zx'); print(t); assert 'Erik' in t and 'Parabenize' in t; ana.screenshot(path=OUT+'/m_zoe_aniv.png')
    ana.click('#zbt button:has-text("Enviar parabéns")'); ana.wait_for_timeout(1200)
    erik=entra(b,'erik@zoe.com','Temp12345','NovaSenha123'); erik.evaluate("S.guiaVisto=true;zMomRun()")
    erik.wait_for_selector('#zbub:not([hidden])',timeout=15000); erik.wait_for_function("document.querySelector('#zx').textContent.includes('Salmos 118:24')",timeout=15000); assert 'seu' in erik.inner_text('#zx') and 'Feliz aniversário' in erik.inner_text('#zbub')
    n=erik.evaluate("api('listNotifications').then(r=>r.itens.map(x=>x.titulo))"); print(n); assert any('te parabenizou' in x for x in n)
    # decisão, batismo e perfil completo
    ana.evaluate("zMomOk()"); ana.wait_for_timeout(300)
    ana.evaluate("S.perfil.decisao=TODAY;zMomRun()"); ana.wait_for_function("document.querySelector('#zx').textContent.includes('João 1:12')",timeout=15000); assert 'decisão por Cristo' in ana.inner_text('#zbub'); ana.click('#zbt button:has-text("Obrigado")'); ana.wait_for_timeout(1300)
    ana.evaluate("S.perfil.dataBat=TODAY;zMomRun()"); ana.wait_for_function("document.querySelector('#zx').textContent.includes('Romanos 6:4')",timeout=15000); ana.click('#zbt button:has-text("Obrigado")'); ana.wait_for_timeout(1300)
    ana.evaluate("Object.assign(S.perfil,{nome:'Ana Souza',simples:'Ana',sexo:'F',nasc:'1995-05-05',nacionalidade:'Brasileira',natural:'Brasília',sangue:'O+',prof:'Professora',tel:'61999990000',email:'a@a.com',cep:'70000000',uf:'DF',cidade:'Brasília',end:'Rua 1',bairro:'Asa Sul',mae:'M',pai:'P',civil:'Solteira'});S.foto='data:image/png;base64,AAAA';zMomRun()")
    ana.wait_for_function("document.querySelector('#zx').textContent.includes('Provérbios 16:3')",timeout=15000); assert 'todos os dados' in ana.inner_text('#zbub'); ana.click('#zbt button:has-text("Obrigado")'); ana.wait_for_timeout(1300)
    # não repete
    ana.evaluate("zMomRun()"); ana.wait_for_timeout(600); assert ana.locator('#zbub:not([hidden])').count()==0
    print('ERROS',errs); assert not errs
print('OK')
