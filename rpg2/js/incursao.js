/* =======================================================================
   incursao.js — A CONTAGEM DA INCURSÃO

   Duas coisas moram aqui:

   1) IncursaoSync — a camada que guarda/lê o estado da contagem.
      Hoje ela funciona SEM banco: grava no localStorage e avisa as
      outras abas do mesmo navegador. Quando você ligar o Cloudflare
      Worker + D1, é SÓ preencher API.base lá embaixo — nenhuma outra
      linha do site precisa mudar, porque todas as páginas conversam
      apenas com o objeto IncursaoSync.

   2) O console da bomba dimensional (só em incursoes.html): três etapas
      pra armar. Quando a terceira fecha, a contagem de 10 minutos começa
      de verdade e passa a aparecer em TODAS as páginas do RPG II.

   -----------------------------------------------------------------------
   PRA LIGAR NO SEU BANCO (leia antes de mexer)
   -----------------------------------------------------------------------
   Preencha API.base com a URL do seu Worker e ponha API.ativo = true.
   O site espera dois endpoints:

     GET  {base}/incursao
          -> { "ativa": true, "fim_em": "2026-09-17T21:40:00Z",
               "universo": "u-final", "armada_por": "Tio" }
          (se não houver contagem: { "ativa": false })

     POST {base}/incursao       corpo JSON:
          { "universo": "u-final", "armada_por": "Tio", "duracao": 600 }
          -> devolve o mesmo formato do GET

   O schema da tabela está em schema.sql (bloco "RPG II — INCURSÃO").
   Enquanto API.ativo for false, tudo roda local e você pode testar a
   experiência inteira sem back-end.
   ======================================================================= */

