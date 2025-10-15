import prisma from './prisma';

export interface Connection {
  id: number;
  name: string;
  host: string;
  port: number;
  securityPolicy?: string | null;
  securityMode?: string | null;
  username?: string | null;
  password?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt?: Date | null;
}

export interface Person {
  id: number;
  name: string;
  location?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  createdAt: Date;
  updatedAt?: Date | null;
}

export interface Tag {
  id: number;
  nodeId: string;
  browseName: string;
  displayName: string;
  description?: string | null;
  dataType?: string | null;
  isSubscribed: boolean;
  personId?: number | null;
  createdAt: Date;
  updatedAt?: Date | null;
}

export interface Reading {
  id: number;
  tagId: number;
  value?: number | null;
  quality: string;
  timestamp: Date;
  createdAt: Date;
}

export interface SubscriptionSetting {
  id: number;
  publishingInterval: number;
  samplingInterval: number;
  queueSize: number;
  isDefault: boolean;
  createdAt: Date;
  updatedAt?: Date | null;
}

export interface ActivityLog {
  id: number;
  type: string;
  message: string;
  data?: any;
  timestamp: Date;
}

export type InsertConnection = Omit<Connection, 'id' | 'createdAt' | 'updatedAt'>;
export type InsertPerson = Omit<Person, 'id' | 'createdAt' | 'updatedAt'>;
export type InsertTag = Omit<Tag, 'id' | 'createdAt' | 'updatedAt'>;
export type InsertReading = Omit<Reading, 'id' | 'createdAt'> & { tag?: never };
export type InsertSubscriptionSettings = Omit<SubscriptionSetting, 'id' | 'createdAt' | 'updatedAt'>;
export type InsertActivityLog = Omit<ActivityLog, 'id' | 'timestamp'>;

export interface TagWithPerson extends Tag {
  person?: Person | null;
}

export interface ReadingWithTag extends Reading {
  tag?: Tag | null;
}

export type SubscriptionSettings = SubscriptionSetting;

export interface IStorage {
  getConnections(): Promise<Connection[]>;
  getConnection(id: number): Promise<Connection | undefined>;
  createConnection(connection: InsertConnection): Promise<Connection>;
  updateConnection(id: number, connection: Partial<InsertConnection>): Promise<Connection | undefined>;
  deleteConnection(id: number): Promise<boolean>;
  setConnectionStatus(id: number, isActive: boolean): Promise<Connection | undefined>;

  getPeople(): Promise<Person[]>;
  getPerson(id: number): Promise<Person | undefined>;
  createPerson(person: InsertPerson): Promise<Person>;
  updatePerson(id: number, person: Partial<InsertPerson>): Promise<Person | undefined>;
  deletePerson(id: number): Promise<boolean>;

  getTags(): Promise<TagWithPerson[]>;
  getTag(id: number): Promise<TagWithPerson | undefined>;
  getTagByNodeId(nodeId: string): Promise<TagWithPerson | undefined>;
  createTag(tag: InsertTag): Promise<Tag>;
  updateTag(id: number, tag: Partial<InsertTag>): Promise<Tag | undefined>;
  deleteTag(id: number): Promise<boolean>;
  getPersonTags(personId: number): Promise<TagWithPerson[]>;
  setTagSubscription(id: number, isSubscribed: boolean): Promise<Tag | undefined>;
  assignTagToPerson(tagId: number, personId: number): Promise<Tag | undefined>;
  unassignTagFromPerson(tagId: number): Promise<Tag | undefined>;

  getReadings(options?: { tagId?: number, from?: Date, to?: Date, limit?: number, offset?: number }): Promise<{ data: ReadingWithTag[], total: number }>;
  createReading(reading: InsertReading): Promise<Reading>;
  getLatestReadings(tagIds: number[]): Promise<ReadingWithTag[]>;

  getSubscriptionSettings(): Promise<SubscriptionSettings[]>;
  getDefaultSubscriptionSettings(): Promise<SubscriptionSettings | undefined>;
  updateSubscriptionSettings(id: number, settings: Partial<InsertSubscriptionSettings>): Promise<SubscriptionSettings | undefined>;
  createSubscriptionSettings(settings: InsertSubscriptionSettings & { isDefault?: boolean }): Promise<SubscriptionSettings>;

  getActivityLogs(limit?: number): Promise<ActivityLog[]>;
  createActivityLog(log: InsertActivityLog): Promise<ActivityLog>;
}

