import {
    AgentRuntime,
    CacheManager,
    CacheStore,
    type Plugin,
    type Character,
    type ClientInstance,
    DbCacheAdapter,
    elizaLogger,
    FsCacheAdapter,
    type IDatabaseAdapter,
    type IDatabaseCacheAdapter,
    type IAgentRuntime,
    type Logger,
    ModelProviderName,
    parseBooleanFromText,
    settings,
    getModulePath,
    stringToUuid,
    validateCharacterConfig,
} from '@elizaos/core';
import { defaultCharacter } from "./defaultCharacter.js";

import bootstrapPlugin from "@elizaos/plugin-bootstrap";
import JSON5 from 'json5';

import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from "commander";
import yargs from 'yargs';
import { applyPatch } from '../../../patches/runtime-patch.js';
import { createRequire } from 'node:module';
// import * as TelegramClientModuleType from '@elizaos/client-telegram'; // For type checking - not strictly needed if using 'any' for module

const { dirname: __dirname } = getModulePath();

export const wait = (minTime = 1000, maxTime = 3000) => {
    const waitTime =
        Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
    return new Promise((resolve) => setTimeout(resolve, waitTime));
};

const logFetch = async (url: string, options: any) => {
    elizaLogger.debug(`Fetching ${url}`);
    // Disabled to avoid disclosure of sensitive information such as API keys
    // elizaLogger.debug(JSON.stringify(options, null, 2));
    return fetch(url, options);
};

export function parseArguments(): { character?: string; characters?: string; clients?: string; plugins?: string; port?: number; 'log-level'?: string } {
    try {
        return yargs(process.argv.slice(2))
            .option('character', {
                alias: 'characters',
                type: 'string',
                describe: 'Path to character JSON file'
            })
            .option('clients', {
                type: 'string',
                describe: 'Comma-separated list of client modules'
            })
            .option('plugins', {
                type: 'string',
                describe: 'Comma-separated list of plugin modules'
            })
            .option('port', {
                type: 'number',
                describe: 'Port for agent HTTP server'
            })
            .option('log-level', {
                type: 'string',
                describe: 'Logging level'
            })
            .parseSync();
    } catch (error) {
        console.error('Error parsing arguments:', error);
        return {};
    }
}

function tryLoadFile(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch (e) {
        return null;
    }
}
function mergeCharacters(base: Character, child: Character): Character {
    const mergeObjects = (baseObj: any, childObj: any) => {
        const result: any = {};
        const keys = new Set([
            ...Object.keys(baseObj || {}),
            ...Object.keys(childObj || {}),
        ]);
        keys.forEach((key) => {
            if (
                typeof baseObj[key] === "object" &&
                typeof childObj[key] === "object" &&
                !Array.isArray(baseObj[key]) &&
                !Array.isArray(childObj[key])
            ) {
                result[key] = mergeObjects(baseObj[key], childObj[key]);
            } else if (
                Array.isArray(baseObj[key]) ||
                Array.isArray(childObj[key])
            ) {
                result[key] = [
                    ...(baseObj[key] || []),
                    ...(childObj[key] || []),
                ];
            } else {
                result[key] =
                    childObj[key] !== undefined ? childObj[key] : baseObj[key];
            }
        });
        return result;
    };
    return mergeObjects(base, child);
}
/* function isAllStrings(arr: unknown[]): boolean {
    return Array.isArray(arr) && arr.every((item) => typeof item === "string");
}
export async function loadCharacterFromOnchain(): Promise<Character[]> {
    const jsonText = onchainJson;

    console.log("JSON:", jsonText);
    if (!jsonText) return [];
    const loadedCharacters = [];
    try {
        const character = JSON5.parse(jsonText);
        validateCharacterConfig(character);

        // .id isn't really valid
        const characterId = character.id || character.name;
        const characterPrefix = `CHARACTER.${characterId
            .toUpperCase()
            .replace(/ /g, "_")}.`;

        const characterSettings = Object.entries(process.env)
            .filter(([key]) => key.startsWith(characterPrefix))
            .reduce((settings, [key, value]) => {
                const settingKey = key.slice(characterPrefix.length);
                settings[settingKey] = value;
                return settings;
            }, {});

        if (Object.keys(characterSettings).length > 0) {
            character.settings = character.settings || {};
            character.settings.secrets = {
                ...characterSettings,
                ...character.settings.secrets,
            };
        }

        // Handle plugins
        if (isAllStrings(character.plugins)) {
            elizaLogger.info("Plugins are: ", character.plugins);
            const importedPlugins = await Promise.all(
                character.plugins.map(async (plugin) => {
                    const importedPlugin = await import(plugin);
                    return importedPlugin.default;
                })
            );
            character.plugins = importedPlugins;
        }

        loadedCharacters.push(character);
        elizaLogger.info(
            `Successfully loaded character from: ${process.env.IQ_WALLET_ADDRESS}`
        );
        return loadedCharacters;
    } catch (e) {
        elizaLogger.error(
            `Error parsing character from ${process.env.IQ_WALLET_ADDRESS}: ${e}`
        );
        process.exit(1);
    }
} */

