<template>
  <!-- Add audio element to template -->
  <audio 
      ref="audioElement" 
      :src="audioFile" 
      loop 
      preload="metadata"
      @loadstart="onAudioLoadStart"
      @loadedmetadata="onAudioMetadataLoaded"
      @canplay="onAudioCanPlay"
      @error="onAudioError"
    ></audio>
  <!-- Spinning Loader Overlay -->
  <div 
    v-if="!isAudioElementLoaded" 
    class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
  >
    <div class="animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500"></div>
  </div>
  <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden responsive-container">
    <div class="flex flex-col md:flex-row h-auto md:h-[600px]">
      <!-- Waveform Display -->
      <div class="w-full md:w-1/2 bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center responsive-waveform">
        <div 
          class="w-full h-[300px] md:h-full flex items-center justify-center cursor-pointer relative overflow-hidden"
          @click="toggleAudioPlayback"
        >
          <canvas 
            ref="waveformCanvas" 
            class="absolute inset-0 w-full h-full"
          ></canvas>
          
          <!-- Playback indicator -->
          <div 
            v-if="!isAudioPlaying" 
            class="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              class="h-16 md:h-24 w-16 md:w-24 text-white opacity-70 drop-shadow-lg" 
              viewBox="0 0 24 24" 
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Chat Interface -->
      <div class="w-full md:w-1/2 flex flex-col responsive-chat">
        <!-- Chat Messages -->
        <div class="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 md:space-y-4" ref="messagesContainer">
          <ChatMessage
            v-for="(message, index) in messages"
            :key="index"
            :message="message"
            class="text-sm md:text-base"
          />
          
          <!-- Loading Spinner -->
          <div v-if="isLoading" class="flex justify-center items-center py-2 md:py-4">
            <div class="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-8 w-8 md:h-12 md:w-12"></div>
          </div>
        </div>

        <!-- Error Message Banner -->
        <div 
          v-if="error" 
          class="bg-red-100 border border-red-400 text-red-700 px-2 py-2 md:px-4 md:py-3 rounded relative text-xs md:text-base" 
          role="alert"
        >
          <span class="block sm:inline">{{ error }}</span>
          <span 
            @click="clearError" 
            class="absolute top-0 bottom-0 right-0 px-2 py-2 md:px-4 md:py-3 cursor-pointer text-sm md:text-base"
          >
            ×
          </span>
        </div>

        <!-- Input Area -->
        <div class="border-t p-2 md:p-4 bg-gray-50">
          <div class="flex space-x-2 md:space-x-4 items-center">
            <button 
              @click="toggleSpeechRecognition" 
              class="bg-blue-100 text-blue-600 p-2 rounded-full hover:bg-blue-200 transition-colors"
              :class="{ 'bg-red-100 text-red-600': isListening }"
            >
              <svg 
                v-if="!isListening" 
                xmlns="http://www.w3.org/2000/svg" 
                class="h-6 w-6" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              <svg 
                v-else 
                xmlns="http://www.w3.org/2000/svg" 
                class="h-6 w-6" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                <line x1="23" y1="1" x2="1" y2="23" stroke="currentColor" stroke-width="2" />
              </svg>
            </button>

            <input
              v-model="userInput"
              type="text"
              placeholder="Ask a question..."
              class="flex-1 rounded-lg border border-gray-300 px-2 py-1 md:px-4 md:py-2 text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
              @keyup.enter="handleButtonClick"
            />
            <button
              @click="handleButtonClick"
              class="bg-blue-500 text-white px-3 py-1 md:px-6 md:py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm md:text-base"
              :disabled="isLoading || !userInput.trim()"
            >
              {{ buttonText }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Speech Recognition Modal -->
    <div 
      v-if="isListening" 
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div class="bg-white rounded-lg p-6 w-80 text-center relative">
        <button 
          @click="stopSpeechRecognition" 
          class="absolute top-2 right-2 text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
        <h3 class="text-xl font-semibold mb-4">Listening...</h3>
        
        <!-- Voice Wave Visualization -->
        <canvas 
          ref="voiceWaveCanvas" 
          class="w-full h-32 mb-4"
        ></canvas>
        
        <p class="text-gray-600 mb-4">{{ transcriptText }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed, onUnmounted, watch } from 'vue';
import ChatMessage from './ChatMessage.vue';
import { useRAGSystem } from '../composables/useRAGSystem';
import { 
  Scene, 
  PerspectiveCamera, 
  WebGLRenderer, 
  Line,
  CircleGeometry, 
  MeshBasicMaterial, 
  AdditiveBlending,
  AmbientLight,
  Object3D,
  DirectionalLight,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  ShaderMaterial,
  Color,
  Mesh 
} from 'three';

// Audio and visualization refs
const waveformCanvas = ref<HTMLCanvasElement | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);
const isAudioElementLoaded = ref(false);
const isAudioPlaying = ref(false);
const messagesContainer = ref<HTMLDivElement | null>(null);

