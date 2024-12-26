declare module '@nlpjs/nlp' {
  export class Nlp {
    constructor(settings?: any);
    
    // Common methods that might be used
    use(plugin: any): this;
    train(): Promise<void>;
    process(locale: string, text: string): Promise<{
      intent?: string;
      score?: number;
      utterance?: string;
      [key: string]: any;
    }>;
    addDocument(locale: string, utterance: string, intent: string): void;
    addAnswer(locale: string, intent: string, answer: string): void;
  }
}
