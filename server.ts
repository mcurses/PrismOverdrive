const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
// const io = socketIo(server);
const io = require('socket.io')(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
        allowedHeaders: ["my-custom-header"],
        credentials: true
    }
});

// app.use(express.static('dist'));
app.use(cors());

let aliveRequests = {}
io.on('connection', (socket) => {
    console.log('User connected');

    // send alive message to clients every 5 seconds
    setInterval(() => {
        socket.emit('alive', 'alive');
    }, 5000);

    socket.on('disconnect', () => {
        console.log('User disconnected!');
        socket.broadcast.emit('remove player', socket.id);
    });

    socket.on('alive', () => {
        console.log('alive')
    });

    socket.on('update car', (data) => {
        // Handle the updated car position and broadcast to all other connected clients
        // console.log('Update car position to: ');
        socket.broadcast.emit('update car', data);
    });
});

server.listen(3000, () => {
    console.log('Listening on port 3000');
});

