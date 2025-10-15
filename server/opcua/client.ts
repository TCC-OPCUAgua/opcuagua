import { 
  OPCUAClient, 
  MessageSecurityMode, 
  SecurityPolicy, 
  AttributeIds,
  ClientSession,
  StatusCodes,
  UserIdentityInfoUserName,
  UserTokenType,
  OPCUACertificateManager,
  BrowseDirection,
} from "node-opcua";

export interface OpcUaConnectionOptions {
  endpointUrl: string;
  securityPolicy?: string;
  securityMode?: string;
  username?: string;
  password?: string;
}

export interface OpcUaNode {
  nodeId: string;
  browseName: string;
  displayName: string;
  description?: string;
  nodeClass: string;
  dataType?: string;
  isFolder: boolean;
}

export interface OpcUaEventHandlers {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onConnectionFailed?: () => void;
  onConnectionLost?: () => void;
  onBackoff?: (retry: number, delay: number) => void;
  onStartReconnection?: () => void;
  onReconnectionFailed?: () => void;
  onReconnected?: () => void;
  onSessionClosed?: () => void;
  onSessionRestored?: () => void;
  onCertificateInvalid?: (err: Error) => void;
}

export class OpcUaClient {
  private client: OPCUAClient | null = null;
  private session: ClientSession | null = null;
  private connected: boolean = false;
  private endpointUrl: string = "";
  private eventHandlers: OpcUaEventHandlers = {};
  private certificateManager: OPCUACertificateManager | null = null;
  
