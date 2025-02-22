import axios from 'axios';
import { config } from '../config/config';

const AUTH_URL = 'user/login';
/**
 * Extracts JSON objects from a given text string
 * Handles nested JSON objects by tracking bracket count
 * 
 * @param text - The input text containing JSON objects
 * @returns An array of parsed JSON objects
 */
export const extractJsonObjects = (text: string): any[] => {
  const jsonObjects: any[] = [];
  let currentJson = '';
  let bracketCount = 0;

  for (let char of text) {
    if (char === '{') bracketCount++;
    if (char === '}') bracketCount--;

    currentJson += char;

    if (bracketCount === 0 && currentJson.trim() !== '') {
      try {
        const parsedObject = JSON.parse(currentJson);
        jsonObjects.push(parsedObject);
        currentJson = '';
      } catch (error) {
        currentJson = '';
        bracketCount = 0;
      }
    }
  }

  return jsonObjects;
};


// Helper function to guess audio format based on file signature
export const identifyAudioFormat = (uint8Array: Uint8Array): string => {
  // Check for common audio file signatures
  const signatures = [
    { format: 'WAV', signature: [82, 73, 70, 70] },  // RIFF
    { format: 'MP3', signature: [255, 251] },        // MP3 frame sync
    { format: 'AAC', signature: [255, 240] },        // AAC
    { format: 'FLAC', signature: [102, 76, 97, 67] } // fLaC
  ];

  for (const sig of signatures) {
    if (sig.signature.every((byte, index) => uint8Array[index] === byte)) {
      return sig.format;
    }
  }

  return 'Unknown';
}


export async function getAuthToken(): Promise<string> {
  try {
    const response = await axios.post(AUTH_URL, 
      { name: "sales" },
      {
        auth: {
          username: config.auth.username,
          password: config.auth.password
        },
        headers: {        
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        withCredentials: true
      }
    );
    console.log('Full response details from auth:', {
      status: response.status,
      headers: response.headers,
      data: response.data
    });
    const authToken = response.data.data.token;
    if (authToken === null) {
      throw new Error('Authentication token is null');
    }
    return authToken;
  } catch (error) {
    console.error('Error getting auth token:', error);
    return Promise.reject(error);
  }
}

// Detect mobile device
export const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}

export const isIOSDevice = () => {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function isWeChat(){
  
  var ua = window.navigator.userAgent.toLowerCase();
  //通过正则表达式匹配ua中是否含有MicroMessenger字符串
  if (ua.match(/MicroMessenger/i)?.toString().toLocaleLowerCase() === 'micromessenger'){
    return true;
  } else {
    return false;
  }
}

function chineseLevenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  
  // Create a 2D matrix for dynamic programming
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  // Initialize first row and column
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  // Fill the matrix
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // Deletion
          dp[i][j - 1] + 1,     // Insertion
          dp[i - 1][j - 1] + 1  // Substitution
        );
      }
    }
  }

  return dp[m][n];
}

// Normalized similarity score
export function chineseSimilarity(s1: string, s2: string): number {
  const distance = chineseLevenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  // Return a similarity score between 0 and 1
  return 1 - (distance / maxLength);
}

// Utility function to split text into sentences
export function splitIntoSentences(text: string): string[] {
  // Chinese and English sentence delimiters
  const delimiters = ['。', '！', '？', '!', '?', '.', ';', '；'];
  
  let sentences: string[] = [];
  let currentSentence = '';

  for (let char of text) {
    currentSentence += char;
    if (delimiters.includes(char)) {
      sentences.push(currentSentence.trim());
      currentSentence = '';
    }
  }

  // Add any remaining text
  if (currentSentence.trim()) {
    // Check if the remaining text already ends with a delimiter
    const hasDelimiter = delimiters.some(delimiter => currentSentence.trim().endsWith(delimiter));
    
    // If no delimiter, append a default Chinese period
    sentences.push(hasDelimiter 
      ? currentSentence.trim() 
      : `${currentSentence.trim()}。`
    );
  }

  return sentences;
}

export class SentenceBuffer {
  private buffer: string = '';
  private delimiters = ['。', '！', '？', '!', '?', '.', ';', '；'];

  addChunk(chunk: string): string[] {
    this.buffer += chunk;
    return this.extractCompleteSentences();
  }

