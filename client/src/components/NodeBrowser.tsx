import { useState, useEffect } from "react";
import { useOpcUa, OpcUaNode } from "@/contexts/OpcUaContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Server, 
  Map, 
  Cpu, 
  Tag, 
  Plus, 
  RefreshCw 
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getCleanErrorMessage } from "@/lib/errorUtils";

interface NodeBrowserProps {
  onNodeSelect?: (node: OpcUaNode) => void;
}

export default function NodeBrowser({ onNodeSelect }: NodeBrowserProps) {
  const { isConnected, browseNodes, nodesBeingBrowsed } = useOpcUa();
  const [rootNodes, setRootNodes] = useState<OpcUaNode[]>([]);
  const [expandedNodes, setExpandedNodes] = useState<Record<string, OpcUaNode[]>>({});
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});
  const [filter, setFilter] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Load root nodes on initial render if connected
  useEffect(() => {
    if (isConnected) {
      loadRootNodes();
    }
  }, [isConnected]);

  // Força uma atualização após mudança de seção/aba
  useEffect(() => {
    // Este efeito força uma renderização quando o componente é montado ou torna-se visível
    if (isConnected && rootNodes.length === 0) {
      loadRootNodes();
    }
  }, []); 

  // Função para carregar os nós raiz
  const loadRootNodes = async () => {
    if (isConnected) {
      try {
        console.log("Loading root nodes...");
        setRootNodes([]); // Limpar nós atuais para indicar carregamento
        const nodes = await browseNodes("RootFolder");
        console.log("Root nodes loaded:", nodes);
        
        // Filtrar os nós FolderType (ns=0;i=61)
        const filteredNodes = nodes.filter(node => node.nodeId !== "ns=0;i=61");
        
        // Ordenar nós: primeiro por isFolder (pastas primeiro), depois alfabeticamente
        // com nodes começando com "_" por último
        const sortedNodes = [...filteredNodes].sort((a, b) => {
          // Se ambos são pastas ou ambos não são pastas, ordenar por nome
          // com os nomes que começam com "_" vindo por último
          const aStartsWithUnderscore = a.displayName.startsWith('_');
          const bStartsWithUnderscore = b.displayName.startsWith('_');
          
          if (aStartsWithUnderscore && !bStartsWithUnderscore) return 1; // a vai depois
          if (!aStartsWithUnderscore && bStartsWithUnderscore) return -1; // a vai antes
          
          // Ambos começam ou não começam com "_", ordenar alfabeticamente
          return a.displayName.localeCompare(b.displayName);
        });
        
        setRootNodes(sortedNodes);
        setExpandedStates(prev => ({ ...prev, "RootFolder": true }));
      } catch (error) {
        console.error("Error loading root nodes:", error);
      }
    }
  };

  // Handle node expansion/collapse
  const handleToggleNode = async (nodeId: string, forceRefresh = false) => {
    console.log(`Toggle node ${nodeId}, forceRefresh: ${forceRefresh}`);
    
    if (expandedStates[nodeId] && !forceRefresh) {
      // Collapse the node
      setExpandedStates(prev => ({ ...prev, [nodeId]: false }));
      return;
    }
    
    // Se o nó não está sendo processado, inicie o carregamento
    if (!nodesBeingBrowsed[nodeId]) {
      try {
        // Imediatamente ativar o estado de expansão para mostrar o loading spinner
        setExpandedStates(prev => ({ ...prev, [nodeId]: true }));
        
        console.log(`Requesting browse for ${nodeId}`);
        const childNodes = await browseNodes(nodeId);
        console.log(`Browse result for ${nodeId}:`, childNodes.length, "nodes");
        
        // Filtrar os nós FolderType (ns=0;i=61)
        const filteredNodes = childNodes.filter(node => node.nodeId !== "ns=0;i=61");
        
        // Ordenar nós como fizemos com os nós raiz
        const sortedNodes = [...filteredNodes].sort((a, b) => {
          // Se ambos são pastas ou ambos não são pastas, ordenar por nome
          // com os nomes que começam com "_" vindo por último
          const aStartsWithUnderscore = a.displayName.startsWith('_');
          const bStartsWithUnderscore = b.displayName.startsWith('_');
          
          if (aStartsWithUnderscore && !bStartsWithUnderscore) return 1; // a vai depois
          if (!aStartsWithUnderscore && bStartsWithUnderscore) return -1; // a vai antes
          
          // Ambos começam ou não começam com "_", ordenar alfabeticamente
          return a.displayName.localeCompare(b.displayName);
        });
        
        // Atualizar o estado com os nós obtidos
        if (nodeId === "RootFolder") {
          setRootNodes(sortedNodes);
          console.log("Root nodes updated in state");
        } else {
          // Importante: Usamos uma função para garantir que temos o estado mais recente
          setExpandedNodes(prev => {
            const newState = { ...prev, [nodeId]: sortedNodes };
            console.log(`Expanded nodes for ${nodeId} updated in state:`, sortedNodes.length, "nodes");
            return newState;
          });
        }
        
        // Forçar uma atualização adicional (pode ajudar em casos de estado persistente)
        setTimeout(() => {
          setExpandedStates(prev => ({ ...prev }));
        }, 50);
        
      } catch (error) {
        console.error(`Error browsing node ${nodeId}:`, error);
        // Em caso de erro, resetar o estado para não expandido
        setExpandedStates(prev => ({ ...prev, [nodeId]: false }));
        toast({
          title: "Erro na navegação",
          description: getCleanErrorMessage(error, "Não foi possível navegar pelos nós OPC UA"),
          variant: "destructive"
        });
      }
    } else {
      console.log(`Node ${nodeId} is already being browsed, waiting...`);
    }
  };
  
  // Add tag mutation
  const addTagMutation = useMutation({
    mutationFn: async (node: OpcUaNode) => {
      const response = await apiRequest("POST", "/api/tags", {
        nodeId: node.nodeId,
        browseName: node.browseName,
        displayName: node.displayName,
        description: node.description || '',
        dataType: node.dataType || 'Unknown'
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tags'] });
      toast({
        title: "Tag adicionada",
        description: "Tag adicionada com sucesso para monitoramento"
      });
    },
    onError: (error) => {
      toast({
        title: "Erro ao adicionar sensor",
        description: getCleanErrorMessage(error, "Não foi possível adicionar o sensor"),
        variant: "destructive"
      });
    }
  });
  
  // Handle node selection
  const handleSelectNode = (node: OpcUaNode) => {
    if (onNodeSelect) {
      onNodeSelect(node);
    }
  };
  
  // Handle adding a node to subscriptions
  const handleAddNode = (node: OpcUaNode) => {
    // Only allow non-folder nodes to be added
    if (!node.isFolder) {
      addTagMutation.mutate(node);
    }
  };
  
  // Get the appropriate icon for a node
  const getNodeIcon = (node: OpcUaNode) => {
    // De acordo com OPC UA, NodeClass: Object=1, Variable=2, Method=4
    if (node.nodeClass === "1") return <Map className="mr-2 h-4 w-4 text-accent-500" />;
    if (node.nodeClass === "2") return <Tag className="mr-2 h-4 w-4 text-success-500" />;
    if (node.nodeClass === "4") return <Cpu className="mr-2 h-4 w-4 text-warning-500" />;
    return <Server className="mr-2 h-4 w-4 text-primary-500" />;
  };

  // Recursive function to render nodes
  const renderNode = (node: OpcUaNode, level: number = 0) => {
    // Apply filter if set
    if (filter && !node.displayName.toLowerCase().includes(filter.toLowerCase())) {
      return null;
    }
    
    const isExpanded = expandedStates[node.nodeId] || false;
    const isLoading = nodesBeingBrowsed[node.nodeId] || false;
    const childNodes = expandedNodes[node.nodeId] || [];
    
    // Debug para ajudar a identificar problemas - comentado para evitar spam no console
    // if (level === 0) {
    //   console.log(`Rendering node: ${node.displayName} (${node.nodeId}), expanded: ${isExpanded}, loading: ${isLoading}, children: ${childNodes.length}`);
    // }
    
    return (
      <li key={node.nodeId}>
        <div 
          className={`flex items-center justify-between text-neutral-800 hover:bg-neutral-100 rounded-md p-2 cursor-pointer ${isExpanded ? 'bg-neutral-50' : ''}`}
          onClick={() => handleSelectNode(node)}
        >
          <div className="flex items-center">
            {node.isFolder ? (
              <button 
                className="mr-2 text-xs text-neutral-500 focus:outline-none" 
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleNode(node.nodeId);
                }}
              >
                {isLoading ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-primary-500" />
                ) : isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </button>
            ) : (
              <span className="w-4 mr-2"></span>
            )}
            
            {getNodeIcon(node)}
            <span className="truncate">{node.displayName}</span>
            
            {!node.isFolder && (
              <button 
                className="ml-2 p-1 text-xs bg-primary-100 hover:bg-primary-200 text-primary-700 rounded"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddNode(node);
                }}
              >
                <Plus className="h-3 w-3" />
              </button>
            )}
            
            {node.nodeId && (
              <span className="ml-2 text-xs text-neutral-400 hidden md:inline">
                ({node.nodeId})
              </span>
            )}
          </div>
        </div>
        
        {isExpanded && (
          <div>
            {isLoading && childNodes.length === 0 ? (
              <div className="ml-6 mt-2 flex items-center text-sm text-neutral-500">
                <RefreshCw className="h-3 w-3 animate-spin mr-2" />
                <span>Carregando...</span>
              </div>
            ) : childNodes.length > 0 ? (
              <ul className="ml-6 mt-1 space-y-1">
                {childNodes.map(childNode => renderNode(childNode, level + 1))}
              </ul>
            ) : isExpanded && !isLoading ? (
              <div className="ml-6 mt-2 text-sm text-neutral-500">
                Sem nós filhos
              </div>
            ) : null}
          </div>
        )}
      </li>
    );
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle>Navegador de Nós</CardTitle>
      </CardHeader>
      
      <CardContent>
        <div className="mb-4 space-y-2">
          <div className="flex justify-end">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                setRefreshing(true);
                loadRootNodes().finally(() => setRefreshing(false));
              }}
              disabled={!isConnected || refreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </div>
          <div className="relative">
            <Input 
              placeholder="Filtrar nós..." 
              className="pl-10"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <div className="absolute left-3 top-2.5 text-neutral-400">
              <Search className="h-4 w-4" />
            </div>
          </div>
        </div>
        
        <div className="h-96 overflow-y-auto border border-neutral-200 rounded-md p-2 bg-white">
          {!isConnected ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500">
              <Server className="h-10 w-10 mb-2 opacity-50" />
              <p className="text-sm">Conecte-se a um servidor OPC UA para explorar os nós</p>
            </div>
          ) : rootNodes.length === 0 ? (
            <div className="flex items-center justify-center h-full text-neutral-500">
              <span className={nodesBeingBrowsed['RootFolder'] ? "animate-pulse" : ""}>
                {nodesBeingBrowsed['RootFolder'] ? "Carregando..." : "Nenhum nó encontrado"}
              </span>
            </div>
          ) : (
            <ul className="space-y-1 text-sm">
              {rootNodes.map(node => renderNode(node))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