export class PrismaStorage implements IStorage {
  async getConnections(): Promise<Connection[]> {
    return await prisma.connection.findMany({
      orderBy: { id: 'asc' }
    });
  }

  async getConnection(id: number): Promise<Connection | undefined> {
    try {
      const connection = await prisma.connection.findUnique({
        where: { id }
      });
      return connection || undefined;
    } catch (error) {
      console.error('Error getting connection:', error);
      return undefined;
    }
  }

  async createConnection(connection: InsertConnection): Promise<Connection> {
    return await prisma.connection.create({
      data: {
        ...connection,
        securityPolicy: connection.securityPolicy ?? undefined,
        securityMode: connection.securityMode ?? undefined
      }
    });
  }

  async updateConnection(id: number, connection: Partial<InsertConnection>): Promise<Connection | undefined> {
    try {
      return await prisma.connection.update({
        where: { id },
        data: {
          ...connection,
          securityPolicy: connection.securityPolicy ?? undefined,
          securityMode: connection.securityMode ?? undefined,
        }
      });
    } catch (error) {
      console.error('Error updating connection:', error);
      return undefined;
    }
  }

  async deleteConnection(id: number): Promise<boolean> {
    try {
      await prisma.connection.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      console.error('Error deleting connection:', error);
      return false;
    }
  }

  async setConnectionStatus(id: number, isActive: boolean): Promise<Connection | undefined> {
    try {
      return await prisma.connection.update({
        where: { id },
        data: { isActive }
      });
    } catch (error) {
      console.error('Error setting connection status:', error);
      return undefined;
    }
  }

  // Person methods
  async getPeople(): Promise<Person[]> {
    return await prisma.person.findMany({
      orderBy: { id: 'asc' }
    });
  }

  async getPerson(id: number): Promise<Person | undefined> {
    try {
      const person = await prisma.person.findUnique({
        where: { id }
      });
      return person || undefined;
    } catch (error) {
      console.error('Error getting person:', error);
      return undefined;
    }
  }

  async createPerson(person: InsertPerson): Promise<Person> {
    return await prisma.person.create({
      data: person
    });
  }

  async updatePerson(id: number, person: Partial<InsertPerson>): Promise<Person | undefined> {
    try {
      return await prisma.person.update({
        where: { id },
        data: person
      });
    } catch (error) {
      console.error('Error updating person:', error);
      return undefined;
    }
  }

  async deletePerson(id: number): Promise<boolean> {
    try {
      await prisma.tag.updateMany({
        where: { personId: id },
        data: { personId: null }
      });

      // Then delete the person
      await prisma.person.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      console.error('Error deleting person:', error);
      return false;
    }
  }

  async getTags(): Promise<TagWithPerson[]> {
    return await prisma.tag.findMany({
      include: { person: true },
      orderBy: { id: 'asc' }
    });
  }

  async getTag(id: number): Promise<TagWithPerson | undefined> {
    try {
      const tag = await prisma.tag.findUnique({
        where: { id },
        include: { person: true }
      });
      return tag || undefined;
    } catch (error) {
      console.error('Error getting tag:', error);
      return undefined;
    }
  }

  async getTagByNodeId(nodeId: string): Promise<TagWithPerson | undefined> {
    try {
      const tagByNodeId = await prisma.tag.findUnique({
        where: { nodeId },
        include: { person: true }
      });
      return tagByNodeId || undefined;
    } catch (error) {
      console.error('Error getting tag by nodeId:', error);
      return undefined;
    }
  }

  async createTag(tag: InsertTag): Promise<Tag> {
    return await prisma.tag.create({
      data: tag
    });
  }

  async updateTag(id: number, tag: Partial<InsertTag>): Promise<Tag | undefined> {
    try {
      return await prisma.tag.update({
        where: { id },
        data: tag
      });
    } catch (error) {
      console.error('Error updating tag:', error);
      return undefined;
    }
  }

  async deleteTag(id: number): Promise<boolean> {
    try {
      await prisma.tag.delete({
        where: { id }
      });
      return true;
    } catch (error) {
      console.error('Error deleting tag:', error);
      return false;
    }
  }

  async getPersonTags(personId: number): Promise<TagWithPerson[]> {
    return await prisma.tag.findMany({
      where: { personId },
      include: { person: true },
      orderBy: { id: 'asc' }
    });
  }