async function loadCharactersFromUrl(url: string): Promise<Character[]> {
    try {
        const response = await fetch(url);
        const responseJson = await response.json();

        let characters: Character[] = [];
        if (Array.isArray(responseJson)) {
            characters = await Promise.all(
                responseJson.map((character) => jsonToCharacter(url, character))
            );
        } else {
            const character = await jsonToCharacter(url, responseJson);
            characters.push(character);
        }
        return characters;
    } catch (e) {
        console.error(`Error loading character(s) from ${url}: `, e);
        process.exit(1);
    }
}

// Merge top-level secrets into settings.secrets for proper substitution
// (the JSON uses a top-level `secrets` field, but substitution logic looks in `settings.secrets`)
function normalizeSecrets(character: any): void {
    if (character.secrets) {
        character.settings = character.settings || {};
        character.settings.secrets = {
            ...character.settings.secrets,
            ...character.secrets
        };
        // Also overwrite top-level secrets so plugin override sees the real token
        character.secrets = {
            ...character.settings.secrets
        };
    }
}

async function jsonToCharacter(
    filePath: string,
    character: any
): Promise<Character> {
    validateCharacterConfig(character);
    // Bring top-level secrets into settings for substitution
    normalizeSecrets(character);

    // .id isn't really valid
    const characterId = character.id || character.name;
    const characterPrefix = `CHARACTER.${characterId
        .toUpperCase()
        .replace(/ /g, "_")}.`;

    const characterSettings = Object.entries(process.env)
        .filter(([key]) => key.startsWith(characterPrefix))
        .reduce((settings, [key, value]) => {
            const settingKey = key.slice(characterPrefix.length);
            return { ...settings, [settingKey]: value };
        }, {} as Record<string, string>);

    if (Object.keys(characterSettings).length > 0) {
        character.settings = character.settings || {};
        character.settings.secrets = {
            ...characterSettings,
            ...character.settings.secrets,
        };
    }

    // Explicitly handle environment variable substitution for Telegram token
    if (
        character.settings?.secrets?.TELEGRAM_BOT_TOKEN?.startsWith("${") &&
        character.settings.secrets.TELEGRAM_BOT_TOKEN.endsWith("}")
    ) {
        const envVarName = character.settings.secrets.TELEGRAM_BOT_TOKEN.slice(2, -1);
        // Try direct env var, then fallback to generic TELEGRAM_BOT_TOKEN
        let envVarValue = process.env[envVarName] || process.env.TELEGRAM_BOT_TOKEN;
        if (envVarValue) {
            elizaLogger.debug(`Substituting ${envVarName} for TELEGRAM_BOT_TOKEN`);
            character.settings.secrets.TELEGRAM_BOT_TOKEN = envVarValue;
        } else {
            elizaLogger.warn(`Environment variable ${envVarName} not found for TELEGRAM_BOT_TOKEN substitution.`);
        }
        const token = character.settings.secrets.TELEGRAM_BOT_TOKEN;
        const maskedToken = token && token.length > 6 ?
            `${token.slice(0, 3)}...${token.slice(-3)}` : token;
        elizaLogger.debug(`[DEBUG] TELEGRAM_BOT_TOKEN after substitution: ${maskedToken}`);
    }

    // Handle extends
    if (character.extends) {
        elizaLogger.info(
            `Merging  ${character.name} character with parent characters`
        );
        for (const extendPath of character.extends) {
            const baseCharacter = await loadCharacter(
                path.resolve(path.dirname(filePath), extendPath)
            );
            character = mergeCharacters(baseCharacter, character);
            elizaLogger.info(
                `Merged ${character.name} with ${baseCharacter.name}`
            );
        }
    }
    return character;
}

async function loadCharacter(filePath: string): Promise<Character> {
    const content = tryLoadFile(filePath);
    if (!content) {
        throw new Error(`Character file not found: ${filePath}`);
    }
    const character = JSON5.parse(content);
    return jsonToCharacter(filePath, character);
}

