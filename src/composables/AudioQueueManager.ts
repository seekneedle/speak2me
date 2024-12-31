// Manages sequential audio playback
export class AudioQueueManager {
    private static instance: AudioQueueManager;
    private audioContext: AudioContext;
    private queue: Array<{
        buffer: AudioBuffer;
        onComplete: () => void;
        sequence: number;
    }> = [];
    private isPlaying = false;
    private currentSource: AudioBufferSourceNode | null = null;
    private textToAudioDelay = 500; // Default 500ms delay between text and audio
    private pendingBuffers = new Map<number, {
        buffer: AudioBuffer;
        onComplete: () => void;
    }>();
    private nextToPlay = 0;
    
    // New property to store a single global onComplete callback
    private globalOnCompleteCallback: (() => void) | null = null;

    private constructor(sharedAudioContext: AudioContext) {
        this.audioContext = sharedAudioContext;
        //this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    public static getInstance(sharedAudioContext: AudioContext): AudioQueueManager {
        if (!AudioQueueManager.instance) {
            AudioQueueManager.instance = new AudioQueueManager(sharedAudioContext);
        }
        return AudioQueueManager.instance;
    }

    public setTextToAudioDelay(delay: number) {
        this.textToAudioDelay = delay;
    }

    // New method to set the global onComplete callback
    public setGlobalOnCompleteCallback(callback: () => void) {
        this.globalOnCompleteCallback = callback;
    }

    private diagnoseAudioContext() {
        console.log('Audio Context Diagnosis', {
            state: this.audioContext.state,
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            userAgent: navigator.userAgent,
            audioContextSupport: !!(window.AudioContext || (window as any).webkitAudioContext)
        });
    
        // Attempt to resume if suspended
        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log('AudioContext successfully resumed');
            }).catch(error => {
                console.error('Failed to resume AudioContext:', error);
            });
        }
    }

    public stopAudioPlayback() {
        if (this.currentSource) {
            this.currentSource.stop();
            this.currentSource.disconnect();
            this.currentSource = null;
        }
        // Clear all pending buffers and queue
        this.pendingBuffers.clear();
        this.queue = [];
        this.isPlaying = false;
        this.nextToPlay = 0;
        // Clear the global onComplete callback
        this.globalOnCompleteCallback = null;
    }

    public async processAudioInBackground(
        audioBuffer: AudioBuffer, 
        sequence: number
    ): Promise<void> {
        // Add delay to maintain sync with text
        await new Promise(resolve => setTimeout(resolve, this.textToAudioDelay));
        console.log(`sequence: ${sequence}, nextToPlay: ${this.nextToPlay}`);
        
        return new Promise<void>((resolve) => {
            // Validate sequence to prevent out-of-order processing
            if (sequence < this.nextToPlay) {
                console.log(`Skipping audio sequence ${sequence} as it's before ${this.nextToPlay}`);
                resolve();
                return;
            }

            this.pendingBuffers.set(sequence, {
                buffer: audioBuffer,
                onComplete: () => {
                    console.log(`Audio ${sequence} processing completed`);
                    resolve();
                }
            });
            
            this.diagnoseAudioContext();
            this.tryProcessQueue();
        });
    }

    private tryProcessQueue() {
        // Keep track of processed sequences to detect potential stalls
        const processedSequences: number[] = [];
        console.log('tryProcessQueue');
        this.diagnoseAudioContext();

        while (this.pendingBuffers.has(this.nextToPlay)) {
            const nextBuffer = this.pendingBuffers.get(this.nextToPlay)!;
            this.pendingBuffers.delete(this.nextToPlay);
            
            this.queue.push({
                ...nextBuffer,
                sequence: this.nextToPlay
            });
            
            processedSequences.push(this.nextToPlay);
            this.nextToPlay++;
            
            if (!this.isPlaying) {
                this.playNext();
            }
        }

        // If no sequences were processed and pendingBuffers is not empty, 
        // find the next available sequence to prevent stalling
        if (processedSequences.length === 0 && this.pendingBuffers.size > 0) {
            const availableSequences = Array.from(this.pendingBuffers.keys()).sort((a, b) => a - b);
            
            console.warn('Queue processing stalled. Available sequences:', availableSequences);
            
            // Skip to the earliest available sequence to prevent complete stalling
            if (availableSequences.length > 0) {
                this.nextToPlay = availableSequences[0];
                console.log(`Skipping to sequence ${this.nextToPlay} to prevent queue stall`);
            }
        }
    }

    private playNext() {
        console.log('playNext');
        if (this.isPlaying || this.queue.length === 0) {
            console.log('Queue is empty or already playing');
            this.diagnoseAudioContext();
            return;
        }

        this.isPlaying = true;
        const { buffer, onComplete } = this.queue[0];
        
        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext.destination);
        
        // Store current source for stop functionality
        this.currentSource = source;

        source.onended = () => {
            this.queue.shift();
            this.isPlaying = false;
            this.currentSource = null;
            onComplete();

            // If this was the last buffer, call globalOnCompleteCallback and reset isPlaying
            if (this.queue.length === 0) {
                console.log('All buffers played');
                this.isPlaying = false;
                if (this.globalOnCompleteCallback) {
                    const callback = this.globalOnCompleteCallback;
                    // Clear the callback to prevent multiple calls
                    this.globalOnCompleteCallback = null;
                    callback();
                }
                this.playNext();
            } else {
                // If more buffers exist, continue playing
                this.playNext();
            }
        };

        if (this.audioContext.state === 'suspended') {
            this.audioContext.resume().then(() => {
                console.log('AudioContext successfully resumed for playing');
                source.start(0)
            });
            console.log('after resume attempt');
            this.diagnoseAudioContext();
        } else {
            source.start(0);
            console.log('audioContext is not suspended');
            this.diagnoseAudioContext();
        }
    }

    public clear() {
        this.queue = [];
        this.pendingBuffers.clear();
        this.isPlaying = false;
        this.nextToPlay = 0;
        this.globalOnCompleteCallback = null;
    }
}
