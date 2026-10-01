export const SPEECH_REGISTERS = ['plain', 'mixed', 'polite', 'formal', 'custom'] as const;
export type SpeechRegister = typeof SPEECH_REGISTERS[number];

export interface CharacterVoice {
  defaultSecondPerson?: string;
  speechRegister?: string;
  speechStyleNotes?: string;
}

export interface RelationshipVoice {
  addressTerm?: string;
  speechRegister?: string;
  speechStyleNotes?: string;
}

export function isSpeechRegister(value: unknown): value is SpeechRegister | '' {
  return value === '' || (typeof value === 'string' && SPEECH_REGISTERS.includes(value as SpeechRegister));
}

export function resolveDirectedVoice(character: CharacterVoice, relationship?: RelationshipVoice) {
  return {
    addressTerm: relationship?.addressTerm?.trim() || character.defaultSecondPerson?.trim() || '',
    speechRegister: relationship?.speechRegister?.trim() || character.speechRegister?.trim() || '',
    speechStyleNotes: relationship?.speechStyleNotes?.trim() || character.speechStyleNotes?.trim() || '',
  };
}

export function shouldUseNarrationVoice(perspective?: string | null): boolean {
  return perspective !== 'third_person_objective';
}
