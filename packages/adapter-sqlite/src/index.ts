import path from "node:path";
import { IDatabaseAdapter, IAgentRuntime } from "@elizaos/types";

/**
 * Simple SQLite adapter class that implements the required interfaces
 */
export class SQLiteAdapter implements IDatabaseAdapter {
    private dbPath: string;
    private connected: boolean = false;

    constructor(dbPath: string) {
        this.dbPath = dbPath;
    }

    /**
     * Connect to a SQLite database
     */
    static connect(dbName: string, options = {}): SQLiteAdapter {
        const dbPath = typeof dbName === 'string'
            ? dbName
            : ':memory:';

        return new SQLiteAdapter(dbPath);
    }

    /**
     * Connect to the database
     */
    async connect(): Promise<void> {
        this.connected = true;
        console.log(`Connected to SQLite database: ${this.dbPath}`);
    }

    /**
     * Disconnect from the database
     */
    async disconnect(): Promise<void> {
        this.connected = false;
        console.log(`Disconnected from SQLite database: ${this.dbPath}`);
    }

    /**
     * Execute a query
     */
    async query(sql: string, params: any[] = []): Promise<any[]> {
        console.log(`Executing query: ${sql}`, params);
        return [];
    }
}

/**
 * Define the adapter factory
 */
export const adapter = {
    init: (runtime: IAgentRuntime): IDatabaseAdapter => {
        const agentId = runtime.agentId;
        const dbPath = path.join(process.cwd(), 'data', `${agentId}.db`);
        return SQLiteAdapter.connect(dbPath);
    }
}; 