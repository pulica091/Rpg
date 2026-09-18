/* =======================================================================
   dados.js — só é usado em dados.html
   Rola um número aleatório de 1 até N quando o botão do dado é clicado.
   ======================================================================= */

document.addEventListener('DOMContentLoaded', () => {
  const resultado = document.getElementById('dado');
  const sidesLabel = document.getElementById('dado-sides');

  document.querySelectorAll('.dice-buttons .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const sides = parseInt(btn.getAttribute('data-sides'), 10);

      btn.classList.add('rolling');
      setTimeout(() => btn.classList.remove('rolling'), 400);

      const numero = Math.floor(Math.random() * sides) + 1;
      resultado.textContent = numero;
      sidesLabel.textContent = `D${sides}`;
    });
  });
});
