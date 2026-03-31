var process = require("process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const { URL } = require("url");

// Handle SIGINT
process.on("SIGINT", () => {
  console.info("SIGINT Received, exiting...");
  process.exit(0);
});

// Handle SIGTERM
process.on("SIGTERM", () => {
  console.info("SIGTERM Received, exiting...");
  process.exit(0);
});

const parser = require("ua-parser-js");
const {
  uniqueNamesGenerator,
  animals,
  colors,
} = require("unique-names-generator");

const CLIENT_DIR = path.resolve(__dirname, "../client");
const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
};

class SnapdropServer {
  constructor(port) {
    const WebSocket = require("ws");
    this._server = http.createServer((request, response) =>
      this._handleHttp(request, response),
    );
    this._wss = new WebSocket.Server({ noServer: true });
    this._wss.on("connection", (socket, request) =>
      this._onConnection(new Peer(socket, request)),
    );
    this._wss.on("headers", (headers, response) =>
      this._onHeaders(headers, response),
    );
    this._server.on("upgrade", (request, socket, head) =>
      this._handleUpgrade(request, socket, head),
    );

    this._rooms = {};

    this._server.listen(port, () => {
      console.log("Snapdrop is running on port", port);
    });
  }

  _handleHttp(request, response) {
    const requestUrl = new URL(request.url, "http://localhost");
    if (requestUrl.pathname.startsWith("/server")) {
      response.writeHead(426, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Upgrade Required");
      return;
    }

    this._serveAsset(requestUrl.pathname, response);
  }

  _handleUpgrade(request, socket, head) {
    const requestUrl = new URL(request.url, "http://localhost");
    if (!requestUrl.pathname.startsWith("/server")) {
      socket.destroy();
      return;
    }

    this._wss.handleUpgrade(request, socket, head, (ws) => {
      this._wss.emit("connection", ws, request);
    });
  }

  _serveAsset(requestPath, response) {
    let relativePath = requestPath === "/" ? "/index.html" : requestPath;
    try {
      relativePath = decodeURIComponent(relativePath);
    } catch (error) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Bad Request");
      return;
    }

    const filePath = path.resolve(CLIENT_DIR, `.${relativePath}`);
    if (!filePath.startsWith(CLIENT_DIR)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    const hasExtension = path.extname(filePath) !== "";
    const fallbackPath = path.join(CLIENT_DIR, "index.html");
    const selectedPath =
      fs.existsSync(filePath) && fs.statSync(filePath).isFile()
        ? filePath
        : !hasExtension
          ? fallbackPath
          : null;

    if (!selectedPath) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not Found");
      return;
    }

    const extension = path.extname(selectedPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(selectedPath).pipe(response);
  }

  _onConnection(peer) {
    this._joinRoom(peer);
    peer.socket.on("message", (message) => this._onMessage(peer, message));
    peer.socket.on("error", console.error);
    this._keepAlive(peer);

    this._send(peer, {
      type: "display-name",
      message: {
        displayName: peer.name.displayName,
        deviceName: peer.name.deviceName,
      },
    });
  }

  _onHeaders(headers, response) {
    const cookies = response.headers.cookie || "";
    if (cookies.indexOf("peerid=") > -1) return;
    response.peerId = Peer.uuid();
    const forwardedProto = response.headers["x-forwarded-proto"];
    const isSecure =
      forwardedProto === "https" || response.connection.encrypted;
    const cookieFlags = ["SameSite=Strict"];
    if (isSecure) cookieFlags.push("Secure");
    headers.push(
      `Set-Cookie: peerid=${response.peerId}; ${cookieFlags.join("; ")}`,
    );
  }

  _onMessage(sender, message) {
    try {
      message = JSON.parse(message);
    } catch (e) {
      return;
    }

    switch (message.type) {
      case "disconnect":
        this._leaveRoom(sender);
        break;
      case "pong":
        sender.lastBeat = Date.now();
        break;
    }

    if (message.to && this._rooms[sender.ip]) {
      const recipientId = message.to;
      const recipient = this._rooms[sender.ip][recipientId];
      delete message.to;
      message.sender = sender.id;
      this._send(recipient, message);
      return;
    }
  }

  _joinRoom(peer) {
    if (!this._rooms[peer.ip]) {
      this._rooms[peer.ip] = {};
    }

    for (const otherPeerId in this._rooms[peer.ip]) {
      const otherPeer = this._rooms[peer.ip][otherPeerId];
      this._send(otherPeer, {
        type: "peer-joined",
        peer: peer.getInfo(),
      });
    }

    const otherPeers = [];
    for (const otherPeerId in this._rooms[peer.ip]) {
      otherPeers.push(this._rooms[peer.ip][otherPeerId].getInfo());
    }

    this._send(peer, {
      type: "peers",
      peers: otherPeers,
    });

    this._rooms[peer.ip][peer.id] = peer;
  }

  _leaveRoom(peer) {
    if (!this._rooms[peer.ip] || !this._rooms[peer.ip][peer.id]) return;
    this._cancelKeepAlive(this._rooms[peer.ip][peer.id]);

    delete this._rooms[peer.ip][peer.id];

    peer.socket.terminate();
    if (!Object.keys(this._rooms[peer.ip]).length) {
      delete this._rooms[peer.ip];
    } else {
      for (const otherPeerId in this._rooms[peer.ip]) {
        const otherPeer = this._rooms[peer.ip][otherPeerId];
        this._send(otherPeer, { type: "peer-left", peerId: peer.id });
      }
    }
  }

  _send(peer, message) {
    if (!peer) return;
    if (this._wss.readyState !== this._wss.OPEN) return;
    message = JSON.stringify(message);
    peer.socket.send(message, (error) => "");
  }

  _keepAlive(peer) {
    this._cancelKeepAlive(peer);
    var timeout = 30000;
    if (!peer.lastBeat) {
      peer.lastBeat = Date.now();
    }
    if (Date.now() - peer.lastBeat > 2 * timeout) {
      this._leaveRoom(peer);
      return;
    }

    this._send(peer, { type: "ping" });

    peer.timerId = setTimeout(() => this._keepAlive(peer), timeout);
  }

  _cancelKeepAlive(peer) {
    if (peer && peer.timerId) {
      clearTimeout(peer.timerId);
    }
  }
}

class Peer {
  constructor(socket, request) {
    this.socket = socket;

    this._setIP(request);
    this._setPeerId(request);
    this.rtcSupported = request.url.indexOf("webrtc") > -1;
    this._setName(request);
    this.timerId = 0;
    this.lastBeat = Date.now();
  }

