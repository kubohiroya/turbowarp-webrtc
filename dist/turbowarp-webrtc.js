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
  const blocks = [{ "opcode": "setIceMode", "blockType": "COMMAND", "text": "set ICE mode [MODE]", "description": "Sets whether new peer connections use LAN-only ICE or public STUN servers.", "arguments": { "MODE": { "type": "STRING", "defaultValue": "lan" } } }, { "opcode": "createOffer", "blockType": "COMMAND", "text": "create offer code for peer [PEER]", "description": "Creates a manual pairing offer code for the named peer.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "getOffer", "blockType": "REPORTER", "text": "offer code for peer [PEER]", "description": "Returns the latest offer code generated for the named peer.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "acceptOffer", "blockType": "COMMAND", "text": "accept offer code [CODE] as peer [PEER]", "description": "Accepts a peer's offer code and creates an answer code.", "arguments": { "CODE": { "type": "STRING", "defaultValue": "offer-code" }, "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "getAnswer", "blockType": "REPORTER", "text": "answer code for peer [PEER]", "description": "Returns the latest answer code generated for the named peer.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "acceptAnswer", "blockType": "COMMAND", "text": "accept answer code [CODE] for peer [PEER]", "description": "Completes pairing by accepting a peer's answer code.", "arguments": { "CODE": { "type": "STRING", "defaultValue": "answer-code" }, "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "sendEvent", "blockType": "COMMAND", "text": "send event [TYPE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]", "description": "Sends a JSON event envelope to one peer, or to all peers when PEER is *.", "arguments": { "TYPE": { "type": "STRING", "defaultValue": "door-open" }, "PAYLOAD": { "type": "STRING", "defaultValue": "{}" }, "CHANNEL": { "type": "STRING", "defaultValue": "default" }, "PEER": { "type": "STRING", "defaultValue": "*" } } }, { "opcode": "broadcastNetworkMessage", "blockType": "COMMAND", "text": "broadcast network message [MESSAGE] payload [PAYLOAD] channel [CHANNEL] to peer [PEER]", "description": "Sends a network broadcast message envelope to one peer, or to all peers when PEER is *.", "arguments": { "MESSAGE": { "type": "STRING", "defaultValue": "door-open" }, "PAYLOAD": { "type": "STRING", "defaultValue": "{}" }, "CHANNEL": { "type": "STRING", "defaultValue": "default" }, "PEER": { "type": "STRING", "defaultValue": "*" } } }, { "opcode": "whenReceiveNetworkMessage", "blockType": "EVENT", "text": "when I receive network message [MESSAGE]", "description": "Starts scripts when a matching network broadcast message is received.", "isEdgeActivated": false, "arguments": { "MESSAGE": { "type": "STRING", "defaultValue": "door-open", "menu": "networkMessages" } } }, { "opcode": "networkMessagePayload", "blockType": "REPORTER", "text": "network message payload", "description": "Returns the payload of the most recently received network broadcast message as JSON.", "arguments": {} }, { "opcode": "networkMessageSender", "blockType": "REPORTER", "text": "network message sender", "description": "Returns the sender ID of the most recently received network broadcast message.", "arguments": {} }, { "opcode": "networkMessagePeer", "blockType": "REPORTER", "text": "network message peer", "description": "Returns the local peer name that received the most recent network broadcast message.", "arguments": {} }, { "opcode": "networkMessageChannel", "blockType": "REPORTER", "text": "network message channel", "description": "Returns the channel of the most recently received network broadcast message.", "arguments": {} }, { "opcode": "hasMessages", "blockType": "BOOLEAN", "text": "has received messages?", "description": "Reports whether the receive queue contains at least one message.", "arguments": {} }, { "opcode": "messageCount", "blockType": "REPORTER", "text": "received message count", "description": "Returns the number of messages currently waiting in the receive queue.", "arguments": {} }, { "opcode": "nextMessage", "blockType": "REPORTER", "text": "next received message", "description": "Removes and returns the oldest received message as JSON.", "arguments": {} }, { "opcode": "lastMessage", "blockType": "REPORTER", "text": "last received message", "description": "Returns the most recent received message as JSON without removing it.", "arguments": {} }, { "opcode": "clearMessages", "blockType": "COMMAND", "text": "clear received messages", "description": "Clears the receive queue.", "arguments": {} }, { "opcode": "connectionState", "blockType": "REPORTER", "text": "connection state of peer [PEER]", "description": "Returns the WebRTC connection state for the named peer.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }, { "opcode": "connectedPeers", "blockType": "REPORTER", "text": "connected peers", "description": "Returns a JSON array of connected peer names.", "arguments": {} }, { "opcode": "closePeer", "blockType": "COMMAND", "text": "close peer [PEER]", "description": "Closes and removes a peer connection.", "arguments": { "PEER": { "type": "STRING", "defaultValue": "peer-a" } } }];
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
  const blockDefinitions = definitions.blocks;
  const networkMessageHatOpcode = `${extensionConfig.id}_whenReceiveNetworkMessage`;
  const networkMessageThreadContextKey = "__turbowarpWebRtcNetworkMessage";
  class WebRtcManualPairingExtension {
    constructor(session = new ManualPeerSession()) {
      this.session = session;
      this.session.setMessageHandler((message) => this.startNetworkMessageHats(message));
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
    peer(value) {
      return Scratch.Cast.toString(value).trim() || "peer";
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
