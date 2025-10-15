import { createContext, useContext, ReactNode, useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useWebSocket } from '@/lib/websocket';
import { useToast } from '@/hooks/use-toast';
import { getCleanErrorMessage } from '@/lib/errorUtils';

export interface OpcUaConnectionInfo {
  host: string;
  port: number;
  securityPolicy: string;
  securityMode: string;
  username?: string;
  password?: string;
}

export interface OpcUaNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  description?: string;
  nodeClass: string;
  dataType?: string;
  isFolder: boolean;
}

export interface Tag {
  id: number;
  nodeId: string;
  browseName: string;
  displayName: string;
  description?: string;
  dataType?: string;
  isSubscribed: boolean;
  personId?: number;
}

export interface Reading {
  id: number;
  tagId: number;
  value: number | null;
  quality: string;
  timestamp: string;
}

export interface Person {
  id: number;
  name: string;
  location?: string;
  latitude?: number;
  longitude?: number;
}

interface OpcUaContextType {
  isConnected: boolean;
  isReconnecting: boolean;
  connectionEndpoint: string;
  lastUpdated: Date | null;
  connecting: boolean;
  connect: (connectionId: number) => Promise<void>;
  disconnect: () => Promise<void>;
  browseNodes: (nodeId: string) => Promise<OpcUaNode[]>;
  subscribeToTag: (tagId: number) => Promise<void>;
  unsubscribeFromTag: (tagId: number) => Promise<void>;
  latestReadings: Record<string, { value: any, timestamp: Date }>;
  nodesBeingBrowsed: Record<string, boolean>;
  // Novo estado de reconexão
  retryCount: number;
}

const OpcUaContext = createContext<OpcUaContextType | undefined>(undefined);

