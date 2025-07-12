// Constants
const CHUNK_SIZE = 16384; // 16KB chunks
const DB_NAME = 'webrtc_chat_db';
const DB_VERSION = 1;
const MESSAGES_STORE = 'messages';
const FILES_STORE = 'files';
const PEERS_STORE = 'peers';
const TYPING_TIMEOUT = 3000;
const RECONNECT_TIMEOUT = 5000;
const MAX_RECONNECT_ATTEMPTS = 3;

// Message Types
const MESSAGE_TYPES = {
    TEXT: 'text',
    FILE: 'file',
    TYPING: 'typing',
    STATUS: 'status',
    FILE_CHUNK: 'file_chunk',
    FILE_REQUEST: 'file_request',
    FILE_COMPLETE: 'file_complete'
};

// DOM Elements
const elements = {
    myPeerId: document.getElementById('my-peer-id'),
    peerSearch: document.getElementById('peer-search'),
    contactsList: document.getElementById('contacts-list'),
    welcomeScreen: document.getElementById('welcome-screen'),
    chatInterface: document.getElementById('chat-interface'),
    messagesContainer: document.getElementById('messages-container'),
    messageInput: document.getElementById('message-input'),
    sendMessage: document.getElementById('send-message'),
    attachFile: document.getElementById('attach-file'),
    fileInput: document.getElementById('file-input'),
    menuToggle: document.getElementById('menu-toggle'),
    sidebar: document.getElementById('sidebar'),
    activePeerId: document.getElementById('active-peer-id'),
    peerStatus: document.getElementById('peer-status'),
    typingIndicator: document.getElementById('typing-indicator'),
    transferProgress: document.getElementById('transfer-progress'),
    progressBar: document.getElementById('progress-bar'),
    transferFilename: document.getElementById('transfer-filename'),
    transferStatus: document.getElementById('transfer-status'),
    notifications: document.getElementById('notifications'),
    themeToggle: document.getElementById('theme-toggle'),
    shareId: document.getElementById('share-id')
};

// State
let peer = null;
let connections = new Map();
let db = null;
let currentTheme = localStorage.getItem('theme') || 'light';
let typingTimeout = null;
let fileChunks = new Map();
let transferInProgress = false;
let reconnectAttempts = new Map();

// Initialize IndexedDB
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;

            // Create messages store
            if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
                const messagesStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id', autoIncrement: true });
                messagesStore.createIndex('peerId', 'peerId', { unique: false });
                messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
            }

            // Create files store
            if (!db.objectStoreNames.contains(FILES_STORE)) {
                const filesStore = db.createObjectStore(FILES_STORE, { keyPath: 'id' });
                filesStore.createIndex('peerId', 'peerId', { unique: false });
            }

            // Create peers store
            if (!db.objectStoreNames.contains(PEERS_STORE)) {
                db.createObjectStore(PEERS_STORE, { keyPath: 'id' });
            }
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
    });
}

// Initialize PeerJS
function initPeerJS() {
    peer = new Peer({
        debug: 2,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    });

    peer.on('open', (id) => {
        elements.myPeerId.textContent = id;
        showNotification('Connected to server', 'success');
    });

    peer.on('connection', handleIncomingConnection);

    peer.on('error', (error) => {
        console.error('PeerJS Error:', error);
        showNotification('Connection error: ' + error.message, 'error');
    });

    peer.on('disconnected', () => {
        showNotification('Disconnected from server', 'error');
        setTimeout(() => {
            if (peer && !peer.destroyed) {
                peer.reconnect();
            }
        }, RECONNECT_TIMEOUT);
    });
}

// Handle incoming connection
function handleIncomingConnection(conn) {
    console.log('Incoming connection from:', conn.peer);
    setupConnection(conn);
}

