export interface Model {
  id: string;
  name: string;
  vendor: string;
  share: number;
  tpm: number;
  p50: number;
  p95: number;
  cost: number;
  err: number;
  col: string;
}

export const MODELS: Model[] = [
  { id: 'opus',   name: 'Claude Opus 4.5',   vendor: 'Anthropic', share: .42, tpm: 18240, p50: 612,  p95: 1840, cost: 14.22, err: 0.4, col: '#9BC4CC' },
  { id: 'sonnet', name: 'Claude Sonnet 4.5', vendor: 'Anthropic', share: .23, tpm: 10120, p50: 284,  p95:  720, cost:  3.84, err: 0.2, col: '#6FA8B3' },
  { id: 'gemini', name: 'Gemini 2.5 Pro',    vendor: 'Google',    share: .18, tpm:  7880, p50: 342,  p95:  980, cost:  2.18, err: 0.6, col: '#C9B08A' },
  { id: 'grok',   name: 'Grok 3',            vendor: 'xAI',       share: .09, tpm:  3940, p50: 502,  p95: 1510, cost:  1.06, err: 1.1, col: '#B88A8A' },
  { id: 'haiku',  name: 'Claude Haiku 4.5',  vendor: 'Anthropic', share: .05, tpm:  2200, p50: 148,  p95:  360, cost:  0.42, err: 0.1, col: '#4F7B83' },
  { id: 'local',  name: 'Local Llama-70B',   vendor: 'Local',     share: .03, tpm:  1320, p50: 920,  p95: 2340, cost:  0.00, err: 0.0, col: '#7CA893' },
];

export type Lookback = '1H' | '24H' | '30D';

export const LOOKBACKS: Record<Lookback, { label: string; unit: string; n: number; bucket: string; costMul: number; cacheMul: number }> = {
  '1H':  { label: '1 Hour',   unit: 'min',  n: 60, bucket: 'm', costMul: 1/24, cacheMul: 0.38 },
  '24H': { label: '24 Hours', unit: 'hour', n: 24, bucket: 'h', costMul: 1,    cacheMul: 0.44 },
  '30D': { label: '30 Days',  unit: 'day',  n: 30, bucket: 'd', costMul: 30,   cacheMul: 0.41 },
};
