(() => {
  // Random stuff for later
  const socket = io('https://umbrasrv.turbo.ooo')
  let roomCode = ''
  let id = ''
  let privateKey = null
  let publicKey = ''
  let otherPublicKey = ''
  let hasJoined = false
  let typing = false
  let typingTimeout
  var pingSwitch = document.getElementById('pingSwitch')
  var notifySetting = localStorage.getItem('ping')

  // Audio notifications
  pingSwitch.addEventListener('change', (event) => {
    localStorage.setItem('ping', pingSwitch.checked)
  })
  if (notifySetting === null) {
    localStorage.setItem('ping', 'false')
    pingSwitch.checked = false
  }
  if (notifySetting === 'true' || notifySetting === true) {
    pingSwitch.checked = true
  } else if (notifySetting === 'false' || notifySetting === false) {
    pingSwitch.checked = false
  }

  var markdownOptions = {
    html: false,
    xhtmlOut: false,
    breaks: true,
    linkify: true,
    linkTarget: '_blank" rel="noreferrer',
    typographer: true,
    quotes: '""\'\''
  }

  const emoji = new EmojiConvertor()
  emoji.replace_mode = 'unified'
  emoji.allow_native = true

  const md = new Remarkable('full', markdownOptions)

  // Check to make sure links are safe
  md.renderer.rules.link_open = (tokens, idx, options) => {
    var title = tokens[idx].title ? (' title="' + Remarkable.utils.escapeHtml(Remarkable.utils.replaceEntities(tokens[idx].title)) + '"') : ''
    var target = options.linkTarget ? (' target="' + options.linkTarget + '"') : ''
    return '<a rel="noreferrer" onclick="return verifyLink(this)" href="' + Remarkable.utils.escapeHtml(tokens[idx].href) + '"' + title + target + '>'
  }

  // Sanitize messages
  md.renderer.rules.text = (tokens, idx) => {
    tokens[idx].content = Remarkable.utils.escapeHtml(tokens[idx].content)
    return tokens[idx].content
  }

  const imgHostWhitelist = [
    'umbra.turbo.ooo',
    'i.imgur.com'
  ]

  // Replace direct image URLs with an embeded image
  md.renderer.rules.image = (tokens, idx, options) => {
    var src = Remarkable.utils.escapeHtml(tokens[idx].src)

    if (isWhiteListed(src)) {
      var imgSrc = ' src="' + Remarkable.utils.escapeHtml(tokens[idx].src) + '"'
      var title = tokens[idx].title ? (' title="' + Remarkable.utils.escapeHtml(Remarkable.utils.replaceEntities(tokens[idx].title)) + '"') : ''
      var alt = ' alt="' + (tokens[idx].alt ? Remarkable.utils.escapeHtml(Remarkable.utils.replaceEntities(Remarkable.utils.unescapeMd(tokens[idx].alt))) : '') + '"'
      var suffix = options.xhtmlOut ? ' /' : ''
      return `<a href="${src}" target="_blank" rel="noreferrer" onclick="return verifyLink(this)"><img${imgSrc}${alt}${title}${suffix}></a>`
    }

    return '<a href="' + src + '" target="_blank" rel="noreferrer">' + Remarkable.utils.escapeHtml(Remarkable.utils.replaceEntities(src)) + '</a>'
  }

  // A bunch of functions

  // Checks to make sure link is going to where it appears to be going
  const verifyLink = (link) => {
    var linkHref = Remarkable.utils.escapeHtml(Remarkable.utils.replaceEntities(link.href))
    if (linkHref !== link.innerHTML) {
      return confirm('Warning, please verify this is where you want to go: ' + linkHref)
    }
    return true
  }

  const getDomain = (link) => {
    var a = document.createElement('a')
    a.href = link
    return a.hostname
  }

  const isWhiteListed = (link) => {
    return imgHostWhitelist.indexOf(getDomain(link)) !== -1
  }

  // Audio notifications
  const notify = () => {
    const ping = document.getElementById('ping')
    ping.volume = 0.2
    if (pingSwitch.checked) ping.play()
  }

  // Generate random message ID for each message
  const msgID = () => {
    return `msg${crypto.getRandomValues(new Uint16Array([1]))[0].toString()}`
  }

  // Display the message
  const addMessageHTML = (id, partner, messageID, message, isStatus) => {
    document.getElementById('chatBox').innerHTML += `<div class="message${isStatus ? ' status' : ''}"><b class="id ${partner ? 'partner' : ''}">[${id}]</b> <span id="${messageID}"></span></div>`
    msg = document.getElementById(messageID)
    /* text = document.createTextNode(message)
        msg.appendChild(text)
        msg.innerHTML = msg.innerHTML.replace(/\b(http|https)(:\/\/)(\S*)\.(\w{2,4})([^\s]+)\b/ig, '<a href="$&">$&</a>') */

    // Replace PGP encrypted messages with a copy button to avoid clutter in the chat
    const pgpStart = '-----BEGIN PGP MESSAGE-----'
    const pgpEnd = '-----END PGP MESSAGE-----'

    if (message.startsWith(pgpStart)) {
      var pgpMsgID = crypto.getRandomValues(new Uint16Array([1]))[0].toString()
      setTimeout(() => {
        msg.innerHTML = `<button id="btn${pgpMsgID}" class="button">Copy PGP Message</button><textarea id="${pgpMsgID}" class="copypgp" spellcheck="false"></textarea>`
        document.getElementById(pgpMsgID).value = message
        document.getElementById(`btn${pgpMsgID}`).addEventListener('click', () => {
          document.getElementById(pgpMsgID).select()
          document.execCommand('copy')
          document.getElementById(pgpMsgID).blur()
        })
      }, 100)
    }

    // Replace emojis
    msg.innerHTML = emoji.replace_colons(md.render(message.replace(/(http|https)(:\/\/)i\.imgur\.com\/([^\s]+)\.(?:jpg|gif|png)\b/ig, '![]($&)')))
    const messages = document.getElementsByClassName('message')
    messages[messages.length - 1].scrollIntoView()
  }

  const typingFunction = () => {
    typing = false
    socket.emit('stoppedTyping', roomCode)
  }

  // Generate userID and RSA keypair
  socket.on('roomCode', (code, isRoomCreator) => {
    roomCode = code
    id = crypto.getRandomValues(new Uint16Array([1]))[0].toString()
    swal({
      icon: 'info',
      buttons: false,
      closeOnEsc: false,
      closeOnClickOutside: false,
      text: 'Generating RSA keypair. Please wait...'
    })
    setTimeout(() => {
      privateKey = cryptico.generateRSAKey(Array(32).fill().map(() => ((Math.random() * 16) | 0).toString(16)).join(''), 2048)
      publicKey = cryptico.publicKeyString(privateKey)
      swal.close()
      document.getElementById('actions').classList.add('hidden')
      document.getElementById('chat').classList.remove('hidden')
      document.getElementById('roomCode').value = roomCode
      if (!isRoomCreator) {
        socket.emit('publicKey', roomCode, id, publicKey)
        hasJoined = true
      }
      addMessageHTML('Server', false, msgID(), 'Welcome to Umbra!', true)
      addMessageHTML(id, false, msgID(), 'joined the room', true)
    }, 3000)
  })

  // Error handling
  socket.on('roomError', error => {
    if (error === 1) {
      swal({
        icon: 'error',
        dangerMode: true,
        button: 'Ok',
        text: 'No room exists with that code'
      })
    } else if (error === 2) {
      swal({
        icon: 'error',
        dangerMode: true,
        button: 'Ok',
        text: 'The room you tried to join is full!'
      })
    }
  })

  // More key exchange
  socket.on('otherPublicKey', (otherID, key) => {
    otherPublicKey = key
    if (!hasJoined) socket.emit('publicKey', roomCode, id, publicKey)
    addMessageHTML(otherID, true, msgID(), 'joined the room', true)
  })

  // Decrypt message and display it
  socket.on('chatMessage', (id, message) => {
    const decrypted = cryptico.decrypt(message, privateKey).plaintext
    addMessageHTML(id, true, msgID(), decrypted, false)
    notify()
  })

  // Display typing indicator
  socket.on('typing', (id) => {
    document.getElementById('typingIndicator').innerHTML = `<span id="typing"><p><em>${id} is typing</em></p></span>`
  })

  // Remove typing indicator
  socket.on('stoppedTyping', () => {
    document.getElementById('typingIndicator').innerHTML = ''
  })

  // Display disconnect message
  socket.on('disconnect', (roomCode, id) => {
    socket.emit('userDisconect', roomCode, id)
    addMessageHTML('Server', false, msgID(), 'You have lost connection to the server. Attempting to reconnect...', true)
  })

  socket.on('userDisconnect', (id) => {
    addMessageHTML('Server', false, msgID(), `${id} has disconnected or lost connection to the server.`, true)
  })

  // Create room button
  document.getElementById('create').addEventListener('click', () => {
    if (socket.connected) socket.emit('createRoom')
    else {
      swal({
        icon: 'error',
        dangerMode: true,
        button: 'Ok',
        text: 'Client is not connected to the server!'
      })
    }
  })

  // Join room
  document.getElementById('join').addEventListener('click', () => {
    swal({
      buttons: true,
      content: {
        element: 'input',
        attributes: {
          placeholder: 'Enter the room code',
          spellcheck: false
        }
      }
    }).then(code => {
      if (code) {
        if (/^[0-9a-f]{32}$/.test(code)) {
          if (socket.connected) socket.emit('joinRoom', code)
          else {
            swal({
              icon: 'error',
              dangerMode: true,
              button: 'Ok',
              text: 'Client is not connected to the server!'
            })
          }
        } else {
          swal({
            icon: 'error',
            dangerMode: true,
            button: 'Ok',
            text: 'Invalid room code format'
          })
        }
      }
    })
  })

  // Copy button
  document.getElementById('copyRoomCode').addEventListener('click', () => {
    document.getElementById('roomCode').select()
    document.execCommand('copy')
    document.getElementById('roomCode').blur()
  })

  // Clear messages button
  document.getElementById('clearMessages').addEventListener('click', () => {
    document.getElementById('chatBox').innerHTML = ''
  })

  document.addEventListener('keydown', e => {
  // Listen for enter key to send message
    if (e.key === 'Enter') {
      e.preventDefault()
      const chatInput = document.getElementById('chatInput')
      if (chatInput.matches(':focus') && chatInput.value) {
        const encrypted = cryptico.encrypt(chatInput.value, otherPublicKey).cipher
        socket.emit('chatMessage', roomCode, id, encrypted)
        socket.emit('stoppedTyping', roomCode)
        typing = false
        clearTimeout(typingTimeout)
        addMessageHTML(id, false, msgID(), chatInput.value, false)
        chatInput.value = ''
      }
    } else {
    // Typing indicators
      if (typing === false) {
        typing = true
        socket.emit('typing', roomCode, id)
        typingTimeout = setTimeout(typingFunction, 5000)
      } else {
        socket.emit('typing', roomCode, id)
        clearTimeout(typingTimeout)
        typingTimeout = setTimeout(typingFunction, 5000)
      }
    }
  })
})()
