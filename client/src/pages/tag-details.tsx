import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useNavigation } from "@/contexts/NavigationContext";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle,
  CardDescription
} from "@/components/ui/card";
import WaterLevelChart from "@/components/WaterLevelChart";
import { ArrowLeft, Info, Tag as TagIcon, User, Database, AlertTriangle, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CustomBadge } from "@/components/ui/custom-badge";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useOpcUa } from "@/contexts/OpcUaContext";
import { getCleanErrorMessage } from "@/lib/errorUtils";

export default function TagDetails() {
  const { id } = useParams<{ id: string }>();
  const tagId = Number(id);
  const { navigateTo } = useNavigation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { latestReadings, isConnected } = useOpcUa();
  
  // Obter detalhes da tag
  const { data: tag, isLoading: loadingTag, refetch: refetchTag } = useQuery({
    queryKey: [`/api/tags/${tagId}`],
    enabled: !!tagId,
    refetchInterval: 5000 // Recarregar a cada 5 segundos para manter o estado atualizado
  });
  
  // Obter leituras históricas da tag
  const { data: readings = [], isLoading: loadingReadings, refetch: refetchReadings } = useQuery({
    queryKey: [`/api/tags/${tagId}/readings`],
    enabled: !!tagId,
    refetchInterval: 10000 // Atualizar automaticamente a cada 10 segundos
  });
  
  // Efeito para atualizar as leituras quando a tag estiver subscrita
  useEffect(() => {
    if (tag?.isSubscribed) {
      // Configurar um intervalo para atualizar as leituras a cada 5 segundos
      const interval = setInterval(() => {
        refetchReadings();
      }, 5000);
      
      // Limpar o intervalo quando o componente for desmontado
      return () => clearInterval(interval);
    }
  }, [tag?.isSubscribed, refetchReadings]);
  
  // Mutation para atualizar o status de subscrição
  const toggleSubscriptionMutation = useMutation({
    mutationFn: async () => {
      if (!tag) return;
      
      // Usar método POST explícito para subscrição/cancelamento
      const endpoint = tag.isSubscribed 
        ? `/api/tags/${tagId}/unsubscribe` 
        : `/api/tags/${tagId}/subscribe`;
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Erro ao atualizar subscrição: ${response.statusText}`);
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Atualizar os dados da tag após alteração
      queryClient.invalidateQueries({ queryKey: [`/api/tags/${tagId}`] });
      
      // Usar o valor atual da tag para determinar a mensagem correta
      const newStatus = data.tag.isSubscribed ? 'ativada' : 'pausada';
      
      toast({
        title: "Subscrição atualizada",
        description: `A subscrição da tag ${tag?.displayName} foi ${newStatus}.`,
      });
      
      // Forçar atualização da tag
      refetchTag();
    },
    onError: (error) => {
      toast({
        title: "Erro ao atualizar subscrição",
        description: getCleanErrorMessage(error, "Não foi possível atualizar o estado da subscrição"),
        variant: "destructive"
      });
      console.error("Erro ao atualizar subscrição:", error);
    }
  });
  
  // Preparar o array com o ID da tag para o componente de gráfico
  const tagIds = tag ? [tag.id] : [];
  
  // Função para voltar para a página anterior
  const goBack = () => {
    if (tag?.personId && tag?.person) {
      navigateTo(`/people/${tag.personId}`);
    } else {
      navigateTo('/subscriptions');
    }
  };
  
  // Formatar a data para exibição
  const formatDateTime = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy HH:mm:ss');
  };
  
  // Formatar o status da tag
  const getStatusBadge = (isSubscribed: boolean) => {
    if (!isConnected) {
      return (
        <div className="px-2 py-1 text-xs rounded-full bg-neutral-200 text-neutral-700 inline-flex items-center justify-center w-32">
          Servidor desconectado
        </div>
      );
    }
    
    return (
      <div 
        className={`px-2 py-1 text-xs rounded-full inline-flex items-center justify-center w-20 ${
          isSubscribed 
            ? "bg-green-500 text-white" 
            : "bg-neutral-200 text-neutral-700"
        }`}
      >
        {isSubscribed ? "Ativo" : "Pausado"}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Navegação e título */}
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="icon" 
            className="mr-4"
            onClick={goBack}
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-2xl font-semibold text-neutral-900">
            {loadingTag ? 'Carregando...' : `Detalhes da Tag: ${tag?.displayName}`}
          </h2>
        </div>
        
        {!loadingTag && tag && (
          <div className="flex space-x-2">
            <Button
              variant={tag.isSubscribed ? "secondary" : "outline"}
              size="sm"
              onClick={() => toggleSubscriptionMutation.mutate()}
              disabled={toggleSubscriptionMutation.isPending || !isConnected}
              className={`flex items-center gap-1 ${!tag.isSubscribed ? "bg-blue-500 text-white hover:bg-blue-600" : ""}`}
            >
              {!isConnected ? (
                "Servidor desconectado"
              ) : (
                tag.isSubscribed ? "Pausar Subscrição" : "Ativar Subscrição"
              )}
            </Button>
          </div>
        )}
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Informações da Tag */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Informações da Tag</CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {loadingTag ? (
              <div className="h-64 grid place-items-center">
                <p className="text-neutral-500">Carregando informações...</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Nome de Exibição</label>
                  <div className="text-neutral-900">{tag?.displayName}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Caminho da Tag</label>
                  <div className="text-neutral-900 text-sm font-mono">
                    {tag?.nodeId ? 
                      tag.nodeId.replace(/ns=(\d+);s=/, '')
                        .replace(/^_/, '')
                        .replace(/\.([^\.]+)$/, ' → $1')
                      : 'Não disponível'}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Observações</label>
                  <div className="text-neutral-900">
                    {tag?.description && tag.description.trim() !== '' 
                      ? tag.description 
                      : <span className="text-neutral-400 italic">Sem observações disponíveis</span>}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Estado</label>
                  <div>{tag ? getStatusBadge(tag.isSubscribed) : null}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Pessoa Associada</label>
                  <div className="text-neutral-900">
                    {tag?.personId && tag?.person ? (
                      <div className="flex items-center">
                        <User className="h-4 w-4 mr-2 text-primary-500" />
                        <span>{tag.person.name}</span>
                      </div>
                    ) : (
                      <span className="text-neutral-400">Nenhuma pessoa associada</span>
                    )}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Criado em</label>
                  <div className="text-neutral-900">
                    {tag?.createdAt ? formatDateTime(tag.createdAt) : 'N/A'}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Status e Última Leitura */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Última Leitura</CardTitle>
            <CardDescription>Dados do último valor registrado</CardDescription>
          </CardHeader>
          
          <CardContent>
            {loadingReadings ? (
              <div className="h-64 grid place-items-center">
                <p className="text-neutral-500">Carregando dados...</p>
              </div>
            ) : readings.length === 0 ? (
              <div className="h-64 grid place-items-center">
                <div className="text-center">
                  <AlertTriangle className="h-12 w-12 mx-auto text-warning-500 mb-4" />
                  <p className="text-neutral-500">Nenhuma leitura encontrada para esta tag</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium flex items-center">
                      <Database className="h-5 w-5 mr-2 text-primary-500" />
                      Valor Atual
                    </h3>
                    <div className="mt-2 text-4xl font-bold text-primary-600">
                      {!isConnected ? (
                        <span className="text-neutral-500">Servidor desconectado</span>
                      ) : (
                        readings[0]?.value !== undefined && readings[0]?.value !== null ? 
                          (typeof readings[0].value === 'number' ? 
                            `${readings[0].value.toFixed(2)}` : 
                            String(readings[0].value)
                          ) : 'N/A'
                      )}
                    </div>
                    <p className="text-sm text-neutral-500 mt-1">
                      Registrado em {readings[0]?.timestamp ? formatDateTime(readings[0]?.timestamp) : 'N/A'}
                    </p>
                  </div>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium flex items-center">
                      <Info className="h-5 w-5 mr-2 text-primary-500" />
                      Qualidade do Sinal
                    </h3>
                    <div className="mt-2">
                      {!isConnected ? (
                        <div className="px-3 py-1 text-sm border rounded-md border-neutral-200 bg-neutral-100 text-neutral-500">
                          Servidor desconectado
                        </div>
                      ) : (
                        <Badge 
                          variant="outline" 
                          className="px-3 py-1 text-sm"
                        >
                          {readings[0]?.quality || 'Desconhecida'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-neutral-500 mt-1">
                      Estado da comunicação com o dispositivo
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Gráfico Histórico */}
      <Card>
        <CardHeader>
          <CardTitle>Histórico de Leituras</CardTitle>
          <CardDescription>Visualização dos valores registrados ao longo do tempo</CardDescription>
        </CardHeader>
        
        <CardContent>
          {tagIds.length > 0 && (
            <WaterLevelChart 
              tagIds={tagIds}
              title="Histórico de Valores"
              allowFiltering={true}
              historicalMode={true}
              height={400}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}