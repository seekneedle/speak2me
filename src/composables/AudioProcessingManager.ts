import { AudioQueueManager } from './AudioQueueManager';
import { generateSpeech } from './Text2Speech';

const SENTENCE_DELIMITERS = ['。', '！', '？', '!', '?'] as const;
const globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
export class AudioProcessingManager {
    // Static instance variable
    private static instance: AudioProcessingManager;
  
    private queue: Array<() => Promise<ArrayBuffer>> = [];
    private runningTasks = 0;
    private readonly MAX_CONCURRENT = 1; // Limit to 1 concurrent audio generations
    private readonly DELAY_BETWEEN_CALLS = 500; // 500ms delay between calls
    private accumulatedChunk = '';
    
    
    private sentenceSequence = 0;  // Add this line to track full sentence count
    // Create audio context and source for decoding
    private audioContext: AudioContext;
    //private audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    private audioQueueManager = AudioQueueManager.getInstance(globalAudioContext);
    // Private constructor to prevent direct instantiation
    private constructor() {this.audioContext = globalAudioContext;}
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
  }