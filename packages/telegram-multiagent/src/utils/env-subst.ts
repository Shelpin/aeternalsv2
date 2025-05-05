/**
 * Substitutes environment variables in a string.
 * Replaces placeholders like ${VAR_NAME} with the value of process.env.VAR_NAME.
 * 
 * @param input The string containing placeholders.
 * @returns The substituted string, or undefined if any variable was not found.
 */
export function substituteEnvVars(input: string): string | undefined {
    if (typeof input !== 'string') {
        console.error('[EnvSubst] Input is not a string:', input);
        return undefined;
    }
    const regex = /\${([^}]+)}/g;
    let error = false;
    const result = input.replace(regex, (match, varName) => {
        const value = process.env[varName];
        if (value === undefined) {
            console.error(`[EnvSubst] Environment variable ${varName} not found! Placeholder: ${match}`);
            error = true;
            return match; // Keep placeholder if not found to avoid breaking the string structure
        }
        console.log(`[EnvSubst] Substituting ${varName} with value (length: ${value.length})`);
        return value;
    });

    // Return undefined only if an error occurred *and* the string still contains placeholders
    // This allows strings without placeholders to pass through correctly.
    if (error && /\${([^}]+)}/g.test(result)) {
        console.error('[EnvSubst] Substitution failed due to missing variables.');
        return undefined;
    }

    return result;
} 