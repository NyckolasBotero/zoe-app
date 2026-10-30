# Membros cadastrados: criar a pessoa com ou sem acesso ao app, e liberar o acesso depois, sem duplicar
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')")
    pg.evaluate("go('admin')"); pg.wait_for_selector('.admtabs'); pg.evaluate("admGrupo('acc')"); pg.wait_for_timeout(900)
    pg.wait_for_selector('.card:has(h3:text-is("Membros cadastrados")) button:has-text("Ver e editar")'); pg.click('.card:has(h3:text-is("Membros cadastrados")) button:has-text("Ver e editar")'); pg.wait_for_selector('#adl_membros')
    def novo(nome,email,acesso,senha=''):
        pg.click("button[onclick=\"admForm('membros','')\"]"); pg.wait_for_selector('.box')
        labels=pg.evaluate("[...document.querySelectorAll('.box .form label.f')].map(l=>l.innerText.split('\\n')[0])"); i0=labels.index('Nome completo'); i1=[k for k,l in enumerate(labels) if l.startswith('E-mail')][0]
        pg.fill(f'#adf{i0}',nome); pg.fill(f'#adf{i1}',email)
        if acesso: pg.check('#ac_on'); pg.fill('#ac_s',senha)
        pg.click('.box button:has-text("Salvar")'); pg.wait_for_selector('.box',state='detached',timeout=10000); pg.wait_for_selector(f'#adl_membros .opt:has-text("{nome}")',timeout=10000)
    # frequentador: só cadastro, sem acesso
    novo('Carlos Frequentador','','' and 0)
    row=pg.locator('#adl_membros .opt:has-text("Carlos Frequentador")'); assert 'Sem acesso ao app' in row.inner_text()
    # pessoa com acesso criado junto
    novo('Dora Membro','dora@zoe.com',True,'Temp12345')
    assert 'Com acesso' in pg.locator('#adl_membros .opt:has-text("Dora Membro")').inner_text()
    n=pg.evaluate("S.users.filter(u=>u.email==='dora@zoe.com').length"); assert n==1
    # liberar depois, na própria pessoa
    row.locator('button:has-text("Criar acesso")').click(); pg.wait_for_selector('#ac_e'); pg.fill('#ac_e','carlos@zoe.com'); pg.click('.box button:has-text("Gerar")'); assert len(pg.input_value('#ac_s'))>=8
    pg.click('.box button:has-text("Criar acesso")'); pg.wait_for_selector('.box',state='detached',timeout=10000)
    pg.wait_for_function("[...document.querySelectorAll('#adl_membros .opt')].some(e=>e.innerText.includes('Carlos Frequentador')&&e.innerText.includes('Com acesso'))",timeout=10000)
    # não duplicou: continua uma só pessoa por nome
    assert pg.evaluate("ADMC.membros.itens.filter(i=>i.rotulo==='Carlos Frequentador').length")==1
    # "Novo usuário" com o mesmo nome de alguém sem acesso é barrado
    novo('Elisa Visitante','','' and 0)
    r=pg.evaluate("api('createUser',{nome:'Elisa Visitante',email:'elisa@zoe.com',senha:'Temp12345',papel:'membro'}).then(()=>'ok',e=>e.message)"); assert 'Criar acesso' in r, r
    print('ERRS',errs); assert not errs
print('OK')
