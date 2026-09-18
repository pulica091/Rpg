/* =======================================================================
   bomba.js — A BOMBA DIMENSIONAL (4 etapas)

   A bomba é usada QUATRO vezes na campanha e nenhuma delas pode ser igual
   à anterior. Por isso aqui não existe puzzle escrito à mão: existe um
   GERADOR. Cada ativação sorteia uma semente e, a partir dela, monta:

     1. FIOS      — 16 pontas (8 de cada lado), cores, números e a REGRA de
                    ligação mudam; os fios se cruzam de propósito.
     2. MEMÓRIA   — 7 dígitos coloridos, mostrados uma vez e escondidos.
     3. COMANDOS  — sequência de teclas/setas contra o relógio; errou, volta
                    ao começo e a bomba fica mais instável.
     4. ANÉIS     — 3 ou 4 anéis acoplados: girar um mexe em outro.

   A semente vem do banco (BombaSync), então a mesa inteira vê o MESMO
   painel — e uma ativação passada nunca se repete, porque a semente antiga
   fica registrada.

   -----------------------------------------------------------------------
   PRA LIGAR NO SEU BANCO
   -----------------------------------------------------------------------
     GET  {base}/bomba            -> { "numero_uso":2, "semente":839201,
                                       "etapa":1, "concluida":false }
     POST {base}/bomba/etapa      -> { "etapa":3 }
     POST {base}/bomba/concluir   -> fecha a ativação (abre a próxima no GET)
     POST {base}/bomba/reiniciar  -> só o mestre; zera os usos

   Tabela em ../schema.sql (bloco "ATIVAÇÕES DA BOMBA DIMENSIONAL").
   Enquanto API.ativo for false, tudo roda local e dá pra testar inteiro.
   ======================================================================= */