  private extractCompleteSentences(): string[] {
    const sentences: string[] = [];
    
    while (true) {
      // Find the index of the first delimiter
      const delimiterIndex = this.delimiters.reduce((minIndex, delimiter) => {
        const index = this.buffer.indexOf(delimiter);
        return (index !== -1 && index < minIndex) ? index : minIndex;
      }, this.buffer.length);

      // If no delimiter found, break
      if (delimiterIndex === this.buffer.length) break;

      // Extract the complete sentence (including the delimiter)
      const sentence = this.buffer.slice(0, delimiterIndex + 1).trim();
      sentences.push(sentence);

      // Remove the processed sentence from the buffer
      this.buffer = this.buffer.slice(delimiterIndex + 1).trimStart();
    }

    return sentences;
  }

  getRemainingBuffer(): string {
    return this.buffer;
  }
}

export class DisplayQueue {
  private queue: string[] = [];
  private isProcessing = false;

  async enqueue(sentence: string, onChunk: (chunk: string) => void): Promise<void> {
    this.queue.push(sentence);
    
    if (!this.isProcessing) {
      this.isProcessing = true;
      await this.processQueue(onChunk);
    }
  }

  private async processQueue(onChunk: (chunk: string) => void): Promise<void> {
    while (this.queue.length > 0) {
      const sentence = this.queue.shift();
      if (sentence) {
        await this.displaySentence(sentence, onChunk);
      }
    }
    this.isProcessing = false;
  }

  private async displaySentence(sentence: string, onChunk: (chunk: string) => void): Promise<void> {
    return new Promise((resolve) => {
      
      let index = 0;

      const displayNextChar = () => {
        if (index < sentence.length) {
          
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
}


export function convertWebmToWav(webmBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
      const audioContext = new AudioContext();
      const reader = new FileReader();

      reader.onload = async (e) => {
          try {
              const arrayBuffer = e.target?.result as ArrayBuffer;
              const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

              // Convert AudioBuffer to WAV
              const wavBlob = await audioBufferToWavBlob(audioBuffer);

              resolve(wavBlob);
          } catch (error) {
              console.error('Error converting WebM to WAV:', error);
              reject(error);
          }
      };

      reader.onerror = (error) => {
          console.error('FileReader error:', error);
          reject(error);
      };

      reader.readAsArrayBuffer(webmBlob);
  });
}

/**
* Convert AudioBuffer to WAV Blob
* @param audioBuffer AudioBuffer to convert
* @returns Promise resolving to WAV Blob
*/
async function audioBufferToWavBlob(audioBuffer: AudioBuffer): Promise<Blob> {
  // Number of channels (1 for mono, 2 for stereo)
  const numOfChan = audioBuffer.numberOfChannels;
  // Sample rate
  const sampleRate = audioBuffer.sampleRate;
  // Total samples
  const samples = audioBuffer.length;
  // Bit depth (16-bit)
  const bytesPerSample = 2;

  // Create a buffer to hold the WAV file
  const buffer = new ArrayBuffer(44 + samples * numOfChan * bytesPerSample);
  const view = new DataView(buffer);

  // Write WAV header
  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples * numOfChan * bytesPerSample, true);
  writeString(view, 8, 'WAVE');

  // FMT sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);  // Subchunk1Size
  view.setUint16(20, 1, true);   // Audio format (1 = PCM)
  view.setUint16(22, numOfChan, true);  // Number of channels
  view.setUint32(24, sampleRate, true); // Sample rate
  view.setUint32(28, sampleRate * numOfChan * bytesPerSample, true); // Byte rate
  view.setUint16(32, numOfChan * bytesPerSample, true); // Block align
  view.setUint16(34, bytesPerSample * 8, true); // Bits per sample

  // Data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples * numOfChan * bytesPerSample, true);

  // Write audio data
  let offset = 44;
  for (let i = 0; i < samples; i++) {
      for (let channel = 0; channel < numOfChan; channel++) {
          // Get channel data and convert to 16-bit integer
          const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
          const int16Sample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          
          // Write 16-bit sample
          view.setInt16(offset, int16Sample, true);
          offset += bytesPerSample;
      }
  }

  // Create blob
  return new Blob([buffer], { type: 'audio/wav' });
}

// Helper function to write strings to DataView
function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
  }
}