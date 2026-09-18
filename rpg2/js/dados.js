/* =======================================================================
   dados.js — só é usado em dados.html
   1) Rola um número aleatório de 1 até N quando o botão do dado é clicado.
   2) Se a pessoa estiver logada (ficha.html) e tiver pelo menos um
      personagem VINCULADO à conta, mostra um botão "Escolher personagem"
      que abre uma gaveta lateral com esses personagens; depois de
      escolher, dá pra somar o valor de uma perícia da ficha dele ao
      resultado do dado.
      Depende de roster-data.js, skills-data.js e auth.js (ordem de
      <script> importa).
   ======================================================================= */

document.addEventListener('DOMContentLoaded', async () => {

  // O painel de personagem só existe pra quem está logado, então o
  // primeiro passo é puxar o retrato do estado (conta, personagens,
  // fichas). Com o banco ligado isso vem do servidor.
  if (typeof Auth !== 'undefined') await Auth.carregar();
  const resultado = document.getElementById('dado');
  const sidesLabel = document.getElementById('dado-sides');

  const painel = document.getElementById('diceCharPanel');
  const dica   = document.getElementById('diceLoginHint');
  const selectAttr = document.getElementById('diceAttrSelect');
  const breakdown  = document.getElementById('diceBreakdown');

  const btnEscolher   = document.getElementById('btnEscolherPersonagemDado');
  const pickerAvatar  = document.getElementById('diceCharPickerAvatar');
  const pickerNome    = document.getElementById('diceCharPickerName');
  const drawer        = document.getElementById('diceCharDrawer');
  const overlay       = document.getElementById('diceCharOverlay');
  const btnFecharDrawer = document.getElementById('btnFecharDiceDrawer');
  const drawerGrid     = document.getElementById('diceCharDrawerGrid');

  // roster-data.js / skills-data.js / auth.js só existem em páginas que os
  // carregam — como dados.js agora também é usado ali, checamos antes de
  // usar (defensivo).
  const temContaLocal = typeof Auth !== 'undefined' && typeof Roster !== 'undefined' && typeof SKILLS !== 'undefined';

  let personagemId = null; // id do personagem escolhido pra rodar o dado agora

  /* ---------- Gaveta lateral de escolha de personagem --------------------- */
  function abrirDrawer() {
    drawer.classList.add('open');
    overlay.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
  }
  function fecharDrawer() {
    drawer.classList.remove('open');
    overlay.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
  }

  function renderDrawer() {
    drawerGrid.innerHTML = '';
    Auth.meusPersonagens().forEach(p => {
      const id = p.id;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dice-char-drawer-item' + (id === personagemId ? ' is-selected' : '');

      const avatar = document.createElement('span');
      avatar.className = 'dice-char-drawer-avatar';
      avatar.appendChild(Roster.avatar(p));

      const nome = document.createElement('span');
      nome.className = 'dice-char-drawer-name';
      nome.textContent = p.nome;

      item.append(avatar, nome);
      item.addEventListener('click', () => {
        selecionarPersonagem(id);
        fecharDrawer();
      });
      drawerGrid.appendChild(item);
    });
  }

  function selecionarPersonagem(id) {
    personagemId = id;
    const p = Roster.porId(id);
    pickerAvatar.innerHTML = '';
    if (p) pickerAvatar.appendChild(Roster.avatar(p));
    pickerNome.textContent = p ? p.nome : 'Escolher personagem';
    popularAtributos();
  }

  if (btnEscolher) {
    btnEscolher.addEventListener('click', () => { renderDrawer(); abrirDrawer(); });
    btnFecharDrawer.addEventListener('click', fecharDrawer);
    overlay.addEventListener('click', fecharDrawer);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharDrawer(); });
  }

  /* ---------- Monta o painel de personagem/perícia, se fizer sentido ----- */
  function popularPainel() {
    if (!temContaLocal) return;
    const usuario = Auth.usuarioAtual();
    const meus = usuario ? Auth.meusPersonagens() : [];

    if (!usuario || !meus.length) {
      painel.style.display = 'none';
      dica.style.display = 'block';
      personagemId = null;
      return;
    }
    painel.style.display = 'block';
    dica.style.display = 'none';

    // Se o personagem escolhido não está mais vinculado à conta (ou nada
    // foi escolhido ainda), cai pro primeiro personagem vinculado.
    if (!personagemId || !meus.some(p => p.id === personagemId)) {
      selecionarPersonagem(meus[0].id);
    } else {
      popularAtributos();
    }
  }

  function popularAtributos() {
    selectAttr.innerHTML = '<option value="">Nenhuma perícia</option>';
    if (!personagemId) return;
    const ficha = Auth.ficha(personagemId);
    if (!ficha) return;
    SKILLS.forEach(skill => {
      const opt = document.createElement('option');
      opt.value = skill.id;
      opt.textContent = `${skill.nome} (${ficha.atributos[skill.id] || 0})`;
      selectAttr.appendChild(opt);
    });
  }

  if (temContaLocal) {
    popularPainel();
  } else if (painel) {
    painel.style.display = 'none';
  }

  /* ---------- Rolar o dado ------------------------------------------------ */
  document.querySelectorAll('.dice-buttons .btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sides = parseInt(btn.getAttribute('data-sides'), 10);

      btn.classList.add('rolling');
      setTimeout(() => btn.classList.remove('rolling'), 400);

      const numero = Math.floor(Math.random() * sides) + 1;
      resultado.textContent = numero;
      sidesLabel.textContent = `D${sides}`;

      // Sem personagem escolhido: comportamento original, só o dado.
      if (!temContaLocal || painel.style.display === 'none' || !personagemId) {
        breakdown.style.display = 'none';
        return;
      }

      const skillId = selectAttr.value;
      const p = Roster.porId(personagemId);
      let bonus = 0;
      let skillNome = '';
      if (skillId) {
        const ficha = Auth.ficha(personagemId);
        const skill = SKILLS.find(s => s.id === skillId);
        skillNome = skill ? skill.nome : '';
        bonus = ficha ? Number(ficha.atributos[skillId]) || 0 : 0;
      }
      const total = numero + bonus;

      const campoCD = document.getElementById('diceDC');
      const cd = campoCD && campoCD.value !== '' ? Math.floor(Number(campoCD.value)) : null;
      const passou = cd == null ? null : total >= cd;

      breakdown.style.display = 'block';
      breakdown.innerHTML =
        (skillNome
          ? `${p ? p.nome : ''}: ${numero} + ${skillNome} (${bonus}) = <strong>${total}</strong>`
          : `${p ? p.nome : ''}: ${numero} + nenhuma perícia = <strong>${total}</strong>`) +
        (cd == null ? ''
          : ` · CD ${cd} · <span class="${passou ? 'is-sucesso' : 'is-falha'}">${passou ? 'sucesso' : 'falha'}</span>`);

      // Guarda a rolagem: é daqui que sai tudo que o painel de resultados
      // desenha depois. Se o servidor recusar, a tela avisa em vez de
      // fingir que salvou.
      const salvo = await Rolagens.registrar({
        personagemId: personagemId,
        personagemNome: p ? p.nome : '',
        atributo: skillId || null,
        valorDado: numero,
        valorAtributo: bonus,
        lados: sides,
        dificuldade: cd
      });
      const aviso = document.getElementById('diceSaved');
      if (aviso && !salvo.ok) {
        aviso.textContent = 'A rolagem não entrou no histórico: ' + salvo.erro;
        aviso.classList.add('is-erro');
      }
    });
  });
});