export function OpcUaProvider({ children }: { children: ReactNode }) {
  // Estados de conexão websocket
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [latestReadings, setLatestReadings] = useState<Record<string, { value: any, timestamp: Date }>>({});
  const [nodesBeingBrowsed, setNodesBeingBrowsed] = useState<Record<string, boolean>>({});

  // Refs para controlar o timeout de conexão
  const connectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const toastShownRef = useRef(false);
  const isConnectedRef = useRef(false);

  const { toast } = useToast();
  
  // Usar o hook WebSocket melhorado 
  const { 
    lastMessage, 
    sendJsonMessage, 
    connectionStatus, 
    serverEndpoint, 
    isConnected: wsConnected,
    isReconnecting,
    retryCount
  } = useWebSocket('/ws');

  // Mapear estados do WebSocket para o contexto
  const isConnected = connectionStatus.connected;
  const connectionEndpoint = serverEndpoint;
  
  // Manter ref sincronizada com estado
  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Monitorar quando a conexão é estabelecida para limpar timeout
  useEffect(() => {
    if (isConnected && connectionTimeoutRef.current && !toastShownRef.current) {
      // Limpar timeout
      clearTimeout(connectionTimeoutRef.current);
      connectionTimeoutRef.current = null;
      toastShownRef.current = true;
      
      // Mostrar toast de sucesso
      toast({
        title: "Conectado",
        description: "Conexão estabelecida com sucesso ao servidor OPC UA"
      });
    }
  }, [isConnected, toast]);

  // Handle WebSocket messages
  useEffect(() => {
      if (!lastMessage) return;
      let data: any;
      try { data = JSON.parse(lastMessage.data); }
      catch { return; }

      // Lidamos com mensagens de mudança de valor (individual ou em lote)
      if (data.type === 'value_change') {
        setLatestReadings(prev => ({
          ...prev,
          [data.nodeId]: {
            value: data.value,
            timestamp: new Date(data.timestamp)
          }
        }));
        setLastUpdated(new Date());
      }
      else if (data.type === 'value_changes_batch') {
        // Processar múltiplas mudanças de valor de uma vez
        setLatestReadings(prev => {
          const updated = { ...prev };
          data.changes.forEach((change: any) => {
            updated[change.nodeId] = {
              value: change.value,
              timestamp: new Date(change.timestamp)
            };
          });
          return updated;
        });
        setLastUpdated(new Date());
      }
      else if (data.type === 'browse_result') {
        // This is handled by the browseNodes function directly
      }
      else if (data.type === 'error') {
        toast({
          title: "Erro",
          description: getCleanErrorMessage(data, "Ocorreu um erro desconhecido"),
          variant: "destructive"
        });
    }
  }, [lastMessage, toast]);

  const connect = useCallback(async (connectionId: number) => {
    try {
      setConnecting(true);
      
      // Limpar qualquer timeout anterior
      if (connectionTimeoutRef.current) {
        clearTimeout(connectionTimeoutRef.current);
        connectionTimeoutRef.current = null;
      }
      
      // Resetar flag do toast
      toastShownRef.current = false;

      const response = await apiRequest('POST', `/api/connections/${connectionId}/connect`);
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Conectando...",
          description: "Aguardando confirmação da conexão com o servidor OPC UA"
        });
        
        // Criar timeout de 10 segundos para detectar falha de conexão
        connectionTimeoutRef.current = setTimeout(() => {
          if (!toastShownRef.current && !isConnectedRef.current) {
            toastShownRef.current = true;
            toast({
              title: "Falha na conexão",
              description: "O servidor não respondeu. Verifique o endereço e tente novamente",
              variant: "destructive"
            });
          }
        }, 10000);
      } else {
        toast({
          title: "Falha na conexão",
          description: getCleanErrorMessage(result, "Não foi possível conectar ao servidor OPC UA"),
          variant: "destructive"
        });
      }
    } catch (err) {
      const errorMessage = getCleanErrorMessage(err, "Não foi possível conectar ao servidor");
      
      toast({
        title: "Erro de conexão",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setConnecting(false);
    }
  }, [toast, isConnected]);

  const disconnect = useCallback(async () => {
    try {
      const response = await apiRequest('POST', '/api/connections/disconnect');
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Desconectado",
          description: "Desconectado com sucesso do servidor OPC UA"
        });
        // OBS: Não precisamos mais definir isConnected e connectionEndpoint aqui,
        // pois serão atualizados via WebSocket quando houver uma mensagem connection_status
      } else {
        toast({
          title: "Falha ao desconectar",
          description: getCleanErrorMessage(result, "Não foi possível desconectar do servidor OPC UA"),
          variant: "destructive"
        });
      }
    } catch (err) {
      const errorMessage = getCleanErrorMessage(err, "Não foi possível desconectar do servidor");
      
      toast({
        title: "Erro ao desconectar",
        description: errorMessage,
        variant: "destructive"
      });
    }
  }, [toast]);

  // Criar um mapa para guardar handlers de respostas e IDs de requisições para correlacionar respostas
  const [responseHandlers, setResponseHandlers] = useState<{
    [key: string]: { resolve: (data: any) => void, reject: (error: Error) => void, timestamp: number }
  }>({}); // Use object type notation em vez de Record
  
  // Efeito para processar mensagens de browser_result com base no mapa de respostas
  useEffect(() => {
    if (!lastMessage) return;
    
    try {
      const data = JSON.parse(lastMessage.data);
      
      // Se for uma resposta de browse, tentamos encontrar o handler registrado
      if (data.type === 'browse_result' && data.nodeId) {
        const handlerId = `browse_${data.nodeId}`;
        const handler = responseHandlers[handlerId];
        
        if (handler) {
          console.log(`Processing browse response for ${data.nodeId}, found ${data.nodes?.length || 0} nodes`);
          
          // Limpar indicador de navegação
          setNodesBeingBrowsed((prevState: Record<string, boolean>) => {
            const newState = { ...prevState };
            delete newState[data.nodeId];
            return newState;
          });
          
          // Executar o handler e removê-lo da lista
          handler.resolve(data.nodes || []);
          setResponseHandlers((prevHandlers: {
            [key: string]: { resolve: (data: any) => void, reject: (error: Error) => void, timestamp: number }
          }) => {
            const newHandlers = { ...prevHandlers };
            delete newHandlers[handlerId];
            return newHandlers;
          });
        }
      } 
      else if (data.type === 'error' && data.requestId) {
        // Se recebermos um erro específico para uma requisição
        const handlerId = data.requestId;
        const handler = responseHandlers[handlerId];
        
        if (handler) {
          // Limpar indicador de navegação se for uma requisição de browse
          if (handlerId.startsWith('browse_')) {
            const nodeId = handlerId.substring(7);
            setNodesBeingBrowsed((prevState: Record<string, boolean>) => {
              const newState = { ...prevState };
              delete newState[nodeId];
              return newState;
            });
          }
          
          // Executar o handler de erro e removê-lo da lista
          handler.reject(new Error(data.message || 'Erro na requisição'));
          setResponseHandlers((prevHandlers: {
            [key: string]: { resolve: (data: any) => void, reject: (error: Error) => void, timestamp: number }
          }) => {
            const newHandlers = { ...prevHandlers };
            delete newHandlers[handlerId];
            return newHandlers;
          });
        }
      }
    } catch (err) {
      // Ignorar erros de parsing - mensagem não é JSON ou não tem formato esperado
    }
  }, [lastMessage, responseHandlers]);
  
  // Efeito para limpar handlers de respostas expirados
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      let hasExpired = false;
      
      setResponseHandlers((prev) => {
        const newHandlers: {
          [key: string]: { resolve: (data: any) => void, reject: (error: Error) => void, timestamp: number }
        } = { ...prev };
        
        // Verificar cada handler para ver se expirou (mais de 30 segundos de idade)
        Object.keys(newHandlers).forEach((id) => {
          const handler = newHandlers[id];
          if (now - handler.timestamp > 30000) {
            // Se expirou, resolvemos com array vazio ou com erro de timeout
            if (id.startsWith('browse_')) {
              const nodeId = id.substring(7);
              console.log(`Timeout for browse request on ${nodeId}`);
              
              // Limpar indicador de navegação
              setNodesBeingBrowsed((prevState: Record<string, boolean>) => {
                const newState = { ...prevState };
                delete newState[nodeId];
                return newState;
              });
              
              handler.resolve([]);
            } else {
              handler.reject(new Error('Tempo limite esgotado'));
            }
            
            // Remover o handler
            delete newHandlers[id];
            hasExpired = true;
          }
        });
        
        return hasExpired ? newHandlers : prev;
      });
    }, 5000); // Verificar a cada 5 segundos
    
    return () => clearInterval(interval);
  }, []);

  const browseNodes = useCallback(async (nodeId: string): Promise<OpcUaNode[]> => {
    if (!isConnected) {
      toast({
        title: "Não conectado",
        description: "Por favor, conecte-se a um servidor OPC UA primeiro",
        variant: "destructive"
      });
      return [];
    }

    // Vamos verificar se o socket está aberto
    if (!wsConnected) {
      toast({
        title: "WebSocket não conectado",
        description: "A conexão WebSocket não está ativa. Tente novamente em alguns instantes.",
        variant: "destructive"
      });
      return [];
    }

    try {
      console.log(`Browsing node: ${nodeId}`);
      
      // Configurar o estado para mostrar loading
      setNodesBeingBrowsed((prevState: Record<string, boolean>) => ({ ...prevState, [nodeId]: true }));
      
      // Criar um ID único para esta requisição
      const requestId = `browse_${nodeId}`;
      
      // Criar a promise para aguardar a resposta
      const resultPromise = new Promise<OpcUaNode[]>((resolve, reject) => {
        // Registrar um handler para a resposta
        setResponseHandlers((prevHandlers: {
          [key: string]: { resolve: (data: any) => void, reject: (error: Error) => void, timestamp: number }
        }) => ({
          ...prevHandlers,
          [requestId]: {
            resolve,
            reject,
            timestamp: Date.now()
          }
        }));
        
        // Enviar a requisição com o ID
        const requestSent = sendJsonMessage('browse', { 
          nodeId,
          requestId 
        });
        
        if (!requestSent) {
          // Se falhou ao enviar, remover o handler
          setResponseHandlers((prevHandlers: {
            [key: string]: { resolve: (data: any) => void, reject: (error: Error) => void, timestamp: number }
          }) => {
            const newHandlers = { ...prevHandlers };
            delete newHandlers[requestId];
            return newHandlers;
          });
          
          throw new Error("Falha ao enviar a solicitação WebSocket");
        }
      });
      
      // Aguardar a resposta ou timeout
      return await resultPromise;
      
    } catch (err) {
      console.error(`Error in browseNodes for ${nodeId}:`, err);
      
      // Limpar indicador de loading em caso de erro
      setNodesBeingBrowsed((prevState: Record<string, boolean>) => {
        const newState = { ...prevState };
        delete newState[nodeId];
        return newState;
      });
      
      toast({
        title: "Erro na navegação",
        description: getCleanErrorMessage(err, "Não foi possível navegar pelos nós OPC UA"),
        variant: "destructive"
      });
      
      return [];
    }
  }, [isConnected, wsConnected, sendJsonMessage, toast]);

  const subscribeToTag = useCallback(async (tagId: number) => {
    try {
      const response = await apiRequest('POST', `/api/tags/${tagId}/subscribe`);
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Subscribed",
          description: "Successfully subscribed to tag"
        });
      } else {
        toast({
          title: "Falha ao ativar subscrição",
          description: getCleanErrorMessage(result, "Não foi possível ativar o sensor"),
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Erro ao ativar subscrição",
        description: getCleanErrorMessage(err, "Não foi possível ativar o sensor"),
        variant: "destructive"
      });
    }
  }, [toast]);

  const unsubscribeFromTag = useCallback(async (tagId: number) => {
    try {
      const response = await apiRequest('POST', `/api/tags/${tagId}/unsubscribe`);
      const result = await response.json();

      if (result.success) {
        toast({
          title: "Unsubscribed",
          description: "Successfully unsubscribed from tag"
        });
      } else {
        toast({
          title: "Falha ao desativar subscrição",
          description: getCleanErrorMessage(result, "Não foi possível desativar o sensor"),
          variant: "destructive"
        });
      }
    } catch (err) {
      toast({
        title: "Erro ao desativar subscrição",
        description: getCleanErrorMessage(err, "Não foi possível desativar o sensor"),
        variant: "destructive"
      });
    }
  }, [toast]);

  // Adicionar efeito para monitorar mudanças de status
  useEffect(() => {
    if (isReconnecting) {
      toast({
        title: "Reconectando",
        description: `Tentativa ${retryCount} de reconexão ao servidor WebSocket`,
      });
    }
  }, [retryCount, isReconnecting, toast]);

  return (
    <OpcUaContext.Provider value={{
      isConnected,
      isReconnecting,
      connectionEndpoint,
      lastUpdated,
      connecting,
      connect,
      disconnect,
      browseNodes,
      subscribeToTag,
      unsubscribeFromTag,
      latestReadings,
      nodesBeingBrowsed,
      retryCount
    }}>
      {children}
    </OpcUaContext.Provider>
  );
}

export function useOpcUa() {
  const context = useContext(OpcUaContext);
  if (context === undefined) {
    throw new Error('useOpcUa must be used within an OpcUaProvider');
  }
  return context;
}
