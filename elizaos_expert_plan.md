# 🛠️ Deterministic Build Fix Plan for Aeternals / ElizaOS

## ✅ Objective
Fix all TypeScript and module resolution issues across ElizaOS packages to enable a clean, reproducible build that allows agent startup via `pnpm build`.

---

## 🧩 Key Root Issues to Address

### ❌ TypeScript & Module Resolution
- `@elizaos/core/public-api` lacks valid `.d.ts` files → causes `TS7016` errors.
- Misconfigured `declaration` and `declarationDir` in tsconfigs.
- Missing `.js` extensions in imports with ESM (`nodenext`).
- Incorrect relative imports (e.g., `import './index'` needs to be `import './index.js'`).
- Output file mismatches (TS6305) between packages due to build order issues.
- Potential circular dependencies causing resolution problems.

### ❌ Runtime Safety
- Nullish access on `runtime.character?.secrets?.XYZ` without guards.
- Undefined function references (`TS2722`, `TS2532`).
- Conditions that always evaluate to true (`TS2774`).
- Unsafe type casts and implicit `any` types.
- Missing runtime structure validation before access.

### ❌ Mixed Toolchains
- `tsup` used in `@elizaos/telegram-client`, but `tsc` in `@elizaos/telegram-multiagent`.
- Inconsistent `main`/`exports` fields (e.g. `main: "dist/index.c.c"` typo in telegram-multiagent).
- Different output formats (CJS vs ESM) causing interoperability issues.
- Missing explicit type declarations that IDEs and tools rely on.
- Inconsistent TypeScript versions causing different compiler behaviors.

### ❌ Package Misalignment
- Circular and invalid workspace filters (`@elizaos/client-telegram` ≠ `@elizaos/clients/telegram`).
- Dependencies misdeclared or missing (e.g. missing type references).
- Build order not respecting dependency tree.
- Stale build artifacts causing cascading errors.

---

## 🧭 Step-by-Step Fix Plan

### 🔁 Phase 0: Setup and Environment Preparation

#### 🔨 1. Pin TypeScript Version
- [ ] Add explicit TypeScript version to root package.json:
```json
"devDependencies": {
  "typescript": "4.9.5"  // Or appropriate version
}
```
- [ ] Run to ensure all packages use the same version:
```bash
pnpm -r exec -- rm -rf node_modules/.pnpm/typescript@*
pnpm install
```

#### 📊 2. Generate Dependency Graph (Before)
- [ ] Install madge if not present: `pnpm add -D madge`
- [ ] Generate a visual representation of current dependencies:
```bash
npx madge --image before-dependency-graph.png --ts-config ./tsconfig.json ./packages/*/src/index.ts
```
- [ ] Analyze for circular dependencies:
```bash
npx madge --circular --extensions ts ./packages
```

#### 📌 3. Add TypeScript Path Mappings
- [ ] Add path mappings to base tsconfig.json as a fallback resolution mechanism:
```json
// In tsconfig.base.json
"compilerOptions": {
  "paths": {
    "@elizaos/core/*": ["./packages/core/src/*"],
    "@elizaos/adapter-sqlite/*": ["./packages/adapter-sqlite/src/*"],
    "@elizaos/telegram-multiagent/*": ["./packages/telegram-multiagent/src/*"],
    "@elizaos/clients/telegram/*": ["./packages/clients/telegram/src/*"]
    // Add other packages as needed
  }
}
```

### 🔁 Phase 1: Core Package Success

#### 🧹 4. Add prebuild cleanup across all packages
- [ ] Ensure each package.json has a proper prebuild script:
```json
"scripts": {
  "prebuild": "rimraf dist",
  "build": "tsc -p tsconfig.build.json"
}
```
- [ ] This prevents stale artifacts from causing misleading TS6305 errors
- [ ] Run cleanup across all packages:
```bash
pnpm -r exec -- rimraf dist
```

