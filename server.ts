const express = require('express');
const http = require('http');
const cors = require('cors');
const WS = require('ws');

const app = express();
const server = http.createServer(app);

app.use(cors());

const wss = new WS.Server({ server });

wss.on('connection', (ws) => {
    console.log('User connected');

    ws.on('close', () => {
        console.log('User disconnected!');
    });

    ws.on('message', (data) => {
        // Relay binary message to all other connected clients
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WS.OPEN) {
                client.send(data);
            }
        });
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

server.listen(3000, () => {
    console.log('Listening on port 3000');
});