const { 
  messages, 
  isLoading, 
  error, 
  getResponse,
  stopStreaming,
  shouldDisplayText,
  isAssistantSpeaking,
  IntentionHook,
  shouldResumeAudio,
  initializeNlpManager
} = useRAGSystem();

const userInput = ref('');

// Reactive references for Three.js objects
let camera: PerspectiveCamera | null = null  //相机
let scene: Scene | null = null  //场景
let renderer: WebGLRenderer | null = null  //渲染器
let waveformMesh: Line | null = null  //波形网格
let rotatingCircleMesh: Mesh | null = null  // New mesh for rotating circle
const analyser = ref<AnalyserNode | null>(null);
const animationFrameId = ref<number | null>(null);

// Reactive or global variable to store audio context and source
let globalAudioContext: AudioContext | null = null;
let globalAudioSource: MediaElementAudioSourceNode | null = null;
let globalGainNode: GainNode | null = null;
let isAudioSetup = false;
const audioFile = './res/liaojin.mp3'

// Setup audio graph once
const setupAudioGraph = (audioElement: HTMLAudioElement | null): AnalyserNode | null => {
  // Return null if no audio element provided
  if (!audioElement) return null;

  // Prevent multiple setups
  if (isAudioSetup) return null;

  // Create audio context if not exists
  if (!globalAudioContext) {
    globalAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  // Disconnect previous source if exists
  if (globalAudioSource) {
    try {
      globalAudioSource.disconnect();
    } catch (error) {
      console.warn('Error disconnecting previous audio source:', error);
    }
  }

  // Create new media source
  globalAudioSource = globalAudioContext.createMediaElementSource(audioElement);
  
  // Create gain node for volume control
  if (!globalGainNode) {
    globalGainNode = globalAudioContext.createGain();
  }

  // Create analyser
  const analyser = globalAudioContext.createAnalyser();
  
  // Connect audio graph: source -> gain -> analyser -> destination
  globalAudioSource.connect(globalGainNode);
  globalGainNode.connect(analyser);
  analyser.connect(globalAudioContext.destination);
  
  // Configure analyser
  analyser.fftSize = 256; // Must be power of 2, between 32 and 32768

  // Mark as setup complete
  isAudioSetup = true;

  return analyser;
};

// Add a method to start audio playback
const startAudioPlayback = () => {
  if (audioElement.value) {
    audioElement.value.play()
        .then(() => {
          isAudioPlaying.value = true;
          console.log('Audio started playing');
        })
        .catch((error) => {
          console.error('Error playing audio:', error);
          alert('Please interact with the page to enable audio playback.');
          isAudioPlaying.value = false;
        });
  }
};

// Toggle audio playback with user interaction
const toggleAudioPlayback = () => {


  if (!audioElement.value) {
    console.log('No audio element, setting up playback');
    // setupAudioPlayback();
    // Start audio playback
    // startAudioPlayback();
    return;
  }

  try {
    if (audioElement.value.paused) {
      console.log('Audio is paused, attempting to play');
      try{
        audioElement.value.play();       
        isAudioPlaying.value = true;
        console.log('Audio started playing');
      } catch (playError) {
          console.error('Error playing audio:', playError);
          alert('Please interact with the page to enable audio playback.');
          isAudioPlaying.value = false;
      }
    } else {
      console.log('Audio is playing, attempting to pause');
      
      // Explicitly call pause and log any errors
      try {
        audioElement.value.pause();
        isAudioPlaying.value = false;
        console.log('Audio paused successfully');
      } catch (pauseError) {
        console.error('Error pausing audio:', pauseError);
        
        // Attempt to reset audio element if pause fails
        try {
          audioElement.value.currentTime = 0;
          audioElement.value.load();
        } catch (resetError) {
          console.error('Error resetting audio element:', resetError);
        }
      }
    }
  } catch (generalError) {
    console.error('Unexpected error in audio playback toggle:', generalError);
  }

  console.log('New audio playing state:', isAudioPlaying.value);
};

// Event handlers
const onAudioLoadStart = () => {
  console.log('Audio loading started at: ' + new Date().toISOString());
}

const onAudioMetadataLoaded = () => {
  console.log('Audio metadata loaded at: ' + new Date().toISOString());
}

const onAudioCanPlay = () => {
  console.log('Audio can play at: ' + new Date().toISOString());
  isAudioElementLoaded.value = true
}

const onAudioError = (event: Event) => {
  const audioElement = event.target as HTMLAudioElement
  console.error('Audio loading error:', audioElement.error)
  
  // Detailed error logging
  switch (audioElement.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED:
      console.error('Fetching process aborted')
      break
    case MediaError.MEDIA_ERR_NETWORK:
      console.error('Network error - check audio file URL')
      break
    case MediaError.MEDIA_ERR_DECODE:
      console.error('Decoding error - check audio file format')
      break
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      console.error('Audio format not supported')
      break
    default:
      console.error('Unknown audio error')
  }

  alert('Audio loading failed. Please check network and file compatibility.')
}

/* 
const setupAudioPlayback = () => {
  console.log('Setting up basic audio playback');
  
  // Create audio element if not exists
  if (!audioElement.value) {
    audioElement.value = new Audio(audioFile);
    audioElement.value.preload = 'metadata';
    audioElement.value.loop = true;

    // Add more comprehensive event listeners
    audioElement.value.addEventListener('loadstart', () => {
      console.log('Audio loading started');
    });

    audioElement.value.addEventListener('loadedmetadata', () => {
      console.log('Audio metadata loaded');
    });

    audioElement.value.addEventListener('canplay', () => {
      console.log('Audio can play');
      isAudioElementLoaded.value = true;
    });

    audioElement.value.onerror = (e) => {
      console.error('Audio loading error:', e);
      alert('Failed to load audio file. Please check the file path.');
    };

    // Initialize 3D Waveform after audio is loaded
    audioElement.value.addEventListener('canplaythrough', () => {
      console.log('Audio element loaded at: ' + new Date().toISOString());
      isAudioElementLoaded.value = true;
      // Setup audio graph and only proceed if successful
      /* const newAnalyser = setupAudioGraph(audioElement.value);
      if (newAnalyser) {
        analyser.value = newAnalyser;
        
        // Initialize 3D Waveform
        init3DWaveform();
        //init3DRotatingCircle();
      } else {
        console.error('Failed to setup audio graph');
      } *//*
    });
  }
}; */

// Initialize 3D Waveform Visualization
const init3DWaveform = () => {
  if (!waveformCanvas.value || !audioElement.value) return;

  // Scene setup
  scene = new Scene();
  
  // Camera
  camera = new PerspectiveCamera(
    75, 
    waveformCanvas.value.clientWidth / waveformCanvas.value.clientHeight, 
    0.1, 
    1000
  );
  camera.position.z = 5;

  // Renderer
  renderer = new WebGLRenderer({ 
    canvas: waveformCanvas.value,
    alpha: true,
    antialias: true 
  });
  renderer.setSize(
    waveformCanvas.value.clientWidth, 
    waveformCanvas.value.clientHeight
  );

  // Lighting
  const ambientLight = new AmbientLight(0x404040);
  scene.add(ambientLight);

  const directionalLight = new DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // Create dynamic waveform geometry
  const geometry = new BufferGeometry();
  const vertices: number[] = [];
  const numPoints = 128; // Match analyser frequency bin count

  for (let i = 0; i < numPoints; i++) {
    vertices.push(
      (i / (numPoints - 1) - 0.5) * 10,  // x spread across width
      0,                                 // y initial position
      0                                  // z 
    );
  }

  geometry.setAttribute(
    'position', 
    new Float32BufferAttribute(vertices, 3)
  );

  // Material with gradient and glow
  const material = new LineBasicMaterial({
    color: 0x3498db,
    transparent: true,
    opacity: 0.7,
    blending: AdditiveBlending
  });

  // Create the waveform line
  waveformMesh = new Line(geometry, material);
  scene.add(waveformMesh);

  // Animate
  const animate = () => {
    if (!scene || !camera || !renderer || !waveformMesh || !analyser.value) {
      console.warn('Three.js objects not fully initialized');
      return;
    }

    // Always request next animation frame first
    animationFrameId.value = requestAnimationFrame(animate);

    // Get frequency data
    const dataArray = new Uint8Array(analyser.value.frequencyBinCount);
    analyser.value.getByteFrequencyData(dataArray);

    // Update waveform geometry
    const positions = waveformMesh.geometry.attributes.position.array;

    for (let i = 0; i < dataArray.length; i++) {
      const index = i * 3 + 1;  // y coordinate
      const frequency = dataArray[i] / 255;
      
      // Create dynamic 3D wave effect
      positions[index] = frequency * 3 * Math.sin(i * 0.2);
    }

    // Mark geometry as needing update
    waveformMesh.geometry.attributes.position.needsUpdate = true;

    // Subtle rotation for 3D effect
    waveformMesh.rotation.x = Math.sin(Date.now() * 0.001) * 0.05;
    waveformMesh.rotation.y = Math.cos(Date.now() * 0.001) * 0.05;

    // Render scene with error handling
    try {
      renderer.render(scene, camera);
    } catch (error) {
      console.error('Rendering error:', error);
      // Stop animation if rendering fails
      if (animationFrameId.value) {
        cancelAnimationFrame(animationFrameId.value);
      }
    }
  };

  // Start animation immediately after initialization
  animate();
};

// Initialize 3D Rotating Circle Visualization
/* const init3DRotatingCircle = () => {
  if (!waveformCanvas.value) return;

  // Cleanup existing scene if it exists
  if (scene) {
    scene.remove.apply(scene, scene.children);
  }
  if (renderer) {
    // Check if the renderer's canvas is actually in the DOM
    if (renderer.domElement.parentNode === waveformCanvas.value) {
      waveformCanvas.value.removeChild(renderer.domElement);
    }
    renderer.dispose();
  }

  // Create scene, camera, and renderer
  scene = new Scene();
  camera = new PerspectiveCamera(75, waveformCanvas.value.clientWidth / waveformCanvas.value.clientHeight, 0.1, 1000);
  renderer = new WebGLRenderer({ 
    canvas: waveformCanvas.value,
    antialias: true,
    alpha: true 
  });
  renderer.setSize(waveformCanvas.value.clientWidth, waveformCanvas.value.clientHeight);
  renderer.setClearColor(0x000000, 0); // Transparent background

  // Create a pulsating circle geometry
  const circleGeometry = new CircleGeometry(5, 64);
  const circleMaterial = new ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      amplitude: { value: 0 },
      color: { value: new Color(0x1E90FF) } // Tailwind blue-500
    },
    vertexShader: `
      uniform float time;
      uniform float amplitude;
      varying vec2 vUv;
      
      void main() {
        vUv = uv;
        vec3 newPosition = position;
        
        // More aggressive pulsation and distortion
        float pulseIntensity = sin(time * 10.0) * 0.5 + 0.5;
        float distanceFromCenter = length(uv - vec2(0.5));
        
        // Increase amplitude and add more complex distortion
        float distortionFactor = sin(distanceFromCenter * 20.0 + time * 5.0) * amplitude * 2.0;
        newPosition.z += distortionFactor * pulseIntensity;
        newPosition.x += sin(time * 3.0) * distortionFactor * 0.2;
        newPosition.y += cos(time * 3.0) * distortionFactor * 0.2;
        
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float time;
      uniform float amplitude;
      varying vec2 vUv;
      
      void main() {
        // Create a radial gradient
        float dist = length(vUv - vec2(0.5));
        float alpha = smoothstep(0.5, 0.0, dist);
        
        // Pulsating color intensity
        float pulse = sin(time * 10.0) * 0.5 + 0.5;
        vec3 finalColor = color * (0.7 + pulse * 0.3);
        // Add some additional color variation based on amplitude
        finalColor *= (1.0 + amplitude * 0.5);
        
        gl_FragColor = vec4(finalColor, alpha * (0.8 + amplitude * 0.2));
      }
    `,
    transparent: true
  });

  rotatingCircleMesh = new Mesh(circleGeometry, circleMaterial);
  scene.add(rotatingCircleMesh);

  // Position camera
  camera.position.z = 10;

  // Animation loop
  const animate = () => {

    if (!scene || !camera || !renderer || !rotatingCircleMesh) return;

    // Only continue if analyser is available and audio is playing
    if (!analyser.value) {
      animationFrameId.value = requestAnimationFrame(animate);
      return;
    }

    // Rotate the circle
    if (rotatingCircleMesh) {
      rotatingCircleMesh.rotation.z += 0.01;
    }

    // Update shader uniforms
    if (rotatingCircleMesh.material instanceof ShaderMaterial) {
      const shaderMaterial = rotatingCircleMesh.material;
      
      // Update time uniform for animation
      shaderMaterial.uniforms.time.value = performance.now() * 0.001;

      // Dynamically adjust amplitude based on audio
      if (analyser.value) {
        const dataArray = new Uint8Array(analyser.value.frequencyBinCount);
        analyser.value.getByteFrequencyData(dataArray);
        
        // Calculate average frequency
        const averageFrequency = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const normalizedFrequency = Math.min(averageFrequency / 128.0, 1.0);
        
        // Map average frequency to amplitude
        //shaderMaterial.uniforms.amplitude.value = 
        //  isAudioPlaying.value ? (averageFrequency / 128.0) * 0.5 : 0;
        shaderMaterial.uniforms.amplitude.value = 
          isAudioPlaying.value ? normalizedFrequency * 2.0 : 0;
        // More dynamic rotation
        if (rotatingCircleMesh) {
          // Vary rotation speed based on audio frequency
          const rotationSpeed = 0.01 + (normalizedFrequency * 0.05);
          rotatingCircleMesh.rotation.z += rotationSpeed;
          
          // Add some additional rotation on other axes for more dynamism
          rotatingCircleMesh.rotation.x += rotationSpeed * 0.5;
          rotatingCircleMesh.rotation.y += rotationSpeed * 0.3;
        }
      }
    }

    renderer.render(scene, camera);
    // Continue animation loop
    animationFrameId.value = requestAnimationFrame(animate);
  };


  animate();

  // Handle window resize
  const handleResize = () => {
    if (!waveformCanvas.value || !camera || !renderer) return;
    
    const width = waveformCanvas.value.clientWidth;
    const height = waveformCanvas.value.clientHeight;
    
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };

  window.addEventListener('resize', handleResize);

  // Cleanup function
  onUnmounted(() => {
    window.removeEventListener('resize', handleResize);
    
    if (animationFrameId.value) {
      cancelAnimationFrame(animationFrameId.value);
    }
    
    // Dispose of Three.js resources
    if (scene) {
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          if (Array.isArray(object.material)) {
            object.material.forEach(material => material.dispose());
          } else {
            object.material.dispose();
          }
        }
      });
    }
    
    if (renderer) {
      renderer.dispose();
    }
  });
}; */

// Modify existing sendMessage to pause audio during Q&A
const sendMessage = async () => {
  if (!userInput.value.trim()) return;

  // Pause audio when sending a message
  if (isAudioPlaying.value) {
    audioElement.value?.pause();
    isAudioPlaying.value = false;
  }

  try {
    await getResponse(userInput.value);
    userInput.value = '';
    await scrollToBottom();
  } catch (err) {
    console.error('Error sending message:', err);
  }
};

const buttonText = computed(() => {
  return isLoading.value ? 'Thinking...' : 'Send';
});

const handleButtonClick = async () => {
  if (!userInput.value.trim()) return;
  //stop the current streaming of answser text,
  //and get ready for taking care of the new input
  if (isAssistantSpeaking.value) {
    stopStreaming();
  }
  
  // Use await to check if the message should be sent
  const shouldSendMessage = await IntentionHook(userInput.value.trim());
  
  if (shouldSendMessage) {
    await sendMessage();
  }
  
  // Always clear the input
  userInput.value = '';
};

const clearError = () => {
  if (error.value) {
    error.value = null;
  }
};

const scrollToBottom = async () => {
  await nextTick();
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
    console.log('Scrolled to bottom:', messagesContainer.value.scrollHeight);
  }
};

