import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Layout from "@/components/Layout";
import Dashboard from "@/pages/dashboard";
import Connection from "@/pages/connection";
import Subscriptions from "@/pages/subscriptions";
import People from "@/pages/people";
import PersonDetails from "@/pages/person-details";
import TagDetails from "@/pages/tag-details";
import History from "@/pages/history";
import NotFound from "@/pages/not-found";
import { NavigationProvider } from "@/contexts/NavigationContext";
import { OpcUaProvider } from "@/contexts/OpcUaContext";

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/connection" component={Connection} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/people" component={People} />
        <Route path="/people/:id" component={PersonDetails} />
        <Route path="/tags/:id" component={TagDetails} />
        <Route path="/history" component={History} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <NavigationProvider>
          <OpcUaProvider>
            <Toaster />
            <Router />
          </OpcUaProvider>
        </NavigationProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
