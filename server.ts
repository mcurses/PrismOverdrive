const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });

    socket.on('update car', (data) => {
        // Handle the updated car position and broadcast to all other connected clients
        socket.broadcast.emit('update car', data);
    });
});

server.listen(3000, () => {
    console.log('Listening on port 3000');
});

