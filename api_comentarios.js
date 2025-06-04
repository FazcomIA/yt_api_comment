/**
 * API para obter comentários do YouTube em formato JSON personalizado
 * 
 * Cada objeto de comentário contém os seguintes campos:
 * - cid: ID do comentário
 * - user: Nome do autor do comentário
 * - text: Texto do comentário
 * - time: Tempo relativo (ex: "há 2 dias")
 * - data: Data formatada como DD-MM-YYYY, calculada a partir do tempo relativo
 * - respostas: Número de respostas ao comentário
 */

const { YoutubeCommentDownloader, SORT_BY_RECENT, SORT_BY_POPULAR } = require('./youtube_comment_downloader');

/**
 * Obtém comentários do YouTube no formato JSON personalizado
 * @param {string} videoIdOuUrl - ID do vídeo ou URL completa do YouTube
 * @param {Object} opcoes - Opções adicionais
 * @param {number} [opcoes.limite=50] - Quantidade máxima de comentários a serem retornados
 * @param {string} [opcoes.idioma='pt'] - Código do idioma
 * @param {number} [opcoes.ordenacao=1] - Ordenação (1 = mais recentes, 0 = mais populares)
 * @returns {Promise<Array>} - Promise que resolve para um array de comentários
 */
async function obterComentarios(videoIdOuUrl, opcoes = {}) {
  // Valores padrão para as opções
  const {
    limite = 50,
    idioma = 'pt',
    ordenacao = SORT_BY_RECENT
  } = opcoes;
  
  if (!videoIdOuUrl) {
    throw new Error('É necessário fornecer o ID do vídeo ou a URL');
  }

  try {
    const downloader = new YoutubeCommentDownloader();
    const ehUrl = videoIdOuUrl.includes('youtube.com') || videoIdOuUrl.includes('youtu.be');
    
    let comentarios;
    
    // Obter comentários com base no tipo de entrada (URL ou ID)
    if (ehUrl) {
      comentarios = await downloader.getCommentsFromUrlAsJson(
        videoIdOuUrl,
        ordenacao,
        idioma,
        0.5
      );
    } else {
      comentarios = await downloader.getCommentsAsJson(
        videoIdOuUrl,
        ordenacao,
        idioma,
        0.5
      );
    }
    
    // Aplicar o limite
    return comentarios.slice(0, limite);
  } catch (error) {
    console.error('Erro ao obter comentários:', error.message);
    throw error;
  }
}

module.exports = { 
  obterComentarios,
  ORDENACAO_POPULARES: SORT_BY_POPULAR,
  ORDENACAO_RECENTES: SORT_BY_RECENT
};

// Exemplo de uso:
if (require.main === module) {
  // Este código só é executado se o arquivo for chamado diretamente (não como módulo)
  
  // Exemplo 1: Obter 20 comentários mais recentes
  obterComentarios('wctcZbWvpoY', { limite: 20 })
    .then(comentarios => {
      console.log(`Obtidos ${comentarios.length} comentários`);
      if (comentarios.length > 0) {
        console.log('Primeiro comentário:', comentarios[0]);
      }
    })
    .catch(erro => console.error('Falha:', erro));
} 