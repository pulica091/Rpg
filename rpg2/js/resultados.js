/* =======================================================================
   resultados.js — PAINEL DE RESULTADOS DOS DADOS

   Tudo que aparece aqui sai das rolagens REGISTRADAS (tabela `rolagens`,
   ou o espelho local enquanto o banco não está ligado). Não existe nenhum
   número inventado neste arquivo: se não houver rolagem, o gráfico não é
   desenhado — aparece o aviso de que ainda não há dado suficiente.

   Os gráficos são desenhados à mão em <canvas>, sem biblioteca externa:
   o site inteiro é estático e precisa abrir mesmo sem internet.

   O que cada painel responde:
     · Resumo          — quantas rolagens, média, melhor e pior resultado
     · Distribuição    — quantas vezes cada face do dado saiu
     · Sucesso × falha — só conta rolagem que teve CD informada
     · Por perícia     — média do resultado em cada perícia usada
     · Histórico       — a linha do tempo das rolagens, com média móvel
     · Comparação      — teia comparando as perícias mais usadas
   ======================================================================= */

document.addEventListener('DOMContentLoaded', async () => {
  await Auth.carregar();

  const el = (id) => document.getElementById(id);
  const semConta = el('semConta');
  const painel   = el('painelResultados');

  if (!Auth.usuarioAtual()) {
    semConta.style.display = 'block';
    painel.style.display = 'none';
    return;
  }
  semConta.style.display = 'none';

  /* ---------- Filtros ---------------------------------------------------- */
  const params = new URLSearchParams(location.search);
  const filtros = {
    personagem: params.get('personagem') || 'todos',
    dado: 'todos',
    escopo: 'minhas'
  };

  let rolagens = [];

  const selPersonagem = el('filtroPersonagem');
  const selDado = el('filtroDado');
  const selEscopo = el('filtroEscopo');

  function montarFiltroPersonagens() {
    const meus = Auth.meusPersonagens();
    selPersonagem.innerHTML = '<option value="todos">Todos os meus personagens</option>';
    meus.forEach(p => {
      const o = document.createElement('option');
      o.value = p.id; o.textContent = p.nome;
      if (p.id === filtros.personagem) o.selected = true;
      selPersonagem.appendChild(o);
    });
  }

  // O escopo "mesa inteira" só existe de verdade com o banco ligado: sem
  // servidor, cada navegador só conhece as próprias rolagens.
  if (!DB.ligado()) {
    selEscopo.disabled = true;
    selEscopo.title = 'Disponível quando o banco estiver ligado';
    el('avisoLocal').style.display = 'block';
  }

  async function carregarRolagens() {
    const brutas = filtros.escopo === 'mesa' ? await Rolagens.daMesa(500) : Rolagens.minhas();
    rolagens = brutas.filter(r => {
      if (filtros.personagem !== 'todos' && (r.slug || r.personagem_id) !== filtros.personagem) return false;
      if (filtros.dado !== 'todos' && String(r.dado_lados) !== filtros.dado) return false;
      return true;
    });
    desenharTudo();
  }

  [selPersonagem, selDado, selEscopo].forEach(s => {
    s.addEventListener('change', () => {
      filtros.personagem = selPersonagem.value;
      filtros.dado = selDado.value;
      filtros.escopo = selEscopo.value;
      carregarRolagens();
    });
  });

  /* =====================================================================
     CÁLCULOS — feitos sobre as rolagens filtradas, nada pré-escrito
     ===================================================================== */
  function resumo() {
    if (!rolagens.length) return null;
    const totais = rolagens.map(r => Number(r.resultado) || 0);
    const comCD = rolagens.filter(r => r.sucesso !== null && r.sucesso !== undefined);
    const sucessos = comCD.filter(r => Number(r.sucesso) === 1).length;
    return {
      quantidade: rolagens.length,
      media: totais.reduce((a, b) => a + b, 0) / totais.length,
      maior: Math.max(...totais),
      menor: Math.min(...totais),
      testes: comCD.length,
      sucessos,
      falhas: comCD.length - sucessos
    };
  }

  function distribuicaoFaces() {
    // Agrupa pelo valor puro do dado (sem somar a perícia): é isso que
    // mostra se a sorte está pendendo pra algum lado.
    const porLados = {};
    rolagens.forEach(r => {
      const l = Number(r.dado_lados) || 20;
      porLados[l] = porLados[l] || new Array(l).fill(0);
      const v = Number(r.valor_dado) || 0;
      if (v >= 1 && v <= l) porLados[l][v - 1]++;
    });
    // Usa o dado mais rolado do recorte atual.
    const lados = Object.keys(porLados).sort((a, b) =>
      porLados[b].reduce((x, y) => x + y, 0) - porLados[a].reduce((x, y) => x + y, 0))[0];
    return lados ? { lados: Number(lados), contagem: porLados[lados] } : null;
  }

  function porPericia() {
    const mapa = {};
    rolagens.forEach(r => {
      const id = r.atributo_usado;
      if (!id) return;
      mapa[id] = mapa[id] || { total: 0, n: 0, sucessos: 0, testes: 0 };
      mapa[id].total += Number(r.resultado) || 0;
      mapa[id].n++;
      if (r.sucesso !== null && r.sucesso !== undefined) {
        mapa[id].testes++;
        if (Number(r.sucesso) === 1) mapa[id].sucessos++;
      }
    });
    return Object.keys(mapa).map(id => {
      const s = SKILLS.find(x => x.id === id);
      return {
        id, nome: s ? s.nome : id,
        media: mapa[id].total / mapa[id].n,
        n: mapa[id].n,
        aproveitamento: mapa[id].testes ? mapa[id].sucessos / mapa[id].testes : null
      };
    }).sort((a, b) => b.n - a.n);
  }

  /* =====================================================================
     DESENHO
     ===================================================================== */
  function cores() {
    const raiz = getComputedStyle(document.documentElement);
    const pegar = (n, padrao) => (raiz.getPropertyValue(n) || padrao).trim();
    return {
      sinal: pegar('--gold', '#8fae52'),
      sinalClaro: pegar('--gold-soft', '#b7cf7c'),
      fenda: pegar('--jewel', '#7a5a9c'),
      perda: pegar('--wine', '#5c3a4a'),
      texto: pegar('--text', '#d9dccf'),
      fraco: pegar('--text-dim', '#8d9184'),
      linha: 'rgba(158,184,120,0.18)'
    };
  }

  /** Prepara o canvas para a tela (retina) e devolve o contexto. */
  function tela(canvas, altura) {
    const larg = canvas.parentElement.clientWidth;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = larg * dpr;
    canvas.height = altura * dpr;
    canvas.style.width = larg + 'px';
    canvas.style.height = altura + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, larg, altura);
    ctx.font = '11px "Share Tech Mono", monospace';
    return { ctx, larg, alt: altura };
  }

  function eixoY(ctx, larg, alt, margem, maximo, c) {
    const passos = 4;
    ctx.strokeStyle = c.linha;
    ctx.fillStyle = c.fraco;
    ctx.lineWidth = 1;
    for (let i = 0; i <= passos; i++) {
      const y = alt - margem.baixo - (i / passos) * (alt - margem.topo - margem.baixo);
      ctx.beginPath();
      ctx.moveTo(margem.esq, y + 0.5);
      ctx.lineTo(larg - margem.dir, y + 0.5);
      ctx.stroke();
      ctx.textAlign = 'right';
      ctx.fillText(Math.round((i / passos) * maximo), margem.esq - 8, y + 4);
    }
  }

  /* --- Barras verticais: distribuição das faces ------------------------- */
  function grafDistribuicao() {
    const d = distribuicaoFaces();
    const caixa = el('caixaDistribuicao');
    if (!d || !rolagens.length) return vazio(caixa, 'Nenhuma rolagem registrada ainda neste recorte.');
    ocupado(caixa);
    el('legendaDistribuicao').textContent =
      `D${d.lados} · ${d.contagem.reduce((a, b) => a + b, 0)} rolagens · média esperada por face: ` +
      (d.contagem.reduce((a, b) => a + b, 0) / d.lados).toFixed(1);

    const { ctx, larg, alt } = tela(el('canvasDistribuicao'), 240);
    const c = cores();
    const margem = { topo: 16, baixo: 28, esq: 34, dir: 10 };
    const maximo = Math.max(1, ...d.contagem);
    eixoY(ctx, larg, alt, margem, maximo, c);

    const util = larg - margem.esq - margem.dir;
    const larguraBarra = Math.max(3, util / d.contagem.length - 3);
    const esperado = d.contagem.reduce((a, b) => a + b, 0) / d.lados;

    d.contagem.forEach((v, i) => {
      const x = margem.esq + (i / d.contagem.length) * util + 1.5;
      const altura = (v / maximo) * (alt - margem.topo - margem.baixo);
      ctx.fillStyle = v >= esperado ? c.sinal : c.fenda;
      ctx.fillRect(x, alt - margem.baixo - altura, larguraBarra, altura);
      if (d.contagem.length <= 20 || (i + 1) % 5 === 0) {
        ctx.fillStyle = c.fraco;
        ctx.textAlign = 'center';
        ctx.fillText(i + 1, x + larguraBarra / 2, alt - margem.baixo + 16);
      }
    });

    // Linha do valor esperado: ajuda a ler se a sorte está torta.
    const yEsp = alt - margem.baixo - (esperado / maximo) * (alt - margem.topo - margem.baixo);
    ctx.strokeStyle = c.texto;
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(margem.esq, yEsp); ctx.lineTo(larg - margem.dir, yEsp); ctx.stroke();
    ctx.setLineDash([]);
  }

  /* --- Rosca: sucesso × falha ------------------------------------------- */
  function grafSucesso() {
    const r = resumo();
    const caixa = el('caixaSucesso');
    if (!r || !r.testes) {
      return vazio(caixa, 'Nenhum teste com dificuldade (CD) registrado ainda. Informe a CD na página de Dados para o sistema contar sucessos e falhas.');
    }
    ocupado(caixa);
    const { ctx, larg, alt } = tela(el('canvasSucesso'), 240);
    const c = cores();
    const cx = larg / 2, cy = alt / 2, raio = Math.min(larg, alt) / 2 - 24, grossura = 26;
    const fatias = [
      { valor: r.sucessos, cor: c.sinal, rotulo: 'sucessos' },
      { valor: r.falhas, cor: c.perda, rotulo: 'falhas' }
    ];
    let angulo = -Math.PI / 2;
    fatias.forEach(f => {
      const fatia = (f.valor / r.testes) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, raio, angulo, angulo + fatia);
      ctx.strokeStyle = f.cor;
      ctx.lineWidth = grossura;
      ctx.stroke();
      angulo += fatia;
    });
    ctx.fillStyle = c.texto;
    ctx.textAlign = 'center';
    ctx.font = '600 26px "Barlow Condensed", sans-serif';
    ctx.fillText(Math.round((r.sucessos / r.testes) * 100) + '%', cx, cy + 4);
    ctx.font = '11px "Share Tech Mono", monospace';
    ctx.fillStyle = c.fraco;
    ctx.fillText('de aproveitamento', cx, cy + 22);

    el('legendaSucesso').innerHTML =
      `<span class="chave" style="--cor:${c.sinal}"></span>${r.sucessos} sucessos` +
      `<span class="chave" style="--cor:${c.perda}"></span>${r.falhas} falhas` +
      `<span class="chave chave--vazia"></span>${r.quantidade - r.testes} rolagens sem CD`;
  }

  /* --- Barras horizontais: média por perícia ---------------------------- */
  function grafPericias() {
    const lista = porPericia().slice(0, 10);
    const caixa = el('caixaPericias');
    if (!lista.length) {
      return vazio(caixa, 'Nenhuma rolagem foi feita com perícia ainda. Escolha uma perícia na página de Dados.');
    }
    ocupado(caixa);
    const altura = Math.max(160, lista.length * 30 + 30);
    const { ctx, larg, alt } = tela(el('canvasPericias'), altura);
    const c = cores();
    const esq = 128, dir = 44;
    const maximo = Math.max(...lista.map(p => p.media)) * 1.1;

    lista.forEach((p, i) => {
      const y = 16 + i * 30;
      ctx.fillStyle = c.fraco;
      ctx.textAlign = 'right';
      ctx.fillText(cortar(p.nome, 16), esq - 10, y + 13);

      const comprimento = (p.media / maximo) * (larg - esq - dir);
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(esq, y, larg - esq - dir, 18);
      ctx.fillStyle = p.aproveitamento === null ? c.fenda
        : (p.aproveitamento >= 0.5 ? c.sinal : c.perda);
      ctx.fillRect(esq, y, comprimento, 18);

      ctx.fillStyle = c.texto;
      ctx.textAlign = 'left';
      ctx.fillText(p.media.toFixed(1), esq + comprimento + 8, y + 13);
    });
    el('legendaPericias').textContent =
      'Média do resultado final (dado + perícia). A cor mostra o aproveitamento nos testes com CD: verde acima de 50%, vinho abaixo, roxo quando não houve CD.';
  }

  /* --- Linha: histórico -------------------------------------------------- */
  function grafHistorico() {
    const caixa = el('caixaHistorico');
    if (rolagens.length < 2) return vazio(caixa, 'São necessárias pelo menos duas rolagens para desenhar o histórico.');
    ocupado(caixa);

    const serie = rolagens.slice(0, 60).reverse();
    const { ctx, larg, alt } = tela(el('canvasHistorico'), 240);
    const c = cores();
    const margem = { topo: 16, baixo: 26, esq: 34, dir: 12 };
    const maximo = Math.max(...serie.map(r => Number(r.resultado) || 0)) * 1.1;
    eixoY(ctx, larg, alt, margem, maximo, c);

    const px = (i) => margem.esq + (i / Math.max(1, serie.length - 1)) * (larg - margem.esq - margem.dir);
    const py = (v) => alt - margem.baixo - (v / maximo) * (alt - margem.topo - margem.baixo);

    // Média móvel de 5: mostra a tendência sem esconder os picos.
    const janela = 5;
    ctx.strokeStyle = c.fenda;
    ctx.lineWidth = 2;
    ctx.beginPath();
    serie.forEach((r, i) => {
      const fatia = serie.slice(Math.max(0, i - janela + 1), i + 1);
      const m = fatia.reduce((a, b) => a + (Number(b.resultado) || 0), 0) / fatia.length;
      i === 0 ? ctx.moveTo(px(i), py(m)) : ctx.lineTo(px(i), py(m));
    });
    ctx.stroke();

    ctx.strokeStyle = c.sinal;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    serie.forEach((r, i) => {
      const v = Number(r.resultado) || 0;
      i === 0 ? ctx.moveTo(px(i), py(v)) : ctx.lineTo(px(i), py(v));
    });
    ctx.stroke();

    serie.forEach((r, i) => {
      const v = Number(r.resultado) || 0;
      ctx.fillStyle = r.sucesso === null || r.sucesso === undefined ? c.fraco
        : (Number(r.sucesso) === 1 ? c.sinalClaro : c.perda);
      ctx.beginPath();
      ctx.arc(px(i), py(v), 3, 0, Math.PI * 2);
      ctx.fill();
    });

    el('legendaHistorico').textContent =
      `Últimas ${serie.length} rolagens, da mais antiga para a mais recente. A linha roxa é a média móvel de 5.`;
  }

  /* --- Teia: comparação entre perícias ---------------------------------- */
  function grafComparacao() {
    const caixa = el('caixaComparacao');
    const lista = porPericia().filter(p => p.n >= 3).slice(0, 8);
    if (lista.length < 3) {
      return vazio(caixa, 'A comparação aparece quando houver pelo menos três perícias com três rolagens cada. Assim a média significa alguma coisa.');
    }
    ocupado(caixa);
    const { ctx, larg, alt } = tela(el('canvasComparacao'), 300);
    const c = cores();
    const cx = larg / 2, cy = alt / 2 + 6, raio = Math.min(larg, alt) / 2 - 52;
    const maximo = Math.max(...lista.map(p => p.media)) * 1.15;
    const n = lista.length;
    const ponto = (i, valor) => {
      const ang = -Math.PI / 2 + (i / n) * Math.PI * 2;
      const d = (valor / maximo) * raio;
      return [cx + Math.cos(ang) * d, cy + Math.sin(ang) * d];
    };

    // Teia de fundo
    ctx.strokeStyle = c.linha;
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(f => {
      ctx.beginPath();
      lista.forEach((_, i) => {
        const [x, y] = ponto(i, maximo * f);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.closePath(); ctx.stroke();
    });
    lista.forEach((p, i) => {
      const [x, y] = ponto(i, maximo);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
      const [tx, ty] = ponto(i, maximo * 1.16);
      ctx.fillStyle = c.fraco;
      ctx.textAlign = tx > cx + 4 ? 'left' : (tx < cx - 4 ? 'right' : 'center');
      ctx.fillText(cortar(p.nome, 12), tx, ty + 4);
    });

    // Polígono das médias
    ctx.beginPath();
    lista.forEach((p, i) => {
      const [x, y] = ponto(i, p.media);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(143,174,82,0.22)';
    ctx.fill();
    ctx.strokeStyle = c.sinal;
    ctx.lineWidth = 2;
    ctx.stroke();

    lista.forEach((p, i) => {
      const [x, y] = ponto(i, p.media);
      ctx.fillStyle = c.sinalClaro;
      ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fill();
    });

    el('legendaComparacao').textContent =
      'Média do resultado em cada perícia com três ou mais rolagens. Quanto mais longe do centro, melhor o desempenho.';
  }

  /* --- Resumo e tabela --------------------------------------------------- */
  function pintarResumo() {
    const r = resumo();
    const campos = {
      resTotal: r ? r.quantidade : '0',
      resMedia: r ? r.media.toFixed(1) : '—',
      resMaior: r ? r.maior : '—',
      resMenor: r ? r.menor : '—',
      resSucesso: r && r.testes ? Math.round((r.sucessos / r.testes) * 100) + '%' : '—',
      resTestes: r ? r.testes : '0'
    };
    Object.keys(campos).forEach(id => { el(id).textContent = campos[id]; });
  }

  function pintarTabela() {
    const corpo = el('tabelaRolagens');
    corpo.innerHTML = '';
    if (!rolagens.length) {
      corpo.innerHTML = '<tr><td colspan="6" class="tabela-vazia">Nenhuma rolagem registrada neste recorte.</td></tr>';
      return;
    }
    rolagens.slice(0, 40).forEach(r => {
      const skill = SKILLS.find(s => s.id === r.atributo_usado);
      const quando = r.rolado_em ? new Date(r.rolado_em) : null;
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${quando ? quando.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}</td>` +
        `<td>${escapar(r.personagem_nome || nomeDe(r.slug))}</td>` +
        `<td>${skill ? escapar(skill.nome) : '—'}</td>` +
        `<td>D${r.dado_lados || 20}: ${r.valor_dado}${r.valor_atributo ? ' + ' + r.valor_atributo : ''}</td>` +
        `<td class="td-forte">${r.resultado}</td>` +
        `<td>${r.dificuldade == null ? '—'
             : `CD ${r.dificuldade} · <span class="${Number(r.sucesso) === 1 ? 'is-sucesso' : 'is-falha'}">${Number(r.sucesso) === 1 ? 'sucesso' : 'falha'}</span>`}</td>`;
      corpo.appendChild(tr);
    });
  }

  function nomeDe(slug) {
    const p = Roster.porId(slug);
    return p ? p.nome : '—';
  }

  function desenharTudo() {
    pintarResumo();
    grafDistribuicao();
    grafSucesso();
    grafPericias();
    grafHistorico();
    grafComparacao();
    pintarTabela();
  }

  /* --- Ajudantes --------------------------------------------------------- */
  function vazio(caixa, texto) {
    caixa.classList.add('is-vazia');
    const aviso = caixa.querySelector('.grafico-vazio');
    aviso.textContent = texto;
  }
  function ocupado(caixa) { caixa.classList.remove('is-vazia'); }
  function cortar(t, n) { return t.length > n ? t.slice(0, n - 1) + '…' : t; }
  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  /* --- Partida ----------------------------------------------------------- */
  montarFiltroPersonagens();
  await carregarRolagens();

  let redesenho;
  window.addEventListener('resize', () => {
    clearTimeout(redesenho);
    redesenho = setTimeout(desenharTudo, 200);
  });
  // O tema claro/escuro troca as cores do canvas: redesenha ao alternar.
  const alternar = document.getElementById('themeToggle');
  if (alternar) alternar.addEventListener('click', () => setTimeout(desenharTudo, 60));
});
