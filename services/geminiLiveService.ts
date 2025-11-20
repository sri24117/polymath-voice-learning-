import { GoogleGenAI, LiveServerMessage, Modality } from "@google/genai";
import { AUDIO_CONFIG } from "../types";
import { decodeBase64, encodeBase64, float32ToInt16, decodeAudioData } from "../utils/audioUtils";

export class GeminiLiveService {
  private client: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private inputAudioContext: AudioContext | null = null; 
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  
  // Output Audio
  private nextStartTime = 0;
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();
  private outputGain: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;

  // Transcription Accumulators
  private currentInputTranscription = "";
  private currentOutputTranscription = "";
  
  private isConnected = false;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  public getOutputAnalyser(): AnalyserNode | null {
    return this.outputAnalyser;
  }

  public async connect(
    systemInstruction: string,
    onOpen: () => void,
    onClose: () => void,
    onError: (error: any) => void,
    onTranscript: (text: string, role: 'user' | 'model') => void
  ) {
    try {
      // Ensure we are clean before starting
      await this.disconnect();

      // Reset transcript accumulators
      this.currentInputTranscription = "";
      this.currentOutputTranscription = "";

      // 1. Initialize Audio Contexts
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: AUDIO_CONFIG.OUTPUT_SAMPLE_RATE,
      });

      this.inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: AUDIO_CONFIG.INPUT_SAMPLE_RATE,
      });

      this.outputGain = this.audioContext.createGain();
      this.outputAnalyser = this.audioContext.createAnalyser();
      this.outputAnalyser.fftSize = 256;
      
      this.outputGain.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.audioContext.destination);

      // 2. Get Microphone Stream
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // 3. Connect to Gemini Live
      const config = {
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } },
          },
          systemInstruction: systemInstruction,
          // Request transcription for both input and output. 
          // Passing empty objects enables it using the connected model.
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
      };

      this.sessionPromise = this.client.live.connect({
        model: config.model,
        config: config.config,
        callbacks: {
          onopen: () => {
            this.isConnected = true;
            onOpen();
            this.startAudioInput();
          },
          onmessage: (msg: LiveServerMessage) => this.handleMessage(msg, onTranscript),
          onclose: async (e) => {
            console.log("Session closed", e);
            this.isConnected = false;
            onClose();
            await this.cleanup();
          },
          onerror: async (e) => {
            console.error("Session error", e);
            this.isConnected = false;
            onError(e);
            await this.cleanup();
          },
        }
      });

      // Handle initial connection failures
      this.sessionPromise.catch(async (err) => {
        if (this.inputAudioContext) {
            console.error("Connection failed", err);
            onError(err);
            await this.cleanup();
        }
      });

    } catch (err) {
      console.error("Setup error", err);
      onError(err);
      await this.cleanup();
    }
  }

  private startAudioInput() {
    if (!this.inputAudioContext || !this.stream || !this.sessionPromise) return;

    const inputContext = this.inputAudioContext;
    
    if (inputContext.state === 'suspended') {
        inputContext.resume().catch(e => console.warn("Input context resume failed", e));
    }

    this.inputSource = inputContext.createMediaStreamSource(this.stream);
    this.processor = inputContext.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (!this.isConnected || !this.sessionPromise) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      const pcmInt16 = float32ToInt16(inputData);
      const pcmUint8 = new Uint8Array(pcmInt16.buffer);
      const base64Data = encodeBase64(pcmUint8);

      this.sessionPromise.then((session) => {
        if (this.isConnected) {
            session.sendRealtimeInput({
                media: {
                    mimeType: 'audio/pcm;rate=16000',
                    data: base64Data
                }
            });
        }
      }).catch(e => {
        // Silent catch
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(inputContext.destination);
  }

  private async handleMessage(message: LiveServerMessage, onTranscript: (text: string, role: 'user' | 'model') => void) {
    const serverContent = message.serverContent;

    if (serverContent?.interrupted) {
      this.stopAllScheduledAudio();
      this.currentOutputTranscription = ""; // Clear interrupted speech text
      return;
    }

    const modelTurn = serverContent?.modelTurn;
    if (modelTurn?.parts) {
      for (const part of modelTurn.parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/pcm')) {
          const base64Audio = part.inlineData.data;
          await this.queueAudioOutput(base64Audio);
        }
      }
    }

    // Handle Transcription
    if (serverContent?.inputTranscription?.text) {
        this.currentInputTranscription += serverContent.inputTranscription.text;
    }
    
    if (serverContent?.outputTranscription?.text) {
        this.currentOutputTranscription += serverContent.outputTranscription.text;
    }

    // Dispatch complete turns to the UI
    if (serverContent?.turnComplete) {
        if (this.currentInputTranscription.trim()) {
            onTranscript(this.currentInputTranscription, 'user');
            this.currentInputTranscription = "";
        }
        if (this.currentOutputTranscription.trim()) {
            onTranscript(this.currentOutputTranscription, 'model');
            this.currentOutputTranscription = "";
        }
    }
  }

  private async queueAudioOutput(base64Audio: string) {
    if (!this.audioContext || !this.outputGain) return;

    try {
      const audioBytes = decodeBase64(base64Audio);
      const audioBuffer = await decodeAudioData(audioBytes, this.audioContext, AUDIO_CONFIG.OUTPUT_SAMPLE_RATE);
      
      const now = this.audioContext.currentTime;
      if (this.nextStartTime < now) {
        this.nextStartTime = now;
      }

      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.outputGain);
      
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
      
      this.scheduledSources.add(source);
      
      source.onended = () => {
        this.scheduledSources.delete(source);
      };

    } catch (error) {
      console.error("Error decoding audio", error);
    }
  }

  private stopAllScheduledAudio() {
    this.scheduledSources.forEach(source => {
      try {
        source.stop();
      } catch (e) { /* ignore */ }
    });
    this.scheduledSources.clear();
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  public async disconnect() {
    this.isConnected = false;
    
    if (this.sessionPromise) {
      try {
        const session = await this.sessionPromise;
        // @ts-ignore
        if (typeof session.close === 'function') {
             // @ts-ignore
            session.close();
        }
      } catch (e) {
        console.log("Error closing session", e);
      }
    }

    await this.cleanup();
  }

  private async cleanup() {
    this.isConnected = false;

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.processor) {
      this.processor.disconnect();
      this.processor.onaudioprocess = null;
      this.processor = null;
    }
    
    if (this.inputSource) {
      this.inputSource.disconnect();
      this.inputSource = null;
    }

    if (this.inputAudioContext) {
      try {
        if (this.inputAudioContext.state !== 'closed') {
          await this.inputAudioContext.close();
        }
      } catch (e) {}
      this.inputAudioContext = null;
    }

    if (this.audioContext) {
       try {
        if (this.audioContext.state !== 'closed') {
          await this.audioContext.close();
        }
      } catch (e) {}
      this.audioContext = null;
    }

    this.scheduledSources.clear();
    this.nextStartTime = 0;
    this.outputAnalyser = null;
    this.outputGain = null;
    this.sessionPromise = null;
  }
}