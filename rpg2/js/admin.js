/* =======================================================================
   admin.js — PAINEL DO MESTRE

   Tudo que muda a contagem passa por aqui, e daqui vai para o banco pelo
   ContadorSync (js/contador.js). Nenhum valor de contagem é escrito na
   mão no HTML: o painel só mostra o que o banco devolveu.

   SOBRE A CHAVE — leia antes de confiar nela:
   A trava abaixo impede que um jogador curioso mexa no relógio, mas ela
   mora no navegador. A tranca de verdade é no Worker: o POST /contador
   precisa conferir a chave (ou uma sessão de admin) ANTES de gravar, e
   recusar com 403 se não bater. Sem isso, qualquer pessoa com o endereço
   do endpoint consegue mexer na contagem, com ou sem esta página.
   ======================================================================= */

(function () {
  'use strict';

  var CHAVE_MESTRE = 'destino616';         // troque aqui (e no Worker)
  var LEMBRAR = 'rpg2-admin-ok';

  document.addEventListener('DOMContentLoaded', function () {
    var trava   = document.getElementById('adminTrava');
    var painel  = document.getElementById('adminPainel');
    if (!trava || !painel) return;

    var campo   = document.getElementById('adminChave');
    var erro    = document.getElementById('adminErro');
    var recado  = document.getElementById('adminRecado');
    var leitura = document.getElementById('adminLeitura');

    /* --- Trava ---------------------------------------------------------- */
    function abrir() {
      trava.hidden = true;
      painel.hidden = false;
      atualizar();
      setInterval(atualizar, 1000);
    }
    try { if (sessionStorage.getItem(LEMBRAR) === '1') abrir(); } catch (e) {}

    function tentar() {
      if (campo.value === CHAVE_MESTRE) {
        try { sessionStorage.setItem(LEMBRAR, '1'); } catch (e) {}
        erro.textContent = '';
        abrir();
      } else {
        erro.textContent = 'Chave incorreta.';
        campo.value = '';
        campo.focus();
      }
    }
    document.getElementById('adminEntrar').addEventListener('click', tentar);
    campo.addEventListener('keydown', function (e) { if (e.key === 'Enter') tentar(); });

    /* --- Ações ---------------------------------------------------------- */
    function mandar(acao, dados, aviso) {
      return ContadorSync.acao(acao, dados, CHAVE_MESTRE)
        .then(function () { return ContadorSync.sincronizar(); })
        .then(function () {
          dizer(aviso || 'Pronto. A mesa inteira já está vendo o novo estado.');
          atualizar();
        })
        .catch(function () {
          dizer('O servidor recusou a alteração. Confira a chave do mestre no Worker.', true);
        });
    }

    function dizer(texto, ruim) {
      recado.textContent = texto;
      recado.className = 'admin-recado' + (ruim ? ' is-ma' : ' is-boa');
      clearTimeout(dizer._t);
      dizer._t = setTimeout(function () { recado.textContent = ''; recado.className = 'admin-recado'; }, 6000);
    }

    document.querySelectorAll('[data-acao]').forEach(function (b) {
      b.addEventListener('click', function () {
        var acao = b.dataset.acao;
        if (acao === 'zerar' && !confirm('Zerar a contagem para todo mundo?')) return;
        if (acao === 'reiniciar' && !confirm('Voltar para o valor de fábrica e começar de novo?')) return;
        mandar(acao, {});
      });
    });

    /* --- Velocidade ------------------------------------------------------ */
    document.querySelectorAll('#adminVels [data-vel]').forEach(function (b) {
      b.addEventListener('click', function () {
        mandar('multiplicador', { valor: Number(b.dataset.vel) },
               'Velocidade em ' + ContadorSync.formatarVelocidade(Number(b.dataset.vel)) + '.');
      });
    });
    document.getElementById('adminVelAplicar').addEventListener('click', function () {
      var v = Number(document.getElementById('adminVelLivre').value);
      if (!v || v <= 0) { dizer('Informe uma velocidade maior que zero.', true); return; }
      mandar('multiplicador', { valor: v }, 'Velocidade em ' + ContadorSync.formatarVelocidade(v) + '.');
    });

    /* --- Tempo ----------------------------------------------------------- */
    function camposEmSegundos() {
      return ContadorSync.montar(
        document.getElementById('campoSemanas').value,
        document.getElementById('campoDias').value,
        document.getElementById('campoHoras').value,
        document.getElementById('campoMinutos').value
      );
    }

    document.getElementById('adminDefinirTempo').addEventListener('click', function () {
      mandar('definir_tempo', { segundos: camposEmSegundos() }, 'Tempo restante trocado.');
    });

    document.getElementById('adminDefinirInicial').addEventListener('click', function () {
      var seg = camposEmSegundos();
      var rodar = confirm('Nova contagem definida. Começar a correr agora?\n\nOK = começa agora · Cancelar = fica pausada.');
      mandar('definir_inicial', { segundos: seg, aplicar: true, rodar: rodar },
             'Nova contagem de fábrica definida.');
    });

    document.getElementById('adminPuxarAtual').addEventListener('click', function () {
      ContadorSync.ler().then(function (e) {
        var p = ContadorSync.partes(ContadorSync.restante(e));
        document.getElementById('campoSemanas').value = p.semanas;
        document.getElementById('campoDias').value = p.dias;
        document.getElementById('campoHoras').value = p.horas;
        document.getElementById('campoMinutos').value = p.minutos;
      });
    });

    document.getElementById('adminSalvarRotulo').addEventListener('click', function () {
      var t = document.getElementById('adminRotulo').value.trim();
      if (!t) { dizer('Escreva um nome para o relógio.', true); return; }
      mandar('rotulo', { texto: t }, 'Nome trocado.');
    });

    /* --- Bomba ----------------------------------------------------------- */
    document.getElementById('adminNovaAtivacao').addEventListener('click', function () {
      if (!confirm('Sortear uma ativação nova? Os quatro desafios mudam na hora.')) return;
      BombaSync.novaAtivacao();
      dizer('Ativação sorteada. Os quatro desafios são outros.');
      lerBomba();
    });

    document.getElementById('adminZerarBomba').addEventListener('click', function () {
      if (!confirm('Voltar a bomba para a ativação 1 de 4?')) return;
      BombaSync.reiniciar();
      dizer('Bomba de volta à ativação 1.');
      lerBomba();
    });

    function lerBomba() {
      BombaSync.ler().then(function (a) {
        var etapas = ['fios', 'memória', 'comandos', 'anéis', 'armada'];
        document.getElementById('adminBomba').textContent =
          'Ativação ' + a.numero_uso + ' de ' + BombaSync.totalUsos +
          ' · semente ' + a.semente +
          ' · parada em: ' + (etapas[(a.etapa || 1) - 1] || '—') +
          (a.concluida ? ' · já usada' : '');
      });
    }

    /* --- Universos -------------------------------------------------------
       O painel só manda a ordem; quem decide quem assume a incursão é o
       servidor (ou o espelho local, com a mesma regra). Assim a fila nunca
       depende de quem abriu a página. */
    const uniLista = document.getElementById('uniAdminLista');
    const ESTADOS = { principal: 'principal', incursao: 'em incursão', destruido: 'destruído', intacto: 'intacto' };

    function pintarUniversos(lista) {
      uniLista.innerHTML = '';
      lista.forEach((u, i) => {
        const linha = document.createElement('div');
        linha.className = 'uni-admin-linha';
        linha.dataset.estado = u.estado;
        linha.innerHTML =
          `<span class="uni-admin-ordem">${i + 1}</span>` +
          `<span><b>${u.nome}</b><small>${u.codigo} · ${ESTADOS[u.estado] || u.estado}</small></span>`;

        const acoes = document.createElement('span');
        acoes.className = 'uni-admin-acoes';

        const sel = document.createElement('select');
        sel.innerHTML = Object.keys(ESTADOS)
          .map(e => `<option value="${e}"${e === u.estado ? ' selected' : ''}>${ESTADOS[e]}</option>`).join('');
        sel.addEventListener('change', async () => {
          const nova = await UniversosSync.definirEstado(u.codigo, sel.value, CHAVE_MESTRE);
          pintarUniversos(nova);
          dizer(`${u.nome} agora está ${ESTADOS[sel.value]}.`);
        });

        const sobe = botaoOrdem('▲', i > 0, () => trocar(lista, i, i - 1));
        const desce = botaoOrdem('▼', i < lista.length - 1, () => trocar(lista, i, i + 1));

        acoes.append(sel, sobe, desce);
        linha.appendChild(acoes);
        uniLista.appendChild(linha);
      });
    }

    function botaoOrdem(rotulo, ligado, aoClicar) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bd-botao bd-botao--fraco';
      b.textContent = rotulo;
      b.disabled = !ligado;
      b.addEventListener('click', aoClicar);
      return b;
    }

    async function trocar(lista, de, para) {
      const codigos = lista.map(u => u.codigo);
      [codigos[de], codigos[para]] = [codigos[para], codigos[de]];
      pintarUniversos(await UniversosSync.definirOrdem(codigos, CHAVE_MESTRE));
      dizer('Ordem da fila atualizada.');
    }

    document.getElementById('uniDestruir').addEventListener('click', async () => {
      if (!confirm('Destruir o universo que está em incursão? O próximo da fila assume no lugar.')) return;
      const nova = await UniversosSync.destruir(null, CHAVE_MESTRE);
      pintarUniversos(nova);
      const agora = nova.find(u => u.estado === 'incursao');
      dizer(agora ? `Feito. Agora quem está vindo é ${agora.nome} (${agora.codigo}).`
                  : 'Feito. Não sobrou nenhum universo em rota de colisão.');
    });

    document.getElementById('uniRestaurar').addEventListener('click', async () => {
      if (!confirm('Voltar a fila de universos para o estado inicial?')) return;
      if (DB.ligado()) {
        // Com o banco ligado, restaurar é devolver cada universo ao estado
        // de origem — um a um, pelo mesmo caminho que o mestre usaria.
        for (const u of UniversosSync.padrao) {
          await UniversosSync.definirEstado(u.codigo, u.estado, CHAVE_MESTRE);
        }
        pintarUniversos(await UniversosSync.ler());
      } else {
        pintarUniversos(await UniversosSync.restaurarPadrao());
      }
      dizer('Fila de universos restaurada.');
    });

    UniversosSync.ler().then(pintarUniversos);

    /* --- Leitura de estado ----------------------------------------------- */
    function atualizar() {
      ContadorSync.ler().then(function (e) {
        var falta = ContadorSync.restante(e);
        var p = ContadorSync.partes(falta);
        var estados = { parado: 'parado', rodando: 'correndo', pausado: 'pausado', zerado: 'zerado' };
        leitura.textContent =
          estados[e.status] + ' · ' + ContadorSync.formatarVelocidade(e.multiplicador) +
          ' · ' + p.semanas + 'sem ' + p.dias + 'd ' + p.horas + 'h ' + p.minutos + 'min' +
          ' · versão ' + e.versao;

        var rot = document.getElementById('adminRotulo');
        if (rot && !rot.value) rot.placeholder = e.rotulo || 'Colisão da Terra-616';

        document.querySelectorAll('#adminVels [data-vel]').forEach(function (b) {
          b.classList.toggle('is-ativo', Number(b.dataset.vel) === Number(e.multiplicador));
        });
      });
      lerBomba();
    }
  });
})();
