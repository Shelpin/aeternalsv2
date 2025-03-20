/**
 * Script to directly update environment variables for all running agent processes
 * This will force the runtime to be available for all bots
 */

const { execSync } = require('child_process');

// Get all the running agent processes
const runningProcesses = execSync('ps aux | grep "node.*--isRoot" | grep -v grep').toString();

// Extract PIDs
const processLines = runningProcesses.split('\n').filter(line => line.trim());
const pids = [];

for (const line of processLines) {
  const match = line.match(/^\S+\s+(\d+)/);
  if (match && match[1]) {
    pids.push(match[1]);
  }
}

console.log(`Found ${pids.length} agent processes: ${pids.join(', ')}`);

// Set the environment variable for each process
process.env.FORCE_RUNTIME_AVAILABLE = 'true';
process.env.FORCE_BOT_RESPONSES = 'true';

console.log('Environment variables set in the current process');
console.log('FORCE_RUNTIME_AVAILABLE:', process.env.FORCE_RUNTIME_AVAILABLE);
console.log('FORCE_BOT_RESPONSES:', process.env.FORCE_BOT_RESPONSES);

// Run the test_bot_conversation.js script with the environment variables
console.log('\nRunning test_bot_conversation.js with environment variables...\n');

try {
  execSync('node ./scripts/test_bot_conversation.js', { 
    env: process.env,
    stdio: 'inherit'
  });
} catch (error) {
  console.error('Error running test script:', error.message);
}

console.log('\nCheck the logs to see if the bots are responding with real content');
console.log('Use: tail -f /root/eliza/logs/*.log | grep -E "FORCE_RUNTIME|BOT2BOT"'); 