// Speech Recognition Setup
const isListening = ref(false);
const transcriptText = ref('');
const voiceWaveCanvas = ref<HTMLCanvasElement | null>(null);
let speechRecognition: SpeechRecognition | null = null;
let audioContext: AudioContext | null = null;
let speechRecognitionAnalyser: AnalyserNode | null = null;

const initializeSpeechRecognition = () => {
  // Check browser support with multiple prefixes
  const SpeechRecognition = 
    window.SpeechRecognition || 
    (window as any).webkitSpeechRecognition || 
    (window as any).mozSpeechRecognition || 
    (window as any).msSpeechRecognition;
  
  if (!SpeechRecognition) {
    console.error('Speech recognition is not supported in this browser.');
    alert('Your browser does not support speech recognition. Please try Chrome or Edge.');
    return null;
  }

  try {
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    
    // Detect browser language or fallback to a default
    recognition.lang = navigator.language || 'zh-CN';
    
    console.log('Speech Recognition Language:', recognition.lang);

    let speechTimeout: number | null = null;

    recognition.onstart = () => {
      console.log('Speech recognition started');
      isListening.value = true;
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      console.log('Speech Recognition Full Event:', event);
      
      // Clear any existing timeout
      if (speechTimeout) {
        clearTimeout(speechTimeout);
      }

      // More robust transcript extraction
      const results = event.results;
      const transcript = Array.from(results)
        .map(result => result[0]?.transcript || '')
        .filter(Boolean)
        .join(' ');
      
      console.log('Extracted Transcript:', transcript);
      
      if (transcript) {
        transcriptText.value = transcript;
        userInput.value = transcript;
      }

      // Set a new timeout to stop recognition if no speech is detected
      speechTimeout = setTimeout(() => {
        console.log('Speech timeout triggered');
        stopSpeechRecognition();
      }, 2000) as unknown as number;
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      
      // More detailed error handling
      switch(event.error) {
        case 'no-speech':
          alert('No speech was detected. Please try again.');
          break;
        case 'audio-capture':
          alert('No microphone was found. Ensure your microphone is connected.');
          break;
        case 'not-allowed':
          alert('Permission to use microphone was denied. Please check your browser settings.');
          break;
        case 'network':
          alert('Network error occurred. Check your internet connection.');
          break;
        default:
          alert(`Speech recognition error: ${event.error}`);
      }
      
      isListening.value = false;
    };

    recognition.onend = () => {
      console.log('Speech recognition ended');
      
      if (speechTimeout) {
        clearTimeout(speechTimeout);
      }
      
      isListening.value = false;
      stopVoiceVisualization();
    };

    return recognition;
  } catch (error) {
    console.error('Failed to initialize speech recognition:', error);
    alert('Failed to initialize speech recognition. Please try a different browser.');
    return null;
  }
};

