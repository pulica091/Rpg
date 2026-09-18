/* =======================================================================
   api.js — A PONTE ENTRE O SITE E O BANCO

   Este é o único arquivo do site que sabe onde os dados moram. Todo o
   resto (ficha, dados, resultados, incursões, painel do mestre) fala só
   com os objetos daqui — então ligar ou desligar o banco não exige mexer
   em mais nada.

   DOIS MODOS
   ----------
   ligado  (API.ativo = true)  : fala com o Worker + D1 (worker/worker.js).
                                 A conta, a ficha e as rolagens ficam no
                                 banco e a mesa inteira enxerga o mesmo.
   local   (API.ativo = false) : tudo no localStorage deste navegador. Só
                                 serve pra testar; NADA sincroniza entre
                                 computadores nesse modo.

   PRA LIGAR: preencha API.base com a URL do Worker e vire ativo pra true.

   COMO OS DADOS CIRCULAM
   ----------------------
   Ao carregar a página, DB.carregar() pede UM retrato do estado
   (/estado) e guarda em memória. As leituras (quem sou eu, meus
   personagens, minha ficha) são instantâneas, lidas desse retrato. As
   escritas vão ao servidor e devolvem Promise — por isso salvar, vincular
   e rolar dado são sempre `await`.

   SEGURANÇA
   ---------
   No modo ligado, o navegador guarda apenas um token de sessão. Quem é o
   dono de cada ficha é decidido no servidor, por SQL. Mesmo que alguém
   mexa no JavaScript da página, não consegue abrir nem gravar a ficha de
   outra pessoa. No modo local não existe essa garantia — é por isso que
   ele é só para testes.
   ======================================================================= */

const API = {
  base:  '',      // ex.: 'https://rpg-api.seu-dominio.workers.dev'
  ativo: false    // vire pra true quando o Worker estiver no ar
};

const RPG_STORAGE_KEYS = {
  token:      'rpg2-token',       // token de sessão (modo ligado)
  users:      'rpg2-users',       // modo local: { usuarioLower: {usuario, hash} }
  session:    'rpg2-session',     // modo local: usuário logado
  links:      'rpg2-links',       // modo local: { usuarioLower: [slug, ...] }
  active:     'rpg2-active',      // modo local: quem está "em jogo"
  sheets:     'rpg2-sheets',      // modo local: fichas
  rolls:      'rpg2-rolls',       // modo local: histórico de rolagens
  extraChars: 'rpg2-extra-chars', // personagens cadastrados na hora
};

const LIMITE_PONTOS_FICHA = 25;   // trava de pontos da ficha (igual no banco)

/* --- localStorage com queda silenciosa (modo anônimo, cota cheia...) --- */
const Store = {
  get(chave, padrao) {
    try { const b = localStorage.getItem(chave); return b ? JSON.parse(b) : padrao; }
    catch (e) { return padrao; }
  },
  set(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); return true; }
    catch (e) { return false; }
  },
  del(chave) { try { localStorage.removeItem(chave); } catch (e) {} }
};

/* =======================================================================
   TRANSPORTE
   ======================================================================= */
const DB = {
  /** Retrato do estado, preenchido por carregar(). Leituras vêm daqui. */
  cache: { usuario: null, personagens: [], fichas: {}, rolagens: [] },

  ligado() { return API.ativo && !!API.base; },

  token() { return Store.get(RPG_STORAGE_KEYS.token, null); },
  guardarToken(t) { t ? Store.set(RPG_STORAGE_KEYS.token, t) : Store.del(RPG_STORAGE_KEYS.token); },

  async pedir(rota, opcoes) {
    const o = opcoes || {};
    const cab = { 'Content-Type': 'application/json' };
    const t = this.token();
    if (t) cab.Authorization = 'Bearer ' + t;

    const r = await fetch(API.base + rota, {
      method: o.metodo || 'GET',
      headers: cab,
      cache: 'no-store',
      body: o.corpo ? JSON.stringify(o.corpo) : undefined
    });
    const dados = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(dados.erro || 'o servidor recusou o pedido');
    return dados;
  },

  /** Puxa o retrato do estado. Chame no início de cada página que usa conta. */
  async carregar() {
    if (!this.ligado()) { this.cache = Local.retrato(); return this.cache; }
    try {
      const e = await this.pedir('/estado');
      this.cache = {
        usuario: e.usuario ? { usuario: e.usuario.username } : null,
        personagens: (e.personagens || []).map(p => ({
          id: p.slug, nome: p.nome, img: p.imagem || '', familia: p.familia || '',
          dono: p.id_usuario,
          meu: !!(e.usuario && p.id_usuario === e.usuario.id),   // é meu?
          emJogo: !!p.em_jogo
        })),
        fichas: Object.fromEntries((e.fichas || []).map(f => [f.slug || f.id_personagem, f])),
        rolagens: e.rolagens || []
      };
    } catch (erro) {
      // Servidor fora do ar: não derruba a página, cai pro espelho local
      // e avisa no console (o site continua utilizável na mesa).
      console.warn('[api] sem resposta do servidor, usando o espelho local:', erro.message);
      this.cache = Local.retrato();
    }
    return this.cache;
  }
};

