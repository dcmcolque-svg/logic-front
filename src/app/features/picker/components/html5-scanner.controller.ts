import { Html5Qrcode } from 'html5-qrcode';

const ELEMENT_WAIT_MS = 2000;

/** Polls for a DOM element by ID, retrying every 80ms up to maxWait */
function waitForElement(id: string, maxWait: number): Promise<HTMLElement | null> {
  return new Promise(resolve => {
    const start = Date.now();
    const check = () => {
      const el = document.getElementById(id);
      if (el) return resolve(el);
      if (Date.now() - start > maxWait) return resolve(null);
      setTimeout(check, 80);
    };
    check();
  });
}

function describeStartError(err: unknown): string {
  const error = err as { message?: string; toString(): string } | null | undefined;
  return error?.message || error?.toString() || 'Camera access denied or unavailable.';
}

/**
 * Wraps an Html5Qrcode camera scanner rendered into a DOM element,
 * shared by the picker's scanner dialogs.
 */
export class Html5ScannerController {
  private html5Qrcode: Html5Qrcode | null = null;
  private scanning = false;

  constructor(private readonly elementId: string) {}

  /**
   * Starts the camera scanner once its element is rendered.
   * Resolves to an error message when it could not start, or null on success.
   */
  async start(onDecoded: (decodedText: string) => void): Promise<string | null> {
    // Wait for the DOM element to exist (PrimeNG dialog can take variable time to render)
    const el = await waitForElement(this.elementId, ELEMENT_WAIT_MS);
    if (!el) {
      return 'Scanner element not ready. Please try again.';
    }

    try {
      this.html5Qrcode = new Html5Qrcode(this.elementId);

      await this.html5Qrcode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 280, height: 160 },
          aspectRatio: 1.5,
        },
        (decodedText: string) => onDecoded(decodedText),
        () => { /* ignore scan failures (no code in frame) */ }
      );

      this.scanning = true;
      return null;
    } catch (err) {
      return describeStartError(err);
    }
  }

  async stop(): Promise<void> {
    if (this.html5Qrcode && this.scanning) {
      try {
        await this.html5Qrcode.stop();
      } catch { /* already stopped */ }
      this.scanning = false;
    }
  }
}
