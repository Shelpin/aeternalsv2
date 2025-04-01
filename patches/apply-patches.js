/**
 * Valhalla Patch Loader
 * 
 * This script loads and applies all patches needed for Valhalla
 */

console.log('🔧 Loading Valhalla patches...');

try {
  // Load the runtime patch
  const { runtime } = await import('./runtime-patch.js');
  
  // Make it globally available as __elizaRuntime (for plugins to access)
  globalThis.__elizaRuntime = runtime;
  
  // Register handleMessage as a formal runtime action
  if (runtime.registerAction && typeof runtime.handleMessage === 'function') {
    runtime.registerAction({
      name: "handleMessage",
      description: "Message handler",
      handler: runtime.handleMessage.bind(runtime),
      validate: () => true,
      examples: []
    });
    console.log('✅ Registered handleMessage as a formal runtime action');
  } else {
    console.warn('⚠️ Could not register handleMessage action: missing required runtime methods');
  }
  
  console.log('✅ All patches loaded successfully');
  console.log(`✅ Runtime patched with handleMessage: ${typeof runtime.handleMessage === 'function'}`);
} catch (error) {
  console.error('❌ Error loading patches:', error);
  process.exit(1);
}
