# Ligar o site no banco (Cloudflare Worker + D1)

O site funciona sozinho no navegador (modo local, só para testes) e funciona
ligado ao banco (modo de verdade, com a mesa inteira vendo o mesmo estado).
Trocar de um para o outro é mexer em **um** arquivo.

## 1. Criar o banco e subir a API

```bash
npm create cloudflare@latest rpg-api      # escolha "Hello World Worker"
cp worker/worker.js rpg-api/src/index.js

cd rpg-api
npx wrangler d1 create rpg                # anote o database_id que aparecer
npx wrangler d1 execute rpg --file=../schema.sql --remote
```

No `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "rpg"
database_id = "<o id do passo anterior>"

[vars]
ORIGEM = "https://seu-site.pages.dev"     # quem pode chamar a API
```

A chave do mestre vai como segredo, nunca no arquivo:

```bash
npx wrangler secret put CHAVE_MESTRE
npx wrangler deploy
```

## 2. Apontar o site para a API

Em `rpg2/js/api.js`, no topo:

```js
const API = {
  base:  'https://rpg-api.seu-dominio.workers.dev',
  ativo: true
};
```

Só isso. Conta, personagens, ficha, rolagens, contador, bomba e universos
passam a vir do banco — nenhuma outra linha do site precisa mudar, porque
todas as páginas falam apenas com essa camada.

Em `rpg2/js/admin.js` troque também `CHAVE_MESTRE` pela mesma chave que você
guardou no segredo do Worker.

## 3. O que o banco guarda

```
usuarios ──< personagem ──< ficha
   │             │
   └─────────────┴──< rolagens        (é o que alimenta resultados.html)

contador          a contagem de semanas/dias/horas/minutos
universo          a fila de universos e o estado de cada um
bomba_ativacao    a semente de cada uso da bomba dimensional
sessao            os tokens de login
```

## 4. O que muda de segurança quando liga

No modo local **não existe** segurança: tudo está no navegador de cada um e
qualquer pessoa com o console aberto pode mexer. Ligado, o servidor:

- guarda senha com PBKDF2 (nunca em texto);
- identifica quem é você pelo token de sessão, não por um campo que a página
  manda dizendo quem é;
- confere no próprio SQL se o personagem é seu antes de ler ou gravar a ficha;
- exige a chave do mestre para contador, universos e bomba.

Por isso a ficha de um jogador não abre para outro nem mexendo no JavaScript
da página: a decisão não está na página.
