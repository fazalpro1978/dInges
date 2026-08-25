export type MasterCodeParams = {
  category: string;    // 'R' | 'C'
  entity_code: string; // 3 chars
  agent_code: string;  // 2 chars
  zone_code: string | number; // padded to 2 chars
  date_seg: string;    // DDMM
  time_seg: string;    // HHMM 24h
};

export function buildMasterPrefix(p: Pick<MasterCodeParams, 'category' | 'entity_code' | 'agent_code' | 'zone_code'>): string | null {
  const { category, entity_code, agent_code, zone_code } = p;
  if (!category || !entity_code || entity_code.length !== 3 || !agent_code || agent_code.length !== 2 || !zone_code) return null;
  const zone = String(zone_code).padStart(2, '0').slice(-2);
  return `${category}${entity_code}${agent_code}${zone}`;
}

export function buildMasterCode(p: MasterCodeParams): string {
  const zone = String(p.zone_code).padStart(2, '0').slice(-2);
  return `${p.category}${p.entity_code}${p.agent_code}${zone}${p.date_seg}${p.time_seg}`;
}

export function getNowSegments(): { date_seg: string; time_seg: string } {
  const now = new Date();
  const dd  = String(now.getDate()).padStart(2, '0');
  const mm  = String(now.getMonth() + 1).padStart(2, '0');
  const hh  = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return { date_seg: `${dd}${mm}`, time_seg: `${hh}${min}` };
}
