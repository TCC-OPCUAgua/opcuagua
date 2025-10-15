import { createContext, useContext, ReactNode, useState, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';

interface NavigationContextType {
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  activeRoute: string;
  navigateTo: (route: string) => void;
}

const NavigationContext = createContext<NavigationContextType | undefined>(undefined);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [location] = useLocation();
  const [activeRoute, setActiveRoute] = useState(location);
  const [, navigate] = useLocation();
  
  // Atualiza a rota ativa quando a localização mudar
  useEffect(() => {
    setActiveRoute(location);
  }, [location]);

  const toggleSidebar = useCallback(() => {
    setIsSidebarOpen(prev => !prev);
  }, []);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
  }, []);

  const navigateTo = useCallback((route: string) => {
    setActiveRoute(route);
    navigate(route);
    
    // On mobile, close the sidebar after navigation
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, [navigate]);

  return (
    <NavigationContext.Provider value={{
      isSidebarOpen,
      toggleSidebar,
      closeSidebar,
      activeRoute,
      navigateTo
    }}>
      {children}
    </NavigationContext.Provider>
  );
}

export function useNavigation() {
  const context = useContext(NavigationContext);
  if (context === undefined) {
    throw new Error('useNavigation must be used within a NavigationProvider');
  }
  return context;
}