(function () {
  'use strict';

  // Mesma configuração do resto do site (js/api.js). Sem api.js na página,
  // cai num objeto local e roda em modo sem banco.
  var API = (typeof window !== 'undefined' && window.API)
    ? window.API
    : { base: '', ativo: false };
  var CHAVE_LOCAL = 'rpg2-bomba';
  var TOTAL_USOS = 4;

  /* =====================================================================
     0) SORTEIO COM SEMENTE
     Um gerador determinístico (mulberry32): mesma semente, mesmo painel
     pra todo mundo da mesa; semente nova, painel completamente diferente.
     ===================================================================== */
  function Sorteio(semente) {
    var s = semente >>> 0;
    function rnd() {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    return {
      real: rnd,
      inteiro: function (min, max) { return min + Math.floor(rnd() * (max - min + 1)); },
      escolher: function (lista) { return lista[Math.floor(rnd() * lista.length)]; },
      embaralhar: function (lista) {
        var a = lista.slice();
        for (var i = a.length - 1; i > 0; i--) {
          var j = Math.floor(rnd() * (i + 1));
          var t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
      },
      pegar: function (lista, n) { return this.embaralhar(lista).slice(0, n); },
      moeda: function (p) { return rnd() < (p === undefined ? 0.5 : p); }
    };
  }

  /* =====================================================================
     1) ESTADO DA ATIVAÇÃO (banco ou localStorage)
     ===================================================================== */
  var BombaSync = {
    ler: function () {
      if (API.ativo && API.base) {
        return fetch(API.base + '/bomba', { cache: 'no-store' })
          .then(function (r) { return r.json(); })
          .catch(lerLocal);
      }
      return Promise.resolve(lerLocal());
    },
    etapa: function (n) {
      if (API.ativo && API.base) {
        return postar('/bomba/etapa', { etapa: n }).catch(function () { return gravarEtapaLocal(n); });
      }
      return Promise.resolve(gravarEtapaLocal(n));
    },
    concluir: function (quem) {
      if (API.ativo && API.base) {
        return postar('/bomba/concluir', { concluida_por: quem || '' }).catch(concluirLocal);
      }
      return Promise.resolve(concluirLocal());
    },
    novaAtivacao: function () {
      var e = lerLocal();
      var usados = e.sementes || [];
      var semente;
      do { semente = (Math.random() * 4294967295) >>> 0; } while (usados.indexOf(semente) !== -1);
      usados.push(semente);
      var novo = {
        numero_uso: e.concluida ? (e.numero_uso || 0) + 1 : (e.numero_uso || 1),
        semente: semente,
        etapa: 1,
        concluida: false,
        sementes: usados
      };
      return gravarLocal(novo);
    },
    reiniciar: function () {
      return gravarLocal({ numero_uso: 1, semente: (Math.random() * 4294967295) >>> 0, etapa: 1, concluida: false, sementes: [] });
    },
    totalUsos: TOTAL_USOS
  };

  function postar(rota, corpo) {
    return fetch(API.base + rota, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corpo || {})
    }).then(function (r) { return r.json(); });
  }

  function lerLocal() {
    try {
      var bruto = localStorage.getItem(CHAVE_LOCAL);
      if (!bruto) {
        var s = (Math.random() * 4294967295) >>> 0;
        return gravarLocal({ numero_uso: 1, semente: s, etapa: 1, concluida: false, sementes: [s] });
      }
      return JSON.parse(bruto);
    } catch (e) {
      return { numero_uso: 1, semente: (Math.random() * 4294967295) >>> 0, etapa: 1, concluida: false, sementes: [] };
    }
  }
  function gravarLocal(e) {
    try { localStorage.setItem(CHAVE_LOCAL, JSON.stringify(e)); } catch (err) {}
    return e;
  }
  function gravarEtapaLocal(n) { var e = lerLocal(); e.etapa = n; return gravarLocal(e); }
  function concluirLocal() { var e = lerLocal(); e.concluida = true; e.etapa = 5; return gravarLocal(e); }

  /* =====================================================================
     2) MATERIAIS SORTEÁVEIS
     ===================================================================== */
  var CORES = [
    { id: 'vermelho', nome: 'VERMELHO', hex: '#a8392c' },
    { id: 'azul',     nome: 'AZUL',     hex: '#33608c' },
    { id: 'amarelo',  nome: 'AMARELO',  hex: '#b89a2b' },
    { id: 'verde',    nome: 'VERDE',    hex: '#4f7f3c' },
    { id: 'roxo',     nome: 'ROXO',     hex: '#6d4c8a' },
    { id: 'branco',   nome: 'BRANCO',   hex: '#cfcabb' },
    { id: 'laranja',  nome: 'LARANJA',  hex: '#b56a2a' },
    { id: 'marrom',   nome: 'MARROM',   hex: '#6e4c33' }
  ];

  var GLIFOS = ['Ψ','Ω','Δ','Λ','Σ','Φ','Θ','Ξ','Π','Γ','⊕','⊗','⊙','⊘','✦','✧','⋔','∴','⍟','⌇','Я','Ж','Ϟ','Ѯ'];

  var SETAS  = ['↑','↓','←','→'];
  var LETRAS = ['A','B','C','K','M','X','Z','R','T','V'];
  var NUMS   = ['2','4','6','9','7','3'];

  /* =====================================================================
     3) O GERADOR — é aqui que cada uso da bomba vira um painel diferente
     ===================================================================== */
  function gerarConfiguracao(semente) {
    var r = Sorteio(semente);

    /* --- ETAPA 1 · FIOS ------------------------------------------------
       8 bornes de cada lado (16 pontas de fio no total). Cada borne tem
       cor e número gravados. A REGRA de quem liga com quem é sorteada —
       é o que o jogador precisa descobrir na plaqueta rebitada. */
    var coresFio   = r.embaralhar(CORES);
    var numsEsq    = r.embaralhar([1,2,3,4,5,6,7,8]);
    var regras     = ['cor', 'avanco', 'soma', 'dobro', 'oposta'];
    var regra      = r.escolher(regras);
    var avanco     = r.inteiro(1, 7);

    // Pares de cores "opostas" (só usados na regra 'oposta'): 4 duplas.
    var baralhoCor = r.embaralhar(coresFio.slice(0, 8));
    var duplas = [];
    for (var i = 0; i < 8; i += 2) duplas.push([baralhoCor[i].id, baralhoCor[i + 1].id]);
    function oposta(id) {
      for (var k = 0; k < duplas.length; k++) {
        if (duplas[k][0] === id) return duplas[k][1];
        if (duplas[k][1] === id) return duplas[k][0];
      }
      return id;
    }

    var esquerda = numsEsq.map(function (n, i) {
      return { lado: 'e', id: 'e' + i, numero: n, cor: coresFio[i] };
    });

    // O lado direito recebe as mesmas 8 cores e os mesmos 8 números, mas
    // embaralhados de novo — é isso que faz os fios se cruzarem.
    var numsDir  = r.embaralhar([1,2,3,4,5,6,7,8]);
    var coresDir = r.embaralhar(coresFio.slice(0, 8));
    var direita  = numsDir.map(function (n, i) {
      return { lado: 'd', id: 'd' + i, numero: n, cor: coresDir[i] };
    });

    function alvoDe(b) {
      switch (regra) {
        case 'cor':    return direita.find(function (x) { return x.cor.id === b.cor.id; });
        case 'oposta': return direita.find(function (x) { return x.cor.id === oposta(b.cor.id); });
        case 'avanco': return direita.find(function (x) { return x.numero === ((b.numero - 1 + avanco) % 8) + 1; });
        case 'soma':   return direita.find(function (x) { return x.numero === 9 - b.numero; });
        case 'dobro':  return direita.find(function (x) { return x.numero === (b.numero * 2) % 9; });
      }
    }
    var gabaritoFios = {};
    esquerda.forEach(function (b) { var alvo = alvoDe(b); if (alvo) gabaritoFios[b.id] = alvo.id; });

    var textoRegra = {
      cor:    'LIGUE CADA BORNE AO DE MESMA COR',
      oposta: 'LIGUE CADA BORNE À COR CONJUGADA (VER TABELA)',
      avanco: 'LIGUE O BORNE Nº N AO BORNE Nº N + ' + avanco + ' (VOLTA AO 1 DEPOIS DO 8)',
      soma:   'LIGUE OS BORNES CUJOS NÚMEROS SOMEM 9',
      dobro:  'LIGUE O BORNE Nº N AO BORNE Nº 2N (RESTO DE 9)'
    }[regra];

    /* --- ETAPA 2 · MEMÓRIA --------------------------------------------- */
    var digitos = r.pegar([0,1,2,3,4,5,6,7,8,9], 7);
    var coresMem = r.pegar(CORES, 7);
    var memoria = digitos.map(function (d, i) { return { digito: d, cor: coresMem[i] }; });
    var revisoes = r.inteiro(1, 2);           // quantas vezes dá pra pedir de novo
    var msVisor  = r.inteiro(780, 1000);      // tempo de cada dígito no visor

    /* --- ETAPA 3 · COMANDOS -------------------------------------------- */
    var qtdComandos = r.inteiro(8, 12);
    var repertorio  = r.embaralhar(
      r.pegar(SETAS, r.inteiro(3, 4))
        .concat(r.pegar(LETRAS, r.inteiro(3, 4)))
        .concat(r.pegar(NUMS, r.inteiro(2, 3)))
    );
    var comandos = [];
    for (var c = 0; c < qtdComandos; c++) {
      // Repetição proposital: às vezes o mesmo comando vem duas vezes seguidas.
      if (c > 0 && r.moeda(0.18)) comandos.push(comandos[c - 1]);
      else comandos.push(r.escolher(repertorio));
    }
    var segundosPorComando = 1.35 + r.real() * 0.55;
    var tempoComandos = Math.round(qtdComandos * segundosPorComando);
    var tecladoComandos = r.embaralhar(repertorio);

    /* --- ETAPA 4 · ANÉIS ------------------------------------------------
       O acoplamento é o coração: girar o anel i também gira o anel j.
       Pra garantir que SEMPRE tem solução, partimos do estado alinhado e
       embaralhamos com movimentos legais — o caminho de volta existe. */
    var qtdAneis  = r.inteiro(3, 4);
    var posicoes  = r.escolher([6, 8]);
    var glifos    = r.pegar(GLIFOS, qtdAneis * posicoes);
    var aneis = [];
    for (var a = 0; a < qtdAneis; a++) {
      aneis.push({ simbolos: glifos.slice(a * posicoes, (a + 1) * posicoes), offset: 0 });
    }

    // Matriz de acoplamento: acopl[i][j] = quanto o anel j anda quando o i gira.
    var acopl = [];
    for (var x = 0; x < qtdAneis; x++) {
      acopl.push([]);
      for (var y = 0; y < qtdAneis; y++) acopl[x].push(x === y ? 1 : 0);
    }
    var ligacoes = r.inteiro(qtdAneis - 1, qtdAneis + 1);
    for (var l = 0; l < ligacoes; l++) {
      var de = r.inteiro(0, qtdAneis - 1);
      var para = r.inteiro(0, qtdAneis - 1);
      if (de === para) para = (para + 1) % qtdAneis;
      acopl[de][para] = r.escolher([1, -1, 2, -2]);
    }

    var movimentos = r.inteiro(5, 10);        // quantos giros embaralham
    var estadoInicial = new Array(qtdAneis).fill(0);
    for (var m = 0; m < movimentos; m++) {
      var anel = r.inteiro(0, qtdAneis - 1);
      var dir  = r.moeda() ? 1 : -1;
      for (var j2 = 0; j2 < qtdAneis; j2++) {
        estadoInicial[j2] = (((estadoInicial[j2] + dir * acopl[anel][j2]) % posicoes) + posicoes) % posicoes;
      }
    }
    // Se o embaralhamento voltou ao zero por azar, empurra um giro.
    if (estadoInicial.every(function (v) { return v === 0; })) {
      for (var j3 = 0; j3 < qtdAneis; j3++) {
        estadoInicial[j3] = (((estadoInicial[j3] + acopl[0][j3]) % posicoes) + posicoes) % posicoes;
      }
    }

    return {
      semente: semente,
      fios: {
        esquerda: esquerda, direita: direita, gabarito: gabaritoFios,
        regra: regra, textoRegra: textoRegra,
        duplas: regra === 'oposta' ? duplas : null
      },
      memoria: { sequencia: memoria, revisoes: revisoes, msVisor: msVisor },
      comandos: {
        sequencia: comandos, teclado: tecladoComandos,
        tempo: tempoComandos
      },
      aneis: {
        quantidade: qtdAneis, posicoes: posicoes,
        aneis: aneis, acoplamento: acopl,
        inicial: estadoInicial, movimentos: movimentos
      }
    };
  }

  /* =====================================================================
     4) PAINEL — a carcaça, comum às quatro etapas
     ===================================================================== */
  var ETAPAS = [
    { n: 1, nome: 'CONEXÃO DOS FIOS',   sub: 'painel traseiro aberto' },
    { n: 2, nome: 'REGISTRO DE MEMÓRIA', sub: 'visor de tambor' },
    { n: 3, nome: 'ESTABILIZAÇÃO',       sub: 'teclado de comando' },
    { n: 4, nome: 'RECALIBRAÇÃO',        sub: 'anéis dimensionais' }
  ];

  function Bomba(raiz) {
    this.raiz = raiz;
    this.instabilidade = 0;
    this.etapa = 1;
    this.config = null;
    this.ativacao = null;
  }

  Bomba.prototype.carregar = function () {
    var self = this;
    return BombaSync.ler().then(function (a) {
      if (a.concluida) a = BombaSync.novaAtivacao();
      self.ativacao = a;
      self.config = gerarConfiguracao(a.semente);
      self.etapa = Math.min(4, a.etapa || 1);
      self.desenhar();
    });
  };

  Bomba.prototype.novaAtivacao = function () {
    var a = BombaSync.novaAtivacao();
    this.ativacao = a;
    this.config = gerarConfiguracao(a.semente);
    this.etapa = 1;
    this.instabilidade = 0;
    this.desenhar();
  };

  Bomba.prototype.desenhar = function () {
    var uso = this.ativacao.numero_uso;
    this.raiz.innerHTML =
      '<div class="bd-carcaca">' +
        '<div class="bd-parafusos" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +

        '<header class="bd-cabecalho">' +
          '<div class="bd-etiqueta">' +
            '<span class="bd-etiqueta-marca">DISP. DE ENCERRAMENTO DIMENSIONAL</span>' +
            '<strong>MOD. 616-K · PROTÓTIPO</strong>' +
            '<span class="bd-etiqueta-serie">SÉRIE ' + serieDaSemente(this.config.semente) +
              ' · ATIVAÇÃO ' + uso + (uso <= TOTAL_USOS ? ' DE ' + TOTAL_USOS : '') + '</span>' +
          '</div>' +
          '<div class="bd-manometro" title="Instabilidade do núcleo">' +
            '<svg viewBox="0 0 120 74" aria-hidden="true">' +
              '<path class="bd-mano-arco" d="M14 66 A46 46 0 0 1 106 66" />' +
              '<path class="bd-mano-arco bd-mano-perigo" d="M84 26 A46 46 0 0 1 106 66" />' +
              '<g class="bd-mano-agulha"><line x1="60" y1="66" x2="60" y2="24" /></g>' +
              '<circle class="bd-mano-pino" cx="60" cy="66" r="5" />' +
            '</svg>' +
            '<span>INSTABILIDADE</span>' +
          '</div>' +
        '</header>' +

        '<div class="bd-travas">' + ETAPAS.map(function (e) {
          return '<div class="bd-trava" data-etapa="' + e.n + '">' +
                   '<i class="bd-trava-lingueta"></i>' +
                   '<span class="bd-trava-nome">' + e.nome + '</span>' +
                   '<span class="bd-trava-sub">' + e.sub + '</span>' +
                 '</div>';
        }).join('') + '</div>' +

        '<div class="bd-palco" id="bdPalco"></div>' +

        '<p class="bd-fala" id="bdFala"></p>' +
      '</div>';

    this.palco = this.raiz.querySelector('#bdPalco');
    this.fala  = this.raiz.querySelector('#bdFala');
    this.atualizarTravas();
    this.atualizarManometro();
    this.abrirEtapa(this.etapa);
  };

  function serieDaSemente(s) {
    return ('0000' + (s % 9973)).slice(-4) + '-' + String.fromCharCode(65 + (s % 26));
  }

  Bomba.prototype.dizer = function (texto, tipo) {
    this.fala.textContent = texto || '';
    this.fala.className = 'bd-fala' + (tipo ? ' is-' + tipo : '');
  };

  Bomba.prototype.atualizarTravas = function () {
    var self = this;
    this.raiz.querySelectorAll('.bd-trava').forEach(function (t) {
      var n = Number(t.dataset.etapa);
      t.classList.toggle('is-feita', n < self.etapa);
      t.classList.toggle('is-agora', n === self.etapa);
    });
  };

  /* A instabilidade não mata ninguém: ela treme a carcaça, acende a agulha
     e, no vermelho, obriga a refazer a etapa atual. É pressão, não punição. */
  Bomba.prototype.sacudir = function (quanto) {
    this.instabilidade = Math.min(100, this.instabilidade + (quanto || 12));
    this.atualizarManometro();
    var c = this.raiz.querySelector('.bd-carcaca');
    c.classList.remove('is-tremendo');
    void c.offsetWidth;
    c.classList.add('is-tremendo');
    if (window.Dust) window.Dust.soltar(c, 30, 'all');
  };

  Bomba.prototype.acalmar = function (quanto) {
    this.instabilidade = Math.max(0, this.instabilidade - (quanto || 18));
    this.atualizarManometro();
  };

  Bomba.prototype.atualizarManometro = function () {
    var g = this.raiz.querySelector('.bd-mano-agulha');
    if (!g) return;
    var angulo = -78 + (this.instabilidade / 100) * 156;
    g.style.transform = 'rotate(' + angulo + 'deg)';
    this.raiz.querySelector('.bd-carcaca')
      .classList.toggle('is-critica', this.instabilidade >= 75);
  };

  Bomba.prototype.concluirEtapa = function () {
    var self = this;
    this.acalmar(30);
    this.atualizarTravas();

    if (this.etapa >= 4) {
      BombaSync.concluir(sessao());
      this.armar();
      return;
    }
    this.etapa += 1;
    BombaSync.etapa(this.etapa);
    var palco = this.palco;
    palco.classList.add('is-trocando');
    setTimeout(function () {
      palco.classList.remove('is-trocando');
      self.atualizarTravas();
      self.abrirEtapa(self.etapa);
    }, 620);
  };

  Bomba.prototype.abrirEtapa = function (n) {
    this.atualizarTravas();
    this.dizer('');
    if (n === 1) etapaFios(this);
    else if (n === 2) etapaMemoria(this);
    else if (n === 3) etapaComandos(this);
    else etapaAneis(this);
  };

  Bomba.prototype.armar = function () {
    var self = this;
    this.palco.innerHTML =
      '<div class="bd-armada">' +
        '<p class="bd-armada-selo">NÚCLEO SELADO</p>' +
        '<p class="bd-armada-texto">As quatro travas caíram. A bomba está armada e não aceita mais comando nenhum.</p>' +
        '<button class="bd-botao" type="button" id="bdNova">preparar nova ativação</button>' +
      '</div>';
    this.dizer('BOMBA ARMADA.', 'boa');
    this.raiz.querySelectorAll('.bd-trava').forEach(function (t) { t.classList.add('is-feita'); t.classList.remove('is-agora'); });

    // Mantém o comportamento antigo do console: armar dispara a contagem
    // de incursão que já existia no site, se ela estiver por aqui.
    if (window.IncursaoSync && typeof window.IncursaoSync.armar === 'function') {
      var alvo = document.getElementById('bombTarget');
      window.IncursaoSync.armar(alvo ? alvo.value : 'incursão final', sessao() || 'mesa');
    }
    document.dispatchEvent(new CustomEvent('bomba:armada', { detail: { uso: this.ativacao.numero_uso } }));

    this.palco.querySelector('#bdNova').addEventListener('click', function () { self.novaAtivacao(); });
  };

  function sessao() {
    try { return localStorage.getItem('rpg2-session') || ''; } catch (e) { return ''; }
  }

  /* =====================================================================
     ETAPA 1 · CONEXÃO DOS FIOS
     8 bornes de cada lado, 16 pontas. Puxe a ponta solta de um borne da
     esquerda até o borne certo da direita. Os fios se cruzam — e é pra
     cruzar mesmo.
     ===================================================================== */
  function etapaFios(bomba) {
    var cfg = bomba.config.fios;
    var feitas = {};

    var tabela = cfg.duplas
      ? '<div class="fio-tabela">' + cfg.duplas.map(function (d) {
          var a = CORES.find(function (c) { return c.id === d[0]; });
          var b = CORES.find(function (c) { return c.id === d[1]; });
          return '<span><i style="background:' + a.hex + '"></i>' + a.nome +
                 ' ↔ ' + b.nome + '<i style="background:' + b.hex + '"></i></span>';
        }).join('') + '</div>'
      : '';

    bomba.palco.innerHTML =
      '<div class="bd-instrucao">Painel traseiro aberto: oito bornes de cada lado, dezesseis pontas de fio. ' +
        'A plaqueta rebitada diz como a fiação foi feita.</div>' +
      '<div class="fio-placa"><span class="fio-placa-cabeca">INSTRUÇÃO DE FIAÇÃO · GRAVADA NA CHAPA</span>' +
        '<strong>' + cfg.textoRegra + '</strong>' + tabela + '</div>' +
      '<div class="fio-quadro" id="fioQuadro">' +
        '<div class="fio-coluna fio-coluna--esq">' + cfg.esquerda.map(borneHTML).join('') + '</div>' +
        '<svg class="fio-teia" id="fioTeia" aria-hidden="true"></svg>' +
        '<div class="fio-coluna fio-coluna--dir">' + cfg.direita.map(borneHTML).join('') + '</div>' +
      '</div>' +
      '<p class="fio-contagem"><span id="fioFeitos">0</span> de 8 ligações fechadas</p>';

    function borneHTML(b) {
      return '<button type="button" class="borne borne--' + (b.lado === 'e' ? 'esq' : 'dir') + '" ' +
        'data-id="' + b.id + '" style="--cor-fio:' + b.cor.hex + '">' +
        '<span class="borne-parafuso"></span>' +
        '<span class="borne-num">' + b.numero + '</span>' +
        '<span class="borne-cor" title="' + b.cor.nome + '"></span>' +
      '</button>';
    }

    var quadro = bomba.palco.querySelector('#fioQuadro');
    var teia   = bomba.palco.querySelector('#fioTeia');
    var contador = bomba.palco.querySelector('#fioFeitos');
    var naMao = null;   // borne da esquerda que está com a ponta solta na mão

    function ponto(el) {
      var r = el.getBoundingClientRect();
      var q = quadro.getBoundingClientRect();
      var lado = el.classList.contains('borne--esq') ? 1 : -1;
      return {
        x: r.left - q.left + r.width / 2 + lado * (r.width / 2 - 6),
        y: r.top - q.top + r.height / 2
      };
    }

    /* Fio com barriga: a curva cai um pouco no meio, como cabo de borracha
       velho. Sem isso parece diagrama de circuito, não fiação. */
    function caminho(a, b) {
      var meio = (a.x + b.x) / 2;
      var barriga = 18 + Math.abs(b.y - a.y) * 0.12;
      return 'M' + a.x + ',' + a.y +
             ' C' + meio + ',' + (a.y + barriga) +
             ' ' + meio + ',' + (b.y + barriga) +
             ' ' + b.x + ',' + b.y;
    }

    function redesenhar(pontaLivre) {
      var w = quadro.clientWidth, h = quadro.clientHeight;
      teia.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      teia.setAttribute('width', w);
      teia.setAttribute('height', h);

      var partes = '';
      Object.keys(feitas).forEach(function (idE) {
        var eEl = quadro.querySelector('.borne[data-id="' + idE + '"]');
        var dEl = quadro.querySelector('.borne[data-id="' + feitas[idE] + '"]');
        var cor = cfg.esquerda.find(function (b) { return b.id === idE; }).cor.hex;
        var d = caminho(ponto(eEl), ponto(dEl));
        partes += '<path d="' + d + '" stroke="rgba(0,0,0,.55)" stroke-width="7" fill="none" transform="translate(0,2)"/>';
        partes += '<path d="' + d + '" stroke="' + cor + '" stroke-width="5" fill="none" stroke-linecap="round"/>';
      });

      if (naMao && pontaLivre) {
        var eEl2 = quadro.querySelector('.borne[data-id="' + naMao + '"]');
        var cor2 = cfg.esquerda.find(function (b) { return b.id === naMao; }).cor.hex;
        partes += '<path d="' + caminho(ponto(eEl2), pontaLivre) + '" stroke="' + cor2 +
                  '" stroke-width="5" fill="none" stroke-dasharray="1 9" stroke-linecap="round" opacity="0.9"/>';
      }
      teia.innerHTML = partes;
    }

    function relativo(ev) {
      var q = quadro.getBoundingClientRect();
      return { x: ev.clientX - q.left, y: ev.clientY - q.top };
    }

    quadro.querySelectorAll('.borne--esq').forEach(function (el) {
      el.addEventListener('pointerdown', function (ev) {
        ev.preventDefault();
        if (feitas[el.dataset.id]) {        // já ligado: solta o fio de volta
          delete feitas[el.dataset.id];
          el.classList.remove('is-ligado');
          quadro.querySelectorAll('.borne--dir').forEach(function (d) {
            if (!Object.values(feitas).includes(d.dataset.id)) d.classList.remove('is-ligado');
          });
          atualizar();
          return;
        }
        naMao = el.dataset.id;
        el.classList.add('is-na-mao');
        redesenhar(relativo(ev));
      });
    });

    quadro.addEventListener('pointermove', function (ev) {
      if (naMao) redesenhar(relativo(ev));
    });

    function tentarLigar(el, ev) {
      if (!naMao) return;
      if (ev) ev.preventDefault();
      var idE = naMao, idD = el.dataset.id;
        if (Object.values(feitas).indexOf(idD) !== -1) {
          bomba.dizer('Esse borne já está ocupado.', 'ma');
          return;
        }
      if (cfg.gabarito[idE] === idD) {
        feitas[idE] = idD;
        quadro.querySelector('.borne[data-id="' + idE + '"]').classList.add('is-ligado');
        el.classList.add('is-ligado');
        bomba.dizer('Parafuso apertado. Continuidade fechada.', 'boa');
        soltarMao();
        atualizar();
      } else {
        el.classList.add('is-faisca');
        setTimeout(function () { el.classList.remove('is-faisca'); }, 420);
        bomba.dizer('Faísca. Esse par não fecha — confira a chapa.', 'ma');
        bomba.sacudir(9);
        soltarMao();
        redesenhar(null);
      }
    }

    // Toque na tela: o dedo "prende" o evento no borne de origem, então o
    // pointerup NUNCA chega no borne de destino. Por isso descobrimos o
    // destino pelo ponto onde o dedo soltou, e não pelo alvo do evento.
    quadro.addEventListener('pointerup', function (ev) {
      if (!naMao) return;
      var sob = document.elementFromPoint(ev.clientX, ev.clientY);
      var destino = sob && sob.closest ? sob.closest('.borne--dir') : null;
      if (destino) tentarLigar(destino, ev);
      else { soltarMao(); redesenhar(null); }   // soltou no vazio: fio pendura de volta
    });

    // Toque-toque (e mouse sem arrastar): escolhe um borne, depois o outro.
    quadro.querySelectorAll('.borne--dir').forEach(function (el) {
      el.addEventListener('click', function (ev) { tentarLigar(el, ev); });
    });

    function soltarMao() {
      if (!naMao) return;
      var el = quadro.querySelector('.borne[data-id="' + naMao + '"]');
      if (el) el.classList.remove('is-na-mao');
      naMao = null;
    }

    function atualizar() {
      var n = Object.keys(feitas).length;
      contador.textContent = n;
      redesenhar(null);
      if (n === 8) {
        bomba.dizer('Fiação completa. A trava do painel cedeu.', 'boa');
        setTimeout(function () { bomba.concluirEtapa(); }, 900);
      }
    }

    window.addEventListener('resize', function () { redesenhar(null); });
    setTimeout(function () { redesenhar(null); }, 60);
  }

  /* =====================================================================
     ETAPA 2 · REGISTRO DE MEMÓRIA
     Sete dígitos coloridos passam pelo visor de tambor uma vez e a
     portinhola fecha. Depois é preciso repor número E cor, na ordem.
     ===================================================================== */
  function etapaMemoria(bomba) {
    var cfg = bomba.config.memoria;
    var respostas = [];
    var corEscolhida = null;
    var revisoesRestantes = cfg.revisoes;

    var paleta = [];
    cfg.sequencia.forEach(function (p) {
      if (!paleta.find(function (c) { return c.id === p.cor.id; })) paleta.push(p.cor);
    });
    // Embaralha a botoeira pra a ordem das cores não entregar a sequência.
    paleta = Sorteio(bomba.config.semente ^ 0x9e37).embaralhar(paleta);

    bomba.palco.innerHTML =
      '<div class="bd-instrucao">O tambor mostra sete marcas e fecha a portinhola. Reponha cada uma ' +
        '<b>na mesma ordem</b> — o número e a cor do esmalte.</div>' +
      '<div class="mem-visor" id="memVisor">' +
        '<div class="mem-portinhola" id="memPorta"></div>' +
        '<span class="mem-marca" id="memMarca">—</span>' +
        '<div class="mem-pontos" id="memPontos">' +
          cfg.sequencia.map(function () { return '<i></i>'; }).join('') +
        '</div>' +
      '</div>' +
      '<div class="mem-fita" id="memFita">' +
        cfg.sequencia.map(function (_, i) { return '<span class="mem-cela" data-i="' + i + '"></span>'; }).join('') +
      '</div>' +
      '<div class="mem-esmaltes" id="memCores">' +
        paleta.map(function (c) {
          return '<button type="button" class="mem-esmalte" data-cor="' + c.id + '" ' +
                 'style="--cor:' + c.hex + '" title="' + c.nome + '"></button>';
        }).join('') +
      '</div>' +
      '<div class="mem-teclado" id="memTeclado">' +
        [1,2,3,4,5,6,7,8,9,0].map(function (d) {
          return '<button type="button" class="mem-tecla" data-d="' + d + '">' + d + '</button>';
        }).join('') +
      '</div>' +
      '<div class="mem-alavancas">' +
        '<button type="button" class="bd-botao bd-botao--fraco" id="memApagar">apagar última</button>' +
        '<button type="button" class="bd-botao bd-botao--fraco" id="memRever">' +
          'girar o tambor de novo (<span id="memRevs">' + revisoesRestantes + '</span>)</button>' +
      '</div>';

    var marca  = bomba.palco.querySelector('#memMarca');
    var porta  = bomba.palco.querySelector('#memPorta');
    var pontos = bomba.palco.querySelectorAll('#memPontos i');
    var celas  = bomba.palco.querySelectorAll('.mem-cela');
    var visor  = bomba.palco.querySelector('#memVisor');

    function exibir() {
      travar(true);
      visor.classList.remove('is-fechado');
      porta.classList.remove('is-fechando');   // reabre a portinhola de fato
      bomba.dizer('Tambor girando. Guarde número e cor.');
      var i = 0;
      (function passo() {
        if (i >= cfg.sequencia.length) {
          marca.textContent = '—';
          marca.style.color = '';
          visor.classList.add('is-fechado');
          porta.classList.remove('is-abrindo');
          void porta.offsetWidth;
          porta.classList.add('is-fechando');
          pontos.forEach(function (p) { p.classList.remove('is-on'); });
          travar(false);
          bomba.dizer('Portinhola fechada. Reponha a sequência.');
          return;
        }
        var p = cfg.sequencia[i];
        marca.textContent = p.digito;
        marca.style.color = p.cor.hex;
        marca.classList.remove('is-batendo');
        void marca.offsetWidth;
        marca.classList.add('is-batendo');
        if (pontos[i]) pontos[i].classList.add('is-on');
        i++;
        setTimeout(passo, cfg.msVisor);
      })();
    }

    function travar(sim) {
      bomba.palco.querySelectorAll('.mem-tecla, .mem-esmalte, #memApagar, #memRever')
        .forEach(function (b) { b.disabled = sim; });
      if (!sim && revisoesRestantes <= 0) bomba.palco.querySelector('#memRever').disabled = true;
    }

    bomba.palco.querySelectorAll('.mem-esmalte').forEach(function (b) {
      b.addEventListener('click', function () {
        corEscolhida = CORES.find(function (c) { return c.id === b.dataset.cor; });
        bomba.palco.querySelectorAll('.mem-esmalte').forEach(function (o) { o.classList.remove('is-escolhida'); });
        b.classList.add('is-escolhida');
      });
    });

    bomba.palco.querySelectorAll('.mem-tecla').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!corEscolhida) { bomba.dizer('Escolha primeiro o esmalte da marca.', 'ma'); return; }
        if (respostas.length >= cfg.sequencia.length) return;
        respostas.push({ digito: Number(b.dataset.d), cor: corEscolhida });
        pintarFita();
        if (respostas.length === cfg.sequencia.length) conferir();
      });
    });

    bomba.palco.querySelector('#memApagar').addEventListener('click', function () {
      respostas.pop();
      pintarFita();
    });

    bomba.palco.querySelector('#memRever').addEventListener('click', function () {
      if (revisoesRestantes <= 0) return;
      revisoesRestantes--;
      bomba.palco.querySelector('#memRevs').textContent = revisoesRestantes;
      bomba.sacudir(8);
      respostas = [];
      pintarFita();
      exibir();
    });

    function pintarFita() {
      celas.forEach(function (c, i) {
        var r = respostas[i];
        c.textContent = r ? r.digito : '';
        c.style.color = r ? r.cor.hex : '';
        c.classList.toggle('is-posta', !!r);
      });
    }

    function conferir() {
      var certo = respostas.every(function (r, i) {
        return r.digito === cfg.sequencia[i].digito && r.cor.id === cfg.sequencia[i].cor.id;
      });
      if (certo) {
        bomba.dizer('Registro aceito.', 'boa');
        celas.forEach(function (c) { c.classList.add('is-certa'); });
        setTimeout(function () { bomba.concluirEtapa(); }, 800);
      } else {
        bomba.dizer('Registro recusado. O tambor vai repetir uma vez.', 'ma');
        bomba.sacudir(14);
        celas.forEach(function (c) { c.classList.add('is-errada'); });
        setTimeout(function () {
          celas.forEach(function (c) { c.classList.remove('is-errada'); });
          respostas = [];
          pintarFita();
          exibir();
        }, 1100);
      }
    }

    setTimeout(exibir, 700);
  }

  /* =====================================================================
     ETAPA 3 · ESTABILIZAÇÃO
     A fita de comando sai impressa e o núcleo começa a escorregar. Cada
     comando certo segura um pouco; um errado joga tudo pro começo.
     ===================================================================== */
  function etapaComandos(bomba) {
    var cfg = bomba.config.comandos;
    var pos = 0;
    var restante = cfg.tempo;
    var relogio = null;
    var vivo = true;

    bomba.palco.innerHTML =
      '<div class="bd-instrucao">A fita saiu impressa. Execute os comandos <b>na ordem</b>, pelo teclado da bomba ' +
        'ou pelo teclado do computador, antes do medidor esvaziar. Errou um: a fita volta ao começo.</div>' +
      '<div class="cmd-fita" id="cmdFita">' +
        cfg.sequencia.map(function (c, i) {
          return '<span class="cmd-passo" data-i="' + i + '">' + c + '</span>';
        }).join('') +
        '<i class="cmd-cursor" id="cmdCursor"></i>' +
      '</div>' +
      '<div class="cmd-medidor"><i id="cmdBarra"></i></div>' +
      '<p class="cmd-tempo"><span id="cmdSeg">' + cfg.tempo + '</span> s de margem</p>' +
      '<div class="cmd-teclado">' +
        cfg.teclado.map(function (t) {
          var seta = SETAS.indexOf(t) !== -1;
          return '<button type="button" class="cmd-tecla' + (seta ? ' cmd-tecla--seta' : '') +
                 '" data-cmd="' + t + '">' + t + '</button>';
        }).join('') +
      '</div>';

    var fita   = bomba.palco.querySelector('#cmdFita');
    var barra  = bomba.palco.querySelector('#cmdBarra');
    var segEl  = bomba.palco.querySelector('#cmdSeg');
    var passos = bomba.palco.querySelectorAll('.cmd-passo');

    function marcar() {
      passos.forEach(function (p, i) {
        p.classList.toggle('is-feito', i < pos);
        p.classList.toggle('is-agora', i === pos);
      });
      var atual = passos[pos];
      if (atual) fita.scrollLeft = atual.offsetLeft - fita.clientWidth / 2 + atual.clientWidth / 2;
    }

    function tique() {
      restante -= 0.1;
      if (restante <= 0) { falhar('O núcleo escorregou. Fita reiniciada.'); return; }
      segEl.textContent = Math.max(0, restante).toFixed(1);
      barra.style.width = (restante / cfg.tempo * 100) + '%';
      var aperto = 1 - restante / cfg.tempo;
      bomba.raiz.querySelector('.bd-carcaca').style.setProperty('--tremor-bomba', (aperto * 2.2).toFixed(2) + 'px');
    }

    function comecar() {
      pos = 0;
      restante = cfg.tempo;
      marcar();
      clearInterval(relogio);
      relogio = setInterval(tique, 100);
    }

    function falhar(msg) {
      bomba.dizer(msg, 'ma');
      bomba.sacudir(16);
      clearInterval(relogio);
      fita.classList.add('is-recuando');
      setTimeout(function () {
        fita.classList.remove('is-recuando');
        if (vivo) comecar();
      }, 800);
    }

    function executar(cmd) {
      if (!vivo) return;
      if (cmd === cfg.sequencia[pos]) {
        passos[pos].classList.add('is-batido');
        pos++;
        restante = Math.min(cfg.tempo, restante + 0.35);  // acertou: respira
        marcar();
        if (pos >= cfg.sequencia.length) {
          vivo = false;
          clearInterval(relogio);
          bomba.raiz.querySelector('.bd-carcaca').style.removeProperty('--tremor-bomba');
          bomba.dizer('Núcleo estabilizado.', 'boa');
          setTimeout(function () { bomba.concluirEtapa(); }, 700);
        }
      } else {
        falhar('Comando fora de ordem. Fita reiniciada.');
      }
    }

    bomba.palco.querySelectorAll('.cmd-tecla').forEach(function (b) {
      b.addEventListener('click', function () {
        b.classList.add('is-batida');
        setTimeout(function () { b.classList.remove('is-batida'); }, 130);
        executar(b.dataset.cmd);
      });
    });

    function doTeclado(ev) {
      if (!vivo || !document.body.contains(fita)) { document.removeEventListener('keydown', doTeclado); return; }
      var mapa = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
      var cmd = mapa[ev.key] || (ev.key.length === 1 ? ev.key.toUpperCase() : null);
      if (!cmd) return;
      if (cfg.teclado.indexOf(cmd) === -1) return;
      ev.preventDefault();
      var botao = bomba.palco.querySelector('.cmd-tecla[data-cmd="' + cmd + '"]');
      if (botao) { botao.classList.add('is-batida'); setTimeout(function () { botao.classList.remove('is-batida'); }, 130); }
      executar(cmd);
    }
    document.addEventListener('keydown', doTeclado);

    bomba.dizer('Fita carregada. Comece quando quiser — o tempo já está correndo.');
    comecar();
  }

  /* =====================================================================
     ETAPA 4 · RECALIBRAÇÃO DOS ANÉIS
     Anéis concêntricos de latão, acoplados por engrenagem: girar um mexe
     em outro. O gabarito é sorteado a partir do estado alinhado, então
     sempre existe caminho de volta — só não é óbvio qual.
     ===================================================================== */
  function etapaAneis(bomba) {
    var cfg = bomba.config.aneis;
    var estado = cfg.inicial.slice();
    var passos = 0;
    var P = cfg.posicoes;
    var raio0 = 158;
    var largura = 40;

    var alvos = cfg.aneis.map(function (a) { return a.simbolos[0]; });

    bomba.palco.innerHTML =
      '<div class="bd-instrucao">Os anéis estão acoplados: girar um arrasta outro. Deixe os ' +
        cfg.quantidade + ' símbolos do gabarito parados sob o entalhe de cima.</div>' +
      '<div class="anel-gabarito"><span>GABARITO GRAVADO NO ENTALHE</span><strong>' +
        alvos.map(function (s) { return '<i>' + s + '</i>'; }).join('') + '</strong></div>' +
      '<div class="anel-bancada">' +
        '<div class="anel-entalhe" aria-hidden="true"></div>' +
        '<svg class="anel-svg" viewBox="-200 -200 400 400" id="anelSvg"></svg>' +
      '</div>' +
      '<div class="anel-manivelas" id="anelManivelas"></div>' +
      '<p class="fio-contagem"><span id="anelPassos">0</span> giros dados</p>';

    var svg = bomba.palco.querySelector('#anelSvg');

    // Desenha os anéis de fora pra dentro.
    var partes = '<circle class="anel-fundo" cx="0" cy="0" r="180" />';
    cfg.aneis.forEach(function (a, i) {
      var r = raio0 - i * largura;
      partes += '<g class="anel-grupo" data-anel="' + i + '" style="--r:' + r + 'px">' +
        '<circle class="anel-aro" cx="0" cy="0" r="' + r + '" stroke-width="' + (largura - 6) + '" />' +
        a.simbolos.map(function (s, k) {
          var ang = (k / P) * 360 - 90;
          var rad = ang * Math.PI / 180;
          return '<text class="anel-glifo" x="' + (Math.cos(rad) * r).toFixed(2) +
                 '" y="' + (Math.sin(rad) * r).toFixed(2) + '" ' +
                 'transform="rotate(' + (ang + 90) + ' ' + (Math.cos(rad) * r).toFixed(2) + ' ' + (Math.sin(rad) * r).toFixed(2) + ')" ' +
                 'font-size="' + (largura * 0.52) + '">' + s + '</text>';
        }).join('') +
        '</g>';
    });
    partes += '<circle class="anel-nucleo" cx="0" cy="0" r="' + (raio0 - cfg.quantidade * largura + 14) + '" />';
    svg.innerHTML = partes;

    // Manivelas: duas por anel, como parafusos sem-fim laterais.
    bomba.palco.querySelector('#anelManivelas').innerHTML = cfg.aneis.map(function (a, i) {
      return '<div class="anel-manivela">' +
        '<button type="button" class="anel-cranque" data-anel="' + i + '" data-dir="-1" aria-label="Girar anel ' + (i + 1) + ' à esquerda">◄</button>' +
        '<span>ANEL ' + (i + 1) + '</span>' +
        '<button type="button" class="anel-cranque" data-anel="' + i + '" data-dir="1" aria-label="Girar anel ' + (i + 1) + ' à direita">►</button>' +
      '</div>';
    }).join('');

    function pintar() {
      cfg.aneis.forEach(function (a, i) {
        var g = svg.querySelector('.anel-grupo[data-anel="' + i + '"]');
        g.style.transform = 'rotate(' + (estado[i] * (360 / P)) + 'deg)';
        // O símbolo do gabarito está no entalhe quando o deslocamento é 0.
        g.classList.toggle('is-alinhado', estado[i] === 0);
      });
      bomba.palco.querySelector('#anelPassos').textContent = passos;
    }

    function girar(anel, dir) {
      for (var j = 0; j < cfg.quantidade; j++) {
        var delta = dir * cfg.acoplamento[anel][j];
        if (!delta) continue;
        estado[j] = (((estado[j] + delta) % P) + P) % P;
      }
      passos++;
      pintar();

      var alinhados = estado.filter(function (v) { return v === 0; }).length;
      if (alinhados === cfg.quantidade) {
        bomba.dizer('Anéis travados. Calibração fechada.', 'boa');
        svg.classList.add('is-travado');
        setTimeout(function () { bomba.concluirEtapa(); }, 1000);
      } else {
        bomba.dizer(alinhados + ' de ' + cfg.quantidade + ' anéis sob o entalhe.');
      }
    }

    bomba.palco.querySelectorAll('.anel-cranque').forEach(function (b) {
      b.addEventListener('click', function () {
        b.classList.add('is-girando');
        setTimeout(function () { b.classList.remove('is-girando'); }, 260);
        girar(Number(b.dataset.anel), Number(b.dataset.dir));
      });
    });

    pintar();
    bomba.dizer('Os anéis não giram sozinhos. Descubra quem puxa quem.');
  }

  /* =====================================================================
     5) PARTIDA
     ===================================================================== */
  document.addEventListener('DOMContentLoaded', function () {
    var raiz = document.getElementById('bombaDimensional');
    if (!raiz) return;
    var b = new Bomba(raiz);
    b.carregar();
    window.BombaDimensional = b;
  });

  window.BombaSync = BombaSync;
  window.BombaGerador = { gerar: gerarConfiguracao, sorteio: Sorteio };
})();
