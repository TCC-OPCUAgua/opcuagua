import { useState, useMemo, useEffect, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { MapPin } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useOpcUa } from "@/contexts/OpcUaContext";

// Importar os estilos do Leaflet (importante para os marcadores e outros elementos visuais)
import 'leaflet/dist/leaflet.css';

// Declaração de Módulo para React-Leaflet
// Isso ajuda o TypeScript a entender os componentes do React-Leaflet
declare module 'react-leaflet' {
  export interface MapContainerProps {
    center: [number, number];
    zoom: number;
    style?: React.CSSProperties;
    children: React.ReactNode;
  }
  
  export interface TileLayerProps {
    attribution: string;
    url: string;
  }
  
  export interface MarkerProps {
    position: [number, number];
    icon?: any;
  }
}

// Corrigir os ícones do Leaflet que são quebrados devido ao bundler
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Ícone personalizado para pessoas em estado crítico
const redIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Ícone cinza para quando o servidor está desconectado
const greyIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

// Componente para atualizar a visualização do mapa quando específicas condições mudam
// Este componente precisa ser definido dentro do escopo do react-leaflet
const MapViewAdjuster = ({ 
  center, 
  zoom, 
  selectedPersonId, 
  shouldFlyTo = true 
}: { 
  center: [number, number], 
  zoom: number,
  selectedPersonId: string,
  shouldFlyTo?: boolean
}) => {
  const map = useMap();
  const prevPersonIdRef = useRef<string>("all");
  
  // Inicialização do mapa (executado apenas uma vez na montagem)
  useEffect(() => {
    if (center && zoom && map) {
      map.setView(center, zoom);
    }
  }, []); // Array vazio de deps para executar apenas na montagem
  
  // Efeito que é executado apenas quando a pessoa selecionada muda
  useEffect(() => {
    // Verifica se realmente houve mudança na pessoa selecionada
    if (selectedPersonId !== prevPersonIdRef.current) {
      // Só ajusta a visualização quando uma pessoa específica for selecionada
      if (selectedPersonId !== "all" && shouldFlyTo && map) {
        // Usar flyTo para uma animação suave quando selecionar uma pessoa
        map.flyTo(center, 15, {
          duration: 1.5, // Duração da animação em segundos
          easeLinearity: 0.25
        });
      }
      // Atualiza a referência para a nova pessoa selecionada
      prevPersonIdRef.current = selectedPersonId;
    }
  }, [selectedPersonId, center, map, shouldFlyTo]);
  
  return null;
}

interface LocationMapProps {
  people: any[];
  title?: string;
  height?: string | number;
}

