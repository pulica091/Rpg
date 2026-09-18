/* =======================================================================
   dust.js — O EFEITO ASSINATURA DO RPG II: coisas virando pó.

   Como usar no HTML: basta marcar o elemento.

     <a class="sector" data-dust>...</a>         -> pode virar pó
     <button class="btn" data-dust="hover">      -> solta pó ao passar o mouse
     <div data-dust="ambient">                   -> some e volta sozinho

   Valores aceitos em data-dust:
     "ambient" (padrão) - entra no sorteio da poeira ambiente: de tempos
                          em tempos o site escolhe um elemento marcado,
                          desintegra e remonta. É o que dá a sensação de
                          "a página está sendo atingida".
     "hover"            - solta só um punhado de partículas na borda
                          quando o ponteiro encosta. O elemento NÃO some
                          (usado nos botões: ninguém perde um botão no
                          meio do clique).
     "never"            - fica marcado pro estilo, mas não desintegra.

   Regras de segurança do efeito (importantes):
   - Nada some de verdade: o elemento volta sempre, com a mesma altura,
     porque usamos visibilidade/opacidade e nunca display:none.
   - Nunca desintegra algo que a pessoa está usando (com foco, com o
     ponteiro em cima, ou dentro de um formulário sendo preenchido).
   - Respeita prefers-reduced-motion: quem pediu menos movimento no
     sistema não vê nada disso.
   ======================================================================= */

