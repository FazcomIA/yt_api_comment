# YouTube Comments API

Uma API JavaScript para obter comentários do YouTube de forma simplificada com campos específicos.

## Índice

- [Instalação](#instalação)
- [Requisitos](#requisitos)
- [Uso Básico](#uso-básico)
- [Exemplos](#exemplos)
- [Referência da API](#referência-da-api)
  - [Obter Comentários](#função-obtercomentariosvideoidouurl-opcoes)
  - [Constantes de Ordenação](#constantes-de-ordenação)
- [Formato dos Dados](#formato-dos-dados)
- [Funções Auxiliares](#funções-auxiliares)
- [Limitações](#limitações)

## Instalação

1. Clone o repositório:

```bash
git clone https://seu-repositorio/youtube-comment-downloader.git
cd youtube-comment-downloader
```

2. Instale as dependências:

```bash
npm install
```

## Requisitos

- Node.js 14.0 ou superior
- Dependências:
  - axios: Para fazer requisições HTTP

## Uso Básico

```javascript
// Importar a função principal
const { obterComentarios } = require('./api_comentarios');

// Obter comentários usando o ID do vídeo
obterComentarios('wctcZbWvpoY')
  .then(comentarios => {
    console.log(`Foram obtidos ${comentarios.length} comentários.`);
    console.log(comentarios[0]); // Exibir o primeiro comentário
  })
  .catch(erro => {
    console.error('Erro:', erro.message);
  });
```

## Exemplos

### 1. Obter comentários usando o ID do vídeo

```javascript
const { obterComentarios } = require('./api_comentarios');

// Obtém os 50 comentários mais recentes (padrão)
obterComentarios('wctcZbWvpoY')
  .then(comentarios => console.log(comentarios));
```

### 2. Obter comentários usando a URL completa do vídeo

```javascript
const { obterComentarios } = require('./api_comentarios');

obterComentarios('https://www.youtube.com/watch?v=wctcZbWvpoY')
  .then(comentarios => console.log(comentarios));
```

### 3. Limitar o número de comentários

```javascript
const { obterComentarios } = require('./api_comentarios');

// Obter apenas 10 comentários
obterComentarios('wctcZbWvpoY', { limite: 10 })
  .then(comentarios => console.log(comentarios));
```

### 4. Alterar a ordenação dos comentários

```javascript
const { obterComentarios, ORDENACAO_POPULARES } = require('./api_comentarios');

// Obter comentários ordenados por popularidade
obterComentarios('wctcZbWvpoY', { ordenacao: ORDENACAO_POPULARES })
  .then(comentarios => console.log(comentarios));
```

### 5. Alterar o idioma

```javascript
const { obterComentarios } = require('./api_comentarios');

// Obter comentários em inglês
obterComentarios('wctcZbWvpoY', { idioma: 'en' })
  .then(comentarios => console.log(comentarios));
```

### 6. Combinando vários parâmetros

```javascript
const { obterComentarios, ORDENACAO_POPULARES } = require('./api_comentarios');

// Obter 25 comentários mais populares em inglês
obterComentarios('wctcZbWvpoY', {
  limite: 25,
  ordenacao: ORDENACAO_POPULARES,
  idioma: 'en'
})
  .then(comentarios => console.log(comentarios));
```

## Referência da API

### função `obterComentarios(videoIdOuUrl, opcoes)`

Obtém comentários de um vídeo do YouTube.

#### Parâmetros:

- **videoIdOuUrl** `{string}`: ID do vídeo ou URL completa do YouTube.
- **opcoes** `{Object}` (opcional): Opções adicionais.
  - **limite** `{number}` (padrão: 50): Quantidade máxima de comentários a retornar.
  - **idioma** `{string}` (padrão: 'pt'): Código do idioma.
  - **ordenacao** `{number}` (padrão: ORDENACAO_RECENTES): Tipo de ordenação.

#### Retorno:

- `{Promise<Array>}`: Promise que resolve para um array de objetos de comentários.

### Constantes de Ordenação

- **ORDENACAO_RECENTES** (valor: 1): Ordena comentários por data, do mais recente para o mais antigo.
- **ORDENACAO_POPULARES** (valor: 0): Ordena comentários por popularidade (mais likes primeiro).

## Formato dos Dados

Cada comentário é retornado como um objeto com os seguintes campos:

```javascript
{
  cid: "UgyUBI70XozBHR_l4aJ4AaABAg", // ID único do comentário
  user: "Nome do Usuário",           // Nome do autor do comentário
  text: "Este é o texto do comentário", // Conteúdo do comentário
  time: "há 3 dias",                 // Tempo relativo (original do YouTube)
  data: "25-10-2023",                // Data formatada como DD-MM-YYYY
  respostas: 5                       // Número de respostas ao comentário
}
```

## Funções Auxiliares

O arquivo `teste_data.js` inclui um utilitário para testar a conversão de datas relativas para o formato DD-MM-YYYY:

```bash
node teste_data.js
```

Este comando mostra como o sistema converte diferentes formatos de datas relativas (como "há 5 dias", "há 2 anos", etc.) para o formato DD-MM-YYYY considerando o timezone de America/São Paulo.

## Limitações

- A API depende da estrutura interna do YouTube que pode mudar sem aviso prévio.
- O uso excessivo da API pode resultar em bloqueio temporário pelo YouTube.
- O YouTube pode limitar o número total de comentários que podem ser carregados para vídeos com muitos comentários.
- A conversão de tempo relativo para data absoluta é uma aproximação e pode não ser 100% precisa, especialmente para unidades maiores como meses e anos. 