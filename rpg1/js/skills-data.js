/* =======================================================================
   skills-data.js — lista fixa de perícias da ficha
   Usado por ficha.js (montar a ficha pra editar) e dados.js (escolher
   perícia pra somar no dado). Precisa carregar ANTES dos dois.

   Os "id" abaixo espelham as colunas da tabela do banco (acrobacia,
   arcanismo, atletismo...) — assim, quando isso ligar num back-end de
   verdade (ver aviso em roster-data.js/auth.js), o formato já bate
   com o schema, é só trocar a camada de armazenamento.
   ======================================================================= */

const SKILLS = [
  { id: 'acrobacia',         nome: 'Acrobacia' },
  { id: 'arcanismo',         nome: 'Arcanismo' },
  { id: 'atletismo',         nome: 'Atletismo' },
  { id: 'atuacao',           nome: 'Atuação' },
  { id: 'blefar',            nome: 'Blefar' },
  { id: 'furtividade',       nome: 'Furtividade' },
  { id: 'historia',          nome: 'História' },
  { id: 'intimidacao',       nome: 'Intimidação' },
  { id: 'intuicao',          nome: 'Intuição' },
  { id: 'investigacao',      nome: 'Investigação' },
  { id: 'lidar_com_animais', nome: 'Lidar com Animais' },
  { id: 'medicina',          nome: 'Medicina' },
  { id: 'natureza',          nome: 'Natureza' },
  { id: 'percepcao',         nome: 'Percepção' },
  { id: 'persuasao',         nome: 'Persuasão' },
  { id: 'prestidigitacao',   nome: 'Prestidigitação' },
  { id: 'religiao',          nome: 'Religião' },
  { id: 'sobrevivencia',     nome: 'Sobrevivência' },
];

/** Objeto { idPericia: 0, idPericia: 0, ... } — base de toda ficha nova. */
function fichaVazia() {
  const obj = {};
  SKILLS.forEach(s => { obj[s.id] = 0; });
  return obj;
}
