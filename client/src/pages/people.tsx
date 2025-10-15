import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";
import PersonCard from "@/components/PersonCard";
import AddPersonModal from "@/components/modals/AddPersonModal";

export default function People() {
  const [addPersonModalOpen, setAddPersonModalOpen] = useState(false);
  const [personToEdit, setPersonToEdit] = useState<any>(null);
  
  // Fetch people
  const { data: people = [], isLoading } = useQuery({
    queryKey: ['/api/people']
  });
  
  // Open add person modal
  const handleAddPerson = () => {
    setPersonToEdit(null);
    setAddPersonModalOpen(true);
  };
  
  // Open edit person modal
  const handleEditPerson = (person: any) => {
    setPersonToEdit(person);
    setAddPersonModalOpen(true);
  };
  
  // Close person modal
  const handleCloseModal = () => {
    setAddPersonModalOpen(false);
    setPersonToEdit(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold text-neutral-900">Gerenciamento de Pessoas</h2>
        
        <Button
          onClick={handleAddPerson}
        >
          <UserPlus className="mr-2 h-4 w-4" /> Nova Pessoa
        </Button>
      </div>
      
      {/* People Cards */}
      {isLoading ? (
        <div className="grid place-items-center h-64">
          <p className="text-neutral-500">Carregando pessoas...</p>
        </div>
      ) : people.length === 0 ? (
        <div className="grid place-items-center h-64 bg-white rounded-lg shadow">
          <div className="text-center p-8">
            <UserPlus className="h-12 w-12 mx-auto text-neutral-400 mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 mb-1">Nenhuma pessoa cadastrada</h3>
            <p className="text-neutral-500 mb-4">Adicione pessoas para associar sensores a elas.</p>
            <Button onClick={handleAddPerson}>Adicionar Pessoa</Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {people.map((person: any) => (
            <PersonCard
              key={person.id}
              person={person}
              onEdit={handleEditPerson}
            />
          ))}
        </div>
      )}
      
      {/* Add/Edit Person Modal */}
      <AddPersonModal
        open={addPersonModalOpen}
        onClose={handleCloseModal}
        editPerson={personToEdit}
      />
    </div>
  );
}
