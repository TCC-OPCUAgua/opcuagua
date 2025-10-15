import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useOpcUa } from "@/contexts/OpcUaContext";
import { useNavigation } from "@/contexts/NavigationContext";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCleanErrorMessage } from "@/lib/errorUtils";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import NodeBrowser from "@/components/NodeBrowser";
import SubscriptionTable from "@/components/SubscriptionTable";
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
  FormDescription,
} from "@/components/ui/form";

// Define schema for subscription settings
const subscriptionSettingsSchema = z.object({
  publishingInterval: z.coerce.number().int().min(100, "Mínimo de 100ms").default(1000),
  samplingInterval: z.coerce.number().int().min(100, "Mínimo de 100ms").default(500),
  queueSize: z.coerce.number().int().min(1, "Mínimo de 1").default(10),
  isDefault: z.boolean().default(true),
});

type SubscriptionSettingsFormValues = z.infer<typeof subscriptionSettingsSchema>;

export default function Subscriptions() {
  const { isConnected } = useOpcUa();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { navigateTo } = useNavigation();
  const [selectedTagId, setSelectedTagId] = useState<number | null>(null);

  // Função para manipular a visualização de detalhes da tag
  const handleViewTagDetails = (tagId: number) => {
    setSelectedTagId(tagId);
    // Navegar para a página de detalhes da tag
    navigateTo(`/tags/${tagId}`);
  };

  // Get default subscription settings
  const { data: defaultSettings, isLoading: loadingSettings } = useQuery({
    queryKey: ['/api/subscription-settings/default'],
    onError: () => {
      // If no default settings exist, we'll create them later
    }
  });
  
  // Initialize form with default values or fetched settings
  const form = useForm<SubscriptionSettingsFormValues>({
    resolver: zodResolver(subscriptionSettingsSchema),
    defaultValues: defaultSettings ? {
      publishingInterval: defaultSettings.publishingInterval,
      samplingInterval: defaultSettings.samplingInterval,
      queueSize: defaultSettings.queueSize,
      isDefault: true
    } : {
      publishingInterval: 1000,
      samplingInterval: 500,
      queueSize: 10,
      isDefault: true
    },
  });
  
  // Update form values when default settings are loaded
  // Use useEffect instead of useState to respond to changes in defaultSettings
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  
  // Effect para atualizar os valores do formulário quando as configurações são carregadas
  useEffect(() => {
    if (defaultSettings && !settingsLoaded) {
      form.reset({
        publishingInterval: defaultSettings.publishingInterval,
        samplingInterval: defaultSettings.samplingInterval,
        queueSize: defaultSettings.queueSize,
        isDefault: true
      });
      setSettingsLoaded(true);
    }
  }, [defaultSettings, form, settingsLoaded]);
  
  // Save subscription settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (values: SubscriptionSettingsFormValues) => {
      if (defaultSettings) {
        // Update existing settings
        const response = await apiRequest('PUT', `/api/subscription-settings/${defaultSettings.id}`, values);
        return response.json();
      } else {
        // Create new settings
        const response = await apiRequest('POST', '/api/subscription-settings', values);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription-settings/default'] });
      toast({
        title: "Configurações salvas",
        description: "Configurações de subscrição atualizadas com sucesso"
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar configurações",
        description: getCleanErrorMessage(error, "Não foi possível salvar as configurações de subscrição"),
        variant: "destructive"
      });
    }
  });
  
  // Handle form submission
  const onSubmit = (values: SubscriptionSettingsFormValues) => {
    saveSettingsMutation.mutate(values);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold text-neutral-900">Gerenciamento de Subscrições</h2>
      
      {/* Node Browser and Subscriptions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Node Browser */}
        <div className="lg:col-span-1">
          <NodeBrowser />
        </div>
        
        {/* Active Subscriptions */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Subscrições Ativas</CardTitle>
            </CardHeader>
            <CardContent>
              <SubscriptionTable onViewTagDetails={handleViewTagDetails} />
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Subscription Settings */}
      <Card>
        <CardHeader>
          <CardTitle>Configurações de Subscrição</CardTitle>
        </CardHeader>
        
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="publishingInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intervalo de Publicação (ms)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          min={100}
                        />
                      </FormControl>
                      <FormDescription>
                        Frequência com que o servidor enviará atualizações
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="samplingInterval"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Intervalo de Amostragem (ms)</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          min={100}
                        />
                      </FormControl>
                      <FormDescription>
                        Frequência com que o servidor verificará mudanças
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="queueSize"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tamanho da Fila</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          {...field} 
                          min={1}
                        />
                      </FormControl>
                      <FormDescription>
                        Número máximo de notificações armazenadas em fila
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex justify-end">
                <Button 
                  type="submit"
                  disabled={saveSettingsMutation.isPending || !isConnected}
                >
                  {saveSettingsMutation.isPending ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
