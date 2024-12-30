import { ref } from 'vue';
import axios, { AxiosProgressEvent } from 'axios';
//import { generateSpeech } from './Text2Speech';
//import { AudioQueueManager } from './AudioQueueManager';
import { AudioProcessingManager } from './AudioProcessingManager';
import { extractJsonObjects } from '../utils/utils';
import { config } from '../config/config';
import { containerBootstrap } from '@nlpjs/core';
import { Nlp } from '@nlpjs/nlp';

const STREAM_QUERY_URL = `${config.api.baseUrl}/vector_store/stream_query`;
//const QUERY_URL = `${config.api.baseUrl}/vector_store/query`;
//const SENTENCE_DELIMITERS = ['。', '！', '？', '!', '?'] as const;
//let authToken = ref<string | null>(null);
let seenBytes = 0;
const shouldDisplayText = ref(true);

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const assistantMessage = '请问还有什么可以效劳的？';
const systemTemplate = '# 角色:你的交流风格简练而专业。\
### 技能: 知识整合与应用 \
- **信息调用**：所有问题，首先灵活运用已记忆的材料(${documents})，精准匹配问题需求，提供全面且针对性的解答。\
如果可以找到答案，就直接根据答案进行回复.请严格按照知识库内的材料进行回答，如果没有找到，不要使用网络信息进行回复。\
## 限制与注意事项 \
- **服务对象明确**：明确服务于终端客户。措辞尽可能简练，清晰，体现专业性。每次回答的内容不要超过200字。\
如果遇到无法回答的问题，或者没有把握的问题，统一回复为，对不起，这个问题我无法回答，建议您询问工作人员.\
- **数据准确性**：确保如果询问历史人物，事件等内容时，严格按照知识库内的材料进行回答。不要引用网络信息。';