// Setup connection handlers
function setupConnection(conn) {
    connections.set(conn.peer, conn);

    conn.on('open', () => {
        console.log('Connection opened with:', conn.peer);
        updatePeerStatus(conn.peer, true);
        addToRecentPeers(conn.peer);
    });

    conn.on('data', handleIncomingData);

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        updatePeerStatus(conn.peer, false);
        connections.delete(conn.peer);
    });

    conn.on('error', (error) => {
        console.error('Connection error:', error);
        showNotification('Connection error with peer', 'error');
        handleReconnection(conn.peer);
    });
}

// Handle incoming data
async function handleIncomingData(data) {
    try {
        switch (data.type) {
            case MESSAGE_TYPES.TEXT:
                await handleTextMessage(data);
                break;
            case MESSAGE_TYPES.FILE:
                await handleFileMessage(data);
                break;
            case MESSAGE_TYPES.FILE_CHUNK:
                await handleFileChunk(data);
                break;
            case MESSAGE_TYPES.FILE_REQUEST:
                await handleFileRequest(data);
                break;
            case MESSAGE_TYPES.FILE_COMPLETE:
                await handleFileComplete(data);
                break;
            case MESSAGE_TYPES.TYPING:
                handleTypingIndicator(data);
                break;
            case MESSAGE_TYPES.STATUS:
                handleStatusUpdate(data);
                break;
        }
    } catch (error) {
        console.error('Error handling incoming data:', error);
        showNotification('Error processing received data', 'error');
    }
}

// Handle text message
async function handleTextMessage(data) {
    await addMessageToChat(data, false);
    await storeMessage(data);
}

// Handle file message
async function handleFileMessage(data) {
    fileChunks.set(data.fileId, {
        chunks: [],
        info: data
    });
    await addMessageToChat(data, false);
}

// Handle file chunk
async function handleFileChunk(data) {
    const fileTransfer = fileChunks.get(data.fileId);
    if (fileTransfer) {
        fileTransfer.chunks[data.index] = data.chunk;
        updateTransferProgress(data.fileId, data.index, data.totalChunks);
    }
}

// Handle file request
async function handleFileRequest(data) {
    const file = await getFileFromStore(data.fileId);
    if (file) {
        sendFileInChunks(file, data.peerId);
    }
}

// Handle file complete
async function handleFileComplete(data) {
    const fileTransfer = fileChunks.get(data.fileId);
    if (fileTransfer) {
        const blob = new Blob(fileTransfer.chunks);
        await storeFile(data.fileId, blob, fileTransfer.info);
        fileChunks.delete(data.fileId);
        updateFileMessage(data.fileId, true);
    }
}

// Send text message
async function sendTextMessage(text) {
    if (!text.trim()) return;

    const message = {
        id: generateId(),
        type: MESSAGE_TYPES.TEXT,
        content: text,
        sender: peer.id,
        timestamp: Date.now()
    };

    const activePeer = getActivePeer();
    if (activePeer && connections.has(activePeer)) {
        const conn = connections.get(activePeer);
        if (conn.open) {
            conn.send(message);
            await addMessageToChat(message, true);
            await storeMessage(message);
            elements.messageInput.value = '';
        }
    }
}

// Send file
async function sendFile(file) {
    if (transferInProgress) {
        showNotification('File transfer already in progress', 'error');
        return;
    }

    const fileId = generateId();
    const fileInfo = {
        id: fileId,
        type: MESSAGE_TYPES.FILE,
        name: file.name,
        size: file.size,
        mimeType: file.type,
        sender: peer.id,
        timestamp: Date.now()
    };

    const activePeer = getActivePeer();
    if (activePeer && connections.has(activePeer)) {
        const conn = connections.get(activePeer);
        if (conn.open) {
            transferInProgress = true;
            showTransferProgress(file.name);
            
            try {
                conn.send(fileInfo);
                await addMessageToChat(fileInfo, true);
                await sendFileInChunks(file, activePeer);
            } catch (error) {
                console.error('Error sending file:', error);
                showNotification('Error sending file', 'error');
            } finally {
                transferInProgress = false;
                hideTransferProgress();
            }
        }
    }
}

