// Constants
const CHUNK_SIZE = 16384; // 16KB chunks
const DB_NAME = 'fileTransferDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const MAX_CHUNK_RETRIES = 3;
const CHUNK_TIMEOUT = 15000; // 15 seconds timeout
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000; // 1 second between retries

// Constants for file transfer
const MAX_RETRIES = 3;
const TRANSFER_STATES = {
    WAITING: 'waiting',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed'
};

// Constants for file transfer
const MAX_FILE_SIZE = 2147483648; // 2GB max file size
const MIN_CHUNK_SIZE = 8192; // 8KB minimum chunk size
const CONNECTION_CHECK_INTERVAL = 5000; // 5 seconds

// File type restrictions
const ALLOWED_FILE_TYPES = new Set([
    'image/',
    'video/',
    'audio/',
    'text/',
    'application/pdf',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.openxmlformats-officedocument',
    'application/msword',
    'application/vnd.ms-excel',
    'application/vnd.ms-powerpoint'
]);

// DOM Elements
const elements = {
    peerId: document.getElementById('peer-id'),
    copyId: document.getElementById('copy-id'),
    remotePeerId: document.getElementById('remote-peer-id'),
    connectButton: document.getElementById('connect-button'),
    fileInput: document.getElementById('file-input'),
    dropZone: document.getElementById('drop-zone'),
    transferProgress: document.getElementById('transfer-progress'),
    progress: document.getElementById('progress'),
    progressText: document.getElementById('progress-text'),
    transferInfo: document.getElementById('transfer-info'),
    fileList: document.getElementById('file-list'),
    statusText: document.getElementById('status-text'),
    statusDot: document.getElementById('status-dot'),
    browserSupport: document.getElementById('browser-support'),
    fileTransferSection: document.getElementById('file-transfer-section'),
    qrcode: document.getElementById('qrcode'),
    receivedFiles: document.getElementById('received-files'),
    notifications: document.getElementById('notifications'),
    sentFilesList: document.getElementById('sent-files-list'),
    receivedFilesList: document.getElementById('received-files-list'),
    recentPeers: document.getElementById('recent-peers'),
    recentPeersList: document.getElementById('recent-peers-list'),
    clearPeers: document.getElementById('clear-peers'),
    shareId: document.getElementById('share-id')
};

// State
let peer = null;
let connections = new Map(); // Map to store multiple connections
let db = null;
let transferInProgress = false;
let isConnectionReady = false;
let fileChunks = {}; // Initialize fileChunks object
let peerCount = 0;
let currentTransfer = null;

// Add file history tracking with Sets for uniqueness
const fileHistory = {
    sent: new Set(),
    received: new Set()
};

// Add recent peers tracking
let recentPeers = [];
const MAX_RECENT_PEERS = 5;

// Load recent peers from localStorage
function loadRecentPeers() {
    try {
        const saved = localStorage.getItem('recentPeers');
        if (saved) {
            recentPeers = JSON.parse(saved);
            updateRecentPeersList();
        }
    } catch (error) {
        console.error('Error loading recent peers:', error);
    }
}

// Save recent peers to localStorage
function saveRecentPeers() {
    try {
        localStorage.setItem('recentPeers', JSON.stringify(recentPeers));
    } catch (error) {
        console.error('Error saving recent peers:', error);
    }
}

// Add a peer to recent peers list
function addRecentPeer(peerId) {
    const existingIndex = recentPeers.indexOf(peerId);
    if (existingIndex !== -1) {
        recentPeers.splice(existingIndex, 1);
    }
    recentPeers.unshift(peerId);
    if (recentPeers.length > MAX_RECENT_PEERS) {
        recentPeers.pop();
    }
    saveRecentPeers();
    updateRecentPeersList();
}

// Update the recent peers list UI
function updateRecentPeersList() {
    elements.recentPeersList.innerHTML = '';
    recentPeers.forEach(peerId => {
        const li = document.createElement('li');
        const icon = document.createElement('span');
        icon.className = 'material-icons';
        icon.textContent = 'person';
        li.appendChild(icon);
        li.appendChild(document.createTextNode(peerId));
        li.onclick = () => {
            elements.remotePeerId.value = peerId;
            elements.recentPeers.classList.add('hidden');
            elements.connectButton.click();
        };
        elements.recentPeersList.appendChild(li);
    });
}

// Check WebRTC Support
function checkBrowserSupport() {
    if (!window.RTCPeerConnection || !navigator.mediaDevices) {
        elements.browserSupport.classList.remove('hidden');
        return false;
    }
    return true;
}

// Initialize IndexedDB
async function initIndexedDB() {
    try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = (event) => {
            showNotification('IndexedDB initialization failed', 'error');
        };

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
        };
    } catch (error) {
        console.error('IndexedDB Error:', error);
        showNotification('Storage initialization failed', 'error');
    }
}

