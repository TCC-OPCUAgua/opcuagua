import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOpcUa } from "@/contexts/OpcUaContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest } from "@/lib/queryClient";

interface CriticalPerson {
  id: number;
  name: string;
  location?: string | null;
  criticalTags: {
    id: number;
    displayName: string;
    nodeId: string;
    value: number;
    timestamp: Date;
  }[];
}

interface CriticalLevelCardProps {
  onCriticalPeopleChange?: (people: CriticalPerson[]) => void;
}

export default function CriticalLevelCard({ onCriticalPeopleChange }: CriticalLevelCardProps = {}) {
  const [open, setOpen] = useState(false);
  const { isConnected, latestReadings } = useOpcUa();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const [criticalPeople, setCriticalPeople] = useState<CriticalPerson[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [didInitialFetch, setDidInitialFetch] = useState(false);

  // Buscar todas as pessoas
  const { data: peopleData } = useQuery({
    queryKey: ['/api/people'],
    refetchInterval: 5000,
    staleTime: 0
  });

  // Buscar todas as tags
  const { data: tagsData } = useQuery({
    queryKey: ['/api/tags'],
    refetchInterval: 5000, 
    staleTime: 0
  });

  // Carregar as leituras históricas mais recentes uma vez quando o componente monta
  useEffect(() => {
    const fetchInitialReadings = async () => {
      if (didInitialFetch || !peopleData || !tagsData) return;
      
      setIsLoading(true);
      
      try {
        console.log("Buscando todas as leituras iniciais para determinação de nível crítico...");
        
        // Obter IDs de todas as tags
        const tags = Array.isArray(tagsData) ? tagsData : [];
        if (tags.length === 0) return;
        
        const tagIds = tags.map(tag => tag.id).join(',');
        const url = `/api/readings/latest?tagIds=${tagIds}`;
        
        // Buscar leituras iniciais diretamente da API
        const response = await apiRequest('GET', url);
        const readings = await response.json();
        
        console.log(`Carregadas ${readings.length} leituras iniciais`);
        
        // Processar dados iniciais
        processReadingsData(readings);
        setDidInitialFetch(true);
      } catch (error) {
        console.error("Erro ao buscar leituras iniciais:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchInitialReadings();
  }, [peopleData, tagsData, didInitialFetch]);

  // Função para processar os dados das leituras e atualizar o estado
  const processReadingsData = (readings: any[]) => {
    if (!peopleData || !tagsData) return;
    
    const people = Array.isArray(peopleData) ? peopleData : [];
    const tags = Array.isArray(tagsData) ? tagsData : [];
    
    // Mapa para armazenar as leituras mais recentes por tagId
    const readingsByTagId: Record<number, any> = {};
    
    // Preenche o mapa com as leituras históricas
    readings.forEach((reading: any) => {
      // Armazena apenas se ainda não existir ou se a leitura for mais recente
      if (
        !readingsByTagId[reading.tagId] || 
        new Date(reading.timestamp) > new Date(readingsByTagId[reading.tagId].timestamp)
      ) {
        readingsByTagId[reading.tagId] = {
          value: reading.value,
          timestamp: new Date(reading.timestamp)
        };
      }
    });
    
    // Combina com as leituras em tempo real do contexto OpcUa (que são mais recentes)
    if (isConnected) {
      tags.forEach((tag: any) => {
        const realTimeReading = latestReadings[tag.nodeId];
        if (realTimeReading && realTimeReading.value !== undefined) {
          readingsByTagId[tag.id] = {
            value: realTimeReading.value,
            timestamp: realTimeReading.timestamp
          };
        }
      });
    }
    
    // Lista para armazenar pessoas com sensores em nível crítico
    const criticalPeopleList: CriticalPerson[] = [];
    
    // Para cada pessoa, verificamos suas tags
    people.forEach((person: any) => {
      // Filtra todas as tags desta pessoa
      const personTags = tags.filter((tag: any) => tag.personId === person.id);
      
      // Array para armazenar tags em nível crítico desta pessoa
      const criticalTags: any[] = [];
      
      // Verifica cada tag da pessoa
      personTags.forEach((tag: any) => {
        // Busca a leitura mais recente desta tag
        const reading = readingsByTagId[tag.id];
        
        // Verifica se temos uma leitura e se o valor está abaixo de 25%
        if (reading && reading.value !== undefined && reading.value < 25) {
          criticalTags.push({
            id: tag.id,
            displayName: tag.displayName,
            nodeId: tag.nodeId,
            value: reading.value,
            timestamp: reading.timestamp
          });
        }
      });
      
      // Se encontramos tags críticas, adicionamos esta pessoa à lista
      if (criticalTags.length > 0) {
        criticalPeopleList.push({
          id: person.id,
          name: person.name,
          location: person.location,
          criticalTags: criticalTags
        });
      }
    });
    
    console.log(`Encontradas ${criticalPeopleList.length} pessoas com tags em nível crítico`);
    
    // Atualiza o estado com a lista de pessoas em nível crítico
    setCriticalPeople(criticalPeopleList);
    
    // Notificar componente pai sobre mudanças, se o callback for fornecido
    if (onCriticalPeopleChange) {
      onCriticalPeopleChange(criticalPeopleList);
    }
  };

  // Efeito para processar atualizações em tempo real
  useEffect(() => {
    if (!didInitialFetch) return;
    
    const updateFromRealTimeReadings = () => {
      try {
        const people = Array.isArray(peopleData) ? peopleData : [];
        const tags = Array.isArray(tagsData) ? tagsData : [];
        
        if (people.length === 0 || tags.length === 0) return;
        
        // Precisamos buscar as leituras mais recentes da API
        const fetchLatestReadings = async () => {
          try {
            const tagIds = tags.map(tag => tag.id).join(',');
            const url = `/api/readings/latest?tagIds=${tagIds}`;
            
            const response = await apiRequest('GET', url);
            const readings = await response.json();
            
            // Processar leituras
            processReadingsData(readings);
          } catch (error) {
            console.error("Erro ao atualizar leituras:", error);
          }
        };
        
        fetchLatestReadings();
      } catch (error) {
        console.error("Erro ao processar atualizações em tempo real:", error);
      }
    };
    
    // Executar atualização imediatamente
    updateFromRealTimeReadings();
    
    // Configurar timer para atualizar a cada 5 segundos
    const timer = setInterval(updateFromRealTimeReadings, 5000);
    
    // Limpar o timer quando o componente for desmontado
    return () => clearInterval(timer);
  }, [peopleData, tagsData, latestReadings, isConnected, didInitialFetch]);

  const navigateToPersonDetails = (personId: number) => {
    setLocation(`/people/${personId}`);
    setOpen(false);
  };

  const totalPeople = Array.isArray(peopleData) ? peopleData.length : 0;
  const criticalCount = criticalPeople.length;
  
  // Adiciona log para debugging
  console.log("CriticalLevelCard: pessoas em estado crítico:", criticalPeople.length, "de", totalPeople);

  const getStatusClass = (percent: number): string => {
    if (percent < 25) return "bg-red-500 text-white";
    if (percent < 50) return "bg-amber-500";
    if (percent < 75) return "bg-amber-300";
    return "bg-green-500 text-white";
  };

  if (isLoading) {
    return (
      <Card className="overflow-hidden">
        <CardHeader className="bg-white pb-2">
          <CardTitle className="flex items-center text-lg font-semibold">
            <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" />
            Carregando...
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Card className={`overflow-hidden cursor-pointer hover:shadow-md transition-shadow ${!isConnected ? "opacity-80" : ""}`}>
          <CardContent className="p-5">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-neutral-500">Pessoas em nível crítico</h3>
              <div className={`p-2 rounded-full ${isConnected ? 'bg-warning-100 text-warning-500' : 'bg-neutral-200 text-neutral-500'}`}>
                <AlertTriangle className="h-4 w-4" />
              </div>
            </div>
            <p className={`mt-2 text-xl font-semibold ${!isConnected ? 'text-neutral-400' : ''}`}>
              {!isConnected ? (
                <span className="text-neutral-400">--/--</span>
              ) : (
                <>
                  <span className={criticalCount > 0 ? "text-red-600" : "text-green-600"}>
                    {criticalCount}
                  </span>
                  <span className="text-neutral-500">/{totalPeople}</span>
                </>
              )}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              {!isConnected ? 'Servidor desconectado' : 'Clique para ver detalhes'}
            </p>
          </CardContent>
        </Card>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <AlertTriangle className="mr-2 h-5 w-5 text-amber-500" />
            Pessoas em nível crítico ({criticalCount}/{totalPeople})
          </DialogTitle>
          <DialogDescription>
            Lista de pessoas com reservatórios em nível crítico (abaixo de 25%).
          </DialogDescription>
        </DialogHeader>
        
        {criticalPeople.length === 0 ? (
          <div className="py-6 text-center text-neutral-500">
            <Info className="h-10 w-10 mx-auto mb-2 text-neutral-400" />
            <p>Não há pessoas com reservatórios em nível crítico no momento.</p>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            {criticalPeople.map((person) => (
              <div key={person.id} className="border rounded-md p-4">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="font-medium text-lg">{person.name}</h3>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => navigateToPersonDetails(person.id)}
                  >
                    Ver Detalhes
                  </Button>
                </div>
                
                {person.location && (
                  <div className="text-sm text-neutral-500 mb-3">
                    <span className="font-medium">Localização:</span> {person.location}
                  </div>
                )}
                
                <div className="space-y-3">
                  <h4 className="text-sm font-medium">Sensores em nível crítico:</h4>
                  {person.criticalTags.map((tag) => (
                    <div key={tag.id} className="bg-neutral-50 p-3 rounded-md border">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{tag.displayName}</span>
                        <Badge className={getStatusClass(tag.value)}>
                          {tag.value.toFixed(2)}%
                        </Badge>
                      </div>
                      <div className="text-xs text-neutral-500 mt-1">
                        Atualizado em: {format(new Date(tag.timestamp), 'dd/MM/yyyy HH:mm:ss')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Fechar</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}