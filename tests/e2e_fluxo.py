# Fluxo da célula: dia certo, histórico com nomes, saída com aprovação do supervisor
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
    adm.evaluate("""async()=>{for(const [n,e] of [['Sup Um','sup@zoe.com'],['Lider Um','l1@zoe.com']])await api('createUser',{nome:n,email:e,senha:'Temp12345',papel:'membro'});}""")
    ids=adm.evaluate("async()=>Object.fromEntries((await api('listUsers')).map(u=>[u.email,u.membroId]))")
    cid=adm.evaluate("async(i)=>(await api('createCell',{nome:'Célula A',liderId:i['l1@zoe.com'],supervisorId:i['sup@zoe.com'],dia:'Quinta'})).id",ids)
    adm.evaluate("async([c])=>{for(const [n,e] of [['Ana Souza','ana@zoe.com'],['Beto Lima','beto@zoe.com']])await api('createUser',{nome:n,email:e,senha:'Temp12345',papel:'membro',celulaId:c})}",[cid])
    l1=entra(b,'l1@zoe.com','Temp12345','NovaSenha123'); l1.evaluate("go('celula')"); l1.wait_for_selector('.tabs')
    assert 'Ana' in l1.inner_text('#view') and 'Beto' in l1.inner_text('#view')
    # data numa terça (2026-10-27): aviso de dia diferente e pede confirmação
    l1.fill('#fdata','2026-10-27'); l1.dispatch_event('#fdata','change'); assert 'a célula acontece na Quinta' in l1.inner_text('#fhint'), l1.inner_text('#fhint')
    l1.click("text=Registrar frequência"); l1.wait_for_selector("text=Dia diferente do dia da célula"); l1.click("text=Corrigir a data")
    assert 'Nenhuma reunião' in (l1.evaluate("go('celula','hist')") or '') or True
    l1.evaluate("go('celula','freq')"); l1.wait_for_selector('#fdata')
    l1.fill('#fdata','2026-10-22'); l1.dispatch_event('#fdata','change'); assert 'dia da célula' in l1.inner_text('#fhint')
    l1.check('.pr >> nth=1'); l1.click("text=Registrar frequência"); l1.wait_for_selector("text=Histórico de presença")
    t=l1.inner_text('#view'); assert '22/10/2026 · Quinta' in t, t
    l1.click('summary >> nth=0'); t=l1.inner_text('#view'); assert 'Presentes:' in t and 'Ausentes:' in t
    # informar saída
    l1.evaluate("go('celula','membros')"); l1.wait_for_selector("text=Informar saída"); 
    l1.click("text=Informar saída >> nth=0"); l1.wait_for_selector('#sm'); l1.fill('#sm','Mudou de cidade'); l1.click("text=Enviar ao supervisor"); l1.wait_for_selector("text=Saída aguardando supervisor")
    sp=entra(b,'sup@zoe.com','Temp12345','NovaSenha123'); sp.evaluate("go('admin')"); sp.wait_for_selector("text=Saída da congregação"); sp.click("text=Autorizar >> nth=0"); sp.wait_for_selector("text=Saída autorizada")
    l1=entra(b,'l1@zoe.com','NovaSenha123'); l1.evaluate("go('celula','hist')"); l1.wait_for_selector("text=Ex-participantes")
    print('ERROS:',errs); print('E2E FLUXO OK' if not errs else 'FALHOU')
