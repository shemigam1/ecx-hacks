import { WhisperSttProvider } from './whisper-stt.provider';

function client(text: string) {
  return { audio: { transcriptions: { create: jest.fn().mockResolvedValue({ text }) } } } as any;
}

describe('WhisperSttProvider', () => {
  it('downloads the recording and returns the transcription', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    const p = new WhisperSttProvider(client('  buy me light  '), fetchFn as any, 'whisper-1');
    expect(await p.transcribe('http://rec.wav')).toBe('buy me light');
    expect(fetchFn).toHaveBeenCalledWith('http://rec.wav');
  });

  it('throws when the recording cannot be downloaded', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 404 });
    const p = new WhisperSttProvider(client(''), fetchFn as any, 'whisper-1');
    await expect(p.transcribe('http://missing')).rejects.toThrow(/failed to download/);
  });
});
