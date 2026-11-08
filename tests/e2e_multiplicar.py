from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':1200,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1200)
    pg.evaluate("""async()=>{const mk=async n=>(await api('createUser',{email:n+'@zoe.com',nome:n[0].toUpperCase()+n.slice(1)+' Teste',senha:'Temp12345',papel:'membro'})).membroId;
      const lider=await mk('lider'),trein=await mk('trein'),sup=await mk('sup');
      const c=await api('createCell',{nome:'Célula Norte',liderId:lider,treinamentoId:trein,supervisorId:sup,dia:'Quarta',inicio:'20:00'});
      for(let i=0;i<6;i++)await api('addNewMember',{celulaId:c.id,nome:'Pessoa '+i})}""")
    pg.click('.nv:has-text("Administração")'); pg.wait_for_selector('.admtabs'); pg.evaluate("admGrupo('cel')"); pg.wait_for_selector("h3:has-text('Painel de células')"); pg.wait_for_selector('.cp-c')
    assert 'Célula Norte' in pg.inner_text('#cp_l')
    pg.fill('#cp_lim','3'); pg.click("button:has-text('Salvar') >> nth=0"); pg.wait_for_timeout(900)
    pg.click('.cp-c >> nth=0'); pg.wait_for_selector("h2:has-text('Célula Norte')"); assert pg.is_visible("button:has-text('Multiplicar esta célula')")
    pg.click("button:has-text('Multiplicar esta célula')"); pg.wait_for_selector("h2:has-text('Multiplicar')")
    pg.fill('#cm_n','Célula Sul'); pg.click("button:has-text('Líder em treinamento vai para a nova')"); pg.click("button:has-text('Mandar metade')")
    assert 'vão' in pg.inner_text('.modal') and 'ficam' in pg.inner_text('.modal')
    pg.click(".modal button:text-is('Multiplicar')"); pg.wait_for_timeout(1500)
    pg.wait_for_selector(".cp-c:has-text('Célula Sul')"); assert 'filha de Célula Norte' in pg.inner_text('#cp_l')
    print('ERROS:',errs); assert not errs; print('E2E MULTIPLICAR OK')
