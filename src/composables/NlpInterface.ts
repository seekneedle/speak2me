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
    return new NlpManagerWrapper(simplifiedNlp)
  }

/*   // Original nlp.js initialization
  const container = await containerBootstrap();
  (container as any).use(Nlp);
  
  const { LangZh } = await import('@nlpjs/lang-zh');
  (container as any).use(LangZh);
  
  const nlp = container.get('nlp');
  nlp.addLanguage('zh');

  // Add documents (same as your original code)
  const noUtterances = [
    '不', '不用', '不需要', 
    '否', '不想', '没有了',
    '停', '停止', '算了'
  ];

  noUtterances.forEach(utterance => {
    nlp.addDocument('zh', utterance, 'intent.no');
  });

  const yesUtterances = [
    '是', '当然', '好的', '有的',
    '没问题', '继续', '好', '是的',
    '是的', '可以', '肯定', '有'
  ];

  yesUtterances.forEach(utterance => {
    nlp.addDocument('zh', utterance, 'intent.yes');
  });

  await nlp.train();
 */
  return new NlpManagerWrapper(await createNlp());
}

// Modify your existing initialization function
export async function initializeNlp(isMobile: boolean | false): Promise<NlpManagerWrapper> {
  //const isMobile = isMobileDevice() // From SimplifiedNlpManager
  console.log('isMobile: ', isMobile)
  return createNlpManager(isMobile)
}