(function () {
  'use strict';

  var reduzido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --- Paleta das partículas: os tons da campanha, nada além. --------- */
  var CORES = [
    'var(--signal-soft)',
    'var(--signal)',
    'var(--rift)',
    'var(--text-dim)'
  ];

  /* -------------------------------------------------------------------
     Solta um punhado de partículas por cima de um elemento.
     quantidade: quantos pontinhos; lado: 'all' (do bloco inteiro) ou
     'edge' (só na borda direita, usado no hover dos botões).
     ------------------------------------------------------------------- */
  function soltarPo(el, quantidade, lado) {
    if (reduzido) return;

    var campo = document.createElement('div');
    campo.className = 'dust-field';

    var estilo = window.getComputedStyle(el);
    if (estilo.position === 'static') el.style.position = 'relative';

    var caixa = el.getBoundingClientRect();
    var i, mote, x, y, vida;

    for (i = 0; i < quantidade; i++) {
      mote = document.createElement('i');
      mote.className = 'dust-mote';

      if (lado === 'edge') {
        x = caixa.width - Math.random() * Math.min(26, caixa.width);
      } else {
        // Concentra à direita: o pó é "arrancado" nessa direção.
        x = caixa.width * (0.25 + Math.pow(Math.random(), 0.6) * 0.75);
      }
      y = Math.random() * caixa.height;
      vida = 700 + Math.random() * 900;

      mote.style.left = x + 'px';
      mote.style.top = y + 'px';
      mote.style.setProperty('--mote-x', (14 + Math.random() * 46) + 'px');
      mote.style.setProperty('--mote-y', (-10 - Math.random() * 44) + 'px');
      mote.style.setProperty('--mote-life', vida + 'ms');
      mote.style.setProperty('--mote-delay', (Math.random() * 420) + 'ms');
      mote.style.setProperty('--mote-color', CORES[(Math.random() * CORES.length) | 0]);
      if (Math.random() > 0.78) { mote.style.width = '3px'; mote.style.height = '3px'; }

      campo.appendChild(mote);
    }

    el.appendChild(campo);
    setTimeout(function () { campo.remove(); }, 1800);
  }

  /* -------------------------------------------------------------------
     Desintegra um elemento e o remonta depois. Devolve uma Promise só
     pra quem quiser encadear (o minigame usa isso).
     ------------------------------------------------------------------- */
  function desintegrar(el, opcoes) {
    opcoes = opcoes || {};
    var duracao = opcoes.duracao || 1100;
    var pausa   = opcoes.pausa   || 700;   // quanto tempo fica "sumido"
    var voltar  = opcoes.voltar !== false;

    return new Promise(function (resolve) {
      if (reduzido || el.dataset.dusting === '1') { resolve(); return; }
      el.dataset.dusting = '1';

      var altura = el.getBoundingClientRect().height;
      el.style.setProperty('--dust-time', duracao + 'ms');

      soltarPo(el, Math.min(90, Math.max(24, Math.round(altura / 3))), 'all');
      el.classList.add('is-dusting');

      setTimeout(function () {
        el.classList.remove('is-dusting');
        if (!voltar) {
          el.style.visibility = 'hidden';
          delete el.dataset.dusting;
          resolve();
          return;
        }
        el.style.visibility = 'hidden';

        setTimeout(function () {
          el.style.visibility = '';
          el.classList.add('is-reforming');
          setTimeout(function () {
            el.classList.remove('is-reforming');
            delete el.dataset.dusting;
            resolve();
          }, 640);
        }, pausa);
      }, duracao);
    });
  }

  /* -------------------------------------------------------------------
     Pode desintegrar agora? (não atrapalhar quem está usando a página)
     ------------------------------------------------------------------- */
  function estaLivre(el) {
    if (!el.isConnected) return false;
    if (el.dataset.dusting === '1') return false;
    if (el.matches(':hover')) return false;
    if (el.contains(document.activeElement)) return false;
    if (el.querySelector('input, select, textarea')) return false;

    // Só desintegra o que está visível na tela — pó fora de vista é
    // desperdício de processamento e ninguém vê.
    var c = el.getBoundingClientRect();
    return c.top < window.innerHeight - 40 && c.bottom > 40;
  }

  /* -------------------------------------------------------------------
     POEIRA AMBIENTE
     De tempos em tempos escolhe um elemento marcado e o desintegra.
     O intervalo encurta bastante quando a página está em incursão
     (body.is-incursion) e encurta de novo no minuto final
     (body.is-critical).
     ------------------------------------------------------------------- */
  function intervaloAtual() {
    var b = document.body;
    if (b.classList.contains('is-critical'))  return 2200 + Math.random() * 2200;
    if (b.classList.contains('is-incursion')) return 5000 + Math.random() * 5000;
    return 13000 + Math.random() * 14000;
  }

  function cicloAmbiente() {
    setTimeout(function () {
      if (!document.hidden) {
        var alvos = Array.prototype.filter.call(
          document.querySelectorAll('[data-dust]'),
          function (el) {
            var modo = el.dataset.dust || 'ambient';
            return (modo === 'ambient' || modo === '') && estaLivre(el);
          }
        );
        if (alvos.length) {
          var critico = document.body.classList.contains('is-critical');
          desintegrar(alvos[(Math.random() * alvos.length) | 0], {
            duracao: critico ? 800 : 1100,
            pausa: critico ? 900 : 650
          });
        }
      }
      cicloAmbiente();
    }, intervaloAtual());
  }

  /* -------------------------------------------------------------------
     Ligação com o HTML
     ------------------------------------------------------------------- */
  document.addEventListener('DOMContentLoaded', function () {
    if (reduzido) return;

    // Todo botão do site solta pó de borda ao ser tocado pelo ponteiro,
    // sem precisar marcar um por um no HTML. Quem já veio marcado no HTML
    // (com outro modo, tipo "ambient") mantém o que foi escrito lá.
    document.querySelectorAll('.btn, .family-btn, .nav-links a').forEach(function (el) {
      if (!el.hasAttribute('data-dust')) el.setAttribute('data-dust', 'hover');
    });

    // Botões e links marcados como "hover": só soltam pó da borda.
    document.querySelectorAll('[data-dust="hover"]').forEach(function (el) {
      var ultimo = 0;
      el.addEventListener('mouseenter', function () {
        var agora = Date.now();
        if (agora - ultimo < 600) return;  // não exagera se a pessoa varre a tela
        ultimo = agora;
        soltarPo(el, 16, 'edge');
      });
    });

    cicloAmbiente();
  });

  /* Exposto pra outros scripts (o minigame e a contagem usam). */
  window.Dust = {
    desintegrar: desintegrar,
    soltar: soltarPo
  };
})();
