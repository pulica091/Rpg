/* =======================================================================
   contador.js — O CONTADOR REGRESSIVO DA CAMPANHA
   (SEMANA · DIA · HORA · MINUTO)

   Duas coisas moram aqui:

   1) ContadorSync — a camada de estado. É a ÚNICA parte do site que sabe
      onde o contador está guardado. Hoje ela funciona sem banco (grava no
      localStorage e avisa as outras abas); quando o Worker + D1 estiverem
      de pé, preencha API.base e vire API.ativo = true — nenhuma outra
      linha do site muda, porque tudo conversa só com este objeto.

   2) O painel de placas (split-flap): aquele contador antigo de aeroporto,
      em que cada número é uma plaquinha que cai. Ele lê o estado e desenha.

   -----------------------------------------------------------------------
   COMO O TEMPO É CONTADO (o mesmo raciocínio do schema.sql)
   -----------------------------------------------------------------------
   O banco guarda "quantos segundos faltavam" (restante) e "quando foi essa
   última anotação" (atualizado_em). Rodando, qualquer pessoa calcula:

       falta = restante - (agora - atualizado_em) * multiplicador

   Por isso o contador NÃO é local: quem abrir o site daqui a duas horas vê
   o tempo já descontado, e quem trocar o multiplicador muda o ritmo para
   todo mundo. Pausado/parado, o restante fica congelado.

   -----------------------------------------------------------------------
   PRA LIGAR NO SEU BANCO
   -----------------------------------------------------------------------
     GET  {base}/contador
          -> { "rotulo":"...", "total_inicial":2419200, "restante":2419200,
               "multiplicador":1, "status":"rodando",
               "iniciado_em":"2026-09-18T20:00:00Z",
               "atualizado_em":"2026-09-18T20:00:00Z", "versao":7 }

     POST {base}/contador        (SÓ O MESTRE — exige chave/sessão de admin)
          corpo: { "acao":"pausar", "chave":"...", ...dados }
          ações: iniciar · pausar · continuar · reiniciar · zerar ·
                 definir_tempo {segundos} · definir_inicial {segundos, aplicar}
                 multiplicador {valor} · rotulo {texto}
          -> devolve o mesmo formato do GET (já com versao nova)

   A tabela está em ../schema.sql (bloco "CONTADOR REGRESSIVO").
   ======================================================================= */

