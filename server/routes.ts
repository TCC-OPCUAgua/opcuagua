import type { Express, Request, Response } from "express";
import { createServer, type Server } from "http";
import { storage, ReadingWithTag } from "./storage";
import { WebSocketServer, WebSocket } from "ws";
import { z, ZodError } from "zod";
import { fromZodError } from "zod-validation-error";
import { OpcUaClient } from "./opcua/client";
import { SubscriptionManager } from "./opcua/subscription";

let globalOpcUaClient: OpcUaClient | null = null;
let globalSubscriptionManager: SubscriptionManager | null = null;

// Funções para expor as instâncias globalmente
export function getOpcUaClient(): OpcUaClient | null {
  return globalOpcUaClient;
}

export function getSubscriptionManager(): SubscriptionManager | null {
  return globalSubscriptionManager;
}

// Define validation schemas
const connectionSchema = z.object({
  name: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().positive(),
  securityPolicy: z.string().nullable().optional(),
  securityMode: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  password: z.string().nullable().optional(),
  isActive: z.boolean().default(false),
});

const personSchema = z.object({
  name: z.string().min(1),
  location: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
});

const tagSchema = z.object({
  browseName: z.string().min(1),
  displayName: z.string().min(1),
  nodeId: z.string().min(1),
  description: z.string().nullable().optional(),
  dataType: z.string().nullable().optional(),
  personId: z.number().int().positive().nullable().optional(),
  isSubscribed: z.boolean().default(false),
});

