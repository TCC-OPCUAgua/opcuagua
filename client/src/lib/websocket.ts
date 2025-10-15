import { useState, useEffect, useRef, useCallback } from 'react';

// Tipos para os status de conexão e reconexão
export interface ConnectionStatus {
  connected: boolean;
  endpoint?: string;
  reconnecting?: boolean;
  retry?: number;
  delay?: number;
  reconnected?: boolean;
}

export const useWebSocket = (path: string) => {
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>({
    connected: false
  });
  const [serverEndpoint, setServerEndpoint] = useState<string>('');

  const MAX_RETRIES = 10;  // Aumentado para 10 tentativas
  const BASE_DELAY = 2000; // 2s

  useEffect(() => {
    let pingInterval: number;
    let reconnectTimer: number;
    let isComponentMounted = true;

    const connect = () => {
      if (!isComponentMounted) return;

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}${path}`;
        
        // Limpar qualquer WebSocket anterior antes de criar um novo
        if (socketRef.current && socketRef.current.readyState !== WebSocket.CLOSED) {
          socketRef.current.close(1000, "Criando nova conexão");
        }
        
        const ws = new WebSocket(url);
        socketRef.current = ws;

        ws.onopen = () => {
          if (!isComponentMounted) return;
          console.log('[WS] conectado');
          setIsConnected(true);
          setIsReconnecting(false);
          setRetryCount(0);

          // Enviar mensagem para verificar estado da conexão OPC UA logo após conectar
          setTimeout(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'get_connection_status' }));
            }
          }, 200);

          // envia ping de aplicação a cada 5s para maior estabilidade
          clearInterval(pingInterval);
          pingInterval = window.setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 5000);
        };

        ws.onmessage = (evt) => {
          if (!isComponentMounted) return;
          
          let data: any;
          try {
            data = JSON.parse(evt.data);
          } catch (e) {
            // mensagem não-JSON: repassar
            setLastMessage(evt);
            return;
          }

          // Processamos diferentes tipos de mensagens
          if (data.type === 'ping') {
            // responde o ping do servidor
            ws.send(JSON.stringify({ type: 'pong' }));
          } 
          else if (data.type === 'connection_status') {
            // Atualiza o status de conexão OPC UA
            setConnectionStatus(data);
            if (data.endpoint) {
              setServerEndpoint(data.endpoint);
            }
          }
          else {
            // Qualquer outra mensagem é considerada dados para o cliente
            setLastMessage(evt);
          }
        };

        ws.onclose = (ev) => {
          if (!isComponentMounted) return;
          
          console.warn(`[WS] desconectado (code=${ev.code})`);
          setIsConnected(false);
          clearInterval(pingInterval);

          // Fechamento normal e limpeza (códigos 1000 e 1001)
          if (ev.code === 1000 || ev.code === 1001) {
            console.log('[WS] Fechamento normal');
            return;
          }

          // Se não for um fechamento normal, tentamos reconectar
          if (retryCount < MAX_RETRIES) {
            // Cálculo de backoff exponencial com máximo de 10s
            const delay = Math.min(BASE_DELAY * Math.pow(1.5, retryCount), 10000);
            setIsReconnecting(true);
            console.log(`[WS] reconectar em ${delay}ms (tentativa ${retryCount+1})`);
            
            clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
              if (isComponentMounted) {
                setRetryCount((c) => c + 1);
                connect();   // tenta reconectar
              }
            }, delay);
          } else {
            setIsReconnecting(false);
            console.error('[WS] número máximo de tentativas alcançado');
          }
        };

        ws.onerror = (err) => {
          if (!isComponentMounted) return;
          console.error('[WS] erro', err);
        };
      } catch (error) {
        console.error("[WS] Erro ao estabelecer conexão:", error);
        // Tenta novamente após um atraso
        if (isComponentMounted) {
          clearTimeout(reconnectTimer);
          reconnectTimer = window.setTimeout(() => {
            if (isComponentMounted) {
              setRetryCount((c) => c + 1);
              connect();
            }
          }, 2000);
        }
      }
    };

    // inicia a conexão imediatamente
    connect();

    return () => {
      clearInterval(pingInterval);
      clearTimeout(reconnectTimer);
      socketRef.current?.close(1000, "Fechamento controlado");
    };
  }, [path, retryCount]);

  const sendMessage = useCallback((message: any) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      // Se for string, enviar direto; se for objeto, transformar em JSON
      const msg = typeof message === 'string' 
        ? message 
        : JSON.stringify(message);
      
      ws.send(msg);
      return true;
    }
    return false;
  }, []);

  const sendJsonMessage = useCallback((type: string, data: Record<string, any> = {}) => {
    return sendMessage({
      type,
      ...data
    });
  }, [sendMessage]);

  return { 
    isConnected, 
    isReconnecting,
    retryCount,
    lastMessage, 
    connectionStatus,
    serverEndpoint,
    sendMessage,
    sendJsonMessage
  };
};