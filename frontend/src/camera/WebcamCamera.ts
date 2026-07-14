/**
 * Webcam capture via getUserMedia — Meet-style browser permission flow.
 */
export interface CameraStartOptions {
  width?: number;
  height?: number;
  facingMode?: ConstrainDOMString;
}

export class WebcamCamera {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement;

  constructor(videoElement?: HTMLVideoElement) {
    this.video = videoElement ?? document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
  }

  getVideoElement(): HTMLVideoElement {
    return this.video;
  }

  getStream(): MediaStream | null {
    return this.stream;
  }

  getResolution(): { width: number; height: number } {
    return {
      width: this.video.videoWidth || 0,
      height: this.video.videoHeight || 0,
    };
  }

  async start(options: CameraStartOptions = {}): Promise<HTMLVideoElement> {
    const width = options.width ?? 640;
    const height = options.height ?? 480;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Camera API is not available in this browser.');
    }

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: width },
        height: { ideal: height },
        facingMode: options.facingMode ?? 'user',
        frameRate: { ideal: 30, max: 30 },
      },
    });

    this.video.srcObject = this.stream;
    await this.video.play();

    // Wait until metadata has real dimensions.
    if (this.video.readyState < 2) {
      await new Promise<void>((resolve) => {
        this.video.onloadeddata = () => resolve();
      });
    }

    return this.video;
  }

  stop(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.video.srcObject = null;
  }
}
