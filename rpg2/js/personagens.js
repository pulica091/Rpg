/* =======================================================================
   personagens.js — só é usado em personagens.html
   1) Botões das três famílias (troca o painel visível)
   2) Slider de retrato de cada personagem (setas + pontinhos)
   3) Botão "Ler biografia completa" (expande o texto)
   ======================================================================= */

document.addEventListener('DOMContentLoaded', () => {

  // --- 0) Troca de família ----------------------------------------------
  // Cada botão tem data-family com o id do painel correspondente.
  // A família escolhida fica na URL (#weber-miller), então dá pra mandar
  // o link de uma família específica pra alguém da mesa.
  const botoesFamilia  = document.querySelectorAll('.family-btn');
  const paineisFamilia = document.querySelectorAll('.family-panel');

  function mostrarFamilia(id, rolar) {
    let achou = false;
    paineisFamilia.forEach(p => {
      const ativo = p.id === id;
      if (ativo) achou = true;
      p.classList.toggle('is-active', ativo);
    });
    if (!achou) return false;

    botoesFamilia.forEach(b => {
      b.classList.toggle('is-active', b.dataset.family === id);
    });

    // Os blocos do painel novo entram com .reveal, que só "acende" quando
    // o observador os vê. Como eles estavam escondidos até agora, o
    // observador nunca disparou — então acendemos na mão.
    paineisFamilia.forEach(p => {
      if (p.id === id) p.querySelectorAll('.reveal').forEach(el => el.classList.add('in'));
    });

    if (rolar) {
      const topo = document.getElementById('familias');
      if (topo) window.scrollTo({ top: topo.offsetTop - 70, behavior: 'smooth' });
    }
    return true;
  }

  botoesFamilia.forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.family;
      if (mostrarFamilia(id, true)) history.replaceState(null, '', '#' + id);
    });
  });

  // Abre direto na família pedida pela URL, se houver.
  if (location.hash) mostrarFamilia(location.hash.slice(1), false);

  // --- 1) Sliders de retrato -------------------------------------------
  document.querySelectorAll('.portrait[data-slider]').forEach(portrait => {
    const track  = portrait.querySelector('.portrait-track');
    const images = track.querySelectorAll('img');
    const dotsBox = portrait.querySelector('.portrait-dots');
    let index = 0;

    // Quem tem uma foto só (Charlotte, por exemplo) não recebe setas nem
    // pontinhos no HTML — então aqui não há nada a ligar.
    if (!dotsBox || images.length < 2) return;

    // cria um pontinho para cada foto
    images.forEach((_, i) => {
      const dot = document.createElement('span');
      if (i === 0) dot.classList.add('active');
      dotsBox.appendChild(dot);
    });
    const dots = dotsBox.querySelectorAll('span');

    function goTo(i) {
      index = (i + images.length) % images.length;
      track.style.transform = `translateX(-${index * 100}%)`;
      dots.forEach((d, di) => d.classList.toggle('active', di === index));
    }

    const anterior = portrait.querySelector('.prev');
    const proxima  = portrait.querySelector('.next');
    if (anterior) anterior.addEventListener('click', () => goTo(index - 1));
    if (proxima)  proxima.addEventListener('click', () => goTo(index + 1));
  });

  // --- 2) Expandir biografia --------------------------------------------
  document.querySelectorAll('.bio-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const bio = btn.previousElementSibling;
      const expanded = bio.classList.toggle('collapsed') === false;
      btn.textContent = expanded ? 'Recolher biografia' : 'Ler biografia completa';
    });
  });

});
