import { createLowlight } from 'lowlight';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import json from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
import java from 'highlight.js/lib/languages/java';
import { RICH_CONTENT_LANGUAGES } from './allowlist-local';
const grammars = { javascript, typescript, json, sql, python, bash, java };
export const lowlight = createLowlight(Object.fromEntries(RICH_CONTENT_LANGUAGES.map(language => [language, grammars[language]])));
// No common/all registry or network-loaded grammars.
