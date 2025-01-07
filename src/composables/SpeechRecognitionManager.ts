import axios from 'axios';
import { ref, Ref } from 'vue';
import { config } from '../config/config';
import { audioContext} from './UseAudioContext';

const upload_api_url = `${config.api.asrBaseUrl}/api/v1/asr/upload`;
const query_api_url = `${config.api.asrBaseUrl}/api/v1/asr/query`;

interface RecognitionResult {
  text: string;
  confidence?: number;
}

export class SpeechRecognitionManager {
  private mediaRecorder: MediaRecorder | null = null;
  private analyser: AnalyserNode | null = null;
  private audioChunks: Blob[] = [];
  private isRecording: Ref<boolean> = ref(false);
  private recognitionResult: Ref<RecognitionResult | null> = ref(null);
  private error: Ref<string | null> = ref(null);
  private silenceTimer: number | null = null;
  private readonly SILENCE_THRESHOLD_MS = 1000; // 1000ms of silence
  private readonly AUDIO_THRESHOLD = 0.10; // Adjust this value (percentage of the volume) to control sensitivity
  private static instance: SpeechRecognitionManager;


  private constructor() {}

  public static getInstance(): SpeechRecognitionManager {
    if (!SpeechRecognitionManager.instance) {
      SpeechRecognitionManager.instance = new SpeechRecognitionManager();
    }
    return SpeechRecognitionManager.instance;
  }

  // Event callbacks
  private onStartCallback: (() => void) | null = null;
  private onEndCallback: (() => void) | null = null;
  private onResultCallback: ((result: string) => void) | null = null;
  private onErrorCallback: ((error: string) => void) | null = null;

  private getAudioLevel(): number {
    if (!this.analyser) return 0;
  
    const bufferLength = this.analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyser.getByteFrequencyData(dataArray);
  
    // Calculate RMS (Root Mean Square) of audio levels
    const sum = dataArray.reduce((acc, val) => acc + val * val, 0);
    const rms = Math.sqrt(sum / bufferLength) / 255; // Normalize to 0-1
  
    return rms;
  }

  private async processAudioChunks() {
    if (this.audioChunks.length > 0) {
      try {
        console.log('Submitting audio with chunk counts:', this.audioChunks.length);
        console.log('Audio Chunks Types:', this.audioChunks.map(chunk => chunk.type));
        // Validate and filter chunks
        const validChunks = this.audioChunks.filter(chunk => 
            chunk.size > 0 && chunk.type === 'audio/webm;codecs=opus'
        );

        if (validChunks.length === 0) {
            console.warn('No valid audio chunks to process');
            this.audioChunks = [];
            return;
        }

        const audioBlob = new Blob(validChunks, { type: 'audio/webm;codecs=opus' });

        console.log(`Audio Blob Details:
            - Size: ${audioBlob.size} bytes
            - Type: ${audioBlob.type}
            - Chunk Count: ${validChunks.length}`);

        if (audioBlob.size > 0) {
            console.log(`Uploading audio at ${new Date().toISOString()}`);
            const taskId = await this.uploadAudio(audioBlob);
            
            console.log(`start polling at ${new Date().toISOString()}`);
            // Process the recognition result
            const result = await this.pollRecognitionResult(taskId);
            
            console.log(`Received result at ${new Date().toISOString()}`);
            // Trigger result callback
            this.onResultCallback?.(result?.text || '');
        } else {
            console.warn('Audio blob is empty, skipping upload');
        }
        


      } catch (error) {
        console.error('Error processing audio chunk:', error);
        this.onErrorCallback?.(String(error));
        this.audioChunks = []; // Clear chunks to prevent repeated errors
      }
    }
  }

  // Event registration methods
  onStart(callback: () => void) {
    this.onStartCallback = callback;
    return this;
  }

  onEnd(callback: () => void) {
    this.onEndCallback = callback;
    return this;
  }

  onResult(callback: (result: string) => void) {
    this.onResultCallback = callback;
    return this;
  }

  onError(callback: (error: string) => void) {
    this.onErrorCallback = callback;
    return this;
  }

  // Get reactive state references
  public getState() {
    return {
      isRecording: this.isRecording,
      result: this.recognitionResult,
      error: this.error
    };
  }

