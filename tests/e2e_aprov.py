# Central de Aprovações: pop-up, desfazer com barra de tempo, reverter pelo log, membresia por frequência, ministérios, acesso e uso
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None):
    pg=b.new_page(viewport={'width':1100,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b')
    pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    # regra configurável pelo painel
    adm.evaluate("go('admin')"); adm.wait_for_selector('#afm'); adm.fill('#afm','2'); adm.click('text=Salvar regra'); adm.wait_for_selector('text=Regra salva: 2 células')
    adm.evaluate("async()=>{for(const [n,e] of [['Sup Um','sup@zoe.com'],['Lider Um','l1@zoe.com'],['Ana Souza','ana@zoe.com']])await api('createUser',{nome:n,email:e,senha:'Temp12345',papel:'membro'})}")
    ids=adm.evaluate("async()=>Object.fromEntries((await api('listUsers')).map(u=>[u.email,u.membroId]))")
    adm.evaluate("async(i)=>{await api('createCell',{nome:'Semeadores',liderId:i['l1@zoe.com'],supervisorId:i['sup@zoe.com'],dia:'Quinta'})}",ids)
    l1=entra(b,'l1@zoe.com','Temp12345','NovaSenha123'); 
    l1.evaluate("async()=>{const v=(await api('addNewMember',{nome:'Visitante Silva',celular:'61999990000'})).id;await api('saveAttendance',{data:'2026-10-15',presentes:[v]});await api('saveAttendance',{data:'2026-10-22',presentes:[v]})}")
    # supervisor: pop-up no login, clica e vai para Aprovações
    sp=entra(b,'sup@zoe.com','Temp12345','NovaSenha123'); sp.wait_for_selector('.popA'); assert 'Visitante Silva pode se tornar membro' in sp.inner_text('.popA')
    assert sp.inner_text('#bb').strip()!='' ; sp.click('.popA'); sp.wait_for_selector('text=Revisar cadastro')
    sp.click('text=Revisar cadastro'); sp.wait_for_selector("text=61999990000"); sp.click(".modal >> text=Aprovar como membro"); sp.wait_for_selector('.ubar'); sp.screenshot(path=OUT+'/s_undo.png')
    # desfaz dentro do tempo
    sp.click('.ubar >> text=Desfazer'); sp.wait_for_selector('text=Decisão desfeita'); sp.wait_for_selector("button:has-text('Aprovar como membro')")
    # aprova de novo e deixa o tempo acabar; depois reverte pelo log
    sp.click("button:has-text('Aprovar como membro')"); sp.wait_for_selector('.ubar'); sp.wait_for_selector('.ubar',state='detached',timeout=15000)
    sp.click("button:has-text('Histórico geral')"); sp.wait_for_selector('text=Aprovado por'); sp.click('text=Reverter decisão'); sp.click(".modal >> text=Sim, reverter"); sp.wait_for_selector('text=Decisão desfeita')
    sp.click("button:has-text('Pendentes')"); sp.click("button:has-text('Recusar')"); sp.wait_for_selector('.ubar')
    sp.click("button:has-text('Minhas decisões')"); sp.wait_for_selector('text=Recusado por'); sp.screenshot(path=OUT+'/s_aprov.png')
    # interesse em ministério: aprovado pelo administrador aparece no roadmap do membro
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); mid=ana.evaluate("S.minIds[0]")
    ana.evaluate("async(m)=>{await api('interest',{ministerioId:m})}",mid)
    adm=entra(b,'admin@zoe.com','SenhaForte123'); adm.evaluate("go('aprovacoes')"); adm.wait_for_selector('text=quer participar do ministério'); adm.click("button:has-text('Aprovar') >> nth=0"); adm.wait_for_selector('.ubar')
    ana=entra(b,'ana@zoe.com','NovaSenha123'); r=ana.evaluate("roadmap().map(x=>x[2]).join(' | ')"); assert 'Aprovado para participar do ministério' in r, r
    # uso da plataforma e edição de senha/acesso
    ana.evaluate("trkFlush()"); adm.evaluate("go('admin')"); adm.wait_for_selector('text=Uso da plataforma'); adm.evaluate("carregaUso(TODAY.slice(0,7))"); adm.wait_for_selector("td:has-text('Ana Souza')")
    adm.locator('#view').get_by_text('Uso da plataforma').scroll_into_view_if_needed(); adm.locator('.card:has(h3:has-text("Uso da plataforma"))').screenshot(path=OUT+'/s_uso.png')
    adm.click("tr:has-text('ana@zoe.com') >> text=Editar acesso e senha"); adm.fill('#eu_w','OutraSenha777'); adm.click(".modal >> text=Salvar"); adm.wait_for_selector('text=Acesso e senha atualizados')
    entra(b,'ana@zoe.com','OutraSenha777','TerceiraSenha1')
    print('ERROS:',errs); print('E2E APROV OK' if not errs else 'FALHOU')