// Generate QR Code
function generateQRCode(peerId) {
    try {
        if (!elements.qrcode) return;
        elements.qrcode.innerHTML = ''; // Clear previous QR code
        
        // Generate URL with peer ID as query parameter
        const baseUrl = window.location.origin + window.location.pathname;
        const qrUrl = `${baseUrl}?peer=${peerId}`;
        
        new QRCode(elements.qrcode, {
            text: qrUrl,
            width: 128,
            height: 128,
            colorDark: '#2196F3',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });

        // Make QR code clickable for sharing on mobile
        elements.qrcode.style.cursor = 'pointer';
        elements.qrcode.title = 'Click to share';
        elements.qrcode.onclick = async () => {
            if (navigator.share) {
                try {
                    await navigator.share({
                        url: qrUrl
                    });
                } catch (error) {
                    if (error.name !== 'AbortError') {
                        console.error('Error sharing:', error);
                    }
                }
            }
        };
    } catch (error) {
        console.error('QR Code Generation Error:', error);
    }
}

// Check URL for peer ID on load
function checkUrlForPeerId() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        const peerId = urlParams.get('peer');
        
        if (peerId && peerId.length > 0) {
            elements.remotePeerId.value = peerId;
            // Wait a bit for PeerJS to initialize
            setTimeout(() => {
                elements.connectButton.click();
            }, 1500);
        } else {
            // Clear the remote peer ID field if no peer ID in URL
            elements.remotePeerId.value = '';
        }

        // Clear the URL parameters after processing
        if (window.history && window.history.replaceState) {
            const newUrl = window.location.pathname;
            window.history.replaceState({}, document.title, newUrl);
        }
    } catch (error) {
        console.error('Error parsing URL parameters:', error);
        // Clear the field in case of error
        elements.remotePeerId.value = '';
    }
}

// Store sent files for later download
const sentFilesStore = new Map();

// Add global file history management
const globalFileHistory = new Map();

// Broadcast file info to all peers
function broadcastFileInfo(fileInfo, type) {
    // Don't broadcast if we're not the host
    if (!peer || !peer.id || peer.id !== hostId) return;
    
    for (const [peerId, conn] of connections) {
        if (conn && conn.open) {
            conn.send({
                type: 'file-broadcast',
                fileInfo: {
                    ...fileInfo,
                    originalSender: peer.id
                },
                historyType: type
            });
        }
    }
}

// Handle file broadcast reception
function handleFileBroadcast(data) {
    const { fileInfo, historyType } = data;
    
    // Add to global file history if not exists
    const fileId = fileInfo.id;
    if (!globalFileHistory.has(fileId)) {
        globalFileHistory.set(fileId, {
            ...fileInfo,
            type: historyType
        });
        
        // Update UI for the broadcasted file
        updateFilesList(
            historyType === 'sent' ? elements.sentFilesList : elements.receivedFilesList,
            fileInfo,
            historyType
        );
    }
}

// Update addFileToHistory to broadcast files
function addFileToHistory(file, type, url = null) {
    const fileId = generateFileId(file);
    const fileInfo = {
        id: fileId,
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        timestamp: new Date().toISOString(),
        url: url
    };

    // Add to local history if not exists
    if (!fileHistory[type].has(fileId)) {
        fileHistory[type].add(fileId);
        updateFilesList(
            type === 'sent' ? elements.sentFilesList : elements.receivedFilesList,
            fileInfo,
            type
        );

        // Add to global history
        globalFileHistory.set(fileId, {
            ...fileInfo,
            type: type
        });

        // Broadcast file info to all peers
        broadcastFileInfo(fileInfo, type);
    }
}

// Update connection handler to include file broadcast handling
function handleConnection(conn) {
    connections.set(conn.peer, conn);
    updatePeerCount();

    conn.on('data', async (data) => {
        try {
            switch (data.type) {
                case 'file-header':
                    // ... existing code ...
                    break;
                case 'file-chunk':
                    await handleFileChunk(data);
                    break;
                case 'file-complete':
                    await handleFileComplete(data);
                    break;
                case 'file-broadcast':
                    handleFileBroadcast(data);
                    break;
                case 'request-chunk':
                    // Handle chunk request
                    if (currentTransfer && currentTransfer.file) {
                        const { file } = currentTransfer;
                        const start = data.chunkIndex * CHUNK_SIZE;
                        const end = Math.min(start + CHUNK_SIZE, file.size);
                        const chunk = await readFileChunk(file, start, end);
                        
                        conn.send({
                            type: 'file-chunk',
                            name: file.name,
                            size: file.size,
                            chunkIndex: data.chunkIndex,
                            data: chunk,
                            offset: start
                        });
                    }
                    break;
            }
        } catch (error) {
            console.error('Error handling data:', error);
            showNotification('Error processing received data', 'error');
        }
    });

    // Send existing file history to new peer
    if (peer.id === hostId) {
        globalFileHistory.forEach((fileInfo, fileId) => {
            conn.send({
                type: 'file-broadcast',
                fileInfo: fileInfo,
                historyType: fileInfo.type
            });
        });
    }

    conn.on('close', () => {
        connections.delete(conn.peer);
        updatePeerCount();
    });
}