#### 🧹 5. Focus on core package first
- [ ] Enhance `tsconfig.build.json` with special flags for dependency resolution:
```json
{
  "compilerOptions": {
    "declaration": true,
    "declarationDir": "dist",
    "declarationMap": true, 
    "composite": true,   // Enables project references
    "emitDeclarationOnly": true  // Focus on .d.ts files for other packages
  }
}
```
- [ ] Ensure declaration files are created before other packages are built
- [ ] Rebuild `@elizaos/core` standalone:
```bash
cd packages/core && pnpm run build
```
- [ ] Validate `dist/index.d.ts` and `dist/public-api.d.ts` exist before proceeding.

#### ✅ 6. Verify core package importability
- [ ] Create a simple verification script to test importing from core:
```js
// verify-core.mjs
import * as core from '@elizaos/core';
console.log('Successfully imported core:', Object.keys(core));
```
- [ ] Run the verification:
```bash
node verify-core.mjs
```
- [ ] Fix any import errors before proceeding to other packages

#### 🧠 7. Fix `public-api.ts` module usage
- [ ] Change import paths to ESM-safe in all packages:
```ts
// ❌ import { x } from '@elizaos/core/public-api';
// ✅ replace with
import { x } from '@elizaos/core/public-api.js';
```
- [ ] Add `.js` extensions to local file imports consistently:
```ts
// ❌ import { Component } from './Component';
// ✅ import { Component } from './Component.js';
```
- [ ] Fix all imports between local files to include .js extension (critical for NodeNext resolution):
```ts
// ❌ import { utils } from './utils';
// ✅ import { utils } from './utils.js';
```

---

### 📦 Phase 2: tsconfig Fixes

#### ⚙️ 8. Standardize all `tsconfig.build.json`
- [ ] Ensure all packages extend from same base config: `../../tsconfig.base.json`
- [ ] Set consistent compiler options:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "declaration": true,
    "declarationDir": "dist",
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```
- [ ] Normalize module system to "nodenext" across all packages (avoid mixing with "commonjs")

#### 🔒 9. Fix null safety issues in telegram-multiagent
- [ ] Fix specific errors in TelegramMultiAgentPlugin.ts and other files:
```ts
// Line 826 - Object is possibly 'undefined'
if (this.relay && this.relay.sendMessage) {
    await this.relay.sendMessage(/* params */);
}

// Line 1006 - Condition always true
// ❌ if (this.function)
// ✅ Replace with:
this.function();

// Line 1310 - Cannot invoke possibly undefined
if (runtime && runtime.handleMessage) {
    return await runtime.handleMessage(message);
}

// Line 1902 - Possibly null
if (message && message.telegram) {
    // use message.telegram
}
```

- [ ] Add missing type annotations to fix implicit 'any' types:
```ts
// Line 1639 - 'minimalTelegramClient' implicitly has type 'any'
// ❌ const minimalTelegramClient = { /* ... */ };
// ✅ Replace with:
const minimalTelegramClient: TelegramClient = { /* ... */ };
```

- [ ] Validate runtime structures early in functions:
```ts
// For better runtime safety, validate structures upfront
function processMessage(message: any): void {
  // Validate required structure before processing
  if (!message || typeof message !== 'object') {
    this.logger.error('Invalid message structure');
    return;
  }
  
  const { chatId, text, from } = message;
  
  // Now use validated properties
  // ...
}
```

- [ ] Fix type errors in index.ts:
```ts
// Lines 26-27 - Property does not exist on type '{}'
// Add proper type guards:
const character = runtime?.character || {};
const token = character.secrets?.TELEGRAM_BOT_TOKEN || 
    character.settings?.secrets?.TELEGRAM_BOT_TOKEN;
