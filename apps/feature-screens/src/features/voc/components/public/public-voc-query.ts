// The URL-owned query of the 소통 › VOC list (platform ADR-0110). The host (platform bridge, ADR-0071) owns where it lives.

export const PUBLIC_VOC_QUERY_MAX = 100;
export const PUBLIC_VOC_PAGE_SIZE = 50;

export interface PublicVocQuery {
  q: string;
  /** `true`: only the VOCs the signed-in actor registered. */
  mine: boolean;
  /** A Managed System id, or `null` for every system. */
  systemId: string | null;
}