// Update peer initialization to handle host status
let hostId = null;

function initializePeer() {
    peer = new Peer(generatePeerId(), peerConfig);

    peer.on('open', (id) => {
        elements.peerId.value = id;
        showNotification('Your peer ID is: ' + id, 'info');
        
        // If we're the first peer, we're the host
        if (!hostId) {
            hostId = id;
        }
    });

    peer.on('connection', handleConnection);

    peer.on('error', (error) => {
        console.error('Peer error:', error);
        showNotification('Connection error: ' + error.message, 'error');
    });
}

// Update connect function to handle host discovery
async function connect(targetPeerId) {
    try {
        const conn = peer.connect(targetPeerId);
        
        conn.on('open', () => {
            handleConnection(conn);
            showNotification('Connected to peer: ' + targetPeerId, 'success');
            
            // Store host ID when connecting
            if (!hostId) {
                hostId = targetPeerId;
            }
        });
        
    } catch (error) {
        console.error('Connection error:', error);
        showNotification('Failed to connect: ' + error.message, 'error');
    }
}

// Initialize PeerJS
function initPeerJS() {
    try {
        peer = new Peer({
            debug: 2,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            },
            // Add configuration to improve connection stability
            pingInterval: 5000, // Ping every 5 seconds
            retryTimers: {
                min: 1000,   // Start retry after 1 second
                max: 15000,  // Max retry interval of 15 seconds
                factor: 1.5  // Multiply interval by this factor each attempt
            }
        });

        peer.on('open', (id) => {
            elements.peerId.textContent = id;
            updateConnectionStatus('', 'Ready to connect');
            generateQRCode(id);
        });

        peer.on('connection', (conn) => {
            console.log('Incoming connection from:', conn.peer);
            connections.set(conn.peer, conn);
            updateConnectionStatus('connecting', 'Incoming connection...');
            setupConnectionHandlers(conn);
        });

        peer.on('error', (error) => {
            console.error('PeerJS Error:', error);
            let errorMessage = 'Connection error';
            
            // Handle specific error types
            if (error.type === 'peer-unavailable') {
                errorMessage = 'Peer is not available or does not exist';
            } else if (error.type === 'network') {
                errorMessage = 'Network connection error';
                attemptReconnect();
            } else if (error.type === 'disconnected') {
                errorMessage = 'Disconnected from server';
                attemptReconnect();
            } else if (error.type === 'server-error') {
                errorMessage = 'Server error occurred';
                attemptReconnect();
            }
            
            updateConnectionStatus('', errorMessage);
            showNotification(errorMessage, 'error');
        });

        peer.on('disconnected', () => {
            console.log('Peer disconnected');
            updateConnectionStatus('', 'Disconnected - Attempting to reconnect...');
            attemptReconnect();
        });

        // Add visibility change handler
        document.addEventListener('visibilitychange', handleVisibilityChange);
        
        // Add online/offline handlers
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

    } catch (error) {
        console.error('PeerJS Initialization Error:', error);
        updateConnectionStatus('', 'Initialization failed');
        showNotification('Failed to initialize peer connection', 'error');
    }
}

// Handle visibility change (sleep/wake)
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log('Page became visible - checking connections');
        checkAndRestoreConnections();
    }
}

// Handle online event
function handleOnline() {
    console.log('Network connection restored');
    checkAndRestoreConnections();
}

// Handle offline event
function handleOffline() {
    console.log('Network connection lost');
    updateConnectionStatus('', 'Network connection lost - Will reconnect when online');
}

// Check and restore connections
async function checkAndRestoreConnections() {
    if (!peer || peer.disconnected) {
        console.log('Attempting to reconnect peer...');
        attemptReconnect();
        return;
    }

    // Check each connection
    for (const [peerId, conn] of connections.entries()) {
        if (!conn.open) {
            console.log(`Connection to ${peerId} is closed - attempting to reconnect...`);
            try {
                const newConn = peer.connect(peerId, {
                    reliable: true,
                    serialization: 'json'
                });
                setupConnectionHandlers(newConn);
                connections.set(peerId, newConn);
            } catch (error) {
                console.error(`Failed to reconnect to ${peerId}:`, error);
            }
        }
    }

    updateConnectionStatus(connections.size > 0 ? 'connected' : '', 
        connections.size > 0 ? `Connected to ${connections.size} peer(s)` : 'Ready to connect');
}

// Attempt to reconnect with exponential backoff
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000;

