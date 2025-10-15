import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Person } from "@/contexts/OpcUaContext";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useNavigation } from "@/contexts/NavigationContext";
import { getCleanErrorMessage } from "@/lib/errorUtils";
import { MapPin, Tag, Edit, Trash } from "lucide-react";
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
import { useState } from "react";
import { useOpcUa } from "@/contexts/OpcUaContext";

interface PersonCardProps {
  person: Person;
  onEdit: (person: Person) => void;
}

export default function PersonCard({ person, onEdit }: PersonCardProps) {
  const { navigateTo } = useNavigation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { isConnected } = useOpcUa();
  
  // Get person tags count - com atualização automática
  const { data: tags = [] } = useQuery({
    queryKey: [`/api/people/${person.id}/tags`],
    refetchInterval: 3000, // Atualiza a cada 3 segundos
    refetchOnWindowFocus: true, // Atualiza quando a janela recebe foco
    staleTime: 1000 // Considera os dados obsoletos após 1 segundo
  });
  
  // Calculate active tags - mostra 0 ativos quando desconectado
  const totalTags = tags.length;
  const activeTags = isConnected ? tags.filter((tag: any) => tag.isSubscribed).length : 0;
  const activeTagsPercent = totalTags > 0 ? (activeTags / totalTags) * 100 : 0;
  
  // Delete person mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', `/api/people/${person.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/people'] });
      toast({
        title: "Pessoa excluída",
        description: `${person.name} foi excluído com sucesso`
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao excluir pessoa",
        description: getCleanErrorMessage(error, "Não foi possível excluir a pessoa"),
        variant: "destructive"
      });
    }
  });
  
  // Handle view details
  const handleViewDetails = () => {
    navigateTo(`/people/${person.id}`);
  };
  
  // Handle edit
  const handleEdit = () => {
    onEdit(person);
  };
  
  // Handle delete
  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };
  
  // Confirm delete
  const confirmDelete = () => {
    deleteMutation.mutate();
    setShowDeleteConfirm(false);
  };
  
  return (
    <>
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-neutral-900">{person.name}</h3>
            
            <div className="flex space-x-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-neutral-600 hover:text-primary-500 hover:bg-primary-50"
                onClick={handleEdit}
              >
                <Edit className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-neutral-600 hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
              >
                <Trash className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          <div className="mt-4 space-y-3">
            <div className="flex items-center text-sm">
              <MapPin className="w-5 text-neutral-500" />
              <span className="ml-2 text-neutral-700">
                {person.location || 'Localização não definida'}
              </span>
            </div>
            
            <div className="flex items-center text-sm">
              <Tag className="w-5 text-neutral-500" />
              <span className="ml-2 text-neutral-700">
                {totalTags} sensores conectados
              </span>
            </div>
          </div>
          
          <div className="mt-5">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-neutral-700">Sensores ativos:</span>
              <span className={`px-2 py-1 rounded-full ${getStatusClass(activeTagsPercent)}`}>
                {activeTags}/{totalTags}
              </span>
            </div>
            
            <div className="w-full bg-neutral-200 rounded-full h-1.5 mt-2">
              <div 
                className={`h-1.5 rounded-full ${getProgressClass(activeTagsPercent)}`} 
                style={{ width: `${activeTagsPercent}%` }}
              ></div>
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="p-4 border-t border-neutral-200 bg-neutral-50">
          <Button 
            variant="default" 
            className="w-full"
            onClick={handleViewDetails}
          >
            Ver Detalhes
          </Button>
        </CardFooter>
      </Card>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Isso removerá permanentemente <strong>{person.name}</strong> e 
              desassociará todos os sensores vinculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction 
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// Helper functions for status styling
function getStatusClass(percent: number): string {
  if (percent >= 80) return "bg-success-100 text-success-800";
  if (percent >= 40) return "bg-warning-100 text-warning-800";
  return "bg-error-100 text-error-800";
}

function getProgressClass(percent: number): string {
  if (percent >= 80) return "bg-success-500";
  if (percent >= 40) return "bg-warning-500";
  return "bg-error-500";
}
