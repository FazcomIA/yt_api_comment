/**
 * YoutubeCommentDownloader - Biblioteca para baixar comentários do YouTube
 */

const axios = require('axios');

const YOUTUBE_VIDEO_URL = 'https://www.youtube.com/watch?v={youtube_id}';
const YOUTUBE_CONSENT_URL = 'https://consent.youtube.com/save';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.130 Safari/537.36';

const SORT_BY_POPULAR = 0;
const SORT_BY_RECENT = 1;

const YT_CFG_RE = /ytcfg\.set\s*\(\s*({.+?})\s*\)\s*;/;
const YT_INITIAL_DATA_RE = /(?:window\s*\[\s*["']ytInitialData["']\s*\]|ytInitialData)\s*=\s*({.+?})\s*;\s*(?:var\s+meta|<\/script|\n)/;
const YT_HIDDEN_INPUT_RE = /<input\s+type="hidden"\s+name="([A-Za-z0-9_]+)"\s+value="([A-Za-z0-9_\-\.]*)"\s*(?:required|)\s*>/g;

class YoutubeCommentDownloader {
  constructor() {
    this.client = axios.create({
      headers: {
        'User-Agent': USER_AGENT,
        'Cookie': 'CONSENT=YES+cb'
      }
    });
  }

  /**
   * Faz uma requisição AJAX para o YouTube
   */
  async ajaxRequest(endpoint, ytcfg, retries = 5, sleepTime = 20) {
    const url = 'https://www.youtube.com' + endpoint.commandMetadata.webCommandMetadata.apiUrl;

    const data = {
      context: ytcfg.INNERTUBE_CONTEXT,
      continuation: endpoint.continuationCommand.token
    };

    for (let i = 0; i < retries; i++) {
      try {
        const response = await this.client.post(url, data, {
          params: { key: ytcfg.INNERTUBE_API_KEY }
        });
        
        if (response.status === 200) {
          return response.data;
        }
        
        if (response.status === 403 || response.status === 413) {
          return {};
        }
      } catch (error) {
        console.error('Erro na requisição AJAX:', error.message);
      }
      
      await this.sleep(sleepTime * 1000);
    }
    
    return {};
  }

  /**
   * Obtém comentários a partir do ID do vídeo
   */
  async getComments(youtubeId, sortBy = SORT_BY_RECENT, language = null, sleepTime = 0.1) {
    const youtubeUrl = YOUTUBE_VIDEO_URL.replace('{youtube_id}', youtubeId);
    return this.getCommentsFromUrl(youtubeUrl, sortBy, language, sleepTime);
  }

  /**
   * Obtém comentários a partir da URL do vídeo
   */
  async getCommentsFromUrl(youtubeUrl, sortBy = SORT_BY_RECENT, language = null, sleepTime = 0.1) {
    try {
      let response = await this.client.get(youtubeUrl);

      // Verificar se fomos redirecionados para página de consentimento
      if (response.request.res.responseUrl.includes('consent')) {
        const html = response.data;
        const params = {};
        let match;
        
        while ((match = YT_HIDDEN_INPUT_RE.exec(html)) !== null) {
          params[match[1]] = match[2];
        }

        params.continue = youtubeUrl;
        params.set_eom = false;
        params.set_ytc = true;
        params.set_apyt = true;

        response = await this.client.post(YOUTUBE_CONSENT_URL, null, {
          params: params
        });
      }

      const html = response.data;
      
      // Extrair configuração YouTube
      const ytcfgMatch = YT_CFG_RE.exec(html);
      if (!ytcfgMatch) {
        return []; // Não foi possível extrair configuração
      }
      const ytcfg = JSON.parse(ytcfgMatch[1]);
      
      if (language) {
        ytcfg.INNERTUBE_CONTEXT.client.hl = language;
      }

      // Extrair dados iniciais
      const dataMatch = YT_INITIAL_DATA_RE.exec(html);
      if (!dataMatch) {
        return []; // Não foi possível extrair dados iniciais
      }
      let data = JSON.parse(dataMatch[1]);

      // Buscar pela seção de comentários
      const itemSection = this.findFirst(this.searchDict(data, 'itemSectionRenderer'));
      const renderer = itemSection ? this.findFirst(this.searchDict(itemSection, 'continuationItemRenderer')) : null;
      
      if (!renderer) {
        return []; // Comentários desativados
      }

      let sortMenu = this.findFirst(this.searchDict(data, 'sortFilterSubMenuRenderer'))?.subMenuItems || [];
      
      if (!sortMenu || sortMenu.length === 0) {
        // Sem menu de ordenação. Talvez seja uma solicitação para posts da comunidade?
        const sectionList = this.findFirst(this.searchDict(data, 'sectionListRenderer')) || {};
        const continuations = Array.from(this.searchDict(sectionList, 'continuationEndpoint'));
        
        // Tentar novamente
        if (continuations && continuations.length > 0) {
          data = await this.ajaxRequest(continuations[0], ytcfg) || {};
          sortMenu = this.findFirst(this.searchDict(data, 'sortFilterSubMenuRenderer'))?.subMenuItems || [];
        }
      }

      if (!sortMenu || sortMenu.length === 0 || sortBy >= sortMenu.length) {
        throw new Error('Falha ao definir a ordenação');
      }

      let continuations = [sortMenu[sortBy].serviceEndpoint];
      const comments = [];

      while (continuations.length > 0) {
        const continuation = continuations.shift();
        const response = await this.ajaxRequest(continuation, ytcfg);

        if (!response) {
          break;
        }

        const error = this.findFirst(this.searchDict(response, 'externalErrorMessage'));
        if (error) {
          throw new Error('Erro retornado pelo servidor: ' + error);
        }

        const actions = [
          ...Array.from(this.searchDict(response, 'reloadContinuationItemsCommand')),
          ...Array.from(this.searchDict(response, 'appendContinuationItemsAction'))
        ];

        for (const action of actions) {
          for (const item of action.continuationItems || []) {
            if (['comments-section', 'engagement-panel-comments-section', 'shorts-engagement-panel-comments-section'].includes(action.targetId)) {
              // Processar continuações para comentários e respostas
              const newContinuations = Array.from(this.searchDict(item, 'continuationEndpoint'));
              continuations.unshift(...newContinuations);
            }
            if (action.targetId.startsWith('comment-replies-item') && 'continuationItemRenderer' in item) {
              // Processar o botão "Mostrar mais respostas"
              continuations.push(this.findFirst(this.searchDict(item, 'buttonRenderer')).command);
            }
          }
        }

        const surfacePayloads = Array.from(this.searchDict(response, 'commentSurfaceEntityPayload'));
        const payments = {};
        
        for (const payload of surfacePayloads) {
          if ('pdgCommentChip' in payload) {
            payments[payload.key] = this.findFirst(this.searchDict(payload, 'simpleText')) || '';
          }
        }

        let surfaceKeys = {};
        if (Object.keys(payments).length > 0) {
          // Mapear as chaves de payload para os IDs de comentários
          const viewModels = Array.from(this.searchDict(response, 'commentViewModel'))
            .map(vm => vm.commentViewModel);
            
          surfaceKeys = viewModels
            .filter(vm => 'commentSurfaceKey' in vm)
            .reduce((acc, vm) => {
              acc[vm.commentSurfaceKey] = vm.commentId;
              return acc;
            }, {});
        }

        const paymentsMapped = {};
        for (const [key, payment] of Object.entries(payments)) {
          if (key in surfaceKeys) {
            paymentsMapped[surfaceKeys[key]] = payment;
          }
        }

        const toolbarPayloads = Array.from(this.searchDict(response, 'engagementToolbarStateEntityPayload'));
        const toolbarStates = toolbarPayloads.reduce((acc, payload) => {
          acc[payload.key] = payload;
          return acc;
        }, {});

        const commentPayloads = Array.from(this.searchDict(response, 'commentEntityPayload')).reverse();
        
        for (const comment of commentPayloads) {
          const properties = comment.properties;
          const cid = properties.commentId;
          const author = comment.author;
          const toolbar = comment.toolbar;
          const toolbarState = toolbarStates[properties.toolbarStateKey];
          
          const result = {
            cid: cid,
            text: properties.content.content,
            time: properties.publishedTime,
            author: author.displayName,
            channel: author.channelId,
            votes: toolbar.likeCountNotliked.trim() || "0",
            replies: toolbar.replyCount,
            photo: author.avatarThumbnailUrl,
            heart: (toolbarState?.heartState || '') === 'TOOLBAR_HEART_STATE_HEARTED',
            reply: cid.includes('.')
          };

          try {
            // Conversão aproximada da análise de data
            const dateString = result.time.split('(')[0].trim();
            result.time_parsed = new Date(dateString).getTime() / 1000;
          } catch (e) {
            // Ignorar erro na análise de data
          }

          if (cid in paymentsMapped) {
            result.paid = paymentsMapped[cid];
          }

          comments.push(result);
        }

        await this.sleep(sleepTime * 1000);
      }

      return comments;
    } catch (error) {
      console.error('Erro ao obter comentários:', error);
      return [];
    }
  }

  /**
   * Encontra o primeiro item em um iterador
   */
  findFirst(iterator, defaultValue = null) {
    for (const item of iterator) {
      return item;
    }
    return defaultValue;
  }

  /**
   * Busca valores em um objeto com base em uma chave
   */
  *searchDict(obj, searchKey) {
    const stack = [obj];
    
    while (stack.length > 0) {
      const currentItem = stack.pop();
      
      if (typeof currentItem === 'object' && currentItem !== null) {
        if (Array.isArray(currentItem)) {
          stack.push(...currentItem);
        } else {
          for (const [key, value] of Object.entries(currentItem)) {
            if (key === searchKey) {
              yield value;
            } else if (value !== null && typeof value === 'object') {
              stack.push(value);
            }
          }
        }
      }
    }
  }

  /**
   * Função de espera
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Converte uma string de tempo relativa (como "há 5 dias") para uma data no formato DD-MM-YYYY
   * @param {string} tempoRelativo - String com tempo relativo em português
   * @returns {string} - Data formatada como DD-MM-YYYY
   */
  converterDataRelativa(tempoRelativo) {
    try {
      const agora = new Date();
      const match = tempoRelativo.match(/há\s+(\d+)\s+(\w+)/i);
      
      if (!match) {
        return this.formatarData(agora); // Se não conseguir fazer o parse, retorna a data atual
      }
      
      const quantidade = parseInt(match[1], 10);
      const unidade = match[2].toLowerCase();
      
      // Determinar o multiplicador com base na unidade de tempo
      let multiplicador = 0;
      
      if (unidade.includes('segundo')) {
        multiplicador = 1000; // milissegundos
      } else if (unidade.includes('minuto')) {
        multiplicador = 60 * 1000; // segundos * milissegundos
      } else if (unidade.includes('hora')) {
        multiplicador = 60 * 60 * 1000; // minutos * segundos * milissegundos
      } else if (unidade.includes('dia')) {
        multiplicador = 24 * 60 * 60 * 1000; // horas * minutos * segundos * milissegundos
      } else if (unidade.includes('semana')) {
        multiplicador = 7 * 24 * 60 * 60 * 1000; // dias * horas * minutos * segundos * milissegundos
      } else if (unidade.includes('mês') || unidade.includes('meses')) {
        multiplicador = 30 * 24 * 60 * 60 * 1000; // ~30 dias * horas * minutos * segundos * milissegundos
      } else if (unidade.includes('ano')) {
        multiplicador = 365 * 24 * 60 * 60 * 1000; // ~365 dias * horas * minutos * segundos * milissegundos
      }
      
      // Calcular a data subtraindo o tempo relativo
      const dataCalculada = new Date(agora.getTime() - (quantidade * multiplicador));
      
      return this.formatarData(dataCalculada);
    } catch (error) {
      return this.formatarData(new Date()); // Em caso de erro, retorna a data atual
    }
  }
  
  /**
   * Formata uma data para o timezone America/São Paulo no formato DD-MM-YYYY
   * @param {Date} data - Objeto de data a ser formatado
   * @returns {string} - Data formatada
   */
  formatarData(data) {
    // Converter para o timezone de America/São Paulo
    // Como estamos usando apenas JavaScript puro, vamos criar um objeto com opções de timezone
    const options = { 
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    };
    
    // Formatação da data usando Intl.DateTimeFormat
    const dataFormatada = new Intl.DateTimeFormat('pt-BR', options).format(data);
    
    // Converter de DD/MM/YYYY para DD-MM-YYYY
    return dataFormatada.replace(/\//g, '-');
  }

  /**
   * Obtém comentários como JSON com campos específicos
   * @param {string} youtubeId - ID do vídeo do YouTube
   * @param {number} sortBy - Tipo de ordenação (SORT_BY_RECENT ou SORT_BY_POPULAR)
   * @param {string} language - Código do idioma (ex: 'pt', 'en')
   * @param {number} sleepTime - Tempo de espera entre requisições em segundos
   * @returns {Object} - Objeto JSON com os comentários filtrados
   */
  async getCommentsAsJson(youtubeId, sortBy = SORT_BY_RECENT, language = null, sleepTime = 0.1) {
    // Obter todos os comentários
    const allComments = await this.getComments(youtubeId, sortBy, language, sleepTime);
    
    // Filtrar e renomear os campos conforme solicitado
    return allComments.map(comment => ({
      cid: comment.cid,
      user: comment.author,
      text: comment.text,
      time: comment.time,
      data: this.converterDataRelativa(comment.time),
      respostas: comment.replies
    }));
  }

  /**
   * Obtém comentários como JSON com campos específicos a partir da URL do vídeo
   * @param {string} youtubeUrl - URL do vídeo do YouTube
   * @param {number} sortBy - Tipo de ordenação (SORT_BY_RECENT ou SORT_BY_POPULAR)
   * @param {string} language - Código do idioma (ex: 'pt', 'en')
   * @param {number} sleepTime - Tempo de espera entre requisições em segundos
   * @returns {Object} - Objeto JSON com os comentários filtrados
   */
  async getCommentsFromUrlAsJson(youtubeUrl, sortBy = SORT_BY_RECENT, language = null, sleepTime = 0.1) {
    // Obter todos os comentários
    const allComments = await this.getCommentsFromUrl(youtubeUrl, sortBy, language, sleepTime);
    
    // Filtrar e renomear os campos conforme solicitado
    return allComments.map(comment => ({
      cid: comment.cid,
      user: comment.author,
      text: comment.text,
      time: comment.time,
      data: this.converterDataRelativa(comment.time),
      respostas: comment.replies
    }));
  }
}

module.exports = {
  YoutubeCommentDownloader,
  SORT_BY_POPULAR,
  SORT_BY_RECENT
}; 