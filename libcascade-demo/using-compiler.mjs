export const DISPOSER_PARAMETER = "__libcascadeDisposeUsing";

const RESERVED_WORDS = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);

const REGEX_PREFIX_WORDS = new Set([
  "await",
  "case",
  "delete",
  "do",
  "else",
  "in",
  "instanceof",
  "new",
  "of",
  "return",
  "throw",
  "typeof",
  "void",
  "yield",
]);

const MULTI_CHARACTER_PUNCTUATORS = [
  ">>>=",
  "**=",
  "&&=",
  "||=",
  "??=",
  "===",
  "!==",
  ">>>",
  "**",
  "=>",
  "==",
  "!=",
  "<=",
  ">=",
  "++",
  "--",
  "&&",
  "||",
  "??",
  "?.",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "<<",
  ">>",
  "&=",
  "|=",
  "^=",
  "...",
];

export class UsingCompileError extends SyntaxError {
  constructor(message, source, offset) {
    const prefix = source.slice(0, offset);
    const line = prefix.split("\n").length;
    const lastLineBreak = prefix.lastIndexOf("\n");
    const column = offset - lastLineBreak;
    super(`${message} (line ${line}, column ${column})`);
    this.name = "UsingCompileError";
    this.offset = offset;
    this.line = line;
    this.column = column;
  }
}

export function supportsNativeUsing() {
  if (typeof Symbol.dispose !== "symbol") return false;

  try {
    new Function("using __libcascadeUsingProbe = null;");
    return true;
  } catch {
    return false;
  }
}

export function compileUsingDeclarations(source) {
  const tokens = tokenize(source);
  if (!tokens.some((token) => token.value === "using")) {
    return { code: source, usesUsing: false };
  }

  const syntax = buildSyntaxTree(tokens, source);
  const declarations = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value !== "using") continue;

    const previous = tokens[index - 1];
    const binding = tokens[index + 1];
    const equals = tokens[index + 2];

    if (previous?.value === "await") {
      throw new UsingCompileError(
        "await using is not supported; use synchronous using instead",
        source,
        previous.start,
      );
    }

    if (binding?.value === "using" && tokens[index + 2]?.value !== "=") {
      throw new UsingCompileError(
        "await using is not supported; use synchronous using instead",
        source,
        token.start,
      );
    }

    // `using` can still be an ordinary property or method name in code such
    // as `{ using: true }` or `object.using()`. Only transform declaration
    // shaped tokens at a statement boundary.
    if (
      !isStatementBoundary(previous) ||
      binding?.type !== "identifier" ||
      RESERVED_WORDS.has(binding.value) ||
      equals?.value !== "="
    ) {
      continue;
    }

    if (isInsideForHeader(syntax.activeDelimiters[index], tokens)) {
      throw new UsingCompileError(
        "using declarations in for headers are not supported",
        source,
        token.start,
      );
    }

    const semicolonIndex = findInitializerEnd(tokens, index + 3, source);
    const semicolon = tokens[semicolonIndex];
    const initializerStart = equals.end;
    const initializerEnd = semicolon.start;

    if (!source.slice(initializerStart, initializerEnd).trim()) {
      throw new UsingCompileError(
        "using declarations require an initializer",
        source,
        token.start,
      );
    }

    declarations.push({
      binding: binding.value,
      scope: syntax.scopeForToken[index],
      start: token.start,
      initializerStart,
      initializerEnd,
      semicolonEnd: semicolon.end,
    });
  }

  if (declarations.length === 0) {
    return { code: source, usesUsing: false };
  }

  if (tokens.some((token) => token.value === DISPOSER_PARAMETER)) {
    throw new UsingCompileError(
      `The identifier ${DISPOSER_PARAMETER} is reserved by the compatibility compiler`,
      source,
      tokens.find((token) => token.value === DISPOSER_PARAMETER).start,
    );
  }

  for (const declaration of declarations) {
    declaration.scope.declarations.push(declaration);
  }
  for (const scope of syntax.scopes) {
    scope.declarations.sort((left, right) => left.start - right.start);
  }

  return {
    code: renderScope(syntax.root, source),
    usesUsing: true,
  };
}

