import React, { useEffect, useState } from "react";
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine
} from "recharts";
import { format, subMinutes, subHours, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectItem, SelectContent, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, Download, Clock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useOpcUa } from "@/contexts/OpcUaContext";
import { getCleanErrorMessage } from "@/lib/errorUtils";

// Função utilitária para formatar números com segurança
const formatNumber = (value: any, decimals: number = 2): string => {
  if (typeof value === 'number') {
    return value.toFixed(decimals);
  } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
    return parseFloat(value).toFixed(decimals);
  } else {
    return String(value || '');
  }
};

interface WaterLevelChartProps {
  tagIds?: number[];
  personId?: number;
  title?: string;
  allowFiltering?: boolean;
  historicalMode?: boolean;
  startDate?: Date;
  endDate?: Date;
  height?: number | string;
}

interface DataPoint {
  timestamp: string;
  [key: string]: any;
}

// Tipos de intervalo de tempo disponíveis
type TimeRangeType = 
  | '3min' | '5min' | '15min' | '30min'     // Minutos
  | '1h' | '2h' | '3h' | '6h' | '12h' | '24h'  // Horas
  | '2d' | '7d' | '30d'    // Dias
  | 'custom'; // Para datas personalizadas

// Interface para opções de intervalo de tempo
interface TimeRangeOption {
  value: TimeRangeType;
  label: string;
  getStartDate: () => Date;
  getEndDate: () => Date;
}

// Define as opções de intervalo de tempo
const timeRangeOptions: TimeRangeOption[] = [
  // Intervalos curtos (minutos)
  { value: '3min', label: '3 minutos', 
    getStartDate: () => subMinutes(new Date(), 3), 
    getEndDate: () => new Date() },
  { value: '5min', label: '5 minutos', 
    getStartDate: () => subMinutes(new Date(), 5), 
    getEndDate: () => new Date() },
  { value: '15min', label: '15 minutos', 
    getStartDate: () => subMinutes(new Date(), 15), 
    getEndDate: () => new Date() },
  { value: '30min', label: '30 minutos', 
    getStartDate: () => subMinutes(new Date(), 30), 
    getEndDate: () => new Date() },
  
  // Intervalos médios (horas)
  { value: '1h', label: '1 hora', 
    getStartDate: () => subHours(new Date(), 1), 
    getEndDate: () => new Date() },
  { value: '3h', label: '3 horas', 
    getStartDate: () => subHours(new Date(), 3), 
    getEndDate: () => new Date() },
  { value: '6h', label: '6 horas', 
    getStartDate: () => subHours(new Date(), 6), 
    getEndDate: () => new Date() },
  { value: '12h', label: '12 horas', 
    getStartDate: () => subHours(new Date(), 12), 
    getEndDate: () => new Date() },
  { value: '24h', label: '24 horas', 
    getStartDate: () => subHours(new Date(), 24), 
    getEndDate: () => new Date() },
  
  // Intervalos longos (dias)
  { value: '2d', label: '2 dias', 
    getStartDate: () => subDays(new Date(), 2), 
    getEndDate: () => new Date() },
  { value: '7d', label: '7 dias', 
    getStartDate: () => subDays(new Date(), 7), 
    getEndDate: () => new Date() },
  { value: '30d', label: '30 dias', 
    getStartDate: () => subDays(new Date(), 30), 
    getEndDate: () => new Date() },
  
  // Opção especial
  { value: 'custom', label: 'Personalizado', 
    getStartDate: () => new Date(), 
    getEndDate: () => new Date() } // Esse será tratado especialmente
];

