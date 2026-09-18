/* =======================================================================
   roster-data.js — CATÁLOGO DE PERSONAGENS

   Esta é a lista que o site mostra em ficha.html (vincular personagem),
   dados.html (quem vai rolar) e resultados.html (de quem são os números).

   Com o banco ligado, a lista de verdade vem da tabela `personagem`; o
   catálogo abaixo continua servindo de base (é o que popula o banco na
   primeira carga e o que o modo local usa). Os `id` daqui são os `slug`
   da tabela: são eles que amarram conta → personagem → ficha → rolagem.

   Fotos: as da campanha II ficam em rpg2/img/. Quem ainda não tem foto
   nova continua apontando pra pasta do RPG I; quem não tem foto nenhuma
   fica com img vazia e o site desenha um monograma no lugar.
   ======================================================================= */

const ROSTER_BASE = [
  /* --- Família Weber Miller -------------------------------------------- */
  { id: 'natasha',   familia: 'weber-miller', nome: 'Natasha Clifford Weber Miller',  img: 'img/natasha-rpg2-1.jpg' },
  { id: 'joel',      familia: 'weber-miller', nome: 'Joel Clifford Weber Miller',     img: '../rpg1/img/joel1.jpg' },
  { id: 'chloe',     familia: 'weber-miller', nome: 'Chloe Clifford Weber',           img: '../rpg1/img/chloe1.jpg' },
  { id: 'charlotte', familia: 'weber-miller', nome: 'Charlotte Campbell Miller',      img: 'img/charlotte.jpg' },
  { id: 'lara',      familia: 'weber-miller', nome: 'Lara Clifford Weber Miller',     img: 'img/lara.jpg' },
  { id: 'nathalia',  familia: 'weber-miller', nome: 'Nathalia Clifford Weber Miller', img: 'img/nathalia.jpg' },
  { id: 'rebeca',    familia: 'weber-miller', nome: 'Rebeca Clifford Weber Miller',   img: 'img/rebeca.jpg' },
  { id: 'theo',      familia: 'weber-miller', nome: 'Theo Clifford Weber Miller',     img: 'img/theo.jpg' },

  /* --- Família Lancaster Volkov ---------------------------------------- */
  { id: 'cassandra', familia: 'lancaster-volkov', nome: "Cassandra d'la Fountaine Lancaster Volkov",     img: '../rpg1/img/cass1.jpg' },
  { id: 'thorn',     familia: 'lancaster-volkov', nome: "Thorn Leocadio Mephisto Volkov d'la Fountaine", img: '../rpg1/img/mago1.jpg' },
  { id: 'trystan',   familia: 'lancaster-volkov', nome: 'Trystan Maverine Lancaster',                    img: '../rpg1/img/trystan1.jpg' },
  { id: 'pietra',    familia: 'lancaster-volkov', nome: "Pietra d'la Fountaine Mephisto",                img: 'img/pietra-crianca.jpg' },
  { id: 'victor',    familia: 'lancaster-volkov', nome: "Victor d'la Fountaine Mephisto",                img: 'img/victor.jpg' },
  { id: 'victorie',  familia: 'lancaster-volkov', nome: "Victorie d'la Fountaine Mephisto",              img: 'img/victorie.jpg' },
  { id: 'alister',   familia: 'lancaster-volkov', nome: "Alister d'la Fountaine Mephisto",               img: 'img/alister.jpg' },

  /* --- Família De La Croix --------------------------------------------- */
  { id: 'haku',       familia: 'de-la-croix', nome: 'Nigihayami Haku de La Croix Ravnos',          img: '../rpg1/img/kartucho1.jpg' },
  { id: 'arlecchino', familia: 'de-la-croix', nome: 'Arlecchino Fontenelle Ravencour de La Croix', img: '../rpg1/img/arle2.jpg' },
  { id: 'caelly',     familia: 'de-la-croix', nome: 'Caelly Ravencour de La Croix',                img: '' },
  { id: 'ashriel',    familia: 'de-la-croix', nome: 'Ashriel Ravencour de La Croix',               img: 'img/ashriel.jpg' },
];

const FAMILIAS = {
  'weber-miller':     'Família Weber Miller',
  'lancaster-volkov': 'Família Lancaster Volkov',
  'de-la-croix':      'Família De La Croix',
};

const Roster = {
  /** A lista que vale agora: a do banco, se houver; senão a base local. */
  todos() {
    const doBanco = (typeof DB !== 'undefined' && DB.cache.personagens.length) ? DB.cache.personagens : null;
    if (doBanco) return doBanco;
    return ROSTER_BASE.concat(Store.get(RPG_STORAGE_KEYS.extraChars, []));
  },

  porId(id) { return this.todos().find(p => p.id === id) || null; },

  porFamilia(familia) { return this.todos().filter(p => p.familia === familia); },

  /** Retrato do personagem; sem foto, desenha o monograma da inicial. */
  avatar(p) {
    if (p && p.img) {
      const img = document.createElement('img');
      img.src = p.img;
      img.alt = p.nome;
      img.loading = 'lazy';
      return img;
    }
    const mono = document.createElement('span');
    mono.className = 'kin-mono';
    mono.style.cssText = 'margin:0;width:100%;height:100%;border:none;';
    mono.textContent = p && p.nome ? p.nome.trim().charAt(0).toUpperCase() : '?';
    return mono;
  },

  slug(nome) {
    const base = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'personagem';
    let id = base, n = 2;
    const existentes = this.todos().map(p => p.id);
    while (existentes.includes(id)) { id = `${base}-${n++}`; }
    return id;
  },

  /** Cadastra um personagem novo já vinculado a quem está logado. */
  async cadastrarNovo(nome, img, familia) {
    nome = (nome || '').trim();
    if (!nome) return { ok: false, erro: 'Digite um nome para o personagem.' };
    const novo = { id: this.slug(nome), nome, familia: familia || '', img: (img || '').trim() };

    if (typeof DB !== 'undefined' && DB.ligado()) {
      try {
        const r = await DB.pedir('/personagens', {
          metodo: 'POST',
          corpo: { nome, imagem: novo.img, familia: novo.familia, slug: novo.id }
        });
        await DB.carregar();
        return { ok: true, personagem: { ...novo, id: r.slug } };
      } catch (e) { return { ok: false, erro: String(e.message) }; }
    }

    const extras = Store.get(RPG_STORAGE_KEYS.extraChars, []);
    extras.push(novo);
    Store.set(RPG_STORAGE_KEYS.extraChars, extras);
    await DB.carregar();
    return { ok: true, personagem: novo };
  },
};