  async setTagSubscription(id: number, isSubscribed: boolean): Promise<Tag | undefined> {
    try {
      return await prisma.tag.update({
        where: { id },
        data: { isSubscribed }
      });
    } catch (error) {
      console.error('Error setting tag subscription:', error);
      return undefined;
    }
  }

  async assignTagToPerson(tagId: number, personId: number): Promise<Tag | undefined> {
    try {
      return await prisma.tag.update({
        where: { id: tagId },
        data: { personId }
      });
    } catch (error) {
      console.error('Error assigning tag to person:', error);
      return undefined;
    }
  }

  async unassignTagFromPerson(tagId: number): Promise<Tag | undefined> {
    try {
      return await prisma.tag.update({
        where: { id: tagId },
        data: { personId: null }
      });
    } catch (error) {
      console.error('Error unassigning tag from person:', error);
      return undefined;
    }
  }

  async getReadings(options: { tagId?: number, from?: Date, to?: Date, limit?: number, offset?: number } = {}): Promise<{ data: ReadingWithTag[], total: number }> {
    const { tagId, from, to, limit } = options;

    const where: any = {};
    if (tagId !== undefined) {
      where.tagId = tagId;
    }

    if (from && to) {
      where.timestamp = {
        gte: from,
        lte: to
      };
    } else if (from) {
      where.timestamp = {
        gte: from
      };
    } else if (to) {
      where.timestamp = {
        lte: to
      };
    }

    const { offset = 0 } = options;
    
    const total = await prisma.reading.count({ where });
    
    console.log(`Buscando leituras com offset=${offset} e limit=${limit || 'sem limite'}, total=${total}`);
    
    const data = await prisma.reading.findMany({
      where,
      include: { tag: true },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: offset
    });
    
    return { data, total };
  }

  async createReading(reading: InsertReading): Promise<Reading> {
    return await prisma.reading.create({
      data: {
        value: reading.value,
        quality: reading.quality,
        timestamp: reading.timestamp || new Date(),
        tag: {
          connect: {
            id: reading.tagId
          }
        }
      }
    });
  }

  async getLatestReadings(tagIds: number[]): Promise<ReadingWithTag[]> {
    console.log("Buscando leituras recentes para as tags:", tagIds);
    
    try {
      const latestReadings: ReadingWithTag[] = [];
      
      for (const tagId of tagIds) {
        const reading = await prisma.reading.findFirst({
          where: { tagId },
          orderBy: { timestamp: 'desc' },
          include: { tag: true }
        });
        
        if (reading) {
          latestReadings.push(reading);
        }
      }
      
      console.log(`Encontradas ${latestReadings.length} leituras recentes`);
      return latestReadings;
    } catch (error) {
      console.error("Erro ao buscar leituras recentes:", error);
      return []; // Retorna array vazio em caso de erro
    }
  }

  async getSubscriptionSettings(): Promise<SubscriptionSettings[]> {
    return await prisma.subscriptionSetting.findMany({
      orderBy: { id: 'asc' }
    });
  }

  async getDefaultSubscriptionSettings(): Promise<SubscriptionSettings | undefined> {
    const setting = await prisma.subscriptionSetting.findFirst({
      where: { isDefault: true }
    });
    return setting || undefined;
  }

  async updateSubscriptionSettings(id: number, settings: Partial<InsertSubscriptionSettings>): Promise<SubscriptionSettings | undefined> {
    try {
      return await prisma.subscriptionSetting.update({
        where: { id },
        data: settings
      });
    } catch (error) {
      console.error('Error updating subscription settings:', error);
      return undefined;
    }
  }

  async createSubscriptionSettings(settings: InsertSubscriptionSettings & { isDefault?: boolean }): Promise<SubscriptionSettings> {
    if (settings.isDefault) {
      await prisma.subscriptionSetting.updateMany({
        where: { isDefault: true },
        data: { isDefault: false }
      });
    }

    return await prisma.subscriptionSetting.create({
      data: settings
    });
  }

  // Activity log methods
  async getActivityLogs(limit: number = 20): Promise<ActivityLog[]> {
    return await prisma.activityLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: limit
    });
  }

  async createActivityLog(log: InsertActivityLog): Promise<ActivityLog> {
    return await prisma.activityLog.create({
      data: log
    });
  }

  async insertPersonsWithJson(persons: InsertPerson[]): Promise<void> {
    await prisma.$transaction(
      persons.map(person => 
        prisma.person.create({
          data: person
        })
      )
    );
  }
}

export const storage = new PrismaStorage();