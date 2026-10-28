import sys
from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':400,'height':820})
    pg.on('pageerror',lambda e:errs.append('PAGEERR '+str(e))); pg.on('console',lambda m:errs.append('CONSOLE '+m.text) if m.type=='error' else None)
    pg.goto(URL); pg.wait_for_selector('#lg_e')
    # login errado
    pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','errada'); pg.click('#lg_b'); pg.wait_for_selector('.chip.r')
    assert 'inválidos' in pg.inner_text('.gate')
    pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    assert 'Paz' in pg.inner_text('#view'), pg.inner_text('#view')[:200]
    pg.screenshot(path='/tmp/shot_feed.png')
    # admin: criar usuário líder e célula
    pg.evaluate("go('admin')"); pg.wait_for_selector('#nu_e')
    pg.fill('#nu_n','Digitando durante o carregamento')  # não pode ser apagado pela atualização dos dados
    pg.wait_for_selector("td:has-text('admin@zoe.com')"); assert pg.input_value('#nu_n')=='Digitando durante o carregamento'
    pg.fill('#nu_n','Lider Um'); pg.fill('#nu_e','lider@zoe.com'); pg.select_option('#nu_p','membro'); pg.fill('#nu_s','Temp12345'); pg.click("text=Criar usuário"); pg.wait_for_timeout(600)
    pg.wait_for_selector("td:has-text('lider@zoe.com')")
    pg.fill('#nc_n','Semeadores'); pg.select_option('#nc_l',label='Lider Um'); pg.fill('#nc_ci','Águas Lindas'); pg.fill('#nc_u','GO'); pg.click("text=Criar célula"); pg.wait_for_timeout(600)
    pg.evaluate("go('buscar')"); pg.wait_for_selector("h3:has-text('Semeadores')")
    # config + ministério + evento
    pg.evaluate("go('admin')"); pg.wait_for_selector('#aw'); pg.fill('#aw','+55 61 99999-0000'); pg.fill('#al','Rua A, 1'); pg.click("text=Salvar >> nth=0"); pg.wait_for_timeout(400)
    pg.fill('#am','Teatro'); pg.click("text=Adicionar >> nth=0"); pg.wait_for_timeout(500)
    pg.fill('#ev1','Culto de Natal'); pg.fill('#ev2','2026-12-24'); pg.click("text=Publicar evento"); pg.wait_for_timeout(500)
    pg.evaluate("go('ministerios')"); assert 'Teatro' in pg.inner_text('#view')
    pg.evaluate("go('eventos')"); assert 'Culto de Natal' in pg.inner_text('#view')
    # perfil salva no servidor
    pg.evaluate("go('perfil','info')"); pg.wait_for_selector('#p_nome'); pg.fill('#p_prof','Pastor'); pg.click("text=Salvar >> nth=0"); pg.wait_for_timeout(500)
    # sai e entra como líder (troca de senha obrigatória)
    pg.click("text=Abrir menu") if False else None
    with pg.expect_navigation(): pg.evaluate("sair()")
    pg.wait_for_selector('#lg_e')
    pg.fill('#lg_e','lider@zoe.com'); pg.fill('#lg_s','Temp12345'); pg.click('#lg_b'); pg.wait_for_selector('#fp_n')
    pg.fill('#fp_a','Temp12345'); pg.fill('#fp_n','NovaSenha123'); pg.fill('#fp_r','NovaSenha123'); pg.click("text=Salvar nova senha"); pg.wait_for_selector('#lg_e')
    pg.fill('#lg_e','lider@zoe.com'); pg.fill('#lg_s','NovaSenha123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1')
    nav=pg.inner_text('.nav'); assert 'Administração' not in nav, nav
    # líder: célula, novo membro, frequência
    pg.evaluate("go('celula','pres')"); pg.wait_for_selector('#pq'); pg.fill('#pq','Maria Nova'); pg.click("text=Verificar"); pg.wait_for_selector('#nn')
    pg.fill('#ne','Rua 2'); pg.fill('#nc','61988887777'); pg.click("text=Cadastrar e marcar presença"); pg.wait_for_timeout(600)
    pg.evaluate("go('celula','membros')"); pg.wait_for_selector("text=Maria Nova")
    pg.evaluate("go('celula','freq')"); pg.wait_for_selector('.pr'); pg.locator('.pr').first.check(); pg.click("text=Registrar frequência"); pg.wait_for_timeout(700)
    assert '1 de 2' in pg.inner_text('#view'), pg.inner_text('#view')[:300]
    pg.evaluate("go('celula','oracao')"); pg.fill('#ox','Peço oração pela minha família'); pg.click("text=Enviar pedido"); pg.wait_for_timeout(500)
    assert 'minha família' in pg.inner_text('#view')
    pg.evaluate("go('celula','freq')"); tabs=pg.inner_text('.tabs'); assert 'Organograma' not in tabs and 'Presença' in tabs, tabs  # organograma só para supervisores e administradores
    # tentativa de ação proibida direto na API
    r=pg.evaluate("api('createEvent',{titulo:'x',data:'2026-12-01'}).then(()=>'ok').catch(e=>e.code)"); assert r=='FORBIDDEN', r
    pg.evaluate("go('celula','mural')"); pg.wait_for_selector('#board'); pg.screenshot(path='/tmp/shot_mural.png')
    b.close()
print('ERROS DE CONSOLE:',errs if errs else 'nenhum'); print('E2E OK')
