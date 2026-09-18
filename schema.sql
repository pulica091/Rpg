-- =========================================================================
-- Banco do RPG — Cloudflare D1 (SQLite)
-- Schema revisado com as correções discutidas: username único, data/hora
-- nas rolagens, trava de 25 pontos também no banco, índices nas chaves
-- estrangeiras, e apagar uma conta APENAS desvincula os personagens dela
-- (nunca apaga o personagem em si).
-- =========================================================================

CREATE TABLE usuarios (
  id_usuario    INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  criado_em     TEXT DEFAULT (datetime('now'))
);

CREATE TABLE personagem (
  id_personagem INTEGER PRIMARY KEY AUTOINCREMENT,
  nome          TEXT NOT NULL,
  imagem        TEXT,
  id_usuario    INTEGER,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

CREATE INDEX idx_personagem_usuario ON personagem(id_usuario);

CREATE TABLE ficha (
  id_ficha          INTEGER PRIMARY KEY AUTOINCREMENT,
  id_personagem     INTEGER NOT NULL UNIQUE,
  acrobacia         INTEGER NOT NULL DEFAULT 0 CHECK (acrobacia >= 0),
  arcanismo         INTEGER NOT NULL DEFAULT 0 CHECK (arcanismo >= 0),
  atletismo         INTEGER NOT NULL DEFAULT 0 CHECK (atletismo >= 0),
  atuacao           INTEGER NOT NULL DEFAULT 0 CHECK (atuacao >= 0),
  blefar            INTEGER NOT NULL DEFAULT 0 CHECK (blefar >= 0),
  furtividade       INTEGER NOT NULL DEFAULT 0 CHECK (furtividade >= 0),
  historia          INTEGER NOT NULL DEFAULT 0 CHECK (historia >= 0),
  intimidacao       INTEGER NOT NULL DEFAULT 0 CHECK (intimidacao >= 0),
  intuicao          INTEGER NOT NULL DEFAULT 0 CHECK (intuicao >= 0),
  investigacao      INTEGER NOT NULL DEFAULT 0 CHECK (investigacao >= 0),
  lidar_com_animais INTEGER NOT NULL DEFAULT 0 CHECK (lidar_com_animais >= 0),
  medicina          INTEGER NOT NULL DEFAULT 0 CHECK (medicina >= 0),
  natureza          INTEGER NOT NULL DEFAULT 0 CHECK (natureza >= 0),
  percepcao         INTEGER NOT NULL DEFAULT 0 CHECK (percepcao >= 0),
  persuasao         INTEGER NOT NULL DEFAULT 0 CHECK (persuasao >= 0),
  prestidigitacao   INTEGER NOT NULL DEFAULT 0 CHECK (prestidigitacao >= 0),
  religiao          INTEGER NOT NULL DEFAULT 0 CHECK (religiao >= 0),
  sobrevivencia     INTEGER NOT NULL DEFAULT 0 CHECK (sobrevivencia >= 0),
  FOREIGN KEY (id_personagem) REFERENCES personagem(id_personagem) ON DELETE CASCADE,
  CHECK (
    acrobacia + arcanismo + atletismo + atuacao + blefar + furtividade +
    historia + intimidacao + intuicao + investigacao + lidar_com_animais +
    medicina + natureza + percepcao + persuasao + prestidigitacao +
    religiao + sobrevivencia <= 25
  )
);

CREATE TABLE rolagens (
  id_rolagem     INTEGER PRIMARY KEY AUTOINCREMENT,
  id_personagem  INTEGER,
  id_usuario     INTEGER,
  atributo_usado TEXT,
  valor_dado     INTEGER NOT NULL,
  valor_atributo INTEGER NOT NULL DEFAULT 0,
  resultado      INTEGER NOT NULL,
  rolado_em      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (id_personagem) REFERENCES personagem(id_personagem) ON DELETE SET NULL,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE SET NULL
);

CREATE INDEX idx_rolagens_personagem ON rolagens(id_personagem);
CREATE INDEX idx_rolagens_usuario ON rolagens(id_usuario);

-- =========================================================================
-- RPG II — INCURSÃO
-- A contagem da bomba dimensional. Uma linha por bomba armada; a "ativa"
-- é sempre a de fim_em mais recente que ainda não passou.
-- Guardamos o INSTANTE DE FIM (não os segundos restantes) de propósito:
-- assim todo mundo vê o mesmo relógio, mesmo abrindo o site depois, e o
-- servidor não precisa ficar decrementando nada.
-- =========================================================================

CREATE TABLE incursao (
  id_incursao INTEGER PRIMARY KEY AUTOINCREMENT,
  universo    TEXT NOT NULL,                      -- alvo do encerramento
  armada_por  TEXT,                               -- username de quem armou
  armada_em   TEXT DEFAULT (datetime('now')),
  fim_em      TEXT NOT NULL,                      -- ISO 8601 em UTC
  duracao     INTEGER NOT NULL DEFAULT 600,       -- segundos (10 min)
  cancelada   INTEGER NOT NULL DEFAULT 0 CHECK (cancelada IN (0,1))
);

CREATE INDEX idx_incursao_fim ON incursao(fim_em);

-- GET {base}/incursao  -> a contagem ativa, se houver:
--   SELECT universo, armada_por, fim_em
--     FROM incursao
--    WHERE cancelada = 0 AND fim_em > strftime('%Y-%m-%dT%H:%M:%SZ','now')
--    ORDER BY fim_em DESC
--    LIMIT 1;
--
-- POST {base}/incursao -> arma uma nova:
--   INSERT INTO incursao (universo, armada_por, fim_em, duracao)
--   VALUES (?1, ?2, strftime('%Y-%m-%dT%H:%M:%SZ','now', '+' || ?3 || ' seconds'), ?3);
--
-- O formato de resposta que o site espera está documentado no topo de
-- rpg2/js/incursao.js. Enquanto API.ativo for false lá, tudo roda local.

-- =========================================================================
-- RPG II — CONTADOR REGRESSIVO (SEMANA / DIA / HORA / MINUTO)
--
-- Uma linha por contagem criada. A "corrente" é a de id mais alto com
-- ativo = 1. Só o administrador (mestre) escreve aqui; todo mundo lê.
--
-- COMO O TEMPO É GUARDADO (importante):
-- Não guardamos "o instante do fim", porque o contador pode ser PAUSADO e
-- pode rodar em VELOCIDADE ACELERADA (2x, 5x...). Guardamos duas coisas:
--
--   restante       -> segundos que faltavam no momento do último toque
--   atualizado_em  -> quando foi esse último toque (UTC)
--
-- Com status = 'rodando', qualquer cliente calcula sozinho:
--
--   falta = restante - (agora - atualizado_em) * multiplicador
--
-- Com status = 'pausado' ou 'parado', falta = restante (congelado).
-- Assim todo mundo vê o MESMO número sem o servidor precisar decrementar
-- nada, e trocar o multiplicador no meio da contagem é só regravar o par
-- (restante, atualizado_em) com o novo multiplicador.
--
-- versao sobe +1 a cada alteração: é o que os clientes comparam para saber
-- que o mestre mexeu em alguma coisa e precisam redesenhar na hora.
-- =========================================================================

CREATE TABLE contador (
  id_contador   INTEGER PRIMARY KEY AUTOINCREMENT,
  rotulo        TEXT    NOT NULL DEFAULT 'Contagem regressiva',

  -- Configuração
  total_inicial INTEGER NOT NULL DEFAULT 2419200,   -- 4 semanas, em segundos
  restante      INTEGER NOT NULL DEFAULT 2419200,   -- segundos que faltavam em atualizado_em
  multiplicador REAL    NOT NULL DEFAULT 1 CHECK (multiplicador > 0),

  -- Estado
  status        TEXT    NOT NULL DEFAULT 'parado'
                CHECK (status IN ('parado','rodando','pausado','zerado')),

  -- Datas (ISO 8601 em UTC)
  iniciado_em   TEXT,                               -- quando deu play a 1ª vez
  atualizado_em TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  criado_em     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),

  -- Sincronização entre usuários
  versao        INTEGER NOT NULL DEFAULT 1,         -- sobe a cada alteração
  alterado_por  TEXT,                               -- username do mestre
  ativo         INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0,1))
);