/* class AudioProcessingManager {
  // Static instance variable
  private static instance: AudioProcessingManager;

  private queue: Array<() => Promise<ArrayBuffer>> = [];
  private runningTasks = 0;
  private readonly MAX_CONCURRENT = 1; // Limit to 1 concurrent audio generations
  private readonly DELAY_BETWEEN_CALLS = 500; // 500ms delay between calls
  private accumulatedChunk = '';
  
  
  private sentenceSequence = 0;  // Add this line to track full sentence count
  // Create audio context and source for decoding
  private audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  private audioQueueManager = AudioQueueManager.getInstance();
  // Private constructor to prevent direct instantiation
  private constructor() {}
  private globalOnCompleteCallback: (() => void) | null = null;

  // Static method to get the singleton instance
  public static getInstance(): AudioProcessingManager {
    if (!AudioProcessingManager.instance) {
      AudioProcessingManager.instance = new AudioProcessingManager();
    }
    return AudioProcessingManager.instance;
  }

  async enqueue(generator: () => Promise<ArrayBuffer>): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await generator();
          const safeResult = result.byteLength > 0 ? result : new ArrayBuffer(0);
          resolve(safeResult);
          return safeResult;
        } catch (error) {
          reject(error);
          throw error; // Re-throw to maintain original error handling
        }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    while (this.queue.length > 0 && this.runningTasks < this.MAX_CONCURRENT) {
      const generator = this.queue.shift();
      if (generator) {
        this.runningTasks++;
        try {
          await generator();
        } catch (error) {
          console.error('Error processing audio generation:', error);
        } finally {
          this.runningTasks--;
          // Add a delay between calls using the DELAY_BETWEEN_CALLS constant
          if (this.queue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, this.DELAY_BETWEEN_CALLS));
          }
          // Continue processing the queue
          this.processQueue();
        }
      }
    }
  }

  private async decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer> {
    return new Promise((resolve, reject) => {
      // Create a deep copy of the ArrayBuffer using Uint8Array
      const uint8Array = new Uint8Array(buffer);
      const audioBufferCopy = uint8Array.buffer;
      
      // Attempt to decode audio data with error handling
      const decodingAttempts: (() => Promise<AudioBuffer>)[] = [
        () => this.audioContext.decodeAudioData(buffer),
        () => this.audioContext.decodeAudioData(audioBufferCopy),
        async () => {
          const blob = new Blob([audioBufferCopy], { type: 'audio/mp3' });
          const arrayBuffer = await blob.arrayBuffer();
          return this.audioContext.decodeAudioData(arrayBuffer);
        }
      ];

      // Validate input buffer
      if (!buffer || buffer.byteLength === 0) {
        reject(new Error('Invalid or empty audio buffer'));
        return;
      }

      // Ensure audio context is in the right state
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(console.error);
      }

      // Use the helper method to attempt decoding
      this.attemptDecode(decodingAttempts)
        .then(resolve)
        .catch(reject);
    });
  }

  private async attemptDecode(attempts: (() => Promise<AudioBuffer>)[]): Promise<AudioBuffer> {
    if (attempts.length === 0) {
      throw new Error('All audio decoding attempts failed');
    }

    try {
      return await attempts[0]();
    } catch (error) {
      console.error('Audio decoding attempt failed:', {
        error: error
      });
      return this.attemptDecode(attempts.slice(1));
    }
  }

  // Method to set the global onComplete callback
  public setGlobalOnCompleteCallback(callback: () => void) {
    this.globalOnCompleteCallback = callback;
    // Also set the callback on the AudioQueueManager
    this.audioQueueManager.setGlobalOnCompleteCallback(() => {
      if (this.globalOnCompleteCallback) {
        const callback = this.globalOnCompleteCallback;
        // Clear the callback to prevent multiple calls
        this.globalOnCompleteCallback = null;
        callback();
      }
    });
  }

  async processAudioChunk(chunk: string): Promise<void> {
    // Accumulate chunks until a complete sentence is formed
    this.accumulatedChunk += chunk;

    // Find the first delimiter that exists in the accumulated chunk
    const foundDelimiter = SENTENCE_DELIMITERS.find(delimiter => 
      this.accumulatedChunk.includes(delimiter)
    );
    // Check if the accumulated chunk contains a complete sentence
    if (foundDelimiter) {
      // Split sentences and filter out empty ones
      const sentences = this.accumulatedChunk.split(foundDelimiter)
        .filter(sentence => sentence.trim() !== '');

      // If we have at least one complete sentence
      if (sentences.length > 0) {
        // Take only the first sentence
        const sentence = sentences[0];
        const fullSentence = sentence + foundDelimiter;

        //capture the current sentence sequence to be tied with audio
        let currentSentenceSequence = this.sentenceSequence;
        console.log(`Processing sentence ${currentSentenceSequence}: ${fullSentence}`);
        
        // Increment sentence sequence
        this.sentenceSequence++;

        // Remove the processed sentence from the accumulated chunk
        this.accumulatedChunk = this.accumulatedChunk.replace(fullSentence, '');

        // Generate speech for the complete sentence
        const audioBuffer = await this.enqueue(() => generateSpeech(fullSentence));
        
        const audioBufferDecoded = await this.decodeAudioData(audioBuffer);
        // Process audio in background
        console.log('sentenceSequence of audio playback', {
          sentence: fullSentence, 
          sentenceSequence: currentSentenceSequence
        });
        await this.audioQueueManager.processAudioInBackground(audioBufferDecoded, currentSentenceSequence);
      }
    }
  }

  async stopAudioPlayback() {
    this.audioQueueManager.stopAudioPlayback();
    // Clear the global onComplete callback when stopping
    this.globalOnCompleteCallback = null;
  }

  // Public method to reset processing state
  public reset() {
    // Reset accumulated chunk
    this.accumulatedChunk = '';
    
    // Reset sentence sequence
    this.sentenceSequence = 0;
    
    // Clear any pending queue
    this.queue = [];
    this.runningTasks = 0;
    
    // Clear any global callbacks
    this.globalOnCompleteCallback = null;
    
    // Stop any ongoing audio playback
    this.audioQueueManager.stopAudioPlayback();
    this.audioQueueManager.clear();
  }
} */

const audioProcessor = AudioProcessingManager.getInstance();