  // Request microphone permissions and start recording
  public async startRecognition(): Promise<void> {
    try {
        // Detect supported MIME types
        const supportedTypes = [
            'audio/webm;codecs=opus',
            'audio/webm',
            'audio/ogg',
            'audio/wav'
        ];
    
        let mimeType = '';
        for (const type of supportedTypes) {
            if (MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            console.log(`Supported audio recording format: ${type}`);
            break;
            }
        }

    
        if (!mimeType) {
            throw new Error('No supported audio recording format found');
        }
        // Reset previous state
        this.audioChunks = [];
        this.recognitionResult.value = null;
        this.error.value = null;

        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1, // Mono audio
                sampleRate: 44100, // Standard sample rate
                sampleSize: 16 // 16-bit audio
            } 
        });

        // Create audio context for level analysis
        const source = audioContext.createMediaStreamSource(stream);
        // Setup analyser node for audio level detection
        this.analyser = audioContext.createAnalyser();
        this.analyser.fftSize = 2048;
        source.connect(this.analyser);

        // Initialize MediaRecorder
        this.mediaRecorder = new MediaRecorder(stream,{
            mimeType: 'audio/webm;codecs=opus' // More specific MIME type
        });

        // Collect audio data
        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                const audioLevel = this.getAudioLevel();                
                //console.log('Audio Level:', audioLevel);
                // Ensure consistent chunk type
                if (event.data.type === 'audio/webm;codecs=opus') {
                    this.audioChunks.push(event.data);
                    //console.log(`Audio chunk received ${event.data} at ${new Date().toISOString()}`);
                } else {
                    console.warn(`Incompatible chunk type: ${event.data.type}`);
                }
                
                // Reset silence timer when data is available
                if (this.silenceTimer && audioLevel > this.AUDIO_THRESHOLD) {
                    //console.log(`Clearing silence timer at ${new Date().toISOString()}`);
                    clearTimeout(this.silenceTimer);
                }
                // Set a new silence timer
                if (audioLevel > this.AUDIO_THRESHOLD) {
                    this.silenceTimer = setTimeout(async () => {
                        console.log(`Silence detected at ${new Date().toISOString()}`);
                        //this.stopRecognition();
                        await this.processAudioChunks();
                    }, this.SILENCE_THRESHOLD_MS) as unknown as number;
                }
                
            } 
           
        };      

      // Start recording with 500ms timeslice to capture audio chunks
      this.mediaRecorder.start(500);
      this.isRecording.value = true;
      this.onStartCallback?.();

    } catch (err) {
      this.error.value = 'Failed to start recording: ' + err;
      console.error(err);
      this.onErrorCallback?.(this.error.value);
    }
  }

  // Stop recording and upload audio
  public async stopRecognition(): Promise<string | void> {
    return new Promise(async (resolve, reject) => {
      if (!this.mediaRecorder) {
        this.error.value = 'No active recording';
        reject(new Error('No active recording'));
        return;
      }
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        // Clear any existing silence timer
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
        }
        // Process any remaining audio chunks
        //await this.processAudioChunks();

        this.mediaRecorder.onstop = async () => {
            this.isRecording.value = false;
            await this.processAudioChunks();
            this.onEndCallback?.();
            resolve();
          };
          console.log(`Stopping mediaRecorder at ${new Date().toISOString()}`);
          this.mediaRecorder.stop();
        } else {
          resolve();
        }
      });
  }

  // Upload audio to remote server
  private async uploadAudio(audioBlob: Blob): Promise<string> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');

    try {
      const response = await axios.post(upload_api_url, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      return response.data.task_id;
    } catch (error) {
      console.error('Audio upload failed:', error);
      throw new Error('Audio upload failed');
    }
  }

  // Poll server for recognition result
  private async pollRecognitionResult(taskId: string, maxAttempts = 3): Promise<RecognitionResult> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const response = await axios.get(`${query_api_url}/${taskId}`);
        console.log('Recognition response:', response);
        if (response.data.resp.message === 'Success') {
          console.log('Recognition result:', response.data.resp.text);
          return {
            text: response.data.resp.text,
            confidence: 1
          };
        }

        // Wait before next attempt
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('Recognition query failed:', error);
        throw new Error('Recognition query failed');
      }
    }

    throw new Error('Recognition timed out');
  }

  // Cancel ongoing recording
  public cancelRecognition(): void {
    if (this.mediaRecorder && this.isRecording.value) {
      this.mediaRecorder.stop();
      this.isRecording.value = false;
      this.audioChunks = [];
    }
  }
}

// Export a singleton instance for easy use
export const speechRecognitionManager = SpeechRecognitionManager.getInstance();