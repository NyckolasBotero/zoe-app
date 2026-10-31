# Chamada da célula: o marcado não some ao tirar a foto; foto vai para o mural; visitantes; nota de presença de Deus por pessoa
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None):
    pg=b.new_page(viewport={'width':1200,'height':1000}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); pg.evaluate("api('guideDone')"); pg.add_style_tag(content='#pushbar{display:none!important}'); return pg
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{const l=await api('createUser',{email:'lid@zoe.com',nome:'Lider Norte',senha:'Temp12345',papel:'membro'});const c=await api('createCell',{nome:'Célula Norte',liderId:l.membroId,dia:'Quinta'});const c2=await api('createCell',{nome:'Célula Sul'});
      await api('createUser',{email:'ana@zoe.com',nome:'Ana Souza',senha:'Temp12345',papel:'membro',celulaId:c.id});await api('createUser',{email:'bia@zoe.com',nome:'Bia Lima',senha:'Temp12345',papel:'membro',celulaId:c.id});await api('createUser',{email:'otavio@zoe.com',nome:'Otavio Outra',senha:'Temp12345',papel:'membro',celulaId:c2.id})}""")
    lid=entra(b,'lid@zoe.com','Temp12345','NovaSenha123')
    lid.click('.nv[aria-label="Células"]'); lid.wait_for_selector('#fdata'); lid.evaluate("R.sub.celula='freq';render()"); lid.wait_for_selector('.pr')
    lid.locator('.pr').first.check(); lid.fill('#fobs','Foi uma noite abençoada'); lid.evaluate("document.querySelector('#term').value=60;R.fr.term=60;termoUpd(60)")
    # foto: antes sumia a chamada
    lid.set_input_files('#fj input[type=file]','/tmp/foto_teste.png'); lid.wait_for_selector('#fj img.sp-ft',timeout=8000)
    assert lid.locator('.pr').first.is_checked(), 'a chamada não pode sumir depois da foto'
    assert lid.input_value('#fobs')=='Foi uma noite abençoada' and lid.input_value('#term')=='60', 'resumo e termômetro precisam ficar'
    # visitante de outra célula e visitante novo
    lid.fill('#fvq','Otavio'); lid.wait_for_selector('#fvr:has-text("Da célula Célula Sul")',timeout=8000); lid.click('#fvr button:has-text("Só visitando hoje")')
    lid.wait_for_selector('#fv:has-text("Visitante da célula Célula Sul")')
    lid.fill('#fvq','Pedro Novo'); lid.click('#fv button:has-text("Verificar")'); lid.click('#fvr button:has-text("Cadastrar como visitante novo")'); lid.wait_for_selector('#fv:has-text("Visitante novo (pré-cadastro)")')
    assert lid.locator('.pr').first.is_checked()
    lid.evaluate("fdChange(TODAY,true)"); lid.click('button:has-text("Registrar frequência")')
    try: lid.wait_for_selector('button:has-text("Confirmar: foi nesse dia")',timeout=2500); lid.click('button:has-text("Confirmar: foi nesse dia")')
    except Exception: pass
    lid.wait_for_selector('.toast:has-text("Frequência")',timeout=10000); t=lid.inner_text('.toast'); assert '2 visitante' in t and 'mural' in t, t
    assert lid.evaluate("S.muralItems.some(i=>i.img&&/Célula/.test(i.l))"), 'foto no mural'
    lid.wait_for_selector('summary'); lid.locator('summary').first.click(); h=lid.inner_text('#view'); assert 'Pedro Novo (novo)' in h and 'Otavio' in h and 'Célula Sul' in h and 'só a nota do líder' in h, h[:700]
    # a membra vota
    ana=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); ana.click('.nv[aria-label="Células"]'); ana.wait_for_selector('#vtc',timeout=10000)
    ana.evaluate("votoUpd(100);document.querySelector('#vtr').value=100"); ana.click('#vtc button:has-text("Enviar meu voto")'); ana.wait_for_selector('.toast:has-text("Média da célula: 80%")',timeout=8000)
    lid.evaluate("S.voto=undefined;refreshCell().then(()=>render())"); lid.wait_for_function("S.historico[0]&&S.historico[0].nv===1",timeout=8000)
    lid.wait_for_selector('summary'); lid.locator('summary').first.click(); assert 'líder 60% e 1 voto' in lid.inner_text('#view')
    # mural compartilhado: a foto da chamada já está lá; o lápis muda o nome
    lid.evaluate("R.sub.celula='mural';MU.t=0;render()"); lid.wait_for_selector('.polar',timeout=10000); lid.wait_for_function("S.muralItems.some(i=>i.srv&&/Célula/.test(i.l))",timeout=8000)
    lid.click('button:has-text("Mover e ajustar")'); lid.wait_for_selector('.polar .ed'); lid.locator('.polar .ed').first.dispatch_event('pointerdown'); lid.wait_for_selector('#ml_t'); lid.fill('#ml_t','Noite de louvor'); lid.click('button:has-text("Salvar nome")')
    lid.wait_for_function("document.querySelector('.polar .lb').textContent==='Noite de louvor'",timeout=8000); lid.wait_for_timeout(900)
    assert lid.evaluate("api('getCellMural',{}).then(r=>r.itens.some(i=>i.l==='Noite de louvor'&&i.img))"), 'nome gravado para a célula'
    ana.evaluate("R.sub.celula='mural';MU.t=0;render()"); ana.wait_for_function("document.querySelector('.polar .lb')&&document.querySelector('.polar .lb').textContent==='Noite de louvor'",timeout=10000)
    # qualquer pessoa vê o mural pelo perfil da célula
    cid=lid.evaluate("S.celulaId"); adm.evaluate(f"celCard('{cid}')"); adm.wait_for_selector('#cc_mural .polar .lb:has-text("Noite de louvor")',timeout=10000)
    ou=entra(b,'otavio@zoe.com','Temp12345','NovaSenha123'); ou.evaluate(f"celCard('{cid}')"); ou.wait_for_selector('#cc_mural .polar',timeout=10000); assert not ou.query_selector('button:has-text("Editar célula")')
    cid=lid.evaluate("S.celulaId"); adm.evaluate(f"celCard('{cid}')"); adm.wait_for_selector('#cc_mural .polar',timeout=10000); assert 'Noite de louvor' in adm.inner_text('#cc_mural')
    lid.screenshot(path=OUT+'/chamada.png',full_page=True)
    print('ERROS',errs); assert not errs
print('OK chamada')
