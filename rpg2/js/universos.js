/* =======================================================================
   universos.js — OS UNIVERSOS E O ESTADO DAS INCURSÕES

   A fila de universos e o estado de cada um moram no banco (tabela
   `universo`). Esta página só desenha o que o banco disser — a ordem, quem
   está em incursão e quem já foi destruído não estão escritos aqui.

   ESTADOS
     principal  a casa (Terra-616). Nunca entra em incursão.
     destruido  já deixou de existir: fragmentado, escuro, apagado.
     incursao   em rota de colisão agora: anéis roxos, tremor e falhas.
     intacto    ainda não chegou a vez dele.

   A REGRA DA FILA
   Quando o mestre destrói o universo em incursão, o PRÓXIMO da ordem que
   ainda estiver intacto assume a incursão. Essa promoção é feita no
   servidor (worker/worker.js, rota /universos/destruir) justamente pra
   não ser uma sequência fixa no JavaScript: o front nunca decide quem é
   o próximo, ele só lê o resultado.

   Enquanto o banco não está ligado, o espelho local abaixo repete a mesma
   regra pra dar pra testar a campanha inteira sem servidor.
   ======================================================================= */

(function () {
  'use strict';

  var CHAVE_LOCAL = 'rpg2-universos';

  /* A fila de fábrica. Só é usada se o banco (ou o espelho local) ainda
     estiver vazio — a partir daí, quem manda é o estado guardado. */
  var PADRAO = [
    { ordem: 1, codigo: '616', nome: 'Terra-616', descricao: 'A casa. Tudo que sobrou depende dela.', estado: 'principal' },
    { ordem: 2, codigo: '000', nome: 'Origins',   descricao: 'A primeira realidade alcançada pelo portal. Não existe mais.', estado: 'destruido' },
    { ordem: 3, codigo: '424', nome: 'Marvel',    descricao: 'Em rota de colisão com a 616 agora.', estado: 'incursao' },
    { ordem: 4, codigo: '523', nome: 'Fallout',   descricao: 'Leitura estável. Ainda não é a vez dela.', estado: 'intacto' },
    { ordem: 5, codigo: '190', nome: 'WWII',      descricao: 'Leitura estável. Ainda não é a vez dela.', estado: 'intacto' },
    { ordem: 6, codigo: '9%#', nome: 'Infinity',  descricao: 'Leitura corrompida. O instrumento não fecha um código.', estado: 'intacto' }
  ];

  var UniversosSync = {
    ler: function () {
      if (temBanco()) {
        return DB.pedir('/universos').catch(function () { return lerLocal(); });
      }
      return Promise.resolve(lerLocal());
    },

    /** Destrói o universo em incursão (ou o código pedido) e promove o próximo. */
    destruir: function (codigo, chave) {
      if (temBanco()) {
        return DB.pedir('/universos/destruir', { metodo: 'POST', corpo: { codigo: codigo, chave: chave } })
          .then(function (r) { return r.universos; });
      }
      return Promise.resolve(destruirLocal(codigo));
    },

    definirEstado: function (codigo, estado, chave) {
      if (temBanco()) {
        return DB.pedir('/universos/estado', { metodo: 'POST', corpo: { codigo: codigo, estado: estado, chave: chave } })
          .then(function (r) { return r.universos; });
      }
      return Promise.resolve(estadoLocal(codigo, estado));
    },

    definirOrdem: function (codigos, chave) {
      if (temBanco()) {
        return DB.pedir('/universos/ordem', { metodo: 'POST', corpo: { codigos: codigos, chave: chave } })
          .then(function (r) { return r.universos; });
      }
      return Promise.resolve(ordemLocal(codigos));
    },

    restaurarPadrao: function () { return Promise.resolve(gravarLocal(clonar(PADRAO))); }
  };

  function temBanco() { return typeof DB !== 'undefined' && DB.ligado(); }
  function clonar(x) { return JSON.parse(JSON.stringify(x)); }

  function lerLocal() {
    try {
      var b = localStorage.getItem(CHAVE_LOCAL);
      if (!b) return gravarLocal(clonar(PADRAO));
      var lista = JSON.parse(b);
      return lista.sort(function (a, b2) { return a.ordem - b2.ordem; });
    } catch (e) { return clonar(PADRAO); }
  }

  function gravarLocal(lista) {
    lista.sort(function (a, b) { return a.ordem - b.ordem; });
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(lista)); } catch (e) {}
    return lista;
  }

  /* A mesma regra do servidor, repetida aqui só pro modo sem banco. */
  function destruirLocal(codigo) {
    var lista = lerLocal();
    var alvo = codigo ? acha(lista, codigo) : lista.find(function (u) { return u.estado === 'incursao'; });
    if (!alvo || alvo.estado === 'principal') return lista;

    alvo.estado = 'destruido';
    alvo.destruido_em = new Date().toISOString();

    var proximo = lista.find(function (u) { return u.ordem > alvo.ordem && u.estado === 'intacto'; })
               || lista.find(function (u) { return u.estado === 'intacto'; });
    if (proximo) proximo.estado = 'incursao';
    return gravarLocal(lista);
  }

  function estadoLocal(codigo, estado) {
    var lista = lerLocal();
    if (estado === 'incursao') {
      lista.forEach(function (u) { if (u.estado === 'incursao') u.estado = 'intacto'; });
    }
    var u = acha(lista, codigo);
    if (u) {
      u.estado = estado;
      u.destruido_em = estado === 'destruido' ? new Date().toISOString() : null;
    }
    return gravarLocal(lista);
  }

  function ordemLocal(codigos) {
    var lista = lerLocal();
    codigos.forEach(function (c, i) { var u = acha(lista, c); if (u) u.ordem = i + 1; });
    return gravarLocal(lista);
  }

  function acha(lista, codigo) {
    return lista.find(function (u) { return String(u.codigo) === String(codigo); });
  }

  /* =====================================================================
     DESENHO DO CAMPO DE UNIVERSOS
     ===================================================================== */
  var ROTULO = {
    principal: 'PRINCIPAL',
    destruido: 'DESTRUÍDO',
    incursao:  'INCURSÃO ATUAL',
    intacto:   'INTACTO'
  };

  function desenhar(lista) {
    var campo = document.getElementById('universoCampo');
    if (!campo) return;

    campo.innerHTML = lista.map(function (u, i) {
      var corpo = u.estado === 'destruido'
        ? '<span class="uni-corpo uni-corpo--roto">' +
            '<i class="caco caco--1"></i><i class="caco caco--2"></i><i class="caco caco--3"></i>' +
            '<i class="caco caco--4"></i><i class="caco caco--5"></i>' +
          '</span>'
        : '<span class="uni-corpo"></span>';

      // Os anéis só existem no universo em incursão: são eles que dizem,
      // sem legenda nenhuma, quem está vindo na direção da 616.
      var aneis = u.estado === 'incursao'
        ? '<span class="uni-aneis" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
          '<span class="uni-falha" aria-hidden="true"></span>'
        : '';

      return fragmento(u, i, corpo, aneis);
    }).join('');
  }

  function fragmento(u, i, corpo, aneis) {
    return '<article class="uni uni--' + u.estado + '" data-codigo="' + escapar(u.codigo) + '">' +
      '<div class="uni-palco">' + aneis + corpo + '</div>' +
      '<div class="uni-ficha">' +
        '<span class="uni-ordem">' + (i + 1) + '</span>' +
        '<h3>' + escapar(u.nome) + '</h3>' +
        '<span class="uni-codigo">' + escapar(u.codigo) + '</span>' +
        '<p>' + escapar(u.descricao || '') + '</p>' +
        '<span class="uni-selo">' + (ROTULO[u.estado] || u.estado) + '</span>' +
      '</div>' +
    '</article>';
  }

  /* A mesma fonte de dados, em forma de ficha de arquivo — é o que a
     página do Multiverso mostra. Sem universo escrito no HTML lá também. */
  function desenharFichas(lista) {
    var caixa = document.getElementById('universoFichas');
    if (!caixa) return;

    var ESTADO_TEXTO = {
      principal: 'realidade base · nossa casa',
      destruido: 'não existe mais',
      incursao:  'em rota de colisão com a 616',
      intacto:   'identificada · sem contato ainda'
    };

    caixa.innerHTML = lista.map(function (u) {
      var perdidas = u.estado === 'destruido';
      return '<article class="universe uni-ficha-cartao uni-ficha-cartao--' + u.estado + '" data-dust>' +
        '<span class="universe-id">' + escapar(u.codigo) + '</span>' +
        '<h3>' + escapar(u.nome) + '</h3>' +
        '<span class="universe-sub">' + ESTADO_TEXTO[u.estado] + '</span>' +
        '<p>' + escapar(u.descricao || '') + '</p>' +
        '<ul class="universe-facts">' +
          '<li><b>ESTADO</b><span>' + (ROTULO[u.estado] || u.estado).toLowerCase() + '</span></li>' +
          '<li><b>POSIÇÃO NA FILA</b><span>' + u.ordem + 'º</span></li>' +
          '<li><b>CONTATO</b><span>' + (perdidas ? 'encerrado'
            : (u.estado === 'incursao' ? 'acontecendo agora' : 'não iniciado')) + '</span></li>' +
        '</ul>' +
      '</article>';
    }).join('');
  }

  function escapar(t) {
    return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function atualizar() {
    return UniversosSync.ler().then(function (lista) {
      desenhar(lista);
      desenharFichas(lista);
      var emIncursao = lista.find(function (u) { return u.estado === 'incursao'; });
      document.querySelectorAll('.js-universo-incursao').forEach(function (el) {
        el.textContent = emIncursao ? (emIncursao.nome + ' · ' + emIncursao.codigo) : 'nenhum';
      });
      var perdidos = lista.filter(function (u) { return u.estado === 'destruido'; }).length;
      document.querySelectorAll('.js-universo-perdidos').forEach(function (el) {
        el.textContent = perdidos;
      });
      return lista;
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('universoCampo') &&
        !document.getElementById('universoFichas')) return;
    atualizar();
    // Outro jogador (ou o mestre) pode mudar o estado enquanto a página
    // está aberta: reconsulta de tempos em tempos e ao voltar pra aba.
    setInterval(atualizar, 20000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) atualizar(); });
    window.addEventListener('storage', function (e) { if (e.key === CHAVE_LOCAL) atualizar(); });
  });

  UniversosSync.atualizar = atualizar;
  UniversosSync.padrao = PADRAO;
  window.UniversosSync = UniversosSync;
})();
