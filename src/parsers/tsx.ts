import { Node, Project, ts, type JsxAttribute, type ObjectLiteralExpression, type SourceFile, type TaggedTemplateExpression } from 'ts-morph'
import { camelToKebab, scanValue } from './scan.js'
import { scanTailwindClasses } from './tailwind.js'
import type { ParserOptions } from './css.js'
import type { Candidate } from '../types.js'

let sharedProject: Project | undefined

function getProject(): Project {
  sharedProject ??= new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      jsx: ts.JsxEmit.Preserve,
      allowJs: true,
      target: ts.ScriptTarget.ESNext,
    },
  })
  return sharedProject
}

const STYLED_TAG_RE = /^(styled|css|keyframes|createGlobalStyle)\b/
const TEMPLATE_PROP_RE = /^\s*([a-zA-Z-]+)\s*:/
/** Class-name builder calls whose string arguments are scanned for Tailwind values. */
const CLASS_CALL_RE = /^(clsx|classnames|classNames|cn|cx|cva|tw|twMerge|twJoin)$/

/**
 * Extract candidates from TSX/JSX source: imports, inline style objects,
 * styled-components templates, and (when enabled) Tailwind class attributes.
 */
export function extractTsxCandidates(
  source: string,
  label: string,
  options: ParserOptions = {},
): Candidate[] {
  const project = getProject()
  const sourceFile = project.createSourceFile(`/virtual/${label}`, source, { overwrite: true })
  try {
    const candidates: Candidate[] = []
    // Class strings can be reached twice (a cn() call inside className);
    // chunk offsets dedupe the scans.
    const seen = new Set<number>()
    collectImports(sourceFile, label, candidates)
    sourceFile.forEachDescendant((node) => {
      if (Node.isJsxAttribute(node)) {
        const name = node.getNameNode().getText()
        if (name === 'style') {
          const initializer = node.getInitializer()
          const expression = Node.isJsxExpression(initializer) ? initializer.getExpression() : undefined
          if (expression !== undefined && Node.isObjectLiteralExpression(expression)) {
            collectStyleObject(expression, sourceFile, label, candidates)
          }
        } else if (options.tailwind === true && (name === 'className' || name === 'class')) {
          collectClassAttribute(node, sourceFile, label, seen, candidates)
        }
      } else if (options.tailwind === true && Node.isCallExpression(node)) {
        const callee = node.getExpression()
        if (Node.isIdentifier(callee) && CLASS_CALL_RE.test(callee.getText())) {
          for (const argument of node.getArguments()) {
            collectClassStrings(argument, sourceFile, label, seen, candidates)
          }
        }
      } else if (Node.isTaggedTemplateExpression(node)) {
        collectTaggedTemplate(node, sourceFile, label, candidates)
      }
    })
    return candidates
  } finally {
    sourceFile.forget()
  }
}

function collectClassAttribute(
  attribute: JsxAttribute,
  sourceFile: SourceFile,
  label: string,
  seen: Set<number>,
  out: Candidate[],
): void {
  const initializer = attribute.getInitializer()
  const expression = Node.isJsxExpression(initializer) ? initializer.getExpression() : initializer
  if (expression === undefined) return
  collectClassStrings(expression, sourceFile, label, seen, out)
}

/**
 * Scan every string literal and template chunk reachable under `node` for
 * Tailwind arbitrary values. Covers plain strings, templates, ternaries,
 * clsx-style object keys, and cva variant maps.
 */
function collectClassStrings(
  node: Node,
  sourceFile: SourceFile,
  label: string,
  seen: Set<number>,
  out: Candidate[],
): void {
  const scanChunk = (text: string, offset: number): void => {
    if (seen.has(offset)) return
    seen.add(offset)
    for (const match of scanTailwindClasses(text)) {
      const pos = sourceFile.getLineAndColumnAtPos(offset + match.index)
      const candidate: Candidate = {
        kind: match.kind,
        value: match.value,
        file: label,
        line: pos.line,
        column: pos.column,
      }
      if (match.prop !== undefined) candidate.prop = match.prop
      out.push(candidate)
    }
  }
  const visit = (n: Node): void => {
    if (Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n)) {
      scanChunk(n.getLiteralText(), n.getStart() + 1)
    } else if (Node.isTemplateExpression(n)) {
      scanChunk(n.getHead().getLiteralText(), n.getHead().getStart() + 1)
      for (const span of n.getTemplateSpans()) {
        scanChunk(span.getLiteral().getLiteralText(), span.getLiteral().getStart() + 1)
      }
    }
  }
  visit(node)
  node.forEachDescendant(visit)
}