function tokenize(source) {
  const tokens = [];
  let index = 0;
  let previous = null;

  while (index < source.length) {
    const character = source[index];

    if (/\s/u.test(character)) {
      index += 1;
      continue;
    }

    if (character === "/" && source[index + 1] === "/") {
      index += 2;
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }

    if (character === "/" && source[index + 1] === "*") {
      const end = source.indexOf("*/", index + 2);
      if (end < 0) {
        throw new UsingCompileError(
          "Unterminated block comment",
          source,
          index,
        );
      }
      index = end + 2;
      continue;
    }

    if (character === "'" || character === '"') {
      const end = scanQuotedString(source, index, character);
      const token = { type: "string", value: source.slice(index, end), start: index, end };
      tokens.push(token);
      previous = token;
      index = end;
      continue;
    }

    if (character === "`") {
      const end = scanTemplate(source, index);
      const token = { type: "template", value: source.slice(index, end), start: index, end };
      tokens.push(token);
      previous = token;
      index = end;
      continue;
    }

    if (isIdentifierStart(character)) {
      const start = index;
      index += 1;
      while (index < source.length && isIdentifierPart(source[index])) index += 1;
      const token = {
        type: "identifier",
        value: source.slice(start, index),
        start,
        end: index,
      };
      tokens.push(token);
      previous = token;
      continue;
    }

    if (isNumberStart(character, source[index + 1])) {
      const start = index;
      index = scanNumber(source, index);
      const token = {
        type: "number",
        value: source.slice(start, index),
        start,
        end: index,
      };
      tokens.push(token);
      previous = token;
      continue;
    }

    if (character === "/" && shouldStartRegex(previous)) {
      const end = scanRegex(source, index);
      const token = { type: "regex", value: source.slice(index, end), start: index, end };
      tokens.push(token);
      previous = token;
      index = end;
      continue;
    }

    const punctuator = MULTI_CHARACTER_PUNCTUATORS.find((candidate) =>
      source.startsWith(candidate, index),
    );
    const end = index + (punctuator?.length || 1);
    const token = {
      type: "punctuator",
      value: source.slice(index, end),
      start: index,
      end,
    };
    tokens.push(token);
    previous = token;
    index = end;
  }

  return tokens;
}

function buildSyntaxTree(tokens, source) {
  const root = createScope(null, null, null);
  const scopes = [root];
  const scopeStack = [root];
  const delimiterStack = [];
  const scopeForToken = [];
  const activeDelimiters = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    scopeForToken[index] = scopeStack[scopeStack.length - 1];
    activeDelimiters[index] = delimiterStack.slice();

    if (token.value === "(" || token.value === "[" || token.value === "{") {
      delimiterStack.push({
        kind: token.value,
        index,
      });
      if (token.value === "{") {
        const scope = createScope(token, null, scopeStack[scopeStack.length - 1]);
        scope.parent.children.push(scope);
        scopeStack.push(scope);
        scopes.push(scope);
      }
      continue;
    }

    if (token.value !== ")" && token.value !== "]" && token.value !== "}") {
      continue;
    }

    const expectedOpen = { ")": "(", "]": "[", "}": "{" }[token.value];
    const open = delimiterStack.pop();
    if (!open || open.kind !== expectedOpen) {
      throw new UsingCompileError("Unbalanced JavaScript delimiters", source, token.start);
    }

    if (token.value === "}") {
      const scope = scopeStack.pop();
      scope.closeToken = token;
    }
  }

  if (delimiterStack.length > 0 || scopeStack.length !== 1) {
    throw new UsingCompileError("Unbalanced JavaScript delimiters", source, source.length);
  }

  return { root, scopes, scopeForToken, activeDelimiters };
}

function createScope(openToken, closeToken, parent) {
  return {
    openToken,
    closeToken,
    parent,
    children: [],
    declarations: [],
  };
}

function findInitializerEnd(tokens, startIndex, source) {
  let depth = 0;

  for (let index = startIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.value === "(" || token.value === "[" || token.value === "{") {
      depth += 1;
      continue;
    }
    if (token.value === ")" || token.value === "]" || token.value === "}") {
      if (depth === 0) {
        throw new UsingCompileError(
          "using declarations require a terminating semicolon",
          source,
          token.start,
        );
      }
      depth -= 1;
      continue;
    }
    if (depth === 0 && token.value === ",") {
      throw new UsingCompileError(
        "multiple using declarators are not supported; declare each resource separately",
        source,
        token.start,
      );
    }
    if (depth === 0 && token.value === ";") return index;
  }

  throw new UsingCompileError(
    "using declarations require a terminating semicolon",
    source,
    source.length,
  );
}

