export type GeneratedThemeTokens = { json: string; ts: string };

export function generateThemeTokens(input: { tokensCss: string; platformCss: string }): GeneratedThemeTokens;
