// src/composables/useAudioContext.ts
import { ref } from 'vue'

// Function to create AudioContext with error handling
function createAudioContext(): AudioContext {
  try {
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    console.log('AudioContext created with initial state:', context.state);
    return context;
  } catch (error) {
    console.error('Failed to create AudioContext:', error);
    throw error;
  }
}

// Create a single global AudioContext
let globalAudioContext = createAudioContext();

// Composable to provide access to the AudioContext
export function useAudioContext() {
  // Recreate if closed
  if (globalAudioContext.state === 'closed') {
    console.warn('AudioContext was closed, recreating...');
    globalAudioContext = createAudioContext();
  }

  return {
    audioContext: ref(globalAudioContext)
  }
}

// Optional: Singleton-like export for direct access
export const audioContext = globalAudioContext