  constructor() {
    this.certificateManager = new OPCUACertificateManager({
      automaticallyAcceptUnknownCertificate: true,
      rootFolder: "./certificates"
    });
    
    this.initializeClient({
      applicationName: "OPC-UÁgua Client",
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 5,
        maxDelay: 10 * 1000
      },
      securityMode: MessageSecurityMode.None,
      securityPolicy: SecurityPolicy.None,
      certificateManager: this.certificateManager,
      endpointMustExist: false,
      keepSessionAlive: true,
      requestedSessionTimeout: 120000
    });
  }
  
  public setEventHandlers(handlers: OpcUaEventHandlers): void {
    this.eventHandlers = { ...this.eventHandlers, ...handlers };
  }
  
  private initializeClient(options: any) {
    try {
      this.client = OPCUAClient.create(options);
      
      this.client.on("connected", () => {
        console.log("Conectado ao servidor OPC-UA");
        this.connected = true;
        
        if (this.eventHandlers.onConnected) {
          this.eventHandlers.onConnected();
        }
      });
      
      this.client.on("connection_failed", () => {
        console.log("Falha na conexão");
        this.connected = false;
        
        if (this.eventHandlers.onConnectionFailed) {
          this.eventHandlers.onConnectionFailed();
        }
      });
      
      this.client.on("connection_lost", () => {
        console.log("Conexão perdida");
        this.connected = false;
        
        if (this.eventHandlers.onConnectionLost) {
          this.eventHandlers.onConnectionLost();
        }
      });
      
      this.client.on("backoff", (retry: number, delay: number) => {
        console.log(`Tentativa de reconexão ${retry}, próxima em ${delay}ms`);
        
        if (this.eventHandlers.onBackoff) {
          this.eventHandlers.onBackoff(retry, delay);
        }
      });
      
      this.client.on("start_reconnection", () => {
        console.log("Iniciando reconexão automática");
        
        if (this.eventHandlers.onStartReconnection) {
          this.eventHandlers.onStartReconnection();
        }
      });
      
      this.client.on("reconnection_attempt_failed", () => {
        console.log("Tentativa de reconexão falhou");
        
        if (this.eventHandlers.onReconnectionFailed) {
          this.eventHandlers.onReconnectionFailed();
        }
      });
      
      this.client.on("after_reconnection", () => {
        console.log("Conexão restabelecida");
        this.connected = true;
        
        if (this.eventHandlers.onReconnected) {
          this.eventHandlers.onReconnected();
        }
      });
      
      this.client.on("timed_out_request", (request: any) => {
        console.log("Requisição ao servidor excedeu o tempo limite", request.toString());
      });
    } catch (err) {
      console.error("Erro ao inicializar cliente OPC UA:", err);
      throw err;
    }
  }
  
  async connect(options: OpcUaConnectionOptions): Promise<void> {
    if (!this.client) {
      throw new Error("Cliente OPC UA não inicializado");
    }
    
    try {
      this.endpointUrl = options.endpointUrl;
      console.log(`Conectando a ${options.endpointUrl}`);
    
      if (this.connected) {
        console.log("Desconectando da sessão anterior antes de reconectar");
        try {
          await this.disconnect();
        } catch (err) {
          console.warn("Erro ao desconectar da sessão anterior:", err);
        }
      }
      let needToRecreateClient = false;
      let securityPolicy: any = SecurityPolicy.None;
      let securityMode: any = MessageSecurityMode.None;
      
      if (options.securityPolicy && options.securityPolicy !== 'None') {
        if (!(SecurityPolicy as any)[options.securityPolicy]) {
          throw new Error(`Política de segurança inválida: ${options.securityPolicy}`);
        }
        securityPolicy = (SecurityPolicy as any)[options.securityPolicy];
        needToRecreateClient = true;

        if (options.securityMode) {
          if (options.securityMode === 'SignAndEncrypt') {
            securityMode = MessageSecurityMode.SignAndEncrypt;
          } else if (options.securityMode === 'Sign') {
            securityMode = MessageSecurityMode.Sign;
          } else if (options.securityMode !== 'None') {
            throw new Error(`Modo de segurança inválido: ${options.securityMode}`);
          }
        }
      }
      
      if (needToRecreateClient) {
        console.log(`Recriando cliente com política de segurança: ${options.securityPolicy}, modo: ${options.securityMode}`);
        
        if (this.client) {
          try {
            await this.client.disconnect();
          } catch (e) {
            // Ignore errors on disconnect
          }
        }
        
        this.initializeClient({
          applicationName: "OPC-UÁgua Client",
          connectionStrategy: {
            initialDelay: 1000,
            maxRetry: 5,
            maxDelay: 10 * 1000
          },
          securityMode,
          securityPolicy,
          certificateManager: this.certificateManager,
          endpointMustExist: true,
          keepSessionAlive: true,
          requestedSessionTimeout: 120000
        });
      }
      await this.client.connect(options.endpointUrl);
      
      let userIdentity: UserIdentityInfoUserName | undefined = undefined;
      
      if (options.username && options.password) {
        console.log(`Autenticando com usuário: ${options.username}`);
        userIdentity = {
          type: UserTokenType.UserName,
          userName: options.username,
          password: options.password
        } as UserIdentityInfoUserName;
      }
      
      console.log("Criando sessão OPC UA...");
      const session = await this.client.createSession(userIdentity);
      this.session = session;
      this.connected = true;
      
      session.on("session_closed", () => {
        console.log("Sessão fechada pelo servidor");
        this.connected = false;
        
        if (this.eventHandlers.onSessionClosed) {
          this.eventHandlers.onSessionClosed();
        }
      });
      
      session.on("keepalive", () => {
        // console.log("Session keepalive");
      });
      
      session.on("keepalive_failure", () => {
        console.warn("Falha no keepalive da sessão!");
      });
      
      console.log("Conectado com sucesso ao servidor OPC UA:", this.endpointUrl);
      
      if (this.eventHandlers.onConnected) {
        this.eventHandlers.onConnected();
      }
      
      return;
    } catch (err) {
      console.error("Erro ao conectar ao servidor OPC UA:", err);
      this.connected = false;
      
      if (this.eventHandlers.onConnectionFailed) {
        this.eventHandlers.onConnectionFailed();
      }
      
      throw err;
    }
  }
  
  async disconnect(): Promise<void> {
    try {
      if (!this.client && !this.session) {
        console.log("Não há conexão OPC UA ativa para desconectar");
        return;
      }
      
      if (this.session) {
        console.log("Fechando sessão OPC UA...");
        try {
          await this.session.close();
          console.log("Sessão OPC UA fechada com sucesso");
        } catch (err) {
          console.warn("Erro ao fechar sessão OPC UA:", err);
        }
        this.session = null;
      }
      
      if (this.client) {
        console.log("Desconectando cliente OPC UA...");
        try {
          await this.client.disconnect();
          console.log("Cliente OPC UA desconectado com sucesso");
        } catch (err) {
          console.warn("Erro ao desconectar cliente OPC UA:", err);
          if (!this.session) {
            throw err;
          }
        }
      }
      
      this.connected = false;
      console.log("Desconectado do servidor OPC UA:", this.endpointUrl);
      
      if (this.eventHandlers.onDisconnected) {
        this.eventHandlers.onDisconnected();
      }
    } catch (err) {
      console.error("Erro durante a desconexão OPC UA:", err);
      throw err;
    }
  }
  
  isConnected(): boolean {
    return this.connected && !!this.session;
  }
  
  getEndpoint(): string {
    return this.endpointUrl;
  }
  
  getSession(): ClientSession | null {
    return this.session;
  }
  
  async browse(nodeId: string = "RootFolder"): Promise<OpcUaNode[]> {
    if (!this.isConnected() || !this.session) {
      throw new Error("Not connected to OPC UA server");
    }
    
    try {
      console.log(`Browsing node ${nodeId}...`);
      
      const browseOptions = {
        nodeId: nodeId,
        browseDirection: BrowseDirection.Forward,
        includeSubtypes: true,
        nodeClassMask: 0xFF,
        resultMask: 0xFF
      };
      
      const browseResult = await this.session.browse(browseOptions);
      
      if (browseResult.statusCode !== StatusCodes.Good) {
        throw new Error(`Browse failed: ${browseResult.statusCode.toString()}`);
      }
      
      const nodes: OpcUaNode[] = [];
      
      for (const reference of browseResult.references || []) {
        const nodeIdStr = reference.nodeId.toString();
        const browseNameStr = reference.browseName.toString();
        
        let displayNameStr = browseNameStr;
        if (reference.displayName && reference.displayName.text) {
          displayNameStr = reference.displayName.text;
        }
        
        // Determinar a classe do nó corretamente
        const nodeClassStr = reference.nodeClass.toString();
        
        // Identificar se é uma pasta (container)
        let isFolder = false;
        
        // NodeClass.Object = 1, NodeClass.ObjectType = 3, NodeClass.Folder = especial
        if (nodeClassStr === "1" || nodeClassStr === "3") {
          isFolder = true;
        }
        
        // Se for um objeto que é uma pasta (tipo especial), marque como pasta
        if (reference.typeDefinition && 
            reference.typeDefinition.toString().includes("FolderType")) {
          isFolder = true;
        }
        
        let dataType = undefined;
        
        // Se for uma variável, tentamos obter o tipo de dados
        if (nodeClassStr === "2") { // NodeClass.Variable
          try {
            const dataTypeResult = await this.session.read({
              nodeId: nodeIdStr,
              attributeId: AttributeIds.DataType
            });
            
            if (dataTypeResult.statusCode === StatusCodes.Good && dataTypeResult.value.value) {
              dataType = dataTypeResult.value.value.toString();
            }
          } catch (error) {
            console.warn(`Não foi possível ler o tipo de dado para ${nodeIdStr}:`, error);
          }
        }
        
        const node: OpcUaNode = {
          nodeId: nodeIdStr,
          browseName: browseNameStr,
          displayName: displayNameStr,
          nodeClass: nodeClassStr,
          dataType: dataType,
          isFolder: isFolder
        };
        
        nodes.push(node);
      }
      
      console.log(`Found ${nodes.length} nodes for ${nodeId}`);
      return nodes;
    } catch (err) {
      console.error(`Error browsing node ${nodeId}:`, err);
      throw err;
    }
  }
  
  async browseNext(continuationPoint: Buffer): Promise<OpcUaNode[]> {
    if (!this.isConnected() || !this.session) {
      throw new Error("Not connected to OPC UA server");
    }
    
    try {
      console.log(`Executing browseNext with continuation point...`);
      
      // Na API do node-opcua, browseNext aceita um array de Buffer e um booleano
      // indicando se os pontos de continuação devem ser liberados
      const browseNextResultsArray = await this.session.browseNext([continuationPoint], false);
      
      if (!browseNextResultsArray || !Array.isArray(browseNextResultsArray) || browseNextResultsArray.length === 0) {
        console.log('No results returned from browseNext');
        return [];
      }
      
      const browseResult = browseNextResultsArray[0];
      
      if (browseResult.statusCode !== StatusCodes.Good) {
        throw new Error(`BrowseNext failed: ${browseResult.statusCode.toString()}`);
      }
      
      const nodes: OpcUaNode[] = [];
      
      for (const reference of browseResult.references || []) {
        const nodeIdStr = reference.nodeId.toString();
        const browseNameStr = reference.browseName.toString();
        
        let displayNameStr = browseNameStr;
        if (reference.displayName && reference.displayName.text) {
          displayNameStr = reference.displayName.text;
        }
        
        const nodeClassStr = reference.nodeClass.toString();
        
        // Identificar se é uma pasta (container)
        let isFolder = false;
        if (nodeClassStr === "1" || nodeClassStr === "3") {
          isFolder = true;
        }
        
        if (reference.typeDefinition && 
            reference.typeDefinition.toString().includes("FolderType")) {
          isFolder = true;
        }
        
        let dataType = undefined;
        
        // Se for uma variável, tentamos obter o tipo de dados
        if (nodeClassStr === "2") { // NodeClass.Variable
          try {
            const dataTypeResult = await this.session.read({
              nodeId: nodeIdStr,
              attributeId: AttributeIds.DataType
            });
            
            if (dataTypeResult.statusCode === StatusCodes.Good && dataTypeResult.value.value) {
              dataType = dataTypeResult.value.value.toString();
            }
          } catch (error) {
            console.warn(`Não foi possível ler o tipo de dado para ${nodeIdStr}:`, error);
          }
        }
        
        const node: OpcUaNode = {
          nodeId: nodeIdStr,
          browseName: browseNameStr,
          displayName: displayNameStr,
          nodeClass: nodeClassStr,
          dataType: dataType,
          isFolder: isFolder
        };
        
        nodes.push(node);
      }
      
      console.log(`Found ${nodes.length} nodes via browseNext`);
      return nodes;
    } catch (err) {
      console.error("Error browsing next:", err);
      throw err;
    }
  }
  
  async read(nodeId: string): Promise<any> {
    if (!this.isConnected() || !this.session) {
      throw new Error("Not connected to OPC UA server");
    }
    
    try {
      const dataValue = await this.session.read({
        nodeId,
        attributeId: AttributeIds.Value
      });
      
      if (dataValue.statusCode !== StatusCodes.Good) {
        throw new Error(`Read failed: ${dataValue.statusCode.toString()}`);
      }
      
      return {
        value: dataValue.value.value,
        dataType: dataValue.value.dataType.toString(),
        timestamp: dataValue.sourceTimestamp || new Date()
      };
    } catch (err) {
      console.error(`Error reading node ${nodeId}:`, err);
      throw err;
    }
  }
  
  async readNodeAttributes(nodeId: string): Promise<any> {
    if (!this.isConnected() || !this.session) {
      throw new Error("Not connected to OPC UA server");
    }
    
    try {
      const [
        browseName,
        displayName,
        description,
        dataType
      ] = await Promise.all([
        this.session.read({
          nodeId,
          attributeId: AttributeIds.BrowseName
        }),
        this.session.read({
          nodeId,
          attributeId: AttributeIds.DisplayName
        }),
        this.session.read({
          nodeId,
          attributeId: AttributeIds.Description
        }),
        this.session.read({
          nodeId,
          attributeId: AttributeIds.DataType
        })
      ]);
      
      return {
        nodeId,
        browseName: browseName.value.value.toString(),
        displayName: displayName.value.value.text,
        description: description.value.value ? description.value.value.text : undefined,
        dataType: dataType.value.value ? dataType.value.value.toString() : undefined
      };
    } catch (err) {
      console.error(`Error reading attributes for node ${nodeId}:`, err);
      throw err;
    }
  }
  
  async crawl(nodeId: string = "RootFolder"): Promise<any> {
    if (!this.isConnected() || !this.session) {
      throw new Error("Not connected to OPC UA server");
    }
    
    try {
      const result: any = {};
      
      const attributes = await this.readNodeAttributes(nodeId);
      Object.assign(result, attributes);
      
      const browseOptions = {
        nodeId,
        browseDirection: BrowseDirection.Forward,
        includeSubtypes: true,
        resultMask: 0x3f
      };
      
      const browseResult = await this.session.browse(browseOptions);
      
      if (browseResult.statusCode === StatusCodes.Good && browseResult.references) {
        result.references = browseResult.references.map(ref => {
          const nodeIdStr = ref.nodeId.toString();
          const browseNameStr = ref.browseName.toString();
          
          let displayNameStr = browseNameStr;
          if (ref.displayName && ref.displayName.text) {
            displayNameStr = ref.displayName.text;
          }
          
          return {
            nodeId: nodeIdStr,
            browseName: browseNameStr,
            displayName: displayNameStr,
            nodeClass: ref.nodeClass.toString(),
            isForward: ref.isForward
          };
        });
      }
      
      return result;
    } catch (err) {
      console.error(`Error crawling node ${nodeId}:`, err);
      throw err;
    }
  }
}