export default function LocationMap({ 
  people = [], 
  title = "Mapa de Localização", 
  height = "400px" 
}: LocationMapProps) {
  const [selectedPersonId, setSelectedPersonId] = useState<string>("all");
  const [showOnlyCritical, setShowOnlyCritical] = useState<boolean>(false);
  const mapRef = useRef<L.Map | null>(null);
  const { isConnected } = useOpcUa();
  
  // Filter people with valid coordinates and log their data for debug
  const peopleWithCoordinates = useMemo(() => {
    const filtered = people.filter(person => 
      person && 
      person.latitude && 
      person.longitude && 
      !isNaN(parseFloat(person.latitude)) && 
      !isNaN(parseFloat(person.longitude))
    );
    
    // Log people data para debug
    console.log("Pessoas com coordenadas:", filtered.map(p => ({
      id: p.id,
      name: p.name,
      latitude: p.latitude,
      longitude: p.longitude,
      criticalStatus: p.criticalStatus
    })));
    
    return filtered;
  }, [people]);

  // Filter people based on criteria
  const filteredPeople = useMemo(() => {
    // Garantir que as coordenadas são válidas (já foi verificado acima em peopleWithCoordinates)
    let filtered = [...peopleWithCoordinates];
    
    // Filter by selected person
    if (selectedPersonId !== "all") {
      filtered = filtered.filter(person => 
        person.id.toString() === selectedPersonId
      );
    } 
    // Filter by critical status if checkbox is checked
    else if (showOnlyCritical) {
      // Use todos os pins de pessoa em estado crítico
      filtered = filtered.filter(person => {
        // Verifica se o criticalStatus existe e é true
        return person.criticalStatus === true;
      });
    }
    
    console.log("Pessoas filtradas no mapa:", filtered.length, 
                "Modo crítico:", showOnlyCritical, 
                "PessoaID:", selectedPersonId);
    return filtered;
  }, [peopleWithCoordinates, selectedPersonId, showOnlyCritical]);
  
  // Calcular o centro do mapa e o zoom ideal com base nas pessoas filtradas
  const mapSettings = useMemo(() => {
    if (filteredPeople.length === 0) {
      // Centro padrão caso não haja pessoas filtradas
      return {
        center: [-14.86, -40.85] as [number, number], // Coordenadas para Vitória da Conquista - BA
        zoom: 13
      };
    }
    
    // Se tiver apenas uma pessoa, centraliza nela
    if (filteredPeople.length === 1) {
      const person = filteredPeople[0];
      return {
        center: [parseFloat(person.latitude), parseFloat(person.longitude)] as [number, number],
        zoom: 15
      };
    }
    
    // Cálculo de bounds para múltiplas pessoas
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    
    filteredPeople.forEach(person => {
      const lat = parseFloat(person.latitude);
      const lng = parseFloat(person.longitude);
      
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLng = Math.min(minLng, lng);
      maxLng = Math.max(maxLng, lng);
    });
    
    // Calcula o centro
    const centerLat = (minLat + maxLat) / 2;
    const centerLng = (minLng + maxLng) / 2;
    
    // Ajusta o zoom com base na distância entre os pontos
    const latDiff = Math.abs(maxLat - minLat);
    const lngDiff = Math.abs(maxLng - minLng);
    const maxDiff = Math.max(latDiff, lngDiff);
    
    // Ajusta zoom baseado na diferença máxima entre coordenadas
    let zoom = 15; // zoom padrão
    if (maxDiff > 0.05) zoom = 13;
    if (maxDiff > 0.1) zoom = 12;
    if (maxDiff > 0.5) zoom = 10;
    
    return {
      center: [centerLat, centerLng] as [number, number],
      zoom
    };
  }, [filteredPeople]);
  
  return (
    <Card>
      {/* Adicionar z-index alto para o cabeçalho ficar acima do mapa */}
      <CardHeader className="pb-3 relative z-40">
        <div className="flex justify-between items-center">
          <CardTitle>{title}</CardTitle>
          
          <div className="flex items-center gap-4">
            {/* Critical filter */}
            <div className="flex items-center space-x-2">
              <Checkbox 
                id="critical-only" 
                checked={showOnlyCritical}
                onCheckedChange={(checked) => setShowOnlyCritical(checked as boolean)}
                disabled={!isConnected || selectedPersonId !== "all"}
              />
              <Label 
                htmlFor="critical-only" 
                className={`text-sm cursor-pointer ${!isConnected || selectedPersonId !== "all" ? 'text-neutral-400' : ''}`}
              >
                Apenas nível crítico
              </Label>
            </div>
            
            {/* Person filter - usar z-index mais alto */}
            <div className="flex items-center space-x-2 relative z-50">
              <Select 
                value={selectedPersonId}
                onValueChange={setSelectedPersonId}
                disabled={peopleWithCoordinates.length === 0}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Selecione uma pessoa" />
                </SelectTrigger>
                {/* Usar z-index muito alto para garantir que o dropdown fique acima do mapa */}
                <SelectContent 
                  position="popper" 
                  className="z-[9999]"
                  sideOffset={5}
                  align="start"
                >
                  <SelectItem value="all">Todas as pessoas</SelectItem>
                  {peopleWithCoordinates.map(person => (
                    <SelectItem 
                      key={person.id} 
                      value={person.id.toString()}
                    >
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0" style={{ height }}>
        {peopleWithCoordinates.length === 0 ? (
          <div className="h-full grid place-items-center bg-neutral-50">
            <div className="text-center">
              <MapPin className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-500">Nenhuma pessoa com coordenadas cadastradas</p>
            </div>
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="h-full grid place-items-center bg-neutral-50">
            <div className="text-center">
              <MapPin className="h-12 w-12 mx-auto text-neutral-300 mb-4" />
              <p className="text-neutral-500">Nenhuma pessoa encontrada com os filtros selecionados</p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full rounded-b-lg overflow-hidden relative">
            {/* Legenda do Mapa */}
            <div className="absolute top-4 right-4 bg-white rounded-lg shadow-md p-3 z-[1] border border-neutral-200">
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
            
            {/* 
              Renderizamos o mapa somente no lado do cliente porque o React Leaflet 
              depende de APIs do navegador que não estão disponíveis durante a renderização no servidor
            */}
            {typeof window !== 'undefined' && (
              <MapContainer
                style={{ height: '100%', width: '100%', zIndex: 0 }}
                zoom={mapSettings.zoom}
                center={mapSettings.center}
                ref={mapRef}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                />
                
                {/* Componente para ajustar a visualização quando mudam os filtros */}
                <MapViewAdjuster 
                  center={mapSettings.center} 
                  zoom={mapSettings.zoom} 
                  selectedPersonId={selectedPersonId} 
                />
                
                {/* Marcadores para cada pessoa */}
                {filteredPeople.map(person => {
                  // Determina qual ícone usar baseado no status de conexão
                  let icon;
                  if (!isConnected) {
                    icon = greyIcon;
                  } else if (person.criticalStatus) {
                    icon = redIcon;
                  } else {
                    icon = new L.Icon.Default();
                  }
                  
                  return (
                    <Marker 
                      key={person.id}
                      position={[parseFloat(person.latitude), parseFloat(person.longitude)]}
                      icon={icon}
                    >
                      <Popup>
                        <div className="p-2">
                          <h3 className="font-bold text-lg mb-1">{person.name}</h3>
                          <p className="text-sm">Local: {person.location || 'Não informado'}</p>
                          <p className="text-sm">
                            Status: 
                            <span className={!isConnected ? 'text-neutral-500 ml-1' : person.criticalStatus ? 'text-red-600 font-semibold ml-1' : 'text-green-600 ml-1'}>
                              {!isConnected ? 'Desconectado' : person.criticalStatus ? 'Nível crítico' : 'Normal'}
                            </span>
                          </p>
                          <a 
                            href={`/people/${person.id}`}
                            className="text-blue-600 hover:underline text-sm inline-block mt-2"
                          >
                            Ver detalhes
                          </a>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
              </MapContainer>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}