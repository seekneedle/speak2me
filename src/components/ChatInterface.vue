<template>
  <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
    <div class="h-[600px] flex">
      <!-- Waveform Display -->
      <div class="w-1/2 bg-gradient-to-br from-blue-900 to-blue-700 flex items-center justify-center">
        <div 
          class="w-full h-full flex items-center justify-center cursor-pointer relative overflow-hidden"
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
              class="h-24 w-24 text-white opacity-70 drop-shadow-lg" 
              viewBox="0 0 24 24" 
              fill="currentColor"
            >
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>
      </div>

      <!-- Chat Interface -->
      <div class="w-1/2 flex flex-col">
        <!-- Chat Messages -->
        <div class="flex-1 overflow-y-auto p-4 space-y-4" ref="messagesContainer">
          <ChatMessage
            v-for="(message, index) in messages"
            :key="index"
            :message="message"
          />
          
          <!-- Loading Spinner -->
          <div v-if="isLoading" class="flex justify-center items-center py-4">
            <div class="loader ease-linear rounded-full border-4 border-t-4 border-gray-200 h-12 w-12"></div>
          </div>
        </div>

        <!-- Error Message Banner -->
        <div 
          v-if="error" 
          class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" 
          role="alert"
        >
          <span class="block sm:inline">{{ error }}</span>
          <span 
            @click="clearError" 
            class="absolute top-0 bottom-0 right-0 px-4 py-3 cursor-pointer"
          >
            ×
          </span>
        </div>

        <!-- Input Area -->
        <div class="border-t p-4 bg-gray-50">
          <div class="flex space-x-4 items-center">
            <input
              v-model="userInput"
              type="text"
              placeholder="Ask a question..."
              class="flex-1 rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              @keyup.enter="handleButtonClick"
            />
            <button
              @click="handleButtonClick"
              class="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              :disabled="isLoading || !userInput.trim()"
            >
              {{ buttonText }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed, onUnmounted, watch } from 'vue';
import ChatMessage from './ChatMessage.vue';
import { useRAGSystem } from '../composables/useRAGSystem';
import * as THREE from 'three';

// Audio and visualization refs
const waveformCanvas = ref<HTMLCanvasElement | null>(null);
const audioElement = ref<HTMLAudioElement | null>(null);
const isAudioPlaying = ref(false);
const messagesContainer = ref<HTMLDivElement | null>(null);

const { 
  messages, 
  isLoading, 
  error, 
  getResponse,
  IntentionHook,
  shouldResumeAudio,
  initializeNlpManager
} = useRAGSystem();

const userInput = ref('');

// Reactive references for Three.js objects
let camera: THREE.PerspectiveCamera | null = null  //相机
let scene: THREE.Scene | null = null  //场景
let renderer: THREE.WebGLRenderer | null = null  //渲染器
let waveformMesh: THREE.Line | null = null  //波形网格
let rotatingCircleMesh: THREE.Mesh | null = null  // New mesh for rotating circle
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
    setupAudioPlayback();
    // Start audio playback
    startAudioPlayback();
    return;
  }

  try {
    if (audioElement.value.paused) {
      console.log('Audio is paused, attempting to play');
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

const setupAudioPlayback = () => {
  console.log('Setting up basic audio playback');
  
  // Create audio element if not exists
  if (!audioElement.value) {
    audioElement.value = new Audio(audioFile);
    audioElement.value.preload = 'auto';
    audioElement.value.loop = true;

    audioElement.value.onerror = (e) => {
      console.error('Audio loading error:', e);
      alert('Failed to load audio file. Please check the file path.');
    };

    // Initialize 3D Waveform after audio is loaded
    audioElement.value.addEventListener('canplaythrough', () => {
      // Setup audio graph and only proceed if successful
      const newAnalyser = setupAudioGraph(audioElement.value);
      if (newAnalyser) {
        analyser.value = newAnalyser;
        
        // Initialize 3D Waveform
        // init3DWaveform();
        init3DRotatingCircle();
      } else {
        console.error('Failed to setup audio graph');
      }
    });
  }
};

// Initialize 3D Waveform Visualization
const init3DWaveform = () => {
  if (!waveformCanvas.value || !audioElement.value) return;

  // Scene setup
  scene = new THREE.Scene();
  
  // Camera
  camera = new THREE.PerspectiveCamera(
    75, 
    waveformCanvas.value.clientWidth / waveformCanvas.value.clientHeight, 
    0.1, 
    1000
  );
  camera.position.z = 5;

  // Renderer
  renderer = new THREE.WebGLRenderer({ 
    canvas: waveformCanvas.value,
    alpha: true,
    antialias: true 
  });
  renderer.setSize(
    waveformCanvas.value.clientWidth, 
    waveformCanvas.value.clientHeight
  );

  // Lighting
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.5);
  directionalLight.position.set(1, 1, 1);
  scene.add(directionalLight);

  // Create dynamic waveform geometry
  const geometry = new THREE.BufferGeometry();
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
    new THREE.Float32BufferAttribute(vertices, 3)
  );

  // Material with gradient and glow
  const material = new THREE.LineBasicMaterial({
    color: 0x3498db,
    transparent: true,
    opacity: 0.7,
    blending: THREE.AdditiveBlending
  });

  // Create the waveform line
  waveformMesh = new THREE.Line(geometry, material);
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
const init3DRotatingCircle = () => {
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
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(75, waveformCanvas.value.clientWidth / waveformCanvas.value.clientHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer({ 
    canvas: waveformCanvas.value,
    antialias: true,
    alpha: true 
  });
  renderer.setSize(waveformCanvas.value.clientWidth, waveformCanvas.value.clientHeight);
  renderer.setClearColor(0x000000, 0); // Transparent background

  // Create a pulsating circle geometry
  const circleGeometry = new THREE.CircleGeometry(5, 64);
  const circleMaterial = new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      amplitude: { value: 0 },
      color: { value: new THREE.Color(0x1E90FF) } // Tailwind blue-500
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

  rotatingCircleMesh = new THREE.Mesh(circleGeometry, circleMaterial);
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
    if (rotatingCircleMesh.material instanceof THREE.ShaderMaterial) {
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
        if (object instanceof THREE.Mesh) {
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
};

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

// Lifecycle hooks
onMounted(() => {
  //setupAudioPlayback();
  init3DRotatingCircle();
  initializeNlpManager();
});

onUnmounted(() => {
  // Cleanup Three.js resources
  if (animationFrameId.value) {
    cancelAnimationFrame(animationFrameId.value);
  }

  if (scene) {
    scene.traverse((object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh) {
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
</script>

<style scoped>
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