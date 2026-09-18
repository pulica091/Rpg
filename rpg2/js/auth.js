/* =======================================================================
   auth.js — CONTA, PERSONAGENS, FICHA E ROLAGENS

   Depende de api.js (carregue antes). Este arquivo não fala com o banco
   nem com o localStorage diretamente: só usa DB (servidor) e Local
   (espelho do navegador), que estão em api.js.

   REGRA DE OURO
   -------------
   Ler é instantâneo (vem do retrato carregado por DB.carregar()).
   Escrever é `await` (vai ao servidor e volta com o retrato atualizado).

     await Auth.carregar();             // no começo da página
     Auth.usuarioAtual();               // instantâneo
     await Auth.salvarFicha(id, {...}); // devolve { ok, erro }

   A HIERARQUIA
   ------------
     CONTA → PERSONAGENS → FICHA INDIVIDUAL → ROLAGENS
   Cada personagem pertence a uma conta só e tem uma ficha só; cada
   rolagem guarda de quem foi. Com o banco ligado, quem confere o dono é
   o servidor (worker/worker.js) — o navegador não decide isso, então
   mexer no JavaScript da página não abre a ficha de outra pessoa.
   ======================================================================= */

const Auth = {
  async carregar() { return DB.carregar(); },

  /* ---------- Conta ----------------------------------------------------- */
  usuarioAtual() { return DB.cache.usuario; },

  async registrar(usuario, senha) {
    try {
      if (DB.ligado()) {
        const r = await DB.pedir('/auth/registrar', { metodo: 'POST', corpo: { username: usuario, senha } });
        DB.guardarToken(r.token);
      } else {
        Local.registrar(usuario, senha);
      }
      await DB.carregar();
      return { ok: true };
    } catch (e) { return { ok: false, erro: frase(e.message) }; }
  },

  async login(usuario, senha) {
    try {
      if (DB.ligado()) {
        const r = await DB.pedir('/auth/login', { metodo: 'POST', corpo: { username: usuario, senha } });
        DB.guardarToken(r.token);
      } else {
        Local.login(usuario, senha);
      }
      await DB.carregar();
      return { ok: true };
    } catch (e) { return { ok: false, erro: frase(e.message) }; }
  },

  async logout() {
    if (DB.ligado()) {
      await DB.pedir('/auth/sair', { metodo: 'POST' }).catch(() => {});
      DB.guardarToken(null);
    } else {
      Store.del(RPG_STORAGE_KEYS.session);
    }
    await DB.carregar();
  },

  /* ---------- Personagens da conta -------------------------------------- */
  donoDe(id) {
    const p = DB.cache.personagens.find(x => x.id === id);
    return p ? (p.dono || null) : null;
  },

  /** Os personagens desta conta. Vazio se ninguém estiver logado. */
  meusPersonagens() {
    if (!this.usuarioAtual()) return [];
    return DB.cache.personagens.filter(p => p.meu);
  },

  /** Quem está marcado como "jogando agora". */
  ativos() { return this.meusPersonagens().filter(p => p.emJogo).map(p => p.id); },

  async vincular(id) {
    return escrever(
      () => DB.pedir('/personagens/vincular', { metodo: 'POST', corpo: { slug: id } }),
      () => Local.vincular(id, true));
  },

  async desvincular(id) {
    return escrever(
      () => DB.pedir('/personagens/desvincular', { metodo: 'POST', corpo: { slug: id } }),
      () => Local.vincular(id, false));
  },

  async alternarAtivo(id) {
    const marcar = !this.ativos().includes(id);
    return escrever(
      () => DB.pedir('/personagens/em-jogo', { metodo: 'POST', corpo: { slug: id, em_jogo: marcar } }),
      () => Local.emJogo(id, marcar));
  },

  /* ---------- Ficha ------------------------------------------------------ */
  /** Só devolve a ficha se o personagem for da conta aberta agora. */
  ficha(id) {
    if (!this.usuarioAtual()) return null;
    if (!this.meusPersonagens().some(p => p.id === id)) return null;
    const guardada = DB.cache.fichas[id];
    return { atributos: Object.assign(fichaVazia(), guardada && guardada.atributos) };
  },

  async salvarFicha(id, atributos) {
    if (!this.usuarioAtual()) return { ok: false, erro: 'Faça login primeiro.' };
    if (!this.meusPersonagens().some(p => p.id === id)) {
      return { ok: false, erro: 'Você só pode editar a ficha dos seus personagens.' };
    }
    // A mesma trava de pontos existe no servidor e na tabela. Aqui ela
    // serve pra dar uma mensagem boa antes de gastar uma ida ao banco.
    const limpa = fichaVazia();
    let soma = 0;
    SKILLS.forEach(s => {
      const v = Math.max(0, Math.floor(Number((atributos || {})[s.id]) || 0));
      limpa[s.id] = v; soma += v;
    });
    if (soma > LIMITE_PONTOS_FICHA) {
      return { ok: false, erro: `A soma dos pontos não pode passar de ${LIMITE_PONTOS_FICHA} (está em ${soma}).` };
    }
    const r = await escrever(
      () => DB.pedir('/ficha', { metodo: 'POST', corpo: { slug: id, atributos: limpa } }),
      () => Local.salvarFicha(id, limpa));
    return r.ok ? { ok: true, atributos: limpa } : r;
  }
};

