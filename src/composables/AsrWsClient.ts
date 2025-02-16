import * as pako from 'pako';
import { config } from '../config/config';

const api_url = `${config.api.asrBaseUrl}/asr`;
// Protocol Constants
const PROTOCOL_VERSION = 0b0001;
const DEFAULT_HEADER_SIZE = 0b0001;

const PROTOCOL_VERSION_BITS = 4
const HEADER_BITS = 4
const MESSAGE_TYPE_BITS = 4
const MESSAGE_TYPE_SPECIFIC_FLAGS_BITS = 4
const MESSAGE_SERIALIZATION_BITS = 4
const MESSAGE_COMPRESSION_BITS = 4
const RESERVED_BITS = 8

// Message Types
const CLIENT_FULL_REQUEST = 0b0001;
const CLIENT_AUDIO_ONLY_REQUEST = 0b0010;
const SERVER_FULL_RESPONSE = 0b1001;
const SERVER_ACK = 0b1011;
const SERVER_ERROR_RESPONSE = 0b1111;

// Message Type Specific Flags
const NO_SEQUENCE = 0b0000;
const POS_SEQUENCE = 0b0001;
const NEG_SEQUENCE = 0b0010;
const NEG_SEQUENCE_1 = 0b0011;

// Message Serialization
const NO_SERIALIZATION = 0b0000;
const JSON_SERIALIZATION = 0b0001;
const THRIFT = 0b0011;
const CUSTOM_TYPE = 0b1111;

// Message Compression
const NO_COMPRESSION = 0b0000;
const GZIP = 0b0001;
const CUSTOM_COMPRESSION = 0b1111;

enum AudioType {
    LOCAL = 1
}

interface AsrWsClientConfig {
    audio_path?: string;
    cluster: string;
    seg_duration?: number;
    nbest?: number;
    appid?: string;
    token?: string;
    ws_url?: string;
    uid?: string;
    workflow?: string;
    show_language?: boolean;
    show_utterances?: boolean;
    result_type?: string;
    format?: string;
    sample_rate?: number;
    language?: string;
    bits?: number;
    channel?: number;
    codec?: string;
    audio_type?: AudioType;
    secret?: string;
    auth_method?: string;
    mp3_seg_size?: number;
}

export class AsrWsClient {
    private config: AsrWsClientConfig;
    private success_code: number = 1000;
    private ws: WebSocket;

    constructor(config: AsrWsClientConfig) {
        this.config = {
            seg_duration: 15000,
            nbest: 1,
            ws_url: api_url,//'ws://localhost:5101/ws',//'wss://openspeech.bytedance.com/api/v2/asr',
            uid: 'streaming_asr_demo',
            workflow: 'audio_in,resample,partition,vad,fe,decode,itn,nlu_punctuate',
            show_language: false,
            show_utterances: false,
            result_type: 'full',
            format: 'wav',
            sample_rate: 16000,
            language: 'zh-CN',
            bits: 16,
            channel: 1,
            codec: 'raw',
            audio_type: AudioType.LOCAL,
            secret: 'access_secret',
            auth_method: 'token',
            mp3_seg_size: 10000,
            ...config
        };
        this.ws = null as any;
    }

    // private static readonly PROTOCOL_VERSION = 0b0001;
    // private static readonly CLIENT_FULL_REQUEST = 0b0001;
    // private static readonly CLIENT_AUDIO_ONLY_REQUEST = 0b0010;
    // private static readonly NO_SEQUENCE = 0b0000;
    // private static readonly JSON_SERIALIZATION = 0b0001;
    // private static readonly GZIP_COMPRESSION = 0b0001;

    private generateHeader(
        version = PROTOCOL_VERSION,
        messageType = CLIENT_FULL_REQUEST,
        messageTypeFlags = NO_SEQUENCE,
        serialMethod = JSON_SERIALIZATION,
        compressionType = GZIP,
        extensionHeader = new Uint8Array(0)
    ): Uint8Array {
        const headerSize = Math.floor(extensionHeader.length / 4) + 1;
        const header = new Uint8Array(4 + extensionHeader.length);
    
        
        // First byte: version and header size
        header[0] = (version << 4) | headerSize;  // Assuming default header size of 1
        
        // Second byte: message type and flags
        header[1] = (messageType << 4) | messageTypeFlags;
        
        // Third byte: serialization and compression
        header[2] = (serialMethod << 4) | compressionType;
        
        // Fourth byte: reserved
        header[3] = 0x00;

        // Copy extension header if present
        if (extensionHeader.length > 0) {
            header.set(extensionHeader, 4);
        }

        return header;
    }

    private generateFullDefaultHeader(): Uint8Array {
        return this.generateHeader();
    }

    private generateAudioDefaultHeader(): Uint8Array {
        return this.generateHeader(PROTOCOL_VERSION, CLIENT_AUDIO_ONLY_REQUEST);
    }