(function () {
  'use strict';

  // Uma configuração só pro site inteiro: a de js/api.js. Se esta página
  // não carregar api.js, cai num objeto local e roda em modo sem banco.
  var API = (typeof window !== 'undefined' && window.API)
    ? window.API
    : { base: '', ativo: false };

  var CHAVE_LOCAL = 'rpg2-contador';
  var SEMANA = 604800, DIA = 86400, HORA = 3600, MINUTO = 60;
  var PADRAO_SEGUNDOS = 4 * SEMANA;          // 4 semanas — a contagem padrão

  /* Estado "de fábrica". Só é usado se o banco/localStorage ainda estiver
     vazio; nada aqui é mostrado por cima do que vier do servidor. */
  function estadoPadrao() {
    var agora = new Date().toISOString();
    return {
      rotulo: 'Colisão da Terra-616',
      total_inicial: PADRAO_SEGUNDOS,
      restante: PADRAO_SEGUNDOS,
      multiplicador: 1,
      status: 'parado',
      iniciado_em: null,
      atualizado_em: agora,
      versao: 1
    };
  }

  /* =====================================================================
     1) CAMADA DE ESTADO
     ===================================================================== */
  var ContadorSync = {
    ler: function () {
      if (API.ativo && API.base) {
        return fetch(API.base + '/contador', { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .catch(function () { return lerLocal(); });
      }
      return Promise.resolve(lerLocal());
    },

    /** Só o mestre chama isto (admin.html). Devolve o estado já alterado. */
    acao: function (acao, dados, chave) {
      var corpo = Object.assign({ acao: acao, chave: chave || '' }, dados || {});
      if (API.ativo && API.base) {
        return fetch(API.base + '/contador', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corpo)
        }).then(function (r) {
          if (!r.ok) throw new Error('recusado');
          return r.json();
        });
      }
      return Promise.resolve(aplicarLocal(acao, dados || {}));
    },

    /** Quantos segundos faltam AGORA, considerando status e multiplicador. */
    restante: function (e) {
      if (!e) return 0;
      var base = Math.max(0, Number(e.restante) || 0);
      if (e.status !== 'rodando') return base;
      var desde = (Date.now() - new Date(e.atualizado_em).getTime()) / 1000;
      if (!isFinite(desde) || desde < 0) desde = 0;
      return Math.max(0, base - desde * (Number(e.multiplicador) || 1));
    },

    /** Quebra segundos em semanas/dias/horas/minutos (sempre pra baixo). */
    partes: function (segundos) {
      var s = Math.max(0, Math.floor(segundos));
      var semanas = Math.floor(s / SEMANA); s -= semanas * SEMANA;
      var dias    = Math.floor(s / DIA);    s -= dias * DIA;
      var horas   = Math.floor(s / HORA);   s -= horas * HORA;
      var minutos = Math.floor(s / MINUTO);
      return { semanas: semanas, dias: dias, horas: horas, minutos: minutos, segundos: s % 60 };
    },

    /** Monta segundos a partir dos quatro campos do painel do mestre. */
    montar: function (semanas, dias, horas, minutos) {
      return Math.max(0,
        (Number(semanas) || 0) * SEMANA +
        (Number(dias)    || 0) * DIA +
        (Number(horas)   || 0) * HORA +
        (Number(minutos) || 0) * MINUTO);
    },

    padrao: PADRAO_SEGUNDOS,
    unidades: { SEMANA: SEMANA, DIA: DIA, HORA: HORA, MINUTO: MINUTO }
  };

  /* --- Modo sem banco ---------------------------------------------------
     Guarda no localStorage com a MESMA forma que o banco devolve, pra
     trocar de modo não exigir mudança nenhuma no resto do site. */
  function lerLocal() {
    try {
      var bruto = localStorage.getItem(CHAVE_LOCAL);
      if (!bruto) return estadoPadrao();
      return Object.assign(estadoPadrao(), JSON.parse(bruto));
    } catch (e) { return estadoPadrao(); }
  }

  function gravarLocal(e) {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(e)); } catch (err) {}
    return e;
  }

  /* Congela o restante no instante atual — é o que permite pausar e trocar
     a velocidade sem perder nem ganhar tempo. */
  function congelar(e) {
    e.restante = Math.round(ContadorSync.restante(e));
    e.atualizado_em = new Date().toISOString();
    if (e.restante <= 0 && e.status === 'rodando') e.status = 'zerado';
    return e;
  }

  function aplicarLocal(acao, d) {
    var e = congelar(lerLocal());
    var agora = new Date().toISOString();

    switch (acao) {
      case 'iniciar':
        if (e.restante <= 0) e.restante = e.total_inicial;
        e.status = 'rodando';
        e.iniciado_em = e.iniciado_em || agora;
        break;
      case 'pausar':
        if (e.status === 'rodando') e.status = 'pausado';
        break;
      case 'continuar':
        if (e.restante > 0) e.status = 'rodando';
        break;
      case 'reiniciar':
        e.restante = e.total_inicial;
        e.status = 'rodando';
        e.iniciado_em = agora;
        break;
      case 'zerar':
        e.restante = 0;
        e.status = 'zerado';
        break;
      case 'definir_tempo':
        e.restante = Math.max(0, Math.floor(Number(d.segundos) || 0));
        if (e.restante === 0) e.status = 'zerado';
        else if (e.status === 'zerado') e.status = 'pausado';
        break;
      case 'definir_inicial':
        e.total_inicial = Math.max(0, Math.floor(Number(d.segundos) || 0));
        if (d.aplicar) {
          e.restante = e.total_inicial;
          e.status = d.rodar ? 'rodando' : 'pausado';
          e.iniciado_em = agora;
        }
        break;
      case 'multiplicador':
        e.multiplicador = Math.max(0.1, Number(d.valor) || 1);
        break;
      case 'rotulo':
        e.rotulo = String(d.texto || '').slice(0, 60) || e.rotulo;
        break;
    }

    e.atualizado_em = agora;
    e.versao = (Number(e.versao) || 1) + 1;
    return gravarLocal(e);
  }

  /* =====================================================================
     2) O PAINEL DE PLACAS
     Cada dígito é uma plaquinha dividida ao meio. Quando o número muda, a
     metade de cima da placa velha CAI por cima da metade de baixo — é a
     mesma mecânica dos contadores de estação de trem.
     ===================================================================== */
  var UNIDADES = [
    { chave: 'semanas', um: 'SEMANA',  muitos: 'SEMANAS' },
    { chave: 'dias',    um: 'DIA',     muitos: 'DIAS' },
    { chave: 'horas',   um: 'HORA',    muitos: 'HORAS' },
    { chave: 'minutos', um: 'MINUTO',  muitos: 'MINUTOS' }
  ];

  function montarPainel(raiz) {
    raiz.classList.add('flipboard');
    raiz.innerHTML = '';

    UNIDADES.forEach(function (u, i) {
      var grupo = document.createElement('div');
      grupo.className = 'flip-group';
      grupo.dataset.unidade = u.chave;

      var placas = document.createElement('div');
      placas.className = 'flip-digits';
      for (var d = 0; d < 2; d++) placas.appendChild(criarDigito());
      grupo.appendChild(placas);

      var rot = document.createElement('span');
      rot.className = 'flip-label';
      rot.textContent = u.muitos;
      grupo.appendChild(rot);

      raiz.appendChild(grupo);

      if (i < UNIDADES.length - 1) {
        var junta = document.createElement('span');
        junta.className = 'flip-joint';
        junta.setAttribute('aria-hidden', 'true');
        raiz.appendChild(junta);
      }
    });
  }

  function criarDigito() {
    var d = document.createElement('div');
    d.className = 'flip-digit';
    d.dataset.valor = '0';
    d.innerHTML =
      '<div class="fd-half fd-top"><span>0</span></div>' +
      '<div class="fd-half fd-bottom"><span>0</span></div>' +
      '<div class="fd-half fd-top fd-leaf fd-leaf-top"><span>0</span></div>' +
      '<div class="fd-half fd-bottom fd-leaf fd-leaf-bottom"><span>0</span></div>' +
      '<i class="fd-seam" aria-hidden="true"></i>';
    return d;
  }

  function virarDigito(digito, novo) {
    var antigo = digito.dataset.valor;
    if (antigo === novo) return;
    digito.dataset.valor = novo;

    var topo      = digito.querySelector('.fd-top:not(.fd-leaf) span');
    var base      = digito.querySelector('.fd-bottom:not(.fd-leaf) span');
    var folhaTopo = digito.querySelector('.fd-leaf-top span');
    var folhaBase = digito.querySelector('.fd-leaf-bottom span');

    // Metade de cima já mostra o número novo (escondida atrás da placa que cai);
    // a de baixo segura o número velho até a placa terminar de tombar.
    topo.textContent = novo;
    folhaTopo.textContent = antigo;
    folhaBase.textContent = novo;

    digito.classList.remove('is-flipping');
    void digito.offsetWidth;                 // reinicia a animação
    digito.classList.add('is-flipping');

    clearTimeout(digito._t);
    digito._t = setTimeout(function () {
      base.textContent = novo;
      digito.classList.remove('is-flipping');
    }, 560);
  }

  function pintarPainel(raiz, partes, animar) {
    UNIDADES.forEach(function (u) {
      var grupo = raiz.querySelector('.flip-group[data-unidade="' + u.chave + '"]');
      if (!grupo) return;
      var valor = Math.min(99, partes[u.chave]);
      var texto = (valor < 10 ? '0' : '') + valor;
      var digitos = grupo.querySelectorAll('.flip-digit');

      digitos.forEach(function (dig, i) {
        if (animar) {
          virarDigito(dig, texto[i]);
        } else {
          dig.dataset.valor = texto[i];
          dig.querySelectorAll('span').forEach(function (s) { s.textContent = texto[i]; });
        }
      });

      var rot = grupo.querySelector('.flip-label');
      if (rot) rot.textContent = valor === 1 ? u.um : u.muitos;
    });
  }

  /* =====================================================================
     3) O RELÓGIO QUE RODA NA PÁGINA
     ===================================================================== */
  var estado = null;
  var ouvintes = [];
  var painel = null;
  var primeiroDesenho = true;

  function desenhar() {
    if (!estado) return;            // ainda esperando a primeira leitura
    var falta = ContadorSync.restante(estado);
    var partes = ContadorSync.partes(falta);

    if (painel) {
      pintarPainel(painel, partes, !primeiroDesenho);
      primeiroDesenho = false;
    }

    document.querySelectorAll('.js-contador-rotulo').forEach(function (el) {
      el.textContent = (estado && estado.rotulo) || '';
    });

    var vel = estado && Number(estado.multiplicador) || 1;
    document.querySelectorAll('.js-contador-estado').forEach(function (el) {
      el.textContent = textoEstado(estado, vel);
    });

    var corpo = document.body;
    if (corpo) {
      corpo.classList.toggle('contador-rodando', !!estado && estado.status === 'rodando');
      corpo.classList.toggle('contador-zerado', falta <= 0 && !!estado && estado.status !== 'parado');
      corpo.classList.toggle('contador-pausado', !!estado && estado.status === 'pausado');
    }
    if (painel) {
      painel.classList.toggle('is-parado', !estado || estado.status !== 'rodando');
      painel.classList.toggle('is-zerado', falta <= 0);
      painel.classList.toggle('is-acelerado', vel > 1);
    }

    ouvintes.forEach(function (fn) { fn(falta, estado); });
  }

  function textoEstado(e, vel) {
    if (!e) return '';
    if (e.status === 'zerado')  return 'a contagem chegou ao fim';
    if (e.status === 'parado')  return 'contagem ainda não iniciada';
    if (e.status === 'pausado') return 'contagem interrompida pelo mestre';
    return vel > 1 ? 'correndo a ' + formatarVel(vel) + ' do tempo normal' : 'em ritmo normal';
  }

  function formatarVel(v) {
    var n = Math.round(v * 100) / 100;
    return (n % 1 === 0 ? n : n.toFixed(2)) + '×';
  }

  function sincronizar() {
    return ContadorSync.ler().then(function (e) {
      if (!e) return;
      // Se o mestre mexeu (versão nova), redesenha na hora.
      estado = e;
      desenhar();
    });
  }

  function iniciar() {
    painel = document.getElementById('contadorFlip');
    if (painel) montarPainel(painel);

    sincronizar();
    setInterval(desenhar, 1000);      // o tique local, entre consultas
    setInterval(sincronizar, 15000);  // a fonte da verdade, pra todo mundo bater

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) sincronizar();
    });
    window.addEventListener('storage', function (ev) {
      if (ev.key === CHAVE_LOCAL) sincronizar();
    });
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  ContadorSync.aoTicar = function (fn) { ouvintes.push(fn); };
  ContadorSync.sincronizar = sincronizar;
  ContadorSync.formatarVelocidade = formatarVel;
  ContadorSync.montarPainel = montarPainel;
  ContadorSync.pintarPainel = pintarPainel;
  window.ContadorSync = ContadorSync;
})();