const toggleSpeechRecognition = () => {
  if (!speechRecognition) {
    speechRecognition = initializeSpeechRecognition();
  }

  if (!isListening.value) {
    startSpeechRecognition();
  } else {
    stopSpeechRecognition();
  }
};

const startSpeechRecognition = () => {
  if (speechRecognition) {
    console.log('startSpeechRecognition');
    isListening.value = true;
    transcriptText.value = '';
    userInput.value = '';
    speechRecognition.start();
    startVoiceVisualization();
  }
};

const stopSpeechRecognition = () => {
  if (speechRecognition) {
    console.log('stopSpeechRecognition');
    speechRecognition.stop();
    isListening.value = false;
    stopVoiceVisualization();
  }
};

const startVoiceVisualization = () => {
  nextTick(() => {
    // Wait for the canvas to be available
    if (!voiceWaveCanvas.value) {
      console.warn('Voice wave canvas not yet available');
      return;
    }

    console.log('startVoiceVisualization');
    
    // Close any existing audio context to prevent multiple contexts
    if (audioContext) {
      audioContext.close();
    }

    // Initialize audio context and analyser
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Request microphone access
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        const source = audioContext!.createMediaStreamSource(stream);
        speechRecognitionAnalyser = audioContext!.createAnalyser();
        source.connect(speechRecognitionAnalyser);
        
        speechRecognitionAnalyser.fftSize = 256;
        const bufferLength = speechRecognitionAnalyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const canvas = voiceWaveCanvas.value;
        const canvasCtx = canvas && canvas.getContext('2d');

        if (!canvasCtx) {
          console.error('Could not get canvas context');
          return;
        }

        // Ensure canvas is clear and sized correctly
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        function draw() {
          if (!isListening.value || !canvasCtx || !speechRecognitionAnalyser) {
            if (!canvasCtx) {
              return
            }
            // Clear the canvas when not listening
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            return;
          }

          requestAnimationFrame(draw);

          speechRecognitionAnalyser.getByteFrequencyData(dataArray);

          // Clear canvas
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

          const barWidth = (canvas.width / dataArray.length) * 2.5;
          let barHeight;
          let x = 0;

          // Draw colorful frequency bars
          for (let i = 0; i < dataArray.length; i++) {
            barHeight = dataArray[i] / 2;

            // Create a gradient effect
            const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, canvas.height - barHeight);
            gradient.addColorStop(0, `rgba(50, 150, 255, 0.7)`);
            gradient.addColorStop(1, `rgba(50, 50, 255, 0.3)`);

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;
          }
        } 
        /* function draw() {
          if (!isListening.value || !canvasCtx || !speechRecognitionAnalyser) {
            if (!canvasCtx) return;
            // Clear the canvas when not listening
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            return;
          }
        
          requestAnimationFrame(draw);
        
          speechRecognitionAnalyser.getByteFrequencyData(dataArray);
        
          // Clear canvas
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        
          // Set up the center line
          const centerY = canvas.height / 2;
          
          // Create a smooth, wavy visualization
          canvasCtx.beginPath();
          
          const barWidth = canvas.width / dataArray.length;
          
          for (let i = 0; i < dataArray.length; i++) {
            // Normalize the amplitude 
            const amplitude = (dataArray[i] / 128.0) * (canvas.height / 4);
            
            // Create a smooth curve that oscillates around the center line
            const x = i * barWidth;
            const y = centerY + amplitude * Math.sin(i * 0.2);
        
            // Draw the line
            if (i === 0) {
              canvasCtx.moveTo(x, y);
            } else {
              canvasCtx.lineTo(x, y);
            }
          }
        
          // Create a gradient for depth
          const gradient = canvasCtx.createLinearGradient(0, centerY - canvas.height/4, 0, centerY + canvas.height/4);
          gradient.addColorStop(0, `rgba(50, 150, 255, 0.3)`);
          gradient.addColorStop(0.5, `rgba(50, 150, 255, 0.7)`);
          gradient.addColorStop(1, `rgba(50, 50, 255, 0.3)`);
        
          // Style the path
          canvasCtx.strokeStyle = gradient;
          canvasCtx.lineWidth = 2;
          canvasCtx.lineCap = 'round';
          canvasCtx.lineJoin = 'round';
          
          // Actually draw the stroke
          canvasCtx.stroke();
        } */
        /* function draw() {
          if (!isListening.value || !canvasCtx || !speechRecognitionAnalyser) {
            if (!canvasCtx) return;
            // Clear the canvas when not listening
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            return;
          }
        
          requestAnimationFrame(draw);
        
          speechRecognitionAnalyser.getByteFrequencyData(dataArray);
        
          // Clear canvas
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        
          // Set up the center line
          const centerY = canvas.height / 2;
          
          const barCount = dataArray.length;
          const barWidth = canvas.width / barCount;
        
          for (let i = 0; i < barCount; i++) {
            // Normalize the amplitude 
            const barHeight = (dataArray[i] / 128.0) * (canvas.height / 2);
            
            // Calculate x position
            const x = i * barWidth;
        
            // Create a gradient for each bar
            const gradient = canvasCtx.createLinearGradient(x, centerY, x, centerY - barHeight);
            gradient.addColorStop(0, `rgba(50, 150, 255, 0.3)`);
            gradient.addColorStop(0.5, `rgba(50, 150, 255, 0.7)`);
            gradient.addColorStop(1, `rgba(50, 50, 255, 0.3)`);
        
            // Set bar style
            canvasCtx.fillStyle = gradient;
        
            // Draw bar extending from center line upwards
            canvasCtx.fillRect(
              x, 
              centerY, 
              barWidth - 1, 
              -barHeight  // Negative to draw upwards from center
            );
        
            // Optional: Mirror the bar below the center line
            canvasCtx.fillRect(
              x, 
              centerY, 
              barWidth - 1, 
              barHeight  // Positive to draw downwards from center
            );
          }
        } */
        /* function draw() {
          if (!isListening.value || !canvasCtx || !speechRecognitionAnalyser) {
            if (!canvasCtx) return;
            // Clear the canvas when not listening
            canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
            return;
          }
        
          requestAnimationFrame(draw);
        
          speechRecognitionAnalyser.getByteFrequencyData(dataArray);
        
          // Clear canvas
          canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        
          // Set up the center line
          const centerY = canvas.height / 2;
          
          const barCount = 7;
          const barWidth = canvas.width / (barCount * 3); // Reduce bar width to accommodate spacing
          const spacing = barWidth * 2; // Space between bars is twice the bar width
        
          // Find the maximum frequency value to use for the center bar
          const centerIndex = Math.floor(dataArray.length / 2);
          const centerBarHeight = (dataArray[centerIndex] / 128.0) * (canvas.height / 2);
        
          for (let i = 0; i < barCount; i++) {
            // Calculate bar height with a bias towards the center
            const middleBar = Math.floor(barCount / 2);
            let barHeight;
        
            if (i === middleBar) {
              // Use the center of the frequency data for the middle bar
              barHeight = centerBarHeight;
            } else {
              // For other bars, sample frequencies symmetrically around the center
              const offset = i - middleBar;
              const dataIndex = centerIndex + offset * Math.floor(dataArray.length / (barCount * 2));
              barHeight = (dataArray[dataIndex] / 128.0) * (canvas.height / 2);
            }
            
            // Calculate x position with spacing
            const x = i * (barWidth + spacing);
        
            // Create a gradient for each bar
            const gradient = canvasCtx.createLinearGradient(x, centerY, x, centerY - barHeight);
            gradient.addColorStop(0, `rgba(50, 150, 255, 0.3)`);
            gradient.addColorStop(0.5, `rgba(50, 150, 255, 0.7)`);
            gradient.addColorStop(1, `rgba(50, 50, 255, 0.3)`);
        
            // Set bar style
            canvasCtx.fillStyle = gradient;
        
            // Draw bar extending from center line upwards
            canvasCtx.fillRect(
              x, 
              centerY, 
              barWidth, 
              -barHeight  // Negative to draw upwards from center
            );
        
            // Mirror the bar below the center line
            canvasCtx.fillRect(
              x, 
              centerY, 
              barWidth, 
              barHeight  // Positive to draw downwards from center
            );
          }
        } */
        console.log('Visualizing voice');
        // Start drawing
        draw();
      })
      .catch(err => {
        console.error('Error accessing microphone', err);
        alert('Could not access microphone. Please check permissions.');
      });
  });
};

