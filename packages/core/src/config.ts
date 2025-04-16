import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { getModulePath } from './utils/module-path';
import { existsSync } from 'fs';

const modulePaths = getModulePath();
const effectiveDirname = modulePaths.dirname || process.cwd(); // Fallback to cwd if dirname is null

// Load environment variables from root .env file
// Resolve relative to effectiveDirname, trying ../../../ first, then root
let envPath = path.resolve(effectiveDirname, "../../../.env");
if (!existsSync(envPath)) {
    envPath = path.resolve(effectiveDirname, ".env"); // Try root relative to effectiveDirname
    if (!existsSync(envPath)) {
        envPath = path.resolve(process.cwd(), ".env"); // Fallback to cwd root
    }
}

if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
    console.log(`Loaded .env from: ${envPath}`);
} else {
    console.warn("Could not find .env file at expected locations.");
}

/**
 * Gets an environment variable value
 * @param key The environment variable key
 * @param defaultValue Optional default value if the variable is not set
 * @returns The environment variable value or default value
 */
export function getEnvVariable(key: string, defaultValue?: string): string {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Environment variable ${key} is not set`);
    }
    return value;
}

/**
 * Gets a boolean environment variable value
 * @param key The environment variable key
 * @param defaultValue Optional default value if the variable is not set
 * @returns The boolean value of the environment variable
 */
export function getBooleanEnvVariable(key: string, defaultValue?: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Environment variable ${key} is not set`);
    }
    return value.toLowerCase() === 'true';
}

/**
 * Gets a number environment variable value
 * @param key The environment variable key
 * @param defaultValue Optional default value if the variable is not set
 * @returns The number value of the environment variable
 */
export function getNumberEnvVariable(key: string, defaultValue?: number): number {
    const value = process.env[key];
    if (value === undefined) {
        if (defaultValue !== undefined) {
            return defaultValue;
        }
        throw new Error(`Environment variable ${key} is not set`);
    }
    const num = Number(value);
    if (isNaN(num)) {
        throw new Error(`Environment variable ${key} is not a valid number`);
    }
    return num;
}