    private generateLastAudioDefaultHeader(): Uint8Array {
        return this.generateHeader(PROTOCOL_VERSION, CLIENT_AUDIO_ONLY_REQUEST, NEG_SEQUENCE);
    }

    private parseResponse(response: ArrayBuffer): any {
        const data = new Uint8Array(response);
        
        // Extract header information
        const protocolVersion = data[0] >> 4;
        const headerSize = data[0] & 0x0F;
        const messageType = data[1] >> 4;
        const messageTypeFlags = data[1] & 0x0F;
        const serializationMethod = data[2] >> 4;
        const compressionType = data[2] & 0x0F;

        // Initialize result object
        const result: any = {};
        let payloadMsg: Uint8Array | null = null;
        let payloadSize = 0;

        // Extract payload
        const payloadStart = headerSize * 4;
        let payload = data.slice(payloadStart);

        // Parse payload based on message type
        switch (messageType) {
            case SERVER_FULL_RESPONSE:
                // First 4 bytes represent payload size (big-endian, signed)
                payloadSize = new DataView(payload.buffer, 0, 4).getInt32(0, false);
                payloadMsg = payload.slice(4);
                break;

            case SERVER_ACK:
                // First 4 bytes represent sequence number
                const seq = new DataView(payload.buffer, 0, 4).getInt32(0, false);
                result['seq'] = seq;

                // If payload is long enough, get payload size
                if (payload.length >= 8) {
                    payloadSize = new DataView(payload.buffer, 4, 4).getUint32(0, false);
                    payloadMsg = payload.slice(8);
                }
                break;

            case SERVER_ERROR_RESPONSE:
                // First 4 bytes represent error code
                const code = new DataView(payload.buffer, 0, 4).getUint32(0, false);
                result['code'] = code;

                // Next 4 bytes represent payload size
                payloadSize = new DataView(payload.buffer, 4, 4).getUint32(0, false);
                payloadMsg = payload.slice(8);
                break;

            default:
                // Unrecognized message type
                console.warn('Unrecognized message type:', messageType);
                return result;
        }

        // If no payload, return result
        if (!payloadMsg) {
            return result;
        }

        // Decompress payload if needed
        if (compressionType === GZIP) {
            try {
                payloadMsg = pako.inflate(payloadMsg);
            } catch (error) {
                console.error('Decompression error:', error);
                return result;
            }
        }

        // Deserialize payload
        try {
            if (serializationMethod === JSON_SERIALIZATION) {
                const decoder = new TextDecoder('utf-8');
                result['payload_msg'] = JSON.parse(decoder.decode(payloadMsg));
            } else if (serializationMethod !== NO_SERIALIZATION) {
                const decoder = new TextDecoder('utf-8');
                result['payload_msg'] = decoder.decode(payloadMsg);
            } else {
                result['payload_msg'] = payloadMsg;
            }
        } catch (error) {
            console.error('Payload parsing error:', error);
        }

        // Store payload size
        result['payload_size'] = payloadSize;

        return result;
    }

    private async compressData(data: Uint8Array): Promise<Uint8Array> {
        try {
            return pako.gzip(data);
        } catch (error) {
            console.error('Compression error:', error);
            return data;
        }
    }

    private compressGzip(data: Uint8Array): Uint8Array {
        return pako.gzip(data);
    }

    private constructRequest(reqid: string): any {
        return {
            app: {
                appid: this.config.appid,
                cluster: this.config.cluster,
                token: this.config.token
            },
            user: {
                uid: this.config.uid,
                workflow: this.config.workflow,
                show_language: this.config.show_language,
                show_utterances: this.config.show_utterances,
                result_type: this.config.result_type
            },
            request: {
                reqid: reqid,
                nbest: this.config.nbest,
                workflow: this.config.workflow,
                show_language: this.config.show_language,
                show_utterances: this.config.show_utterances,
                result_type: this.config.result_type,
                seqence: 1
            },
            audio: {
                format: this.config.format,
                rate: this.config.sample_rate,
                language: this.config.language,
                bits: this.config.bits,
                channel: this.config.channel,
                codec: this.config.codec
            }
        };
    }

    // Slice audio data into segments
    private *sliceData(data: Uint8Array, chunkSize: number): Generator<[Uint8Array, boolean]> {
        let offset = 0;
        const dataLen = data.length;

        while (offset < dataLen) {
            const remainingData = dataLen - offset;
            const currentChunkSize = Math.min(chunkSize, remainingData);
            const chunk = data.slice(offset, offset + currentChunkSize);
            const isLastChunk = offset + currentChunkSize >= dataLen;

            yield [chunk, isLastChunk];
            offset += currentChunkSize;
        }
    }
    // Delay method
    private async delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private tokenAuth(): { [key: string]: string } {
        return { 'Authorization': `Bearer; ${this.config.token}` };
    }

