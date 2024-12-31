// src/composables/SimplifiedNlpManager.ts
import { ref } from 'vue'



// Simple intent classification using keyword matching
export class SimplifiedIntentClassifier {
  private intents: Record<string, string[]> = {
    'intent.yes': [
      'yes', 'yeah', 'yep', 'sure', 'okay', 'ok', 'affirmative', 
      '是', '对', '好的', '可以', '行', '当然', '好的', '有的',
      '没问题', '继续', '好', '没错', '可以', '肯定', '有'
    ],
    'intent.no': [
      'no', 'nope', 'negative', 'stop', 'cancel', 
      '不', '不是', '不行', '不要','不用', '不需要', '无',
      '否', '不想', '没有了','停', '停止', '算了', '没了'
    ],
    'intent.start': [
      'start', 'begin', 'commence', 'initiate', 'launch', 
      '开始', '启动', '开播', '开机'
    ],
    'intent.stop': [
      'stop', 'halt', 'pause', 'end', 'terminate', 
      '停止', '暂停', '结束'
    ]
  }

  // Simplified intent classification
  classify(text: string): string {
    // Normalize input
    const normalizedText = text.toLowerCase().trim()

    // Check for exact matches first
    for (const [intent, keywords] of Object.entries(this.intents)) {
      if (keywords.some(keyword => normalizedText.includes(keyword.toLowerCase()))) {
        return intent
      }
    }

    // Default fallback
    return 'intent.unknown'
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
  getIntent(text: string): string {
    if (!this.isInitialized.value) {
      throw new Error('NLP Manager not initialized')
    }
    return this.classifier.classify(text)
  }
}

// Singleton instance
export const simplifiedNlpManager = new SimplifiedNlpManager()