// Path values in feature-screens request helpers (`apiClient`, `apiRequest`, `apiHref`) must be validated with
// `apiPath` (`@/lib/api/path`). A serialized query suffix is allowed only after a constant path or an `apiPath` result.

const WRAPPER_TYPES = new Set([
  'ParenthesizedExpression',
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
]);

function unwrap(node) {
  let cur = node;
  while (cur && WRAPPER_TYPES.has(cur.type)) cur = cur.expression;
  return cur;
}

function findConstInit(identifier, context) {
  let scope = context.sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      if (variable.defs.length !== 1) return null;
      const def = variable.defs[0];
      if (def.node?.type === 'VariableDeclarator' && def.node.parent?.kind === 'const' && def.node.init) {
        return def.node.init;
      }
      return null;
    }
    scope = scope.upper;
  }
  return null;
}

function getConstantString(node) {
  const n = unwrap(node);
  if (!n) return null;
  if (n.type === 'Literal' && typeof n.value === 'string') return n.value;
  if (n.type === 'TemplateLiteral' && n.expressions.length === 0) return n.quasis[0]?.value?.cooked ?? '';
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const left = getConstantString(n.left);
    const right = getConstantString(n.right);
    if (left !== null && right !== null) return left + right;
  }
  return null;
}

function isApiPathCall(node) {
  const n = unwrap(node);
  if (!n || n.type !== 'TaggedTemplateExpression') return false;
  const tag = unwrap(n.tag);
  return tag?.type === 'Identifier' && tag.name === 'apiPath';
}

function flattenPlus(node, out = []) {
  const n = unwrap(node);
  if (n && n.type === 'BinaryExpression' && n.operator === '+') {
    flattenPlus(n.left, out);
    flattenPlus(n.right, out);
  } else if (n) {
    out.push(n);
  }
  return out;
}

function isAllowedQuerySuffix(node, context, seen = new Set()) {
  const n = unwrap(node);
  if (!n) return false;
  if (getConstantString(n) !== null) return true;
  if (n.type === 'NewExpression') {
    const callee = unwrap(n.callee);
    return callee?.type === 'Identifier' && callee.name === 'URLSearchParams';
  }
  if (n.type === 'CallExpression') {
    const callee = unwrap(n.callee);
    if (
      callee?.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property?.type === 'Identifier' &&
      callee.property.name === 'toString'
    ) {
      return true;
    }
    return callee?.type === 'Identifier' && callee.name === 'String';
  }
  if (n.type === 'Identifier') {
    if (seen.has(n)) return false;
    const init = findConstInit(n, context);
    if (init) return isAllowedQuerySuffix(init, context, new Set([...seen, n]));
    return true;
  }
  if (n.type === 'ConditionalExpression') {
    return (
      isAllowedQuerySuffix(n.consequent, context, seen) &&
      isAllowedQuerySuffix(n.alternate, context, seen)
    );
  }
  if (n.type === 'LogicalExpression') {
    if (n.operator === '&&') return isAllowedQuerySuffix(n.right, context, seen);
    return (
      isAllowedQuerySuffix(n.left, context, seen) &&
      isAllowedQuerySuffix(n.right, context, seen)
    );
  }
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const parts = flattenPlus(n);
    let prevConstant = null;
    for (const rawPart of parts) {
      const part = unwrap(rawPart);
      const constant = getConstantString(part);
      if (constant !== null) {
        prevConstant = constant;
        continue;
      }
      if (prevConstant !== null && prevConstant.endsWith('=')) return false;
      if (!isAllowedQuerySuffix(part, context, seen)) return false;
      prevConstant = null;
    }
    return true;
  }
  return false;
}

function isQuestionQuerySuffix(node, context, seen = new Set()) {
  const n = unwrap(node);
  if (!n) return false;
  const constant = getConstantString(n);
  if (constant !== null) return constant === '' || constant.startsWith('?');
  if (n.type === 'ConditionalExpression') {
    return (
      isQuestionQuerySuffix(n.consequent, context, seen) &&
      isQuestionQuerySuffix(n.alternate, context, seen)
    );
  }
  if (n.type === 'LogicalExpression' && n.operator === '&&') {
    return isQuestionQuerySuffix(n.right, context, seen);
  }
  if (n.type === 'Identifier') {
    if (seen.has(n)) return false;
    const init = findConstInit(n, context);
    return init ? isQuestionQuerySuffix(init, context, new Set([...seen, n])) : false;
  }
  if (n.type === 'BinaryExpression' && n.operator === '+') {
    const parts = flattenPlus(n);
    const firstConst = getConstantString(parts[0]);
    if (firstConst === null || !firstConst.startsWith('?')) return false;
    let prevConstant = firstConst;
    for (let i = 1; i < parts.length; i += 1) {
      const part = unwrap(parts[i]);
      const partConst = getConstantString(part);
      if (partConst !== null) {
        prevConstant = partConst;
        continue;
      }
      if (prevConstant !== null && prevConstant.endsWith('=')) return false;
      if (!isAllowedQuerySuffix(part, context, seen)) return false;
      prevConstant = null;
    }
    return true;
  }
  return false;
}

