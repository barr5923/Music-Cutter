export function toneFile(name = "tone.wav") {
  const rate = 16000, samples = rate * 2;
  const buffer = new ArrayBuffer(44 + samples * 2), view = new DataView(buffer);
  const text = (offset, value) => [...value].forEach((char, i) => view.setUint8(offset + i, char.charCodeAt(0)));
  text(0, "RIFF"); view.setUint32(4, buffer.byteLength - 8, true); text(8, "WAVE");
  text(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) {
    // Silence outside the test interval proves the cut contains the requested section.
    const value = i >= rate / 2 && i < rate * 1.5 ? Math.sin(2 * Math.PI * 440 * i / rate) * 16000 : 0;
    view.setInt16(44 + i * 2, value, true);
  }
  return new File([buffer], name, { type: "audio/wav" });
}
