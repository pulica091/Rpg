/* =======================================================================
   worker.js — A API DO SITE (Cloudflare Worker + D1)

   É este arquivo que liga o site ao banco. Enquanto ele não estiver no ar,
   o site funciona sozinho no navegador (modo local); assim que estiver,
   basta preencher a URL em rpg2/js/api.js e virar API.ativo = true.

   COMO SUBIR
   ----------
   1. npm create cloudflare@latest rpg-api
   2. Copie este arquivo para src/index.js
   3. Crie o banco:        npx wrangler d1 create rpg
   4. Aplique o schema:    npx wrangler d1 execute rpg --file=../schema.sql
   5. No wrangler.toml:

        [[d1_databases]]
        binding = "DB"
        database_name = "rpg"
        database_id = "<o id que o passo 3 imprimiu>"

        [vars]
        ORIGEM = "https://seu-site.pages.dev"   # quem pode chamar a API

   6. Guarde a chave do mestre como segredo (NUNCA no wrangler.toml):
        npx wrangler secret put CHAVE_MESTRE
   7. npx wrangler deploy

   SEGURANÇA — o que o servidor garante (e o navegador não garante)
   ----------------------------------------------------------------
   - Senha nunca é guardada em texto: PBKDF2 com sal por usuário.
   - Quem está logado é provado por um token de sessão no cabeçalho
     Authorization, não por um campo que o front manda dizendo quem é.
   - Ficha só é lida/gravada pelo DONO do personagem. A conferência é
     feita aqui, com SQL, então não adianta forjar nada no navegador.
   - Contador, bomba e universos só mudam com a chave do mestre.
   ======================================================================= */

export default {
  async fetch(pedido, env) {
    const url = new URL(pedido.url);
    const rota = url.pathname.replace(/\/+$/, '') || '/';
    const cors = cabecalhos(env);

    if (pedido.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      const r = await rotear(pedido, env, rota, url);
      return new Response(JSON.stringify(r ?? {}), { headers: cors });
    } catch (erro) {
      const status = erro.status || 500;
      return new Response(JSON.stringify({ erro: erro.message || 'falha' }), { status, headers: cors });
    }
  }
};

function cabecalhos(env) {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': env.ORIGEM || '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Cache-Control': 'no-store'
  };
}

function falhar(msg, status) { const e = new Error(msg); e.status = status || 400; throw e; }
const agora = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

/* =======================================================================
   ROTEADOR
   ======================================================================= */
async function rotear(pedido, env, rota, url) {
  const db = env.DB;
  const corpo = pedido.method === 'POST' ? await pedido.json().catch(() => ({})) : {};

  switch (rota + ' ' + pedido.method) {
    /* ---------- CONTA ---------------------------------------------- */
    case '/auth/registrar POST': return registrar(db, corpo);
    case '/auth/login POST':     return login(db, corpo);
    case '/auth/sair POST':      return sair(db, pedido);

    /* ---------- SNAPSHOT (uma chamada só, no carregamento) --------- */
    case '/estado GET':          return estado(db, pedido);

    /* ---------- PERSONAGENS ---------------------------------------- */
    case '/personagens GET':     return listarPersonagens(db);
    case '/personagens POST':    return criarPersonagem(db, pedido, corpo);
    case '/personagens/vincular POST':   return vincular(db, pedido, corpo, true);
    case '/personagens/desvincular POST':return vincular(db, pedido, corpo, false);
    case '/personagens/em-jogo POST':    return emJogo(db, pedido, corpo);

    /* ---------- FICHA ----------------------------------------------- */
    case '/ficha GET':           return lerFicha(db, pedido, url);
    case '/ficha POST':          return salvarFicha(db, pedido, corpo);

    /* ---------- ROLAGENS -------------------------------------------- */
    case '/rolagens GET':        return listarRolagens(db, pedido, url);
    case '/rolagens POST':       return registrarRolagem(db, pedido, corpo);

    /* ---------- CONTADOR (mestre escreve, todo mundo lê) ------------ */
    case '/contador GET':        return lerContador(db);
    case '/contador POST':       return acaoContador(db, env, corpo);

    /* ---------- UNIVERSOS ------------------------------------------- */
    case '/universos GET':            return listarUniversos(db);
    case '/universos/destruir POST':  return destruirUniverso(db, env, corpo);
    case '/universos/estado POST':    return estadoUniverso(db, env, corpo);
    case '/universos/ordem POST':     return ordemUniversos(db, env, corpo);

    /* ---------- BOMBA ------------------------------------------------ */
    case '/bomba GET':            return lerBomba(db);
    case '/bomba/etapa POST':     return etapaBomba(db, corpo);
    case '/bomba/concluir POST':  return concluirBomba(db, corpo);
    case '/bomba/reiniciar POST': return reiniciarBomba(db, env, corpo);
  }
  falhar('rota desconhecida', 404);
}

