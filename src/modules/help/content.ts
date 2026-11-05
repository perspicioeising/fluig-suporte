/**
 * Conteúdo da página de ajuda (/ajuda). É a MESMA fonte usada para alimentar a base de
 * conhecimento do assistente (scripts/ingest, fonte "help"), então mantenha-o fiel ao
 * comportamento real do aplicativo.
 *
 * Convenção: o caractere ‵ (U+2035) representa o acento grave do Markdown, para evitar
 * conflito com template literals. Ele é convertido na saída.
 */

export type HelpGroup = "Começando" | "Módulos" | "Segurança e limites" | "Referência" | "Administração";

export type HelpSection = {
  id: string;
  group: HelpGroup;
  title: string;
  summary: string;
  body: string;
};

const md = (strings: TemplateStringsArray, ...values: unknown[]) =>
  String.raw(strings, ...values).replaceAll("‵", "`").trim();

export const HELP_SECTIONS: HelpSection[] = [
  /* ------------------------------ Começando ------------------------------ */
  {
    id: "visao-geral",
    group: "Começando",
    title: "Visão geral",
    summary: "O que é o Fluig Integration Studio e como as partes se encaixam.",
    body: md`
O **Fluig Integration Studio** é uma ferramenta para desenvolvedores e analistas que trabalham com integrações com o **TOTVS Fluig**. Ele reúne, no mesmo lugar, a documentação das APIs, geradores de código, um cliente para testar chamadas, um laboratório de Web Services SOAP, um assistente de IA e um diagnóstico de erros.

### Para que serve cada módulo

| Módulo | Para que serve |
|---|---|
| **Dashboard** | Ponto de partida com atalhos para os módulos. |
| **APIs Fluig** | Catálogo pesquisável de APIs REST (nova e antiga), Web Services SOAP e métodos do SDK, com parâmetros, exemplos e link para a fonte oficial. |
| **Construtor** | Gera exemplos de código (cURL, JavaScript, Java, JSON e XML/SOAP) a partir de uma entrada do catálogo. |
| **API Tester** | Executa requisições REST contra os seus ambientes Fluig, com histórico e coleções. |
| **Webservices SOAP** | Importa WSDLs, mostra serviços e operações, monta envelopes e testa chamadas SOAP. |
| **Assistente IA** | Responde perguntas com base na documentação oficial importada, citando as fontes. |
| **Diagnóstico** | Analisa um erro de integração e sugere causas, validações e próximos passos. |
| **Histórico** | Todas as execuções REST e SOAP do workspace, com filtros, detalhe, reabertura no API Tester e exclusão dos seus registros. |
| **Configurações** | Cadastro dos ambientes Fluig e das credenciais. |

### Princípios que valem para o app inteiro

- **Documentação oficial como fonte.** O catálogo e a base do assistente vêm de api.fluig.com, do Javadoc do SDK e de páginas oficiais do TDN. O que a documentação não informa **não é inventado**: aparece como marcador ou como "informação insuficiente".
- **Nada é alterado automaticamente.** O app só executa uma chamada quando **você** clica em enviar. Por padrão, os ambientes são **somente leitura**.
- **Segredos protegidos.** As credenciais dos ambientes ficam cifradas no servidor e nunca voltam para o navegador.
`,
  },
  {
    id: "primeiros-passos",
    group: "Começando",
    title: "Primeiros passos",
    summary: "Do cadastro à primeira chamada, em 6 passos.",
    body: md`
Siga esta ordem na primeira vez. Leva poucos minutos.

1. **Crie sua conta ou entre.** Na tela inicial use e-mail e senha (mínimo de 8 caracteres, com ao menos uma letra e um número). Dependendo da configuração, você receberá um e-mail de confirmação. Ao criar a conta, o app cria automaticamente o seu **workspace pessoal**, onde você é o proprietário.
2. **Cadastre um ambiente** em **Configurações**. Informe um nome (por exemplo "QA"), a URL base (por exemplo ‵https://meu-ambiente.fluig.com‵) e o tipo de autenticação. Veja [Ambientes e credenciais](#ambientes-credenciais) para escolher o tipo certo.
3. **Cadastre as credenciais** do ambiente (no cartão do ambiente, abra "Credenciais"). Elas são cifradas e nunca mais exibidas.
4. **Explore o catálogo** em **APIs Fluig**. Busque por um método (ex.: ‵getAvailableDatasets‵), serviço (‵ECMDatasetService‵) ou caminho.
5. Abra uma entrada: no detalhe você **vê a documentação**, **testa a chamada** (aba Testar, para REST) e **gera código** (aba Código), tudo no mesmo lugar.
6. **Execute uma chamada de leitura (GET)** no API Tester para confirmar que o ambiente e as credenciais estão corretos antes de qualquer outra coisa.

> **Dica:** se a primeira chamada falhar, abra **Diagnóstico** e use **Diagnosticar este erro** na própria resposta. A seção [Problemas comuns](#problemas-comuns) também cobre os casos mais frequentes.
`,
  },
  {
    id: "ambientes-credenciais",
    group: "Começando",
    title: "Ambientes e credenciais",
    summary: "Como cadastrar ambientes Fluig, escolher a autenticação e cadastrar o aplicativo OAuth.",
    body: md`
Um **ambiente** é uma instalação do Fluig que você quer acessar (produção, homologação, QA...). Tudo que executa chamadas (API Tester, Laboratório SOAP, importação de WSDL) usa um ambiente cadastrado.

### Campos do ambiente

| Campo | O que significa |
|---|---|
| **Nome** | Identifica o ambiente nas telas. Único por workspace. |
| **URL base** | Só o endereço do servidor (e o contexto, se houver). Ex.: ‵https://200qa.fluig.io‵. Sem barra final, sem usuário/senha na URL, sem query string. |
| **Autenticação** | Como o app se identifica no Fluig. Veja abaixo. |
| **Ambiente ativo** | Ambientes inativos não executam chamadas. |
| **Permitir métodos que alteram dados** | Libera POST, PUT, PATCH e DELETE (e operações SOAP que não são consultas). **Desligado por padrão.** |

**Regras da URL base:** precisa começar com ‵https://‵ quando o ambiente usa qualquer autenticação (credenciais não trafegam em texto aberto). Endereços internos (‵localhost‵, ‵*.local‵, ‵*.internal‵, IPs privados) são recusados.

### Qual autenticação escolher

| Uso | Autenticação | Observação |
|---|---|---|
| **API REST pública** (API Tester, Construtor) | **OAuth 1.0a** | É o protocolo documentado para a API pública do Fluig. Exige consumer key/secret e access token/secret. |
| **Web Services SOAP** (Laboratório SOAP) | **Basic (usuário e senha)** | Os métodos SOAP do Fluig recebem usuário e senha como parâmetros; o app preenche isso no servidor com as credenciais do ambiente. |
| Outros serviços | Bearer, Header personalizado ou Sem autenticação | Para APIs que não são do Fluig ou usam token/header próprio. |

**Recomendação prática:** cadastre **dois ambientes** apontando para o mesmo servidor, um com **OAuth 1.0a** (REST) e outro com **Basic** (SOAP). Trocar o tipo de autenticação de um ambiente **apaga as credenciais atuais**.

### Credenciais por tipo

- **Basic:** usuário e senha.
- **Bearer:** o token.
- **Header personalizado:** nome e valor do header.
- **OAuth 1.0a:** consumer key, consumer secret, access token (opcional) e token secret (opcional).

As credenciais são **cifradas no servidor** e a tela mostra apenas "credenciais cadastradas". Para trocar, use **Substituir credenciais**; para apagar, **Remover credenciais**.

### Como obter as credenciais OAuth 1.0a no Fluig

Segundo a documentação oficial, o aplicativo precisa estar cadastrado no Fluig:

1. Acesse o **Painel de controle**, localize o agrupador **Parâmetros técnicos** e abra **Oauth Provider**. Clique em **Adicionar** e preencha: código (ex.: 01), OAuth Provider (ex.: WCM), descrição, as URLs ‵/portal/api/rest/oauth/access_token‵, ‵/portal/api/rest/oauth/request_token‵ e ‵/portal/api/rest/oauth/authorize‵, método de requisição **GET** e método de assinatura **HMAC-SHA**.
2. Volte ao Painel de controle e abra **Oauth application**. Clique em **Adicionar** e informe **Consumer Key**, **Consumer Secret** e o provedor cadastrado no passo anterior.
3. Para o app agir em nome próprio, use a ação **Usuário Aplicativo** na tela do aplicativo: ela gera o **access token** e o **token secret** exclusivos. Se o Fluig usa **TOTVS Identity**, o usuário aplicativo é obrigatório.

Depois digite os quatro valores direto na tela de credenciais do ambiente (não os envie por chat ou e-mail).

> **Observação do Studio (não vem da documentação oficial):** em um ambiente de teste multi-tenant, chamadas à API REST com Basic responderam ‵tenantNotSelected‵; com OAuth 1.0a o tenant foi identificado e as chamadas funcionaram. O tenant é resolvido pela identidade OAuth, não por header nem pela URL.
`,
  },

  /* -------------------------------- Módulos ------------------------------- */
  {
    id: "dashboard",
    group: "Módulos",
    title: "Dashboard",
    summary: "Visão geral e atalhos.",
    body: md`
O **Dashboard** é a tela inicial depois do login. Ele mostra:

- **Contadores:** ambientes cadastrados, requisições salvas (e quantas coleções) e WSDLs importados. Cada contador leva ao módulo correspondente.
- **Últimas requisições:** as 5 execuções mais recentes (método, status, caminho e horário).
- **Últimos diagnósticos:** os 5 mais recentes; clique para abrir o resultado.
- **Atalhos para todos os módulos.**

Use-o para navegar; as ações acontecem nos módulos.

A barra lateral (ou a barra superior, em telas pequenas) dá acesso aos módulos principais: **Dashboard**, **APIs Fluig**, **Webservices SOAP**, **Histórico**, **Configurações** e **Ajuda**. No rodapé dela, a seção recolhível **Ferramentas avançadas** reúne **Construtor**, **API Tester**, **Assistente IA** e **Diagnóstico** — esses quatro também ficam embutidos no detalhe de cada API (em **APIs Fluig**), que é o lugar onde você vê, testa, gera código, pergunta ao assistente e diagnostica sem trocar de tela. O botão **Sair** fica no canto superior direito. No desktop dá para recolher a barra lateral (atalho **Ctrl/⌘ + B**).
`,
  },
  {
    id: "catalogo",
    group: "Módulos",
    title: "Catálogo de APIs",
    summary: "Pesquisar e entender APIs REST, SOAP e SDK.",
    body: md`
O catálogo reúne entradas importadas da documentação oficial. Cada entrada mostra descrição, parâmetros de entrada e saída, exemplos, compatibilidade e o **link para a fonte oficial**.

### Tipos de entrada

| Tipo | Origem | Como a entrada aparece |
|---|---|---|
| **REST (novo)** | Swagger publicado em api.fluig.com/latest | Método HTTP, caminho completo (ex.: ‵/content-management/api/v2/...‵), parâmetros e respostas. |
| **REST (antigo)** | Páginas de api.fluig.com/old | Método HTTP e caminho **sem** o prefixo da API pública; exemplos de corpo quando a documentação traz. |
| **SOAP** | Documentação dos Web Services (TDN) | Nome ‵Serviço.método‵ e a assinatura do método no lugar do caminho. |
| **SDK** | Javadoc do SDK | Nome ‵Serviço.método‵ e a assinatura Java. |

### Como pesquisar

1. Digite parte do nome, do caminho ou da descrição. A lista **atualiza enquanto você digita** e **não diferencia maiúsculas de minúsculas** (‵datasets‵, ‵Datasets‵ e ‵DATASETS‵ trazem o mesmo resultado). Com várias palavras, todas precisam aparecer, em qualquer ordem.
2. Refine pelos filtros: **tipo** (REST novo/antigo, SOAP, SDK), **método HTTP** (GET, POST, PUT, PATCH, DELETE), **assunto** (Documentos, Usuários, Processos, Formulários, Datasets e outros) e **grupo** (a API, o serviço ou a classe oficial; escolha o tipo primeiro).
3. Use **Limpar** para zerar a busca e os filtros.
4. Clique em uma entrada para ver o detalhe. A lista é paginada (20 por página).
> O **assunto** é uma classificação do próprio Studio, feita a partir do nome, do caminho e dos grupos oficiais da entrada, só para facilitar a navegação. Não vem da documentação oficial e uma entrada pode ter mais de um assunto. Os filtros de busca e de método também existem no **Construtor**.

### No detalhe da entrada — tudo no mesmo lugar

O detalhe é dividido em duas colunas. À **esquerda**, a API em três abas; à **direita**, um painel de **assistência** que entende a API aberta.

**Coluna da API (esquerda):**

- **Documentação** — descrição, parâmetros de entrada e saída, exemplos e compatibilidade.
- **Testar** (entradas REST) — o **API Tester embutido**, com os mesmos recursos do Tester completo: seções de **Parâmetros de query**, **Headers** e **Corpo** (com tipo JSON/XML/texto/formulário), onde você pode adicionar itens à vontade. Os parâmetros **obrigatórios** da documentação já vêm listados e marcados com ‵*‵. Escolha o ambiente e clique em **Executar**; a resposta aparece ali mesmo. No **REST antigo** o prefixo ‵/api/public‵ é aplicado automaticamente. Para coleções e requisições salvas, use **Abrir o API Tester completo**.
- **Código** — gera exemplos em cURL, JavaScript, Java, JSON e XML/SOAP a partir da entrada.

**Painel de assistência (direita), recolhível:**

- **Assistente** — chat já contextualizado na API aberta (sugestões como “Como uso este método?”). As respostas citam a documentação oficial.
- **Diagnóstico** — analisa um erro. Se um teste na aba **Testar** falhar, aparece **Diagnosticar este erro**: o painel abre o Diagnóstico já com o resumo da resposta preenchido.

Fora das colunas: **Fonte oficial** abre a página de origem.
- Algumas entradas SOAP trazem uma **nota de compatibilidade** quando a própria documentação do TDN é inconsistente (por exemplo, nome da linha diferente do nome da assinatura). Nesses casos, confirme no WSDL do seu ambiente.
- Entradas **depreciadas** são marcadas.
`,
  },
  {
    id: "construtor",
    group: "Módulos",
    title: "Construtor de integrações",
    summary: "Gerar exemplos de código para REST, SOAP e SDK.",
    body: md`
O Construtor gera exemplos prontos a partir de uma entrada do catálogo. **Ele usa apenas o que a documentação informa**; o que não é documentado fica como marcador para você preencher.

### Passo a passo

1. Em **Construtor**, busque uma entrada e clique nela (ou use **Gerar código** no catálogo).
2. Escolha o **ambiente** no seletor. Ele define a URL base do código. Sem ambiente, o código usa o marcador ‵https://SEU_FLUIG‵. **Credenciais reais nunca entram no código.**
3. Preencha os **valores do exemplo** (parâmetros de caminho, query, corpo ou argumentos). O código muda conforme você digita.
4. Use as abas para escolher a linguagem e **Copiar**.
5. Em entradas REST, **Abrir no API Tester** leva para o Tester o ambiente, o método, o caminho (com os valores de caminho já aplicados), os parâmetros de query e o corpo que você preencheu. Os parâmetros **obrigatórios** segundo a documentação aparecem primeiro e marcados com ‵*‵; os opcionais ficam recolhidos em “Parâmetros opcionais”. No Tester, parâmetros obrigatórios vazios geram um aviso e marcadores ‵{param}‵ não resolvidos bloqueiam o envio.

### O que é gerado

| Tipo | Abas | Detalhes |
|---|---|---|
| **REST** | cURL, JavaScript, Java, JSON | OAuth 1.0a embutido no JavaScript (Node 18+) e no Java (11+), sem bibliotecas de terceiros. No cURL a assinatura aparece como marcador, porque ela muda a cada chamada. |
| **SOAP** | XML (envelope), cURL, JavaScript, Java | Com o **WSDL importado**, usa endpoint, namespace e SOAPAction exatos. Sem WSDL, usa só os dados do catálogo e deixa ‵NAMESPACE_DO_WSDL‵ e a SOAPAction vazia. |
| **SDK** | Java, JavaScript (evento customizado) | Usa a assinatura real do Javadoc e o método de acesso correto da classe ‵FluigAPI‵. |

### Cuidados

- Troque os marcadores (‵SUA_CONSUMER_KEY‵, ‵SEU_USUARIO‵, ‵SUA_SENHA‵...) pelos valores reais **no seu ambiente de desenvolvimento**, nunca em repositórios públicos.
- Tipos de domínio do SDK (por exemplo ‵UserVO‵) aparecem como objetos a preencher; o pacote exato está no Javadoc.
- Os botões **Executar no API Tester** e **Testar no Laboratório SOAP** executam a chamada de verdade, com as regras de segurança do app.
- **Pedir ajuda ao assistente** abre o chat com a pergunta já escrita (ela não é enviada sozinha).
`,
  },
  {
    id: "api-tester",
    group: "Módulos",
    title: "API Tester",
    summary: "Executar requisições REST, ver a resposta e guardar em coleções.",
    body: md`
O API Tester é um cliente HTTP para os seus ambientes Fluig, no estilo de ferramentas como o Postman. As credenciais do ambiente são aplicadas **no servidor**.

### Fazendo uma chamada

1. Escolha o **ambiente** e o **método** (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS).
2. Informe o **caminho** relativo ao ambiente, começando com uma única barra. Ex.: ‵/api/public/2.0/users/getCurrent‵. O app monta a URL final a partir da URL base do ambiente.
3. Na aba **Parâmetros**, adicione parâmetros de query; em **Headers**, headers extras; em **Corpo**, escolha JSON, XML, texto ou formulário (urlencoded).
4. Clique em **Enviar**.

### A resposta

- **Status HTTP**, **tempo de execução** e **tamanho**.
- Aba **Corpo** (JSON é formatado; marque "Exibir sem formatar" para ver o original) e aba **Headers**.
- Quando há erro (status 400 ou maior, ou falha de conexão), aparece o atalho **Diagnosticar este erro**.

### Histórico e coleções

- A barra lateral guarda as **últimas 25 execuções**. Clique em uma para recarregar a requisição.
- **Salvar** guarda a requisição em uma coleção (nova ou existente) para reutilizar. **Não salve tokens ou senhas em headers**: as credenciais do ambiente já são aplicadas automaticamente.

### Regras de segurança

- **Somente leitura por padrão:** POST, PUT, PATCH e DELETE só funcionam em ambientes com "Permitir métodos que alteram dados" ligado.
- O caminho **não pode sair da URL base** do ambiente (caminhos como ‵//outro-host‵ são recusados).
- Destinos internos e redirecionamentos não são seguidos. O tempo limite é de **30 segundos** por chamada.
- O servidor lê até 2 MB da resposta e envia até 1 MB para a tela.

### Dicas

- Prefira testar com **GET** antes de qualquer outra coisa.
- Se uma rota demora e dá timeout, use filtros ou paginação (parâmetros de query) para reduzir o volume.
- O Fluig pode responder **403** quando o usuário do aplicativo OAuth não tem permissão naquela rota; isso não indica erro no app.
`,
  },
  {
    id: "soap",
    group: "Módulos",
    title: "Laboratório SOAP",
    summary: "Importar WSDLs, montar envelopes e testar Web Services SOAP.",
    body: md`
O Laboratório SOAP trabalha com **WSDLs**. Depois de importar um WSDL, você vê os serviços, as operações, os parâmetros de entrada e saída, gera o envelope e testa a chamada.

### Importando um WSDL

**Do ambiente (recomendado):**

1. Na aba **Do ambiente**, escolha um ambiente ativo.
2. Clique em **Listar serviços do ambiente**. O app lê a página pública ‵{ambiente}/services‵ e mostra os serviços (ex.: ‵ECMDatasetService‵).
3. Marque os serviços (ou **Selecionar todos**) e clique em **Importar do ambiente**. O app baixa ‵/webdesk/<Serviço>?wsdl‵ de cada um.
4. Para outro caminho, use o campo **Ou informe o caminho do WSDL** (sempre relativo ao ambiente).

**Por arquivo:** na aba **Arquivo**, envie um ‵.wsdl‵ ou ‵.xml‵ de até 2 MB. Se o WSDL referenciar arquivos externos (import/include), o upload **não os baixa**; nesse caso importe pelo ambiente.

Importar de novo um WSDL com o mesmo nome **substitui** o anterior. O arquivo original fica guardado no Storage.

### Usando uma operação

1. Selecione o WSDL na lista e depois a operação (há um filtro por nome).
2. Veja serviço, porta, **SOAPAction**, **endpoint** e a estrutura de **Entrada** e **Saída**.
3. Edite o **envelope** à vontade. Use **Formatar** para indentar e **Restaurar exemplo** para voltar ao gerado.
4. Escolha o ambiente e clique em **Enviar**. A resposta aparece formatada; um **SOAP Fault** é mostrado em destaque, com código e mensagem.
5. Em **Exemplos de consumo**, copie o equivalente em cURL, JavaScript ou Java.

### Usuário e senha sem expor a senha

Os métodos SOAP do Fluig recebem usuário e senha como parâmetros. O envelope gerado traz os marcadores ‵{{ENV_USERNAME}}‵ e ‵{{ENV_PASSWORD}}‵. **No servidor**, ao enviar, o app os troca pelas credenciais **Basic** do ambiente. A senha nunca chega ao navegador nem ao histórico. Isso exige um ambiente com autenticação **Basic** e credenciais cadastradas.

### Quando uma operação é bloqueada

SOAP usa sempre POST, então o app decide pelo **nome**: operações cujo nome começa com ‵get‵, ‵find‵, ‵list‵, ‵search‵, ‵is‵, ‵has‵, ‵count‵, ‵read‵, ‵query‵, ‵retrieve‵, ‵load‵, ‵validate‵, ‵check‵, ‵exists‵, ‵fetch‵, ‵download‵ ou ‵calculate‵ são tratadas como **consulta**. Qualquer outra (por exemplo ‵create...‵, ‵update...‵, ‵delete...‵) só roda em ambientes com **escrita liberada**. O servidor confere tanto o elemento do Body quanto a SOAPAction.

O tempo limite de uma chamada SOAP é de **45 segundos**.
`,
  },
  {
    id: "assistente",
    group: "Módulos",
    title: "Assistente IA",
    summary: "Perguntar sobre APIs e integrações com respostas fundamentadas e fontes citadas.",
    body: md`
O assistente responde perguntas sobre APIs REST, SOAP, SDK, autenticação e também sobre **como usar este aplicativo**, sempre com base nos documentos importados.

### Como ele funciona

1. Você faz uma pergunta.
2. O app busca na base de conhecimento os trechos mais relevantes (até 8). Se você citar um nome exato de método ou serviço, a entrada correspondente do catálogo entra com prioridade.
3. O modelo responde **apenas com esses trechos**, cita as fontes como **[1]**, **[2]** (os números são links para a página oficial) e escreve a resposta aos poucos.
4. Abaixo da resposta, **Fontes consultadas** lista os trechos usados, com as citadas destacadas e o link **ver no catálogo**.

### Quando faltar informação

Se os documentos não cobrem a pergunta, o assistente diz "**Não encontrei informação suficiente...**", informa o que conseguiu confirmar e indica onde verificar (WSDL ou Swagger do ambiente). Se nenhum trecho for encontrado, ele **nem chama o modelo**. Isso é proposital: é melhor admitir a lacuna do que inventar.

### Como perguntar melhor

- Use nomes exatos: ‵ECMDatasetService‵, ‵getAvailableDatasets‵, ‵/api/public/2.0/users/getCurrent‵.
- Diga o contexto: "em SOAP", "na API pública REST", "em um evento de workflow".
- Para código, informe a linguagem e o que você quer fazer.
- Para continuar um assunto, mantenha a mesma conversa (o assistente considera as últimas mensagens).

### Conversas e limites

- As conversas ficam salvas por usuário e podem ser excluídas.
- Até **4.000 caracteres** por pergunta, **8 perguntas por minuto** e **300 por dia** por usuário.
- Respostas longas podem ser interrompidas pelo limite de tamanho; peça "continue".
- **Parar** interrompe a resposta em andamento.

### O que ele não faz

Ele **não executa chamadas**, não acessa os seus ambientes e não altera nada. Ele também pode errar: confira as fontes citadas antes de aplicar em produção.
`,
  },
  {
    id: "diagnostico",
    group: "Módulos",
    title: "Diagnóstico de erros",
    summary: "Analisar um erro de integração e receber causas prováveis, validações e próximos passos.",
    body: md`
O diagnóstico ajuda a investigar um erro: HTTP 401/403, problemas de autenticação, timeout, falhas de Web Services SOAP, JSON ou XML inválido, falhas do SDK e problemas de rede/TLS.

### Como usar

1. Em **Diagnóstico**, cole o erro (mensagem, corpo da resposta, SOAP Fault, stack trace).
2. Opcional: escolha o **tipo de problema** (ou deixe "Detectar automaticamente"), o **ambiente** e uma **requisição do histórico** para anexar como evidência.
3. Clique em **Diagnosticar**.

O caminho mais curto: depois de uma chamada com erro no API Tester ou no Laboratório SOAP, clique em **Diagnosticar este erro**; a requisição já vem anexada.

### O que acontece com o seu texto

Antes de qualquer análise, o servidor **oculta segredos**: cabeçalhos Authorization, senhas, tokens, assinaturas OAuth, cookies e JWTs. O resultado informa quantos valores foram ocultados. O texto já ocultado é o que fica salvo.

### O resultado

O diagnóstico segue sempre a mesma estrutura:

| Seção | Conteúdo |
|---|---|
| **Resumo do problema** | O que aconteceu, só com base nas evidências. |
| **Evidências disponíveis** | Fatos observados no erro, no histórico e no ambiente. |
| **Causas prováveis** | Em ordem, cada uma com **confiança** (Alta, Média ou Baixa), a evidência ou fonte [n] que a sustenta e a marca "(hipótese)" quando não há sustentação direta. |
| **Validações recomendadas** | Passos verificáveis, priorizando os de leitura. |
| **Próximos passos** | O que fazer em seguida. |
| **Limites deste diagnóstico** | O que não dá para concluir e quais dados coletar. |

Acima do resultado aparecem os **sinais detectados** automaticamente (por exemplo "HTTP 403 Forbidden" ou "SOAP Fault"). Se o texto for muito curto e sem nenhum sinal (por exemplo, "deu erro, não sei por quê") ou se nenhum trecho da documentação corresponder ao erro, o app **não usa o modelo**: entrega apenas os fatos identificados, orientações gerais e o que você pode coletar para um diagnóstico melhor.

### Limites

Até **20.000 caracteres** por diagnóstico, **5 por minuto** e **100 por dia** por usuário. Os diagnósticos ficam salvos na lista à esquerda e podem ser excluídos.
`,
  },
  {
    id: "historico",
    group: "Módulos",
    title: "Histórico e coleções",
    summary: "O que é registrado e onde encontrar.",
    body: md`
O app registra o que você executa para facilitar a auditoria e a repetição de testes.

| O quê | Onde ver | Como é guardado |
|---|---|---|
| **Execuções REST e SOAP** | Tela **Histórico** (todas, com filtros), barra lateral do API Tester (últimas 25) e anexo do Diagnóstico | Método, URL (parâmetros sensíveis mascarados), headers (valores sensíveis mascarados), status, tempo e até 100 KB da resposta. |
| **Requisições salvas** | Aba **Coleções** do API Tester | Método, caminho, parâmetros, headers e corpo que você salvou. |
| **Conversas do assistente** | Lista lateral do Assistente IA | Perguntas, respostas e fontes citadas. |
| **Diagnósticos** | Lista lateral do Diagnóstico | Texto (já com segredos ocultados), resultado e fontes. |

No SOAP, o histórico guarda o envelope **com os marcadores** ‵{{ENV_USERNAME}}‵/‵{{ENV_PASSWORD}}‵ e oculta elementos sensíveis (senha, token...).

### Tela Histórico

1. **Buscar:** digite parte da URL, do método, da operação SOAP ou da mensagem de erro. A lista atualiza enquanto você digita e não diferencia maiúsculas de minúsculas.
2. **Filtrar** por tipo (REST ou SOAP), resultado (**Sucesso 2xx** ou **Erro ou sem resposta**), período (24 horas, 7 ou 30 dias), ambiente e **Somente as minhas**.
3. **Clique em um registro** para ver o detalhe: headers e corpo da requisição e da resposta (com valores sensíveis mascarados).
4. No detalhe:
   - **Reabrir no API Tester** (REST): leva ambiente, método, caminho, parâmetros, headers e corpo. Valores que foram mascarados (‵***‵) voltam vazios e desligados, para você preencher de novo.
   - **Diagnosticar** abre o Diagnóstico com o registro anexado.
   - **Excluir** remove o registro.
5. **Excluir meus registros filtrados** remove de uma vez **todos os seus** registros que correspondem aos filtros, inclusive os de outras páginas. Sem filtros, o botão vira **Excluir todo o meu histórico**. Sempre há uma confirmação antes.

> Você vê os registros de todos os membros do workspace (marcados como **outro membro**), mas só pode excluir os seus. A exclusão não pode ser desfeita.
`,
  },
  {
    id: "configuracoes",
    group: "Módulos",
    title: "Configurações",
    summary: "Gerenciar ambientes e credenciais.",
    body: md`
Em **Configurações** você cria e edita os ambientes (veja [Ambientes e credenciais](#ambientes-credenciais)).

- **Novo ambiente:** nome, URL base, autenticação, "ativo" e "permitir métodos que alteram dados".
- **Editar ambiente:** altera esses campos. Mudar o tipo de autenticação apaga as credenciais.
- **Credenciais:** cadastre, substitua ou remova. Os valores nunca são exibidos.
- **Excluir ambiente:** remove o ambiente; requisições salvas que o usavam continuam existindo, sem ambiente associado.

Somente **proprietários e administradores** do workspace gerenciam ambientes e credenciais.
`,
  },

  /* ------------------------- Segurança e limites ------------------------- */
  {
    id: "seguranca",
    group: "Segurança e limites",
    title: "Segurança e privacidade",
    summary: "Como o app protege credenciais, ambientes e dados.",
    body: md`
### Acesso e papéis

O login usa **Supabase Auth**. Os dados são isolados por **workspace** com **Row Level Security (RLS)**: ninguém enxerga ambientes, coleções, histórico ou conversas de outro workspace.

| Papel | O que pode |
|---|---|
| **Proprietário / Administrador** | Tudo, incluindo gerenciar ambientes e credenciais. |
| **Membro** | Usar API Tester, Laboratório SOAP, Construtor, Assistente e Diagnóstico; salvar coleções. |
| **Leitor** | Apenas consultar dados; não executa chamadas nem usa a IA. |

### Credenciais

- Ficam **cifradas no servidor** (AES-256-GCM) e **nunca são enviadas ao navegador**. O banco também impede o navegador de ler ou gravar essa coluna.
- As chaves da Anthropic e do Supabase de serviço existem **só no servidor**.

### Proteção das chamadas

- Você informa apenas o **caminho**; a URL final é sempre montada a partir da URL base do ambiente. Não existe chamada para URL arbitrária.
- Faixas de IP **internas, de loopback, de metadados de nuvem e reservadas** são bloqueadas, inclusive quando um nome de domínio resolve para elas.
- **Redirecionamentos não são seguidos.**
- **Somente leitura por padrão.** Operações que alteram dados exigem liberação explícita no ambiente.
- Limites de tempo (30 s REST, 45 s SOAP) e de tamanho de resposta.

### O que vai para a IA

- **Assistente:** a sua pergunta, o histórico recente da conversa e os trechos da documentação encontrados.
- **Diagnóstico:** o texto que você colou **depois** da ocultação de segredos, os sinais detectados, os dados não sensíveis do ambiente (nome, host, tipo de autenticação) e a requisição anexada (também com segredos ocultados).
- Nenhuma credencial cadastrada é enviada à IA.

### Proteções do navegador

- As rotas internas do app recusam chamadas vindas de **outros sites** (proteção contra CSRF), além de exigirem sessão válida e JSON.
- O app envia headers de segurança: **Content-Security-Policy** (o navegador só se conecta ao próprio app e ao Supabase), proibição de abrir o app dentro de outro site (**frame-ancestors**/**X-Frame-Options**), **nosniff**, **Referrer-Policy** e **HSTS**.
- As chamadas ao Fluig e à IA saem **do servidor**, nunca do navegador.

### Auditoria

Execuções e diagnósticos ficam registrados no histórico, com valores sensíveis mascarados. Cada usuário pode excluir apenas os próprios registros.
`,
  },
  {
    id: "limites",
    group: "Segurança e limites",
    title: "Limites e tamanhos",
    summary: "Quotas e tetos que você pode encontrar.",
    body: md`
| Recurso | Limite |
|---|---|
| Chamada REST | 30 s de tempo limite; leitura de até 2 MB da resposta; 1 MB exibido na tela |
| Chamada SOAP | 45 s de tempo limite |
| Corpo de requisição | até 1 MB |
| Histórico guardado | até 100 KB de resposta e 20 KB de corpo de requisição por execução |
| Histórico exibido no API Tester | últimas 25 execuções |
| Tela Histórico | 25 registros por página |
| Importação de WSDL | arquivo de até 2 MB; até 40 serviços por importação; até 12 documentos (WSDL e imports) por serviço |
| Assistente IA | 4.000 caracteres por pergunta; 8 perguntas/minuto; 300/dia por usuário |
| Diagnóstico | 20.000 caracteres; 5 diagnósticos/minuto; 100/dia por usuário |
| Catálogo | 20 resultados por página |
`,
  },

  /* ------------------------------- Referência ------------------------------ */
  {
    id: "problemas-comuns",
    group: "Referência",
    title: "Problemas comuns",
    summary: "Mensagens frequentes e o que fazer.",
    body: md`
### "tenantNotSelected" ou 404 na API REST

O Fluig não identificou o tenant da chamada. Em um ambiente de teste isso ocorreu usando **Basic** na API REST. Use um ambiente com **OAuth 1.0a** (veja [Ambientes e credenciais](#ambientes-credenciais)).

### 401 ou 403 na API REST

- Confira consumer key, consumer secret, access token e token secret do aplicativo OAuth.
- Um **403** com credenciais corretas costuma indicar que o **usuário aplicativo não tem permissão** naquela rota (algumas rotas, como as de monitoramento, são de administração).
- Use **Diagnosticar este erro** para uma análise guiada.

### "Falha de login" (SOAP)

Os métodos SOAP recebem usuário e senha como parâmetros. Verifique se o ambiente usado é **Basic**, se as credenciais estão corretas e se o envelope usa os marcadores ‵{{ENV_USERNAME}}‵ e ‵{{ENV_PASSWORD}}‵ (ou valores válidos).

### "O ambiente está em modo somente leitura"

A operação não é uma consulta. Se for realmente necessário, um proprietário ou administrador pode ligar **Permitir métodos que alteram dados** em **Configurações**. Prefira fazer isso em ambiente de homologação.

### "O caminho informado sai da URL base do ambiente"

Informe só o caminho (começando com ‵/‵), sem o endereço do servidor.

### "Tempo limite excedido"

A rota demorou mais que o limite. Reduza o volume com filtros ou paginação. Se acontece com qualquer rota, verifique a disponibilidade do ambiente.

### "Falha na verificação do certificado TLS"

O servidor do ambiente usa um certificado que não pôde ser validado (autoassinado, expirado ou cadeia incompleta). Corrija o certificado do ambiente; o app não ignora esse erro.

### Não consigo importar um WSDL

- Confirme que o ambiente está **ativo** e que o caminho é do tipo ‵/webdesk/<Serviço>?wsdl‵.
- Se o arquivo enviado referencia imports externos, importe pelo ambiente.
- Veja os **Avisos** exibidos após a importação.

### "Sessão expirada"

Recarregue a página e entre novamente.

### O assistente respondeu "não encontrei informação suficiente"

Reformule com nomes exatos de serviços ou métodos, consulte o **Catálogo** e verifique o WSDL ou o Swagger do seu ambiente.

### Desenvolvimento local em rede corporativa

Se o servidor local não consegue validar a sessão ou acessar o Fluig por causa de inspeção TLS da rede, inicie o Node com ‵--use-system-ca‵ (Node 22.15 ou superior).
`,
  },
  {
    id: "glossario",
    group: "Referência",
    title: "Glossário",
    summary: "Termos usados no app.",
    body: md`
| Termo | Significado |
|---|---|
| **Ambiente** | Uma instalação do Fluig cadastrada no app (URL base + autenticação). |
| **Tenant** | Empresa/inquilino dentro de um Fluig multi-tenant. |
| **API pública** | API REST do Fluig acessível por OAuth 1.0a, sob o prefixo ‵/api/public‵ (REST antigo) ou por módulo (REST novo). |
| **OAuth 1.0a** | Protocolo de autenticação com chaves do aplicativo (consumer key/secret) e do usuário (access token/secret), com assinatura HMAC-SHA1 a cada chamada. |
| **Consumer key / secret** | Identificador e segredo do **aplicativo** cadastrado no Fluig. |
| **Access token / token secret** | Identificador e segredo do **usuário aplicativo** (ou do usuário que autorizou). |
| **WSDL** | Arquivo que descreve um Web Service SOAP: operações, parâmetros, endereço e SOAPAction. |
| **Envelope SOAP** | O XML enviado a um Web Service (Envelope, Header e Body). |
| **SOAPAction** | Cabeçalho que identifica a operação SOAP chamada. |
| **SOAP Fault** | Resposta de erro de um Web Service SOAP. |
| **SDK** | Componente Java do Fluig acessado por ‵FluigAPI‵ (em eventos customizados, ‵fluigAPI‵). |
| **Swagger / OpenAPI** | Descrição estruturada das APIs REST novas. |
| **Marcador** | Texto como ‵SUA_SENHA‵ ou ‵NAMESPACE_DO_WSDL‵ que você deve substituir. |
| **RLS** | Row Level Security: regra do banco que isola dados por workspace. |
| **Workspace** | Espaço de trabalho que agrupa ambientes, coleções, histórico e conversas. |
`,
  },
  {
    id: "fontes",
    group: "Referência",
    title: "Fontes da documentação",
    summary: "De onde vêm os dados do catálogo e do assistente.",
    body: md`
O conteúdo vem exclusivamente de fontes oficiais:

- **api.fluig.com/latest:** Swagger de cada API REST nova publicada.
- **api.fluig.com/old:** páginas de recursos do REST antigo.
- **api.fluig.com/old/sdk:** Javadoc do SDK (serviços e a classe ‵FluigAPI‵).
- **TDN (TOTVS):** documentação dos Web Services SOAP e páginas conceituais (API pública e OAuth, consumo de serviços e SDK, utilização de Web Services, autorização de clients REST e o índice de integrações).
- **Este guia:** descreve o uso do próprio aplicativo.

O TDN bloqueia acesso automatizado; por isso as páginas dele são **salvas manualmente** e importadas de arquivo.

Cada entrada guarda o **link da fonte**. Se algo parecer divergente da sua versão do Fluig, confirme no **WSDL** ou no **Swagger do seu ambiente**, que refletem a versão exata instalada.
`,
  },

  /* ----------------------------- Administração ---------------------------- */
  {
    id: "administracao",
    group: "Administração",
    title: "Para administradores",
    summary: "Configuração, migrations e atualização da documentação.",
    body: md`
Esta seção é para quem mantém a instalação do app.

### Variáveis de ambiente

| Variável | Uso |
|---|---|
| ‵NEXT_PUBLIC_SUPABASE_URL‵ / ‵NEXT_PUBLIC_SUPABASE_ANON_KEY‵ | Conexão pública com o Supabase. |
| ‵SUPABASE_SERVICE_ROLE_KEY‵ | Somente servidor: gravação de credenciais cifradas, Storage e importação. **Nunca** use o prefixo ‵NEXT_PUBLIC‵. |
| ‵CREDENTIALS_ENCRYPTION_KEY‵ | 32 bytes (64 caracteres hex ou base64) para cifrar credenciais. Se for perdida, as credenciais precisam ser cadastradas de novo. |
| ‵ANTHROPIC_API_KEY‵ | Somente servidor: assistente e diagnóstico. |
| ‵ANTHROPIC_MODEL‵ | Opcional. Modelo usado (padrão ‵claude-sonnet-5-5‵). |

Na Vercel, cadastre as mesmas variáveis. No Supabase, em **Authentication > URL Configuration**, defina o **Site URL** do app e inclua ‵/auth/callback‵ nas **Redirect URLs**.

### Migrations (SQL Editor do Supabase, nesta ordem)

1. ‵20261104000001_core_workspaces.sql‵ (perfis, workspaces, papéis e RLS)
2. ‵20261104000002_catalog.sql‵ (catálogo e fontes)
3. ‵20261104000003_knowledge_base.sql‵ (base de conhecimento)
4. ‵20261104000004_workspace_data.sql‵ (ambientes, coleções, histórico, SOAP, IA, diagnósticos)
5. ‵20261104000005_parameter_argument_location.sql‵ (argumentos de métodos SOAP/SDK)
6. ‵20261104000006_kb_fulltext_search.sql‵ (busca do assistente)
7. ‵20261104000007_catalog_topics.sql‵ (assuntos do catálogo); depois rode ‵npm run ingest -- --source=topics‵ para classificar as entradas já importadas

Todas são idempotentes.

### Importar ou atualizar a documentação

Os comandos usam a service role e rodam na máquina do administrador:

‵‵‵bash
npm run ingest -- --source=rest-new   # api.fluig.com/latest
npm run ingest -- --source=rest-old   # api.fluig.com/old
npm run ingest -- --source=sdk        # Javadoc do SDK
npm run ingest -- --source=tdn        # páginas do TDN salvas em documentos/
npm run ingest -- --source=help       # este guia
npm run ingest -- --source=all --dry-run   # simula, sem gravar
‵‵‵

Para o TDN, salve a página (Salvar como HTML) na pasta ‵documentos/‵ e rode ‵--source=tdn‵. As importações são **idempotentes**: rodar de novo não duplica dados.

Em rede corporativa com inspeção TLS, o comando já usa o repositório de certificados do sistema (‵--use-system-ca‵).

### Testes automatizados

‵‵‵bash
npm test
‵‵‵

Roda os testes com o executor nativo do Node (sem dependências extras): criptografia das credenciais, bloqueio de SSRF, assinatura OAuth 1.0a (vetor da RFC 5849), ocultação de segredos, proteção contra CSRF, leitura de WSDL e de SOAP Fault, geradores de código, ponte Construtor → API Tester, filtros do catálogo e do histórico. Os testes não acessam o banco nem o Fluig.
`,
  },
];

export const HELP_GROUPS: HelpGroup[] = ["Começando", "Módulos", "Segurança e limites", "Referência", "Administração"];

export function sectionsByGroup() {
  return HELP_GROUPS.map((group) => ({
    group,
    sections: HELP_SECTIONS.filter((s) => s.group === group),
  }));
}