```

---

### 📐 Phase 3: Package.json Standardization

#### 🛠️ 10. Fix package.json configuration in all packages
- [ ] Fix main field and add types field for all packages:
```json
"main": "./dist/index.cjs",
"types": "./dist/index.d.ts",
"type": "module"
```

- [ ] Add proper exports field for dual ESM/CommonJS support:
```json
"exports": {
  ".": {
    "import": "./dist/index.js",
    "require": "./dist/index.cjs",
    "types": "./dist/index.d.ts"
  }
}
```

- [ ] Fix specific issues in telegram-multiagent package.json:
```json
// ❌ "main": "dist/index.c.c",  // Typo
// ✅ Replace with:
"main": "./dist/index.cjs",
```

- [ ] Fix handleMessage type definition in TelegramMultiAgentPlugin:
```ts
// Add missing method to class interface
handleMessage(message: any): Promise<any> {
    // implementation or adapter to runtime.handleMessage
}
```

#### 🔄 11. Fix workspace aliases
- [ ] Align references: ensure consistent usage of `@elizaos/clients/telegram` (not `@elizaos/client-telegram`).
- [ ] Update package filter in build scripts to use correct package path:
```json
"build:all": "pnpm --filter='@elizaos/core' --filter='@elizaos/adapter-sqlite' --filter='@elizaos/agent' --filter='@elizaos/client-direct' --filter='@elizaos/clients/telegram' --filter='@elizaos/telegram-multiagent' --filter='@elizaos/dynamic-imports' --filter='@elizaos/plugin-bootstrap' -r run build"
```
- [ ] Consider future refactor (after fixing immediate issues):
```
// Potential future improvement (not for immediate fix)
// Rename clients/telegram folder to telegram-client for clearer structure
```

#### 🧰 12. Standardize build tools
- [ ] Option 1: Standardize on `tsc`
  - Convert `telegram-client` from tsup to tsc
  - Create consistent tsconfig.build.json
  
- [ ] Option 2: Standardize on `tsup` (recommended)
  - Add `tsup.config.js` to all packages:
```js
import { defineConfig } from 'tsup';
export default defineConfig({
  entry: ['src/index.ts'],
  dts: true,
  format: ['esm', 'cjs'],
  outDir: 'dist',
  clean: true,
});
```
  - Update all package.json build scripts:
```json
"scripts": {
  "prebuild": "rimraf dist",
  "build": "tsup --config tsup.config.js"
}
```

---

### 🚀 Phase 4: Incremental Build and Verification

#### 🔄 13. Implement build dependency order with verification
- [ ] Create a build script that respects dependencies and verifies after each step:
```bash
#!/bin/bash
set -e
echo "Building packages in proper order..."

# Function to verify a package can be imported
verify_package() {
  PKG=$1
  echo "Verifying $PKG..."
  echo "import * as pkg from '$PKG';" > verify-$PKG.mjs
  echo "console.log('Successfully imported $PKG');" >> verify-$PKG.mjs
  if node verify-$PKG.mjs; then
    echo "✅ $PKG verification successful"
    rm verify-$PKG.mjs
    return 0
  else
    echo "❌ $PKG verification failed"
    return 1
  fi
}

# Core dependencies first
echo "Building @elizaos/core..."
pnpm --filter @elizaos/core build
verify_package '@elizaos/core'

echo "Building @elizaos/adapter-sqlite..."
pnpm --filter @elizaos/adapter-sqlite build
verify_package '@elizaos/adapter-sqlite'

echo "Building @elizaos/dynamic-imports..."
pnpm --filter @elizaos/dynamic-imports build
verify_package '@elizaos/dynamic-imports'

# Mid-level dependencies
echo "Building @elizaos/plugin-bootstrap..."
pnpm --filter @elizaos/plugin-bootstrap build
verify_package '@elizaos/plugin-bootstrap'

echo "Building @elizaos/clients/telegram..."
pnpm --filter @elizaos/clients/telegram build
verify_package '@elizaos/clients/telegram'

# Higher-level components
echo "Building @elizaos/telegram-multiagent..."
pnpm --filter @elizaos/telegram-multiagent build
verify_package '@elizaos/telegram-multiagent'

echo "Building @elizaos/client-direct..."
pnpm --filter @elizaos/client-direct build
verify_package '@elizaos/client-direct'

echo "Building @elizaos/agent..."
pnpm --filter @elizaos/agent build
verify_package '@elizaos/agent'

