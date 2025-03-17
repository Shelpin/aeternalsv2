const ts = require('typescript');
const fs = require('fs');
const path = require('path');

// Load the YOLO tsconfig
const configPath = path.join(__dirname, 'tsconfig.yolo.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

if (configFile.error) {
  console.error(`Error loading tsconfig: ${configFile.error.messageText}`);
  process.exit(1);
}

const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(configPath)
);

// Force emit regardless of errors
parsedConfig.options.noEmitOnError = false;

// Create a program
const program = ts.createProgram(
  parsedConfig.fileNames,
  parsedConfig.options
);

// Emit output
const emitResult = program.emit();

// Get diagnostics
const allDiagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);

// Log diagnostics as warnings but continue
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

console.log(`\n✅ YOLO Build completed with ${allDiagnostics.length} warnings (ignored).`);
console.log(`   Output written to ${parsedConfig.options.outDir || 'dist/'}\n`); 