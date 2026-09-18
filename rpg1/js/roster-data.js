/* =======================================================================
   roster-data.js — lista "mestra" dos personagens jogáveis
   Usado por ficha.html (vincular/preencher ficha) e por dados.html
   (escolher quem vai rolar o dado).

   Por que hardcoded em vez de vir de um banco?
   O Tio pediu pra não depender de banco (Cloudflare D1) por enquanto,
   já que os personagens quase nunca mudam. Então a lista principal
   fica fixa aqui, no código — é só editar este arquivo (ou duplicar um
   bloco) pra ajustar nome/foto de alguém.

   E quando aparecer um personagem NOVO? Em vez de mexer no código toda
   vez, a página de Ficha tem um formulário "Cadastrar novo personagem"
   que guarda os personagens extras no localStorage do navegador (chave
   RPG_STORAGE_KEYS.extraChars). Na prática funciona junto com esta
   lista fixa (ROSTER_BASE + extras = roster completo), sem precisar
   editar nada aqui nem ter banco de dados — é só uma solução de
   contorno enquanto não existe back-end; depois que existir, essa
   lista final é o formato que deve virar uma tabela "personagens".
   ======================================================================= */

const ROSTER_BASE = [
  { id: 'natasha',     nome: 'Natasha Clifford Weber Miller',                 img: 'img/natasha1.jpg' },
  { id: 'joel',        nome: 'Joel Clifford Weber Miller',                    img: 'img/joel1.jpg' },
  { id: 'chloe',       nome: 'Chloe Clifford Weber',                         img: 'img/chloe1.jpg' },
  { id: 'cassandra',   nome: "Cassandra d'la Fountaine Lancaster Volkov",     img: 'img/cass1.jpg' },
  { id: 'thorn',       nome: "Thorn Leocadio Mephisto Volkov d'la Fountaine", img: 'img/mago1.jpg' },
  { id: 'pietra',      nome: "Pietra d'la Fountaine Mephisto",                img: 'img/pietra1.jpg' },
  { id: 'trystan',     nome: 'Trystan Maverine Lancaster',                    img: 'img/trystan1.jpg' },
  { id: 'haku',        nome: 'Nigihayami Haku de La Croix Ravnos',            img: 'img/kartucho1.jpg' },
  { id: 'arlecchino',  nome: 'Arlecchino Fontenelle Ravencour de La Croix',   img: 'img/arle2.jpg' },
];

const Roster = {
  /** Lista completa: personagens fixos + extras cadastrados no navegador. */
  todos() {
    return ROSTER_BASE.concat(Store.get(RPG_STORAGE_KEYS.extraChars, []));
  },

  porId(id) {
    return this.todos().find(p => p.id === id) || null;
  },

  /** Cria um id simples e único a partir do nome ("Fulano de Tal" -> "fulano-de-tal"). */
  slug(nome) {
    const base = nome.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'personagem';
    let id = base, n = 2;
    const existentes = this.todos().map(p => p.id);
    while (existentes.includes(id)) { id = `${base}-${n++}`; }
    return id;
  },

  /** Cadastra um personagem extra (fica salvo só neste navegador). */
  cadastrarNovo(nome, img) {
    nome = (nome || '').trim();
    if (!nome) return { ok: false, erro: 'Digite um nome para o personagem.' };
    const extras = Store.get(RPG_STORAGE_KEYS.extraChars, []);
    const novo = { id: this.slug(nome), nome, img: (img || '').trim() || 'img/logo-rpg1.jpg' };
    extras.push(novo);
    Store.set(RPG_STORAGE_KEYS.extraChars, extras);
    return { ok: true, personagem: novo };
  },
};
