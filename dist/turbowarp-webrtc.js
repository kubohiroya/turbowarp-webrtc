// Name: WebRTC Manual Pairing
// ID: kubohiroyawebrtc
// Description: Peer-to-peer DataChannel messaging for TurboWarp with manual pairing codes.
// By: Hiroya Kubo
// License: MPL-2.0

(function (Scratch) {
  'use strict';

  const extensionConfig = {
    id: "kubohiroyawebrtc",
    name: "WebRTC Manual Pairing"
  };
  const extensionName = "WebRTC Manual Pairing";
  const blocks = [{ "opcode": "setIceMode", "blockType": "COMMAND", "text": "set ICE mode [MODE]", "description": "Sets whether new peer connections use LAN-only ICE or public STUN servers.", "arguments": { "MODE": { "type": "STRING", "defaultValue": "lan" } } }, { "opcode": "createOffer", "blockType": "COMMAND", "text": "create offer code for peer [PEER]", "description": "Creates a manual pairing offer code for the named peer.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "getOffer", "blockType": "REPORTER", "text": "offer code for peer [PEER]", "description": "Returns the latest offer code generated for the named peer.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "acceptOffer", "blockType": "COMMAND", "text": "accept offer code [CODE] as peer [PEER]", "description": "Accepts a peer's offer code and creates an answer code.", "arguments": { "CODE": { "type": "STRING", "defaultValue": "offer-code" }, "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "getAnswer", "blockType": "REPORTER", "text": "answer code for peer [PEER]", "description": "Returns the latest answer code generated for the named peer.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "acceptAnswer", "blockType": "COMMAND", "text": "accept answer code [CODE] for peer [PEER]", "description": "Completes pairing by accepting a peer's answer code.", "arguments": { "CODE": { "type": "STRING", "defaultValue": "answer-code" }, "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "sendEvent", "blockType": "COMMAND", "text": "send event [TYPE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]", "description": "Sends a JSON event envelope to one peer, or to all peers when PEER is *.", "arguments": { "TYPE": { "type": "STRING", "defaultValue": "door-open" }, "PAYLOAD": { "type": "STRING", "defaultValue": "{}" }, "CHANNEL": { "type": "STRING", "defaultValue": "default" }, "PEER": { "type": "STRING", "defaultValue": "*" } } }, { "opcode": "broadcastNetworkMessage", "blockType": "COMMAND", "text": "broadcast network message [MESSAGE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]", "description": "Sends a network broadcast message envelope to one peer, or to all peers when PEER is *.", "arguments": { "MESSAGE": { "type": "STRING", "defaultValue": "door-open" }, "PAYLOAD": { "type": "STRING", "defaultValue": "{}" }, "CHANNEL": { "type": "STRING", "defaultValue": "default" }, "PEER": { "type": "STRING", "defaultValue": "*" } } }, { "opcode": "whenReceiveNetworkMessage", "blockType": "EVENT", "text": "when I receive network message [MESSAGE]", "description": "Starts scripts when a matching network broadcast message is received.", "isEdgeActivated": false, "arguments": { "MESSAGE": { "type": "STRING", "defaultValue": "door-open", "menu": "networkMessages" } } }, { "opcode": "networkMessagePayload", "blockType": "REPORTER", "text": "network message payload", "description": "Returns the payload of the most recently received network broadcast message as JSON.", "arguments": {} }, { "opcode": "networkMessageSender", "blockType": "REPORTER", "text": "network message sender", "description": "Returns the sender ID of the most recently received network broadcast message.", "arguments": {} }, { "opcode": "networkMessagePeer", "blockType": "REPORTER", "text": "network message peer", "description": "Returns the local peer name that received the most recent network broadcast message.", "arguments": {} }, { "opcode": "networkMessageChannel", "blockType": "REPORTER", "text": "network message channel", "description": "Returns the channel of the most recently received network broadcast message.", "arguments": {} }, { "opcode": "hasMessages", "blockType": "BOOLEAN", "text": "has received messages?", "description": "Reports whether the receive queue contains at least one message.", "arguments": {} }, { "opcode": "messageCount", "blockType": "REPORTER", "text": "received message count", "description": "Returns the number of messages currently waiting in the receive queue.", "arguments": {} }, { "opcode": "nextMessage", "blockType": "REPORTER", "text": "next received message", "description": "Removes and returns the oldest received message as JSON.", "arguments": {} }, { "opcode": "lastMessage", "blockType": "REPORTER", "text": "last received message", "description": "Returns the most recent received message as JSON without removing it.", "arguments": {} }, { "opcode": "clearMessages", "blockType": "COMMAND", "text": "clear received messages", "description": "Clears the receive queue.", "arguments": {} }, { "opcode": "connectionState", "blockType": "REPORTER", "text": "connection state of peer [PEER]", "description": "Returns the WebRTC connection state for the named peer.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "connectedPeers", "blockType": "REPORTER", "text": "connected peers", "description": "Returns a JSON array of connected peer names.", "arguments": {} }, { "opcode": "closePeer", "blockType": "COMMAND", "text": "close peer [PEER]", "description": "Closes and removes a peer connection.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "syncClock", "blockType": "COMMAND", "text": "sync clock with peer [PEER]", "description": "Runs a clock probe exchange with the peer and stores the resulting clock offset.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "clockOffset", "blockType": "REPORTER", "text": "clock offset to peer [PEER] us", "description": "Returns the microseconds to add to a local timestamp to express it in the peer's clock.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "clockRoundTrip", "blockType": "REPORTER", "text": "clock round trip to peer [PEER] us", "description": "Returns the shortest round trip observed while probing the peer, in microseconds.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "clockUncertainty", "blockType": "REPORTER", "text": "clock uncertainty to peer [PEER] us", "description": "Returns the clock offset uncertainty for the peer in microseconds, which is half the shortest round trip.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "peerTime", "blockType": "REPORTER", "text": "time in clock of peer [PEER] us", "description": "Returns the current local time expressed in the peer's clock, in microseconds.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "localTime", "blockType": "REPORTER", "text": "local time us", "description": "Returns the local high-resolution clock in microseconds.", "arguments": {} }, { "opcode": "frameLatency", "blockType": "REPORTER", "text": "frame latency us for capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]", "description": "Returns how many microseconds after the displayed pattern time the local frame was captured. CAPTURE_US is a local timestamp, PATTERN_US is the decoded display time in the peer's clock, and WRAP_US is the pattern repeat period, or 0 when the pattern never repeats.", "arguments": { "CAPTURE_US": { "type": "NUMBER", "defaultValue": "0" }, "PATTERN_US": { "type": "NUMBER", "defaultValue": "0" }, "WRAP_US": { "type": "NUMBER", "defaultValue": "4096000" }, "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "recordFrameSyncSample", "blockType": "COMMAND", "text": "record frame sync sample for camera [CAMERA] capture [CAPTURE_US] pattern [PATTERN_US] wrap [WRAP_US] from peer [PEER]", "description": "Converts one pattern observation into a latency sample and stores it for the camera slot.", "arguments": { "CAMERA": { "type": "STRING", "defaultValue": "camera-1" }, "CAPTURE_US": { "type": "NUMBER", "defaultValue": "0" }, "PATTERN_US": { "type": "NUMBER", "defaultValue": "0" }, "WRAP_US": { "type": "NUMBER", "defaultValue": "4096000" }, "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "clearFrameSyncSamples", "blockType": "COMMAND", "text": "clear frame sync samples for camera [CAMERA]", "description": "Clears the latency samples stored for the camera slot.", "arguments": { "CAMERA": { "type": "STRING", "defaultValue": "camera-1" } } }, { "opcode": "frameSyncSampleCount", "blockType": "REPORTER", "text": "frame sync sample count for camera [CAMERA]", "description": "Returns how many latency samples are stored for the camera slot.", "arguments": { "CAMERA": { "type": "STRING", "defaultValue": "camera-1" } } }, { "opcode": "frameSyncSummary", "blockType": "REPORTER", "text": "frame sync summary for camera [CAMERA]", "description": "Returns the local latency summary for the camera slot as a JSON report.", "arguments": { "CAMERA": { "type": "STRING", "defaultValue": "camera-1" } } }, { "opcode": "sendFrameSyncReport", "blockType": "COMMAND", "text": "send frame sync report for camera [CAMERA] to peer [PEER]", "description": "Sends the camera slot's latency summary to the peer on the internal sync channel.", "arguments": { "CAMERA": { "type": "STRING", "defaultValue": "camera-1" }, "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "frameSyncReport", "blockType": "REPORTER", "text": "frame sync report", "description": "Returns every received frame sync report together with per-camera offsets as JSON.", "arguments": {} }, { "opcode": "frameSyncCameras", "blockType": "REPORTER", "text": "frame sync cameras", "description": "Returns a JSON array of the camera slots that have reported.", "arguments": {} }, { "opcode": "frameSyncLatencyOfCamera", "blockType": "REPORTER", "text": "frame sync latency us of camera [CAMERA]", "description": "Returns the reported median capture latency of the camera slot in microseconds.", "arguments": { "CAMERA": { "type": "STRING", "defaultValue": "camera-1" } } }, { "opcode": "frameSyncOffsetOfCamera", "blockType": "REPORTER", "text": "frame sync offset us of camera [CAMERA]", "description": "Returns how many microseconds later than the reference camera this camera finishes recording a frame. Subtract it from the camera's frame timestamps to align the cameras.", "arguments": { "CAMERA": { "type": "STRING", "defaultValue": "camera-1" } } }, { "opcode": "clearFrameSyncReport", "blockType": "COMMAND", "text": "clear frame sync report", "description": "Clears every received frame sync report.", "arguments": {} }];
  const menus = { "networkMessages": { "acceptReporters": false, "items": ["door-open", "event", "*"] } };
  const definitions = {
    extensionName,
    blocks,
    menus
  };
  const protocolVersion = 1;
  function encodePairingCode(code) {
    return encodeBase64Url(JSON.stringify(code));
  }
  function decodePairingCode(value) {
    const parsed = JSON.parse(decodeBase64Url(value.trim()));
    if (parsed.version !== protocolVersion) {
      throw new Error(`Unsupported pairing code version: ${String(parsed.version)}`);
    }
    if (parsed.kind !== "offer" && parsed.kind !== "answer") {
      throw new Error("Pairing code kind must be offer or answer.");
    }
    if (!parsed.description || typeof parsed.description.type !== "string") {
      throw new Error("Pairing code does not contain a session description.");
    }
    return parsed;
  }
  function parsePayload(value) {
    const trimmed = value.trim();
    if (trimmed.length === 0) return {};
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  function serializeEnvelope(envelope) {
    return JSON.stringify(envelope);
  }
  function parseEnvelope(peer, value) {
    const parsed = JSON.parse(value);
    if (parsed.version !== protocolVersion) {
      throw new Error(`Unsupported message version: ${String(parsed.version)}`);
    }
    if (typeof parsed.id !== "string" || typeof parsed.type !== "string") {
      throw new Error("Message is missing required fields.");
    }
    return { ...parsed, peer };
  }
  function encodeBase64Url(value) {
    const bytes = new TextEncoder().encode(value);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  }
  function decodeBase64Url(value) {
    const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }
  const channelLabel = "tm-events";
  const defaultQueueLimit = 200;
  class ManualPeerSession {
    constructor(options = {}) {
      this.peers = /* @__PURE__ */ new Map();
      this.iceMode = "lan";
      this.receiveQueue = [];
      this.seq = 0;
      this.localId = options.localId ?? randomId();
      this.queueLimit = options.queueLimit ?? defaultQueueLimit;
    }
    setIceMode(mode) {
      const normalized = mode.trim().toLowerCase();
      this.iceMode = normalized === "stun" ? "stun" : "lan";
      return this.iceMode;
    }
    async createOffer(peer) {
      const record = this.createPeer(peer);
      const channel = record.connection.createDataChannel(channelLabel, { ordered: true });
      this.attachChannel(peer, record, channel);
      const offer = await record.connection.createOffer();
      await record.connection.setLocalDescription(offer);
      await waitForIceGathering(record.connection);
      const code = this.makePairingCode("offer", record.connection.localDescription);
      record.offerCode = code;
      return code;
    }
    getOffer(peer) {
      return this.peers.get(peer)?.offerCode ?? "";
    }
    async acceptOffer(peer, code) {
      const offer = decodePairingCode(code);
      if (offer.kind !== "offer") {
        throw new Error("Expected an offer pairing code.");
      }
      const record = this.createPeer(peer);
      await record.connection.setRemoteDescription(offer.description);
      const answer = await record.connection.createAnswer();
      await record.connection.setLocalDescription(answer);
      await waitForIceGathering(record.connection);
      const answerCode = this.makePairingCode("answer", record.connection.localDescription);
      record.answerCode = answerCode;
      return answerCode;
    }
    getAnswer(peer) {
      return this.peers.get(peer)?.answerCode ?? "";
    }
    async acceptAnswer(peer, code) {
      const answer = decodePairingCode(code);
      if (answer.kind !== "answer") {
        throw new Error("Expected an answer pairing code.");
      }
      const record = this.requirePeer(peer);
      await record.connection.setRemoteDescription(answer.description);
    }
    sendEvent(peer, type, payloadText, channel) {
      const targets = peer.trim() === "*" ? this.connectedPeers() : [peer.trim()];
      for (const target of targets) {
        this.sendToPeer(target, this.createEnvelope(type, payloadText, channel));
      }
    }
    setMessageHandler(handler) {
      this.messageHandler = handler;
    }
    setInternalHandler(handler) {
      this.internalHandler = handler;
    }
    hasMessages() {
      return this.receiveQueue.length > 0;
    }
    messageCount() {
      return this.receiveQueue.length;
    }
    nextMessage() {
      const message = this.receiveQueue.shift();
      return message ? JSON.stringify(message) : "";
    }
    lastMessage() {
      return this.latestMessage ? JSON.stringify(this.latestMessage) : "";
    }
    clearMessages() {
      this.receiveQueue = [];
      this.latestMessage = void 0;
    }
    connectionState(peer) {
      return this.peers.get(peer.trim())?.connection.connectionState ?? "closed";
    }
    connectedPeers() {
      return [...this.peers.entries()].filter(([, record]) => record.connection.connectionState === "connected" && record.channel?.readyState === "open").map(([peer]) => peer);
    }
    closePeer(peer) {
      const key = peer.trim();
      const record = this.peers.get(key);
      if (!record) return;
      record.channel?.close();
      record.connection.close();
      this.peers.delete(key);
    }
    createPeer(peer) {
      const key = peer.trim();
      this.closePeer(key);
      const connection = new RTCPeerConnection(this.configuration());
      const record = { connection };
      connection.ondatachannel = (event) => this.attachChannel(key, record, event.channel);
      connection.onconnectionstatechange = () => {
        if (connection.connectionState === "failed" || connection.connectionState === "closed") {
          record.channel?.close();
        }
      };
      this.peers.set(key, record);
      return record;
    }
    attachChannel(peer, record, channel) {
      record.channel = channel;
      channel.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        try {
          this.pushMessage(parseEnvelope(peer, event.data));
        } catch {
          this.pushMessage({
            version: protocolVersion,
            id: randomId(),
            seq: 0,
            from: peer,
            peer,
            channel: "raw",
            type: "raw",
            payload: event.data,
            timestamp: Date.now()
          });
        }
      };
    }
    sendToPeer(peer, envelope) {
      const record = this.requirePeer(peer);
      if (!record.channel || record.channel.readyState !== "open") {
        throw new Error(`Peer ${peer} is not ready for sending.`);
      }
      record.channel.send(serializeEnvelope(envelope));
    }
    createEnvelope(type, payloadText, channel) {
      return {
        version: protocolVersion,
        id: randomId(),
        seq: ++this.seq,
        from: this.localId,
        channel: channel.trim() || "default",
        type: type.trim() || "event",
        payload: parsePayload(payloadText),
        timestamp: Date.now()
      };
    }
    pushMessage(message) {
      if (this.consumeInternally(message)) return;
      this.receiveQueue.push(message);
      while (this.receiveQueue.length > this.queueLimit) {
        this.receiveQueue.shift();
      }
      this.latestMessage = message;
      try {
        this.messageHandler?.(message);
      } catch {
      }
    }
    consumeInternally(message) {
      try {
        return this.internalHandler?.(message) === true;
      } catch {
        return false;
      }
    }
    makePairingCode(kind, description) {
      if (!description) {
        throw new Error("Local session description is not available.");
      }
      return encodePairingCode({
        version: protocolVersion,
        kind,
        description: description.toJSON()
      });
    }
    requirePeer(peer) {
      const key = peer.trim();
      const record = this.peers.get(key);
      if (!record) {
        throw new Error(`Peer ${key} does not exist.`);
      }
      return record;
    }
    configuration() {
      if (this.iceMode === "lan") {
        return { iceServers: [] };
      }
      return { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
    }
  }
  function waitForIceGathering(connection) {
    if (connection.iceGatheringState === "complete") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => {
        if (connection.iceGatheringState === "complete") {
          connection.removeEventListener("icegatheringstatechange", done);
          resolve();
        }
      };
      connection.addEventListener("icegatheringstatechange", done);
      setTimeout(done, 0);
    });
  }
  function randomId() {
    if (globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
    return Math.random().toString(36).slice(2);
  }
  const syncChannel = "sync";
  const clockProbeSchema = "twmp/clock-probe";
  const clockProbeVersion = 1;
  const frameSyncReportSchema = "twmp/frame-sync-report";
  const frameSyncReportVersion = 1;
  function createClockPing(sequence, t0Us) {
    return {
      schema: clockProbeSchema,
      version: clockProbeVersion,
      kind: "ping",
      sequence: toSafeInteger(sequence),
      t0Us: toSafeInteger(t0Us)
    };
  }
  function createClockPong(ping, t1Us, t2Us) {
    return {
      schema: clockProbeSchema,
      version: clockProbeVersion,
      kind: "pong",
      sequence: ping.sequence,
      t0Us: ping.t0Us,
      t1Us: toSafeInteger(t1Us),
      t2Us: toSafeInteger(t2Us)
    };
  }
  function parseClockProbe(value) {
    const record = asRecord(value);
    if (!record) return void 0;
    if (record.schema !== clockProbeSchema || record.version !== clockProbeVersion) return void 0;
    const sequence = asSafeInteger(record.sequence);
    const t0Us = asSafeInteger(record.t0Us);
    if (sequence === void 0 || t0Us === void 0) return void 0;
    if (record.kind === "ping") {
      return { schema: clockProbeSchema, version: clockProbeVersion, kind: "ping", sequence, t0Us };
    }
    if (record.kind !== "pong") return void 0;
    const t1Us = asSafeInteger(record.t1Us);
    const t2Us = asSafeInteger(record.t2Us);
    if (t1Us === void 0 || t2Us === void 0) return void 0;
    return {
      schema: clockProbeSchema,
      version: clockProbeVersion,
      kind: "pong",
      sequence,
      t0Us,
      t1Us,
      t2Us
    };
  }
  function parseFrameSyncReport(value) {
    const record = asRecord(value);
    if (!record) return void 0;
    if (record.schema !== frameSyncReportSchema) return void 0;
    if (record.version !== frameSyncReportVersion) return void 0;
    const cameraId = asNonEmptyString(record.cameraId);
    const measuredAtUs = asSafeInteger(record.measuredAtUs);
    const latencyUs = asLatencyStats(record.latencyUs);
    if (cameraId === void 0 || measuredAtUs === void 0 || !latencyUs) return void 0;
    return {
      schema: frameSyncReportSchema,
      version: frameSyncReportVersion,
      cameraId,
      referencePeer: asNonEmptyString(record.referencePeer) ?? "",
      measuredAtUs,
      latencyUs,
      clock: asClockQuality(record.clock)
    };
  }
  function nowMicroseconds() {
    if (typeof performance === "object" && typeof performance.now === "function") {
      return Math.round((performance.timeOrigin + performance.now()) * 1e3);
    }
    return Date.now() * 1e3;
  }
  function asLatencyStats(value) {
    const record = asRecord(value);
    if (!record) return void 0;
    const count = asSafeInteger(record.count);
    if (count === void 0) return void 0;
    const numbers = {};
    for (const key of ["min", "p10", "median", "p90", "max", "mean", "mad", "stddev"]) {
      const parsed = asFiniteNumber(record[key]);
      if (parsed === void 0) return void 0;
      numbers[key] = parsed;
    }
    return {
      count,
      min: numbers.min ?? 0,
      p10: numbers.p10 ?? 0,
      median: numbers.median ?? 0,
      p90: numbers.p90 ?? 0,
      max: numbers.max ?? 0,
      mean: numbers.mean ?? 0,
      mad: numbers.mad ?? 0,
      stddev: numbers.stddev ?? 0
    };
  }
  function asClockQuality(value) {
    const record = asRecord(value);
    if (!record) return null;
    const offsetUs = asFiniteNumber(record.offsetUs);
    const rttUs = asFiniteNumber(record.rttUs);
    const uncertaintyUs = asFiniteNumber(record.uncertaintyUs);
    const samples = asSafeInteger(record.samples);
    if (offsetUs === void 0 || rttUs === void 0) return null;
    if (uncertaintyUs === void 0 || samples === void 0) return null;
    return { offsetUs, rttUs, uncertaintyUs, samples };
  }
  function asRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
    return value;
  }
  function asNonEmptyString(value) {
    return typeof value === "string" && value.length > 0 ? value : void 0;
  }
  function asFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value) ? value : void 0;
  }
  function asSafeInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
  }
  function toSafeInteger(value) {
    const rounded = Math.round(value);
    if (!Number.isSafeInteger(rounded) || rounded < 0) {
      throw new RangeError("Clock probe timestamps must be non-negative safe integers.");
    }
    return rounded;
  }
  const defaultSampleLimit = 2e4;
  function frameLatencyUs(captureUs, patternUs, wrapUs = 0) {
    const latency = captureUs - patternUs;
    if (!(wrapUs > 0)) return latency;
    return (latency % wrapUs + wrapUs) % wrapUs;
  }
  function summarizeLatencies(values) {
    const finite = values.filter((value) => Number.isFinite(value));
    if (finite.length === 0) return void 0;
    const sorted = [...finite].sort((left, right) => left - right);
    const median = percentile(sorted, 0.5);
    const mean = sorted.reduce((total, value) => total + value, 0) / sorted.length;
    const variance = sorted.reduce((total, value) => total + (value - mean) ** 2, 0) / sorted.length;
    const deviations = sorted.map((value) => Math.abs(value - median)).sort((a, b) => a - b);
    return {
      count: sorted.length,
      min: sorted[0] ?? 0,
      p10: percentile(sorted, 0.1),
      median,
      p90: percentile(sorted, 0.9),
      max: sorted[sorted.length - 1] ?? 0,
      mean,
      mad: percentile(deviations, 0.5),
      stddev: Math.sqrt(variance)
    };
  }
  function percentile(sorted, fraction) {
    if (sorted.length === 0) return 0;
    if (sorted.length === 1) return sorted[0] ?? 0;
    const position = (sorted.length - 1) * Math.min(1, Math.max(0, fraction));
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const low = sorted[lower] ?? 0;
    const high = sorted[upper] ?? low;
    return low + (high - low) * (position - lower);
  }
  class LatencySampleStore {
    constructor(limit = defaultSampleLimit) {
      this.samples = /* @__PURE__ */ new Map();
      this.limit = Math.max(1, limit);
    }
    add(cameraId, latencyUs) {
      if (!Number.isFinite(latencyUs)) return;
      const bucket = this.samples.get(cameraId) ?? [];
      bucket.push(latencyUs);
      while (bucket.length > this.limit) bucket.shift();
      this.samples.set(cameraId, bucket);
    }
    count(cameraId) {
      return this.samples.get(cameraId)?.length ?? 0;
    }
    values(cameraId) {
      return this.samples.get(cameraId) ?? [];
    }
    summarize(cameraId) {
      return summarizeLatencies(this.values(cameraId));
    }
    clear(cameraId) {
      this.samples.delete(cameraId);
    }
    clearAll() {
      this.samples.clear();
    }
    cameras() {
      return [...this.samples.keys()].sort();
    }
  }
  function createFrameSyncReport(options) {
    return {
      schema: frameSyncReportSchema,
      version: frameSyncReportVersion,
      cameraId: options.cameraId,
      referencePeer: options.referencePeer,
      measuredAtUs: options.measuredAtUs,
      latencyUs: options.latencyUs,
      clock: options.clock
    };
  }
  class FrameSyncRegistry {
    constructor() {
      this.entries = /* @__PURE__ */ new Map();
    }
    accept(report, peer, receivedAtUs) {
      const entry = {
        cameraId: report.cameraId,
        peer,
        referencePeer: report.referencePeer,
        latencyUs: report.latencyUs,
        offsetUs: 0,
        clock: report.clock,
        measuredAtUs: report.measuredAtUs,
        receivedAtUs
      };
      this.entries.set(report.cameraId, entry);
      return entry;
    }
    cameras() {
      return [...this.entries.keys()].sort();
    }
    has(cameraId) {
      return this.entries.has(cameraId);
    }
    referenceLatencyUs() {
      const medians = [...this.entries.values()].map((entry) => entry.latencyUs.median).sort((left, right) => left - right);
      return percentile(medians, 0.5);
    }
    latencyUsOf(cameraId) {
      return this.entries.get(cameraId)?.latencyUs.median ?? 0;
    }
    offsetUsOf(cameraId) {
      const entry = this.entries.get(cameraId);
      if (!entry) return 0;
      return entry.latencyUs.median - this.referenceLatencyUs();
    }
    overview() {
      const referenceLatencyUs = this.referenceLatencyUs();
      return {
        referenceLatencyUs,
        cameras: this.cameras().map((cameraId) => {
          const entry = this.entries.get(cameraId);
          return { ...entry, offsetUs: entry.latencyUs.median - referenceLatencyUs };
        })
      };
    }
    clear() {
      this.entries.clear();
    }
  }
  const defaultExchanges = 24;
  const defaultIntervalMs = 20;
  const defaultTimeoutMs = 1e3;
  class ClockSync {
    constructor(options) {
      this.estimates = /* @__PURE__ */ new Map();
      this.pending = /* @__PURE__ */ new Map();
      this.sequence = 0;
      this.send = options.send;
      this.nowUs = options.nowUs ?? nowMicroseconds;
      this.wait = options.wait ?? defaultWait;
      this.exchanges = Math.max(1, Math.trunc(options.exchanges ?? defaultExchanges));
      this.intervalMs = Math.max(0, options.intervalMs ?? defaultIntervalMs);
      this.timeoutMs = Math.max(1, options.timeoutMs ?? defaultTimeoutMs);
    }
    async syncWith(peer) {
      const samples = [];
      for (let index = 0; index < this.exchanges; index += 1) {
        if (index > 0 && this.intervalMs > 0) await this.wait(this.intervalMs);
        const sample = await this.exchange(peer);
        if (sample) samples.push(sample);
      }
      if (samples.length === 0) {
        throw new Error(`Peer ${peer} did not answer any clock probe.`);
      }
      const estimate = summarizeExchanges(peer, samples, this.nowUs());
      this.estimates.set(peer, estimate);
      return estimate;
    }
    /** Handles a clock probe envelope. Returns true when the message was consumed. */
    handleMessage(peer, type, payload) {
      if (type !== clockProbeSchema) return false;
      const probe = parseClockProbe(payload);
      if (!probe) return true;
      if (probe.kind === "ping") {
        const t1Us = this.nowUs();
        this.send(peer, clockProbeSchema, createClockPong(probe, t1Us, this.nowUs()));
        return true;
      }
      const resolve = this.pending.get(this.key(peer, probe.sequence));
      if (resolve) {
        this.pending.delete(this.key(peer, probe.sequence));
        resolve(probe);
      }
      return true;
    }
    estimate(peer) {
      return this.estimates.get(peer);
    }
    quality(peer) {
      const estimate = this.estimates.get(peer);
      if (!estimate) return null;
      return {
        offsetUs: estimate.offsetUs,
        rttUs: estimate.rttUs,
        uncertaintyUs: estimate.uncertaintyUs,
        samples: estimate.samples
      };
    }
    offsetUsTo(peer) {
      return this.estimates.get(peer)?.offsetUs ?? 0;
    }
    rttUsTo(peer) {
      return this.estimates.get(peer)?.rttUs ?? 0;
    }
    uncertaintyUsTo(peer) {
      return this.estimates.get(peer)?.uncertaintyUs ?? 0;
    }
    hasEstimate(peer) {
      return this.estimates.has(peer);
    }
    /** Converts a local microsecond timestamp into the named peer's clock. */
    toPeerTimeUs(peer, localUs) {
      return localUs + this.offsetUsTo(peer);
    }
    localTimeUs() {
      return this.nowUs();
    }
    forget(peer) {
      this.estimates.delete(peer);
    }
    async exchange(peer) {
      const sequence = this.sequence++;
      const key = this.key(peer, sequence);
      const ping = createClockPing(sequence, this.nowUs());
      const answered = new Promise((resolve) => {
        this.pending.set(key, resolve);
        void this.wait(this.timeoutMs).then(() => {
          if (this.pending.delete(key)) resolve(void 0);
        });
      });
      this.send(peer, clockProbeSchema, ping);
      const pong = await answered;
      if (!pong) return void 0;
      const t3Us = this.nowUs();
      return {
        offsetUs: (pong.t1Us - pong.t0Us + (pong.t2Us - t3Us)) / 2,
        rttUs: t3Us - pong.t0Us - (pong.t2Us - pong.t1Us)
      };
    }
    key(peer, sequence) {
      return `${peer}#${sequence}`;
    }
  }
  function summarizeExchanges(peer, samples, updatedAtUs) {
    const sorted = [...samples].sort((left, right) => left.rttUs - right.rttUs);
    const keep = Math.max(1, Math.round(sorted.length / 4));
    const best = sorted.slice(0, keep);
    const offsetUs = best.reduce((total, sample) => total + sample.offsetUs, 0) / best.length;
    const rttUs = sorted[0]?.rttUs ?? 0;
    return {
      peer,
      offsetUs,
      rttUs,
      uncertaintyUs: rttUs / 2,
      samples: samples.length,
      updatedAtUs
    };
  }
  function defaultWait(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
  class SyncService {
    constructor(transport, options = {}) {
      this.registry = new FrameSyncRegistry();
      this.referencePeers = /* @__PURE__ */ new Map();
      this.transport = transport;
      this.nowUs = options.nowUs ?? nowMicroseconds;
      this.samples = new LatencySampleStore(options.sampleLimit);
      this.clock = new ClockSync({
        ...options,
        nowUs: this.nowUs,
        send: (peer, type, payload) => this.send(peer, type, payload)
      });
    }
    /** Handles sync traffic. Returns true when the envelope was consumed. */
    handleEnvelope(message) {
      if (message.channel !== syncChannel) return false;
      if (message.type === clockProbeSchema) {
        return this.clock.handleMessage(message.peer, message.type, message.payload);
      }
      if (message.type === frameSyncReportSchema) {
        const report = parseFrameSyncReport(message.payload);
        if (report) this.registry.accept(report, message.peer, this.nowUs());
        return true;
      }
      return true;
    }
    async syncClock(peer) {
      return this.clock.syncWith(peer);
    }
    clockOffsetUs(peer) {
      return this.clock.offsetUsTo(peer);
    }
    clockRoundTripUs(peer) {
      return this.clock.rttUsTo(peer);
    }
    clockUncertaintyUs(peer) {
      return this.clock.uncertaintyUsTo(peer);
    }
    localTimeUs() {
      return this.nowUs();
    }
    peerTimeUs(peer) {
      return this.clock.toPeerTimeUs(peer, this.localTimeUs());
    }
    /**
     * Latency between the moment the pattern was shown and the moment this
     * computer finished recording the frame, expressed in the peer's clock.
     */
    frameLatency(captureUs, patternUs, wrapUs, peer) {
      return frameLatencyUs(this.clock.toPeerTimeUs(peer, captureUs), patternUs, wrapUs);
    }
    recordSample(cameraId, captureUs, patternUs, wrapUs, peer) {
      const latency = this.frameLatency(captureUs, patternUs, wrapUs, peer);
      this.samples.add(cameraId, latency);
      this.referencePeers.set(cameraId, peer);
      return latency;
    }
    clearSamples(cameraId) {
      this.samples.clear(cameraId);
      this.referencePeers.delete(cameraId);
    }
    sampleCount(cameraId) {
      return this.samples.count(cameraId);
    }
    localReport(cameraId) {
      const latencyUs = this.samples.summarize(cameraId);
      if (!latencyUs) return void 0;
      const referencePeer = this.referencePeers.get(cameraId) ?? "";
      return createFrameSyncReport({
        cameraId,
        referencePeer,
        measuredAtUs: this.nowUs(),
        latencyUs,
        clock: referencePeer ? this.clock.quality(referencePeer) : null
      });
    }
    sendReport(cameraId, peer) {
      const report = this.localReport(cameraId);
      if (!report) {
        throw new Error(`Camera ${cameraId} has no frame sync samples to report.`);
      }
      this.send(peer, frameSyncReportSchema, report);
      return report;
    }
    reportOverview() {
      return JSON.stringify(this.registry.overview());
    }
    reportCameras() {
      return JSON.stringify(this.registry.cameras());
    }
    reportLatencyUs(cameraId) {
      return this.registry.latencyUsOf(cameraId);
    }
    reportOffsetUs(cameraId) {
      return this.registry.offsetUsOf(cameraId);
    }
    clearReport() {
      this.registry.clear();
    }
    send(peer, type, payload) {
      this.transport.sendEvent(peer, type, JSON.stringify(payload), syncChannel);
    }
  }
  const blockDefinitions = definitions.blocks;
  const networkMessageHatOpcode = `${extensionConfig.id}_whenReceiveNetworkMessage`;
  const networkMessageThreadContextKey = "__turbowarpWebRtcNetworkMessage";
  class WebRtcManualPairingExtension {
    constructor(session = new ManualPeerSession(), sync) {
      this.session = session;
      this.sync = sync ?? new SyncService(session);
      this.session.setMessageHandler((message) => this.startNetworkMessageHats(message));
      this.session.setInternalHandler((message) => this.sync.handleEnvelope(message));
    }
    getInfo() {
      return {
        id: extensionConfig.id,
        name: Scratch.translate(definitions.extensionName),
        blocks: blockDefinitions.map((block) => this.toScratchBlock(block)),
        menus: definitions.menus
      };
    }
    setIceMode(args) {
      this.session.setIceMode(Scratch.Cast.toString(args.MODE));
    }
    async createOffer(args) {
      await this.session.createOffer(this.peer(args.PEER));
    }
    getOffer(args) {
      return this.session.getOffer(this.peer(args.PEER));
    }
    async acceptOffer(args) {
      await this.session.acceptOffer(this.peer(args.PEER), Scratch.Cast.toString(args.CODE));
    }
    getAnswer(args) {
      return this.session.getAnswer(this.peer(args.PEER));
    }
    async acceptAnswer(args) {
      await this.session.acceptAnswer(this.peer(args.PEER), Scratch.Cast.toString(args.CODE));
    }
    sendEvent(args) {
      this.session.sendEvent(
        Scratch.Cast.toString(args.PEER),
        Scratch.Cast.toString(args.TYPE),
        Scratch.Cast.toString(args.PAYLOAD),
        Scratch.Cast.toString(args.CHANNEL)
      );
    }
    broadcastNetworkMessage(args) {
      this.session.sendEvent(
        Scratch.Cast.toString(args.PEER),
        Scratch.Cast.toString(args.MESSAGE),
        Scratch.Cast.toString(args.PAYLOAD),
        Scratch.Cast.toString(args.CHANNEL)
      );
    }
    networkMessagePayload(_args, util) {
      const message = this.networkMessageFor(util);
      return message ? JSON.stringify(message.payload) : "";
    }
    networkMessageSender(_args, util) {
      return this.networkMessageFor(util)?.from ?? "";
    }
    networkMessagePeer(_args, util) {
      return this.networkMessageFor(util)?.peer ?? "";
    }
    networkMessageChannel(_args, util) {
      return this.networkMessageFor(util)?.channel ?? "";
    }
    hasMessages() {
      return this.session.hasMessages();
    }
    messageCount() {
      return this.session.messageCount();
    }
    nextMessage() {
      return this.session.nextMessage();
    }
    lastMessage() {
      return this.session.lastMessage();
    }
    clearMessages() {
      this.session.clearMessages();
    }
    connectionState(args) {
      return this.session.connectionState(this.peer(args.PEER));
    }
    connectedPeers() {
      return JSON.stringify(this.session.connectedPeers());
    }
    closePeer(args) {
      this.session.closePeer(this.peer(args.PEER));
    }
    async syncClock(args) {
      await this.sync.syncClock(this.peer(args.PEER));
    }
    clockOffset(args) {
      return this.sync.clockOffsetUs(this.peer(args.PEER));
    }
    clockRoundTrip(args) {
      return this.sync.clockRoundTripUs(this.peer(args.PEER));
    }
    clockUncertainty(args) {
      return this.sync.clockUncertaintyUs(this.peer(args.PEER));
    }
    peerTime(args) {
      return this.sync.peerTimeUs(this.peer(args.PEER));
    }
    localTime() {
      return this.sync.localTimeUs();
    }
    frameLatency(args) {
      return this.sync.frameLatency(
        Scratch.Cast.toNumber(args.CAPTURE_US),
        Scratch.Cast.toNumber(args.PATTERN_US),
        Scratch.Cast.toNumber(args.WRAP_US),
        this.peer(args.PEER)
      );
    }
    recordFrameSyncSample(args) {
      this.sync.recordSample(
        this.camera(args.CAMERA),
        Scratch.Cast.toNumber(args.CAPTURE_US),
        Scratch.Cast.toNumber(args.PATTERN_US),
        Scratch.Cast.toNumber(args.WRAP_US),
        this.peer(args.PEER)
      );
    }
    clearFrameSyncSamples(args) {
      this.sync.clearSamples(this.camera(args.CAMERA));
    }
    frameSyncSampleCount(args) {
      return this.sync.sampleCount(this.camera(args.CAMERA));
    }
    frameSyncSummary(args) {
      const report = this.sync.localReport(this.camera(args.CAMERA));
      return report ? JSON.stringify(report) : "";
    }
    sendFrameSyncReport(args) {
      this.sync.sendReport(this.camera(args.CAMERA), this.peer(args.PEER));
    }
    frameSyncReport() {
      return this.sync.reportOverview();
    }
    frameSyncCameras() {
      return this.sync.reportCameras();
    }
    frameSyncLatencyOfCamera(args) {
      return this.sync.reportLatencyUs(this.camera(args.CAMERA));
    }
    frameSyncOffsetOfCamera(args) {
      return this.sync.reportOffsetUs(this.camera(args.CAMERA));
    }
    clearFrameSyncReport() {
      this.sync.clearReport();
    }
    peer(value) {
      return Scratch.Cast.toString(value).trim() || "peer";
    }
    camera(value) {
      return Scratch.Cast.toString(value).trim() || "camera";
    }
    startNetworkMessageHats(message) {
      this.latestNetworkMessage = message;
      this.attachNetworkMessageContext(
        Scratch.vm?.runtime?.startHats(networkMessageHatOpcode, { MESSAGE: message.type }) ?? [],
        message
      );
      if (message.type !== "*") {
        this.attachNetworkMessageContext(
          Scratch.vm?.runtime?.startHats(networkMessageHatOpcode, { MESSAGE: "*" }) ?? [],
          message
        );
      }
    }
    attachNetworkMessageContext(threads, message) {
      for (const thread of threads) {
        thread[networkMessageThreadContextKey] = message;
      }
    }
    networkMessageFor(util) {
      const threadMessage = util?.thread?.[networkMessageThreadContextKey];
      return isReceivedEnvelope(threadMessage) ? threadMessage : this.latestNetworkMessage;
    }
    toScratchBlock(block) {
      return {
        opcode: block.opcode,
        blockType: Scratch.BlockType[block.blockType],
        text: Scratch.translate(block.text),
        ...block.isEdgeActivated === void 0 ? {} : { isEdgeActivated: block.isEdgeActivated },
        arguments: Object.fromEntries(
          Object.entries(block.arguments).map(([name, argument]) => [
            name,
            {
              type: Scratch.ArgumentType[argument.type],
              defaultValue: argument.defaultValue,
              ...argument.menu === void 0 ? {} : { menu: argument.menu }
            }
          ])
        )
      };
    }
  }
  function isReceivedEnvelope(value) {
    return typeof value === "object" && value !== null && "type" in value && "payload" in value;
  }
  if (!Scratch.extensions.unsandboxed) {
    throw new Error(`${extensionConfig.name} must run unsandboxed.`);
  }
  Scratch.extensions.register(new WebRtcManualPairingExtension());

})(Scratch);
