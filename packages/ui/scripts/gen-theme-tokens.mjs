import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exclude, includePrefixes } from './theme-tokens.config.mjs';

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), '..');
const COLOR_FUNCTIONS = new Set([
  'color', 'color-mix', 'device-cmyk', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'light-dark',
  'oklab', 'oklch', 'rgb', 'rgba',
]);
const CSS_COLOR_KEYWORDS = new Set(`
  accentcolor accentcolortext activetext activeborder activecaption aliceblue antiquewhite aqua aquamarine
  appworkspace azure background beige bisque black
  blanchedalmond blue blueviolet brown burlywood buttonborder buttonface buttonhighlight buttonshadow buttontext
  cadetblue captiontext canvas canvastext
  chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen
  darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue
  darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick
  floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray graytext green greenyellow grey honeydew hotpink
  indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
  lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen linktext magenta maroon mark marktext menu menutext
  mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen
  field fieldtext mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace
  olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum
  powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna
  scrollbar silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal threeddarkshadow
  threedface threedhighlight threedlightshadow threedshadow thistle tomato turquoise violet
  visitedtext wheat white whitesmoke yellow yellowgreen transparent currentcolor graytext highlight highlighttext
  selecteditem selecteditemtext window windowframe windowtext infobackground infotext inactiveborder
  inactivecaption inactivecaptiontext
`.trim().split(/\s+/));

function parseRootDeclarations(css, sourceName) {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const roots = [...withoutComments.matchAll(/:root\s*\{([^}]*)\}/g)];
  if (roots.length === 0) throw new Error(`${sourceName} has no :root declarations`);

  const properties = new Map();
  for (const [, block] of roots) {
    for (const match of block.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      properties.set(`--${match[1]}`, match[2].trim());
    }
  }
  return properties;
}

function parseVariable(value) {
  const match = /^var\(\s*(--[\w-]+)\s*(?:,([\s\S]*))?\)$/i.exec(value);
  if (!match) return null;
  return { name: match[1], fallback: match[2]?.trim() };
}

function isStandaloneColorFunction(value) {
  const match = /^([a-z][\w-]*)\s*\(/i.exec(value);
  if (!match || !COLOR_FUNCTIONS.has(match[1].toLowerCase())) return false;

  let depth = 0;
  for (let index = match[0].length - 1; index < value.length; index += 1) {
    if (value[index] === '(') depth += 1;
    if (value[index] === ')') {
      depth -= 1;
      if (depth === 0) return value.slice(index + 1).trim() === '';
    }
  }
  return true;
}

function isCssColorValue(value) {
  if (/^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value)) return true;
  if (CSS_COLOR_KEYWORDS.has(value.toLowerCase())) return true;
  return isStandaloneColorFunction(value);
}

function resolveColorValue(value, properties, chain) {
  const triple = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(value);
  if (triple) {
    const channels = triple.slice(1).map(Number);
    if (channels.some(channel => channel > 255)) {
      throw new Error(`Colour token ${chain[0]} has an RGB channel outside 0..255: ${value}`);
    }
    return { kind: 'rgb', rgb: channels };
  }

  const variable = parseVariable(value);
  if (variable) {
    if (properties.has(variable.name)) return resolveColor(variable.name, properties, chain);
    if (variable.fallback !== undefined) return resolveColorValue(variable.fallback, properties, chain);
    throw new Error(`Colour token ${chain[0]} references missing ${variable.name}`);
  }

  return isCssColorValue(value) ? { kind: 'unsupported', value } : null;
}

function resolveColor(name, properties, chain = []) {
  if (chain.includes(name)) throw new Error(`Colour token alias cycle at ${name}: ${chain.join(' -> ')}`);
  const value = properties.get(name);
  if (value === undefined) {
    if (chain.length > 0) throw new Error(`Colour token ${chain[0]} references missing ${name}`);
    return null;
  }
  return resolveColorValue(value, properties, [...chain, name]);
}

function hex([red, green, blue]) {
  return `#${[red, green, blue].map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function excludedReason(name) {
  const entry = Object.entries(exclude).find(([nameOrPrefix]) => (
    nameOrPrefix.endsWith('-') ? name.startsWith(nameOrPrefix) : name === nameOrPrefix
  ));
  return entry?.[1];
}

function isIncluded(name) {
  return includePrefixes.some(prefix => name.startsWith(prefix));
}

function renderJson(tokens) {
  const color = Object.fromEntries(tokens.map(({ name, rgb }) => [name, {
    $type: 'color',
    $value: {
      colorSpace: 'srgb',
      components: rgb.map(channel => Number((channel / 255).toFixed(4))),
      hex: hex(rgb),
    },
  }]));
  return `${JSON.stringify({ color }, null, 2)}\n`;
}

function renderTypescript(tokens) {
  const names = tokens.map(({ name }) => name);
  const lines = [
    '// Generated by scripts/gen-theme-tokens.mjs from tokens.css + platform-tokens.css — do not edit',
    `export const THEME_COLOR_TOKENS = ${JSON.stringify(names, null, 2)} as const;`,
    'export type ThemeColorToken = (typeof THEME_COLOR_TOKENS)[number];',
    '',
    'export const THEME_COLOR_FALLBACK: Readonly<Record<ThemeColorToken, string>> = {',
    ...tokens.map(({ name, rgb }) => `  ${JSON.stringify(name)}: ${JSON.stringify(`rgb(${rgb.join(',')})`)},`),
    '};',
    '',
  ];
  return lines.join('\n');
}

/** Generate the DTCG manifest and TypeScript names/fallbacks from the CSS value sources. */
export function generateThemeTokens({ tokensCss, platformCss }) {
  const properties = new Map([
    ...parseRootDeclarations(tokensCss, 'tokens.css'),
    ...parseRootDeclarations(platformCss, 'platform-tokens.css'),
  ]);
  const included = [];

  for (const [cssName] of properties) {
    const name = cssName.slice(2);
    const resolved = resolveColor(cssName, properties);
    if (!resolved) continue;
    if (excludedReason(name)) continue;
    if (resolved.kind === 'unsupported') {
      throw new Error(`Colour token ${cssName} resolves to a non-RGB colour value: ${resolved.value}`);
    }
    if (!isIncluded(name)) throw new Error(`Unclassified colour token: ${cssName} (${properties.get(cssName)})`);
    included.push({ name, rgb: resolved.rgb });
  }

  included.sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
  return { json: renderJson(included), ts: renderTypescript(included) };
}

function writeGeneratedFiles() {
  const tokensCss = readFileSync(resolve(packageRoot, 'src/styles/tokens.css'), 'utf8');
  const platformCss = readFileSync(resolve(packageRoot, 'src/styles/platform-tokens.css'), 'utf8');
  const generated = generateThemeTokens({ tokensCss, platformCss });
  const outputDirectory = resolve(packageRoot, 'src/theme');
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, 'theme-tokens.json'), generated.json);
  writeFileSync(resolve(outputDirectory, 'tokens.generated.ts'), generated.ts);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) writeGeneratedFiles();
