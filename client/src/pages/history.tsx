import { useState, useEffect, forwardRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Pagination, 
  PaginationContent, 
  PaginationItem, 
  PaginationLink, 
  PaginationNext, 
  PaginationPrevious 
} from "@/components/ui/pagination";
import { 
  FileSpreadsheet, 
  Filter, 
  Undo2,
  Calendar as CalendarIcon
} from "lucide-react";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import WaterLevelChart from "@/components/WaterLevelChart";
import { z } from "zod";
import { useForm, ControllerRenderProps } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { ButtonProps } from "@/components/ui/button";

// Componente personalizado de seleção de data no formato brasileiro
interface DatePickerProps {
  field: ControllerRenderProps<any, any>;
  label?: string;
  placeholder?: string;
  clearCallback?: () => void;
}

const DatePicker = ({ field, label, placeholder = "Selecione uma data", clearCallback }: DatePickerProps) => {
  const [date, setDate] = useState<Date | undefined>(field.value ? new Date(field.value) : undefined);
  const [hour, setHour] = useState<string>(date ? format(date, "HH") : "00");
  const [minute, setMinute] = useState<string>(date ? format(date, "mm") : "00");

  // Usar um useEffect para detectar mudanças externas no valor do campo
  useEffect(() => {
    // Se o valor do campo for vazio, resetar a data
    if (!field.value && date) {
      setDate(undefined);
      setHour("00");
      setMinute("00");
    } 
    else if (field.value) {
      // Se recebemos um novo valor de campo, atualizamos todos os estados
      const newDate = new Date(field.value);
      setDate(newDate);
      setHour(format(newDate, "HH"));
      setMinute(format(newDate, "mm"));
    }
  }, [field.value, date]);

  // Função para atualizar a data e hora completa
  const updateDateTime = (newDate?: Date, newHour?: string, newMinute?: string) => {
    if (!newDate) {
      field.onChange("");
      return;
    }
    
    const hoursToAdd = parseInt(newHour || hour, 10);
    const minutesToAdd = parseInt(newMinute || minute, 10);
    
    // Criar nova data com o horário especificado
    const updatedDate = new Date(newDate);
    updatedDate.setHours(hoursToAdd, minutesToAdd);
    
    // Atualizar o valor do campo no formulário com hora e minuto
    field.onChange(format(updatedDate, "yyyy-MM-dd'T'HH:mm:ss"));
  };

  // Gerar opções para horas (00-23)
  const hourOptions = Array.from({ length: 24 }, (_, i) => 
    i < 10 ? `0${i}` : `${i}`
  );
  
  // Gerar opções para minutos (00-59)
  const minuteOptions = Array.from({ length: 60 }, (_, i) => 
    i < 10 ? `0${i}` : `${i}`
  );

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            !date && "text-muted-foreground"
          )}
          type="button"
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          <span className="grow truncate text-left">
            {date ? format(date, "dd/MM/yyyy HH:mm", { locale: ptBR }) : placeholder}
          </span>
          <div className="opacity-60">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 rotate-0 scale-100" style={{ opacity: "0.7" }}>
              <path d="M4 6L8 10L12 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path>
            </svg>
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-auto">
        <div className="p-0">
          <Calendar
            mode="single"
            locale={ptBR}
            selected={date}
            onSelect={(newDate) => {
              setDate(newDate);
              updateDateTime(newDate, hour, minute);
            }}
            initialFocus
          />
          <div className="flex justify-between items-center p-3 border-t border-border">
            <div className="flex items-center space-x-2">
              <Select value={hour} onValueChange={(value) => {
                setHour(value);
                updateDateTime(date, value, minute);
              }}>
                <SelectTrigger className="w-16">
                  <SelectValue placeholder="Hora" />
                </SelectTrigger>
                <SelectContent>
                  {hourOptions.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>:</span>
              <Select value={minute} onValueChange={(value) => {
                setMinute(value);
                updateDateTime(date, hour, value);
              }}>
                <SelectTrigger className="w-16">
                  <SelectValue placeholder="Min" />
                </SelectTrigger>
                <SelectContent>
                  {minuteOptions.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

// Define schema for filters
const filterSchema = z.object({
  tagId: z.string().optional(),
  personId: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

type FilterFormValues = z.infer<typeof filterSchema>;

export default function History() {
  const { toast } = useToast();
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [limit, setLimit] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const rowsPerPageOptions = [10, 25, 50, 100];
  const [appliedFilters, setAppliedFilters] = useState<FilterFormValues>({});
  
  // Get all people for filtering
  const { data: people = [] } = useQuery({
    queryKey: ['/api/people']
  });
  
  // Get all tags for filtering
  const { data: tags = [] } = useQuery({
    queryKey: ['/api/tags']
  });
  
  // Calcular os tagIds filtrados com base nos filtros aplicados
  const filteredTagIds = (() => {
    if (!tags || !Array.isArray(tags)) return [];

    let filteredTags = [...tags];
    
    // Primeiro aplicar filtro de tag se existir
    if (appliedFilters.tagId && appliedFilters.tagId !== 'all') {
      const tagId = parseInt(appliedFilters.tagId);
      filteredTags = filteredTags.filter(tag => tag.id === tagId);
    }
    
    // Depois aplicar filtro de pessoa se existir (combinando com filtro de tag)
    if (appliedFilters.personId && appliedFilters.personId !== 'all') {
      const personId = parseInt(appliedFilters.personId);
      filteredTags = filteredTags.filter(tag => tag.personId === personId);
    }
    
    // Retornar os IDs das tags filtradas
    return filteredTags.map(tag => tag.id);
  })();
  
  // Estados para datas do gráfico
  const [chartStartDate, setChartStartDate] = useState<Date | undefined>(undefined);
  const [chartEndDate, setChartEndDate] = useState<Date | undefined>(undefined);
  
  // Atualizar as datas do gráfico quando os filtros mudam
  useEffect(() => {
    setChartStartDate(appliedFilters.dateFrom ? new Date(appliedFilters.dateFrom) : undefined);
    setChartEndDate(appliedFilters.dateTo ? new Date(appliedFilters.dateTo) : undefined);
  }, [appliedFilters]);
  
  // Setup form
  const form = useForm<FilterFormValues>({
    resolver: zodResolver(filterSchema),
    defaultValues: {
      tagId: "all",
      personId: "all",
      dateFrom: "",
      dateTo: "",
    }
  });
  
  // Convert form values to API parameters
  const getQueryParams = () => {
    const params = new URLSearchParams();
    
    if (appliedFilters.tagId && appliedFilters.tagId !== 'all') {
      params.append('tagId', appliedFilters.tagId);
    }
    
    // Se uma pessoa específica foi selecionada, adicionar o filtro de personId
    if (appliedFilters.personId && appliedFilters.personId !== 'all') {
      params.append('personId', appliedFilters.personId);
    }
    
    if (appliedFilters.dateFrom) {
      params.append('from', new Date(appliedFilters.dateFrom).toISOString());
    }
    
    if (appliedFilters.dateTo) {
      params.append('to', new Date(appliedFilters.dateTo).toISOString());
    }
    
    // Adicionamos paginação
    params.append('limit', String(limit));
    // Calculamos o offset com base na página atual e no limite por página
    const offset = (page - 1) * limit;
    if (offset > 0) {
      params.append('offset', String(offset));
    }
    
    return params.toString();
  };
  
  // Get readings with filters - use the page to recalculate the query - agora sempre habilitado
  const { data: readingsResponse, isLoading, refetch: refetchReadings } = useQuery({
    queryKey: [`/api/readings?${getQueryParams()}`, page, limit],
    enabled: true, // Always enable
    staleTime: 0, // Considerar os dados sempre obsoletos
    refetchOnMount: true, // Atualizar quando o componente montar ou remontar
    refetchOnWindowFocus: true // Atualizar quando a janela receber foco
  });
  
  // Extrair os dados e o total da resposta
  const readings = readingsResponse?.data || [];
  const totalRecords = readingsResponse?.total || 0;
  
  // Atualizar o número total de páginas
  useEffect(() => {
    if (totalRecords > 0) {
      setTotalPages(Math.ceil(totalRecords / limit));
    } else {
      setTotalPages(1);
    }
  }, [totalRecords, limit]);
  
  // Função para mudar de página e forçar refetch
  const handlePageChange = (newPage: number) => {
    setPage(newPage);
    // Forçar refetch após mudança de página para garantir dados atualizados
    setTimeout(() => refetchReadings(), 10);
  };
  
  // Handle filter submission
  const onSubmit = (values: FilterFormValues) => {
    setAppliedFilters(values);
    handlePageChange(1); // Reset to first page e garantir atualização dos dados
  };
  
  // Handle reset filters - limpa todos os filtros e submete o formulário limpo
  const handleResetFilters = () => {
    // Valores padrão
    const defaultValues = {
      tagId: "all",
      personId: "all",
      dateFrom: "",
      dateTo: ""
    };
    
    // Reset completo do formulário
    form.reset(defaultValues);
    
    // Forçar o reset das entradas de data
    try {
      // Forçar um valor vazio para os campos de data
      form.setValue('dateFrom', '');
      form.setValue('dateTo', '');
    } catch (e) {
      console.error("Erro ao resetar campos de data:", e);
    }
    
    // Garantir que os selects estejam resetados
    const tagSelect = document.querySelector('select[name="tagId"]') as HTMLSelectElement | null;
    const personSelect = document.querySelector('select[name="personId"]') as HTMLSelectElement | null;
    
    if (tagSelect) {
      tagSelect.value = "all";
      // Disparar evento de mudança para atualizar o React
      const event = new Event('change', { bubbles: true });
      tagSelect.dispatchEvent(event);
    }
    
    if (personSelect) {
      personSelect.value = "all";
      // Disparar evento de mudança para atualizar o React
      const event = new Event('change', { bubbles: true });
      personSelect.dispatchEvent(event);
    }
    
    // Aplicar os filtros limpos imediatamente
    setAppliedFilters(defaultValues);
    
    // Resetar as datas para o gráfico
    setChartStartDate(undefined);
    setChartEndDate(undefined);
    
    // Voltar para a primeira página
    setPage(1);
    
    // Forçar refetch depois de um pequeno delay para garantir que os estados foram atualizados
    setTimeout(() => {
      refetchReadings();
    }, 100);
  };
  
  // Handle CSV export
  const handleExportCSV = () => {
    // Create CSV content
    let csvContent = "data:text/csv;charset=utf-8,";
    
    // Headers
    let headers = ["Tag", "Pessoa", "Valor", "Timestamp", "Qualidade"];
    csvContent += headers.join(",") + "\n";
    
    // Data rows
    readings.forEach((reading: any) => {
      const tag = tags.find((t: any) => t.id === reading.tagId);
      const person = tag?.personId ? people.find((p: any) => p.id === tag.personId) : null;
      
      let row = [
        tag?.displayName || `Tag ${reading.tagId}`,
        person?.name || '-',
        reading.value !== null ? reading.value : 'N/A',
        format(new Date(reading.timestamp), 'yyyy-MM-dd HH:mm:ss'),
        reading.quality
      ];
      
      csvContent += row.join(",") + "\n";
    });
    
    // Create download link
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `water-levels-history-${format(new Date(), 'yyyy-MM-dd-HH-mm-ss')}.csv`);
    document.body.appendChild(link);
    
    // Trigger download
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Exportado",
      description: "Dados históricos exportados para CSV com sucesso"
    });
  };
  
  // Já definido anteriormente
  // const filteredTagIds = ... 
  // const chartStartDate = ...
  // const chartEndDate = ...
  
  // Format date for display
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy HH:mm:ss', { locale: ptBR });
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-neutral-900">Histórico de Leituras</h2>
      
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
        </CardHeader>
        
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <FormField
                  control={form.control}
                  name="tagId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tag</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        name="tagId"
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas as tags" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">Todas as tags</SelectItem>
                          {tags.map((tag: any) => (
                            <SelectItem key={tag.id} value={tag.id.toString()}>
                              {tag.displayName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="personId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pessoa</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        name="personId"
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Todas as pessoas" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">Todas as pessoas</SelectItem>
                          {people.map((person: any) => (
                            <SelectItem key={person.id} value={person.id.toString()}>
                              {person.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dateFrom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Inicial</FormLabel>
                      <FormControl>
                        <DatePicker 
                          field={field} 
                          placeholder="Selecione a data inicial" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="dateTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Data Final</FormLabel>
                      <FormControl>
                        <DatePicker 
                          field={field} 
                          placeholder="Selecione a data final" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleResetFilters}
                >
                  <Undo2 className="mr-2 h-4 w-4" /> Limpar
                </Button>
                <Button type="submit">
                  <Filter className="mr-2 h-4 w-4" /> Aplicar Filtros
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {/* History Data */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Registros Históricos</CardTitle>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportCSV}
            disabled={readings.length === 0}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        </CardHeader>
        
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag</TableHead>
                  <TableHead>Pessoa</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Qualidade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      Carregando dados...
                    </TableCell>
                  </TableRow>
                ) : readings.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      {readings.length === 0 
                        ? 'Nenhum registro encontrado. Tente ajustar os filtros ou expandir o período de datas.' 
                        : 'Carregando registros...'}
                    </TableCell>
                  </TableRow>
                ) : (
                  readings.map((reading: any) => {
                    const tag = tags.find((t: any) => t.id === reading.tagId);
                    const person = tag?.personId ? people.find((p: any) => p.id === tag.personId) : null;
                    
                    return (
                      <TableRow key={reading.id}>
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
                              className="text-success-500 mr-2"
                            >
                              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                              <line x1="7" y1="7" x2="7.01" y2="7" />
                            </svg>
                            <span className="font-medium">{tag?.displayName || `Tag ${reading.tagId}`}</span>
                          </div>
                        </TableCell>
                        <TableCell>{person?.name || '-'}</TableCell>
                        <TableCell className="font-medium">
                          {reading.value !== null ? `${reading.value.toFixed(2)}` : 'N/A'}
                        </TableCell>
                        <TableCell className="text-neutral-500 text-sm">
                          {formatDate(reading.timestamp)}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              reading.quality === 'Good' 
                                ? 'default' 
                                : reading.quality === 'Uncertain' 
                                  ? 'secondary' 
                                  : 'destructive'
                            }
                            className={`px-2 py-1 text-xs rounded-full ${
                              reading.quality === 'Good' 
                                ? 'bg-green-100 text-green-800' 
                                : reading.quality === 'Uncertain' 
                                  ? 'bg-yellow-100 text-yellow-800' 
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {reading.quality}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination and Row Selection */}
          {readings.length > 0 && (
            <div className="mt-5 flex flex-col sm:flex-row justify-between items-center space-y-2 sm:space-y-0">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-500">
                  Mostrando {readings.length} de {totalRecords} registros ({page} de {totalPages} páginas)
                </span>
                <Select
                  value={String(rowsPerPage)}
                  onValueChange={(value) => {
                    setRowsPerPage(Number(value));
                    setLimit(Number(value));
                    handlePageChange(1); // Reset to first page when changing rows per page
                  }}
                >
                  <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={rowsPerPage} />
                  </SelectTrigger>
                  <SelectContent>
                    {rowsPerPageOptions.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        if (page > 1) {
                          handlePageChange(page - 1);
                        }
                      }}
                      className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                  
                  {/* Primeira página */}
                  {page > 2 && (
                    <PaginationItem>
                      <PaginationLink 
                        href="#" 
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(1);
                        }}
                      >
                        1
                      </PaginationLink>
                    </PaginationItem>
                  )}
                  
                  {/* Elipse se estiver muito longe do início */}
                  {page > 3 && (
                    <PaginationItem>
                      <span className="px-2">...</span>
                    </PaginationItem>
                  )}
                  
                  {/* Página anterior */}
                  {page > 1 && (
                    <PaginationItem>
                      <PaginationLink 
                        href="#" 
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(page - 1);
                        }}
                      >
                        {page - 1}
                      </PaginationLink>
                    </PaginationItem>
                  )}
                  
                  {/* Página atual */}
                  <PaginationItem>
                    <PaginationLink href="#" isActive>{page}</PaginationLink>
                  </PaginationItem>
                  
                  {/* Próxima página */}
                  {page < totalPages && (
                    <PaginationItem>
                      <PaginationLink 
                        href="#" 
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(page + 1);
                        }}
                      >
                        {page + 1}
                      </PaginationLink>
                    </PaginationItem>
                  )}
                  
                  {/* Elipse se estiver muito longe do fim */}
                  {page < totalPages - 2 && (
                    <PaginationItem>
                      <span className="px-2">...</span>
                    </PaginationItem>
                  )}
                  
                  {/* Última página */}
                  {page < totalPages - 1 && (
                    <PaginationItem>
                      <PaginationLink 
                        href="#" 
                        onClick={(e) => {
                          e.preventDefault();
                          handlePageChange(totalPages);
                        }}
                      >
                        {totalPages}
                      </PaginationLink>
                    </PaginationItem>
                  )}
                  
                  <PaginationItem>
                    <PaginationNext 
                      href="#" 
                      onClick={(e) => {
                        e.preventDefault();
                        if (page < totalPages) handlePageChange(page + 1);
                      }}
                      className={page >= totalPages ? 'pointer-events-none opacity-50' : ''}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
      
      {/* Historical Chart - temporariamente oculto, descomentar para habilitar no futuro */}
      {/* {filteredTagIds.length > 0 && (
        <WaterLevelChart 
          tagIds={filteredTagIds}
          personId={appliedFilters.personId !== 'all' ? Number(appliedFilters.personId) : undefined}
          title="Gráfico Histórico"
          historicalMode={true}
          startDate={chartStartDate}
          endDate={chartEndDate}
          height={400}
        />
      )} */}
    </div>
  );
}