/* =======================================================================
   SENHA E SESSÃO
   ======================================================================= */
async function hashSenha(senha, salHex) {
  const sal = salHex ? hexParaBytes(salHex) : crypto.getRandomValues(new Uint8Array(16));
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: sal, iterations: 100000, hash: 'SHA-256' }, chave, 256);
  return bytesParaHex(sal) + ':' + bytesParaHex(new Uint8Array(bits));
}
const bytesParaHex = (b) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
const hexParaBytes = (h) => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));

async function conferirSenha(senha, guardado) {
  const [sal] = guardado.split(':');
  const calculado = await hashSenha(senha, sal);
  // Comparação de tempo constante: não entrega, pelo tempo de resposta,
  // quantos caracteres do hash bateram.
  let diff = calculado.length ^ guardado.length;
  for (let i = 0; i < calculado.length && i < guardado.length; i++) {
    diff |= calculado.charCodeAt(i) ^ guardado.charCodeAt(i);
  }
  return diff === 0;
}

async function novaSessao(db, idUsuario) {
  const token = bytesParaHex(crypto.getRandomValues(new Uint8Array(32)));
  const expira = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString().replace(/\.\d+Z$/, 'Z');
  await db.prepare('INSERT INTO sessao (token, id_usuario, expira_em) VALUES (?1, ?2, ?3)')
    .bind(token, idUsuario, expira).run();
  return { token, expira_em: expira };
}

/** Quem está pedindo. Lança 401 se não houver sessão válida. */
async function exigirUsuario(db, pedido) {
  const cab = pedido.headers.get('Authorization') || '';
  const token = cab.replace(/^Bearer\s+/i, '').trim();
  if (!token) falhar('faça login', 401);
  const u = await db.prepare(
    `SELECT u.id_usuario, u.username FROM sessao s
       JOIN usuarios u ON u.id_usuario = s.id_usuario
      WHERE s.token = ?1 AND s.expira_em > ?2`).bind(token, agora()).first();
  if (!u) falhar('sessão expirada', 401);
  return u;
}

function exigirMestre(env, corpo) {
  if (!env.CHAVE_MESTRE || corpo.chave !== env.CHAVE_MESTRE) falhar('só o mestre pode fazer isso', 403);
}

/* =======================================================================
   CONTA
   ======================================================================= */
async function registrar(db, { username, senha }) {
  username = (username || '').trim();
  if (username.length < 3) falhar('o nome de usuário precisa de pelo menos 3 letras');
  if ((senha || '').length < 6) falhar('a senha precisa de pelo menos 6 caracteres');

  const existe = await db.prepare('SELECT 1 FROM usuarios WHERE username = ?1').bind(username).first();
  if (existe) falhar('esse nome de usuário já existe');

  const hash = await hashSenha(senha);
  const r = await db.prepare('INSERT INTO usuarios (username, password_hash) VALUES (?1, ?2)')
    .bind(username, hash).run();
  const sessao = await novaSessao(db, r.meta.last_row_id);
  return { ok: true, usuario: { id: r.meta.last_row_id, username }, ...sessao };
}

async function login(db, { username, senha }) {
  const u = await db.prepare('SELECT id_usuario, username, password_hash FROM usuarios WHERE username = ?1')
    .bind((username || '').trim()).first();
  // Mesma mensagem para usuário inexistente e senha errada: não confirma
  // para quem está tentando adivinhar que o usuário existe.
  if (!u || !await conferirSenha(senha || '', u.password_hash)) falhar('usuário ou senha incorretos', 401);
  const sessao = await novaSessao(db, u.id_usuario);
  return { ok: true, usuario: { id: u.id_usuario, username: u.username }, ...sessao };
}

