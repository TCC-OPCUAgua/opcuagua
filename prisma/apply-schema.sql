-- Script para aplicar manualmente alterações ao schema
-- Este script adiciona campos adicionais que não estão presentes no schema original do Drizzle

-- Adicionar campo updated_at à tabela connections
ALTER TABLE connections ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- Adicionar campo updated_at à tabela people
ALTER TABLE people ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- Adicionar campo updated_at à tabela tags
ALTER TABLE tags ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- Adicionar campo created_at à tabela readings
ALTER TABLE readings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

-- Adicionar campos created_at e updated_at à tabela subscription_settings
ALTER TABLE subscription_settings ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
ALTER TABLE subscription_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;

-- Alterar a relação entre tags e readings para cascade
ALTER TABLE readings DROP CONSTRAINT IF EXISTS readings_tag_id_tags_id_fk;
ALTER TABLE readings ADD CONSTRAINT readings_tag_id_tags_id_fk 
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;

-- Garantir que node_id seja único em tags
ALTER TABLE tags ADD CONSTRAINT IF NOT EXISTS tags_node_id_unique UNIQUE (node_id);