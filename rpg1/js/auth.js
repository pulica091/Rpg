/* =======================================================================
   auth.js — "conta", vínculo de personagem e ficha, tudo local
   Usado por ficha.html e por dados.html.

   IMPORTANTE — leia antes de mexer:
   Isso NÃO é um sistema de login de verdade. Não existe back-end ainda
   (o Tio pediu pra funcionar local por enquanto, sem depender do
   Cloudflare/D1 já configurado nas outras abas). Tudo — usuários,
   senha, personagens vinculados e fichas — fica salvo no localStorage
   do PRÓPRIO navegador de quem está acessando. Ou seja:
     - Cada pessoa só vê os dados salvos NO SEU navegador/computador —
       isso NÃO sincroniza entre o computador de um amigo e o do outro.
     - A "senha" só serve pra não deixar qualquer um mexendo sem querer;
       não é armazenamento seguro de verdade (é só um hash simples, dá
       pra reverter com esforço). Não reaproveitem uma senha importante.
   Quando vocês quiserem ligar isso num back-end de verdade (Cloudflare
   Worker + D1, por exemplo), a ideia é trocar só as funções desta
   camada (registrar/login/vincular/salvarFicha) por chamadas de API —
   o resto do site (ficha.html, dados.html) já fica pronto, porque só
   fala com o objeto `Auth` abaixo, nunca direto com o localStorage.
   ======================================================================= */

const RPG_STORAGE_KEYS = {
  users:      'rpg-users',       // { usuarioLower: { usuario, hash, criadoEm } }
  session:    'rpg-session',     // usuarioLower do usuário logado (ou ausente)
  links:      'rpg-links',       // { usuarioLower: [idPersonagem, ...] }
  active:     'rpg-active',      // { usuarioLower: [idPersonagem, ...] }  (quem está "em jogo" agora)
  sheets:     'rpg-sheets',      // { "usuarioLower::idPersonagem": { atributos: { idPericia: valor, ... } } }
  extraChars: 'rpg-extra-chars', // [{id,nome,img}, ...] personagens cadastrados na hora
};

// Trava dura de pontos da ficha — mesmo se alguém adulterar o front,
// nada salva acima disso. Não é "25 atributos", é 25 PONTOS somados
// entre as perícias fixas de SKILLS (ver js/skills-data.js).
const LIMITE_PONTOS_FICHA = 25;

/* --- Camada de armazenamento (localStorage com fallback silencioso) ---- */
const Store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },
};

/* --- Hash simples (NÃO é criptografia de verdade — ver aviso acima) --- */
function hashSimples(texto) {
  let h = 0;
  const str = 'rpg-salt::' + String(texto);
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return String(h);
}