async function attemptReconnect() {
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log('Max reconnection attempts reached');
        showNotification('Unable to reconnect. Please refresh the page.', 'error');
        return;
    }

    const delay = INITIAL_RECONNECT_DELAY * Math.pow(2, reconnectAttempts);
    reconnectAttempts++;

    console.log(`Attempting to reconnect (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    try {
        if (peer) {
            if (peer.disconnected) {
                await new Promise(resolve => setTimeout(resolve, delay));
                peer.reconnect();
            }
        } else {
            initPeerJS();
        }
    } catch (error) {
        console.error('Reconnection attempt failed:', error);
        if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            setTimeout(attemptReconnect, delay);
        }
    }
}

// Setup connection event handlers
function setupConnectionHandlers(conn) {
    conn.on('open', () => {
        console.log('Connection opened with:', conn.peer);
        isConnectionReady = true;
        reconnectAttempts = 0; // Reset reconnect attempts on successful connection
        
        // Increment peer count and update status
        peerCount++;
        updateConnectionStatus('connected', `Connected to ${peerCount} peer(s)`);
        
        elements.fileTransferSection.classList.remove('hidden');
        addRecentPeer(conn.peer);
        
        // Send a connection notification to the other peer
        conn.send({
            type: 'connection-notification',
            peerId: peer.id
        });
    });

    // Add heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
        if (conn.open) {
            conn.send({ type: 'heartbeat' });
        } else {
            clearInterval(heartbeat);
        }
    }, 30000); // Send heartbeat every 30 seconds

    conn.on('data', async (data) => {
        try {
            if (data.type === 'heartbeat') {
                return; // Ignore heartbeat messages
            } else if (data.type === 'connection-notification') {
                updateConnectionStatus('connected', `Connected to ${peerCount} peer(s)`);
            } else if (data.type === 'file-history-update') {
                const fileId = data.fileInfo.id;
                const type = data.historyType === 'sent' ? 'received' : 'sent';
                
                // Only update if file doesn't exist in history
                if (!fileHistory[type].has(fileId)) {
                    fileHistory[type].add(fileId);
                    const listElement = type === 'sent' ? elements.sentFilesList : elements.receivedFilesList;
                    updateFilesList(listElement, data.fileInfo, type);
                }
            } else if (data.type === 'file-header') {
                await handleFileHeader(data);
            } else if (data.type === 'file-chunk') {
                await handleFileChunk(data);
            } else if (data.type === 'file-complete') {
                await handleFileComplete(data);
            }
        } catch (error) {
            console.error('Data handling error:', error);
            showNotification('Error processing received data', 'error');
        }
    });

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        clearInterval(heartbeat);
        connections.delete(conn.peer);
        
        // Decrement peer count and update status
        peerCount = Math.max(0, peerCount - 1);
        if (peerCount > 0) {
            updateConnectionStatus('connected', `Connected to ${peerCount} peer(s)`);
        } else {
            updateConnectionStatus('', 'Ready to connect');
        }

        // Attempt to reconnect if page is visible
        if (document.visibilityState === 'visible') {
            setTimeout(() => {
                if (!connections.has(conn.peer)) {
                    console.log('Attempting to reconnect to:', conn.peer);
                    const newConn = peer.connect(conn.peer, {
                        reliable: true,
                        serialization: 'json'
                    });
                    setupConnectionHandlers(newConn);
                    connections.set(conn.peer, newConn);
                }
            }, 1000);
        }
    });

    conn.on('error', (error) => {
        console.error('Connection error:', error);
        // Only attempt reconnect if the page is visible
        if (document.visibilityState === 'visible') {
            checkAndRestoreConnections();
        }
    });
}

// Helper function to generate unique file ID
function generateFileId(file) {
    return `${file.name}-${file.size}`;
}

// Handle file header data
async function handleFileHeader(data) {
    const fileId = generateFileId({ name: data.name, size: data.size });
    fileChunks[fileId] = {
        name: data.name,
        type: data.fileType || 'application/octet-stream',
        size: data.size,
        chunks: [],
        receivedSize: 0
    };
    updateProgress(0);
    elements.transferProgress.classList.remove('hidden');
}

// File transfer state management
const transferState = {
    state: TRANSFER_STATES.WAITING,
    currentFile: null,
    chunks: new Map(),
    retries: new Map(),
    progress: 0,
    activeTransfers: new Set(),
    pausedTransfers: new Set(),
    failedChunks: new Map(),
    connectionChecks: new Map()
};

// Initialize progress bar
function initializeProgressBar() {
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    if (progressBar && progressText) {
        progressBar.style.width = '0%';
        progressText.textContent = '0%';
        elements.transferProgress.classList.remove('hidden');
    }
}

// Update progress bar
function updateProgress(progress) {
    const progressBar = document.querySelector('.progress-bar');
    const progressText = document.querySelector('.progress-text');
    if (progressBar && progressText) {
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `${progress}%`;
        
        if (progress >= 100) {
            setTimeout(() => {
                elements.transferProgress.classList.add('hidden');
            }, 1000);
        }
    }
}

// File chunk management
class FileChunkManager {
    constructor(file) {
        this.file = file;
        this.chunks = new Map();
        this.totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        this.receivedChunks = 0;
        this.retries = new Map();
    }

    addChunk(index, data) {
        if (!this.chunks.has(index)) {
            this.chunks.set(index, data);
            this.receivedChunks++;
        }
    }

    isComplete() {
        return this.receivedChunks === this.totalChunks;
    }

    getProgress() {
        return Math.round((this.receivedChunks / this.totalChunks) * 100);
    }

    async assembleFile() {
        const chunks = Array.from(this.chunks.values());
        const blob = new Blob(chunks, { type: this.file.type });
        return new File([blob], this.file.name, {
            type: this.file.type,
            lastModified: new Date().getTime()
        });
    }
}

// Handle incoming file chunks
async function handleFileChunk(data) {
    try {
        // Validate chunk data
        if (!data.data || !data.chunkIndex || data.chunkIndex < 0) {
            throw new Error('Invalid chunk data');
        }

        // Verify chunk checksum if provided
        if (data.checksum) {
            const chunkChecksum = await calculateChunkChecksum(data.data);
            if (chunkChecksum !== data.checksum) {
                throw new Error('Chunk checksum mismatch');
            }
        }

        const fileId = generateFileId({ name: data.name, size: data.size });
        const fileManager = transferState.chunks.get(fileId);

        if (!fileManager) {
            throw new Error('No file manager found for chunk');
        }

        // Store chunk and send acknowledgment
        fileManager.addChunk(data.chunkIndex, data.data);
        
        if (data.conn) {
            data.conn.send({
                type: 'chunk-ack',
                chunkIndex: data.chunkIndex,
                received: true
            });
        }

        // Update progress
        const progress = fileManager.getProgress();
        updateProgress(progress);

    } catch (error) {
        console.error('Error handling chunk:', error);
        if (data.conn) {
            data.conn.send({
                type: 'chunk-ack',
                chunkIndex: data.chunkIndex,
                received: false,
                error: error.message
            });
        }
    }
}

// Handle file completion with verification
async function handleFileComplete(data) {
    try {
        const fileId = generateFileId({ name: data.name, size: data.size });
        const fileManager = transferState.chunks.get(fileId);

        if (!fileManager) {
            throw new Error('No file data found');
        }

        if (!fileManager.isComplete()) {
            throw new Error('Incomplete file transfer');
        }

        // Assemble and verify file
        const file = await fileManager.assembleFile();
        
        // Verify file size
        if (file.size !== data.size) {
            throw new Error('File size mismatch');
        }

        // Verify checksum if provided
        if (data.checksum) {
            const fileChecksum = await calculateChecksum(file);
            if (fileChecksum !== data.checksum) {
                throw new Error('File checksum mismatch');
            }
        }

        // Create blob URL and add to history
        const url = URL.createObjectURL(file);
        addFileToHistory(file, 'received', url);

        // Clean up
        transferState.chunks.delete(fileId);
        showNotification(`File "${file.name}" received successfully`, 'success');
        updateProgress(100);

        // Broadcast file to other peers if we're the host
        if (peer.id === hostId) {
            broadcastFile(file, url);
        }

    } catch (error) {
        console.error('Error completing file transfer:', error);
        showNotification(`Error receiving file: ${error.message}`, 'error');
        elements.transferProgress.classList.add('hidden');
    }
}

// Broadcast file to all peers
async function broadcastFile(file, url) {
    for (const [peerId, conn] of connections) {
        if (conn && conn.open && peerId !== peer.id) {
            try {
                await sendFileToPeer(file, conn);
            } catch (error) {
                console.error(`Error broadcasting file to peer ${peerId}:`, error);
            }
        }
    }
}

// Read file chunk with timeout
async function readFileChunk(file, start, end) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const blob = file.slice(start, end);
        
        const timeout = setTimeout(() => {
            reader.abort();
            reject(new Error('Chunk read timeout'));
        }, CHUNK_TIMEOUT);

        reader.onload = () => {
            clearTimeout(timeout);
            resolve(reader.result);
        };

        reader.onerror = () => {
            clearTimeout(timeout);
            reject(reader.error);
        };

        reader.readAsArrayBuffer(blob);
    });
}

// UI Functions
function addFileToList(name, url, size) {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${name} (${formatFileSize(size)})`;
    
    const downloadBtn = document.createElement('a');
    downloadBtn.href = url;
    downloadBtn.download = name;
    downloadBtn.className = 'button';
    downloadBtn.textContent = 'Download';
    
    // Add click handler to handle blob URL cleanup
    downloadBtn.addEventListener('click', () => {
        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);
    });
    
    li.appendChild(nameSpan);
    li.appendChild(downloadBtn);
    elements.fileList.appendChild(li);
    
    if (elements.receivedFiles) {
        elements.receivedFiles.classList.remove('hidden');
    }
}

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function showNotification(message, type = 'success') {
    if (!elements.notifications) {
        console.warn('Notifications container not found');
        return;
    }

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add different icons based on notification type
    const icon = document.createElement('span');
    icon.className = 'notification-icon';
    switch (type) {
        case 'success':
            icon.textContent = '✓ ';
            break;
        case 'error':
            icon.textContent = '✕ ';
            break;
        case 'info':
            icon.textContent = 'ℹ ';
            break;
        default:
            icon.textContent = '• ';
    }
    
    notification.insertBefore(icon, notification.firstChild);
    elements.notifications.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode === elements.notifications) {
            notification.classList.add('fade-out');
            setTimeout(() => {
                if (notification.parentNode === elements.notifications) {
                    elements.notifications.removeChild(notification);
                }
            }, 300);
        }
    }, 4700);
}

