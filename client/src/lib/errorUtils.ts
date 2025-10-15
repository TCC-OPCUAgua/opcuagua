/**
 * Extrai uma mensagem de erro limpa e amigável a partir de um erro
 * Remove códigos de status HTTP, parse JSON quando necessário
 */
export function getCleanErrorMessage(error: unknown, fallbackMessage: string = "Ocorreu um erro inesperado"): string {
  // Se for um objeto com propriedade message (como resultado de API {message: "...", success: false})
  // mas não for um Error (Error é tratado separadamente abaixo para fazer limpeza de códigos HTTP)
  if (!(error instanceof Error) && error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') {
      return getUserFriendlyMessage(message);
    }
  }
  
  if (error instanceof Error) {
    // A mensagem de erro do apiRequest tem formato: "500: {JSON}" ou "500: texto"
    // Remover o código de status HTTP primeiro
    let cleanedMessage = error.message.replace(/^\d+:\s*/, '');
    
    try {
      // Tentar parsear se for um JSON
      const errorObj = JSON.parse(cleanedMessage);
      return getUserFriendlyMessage(errorObj.message || cleanedMessage || fallbackMessage);
    } catch {
      // Se não for JSON válido, usar a mensagem limpa
      return getUserFriendlyMessage(cleanedMessage || fallbackMessage);
    }
  }
  
  if (typeof error === 'string') {
    return getUserFriendlyMessage(error);
  }
  
  return fallbackMessage;
}

/**
 * Mapeia mensagens técnicas para mensagens amigáveis em português
 */
export function getUserFriendlyMessage(technicalMessage: string): string {
  const message = technicalMessage.toLowerCase();
  
  // Erros de conexão
  if (message.includes('fail to connect') || message.includes('connection failed')) {
    return 'Não foi possível conectar ao servidor. Verifique se o servidor está acessível.';
  }
  
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'A operação demorou muito tempo e foi cancelada. Tente novamente.';
  }
  
  if (message.includes('network') || message.includes('fetch failed')) {
    return 'Erro de rede. Verifique sua conexão com a internet.';
  }
  
  // Erros de autenticação
  if (message.includes('unauthorized') || message.includes('401')) {
    return 'Você não tem permissão para realizar esta ação.';
  }
  
  if (message.includes('forbidden') || message.includes('403')) {
    return 'Acesso negado a este recurso.';
  }
  
  // Erros de recurso
  if (message.includes('not found') || message.includes('404')) {
    return 'O recurso solicitado não foi encontrado.';
  }
  
  // Erros de servidor
  if (message.includes('internal server error') || message.includes('500')) {
    return 'Erro interno do servidor. Tente novamente mais tarde.';
  }
  
  if (message.includes('bad gateway') || message.includes('502')) {
    return 'Servidor indisponível temporariamente. Tente novamente.';
  }
  
  // Se não houver mapeamento específico, retornar a mensagem original
  return technicalMessage;
}