  _setIP(request) {
    if (request.headers["x-forwarded-for"]) {
      this.ip = request.headers["x-forwarded-for"].split(/\s*,\s*/)[0];
    } else {
      this.ip = request.socket.remoteAddress;
    }
    if (this.ip == "::1" || this.ip == "::ffff:127.0.0.1") {
      this.ip = "127.0.0.1";
    }
  }

  _setPeerId(request) {
    if (request.peerId) {
      this.id = request.peerId;
      return;
    }

    const cookieHeader = request.headers.cookie || "";
    const match = cookieHeader.match(/(?:^|;\s*)peerid=([^;]+)/);
    this.id = match ? match[1] : Peer.uuid();
  }

  toString() {
    return `<Peer id=${this.id} ip=${this.ip} rtcSupported=${this.rtcSupported}>`;
  }

  _setName(req) {
    let ua = parser(req.headers["user-agent"]);
    let deviceName = "";

    if (ua.os && ua.os.name) {
      deviceName = ua.os.name.replace("Mac OS", "Mac") + " ";
    }

    if (ua.device.model) {
      deviceName += ua.device.model;
    } else {
      deviceName += ua.browser.name;
    }

    if (!deviceName) deviceName = "Unknown Device";

    const displayName = uniqueNamesGenerator({
      length: 2,
      separator: " ",
      dictionaries: [colors, animals],
      style: "capital",
      seed: this.id.hashCode(),
    });

    this.name = {
      model: ua.device.model,
      os: ua.os.name,
      browser: ua.browser.name,
      type: ua.device.type,
      deviceName,
      displayName,
    };
  }

  getInfo() {
    return {
      id: this.id,
      name: this.name,
      rtcSupported: this.rtcSupported,
    };
  }

  static uuid() {
    let uuid = "",
      ii;
    for (ii = 0; ii < 32; ii += 1) {
      switch (ii) {
        case 8:
        case 20:
          uuid += "-";
          uuid += ((Math.random() * 16) | 0).toString(16);
          break;
        case 12:
          uuid += "-";
          uuid += "4";
          break;
        case 16:
          uuid += "-";
          uuid += ((Math.random() * 4) | 8).toString(16);
          break;
        default:
          uuid += ((Math.random() * 16) | 0).toString(16);
      }
    }
    return uuid;
  }
}

Object.defineProperty(String.prototype, "hashCode", {
  value: function () {
    var hash = 0,
      i,
      chr;
    for (i = 0; i < this.length; i++) {
      chr = this.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    return hash;
  },
});

const server = new SnapdropServer(process.env.PORT || 3000);
