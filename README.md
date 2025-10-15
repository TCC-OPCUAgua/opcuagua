
## Overview
O OPC-UÁgua é um sistema de monitoramento do nível de água em tempo real que se conecta aos servidores OPC UA para rastrear dados de sensores em diversos locais. O aplicativo permite que os usuários naveguem pelos nós do OPC UA, assinem tags para monitoramento em tempo real, associem tags a pessoas/locais e visualizem dados históricos por meio de gráficos e mapas.

O sistema é construído como uma aplicação TypeScript full-stack com front-end React e back-end Express, utilizando Prisma ORM para operações de banco de dados e WebSockets para streaming de dados em tempo real.

## Iniciando a aplicação
Utilize o comando `npm i` para instalar as dependências

Configure a .env com as informações do seu banco de dados PostgreSQL (postgresql://user:senha@host:port/opcuagua?schema=public)

Em seguida utilize o comando `npx prisma generate` para inicializar o Prisma

Após, `npx prisma migrate dev` para gerar o banco dentro do PostgreSQL

Por fim, `npm run dev` para iniciar a aplicação na porta 5000

### Frontend Architecture

**Framework & Build System**
- React 18 com TypeScript como UI framework
- Vite como build tool e development server
- Wouter para client-side routin

**UI Component System**
- shadcn/ui components (Radix UI primitives)
- Tailwind CSS v4

**State Management**
- React Context API estados globais (NavigationContext, OpcUaContext)
- TanStack Query (React Query) para gerenciamento de estado do servidor e armazenamento em cache
- WebSocket hook (useWebSocket) para sincronização de dados em tempo real

### Backend Architecture

**Server Framework**
- Express.js com TypeScript
- WebSocket Server (ws library) para comunicação bidirecional em tempo real

**OPC UA Integration**
- node-opcua library como cliente OPC UA

### Data Storage Architecture

**ORM & Database**
- Prisma ORM
- PostgreSQL