/* =======================================================================
   ROLAGENS — é o que alimenta o painel de resultados
   ======================================================================= */
const Rolagens = {
  /** Registra uma rolagem. `dificuldade` pode vir vazia (rolagem livre). */
  async registrar(d) {
    const total = (Number(d.valorDado) || 0) + (Number(d.valorAtributo) || 0);
    const cd = (d.dificuldade === '' || d.dificuldade == null) ? null : Math.floor(Number(d.dificuldade));
    const registro = {
      slug: d.personagemId || null,
      atributo_usado: d.atributo || null,
      valor_dado: Number(d.valorDado) || 0,
      valor_atributo: Number(d.valorAtributo) || 0,
      resultado: total,
      dado_lados: Number(d.lados) || 20,
      dificuldade: cd,
      sucesso: cd == null ? null : (total >= cd ? 1 : 0),
      rolado_em: new Date().toISOString(),
      personagem_nome: d.personagemNome || null
    };
    const r = await escrever(
      () => DB.pedir('/rolagens', { metodo: 'POST', corpo: registro }),
      () => Local.registrarRolagem(registro));
    return r.ok ? { ok: true, ...registro } : r;
  },

  /** Histórico da conta aberta, do mais novo pro mais antigo. */
  minhas() {
    return (DB.cache.rolagens || []).slice().sort(
      (a, b) => new Date(b.rolado_em || 0) - new Date(a.rolado_em || 0));
  },

  /** Histórico da mesa inteira — só existe de verdade com o banco ligado. */
  async daMesa(limite) {
    if (!DB.ligado()) return this.minhas();
    try { return await DB.pedir('/rolagens?mesa=1&limite=' + (limite || 500)); }
    catch (e) { return this.minhas(); }
  }
};

/* --- Ajudantes ---------------------------------------------------------- */
async function escrever(noServidor, noNavegador) {
  try {
    if (DB.ligado()) await noServidor();
    else noNavegador();
    await DB.carregar();
    return { ok: true };
  } catch (e) { return { ok: false, erro: frase(e.message) }; }
}

function fichaVazia() {
  const o = {};
  (typeof SKILLS !== 'undefined' ? SKILLS : []).forEach(s => { o[s.id] = 0; });
  return o;
}

function frase(t) {
  t = String(t || 'algo deu errado');
  return t.charAt(0).toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? '' : '.');
}

window.Auth = Auth;
window.Rolagens = Rolagens;
