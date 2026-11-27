// #2181: a time or number shown to a person goes through one notation, so the language switch and the viewer's time zone reach
// every value (kernel §6.3: an instant prints with the Kernel `formatListTime` / `formatSummaryTime` / `formatFeedTime` or the
// contracts `formatInstant`; a number with the contracts `formatNumber(value, lang)`). A direct call picks its own locale and zone.
//
// Reported: any `.toLocaleString(` / `.toLocaleDateString(` / `.toLocaleTimeString(` call (a Date and a Number alike: the receiver's
// type is unknown here, and both have a formatter), `Intl.DateTimeFormat(` with or without `new` (also through `globalThis.Intl`),
// and the locale tag `'ko-KR'` as a string or plain template literal. Not reported: the `Intl.DateTimeFormat` type
// (`Intl.DateTimeFormatOptions`, `Intl.DateTimeFormatPart`), `Intl.NumberFormat` and `Intl.RelativeTimeFormat`.
// A date-only or wall-clock value, an input/parse helper, a zone lookup or a wire value takes an eslint-disable-next-line with its
// reason; the formatter sources themselves are a file allow-list in index.js.
import { PACKAGE_PREFIX } from './prefix.js';

const TO_LOCALE = /^toLocale(Date|Time)?String$/;
const KO_KR = 'ko-KR';

const propertyName = (member) => {
  if (!member.computed && member.property.type === 'Identifier') return member.property.name;
  if (member.computed && member.property.type === 'Literal' && typeof member.property.value === 'string') return member.property.value;
  return undefined;
};

/** True for `Intl.DateTimeFormat` and `globalThis.Intl.DateTimeFormat` (plain member chains only). */
function isDateTimeFormat(callee) {
  if (callee.type !== 'MemberExpression' || propertyName(callee) !== 'DateTimeFormat') return false;
  const intl = callee.object;
  if (intl.type === 'Identifier') return intl.name === 'Intl';
  return intl.type === 'MemberExpression' && propertyName(intl) === 'Intl' && intl.object.type === 'Identifier' && intl.object.name === 'globalThis';
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'format instants and numbers with the Kernel notation or the contracts formatters instead of a direct locale call' },
    messages: {
      toLocale: `{{name}} picks its own locale and time zone. Print an instant with the Kernel notation (formatListTime, formatSummaryTime, formatFeedTime) or formatInstant, a number with formatNumber(value, lang) from ${PACKAGE_PREFIX}contracts. A date-only or wall-clock value, an input/parse helper or a wire value takes an eslint-disable-next-line with its reason.`,
      dateTimeFormat: `Intl.DateTimeFormat picks its own locale. Print an instant with the Kernel notation (formatListTime, formatSummaryTime, formatFeedTime) or formatInstant from ${PACKAGE_PREFIX}contracts. A date-only or wall-clock value, an input/parse helper, a zone lookup or a wire value takes an eslint-disable-next-line with its reason.`,
      koKr: "The locale tag 'ko-KR' hard-codes the language. The formatters (Kernel notation, formatInstant, formatNumber) take the current lang; a value that must stay Korean takes an eslint-disable-next-line with its reason.",
    },
    schema: [],
  },
  create(context) {
    const checkCallee = (node) => {
      const { callee } = node;
      if (isDateTimeFormat(callee)) {
        context.report({ node: callee, messageId: 'dateTimeFormat' });
        return;
      }
      if (callee.type !== 'MemberExpression') return;
      const name = propertyName(callee);
      if (name !== undefined && TO_LOCALE.test(name)) context.report({ node: callee.property, messageId: 'toLocale', data: { name } });
    };
    return {
      CallExpression: checkCallee,
      NewExpression: checkCallee,
      Literal(node) {
        if (node.value === KO_KR) context.report({ node, messageId: 'koKr' });
      },
      TemplateLiteral(node) {
        if (node.expressions.length === 0 && node.quasis[0]?.value.cooked === KO_KR) context.report({ node, messageId: 'koKr' });
      },
    };
  },
};