function collectImports(sourceFile: SourceFile, label: string, out: Candidate[]): void {
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.isTypeOnly()) continue
    const names: string[] = []
    const defaultImport = declaration.getDefaultImport()
    if (defaultImport !== undefined && /^[A-Z]/.test(defaultImport.getText())) {
      names.push(defaultImport.getText())
    }
    const namespaceImport = declaration.getNamespaceImport()
    if (namespaceImport !== undefined && /^[A-Z]/.test(namespaceImport.getText())) {
      names.push(namespaceImport.getText())
    }
    for (const named of declaration.getNamedImports()) {
      if (named.isTypeOnly()) continue
      if (/^[A-Z]/.test(named.getName())) names.push(named.getName())
    }
    if (names.length === 0) continue
    const pos = sourceFile.getLineAndColumnAtPos(declaration.getStart())
    out.push({
      kind: 'import',
      value: declaration.getModuleSpecifierValue(),
      file: label,
      line: pos.line,
      column: pos.column,
      importNames: names,
    })
  }
}

function collectStyleObject(
  object: ObjectLiteralExpression,
  sourceFile: SourceFile,
  label: string,
  out: Candidate[],
): void {
  for (const property of object.getProperties()) {
    if (!Node.isPropertyAssignment(property)) continue
    const nameNode = property.getNameNode()
    const rawName = Node.isStringLiteral(nameNode) ? nameNode.getLiteralText() : nameNode.getText()
    const prop = rawName.startsWith('--') ? rawName : camelToKebab(rawName)
    const initializer = property.getInitializer()
    if (initializer === undefined) continue

    if (Node.isStringLiteral(initializer) || Node.isNoSubstitutionTemplateLiteral(initializer)) {
      const text = initializer.getLiteralText()
      // +1 skips the opening quote/backtick.
      const baseOffset = initializer.getStart() + 1
      for (const match of scanValue(text)) {
        const pos = sourceFile.getLineAndColumnAtPos(baseOffset + match.index)
        out.push({ kind: match.kind, value: match.value, file: label, line: pos.line, column: pos.column, prop })
      }
    } else {
      // React treats numeric style values as px (marginTop: 13 -> 13px).
      const numeric = numericValue(initializer)
      if (numeric !== undefined) {
        const pos = sourceFile.getLineAndColumnAtPos(initializer.getStart())
        out.push({ kind: 'length', value: `${numeric}px`, file: label, line: pos.line, column: pos.column, prop })
      }
    }
  }
}

// Only literal numbers (and their negation) are statically knowable; computed
// expressions like `pad * 2` are deliberately skipped.
function numericValue(node: Node): number | undefined {
  if (Node.isNumericLiteral(node)) return node.getLiteralValue()
  if (Node.isPrefixUnaryExpression(node) && node.getOperatorToken() === ts.SyntaxKind.MinusToken) {
    const operand = node.getOperand()
    if (Node.isNumericLiteral(operand)) return -operand.getLiteralValue()
  }
  return undefined
}

function collectTaggedTemplate(
  node: TaggedTemplateExpression,
  sourceFile: SourceFile,
  label: string,
  out: Candidate[],
): void {
  if (!STYLED_TAG_RE.test(node.getTag().getText())) return
  const template = node.getTemplate()
  const chunks: Array<{ text: string; offset: number }> = []
  if (Node.isNoSubstitutionTemplateLiteral(template)) {
    chunks.push({ text: template.getLiteralText(), offset: template.getStart() + 1 })
  } else {
    // TemplateHead token is "`text${"; middles/tails are "}text${" / "}text`".
    chunks.push({ text: template.getHead().getLiteralText(), offset: template.getHead().getStart() + 1 })
    for (const span of template.getTemplateSpans()) {
      const literal = span.getLiteral()
      chunks.push({ text: literal.getLiteralText(), offset: literal.getStart() + 1 })
    }
  }
  for (const chunk of chunks) {
    let lineStart = 0
    for (const lineText of chunk.text.split('\n')) {
      const propMatch = TEMPLATE_PROP_RE.exec(lineText)
      const prop = propMatch?.[1]?.toLowerCase()
      for (const match of scanValue(lineText)) {
        const pos = sourceFile.getLineAndColumnAtPos(chunk.offset + lineStart + match.index)
        const candidate: Candidate = {
          kind: match.kind,
          value: match.value,
          file: label,
          line: pos.line,
          column: pos.column,
        }
        if (prop !== undefined) candidate.prop = prop
        out.push(candidate)
      }
      lineStart += lineText.length + 1
    }
  }
}
