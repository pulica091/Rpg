/* =======================================================================
   ficha.js — só é usado em ficha.html
   Depende de roster-data.js e auth.js (ordem de <script> importa).
   ======================================================================= */

document.addEventListener('DOMContentLoaded', async () => {

  // Primeiro de tudo: puxa o retrato do estado (conta, personagens,
  // fichas e rolagens). Com o banco ligado isso vem do servidor; sem
  // banco, do espelho local. Só depois a tela é desenhada.
  await Auth.carregar();

  const el = (id) => document.getElementById(id);

  const authSection = el('authSection');
  const appSection  = el('appSection');

  let editingId = null; // id do personagem cuja ficha está aberta pra edição agora

  /* ---------- Alternância login / cadastro (abas) ---------------------- */
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      const isLogin = tab.dataset.tab === 'login';
      el('formLogin').style.display = isLogin ? 'block' : 'none';
      el('formCadastro').style.display = isLogin ? 'none' : 'block';
    });
  });

  el('formLogin').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await Auth.login(el('loginUsuario').value, el('loginSenha').value);
    el('loginMsg').textContent = r.ok ? '' : r.erro;
    el('loginMsg').className = 'auth-msg' + (r.ok ? '' : ' is-error');
    if (r.ok) { el('formLogin').reset(); refreshAll(); }
  });

  el('formCadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await Auth.registrar(el('cadUsuario').value, el('cadSenha').value);
    el('cadMsg').textContent = r.ok ? '' : r.erro;
    el('cadMsg').className = 'auth-msg' + (r.ok ? '' : ' is-error');
    if (r.ok) { el('formCadastro').reset(); refreshAll(); }
  });

  /* ---------- Menu da conta (gaveta lateral) ---------------------------- */
  const drawer = el('accDrawer');
  const overlay = el('accOverlay');

  function abrirMenu() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function fecharMenu() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }
  el('btnAbrirMenu').addEventListener('click', abrirMenu);
  el('btnFecharMenu').addEventListener('click', fecharMenu);
  overlay.addEventListener('click', fecharMenu);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });

  el('btnSair').addEventListener('click', async () => {
    await Auth.logout();
    fecharMenu();
    editingId = null;
    refreshAll();
  });

  /* ---------- Vincular personagem ---------------------------------------- */
  el('btnVincular').addEventListener('click', async () => {
    const id = el('selectVincular').value;
    if (!id) return;
    const r = await Auth.vincular(id);
    el('vincularMsg').textContent = r.ok ? '' : r.erro;
    el('vincularMsg').className = 'auth-msg' + (r.ok ? '' : ' is-error');
    if (r.ok) renderTudoLogado();
  });

  /* ---------- Cadastrar personagem novo ----------------------------------- */
  el('btnMostrarCadastro').addEventListener('click', () => {
    const form = el('formNovoPersonagem');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  el('formNovoPersonagem').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await Roster.cadastrarNovo(el('novoNome').value, el('novaImg').value);
    el('novoMsg').textContent = r.ok ? `"${r.personagem.nome}" cadastrado! Já pode vincular acima.` : r.erro;
    el('novoMsg').className = 'auth-msg' + (r.ok ? '' : ' is-error');
    if (r.ok) {
      el('formNovoPersonagem').reset();
      renderTudoLogado();
    }
  });

  /* ---------- Grade de personagens (seleção de quem está jogando) -------- */
  function renderCharGrid() {
    const grid = el('charGrid');
    const empty = el('charGridEmpty');
    const meus = Auth.meusPersonagens();
    const ativos = Auth.ativos();

    grid.querySelectorAll('.char-card').forEach(c => c.remove());
    empty.style.display = meus.length ? 'none' : 'block';

    meus.forEach(p => {
      const card = document.createElement('div');
      card.className = 'char-card' + (ativos.includes(p.id) ? ' is-active' : '');

      const avatarBtn = document.createElement('button');
      avatarBtn.type = 'button';
      avatarBtn.className = 'char-avatar';
      avatarBtn.setAttribute('aria-label', `Marcar ${p.nome} como jogando agora`);
      avatarBtn.appendChild(Roster.avatar(p));
      avatarBtn.addEventListener('click', async () => {
        await Auth.alternarAtivo(p.id);
        renderCharGrid();
      });

      const nome = document.createElement('p');
      nome.className = 'char-name';
      nome.textContent = p.nome;

      const tag = document.createElement('span');
      tag.className = 'char-tag';
      tag.textContent = ativos.includes(p.id) ? '✓ Jogando agora' : 'Toque na foto pra jogar';

      const btnEditar = document.createElement('button');
      btnEditar.type = 'button';
      btnEditar.className = 'btn char-edit-btn';
      btnEditar.textContent = 'Editar ficha';
      btnEditar.addEventListener('click', () => abrirFicha(p.id));

      const btnResultados = document.createElement('a');
      btnResultados.className = 'btn char-edit-btn char-edit-btn--fraco';
      btnResultados.href = 'resultados.html?personagem=' + encodeURIComponent(p.id);
      btnResultados.textContent = 'Ver resultados';

      card.append(avatarBtn, nome, tag, btnEditar, btnResultados);
      grid.appendChild(card);
    });
  }

  /* ---------- Select "vincular" + lista de vinculados (dentro do menu) --- */
  function renderVincularSelect() {
    const select = el('selectVincular');
    select.innerHTML = '';
    const disponiveis = Roster.todos().filter(p => !Auth.donoDe(p.id));
    if (!disponiveis.length) {
      const opt = document.createElement('option');
      opt.textContent = 'Nenhum personagem disponível';
      opt.value = '';
      select.appendChild(opt);
      return;
    }
    disponiveis.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.nome;
      select.appendChild(opt);
    });
  }

  function renderLinkedList() {
    const list = el('linkedList');
    list.innerHTML = '';
    const meus = Auth.meusPersonagens();
    if (!meus.length) {
      const li = document.createElement('li');
      li.className = 'acc-linked-empty';
      li.textContent = 'Nenhum personagem vinculado ainda.';
      list.appendChild(li);
      return;
    }
    meus.forEach(p => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = p.nome;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'acc-unlink-btn';
      btn.textContent = 'Desvincular';
      btn.addEventListener('click', async () => {
        await Auth.desvincular(p.id);
        if (editingId === p.id) { editingId = null; el('sheetCard').style.display = 'none'; }
        renderTudoLogado();
      });
      li.append(span, btn);
      list.appendChild(li);
    });
  }

  /* ---------- Ficha (perícias fixas, com orçamento de pontos) ------------
     A ficha não é mais uma lista livre de "nome + valor": é sempre a
     mesma lista de perícias (SKILLS, em skills-data.js), cada uma com um
     contador +/-. A soma de todas não pode passar de LIMITE_PONTOS_FICHA. */

  /** Soma o que está digitado em todas as linhas de perícia agora. */
  function somaAtual() {
    let soma = 0;
    el('attrRows').querySelectorAll('.attr-valor').forEach(input => {
      soma += Math.max(0, Math.floor(Number(input.value) || 0));
    });
    return soma;
  }

  /** Corrige um input pra ficar >=0 e sem estourar o orçamento de pontos. */
  function ajustarValor(input, novoValor) {
    const outros = somaAtual() - Math.max(0, Math.floor(Number(input.value) || 0));
    const max = LIMITE_PONTOS_FICHA - outros;
    let v = Math.max(0, Math.floor(Number(novoValor) || 0));
    if (v > max) v = max;
    input.value = v;
    atualizarContador();
  }

  function linhaDeAtributo(skill, valor) {
    const row = document.createElement('div');
    row.className = 'attr-row';
    row.dataset.skill = skill.id;

    const label = document.createElement('span');
    label.className = 'attr-label';
    label.textContent = skill.nome;

    const stepper = document.createElement('div');
    stepper.className = 'attr-stepper';

    const btnMenos = document.createElement('button');
    btnMenos.type = 'button';
    btnMenos.className = 'attr-step-btn';
    btnMenos.setAttribute('aria-label', `Diminuir ${skill.nome}`);
    btnMenos.textContent = '–';

    const inputValor = document.createElement('input');
    inputValor.type = 'number';
    inputValor.className = 'attr-valor';
    inputValor.min = '0';
    inputValor.value = Math.max(0, Math.floor(Number(valor) || 0));

    const btnMais = document.createElement('button');
    btnMais.type = 'button';
    btnMais.className = 'attr-step-btn';
    btnMais.setAttribute('aria-label', `Aumentar ${skill.nome}`);
    btnMais.textContent = '+';

    btnMenos.addEventListener('click', () => ajustarValor(inputValor, Number(inputValor.value) - 1));
    btnMais.addEventListener('click', () => ajustarValor(inputValor, Number(inputValor.value) + 1));
    inputValor.addEventListener('input', () => ajustarValor(inputValor, inputValor.value));

    stepper.append(btnMenos, inputValor, btnMais);
    row.append(label, stepper);
    return row;
  }

  function atualizarContador() {
    const soma = somaAtual();
    el('attrCounter').textContent = `${soma}/${LIMITE_PONTOS_FICHA}`;
    el('attrCounter').classList.toggle('is-full', soma >= LIMITE_PONTOS_FICHA);
    // Trava os botões "+" quando o orçamento já foi todo usado, pra nunca
    // ser possível passar de LIMITE_PONTOS_FICHA mexendo no stepper.
    const cheio = soma >= LIMITE_PONTOS_FICHA;
    el('attrRows').querySelectorAll('.attr-step-btn:last-child').forEach(btn => { btn.disabled = cheio; });
  }

  function abrirFicha(personagemId) {
    editingId = personagemId;
    const p = Roster.porId(personagemId);
    const ficha = Auth.ficha(personagemId);
    if (!p || !ficha) return; // não é seu personagem — não abre nada

    el('sheetCard').style.display = 'block';
    el('sheetNome').textContent = p.nome;
    el('sheetMsg').textContent = '';

    const rows = el('attrRows');
    rows.innerHTML = '';
    SKILLS.forEach(skill => rows.appendChild(linhaDeAtributo(skill, ficha.atributos[skill.id])));
    atualizarContador();
    el('sheetCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function fecharFicha() {
    editingId = null;
    el('sheetCard').style.display = 'none';
  }

  el('btnFecharFicha').addEventListener('click', fecharFicha);

  el('btnSalvarFicha').addEventListener('click', async () => {
    if (!editingId) return;
    const atributos = {};
    el('attrRows').querySelectorAll('.attr-row').forEach(row => {
      atributos[row.dataset.skill] = Number(row.querySelector('.attr-valor').value) || 0;
    });

    const r = await Auth.salvarFicha(editingId, atributos);
    const msg = el('sheetMsg');
    msg.textContent = r.ok ? 'Ficha salva!' : r.erro;
    msg.className = 'sheet-msg' + (r.ok ? ' is-ok' : ' is-error');
    // Deu certo: mostra a confirmação rapidinho e fecha a aba de edição sozinha.
    // Deu erro (ex: passou dos 25 pontos): mantém aberta pra pessoa corrigir.
    if (r.ok) setTimeout(fecharFicha, 700);
  });

  /* ---------- Orquestração geral ------------------------------------------ */
  function renderTudoLogado() {
    renderCharGrid();
    renderVincularSelect();
    renderLinkedList();
    if (editingId && !Auth.donoDe(editingId)) {
      // o personagem foi desvinculado por algum motivo — fecha a ficha aberta
      fecharFicha();
    }
  }

  function refreshAll() {
    const user = Auth.usuarioAtual();
    if (!user) {
      authSection.style.display = 'block';
      appSection.style.display = 'none';
      return;
    }
    authSection.style.display = 'none';
    appSection.style.display = 'block';
    el('helloUsuario').textContent = user.usuario;
    el('drawerUsuario').textContent = user.usuario;
    renderTudoLogado();
  }

  refreshAll();
});
