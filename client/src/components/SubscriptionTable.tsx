import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCleanErrorMessage } from "@/lib/errorUtils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pause, Play, Trash2, BarChart } from "lucide-react";
import { format } from "date-fns";
import { useOpcUa } from "@/contexts/OpcUaContext";

interface SubscriptionTableProps {
  personId?: number;
  onViewTagDetails?: (tagId: number) => void;
  hideBulkActions?: boolean;
}

export default function SubscriptionTable({ personId, onViewTagDetails, hideBulkActions = false }: SubscriptionTableProps) {
  const { isConnected, latestReadings } = useOpcUa();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Função auxiliar para invalidar todas as consultas relacionadas a tags
  const invalidateTagsQueries = () => {
    // Invalidar todas as consultas relacionadas a tags
    queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
    
    // Invalidar consultas específicas de pessoas
    if (personId) {
      queryClient.invalidateQueries({ queryKey: [`/api/people/${personId}/tags`] });
    }
    
    // Invalidar todas as pessoas
    queryClient.invalidateQueries({ queryKey: ['/api/people'] });
    
    // Força a atualização de todas as consultas de pessoas
    const peopleKeys = queryClient.getQueryCache().findAll({
      queryKey: ['/api/people']
    });
    peopleKeys.forEach(query => {
      queryClient.refetchQueries({ queryKey: query.queryKey });
    });
  };
  
  // Load active tags
  const { data: tags = [], isLoading, refetch: refetchTags } = useQuery({
    queryKey: [personId ? `/api/people/${personId}/tags` : '/api/tags'],
    refetchOnWindowFocus: true,
    refetchInterval: 1500, // Atualiza a cada 1.5 segundos para manter sincronia mais rápida
    staleTime: 0 // Considera os dados sempre "obsoletos" para garantir atualização imediata
  });
  
  // Buscar leituras recentes da API como fallback quando WebSocket não tem dados
  const tagIds = tags.map((tag: any) => tag.id).join(',');
  const { data: apiReadings = [] } = useQuery({
    queryKey: ['/api/readings/latest', { tagIds }],
    enabled: tagIds.length > 0 && isConnected,
    refetchInterval: 2000, // Atualiza a cada 2 segundos
    staleTime: 1000
  });
  
  // Subscribe to tag mutation
  const subscribeMutation = useMutation({
    mutationFn: async (tagId: number) => {
      const response = await apiRequest('POST', `/api/tags/${tagId}/subscribe`);
      return response.json();
    },
    onSuccess: () => {
      // Usar a função auxiliar para garantir que todas as consultas sejam atualizadas
      invalidateTagsQueries();
      
      // Forçar a atualização imediata de todas as consultas
      refetchTags();
      
      toast({
        title: "Sucesso",
        description: "Tag ativada com sucesso"
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao ativar sensor",
        description: getCleanErrorMessage(error, "Não foi possível ativar o sensor"),
        variant: "destructive"
      });
    }
  });
  
  // Unsubscribe from tag mutation
  const unsubscribeMutation = useMutation({
    mutationFn: async (tagId: number) => {
      const response = await apiRequest('POST', `/api/tags/${tagId}/unsubscribe`);
      return response.json();
    },
    onSuccess: () => {
      // Usar a função auxiliar para garantir que todas as consultas sejam atualizadas
      invalidateTagsQueries();
      
      // Forçar a atualização imediata de todas as consultas
      refetchTags();
      
      toast({
        title: "Sucesso",
        description: "Tag desativada com sucesso"
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao desativar sensor",
        description: getCleanErrorMessage(error, "Não foi possível desativar o sensor"),
        variant: "destructive"
      });
    }
  });
  
  // Remove tag mutation
  const removeTagMutation = useMutation({
    mutationFn: async (tagId: number) => {
      const response = await apiRequest('DELETE', `/api/tags/${tagId}`);
      return response;
    },
    onSuccess: () => {
      // Invalidar todas as consultas relacionadas a tags
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      
      // Invalidar consultas específicas de pessoas
      if (personId) {
        queryClient.invalidateQueries({ queryKey: [`/api/people/${personId}/tags`] });
      }
      
      // Invalidar todas as pessoas também
      queryClient.invalidateQueries({ queryKey: ['/api/people'] });
      
      toast({
        title: "Sucesso",
        description: "Tag removida com sucesso"
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao remover sensor",
        description: getCleanErrorMessage(error, "Não foi possível remover o sensor"),
        variant: "destructive"
      });
    }
  });

  // Unassign tag from person mutation
  const unassignTagMutation = useMutation({
    mutationFn: async (tagId: number) => {
      const response = await apiRequest('POST', `/api/tags/${tagId}/unassign-person`);
      return response.json();
    },
    onSuccess: () => {
      // Invalidar todas as consultas relacionadas a tags
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      
      // Invalidar consultas específicas de pessoas
      if (personId) {
        queryClient.invalidateQueries({ queryKey: [`/api/people/${personId}/tags`] });
      }
      
      // Invalidar todas as pessoas também
      queryClient.invalidateQueries({ queryKey: ['/api/people'] });
      
      toast({
        title: "Sucesso",
        description: "Tag desassociada da pessoa com sucesso"
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao desassociar sensor",
        description: getCleanErrorMessage(error, "Não foi possível desassociar o sensor"),
        variant: "destructive"
      });
    }
  });

  // Handle pause/resume subscription
  const handleToggleSubscription = (tag: any) => {
    if (tag.isSubscribed) {
      unsubscribeMutation.mutate(tag.id);
    } else {
      subscribeMutation.mutate(tag.id);
    }
  };
  
  // Handle tag removal
  const handleRemoveTag = (tag: any) => {
    if (personId) {
      unassignTagMutation.mutate(tag.id);
    } else {
      removeTagMutation.mutate(tag.id);
    }
  };
  
  // Handle view tag details
  const handleViewTagDetails = (tagId: number) => {
    if (onViewTagDetails) {
      onViewTagDetails(tagId);
    }
  };

  return (
    <div className="overflow-x-auto">
      {!isConnected ? (
        <div className="text-center py-8 text-muted-foreground border rounded-md p-6">
          <div className="flex items-center justify-center mb-3">
            <div className="h-3 w-3 rounded-full mr-2 bg-destructive"></div>
            <span className="text-lg font-semibold text-destructive">Servidor desconectado</span>
          </div>
          <p className="text-sm mt-1">
            Não é possível exibir ou gerenciar sensores quando o servidor não está conectado
          </p>
        </div>
      ) : (
        <>
          {!hideBulkActions && (
            <div className="flex justify-end mb-4">
              <div className="space-x-2">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white"
                  onClick={() => {
                    tags.forEach((tag: any) => {
                      if (!tag.isSubscribed) {
                        subscribeMutation.mutate(tag.id);
                      }
                    });
                  }}
                  disabled={!isConnected}
                >
                  <Play className="h-4 w-4 mr-1" /> Iniciar Todas
                </Button>
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={() => {
                    tags.forEach((tag: any) => {
                      if (tag.isSubscribed) {
                        unsubscribeMutation.mutate(tag.id);
                      }
                    });
                  }}
                  disabled={!isConnected}
                >
                  <Pause className="h-4 w-4 mr-1" /> Parar Todas
                </Button>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pessoa</TableHead>
                <TableHead>Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4">
                    Carregando...
                  </TableCell>
                </TableRow>
              ) : tags.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-4">
                    Nenhuma tag encontrada.
                  </TableCell>
                </TableRow>
              ) : (
                tags.map((tag: any) => {
                  // Primeiro tentar obter do WebSocket (tempo real)
                  let latestReading = latestReadings[tag.nodeId];
                  
                  // Se não tiver no WebSocket, buscar da API
                  if (!latestReading || latestReading.value === undefined) {
                    const apiReading = apiReadings.find((r: any) => r.tagId === tag.id);
                    if (apiReading) {
                      latestReading = {
                        value: apiReading.value,
                        timestamp: new Date(apiReading.timestamp)
                      };
                    }
                  }
                  
                  return (
                    <TableRow key={tag.id}>
                      <TableCell>
                        <div className="flex items-center">
                          <svg 
                            xmlns="http://www.w3.org/2000/svg" 
                            width="16" 
                            height="16" 
                            viewBox="0 0 24 24" 
                            fill="none" 
                            stroke="currentColor" 
                            strokeWidth="2" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                            className={`${tag.isSubscribed ? "text-green-500" : "text-neutral-400"} mr-2`}
                          >
                            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                            <line x1="7" y1="7" x2="7.01" y2="7" />
                          </svg>
                          <span className="font-medium">{tag.displayName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {latestReading && latestReading.value !== undefined ? (
                          typeof latestReading.value === 'number' ? 
                            `${latestReading.value.toFixed(2)}` : 
                            String(latestReading.value)
                        ) : 'N/A'}
                      </TableCell>
                      <TableCell className="text-neutral-500 text-sm">
                        {latestReading && latestReading.timestamp ? 
                          format(new Date(latestReading.timestamp), 'yyyy-MM-dd HH:mm:ss') : 
                          'N/A'}
                      </TableCell>
                      <TableCell>
                        <div
                          className={`px-2 py-1 text-xs rounded-full flex items-center justify-center w-20 ${
                            isConnected ? (
                              tag.isSubscribed 
                                ? "bg-green-500 text-white" 
                                : "bg-neutral-200 text-neutral-700"
                            ) : "bg-neutral-200 text-neutral-700"
                          }`}
                        >
                          {isConnected ? 
                            (tag.isSubscribed ? "Ativo" : "Pausado") :
                            "Desconectado"
                          }
                        </div>
                      </TableCell>
                      <TableCell>
                        {tag.personId ? 
                          <span>{tag.person?.name || "Sem nome"}</span> : 
                          <span className="text-neutral-400">-</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          {tag.isSubscribed ? (
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8 text-amber-600 hover:text-amber-800"
                              onClick={() => handleToggleSubscription(tag)}
                              disabled={!isConnected}
                            >
                              <Pause className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8 text-green-600 hover:text-green-800"
                              onClick={() => handleToggleSubscription(tag)}
                              disabled={!isConnected}
                            >
                              <Play className="h-4 w-4" />
                            </Button>
                          )}
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8 text-primary-600 hover:text-primary-800"
                            onClick={() => handleViewTagDetails(tag.id)}
                          >
                            <BarChart className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="icon" 
                            className="h-8 w-8 text-destructive hover:text-destructive/90"
                            onClick={() => handleRemoveTag(tag)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}
