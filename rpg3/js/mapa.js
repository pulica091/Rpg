/* =======================================================================
   mapa.js — só é usado em mapa.html
   Textos de cada território (mesmo conteúdo do site antigo) + lógica de
   clique nos marcadores.
   ======================================================================= */

const locations = {
  "Peru": "O Peru é uma terra de mistérios ancestrais, onde a vastidão da Amazônia esconde segredos há milênios esquecidos. Suas florestas densas são um labirinto vivo, repleto de criaturas selvagens, tribos isoladas e ruínas soterradas pela selva implacável. Entre seus rios e montanhas, repousa o lendário Templo do Sol, uma relíquia da civilização inca. Foi lá que os personagens enfrentaram desafios além da compreensão humana para alcançar a Pedra do Tempo.",
  "Barcelona": "Barcelona, uma das joias da Europa, é um importante centro comercial e cultural, onde tradição e progresso se encontram. Suas ruas são movimentadas por mercadores, estudiosos e navegantes, enquanto suas construções refletem a fusão entre a arquitetura clássica e os novos avanços industriais. Entre seus habitantes, destaca-se Aurélia, uma aliada do grupo, cuja influência e recursos podem ser essenciais para a jornada que está por vir.",
  "Paris": "Paris, a grandiosa capital, brilha como um farol de arte, cultura e inovação. Suas ruas são adornadas por monumentos magníficos, enquanto intelectuais e inventores moldam o futuro nas sombras dos cafés e salões aristocráticos. Sob sua beleza imponente, Paris guarda inúmeros segredos — códigos ocultos, sociedades discretas e vestígios de conhecimentos ancestrais.",
  "Paladis": "Situado na extremidade nordeste da França, entre a Inglaterra e a Alemanha, Paladis atravessa um período de reestruturação política. O avanço da Revolução Industrial e da magia aplicada transformou suas cidades, onde fábricas e oficinas crescem ao lado de antigos distritos aristocráticos. Estratégico e rico em recursos, é um ponto-chave no cenário europeu.",
  "Inglaterra": "A Inglaterra é uma das nações mais industrializadas, liderando avanços em engenharia e comércio global. Suas cidades são centros vibrantes de inovação, onde fábricas e academias impulsionam a fusão entre tecnologia e magia. Sob o governo da rainha Elizabeth Clifford Weber, o país mantém sua influência política e militar.",
  "Romênia": "A Romênia é uma terra de montanhas sombrias, vastas florestas e fortalezas ancestrais, onde o folclore e a realidade se misturam. A nação está sob o domínio do temido Drácula, um governante implacável cujo poder faz da Romênia uma ameaça constante à Inglaterra e seus aliados. Entre seus mistérios, os personagens buscam fragmentos de um caminho perdido que pode levá-los até a Pedra da Morte.",
  "Egito": "O Egito, terra de faraós e segredos enterrados sob as areias do tempo, abriga as monumentais Três Pirâmides. Foi em uma delas que os personagens buscaram a Pedra do Poder, enfrentando armadilhas antigas, enigmas esquecidos e forças sobrenaturais que protegiam o artefato.",
  "Índia": "A Índia, uma terra de espiritualidade profunda e templos grandiosos, foi o cenário de um dos momentos mais dolorosos da jornada. No sagrado Templo de Lótus, os personagens descobriram a passagem secreta para Vormir, o reino oculto entre a vida e a morte, onde pagaram o preço definitivo para obter a Pedra da Alma.",
  "Grécia": "A Grécia é uma nação vibrante, combinando sua herança histórica com a modernização impulsionada pela fusão entre magia e tecnologia. Entre seus mistérios mais profundos está a lendária Caverna de Platão, onde a Pedra da Mente repousava, desafiando a percepção da realidade de quem ousasse reivindicá-la.",
  "Alemanha": "A Alemanha é uma terra rica e próspera, onde o avanço industrial caminha lado a lado com antigos segredos ocultos. Entre cientistas visionários e sociedades secretas, a nação se equilibra entre a razão e o sobrenatural.",
  "Itália": "A Itália é uma terra de esplendor e contrastes, onde a realeza e o crime caminham lado a lado. Com laços estreitos com a família real inglesa, o país se tornou um refúgio para monarcas e aristocratas, enquanto a Riviera Italiana oferece discrição para quem prefere manter atividades ilícitas em territórios estrangeiros.",
  "Canadá": "O Canadá é uma terra de montanhas cobertas por neve, florestas geladas e lagos cristalinos, onde o frio extremo torna a sobrevivência um desafio constante. Durante séculos, seu território foi disputado entre França e Inglaterra até conquistar sua independência, carregando marcas desse passado em sua cultura e história. Poucos se aventuram por suas regiões mais inóspitas, habitadas apenas por exploradores, caçadores e pessoas dispostas a enfrentar um clima implacável. Em meio às paisagens congeladas ergue-se o imponente Monte Logan, uma montanha envolta em lendas que guarda os antigos mistérios sobre a origem das oito Pedras do Poder, atraindo aqueles que buscam respostas capazes de mudar o destino do mundo.",
  "Austrália": "A Austrália é uma colossal ilha-prisão pertencente ao Império Inglês, isolada do restante do mundo por uma das maiores fortalezas já construídas. Toda a costa é protegida por poderosas defesas marítimas e por uma barreira que bloqueia habilidades sobrenaturais, impedindo qualquer tentativa de fuga ou invasão. Condenados por crimes imperdoáveis são enviados para lá, onde vivem completamente separados da sociedade. Sem esperança de escapar, os prisioneiros criaram sua própria ordem, marcada por facções, violência e leis próprias, transformando a ilha em um dos lugares mais perigosos e implacáveis do mundo."
};

document.addEventListener('DOMContentLoaded', () => {
  const infoBox = document.getElementById('map-info');
  const points = document.querySelectorAll('.map-point');

  points.forEach(point => {
    point.addEventListener('click', () => {
      points.forEach(p => p.classList.remove('active'));
      point.classList.add('active');

      const name = point.getAttribute('data-info');
      infoBox.innerHTML = `
        <span class="eyebrow">${name}</span>
        <p>${locations[name]}</p>
      `;
    });
  });
});
