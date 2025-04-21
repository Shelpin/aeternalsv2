import { IDatabaseAdapter, UUID } from "@elizaos/types";
import { createLogger } from "./runtime.js";

const logger = createLogger("Database");

/**
 * Base database adapter implementation
 */
export abstract class DatabaseAdapter<DB = any> implements IDatabaseAdapter {
    protected db: DB;

    constructor(db: DB) {
        this.db = db;
    }

    /**
     * Connects to the database
     */
    connect(): Promise<void> {
        logger.info("Connecting to database");
        return Promise.resolve();
    }

    /**
     * Disconnects from the database
     */
    disconnect(): Promise<void> {
        logger.info("Disconnecting from database");
        return Promise.resolve();
    }

    /**
     * Executes a query
     */
    query(sql: string, params?: any[]): Promise<any[]> {
        logger.debug("Executing query", { sql, params });
        return Promise.resolve([]);
    }

    /**
     * Creates a new participant
     */
    createParticipant(userId: UUID, roomId: UUID, metadata?: any): Promise<boolean> {
        logger.debug("Creating participant", { userId, roomId });
        return Promise.resolve(true);
    }

    /**
     * Removes a participant
     */
    removeParticipant(userId: UUID, roomId: UUID): Promise<boolean> {
        logger.debug("Removing participant", { userId, roomId });
        return Promise.resolve(true);
    }
} 