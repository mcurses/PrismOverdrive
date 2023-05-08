const express = require('express');
const http = require('http');
const socketIO = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.static('public'));

const cars = {};

io.on('connection', (socket) => {
  console.log('New client connected');
  const carId = socket.id;

  cars[carId] = {
    x: 0,
    y: 0,
    rotation: Math.PI / 2,
    keys: {
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
    },
  };

  socket.emit('init', { carId, cars });

  socket.on('update', (data) => {
    cars[carId] = data;
    socket.broadcast.emit('update', { carId, data });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    delete cars[carId];
    io.emit('remove', carId);
  });
});


const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
