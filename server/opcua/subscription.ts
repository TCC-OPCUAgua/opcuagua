import { OpcUaClient } from "./client";
import { ClientSubscription, MonitoringParametersOptions, TimestampsToReturn, ClientMonitoredItem, AttributeIds, StatusCodes } from "node-opcua";
import prisma from "../prisma";

export interface SubscriptionSettings {
  publishingInterval: number;
  samplingInterval: number;
  queueSize: number;
}

export type ValueChangeCallback = (
  nodeId: string,
  value: any,
  dataType: string,
  timestamp: Date
) => void;

export class SubscriptionManager {
  private client: OpcUaClient;
  private subscription: ClientSubscription | null = null;
  private monitoredItems: Map<string, ClientMonitoredItem> = new Map();
  private onValueChange: ValueChangeCallback;
  private defaultSettings: SubscriptionSettings = {
    publishingInterval: 1000,
    samplingInterval: 500,
    queueSize: 10
  };
  
  constructor(client: OpcUaClient, onValueChange: ValueChangeCallback) {
    this.client = client;
    this.onValueChange = onValueChange;
    this.initSubscription();
  }
  
  setDefaultSettings(settings: SubscriptionSettings): void {
    this.defaultSettings = settings;
    
    if (this.subscription) {
      try {
        this.subscription.terminate();
        this.subscription = null;
        this.initSubscription();
      } catch (err) {
        console.error("Error updating subscription:", err);
      }
    }
  }
  
  getDefaultSettings(): SubscriptionSettings {
    return this.defaultSettings;
  }
  
  private async initSubscription(): Promise<void> {
    if (!this.client.isConnected()) {
      throw new Error("OPC UA client not connected");
    }
    
    const session = this.client.getSession();
    if (!session) {
      throw new Error("No OPC UA session available");
    }
    
    try {
      this.subscription = ClientSubscription.create(session, {
        requestedPublishingInterval: this.defaultSettings.publishingInterval,
        requestedLifetimeCount: 10000,
        requestedMaxKeepAliveCount: 10,
        maxNotificationsPerPublish: 100,
        publishingEnabled: true,
        priority: 10
      });
      
      this.subscription.on("started", () => {
        console.log(
          "Subscription started - interval:",
          this.subscription?.publishingInterval,
          "ms"
        );
      });
      
      this.subscription.on("terminated", () => {
        console.log("Subscription terminated");
        this.subscription = null;
      });
      
      this.subscription.on("internal_error", (err) => {
        console.error("Subscription internal error:", err);
      });
      
      this.subscription.on("status_changed", (status) => {
        console.log("Subscription status changed:", status);
      });
      
      this.subscription.on("keepalive", () => {
        console.log("Subscription keepalive");
      });
      
    } catch (err) {
      console.error("Error creating subscription:", err);
      throw err;
    }
  }
  
  async subscribe(nodeId: string): Promise<void> {
    if (!this.client.isConnected()) {
      throw new Error("OPC UA client not connected");
    }
    
    if (!this.subscription) {
      await this.initSubscription();
    }
    
    if (this.monitoredItems.has(nodeId)) {
      return;
    }
    
    try {
      const tagInfo = await this.client.readNodeAttributes(nodeId);
      
      if (!this.subscription) {
        throw new Error("Failed to create subscription");
      }
      
      const monitoringParameters: MonitoringParametersOptions = {
        samplingInterval: this.defaultSettings.samplingInterval,
        discardOldest: true,
        queueSize: this.defaultSettings.queueSize
      };
      
      const monitoredItem = ClientMonitoredItem.create(
        this.subscription,
        {
          nodeId,
          attributeId: AttributeIds.Value
        },
        monitoringParameters,
        TimestampsToReturn.Both
      );
      
      monitoredItem.on("changed", async (dataValue) => {
        if (dataValue.statusCode !== StatusCodes.Good) {
          console.warn(`Received value with status code ${dataValue.statusCode} for ${nodeId}`);
          return;
        }
        
        const value = dataValue.value.value;
        const dataType = dataValue.value.dataType.toString();
        const timestamp = dataValue.sourceTimestamp || new Date();
        
        try {
          const tag = await prisma.tag.findFirst({
            where: { nodeId: nodeId }
          });
          
          if (tag) {
            await prisma.reading.create({
              data: {
                tagId: tag.id,
                value: typeof value === 'number' ? value : null,
                quality: dataValue.statusCode.name,
                timestamp
              }
            });
            
            this.onValueChange(nodeId, value, dataType, timestamp);
          }
        } catch (err) {
          console.error(`Error saving reading for ${nodeId}:`, err);
        }
      });
      
      monitoredItem.on("err", (err) => {
        console.error(`Monitoring error for ${nodeId}:`, err);
      });
      
      this.monitoredItems.set(nodeId, monitoredItem);
      console.log(`Subscribed to ${nodeId}`);
      
    } catch (err) {
      console.error(`Error subscribing to ${nodeId}:`, err);
      throw err;
    }
  }
  
  async unsubscribe(nodeId: string): Promise<void> {
    const monitoredItem = this.monitoredItems.get(nodeId);
    if (!monitoredItem) {
      return;
    }
    
    try {
      monitoredItem.terminate();
      this.monitoredItems.delete(nodeId);
      console.log(`Unsubscribed from ${nodeId}`);
    } catch (err) {
      console.error(`Error unsubscribing from ${nodeId}:`, err);
      throw err;
    }
  }
  
  clear(): void {
    this.monitoredItems.forEach((item) => {
      try {
        item.terminate();
      } catch (err) {
        console.error("Error terminating monitored item:", err);
      }
    });
    
    this.monitoredItems.clear();
    
    if (this.subscription) {
      try {
        this.subscription.terminate();
        this.subscription = null;
      } catch (err) {
        console.error("Error terminating subscription:", err);
      }
    }
  }
}