// Send file in chunks
async function sendFileInChunks(file, peerId) {
    const conn = connections.get(peerId);
    if (!conn || !conn.open) return;

    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    const reader = new FileReader();
    let index = 0;

    reader.onload = async (e) => {
        const chunk = e.target.result;
        conn.send({
            type: MESSAGE_TYPES.FILE_CHUNK,
            fileId: file.id,
            index: index,
            totalChunks: chunks,
            chunk: chunk
        });

        updateTransferProgress(file.id, index, chunks);
        index++;

        if (index < chunks) {
            readNextChunk();
        } else {
            conn.send({
                type: MESSAGE_TYPES.FILE_COMPLETE,
                fileId: file.id
            });
        }
    };

    function readNextChunk() {
        const start = index * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        reader.readAsArrayBuffer(file.slice(start, end));
    }

    readNextChunk();
}

// UI Functions
function addMessageToChat(message, isOutgoing) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${isOutgoing ? 'outgoing' : 'incoming'}`;
    messageElement.dataset.messageId = message.id;

    let content = '';
    if (message.type === MESSAGE_TYPES.TEXT) {
        content = `<div class="message-content">${escapeHtml(message.content)}</div>`;
    } else if (message.type === MESSAGE_TYPES.FILE) {
        content = createFileMessageContent(message);
    }

    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    messageElement.innerHTML = `
        ${content}
        <div class="message-time">${time}</div>
    `;

    elements.messagesContainer.appendChild(messageElement);
    scrollToBottom();
}

function createFileMessageContent(fileInfo) {
    return `
        <div class="file-message">
            <span class="material-icons">${getFileIcon(fileInfo.mimeType)}</span>
            <div class="file-info">
                <div class="file-name">${escapeHtml(fileInfo.name)}</div>
                <div class="file-size">${formatFileSize(fileInfo.size)}</div>
            </div>
            ${fileInfo.complete ? 
                '<span class="material-icons">done</span>' : 
                '<button class="download-button" onclick="downloadFile(\'' + fileInfo.id + '\')">Download</button>'
            }
        </div>
    `;
}

// Utility Functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'movie';
    if (mimeType.startsWith('audio/')) return 'audiotrack';
    if (mimeType.includes('pdf')) return 'picture_as_pdf';
    return 'insert_drive_file';
}

function scrollToBottom() {
    elements.messagesContainer.scrollTop = elements.messagesContainer.scrollHeight;
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    elements.notifications.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
}

// Event Listeners
function initEventListeners() {
    // Send message
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendTextMessage(elements.messageInput.value);
        }
    });

    elements.sendMessage.addEventListener('click', () => {
        sendTextMessage(elements.messageInput.value);
    });

    // File attachment
    elements.attachFile.addEventListener('click', () => {
        elements.fileInput.click();
    });

    elements.fileInput.addEventListener('change', async (e) => {
        const files = e.target.files;
        if (files.length > 0) {
            try {
                await sendFile(files[0]);
            } catch (error) {
                console.error('Error sending file:', error);
                showNotification('Error sending file', 'error');
            }
        }
        e.target.value = '';
    });

    // Peer search
    elements.peerSearch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const peerId = elements.peerSearch.value.trim();
            if (peerId && peerId !== peer.id) {
                connectToPeer(peerId);
            }
        }
    });

    // Mobile menu toggle
    elements.menuToggle.addEventListener('click', () => {
        elements.sidebar.classList.toggle('active');
    });

    // Theme toggle
    elements.themeToggle.addEventListener('click', toggleTheme);

    // Share ID
    elements.shareId.addEventListener('click', shareId);
}

// Theme handling
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
}

// Initialize the application
async function init() {
    try {
        await initIndexedDB();
        initPeerJS();
        initEventListeners();
        document.documentElement.setAttribute('data-theme', currentTheme);
    } catch (error) {
        console.error('Initialization error:', error);
        showNotification('Failed to initialize application', 'error');
    }
}

// Start the application
init(); 