/* =======================================================================
   MODO LOCAL — o mesmo formato do servidor, guardado no navegador
   ======================================================================= */
const Local = {
  hash(texto) {                    // NÃO é criptografia: só evita mexida sem querer
    let h = 0; const s = 'rpg-salt::' + String(texto);
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return String(h);
  },
  chave() { return Store.get(RPG_STORAGE_KEYS.session, null); },

  retrato() {
    const chave = this.chave();
    const users = Store.get(RPG_STORAGE_KEYS.users, {});
    const links = Store.get(RPG_STORAGE_KEYS.links, {});
    const ativos = Store.get(RPG_STORAGE_KEYS.active, {});
    const sheets = Store.get(RPG_STORAGE_KEYS.sheets, {});
    const extras = Store.get(RPG_STORAGE_KEYS.extraChars, []);

    const dono = (id) => Object.keys(links).find(u => (links[u] || []).includes(id)) || null;
    const personagens = (typeof ROSTER_BASE !== 'undefined' ? ROSTER_BASE : []).concat(extras)
      .map(p => ({ ...p, dono: dono(p.id), meu: dono(p.id) === chave && !!chave,
                   emJogo: (ativos[chave] || []).includes(p.id) }));

    const fichas = {};
    Object.keys(sheets).forEach(k => {
      const [u, id] = k.split('::');
      if (u === chave) fichas[id] = sheets[k];
    });

    return {
      usuario: chave && users[chave] ? { usuario: users[chave].usuario } : null,
      personagens,
      fichas,
      rolagens: (Store.get(RPG_STORAGE_KEYS.rolls, []) || []).filter(r => r.conta === chave)
    };
  },

  registrar(usuario, senha) {
    usuario = (usuario || '').trim();
    if (usuario.length < 3) throw new Error('o nome de usuário precisa de pelo menos 3 letras');
    if ((senha || '').length < 6) throw new Error('a senha precisa de pelo menos 6 caracteres');
    const chave = usuario.toLowerCase();
    const users = Store.get(RPG_STORAGE_KEYS.users, {});
    if (users[chave]) throw new Error('esse nome de usuário já existe');
    users[chave] = { usuario, hash: this.hash(senha) };
    Store.set(RPG_STORAGE_KEYS.users, users);
    Store.set(RPG_STORAGE_KEYS.session, chave);
  },

  login(usuario, senha) {
    const chave = (usuario || '').trim().toLowerCase();
    const users = Store.get(RPG_STORAGE_KEYS.users, {});
    if (!users[chave] || users[chave].hash !== this.hash(senha || '')) {
      throw new Error('usuário ou senha incorretos');
    }
    Store.set(RPG_STORAGE_KEYS.session, chave);
  },

  vincular(id, ligar) {
    const chave = this.chave();
    if (!chave) throw new Error('faça login primeiro');
    const links = Store.get(RPG_STORAGE_KEYS.links, {});
    const dono = Object.keys(links).find(u => (links[u] || []).includes(id));
    if (ligar) {
      if (dono && dono !== chave) throw new Error('esse personagem já é de outra conta');
      links[chave] = links[chave] || [];
      if (!links[chave].includes(id)) links[chave].push(id);
    } else {
      if (dono !== chave) throw new Error('esse personagem não é seu');
      links[chave] = (links[chave] || []).filter(x => x !== id);
      const ativos = Store.get(RPG_STORAGE_KEYS.active, {});
      ativos[chave] = (ativos[chave] || []).filter(x => x !== id);
      Store.set(RPG_STORAGE_KEYS.active, ativos);
    }
    Store.set(RPG_STORAGE_KEYS.links, links);
  },

  emJogo(id, marcar) {
    const chave = this.chave();
    const ativos = Store.get(RPG_STORAGE_KEYS.active, {});
    const lista = ativos[chave] || [];
    const i = lista.indexOf(id);
    if (marcar && i === -1) lista.push(id);
    if (!marcar && i !== -1) lista.splice(i, 1);
    ativos[chave] = lista;
    Store.set(RPG_STORAGE_KEYS.active, ativos);
  },

  salvarFicha(id, atributos) {
    const chave = this.chave();
    const sheets = Store.get(RPG_STORAGE_KEYS.sheets, {});
    sheets[`${chave}::${id}`] = { atributos };
    Store.set(RPG_STORAGE_KEYS.sheets, sheets);
  },

  registrarRolagem(r) {
    const lista = Store.get(RPG_STORAGE_KEYS.rolls, []);
    lista.push({ ...r, conta: this.chave(), id_rolagem: Date.now() });
    // Guarda as 500 últimas: o localStorage é pequeno e o dashboard não
    // precisa de mais que isso pra desenhar bem.
    Store.set(RPG_STORAGE_KEYS.rolls, lista.slice(-500));
  }
};

window.API = API;
window.DB = DB;
window.Local = Local;
