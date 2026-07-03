import { randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";

const ProtocolVersion = { V1: 0b0001 };
const MessageType = {
  CLIENT_FULL_REQUEST: 0b0001,
  CLIENT_AUDIO_ONLY_REQUEST: 0b0010,
  SERVER_FULL_RESPONSE: 0b1001,
  SERVER_ERROR_RESPONSE: 0b1111,
};
const Flags = {
  POS_SEQUENCE: 0b0001,
  NEG_WITH_SEQUENCE: 0b0011,
};
const Serialization = { JSON: 0b0001 };
const Compression = { GZIP: 0b0001 };

export interface AsrCredentials {
  appId: string;
  accessToken: string;
  resourceId: string;
}

export function buildRequestHeaders(credentials: AsrCredentials) {
  return {
    "X-Api-App-Key": credentials.appId,
    "X-Api-Access-Key": credentials.accessToken,
    "X-Api-Resource-Id": credentials.resourceId,
    "X-Api-Request-Id": randomUUID(),
    "X-Api-Connect-Id": randomUUID(),
  };
}

export function buildFullClientRequest(sequence: number, sampleRate = 16000): Buffer {
  const payload = {
    user: { uid: "diri" },
    audio: {
      format: "wav",
      codec: "raw",
      rate: sampleRate,
      bits: 16,
      channel: 1,
    },
    request: {
      model_name: "bigmodel",
      enable_itn: true,
      enable_punc: true,
      enable_ddc: false,
      show_utterances: true,
      enable_nonstream: false,
    },
  };

  return buildPacket(
    MessageType.CLIENT_FULL_REQUEST,
    Flags.POS_SEQUENCE,
    sequence,
    gzipSync(Buffer.from(JSON.stringify(payload))),
  );
}

export function buildAudioRequest(sequence: number, pcm: Buffer, isLast: boolean): Buffer {
  const flags = isLast ? Flags.NEG_WITH_SEQUENCE : Flags.POS_SEQUENCE;
  const actualSequence = isLast ? -Math.abs(sequence) : sequence;
  return buildPacket(MessageType.CLIENT_AUDIO_ONLY_REQUEST, flags, actualSequence, gzipSync(pcm));
}

function buildHeader(messageType: number, flags: number): Buffer {
  return Buffer.from([
    (ProtocolVersion.V1 << 4) | 1,
    (messageType << 4) | flags,
    (Serialization.JSON << 4) | Compression.GZIP,
    0x00,
  ]);
}

function buildPacket(messageType: number, flags: number, sequence: number, payload: Buffer): Buffer {
  const packet = Buffer.alloc(12 + payload.length);
  buildHeader(messageType, flags).copy(packet, 0);
  packet.writeInt32BE(sequence, 4);
  packet.writeUInt32BE(payload.length, 8);
  payload.copy(packet, 12);
  return packet;
}

export function buildStreamingWavHeader(sampleRate = 16000): Buffer {
  const header = Buffer.alloc(44);
  const dataSize = 0x7fffffff;
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(dataSize + 36, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataSize, 40);
  return header;
}

export interface VolcengineResponse {
  code: number;
  isLastPackage: boolean;
  payloadSequence: number;
  payloadSize: number;
  payloadMsg: unknown;
}

export function parseVolcengineResponse(message: Buffer): VolcengineResponse {
  const headerSize = (message[0] & 0x0f) * 4;
  const messageType = message[1] >> 4;
  const flags = message[1] & 0x0f;
  const serialization = message[2] >> 4;
  const compression = message[2] & 0x0f;

  let offset = headerSize;
  const response: VolcengineResponse = {
    code: 0,
    isLastPackage: Boolean(flags & 0x02),
    payloadSequence: 0,
    payloadSize: 0,
    payloadMsg: null,
  };

  if (flags & 0x01) {
    response.payloadSequence = message.readInt32BE(offset);
    offset += 4;
  }

  if (flags & 0x04) {
    offset += 4;
  }

  if (messageType === MessageType.SERVER_FULL_RESPONSE) {
    response.payloadSize = message.readUInt32BE(offset);
    offset += 4;
  } else if (messageType === MessageType.SERVER_ERROR_RESPONSE) {
    response.code = message.readInt32BE(offset);
    response.payloadSize = message.readUInt32BE(offset + 4);
    offset += 8;
  }

  let payload = message.subarray(offset, offset + response.payloadSize);
  if (payload.length === 0) return response;

  if (compression === Compression.GZIP) {
    payload = gunzipSync(payload);
  }

  if (serialization === Serialization.JSON) {
    response.payloadMsg = JSON.parse(payload.toString("utf8"));
  }

  return response;
}

export function extractTranscript(payloadMsg: unknown): string {
  const payload = payloadMsg as Record<string, unknown> | undefined;
  if (!payload) return "";

  const result = payload.result as Record<string, unknown> | undefined;
  if (result && typeof result.text === "string") {
    return result.text.trim();
  }

  const utterances = result?.utterances as Array<{ text?: string }> | undefined;
  if (Array.isArray(utterances) && utterances.length > 0) {
    return utterances
      .map((item) => item.text)
      .filter(Boolean)
      .join("")
      .trim();
  }

  return "";
}