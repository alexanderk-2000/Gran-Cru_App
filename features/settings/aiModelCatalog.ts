export interface AiModelOption {
  id: string;
  name: string;
  description: string;
}

export const geminiModels: AiModelOption[] = [
  { id: 'gemini-pro-latest', name: 'Gemini Pro (Latest)', description: 'Höchste Qualität für Recherche' },
  { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro (Preview)', description: 'Neuste Pro-Generation' },
  { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash (Preview)', description: 'Schneller Flash-Modus' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Starkes Reasoning' },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Schnell & günstig' },
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', description: 'Sehr günstig' }
];

export const openaiModels: AiModelOption[] = [
  { id: 'gpt-5.2', name: 'GPT-5.2 (Search)', description: 'Standard mit Web-Search' },
  { id: 'gpt-5.1', name: 'GPT-5.1', description: 'Fallback 1' },
  { id: 'o3', name: 'o3', description: 'Fallback 2' },
  { id: 'gpt-5-mini', name: 'GPT-5 Mini', description: 'Fallback 3' },
  { id: 'gpt-4.1', name: 'GPT-4.1', description: 'Fallback 4' }
];

export const openrouterModels: AiModelOption[] = [
  { id: 'nvidia/llama-3.1-nemotron-70b-instruct', name: 'Nemotron 70B', description: 'Größtes Modell, mit Web-Search' },
  { id: 'nvidia/nemotron-nano-9b-v2', name: 'Nemotron Nano 9B', description: 'Schnell & günstig' },
  { id: 'nvidia/nemotron-nano-12b-v2-vl', name: 'Nemotron Nano 12B VL', description: 'Mit Bildverständnis' }
];