async function loadCharacterTryPath(characterPath: string): Promise<Character> {
    let content: string | null = null;
    let resolvedPath = "";

    // Try different path resolutions in order
    const pathsToTry = [
        characterPath, // exact path as specified
        path.resolve(process.cwd(), characterPath), // relative to cwd
        path.resolve(process.cwd(), "agent", characterPath), // Add this
        path.resolve(__dirname, characterPath), // relative to current script
        path.resolve(__dirname, "characters", path.basename(characterPath)), // relative to agent/characters
        path.resolve(__dirname, "../characters", path.basename(characterPath)), // relative to characters dir from agent
        path.resolve(
            __dirname,
            "../../characters",
            path.basename(characterPath)
        ), // relative to project root characters dir
    ];

    elizaLogger.debug(
        "Trying paths:",
        pathsToTry.map((p) => ({
            path: p,
            exists: fs.existsSync(p),
        }))
    );

    for (const tryPath of pathsToTry) {
        content = tryLoadFile(tryPath);
        if (content !== null) {
            resolvedPath = tryPath;
            break;
        }
    }

    if (content === null) {
        elizaLogger.error(
            `Error loading character from ${characterPath}: File not found in any of the expected locations`
        );
        elizaLogger.error("Tried the following paths:");
        pathsToTry.forEach((p) => elizaLogger.error(` - ${p}`));
        throw new Error(
            `Error loading character from ${characterPath}: File not found in any of the expected locations`
        );
    }
    try {
        const character: Character = await loadCharacter(resolvedPath);
        elizaLogger.success(`Successfully loaded character from: ${resolvedPath}`);
        return character;
    } catch (e) {
        console.error(`Error parsing character from ${resolvedPath}: `, e);
        throw new Error(`Error parsing character from ${resolvedPath}: ${e}`);
    }
}

function commaSeparatedStringToArray(commaSeparated: string): string[] {
    return commaSeparated?.split(",").map((value) => value.trim());
}

async function readCharactersFromStorage(
    characterPaths: string[]
): Promise<string[]> {
    try {
        const uploadDir = path.join(process.cwd(), "data", "characters");
        await fs.promises.mkdir(uploadDir, { recursive: true });
        const fileNames = await fs.promises.readdir(uploadDir);
        fileNames.forEach((fileName) => {
            characterPaths.push(path.join(uploadDir, fileName));
        });
    } catch (err) {
        elizaLogger.error(`Error reading directory: ${err.message}`);
    }

    return characterPaths;
}

export async function loadCharacters(
    charactersArg: string
): Promise<Character[]> {
    let characterPaths = commaSeparatedStringToArray(charactersArg);

    if (process.env.USE_CHARACTER_STORAGE === "true") {
        characterPaths = await readCharactersFromStorage(characterPaths);
    }

    const loadedCharacters: Character[] = [];

    if (characterPaths?.length > 0) {
        for (const characterPath of characterPaths) {
            try {
                const character: Character = await loadCharacterTryPath(
                    characterPath
                );
                loadedCharacters.push(character);
            } catch (e) {
                process.exit(1);
            }
        }
    }

    if (hasValidRemoteUrls()) {
        elizaLogger.info("Loading characters from remote URLs");
        const characterUrls = commaSeparatedStringToArray(
            process.env.REMOTE_CHARACTER_URLS
        );
        for (const characterUrl of characterUrls) {
            const characters = await loadCharactersFromUrl(characterUrl);
            loadedCharacters.push(...characters);
        }
    }

    if (loadedCharacters.length === 0) {
        elizaLogger.info("No characters found, using default character");
        loadedCharacters.push(defaultCharacter);
    }

    return loadedCharacters;
}

async function handlePluginImporting(plugins: string[]) {
    // ADDED LOGGING
    console.log("[PLUGIN_IMPORT_DEBUG] handlePluginImporting received:", plugins);
    if (!Array.isArray(plugins)) {
        console.error("[PLUGIN_IMPORT_ERROR] Input to handlePluginImporting is not an array!", plugins);
        return [];
    }
    if (plugins.some(p => typeof p !== 'string')) {
        console.error("[PLUGIN_IMPORT_ERROR] Input array to handlePluginImporting contains non-string elements!", plugins);
        // Potentially throw an error or filter non-strings
    }

    if (plugins.length > 0) {
        // ADDED LOGGING
        console.log("[PLUGIN_IMPORT_DEBUG] Calling Promise.all with the plugins array...");
        const importedPlugins = await Promise.all(
            plugins.map(async (plugin, index) => {
                // console.log(`[PLUGIN_IMPORT_DEBUG] Mapping plugin at index ${index}. Value:`, plugin, `Type: ${typeof plugin}`);

                // Attempt to import the plugin specifier
                let importedModule: any;
                try {
                    importedModule = await import(plugin);
                } catch (importError) {
                    console.log(`[PLUGIN_IMPORT_DEBUG] Direct import failed for plugin at index ${index}. Value:`, plugin, `Type: ${typeof plugin}`);
                    console.error('[PLUGIN_IMPORT_DEBUG] Direct import error:', importError);

                    console.log(`[PLUGIN_IMPORT_DEBUG] Entering fallback logic for plugin: ${plugin}`);
                    try {
                        if (typeof plugin !== 'string') {
                            console.error(`[PLUGIN_IMPORT_ERROR] Plugin variable is not a string before split! Index: ${index}, Type: ${typeof plugin}, Value:`, plugin);
                            return false;
                        }
                        const pkgParts = plugin.split('/');
                        const pkgName = pkgParts[1];
                        const workspaceEntry = path.resolve(
                            __dirname,             // .../packages/agent/dist
                            '../../..',            // up to /root/eliza
                            'packages',
                            pkgName,
                            'dist',
                            'src',
                            'index.js'
                        );
                        try {
                            importedModule = await import(workspaceEntry);
                        } catch (workspaceError) {
                            console.error(`Plugin import failed for ${plugin}:`, importError);
                            console.error(`Workspace import failed for ${plugin}:`, workspaceError);
                            return false;
                        }
                    } catch (splitError) {
                        console.error(`[PLUGIN_IMPORT_ERROR] Error during plugin.split or path construction for plugin: ${plugin}. Error:`, splitError);
                        return false;
                    }
                }
                const functionName =
                    plugin.replace("@elizaos/plugin-", "")
                        .replace("@elizaos-plugins/plugin-", "")
                        .replace(/-./g, (x) => x[1].toUpperCase()) + "Plugin";
                if (!(importedModule as any)[functionName] && !(importedModule as any).default) {
                    elizaLogger.warn(plugin, 'does not have a default export or', functionName);
                }
                const pluginInstance = (importedModule as any).default || (importedModule as any)[functionName];
                if (!pluginInstance) {
                    elizaLogger.error(`Could not find default export or named export ${functionName} for plugin ${plugin}`);
                    return false;
                }
                return pluginInstance;
            })
        );
        return importedPlugins.filter(p => !!p);
    } else {
        return [];
    }
}

