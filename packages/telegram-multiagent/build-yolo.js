const ts = require('typescript');
const fs = require('fs');
const path = require('path');

// Create a custom compiler configuration
const compilerOptions = {
  target: ts.ScriptTarget.ES2020,
  module: ts.ModuleKind.CommonJS,
  declaration: true,
  outDir: "./dist",
  strict: false,
  noImplicitAny: false,
  strictNullChecks: false,
  strictPropertyInitialization: false,
  esModuleInterop: true,
  skipLibCheck: true,
  forceConsistentCasingInFileNames: true,
  resolveJsonModule: true,
  sourceMap: true,
  lib: ["ES2020", "DOM"],
  noEmitOnError: false // Force emit regardless of errors
};

// Find all .ts files in the src directory
const srcDir = path.join(__dirname, 'src');
const fileNames = [];

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.ts') && !file.endsWith('.test.ts')) {
      fileNames.push(filePath);
    }
  });
}

walkDir(srcDir);

// Create a program
const program = ts.createProgram(fileNames, compilerOptions);

// Emit output
const emitResult = program.emit();

// Get diagnostics
const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

// Log diagnostics as warnings but continue
if (allDiagnostics.length > 0) {
  console.log("\nTypeScript warnings (ignored in YOLO mode):");
  allDiagnostics.forEach(diagnostic => {
    if (diagnostic.file) {
      const { line, character } = ts.getLineAndCharacterOfPosition(diagnostic.file, diagnostic.start);
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      console.log(`  ${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`);
    } else {
      console.log(`  ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    }
  });
}

console.log(`\n✅ YOLO Build completed with ${allDiagnostics.length} warnings (ignored).`);
console.log(`   Output written to ${compilerOptions.outDir}\n`); 