const subscriptionSettingsSchema = z.object({
  publishingInterval: z.number().int().positive(),
  samplingInterval: z.number().int().positive(),
  queueSize: z.number().int().positive(),
  isDefault: z.boolean().optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ 
    server: httpServer, 
    path: '/ws',
    clientTracking: true,
  });

  const clients = new Set<WebSocket>();

  let opcUaClient: OpcUaClient | null = null;
  let subscriptionManager: SubscriptionManager | null = null;

  function heartbeat(this: WebSocket) {
    // @ts-ignore - Adicionamos uma propriedade não-padrão
    this.isAlive = true;
  }

  const pingInterval = setInterval(() => {
    wss.clients.forEach((client: WebSocket) => {
      // @ts-ignore
      if (!client.isAlive) {
        console.log('[WSS] encerrando conexão inativa');
        return client.terminate();
      }
      // @ts-ignore
      client.isAlive = false;
      // envia ping de aplicação
      client.send(JSON.stringify({ type: 'ping' }));
    });
  }, 30_000);

  wss.on('close', () => clearInterval(pingInterval));

  wss.on('connection', (ws) => {
    console.log("Nova conexão WebSocket estabelecida");
    clients.add(ws);

    // @ts-ignore
    ws.isAlive = true;

    ws.on('pong', heartbeat);

    ws.on('message', async (message) => {
      try {
        let parsed: any;
        try { parsed = JSON.parse(message.toString()); }
        catch { return; }

        if (parsed.type === 'pong') {
          // @ts-ignore
          ws.isAlive = true;
          return;
        }
        // Browse nodes
        else if (parsed.type === 'browse') {
          if (opcUaClient?.isConnected()) {
            console.log(`WebSocket request to browse nodeId: ${parsed.nodeId}`);
            try {
              console.log(`Calling browse() for nodeId: ${parsed.nodeId}`);
              const nodes = await opcUaClient.browse(parsed.nodeId);
              console.log(`Browse results for ${parsed.nodeId}: ${nodes.length} nodes found`);

              // Debug first few nodes
              if (nodes.length > 0) {
                console.log(`First node example:`, JSON.stringify(nodes[0]));
              }

              ws.send(JSON.stringify({ 
                type: 'browse_result', 
                nodeId: parsed.nodeId,
                requestId: parsed.requestId || `browse_${parsed.nodeId}`,
                nodes 
              }));
              console.log(`Sent browse results to client for ${parsed.nodeId}`);
            } catch (error) {
              console.error(`Error browsing node ${parsed.nodeId}:`, error);
              ws.send(JSON.stringify({ 
                type: 'error',
                requestId: parsed.requestId || `browse_${parsed.nodeId}`, 
                message: `Error browsing node: ${error.message || 'Unknown error'}`
              }));
            }
          } else {
            console.warn('Browse request received but OPC UA client is not connected');
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'OPC UA client not connected. Please connect to a server first.' 
            }));
          }
        } 
        else if (parsed.type === 'browseNext') {
          if (opcUaClient?.isConnected() && parsed.continuationPoint) {
            try {
              // Decode the base64 continuation point to a buffer
              const continuationBuffer = Buffer.from(parsed.continuationPoint, 'base64');
              const nodes = await opcUaClient.browseNext(continuationBuffer);
              ws.send(JSON.stringify({ 
                type: 'browse_next_result', 
                nodes 
              }));
            } catch (error) {
              console.error('Error in browseNext:', error);
              ws.send(JSON.stringify({ 
                type: 'error', 
                message: `Error in browseNext: ${error.message || 'Unknown error'}`
              }));
            }
          } else {
            ws.send(JSON.stringify({ 
              type: 'error', 
              message: 'Cannot browseNext: Client not connected or missing continuation point' 
            }));
          }
        }
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
        ws.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    ws.on('close', (code, reason) => {
      clients.delete(ws);
      console.log(`[WSS] Cliente desconectado (${code})`, reason.toString());
    });
    ws.on('error', (err) => {
      console.error('[WSS] Erro no socket:', err);
    });

    // Send initial connection status
    if (opcUaClient) {
      ws.send(JSON.stringify({ 
        type: 'connection_status', 
        connected: opcUaClient.isConnected(),
        endpoint: opcUaClient.getEndpoint()
      }));
    } else {
      ws.send(JSON.stringify({ 
        type: 'connection_status', 
        connected: false 
      }));
    }
  });

  // Broadcast function to send data to all connected clients
  const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  };

  // Batch value changes to reduce WebSocket traffic
  let valueChangeBatch: Array<{nodeId: string, value: any, dataType: string, timestamp: Date}> = [];
  let batchTimeout: NodeJS.Timeout | null = null;
  
  const sendBatchedValueChanges = () => {
    if (valueChangeBatch.length > 0) {
      broadcast({
        type: 'value_changes_batch',
        changes: valueChangeBatch
      });
      valueChangeBatch = [];
    }
    batchTimeout = null;
  };
  
  // Setup subscription value change handler
  const handleValueChange = (nodeId: string, value: any, dataType: string, timestamp: Date) => {
    valueChangeBatch.push({ nodeId, value, dataType, timestamp });
    
    // If this is the first item in the batch, schedule a broadcast
    if (batchTimeout === null) {
      batchTimeout = setTimeout(sendBatchedValueChanges, 50);
    }
  };

  // Error handling middleware
  const asyncHandler = (fn: Function) => (req: Request, res: Response) => {
    Promise.resolve(fn(req, res)).catch((err) => {
      console.error('API Error:', err);

      if (err instanceof ZodError) {
        const validationError = fromZodError(err);
        res.status(400).json({ 
          message: 'Validation error', 
          errors: validationError.details
        });
        return;
      }

      res.status(500).json({ message: err.message || 'Internal server error' });
    });
  };

  app.get('/api/connections', asyncHandler(async (req, res) => {
    const connections = await storage.getConnections();
    res.json(connections);
  }));

  app.get('/api/connections/:id', asyncHandler(async (req, res) => {
    const connection = await storage.getConnection(Number(req.params.id));
    if (!connection) {
      res.status(404).json({ message: 'Connection not found' });
      return;
    }
    res.json(connection);
  }));

  app.post('/api/connections', asyncHandler(async (req, res) => {
    const connectionData = connectionSchema.parse(req.body);
    const connection = await storage.createConnection(connectionData);

    await storage.createActivityLog({
      type: 'connection',
      message: `Connection "${connection.name}" created`,
      data: { connectionId: connection.id }
    });

    res.status(201).json(connection);
  }));

  app.put('/api/connections/:id', asyncHandler(async (req, res) => {
    const connectionData = connectionSchema.partial().parse(req.body);
    const connection = await storage.updateConnection(Number(req.params.id), connectionData);

    if (!connection) {
      res.status(404).json({ message: 'Connection not found' });
      return;
    }

    await storage.createActivityLog({
      type: 'connection',
      message: `Connection "${connection.name}" updated`,
      data: { connectionId: connection.id }
    });

    res.json(connection);
  }));

  app.delete('/api/connections/:id', asyncHandler(async (req, res) => {
    const success = await storage.deleteConnection(Number(req.params.id));

    if (!success) {
      res.status(404).json({ message: 'Connection not found' });
      return;
    }

    await storage.createActivityLog({
      type: 'connection',
      message: `Connection deleted`,
      data: { connectionId: Number(req.params.id) }
    });

    res.status(204).send();
  }));

  app.post('/api/connections/:id/connect', asyncHandler(async (req, res) => {
    const connectionId = Number(req.params.id);
    const connection = await storage.getConnection(connectionId);

    if (!connection) {
      res.status(404).json({ message: 'Connection not found' });
      return;
    }

    try {
      if (opcUaClient) {
        await opcUaClient.disconnect();
        opcUaClient = null;
      }
      opcUaClient = new OpcUaClient();

      globalOpcUaClient = opcUaClient;

      opcUaClient.setEventHandlers({
        onConnected: () => {
          console.log("✅ Cliente OPC UA conectado ao servidor");
          broadcast({ 
            type: 'connection_status', 
            connected: true,
            endpoint: opcUaClient?.getEndpoint() || ""
          });
        },
        onDisconnected: () => {
          console.log("❌ Cliente OPC UA desconectado do servidor");
          broadcast({ 
            type: 'connection_status', 
            connected: false
          });
        },
        onConnectionLost: () => {
          console.log("⚠️ Conexão OPC UA perdida, tentando reconectar...");
          broadcast({ 
            type: 'connection_status', 
            connected: false,
            reconnecting: true
          });
        },
        onBackoff: (retry, delay) => {
          console.log(`🔄 Tentativa de reconexão OPC UA ${retry}, próximo em ${delay}ms`);
          broadcast({ 
            type: 'connection_status', 
            connected: false,
            reconnecting: true,
            retry,
            delay
          });
        },
        onReconnected: () => {
          console.log("✅ Cliente OPC UA reconectado com sucesso");
          broadcast({ 
            type: 'connection_status', 
            connected: true,
            endpoint: opcUaClient?.getEndpoint() || "",
            reconnected: true
          });
        }
      });

      await opcUaClient.connect({
        endpointUrl: `opc.tcp://${connection.host}:${connection.port}`,
        securityPolicy: connection.securityPolicy || 'None',
        securityMode: connection.securityMode || 'None',
        username: connection.username || undefined,
        password: connection.password || undefined
      });

      await storage.setConnectionStatus(connectionId, true);

      subscriptionManager = new SubscriptionManager(opcUaClient, handleValueChange);

      globalSubscriptionManager = subscriptionManager;

      const settings = await storage.getDefaultSubscriptionSettings();
      if (settings) {
        subscriptionManager.setDefaultSettings({
          publishingInterval: settings.publishingInterval ?? 1000,
          samplingInterval: settings.samplingInterval ?? 500,
          queueSize: settings.queueSize ?? 10
        });
      }

      const tags = await storage.getTags();
      const subscribedTags = tags.filter(tag => tag.isSubscribed);

      for (const tag of subscribedTags) {
        await subscriptionManager.subscribe(tag.nodeId).catch(err => {
          console.error(`Erro ao subscrever tag ${tag.nodeId}, tag não existente no servidor OPC UA?`);
        });
      }

      await storage.createActivityLog({
        type: 'connection',
        message: `Connected to "${connection.name}" (${connection.host}:${connection.port})`,
        data: { connectionId: connection.id }
      });

      broadcast({ 
        type: 'connection_status', 
        connected: true,
        endpoint: opcUaClient.getEndpoint()
      });

      res.json({ 
        success: true, 
        message: 'Connected successfully',
        endpoint: opcUaClient.getEndpoint()
      });
    } catch (error) {
      await storage.createActivityLog({
        type: 'connection',
        message: `Connection failed to "${connection.name}": ${error.message}`,
        data: { connectionId: connection.id, error: error.message }
      });

      await storage.setConnectionStatus(connectionId, false);

      broadcast({ type: 'connection_status', connected: false });

      res.status(500).json({ 
        success: false, 
        message: `Connection failed: ${error.message}` 
      });
    }
  }));

  app.post('/api/connections/disconnect', asyncHandler(async (req, res) => {
    try {
      if (opcUaClient) {
        const endpoint = opcUaClient.getEndpoint();
        await opcUaClient.disconnect();

        globalOpcUaClient = null;

        opcUaClient = null;

        if (subscriptionManager) {
          subscriptionManager.clear();

          globalSubscriptionManager = null;

          subscriptionManager = null;
        }

        const connections = await storage.getConnections();
        for (const connection of connections) {
          if (connection.isActive) {
            await storage.setConnectionStatus(connection.id, false);

            await storage.createActivityLog({
              type: 'connection',
              message: `Disconnected from "${connection.name}" (${endpoint})`,
              data: { connectionId: connection.id }
            });
          }
        }

        broadcast({ type: 'connection_status', connected: false });

        res.json({ success: true, message: 'Disconnected successfully' });
      } else {
        res.json({ success: true, message: 'Already disconnected' });
      }
    } catch (error) {
      res.status(500).json({ 
        success: false, 
        message: `Disconnection failed: ${error.message}` 
      });
    }
  }));

  app.get('/api/people', asyncHandler(async (req, res) => {
    const people = await storage.getPeople();
    res.json(people);
  }));

  app.get('/api/people/:id', asyncHandler(async (req, res) => {
    const person = await storage.getPerson(Number(req.params.id));
    if (!person) {
      res.status(404).json({ message: 'Person not found' });
      return;
    }
    res.json(person);
  }));

  app.post('/api/people', asyncHandler(async (req, res) => {
    const personData = personSchema.parse(req.body);
    const person = await storage.createPerson(personData);

    await storage.createActivityLog({
      type: 'person',
      message: `Person "${person.name}" created`,
      data: { personId: person.id }
    });

    res.status(201).json(person);
  }));

  app.put('/api/people/:id', asyncHandler(async (req, res) => {
    const personData = personSchema.partial().parse(req.body);
    const person = await storage.updatePerson(Number(req.params.id), personData);

    if (!person) {
      res.status(404).json({ message: 'Person not found' });
      return;
    }

    await storage.createActivityLog({
      type: 'person',
      message: `Person "${person.name}" updated`,
      data: { personId: person.id }
    });

    res.json(person);
  }));

  app.delete('/api/people/:id', asyncHandler(async (req, res) => {
    const personId = Number(req.params.id);
    const person = await storage.getPerson(personId);

    if (!person) {
      res.status(404).json({ message: 'Person not found' });
      return;
    }

    const success = await storage.deletePerson(personId);

    if (success) {
      await storage.createActivityLog({
        type: 'person',
        message: `Person "${person.name}" deleted`,
        data: { personId }
      });

      res.status(204).send();
    } else {
      res.status(500).json({ message: 'Failed to delete person' });
    }
  }));

  app.get('/api/people/:id/tags', asyncHandler(async (req, res) => {
    const personId = Number(req.params.id);
    const person = await storage.getPerson(personId);

    if (!person) {
      res.status(404).json({ message: 'Person not found' });
      return;
    }

    let tags = await storage.getPersonTags(personId);

    tags = tags.map(tag => {
      if (tag.person) {
        return {
          ...tag,
          personName: tag.person.name
        };
      }
      return tag;
    });
    
    res.json(tags);
  }));

  app.get('/api/tags', asyncHandler(async (req, res) => {
    let tags = await storage.getTags();
    tags = tags.map(tag => {
      if (tag.person) {
        return {
          ...tag,
          personName: tag.person.name
        };
      }
      return tag;
    });
    
    res.json(tags);
  }));

  app.get('/api/tags/:id', asyncHandler(async (req, res) => {
    const tag = await storage.getTag(Number(req.params.id));
    if (!tag) {
      res.status(404).json({ message: 'Tag not found' });
      return;
    }
    let result = { ...tag };
    
    if (tag.person) {
      result.personName = tag.person.name;
    }
    
    res.json(result);
  }));

  app.post('/api/tags', asyncHandler(async (req, res) => {
    const tagData = tagSchema.parse(req.body);

    const existingTag = await storage.getTagByNodeId(tagData.nodeId);
    if (existingTag) {
      res.status(400).json({ message: 'Tag with this nodeId already exists' });
      return;
    }

    const tag = await storage.createTag(tagData);

    await storage.createActivityLog({
      type: 'tag',
      message: `Tag "${tag.displayName}" created`,
      data: { tagId: tag.id, nodeId: tag.nodeId }
    });

    res.status(201).json(tag);
  }));

  app.put('/api/tags/:id', asyncHandler(async (req, res) => {
    const tagData = tagSchema.partial().parse(req.body);
    const tag = await storage.updateTag(Number(req.params.id), tagData);

    if (!tag) {
      res.status(404).json({ message: 'Tag not found' });
      return;
    }

    await storage.createActivityLog({
      type: 'tag',
      message: `Tag "${tag.displayName}" updated`,
      data: { tagId: tag.id }
    });

    res.json(tag);
  }));

  app.delete('/api/tags/:id', asyncHandler(async (req, res) => {
    const tagId = Number(req.params.id);
    const tag = await storage.getTag(tagId);

    if (!tag) {
      res.status(404).json({ message: 'Tag not found' });
      return;
    }

    if (tag.isSubscribed && subscriptionManager && opcUaClient?.isConnected()) {
      try {
        await subscriptionManager.unsubscribe(tag.nodeId);
      } catch (error) {
        console.error('Error unsubscribing:', error);
      }
    }

    const success = await storage.deleteTag(tagId);

    if (success) {
      await storage.createActivityLog({
        type: 'tag',
        message: `Tag "${tag.displayName}" deleted`,
        data: { tagId, nodeId: tag.nodeId }
      });

      res.status(204).send();
    } else {
      res.status(500).json({ message: 'Failed to delete tag' });
    }
  }));

  app.post('/api/tags/:id/subscribe', asyncHandler(async (req, res) => {
    const tagId = Number(req.params.id);
    const tag = await storage.getTag(tagId);

    if (!tag) {
      res.status(404).json({ message: 'Tag não encontrada' });
      return;
    }

    if (tag.isSubscribed) {
      res.json({ success: true, message: 'Tag já está inscrita', tag });
      return;
    }

    if (!opcUaClient || !opcUaClient.isConnected()) {
      res.status(400).json({ message: 'Cliente OPC UA não está conectado' });
      return;
    }

    if (!subscriptionManager) {
      res.status(400).json({ message: 'Gerenciador de subscrições não foi inicializado' });
      return;
    }

    try {
      await subscriptionManager.subscribe(tag.nodeId);

      const updatedTag = await storage.setTagSubscription(tagId, true);

      await storage.createActivityLog({
        type: 'subscription',
        message: `Subscrito à tag "${tag.displayName}"`,
        data: { tagId, nodeId: tag.nodeId }
      });

      res.json({ 
        success: true, 
        message: 'Subscrito com sucesso',
        tag: updatedTag
      });
    } catch (error) {
      console.error('Erro ao subscrever tag:', error);
      res.status(500).json({ 
        success: false, 
        message: `Falha na subscrição: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
      });
    }
  }));

  app.post('/api/tags/:id/unsubscribe', asyncHandler(async (req, res) => {
    const tagId = Number(req.params.id);
    const tag = await storage.getTag(tagId);

    if (!tag) {
      res.status(404).json({ message: 'Tag não encontrada' });
      return;
    }

    if (!tag.isSubscribed) {
      res.json({ success: true, message: 'Tag já está desinscrita', tag });
      return;
    }

    if (!opcUaClient || !opcUaClient.isConnected()) {
      res.status(400).json({ message: 'Cliente OPC UA não está conectado' });
      return;
    }

    if (!subscriptionManager) {
      res.status(400).json({ message: 'Gerenciador de subscrições não foi inicializado' });
      return;
    }

    try {
      await subscriptionManager.unsubscribe(tag.nodeId);

      const updatedTag = await storage.setTagSubscription(tagId, false);

      await storage.createActivityLog({
        type: 'subscription',
        message: `Cancelada subscrição da tag "${tag.displayName}"`,
        data: { tagId, nodeId: tag.nodeId }
      });

      res.json({ 
        success: true, 
        message: 'Subscrição cancelada com sucesso', 
        tag: updatedTag 
      });
    } catch (error) {
      console.error('Erro ao cancelar subscrição de tag:', error);
      res.status(500).json({ 
        success: false, 
        message: `Falha ao cancelar subscrição: ${error instanceof Error ? error.message : 'Erro desconhecido'}` 
      });
    }
  }));

  app.post('/api/tags/:id/assign-person/:personId', asyncHandler(async (req, res) => {
    const tagId = Number(req.params.id);
    const personId = Number(req.params.personId);

    const tag = await storage.getTag(tagId);
    if (!tag) {
      res.status(404).json({ message: 'Tag não encontrada' });
      return;
    }

    const person = await storage.getPerson(personId);
    if (!person) {
      res.status(404).json({ message: 'Pessoa não encontrada' });
      return;
    }

    if (tag.personId && tag.personId !== personId) {
      const currentPerson = await storage.getPerson(tag.personId);
      const currentPersonName = currentPerson ? currentPerson.name : "outra pessoa";
      
      res.status(400).json({ 
        message: `Esta tag já está atribuída a ${currentPersonName}. Por favor, desatribua-a primeiro.` 
      });
      return;
    }

    const updatedTag = await storage.assignTagToPerson(tagId, personId);

    await storage.createActivityLog({
      type: 'tag',
      message: `Tag "${tag.displayName}" atribuída a "${person.name}"`,
      data: { tagId, personId }
    });

    res.json(updatedTag);
  }));

  app.post('/api/tags/:id/unassign-person', asyncHandler(async (req, res) => {
    const tagId = Number(req.params.id);

    const tag = await storage.getTag(tagId);
    if (!tag) {
      res.status(404).json({ message: 'Tag não encontrada' });
      return;
    }

    if (!tag.personId) {
      res.status(400).json({ message: 'Esta tag não está atribuída a nenhuma pessoa' });
      return;
    }

    const person = await storage.getPerson(tag.personId);
    const personName = person ? person.name : "pessoa desconhecida";

    const updatedTag = await storage.unassignTagFromPerson(tagId);

    await storage.createActivityLog({
      type: 'tag',
      message: `Tag "${tag.displayName}" desatribuída de "${personName}"`,
      data: { tagId }
    });

    res.json(updatedTag);
  }));

  app.get('/api/readings', asyncHandler(async (req, res) => {
    const tagId = req.query.tagId ? Number(req.query.tagId) : undefined;
    const personId = req.query.personId ? Number(req.query.personId) : undefined;
    const from = req.query.from ? new Date(req.query.from as string) : undefined;
    const to = req.query.to ? new Date(req.query.to as string) : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    let filteredTagId = tagId;
    if (personId) {
      try {
        const personTags = await storage.getPersonTags(personId);

        if (tagId) {
          const tagBelongsToPerson = personTags.some(tag => tag.id === tagId);
          if (!tagBelongsToPerson) {
            res.json({ data: [], total: 0 });
            return;
          }
        } else {
          const tagIds = personTags.map(tag => tag.id);
          
          if (tagIds.length === 0) {
            res.json({ data: [], total: 0 });
            return;
          }

          let allReadings: ReadingWithTag[] = [];
          let totalRecords = 0;

          for (const id of tagIds) {
            const { total } = await storage.getReadings({ tagId: id, from, to });
            totalRecords += total;
          }

          for (const id of tagIds) {
            const { data } = await storage.getReadings({ tagId: id, from, to });
            allReadings = [...allReadings, ...data];
          }

          allReadings.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
          
          console.log(`Total de ${totalRecords} leituras combinadas para todas as tags da pessoa`);

          let paginatedReadings = allReadings;
          if (limit || offset > 0) {
            const start = offset;
            const end = limit ? offset + limit : undefined;
            paginatedReadings = allReadings.slice(start, end);
            console.log(`Aplicando offset=${offset} e limit=${limit || 'sem limite'}, resultando em ${paginatedReadings.length} leituras`);
          }
          
          res.json({ 
            data: paginatedReadings, 
            total: totalRecords 
          });
          return;
        }
      } catch (error) {
        console.error('Erro ao buscar tags da pessoa:', error);
        res.status(500).json({ message: 'Erro ao buscar leituras' });
        return;
      }
    }

    const result = await storage.getReadings({ 
      tagId: filteredTagId, 
      from, 
      to, 
      limit,
      offset
    });

    res.json(result);
  }));

  app.get('/api/readings/historical', asyncHandler(async (req, res) => {
    const tagIdsParam = req.query.tagIds as string | undefined;
    const fromParam = req.query.from as string | undefined;
    const toParam = req.query.to as string | undefined;

    const from = fromParam ? new Date(fromParam) : undefined;
    const to = toParam ? new Date(toParam) : undefined;

    if (!tagIdsParam || tagIdsParam === '' || tagIdsParam === 'undefined') {
      res.json({ data: [], total: 0 });
      return;
    }

    const tagIds = tagIdsParam.split(',')
      .filter(id => id && id.trim() !== '' && !isNaN(Number(id)))
      .map(id => Number(id));

    if (tagIds.length === 0) {
      res.json({ data: [], total: 0 });
      return;
    }
    
    try {
      let allReadings: ReadingWithTag[] = [];
      let totalRecords = 0;

      for (const tagId of tagIds) {
        const { data, total } = await storage.getReadings({ tagId, from, to, limit: 1000 }); // Limitamos a 1000 pontos por tag
        allReadings = [...allReadings, ...data];
        totalRecords += total;
      }

      allReadings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      if (allReadings.length === 0) {
        console.log('Aviso: Nenhuma leitura histórica encontrada para as tags:', tagIds);
      }

      res.json({
        data: allReadings,
        total: totalRecords
      });
    } catch (error) {
      console.error('Erro ao buscar leituras históricas:', error);
      res.status(500).json({ message: 'Erro ao buscar leituras históricas' });
    }
  }));

  app.get('/api/tags/:id/readings', asyncHandler(async (req, res) => {
    const tagId = Number(req.params.id);
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    const offset = req.query.offset ? Number(req.query.offset) : 0;

    const tag = await storage.getTag(tagId);
    if (!tag) {
      res.status(404).json({ message: 'Tag não encontrada' });
      return;
    }
    
    try {
      const { data, total } = await storage.getReadings({ 
        tagId, 
        limit,
        offset
      });
      
      if (data.length === 0) {
        console.log(`Nenhuma leitura encontrada para a tag ${tagId}`);
      }

      res.json(data);
    } catch (error) {
      console.error('Erro ao buscar leituras da tag:', error);
      res.status(500).json({ message: 'Erro ao buscar leituras' });
    }
  }));

  app.get('/api/readings/latest', asyncHandler(async (req, res) => {
    const tagIdsParam = req.query.tagIds as string | undefined;

    if (!tagIdsParam || tagIdsParam === '' || tagIdsParam === 'undefined' || tagIdsParam === ',') {
      res.json([]);
      return;
    }
    const tagIds = tagIdsParam.split(',')
      .filter(id => id && id.trim() !== '' && !isNaN(Number(id)))
      .map(id => Number(id));

    if (tagIds.length === 0) {
      res.json([]);
      return;
    }

    try {
      const readings = await storage.getLatestReadings(tagIds);
      res.json(readings);
    } catch (error) {
      console.error('Erro ao obter leituras recentes:', error);
      res.json([]);
    }
  }));

  app.get('/api/subscription-settings', asyncHandler(async (req, res) => {
    const settings = await storage.getSubscriptionSettings();
    res.json(settings);
  }));

  app.get('/api/subscription-settings/default', asyncHandler(async (req, res) => {
    const settings = await storage.getDefaultSubscriptionSettings();
    if (!settings) {
      res.status(404).json({ message: 'Default subscription settings not found' });
      return;
    }
    res.json(settings);
  }));

  app.post('/api/subscription-settings', asyncHandler(async (req, res) => {
    const settingsData = subscriptionSettingsSchema.extend({
      isDefault: z.boolean().optional().default(false)
    }).parse(req.body);

    const settings = await storage.createSubscriptionSettings(settingsData);

    if (settingsData.isDefault && subscriptionManager) {
      subscriptionManager.setDefaultSettings({
        publishingInterval: settings.publishingInterval ?? 1000,
        samplingInterval: settings.samplingInterval ?? 500,
        queueSize: settings.queueSize ?? 10
      });
    }

    res.status(201).json(settings);
  }));

  app.put('/api/subscription-settings/:id', asyncHandler(async (req, res) => {
    const settingsData = subscriptionSettingsSchema.partial().extend({
      isDefault: z.boolean().optional()
    }).parse(req.body);

    const settings = await storage.updateSubscriptionSettings(Number(req.params.id), settingsData);

    if (!settings) {
      res.status(404).json({ message: 'Subscription settings not found' });
      return;
    }

    if (settings.isDefault && subscriptionManager) {
      subscriptionManager.setDefaultSettings({
        publishingInterval: settings.publishingInterval ?? 1000,
        samplingInterval: settings.samplingInterval ?? 500,
        queueSize: settings.queueSize ?? 10
      });
    }

    res.json(settings);
  }));

  app.get('/api/activity-logs', asyncHandler(async (req, res) => {
    const limit = req.query.limit ? Number(req.query.limit) : undefined;
    const logs = await storage.getActivityLogs(limit);
    res.json(logs);
  }));

  app.post('/api/insert-persons-batch', asyncHandler(async (req, res) => {
    const personsData = z.array(personSchema).parse(req.body);

    try {
      await storage.insertPersonsWithJson(personsData);

      await storage.createActivityLog({
        type: 'person',
        message: `Batch insert of ${personsData.length} persons`,
        data: { count: personsData.length }
      });

      res.status(201).json({ message: 'Persons inserted successfully', count: personsData.length });
    } catch (error) {
      console.error('Error inserting persons batch:', error);
      res.status(500).json({ message: 'Failed to insert persons batch' });
    }
  }));

  return httpServer;
}
