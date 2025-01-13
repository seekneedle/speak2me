import { ref } from 'vue';
import axios, { AxiosProgressEvent } from 'axios';
import { fetchEventSource } from '@microsoft/fetch-event-source';
//import { generateSpeech } from './Text2Speech';
//import { AudioQueueManager } from './AudioQueueManager';
import { AudioProcessingManager } from './AudioProcessingManager';
import { extractJsonObjects } from '../utils/utils';
import {isMobileDevice} from '../utils/utils';
import { splitIntoSentences } from '@/utils/utils'
import { SentenceBuffer } from '@/utils/utils';
import { DisplayQueue } from '@/utils/utils';
import { config } from '../config/config';
//import { containerBootstrap } from '@nlpjs/core';
//import { Nlp } from '@nlpjs/nlp';
//import { Mutex } from 'async-mutex'; // Explicit import of Mutex from async-mutex

//const requestMutex = new Mutex();
const STREAM_QUERY_URL = `${config.api.baseUrl}/vector_store/stream_query`;
const QUERY_URL = `${config.api.baseUrl}/vector_store/query`;
//const SENTENCE_DELIMITERS = ['。', '！', '？', '!', '?'] as const;
//let authToken = ref<string | null>(null);
let seenBytes = 0;
const shouldDisplayText = ref(true);
const isAssistantSpeaking = ref(false);

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

const audioProcessor = AudioProcessingManager.getInstance();

// Smooth character-by-character display
async function displayCharactersBySmoothing(
  sentence: string, 
  onChunk: (chunk: string) => void
): Promise<void> {
  return new Promise((resolve) => {
    //let displayedText = '';
    let index = 0;

    const displayNextChar = () => {
      if (index < sentence.length) {
        //displayedText += sentence[index];
        onChunk(sentence[index]);
        index++;

        // Adjust timing based on character type (slower for Chinese, faster for English)
        const delay = /[\u4e00-\u9fff]/.test(sentence[index - 1]) ? 100 : 50;
        setTimeout(displayNextChar, delay);
      } else {
        resolve();
      }
    };

    displayNextChar();
  });
}

async function makeNormalQueryRequest(question: string, 
                                      onChunk: (chunk: string) => void, 
                                      onStart?: () => void, 
                                      onComplete?: () => void): Promise<string> {
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
      const fullContent = response.data.data.content;
      
      // Split content into sentences
      const sentences = splitIntoSentences(fullContent);
      onStart?.();
      // Process sentences sequentially
      for (const sentence of sentences) {
        // Display characters smoothly
        displayCharactersBySmoothing(sentence, onChunk);
        
        // Speak the sentence
        await audioProcessor.processAudioChunk(sentence);
      }

      onComplete?.();
      return fullContent;
    } else {
      return response.data.error;
    }
  } catch (error) {
    console.error('Normal query request error:', error);
    throw error;
  }
} 

async function makeStreamQueryRequest(question: string, 
                                      onChunk: (chunk: string) => void, 
                                      onStart?: () => void, 
                                      onComplete?: () => void): Promise<void> {
  let isInterrupted: boolean = false;                                    
  audioProcessor.reset();
  //On mobile device, it seems that there is no multiple entrance
  //into this function, the second call to this function will simply
  //purge the previous call. So we need to set shouldDisplayText to true
  //to give this function a fresh start.
  if (isMobileDevice()) {
    shouldDisplayText.value = true;
  }
  
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
  //const contentCompletionPromise = new Promise<void>((resolve) => {
    const axiosConfig = {
      headers: {
        'Authorization': `Basic ${btoa(`${config.auth.username}:${config.auth.password}`)}`,
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      responseType: 'stream' as const,
      onDownloadProgress: 
        async (progressEvent: AxiosProgressEvent) => {
          if (progressEvent.total != null) {
            console.log(Math.round(progressEvent.loaded / progressEvent.total * 100) + '%');
          }
          
          
          //return requestMutex.runExclusive(
            //async () => {
            //console.log('Mutex exclusive block started at:', new Date().toISOString());
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
                //console.log('getting response at: ', new Date().toISOString());
                //onStart?.();
    
                for (const chunk of chunksArray) {
                  try {
                    console.log('Processing chunk:', chunk);
                    // Only display text if shouldDisplayText is true
                    if (shouldDisplayText.value) {
                      onChunk(chunk);
                      
                      // Process audio in background
                      await audioProcessor.processAudioChunk(chunk);
                    } else {
                      //audioProcessor.stopAudioPlayback(); 
                      isInterrupted = true;
                      console.log(`Question (${question}) isInterrupted at: `, new Date().toISOString());
                      // leave the unattended content 
                      break;
                    }
                  } catch (chunkError) {
                    console.error('Error processing stream chunk:', {
                      error: chunkError,
                      chunkLength: chunk?.length ?? 0
                    });
                  }
                }
                shouldDisplayText.value = true;
                // Check if all content has been retrieved
                if (target.readyState === 4 && target.status === 200 && !isInterrupted) {
                  console.log('All content retrieved at:', new Date().toISOString());
                  //onComplete?.();
                }
              }
            }
            //console.log('Mutex exclusive block ended at:', new Date().toISOString());
          //}
        //);
        }
        
    };

    try {
      seenBytes = 0;
      onStart?.();
      axios.post(STREAM_QUERY_URL, requestBody, axiosConfig);
      
    } catch (error) {
      console.error('Stream query request error:', error);
      //resolve();
    } finally {
      
      //resolve();
    } 
  //}); 

  /* try {
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
  } */
} 

