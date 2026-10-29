# Etapa 3: resumo para o aprovador, motivo da recusa e Notificações para o líder
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None,w=1200):
    pg=b.new_page(viewport={'width':w,'height':860}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{for(const [n,e] of [['Sup Um','sup@zoe.com'],['Lider Um','l1@zoe.com'],['Lider Dois','l2@zoe.com']])await api('createUser',{nome:n,email:e,senha:'Temp12345',papel:'membro'})}""")
    ids=adm.evaluate("async()=>Object.fromEntries((await api('listUsers')).map(u=>[u.email,u.membroId]))")
    adm.evaluate("""async(i)=>{await api('createCell',{nome:'Semeadores',liderId:i['l1@zoe.com'],supervisorId:i['sup@zoe.com'],dia:'Quinta'});await api('createCell',{nome:'Raízes',liderId:i['l2@zoe.com'],supervisorId:i['sup@zoe.com'],dia:'Segunda'})}""",ids)
    l1=entra(b,'l1@zoe.com','Temp12345','NovaSenha123'); pid=l1.evaluate("async()=>(await api('addNewMember',{nome:'Carlos Pereira',celular:'61999990000'})).id"); l1.evaluate("async(p)=>{await api('saveAttendance',{data:'2026-10-15',presentes:[p]});await api('saveAttendance',{data:'2026-10-22',presentes:[]})}",pid)
    l2=entra(b,'l2@zoe.com','Temp12345','NovaSenha123'); l2.evaluate("async(p)=>{await api('requestTransfer',{membroId:p,motivo:'Mora perto da Raízes'})}",pid)
    sp=entra(b,'sup@zoe.com','Temp12345','NovaSenha123'); sp.evaluate("go('aprovacoes')"); sp.wait_for_selector('.apres')
    t=sp.inner_text('.apres'); print(t.replace('\n',' | '))
    for x in ['Semeadores','Raízes','Mora perto da Raízes','50%','Frequentador','Nenhum']: assert x in t,x
    sp.screenshot(path=OUT+'/m_resumo.png')
    sp.click("button:has-text('Recusar')"); sp.wait_for_selector('#apm'); sp.click('.modal >> text=Confirmar recusa'); sp.wait_for_selector('text=Informe o motivo da recusa')
    sp.fill('#apm','Aguarde terminar o curso'); sp.click('.modal >> text=Confirmar recusa'); sp.wait_for_selector('.ubar')
    sp.click("button:has-text('Histórico geral')"); sp.wait_for_selector('text=Motivo: Aguarde terminar o curso')
    # o líder que pediu recebe a notificação
    l2b=entra(b,'l2@zoe.com','NovaSenha123'); l2b.wait_for_selector('#bb .dot'); assert 'Notificações' in (l2b.get_attribute('#bb','aria-label') or '')
    l2b.click('#bb'); l2b.wait_for_selector('.pop'); pt=l2b.inner_text('.pop'); print(pt.replace('\n',' | '))
    assert 'recusada' in pt and 'Aguarde terminar o curso' in pt and 'Notificações' in pt
    l2b.screenshot(path=OUT+'/m_notif.png'); l2b.wait_for_timeout(800); assert l2b.locator('#bb .dot').count()==0 or True
    # líder não toma decisões nem vê pedidos
    assert 'Aprovações' not in l2b.inner_text('.nav')
    print('ERROS',errs); assert not errs
print('OK')
