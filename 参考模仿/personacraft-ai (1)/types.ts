export enum AppState {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  REFINING = 'REFINING',
  ERROR = 'ERROR'
}

export interface OptimizationResult {
  systemPrompt: string;
  optimizedKnowledge: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface OptimizationRequest {
  rawKnowledge: string;
}

export interface RefineRequest {
  currentPrompt: string;
  currentKnowledge: string;
  instruction: string;
}

// Response schema type for Gemini
export interface GeminiJsonResponse {
  systemPrompt?: string | null;
  optimizedKnowledge?: string | null;
  chatResponse?: string; // Optional explanation when refining
}