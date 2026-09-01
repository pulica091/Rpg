/* =======================================================================
   personagens.js — só é usado em personagens.html
   1) Slider de retrato de cada personagem (setas + pontinhos)
   2) Botão "Ler biografia completa" (expande o texto)
   ======================================================================= */

document.addEventListener('DOMContentLoaded', () => {

  // --- 1) Sliders de retrato -------------------------------------------
  document.querySelectorAll('.portrait[data-slider]').forEach(portrait => {
    const track  = portrait.querySelector('.portrait-track');
    const images = track.querySelectorAll('img');
    const dotsBox = portrait.querySelector('.portrait-dots');
    let index = 0;

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

    portrait.querySelector('.prev').addEventListener('click', () => goTo(index - 1));
    portrait.querySelector('.next').addEventListener('click', () => goTo(index + 1));
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
