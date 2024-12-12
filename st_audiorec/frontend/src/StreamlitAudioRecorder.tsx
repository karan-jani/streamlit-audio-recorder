import {
  Streamlit,
  StreamlitComponentBase,
  withStreamlitConnection,
} from "streamlit-component-lib"
import React, { ReactNode } from "react"

interface State {
  isRecording: boolean
  mediaRecorder: MediaRecorder | null
  audioBlob: Blob | null
  chunks: Blob[]
  audioUrl: string | null
  audioData: Float32Array | null
  analyser: AnalyserNode | null
  animationId: number | null
  previewChunks: Blob[]
}

class StreamlitAudioRecorder extends StreamlitComponentBase {
  private canvasRef: React.RefObject<HTMLCanvasElement | null>
  private sessionId: string;
  private recordingId: string;

  constructor(props: any) {
    super(props)
    this.state = {
      isRecording: false,
      mediaRecorder: null,
      audioBlob: null,
      chunks: [],
      audioUrl: null,
      audioData: null,
      analyser: null,
      animationId: null,
      previewChunks: []
    }
    this.canvasRef = React.createRef<HTMLCanvasElement | null>()
    this.sessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    this.recordingId = this.generateRecordingId();
  }

  generateRecordingId = (): string => {
    return 'rec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  componentDidMount() {
    // Initialize canvas with a modern look
    if (this.canvasRef.current) {
      const canvas = this.canvasRef.current
      const canvasCtx = canvas.getContext('2d')
      if (canvasCtx) {
        canvasCtx.fillStyle = '#f0f0f0'
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height)
        
        // Create gradient for the line
        const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, 0)
        gradient.addColorStop(0, '#ff4b4b')
        gradient.addColorStop(1, '#ff8b8b')
        
        canvasCtx.strokeStyle = gradient
        canvasCtx.lineWidth = 3
        canvasCtx.beginPath()
        canvasCtx.moveTo(0, canvas.height / 2)
        canvasCtx.lineTo(canvas.width, canvas.height / 2)
        canvasCtx.stroke()
      }
    }
  }

  componentWillUnmount() {
    if (this.state.animationId) {
      cancelAnimationFrame(this.state.animationId)
    }
  }

  drawWaveform = () => {
    if (this.state.analyser && this.canvasRef.current) {
      const canvas = this.canvasRef.current
      const canvasCtx = canvas.getContext('2d')
      const bufferLength = this.state.analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)

      const draw = () => {
        if (!this.state.isRecording) {
          if (this.state.animationId) {
            cancelAnimationFrame(this.state.animationId)
          }
          return
        }

        const animationId = requestAnimationFrame(draw)
        this.setState({ animationId })

        this.state.analyser!.getByteTimeDomainData(dataArray)

        if (canvasCtx) {
          // Modern background
          canvasCtx.fillStyle = '#f0f0f0'
          canvasCtx.fillRect(0, 0, canvas.width, canvas.height)

          // Create gradient for the waveform
          const gradient = canvasCtx.createLinearGradient(0, 0, canvas.width, 0)
          gradient.addColorStop(0, '#ff4b4b')
          gradient.addColorStop(1, '#ff8b8b')
          
          canvasCtx.lineWidth = 3
          canvasCtx.strokeStyle = gradient
          canvasCtx.beginPath()

          const sliceWidth = (canvas.width * 1.0) / bufferLength
          let x = 0
          let lastY = canvas.height / 2

          for (let i = 0; i < bufferLength; i++) {
            const v = dataArray[i] / 128.0
            const y = (v * canvas.height) / 2

            // Smooth the line using bezier curves
            if (i === 0) {
              canvasCtx.moveTo(x, y)
            } else {
              const xc = (x + (x - sliceWidth)) / 2
              canvasCtx.quadraticCurveTo(x - sliceWidth, lastY, xc, y)
            }

            lastY = y
            x += sliceWidth
          }

          canvasCtx.lineTo(canvas.width, canvas.height / 2)
          canvasCtx.stroke()
        }
      }

      draw()
    }
  }

  startRecording = async () => {
    try {
      this.recordingId = this.generateRecordingId();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 44100,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      })

      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      source.connect(analyser)
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000
      })

      // Send chunks every 5 seconds to stay well under Streamlit's size limits
      const CHUNK_INTERVAL = 5000; // 5 seconds
      let currentChunks: Blob[] = [];
      let chunkCounter = 0;

      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          currentChunks.push(e.data);
          this.setState((prev: State) => ({
            previewChunks: [...prev.previewChunks, e.data]
          }));
        }
      };

      // Periodically send chunks
      const sendChunksInterval = setInterval(async () => {
        if (currentChunks.length > 0 && this.state.isRecording) {
          const blob = new Blob(currentChunks, { type: 'audio/webm;codecs=opus' });
          currentChunks = []; // Clear current chunks after creating blob
          
          const buffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(buffer);
          Streamlit.setComponentValue({
            arr: Object.fromEntries(uint8Array.entries()),
            chunkId: chunkCounter++,
            sessionId: this.sessionId,
            recordingId: this.recordingId,
            isFinal: false
          });
        }
      }, CHUNK_INTERVAL);

      mediaRecorder.onstop = async () => {
        clearInterval(sendChunksInterval);
        
        // Send any remaining chunks
        if (currentChunks.length > 0) {
          const blob = new Blob(currentChunks, { type: 'audio/webm;codecs=opus' });
          const buffer = await blob.arrayBuffer();
          const uint8Array = new Uint8Array(buffer);
          Streamlit.setComponentValue({
            arr: Object.fromEntries(uint8Array.entries()),
            chunkId: chunkCounter,
            sessionId: this.sessionId,
            recordingId: this.recordingId,
            isFinal: true
          });
        }

        // Create preview blob from all chunks
        const previewBlob = new Blob(this.state.previewChunks, { type: 'audio/webm;codecs=opus' });
        
        this.setState({ 
          chunks: [], 
          previewChunks: [],
          isRecording: false,
          mediaRecorder: null,
          audioBlob: previewBlob,
          audioUrl: URL.createObjectURL(previewBlob)
        });
      };

      // Start recording in smaller intervals for smooth waveform
      mediaRecorder.start(100);
      this.setState({ 
        mediaRecorder, 
        isRecording: true, 
        analyser,
        previewChunks: [],  // Clear preview chunks when starting new recording
        audioUrl: null,     // Clear previous audio URL
        audioBlob: null     // Clear previous blob
      }, this.drawWaveform);

    } catch (err) {
      console.error("Error accessing microphone:", err)
    }
  }

  stopRecording = () => {
    if (this.state.mediaRecorder && this.state.isRecording) {
      this.state.mediaRecorder.stop()
      this.state.mediaRecorder.stream.getTracks().forEach((track: MediaStreamTrack) => track.stop())
      if (this.state.animationId) {
        cancelAnimationFrame(this.state.animationId)
      }
    }
  }

  resetRecording = (): void => {
    if (this.state.animationId) {
      cancelAnimationFrame(this.state.animationId)
    }

    if (this.state.audioUrl) {
      URL.revokeObjectURL(this.state.audioUrl);
    }

    this.recordingId = this.generateRecordingId();

    this.setState({
      isRecording: false,
      audioBlob: null,
      chunks: [],
      previewChunks: [],
      audioUrl: null,
      audioData: null,
      analyser: null,
      animationId: null
    })
    
    Streamlit.setComponentValue({
      type: 'reset',
      sessionId: this.sessionId,
      recordingId: this.recordingId
    })
  }

  downloadRecording = (): void => {
    if (this.state.audioBlob) {
      const datetime = new Date().toLocaleString()
        .replace(/[\s,]/g, '')
        .replace(/_/g, '')
      const filename = `streamlit_audio_${datetime}.webm`

      const a = document.createElement('a')
      a.style.display = 'none'
      a.href = URL.createObjectURL(this.state.audioBlob)
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  public render = (): ReactNode => {
    const theme = this.props.theme
    const style: React.CSSProperties = {}

    if (theme) {
      const borderStyling = `1px solid ${
        this.state.isRecording ? '#ff4b4b' : "#e0e0e0"
      }`
      style.border = borderStyling
      style.outline = borderStyling
    }

    return (
      <div style={{ padding: '20px', background: 'white', borderRadius: '10px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)' }}>
        <canvas 
          ref={this.canvasRef} 
          width="500" 
          height="100" 
          style={{ 
            width: '100%', 
            marginBottom: '20px', 
            borderRadius: '5px',
            backgroundColor: this.state.isRecording ? '#fff4f4' : '#f0f0f0'
          }}
        />
        
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {!this.state.isRecording ? (
            <button
              onClick={this.startRecording}
              style={{
                padding: '10px 20px',
                borderRadius: '5px',
                border: 'none',
                backgroundColor: '#ff4b4b',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Start Recording
            </button>
          ) : (
            <button
              onClick={this.stopRecording}
              style={{
                padding: '10px 20px',
                borderRadius: '5px',
                border: 'none',
                backgroundColor: '#4b4bff',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Stop Recording
            </button>
          )}
          
          {this.state.audioUrl && (
            <>
              <button
                onClick={this.resetRecording}
                style={{
                  padding: '10px 20px',
                  borderRadius: '5px',
                  border: 'none',
                  backgroundColor: '#ff8c4b',
                  color: 'white',
                  cursor: 'pointer'
                }}
              >
                Reset Recording
              </button>
              <audio 
                src={this.state.audioUrl} 
                controls 
                style={{ marginTop: '10px', width: '100%' }}
              />
            </>
          )}
        </div>
      </div>
    )
  }
}

export default withStreamlitConnection(StreamlitAudioRecorder)

Streamlit.setComponentReady()
Streamlit.setFrameHeight()
