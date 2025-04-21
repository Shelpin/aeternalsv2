#!/usr/bin/env node

/**
 * Script to fix import extensions in the ElizaOS codebase
 * Based on the deterministic build plan
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Log to both console and file
const LOG_DIR = 'reports/implementation2104';
const LOG_FILE = path.join(LOG_DIR, 'import-extensions-fix.log');

function log(message) {
    console.log(message);
    fs.appendFileSync(LOG_FILE, message + '\n');
}

// Initialize log file
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}
fs.writeFileSync(LOG_FILE, `# Import Extensions Fix Log - ${new Date().toISOString()}\n\n`);

// Fix patterns for common import extension issues
const fixPatterns = [
    {
        // Fix multiple .js extensions (.js.js.js)
        pattern: /from ['"](\.\.?\/[^'"]*?)\.js\.js\.js['"]/g,
        replacement: 'from \'$1.js\''
    },
    {
        // Fix double .js extensions (.js.js)
        pattern: /from ['"](\.\.?\/[^'"]*?)\.js\.js['"]/g,
        replacement: 'from \'$1.js\''
    },
    {
        // Add missing .js extensions to relative imports
        pattern: /from ['"](\.\.?\/[^'"]*?)(?!\.js)['"]/g,
        replacement: (match, p1) => {
            // Don't add .js if it's already there or if it's a directory import
            if (p1.endsWith('.js') || p1.endsWith('/')) {
                return match;
            }
            return `from '${p1}.js'`;
        }
    }
];

// Walk the packages directory and fix imports
function walkAndFix(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && entry.name !== 'dist') {
                walkAndFix(fullPath);
            }
        } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                let updatedContent = content;
                let changed = false;

                // Apply fixes
                for (const fix of fixPatterns) {
                    const newContent = updatedContent.replace(fix.pattern, fix.replacement);
                    if (newContent !== updatedContent) {
                        changed = true;
                        updatedContent = newContent;
                    }
                }

                // Write back if changed
                if (changed) {
                    fs.writeFileSync(fullPath, updatedContent);
                    log(`Fixed imports in ${fullPath}`);
                }
            } catch (error) {
                log(`Error processing ${fullPath}: ${error.message}`);
            }
        }
    }
}

// Start fixing
log('Starting to fix import extensions...');
walkAndFix(path.join(process.cwd(), 'packages'));

log('Import extension fix process completed.'); 