/* =======================================================================
   main.js — comportamento comum a TODAS as páginas (v2)
   - Menu mobile (hambúrguer)
   - Nav ganha fundo sólido ao rolar a página (efeito "encolher")
   - Marca o link ativo do menu
   - Botão "voltar ao topo"
   - Efeito de "revelar" elementos com a classe .reveal ao rolar
     (cada página adiciona essa classe manualmente nos blocos que quer
     animar; aqui só cuidamos de ativar/desativar a classe .in)
   ======================================================================= */

document.addEventListener('DOMContentLoaded', () => {

  // --- Modo claro/escuro --------------------------------------------------
  // (a escolha inicial já foi aplicada por um script pequeno no <head> de
  // cada página, antes da página desenhar — isso evita o "flash" de tema
  // errado ao carregar. Aqui só cuidamos do clique no botão.)
  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const next = isLight ? 'dark' : 'light';
      if (next === 'light') {
        document.documentElement.setAttribute('data-theme', 'light');
      } else {
        document.documentElement.removeAttribute('data-theme');
      }
      try { localStorage.setItem('rpg-theme', next); } catch (e) { /* localStorage indisponível, tudo bem */ }
    });
  }

  // --- Trocador de campanha (RPG I / II / III) ---------------------------
  const campaignSwitch  = document.getElementById('campaignSwitch');
  const campaignTrigger = document.getElementById('campaignTrigger');
  if (campaignSwitch && campaignTrigger) {
    campaignTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = campaignSwitch.classList.toggle('open');
      campaignTrigger.setAttribute('aria-expanded', String(isOpen));
    });
    document.addEventListener('click', (e) => {
      if (!campaignSwitch.contains(e.target)) {
        campaignSwitch.classList.remove('open');
        campaignTrigger.setAttribute('aria-expanded', 'false');
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        campaignSwitch.classList.remove('open');
        campaignTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // --- Menu mobile ------------------------------------------------------
  const toggle = document.querySelector('.nav-toggle');
  const links = document.querySelector('.nav-links');
  if (toggle && links) {
    toggle.addEventListener('click', () => links.classList.toggle('open'));
    links.querySelectorAll('a').forEach(a => {
      a.addEventListener('click', () => links.classList.remove('open'));
    });
  }

  // --- Link ativo do menu ------------------------------------------------
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(a => {
    if (a.getAttribute('href') === current) a.classList.add('active');
  });

  // --- Nav com fundo sólido ao rolar -------------------------------------
  const nav = document.querySelector('.site-nav');
  if (nav) {
    const onScrollNav = () => nav.classList.toggle('scrolled', window.scrollY > 30);
    onScrollNav();
    window.addEventListener('scroll', onScrollNav, { passive: true });
  }

  // --- Nav escondido sobre o wallpaper de capa ----------------------------
  // Nas páginas iniciais de cada campanha (o header é .hero--arcane: o
  // wallpaper cobrindo a tela cheia, sem nenhum texto por cima, já que o
  // título vem desenhado na própria arte), o menu começa completamente
  // escondido — nem transparente sobre a imagem, some de vez — e só
  // reaparece (idêntico ao resto do site) quando a parte "sólida" da
  // página, logo abaixo do wallpaper, começa a aparecer.
  const arcaneHero = document.querySelector('.hero.hero--arcane');
  if (nav && arcaneHero) {
    nav.classList.add('nav--over-hero');
    const onScrollHeroNav = () => {
      const heroBottom = arcaneHero.getBoundingClientRect().bottom;
      nav.classList.toggle('nav--visible', heroBottom <= 80);
    };
    onScrollHeroNav();
    window.addEventListener('scroll', onScrollHeroNav, { passive: true });
    window.addEventListener('resize', onScrollHeroNav);
  }

  // --- Botão flutuante "voltar ao topo" -----------------------------------
  const btnTopo = document.getElementById('btnTopo');
  if (btnTopo) {
    window.addEventListener('scroll', () => {
      btnTopo.classList.toggle('show', window.scrollY > 400);
    }, { passive: true });
    btnTopo.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // --- Reveal ao rolar -----------------------------------------------------
  const revealEls = document.querySelectorAll('.reveal');
  if (revealEls.length) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    revealEls.forEach(el => io.observe(el));
  }
});