CREATE INDEX idx_contador_ativo ON contador(ativo, id_contador);

-- Estado corrente que o site lê:
--   SELECT * FROM contador WHERE ativo = 1 ORDER BY id_contador DESC LIMIT 1;
--
-- Congelar o restante antes de qualquer alteração (pausar, trocar
-- multiplicador, editar tempo) — este UPDATE é o coração de tudo:
--   UPDATE contador
--      SET restante = MAX(0, CAST(restante -
--            (strftime('%s','now') - strftime('%s', atualizado_em)) * multiplicador
--          AS INTEGER)),
--          atualizado_em = strftime('%Y-%m-%dT%H:%M:%SZ','now'),
--          versao = versao + 1
--    WHERE id_contador = ?1 AND status = 'rodando';
--
-- Depois disso, aplique a ação (status = 'pausado', novo multiplicador,
-- novo restante...) em um segundo UPDATE, sempre somando +1 em versao.

-- =========================================================================
-- RPG II — ATIVAÇÕES DA BOMBA DIMENSIONAL
--
-- A bomba é usada 4 vezes na campanha e cada uso precisa gerar puzzles
-- DIFERENTES (fios, memória, teclas e anéis). O sorteio é feito por um
-- gerador determinístico a partir de uma SEMENTE: guardando a semente
-- aqui, a mesa inteira vê exatamente o mesmo painel, e uma ativação
-- passada nunca se repete.
-- =========================================================================

