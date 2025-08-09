const express = require('express');
const http = require('http');
const cors = require('cors');
const WS = require('ws');
const protobuf = require('protobufjs');
const { performance: perfHooks } = require('perf_hooks');

const app = express();
const server = http.createServer(app);

app.use(cors());

const wss = new WS.Server({ server });

let PlayerState = null;
const seqMap = new Map(); // WebSocket -> sequence number

// Load protobuf schema
protobuf.load(require('path').join(__dirname, 'src', 'assets', 'player.proto'), (err, root) => {
    if (err) {
        console.error("Failed to load protobuf:", err);
        process.exit(1);
    }
    PlayerState = root.lookupType("PlayerState");
    console.log("Protobuf loaded successfully");
    console.log('has stamps:', !!PlayerState.fields.stamps);
});

wss.on('connection', (ws) => {
    console.log('User connected');
    seqMap.set(ws, 0); // Initialize sequence counter

    ws.on('close', () => {
        console.log('User disconnected!');
        seqMap.delete(ws);
    });

    ws.on('message', (data) => {
        if (!PlayerState) {
            console.error("PlayerState not loaded yet");
            return;
        }

        try {
            // Decode incoming message
            const buffer = new Uint8Array(data);
            const message = PlayerState.decode(buffer);
            const playerState = PlayerState.toObject(message, {
                longs: String,
                enums: String,
                bytes: String,
            });

            console.log('server IN stamps:', (playerState.stamps?.length || 0));

            // Stamp with server time and sequence
            const tServerMs = Math.floor(perfHooks.now());
            const seq = seqMap.get(ws) + 1;
            seqMap.set(ws, seq);

            playerState.tServerMs = tServerMs;
            playerState.seq = seq;

            console.log('server OUT stamps:', (playerState.stamps?.length || 0), 'seq', seq);

            // Re-encode and broadcast to ALL clients (including sender)
            const stampedMessage = PlayerState.create(playerState);
            const stampedBuffer = PlayerState.encode(stampedMessage).finish();

            wss.clients.forEach((client) => {
                if (client.readyState === WS.OPEN) {
                    client.send(stampedBuffer);
                }
            });
        } catch (error) {
            console.error('Error processing message:', error);
            // Drop the packet, don't crash
        }
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

server.listen(3000, () => {
    console.log('Listening on port 3000');
});

