// src/composables/NlpInterface.ts
import { Nlp } from '@nlpjs/nlp';
//import { containerBootstrap } from '@nlpjs/core';
import { SimplifiedNlpManager } from './SimplifiedNlpManager'
import { createNlp } from './AxaNlpManager';

// Abstract interface for NLP functionality
export interface INlpManager {
  train(): Promise<void>;
  process(text: string, language: string): Promise<{
    intent?: string;
    score?: number;
    // Add other potential return fields
  }>;
  addDocument(language: string, utterance: string, intent: string): void;
}

// Wrapper class to provide a unified interface
export class NlpManagerWrapper implements INlpManager {
  private nlpInstance: Nlp | SimplifiedNlpManager

  constructor(instance: Nlp | SimplifiedNlpManager) {
    this.nlpInstance = instance
  }

  async train(): Promise<void> {
    if (this.nlpInstance instanceof SimplifiedNlpManager) {
      await this.nlpInstance.initialize()
    } else {
      await this.nlpInstance.train()
    }
  }

  async process(language: string, text: string): Promise<{
    intent?: string;
    score?: number;
  }> {
    if (this.nlpInstance instanceof SimplifiedNlpManager) {
      const result = this.nlpInstance.getIntent(text)
      return {
        intent: result.intent,
        score: result.score
      }
    } else {
      // For nlp.js, use its native processing
      const result = await this.nlpInstance.process(text, language)
      return {
        intent: result.intent,
        score: result.score
      }
    }
  }

  addDocument(language: string, utterance: string, intent: string): void {
    if (this.nlpInstance instanceof SimplifiedNlpManager) {
      // Simplified version doesn't support dynamic document addition
      console.warn('Document addition not supported in simplified NLP')
    } else {
      this.nlpInstance.addDocument(language, utterance, intent)
    }
  }

  // Getter to access the underlying instance if needed
  getInstance(): Nlp | SimplifiedNlpManager {
    return this.nlpInstance
  }
}

// Factory function to create the appropriate NLP manager
export async function createNlpManager(isMobile: boolean = false): Promise<NlpManagerWrapper> {
  if (isMobile) {
    const simplifiedNlp = new SimplifiedNlpManager()
    await simplifiedNlp.initialize()
    console.log('Creating SimplifiedNlpManager...')
    return new NlpManagerWrapper(simplifiedNlp)
  }

  try {
    console.log('Attempting to create AxaNLP manager...')
    return new NlpManagerWrapper(await createNlp())
  } catch (error) {
    console.warn('Failed to create AxaNLP manager, falling back to SimplifiedNlpManager:', error)
    const simplifiedNlp = new SimplifiedNlpManager()
    await simplifiedNlp.initialize()
    return new NlpManagerWrapper(simplifiedNlp)
  }
}

// Modify your existing initialization function
export async function initializeNlp(isMobile: boolean | false): Promise<NlpManagerWrapper> {
  //const isMobile = isMobileDevice() // From SimplifiedNlpManager
  console.log('isMobile: ', isMobile)
  return createNlpManager(isMobile)
}