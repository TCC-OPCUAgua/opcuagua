import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "wouter";
import { useNavigation } from "@/contexts/NavigationContext";
import { useOpcUa } from "@/contexts/OpcUaContext";
import { Button } from "@/components/ui/button";
import { 
  Card, 
  CardContent, 
  CardHeader, 
  CardTitle 
} from "@/components/ui/card";
import SubscriptionTable from "@/components/SubscriptionTable";
import WaterLevelChart from "@/components/WaterLevelChart";
import AddTagModal from "@/components/modals/AddTagModal";
import AddPersonModal from "@/components/modals/AddPersonModal";
import { ArrowLeft, Edit, Trash2, MapPin, Plus, Tag, Play, Pause } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getCleanErrorMessage } from "@/lib/errorUtils";
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Corrigir os ícones do Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Ícone personalizado vermelho para nível crítico
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Ícone cinza para servidor desconectado
const greyIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

export default function PersonDetails() {
  const { id } = useParams<{ id: string }>();
  const personId = Number(id);
  const { navigateTo } = useNavigation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isConnected } = useOpcUa();
  
  const [addTagModalOpen, setAddTagModalOpen] = useState(false);
  const [editPersonModalOpen, setEditPersonModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  
  // Get person details
  const { data: person, isLoading: loadingPerson, refetch: refetchPerson } = useQuery({
    queryKey: [`/api/people/${personId}`],
    enabled: !!personId,
    refetchOnWindowFocus: true,
    staleTime: 0 // Considerar os dados sempre obsoletos
  });
  
  // Get person's tags
  const { data: tags = [], isLoading: loadingTags, refetch: refetchTags } = useQuery({
    queryKey: [`/api/people/${personId}/tags`],
    enabled: !!personId,
    // Para garantir dados atualizados
    refetchOnWindowFocus: true,
    refetchInterval: 5000
  });
  
  // Buscar leituras recentes para verificar status crítico
  const activeTagIds = tags.filter((tag: any) => tag.isSubscribed).map((tag: any) => tag.id);
  const { data: latestReadings = [] } = useQuery({
    queryKey: ['/api/readings/latest', { tagIds: activeTagIds.join(',') }],
    enabled: activeTagIds.length > 0 && isConnected,
    refetchInterval: 3000
  });
  
  // Verificar se há alguma tag em nível crítico (< 25%)
  const hasCriticalLevel = latestReadings.some((reading: any) => {
    const value = typeof reading.value === 'number' ? reading.value : parseFloat(reading.value);
    return !isNaN(value) && value < 25;
  });
  
  // Delete person mutation
  const deletePersonMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/people/${personId}`);
    },
    onSuccess: () => {
      toast({
        title: "Pessoa excluída",
        description: `Pessoa excluída com sucesso`
      });
      navigateTo('/people');
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir pessoa",
        description: getCleanErrorMessage(error, "Não foi possível excluir a pessoa"),
        variant: "destructive"
      });
    }
  });
  
  // Handle edit person
  const handleEditPerson = () => {
    setEditPersonModalOpen(true);
  };
  
  // Função para atualizar dados após edição
  const handleCloseEditModal = () => {
    setEditPersonModalOpen(false);
    refetchPerson(); // Força a atualização dos dados da pessoa
  };
  
  // Handle delete person
  const handleDeletePerson = () => {
    setDeleteConfirmOpen(true);
  };
  
  // Handle add tag
  const handleAddTag = () => {
    setAddTagModalOpen(true);
  };
  
  // Handle confirm delete
  const handleConfirmDelete = () => {
    deletePersonMutation.mutate();
    setDeleteConfirmOpen(false);
  };
  
  // Handle tag details view
  const handleViewTagDetails = (tagId: number) => {
    // Navegar para a página de detalhes da tag
    navigateTo(`/tags/${tagId}`);
  };
  
  // Extract tag IDs for the chart - apenas tags ativas
  const tagIds = Array.isArray(tags)
    ? tags
        .filter((tag: any) => tag.isSubscribed) // Apenas tags com subscrição ativa
        .map((tag: any) => tag.id)
    : [];

  return (
    <div className="space-y-6">
      {/* Navigation and title */}
      <div className="flex items-center">
        <Button 
          variant="ghost" 
          size="icon" 
          className="mr-4"
          onClick={() => navigateTo('/people')}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-semibold text-neutral-900">
          {loadingPerson ? 'Carregando...' : person?.name}
        </h2>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Person Info */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Informações</CardTitle>
          </CardHeader>
          
          <CardContent className="space-y-4">
            {loadingPerson ? (
              <div className="h-64 grid place-items-center">
                <p className="text-neutral-500">Carregando informações...</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Nome</label>
                  <div className="text-neutral-900">{person?.name}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Localização</label>
                  <div className="text-neutral-900">{person?.location || 'Não definida'}</div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Coordenadas</label>
                  <div className="text-neutral-900">
                    {person?.latitude && person?.longitude 
                      ? `${person.latitude}, ${person.longitude}` 
                      : 'Não definidas'}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Sensores</label>
                  <div className="text-neutral-900">
                    {loadingTags 
                      ? 'Carregando...' 
                      : `${tags.length} sensores / ${isConnected ? tags.filter((t: any) => t.isSubscribed).length : 0} ativos`}
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-neutral-500 mb-1">Ações</label>
                  <div className="flex space-x-2 mt-2">
                    <Button 
                      className="flex-1" 
                      variant="outline"
                      onClick={handleEditPerson}
                    >
                      <Edit className="mr-1 h-4 w-4" /> Editar
                    </Button>
                    <Button 
                      className="flex-1" 
                      variant="destructive"
                      onClick={handleDeletePerson}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> Excluir
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
        
        {/* Map View */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Localização</CardTitle>
          </CardHeader>
          
          {loadingPerson ? (
            <CardContent className="h-[300px] grid place-items-center">
              <p className="text-neutral-500">Carregando mapa...</p>
            </CardContent>
          ) : !person?.latitude || !person?.longitude ? (
            <CardContent className="h-[300px] grid place-items-center">
              <div className="text-center">
                <MapPin className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
                <p className="text-neutral-500">Coordenadas não definidas</p>
              </div>
            </CardContent>
          ) : (
            <CardContent className="p-0 h-[300px]">
              <div className="w-full h-full bg-primary-50 rounded-b-lg overflow-hidden relative">
                {/* Legenda do Mapa */}
                <div className="absolute top-4 right-4 bg-white rounded-lg shadow-md p-3 z-[1000] border border-neutral-200">
                  <h4 className="text-xs font-semibold text-neutral-700 mb-2">Legenda</h4>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-neutral-400"></div>
                      <span className="text-xs text-neutral-600">Desconectado</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                      <span className="text-xs text-neutral-600">Nível normal</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className="text-xs text-neutral-600">Nível crítico</span>
                    </div>
                  </div>
                </div>
                
                {typeof window !== 'undefined' && (
                  <MapContainer
                    center={[parseFloat(person.latitude), parseFloat(person.longitude)]}
                    zoom={14}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <TileLayer
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    />
                    <Marker 
                      position={[parseFloat(person.latitude), parseFloat(person.longitude)]}
                      icon={!isConnected ? greyIcon : hasCriticalLevel ? redIcon : new L.Icon.Default()}
                    >
                      <Popup>
                        <div className="p-2">
                          <h3 className="font-bold text-lg mb-1">{person.name}</h3>
                          <p className="text-sm">Local: {person.location || 'Não informado'}</p>
                          <p className="text-sm">
                            Status: 
                            <span className={!isConnected ? 'text-neutral-500 ml-1' : hasCriticalLevel ? 'text-red-600 font-semibold ml-1' : 'text-green-600 ml-1'}>
                              {!isConnected ? 'Desconectado' : hasCriticalLevel ? 'Nível crítico' : 'Normal'}
                            </span>
                          </p>
                        </div>
                      </Popup>
                    </Marker>
                  </MapContainer>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      </div>
      
      {/* Person's Sensors */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle>Sensores Associados</CardTitle>
          
          <div className="flex gap-2">
            <Button 
              size="sm"
              variant="outline"
              className="bg-green-500 hover:bg-green-600 text-white border-green-500 hover:border-green-600"
              onClick={() => {
                tags.forEach((tag: any) => {
                  if (!tag.isSubscribed) {
                    apiRequest('POST', `/api/tags/${tag.id}/subscribe`)
                      .then(() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
                        queryClient.invalidateQueries({ queryKey: [`/api/people/${personId}/tags`] });
                      })
                      .catch(console.error);
                  }
                });
                toast({
                  title: "Sucesso",
                  description: "Iniciando todas as tags..."
                });
              }}
              disabled={!isConnected || tags.length === 0}
            >
              <Play className="mr-1 h-4 w-4" /> Iniciar Todas
            </Button>
            
            <Button 
              size="sm"
              variant="destructive"
              onClick={() => {
                tags.forEach((tag: any) => {
                  if (tag.isSubscribed) {
                    apiRequest('POST', `/api/tags/${tag.id}/unsubscribe`)
                      .then(() => {
                        queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
                        queryClient.invalidateQueries({ queryKey: [`/api/people/${personId}/tags`] });
                      })
                      .catch(console.error);
                  }
                });
                toast({
                  title: "Sucesso",
                  description: "Parando todas as tags..."
                });
              }}
              disabled={!isConnected || tags.length === 0}
            >
              <Pause className="mr-1 h-4 w-4" /> Parar Todas
            </Button>
            
            <Button 
              size="sm"
              variant="default"
              onClick={handleAddTag}
              disabled={!isConnected}
            >
              <Plus className="mr-1 h-4 w-4" /> Adicionar Sensor
            </Button>
          </div>
        </CardHeader>
        
        <CardContent>
          {loadingTags ? (
            <div className="h-32 grid place-items-center">
              <p className="text-neutral-500">Carregando sensores...</p>
            </div>
          ) : tags.length === 0 ? (
            <div className="h-32 grid place-items-center">
              <div className="text-center">
                <Tag className="h-8 w-8 mx-auto text-neutral-300 mb-2" />
                <p className="text-neutral-500">Nenhum sensor associado a esta pessoa</p>
              </div>
            </div>
          ) : (
            <SubscriptionTable 
              personId={personId} 
              onViewTagDetails={handleViewTagDetails}
              hideBulkActions={true}
            />
          )}
        </CardContent>
      </Card>
      
      {/* Real-time Chart for Person */}
      {tags.length > 0 && (
        <WaterLevelChart 
          tagIds={tagIds}
          personId={personId}
          title="Monitoramento em Tempo Real"
        />
      )}
      
      {/* Add Tag Modal */}
      <AddTagModal 
        open={addTagModalOpen} 
        onClose={() => setAddTagModalOpen(false)}
        personId={personId}
      />
      
      {/* Edit Person Modal */}
      <AddPersonModal
        open={editPersonModalOpen}
        onClose={handleCloseEditModal}
        editPerson={person}
      />
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso removerá permanentemente <strong>{person?.name}</strong> e 
              desassociará todos os sensores vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePersonMutation.isPending ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
