/* =======================================================================
   galeria.js — só é usado em galeria.html
   1) Filtro por território (mostra/esconde figuras pela cor da região)
   2) Lightbox com navegação entre imagens (setas + teclado)
   ======================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const figures = Array.from(document.querySelectorAll('.gallery-grid figure'));
  const filters = document.querySelectorAll('.gallery-filter');

  // --- 1) Filtro por território ------------------------------------------
  filters.forEach(btn => {
    btn.addEventListener('click', () => {
      filters.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const region = btn.getAttribute('data-filter');
      figures.forEach(fig => {
        const show = region === 'todos' || fig.getAttribute('data-region') === region;
        fig.classList.toggle('hide', !show);
      });
    });
  });

  // --- 2) Lightbox com navegação -----------------------------------------
  const lightbox = document.getElementById('lightbox');
  const lightImg = document.getElementById('lightbox-img');
  const caption  = document.getElementById('lightbox-caption');
  const closeBtn = document.getElementById('lightbox-close');
  const prevBtn  = document.getElementById('lightbox-prev');
  const nextBtn  = document.getElementById('lightbox-next');
  let currentIndex = 0;

  function visibleFigures() {
    return figures.filter(f => !f.classList.contains('hide'));
  }

  function openAt(index) {
    const visible = visibleFigures();
    if (!visible.length) return;
    currentIndex = (index + visible.length) % visible.length;
    const img = visible[currentIndex].querySelector('img');
    lightImg.src = img.src;
    lightImg.alt = img.alt;
    caption.textContent = img.alt;
    lightbox.classList.add('open');
  }

  figures.forEach(fig => {
    fig.querySelector('img').addEventListener('click', () => {
      const visible = visibleFigures();
      openAt(visible.indexOf(fig));
    });
  });

  function close() {
    lightbox.classList.remove('open');
    lightImg.src = '';
  }

  closeBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => openAt(currentIndex - 1));
  nextBtn.addEventListener('click', () => openAt(currentIndex + 1));
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) close(); // clicou fora da imagem
  });
  document.addEventListener('keydown', (e) => {
    if (!lightbox.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') openAt(currentIndex + 1);
    if (e.key === 'ArrowLeft') openAt(currentIndex - 1);
  });
});
