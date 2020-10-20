const io = require('socket.io')(1337)
console.log('Umbra Server has been started!')
io.on('connection', socket => {
  socket.on('createRoom', () => {
    // Generate random room code and join it
    const roomCode = Array(32).fill().map(() => ((Math.random() * 16) | 0).toString(16)).join('')
    socket.join(roomCode)
    socket.emit('roomCode', roomCode, true)
  })

  socket.on('joinRoom', roomCode => {
    // Check if room exists and if so join it
    if (io.sockets.adapter.rooms[roomCode]) {
      if (io.sockets.adapter.rooms[roomCode].length === 1) {
        socket.join(roomCode)
        socket.emit('roomCode', roomCode, false)
      } else socket.emit('roomError', 2)
    } else socket.emit('roomError', 1)
  })

  socket.on('publicKey', (roomCode, id, publicKey) => {
    // Exchange public key with other user
    socket.broadcast.to(roomCode).emit('otherPublicKey', id, publicKey)
  })

  socket.on('chatMessage', (roomCode, id, message) => {
    // Sends message
    socket.broadcast.to(roomCode).emit('chatMessage', id, message)
  })

  socket.on('typing', (roomCode, id) => {
    // Displays typing indicator
    socket.broadcast.to(roomCode).emit('typing', id)
  })

  socket.on('stoppedTyping', (roomCode) => {
    // Removes typing indicator
    socket.broadcast.to(roomCode).emit('stoppedTyping')
  })

  // Broadcast 'user disconnected' messages
  socket.on('disconnect', (roomCode, id) => {
    socket.broadcast.to(roomCode).emit('userDisconnect', id)
  })

  socket.on('userDisconnect', (roomCode, id) => {
    socket.broadcast.to(roomCode).emit('userDisconnect', id)
  })
})
