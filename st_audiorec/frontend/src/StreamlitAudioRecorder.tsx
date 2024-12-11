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
}

class StreamlitAudioRecorder extends StreamlitComponentBase {
  private canvasRef: React.RefObject<HTMLCanvasElement | null>

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
      animationId: null
    }
    this.canvasRef = React.createRef<HTMLCanvasElement | null>()
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

      mediaRecorder.ondataavailable = (e: BlobEvent) => {
        if (e.data.size > 0) {
          this.setState((prev: State) => ({
            chunks: [...prev.chunks, e.data]
          }))
        }
      }

      mediaRecorder.onstop = () => {
        const blob = new Blob(this.state.chunks, { type: 'audio/webm;codecs=opus' })
        
        // Update UI state
        this.setState({ 
          chunks: [], 
          audioBlob: blob,
          isRecording: false,
          mediaRecorder: null,
          audioUrl: URL.createObjectURL(blob)
        })
        
        // Convert to array and send
        blob.arrayBuffer().then(buffer => {
          const uint8Array = new Uint8Array(buffer)
          Streamlit.setComponentValue({
            arr: Object.fromEntries(uint8Array.entries())
          })
        })
      }

      mediaRecorder.start(100)
      this.setState({ mediaRecorder, isRecording: true, analyser }, this.drawWaveform)

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

    this.setState({
      isRecording: false,
      audioBlob: null,
      chunks: [],
      audioUrl: null,
      audioData: null,
      analyser: null,
      animationId: null
    })
    Streamlit.setComponentValue(null)
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
            border: 'none',
            borderRadius: '8px',
            background: '#f0f0f0',
            marginBottom: '20px'
          }}
        />
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            id="record" 
            onClick={this.state.isRecording ? this.stopRecording : this.startRecording}
            style={{
              ...style,
              padding: '8px 16px',
              borderRadius: '6px',
              background: this.state.isRecording ? '#ff4b4b' : 'white',
              color: this.state.isRecording ? 'white' : '#333',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            {this.state.isRecording ? 'Stop Recording' : 'Start Recording'}
          </button>
          <button 
            id="reset" 
            onClick={this.resetRecording} 
            style={{
              ...style,
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Reset
          </button>
          <button 
            id="download" 
            onClick={this.downloadRecording} 
            style={{
              ...style,
              padding: '8px 16px',
              borderRadius: '6px',
              background: 'white',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            Download
          </button>
          {this.state.audioUrl && (
            <audio
              id="audio"
              controls
              src={this.state.audioUrl}
              style={{ 
                marginLeft: 'auto',
                width: '250px',
                height: '40px',
                borderRadius: '20px'
              }}
            />
          )}
        </div>
      </div>
    )
  }
}

export default withStreamlitConnection(StreamlitAudioRecorder)

Streamlit.setComponentReady()
Streamlit.setFrameHeight()