function renderScope(scope, source) {
  const contentStart = scope.openToken?.end || 0;
  const contentEnd = scope.closeToken?.start || source.length;
  const prefix = scope.openToken ? source.slice(scope.openToken.start, contentStart) : "";
  const suffix = scope.closeToken ? source.slice(contentEnd, scope.closeToken.end) : "";
  return `${prefix}${renderScopeContent(scope, source, contentStart, contentEnd, 0)}${suffix}`;
}

function renderScopeContent(scope, source, start, end, declarationIndex) {
  const declaration = scope.declarations[declarationIndex];
  if (!declaration || declaration.start >= end) {
    return renderChildren(scope, source, start, end);
  }

  const prefix = renderChildren(scope, source, start, declaration.start);
  const initializer = renderChildren(
    scope,
    source,
    declaration.initializerStart,
    declaration.initializerEnd,
  );
  const remainder = renderScopeContent(
    scope,
    source,
    declaration.semicolonEnd,
    end,
    declarationIndex + 1,
  );

  return `${prefix}{\nlet ${declaration.binding};\ntry {\n${declaration.binding} = (${initializer}\n);\n${remainder}\n} finally {\n${DISPOSER_PARAMETER}(${declaration.binding});\n}\n}`;
}

function renderChildren(scope, source, start, end) {
  let output = "";
  let cursor = start;

  for (const child of scope.children) {
    if (!child.openToken || !child.closeToken) continue;
    if (child.openToken.start < start || child.closeToken.end > end) continue;
    output += source.slice(cursor, child.openToken.start);
    output += renderScope(child, source);
    cursor = child.closeToken.end;
  }

  return output + source.slice(cursor, end);
}

function isStatementBoundary(previous) {
  return !previous || previous.value === "{" || previous.value === "}" || previous.value === ";" || previous.value === ":";
}

function isInsideForHeader(activeDelimiters, tokens) {
  const forParenthesis = [...activeDelimiters]
    .reverse()
    .find(
      (delimiter) =>
        delimiter.kind === "(" && tokens[delimiter.index - 1]?.value === "for",
    );
  if (!forParenthesis) return false;

  return !activeDelimiters.some(
    (delimiter) => delimiter.kind === "{" && delimiter.index > forParenthesis.index,
  );
}

function scanQuotedString(source, start, quote) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === quote) return index + 1;
    index += 1;
  }
  throw new UsingCompileError("Unterminated string literal", source, start);
}

function scanTemplate(source, start) {
  let index = start + 1;
  while (index < source.length) {
    if (source[index] === "\\") {
      index += 2;
      continue;
    }
    if (source[index] === "`") return index + 1;
    index += 1;
  }
  throw new UsingCompileError("Unterminated template literal", source, start);
}

function scanRegex(source, start) {
  let index = start + 1;
  let inCharacterClass = false;
  while (index < source.length) {
    const character = source[index];
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === "[") inCharacterClass = true;
    if (character === "]") inCharacterClass = false;
    if (character === "/" && !inCharacterClass) {
      index += 1;
      while (/[A-Za-z]/u.test(source[index] || "")) index += 1;
      return index;
    }
    if (character === "\n" || character === "\r") {
      throw new UsingCompileError("Unterminated regular expression", source, start);
    }
    index += 1;
  }
  throw new UsingCompileError("Unterminated regular expression", source, start);
}

function shouldStartRegex(previous) {
  if (!previous) return true;
  if (["number", "string", "template", "regex"].includes(previous.type)) return false;
  if (previous.value === ")" || previous.value === "]" || previous.value === "}" || previous.value === "++" || previous.value === "--") {
    return false;
  }
  if (previous.type === "identifier" && !REGEX_PREFIX_WORDS.has(previous.value)) return false;
  return true;
}

function isIdentifierStart(character) {
  return Boolean(character) && /[A-Za-z_$]/u.test(character);
}

function isIdentifierPart(character) {
  return isIdentifierStart(character) || Boolean(character && /[0-9]/u.test(character));
}

function isNumberStart(character, nextCharacter) {
  return Boolean(character && /[0-9]/u.test(character)) || character === "." && Boolean(nextCharacter && /[0-9]/u.test(nextCharacter));
}

function scanNumber(source, start) {
  let index = start;
  while (index < source.length && /[\w.]/u.test(source[index])) index += 1;
  return index;
}