async function makeSseRequest(
  question: string, 
  onChunk: (chunk: string) => void, 
  onStart: () => void = () => {}, 
  onComplete: () => void = () => {}
): Promise<void> {
  // Prepare the request body
  const requestBody = {
    id: config.bailian.indexId,
    messages: [
      {
        "role": "user", 
        "content": question
      }
    ],
    system: systemTemplate,
    top_k: 20,
    rerank_top_k: 5,
  };

  // Prepare authorization headers
  const authHeader = `Basic ${btoa(`${config.auth.username}:${config.auth.password}`)}`;

  // Track whether the first message has been received
  let firstMessageReceived = false;

  return new Promise(async (resolve, reject) => {
    const sentenceBuffer = new SentenceBuffer();
    const displayQueue = new DisplayQueue();
    audioProcessor.setGlobalOnCompleteCallback(onComplete);
    const url = new URL(STREAM_QUERY_URL, window.location.origin);
    //url.searchParams.append('question', question);

    // Create a fetch request to initiate the SSE connection with proper headers
    await fetchEventSource(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'text/event-stream',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(requestBody),
      
      async onopen(response) {
          if (response.ok) {
              console.log("SSE connection opened"); // everything's good
              //onStart?.();
          } else {
              console.error("Error opening SSE connection:", response);
          }
      },
      async onmessage(msg) {
          // if the server emits an error message, throw an exception
          // so it gets handled by the onerror callback below:
          if (msg.event === 'FatalError') {
              throw new Error(msg.data);
          }
          // Add a flag to track first message
          if (!firstMessageReceived) {
            onStart();
            firstMessageReceived = true;
          }
          const data = JSON.parse(msg.data);
          console.log('Received chunk:', data.data.content);
          if (data.code === 200) {
            // Add chunk to buffer and extract complete sentences
            const completeSentences = sentenceBuffer.addChunk(data.data.content);

            // Process each complete sentence
            for (const sentence of completeSentences) {
              // Display characters smoothly
              displayQueue.enqueue(sentence, onChunk);
              
              // Process audio in parallel without awaiting
              await audioProcessor.processAudioChunk(sentence);
            }
          }
          
      },
      onclose() {
          // Process any remaining buffer content
          const remainingContent = sentenceBuffer.getRemainingBuffer();
          if (remainingContent.trim()) {
            // If there's any remaining content, process it as a final sentence
            displayQueue.enqueue(remainingContent + '。', onChunk);
            audioProcessor.processAudioChunk(remainingContent);
          }
          console.log("Connection closed");
          //onComplete?.();
      },
      onerror(err) {
          if (err instanceof Error) {
              throw err; // rethrow to stop the operation
          } else {
              // do nothing to automatically retry. You can also
              // return a specific retry interval here.
          }
      }
      
    });
  });
}

import { NlpManagerWrapper } from './NlpInterface'
import { initializeNlp } from './NlpInterface'

interface NlpResult {
  intent?: string;
  score?: number;
  utterance?: string;
}

// Global variable to store the trained NLP manager
let nlp: NlpManagerWrapper | null = null;

// Async function to ensure NLP is initialized
async function ensureNlpInitialized(): Promise<NlpManagerWrapper> {
  if (!nlp) {
    nlp = await initializeNlp(isMobileDevice());
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

  const stopStreaming = async () => {
    console.log('Answer interrupted at:', new Date().toISOString());
    shouldDisplayText.value = false;
    await audioProcessor.stopAudioPlayback(); 
    console.log('Audio stopped at:', new Date().toISOString());
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log('timeout at:', new Date().toISOString());
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
      content: '思考中...' 
    }) - 1;
    console.log('start request at:', new Date().toISOString());
    isLoading.value = true;
    try {
      await makeSseRequest(
        question, 
        (chunk) => {
          // Update the assistant's message content with streaming chunks
          messages.value[assistantMessageIndex].content += chunk;
        },
        () => {
          isAssistantSpeaking.value = true;
          messages.value[assistantMessageIndex].content = '';          
          isLoading.value = false;
        },
        () => {
          messages.value.push({
            role: 'assistant',
            content: assistantMessage
          });
          isAssistantSpeaking.value = false;
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
      console.log('request completed at:', new Date().toISOString());
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
      const nlpManager = await ensureNlpInitialized();
  
      // Perform intent classification
      const result: NlpResult = await nlpManager.process('zh', response);
      console.log('IntentionHook: result', result);
  
      // Check if the intent is classified as 'no'
      if (result.intent !== undefined && 
        result.intent === 'intent.no' && 
        result.score !== undefined && 
        result.score > 0.5) {
        console.log('IntentionHook: intent detected', result);
        console.log('IntentionHook: ' + latestAssistantMessage?.content);
        if (latestAssistantMessage && 
          latestAssistantMessage.content === assistantMessage) {
          console.log('IntentionHook, intent.no replied to ' + assistantMessage);
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
    shouldDisplayText,
    isAssistantSpeaking,
    IntentionHook,
    shouldResumeAudio,
    initializeNlpManager
  };
}