function expandPlusParts(node, context, seen) {
  const rawParts = flattenPlus(node);
  const out = [];
  for (const rawPart of rawParts) {
    const part = unwrap(rawPart);
    if (part?.type === 'Identifier' && out.length === 0 && !seen.has(part)) {
      const init = findConstInit(part, context);
      if (init) {
        const nextSeen = new Set([...seen, part]);
        const unwrappedInit = unwrap(init);
        if (unwrappedInit?.type === 'BinaryExpression' && unwrappedInit.operator === '+') {
          out.push(...expandPlusParts(unwrappedInit, context, nextSeen));
          continue;
        }
        out.push({ node: init, seen: nextSeen });
        continue;
      }
    }
    out.push({ node: part, seen });
  }
  return out;
}

function isValidComposedPath(node, context, seen = new Set()) {
  const parts = expandPlusParts(node, context, seen);
  let hasPathPrefix = false;
  let inQuery = false;
  let prevConstant = null;

  for (let i = 0; i < parts.length; i += 1) {
    const { node: rawPart, seen: partSeen } = parts[i];
    const part = unwrap(rawPart);
    if (!part) return false;

    if (!inQuery) {
      const constant = getConstantString(part);
      if (constant !== null) {
        hasPathPrefix = true;
        if (constant.includes('?')) inQuery = true;
        prevConstant = constant;
        continue;
      }
      if (isApiPathCall(part)) {
        hasPathPrefix = true;
        prevConstant = null;
        continue;
      }
      if (part.type === 'Identifier') {
        if (!hasPathPrefix || partSeen.has(part)) return false;
        const init = findConstInit(part, context);
        if (!init || !isQuestionQuerySuffix(init, context, new Set([...partSeen, part]))) return false;
        inQuery = true;
        prevConstant = null;
        continue;
      }
      if (part.type === 'ConditionalExpression') {
        if (i === 0) {
          const rest = parts.slice(1).map((entry) => entry.node);
          const checkBranch = (branch) => {
            const combined = rest.reduce(
              (acc, r) => ({ type: 'BinaryExpression', operator: '+', left: acc, right: r }),
              branch,
            );
            return isValidPathExpr(combined, context, partSeen);
          };
          return checkBranch(part.consequent) && checkBranch(part.alternate);
        }
        if (hasPathPrefix && isQuestionQuerySuffix(part, context, partSeen)) {
          inQuery = true;
          prevConstant = null;
          continue;
        }
        return false;
      }
      return false;
    }

    const constant = getConstantString(part);
    if (constant !== null) {
      prevConstant = constant;
      continue;
    }
    if (prevConstant !== null && prevConstant.endsWith('=')) return false;
    if (!isAllowedQuerySuffix(part, context, partSeen)) return false;
    prevConstant = null;
  }

  return hasPathPrefix;
}

function isValidPathExpr(node, context, seen = new Set()) {
  const n = unwrap(node);
  if (!n) return true;
  if (getConstantString(n) !== null) return true;
  if (isApiPathCall(n)) return true;
  if (n.type === 'TemplateLiteral') return false;
  if (n.type === 'TaggedTemplateExpression') return n.quasi.expressions.length === 0;
  if (n.type === 'ConditionalExpression') {
    return (
      isValidPathExpr(n.consequent, context, seen) &&
      isValidPathExpr(n.alternate, context, seen)
    );
  }
  if (n.type === 'LogicalExpression') {
    if (n.operator === '&&') return isValidPathExpr(n.right, context, seen);
    return (
      isValidPathExpr(n.left, context, seen) &&
      isValidPathExpr(n.right, context, seen)
    );
  }
  if (n.type === 'BinaryExpression') {
    if (n.operator !== '+') return false;
    return isValidComposedPath(n, context, seen);
  }
  if (n.type === 'Identifier') {
    if (seen.has(n)) return true;
    const init = findConstInit(n, context);
    if (!init) return true;
    return isValidPathExpr(init, context, new Set([...seen, n]));
  }
  return false;
}

function getPathArgument(node) {
  const callee = unwrap(node.callee);
  if (!callee) return null;
  if (callee.type === 'Identifier') {
    if (callee.name === 'apiClient' || callee.name === 'apiRequest') return node.arguments[1] ?? null;
    if (callee.name === 'apiHref') return node.arguments[0] ?? null;
    return null;
  }
  if (callee.type === 'MemberExpression') {
    const obj = unwrap(callee.object);
    if (obj?.type !== 'Identifier' || obj.name !== 'apiClient') return null;
    const propName =
      !callee.computed && callee.property?.type === 'Identifier'
        ? callee.property.name
        : callee.computed && callee.property?.type === 'Literal' && typeof callee.property.value === 'string'
          ? callee.property.value
          : null;
    if (!propName || propName.startsWith('mock')) return null;
    return node.arguments[0] ?? null;
  }
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require apiPath for request paths with interpolated segments in feature-screens',
    },
    messages: {
      unvalidated: 'Build request paths with apiPath; path values are validated.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const pathArg = getPathArgument(node);
        if (!pathArg) return;
        if (!isValidPathExpr(pathArg, context)) {
          context.report({ node: pathArg, messageId: 'unvalidated' });
        }
      },
    };
  },
};
