const HTML_ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Text for an HTML-mode ECharts tooltip: markup in a server-supplied name must stay text. */
export const escapeHtml = (text: string) => text.replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);