function resetConnection() {
    if (connections.size > 0) {
        connections.forEach((conn, peerId) => {
            if (conn && conn.open) {
                conn.close();
            }
        });
        connections.clear();
    }
    peerCount = 0;
    isConnectionReady = false;
    transferInProgress = false;
    elements.fileTransferSection.classList.add('hidden');
    elements.transferProgress.classList.add('hidden');
    elements.progress.style.width = '0%';
    elements.progressText.textContent = '0%';
    elements.transferInfo.style.display = 'none';
    updateConnectionStatus('', 'Ready to connect');
}

// Event Listeners
elements.copyId.addEventListener('click', () => {
    navigator.clipboard.writeText(elements.peerId.textContent)
        .then(() => showNotification('Peer ID copied to clipboard'))
        .catch(err => showNotification('Failed to copy Peer ID', 'error'));
});

elements.connectButton.addEventListener('click', () => {
    const remotePeerIdValue = elements.remotePeerId.value.trim();
    if (!remotePeerIdValue) {
        showNotification('Please enter a Peer ID', 'error');
        return;
    }

    if (connections.has(remotePeerIdValue)) {
        showNotification('Already connected to this peer', 'warning');
        return;
    }

    try {
        console.log('Attempting to connect to:', remotePeerIdValue);
        updateConnectionStatus('connecting', 'Connecting...');
        const newConnection = peer.connect(remotePeerIdValue, {
            reliable: true
        });
        connections.set(remotePeerIdValue, newConnection);
        setupConnectionHandlers(newConnection);
    } catch (error) {
        console.error('Connection attempt error:', error);
        showNotification('Failed to establish connection', 'error');
        updateConnectionStatus('', 'Connection failed');
    }
});

elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
});

elements.dropZone.addEventListener('dragleave', () => {
    elements.dropZone.classList.remove('drag-over');
});

elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
    
    if (connections.size > 0) {
        const files = e.dataTransfer.files;
        Array.from(files).forEach(sendFile);
    } else {
        showNotification('Please connect to at least one peer first', 'error');
    }
});

// Add click handler for the drop zone
elements.dropZone.addEventListener('click', () => {
    if (connections.size > 0) {
        elements.fileInput.click();
    } else {
        showNotification('Please connect to at least one peer first', 'error');
    }
});

// Add file input change handler
elements.fileInput.addEventListener('change', (e) => {
    if (connections.size > 0) {
        const files = e.target.files;
        if (files.length > 0) {
            Array.from(files).forEach(sendFile);
        }
        // Reset the input so the same file can be selected again
        e.target.value = '';
    } else {
        showNotification('Please connect to at least one peer first', 'error');
    }
});

// Initialize the application
function init() {
    if (!checkBrowserSupport()) {
        return;
    }

    // Clear any existing value in the remote peer ID field
    elements.remotePeerId.value = '';
    
    initPeerJS();
    initIndexedDB();
    loadRecentPeers();
    checkUrlForPeerId(); // Check URL for peer ID on load
    
    // Show share button if Web Share API is supported
    if (navigator.share) {
        elements.shareId = document.getElementById('share-id');
        elements.shareId.classList.remove('hidden');
    }
}

// Add CSS classes for notification styling
const style = document.createElement('style');
style.textContent = `
    .notification {
        display: flex;
        align-items: center;
        gap: 8px;
        animation: slideIn 0.3s ease-out;
        transition: opacity 0.3s ease-out;
    }
    
    .notification.fade-out {
        opacity: 0;
    }
    
    .notification-icon {
        font-size: 1.2em;
    }
    
    .notification.info {
        background-color: #e0f2fe;
        color: #0369a1;
    }
    
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
`;
document.head.appendChild(style);

// Add function to update connection status
function updateConnectionStatus(status, message) {
    elements.statusDot.className = 'status-dot ' + (status || '');
    elements.statusText.textContent = message;
    
    // Update title to show number of connections
    if (peerCount > 0) {
        document.title = `(${peerCount}) P2P File Share`;
    } else {
        document.title = 'P2P File Share';
    }
}