/* async function makeNormalQueryRequest(question: string): Promise<string> {
  const requestBody = {
    id: "wtu9xf10cd", // knowledge base id
    messages: [
      {
        "role": "user", 
        "content": question
      }
    ],
    system: "", // optional system prompt
    top_k: 20,  // adjust these values as needed
    rerank_top_k: 5,
  };

  const axiosConfig = {
    headers: {
      'Authorization': `Basic ${btoa(`${config.auth.username}:${config.auth.password}`)}`,
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  };

  try {
    const response = await axios.post(QUERY_URL, requestBody, axiosConfig);
    if (response.data.code == 200) {
      return response.data.data.content;
    } else {
      return response.data.error;
    }
  } catch (error) {
    console.error('Normal query request error:', error);
    throw error;
  }
} */

async function makeStreamQueryRequest(question: string, 
                                      onChunk: (chunk: string) => void, 
                                      onStart?: () => void, 
                                      onComplete?: () => void): Promise<void> {
  audioProcessor.reset();
  shouldDisplayText.value = true;
  const requestBody = {
    id: config.bailian.indexId, // knowledge base id
    messages: [
      {
        "role": "user", 
        "content": question
      }
    ],
    system: systemTemplate,//'You are a helpful assistant.',
    top_k: 20,  // adjust these values as needed
    rerank_top_k: 5,
  };

   //Set the global onComplete callback if provided
  //  if (onComplete) {
  //    audioProcessor.setGlobalOnCompleteCallback(onComplete);
  //  }

  // Create a promise to track full content retrieval
  const contentCompletionPromise = new Promise<void>((resolve) => {
    const axiosConfig = {
      headers: {
        'Authorization': `Basic ${btoa(`${config.auth.username}:${config.auth.password}`)}`,
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      responseType: 'stream' as const,
      onDownloadProgress: async (progressEvent: AxiosProgressEvent) => {
        console.log('Full progressEvent structure:', JSON.stringify(progressEvent, null, 2));
        
        if (progressEvent.event && progressEvent.event.target) {
          const target = progressEvent.event.target as XMLHttpRequest;

          const responseText = target.responseText.slice(seenBytes || 0);
          seenBytes = target.responseText.length;
          console.log('responseText: ', responseText);
          if (responseText) {
            const jsonObjects = extractJsonObjects(responseText);

            const chunks = jsonObjects
              .map((obj) => obj.data?.content || '')
              .filter((content: string) => content.trim() !== '');

            const chunksArray = chunks.flatMap((chunk) => chunk.split('\n').filter(Boolean));
            console.log('getting response at: ', new Date().toISOString());
            onStart?.();

            for (const chunk of chunksArray) {
              try {
                // Only display text if shouldDisplayText is true
                if (shouldDisplayText.value) {
                  onChunk(chunk);
                  
                  // Process audio in background
                  await audioProcessor.processAudioChunk(chunk);
                } else {
                  audioProcessor.stopAudioPlayback(); 
                }
              } catch (chunkError) {
                console.error('Error processing stream chunk:', {
                  error: chunkError,
                  chunkLength: chunk?.length ?? 0
                });
              }
            }
            // Check if all content has been retrieved
            if (target.readyState === 4 && target.status === 200) {
              console.log('All content retrieved at:', new Date().toISOString());
              onComplete?.();
            }
          }
        }
      }
    };

    try {
      seenBytes = 0;
      axios.post(STREAM_QUERY_URL, requestBody, axiosConfig);
      
    } catch (error) {
      console.error('Stream query request error:', error);
      resolve();
    } finally {
      resolve();
    } 
  }); 

  try {
    // Wait for full content retrieval
    await contentCompletionPromise;
    console.log('contentCompletionPromise resolved at:', new Date().toISOString());
  } catch (error) {
    console.error('Stream query request error:', error);
    throw error;
  } finally {
    audioProcessor.stopAudioPlayback(); 
    console.log('Stream query request completed at:', new Date().toISOString());

    return Promise.resolve();
  }
}

interface NlpResult {
  intent?: string;
  score?: number;
  utterance?: string;
}

// Global variable to store the trained NLP manager
let nlp: Nlp | null = null;

// Async function to initialize and train the NLP manager
async function initializeNlp(): Promise<Nlp> {
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

// Async function to ensure NLP is initialized
async function ensureNlpInitialized() {
  if (!nlp) {
    nlp = await initializeNlp();
  }
  return nlp;
}

export function useRAGSystem() {
  const shouldResumeAudio = ref(false);
  const isLoading = ref(false);
  const isStreamingMode = ref(true);
  const messages = ref<Message[]>([
    {
      role: 'assistant',
      content: (() => {
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
          return '早上好！有什么我可以帮您的吗？'; // Good morning
        } else if (hour >= 12 && hour < 18) {
          return '下午好！有什么需要帮助的吗？'; // Good afternoon
        } else if (hour >= 18 || hour < 5) {
          return '晚上好！我随时准备为您服务。'; // Good evening
        }
        return '您好，有什么可以帮您？'; // Default greeting
      })()
    }
  ]);
  const error = ref<string | null>(null);

  const stopStreaming = () => {
    shouldDisplayText.value = false;
  };

  async function getResponse(question: string) {

    error.value = null;
    //messages.value.push({ role: 'user', content: question });

    // Add user message
    //onst userMessageIndex = messages.value.push({ 
    //  role: 'user', 
    //  content: question 
    //}) - 1;

    // Add placeholder for assistant message
    const assistantMessageIndex = messages.value.push({ 
      role: 'assistant', 
      content: '' 
    }) - 1;
    console.log('start makeStreamQueryRequest at:', new Date().toISOString());
    isLoading.value = true;
    try {
      await makeStreamQueryRequest(
        question, 
        (chunk) => {
          // Update the assistant's message content with streaming chunks
          messages.value[assistantMessageIndex].content += chunk;
        },
        () => {          
          isLoading.value = false;
        },
        () => {
          messages.value.push({
            role: 'assistant',
            content: assistantMessage
          });
          //isLoading.value = false;
          audioProcessor.processAudioChunk(assistantMessage);
        }
      );
      //isLoading.value = false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      error.value = errorMessage;
      
      messages.value[assistantMessageIndex].content = `Error: ${errorMessage}`;
    } finally {
      console.log('makeStreamQueryRequest completed at:', new Date().toISOString());
      //isLoading.value = false;
    }
  }
  
  async function IntentionHook(response: string): Promise<boolean> {
    try {
      messages.value.push({ role: 'user', content: response });
      // Find the latest assistant message
      const latestAssistantMessage = messages.value
      .slice()
      .reverse()
      .find(msg => msg.role === 'assistant');

      // Ensure NLP is initialized
      const manager = await ensureNlpInitialized();
  
      // Perform intent classification
      const result: NlpResult = await manager.process('zh', response);
  
      // Check if the intent is classified as 'no'
      if (result.intent !== undefined && 
        result.intent === 'intent.no' && 
        result.score !== undefined && 
        result.score > 0.5) {
        console.log('IntentionHook: intent detected', result);
        console.log('IntentionHook: ' + latestAssistantMessage?.content);
        if (latestAssistantMessage && 
          latestAssistantMessage.content === assistantMessage) {
          console.log('IntentionHook: ' + assistantMessage);
          // Resume audio playback
          shouldResumeAudio.value = true;
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Intent classification error:', error);
      return true;
      
    }
  }

  async function initializeNlpManager() {
    console.log('Start initializing NLP Manager at:', new Date().toISOString());
    try {
      nlp = await ensureNlpInitialized();
      console.log('NLP Manager initialized successfully at: ', new Date().toISOString());
    } catch (error) {
      console.error('Failed to initialize NLP Manager:', error);
    }
  }

  function toggleStreamingMode() {
    isStreamingMode.value = !isStreamingMode.value;
  }

  return {
    messages, 
    isLoading,
    error,
    isStreamingMode,
    getResponse,
    toggleStreamingMode,
    stopStreaming,
    IntentionHook,
    shouldResumeAudio,
    initializeNlpManager
  };
}