async function sair(db, pedido) {
  const token = (pedido.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (token) await db.prepare('DELETE FROM sessao WHERE token = ?1').bind(token).run();
  return { ok: true };
}

/* =======================================================================
   SNAPSHOT — o site pede isto uma vez ao carregar
   ======================================================================= */
async function estado(db, pedido) {
  const personagens = (await db.prepare(
    `SELECT id_personagem, slug, nome, imagem, familia, id_usuario, em_jogo FROM personagem`).all()).results;

  let usuario = null, fichas = [], rolagens = [];
  try {
    usuario = await exigirUsuario(db, pedido);
  } catch (e) { usuario = null; }          // visitante: devolve só o público

  if (usuario) {
    fichas = (await db.prepare(
      `SELECT f.* FROM ficha f JOIN personagem p ON p.id_personagem = f.id_personagem
        WHERE p.id_usuario = ?1`).bind(usuario.id_usuario).all()).results;
    rolagens = (await db.prepare(
      `SELECT r.*, p.slug, p.nome AS personagem_nome FROM rolagens r
         LEFT JOIN personagem p ON p.id_personagem = r.id_personagem
        WHERE r.id_usuario = ?1 ORDER BY r.id_rolagem DESC LIMIT 500`).bind(usuario.id_usuario).all()).results;
  }
  return { usuario, personagens, fichas, rolagens };
}

/* =======================================================================
   PERSONAGENS
   ======================================================================= */
async function listarPersonagens(db) {
  return (await db.prepare('SELECT id_personagem, slug, nome, imagem, familia, id_usuario, em_jogo FROM personagem').all()).results;
}

async function criarPersonagem(db, pedido, { nome, imagem, familia, slug }) {
  const u = await exigirUsuario(db, pedido);
  if (!(nome || '').trim()) falhar('o personagem precisa de um nome');
  slug = (slug || nome).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
           .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
  const r = await db.prepare(
    `INSERT INTO personagem (nome, imagem, familia, slug, id_usuario) VALUES (?1, ?2, ?3, ?4, ?5)`)
    .bind(nome.trim(), imagem || null, familia || null, slug, u.id_usuario).run();
  return { ok: true, id_personagem: r.meta.last_row_id, slug };
}

async function vincular(db, pedido, { slug }, ligar) {
  const u = await exigirUsuario(db, pedido);
  const p = await db.prepare('SELECT id_personagem, id_usuario FROM personagem WHERE slug = ?1').bind(slug).first();
  if (!p) falhar('personagem não encontrado', 404);

  if (ligar) {
    if (p.id_usuario && p.id_usuario !== u.id_usuario) falhar('esse personagem já é de outra conta', 403);
    await db.prepare('UPDATE personagem SET id_usuario = ?1 WHERE id_personagem = ?2')
      .bind(u.id_usuario, p.id_personagem).run();
  } else {
    if (p.id_usuario !== u.id_usuario) falhar('esse personagem não é seu', 403);
    await db.prepare('UPDATE personagem SET id_usuario = NULL, em_jogo = 0 WHERE id_personagem = ?1')
      .bind(p.id_personagem).run();
  }
  return { ok: true };
}

async function emJogo(db, pedido, { slug, em_jogo }) {
  const u = await exigirUsuario(db, pedido);
  const r = await db.prepare(
    'UPDATE personagem SET em_jogo = ?1 WHERE slug = ?2 AND id_usuario = ?3')
    .bind(em_jogo ? 1 : 0, slug, u.id_usuario).run();
  if (!r.meta.changes) falhar('esse personagem não é seu', 403);
  return { ok: true };
}

/* =======================================================================
   FICHA — sempre conferindo o dono no próprio SQL
   ======================================================================= */
const PERICIAS = ['acrobacia','arcanismo','atletismo','atuacao','blefar','furtividade','historia',
  'intimidacao','intuicao','investigacao','lidar_com_animais','medicina','natureza','percepcao',
  'persuasao','prestidigitacao','religiao','sobrevivencia'];
const LIMITE_PONTOS = 25;

async function lerFicha(db, pedido, url) {
  const u = await exigirUsuario(db, pedido);
  const slug = url.searchParams.get('slug');
  const f = await db.prepare(
    `SELECT f.* FROM ficha f JOIN personagem p ON p.id_personagem = f.id_personagem
      WHERE p.slug = ?1 AND p.id_usuario = ?2`).bind(slug, u.id_usuario).first();
  if (!f) return { atributos: Object.fromEntries(PERICIAS.map(p => [p, 0])) };
  return { atributos: Object.fromEntries(PERICIAS.map(p => [p, f[p] || 0])) };
}

async function salvarFicha(db, pedido, { slug, atributos }) {
  const u = await exigirUsuario(db, pedido);
  const p = await db.prepare('SELECT id_personagem FROM personagem WHERE slug = ?1 AND id_usuario = ?2')
    .bind(slug, u.id_usuario).first();
  if (!p) falhar('você só edita a ficha dos seus personagens', 403);

  // A trava de 25 pontos vale aqui também — o CHECK da tabela é a última
  // linha de defesa, mas a mensagem boa sai daqui.
  const valores = PERICIAS.map(k => Math.max(0, Math.floor(Number((atributos || {})[k]) || 0)));
  const soma = valores.reduce((a, b) => a + b, 0);
  if (soma > LIMITE_PONTOS) falhar(`a soma não pode passar de ${LIMITE_PONTOS} (está em ${soma})`);

  const colunas = PERICIAS.join(', ');
  const marcas = PERICIAS.map((_, i) => '?' + (i + 2)).join(', ');
  const atualiza = PERICIAS.map((k, i) => `${k} = ?${i + 2}`).join(', ');
  await db.prepare(
    `INSERT INTO ficha (id_personagem, ${colunas}) VALUES (?1, ${marcas})
     ON CONFLICT(id_personagem) DO UPDATE SET ${atualiza}, atualizada_em = strftime('%Y-%m-%dT%H:%M:%SZ','now')`)
    .bind(p.id_personagem, ...valores).run();
  return { ok: true, soma };
}

/* =======================================================================
   ROLAGENS
   ======================================================================= */
async function registrarRolagem(db, pedido, c) {
  const u = await exigirUsuario(db, pedido);
  let idPersonagem = null;
  if (c.slug) {
    const p = await db.prepare('SELECT id_personagem FROM personagem WHERE slug = ?1 AND id_usuario = ?2')
      .bind(c.slug, u.id_usuario).first();
    if (!p) falhar('esse personagem não é seu', 403);
    idPersonagem = p.id_personagem;
  }
  const dado = Math.max(1, Math.floor(Number(c.valor_dado) || 0));
  const bonus = Math.max(0, Math.floor(Number(c.valor_atributo) || 0));
  const total = dado + bonus;
  const cd = c.dificuldade == null ? null : Math.floor(Number(c.dificuldade));
  const sucesso = cd == null ? null : (total >= cd ? 1 : 0);

  await db.prepare(
    `INSERT INTO rolagens (id_personagem, id_usuario, atributo_usado, valor_dado, valor_atributo,
                           resultado, dado_lados, dificuldade, sucesso)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)`)
    .bind(idPersonagem, u.id_usuario, c.atributo_usado || null, dado, bonus, total,
          Math.floor(Number(c.dado_lados) || 20), cd, sucesso).run();
  return { ok: true, resultado: total, sucesso };
}

async function listarRolagens(db, pedido, url) {
  const u = await exigirUsuario(db, pedido);
  const limite = Math.min(1000, Number(url.searchParams.get('limite')) || 500);
  const todas = url.searchParams.get('mesa') === '1';
  // "mesa=1" devolve as rolagens de todo mundo, sem ficha nem dado pessoal
  // nenhum junto — serve pro dashboard comparar a mesa inteira.
  const sql = todas
    ? `SELECT r.*, p.slug, p.nome AS personagem_nome, u.username FROM rolagens r
         LEFT JOIN personagem p ON p.id_personagem = r.id_personagem
         LEFT JOIN usuarios u ON u.id_usuario = r.id_usuario
        ORDER BY r.id_rolagem DESC LIMIT ?1`
    : `SELECT r.*, p.slug, p.nome AS personagem_nome FROM rolagens r
         LEFT JOIN personagem p ON p.id_personagem = r.id_personagem
        WHERE r.id_usuario = ?2 ORDER BY r.id_rolagem DESC LIMIT ?1`;
  const q = todas ? db.prepare(sql).bind(limite) : db.prepare(sql).bind(limite, u.id_usuario);
  return (await q.all()).results;
}

/* =======================================================================
   CONTADOR
   ======================================================================= */
async function contadorAtual(db) {
  let c = await db.prepare('SELECT * FROM contador WHERE ativo = 1 ORDER BY id_contador DESC LIMIT 1').first();
  if (!c) {
    await db.prepare(`INSERT INTO contador (rotulo, total_inicial, restante) VALUES (?1, ?2, ?2)`)
      .bind('Colisão da Terra-616', 2419200).run();
    c = await db.prepare('SELECT * FROM contador WHERE ativo = 1 ORDER BY id_contador DESC LIMIT 1').first();
  }
  return c;
}

async function lerContador(db) { return contadorAtual(db); }

async function acaoContador(db, env, c) {
  exigirMestre(env, c);
  const atual = await contadorAtual(db);

  // Congela o restante antes de qualquer coisa: é o que permite pausar e
  // trocar a velocidade sem ninguém perder nem ganhar tempo.
  let restante = Number(atual.restante);
  if (atual.status === 'rodando') {
    const passou = (Date.now() - Date.parse(atual.atualizado_em)) / 1000;
    restante = Math.max(0, Math.round(restante - passou * Number(atual.multiplicador)));
  }
  let { status, multiplicador, total_inicial, rotulo, iniciado_em } = atual;

  switch (c.acao) {
    case 'iniciar':   if (restante <= 0) restante = total_inicial; status = 'rodando'; iniciado_em = iniciado_em || agora(); break;
    case 'pausar':    if (status === 'rodando') status = 'pausado'; break;
    case 'continuar': if (restante > 0) status = 'rodando'; break;
    case 'reiniciar': restante = total_inicial; status = 'rodando'; iniciado_em = agora(); break;
    case 'zerar':     restante = 0; status = 'zerado'; break;
    case 'definir_tempo':
      restante = Math.max(0, Math.floor(Number(c.segundos) || 0));
      status = restante === 0 ? 'zerado' : (status === 'zerado' ? 'pausado' : status);
      break;
    case 'definir_inicial':
      total_inicial = Math.max(0, Math.floor(Number(c.segundos) || 0));
      if (c.aplicar) { restante = total_inicial; status = c.rodar ? 'rodando' : 'pausado'; iniciado_em = agora(); }
      break;
    case 'multiplicador': multiplicador = Math.max(0.1, Number(c.valor) || 1); break;
    case 'rotulo':        rotulo = String(c.texto || '').slice(0, 60) || rotulo; break;
    default: falhar('ação desconhecida');
  }

  await db.prepare(
    `UPDATE contador SET restante = ?1, status = ?2, multiplicador = ?3, total_inicial = ?4,
            rotulo = ?5, iniciado_em = ?6, atualizado_em = ?7, versao = versao + 1, alterado_por = ?8
      WHERE id_contador = ?9`)
    .bind(restante, status, multiplicador, total_inicial, rotulo, iniciado_em, agora(),
          c.quem || 'mestre', atual.id_contador).run();
  return contadorAtual(db);
}

/* =======================================================================
   UNIVERSOS — a promoção do próximo acontece AQUI, não no navegador
   ======================================================================= */
async function listarUniversos(db) {
  return (await db.prepare('SELECT * FROM universo ORDER BY ordem').all()).results;
}

async function destruirUniverso(db, env, c) {
  exigirMestre(env, c);
  const lista = await listarUniversos(db);

  // Sem código: destrói quem estiver em incursão agora.
  const alvo = c.codigo
    ? lista.find(u => u.codigo === c.codigo)
    : lista.find(u => u.estado === 'incursao');
  if (!alvo) falhar('não há universo em incursão para destruir');
  if (alvo.estado === 'principal') falhar('a 616 é a casa: não dá pra destruir por aqui');

  await db.prepare(
    `UPDATE universo SET estado = 'destruido', destruido_em = ?1, atualizado_em = ?1, versao = versao + 1
      WHERE id_universo = ?2`).bind(agora(), alvo.id_universo).run();

  // O próximo da ordem que ainda está intacto assume a incursão.
  const proximo = lista.find(u => u.ordem > alvo.ordem && u.estado === 'intacto')
               || lista.find(u => u.estado === 'intacto');
  if (proximo) {
    await db.prepare(
      `UPDATE universo SET estado = 'incursao', atualizado_em = ?1, versao = versao + 1
        WHERE id_universo = ?2`).bind(agora(), proximo.id_universo).run();
  }
  return { ok: true, destruido: alvo.codigo, agora_em_incursao: proximo ? proximo.codigo : null,
           universos: await listarUniversos(db) };
}

async function estadoUniverso(db, env, c) {
  exigirMestre(env, c);
  const estados = ['principal', 'incursao', 'destruido', 'intacto'];
  if (!estados.includes(c.estado)) falhar('estado inválido');
  // Só um universo pode estar em incursão de cada vez.
  if (c.estado === 'incursao') {
    await db.prepare(`UPDATE universo SET estado = 'intacto', versao = versao + 1 WHERE estado = 'incursao'`).run();
  }
  await db.prepare(
    `UPDATE universo SET estado = ?1, destruido_em = CASE WHEN ?1 = 'destruido' THEN ?2 ELSE NULL END,
            atualizado_em = ?2, versao = versao + 1 WHERE codigo = ?3`)
    .bind(c.estado, agora(), c.codigo).run();
  return { ok: true, universos: await listarUniversos(db) };
}

async function ordemUniversos(db, env, c) {
  exigirMestre(env, c);
  const codigos = c.codigos || [];
  // Passo em duas fases pra não esbarrar no índice único de ordem.
  for (let i = 0; i < codigos.length; i++) {
    await db.prepare('UPDATE universo SET ordem = ?1 WHERE codigo = ?2').bind(-(i + 1), codigos[i]).run();
  }
  for (let i = 0; i < codigos.length; i++) {
    await db.prepare('UPDATE universo SET ordem = ?1, atualizado_em = ?2, versao = versao + 1 WHERE codigo = ?3')
      .bind(i + 1, agora(), codigos[i]).run();
  }
  return { ok: true, universos: await listarUniversos(db) };
}

/* =======================================================================
   BOMBA
   ======================================================================= */
async function lerBomba(db) {
  let a = await db.prepare('SELECT * FROM bomba_ativacao WHERE concluida = 0 ORDER BY id_ativacao DESC LIMIT 1').first();
  if (!a) {
    const ultima = await db.prepare('SELECT MAX(numero_uso) AS n FROM bomba_ativacao').first();
    const numero = (ultima && ultima.n ? ultima.n : 0) + 1;
    const semente = Math.floor(Math.random() * 4294967295);
    await db.prepare('INSERT INTO bomba_ativacao (numero_uso, semente) VALUES (?1, ?2)').bind(numero, semente).run();
    a = await db.prepare('SELECT * FROM bomba_ativacao WHERE concluida = 0 ORDER BY id_ativacao DESC LIMIT 1').first();
  }
  return { numero_uso: a.numero_uso, semente: a.semente, etapa: a.etapa, concluida: !!a.concluida };
}

async function etapaBomba(db, { etapa }) {
  const a = await lerBomba(db);
  await db.prepare(
    `UPDATE bomba_ativacao SET etapa = ?1 WHERE concluida = 0 AND numero_uso = ?2`)
    .bind(Math.min(5, Math.max(1, Number(etapa) || 1)), a.numero_uso).run();
  return lerBomba(db);
}

async function concluirBomba(db, { concluida_por }) {
  await db.prepare(
    `UPDATE bomba_ativacao SET concluida = 1, etapa = 5, concluida_em = ?1, concluida_por = ?2
      WHERE concluida = 0`).bind(agora(), concluida_por || null).run();
  return { ok: true };
}

async function reiniciarBomba(db, env, c) {
  exigirMestre(env, c);
  await db.prepare('DELETE FROM bomba_ativacao').run();
  return lerBomba(db);
}