const Auth = {
  /* ---------- Conta ---------------------------------------------------- */
  usuarioAtual() {
    const key = Store.get(RPG_STORAGE_KEYS.session, null);
    if (!key) return null;
    const users = Store.get(RPG_STORAGE_KEYS.users, {});
    return users[key] || null;
  },

  registrar(usuario, senha) {
    usuario = (usuario || '').trim();
    senha = senha || '';
    if (usuario.length < 3) return { ok: false, erro: 'O nome de usuário precisa ter pelo menos 3 letras.' };
    if (senha.length < 4) return { ok: false, erro: 'A senha precisa ter pelo menos 4 caracteres.' };
    const key = usuario.toLowerCase();
    const users = Store.get(RPG_STORAGE_KEYS.users, {});
    if (users[key]) return { ok: false, erro: 'Esse nome de usuário já existe.' };
    users[key] = { usuario, hash: hashSimples(senha), criadoEm: Date.now() };
    Store.set(RPG_STORAGE_KEYS.users, users);
    Store.set(RPG_STORAGE_KEYS.session, key);
    return { ok: true };
  },

  login(usuario, senha) {
    const key = (usuario || '').trim().toLowerCase();
    const users = Store.get(RPG_STORAGE_KEYS.users, {});
    const conta = users[key];
    if (!conta || conta.hash !== hashSimples(senha || '')) {
      return { ok: false, erro: 'Usuário ou senha incorretos.' };
    }
    Store.set(RPG_STORAGE_KEYS.session, key);
    return { ok: true };
  },

  logout() {
    try { localStorage.removeItem(RPG_STORAGE_KEYS.session); } catch (e) {}
  },

  /* ---------- Vínculo de personagens ------------------------------------
     Cada personagem só pode estar vinculado a UM usuário por vez — isso
     é o que garante "só posso mexer na minha conta": antes de editar a
     ficha de um personagem, sempre confirmamos que ele está vinculado
     ao usuário logado nesta sessão. */
  meusPersonagens() {
    const eu = this.usuarioAtual();
    if (!eu) return [];
    const key = Store.get(RPG_STORAGE_KEYS.session, null);
    const links = Store.get(RPG_STORAGE_KEYS.links, {});
    const ids = links[key] || [];
    return ids.map(id => Roster.porId(id)).filter(Boolean);
  },

  donoDe(personagemId) {
    const links = Store.get(RPG_STORAGE_KEYS.links, {});
    for (const usuarioKey in links) {
      if (links[usuarioKey].includes(personagemId)) return usuarioKey;
    }
    return null;
  },

  vincular(personagemId) {
    const eu = this.usuarioAtual();
    if (!eu) return { ok: false, erro: 'Faça login primeiro.' };
    const dono = this.donoDe(personagemId);
    const key = Store.get(RPG_STORAGE_KEYS.session, null);
    if (dono && dono !== key) return { ok: false, erro: 'Esse personagem já está vinculado a outra conta.' };
    if (dono === key) return { ok: true }; // já é seu, nada a fazer
    const links = Store.get(RPG_STORAGE_KEYS.links, {});
    links[key] = links[key] || [];
    links[key].push(personagemId);
    Store.set(RPG_STORAGE_KEYS.links, links);
    return { ok: true };
  },

  desvincular(personagemId) {
    const key = Store.get(RPG_STORAGE_KEYS.session, null);
    if (!key) return { ok: false, erro: 'Faça login primeiro.' };
    const links = Store.get(RPG_STORAGE_KEYS.links, {});
    links[key] = (links[key] || []).filter(id => id !== personagemId);
    Store.set(RPG_STORAGE_KEYS.links, links);
    // some também da lista de "jogando agora", se estava lá
    const active = Store.get(RPG_STORAGE_KEYS.active, {});
    active[key] = (active[key] || []).filter(id => id !== personagemId);
    Store.set(RPG_STORAGE_KEYS.active, active);
    return { ok: true };
  },

  /* ---------- Seleção de "quem está jogando agora" ---------------------- */
  ativos() {
    const key = Store.get(RPG_STORAGE_KEYS.session, null);
    if (!key) return [];
    const active = Store.get(RPG_STORAGE_KEYS.active, {});
    return active[key] || [];
  },

  alternarAtivo(personagemId) {
    const key = Store.get(RPG_STORAGE_KEYS.session, null);
    if (!key) return { ok: false, erro: 'Faça login primeiro.' };
    if (this.donoDe(personagemId) !== key) return { ok: false, erro: 'Esse personagem não é seu.' };
    const active = Store.get(RPG_STORAGE_KEYS.active, {});
    const lista = active[key] || [];
    const i = lista.indexOf(personagemId);
    if (i === -1) lista.push(personagemId); else lista.splice(i, 1);
    active[key] = lista;
    Store.set(RPG_STORAGE_KEYS.active, active);
    return { ok: true };
  },

  /* ---------- Ficha (perícias) --------------------------------------------
     Trava de segurança: só o dono do personagem (usuário logado nesta
     sessão) consegue ler ou gravar a ficha dele. A ficha é sempre um
     objeto com TODAS as perícias fixas de SKILLS (ver skills-data.js),
     e a soma de todos os pontos nunca pode passar de LIMITE_PONTOS_FICHA
     (25) — mesmo que alguém tente forçar via console, `salvarFicha`
     recusa gravar acima do limite. */
  ficha(personagemId) {
    const key = Store.get(RPG_STORAGE_KEYS.session, null);
    if (!key || this.donoDe(personagemId) !== key) return null;
    const sheets = Store.get(RPG_STORAGE_KEYS.sheets, {});
    const salva = sheets[`${key}::${personagemId}`];
    // Sempre devolve as perícias fixas zeradas + o que já estiver salvo,
    // pra funcionar mesmo se SKILLS ganhar uma perícia nova no futuro.
    return { atributos: Object.assign(fichaVazia(), salva && salva.atributos) };
  },

  salvarFicha(personagemId, atributos) {
    const key = Store.get(RPG_STORAGE_KEYS.session, null);
    if (!key) return { ok: false, erro: 'Faça login primeiro.' };
    if (this.donoDe(personagemId) !== key) return { ok: false, erro: 'Você só pode editar a ficha dos seus personagens.' };

    // Só aceita as perícias fixas conhecidas, com valores inteiros >= 0.
    const limpa = fichaVazia();
    let soma = 0;
    SKILLS.forEach(s => {
      const v = Math.max(0, Math.floor(Number((atributos || {})[s.id]) || 0));
      limpa[s.id] = v;
      soma += v;
    });
    if (soma > LIMITE_PONTOS_FICHA) {
      return { ok: false, erro: `A soma dos pontos não pode passar de ${LIMITE_PONTOS_FICHA} (está em ${soma}).` };
    }

    const sheets = Store.get(RPG_STORAGE_KEYS.sheets, {});
    sheets[`${key}::${personagemId}`] = { atributos: limpa };
    Store.set(RPG_STORAGE_KEYS.sheets, sheets);
    return { ok: true, atributos: limpa };
  },
};