    private async checkNetworkConnectivity(url: string): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                mode: 'no-cors'
            });

            clearTimeout(timeoutId);
            return true;
        } catch (error) {
            console.error('Network Connectivity Check Failed:', error);
            return false;
        }
    }

    private async segmentDataProcessor(audioData: Uint8Array, segmentSize: number): Promise<any> {
        return new Promise(async (resolve, reject) => {
            const reqid = crypto.randomUUID();
            const requestParams = this.constructRequest(reqid);
            
            const wsUrl = this.config.ws_url || 'wss://openspeech.bytedance.com/api/v2/asr';


            // Prepare full client request
            const requestParamsJson = JSON.stringify(requestParams);
            const requestParamsBytes = new TextEncoder().encode(requestParamsJson);
            const compressedRequestParams = this.compressGzip(requestParamsBytes);

            // Construct full client request
            const fullClientRequestHeader = this.generateFullDefaultHeader();
            const payloadSizeBytes = new Uint8Array(4);
            new DataView(payloadSizeBytes.buffer).setUint32(0, compressedRequestParams.length, false);
            
            const fullClientRequest = new Uint8Array([
                ...fullClientRequestHeader, 
                ...payloadSizeBytes, 
                ...compressedRequestParams
            ]);

            const authHeaders = this.tokenAuth();
            console.log('Authentication Headers:', Object.keys(authHeaders));
            console.log('authHeaders:', authHeaders);

            // Create WebSocket with optional authentication

            //let ws: WebSocket;
            try {
                //ws = new WebSocket(wsUrl, authHeaders ? Object.keys(authHeaders) : undefined);
                this.ws = new WebSocket(wsUrl);
            } catch (instantiationError) {
                console.error('WebSocket Instantiation Error:', instantiationError);
                reject(instantiationError);
                return;
            }
            
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = async (event) => {
                console.log('WebSocket Connection Established:', {
                    url: this.config.ws_url,
                    requestId: reqid,
                    event: {
                        type: event.type,
                        timestamp: new Date().toISOString()
                    }
                });
                
                
                try {
                    // Send full client request
                    console.log('Sending full client request: ', fullClientRequest);
                    this.ws.send(fullClientRequest);
                    await this.delay(1000);  // 5-second delay

                    // Slice and send audio data
                    const audioSegments = this.sliceData(audioData, segmentSize);
                    let seq = 1;

                    for (const [chunk, isLastChunk] of audioSegments) {
                        const compressedChunk = this.compressGzip(chunk);
                        
                        // Generate appropriate header
                        const audioHeader = isLastChunk ? 
                                        this.generateLastAudioDefaultHeader() : 
                                        this.generateAudioDefaultHeader();
                        

                        
                        // Prepare payload size
                        const payloadSizeBytes = new Uint8Array(4);
                        new DataView(payloadSizeBytes.buffer).setUint32(0, compressedChunk.length, false);

                        // Construct audio request
                        const audioRequest = new Uint8Array([
                            ...audioHeader, 
                            ...payloadSizeBytes, 
                            ...compressedChunk
                        ]);

                        // Send audio segment
                        console.log('Sending audio segment: ', audioRequest);
                        this.ws.send(audioRequest);
                        //break;//send only one segment for debugging
                        //await this.delay(100);
                        seq++;
                    }
                } catch (error) {
                    console.error('WebSocket send error:', error);
                    reject(error);
                    this.ws.close();
                }
            };

            this.ws.onmessage = (event) => {
                try {
                    // Parse binary response using custom protocol
                    const result = this.parseResponse(event.data);
                    console.log('Response:', result);    


                    if (result.payload_msg && 'result' in result.payload_msg) {
                        if (result.payload_msg.sequence < 0) {
                            resolve({ transcription: result.payload_msg.result[0].text });
                        }
                        
                        //ws.close();
                    }
                } catch (error) {
                    console.error('Response parsing error:', error);
                    reject(error);
                    this.ws.close();
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket Connection Error:', {
                    url: this.config.ws_url,
                    requestId: reqid,
                    error: {
                        message: error || 'Unknown error',
                        timestamp: new Date().toISOString()
                    }
                });
                reject(error);
                this.ws.close();
            };

            this.ws.onclose = (event) => {
                console.log('WebSocket Connection Closed:', {
                    event: event
                })
                if (!event.wasClean) {
                    console.warn('WebSocket connection closed unexpectedly');
                    reject(new Error('WebSocket connection closed'));
                }
            };
        });
    }

    async execute(audioData: ArrayBuffer): Promise<any> {
        const audioUint8 = new Uint8Array(audioData);

        if (this.config.format === 'mp3') {
            const segmentSize = this.config.mp3_seg_size || 10000;
            return this.segmentDataProcessor(audioUint8, segmentSize);
        }

        if (this.config.format !== 'wav') {
            throw new Error('Format should be wav or mp3');
        }

        // For WAV, you'd typically want to parse WAV header here
        // This is a simplified implementation
        const sizePerSec = this.config.channel! * (this.config.bits! / 8) * this.config.sample_rate!;
        const segmentSize = Math.floor(sizePerSec * (this.config.seg_duration || 15000) / 1000);

        return this.segmentDataProcessor(audioUint8, segmentSize);
    }
}

