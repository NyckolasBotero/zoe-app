from playwright.sync_api import sync_playwright
URL='http://localhost:8799/'; errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={'width':420,'height':900})
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(URL); pg.wait_for_selector('#lg_e'); pg.fill('#lg_e','admin@zoe.com'); pg.fill('#lg_s','SenhaForte123'); pg.click('#lg_b'); pg.wait_for_selector('#view h1'); pg.wait_for_timeout(1200)
    r=pg.evaluate("""async()=>{
      await api('saveLesson',{titulo:'Parábola do Semeador',resumo:'Os tipos de coração',conteudo:'O semeador saiu a semear e parte da semente caiu à beira do caminho. Jesus explicou que a semente é a palavra de Deus anunciada. O coração endurecido não permite que a palavra produza frutos. A terra boa representa quem ouve a palavra e persevera com paciência.'});
      for(const t of ['Paz de Cristo','A armadura de Deus','Fé e obras']) await api('saveLesson',{titulo:t,resumo:'x'});
      const ls=await api('listLessons');const lic=ls.find(l=>l.titulo==='Parábola do Semeador').id;
      const c=await api('createCell',{nome:'Célula Teste',liderId:S.membroId,dia:'Quarta'});
      await api('saveMember',{celulaId:c.id}).catch(()=>0);
      const hoje=new Date(Date.now()-864e5*2).toISOString().slice(0,10);
      await api('saveAttendance',{celulaId:c.id,data:hoje,presentes:[],licaoId:lic,confirmaDia:true});
      return c.id}""")
    pg.evaluate(f"S.celId='{r}';save&&save();hydrate().then(()=>{{shell();go('celula','hist')}})"); pg.wait_for_timeout(2500)
    pg.evaluate("QZ.ld=null;go('celula','hist')"); pg.wait_for_selector("h2:has-text('Quiz das lições')",timeout=8000)
    assert 'Parábola do Semeador' in pg.inner_text('#view')
    # abre o quiz como participante pela API de membro (admin lidera mas pode não estar na célula): usa o líder
    # janela do quiz do participante (api simulada)
    pg.evaluate("""()=>{const o=window.api;window.__o=o;let feito=false;window.api=async(a,d)=>{if(a==='getQuiz'||a==='answerQuiz'){const ps=[{p:'Qual o tema?',op:['A','B','C','D'],c:1,e:'Porque sim'},{p:'Segunda?',op:['a','b','c','d'],c:2,e:'ok'}];if(a==='answerQuiz')feito=true;return{id:'Q1',titulo:'Parábola do Semeador',data:'2026-11-05',fonte:'ia',feito,acertos:feito?1:0,perguntas:ps.map((x,i)=>feito?Object.assign({},x,{r:[1,0][i]}):{p:x.p,op:x.op})}}return o(a,d)};quizAbre('Q1')}""")
    pg.wait_for_selector('.modal button.opc'); pg.click('.modal button.opc >> nth=1'); pg.click('.modal button:has-text("Enviar respostas")'); pg.wait_for_timeout(300)
    assert 'Responda todas' in pg.inner_text('body') or pg.is_visible('.toast.err')
    pg.click('.modal .card >> nth=0 >> button >> nth=1'); pg.click('.modal .card >> nth=1 >> button >> nth=2'); pg.click('.modal button:has-text("Enviar respostas")'); pg.wait_for_selector('.modal :text("Você acertou")')
    assert '1 de 2' in pg.inner_text('.modal') and 'Porque sim' in pg.inner_text('.modal')
    print('ERROS:',errs); assert not errs; print('E2E QUIZ LIDER OK')