export function getTokenForProvider(
    provider: ModelProviderName,
    character: Character
): string | undefined {
    // VALHALLA FIX: Ensure settings is treated as 'any' to avoid TS errors
    const anySettings = settings as any;

    switch (provider) {
        // no key needed for llama_local, ollama, lmstudio, gaianet or bedrock
        case ModelProviderName.LLAMALOCAL:
            return "";
        case ModelProviderName.OLLAMA:
            return "";
        case ModelProviderName.LMSTUDIO:
            return "";
        case ModelProviderName.GAIANET:
            return (
                character.settings?.secrets?.GAIA_API_KEY ||
                anySettings.GAIA_API_KEY
            );
        case ModelProviderName.BEDROCK:
            return "";
        case ModelProviderName.OPENAI:
            return (
                character.settings?.secrets?.OPENAI_API_KEY ||
                anySettings?.OPENAI_API_KEY
            );
        case ModelProviderName.ETERNALAI:
            return (
                character.settings?.secrets?.ETERNALAI_API_KEY ||
                anySettings.ETERNALAI_API_KEY
            );
        case ModelProviderName.NINETEEN_AI:
            return "";
        case ModelProviderName.LLAMACLOUD:
        case ModelProviderName.TOGETHER:
            return (
                character.settings?.secrets?.LLAMACLOUD_API_KEY ||
                anySettings.LLAMACLOUD_API_KEY ||
                character.settings?.secrets?.TOGETHER_API_KEY ||
                anySettings.TOGETHER_API_KEY ||
                character.settings?.secrets?.OPENAI_API_KEY ||
                anySettings.OPENAI_API_KEY
            );
        case ModelProviderName.CLAUDE_VERTEX:
        case ModelProviderName.ANTHROPIC:
            return (
                character.settings?.secrets?.ANTHROPIC_API_KEY ||
                character.settings?.secrets?.CLAUDE_API_KEY ||
                anySettings.ANTHROPIC_API_KEY ||
                anySettings.CLAUDE_API_KEY
            );
        case ModelProviderName.REDPILL:
            return (
                character.settings?.secrets?.REDPILL_API_KEY ||
                anySettings.REDPILL_API_KEY
            );
        case ModelProviderName.OPENROUTER:
            return (
                character.settings?.secrets?.OPENROUTER_API_KEY ||
                anySettings.OPENROUTER_API_KEY
            );
        case ModelProviderName.GROK:
            return (
                character.settings?.secrets?.GROK_API_KEY ||
                anySettings?.GROK_API_KEY
            );
        case ModelProviderName.HEURIST:
            return (
                character.settings?.secrets?.HEURIST_API_KEY ||
                anySettings.HEURIST_API_KEY
            );
        case ModelProviderName.GROQ:
            return (
                character.settings?.secrets?.GROQ_API_KEY ||
                anySettings.GROQ_API_KEY
            );
        case ModelProviderName.GALADRIEL:
            return (
                character.settings?.secrets?.GALADRIEL_API_KEY ||
                anySettings.GALADRIEL_API_KEY
            );
        case ModelProviderName.FAL:
            return (
                character.settings?.secrets?.FAL_API_KEY || anySettings.FAL_API_KEY
            );
        case ModelProviderName.ALI_BAILIAN:
            return (
                character.settings?.secrets?.ALI_BAILIAN_API_KEY ||
                anySettings.ALI_BAILIAN_API_KEY
            );
        case ModelProviderName.VOLENGINE:
            return (
                character.settings?.secrets?.VOLENGINE_API_KEY ||
                anySettings.VOLENGINE_API_KEY
            );
        case ModelProviderName.NANOGPT:
            return (
                character.settings?.secrets?.NANOGPT_API_KEY ||
                anySettings.NANOGPT_API_KEY
            );
        case ModelProviderName.HYPERBOLIC:
            return (
                character.settings?.secrets?.HYPERBOLIC_API_KEY ||
                anySettings.HYPERBOLIC_API_KEY
            );

        case ModelProviderName.VENICE:
            return (
                character.settings?.secrets?.VENICE_API_KEY ||
                anySettings.VENICE_API_KEY
            );
        case ModelProviderName.ATOMA:
            return (
                character.settings?.secrets?.ATOMASDK_BEARER_AUTH ||
                anySettings.ATOMASDK_BEARER_AUTH
            );
        case ModelProviderName.NVIDIA:
            return (
                character.settings?.secrets?.NVIDIA_API_KEY ||
                anySettings.NVIDIA_API_KEY
            );
        case ModelProviderName.AKASH_CHAT_API:
            return (
                character.settings?.secrets?.AKASH_CHAT_API_KEY ||
                character.settings?.secrets?.AKASH_API_KEY ||
                anySettings.AKASH_CHAT_API_KEY ||
                anySettings.AKASH_API_KEY
            );
        case ModelProviderName.GOOGLE:
            return (
                character.settings?.secrets?.GOOGLE_GENERATIVE_AI_API_KEY ||
                anySettings.GOOGLE_GENERATIVE_AI_API_KEY
            );
        case ModelProviderName.MISTRAL:
            return (
                character.settings?.secrets?.MISTRAL_API_KEY ||
                anySettings.MISTRAL_API_KEY
            );
        case ModelProviderName.LETZAI:
            return (
                character.settings?.secrets?.LETZAI_API_KEY ||
                anySettings.LETZAI_API_KEY
            );
        case ModelProviderName.INFERA:
            return (
                character.settings?.secrets?.INFERA_API_KEY ||
                anySettings.INFERA_API_KEY
            );
        case ModelProviderName.DEEPSEEK:
            return (
                character.settings?.secrets?.DEEPSEEK_API_KEY ||
                anySettings.DEEPSEEK_API_KEY
            );
        case ModelProviderName.LIVEPEER:
            return (
                character.settings?.secrets?.LIVEPEER_GATEWAY_URL ||
                anySettings.LIVEPEER_GATEWAY_URL
            );
        case ModelProviderName.SECRETAI:
            return (
                character.settings?.secrets?.SECRET_AI_API_KEY ||
                anySettings.SECRET_AI_API_KEY
            );
        case ModelProviderName.NEARAI:
            try {
                const config = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.nearai/config.json'), 'utf8'));
                return JSON.stringify(config?.auth);
            } catch (e) {
                elizaLogger.warn(`Error loading NEAR AI config: ${e}`);
            }
            return (
                character.settings?.secrets?.NEARAI_API_KEY ||
                anySettings.NEARAI_API_KEY
            );

        default:
            const errorMessage = `Failed to get token - unsupported model provider: ${provider}`;
            elizaLogger.error(errorMessage);
            throw new Error(errorMessage);
    }
}

