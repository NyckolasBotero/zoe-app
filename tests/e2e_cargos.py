# Cargos de célula x nível de acesso, pela interface (servidor de teste limpo)
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
def entra(b,email,senha,nova=None):
    pg=b.new_page(viewport={'width':400,'height':820}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b')
    pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{for(const [n,e] of [['Sup Um','sup@zoe.com'],['Treino Um','trein@zoe.com'],['Comum Um','comum@zoe.com'],['Lider Dois','l2@zoe.com']])await api('createUser',{nome:n,email:e,senha:'Temp12345',papel:'membro'});}""")
    ids=adm.evaluate("async()=>Object.fromEntries((await api('listUsers')).map(u=>[u.email,u.membroId]))")
    adm.evaluate("async(i)=>{await api('createCell',{nome:'Célula A',liderId:i['admin@zoe.com'],supervisorId:i['sup@zoe.com'],dia:'Quinta'});await api('createCell',{nome:'Célula B',liderId:i['l2@zoe.com'],supervisorId:i['admin@zoe.com'],treinamentoId:i['trein@zoe.com'],dia:'Segunda'});await api('adminSave',{tipo:'membros',valores:{Nome:'Visitante Transferido',CelulaID:''}})}",ids)
    # admin é líder (A) e supervisor (B) ao mesmo tempo, sem deixar de ser administrador
    adm.reload(); adm.wait_for_selector('#view h1'); adm.evaluate("go('celula')"); adm.wait_for_selector('.tabs')
    foot=adm.inner_text('#side'); assert 'Administrador · Líder · Supervisor' in foot, foot
    assert 'Organograma' in adm.inner_text('.tabs')
    # membro comum, sem cargo: entra normalmente (não depende de ver dados da célula)
    cm=entra(b,'comum@zoe.com','Temp12345','NovaSenha123'); cm.evaluate("go('celula')"); cm.wait_for_selector('.tabs'); t=cm.inner_text('.tabs'); assert 'Presença' not in t and 'Oração' in t, t
    assert 'Administração' not in cm.inner_text('.nav')
    # líder em treinamento: presença sim, perfil/privacidade/papéis não; sem Administração
    tr=entra(b,'trein@zoe.com','Temp12345','NovaSenha123'); tr.evaluate("go('celula')"); tr.wait_for_selector('.tabs'); t=tr.inner_text('.tabs'); assert 'Presença' in t and 'Privacidade' not in t and 'Papéis' not in t, t
    assert 'Líder em treinamento' in tr.inner_text('#view')
    # líder pede transferência, supervisor aprova na Administração (supervisor não tem permissão de administração)
    l2=entra(b,'l2@zoe.com','Temp12345','NovaSenha123')
    l2.evaluate("go('celula','pres')"); l2.wait_for_selector('#pq')
    sp=entra(b,'sup@zoe.com','Temp12345','NovaSenha123'); assert 'Administração' in sp.inner_text('.nav'); sp.evaluate("go('admin')"); sp.wait_for_selector("text=Pedidos de transferência")
    assert 'Dados da igreja' not in sp.inner_text('#view')
    print('ERROS:',errs); print('E2E CARGOS OK' if not errs else 'FALHOU')
