import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOpcUa } from "@/contexts/OpcUaContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCleanErrorMessage } from "@/lib/errorUtils";
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
import { Plug, RotateCcw, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const connectionSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  host: z.string().min(1, "Host é obrigatório"),
  port: z.coerce.number().int().min(1, "Porta é obrigatória"),
  securityPolicy: z.string().default("None"),
  securityMode: z.string().default("None"),
  username: z.string().optional(),
  password: z.string().optional(),
});

type ConnectionFormValues = z.infer<typeof connectionSchema>;

export default function Connection() {
  const { isConnected, connectionEndpoint, connect, disconnect, connecting } = useOpcUa();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteConnectionId, setDeleteConnectionId] = useState<number | null>(null);
  const [connectionLogs, setConnectionLogs] = useState<string[]>([]);
  
  // Get all connections
  const { data: connections = [] } = useQuery({
    queryKey: ['/api/connections']
  });
  
  // Form setup
  const form = useForm<ConnectionFormValues>({
    resolver: zodResolver(connectionSchema),
    defaultValues: {
      name: "",
      host: "",
      port: 4840,
      securityPolicy: "None",
      securityMode: "None",
      username: "",
      password: "",
    },
  });
  
  // Create connection mutation
  const createConnectionMutation = useMutation({
    mutationFn: async (values: ConnectionFormValues) => {
      const response = await apiRequest('POST', '/api/connections', values);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections'] });
      toast({
        title: "Conexão salva",
        description: "Configuração de conexão salva com sucesso"
      });
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar conexão",
        description: getCleanErrorMessage(error, "Não foi possível salvar a configuração de conexão"),
        variant: "destructive"
      });
    }
  });
  
  // Delete connection mutation
  const deleteConnectionMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/connections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/connections'] });
      toast({
        title: "Conexão excluída",
        description: "Configuração de conexão removida com sucesso"
      });
      setDeleteConnectionId(null);
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir conexão",
        description: getCleanErrorMessage(error, "Não foi possível remover a configuração de conexão"),
        variant: "destructive"
      });
    }
  });
  
  // Get activity logs for connection events
  const { data: activityLogs = [] } = useQuery({
    queryKey: ['/api/activity-logs'],
    refetchInterval: 5000 // Refresh logs every 5 seconds
  });
  
  // Update connection logs when activity logs change
  useEffect(() => {
    const connectionActivities = activityLogs
      .filter((log: any) => log.type === 'connection')
      .map((log: any) => {
        const timestamp = new Date(log.timestamp).toLocaleTimeString();
        return `[${timestamp}] ${log.message}`;
      });
    
    setConnectionLogs(connectionActivities);
  }, [activityLogs]);
  
  // Handle form submission
  const onSubmit = (values: ConnectionFormValues) => {
    createConnectionMutation.mutate(values);
  };
  
  // Handle connect to server
  const handleConnect = async (connectionId: number) => {
    try {
      await connect(connectionId);
    } catch (error) {
      toast({
        title: "Erro de conexão",
        description: getCleanErrorMessage(error, "Não foi possível conectar ao servidor"),
        variant: "destructive"
      });
    }
  };
  
  // Handle disconnect from server
  const handleDisconnect = async () => {
    try {
      await disconnect();
    } catch (error) {
      toast({
        title: "Erro ao desconectar",
        description: getCleanErrorMessage(error, "Não foi possível desconectar do servidor"),
        variant: "destructive"
      });
    }
  };
  
  // Handle load connection settings
  const handleLoadConnection = (connection: any) => {
    // Log para debug dos valores
    console.log("Carregando conexão:", connection);
    
    // Primeiro atualiza o estado em memória
    const formValues = {
      name: connection.name,
      host: connection.host,
      port: connection.port,
      securityPolicy: connection.securityPolicy || "None",
      securityMode: connection.securityMode || "None",
      username: connection.username || "",
      password: connection.password || "",
    };
    
    // Reset do formulário com os valores
    form.reset(formValues);
    
    // Timeout para garantir que os selects serão atualizados
    setTimeout(() => {
      // Atualizando forçadamente para garantir que o valor será aplicado
      form.setValue("securityPolicy", formValues.securityPolicy);
      form.setValue("securityMode", formValues.securityMode);
    }, 50);
  };
  
  // Handle clear logs
  const handleClearLogs = () => {
    setConnectionLogs([]);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-neutral-900">Configuração de Conexão</h2>
      
      {/* Connection Form */}
      <Card>
        <CardContent className="p-5">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Conexão</FormLabel>
                      <FormControl>
                        <Input placeholder="Ex: Kepware Local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="host"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Host do Servidor</FormLabel>
                        <FormControl>
                          <Input placeholder="Ex: 192.168.1.100" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="port"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Porta</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Ex: 4840" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="securityPolicy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Política de Segurança</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione a política" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          <SelectItem value="Basic128Rsa15">Basic128Rsa15</SelectItem>
                          <SelectItem value="Basic256">Basic256</SelectItem>
                          <SelectItem value="Basic256Sha256">Basic256Sha256</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="securityMode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modo de Segurança</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o modo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          <SelectItem value="Sign">Sign</SelectItem>
                          <SelectItem value="SignAndEncrypt">SignAndEncrypt</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div>
                <h4 className="text-sm font-medium text-neutral-700 mb-2">Credenciais (opcional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Usuário</FormLabel>
                        <FormControl>
                          <Input placeholder="Usuário para autenticação" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Senha</FormLabel>
                        <FormControl>
                          <Input 
                            type="password" 
                            placeholder="Senha para autenticação" 
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              
              <div className="flex justify-end">
                <Button 
                  type="submit"
                  disabled={createConnectionMutation.isPending}
                >
                  <Plug className="mr-2 h-4 w-4" />
                  {createConnectionMutation.isPending ? 'Salvando...' : 'Salvar Conexão'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      {/* Connection Actions */}
      <Card className="bg-neutral-50">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <div className="flex-1 text-center sm:text-left mb-4 sm:mb-0">
              <h3 className="text-lg font-semibold mb-1">Status da Conexão</h3>
              <p className="text-neutral-600">
                {isConnected 
                  ? `Conectado a ${connectionEndpoint}` 
                  : 'Não conectado a nenhum servidor'}
              </p>
            </div>
            <div className="space-x-2">
              {isConnected ? (
                <Button 
                  variant="destructive" 
                  onClick={handleDisconnect}
                  disabled={connecting}
                >
                  Desconectar
                </Button>
              ) : (
                <Button
                  variant="default"
                  onClick={() => {
                    // Use first connection if available
                    if (connections.length > 0) {
                      handleConnect(connections[0].id);
                    } else {
                      toast({
                        title: "Nenhuma conexão configurada",
                        description: "Você precisa adicionar uma configuração de conexão antes de conectar ao servidor",
                        variant: "destructive"
                      });
                    }
                  }}
                  disabled={connecting || connections.length === 0}
                >
                  {connecting ? 'Conectando...' : 'Conectar ao Servidor'}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Connection Logs */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Logs de Conexão</CardTitle>
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleClearLogs}
          >
            Limpar
          </Button>
        </CardHeader>
        
        <CardContent>
          <div className="p-4 h-64 overflow-y-auto bg-neutral-50 font-mono text-sm">
            {connectionLogs.length === 0 ? (
              <div className="text-center text-neutral-500 py-4">
                Nenhum log de conexão disponível
              </div>
            ) : (
              connectionLogs.map((log, index) => {
                const isSuccess = log.includes("sucesso") || log.includes("Connected");
                const isError = log.includes("falhou") || log.includes("erro") || log.includes("Error");
                const isWarning = log.includes("alerta") || log.includes("Warning");
                
                let colorClass = "text-neutral-600";
                if (isSuccess) colorClass = "text-success-600";
                if (isWarning) colorClass = "text-warning-600";
                if (isError) colorClass = "text-error-600";
                
                return <div key={index} className={colorClass}>{log}</div>;
              })
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Saved Connections */}
      <Card>
        <CardHeader>
          <CardTitle>Conexões Salvas</CardTitle>
        </CardHeader>
        
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Host</TableHead>
                  <TableHead>Porta</TableHead>
                  <TableHead>Política</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {connections.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-4">
                      Nenhuma conexão configurada
                    </TableCell>
                  </TableRow>
                ) : (
                  connections.map((connection: any) => (
                    <TableRow key={connection.id}>
                      <TableCell className="font-medium">{connection.name}</TableCell>
                      <TableCell>{connection.host}</TableCell>
                      <TableCell>{connection.port}</TableCell>
                      <TableCell>{connection.securityPolicy}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleConnect(connection.id)}
                            disabled={isConnected}
                          >
                            <Plug className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleLoadConnection(connection)}
                            title="Restaurar configuração"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive/90"
                            onClick={() => setDeleteConnectionId(connection.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      
      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConnectionId} onOpenChange={() => setDeleteConnectionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso removerá permanentemente esta configuração de conexão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConnectionId) {
                  deleteConnectionMutation.mutate(deleteConnectionId);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteConnectionMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
