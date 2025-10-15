import { Link } from "wouter";
import { useNavigation } from "@/contexts/NavigationContext";
import { useOpcUa } from "@/contexts/OpcUaContext";
import { 
  Home, 
  Plug, 
  Rss, 
  Users, 
  History, 
  DropletIcon,
  X
} from "lucide-react";

export default function Sidebar() {
  const { isSidebarOpen, toggleSidebar, navigateTo, activeRoute } = useNavigation();
  const { isConnected, lastUpdated } = useOpcUa();
  
  const navigationItems = [
    { route: "/", label: "Home", icon: <Home className="w-5 mr-3" /> },
    { route: "/connection", label: "Conexão", icon: <Plug className="w-5 mr-3" /> },
    { route: "/subscriptions", label: "Subscrições", icon: <Rss className="w-5 mr-3" /> },
    { route: "/people", label: "Pessoas", icon: <Users className="w-5 mr-3" /> },
    { route: "/history", label: "Histórico", icon: <History className="w-5 mr-3" /> },
  ];
  
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString();
  };

  return (
    <aside 
      className={`bg-sidebar fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out text-sidebar-foreground lg:translate-x-0 lg:static lg:inset-0 ${
        isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}
    >
      <div className="flex items-center justify-between h-16 px-4 border-b border-sidebar-border">
        <h1 className="text-xl font-semibold text-sidebar-foreground flex items-center">
          <DropletIcon className="mr-2 text-sidebar-foreground" />
          OPC-UÁgua
        </h1>
        <button 
          className="p-2 rounded-md lg:hidden focus:outline-none focus:ring-2 focus:ring-sidebar-ring"
          onClick={toggleSidebar}
        >
          <X className="text-sidebar-foreground" />
        </button>
      </div>
      
      <nav className="mt-4 px-2">
        <div className="space-y-1">
          {navigationItems.map((item) => (
            <a
              key={item.route}
              href={item.route}
              className={`flex items-center px-4 py-3 text-sm rounded-md font-medium ${
                activeRoute === item.route || 
                (item.route !== '/' && activeRoute.startsWith(item.route))
                  ? "bg-sidebar-accent text-sidebar-accent-foreground" 
                  : "text-sidebar-foreground hover:bg-sidebar-accent/30"
              }`}
              onClick={(e) => {
                e.preventDefault();
                navigateTo(item.route);
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </a>
          ))}
        </div>
      </nav>
      
      {/* Connection Status */}
      <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border">
        <div className="flex items-center">
          <div 
            className={`w-3 h-3 rounded-full mr-3 ${
              isConnected 
                ? "bg-green-400 pulse" 
                : "bg-red-500"
            }`} 
          />
          <span className="text-sm font-medium">
            {isConnected ? "Conectado" : "Desconectado"}
          </span>
        </div>
        <div className="text-xs mt-1 opacity-70">
          {lastUpdated 
            ? `Última atualização: ${formatTime(lastUpdated)}` 
            : "Aguardando dados..."}
        </div>
      </div>
    </aside>
  );
}
