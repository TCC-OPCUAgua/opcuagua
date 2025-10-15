import { useNavigation } from "@/contexts/NavigationContext";
import { useOpcUa } from "@/contexts/OpcUaContext";
import { Bell, UserCircle, Menu, Wifi, WifiOff, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function Header() {
  const { toggleSidebar } = useNavigation();
  const { isConnected, isReconnecting, retryCount, connectionEndpoint } = useOpcUa();
  const [hasNotifications, setHasNotifications] = useState(false);
  
  // Simulates receiving a notification
  useEffect(() => {
    const timeout = setTimeout(() => {
      setHasNotifications(true);
    }, 5000);
    
    return () => clearTimeout(timeout);
  }, []);

  // Indicador de estado da conexão
  const ConnectionStatus = () => {
    let statusColor;
    let statusText;
    
    if (isConnected) {
      statusColor = "bg-green-600";
      statusText = `Conectado a ${connectionEndpoint || 'servidor'}`;
    } else if (isReconnecting) {
      statusColor = "bg-amber-500";
      statusText = `Reconectando (tentativa ${retryCount})...`;
    } else {
      statusColor = "bg-red-500";
      statusText = "Desconectado";
    }
    
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center mr-4">
              <div className={`h-3 w-3 rounded-full ${statusColor} ${isReconnecting ? 'animate-pulse' : ''}`}></div>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{statusText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <header className="bg-white shadow-sm h-16 flex items-center z-30">
      <div className="px-4 flex justify-between items-center w-full">
        <div className="flex items-center">
          <Button 
            variant="ghost"
            size="icon"
            className="lg:hidden mr-2"
            onClick={toggleSidebar}
          >
            <Menu className="h-6 w-6" />
          </Button>
          
          <ConnectionStatus />
        </div>
        
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5 text-neutral-600" />
            {hasNotifications && (
              <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary" />
            )}
          </Button>
          
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700">
              <UserCircle className="h-6 w-6" />
            </div>
            <span className="ml-2 text-sm font-medium text-neutral-700">Administrador</span>
          </div>
        </div>
      </div>
    </header>
  );
}