CREATE TABLE bomba_ativacao (
  id_ativacao INTEGER PRIMARY KEY AUTOINCREMENT,
  numero_uso  INTEGER NOT NULL,                     -- 1..4
  semente     INTEGER NOT NULL,                     -- alimenta o gerador no front
  aberta_em   TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  concluida   INTEGER NOT NULL DEFAULT 0 CHECK (concluida IN (0,1)),
  concluida_em TEXT,
  concluida_por TEXT,                               -- username de quem fechou
  etapa       INTEGER NOT NULL DEFAULT 1            -- 1 fios · 2 memória · 3 teclas · 4 anéis
              CHECK (etapa BETWEEN 1 AND 5)
);

CREATE INDEX idx_bomba_uso ON bomba_ativacao(numero_uso);

-- GET  {base}/bomba          -> ativação aberta (ou a próxima, criando uma
--                               nova semente se a anterior foi concluída)
-- POST {base}/bomba/etapa    -> { etapa }        avança a etapa
-- POST {base}/bomba/concluir -> fecha a ativação
-- POST {base}/bomba/reiniciar (mestre) -> zera as ativações da campanha

-- =========================================================================
-- SESSÕES (login de verdade, quando o Worker estiver de pé)
-- O site guarda só o token; a conferência de dono é sempre no servidor.
-- =========================================================================

CREATE TABLE sessao (
  token      TEXT PRIMARY KEY,
  id_usuario INTEGER NOT NULL,
  criada_em  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  expira_em  TEXT NOT NULL,
  FOREIGN KEY (id_usuario) REFERENCES usuarios(id_usuario) ON DELETE CASCADE
);

CREATE INDEX idx_sessao_usuario ON sessao(id_usuario);

-- =========================================================================
-- AJUSTES NAS TABELAS QUE JÁ EXISTIAM
--
-- personagem: além do dono, o site precisa saber a família (é como a
-- página de Personagens agrupa), a foto e se o personagem está "em jogo".
-- Se o banco já foi criado, rode os ALTER TABLE abaixo uma vez.
-- =========================================================================