// Update files list with download handling
function updateFilesList(listElement, fileInfo, type) {
    const existingFile = Array.from(listElement.children).find(li => li.dataset.fileId === fileInfo.id);
    if (existingFile) return;

    const li = document.createElement('li');
    li.dataset.fileId = fileInfo.id;
    li.className = 'file-item';

    const fileContent = document.createElement('div');
    fileContent.className = 'file-content';

    const icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.textContent = getFileIcon(fileInfo.type);

    const fileInfoDiv = document.createElement('div');
    fileInfoDiv.className = 'file-info';

    const fileName = document.createElement('div');
    fileName.className = 'file-name';
    fileName.textContent = fileInfo.name;

    const fileSize = document.createElement('div');
    fileSize.className = 'file-size';
    fileSize.textContent = formatFileSize(fileInfo.size);

    fileInfoDiv.appendChild(fileName);
    fileInfoDiv.appendChild(fileSize);

    fileContent.appendChild(icon);
    fileContent.appendChild(fileInfoDiv);
    li.appendChild(fileContent);

    if (fileInfo.url) {
        const downloadButton = document.createElement('button');
        downloadButton.className = 'download-button';
        downloadButton.innerHTML = '<span class="material-icons">download</span>';
        downloadButton.title = 'Download file';

        downloadButton.addEventListener('click', async () => {
            try {
                const a = document.createElement('a');
                a.href = fileInfo.url;
                a.download = fileInfo.name;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';

                // For iOS devices
                const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
                if (isIOS) {
                    window.open(fileInfo.url, '_blank');
                } else {
                    // For other devices
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                }
            } catch (error) {
                console.error('Download error:', error);
                showNotification('Failed to download file', 'error');
            }
        });

        li.appendChild(downloadButton);
    }

    listElement.insertBefore(li, listElement.firstChild);
}

// Add function to get appropriate file icon
function getFileIcon(mimeType) {
    if (!mimeType) return 'insert_drive_file';
    
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'movie';
    if (mimeType.startsWith('audio/')) return 'audiotrack';
    if (mimeType.includes('pdf')) return 'picture_as_pdf';
    if (mimeType.includes('word') || mimeType.includes('document')) return 'description';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'table_chart';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'slideshow';
    if (mimeType.includes('text/')) return 'text_snippet';
    if (mimeType.includes('zip') || mimeType.includes('archive')) return 'folder_zip';
    
    return 'insert_drive_file';
}

// Add event listeners for recent peers
elements.remotePeerId.addEventListener('focus', () => {
    if (recentPeers.length > 0) {
        elements.recentPeers.classList.remove('hidden');
    }
});

elements.remotePeerId.addEventListener('blur', (e) => {
    // Delay hiding to allow for click events on the list
    setTimeout(() => {
        elements.recentPeers.classList.add('hidden');
    }, 200);
});

elements.clearPeers.addEventListener('click', () => {
    recentPeers = [];
    saveRecentPeers();
    updateRecentPeersList();
    elements.recentPeers.classList.add('hidden');
});

// Add share button click handler
document.getElementById('share-id').addEventListener('click', async () => {
    const peerId = elements.peerId.textContent;
    const shareUrl = `${window.location.origin}${window.location.pathname}?peer=${peerId}`;
    
    try {
        await navigator.share({
            url: shareUrl
        });
        showNotification('Share successful');
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error sharing:', error);
            showNotification('Failed to share Peer ID', 'error');
        }
    }
});

// Validate file before transfer
function validateFile(file) {
    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        throw new Error(`File size exceeds maximum limit of ${formatFileSize(MAX_FILE_SIZE)}`);
    }

    // Check file type
    const fileType = file.type.toLowerCase();
    const isAllowed = Array.from(ALLOWED_FILE_TYPES).some(type => fileType.startsWith(type));
    if (!isAllowed && file.type !== '') {  // Allow files with no type (some text files)
        throw new Error('File type not allowed');
    }

    // Check for zero-byte files
    if (file.size === 0) {
        throw new Error('Cannot transfer empty files');
    }

    return true;
}

// Enhanced connection management
function setupConnectionMonitoring(conn) {
    // Setup heartbeat
    const heartbeatInterval = setInterval(() => {
        if (conn.open) {
            conn.send({ type: 'heartbeat' });
        }
    }, CONNECTION_CHECK_INTERVAL);

    // Track last activity
    let lastActivity = Date.now();
    conn.on('data', () => {
        lastActivity = Date.now();
    });

    // Monitor connection health
    const healthCheck = setInterval(() => {
        if (Date.now() - lastActivity > CONNECTION_CHECK_INTERVAL * 2) {
            // Connection might be stale
            handleConnectionIssue(conn);
        }
    }, CONNECTION_CHECK_INTERVAL);

    // Store intervals for cleanup
    transferState.connectionChecks.set(conn.peer, {
        heartbeat: heartbeatInterval,
        health: healthCheck
    });

    // Cleanup on connection close
    conn.on('close', () => {
        clearConnectionMonitoring(conn.peer);
    });
}

// Clear connection monitoring
function clearConnectionMonitoring(peerId) {
    const checks = transferState.connectionChecks.get(peerId);
    if (checks) {
        clearInterval(checks.heartbeat);
        clearInterval(checks.health);
        transferState.connectionChecks.delete(peerId);
    }
}

// Handle connection issues
async function handleConnectionIssue(conn) {
    const peerId = conn.peer;
    console.warn(`Connection issues detected with peer ${peerId}`);

    // Pause any active transfers
    if (transferState.activeTransfers.has(peerId)) {
        pauseTransfer(peerId);
    }

    // Try to reconnect
    try {
        await reconnectToPeer(peerId);
    } catch (error) {
        console.error(`Failed to reconnect to peer ${peerId}:`, error);
        handleTransferFailure(peerId);
    }
}

