import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useOpcUa } from "@/contexts/OpcUaContext";
import { useNavigation } from "@/contexts/NavigationContext";
import WaterLevelChart from "@/components/WaterLevelChart";
import CriticalLevelCard from "@/components/CriticalLevelCard";
import LocationMap from "@/components/LocationMap";
import { 
  Card, 
  CardContent 
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format } from "date-fns";
import { LinkIcon, TagIcon, Activity, Users } from "lucide-react";

export default function Dashboard() {
  const { isConnected, connectionEndpoint, lastUpdated } = useOpcUa();
  const { navigateTo } = useNavigation();
  const [criticalPeople, setCriticalPeople] = useState<any[]>([]);

  // Get all people for the interface
  const { data: people = [] } = useQuery({
    queryKey: ['/api/people']
  });

  // Get ALL tags for main cards (not affected by person filter)
  const { data: allTags = [] } = useQuery({
    queryKey: ['/api/tags']
  });

  // Inicializa o ID da primeira pessoa como valor padrão quando pessoas são carregadas
  const [selectedPersonId, setSelectedPersonId] = useState<string>("");
  
  // Quando people muda, define o ID da primeira pessoa como selecionado (se existir)
  useEffect(() => {
    if (people.length > 0 && !selectedPersonId) {
      setSelectedPersonId(people[0].id.toString());
    }
  }, [people, selectedPersonId]);
  
  // Get filtered tags for the person selected (for secondary cards only)
  const { data: filteredTags = [] } = useQuery({
    queryKey: [selectedPersonId ? `/api/people/${selectedPersonId}/tags` : ''],
    enabled: !!selectedPersonId // Só faz a consulta se houver uma pessoa selecionada
  });
  
  // Get activity logs
  const { data: activityLogs = [] } = useQuery({
    queryKey: ['/api/activity-logs'],
    refetchInterval: 10000 // Refresh logs every 10 seconds
  });
  
  // Calculate tag statistics (uses ALL tags)
  const subscribedTags = allTags.filter((tag: any) => tag.isSubscribed);
  const mostRecentTag = allTags[0]; // Assuming tags are sorted by newest first
  
  // Extract tag IDs for chart - only the filtered tags
  const filteredTagIds = Array.isArray(filteredTags) 
    ? filteredTags
        .filter((tag: any) => tag.isSubscribed) // Filtra apenas tags ativas
        .map((tag: any) => tag.id) 
    : [];
  
  // Format date utility
  const formatDateTime = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy HH:mm');
  };
  
  // Format number utility with fallback
  const formatNumber = (value: any, decimals: number = 2): string => {
    if (typeof value === 'number') {
      return value.toFixed(decimals);
    } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
      return parseFloat(value).toFixed(decimals);
    } else {
      return String(value);
    }
  };
  
  // Get icon for activity
  const getActivityIcon = (type: string) => {
    switch(type) {
      case 'connection':
        return <LinkIcon className="h-full w-full text-primary-700" />;
      case 'tag':
      case 'subscription':
        return <TagIcon className="h-full w-full text-success-700" />;
      case 'person':
        return <Users className="h-full w-full text-primary-700" />;
      default:
        return <Activity className="h-full w-full text-warning-700" />;
    }
  };
  
  // Get color class for activity
  const getActivityColorClass = (type: string) => {
    switch(type) {
      case 'connection':
        return 'bg-primary-100 text-primary-700';
      case 'tag':
      case 'subscription':
        return 'bg-success-100 text-success-700';
      case 'person':
        return 'bg-primary-100 text-primary-700';
      default:
        return 'bg-warning-100 text-warning-700';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-neutral-900">Dashboard</h2>
        
        <div className="flex items-center space-x-2">
          <label htmlFor="person-filter" className="text-sm text-neutral-700">
            Filtrar por pessoa:
          </label>
          <Select 
            value={selectedPersonId}
            onValueChange={setSelectedPersonId}
            disabled={people.length === 0}
          >
            <SelectTrigger id="person-filter" className="w-[180px]">
              <SelectValue placeholder="Selecione uma pessoa" />
            </SelectTrigger>
            <SelectContent>
              {people.map((person: any) => (
                <SelectItem key={person.id} value={person.id.toString()}>
                  {person.name}
                </SelectItem>
              ))}
              {people.length === 0 && (
                <SelectItem value="none" disabled>
                  Nenhuma pessoa cadastrada
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Status Cards - Not affected by person filter */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* Connection Status */}
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-neutral-500">Status da Conexão</h3>
              <div className={`p-2 rounded-full ${isConnected ? 'bg-primary-100 text-primary-500' : 'bg-destructive/20 text-destructive'}`}>
                <LinkIcon className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-2 flex items-center">
              <div className={`h-3 w-3 rounded-full mr-2 ${isConnected ? 'bg-green-500 pulse' : 'bg-destructive'}`}></div>
              <span className={`text-xl font-semibold ${!isConnected ? 'text-destructive' : ''}`}>
                {isConnected ? 'Conectado' : 'Desconectado'}
              </span>
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              {connectionEndpoint ? `Servidor: ${connectionEndpoint}` : 'Nenhum servidor conectado'}
            </p>
          </CardContent>
        </Card>
        
        {/* Tags Monitored - Uses ALL tags */}
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-neutral-500">Tags Monitoradas</h3>
              <div className={`p-2 rounded-full ${isConnected ? 'bg-secondary-100 text-secondary-500' : 'bg-neutral-200 text-neutral-500'}`}>
                <TagIcon className="h-4 w-4" />
              </div>
            </div>
            <p className={`mt-2 text-xl font-semibold ${!isConnected ? 'text-neutral-400' : ''}`}>
              {isConnected ? `${subscribedTags.length} / ${allTags.length}` : '--/--'}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              {!isConnected 
                ? 'Servidor desconectado' 
                : mostRecentTag 
                  ? `Última adicionada: ${formatDateTime(mostRecentTag.createdAt)}` 
                  : 'Nenhuma tag monitorada'}
            </p>
          </CardContent>
        </Card>
        
        {/* Critical Level Card - Uses ALL tags, not affected by person filter */}
        <CriticalLevelCard onCriticalPeopleChange={setCriticalPeople} />
        
        {/* Last Reading - Uses ALL tags */}
        <Card>
          <CardContent className="p-5">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-neutral-500">Última Leitura</h3>
              <div className={`p-2 rounded-full ${isConnected ? 'bg-accent-100 text-accent-500' : 'bg-neutral-200 text-neutral-500'}`}>
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <p className={`mt-2 text-xl font-semibold ${!isConnected ? 'text-neutral-400' : ''}`}>
              {!isConnected ? 'N/A' : (() => {
                // Exibe o valor da leitura mais recente se estiver disponível
                const latestReadingsObj = useOpcUa().latestReadings;
                
                if (latestReadingsObj && Object.keys(latestReadingsObj).length > 0) {
                  // Procura a leitura mais recente global
                  let latestReading = null;
                  let latestTimestamp = 0;
                  
                  // Verifica cada leitura para encontrar a mais recente global
                  Object.values(latestReadingsObj).forEach((reading) => {
                    if (reading.timestamp.getTime() > latestTimestamp) {
                      latestReading = reading;
                      latestTimestamp = reading.timestamp.getTime();
                    }
                  });
                  
                  if (latestReading && latestReading.value !== undefined) {
                    // Usa a função utilitária para formatar o valor
                    return formatNumber(latestReading.value);
                  }
                }
                return 'N/A';
              })()}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              {!isConnected 
                ? 'Servidor desconectado' 
                : lastUpdated 
                  ? `Recebido às ${format(lastUpdated, 'HH:mm:ss')}` 
                  : 'Aguardando leituras...'}
            </p>
          </CardContent>
        </Card>
        
        {/* Sensors per Person - This is a secondary card that shows info about the selected person */}
        <Card 
          className={`${isConnected && selectedPersonId ? 'cursor-pointer hover:bg-neutral-50' : ''}`}
          onClick={isConnected && selectedPersonId ? () => navigateTo(`/people/${selectedPersonId}`) : undefined}
        >
          <CardContent className="p-5">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-medium text-neutral-500">Sensores por Pessoa</h3>
              <div className={`p-2 rounded-full ${isConnected ? 'bg-primary-100 text-primary-500' : 'bg-neutral-200 text-neutral-500'}`}>
                <Users className="h-4 w-4" />
              </div>
            </div>
            
            <div className="mt-2 flex flex-wrap gap-2">
              {isConnected && selectedPersonId ? (
                // Mostrar detalhes apenas da pessoa selecionada
                (() => {
                  const person = people.find((p: any) => p.id.toString() === selectedPersonId);
                  if (!person) return null;
                  
                  // Conta as tags desta pessoa
                  const activeTagCount = filteredTags.filter((tag: any) => tag.isSubscribed).length;
                  const totalTagCount = filteredTags.length;
                  
                  return (
                    <div className="bg-primary-100 text-primary-800 px-2 py-1 rounded-full text-xs font-medium">
                      {person.name}: {activeTagCount} ativo{activeTagCount !== 1 ? 's' : ''} / {totalTagCount} total
                    </div>
                  );
                })()
              ) : (
                <div className="text-sm text-neutral-400">
                  {!isConnected ? 'Servidor desconectado' : 'Selecione uma pessoa'}
                </div>
              )}
              
              {isConnected && people.length === 0 && (
                <div className="text-sm text-neutral-500">Nenhuma pessoa cadastrada</div>
              )}
            </div>
            
            <p className="mt-2 text-xs text-neutral-500 flex items-center">
              {isConnected ? (
                <>
                  <svg 
                    xmlns="http://www.w3.org/2000/svg" 
                    width="12" 
                    height="12" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2" 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    className="mr-1"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                  Clique para ver detalhes
                </>
              ) : 'Reconecte ao servidor para utilizar'}
            </p>
          </CardContent>
        </Card>
      </div>
      
      {/* Real-time Chart - This uses the filtered tags for the selected person */}
      <WaterLevelChart 
        tagIds={filteredTagIds}
        personId={selectedPersonId ? Number(selectedPersonId) : undefined}
        title="Monitoramento em Tempo Real"
        allowFiltering={false}
      />
      
      {/* Location Map - Show all people with coordinates */}
      <LocationMap 
        people={people.map((person: any) => ({
          ...person,
          criticalStatus: criticalPeople.some((criticalPerson: any) => 
            criticalPerson.id === person.id
          ) ? true : false
        }))}
        title="Mapa de Localização"
      />
      
      {/* Recent Activities */}
      <Card>
        <div className="border-b border-neutral-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-neutral-900">Atividades Recentes</h3>
        </div>
        
        <CardContent className="p-5">
          <ul className="space-y-4">
            {activityLogs.length === 0 ? (
              <li className="text-center py-4 text-neutral-500">
                Nenhuma atividade registrada
              </li>
            ) : (
              activityLogs.slice(0, 5).map((activity: any) => (
                <li key={activity.id} className="flex items-start">
                  <div className={`flex-shrink-0 h-8 w-8 rounded-full ${getActivityColorClass(activity.type)} flex items-center justify-center`}>
                    {getActivityIcon(activity.type)}
                  </div>
                  <div className="ml-3">
                    <p className="text-sm text-neutral-900">{activity.message}</p>
                    <p className="text-xs text-neutral-500">
                      {format(new Date(activity.timestamp), 'dd/MM/yyyy HH:mm')}
                    </p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
