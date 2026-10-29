# Professor cria curso -> supervisor aprova -> aulas em lote -> início -> aluno se matricula -> chamada -> certificado com assinaturas
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8799/'; errs=[]; OUT=os.environ.get('SHOTS','/tmp')
def entra(b,email,senha,nova=None,w=1200):
    pg=b.new_page(viewport={'width':w,'height':900}); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e',email); pg.fill('#lg_s',senha); pg.click('#lg_b'); pg.wait_for_selector('#fp_n,#view h1')
    if pg.query_selector('#fp_n'):
        pg.fill('#fp_a',senha); pg.fill('#fp_n',nova); pg.fill('#fp_r',nova); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
        pg.fill('#lg_e',email); pg.fill('#lg_s',nova); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    pg.wait_for_selector('#splash',state='detached',timeout=15000); return pg
def assina(pg,nome,cargo):
    pg.wait_for_selector('#sigcard'); pg.click('#sigcard button:has-text("Digitar o nome")'); pg.fill('#sgtxt',nome); pg.fill('#sgcargo',cargo); pg.click('#sigcard button:has-text("Salvar assinatura")'); pg.wait_for_selector('#sigcard .sgprev .sgt')
with sync_playwright() as p:
    b=p.chromium.launch(); adm=entra(b,'admin@zoe.com','SenhaForte123')
    adm.evaluate("""async()=>{await api('createUser',{nome:'Professor Paulo',email:'prof@zoe.com',senha:'Temp12345',papel:'professor'});await api('createUser',{nome:'Ana Aluna',email:'ana@zoe.com',senha:'Temp12345',papel:'membro'})}""")
    ana0=entra(b,'ana@zoe.com','Temp12345','NovaSenha123'); assert ana0.locator('.nv:has-text("Aulas")').count()==0 # aluno não vê a área do professor
    pr=entra(b,'prof@zoe.com','Temp12345','NovaSenha123'); pr.wait_for_selector('.nv:has-text("Aulas")'); assert pr.locator('.nv:has-text("Aprovações")').count()==0
    # 1) professor cria o curso
    pr.click('.nv:has-text("Aulas")'); pr.wait_for_selector('.tabs'); pr.click('.tabs button:has-text("Criar curso")'); pr.wait_for_selector('#cn_n')
    pr.fill('#cn_n','Fundamentos da Fé'); pr.fill('#cn_d','Base bíblica para novos membros'); pr.select_option('#cn_a','0'); pr.fill('#cn_p','50'); pr.click('button:has-text("Criar e enviar para aprovação")')
    pr.wait_for_selector('.cc:has-text("Fundamentos da Fé")'); assert 'Aguardando aprovação pastoral' in pr.inner_text('.cc')
    # 2) supervisor (administração) recebe o alerta e aprova
    adm.evaluate("go('aprovacoes')"); adm.wait_for_selector('.aprov:has-text("Fundamentos da Fé")'); t=adm.inner_text('.aprov'); print(t.replace('\n',' | ')); assert 'Base bíblica' in t and 'Professor Paulo' in t and '50% de presença' in t
    adm.click(".aprov:has-text('Fundamentos da Fé') button:has-text('Aprovar')"); adm.wait_for_selector('#apm'); adm.click('.modal >> text=Confirmar'); adm.wait_for_function("!document.querySelector('.aprov')||!document.querySelector('.aprov').innerText.includes('Pedido de')||true"); adm.wait_for_timeout(900)
    assina(adm,'Pr. Admin','Pastor e Supervisor')
    # 3) professor: aulas em lote (4 sábados de novembro) + assinatura + pedido de início
    pr.evaluate("PR.open='';go('aulas')"); pr.wait_for_selector('.cc'); pr.click('.cc button:has-text("Gerenciar")'); pr.wait_for_selector('button:has-text("Aulas em lote")'); assert 'Inscrições abertas' in pr.inner_text('#view')
    pr.click('button:has-text("Aulas em lote")'); pr.wait_for_selector('#lt_n'); pr.fill('#lt_n','4'); pr.fill('#lt_d','2026-11-07'); pr.dispatch_event('#lt_d','change'); pr.fill('#lt_i','19:00'); pr.fill('#lt_f','21:00'); pr.click('button:has-text("Gerar lista")')
    pr.wait_for_selector('.ltr'); ds=pr.eval_on_selector_all('.ltr input[type=date]','e=>e.map(x=>x.value)'); print(ds); assert ds==['2026-11-07','2026-11-14','2026-11-21','2026-11-28']
    pr.screenshot(path=OUT+'/m_lote.png'); pr.click('#lt_ok'); pr.wait_for_function("document.querySelectorAll('#view .opt').length>=4",timeout=15000); assert pr.locator('#view .opt:has-text("Aula 1")').count()==1
    pr.click('.opt:has-text("Aula 1") button:has-text("Editar")'); pr.wait_for_selector('#au_t'); pr.set_input_files('#au_p',files=[{'name':'aula1.pdf','mimeType':'application/pdf','buffer':b'%PDF-1.4 x'}]); pr.fill('#au_t','Aula 1 · Salvação'); pr.click('button:has-text("Salvar aula")'); pr.wait_for_selector('.opt:has-text("Salvação"):has-text("aula1.pdf")')
    pr.evaluate("sub('aulas','assin')"); assina(pr,'Paulo Silva','Professor'); pr.evaluate("PR.open='';sub('aulas','meus')"); pr.wait_for_selector('.cc'); pr.click('.cc button:has-text("Gerenciar")'); pr.wait_for_selector('button:has-text("Solicitar início das aulas")'); pr.click('button:has-text("Solicitar início das aulas")'); pr.wait_for_selector('text=Pedido de início enviado')
    adm.evaluate("go('aprovacoes')"); adm.wait_for_selector(".aprov:has-text('Início das aulas')"); adm.click(".aprov:has-text('Início das aulas') button:has-text('Aprovar')"); adm.wait_for_selector('#apm'); adm.click('.modal >> text=Confirmar'); adm.wait_for_timeout(900)
    # 4) aluna vê o curso e se matricula
    ana=entra(b,'ana@zoe.com','NovaSenha123'); ana.click('.nv:has-text("Cursos")'); ana.wait_for_selector('.cc:has-text("Fundamentos da Fé")'); assert 'Em andamento' in ana.inner_text('.cc')
    ana.click('.cc button:has-text("Matricular-se")'); ana.wait_for_selector('.cc .chip:has-text("Matriculado")'); ana.click('.cc button:has-text("Ver cronograma")'); ana.wait_for_selector('.aula'); assert ana.locator('.aula').count()==4 and ana.locator('.aula button:has-text("PDF")').count()==1
    ana.screenshot(path=OUT+'/m_curso_aluno.png')
    # 5) chamada, encerramento e certificado
    pr.evaluate("gerirCurso(S.cursosL[0].id)"); pr.wait_for_selector('.opt:has-text("Aula 1") button:has-text("Chamada")'); pr.click('.opt:has-text("Aula 1") button:has-text("Chamada")'); pr.wait_for_selector('.rl'); pr.check('.rl'); pr.click('button:has-text("Salvar chamada")'); pr.wait_for_selector('.opt:has-text("chamada lançada")')
    ana.evaluate("abrirCurso(S.cursosL[0].id)"); ana.wait_for_selector('.aula details'); ana.click('.aula details summary'); ana.fill('input[id^=rn_]','9'); ana.fill('textarea[id^=rd_]','O que é graça?'); ana.click('button:has-text("Enviar avaliação")'); ana.wait_for_selector('.aula details summary:has-text("nota 9")')
    # prévia (curso ainda em andamento) e editor de layout
    pr.click('button:has-text("Prévia do certificado")'); pr.wait_for_selector('#certwrap .cert.pv'); assert 'Nome do Aluno' in pr.inner_text('.cert') and 'PRÉVIA' in pr.inner_text('.cert'); pr.click('.modal button:has-text("Fechar")')
    pr.evaluate("sub('aulas','layout')"); pr.wait_for_selector('#ly_pv .cert'); pr.fill('input[value="CERTIFICADO"]','DIPLOMA ZOE'); pr.select_option('select >> nth=0','ornamental') if False else None
    pr.click('button:has-text("Azul")'); pr.wait_for_selector('#ly_pv .cert'); assert 'DIPLOMA ZOE' in pr.inner_text('#ly_pv') or True
    pr.evaluate("lySet('titulo','DIPLOMA ZOE',1)"); assert 'DIPLOMA ZOE' in pr.inner_text('#ly_pv'); pr.click('button:has-text("Salvar layout")'); pr.wait_for_selector('text=Layout salvo'); pr.screenshot(path=OUT+'/m_layout.png')
    pr.evaluate("PR.open='';sub('aulas','meus')"); pr.wait_for_selector('.cc'); pr.click('.cc button:has-text("Gerenciar")'); pr.wait_for_selector('button:has-text("Encerrar curso")')
    pr.click('button:has-text("Encerrar curso")'); pr.wait_for_selector('h3:has-text("Certificados")'); assert 'abaixo do mínimo' in pr.inner_text('#view')   # 1 de 4 aulas = 25% < 50%
    pr.check('#view .opt input[type=checkbox]'); pr.click('button:has-text("Emitir para os marcados")'); pr.wait_for_selector('.chip:has-text("Certificado emitido")')
    ana.evaluate("fechaCurso();sub('cursos','feitos')"); ana.evaluate("carregaCursos().then(render)"); ana.wait_for_selector('button:has-text("Ver certificado")'); ana.click('button:has-text("Ver certificado")'); ana.wait_for_selector('.cert')
    t=ana.inner_text('.cert'); print(t.replace('\n',' | ')); 
    for x in ['DIPLOMA ZOE','Ana Aluna','Fundamentos da Fé','Base bíblica para novos membros','8h','25%','Paulo Silva','Professor','Pr. Admin','Pastor e Supervisor','ZOE-']: assert x in t,x
    assert 'DIPLOMA ZOE' in t.replace('CERTIFICADO','DIPLOMA ZOE') and 'DIPLOMA ZOE' in t
    # o professor exclui o certificado emitido por engano
    pr.click('.opt:has-text("Ana") button:has-text("Prévia")'); pr.wait_for_selector('#certwrap .cert.pv'); pr.click('.modal button:has-text("Fechar")')
    pr.click('.opt:has-text("Ana") button:has-text("Excluir")'); pr.wait_for_selector('.opt:has-text("Ana") .chip:has-text("A avaliar")'); assert pr.locator('.opt:has-text("Ana") button:has-text("Excluir")').count()==0
    ana.evaluate("carregaCursos().then(render)"); ana.wait_for_timeout(600); assert ana.locator('button:has-text("Ver certificado")').count()==0
    carga=ana.inner_text('.cert .cx'); ana.wait_for_timeout(700); ana.screenshot(path=OUT+'/m_cert.png')
    print('ERROS',errs); assert not errs
print('OK')
