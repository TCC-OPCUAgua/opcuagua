import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCleanErrorMessage } from "@/lib/errorUtils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { z } from "zod";

interface AddTagModalProps {
  open: boolean;
  onClose: () => void;
  personId?: number;
}

const addTagSchema = z.object({
  tagId: z.string().min(1, "Selecione uma tag"),
  description: z.string().optional(),
});

type AddTagFormValues = z.infer<typeof addTagSchema>;

export default function AddTagModal({ open, onClose, personId }: AddTagModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch all tags
  const { data: allTags = [] } = useQuery({
    queryKey: ['/api/tags'],
    enabled: open
  });
  
  // Get person tags to filter out already assigned ones
  const { data: personTags = [] } = useQuery({
    queryKey: [`/api/people/${personId}/tags`],
    enabled: !!personId && open
  });
  
  // Create a filtered list of tags that aren't already assigned to the person
  const availableTags = allTags.filter((tag: any) => 
    !tag.personId || (personId && tag.personId !== personId)
  );
  
  const form = useForm<AddTagFormValues>({
    resolver: zodResolver(addTagSchema),
    defaultValues: {
      tagId: "",
      description: "",
    },
  });
  
  // Reset form when modal opens/closes
  useEffect(() => {
    if (open) {
      form.reset({
        tagId: "",
        description: "",
      });
    }
  }, [open, form]);
  
  // Assign tag to person mutation
  const assignTagMutation = useMutation({
    mutationFn: async (values: AddTagFormValues) => {
      if (!personId) return;
      
      const tagId = Number(values.tagId);
      const response = await apiRequest('POST', `/api/tags/${tagId}/assign-person/${personId}`);
      
      // If there's a description, update the tag
      if (values.description) {
        await apiRequest('PUT', `/api/tags/${tagId}`, { description: values.description });
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/people/${personId}/tags`] });
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      toast({
        title: "Tag adicionada",
        description: "Tag associada à pessoa com sucesso"
      });
      onClose();
    },
    onError: (error) => {
      toast({
        title: "Erro ao associar sensor",
        description: getCleanErrorMessage(error, "Não foi possível associar o sensor à pessoa"),
        variant: "destructive"
      });
    }
  });
  
  const onSubmit = (values: AddTagFormValues) => {
    assignTagMutation.mutate(values);
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Adicionar Tag Existente</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="tagId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Selecione uma Tag</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableTags.length === 0 ? (
                        <SelectItem value="no-tags" disabled>
                          Nenhuma tag disponível
                        </SelectItem>
                      ) : (
                        availableTags.map((tag: any) => (
                          <SelectItem key={tag.id} value={tag.id.toString()}>
                            {tag.displayName}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição (opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Caixa d'água principal" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={assignTagMutation.isPending || availableTags.length === 0}
              >
                {assignTagMutation.isPending ? 'Adicionando...' : 'Adicionar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