const stopVoiceVisualization = () => {
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  speechRecognitionAnalyser = null;
};

// Lifecycle hooks
onMounted(() => {
  //isAudioElementLoaded.value = true;
  //setupAudioPlayback();
  //init3DRotatingCircle();
  initializeNlpManager();
});

onUnmounted(() => {
  // Cleanup Three.js resources
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value);
  }

  if (scene) {
    scene.traverse((object: Object3D) => {
      if (object instanceof Mesh) {
        object.geometry.dispose();
        
        // Check if material is an array or a single material
        if (Array.isArray(object.material)) {
          object.material.forEach(mat => mat.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
  }

  // Dispose of renderer
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  // Clear other references
  scene = null;
  camera = null;
  waveformMesh = null;
  analyser.value = null;
  rotatingCircleMesh = null;
});

// Add this near your other watch functions
watch(shouldDisplayText, (newValue) => {
  console.log(`shouldDisplayText changed at ${new Date().toISOString()}: ${newValue}`);
});

// Watch shouldResumeAudio and resume audio when it becomes true
watch(shouldResumeAudio, (newValue) => {
  if (newValue && audioElement.value) {
    // Resume audio playback
    console.log('Resuming audio playback');
    audioElement.value.play()
        .then(() => {
          isAudioPlaying.value = true;
          console.log('Audio started playing');
        })
        .catch((error) => {
          console.error('Error playing audio:', error);
          alert('Please interact with the page to enable audio playback.');
          isAudioPlaying.value = false;
        });
    
    // Reset the flag
    shouldResumeAudio.value = false;
  }
});

// Add watch function for isAudioElementLoaded
watch(isAudioElementLoaded, (newValue) => {
  console.log(`Audio element loaded status changed at ${new Date().toISOString()}: ${newValue}`);
});
</script>

<style scoped>
/* Mobile-first responsive adjustments */
@media (max-width: 768px) {
  .responsive-container {
    width: 100%;
    margin: 0;
    border-radius: 0;
  }

  .responsive-waveform {
    height: 300px;
  }

  .responsive-chat {
    height: auto;
  }
}

/* Ensure canvas and other elements are responsive */
canvas {
  max-width: 100%;
  height: auto;
}

/* Adjust text sizes for better mobile readability */
.text-sm {
  font-size: 0.75rem;
}

.text-base {
  font-size: 1rem;
}

.cursor-pointer {
  cursor: pointer;
}

.loader {
  border-top-color: #3B82F6; /* Tailwind blue-500 */
  animation: spinner 1s linear infinite;
}

@keyframes spinner {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
</style>