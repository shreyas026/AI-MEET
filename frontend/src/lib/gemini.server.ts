type GeminiConfig = {
  apiKey: string;
  baseUrl: string;
  chatModel: string;
  transcriptionModel: string;
  embeddingModel: string;
  embeddingDimensions: number;
};

function getGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim();
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

  return {
    apiKey,
    baseUrl:
      process.env.GEMINI_BASE_URL?.trim() || "https://generativelanguage.googleapis.com/v1beta",
    chatModel: process.env.GEMINI_CHAT_MODEL?.trim() || "gemini-3.5-flash",
    transcriptionModel:
      process.env.GEMINI_TRANSCRIBE_MODEL?.trim() || "gemini-3.5-flash",
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL?.trim() || "gemini-embedding-001",
    embeddingDimensions: Number(process.env.GEMINI_EMBEDDING_DIMENSIONS?.trim() || 1536),
  };
}

async function readAiError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  if (!body) return `${response.status} ${response.statusText}`.trim();
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    const message = parsed.error?.message || body;
    if (response.status === 429 || /quota|rate limit/i.test(message)) {
      return "Gemini quota is exhausted for now. Please wait for the quota reset or use a billing-enabled Gemini API key.";
    }
    return message;
  } catch {
    if (response.status === 429 || /quota|rate limit/i.test(body)) {
      return "Gemini quota is exhausted for now. Please wait for the quota reset or use a billing-enabled Gemini API key.";
    }
    return body;
  }
}

function apiUrl(baseUrl: string, path: string, apiKey: string): string {
  const url = new URL(`${baseUrl}${path}`);
  url.searchParams.set("key", apiKey);
  return url.toString();
}

function mimeTypeFromFilename(filename: string, fallback: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();
  const byExt: Record<string, string> = {
    mp3: "audio/mpeg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    webm: "audio/webm",
    ogg: "audio/ogg",
    aac: "audio/aac",
    flac: "audio/flac",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    "3gp": "video/3gpp",
    "3g2": "video/3gpp2",
  };
  return (ext && byExt[ext]) || fallback || "audio/webm";
}

function extractGeminiText(data: unknown): string {
  const response = data as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return (
    response.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter((text): text is string => Boolean(text))
      .join("")
      .trim() || ""
  );
}

function normalizeVector(values: number[]): number[] {
  const magnitude = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!magnitude) return values;
  return values.map((value) => value / magnitude);
}

export async function transcribeAudioBlob(audio: Blob, filename: string): Promise<string> {
  const { apiKey, baseUrl, transcriptionModel } = getGeminiConfig();
  if (audio.size > 18 * 1024 * 1024) {
    throw new Error("Gemini inline media limit is about 20 MB. Please upload a shorter recording.");
  }

  const audioBase64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const mimeType = mimeTypeFromFilename(filename, audio.type);

  const response = await fetch(
    apiUrl(baseUrl, `/models/${transcriptionModel}:generateContent`, apiKey),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text:
                  "Transcribe the spoken meeting content in this media accurately. Return only the transcript text, with no markdown or summary.",
              },
              { inlineData: { mimeType, data: audioBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Transcription failed: ${await readAiError(response)}`);
  }

  const transcript = extractGeminiText(await response.json());
  if (!transcript) throw new Error("Empty transcript returned");
  return transcript;
}

export async function generateJsonCompletion(prompt: string): Promise<string> {
  const { apiKey, baseUrl, chatModel } = getGeminiConfig();
  const response = await fetch(apiUrl(baseUrl, `/models/${chatModel}:generateContent`, apiKey), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an expert meeting analyst. Always respond with valid JSON matching the requested schema. Never wrap JSON in markdown code fences.\n\n${prompt}`,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`AI completion failed: ${await readAiError(response)}`);
  }

  return extractGeminiText(await response.json()) || "{}";
}

export async function embedTexts(input: string | string[]): Promise<number[][]> {
  const { apiKey, baseUrl, embeddingModel, embeddingDimensions } = getGeminiConfig();
  const inputs = Array.isArray(input) ? input : [input];

  return Promise.all(
    inputs.map(async (text) => {
      const response = await fetch(apiUrl(baseUrl, `/models/${embeddingModel}:embedContent`, apiKey), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          embedContentConfig: {
            outputDimensionality: embeddingDimensions,
            taskType: "SEMANTIC_SIMILARITY",
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding failed: ${await readAiError(response)}`);
      }

      const data = (await response.json()) as { embedding?: { values?: number[] } };
      const values = data.embedding?.values;
      if (!Array.isArray(values)) throw new Error("Embedding response did not include values");
      return normalizeVector(values);
    }),
  );
}
