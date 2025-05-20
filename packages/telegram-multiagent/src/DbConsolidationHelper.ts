/**
 * Database Consolidation Helper
 * 
 * This class provides a unified approach to database operations
 * using TelegramCoordinationAdapter as the single source of truth.
 */

import path from 'path';
import fs from 'fs';
import { ElizaLogger } from './types.js';
import { TelegramCoordinationAdapter } from './TelegramCoordinationAdapter.js';
import { SqliteDatabaseAdapter } from './SqliteAdapterProxy.js';

/**
 * Database consolidation helper class
 * Ensures consistent database usage across the codebase
 */
export class DbConsolidationHelper {
    // Singleton instance
    private static instance: DbConsolidationHelper;

    // Database constants
    private readonly DEFAULT_DB_PATH = './data/telegram-multiagent.db';

    // Core components
    private dbAdapter: SqliteDatabaseAdapter | null = null;
    private coordinationAdapter: TelegramCoordinationAdapter | null = null;
    private logger: ElizaLogger;

    // Status tracking
    private initialized = false;
    private initError: Error | null = null;
    private initPromise: Promise<void> | null = null;

    /**
     * Private constructor (use getInstance())
     */
    private constructor(logger: ElizaLogger) {
        this.logger = logger;
    }

    /**
     * Get singleton instance
     */
    public static getInstance(logger: ElizaLogger = console): DbConsolidationHelper {
        if (!DbConsolidationHelper.instance) {
            DbConsolidationHelper.instance = new DbConsolidationHelper(logger);
        }
        return DbConsolidationHelper.instance;
    }

    /**
     * Get canonical database path from environment or default
     */
    public getCanonicalDbPath(): string {
        // Check environment variables first (SQLITE_FILE has precedence over DATABASE_PATH)
        const envDbPath = process.env.SQLITE_FILE || process.env.DATABASE_PATH;
        if (envDbPath) {
            this.logger.debug(`[DB_HELPER] Using database path from environment: ${envDbPath}`);
            return envDbPath;
        }

        // Use default path with absolute resolution
        const resolvedPath = path.resolve(this.DEFAULT_DB_PATH);
        this.logger.debug(`[DB_HELPER] Using default database path: ${resolvedPath}`);
        return resolvedPath;
    }

    /**
     * Ensure database path is set in environment variables
     */
    public ensureDbPathInEnvironment(): void {
        const canonicalPath = this.getCanonicalDbPath();

        // Set both environment variables to ensure consistency
        if (!process.env.DATABASE_PATH) {
            process.env.DATABASE_PATH = canonicalPath;
            this.logger.debug(`[DB_HELPER] Set DATABASE_PATH to ${canonicalPath}`);
        }

        if (!process.env.SQLITE_FILE) {
            process.env.SQLITE_FILE = canonicalPath;
            this.logger.debug(`[DB_HELPER] Set SQLITE_FILE to ${canonicalPath}`);
        }
    }

    /**
     * Ensure database directory exists
     */
    public ensureDbDirExists(): void {
        const dbPath = this.getCanonicalDbPath();
        const dbDir = path.dirname(dbPath);

        if (!fs.existsSync(dbDir)) {
            this.logger.info(`[DB_HELPER] Creating database directory: ${dbDir}`);
            fs.mkdirSync(dbDir, { recursive: true });
        } else {
            this.logger.debug(`[DB_HELPER] Database directory exists: ${dbDir}`);
        }
    }

    /**
     * Initialize database adapter
     */
    public async initialize(
        agentId: string,
        runtime: any | null
    ): Promise<TelegramCoordinationAdapter> {
        // Return existing coordination adapter if already initialized
        if (this.initialized && this.coordinationAdapter) {
            return this.coordinationAdapter;
        }

        // Return pending initialization if in progress
        if (this.initPromise) {
            await this.initPromise;
            if (this.coordinationAdapter) {
                return this.coordinationAdapter;
            }
            throw this.initError || new Error('Initialization failed');
        }

        // Start initialization
        this.initPromise = this._initialize(agentId, runtime);

        try {
            await this.initPromise;
            return this.coordinationAdapter!;
        } catch (error) {
            if (error instanceof Error) {
                this.initError = error;
            } else {
                this.initError = new Error(String(error));
            }
            throw this.initError;
        }
    }

    /**
     * Internal initialization method
     */
    private async _initialize(
        agentId: string,
        runtime: any | null
    ): Promise<void> {
        try {
            this.logger.info('[DB_HELPER] Initializing database consolidation helper');

            // Ensure environment variables and directory are set up
            this.ensureDbPathInEnvironment();
            this.ensureDbDirExists();

            const dbPath = this.getCanonicalDbPath();
            this.logger.info(`[DB_HELPER] Using database path: ${dbPath}`);

            // Create SQLite adapter
            this.dbAdapter = new SqliteDatabaseAdapter(dbPath);
            this.logger.info('[DB_HELPER] Created SQLite adapter');

            // Create coordination adapter
            this.coordinationAdapter = new TelegramCoordinationAdapter(
                agentId,
                runtime,
                this.logger,
                this.dbAdapter
            );

            // Initialize coordination adapter
            await this.coordinationAdapter.initialize();
            this.logger.info('[DB_HELPER] Initialized TelegramCoordinationAdapter');

            this.initialized = true;
        } catch (error) {
            this.logger.error('[DB_HELPER] Initialization failed:', error);
            throw error;
        }
    }

    /**
     * Get the coordination adapter
     */
    public getCoordinationAdapter(): TelegramCoordinationAdapter | null {
        return this.coordinationAdapter;
    }

    /**
     * Get the database adapter
     */
    public getDatabaseAdapter(): SqliteDatabaseAdapter | null {
        return this.dbAdapter;
    }

    /**
     * Check if the helper is initialized
     */
    public isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Clean up resources
     */
    public async shutdown(): Promise<void> {
        if (this.coordinationAdapter) {
            try {
                await this.coordinationAdapter.close();
                this.logger.info('[DB_HELPER] Closed coordination adapter');
            } catch (error) {
                this.logger.error('[DB_HELPER] Error closing coordination adapter:', error);
            }
        }

        if (this.dbAdapter) {
            try {
                await this.dbAdapter.close();
                this.logger.info('[DB_HELPER] Closed database adapter');
            } catch (error) {
                this.logger.error('[DB_HELPER] Error closing database adapter:', error);
            }
        }

        this.initialized = false;
        this.initPromise = null;
        this.initError = null;
    }
} 