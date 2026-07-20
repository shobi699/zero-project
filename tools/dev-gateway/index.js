/**
 * Dev STT Gateway — proxies PCM audio to OpenAI Whisper API.
 * Protocol:
 *   Client → Text: {"type":"start","config":{...}}
 *   Client → Binary: raw PCM i16 LE audio chunks
 *   Client → Text: {"type":"stop"}
 *   Server → Text: {"type":"final","text":"..."}
 */
const { WebSocketServer } = require("ws");
const https = require("https");
const { Buffer } = require("buffer");

const PORT = 9009;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!OPENAI_API_KEY) {
  console.error("Set OPENAI_API_KEY env var");
  process.exit(1);
}

const wss = new WebSocketServer({ port: PORT });
console.log(`dev-gateway listening on ws://127.0.0.1:${PORT}`);

wss.on("connection", (ws) => {
  console.log("client connected");
  const chunks = [];
  let config = { sample_rate: 16000, channels: 1 };

  ws.on("message", async (data, isBinary) => {
    if (isBinary) {
      chunks.push(Buffer.from(data));
      return;
    }

    const msg = JSON.parse(data.toString());

    if (msg.type === "start") {
      chunks.length = 0;
      if (msg.config) config = msg.config;
      console.log("recording started", config);
      return;
    }

    if (msg.type === "stop") {
      console.log(`recording stopped, ${chunks.length} chunks`);
      const pcm = Buffer.concat(chunks);
      if (pcm.length === 0) {
        ws.send(JSON.stringify({ type: "final", text: "" }));
        return;
      }

      try {
        const wav = pcmToWav(pcm, config.sample_rate, config.channels);
        const text = await transcribe(wav);
        console.log("transcription:", text);
        ws.send(JSON.stringify({ type: "final", text }));
      } catch (err) {
        console.error("transcription error:", err.message);
        ws.send(JSON.stringify({ type: "error", message: err.message }));
      }
    }
  });

  ws.on("close", () => console.log("client disconnected"));
});

function pcmToWav(pcm, sampleRate, channels) {
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const headerSize = 44;
  const wav = Buffer.alloc(headerSize + pcm.length);

  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + pcm.length, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(pcm.length, 40);
  pcm.copy(wav, headerSize);

  return wav;
}

async function transcribe(wavBuffer) {
  const boundary = "----FormBoundary" + Date.now();
  const formParts = [];

  formParts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`
  );
  formParts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\nfa\r\n`
  );
  formParts.push(
    `--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\njson\r\n`
  );

  const fileHeader = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.wav"\r\nContent-Type: audio/wav\r\n\r\n`;
  const fileTail = `\r\n--${boundary}--\r\n`;

  const body = Buffer.concat([
    Buffer.from(formParts.join("")),
    Buffer.from(fileHeader),
    wavBuffer,
    Buffer.from(fileTail),
  ]);

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.openai.com",
        path: "/v1/audio/transcriptions",
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": body.length,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return reject(new Error(`Whisper API ${res.statusCode}: ${data}`));
          }
          try {
            const json = JSON.parse(data);
            resolve(json.text || "");
          } catch (e) {
            reject(new Error("invalid response: " + data));
          }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