ALTER TABLE personagem ADD COLUMN familia   TEXT;      -- weber-miller | lancaster-volkov | de-la-croix
ALTER TABLE personagem ADD COLUMN slug      TEXT;      -- id usado no site (ex.: 'natasha')
ALTER TABLE personagem ADD COLUMN em_jogo   INTEGER NOT NULL DEFAULT 0 CHECK (em_jogo IN (0,1));
ALTER TABLE personagem ADD COLUMN criado_em TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'));

CREATE UNIQUE INDEX idx_personagem_slug ON personagem(slug);

-- ficha: carimbo de atualização, pra ordenar e detectar edição concorrente.
ALTER TABLE ficha ADD COLUMN atualizada_em TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'));

-- rolagens: o dashboard precisa saber o dado usado, a dificuldade pedida
-- pelo mestre e se o teste passou. Sem isso não dá pra contar sucesso.
ALTER TABLE rolagens ADD COLUMN dado_lados  INTEGER NOT NULL DEFAULT 20;
ALTER TABLE rolagens ADD COLUMN dificuldade INTEGER;                       -- NULL = rolagem livre
ALTER TABLE rolagens ADD COLUMN sucesso     INTEGER;                       -- 1, 0 ou NULL

-- =========================================================================
-- RPG II — UNIVERSOS / INCURSÕES
--
-- O estado de cada universo mora aqui, NÃO no frontend. A página pública
-- só desenha o que esta tabela disser.
--
--   estado 'principal' -> a casa (Terra-616), nunca entra em incursão
--   estado 'destruido' -> já deixou de existir (fragmentado e apagado)
--   estado 'incursao'  -> em rota de colisão agora (anéis roxos)
--   estado 'intacto'   -> ainda não chegou a vez dele
--
-- Só pode existir UM 'incursao' por vez. Quando o mestre destrói o
-- universo em incursão, o próximo 'intacto' na ordem vira 'incursao'.
-- Essa promoção é feita no servidor (ver worker/worker.js), não no JS da
-- página, justamente pra todo mundo ver a mesma coisa.
-- =========================================================================

CREATE TABLE universo (
  id_universo   INTEGER PRIMARY KEY AUTOINCREMENT,
  ordem         INTEGER NOT NULL,                    -- 1 = primeiro da fila
  codigo        TEXT    NOT NULL,                    -- '616', '000', '424'...
  nome          TEXT    NOT NULL,                    -- 'Marvel', 'Fallout'...
  descricao     TEXT,
  estado        TEXT    NOT NULL DEFAULT 'intacto'
                CHECK (estado IN ('principal','incursao','destruido','intacto')),
  destruido_em  TEXT,
  atualizado_em TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  versao        INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX idx_universo_ordem ON universo(ordem);

INSERT INTO universo (ordem, codigo, nome, descricao, estado) VALUES
  (1, '616',  'Terra-616',  'A casa. Tudo que sobrou depende dela.',                  'principal'),
  (2, '000',  'Origins',    'A primeira realidade alcançada pelo portal. Não existe mais.', 'destruido'),
  (3, '424',  'Marvel',     'Em rota de colisão com a 616 agora.',                    'incursao'),
  (4, '523',  'Fallout',    'Leitura estável. Ainda não é a vez dela.',               'intacto'),
  (5, '190',  'WWII',       'Leitura estável. Ainda não é a vez dela.',               'intacto'),
  (6, '9%#',  'Infinity',   'Leitura corrompida. O instrumento não fecha um código.',  'intacto');

-- GET  {base}/universos            -> lista na ordem, com estado
-- POST {base}/universos/destruir   (mestre) { codigo }  -> destrói o universo
--      em incursão e promove o próximo intacto da ordem
-- POST {base}/universos/estado     (mestre) { codigo, estado }
-- POST {base}/universos/ordem      (mestre) { codigos: [...] }
