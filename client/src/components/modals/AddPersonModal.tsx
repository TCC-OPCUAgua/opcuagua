import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

interface AddPersonModalProps {
  open: boolean;
  onClose: () => void;
  editPerson?: any;
}

const personSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório"),
  location: z.string().optional(),
  latitude: z.string().optional().refine((val) => !val || !isNaN(Number(val)), {
    message: "Latitude deve ser um número válido",
  }),
  longitude: z.string().optional().refine((val) => !val || !isNaN(Number(val)), {
    message: "Longitude deve ser um número válido",
  }),
});

type PersonFormValues = z.infer<typeof personSchema>;

export default function AddPersonModal({ open, onClose, editPerson }: AddPersonModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const defaultValues = editPerson ? {
    name: editPerson.name || "",
    location: editPerson.location || "",
    latitude: editPerson.latitude ? String(editPerson.latitude) : "",
    longitude: editPerson.longitude ? String(editPerson.longitude) : "",
  } : {
    name: "",
    location: "",
    latitude: "",
    longitude: "",
  };
  
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    defaultValues,
  });
  
  // Atualiza o formulário quando editPerson muda
  useEffect(() => {
    if (editPerson) {
      form.reset({
        name: editPerson.name || "",
        location: editPerson.location || "",
        latitude: editPerson.latitude ? String(editPerson.latitude) : "",
        longitude: editPerson.longitude ? String(editPerson.longitude) : "",
      });
    } else {
      form.reset({
        name: "",
        location: "",
        latitude: "",
        longitude: "",
      });
    }
  }, [editPerson, form]);
  
  // Create/update person mutation
  const personMutation = useMutation({
    mutationFn: async (values: PersonFormValues) => {
      const personData = {
        ...values,
        latitude: values.latitude ? Number(values.latitude) : undefined,
        longitude: values.longitude ? Number(values.longitude) : undefined,
      };
      
      if (editPerson) {
        const response = await apiRequest('PUT', `/api/people/${editPerson.id}`, personData);
        return response.json();
      } else {
        const response = await apiRequest('POST', '/api/people', personData);
        return response.json();
      }
    },
    onSuccess: () => {
      // Invalidar consultas relacionadas à pessoa
      queryClient.invalidateQueries({ queryKey: ['/api/people'] });
      
      // Invalidar a consulta específica dessa pessoa se estiver editando
      if (editPerson) {
        queryClient.invalidateQueries({ queryKey: [`/api/people/${editPerson.id}`] });
      }
      
      toast({
        title: editPerson ? "Pessoa atualizada" : "Pessoa criada",
        description: editPerson ? "Pessoa atualizada com sucesso" : "Pessoa criada com sucesso"
      });
      onClose();
      form.reset(defaultValues);
    },
    onError: (error) => {
      toast({
        title: "Erro ao salvar pessoa",
        description: getCleanErrorMessage(error, "Não foi possível salvar as informações da pessoa"),
        variant: "destructive"
      });
    }
  });
  
  const onSubmit = (values: PersonFormValues) => {
    personMutation.mutate(values);
  };
  
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {editPerson ? "Editar Pessoa" : "Adicionar Pessoa"}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: João Silva" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localização</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: São Paulo, SP - Brasil" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="latitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Latitude</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: -23.5505" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="longitude"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Longitude</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex: -46.6333" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                disabled={personMutation.isPending}
              >
                {personMutation.isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