// VALHALLA FIX: Rewritten function to handle command-line clients
export async function initializeClients(
    runtime: AgentRuntime,
    clientArg: string,
    logger: Logger,
) {
    if (!clientArg) {
        logger.info('No --clients argument provided. Skipping client initialization.');
        return;
    }
    logger.info(`Initializing clients based on --clients arg: ${clientArg}`);
    const clientNames = clientArg.split(',').map(name => name.trim());

    for (const clientName of clientNames) {
        try {
            logger.info(`Attempting to import client: ${clientName}`);
            const agentGlobalRuntime = globalThis.__elizaRuntime as any;

            const clientModule: any = await import(clientName); // Use any for clientModule to simplify access

            // NEW DETAILED IMPORT LOGGING
            logger.info(`[IMPORT_DEBUG] clientModule raw import type: ${typeof clientModule}`);
            if (clientModule) {
                logger.info(`[IMPORT_DEBUG] clientModule keys: ${Object.keys(clientModule).join(', ')}`);
                logger.info(`[IMPORT_DEBUG] typeof clientModule.default: ${typeof clientModule.default}`);
                logger.info(`[IMPORT_DEBUG] typeof clientModule.TelegramClient: ${typeof clientModule.TelegramClient}`);
            }
            // END NEW LOGGING

            if (clientName === '@elizaos/telegram-client') {
                logger.info(`Handling special initialization for ${clientName}`);

                let tClient = clientModule.default; // Access default export for the singleton

                // DIAGNOSTIC LOGGING START
                logger.info(`[DEBUG_CLIENT] tClient acquired. Type: ${typeof tClient}`);
                if (tClient) {
                    logger.info(`[DEBUG_CLIENT] tClient keys: ${Object.keys(tClient).join(', ')}`);
                    logger.info(`[DEBUG_CLIENT] typeof tClient.initialize: ${typeof tClient.initialize}`);
                    logger.info(`[DEBUG_CLIENT] typeof tClient.constructor: ${typeof tClient.constructor}`);
                    if (tClient.constructor) {
                        logger.info(`[DEBUG_CLIENT] tClient.constructor.name: ${tClient.constructor.name}`);
                    }
                } else {
                    logger.warn('[DEBUG_CLIENT] tClient is null or undefined after assignment from clientModule.default');
                }
                // DIAGNOSTIC LOGGING END

                if (!tClient) {
                    logger.error(`Could not access default export (expected telegramClient singleton) from ${clientName}. Attempting to create new instance.`);
                    if (clientModule.TelegramClient) { // Access named export for the class
                        tClient = new clientModule.TelegramClient();
                    } else {
                        logger.error(`Cannot find default export or TelegramClient class export in ${clientName}`);
                        continue;
                    }
                }

                // Use globalThis.__elizaRuntime to access the patched getSecret method
                const token = await (globalThis.__elizaRuntime as any)?.getSecret?.('TELEGRAM_BOT_TOKEN');
                if (!token) {
                    logger.error(`TELEGRAM_BOT_TOKEN not found for ${clientName}. Client cannot initialize.`);
                    continue;
                }

                if (typeof tClient.initialize === 'function') {
                    tClient.initialize(token, runtime);
                } else {
                    logger.error(`Imported telegramClient from ${clientName} does not have an initialize method.`);
                    continue;
                }

                let actualClientInstance = tClient; // Use the tClient that was initialized

                if (actualClientInstance) {
                    logger.info(`Successfully created/retrieved actualClientInstance for ${clientName}. Type: ${typeof actualClientInstance}`);
                    runtime.clients.push(actualClientInstance); // Client is pushed here

                    // >>> NEW DEBUG LOGGING MOVED HERE <<<
                    const globalRuntimeClients = (globalThis.__elizaRuntime as any)?.clients;
                    logger.info(`[CLIENT_INIT_DEBUG] After pushing ${clientName}: runtime.clients length: ${runtime.clients ? runtime.clients.length : 'null/undefined'}`);
                    logger.info(`[CLIENT_INIT_DEBUG] Is runtime.clients === globalThis.__elizaRuntime.clients? ${runtime.clients === globalRuntimeClients}`);
                    // >>> END NEW DEBUG LOGGING <<<

                    logger.info(`[VALHALLA] Telegram client mounted to runtime: ${runtime.clients.includes(actualClientInstance)}`);
                    logger.info(`Successfully initialized ${clientName}. Client is on runtime.`);
                } else {
                    logger.error(`Failed to obtain actualClientInstance for ${clientName} after import and setup.`);
                }

            } else if (clientModule && typeof clientModule.start === 'function') {
                logger.info(`Calling start() on client module: ${clientName}`);
                const clientInstance = await clientModule.start(
                    runtime.character,
                    runtime,
                    logger,
                );
                if (clientInstance && clientInstance.client) {
                    if (!(runtime as any).clients) {
                        logger.warn(
                            'runtime.clients was not initialized (expected proxy). Initializing as empty object.',
                        );
                        (runtime as any).clients = {};
                    }
                    ((runtime as any).clients as any)[clientName] = clientInstance.client;

                    if (agentGlobalRuntime) {
                        if (!agentGlobalRuntime.clients) {
                            agentGlobalRuntime.clients = {};
                        }
                        (agentGlobalRuntime.clients as any)[clientName] = clientInstance.client;
                        logger.info(
                            `Set client ${clientName} on globalThis.__elizaRuntime.clients.${clientName}`,
                        );
                    } else {
                        logger.warn(
                            'globalThis.__elizaRuntime not found. Cannot set client on global runtime instance for proxy.',
                        );
                    }
                    logger.info(`Successfully initialized client: ${clientName}`);
                } else {
                    logger.error(
                        `Client module ${clientName} did not return a valid client instance or client property.`,
                    );
                }
            } else {
                logger.error(
                    `Client module ${clientName} does not have a recognized initialization pattern (e.g., 'start' function, or isn\'t '@elizaos/telegram-client').`,
                );
            }
        } catch (error) {
            logger.error(`Error initializing client ${clientName}: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
            // if (error instanceof Error) logger.error(error.stack);
        }
    }
    logger.info("Finished client initialization process.");
}

export async function createAgent(
    character: Character,
    token: string
): Promise<AgentRuntime> {
    elizaLogger.log(`Creating runtime for character ${character.name}`);

    // VALHALLA FIX: Process plugin strings here before creating runtime
    let processedPlugins: any[] = [];
    if (character.plugins && Array.isArray(character.plugins) && character.plugins.every((item: unknown) => typeof item === "string")) {
        elizaLogger.info(`Importing ${character.plugins.length} plugin names specified in character config...`);
        try {
            processedPlugins = await handlePluginImporting(character.plugins as string[]);
            elizaLogger.info(`Successfully imported ${processedPlugins.length} plugins.`);
        } catch (pluginError) {
            elizaLogger.error(`Error importing plugins specified in character config: ${pluginError}`);
            // Decide if we should throw or continue without plugins
            processedPlugins = [];
        }
    } else if (character.plugins && Array.isArray(character.plugins)) {
        // Assume plugins are already processed objects if not all strings
        elizaLogger.debug('Plugins array seems to contain pre-processed objects.');
        processedPlugins = character.plugins;
    }

    return new AgentRuntime({
        token,
        modelProvider: character.modelProvider,
        evaluators: [],
        character, // Pass original character data
        plugins: processedPlugins, // Pass the processed plugin OBJECTS
        fetch: logFetch,
    });
}

async function initializeCache(runtime: AgentRuntime, character: any): Promise<CacheManager | null> {
    const cacheConfig = character.cache || settings.CACHE_CONFIG;
    if (!cacheConfig?.store) {
        elizaLogger.warn("Cache store not configured. Skipping cache initialization.");
        return null;
    }

    let cacheAdapter;

    switch (cacheConfig.store) {
        case CacheStore.DATABASE:
            elizaLogger.info("Using Database cache store.");
            const dbCacheAdapter = await findDatabaseAdapter(runtime);
            if (!dbCacheAdapter || !(dbCacheAdapter as any).get || !(dbCacheAdapter as any).set) {
                elizaLogger.error("Database adapter does not support caching. Cannot initialize Database cache.");
                return null;
            }
            cacheAdapter = new DbCacheAdapter(dbCacheAdapter as IDatabaseCacheAdapter, runtime.agentId);
            break;
        case CacheStore.FILESYSTEM:
            elizaLogger.info("Using Filesystem cache store.");
            const fsCachePath = cacheConfig.path || settings.CACHE_FS_PATH;
            cacheAdapter = new FsCacheAdapter(fsCachePath);
            break;
        default:
            elizaLogger.error(`Unsupported cache store type: ${cacheConfig.store}`);
            return null;
    }

    const cache = new CacheManager(cacheAdapter);
    return cache;
}

async function findDatabaseAdapter(runtime: AgentRuntime) {
    const { adapters } = runtime;
    let adapterInstance: IDatabaseAdapter & IDatabaseCacheAdapter | undefined;
    if (adapters.length === 0) {
        // Dynamically import the SQLite adapter and connect using configured file path
        const { SQLiteAdapter } = await import('@elizaos/adapter-sqlite');
        // Use SQLITE_FILE env var if provided, otherwise fallback to agent ID as file name
        const dbPath = process.env.SQLITE_FILE || `${runtime.agentId}.sqlite`;
        elizaLogger.info(`Connecting to SQLite database at path: ${dbPath}`);
        adapterInstance = await SQLiteAdapter.connect(dbPath) as IDatabaseAdapter & IDatabaseCacheAdapter;
    } else if (adapters.length === 1) {
        // If an adapter was already provided (e.g., by another plugin), use its init method
        if (adapters[0] && typeof adapters[0].init === 'function') {
            adapterInstance = adapters[0].init(runtime) as IDatabaseAdapter & IDatabaseCacheAdapter;
        } else {
            elizaLogger.error('Provided adapter plugin does not have a valid init function.');
        }
        if (!adapterInstance) {
            throw new Error("Internal error: Provided database adapter plugin could not be initialized.");
        }
    } else {
        throw new Error("Multiple database adapters found. You must have no more than one. Adjust your plugins configuration.");
    }
    // Return the initialized adapter instance
    return adapterInstance;
}

async function startAgent(
    character: Character,
    clientsArg?: string
): Promise<AgentRuntime> {
    const agentId = character.id || stringToUuid(character.name);
    elizaLogger.log("Starting agent:", character.name, agentId);
    let db: IDatabaseAdapter & IDatabaseCacheAdapter | undefined;
    try {
        character.id ??= stringToUuid(character.name);
        character.username ??= character.name;

        const token = getTokenForProvider(character.modelProvider, character);

        const runtime: AgentRuntime = await createAgent(
            character,
            token
        );

        // initialize database
        // find a db from the plugins (or default to sqlite)
        db = await findDatabaseAdapter(runtime);
        runtime.databaseAdapter = db; // Assign the initialized adapter instance

        // initialize cache
        const cache = await initializeCache(runtime, character);
        runtime.cacheManager = cache;

        // initialize clients first so they are available to plugins
        if (clientsArg) {
            await initializeClients(runtime, clientsArg, elizaLogger);
        } else {
            elizaLogger.info('No clientsArg provided to startAgent, skipping client initialization within startAgent.');
        }

        // start services/plugins/process knowledge
        await runtime.initialize();

        // add to container
        // if (directClient) {
        //   runtime.clients = [...(runtime.clients || []), directClient];
        //   directClient.registerAgent(runtime);
        // }

        // report to console
        elizaLogger.debug(`Started ${character.name} as ${runtime.agentId}`);

        return runtime;
    } catch (error) {
        elizaLogger.error(
            `Error starting agent for character ${character.name}:`,
            error
        );
        elizaLogger.error(error);
        if (db) {
            // VALHALLA FIX: Use disconnect() instead of close() as defined in SQLiteAdapter
            await db.disconnect();
        }
        throw error;
    }
}

const checkPortAvailable = (port: number): Promise<boolean> => {
    return new Promise((resolve) => {
        const server = net.createServer();

        server.once("error", (err: NodeJS.ErrnoException) => {
            if (err.code === "EADDRINUSE") {
                resolve(false);
            }
        });

        server.once("listening", () => {
            server.close();
            resolve(true);
        });

    });
};

const hasValidRemoteUrls = () =>
    process.env.REMOTE_CHARACTER_URLS &&
    process.env.REMOTE_CHARACTER_URLS !== "" &&
    process.env.REMOTE_CHARACTER_URLS.startsWith("http");

/**
 * Post processing of character after loading
 * @param character
 */
const handlePostCharacterLoaded = async (character: Character): Promise<Character> => {
    let processedCharacter = character;
    // Filtering the plugins with the method of handlePostCharacterLoaded
    const processors = character?.postProcessors?.filter(p => typeof p.handlePostCharacterLoaded === 'function');
    if (processors?.length > 0) {
        processedCharacter = Object.assign({}, character, { postProcessors: undefined });
        // process the character with each processor
        // the order is important, so we loop through the processors
        for (let i = 0; i < processors.length; i++) {
            const processor = processors[i];
            processedCharacter = await processor.handlePostCharacterLoaded(processedCharacter);
        }
    }
    return processedCharacter;
}

const startAgents = async () => {
    elizaLogger.log("Starting agents...");

    const args = parseArguments();
    const charactersArg = args.characters || args.character;
    const clientsArg = args.clients; // Get the clients string from parsed args
    let characters: Character[] = [defaultCharacter];

    if ((charactersArg) || hasValidRemoteUrls()) {
        characters = await loadCharacters(charactersArg);
    }

    try {
        for (const character of characters) {
            const processedCharacter = await handlePostCharacterLoaded(character);
            // Pass clientsArg to startAgent
            const runtime = await startAgent(processedCharacter, clientsArg);
            // Pass runtime to the client initialization if needed, but don't pass DirectClient instance
            // const runtime = await startAgent(processedCharacter, directClient);
            // const serverPort = Number.parseInt(settings.SERVER_PORT || "3000");
            // directClient.start(serverPort);
        }
    } catch (error) {
        elizaLogger.error("Error starting agents:", error);
    }

    // Check if the requested port is available
    const isPortAvailable = await checkPortAvailable(Number.parseInt(settings.SERVER_PORT || "3000"));
    if (!isPortAvailable) {
        elizaLogger.warn(`Port ${settings.SERVER_PORT} is already in use. Attempting to find an available port...`);
        // Implement logic to find the next available port if needed
        // For now, we might just increment or use a fallback
        const serverPort = Number.parseInt(settings.SERVER_PORT || "3000") + 1; // Simple increment, might need better logic
        elizaLogger.info(`Trying port ${serverPort} instead.`);
    }

    // VALHALLA FIX: Repeat type assertion here
    if (Number.parseInt(settings.SERVER_PORT || "3000") !== Number.parseInt(settings.SERVER_PORT || "3000")) {
        elizaLogger.log(`Starting server on different port: ${settings.SERVER_PORT}`);
    }

    // Setup Express server
    // ... existing code ...

    // upload some agent functionality into directClient
    // This is used in client-direct/api.ts at "/agents/:agentId/set" route to restart an agent
    // const directClient = new DirectClient();
    // const serverPort = Number.parseInt(settings.SERVER_PORT || "3000");
    // directClient.start(serverPort);

    elizaLogger.success(
        `All ${characters.length} agents started successfully.`
    );
};

startAgents().catch((error) => {
    elizaLogger.error("Unhandled error in startAgents:", error);
    process.exit(1);
});

// Ensure patch runs *after* initial agent setup completes
applyPatch().then(() => {
    elizaLogger.info('[PATCH] applyPatch() completed successfully after agent start.');
}).catch(patchError => {
    elizaLogger.error('[PATCH] Error running applyPatch() after agent start:', patchError);
});

// Prevent unhandled exceptions from crashing the process if desired
if (
    process.env.PREVENT_UNHANDLED_EXIT &&
    parseBooleanFromText(process.env.PREVENT_UNHANDLED_EXIT)
) {
    // Handle uncaught exceptions to prevent the process from crashing
    process.on("uncaughtException", (err) => {
        console.error("uncaughtException", err);
    });

    // Handle unhandled rejections to prevent the process from crashing
    process.on("unhandledRejection", (err) => {
        console.error("unhandledRejection", err);
    });
}