(function () {
  'use strict';

  var API = {
    base:  '',      // ex.: 'https://rpg-api.seu-dominio.workers.dev'
    ativo: false    // vire pra true quando o endpoint estiver de pé
  };

  var DURACAO_PADRAO = 600;          // 10 minutos, em segundos
  var CHAVE_LOCAL = 'rpg2-incursao'; // usada só no modo sem banco

  /* =====================================================================
     1) CAMADA DE ESTADO
     ===================================================================== */
  var IncursaoSync = {
    /** Lê o estado atual. Sempre devolve uma Promise. */
    ler: function () {
      if (API.ativo && API.base) {
        return fetch(API.base + '/incursao', { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .catch(function () { return lerLocal(); });
      }
      return Promise.resolve(lerLocal());
    },

    /** Arma a bomba: registra o fim da contagem. */
    armar: function (universo, quem, duracao) {
      duracao = duracao || DURACAO_PADRAO;
      var corpo = { universo: universo, armada_por: quem || 'anônimo', duracao: duracao };

      if (API.ativo && API.base) {
        return fetch(API.base + '/incursao', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo)
        }).then(function (r) { return r.json(); })
          .catch(function () { return armarLocal(corpo); });
      }
      return Promise.resolve(armarLocal(corpo));
    },

    /** Quantos segundos faltam (0 se não houver contagem). */
    restante: function (estado) {
      if (!estado || !estado.ativa || !estado.fim_em) return 0;
      var falta = (new Date(estado.fim_em).getTime() - Date.now()) / 1000;
      return falta > 0 ? Math.floor(falta) : 0;
    }
  };

  function lerLocal() {
    try {
      var bruto = localStorage.getItem(CHAVE_LOCAL);
      if (!bruto) return { ativa: false };
      var e = JSON.parse(bruto);
      if (new Date(e.fim_em).getTime() <= Date.now()) return { ativa: false, terminou: true, universo: e.universo };
      return e;
    } catch (err) { return { ativa: false }; }
  }

  function armarLocal(corpo) {
    var estado = {
      ativa: true,
      universo: corpo.universo,
      armada_por: corpo.armada_por,
      fim_em: new Date(Date.now() + corpo.duracao * 1000).toISOString()
    };
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(estado)); } catch (e) {}
    return estado;
  }

  /* =====================================================================
     2) A CONTAGEM VISÍVEL EM TODAS AS PÁGINAS
     ===================================================================== */
  function formatar(segundos) {
    var m = Math.floor(segundos / 60);
    var s = segundos % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  var estadoAtual = { ativa: false };
  var ouvintes = [];   // quem quiser reagir ao tique (a página de incursões usa)

  function aplicarEstado() {
    var falta = IncursaoSync.restante(estadoAtual);
    var corpo = document.body;

    corpo.classList.toggle('is-incursion', falta > 0);
    corpo.classList.toggle('is-critical', falta > 0 && falta <= 60);

    var relogio = document.getElementById('hudClock');
    if (relogio) relogio.textContent = formatar(falta);

    // O nome do alvo aparece em mais de um lugar (barra fixa + relógio do
    // console). Atualiza todos: o id da barra e qualquer .js-hud-target.
    if (estadoAtual.universo) {
      var alvo = document.getElementById('hudTarget');
      if (alvo) alvo.textContent = estadoAtual.universo;
      document.querySelectorAll('.js-hud-target').forEach(function (el) {
        el.textContent = estadoAtual.universo;
      });
    }

    ouvintes.forEach(function (fn) { fn(falta, estadoAtual); });

    // Chegou a zero: a colisão acontece.
    if (estadoAtual.ativa && falta === 0) {
      estadoAtual = { ativa: false, terminou: true, universo: estadoAtual.universo };
      colidir();
    }
  }

  /* Sequência de colisão: a página é engolida por alguns segundos. */
  function colidir() {
    document.body.classList.remove('is-incursion', 'is-critical');
    try { localStorage.removeItem(CHAVE_LOCAL); } catch (e) {}

    if (window.Dust) {
      var pedacos = document.querySelectorAll('[data-dust], section .plate, .sector, .universe');
      Array.prototype.slice.call(pedacos, 0, 14).forEach(function (el, i) {
        setTimeout(function () { window.Dust.desintegrar(el, { duracao: 900, pausa: 1400 }); }, i * 110);
      });
    }
    ouvintes.forEach(function (fn) { fn(0, { ativa: false, terminou: true }); });
  }

  function iniciarRelogio() {
    IncursaoSync.ler().then(function (e) {
      estadoAtual = e || { ativa: false };
      aplicarEstado();
    });

    setInterval(aplicarEstado, 1000);

    // Re-consulta a fonte da verdade de tempos em tempos (e sempre que a
    // aba volta ao primeiro plano), pra pegar contagem armada por outra
    // pessoa. Com banco ligado, é isso que faz todo mundo ver junto.
    setInterval(function () {
      IncursaoSync.ler().then(function (e) { if (e) estadoAtual = e; });
    }, 10000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) IncursaoSync.ler().then(function (e) { if (e) estadoAtual = e; });
    });
    window.addEventListener('storage', function (ev) {
      if (ev.key === CHAVE_LOCAL) IncursaoSync.ler().then(function (e) { if (e) estadoAtual = e; });
    });
  }

  /* =====================================================================
     3) CONSOLE DA BOMBA DIMENSIONAL (só roda se a página tiver o console)
     ===================================================================== */
  function montarConsole() {
    var consoleEl = document.getElementById('bomb');
    if (!consoleEl) return;

    var etapas   = consoleEl.querySelectorAll('.bomb-stage');
    var pontos   = consoleEl.querySelectorAll('.bomb-step-dot');
    var msg      = document.getElementById('bombMsg');
    var instrucao= document.getElementById('bombInstruction');
    var painelArmar = document.getElementById('bombArm');
    var painelRelogio = document.getElementById('bombRunning');

    var etapaAtual = 0;

    function dizer(texto, tipo) {
      msg.textContent = texto;
      msg.className = 'bomb-msg' + (tipo ? ' is-' + tipo : '');
    }

    function irPara(n) {
      etapaAtual = n;
      etapas.forEach(function (e, i) { e.classList.toggle('is-active', i === n); });
      pontos.forEach(function (p, i) {
        p.classList.toggle('is-done', i < n);
        p.classList.toggle('is-now', i === n);
      });
      instrucao.innerHTML = INSTRUCOES[n] || '';
    }

    var INSTRUCOES = [
      'Três canais de ressonância chegam desalinhados. Arraste cada um até <b>travar</b> na frequência da fenda.',
      'O detonador repete o padrão que recebeu do outro lado. <b>Repita na mesma ordem.</b>',
      'Duas chaves, duas mãos. <b>Segure as duas ao mesmo tempo</b> até o carregamento encher.'
    ];

    /* --- ETAPA 1: alinhar três frequências ---------------------------- */
    var freqs = consoleEl.querySelectorAll('.freq');
    var alvos = [];

    function sortearFrequencias() {
      alvos = [];
      freqs.forEach(function (f) {
        var alvo = 12 + Math.floor(Math.random() * 76);
        alvos.push(alvo);
        var range = f.querySelector('input');
        // Começa longe do alvo, pra ter o que ajustar.
        var inicio = alvo > 50 ? alvo - (25 + Math.random() * 20) : alvo + (25 + Math.random() * 20);
        range.value = Math.max(0, Math.min(100, Math.round(inicio)));
        f.classList.remove('is-locked');
        atualizarFreq(f, alvos[Array.prototype.indexOf.call(freqs, f)]);
      });
    }

    function atualizarFreq(f, alvo) {
      var v = Number(f.querySelector('input').value);
      var delta = v - alvo;
      var leitura = f.querySelector('.freq-read');
      var travado = Math.abs(delta) <= 2;
      f.classList.toggle('is-locked', travado);
      leitura.textContent = travado ? 'TRAVADO' : (delta > 0 ? '+' : '') + delta.toFixed(0);
    }

    freqs.forEach(function (f, i) {
      f.querySelector('input').addEventListener('input', function () {
        atualizarFreq(f, alvos[i]);
        if (Array.prototype.every.call(freqs, function (x) { return x.classList.contains('is-locked'); })) {
          dizer('Ressonância estável. Detonador respondendo.', 'good');
          setTimeout(function () { irPara(1); dizer(''); iniciarSequencia(); }, 900);
        }
      });
    });

    /* --- ETAPA 2: repetir a sequência --------------------------------- */
    var teclas = consoleEl.querySelectorAll('.seq-key');
    var trilha = consoleEl.querySelectorAll('.seq-trace i');
    var padrao = [];
    var passo = 0;
    var aceitando = false;

    function iniciarSequencia() {
      padrao = [];
      for (var i = 0; i < 5; i++) padrao.push((Math.random() * teclas.length) | 0);
      passo = 0;
      atualizarTrilha();
      tocarPadrao();
    }

    function atualizarTrilha() {
      trilha.forEach(function (t, i) { t.classList.toggle('is-on', i < passo); });
    }

    function tocarPadrao() {
      aceitando = false;
      dizer('Recebendo padrão…');
      teclas.forEach(function (t) { t.disabled = true; });

      padrao.forEach(function (idx, i) {
        setTimeout(function () {
          teclas[idx].classList.add('is-lit');
          setTimeout(function () { teclas[idx].classList.remove('is-lit'); }, 300);
        }, 700 + i * 520);
      });

      setTimeout(function () {
        aceitando = true;
        teclas.forEach(function (t) { t.disabled = false; });
        dizer('Repita.', '');
      }, 700 + padrao.length * 520 + 200);
    }

    teclas.forEach(function (tecla, idx) {
      tecla.addEventListener('click', function () {
        if (!aceitando) return;

        if (idx === padrao[passo]) {
          tecla.classList.add('is-lit');
          setTimeout(function () { tecla.classList.remove('is-lit'); }, 180);
          passo++;
          atualizarTrilha();
          if (passo === padrao.length) {
            aceitando = false;
            dizer('Padrão aceito. Chaves liberadas.', 'good');
            setTimeout(function () { irPara(2); dizer(''); }, 900);
          }
        } else {
          aceitando = false;
          tecla.classList.add('is-wrong');
          dizer('Padrão rejeitado. O detonador reenviou outro.', 'bad');
          if (window.Dust) window.Dust.soltar(consoleEl.querySelector('.seq-grid'), 40, 'all');
          setTimeout(function () {
            tecla.classList.remove('is-wrong');
            iniciarSequencia();
          }, 1200);
        }
      });
    });

    /* --- ETAPA 3: segurar as duas chaves ------------------------------ */
    var chaves = consoleEl.querySelectorAll('.keyhold');
    var barra  = document.getElementById('holdMeter');
    var SEGURAR_MS = 3000;
    var inicioSegurada = 0;
    var loopSegurada = null;

    function segurando() {
      return Array.prototype.every.call(chaves, function (c) { return c.classList.contains('is-held'); });
    }

    function verificarSeguradas() {
      if (segurando()) {
        if (!inicioSegurada) {
          inicioSegurada = Date.now();
          dizer('Carregando o núcleo. Não solte.', '');
          loopSegurada = setInterval(function () {
            var passado = Date.now() - inicioSegurada;
            barra.style.width = Math.min(100, (passado / SEGURAR_MS) * 100) + '%';
            if (passado >= SEGURAR_MS) {
              clearInterval(loopSegurada);
              loopSegurada = null;
              armarAgora();
            }
          }, 60);
        }
      } else if (inicioSegurada) {
        inicioSegurada = 0;
        clearInterval(loopSegurada);
        loopSegurada = null;
        barra.style.width = '0%';
        dizer('Núcleo descarregou. As duas chaves, ao mesmo tempo.', 'bad');
      }
    }

    chaves.forEach(function (c) {
      ['mousedown', 'touchstart', 'pointerdown'].forEach(function (ev) {
        c.addEventListener(ev, function (e) { e.preventDefault(); c.classList.add('is-held'); verificarSeguradas(); });
      });
      ['mouseup', 'mouseleave', 'touchend', 'touchcancel', 'pointerup', 'pointerleave'].forEach(function (ev) {
        c.addEventListener(ev, function () { c.classList.remove('is-held'); verificarSeguradas(); });
      });
      // Teclado: espaço/enter alternam o estado da chave, pra funcionar
      // sem mouse (duas chaves = duas teclas, uma em cada botão).
      c.addEventListener('keydown', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); c.classList.add('is-held'); verificarSeguradas(); }
      });
      c.addEventListener('keyup', function (e) {
        if (e.key === ' ' || e.key === 'Enter') { c.classList.remove('is-held'); verificarSeguradas(); }
      });
    });

    /* --- ARMOU ---------------------------------------------------------- */
    function armarAgora() {
      var universo = (document.getElementById('bombTarget') || {}).value || 'incursão final';
      var quem = '';
      try { quem = localStorage.getItem('rpg2-session') || ''; } catch (e) {}

      dizer('BOMBA ARMADA.', 'good');
      chaves.forEach(function (c) { c.classList.remove('is-held'); });

      IncursaoSync.armar(universo, quem || 'mesa', DURACAO_PADRAO).then(function (e) {
        estadoAtual = e;
        aplicarEstado();
        if (window.Dust) {
          window.Dust.desintegrar(painelArmar, { duracao: 900, voltar: false }).then(mostrarRelogio);
        } else {
          painelArmar.style.display = 'none';
          mostrarRelogio();
        }
      });
    }

    function mostrarRelogio() {
      painelArmar.style.display = 'none';
      painelRelogio.style.display = 'block';
    }

    /* --- Estado inicial do console -------------------------------------
       Se já tem contagem rodando (armada aqui ou por outra pessoa),
       o console não pede pra armar de novo: mostra o relógio. */
    ouvintes.push(function (falta) {
      var rodando = falta > 0;
      painelArmar.style.display   = rodando ? 'none'  : 'block';
      painelRelogio.style.display = rodando ? 'block' : 'none';
      var digitos = document.getElementById('bombDigits');
      if (digitos) digitos.textContent = formatar(falta);
    });

    sortearFrequencias();
    irPara(0);
  }

  /* =====================================================================
     4) PARTIDA
     ===================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    iniciarRelogio();
    montarConsole();
  });

  window.IncursaoSync = IncursaoSync;
})();
