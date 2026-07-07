import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const rootDir = process.cwd();
const sourceDirs = ["app", "components", "lib"];
const outputPath = path.join(rootDir, "context", "ipxdata-frontend-skeleton.json");
const extensions = new Set([".ts", ".tsx"]);
const ignoredDirs = new Set([
  ".git",
  ".next",
  "context",
  "frontend",
  "node_modules",
  "release",
]);

const files = sourceDirs
  .flatMap((dir) => collectFiles(path.join(rootDir, dir)))
  .sort((left, right) => left.localeCompare(right, "pt-BR"));

const skeleton = {
  generated_at: new Date().toISOString(),
  project: "ipxdata-frontend",
  source_dirs: sourceDirs,
  files: files.map(readSkeletonFile).filter((file) => file.symbols.length),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(skeleton, null, 2)}\n`, "utf8");

console.log(`Code skeleton generated: ${path.relative(rootDir, outputPath)}`);
console.log(`Files scanned: ${files.length}`);
console.log(
  `Symbols indexed: ${skeleton.files.reduce(
    (total, file) => total + file.symbols.length,
    0,
  )}`,
);

function collectFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath));
      continue;
    }

    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function readSkeletonFile(filePath) {
  const sourceText = fs.readFileSync(filePath, "utf8");
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const symbols = [];

  sourceFile.forEachChild((node) => {
    const symbol = symbolFromNode(node, sourceFile);
    if (symbol) symbols.push(symbol);
  });

  return {
    path: normalizePath(path.relative(rootDir, filePath)),
    symbols,
  };
}

function symbolFromNode(node, sourceFile) {
  if (ts.isFunctionDeclaration(node) && node.name) {
    return baseSymbol(node, sourceFile, "function", node.name.text, {
      signature: functionSignature(node),
    });
  }

  if (ts.isClassDeclaration(node) && node.name) {
    return baseSymbol(node, sourceFile, "class", node.name.text);
  }

  if (ts.isInterfaceDeclaration(node)) {
    return baseSymbol(node, sourceFile, "interface", node.name.text, {
      members: node.members.length,
    });
  }

  if (ts.isTypeAliasDeclaration(node)) {
    return baseSymbol(node, sourceFile, "type", node.name.text);
  }

  if (ts.isEnumDeclaration(node)) {
    return baseSymbol(node, sourceFile, "enum", node.name.text, {
      members: node.members.length,
    });
  }

  if (ts.isVariableStatement(node)) {
    return variableSymbols(node, sourceFile);
  }

  return null;
}

function variableSymbols(node, sourceFile) {
  const isExported = hasModifier(node, ts.SyntaxKind.ExportKeyword);
  const symbols = node.declarationList.declarations
    .map((declaration) => {
      if (!ts.isIdentifier(declaration.name)) return null;

      const initializer = declaration.initializer;
      const isCallable =
        initializer &&
        (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer));
      const name = declaration.name.text;
      const looksLikeComponent = /^[A-Z]/.test(name);

      if (!isExported && !isCallable && !looksLikeComponent) return null;

      return baseSymbol(declaration, sourceFile, isCallable ? "const-function" : "const", name, {
        exported: isExported,
        signature: isCallable ? callableVariableSignature(name, initializer) : undefined,
      });
    })
    .filter(Boolean);

  if (!symbols.length) return null;
  return symbols.length === 1
    ? symbols[0]
    : {
        kind: "variable-group",
        line: lineOf(node, sourceFile),
        symbols,
      };
}

function baseSymbol(node, sourceFile, kind, name, extra = {}) {
  return {
    kind,
    name,
    line: lineOf(node, sourceFile),
    exported:
      extra.exported ?? hasModifier(node, ts.SyntaxKind.ExportKeyword),
    ...withoutUndefined(extra),
  };
}

function functionSignature(node) {
  const params = node.parameters.map((param) => cleanText(param.getText())).join(", ");
  const returnType = node.type ? `: ${cleanText(node.type.getText())}` : "";
  return `${node.name?.getText() ?? "anonymous"}(${params})${returnType}`;
}

function callableVariableSignature(name, initializer) {
  if (!initializer || !("parameters" in initializer)) return undefined;
  const params = initializer.parameters
    .map((param) => cleanText(param.getText()))
    .join(", ");
  const returnType = initializer.type
    ? `: ${cleanText(initializer.type.getText())}`
    : "";
  return `${name}(${params})${returnType}`;
}

function hasModifier(node, kind) {
  return Boolean(node.modifiers?.some((modifier) => modifier.kind === kind));
}

function lineOf(node, sourceFile) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function cleanText(value) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function withoutUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  );
}
