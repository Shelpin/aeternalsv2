#!/usr/bin/env node

/**
 * ElizaOS Agent Start Script with Runtime Patches
 * This script applies the necessary patches before starting the agent
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Get the directory of the current script
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// Parse command line arguments to pass to the agent
const args = process.argv.slice(2);

// Log the process
console.log('🚀 Starting ElizaOS agent with Valhalla runtime patches');
console.log(`📂 Working directory: ${process.cwd()}`);

async function main() {
  try {
    console.log('🔧 Applying runtime patches...');
    // Import and apply the runtime patches
    const patchModule = await import('./runtime-patch.js');
    
    // Get the patched runtime
    const { runtime } = patchModule;
    
    // Make it globally available for plugins to access
    globalThis.__elizaRuntime = runtime;
    
    console.log('✅ Runtime patches applied successfully');
    console.log(`✅ runtime.handleMessage is now ${typeof runtime.handleMessage === 'function' ? 'available' : 'not available'}`);
    
    // Apply relay fixes (in background)
    console.log('🔧 Applying relay fixes...');
    import('./relay-fixes.js')
      .then(() => console.log('✅ Relay fixes applied'))
      .catch(err => console.error('❌ Error applying relay fixes:', err));
    
    // Start the agent process
    console.log('🚀 Starting agent process...');
    
    // Build the command to execute
    const npmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
    
    // Start the agent with the same arguments
    const agentProcess = spawn(npmCmd, ['--filter', '@elizaos/agent', 'start', ...args], {
      stdio: 'inherit',
      env: {
        ...process.env,
        VALHALLA_PATCHED: 'true'
      }
    });
    
    // Handle the agent process events
    agentProcess.on('close', (code) => {
      console.log(`Agent process exited with code ${code}`);
      process.exit(code);
    });
    
    agentProcess.on('error', (err) => {
      console.error('Failed to start agent process:', err);
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Error applying patches:', error);
    process.exit(1);
  }
}

// Run the main function
main().catch(err => {
  console.error('Unhandled error in patch script:', err);
  process.exit(1);
}); 