import { embedTexts } from "@/lib/gemini.server";

export const CHUNK_SIZE = 1800;
export const CHUNK_OVERLAP = 200;

export function chunkText(text: string): string[] {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  if (clean.length <= CHUNK_SIZE) return [clean];

  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + CHUNK_SIZE, clean.length);
    if (end < clean.length) {
      const nextBreak = clean.lastIndexOf("\n", end);
      const nextSpace = clean.lastIndexOf(" ", end);
      const breakAt = Math.max(nextBreak, nextSpace);
      if (breakAt > start + CHUNK_SIZE / 2) end = breakAt;
    }
    chunks.push(clean.slice(start, end).trim());
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks.filter(Boolean);
}

// Rebuild the searchable/embedding chunks for a meeting's transcript.
export async function rebuildChunks(
  supabase: any,
  meetingId: string,
  workspaceId: string,
  transcript: string,
) {
  const chunks = chunkText(transcript);
  await supabase.from("transcript_chunks").delete().eq("meeting_id", meetingId);
  if (!chunks.length) return;

  let embeddings: number[][] = [];
  try {
    embeddings = await embedTexts(chunks);
  } catch {
    // Non-fatal — chunks stored without vectors.
  }

  await supabase.from("transcript_chunks").insert(
    chunks.map((content, i) => ({
      meeting_id: meetingId,
      workspace_id: workspaceId,
      seq: i,
      content,
      embedding: embeddings[i] ? (embeddings[i] as any) : null,
    })),
  );
}
