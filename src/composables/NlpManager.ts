import { containerBootstrap } from '@nlpjs/core';
import { Nlp } from '@nlpjs/nlp';

export async function initializeNlp(): Promise<Nlp> {
    const container = await containerBootstrap();
    (container as any).use(Nlp);
    
    // Lazy load the LangZh package
    const { LangZh } = await import('@nlpjs/lang-zh');
    (container as any).use(LangZh);
    
    const nlp = container.get('nlp');
  
    nlp.addLanguage('zh');
    // Train 'no' intents
    const noUtterances = [
      '不', '不用', '不需要', 
      '否', '不想', '没有了',
      '停', '停止', '算了'
    ];
  
    noUtterances.forEach(utterance => {
      nlp.addDocument('zh', utterance, 'intent.no');
    });
  
    // Train some positive intents for contrast
    const yesUtterances = [
      '是', '当然', '好的', '有的',
      '没问题', '继续', '好', '是的',
      '是的', '可以', '肯定', '有'
    ];
  
    yesUtterances.forEach(utterance => {
      nlp.addDocument('zh', utterance, 'intent.yes');
    });
  
    // Train the model
    try {
      await nlp.train();
    } catch (error) {
      console.warn('NLP training encountered an issue:', error);
      // Optionally, you can add more specific error handling here
    }
    return nlp;
  } 