echo "All packages built and verified successfully!"
```

#### 📊 14. Generate updated dependency graph
- [ ] Generate a visual representation of the fixed dependencies:
```bash
npx madge --image after-dependency-graph.png --ts-config ./tsconfig.json ./packages/*/dist/index.js
```
- [ ] Verify no circular dependencies remain:
```bash
npx madge --circular --extensions js ./packages/*/dist
```

#### ✅ 15. Full verification
- [ ] Run the ordered build script
- [ ] Check for any remaining TypeScript errors
- [ ] Verify all declaration files are generated correctly
- [ ] Test importing between packages before continuing
- [ ] Check for ESM/CJS compatibility issues

#### 🧪 16. Validate runtime
- [ ] Run sample agent with telegram integration:
```bash
# Using the launch-agent.sh script with eth_memelord_9000
./scripts/launch-agent.sh eth_memelord_9000 3000
```
- [ ] Confirm proper telegram relay server connectivity
- [ ] Verify no runtime errors with undefined or null properties
- [ ] Test inter-agent communication via relay

#### 🧹 17. Clean up and document
- [ ] Remove unused `tsconfig.*.json` variants
- [ ] Validate `exports` and `main` fields in all package.json files
- [ ] Add .gitignore entries for any remaining build artifacts
- [ ] Create build documentation with:
  - Dependency graph images (before/after)
  - Build order requirements
  - Common pitfalls and solutions
  - Instructions for adding new packages

---

## 📦 Success Criteria
- ✅ All packages build cleanly without TS6305 or TS7016 errors
- ✅ No TS2307, TS2532, or other TypeScript errors
- ✅ Declaration files (.d.ts) generated for all public APIs
- ✅ Telegram bot starts without runtime error
- ✅ Agents respond with memory and state awareness
- ✅ Inter-agent communication works via relay server
- ✅ Consistent and reproducible build process
- ✅ All packages have proper declaration files that IDEs can resolve
- ✅ Verification scripts successfully import all packages
- ✅ No circular dependencies in the dependency graph

---

## 🧩 Optional Enhancements
- [ ] Add `type-check` script to CI
- [ ] Add `build:all` orchestrated shell script with strict ordering
- [ ] Add `.eslint.js` or `tsconfig.lint.json` for editor integration
- [ ] Implement automatic detection of circular dependencies with `madge`
- [ ] Create a development quickstart guide based on the fixed build process
- [ ] Add integration tests for the telegram-multiagent package
- [ ] Enforce declaration generation checks in CI:
```bash
find . -name '*.d.ts' | grep -q . || (echo 'Missing declarations!' && exit 1)
```
- [ ] Consider folder restructuring for cleaner architecture (clients/telegram → telegram-client)
- [ ] Set up automatic pre-commit hooks to enforce .js extensions in imports

---

## 📄 Troubleshooting Common Issues

### TS6305: Output File Has Not Been Built
If you see `error TS6305: Output file '/path/to/file.d.ts' has not been built from source file...`:
1. Ensure the dependency package was built first
2. Check that `composite: true` is set in the dependency's tsconfig
3. Try using `emitDeclarationOnly: true` for dependency packages
4. Manually verify the .d.ts file exists in the expected location

### Missing Declaration Files
If `*.d.ts` files are not being generated, check:
1. `declaration: true` is set in tsconfig
2. `declarationDir` points to the correct output directory
3. No TypeScript errors in the source code (declarations won't generate with errors)
4. `emitDeclarationOnly: true` might help focus the build on just declarations

### ESM Import Issues
For ESM-related errors:
1. Always include `.js` extension in import paths, even for TypeScript files
2. Use proper package.json "exports" field configuration
3. Ensure "type": "module" is set for ESM packages

### Type Safety Problems
For runtime null/undefined errors:
1. Use optional chaining (`?.`) consistently
2. Add explicit type guards (`if (x !== undefined)`)
3. Provide fallback values with nullish coalescing (`??`)
4. Use proper runtime adapter patterns for interface compatibility
5. Add explicit type annotations to avoid implicit `any`

### CommonJS/ESM Interoperability
For hybrid module usage:
1. Use proper "exports" field configuration with both "import" and "require" conditions
2. Ensure both .cjs and .js files are generated
3. Add explicit "types" field alongside "exports" for better IDE support

### Import Verification Failures
If the verification scripts fail:
1. Check that the package's entry point is correctly specified in package.json
2. Verify the package has been built (dist folder exists with .js files)
3. Ensure the package can be resolved (check node_modules/.pnpm links)
4. Try importing specific subpaths if the main entry fails

---

Let's start executing these steps—ping me when you're ready for the first phase!

