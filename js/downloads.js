/* =======================================================================
   downloads.js — dispara o download de verdade dos wallpapers.
   Os botões [data-wallpaper] não têm mais href para o arquivo local; ao
   clicar, pegamos o data URI correspondente (embutido em
   downloads-data.js) e criamos um link temporário apontando para ele,
   com o atributo "download" — só assim o navegador abre a janela nativa
   de "Salvar como" em vez de só exibir a imagem.
   ======================================================================= */
document.addEventListener('DOMContentLoaded', () => {
  const data = window.RPG_WALLPAPERS || {};

  document.querySelectorAll('[data-wallpaper]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const key = btn.getAttribute('data-wallpaper');
      const dataUrl = data[key];
      if (!dataUrl) return;

      const filename = btn.getAttribute('data-filename') || (key + '-wallpaper.jpg');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
  });
});
