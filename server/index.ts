import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes, getOpcUaClient, getSubscriptionManager } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { Server } from "http";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

let isShuttingDown = false;
let httpServer: Server | null = null;

async function gracefulShutdown(signal?: string): Promise<void> {
  if (isShuttingDown) {
    console.log("Já está em processo de desligamento, ignorando sinal adicional");
    return;
  }
  
  isShuttingDown = true;
  console.log(`🛑 Iniciando graceful shutdown${signal ? ` (${signal})` : ''}...`);
  
  try {
    // 1. Primeiro, limpar as subscrições e desconectar o cliente OPC UA
    const subscriptionManager = getSubscriptionManager();
    if (subscriptionManager) {
      console.log(" • Limpando subscrições OPC UA...");
      try {
        subscriptionManager.clear();
        console.log(" ✅ Subscrições OPC UA limpas com sucesso");
      } catch (err) {
        console.error(" ❌ Erro ao limpar subscrições OPC UA:", err);
      }
    }

    const opcUaClient = getOpcUaClient();
    if (opcUaClient) {
      console.log(" • Desconectando cliente OPC UA...");
      try {
        await opcUaClient.disconnect();
        console.log(" ✅ Cliente OPC UA desconectado com sucesso");
      } catch (err) {
        console.error(" ❌ Erro ao desconectar cliente OPC UA:", err);
      }
    }
    
    // 2. Fechar o servidor HTTP
    if (httpServer) {
      console.log(" • Fechando servidor HTTP...");
      
      const forceExitTimeout = setTimeout(() => {
        console.warn(" ⏱ Timeout no encerramento do HTTP server, forçando saída");
        process.exit(1);
      }, 5000);
      
      httpServer.close(() => {
        clearTimeout(forceExitTimeout);
        console.log(" ✅ Servidor HTTP encerrado com sucesso");
        process.exit(0);
      });
    } else {
      console.log(" ℹ Nenhum servidor HTTP encontrado para encerrar");
      process.exit(0);
    }
  } catch (err) {
    console.error("‼ Erro durante shutdown:", err);
    process.exit(1);
  }
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'));  // Ctrl+C
process.once('SIGTERM', () => gracefulShutdown('SIGTERM')); // kill
process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2')); // nodemon restart

process.on('uncaughtException', (err) => {
  console.error('Exceção não tratada:', err);
  gracefulShutdown('exception');
});

process.on('unhandledRejection', (reason) => {
  console.error('Promessa rejeitada não tratada:', reason);
});

(async () => {
  try {
    httpServer = await registerRoutes(app);
    
    app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
  
      res.status(status).json({ message });
      throw err;
    });
  
    if (app.get("env") === "development") {
      await setupVite(app, httpServer);
    } else {
      serveStatic(app);
    }
  
    const port = 5000;
    httpServer.listen(
      {
        port,
        host: "0.0.0.0",
      },
      () => {
        log(`🚀 OPC-UÁgua server rodando na porta ${port}`);
      },
    );
    
    console.log("✅ Aplicação OPC-UÁgua inicializada com sucesso!");
  } catch (err) {
    console.error("❌ Falha ao iniciar aplicação:", err);
    process.exit(1);
  }
})();