export default function WaterLevelChart({
  tagIds = [],
  personId,
  title = "Monitoramento em Tempo Real",
  allowFiltering = true,
  historicalMode = false,
  startDate,
  endDate,
  height = 300
}: WaterLevelChartProps) {
  const [chartData, setChartData] = useState<DataPoint[]>([]);
  // Não atualizamos o estado com base em props para evitar loops de renderização
  const [selectedPersonId, setSelectedPersonId] = useState<string>("all");
  
  // Estado para controle de intervalo de tempo
  const [timeRange, setTimeRange] = useState<TimeRangeType>('5min');
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(startDate);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(endDate);
  const [effectiveStartDate, setEffectiveStartDate] = useState<Date | undefined>(() => {
    // Inicializar com valores padrão para garantir que sempre tenhamos datas iniciais válidas
    if (startDate) return startDate;
    // Caso contrário, retornar 24h atrás como padrão
    return subHours(new Date(), 24);
  });
  const [effectiveEndDate, setEffectiveEndDate] = useState<Date | undefined>(() => {
    if (endDate) return endDate;
    return new Date(); // Data atual como padrão
  });
  
  // Obter o estado de conexão OPC UA
  const { isConnected } = useOpcUa();
  
  const { toast } = useToast();
  
  const chartColors = [
    "hsl(var(--chart-1))",
    "hsl(var(--chart-2))",
    "hsl(var(--chart-3))",
    "hsl(var(--chart-4))",
    "hsl(var(--chart-5))"
  ];
  
  // Fetch people for filtering
  const { data: people = [] } = useQuery({
    queryKey: ['/api/people'],
    enabled: allowFiltering,
    onError: (error) => {
      console.error('Erro ao buscar pessoas:', error);
      toast({
        title: "Erro ao buscar pessoas",
        description: getCleanErrorMessage(error, "Não foi possível obter a lista de pessoas"),
        variant: "destructive"
      });
    }
  });
  
  // Fetch all available tags to get metadata for those in tagIds
  const { data: allTags = [], isLoading: tagsLoading } = useQuery({
    queryKey: ['/api/tags'],
    enabled: true,
    onError: (error) => {
      console.error('Erro ao buscar tags:', error);
      toast({
        title: "Erro ao buscar sensores",
        description: getCleanErrorMessage(error, "Não foi possível obter os sensores disponíveis"),
        variant: "destructive"
      });
    }
  });
  
  // Filter tags to only include the ones in tagIds if they were specified
  const tags = React.useMemo(() => {
    if (!Array.isArray(allTags) || allTags.length === 0) return [];

    // Se tagIds foi explicitamente fornecido (mesmo que vazio), usar apenas essas tags
    if (Array.isArray(tagIds)) {
      // Se tagIds está vazio, retornar array vazio (não mostrar nenhuma tag)
      if (tagIds.length === 0) return [];
      // Caso contrário, filtrar para mostrar apenas as tags em tagIds
      return allTags.filter((tag: any) => tagIds.includes(tag.id));
    }

    // Se tagIds não foi fornecido (undefined), retornar todas as tags
    return allTags;
  }, [allTags, tagIds]);
  
  // Efeito para atualizar as datas efetivas baseado no timeRange ou nas datas externas
  useEffect(() => {
    if (historicalMode) {
      // Priorizar datas das props (filtros externos) se estiverem presentes
      if (startDate && endDate) {
        setEffectiveStartDate(startDate);
        setEffectiveEndDate(endDate);
        setTimeRange('custom'); // Mudamos para modo custom quando vem de filtro externo
        return;
      }
      
      // Se for 'custom', usamos as datas customizadas internas
      if (timeRange === 'custom') {
        setEffectiveStartDate(customStartDate || startDate);
        setEffectiveEndDate(customEndDate || endDate);
        return;
      }
      
      // Caso contrário, usamos as datas calculadas com base no timeRange
      const selectedOption = timeRangeOptions.find(option => option.value === timeRange);
      if (selectedOption) {
        setEffectiveStartDate(selectedOption.getStartDate());
        setEffectiveEndDate(selectedOption.getEndDate());
      }
    }
  }, [timeRange, customStartDate, customEndDate, startDate, endDate, historicalMode]);

  // Fetch historical data if in historical mode
  const { data: historicalResponse = { data: [], total: 0 }, isLoading: historicalLoading, refetch: refetchHistorical } = useQuery({
    queryKey: ['/api/readings/historical', { 
      tagIds: tagIds.length > 0 ? tagIds.join(',') : '', 
      from: effectiveStartDate?.toISOString(), 
      to: effectiveEndDate?.toISOString() 
    }],
    enabled: historicalMode && tagIds.length > 0 && !!effectiveStartDate,
    staleTime: 0, // Sempre considerar dados obsoletos para garantir atualização
    refetchOnWindowFocus: true, // Atualizar quando a janela receber foco
    refetchOnMount: true, // Atualizar quando o componente montar
    refetchInterval: 30000, // Atualizar a cada 30 segundos
    onError: (error) => {
      console.error('Erro ao buscar dados históricos:', error);
      toast({
        title: "Erro ao buscar histórico",
        description: getCleanErrorMessage(error, "Não foi possível obter os dados históricos. Verifique os filtros"),
        variant: "destructive"
      });
    }
  });
  
  // Extrai os dados da resposta no novo formato
  const historicalData = historicalResponse?.data || [];
  
  // Adicionar log para debug
  useEffect(() => {
    if (historicalMode) {
      console.log("Intervalo de tempo selecionado:", timeRange);
      console.log("Data inicial:", effectiveStartDate);
      console.log("Data final:", effectiveEndDate);
      console.log("Dados históricos recebidos:", historicalData?.length || 0, "registros");
      
      // Log da URL de requisição para debug
      if (effectiveStartDate && effectiveEndDate && tagIds.length > 0) {
        const url = `/api/readings/historical?tagIds=${tagIds.join(',')}&from=${encodeURIComponent(effectiveStartDate.toISOString())}&to=${encodeURIComponent(effectiveEndDate.toISOString())}`;
        console.log("Fazendo requisição para:", url);
      }
      
      // Log detalhado para debug
      if (Array.isArray(historicalData) && historicalData.length > 0) {
        console.log("Amostra dos dados históricos:", historicalData.slice(0, 2));
      }
    }
  }, [historicalMode, timeRange, effectiveStartDate, effectiveEndDate, historicalData, tagIds]);
  
  // Transform data for the chart
  useEffect(() => {
    if (historicalMode) {
      const dataByTimestamp: Record<string, DataPoint> = {};
      
      // Se não houver dados e estivermos no modo histórico, criar um exemplo de ponto vazio
      // para mostrar pelo menos o eixo do tempo no gráfico
      if (!Array.isArray(historicalData) || historicalData.length === 0) {
        if (effectiveStartDate && effectiveEndDate) {
          // Adicionar um ponto no meio do intervalo
          const middleDate = new Date(
            (effectiveStartDate.getTime() + effectiveEndDate.getTime()) / 2
          );
          dataByTimestamp[format(middleDate, 'yyyy-MM-dd HH:mm:ss')] = {
            timestamp: format(middleDate, 'yyyy-MM-dd HH:mm:ss')
          };
          
          // Atualizar o chartData
          const chartDataArray = Object.values(dataByTimestamp);
          setChartData(chartDataArray);
          return;
        }
      }
      
      // Processamento normal para dados existentes
      if (Array.isArray(historicalData)) {
        historicalData.forEach((reading: any) => {
          if (!reading || !reading.timestamp || reading.tagId === undefined) return;
          
          try {
            const timestamp = format(new Date(reading.timestamp), 'yyyy-MM-dd HH:mm:ss');
            
            if (!dataByTimestamp[timestamp]) {
              dataByTimestamp[timestamp] = { timestamp };
            }
            
            // Usa função utilitária para validar e processar o valor
            try {
              const numericValue = typeof reading.value === 'number' 
                ? reading.value 
                : (typeof reading.value === 'string' && !isNaN(parseFloat(reading.value)))
                  ? parseFloat(reading.value)
                  : null;
              
              if (numericValue !== null) {
                dataByTimestamp[timestamp][`tag_${reading.tagId}`] = numericValue;
              }
            } catch (err) {
              console.error('Erro ao processar valor numérico:', reading.value);
            }
          } catch (err) {
            console.error('Erro ao processar leitura histórica:', err, reading);
          }
        });
      } else {
        console.warn('Dados históricos não são um array:', historicalData);
      }
      
      // Ordenar os dados por timestamp (mais antigo para mais recente)
      const chartDataArray = Object.values(dataByTimestamp);
      chartDataArray.sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      
      // Evitar loop infinito de renderização verificando se os dados realmente mudaram
      if (JSON.stringify(chartData) !== JSON.stringify(chartDataArray)) {
        setChartData(chartDataArray);
      }
    }
  }, [historicalMode, historicalData, chartData, effectiveStartDate, effectiveEndDate]);
  
  // Fetch latest data or use WebSocket for real-time updates
  const { data: latestReadings, isLoading: latestLoading, refetch } = useQuery({
    queryKey: ['/api/readings/latest', { tagIds: tagIds && tagIds.length > 0 ? tagIds.join(',') : '' }],
    enabled: !historicalMode && tagIds.length > 0,
    refetchInterval: 3000, // Poll a cada 3 segundos para melhor resposta em tempo real
    retry: 1, // Tenta apenas 1 vez para evitar duplicação
    retryDelay: 500,
    refetchOnWindowFocus: true,
    staleTime: 0, // Sempre considera os dados obsoletos para garantir atualização
    refetchOnMount: true, // Sempre atualiza quando o componente monta
    // Retorna um array vazio em caso de erro e evita que o app quebre
    onError: (error) => {
      console.error('Erro ao buscar leituras:', error);
      toast({
        title: "Erro ao buscar dados",
        description: getCleanErrorMessage(error, "Não foi possível obter as leituras mais recentes. Verifique sua conexão"),
        variant: "destructive"
      });
    }
  });
  
  // Transform latest readings into chart data points
  useEffect(() => {
    if (!historicalMode && latestReadings && Array.isArray(latestReadings) && latestReadings.length > 0) {
      // Agrupar leituras por horário real em vez de usar o horário atual
      const dataPointsByTimestamp: Record<string, DataPoint> = {};
      
      latestReadings.forEach((reading: any) => {
        if (!reading || !reading.tagId || reading.value === undefined || !reading.timestamp) return;
        
        try {
          // Usa o timestamp real da leitura em vez do horário atual
          const readingTimestamp = format(new Date(reading.timestamp), 'yyyy-MM-dd HH:mm:ss');
          
          // Cria ou atualiza o ponto de dados para este timestamp
          if (!dataPointsByTimestamp[readingTimestamp]) {
            dataPointsByTimestamp[readingTimestamp] = { timestamp: readingTimestamp };
          }
          
          // Usa função utilitária para validar e processar o valor
          try {
            const numericValue = typeof reading.value === 'number' 
              ? reading.value 
              : (typeof reading.value === 'string' && !isNaN(parseFloat(reading.value)))
                ? parseFloat(reading.value)
                : null;
            
            if (numericValue !== null) {
              dataPointsByTimestamp[readingTimestamp][`tag_${reading.tagId}`] = numericValue;
            }
          } catch (err) {
            console.error('Erro ao processar valor numérico em tempo real:', reading.value);
          }
        } catch (err) {
          console.error('Erro ao processar leitura em tempo real:', err, reading);
        }
      });
      
      // Converte os pontos de dados em array e ordena por timestamp
      const newDataPoints = Object.values(dataPointsByTimestamp).sort((a, b) => {
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
      });
      
      // Só adiciona se temos pontos com dados válidos
      if (newDataPoints.length > 0) {
        setChartData(prev => {
          // Proteção contra estado nulo/indefinido
          const prevData = prev || [];
          
          // Verificar se os novos pontos já existem no estado atual
          // para evitar duplicações desnecessárias
          const existingTimestamps = new Set(prevData.map(point => point.timestamp));
          const uniqueNewPoints = newDataPoints.filter(
            point => !existingTimestamps.has(point.timestamp)
          );
          
          // Se não temos pontos novos, não precisamos atualizar o estado
          if (uniqueNewPoints.length === 0) {
            return prevData;
          }
          
          // Criar novo array com os dados anteriores e os novos pontos
          const newData = [...prevData, ...uniqueNewPoints];
          
          // Keep only the last 20 data points to avoid chart clutter
          if (newData.length > 20) {
            return newData.slice(newData.length - 20);
          }
          return newData;
        });
      }
    }
  }, [historicalMode, latestReadings]);
  
  // Manipula a mudança de intervalo de tempo
  const handleTimeRangeChange = (value: string) => {
    console.log("Mudando timeRange para:", value);
    setTimeRange(value as TimeRangeType);
    
    // Se for um intervalo predefinido, atualiza imediatamente os dados
    if (value !== 'custom') {
      // Atualizar imediatamente as datas
      const selectedOption = timeRangeOptions.find(option => option.value === value as TimeRangeType);
      if (selectedOption) {
        const newStartDate = selectedOption.getStartDate();
        const newEndDate = selectedOption.getEndDate();
        
        console.log("Novas datas:", {
          startDate: newStartDate,
          endDate: newEndDate
        });
        
        setEffectiveStartDate(newStartDate);
        setEffectiveEndDate(newEndDate);
      }
      
      // Forçar uma atualização dos dados
      setTimeout(() => {
        refetchHistorical();
      }, 100);
    }
  };
  
  // Handle refresh
  const handleRefresh = () => {
    if (historicalMode) {
      refetchHistorical();
    } else {
      refetch();
    }
    toast({
      title: "Atualizado",
      description: "Dados do gráfico atualizados"
    });
  };
  
  // Handle export
  const handleExport = () => {
    // Create CSV content
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Headers
    let headers = ["Timestamp"];
    
    // Find all unique tag_ids in the data
    const tagKeys = new Set<string>();
    chartData.forEach(point => {
      Object.keys(point).forEach(key => {
        if (key !== 'timestamp') {
          tagKeys.add(key);
        }
      });
    });
    
    // Map tag keys to display names
    const tagKeyArray = Array.from(tagKeys);
    const headerNames = tagKeyArray.map(key => {
      // Extract tag ID from key (e.g., "tag_8" -> 8)
      const tagId = parseInt(key.replace('tag_', ''));
      // Find the tag with this ID
      const tag = tags?.find((t: any) => t.id === tagId);
      // Use displayName if available, otherwise use the key
      return tag?.displayName || key;
    });
    
    headers = headers.concat(headerNames);
    csvContent += headers.join(",") + "\n";
    
    // Data rows
    chartData.forEach(dataPoint => {
      let row = [dataPoint.timestamp];
      
      tagKeyArray.forEach(key => {
        row.push(dataPoint[key] !== undefined ? dataPoint[key].toString() : "");
      });
      
      csvContent += row.join(",") + "\n";
    });
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `water-levels-${format(new Date(), 'yyyy-MM-dd-HH-mm-ss')}.csv`);
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Exportado",
      description: "Dados exportados para CSV com sucesso"
    });
  };
  
  // Generate legend items (map tag_ids to names)
  const legendItems = Array.isArray(tags) ? tags.map((tag: any, index: number) => ({
    id: `tag_${tag.id}`,
    name: tag.displayName,
    color: chartColors[index % chartColors.length]
  })) : [];
  
  const isLoading = tagsLoading || latestLoading || historicalLoading;
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        
        <div className="flex space-x-2">
          {/* Time Range selector - só aparece no modo histórico */}
          {historicalMode && (
            <div className="flex items-center mr-2">
              <Select value={timeRange} onValueChange={handleTimeRangeChange}>
                <SelectTrigger className="h-8 text-xs w-32 flex items-center">
                  <Clock className="h-3 w-3 mr-1 inline-flex" />
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  {/* Intervalos menores */}
                  <SelectItem value="5min">5 minutos</SelectItem>
                  <SelectItem value="15min">15 minutos</SelectItem>
                  <SelectItem value="30min">30 minutos</SelectItem>
                  {/* Intervalos em horas */}
                  <SelectItem value="1h">1 hora</SelectItem>
                  <SelectItem value="3h">3 horas</SelectItem>
                  <SelectItem value="6h">6 horas</SelectItem>
                  <SelectItem value="12h">12 horas</SelectItem>
                  <SelectItem value="24h">24 horas</SelectItem>
                  {/* Intervalos em dias */}
                  <SelectItem value="2d">2 dias</SelectItem>
                  <SelectItem value="7d">7 dias</SelectItem>
                  <SelectItem value="30d">30 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs"
            onClick={handleRefresh}
            disabled={!isConnected}
          >
            <RefreshCw className="h-3 w-3 mr-1" /> Atualizar
          </Button>
          
          <Button 
            variant="outline" 
            size="sm" 
            className="h-8 text-xs"
            onClick={handleExport}
            disabled={!isConnected}
          >
            <Download className="h-3 w-3 mr-1" /> Exportar
          </Button>
        </div>
      </CardHeader>
      
      <CardContent>
        <div style={{ height: height, width: '100%' }}>
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="flex items-center mb-3">
                <div className="h-3 w-3 rounded-full mr-2 bg-destructive"></div>
                <span className="text-lg font-semibold text-destructive">Servidor desconectado</span>
              </div>
              <p className="text-muted-foreground text-sm">
                Não é possível exibir dados quando o servidor não está conectado
              </p>
            </div>
          ) : isLoading ? (
            <div className="flex items-center justify-center h-full">
              <span className="text-muted-foreground">Carregando dados...</span>
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <span className="text-muted-foreground mb-2">Sem dados para exibir no período selecionado</span>
              {historicalMode && (
                <div className="text-xs text-muted-foreground">
                  <p>Tente selecionar um intervalo de tempo diferente</p>
                </div>
              )}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="timestamp" 
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return format(date, 'HH:mm:ss');
                  }}
                />
                <YAxis 
                  tick={{ fontSize: 12 }}
                  domain={[0, 100]} // Fixando o range de 0-100%
                  label={{ 
                    value: 'Nível (%)', 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { textAnchor: 'middle', fontSize: 12 }
                  }}
                />
                <Tooltip 
                  formatter={(value: any) => {
                    try {
                      return [formatNumber(value), 'Nível'];
                    } catch (err) {
                      console.error('Erro ao formatar valor para tooltip:', value);
                      return [String(value), 'Nível'];
                    }
                  }}
                  labelFormatter={(label) => format(new Date(label), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR })}
                />
                {/* Só exibir a legenda se estiver conectado */}
                {isConnected && <Legend />}
                
                {/* Reference line for low level warning */}
                <ReferenceLine 
                  y={25} 
                  stroke="red" 
                  strokeDasharray="3 3" 
                  label={{ 
                    value: 'Nível crítico', 
                    position: 'top', 
                    fill: 'red',
                    fontSize: 10
                  }} 
                />
                
                {/* Se temos tags, usamos elas para as linhas */}
                {tags && Array.isArray(tags) && tags.length > 0 ? 
                  tags.map((tag: any, index: number) => (
                    <Line
                      key={tag.id}
                      type="monotone"
                      dataKey={`tag_${tag.id}`}
                      name={tag.displayName || `Sensor ${tag.id}`}
                      stroke={chartColors[index % chartColors.length]}
                      activeDot={{ r: 8 }}
                      connectNulls
                    />
                  ))
                : 
                  // Se não temos tags, mostrar linhas baseadas nos tagIds
                  tagIds && tagIds.length > 0 && 
                  tagIds.map((tagId: number, index: number) => (
                    <Line
                      key={tagId}
                      type="monotone"
                      dataKey={`tag_${tagId}`}
                      name={`Sensor ${tagId}`}
                      stroke={chartColors[index % chartColors.length]}
                      activeDot={{ r: 8 }}
                      connectNulls
                    />
                  ))
                }
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        
        {/* Legend - só exibir se estiver conectado */}
        {isConnected && (
          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            {/* Se temos tag items na legenda, usamos eles */}
            {legendItems && legendItems.length > 0 ? (
              legendItems.map((item: any, index: number) => (
                <div key={index} className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2" 
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm">{item.name}</span>
                </div>
              ))
            ) : (
              // Se não temos legenda baseada em tags, criamos baseado em tagIds
              tagIds && tagIds.length > 0 && 
              tagIds.map((tagId: number, index: number) => (
                <div key={index} className="flex items-center">
                  <div 
                    className="w-3 h-3 rounded-full mr-2" 
                    style={{ backgroundColor: chartColors[index % chartColors.length] }}
                  />
                  <span className="text-sm">{`Sensor ${tagId}`}</span>
                </div>
              ))
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