// Pause transfer
function pauseTransfer(peerId) {
    transferState.activeTransfers.delete(peerId);
    transferState.pausedTransfers.add(peerId);
    showNotification(`Transfer paused for peer ${peerId}`, 'warning');
}

// Resume transfer
async function resumeTransfer(peerId) {
    if (!transferState.pausedTransfers.has(peerId)) return;

    const conn = connections.get(peerId);
    if (!conn || !conn.open) {
        showNotification(`Cannot resume transfer: peer ${peerId} not connected`, 'error');
        return;
    }

    transferState.pausedTransfers.delete(peerId);
    transferState.activeTransfers.add(peerId);

    // Resend failed chunks
    const failedChunks = transferState.failedChunks.get(peerId) || new Set();
    for (const chunkIndex of failedChunks) {
        try {
            await sendChunk(conn, transferState.currentFile, chunkIndex);
        } catch (error) {
            console.error(`Failed to resend chunk ${chunkIndex}:`, error);
        }
    }
}

// Enhanced file sending with chunk management
async function sendFileToPeer(file, conn) {
    try {
        // Validate file first
        validateFile(file);

        const peerId = conn.peer;
        transferState.activeTransfers.add(peerId);
        transferState.currentFile = file;

        // Setup connection monitoring
        setupConnectionMonitoring(conn);

        // Initialize chunk tracking
        transferState.failedChunks.set(peerId, new Set());

        // Send file header with metadata
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
        conn.send({
            type: 'file-header',
            name: file.name,
            size: file.size,
            fileType: file.type || 'application/octet-stream',
            totalChunks: totalChunks,
            id: generateFileId(file),
            timestamp: Date.now()
        });

        // Send chunks with enhanced error handling
        for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
            if (!transferState.activeTransfers.has(peerId)) {
                throw new Error('Transfer interrupted');
            }

            try {
                await sendChunk(conn, file, chunkIndex);
            } catch (error) {
                transferState.failedChunks.get(peerId).add(chunkIndex);
                if (transferState.failedChunks.get(peerId).size > totalChunks * 0.1) {
                    // If more than 10% chunks failed, pause transfer
                    pauseTransfer(peerId);
                    throw new Error('Too many failed chunks');
                }
            }
        }

        // Verify transfer completion
        const verificationResult = await verifyTransfer(conn, file);
        if (!verificationResult.success) {
            throw new Error(`Transfer verification failed: ${verificationResult.reason}`);
        }

        // Send completion message
        conn.send({
            type: 'file-complete',
            name: file.name,
            size: file.size,
            id: generateFileId(file),
            checksum: await calculateChecksum(file)
        });

        // Cleanup
        transferState.activeTransfers.delete(peerId);
        transferState.failedChunks.delete(peerId);

    } catch (error) {
        handleTransferFailure(conn.peer, error);
        throw error;
    }
}

// Send individual chunk with retry logic
async function sendChunk(conn, file, chunkIndex) {
    let attempts = 0;
    while (attempts < MAX_RETRIES) {
        try {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = await readFileChunk(file, start, end);

            conn.send({
                type: 'file-chunk',
                name: file.name,
                size: file.size,
                chunkIndex: chunkIndex,
                data: chunk,
                checksum: await calculateChunkChecksum(chunk)
            });

            // Wait for acknowledgment
            const ackReceived = await waitForAck(conn, chunkIndex);
            if (ackReceived) return;

            throw new Error('Chunk acknowledgment timeout');
        } catch (error) {
            attempts++;
            if (attempts >= MAX_RETRIES) throw error;
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempts));
        }
    }
}

// Calculate file checksum
async function calculateChecksum(file) {
    try {
        const buffer = await file.arrayBuffer();
        const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch (error) {
        console.error('Error calculating checksum:', error);
        return null;
    }
}

// Calculate chunk checksum
async function calculateChunkChecksum(chunk) {
    try {
        const hashBuffer = await crypto.subtle.digest('SHA-256', chunk);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch (error) {
        console.error('Error calculating chunk checksum:', error);
        return null;
    }
}

// Verify complete transfer
async function verifyTransfer(conn, file) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            resolve({ success: false, reason: 'Verification timeout' });
        }, CHUNK_TIMEOUT);

        conn.send({
            type: 'verify-transfer',
            fileId: generateFileId(file)
        });

        const handler = (data) => {
            if (data.type === 'transfer-verification' && data.fileId === generateFileId(file)) {
                clearTimeout(timeout);
                conn.off('data', handler);
                resolve({ success: data.success, reason: data.reason });
            }
        };

        conn.on('data', handler);
    });
}

// Handle transfer failure
function handleTransferFailure(peerId, error) {
    console.error(`Transfer failed for peer ${peerId}:`, error);
    transferState.activeTransfers.delete(peerId);
    transferState.pausedTransfers.delete(peerId);
    showNotification(`Transfer failed: ${error.message}`, 'error');
}

init();
