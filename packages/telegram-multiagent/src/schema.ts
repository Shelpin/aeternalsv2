/**
 * SQL schema for Telegram Multi-Agent coordination tables
 */
export const telegramMultiAgentSchema = `
-- Table: telegram_groups
CREATE TABLE IF NOT EXISTS "telegram_groups" (
    "group_id" TEXT PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "member_count" INTEGER DEFAULT 0,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "is_active" INTEGER DEFAULT 1
);

-- Table: agent_telegram_assignments
CREATE TABLE IF NOT EXISTS "agent_telegram_assignments" (
    "assignment_id" TEXT PRIMARY KEY,
    "agent_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "role" TEXT DEFAULT 'PARTICIPANT',
    "is_active" INTEGER DEFAULT 1,
    "activation_schedule" TEXT,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ("agent_id") REFERENCES "accounts"("id"),
    FOREIGN KEY ("group_id") REFERENCES "telegram_groups"("group_id")
);

-- Table: conversation_topics
CREATE TABLE IF NOT EXISTS "conversation_topics" (
    "topic_id" TEXT PRIMARY KEY,
    "group_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT DEFAULT 'PENDING',
    "priority" INTEGER DEFAULT 5,
    "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "scheduled_for" TIMESTAMP,
    "started_at" TIMESTAMP,
    "completed_at" TIMESTAMP,
    "initiator_agent_id" TEXT,
    FOREIGN KEY ("group_id") REFERENCES "telegram_groups"("group_id"),
    FOREIGN KEY ("initiator_agent_id") REFERENCES "accounts"("id")
);

-- Table: agent_conversation_participants
CREATE TABLE IF NOT EXISTS "agent_conversation_participants" (
    "participation_id" TEXT PRIMARY KEY,
    "agent_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "role" TEXT DEFAULT 'PARTICIPANT',
    "invitation_status" TEXT DEFAULT 'PENDING',
    "invited_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "joined_at" TIMESTAMP,
    "left_at" TIMESTAMP,
    FOREIGN KEY ("agent_id") REFERENCES "accounts"("id"),
    FOREIGN KEY ("topic_id") REFERENCES "conversation_topics"("topic_id")
);

-- Table: conversation_message_metrics
CREATE TABLE IF NOT EXISTS "conversation_message_metrics" (
    "metric_id" TEXT PRIMARY KEY,
    "topic_id" TEXT NOT NULL,
    "timestamp" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "total_messages" INTEGER DEFAULT 0,
    "human_messages" INTEGER DEFAULT 0,
    "agent_messages" INTEGER DEFAULT 0,
    "engagement_score" REAL DEFAULT 0,
    FOREIGN KEY ("topic_id") REFERENCES "conversation_topics"("topic_id")
);

-- Table: agent_message_history
CREATE TABLE IF NOT EXISTS "agent_message_history" (
    "message_id" TEXT PRIMARY KEY,
    "agent_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "topic_id" TEXT,
    "content" TEXT NOT NULL,
    "sent_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "is_to_human" INTEGER DEFAULT 0,
    "is_from_human" INTEGER DEFAULT 0,
    "recipient_agent_id" TEXT,
    FOREIGN KEY ("agent_id") REFERENCES "accounts"("id"),
    FOREIGN KEY ("group_id") REFERENCES "telegram_groups"("group_id"),
    FOREIGN KEY ("topic_id") REFERENCES "conversation_topics"("topic_id"),
    FOREIGN KEY ("recipient_agent_id") REFERENCES "accounts"("id")
);

-- Index: agent_telegram_assignments_agent_group_idx
CREATE UNIQUE INDEX IF NOT EXISTS "agent_telegram_assignments_agent_group_idx" 
    ON "agent_telegram_assignments" ("agent_id", "group_id");

-- Index: conversation_topics_status_idx
CREATE INDEX IF NOT EXISTS "conversation_topics_status_idx" 
    ON "conversation_topics" ("status", "scheduled_for");

-- Index: agent_conversation_participants_topic_idx
CREATE INDEX IF NOT EXISTS "agent_conversation_participants_topic_idx" 
    ON "agent_conversation_participants" ("topic_id");

-- Index: conversation_message_metrics_topic_timestamp_idx
CREATE INDEX IF NOT EXISTS "conversation_message_metrics_topic_timestamp_idx" 
    ON "conversation_message_metrics" ("topic_id", "timestamp");

-- Index: agent_message_history_agent_idx
CREATE INDEX IF NOT EXISTS "agent_message_history_agent_idx"
    ON "agent_message_history" ("agent_id", "sent_at");

-- Index: agent_message_history_group_idx
CREATE INDEX IF NOT EXISTS "agent_message_history_group_idx"
    ON "agent_message_history" ("group_id", "sent_at");

-- Index: agent_message_history_topic_idx
CREATE INDEX IF NOT EXISTS "agent_message_history_topic_idx"
    ON "agent_message_history" ("topic_id", "sent_at");
`; 