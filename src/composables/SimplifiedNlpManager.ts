// src/composables/SimplifiedNlpManager.ts
import { ref } from 'vue'
import { chineseSimilarity } from '../utils/utils'


// Simple intent classification using keyword matching
export class SimplifiedIntentClassifier {
  private intents: Record<string, string[]> = {
    'intent.yes': [
      
      '是', '对', '好的', '可以', '行', '当然', '好的', '有的',
      '没问题', '继续', '好', '没错', '可以', '肯定', '有'
    ],
    'intent.no': [
      
      '不', '不是', '不行', '不要','不用', '不需要', '无',
      '否', '不想', '没有了', '停', '停止', '算了', '没了'
    ],
    'intent.start': [
      
      '开始', '启动', '开播', '开机'
    ],
    'intent.stop': [
      
      '停止', '暂停', '结束'
    ]
  }

  // Simplified intent classification
  classify(text: string): { intent: string; score: number } {
    // Normalize input
    const normalizedText = text.trim()
    console.log('Normalized text:', normalizedText);
    // Check for exact matches first
    for (const [intent, keywords] of Object.entries(this.intents)) {
      if (keywords.some(keyword => normalizedText === keyword)) {
        //console.log(`${normalizedText} has exact match found for intent "${intent}"`);
        return { intent, score: 1 }; // Exact match found, return intent
      }
    }
    // if there is no exact match, check for similarity
    let bestMatch: { intent: string; score: number } | null = null;
    let threshold: number = 0.5;

    for (const [intent, keywords] of Object.entries(this.intents)) {
      const matchScores = keywords.map(keyword => {
        //chineseSimilarity(normalizedText, keyword);
        const similarity = chineseSimilarity(normalizedText, keyword);
        //console.log(`Similarity between "${normalizedText}" and "${keyword}": ${similarity}`);
        return similarity;
      }
      );
      
      const maxScore = Math.max(...matchScores);
      //console.log(`Max score for intent "${intent}": ${maxScore}`);
      if (maxScore >= threshold) {
        if (!bestMatch || maxScore > bestMatch.score) {
          bestMatch = { intent, score: maxScore };
        }
      }
    }
    //console.log('Best match:', bestMatch?.intent);
    return bestMatch || { intent: 'intent.unknown', score: 0 };
    
  }
}

// Simplified NLP Manager
export class SimplifiedNlpManager {
  private classifier: SimplifiedIntentClassifier
  public isInitialized = ref(false)

  constructor() {
    this.classifier = new SimplifiedIntentClassifier()
  }

  // Quick initialization
  async initialize() {
    // Simulate a quick initialization
    this.isInitialized.value = true
    return true
  }

  // Classify intent
  getIntent(text: string): { intent: string; score: number } {
    if (!this.isInitialized.value) {
      throw new Error('NLP Manager not initialized')
    }
    return this.classifier.classify(text)
  }
}

// Singleton instance
export const simplifiedNlpManager = new SimplifiedNlpManager()