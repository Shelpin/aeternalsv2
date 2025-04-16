import { UUID } from './types';

/**
 * Validates a UUID string
 * @param uuid The UUID string to validate
 * @returns true if valid, false otherwise
 */
export function validateUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Validates a character configuration object
 * @param config The character config to validate
 * @returns true if valid, false otherwise
 */
export function validateCharacterConfig(config: any): boolean {
    if (!config || typeof config !== 'object') {
        return false;
    }

    // Check required fields
    if (!config.name || typeof config.name !== 'string') {
        return false;
    }

    if (!config.description || typeof config.description !== 'string') {
        return false;
    }

    if (!config.personality || typeof config.personality !== 'string') {
        return false;
    }

    // Check optional fields if they exist
    if (config.settings && typeof config.settings !== 'object') {
        return false;
    }

    if (config.memories && !Array.isArray(config.memories)) {
        return false;
    }

    return true;
} 