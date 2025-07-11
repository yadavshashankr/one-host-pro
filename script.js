// Constants
const CHUNK_SIZE = 16384; // 16KB chunks
const DB_NAME = 'fileTransferDB';
const DB_VERSION = 2; // Increased version for new object stores
const STORE_NAME = 'files';
const MESSAGES_STORE = 'messages';
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // 60 seconds
const TYPING_TIMEOUT = 3000; // 3 seconds

// Add simultaneous download message types
const MESSAGE_TYPES = {
    FILE_INFO: 'file-info',
    FILE_HEADER: 'file-header',
    FILE_CHUNK: 'file-chunk',
    FILE_COMPLETE: 'file-complete',
    BLOB_REQUEST: 'blob-request',
    BLOB_REQUEST_FORWARDED: 'blob-request-forwarded',
    BLOB_ERROR: 'blob-error',
    CONNECTION_NOTIFICATION: 'connection-notification',
    KEEP_ALIVE: 'keep-alive',
    KEEP_ALIVE_RESPONSE: 'keep-alive-response',
    DISCONNECT_NOTIFICATION: 'disconnect-notification',
    SIMULTANEOUS_DOWNLOAD_REQUEST: 'simultaneous-download-request',
    SIMULTANEOUS_DOWNLOAD_READY: 'simultaneous-download-ready',
    SIMULTANEOUS_DOWNLOAD_START: 'simultaneous-download-start',
    // New types for chat
    TEXT_MESSAGE: 'text-message',
    TYPING_INDICATOR: 'typing-indicator',
    MESSAGE_STATUS: 'message-status',
    MESSAGE_REACTION: 'message-reaction',
    STATUS_UPDATE: 'status-update'
};

// Message Status
const MESSAGE_STATUS = {
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read'
};

// DOM Elements
const elements = {
    peerId: document.getElementById('peer-id'),
    shareId: document.getElementById('share-id'),
    peerSearch: document.getElementById('peer-search'),
    fileInput: document.getElementById('file-input'),
    transferProgress: document.getElementById('transfer-progress'),
    progress: document.getElementById('progress'),
    transferInfo: document.getElementById('transfer-info'),
    statusText: document.getElementById('status-text'),
    statusDot: document.getElementById('status-dot'),
    browserSupport: document.getElementById('browser-support'),
    qrcode: document.getElementById('qrcode'),
    notifications: document.getElementById('notifications'),
    recentPeers: document.getElementById('recent-peers'),
    recentPeersList: document.getElementById('recent-peers-list'),
    clearPeers: document.getElementById('clear-peers'),
    peerIdEdit: document.getElementById('peer-id-edit'),
    editIdButton: document.getElementById('edit-id'),
    saveIdButton: document.getElementById('save-id'),
    cancelEditButton: document.getElementById('cancel-edit'),
    welcomeScreen: document.getElementById('welcome-screen'),
    activeChat: document.getElementById('active-chat'),
    messageList: document.getElementById('message-list'),
    messageInput: document.getElementById('message-input'),
    sendMessage: document.getElementById('send-message'),
    attachFile: document.getElementById('attach-file'),
    emojiButton: document.getElementById('emoji-button'),
    typingIndicator: document.getElementById('typing-indicator'),
    chatMenu: document.getElementById('chat-menu'),
    contextMenu: document.getElementById('message-context-menu'),
    themeToggle: document.getElementById('theme-toggle'),
    qrCodeToggle: document.getElementById('qr-code-toggle')
};

// State
let peer = null;
let connections = new Map(); // Map to store multiple connections
let db = null;
let transferInProgress = false;
let isConnectionReady = false;
let fileChunks = {}; // Initialize fileChunks object
let keepAliveInterval = null;
let connectionTimeouts = new Map();
let isPageVisible = true;
let typingTimeout = null;
let currentTheme = localStorage.getItem('theme') || 'light';

// Add file history tracking with Sets for uniqueness
const fileHistory = {
    sent: new Set(),
    received: new Set()
};

// Add blob storage for sent files
const sentFileBlobs = new Map(); // Map to store blobs of sent files

// Add recent peers tracking
let recentPeers = [];
const MAX_RECENT_PEERS = 5;

// Add file queue system
let fileQueue = [];
let isProcessingQueue = false;

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
            elements.peerSearch.value = peerId;
            elements.recentPeers.classList.add('hidden');
            connectToPeer(peerId);
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
            if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
                const messagesStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id', autoIncrement: true });
                messagesStore.createIndex('conversationId', 'conversationId', { unique: false });
                messagesStore.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            loadRecentMessages();
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
            elements.peerSearch.value = peerId;
            // Wait a bit for PeerJS to initialize
            setTimeout(() => {
                connectToPeer(peerId);
            }, 1500);
        }
    } catch (error) {
        console.error('Error parsing URL parameters:', error);
    }
}

// Store sent files for later download
const sentFilesStore = new Map();

// Initialize share button if Web Share API is available
function initShareButton() {
    if (navigator.share) {
        elements.shareId.classList.remove('hidden');
        elements.shareId.addEventListener('click', shareId);
    } else {
        elements.shareId.classList.add('hidden');
    }
}

// Share peer ID using Web Share API
async function shareId() {
    try {
        const peerId = elements.peerId.textContent;
        const baseUrl = window.location.origin + window.location.pathname;
        const qrUrl = `${baseUrl}?peer=${peerId}`;
        await navigator.share({ url: qrUrl });
        showNotification('Share successful!', 'success');
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Error sharing:', error);
            showNotification('Failed to share', 'error');
        }
    }
}

// Setup peer event handlers
function setupPeerHandlers() {
    if (!peer) {
        console.error('Cannot setup handlers: peer is null');
        return;
    }

    peer.on('open', (id) => {
        console.log('Peer opened with ID:', id);
        elements.peerId.textContent = id;
        updateConnectionStatus('', 'Ready to connect');
        generateQRCode(id);
        initShareButton();
        updateEditButtonState();
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
        } else if (error.type === 'disconnected') {
            errorMessage = 'Disconnected from server';
        } else if (error.type === 'server-error') {
            errorMessage = 'Server error occurred';
        } else if (error.type === 'unavailable-id') {
            errorMessage = 'This ID is already taken. Please try another one.';
        } else if (error.type === 'browser-incompatible') {
            errorMessage = 'Your browser might not support all required features';
        } else if (error.type === 'invalid-id') {
            errorMessage = 'Invalid ID format';
        } else if (error.type === 'ssl-unavailable') {
            errorMessage = 'SSL is required for this connection';
        }
        
        updateConnectionStatus('', errorMessage);
        showNotification(errorMessage, 'error');

        // If this was during a custom ID setup, revert to auto-generated ID
        if (elements.peerIdEdit && !elements.peerIdEdit.classList.contains('hidden')) {
            cancelEditingPeerId();
            initPeerJS(); // Reinitialize with auto-generated ID
        }
    });

    peer.on('disconnected', () => {
        console.log('Peer disconnected');
        updateConnectionStatus('', 'Disconnected');
        isConnectionReady = false;
        
        // Try to reconnect
        setTimeout(() => {
            if (peer && !peer.destroyed) {
                console.log('Attempting to reconnect...');
                peer.reconnect();
            }
        }, 3000);
    });

    peer.on('close', () => {
        console.log('Peer connection closed');
        updateConnectionStatus('', 'Connection closed');
        isConnectionReady = false;
    });
}

// Initialize PeerJS
async function initPeerJS() {
    try {
        if (elements.peerId) {
            elements.peerId.textContent = 'Generating...';
            elements.peerId.classList.add('generating');
        }

        // Initialize the Peer object with default server and debug level 0
        peer = new Peer({
            debug: 0, // Reduce debug noise
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            }
        });

        setupPeerHandlers();

    } catch (error) {
        console.error('PeerJS initialization error:', error);
        showNotification('Failed to initialize peer connection', 'error');
    }
}

// Setup connection event handlers
function setupConnectionHandlers(conn) {
    conn.on('open', () => {
        console.log('Connection opened with:', conn.peer);
        isConnectionReady = true;
        updateConnectionStatus('connected', conn.peer);
        
        // Show active chat and hide welcome screen
        if (elements.welcomeScreen) {
            elements.welcomeScreen.classList.add('hidden');
        }
        if (elements.activeChat) {
            elements.activeChat.classList.remove('hidden');
            // Collapse the sidebar
            document.querySelector('.conversation-list').classList.add('collapsed');
        }
        
        addRecentPeer(conn.peer);
        
        // Send a connection notification to the other peer
        conn.send({
            type: MESSAGE_TYPES.CONNECTION_NOTIFICATION,
            peerId: peer.id
        });
    });

    // Use a Set to track processed message IDs
    const processedMessages = new Set();

    conn.on('data', async (data) => {
        console.log('Received data:', data);
        try {
            // Check if we've already processed this message
            if (data.id && processedMessages.has(data.id)) {
                return;
            }

            if (data.type === MESSAGE_TYPES.TEXT_MESSAGE) {
                // Add message to chat
                addMessageToChat(data, false);
                // Store message
                await storeMessage(data);
                // Send delivery receipt
                conn.send({
                    type: MESSAGE_TYPES.MESSAGE_STATUS,
                    messageId: data.id,
                    status: MESSAGE_STATUS.DELIVERED
                });
                // Add to processed messages
                if (data.id) {
                    processedMessages.add(data.id);
                    // Clean up old messages after 5 minutes
                    setTimeout(() => processedMessages.delete(data.id), 300000);
                }
            } else if (data.type === MESSAGE_TYPES.FILE_INFO) {
                if (!processedMessages.has(data.id)) {
                    addMessageToChat(data, false);
                    await storeMessage(data);
                    processedMessages.add(data.id);
                }
            }
        } catch (error) {
            console.error('Error handling message:', error);
        }
    });

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        connections.delete(conn.peer);
        updateConnectionStatus(connections.size > 0 ? 'connected' : '', 
            connections.size > 0 ? `Connected to peer(s) : ${connections.size}` : 'Disconnected');
        showNotification(`Disconnected from peer ${conn.peer}`, 'warning');
    });

    conn.on('error', (error) => {
        console.error('Connection error:', error);
        showNotification(`Connection error: ${error.message}`, 'error');
    });
}

// Helper function to generate unique file ID
function generateFileId(file) {
    return `${file.name}-${file.size}`;
}

// Handle file header
async function handleFileHeader(data) {
    console.log('Received file header:', data);
    fileChunks[data.fileId] = {
        chunks: [],
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        receivedSize: 0,
        originalSender: data.originalSender
    };
    elements.transferProgress.classList.remove('hidden');
    updateProgress(0);
    updateTransferInfo(`Receiving ${data.fileName} from ${data.originalSender}...`);
}

// Handle file chunk
async function handleFileChunk(data) {
    const fileData = fileChunks[data.fileId];
    if (!fileData) return;

    fileData.chunks.push(data.data);
    fileData.receivedSize += data.data.byteLength;
    
    // Update progress more smoothly (update every 1% change)
    const currentProgress = (fileData.receivedSize / fileData.fileSize) * 100;
    if (!fileData.lastProgressUpdate || currentProgress - fileData.lastProgressUpdate >= 1) {
        updateProgress(currentProgress);
        fileData.lastProgressUpdate = currentProgress;
    }
}

// Handle file completion
async function handleFileComplete(data) {
    const fileData = fileChunks[data.fileId];
    if (!fileData) return;

    try {
        // Combine chunks into blob if this is a blob transfer
        if (fileData.chunks.length > 0) {
            const blob = new Blob(fileData.chunks, { type: fileData.fileType });
            
            // Verify file size
            if (blob.size !== fileData.fileSize) {
                throw new Error('Received file size does not match expected size');
            }

            // Create download URL and trigger download
            downloadBlob(blob, fileData.fileName, data.fileId);
            showNotification(`Downloaded ${fileData.fileName}`, 'success');

            // Update UI to show completed state
            const listItem = document.querySelector(`[data-file-id="${data.fileId}"]`);
            if (listItem) {
                listItem.classList.add('download-completed');
                const downloadButton = listItem.querySelector('.icon-button');
                if (downloadButton) {
                    downloadButton.classList.add('download-completed');
                    downloadButton.innerHTML = '<span class="material-icons">open_in_new</span>';
                    downloadButton.title = 'Open file';
                    
                    // Store the blob URL for opening the file
                    const blobUrl = URL.createObjectURL(blob);
                    downloadButton.onclick = () => {
                        window.open(blobUrl, '_blank');
                    };
                }
            }
        }

        // Create file info object
        const fileInfo = {
            name: fileData.fileName,
            type: fileData.fileType,
            size: fileData.fileSize,
            id: data.fileId,
            sharedBy: fileData.originalSender
        };

        // Add to history if this is a new file info
        if (!fileHistory.sent.has(data.fileId) && !fileHistory.received.has(data.fileId)) {
            addFileToHistory(fileInfo, 'received');

            // If this is the host peer, forward the file info to other connected peers
            if (connections.size > 1) {
                console.log('Forwarding file info to other peers as host');
                await forwardFileInfoToPeers(fileInfo, data.fileId);
            }
        }

    } catch (error) {
        console.error('Error handling file completion:', error);
        showNotification('Error processing file: ' + error.message, 'error');
    } finally {
        delete fileChunks[data.fileId];
        elements.transferProgress.classList.add('hidden');
        updateProgress(0);
        updateTransferInfo('');
    }
}

// Forward file info to other connected peers
async function forwardFileInfoToPeers(fileInfo, fileId) {
    // Create a standardized file info object that includes direct download info
    const fileInfoToSend = {
        type: 'file-info',
        fileId: fileId,
        fileName: fileInfo.name,
        fileType: fileInfo.type,
        fileSize: fileInfo.size,
        originalSender: fileInfo.sharedBy || peer.id,
        timestamp: Date.now(),
        directDownload: true // Indicate this file supports direct download
    };

    // Send to all connected peers except the original sender
    for (const [peerId, conn] of connections) {
        if (peerId !== fileInfo.sharedBy && conn && conn.open) {
            try {
                console.log(`Forwarding file info to peer: ${peerId}`);
                conn.send(fileInfoToSend);
            } catch (error) {
                console.error(`Error forwarding file info to peer ${peerId}:`, error);
            }
        }
    }
}

// Send file to a specific peer
async function sendFileToPeer(file, conn, fileId, fileBlob) {
    try {
        if (!conn.open) {
            throw new Error('Connection is not open');
        }

        // Store the blob for later use
        sentFileBlobs.set(fileId, fileBlob);

        // Send file info only
        conn.send({
            type: 'file-info',
            fileId: fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            originalSender: peer.id
        });

        console.log(`File info sent successfully to peer ${conn.peer}`);
    } catch (error) {
        console.error(`Error sending file info to peer ${conn.peer}:`, error);
        throw new Error(`Failed to send to peer ${conn.peer}: ${error.message}`);
    }
}

// Handle blob request
async function handleBlobRequest(data, conn) {
    const { fileId, forwardTo } = data;
    console.log('Received blob request for file:', fileId);

    // Check if we have the blob
    const blob = sentFileBlobs.get(fileId);
    if (!blob) {
        console.error('Blob not found for file:', fileId);
        conn.send({
            type: 'blob-error',
            fileId: fileId,
            error: 'File not available'
        });
        return;
    }

    try {
        // Convert blob to array buffer
        const buffer = await blob.arrayBuffer();
        let offset = 0;
        let lastProgressUpdate = 0;

        // Send file header
        conn.send({
            type: 'file-header',
            fileId: fileId,
            fileName: data.fileName,
            fileType: blob.type,
            fileSize: blob.size,
            originalSender: peer.id,
            timestamp: Date.now()
        });

        // Send chunks
        while (offset < blob.size) {
            if (!conn.open) {
                throw new Error('Connection lost during transfer');
            }

            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
            conn.send({
                type: 'file-chunk',
                fileId: fileId,
                data: chunk,
                offset: offset,
                total: blob.size
            });

            offset += chunk.byteLength;

            // Update progress
            const currentProgress = (offset / blob.size) * 100;
            if (currentProgress - lastProgressUpdate >= 1) {
                updateProgress(currentProgress);
                lastProgressUpdate = currentProgress;
            }
        }

        // Send completion message
        conn.send({
            type: 'file-complete',
            fileId: fileId,
            fileName: data.fileName,
            fileType: blob.type,
            fileSize: blob.size,
            timestamp: Date.now()
        });

        console.log(`File sent successfully to peer ${conn.peer}`);
    } catch (error) {
        console.error(`Error sending file to peer:`, error);
        conn.send({
            type: 'blob-error',
            fileId: fileId,
            error: error.message
        });
    }
}

// Function to request and download a blob
async function requestAndDownloadBlob(fileInfo) {
    try {
        // Always try to connect to original sender directly
        let conn = connections.get(fileInfo.sharedBy);
        
        if (!conn || !conn.open) {
            // If no direct connection exists, establish one
            console.log('No direct connection to sender, establishing connection...');
            conn = peer.connect(fileInfo.sharedBy, {
                reliable: true
            });
            
            // Wait for connection to open
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Connection timeout'));
                }, 10000); // 10 second timeout

                conn.on('open', () => {
                    clearTimeout(timeout);
                    connections.set(fileInfo.sharedBy, conn);
                    setupConnectionHandlers(conn);
                    resolve();
                });

                conn.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
        }

        // Now we should have a direct connection to the sender
        elements.transferProgress.classList.remove('hidden');
        updateProgress(0);
        updateTransferInfo(`Requesting ${fileInfo.name} directly from sender...`);

        // Request the file directly
        conn.send({
            type: 'blob-request',
            fileId: fileInfo.id,
            fileName: fileInfo.name,
            directRequest: true
        });

    } catch (error) {
        console.error('Error requesting file:', error);
        showNotification(`Failed to download file: ${error.message}`, 'error');
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');
    }
}

// Handle forwarded blob request (host only)
async function handleForwardedBlobRequest(data, fromConn) {
    console.log('Handling forwarded blob request:', data);
    
    // Find connection to original sender
    const originalSenderConn = connections.get(data.originalSender);
    if (!originalSenderConn || !originalSenderConn.open) {
        fromConn.send({
            type: 'blob-error',
            fileId: data.fileId,
            error: 'Original sender not connected to host'
        });
        return;
    }

    // Request blob from original sender with forwarding info
    originalSenderConn.send({
        type: 'blob-request',
        fileId: data.fileId,
        fileName: data.fileName,
        forwardTo: data.requesterId
    });
}

// Update transfer info display
function updateTransferInfo(message) {
    if (elements.transferInfo) {
        elements.transferInfo.textContent = message;
    }
}

// Add file to history
function addFileToHistory(fileInfo, type) {
    const fileId = fileInfo.id || generateFileId(fileInfo);
    
    // Determine the correct type based on who shared the file
    const actualType = fileInfo.sharedBy === peer.id ? 'sent' : 'received';
    
    // Remove from both history sets to prevent duplicates
    fileHistory.sent.delete(fileId);
    fileHistory.received.delete(fileId);
    
    // Add to the correct history set
    fileHistory[actualType].add(fileId);
    
    // Remove existing entries from UI if any
    const sentList = elements.sentFilesList;
    const receivedList = elements.receivedFilesList;
    
    // Remove from sent list if exists
    const existingInSent = sentList.querySelector(`[data-file-id="${fileId}"]`);
    if (existingInSent) {
        existingInSent.remove();
    }
    
    // Remove from received list if exists
    const existingInReceived = receivedList.querySelector(`[data-file-id="${fileId}"]`);
    if (existingInReceived) {
        existingInReceived.remove();
    }
    
    // Update UI with the correct list
    const listElement = actualType === 'sent' ? elements.sentFilesList : elements.receivedFilesList;
    updateFilesList(listElement, fileInfo, actualType);

    // Only broadcast updates for files we send originally
    if (fileInfo.sharedBy === peer.id) {
        broadcastFileUpdate(fileInfo);
    }
}

// Broadcast file update to all peers
function broadcastFileUpdate(fileInfo) {
    const updateData = {
        type: 'file-update',
        fileInfo: {
            id: fileInfo.id,
            name: fileInfo.name,
            type: fileInfo.type,
            size: fileInfo.size,
            sharedBy: fileInfo.sharedBy
        }
    };

    for (const conn of connections.values()) {
        if (conn.open) {
            conn.send(updateData);
        }
    }
}

// Process file queue
async function processFileQueue() {
    if (isProcessingQueue || fileQueue.length === 0) return;
    
    isProcessingQueue = true;
    updateTransferInfo(`Processing queue: ${fileQueue.length} file(s) remaining`);
    
    while (fileQueue.length > 0) {
        const file = fileQueue.shift();
        try {
            await sendFile(file);
            // Small delay between files to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error('Error processing file from queue:', error);
            showNotification(`Failed to send ${file.name}: ${error.message}`, 'error');
        }
    }
    
    isProcessingQueue = false;
    updateTransferInfo('');
}

// Send file function
async function sendFile(file) {
    if (!file) {
        throw new Error('No file selected');
    }

    const fileInfo = {
        id: generateFileId(file),
        name: file.name,
        type: file.type,
        size: file.size,
        sender: peer.id
    };

    // Create file blob
    const fileBlob = new Blob([await file.arrayBuffer()], { type: file.type });

    // Send file info to all connected peers
    for (const [peerId, conn] of connections) {
        if (conn && conn.open) {
            try {
                // Send file info
                conn.send({
                    type: MESSAGE_TYPES.FILE_INFO,
                    ...fileInfo,
                    blob: fileBlob // Send blob directly
                });

                // Create file message
                const message = {
                    id: generateMessageId(),
                    type: MESSAGE_TYPES.FILE_INFO,
                    content: fileInfo,
                    sender: peer.id,
                    receiver: peerId,
                    timestamp: Date.now(),
                    status: MESSAGE_STATUS.SENT
                };

                // Add message to chat
                addMessageToChat(message, true);

                // Store message
                await storeMessage(message);
            } catch (error) {
                console.error('Error sending file to peer:', error);
                throw new Error(`Failed to send ${file.name} to peer ${peerId}`);
            }
        }
    }
}

// Update progress bar
function updateProgress(percent) {
    const progress = Math.min(Math.floor(percent), 100); // Ensure integer value and cap at 100
    elements.progress.style.width = `${progress}%`;
    elements.transferInfo.style.display = 'block';
    
    // Only hide transfer info when transfer is complete and progress is 100%
    if (progress === 100) {
        setTimeout(() => {
            elements.transferInfo.style.display = 'none';
        }, 1000); // Keep the 100% visible briefly
    }
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

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message.charAt(0).toUpperCase() + message.slice(1);  // Ensure sentence case
    
    elements.notifications.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
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
    
    // Clear all connection timeouts
    connectionTimeouts.forEach(timeout => clearTimeout(timeout));
    connectionTimeouts.clear();
    
    isConnectionReady = false;
    transferInProgress = false;
    fileQueue = []; // Clear the file queue
    isProcessingQueue = false;
    elements.fileTransferSection.classList.add('hidden');
    elements.transferProgress.classList.add('hidden');
    elements.progress.style.width = '0%';
    elements.transferInfo.style.display = 'none';
    updateConnectionStatus('', 'Ready to connect');
}

// Event Listeners
function initEventListeners() {
    // Share ID button
    if (elements.shareId) {
        elements.shareId.addEventListener('click', shareId);
    }

    // Peer search/connect
    if (elements.peerSearch) {
        elements.peerSearch.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const remotePeerId = elements.peerSearch.value.trim();
                if (remotePeerId) {
                    connectToPeer(remotePeerId);
                }
            }
        });
    }

    // File input
    if (elements.fileInput) {
        elements.fileInput.addEventListener('change', async (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                try {
                    for (const file of files) {
                        await sendFile(file);
                    }
                } catch (error) {
                    console.error('Error sending file:', error);
                    showNotification(`Failed to send file: ${error.message}`, 'error');
                }
                // Clear the input
                e.target.value = '';
            }
        });
    }

    // Attach file button
    if (elements.attachFile) {
        elements.attachFile.addEventListener('click', () => {
            if (connections.size > 0) {
                elements.fileInput.click();
            } else {
                showNotification('Please connect to a peer first', 'error');
            }
        });
    }

    // Clear peers
    if (elements.clearPeers) {
        elements.clearPeers.addEventListener('click', () => {
            recentPeers = [];
            saveRecentPeers();
            updateRecentPeersList();
        });
    }

    // Theme toggle
    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', toggleTheme);
    }

    // QR code toggle
    if (elements.qrCodeToggle) {
        elements.qrCodeToggle.addEventListener('click', () => {
            const container = elements.qrcode.parentElement;
            if (container) {
                container.classList.toggle('hidden');
            }
        });
    }

    // Initialize chat event listeners
    initChatEventListeners();

    // Hamburger menu
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const sidebar = document.querySelector('.conversation-list');
    
    if (hamburgerMenu && sidebar) {
        hamburgerMenu.addEventListener('click', () => {
            sidebar.classList.toggle('collapsed');
            // Update hamburger icon
            const icon = hamburgerMenu.querySelector('.material-icons');
            if (icon) {
                icon.textContent = sidebar.classList.contains('collapsed') ? 'menu' : 'close';
            }
            // Adjust message container width
            adjustMessageContainerWidth();
        });
    }

    // Handle window resize
    window.addEventListener('resize', () => {
        adjustMessageContainerWidth();
    });
}

// Add function to handle message container width
function adjustMessageContainerWidth() {
    const sidebar = document.querySelector('.conversation-list');
    const messageContainer = document.querySelector('.message-input-container');
    const chatWindow = document.querySelector('.chat-window');
    
    if (sidebar && messageContainer && chatWindow) {
        if (window.innerWidth <= 768) {
            // Mobile view
            messageContainer.style.width = '100%';
            messageContainer.style.left = '0';
        } else {
            // Desktop view
            const sidebarWidth = sidebar.classList.contains('collapsed') ? 0 : 350;
            messageContainer.style.width = `calc(100% - ${sidebarWidth}px)`;
            messageContainer.style.left = `${sidebarWidth}px`;
        }
    }
}

// Initialize the application
function init() {
    if (!checkBrowserSupport()) {
        return;
    }

    initPeerJS();
    initIndexedDB();
    loadRecentPeers();
    checkUrlForPeerId();
    initConnectionKeepAlive();
    initPeerIdEditing();
    initEventListeners();
    initChat();
    
    // Initial adjustment of message container width
    adjustMessageContainerWidth();
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
    elements.statusText.textContent = message.charAt(0).toUpperCase() + message.slice(1);  // Ensure sentence case
    
    // Update title to show number of connections
    if (connections && connections.size > 0) {
        document.title = `(${connections.size}) One-Host`;
    } else {
        document.title = 'One-Host';
    }
    updateEditButtonState(); // Add this line
}

// Update files list display
function updateFilesList(listElement, fileInfo, type) {
    console.log('Updating files list:', { type, fileInfo });
    
    // Check if file already exists in this list
    const existingFile = listElement.querySelector(`[data-file-id="${fileInfo.id}"]`);
    if (existingFile) {
        console.log('File already exists in list, updating...');
        existingFile.remove();
    }

    const li = document.createElement('li');
    li.className = 'file-item';
    li.setAttribute('data-file-id', fileInfo.id);
    
    const icon = document.createElement('span');
    icon.className = 'material-icons';
    icon.textContent = getFileIcon(fileInfo.type);
    
    const info = document.createElement('div');
    info.className = 'file-info';
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.textContent = fileInfo.name;
    
    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'file-size';
    sizeSpan.textContent = formatFileSize(fileInfo.size);

    const sharedBySpan = document.createElement('span');
    sharedBySpan.className = 'shared-by';
    sharedBySpan.textContent = type === 'sent' ? 
        'Sent to connected peers' : 
        `Received from peer ${fileInfo.sharedBy || 'Unknown'}`;
    
    info.appendChild(nameSpan);
    info.appendChild(sizeSpan);
    info.appendChild(sharedBySpan);
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'icon-button';
    downloadBtn.title = 'Download file';
    downloadBtn.innerHTML = '<span class="material-icons">download</span>';
    downloadBtn.onclick = async () => {
        try {
            if (type === 'sent' && sentFileBlobs.has(fileInfo.id)) {
                // For sent files, we have the blob locally
                const blob = sentFileBlobs.get(fileInfo.id);
                downloadBlob(blob, fileInfo.name, fileInfo.id);
            } else {
                // For received files, request the blob from the original sender
                await requestAndDownloadBlob(fileInfo);
            }
        } catch (error) {
            console.error('Error downloading file:', error);
            showNotification('Failed to download file: ' + error.message, 'error');
        }
    };
    
    li.appendChild(icon);
    li.appendChild(info);
    li.appendChild(downloadBtn);
    
    // Add to the beginning of the list for newest first
    if (listElement.firstChild) {
        listElement.insertBefore(li, listElement.firstChild);
    } else {
        listElement.appendChild(li);
    }
    
    console.log('File list updated successfully');
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
if (elements.peerSearch) {
    elements.peerSearch.addEventListener('focus', () => {
        if (recentPeers.length > 0) {
            elements.recentPeers.classList.remove('hidden');
        }
    });

    elements.peerSearch.addEventListener('blur', (e) => {
        // Delay hiding to allow for click events on the list
        setTimeout(() => {
            elements.recentPeers.classList.add('hidden');
        }, 200);
    });
}

if (elements.clearPeers) {
    elements.clearPeers.addEventListener('click', () => {
        recentPeers = [];
        saveRecentPeers();
        updateRecentPeersList();
        elements.recentPeers.classList.add('hidden');
    });
}

// Initialize connection keep-alive system
function initConnectionKeepAlive() {
    // Start keep-alive interval
    keepAliveInterval = setInterval(() => {
        if (connections.size > 0 && isPageVisible) {
            sendKeepAlive();
        }
    }, KEEP_ALIVE_INTERVAL);

    // Handle page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Handle page focus/blur events
    window.addEventListener('focus', handlePageFocus);
    window.addEventListener('blur', handlePageBlur);
    
    // Handle beforeunload event
    window.addEventListener('beforeunload', handleBeforeUnload);
}

// Handle page visibility changes
function handleVisibilityChange() {
    isPageVisible = !document.hidden;
    
    if (isPageVisible) {
        console.log('Page became visible, checking connections...');
        checkConnections();
    } else {
        console.log('Page became hidden, maintaining connections...');
        sendKeepAlive();
    }
}

// Handle page focus
function handlePageFocus() {
    console.log('Page focused, checking connections...');
    checkConnections();
}

// Handle page blur
function handlePageBlur() {
    console.log('Page blurred, maintaining connections...');
    sendKeepAlive();
}

// Handle beforeunload
function handleBeforeUnload(event) {
    if (connections.size > 0) {
        sendDisconnectNotification();
    }
}

// Send keep-alive messages to all connected peers
function sendKeepAlive() {
    const keepAliveData = {
        type: 'keep-alive',
        timestamp: Date.now(),
        peerId: peer.id
    };

    for (const [peerId, conn] of connections) {
        if (conn && conn.open) {
            try {
                conn.send(keepAliveData);
                console.log(`Keep-alive sent to peer ${peerId}`);
            } catch (error) {
                console.error(`Failed to send keep-alive to peer ${peerId}:`, error);
            }
        }
    }
}

// Send disconnect notification to all peers
function sendDisconnectNotification() {
    const disconnectData = {
        type: 'disconnect-notification',
        peerId: peer.id,
        timestamp: Date.now()
    };

    for (const [peerId, conn] of connections) {
        if (conn && conn.open) {
            try {
                conn.send(disconnectData);
            } catch (error) {
                console.error(`Failed to send disconnect notification to peer ${peerId}:`, error);
            }
        }
    }
}

// Check and restore connections
function checkConnections() {
    for (const [peerId, conn] of connections) {
        if (!conn.open) {
            console.log(`Connection to ${peerId} is closed, attempting to reconnect...`);
            reconnectToPeer(peerId);
        }
    }
}

// Reconnect to a specific peer
function reconnectToPeer(peerId) {
    try {
        console.log(`Attempting to reconnect to peer: ${peerId}`);
        const newConnection = peer.connect(peerId, {
            reliable: true
        });
        connections.set(peerId, newConnection);
        setupConnectionHandlers(newConnection);
    } catch (error) {
        console.error(`Failed to reconnect to peer ${peerId}:`, error);
        connections.delete(peerId);
    }
}

// Function to download a blob
function downloadBlob(blob, fileName, fileId) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // If fileId is provided, update the UI
    if (fileId) {
        const listItem = document.querySelector(`[data-file-id="${fileId}"]`);
        if (listItem) {
            listItem.classList.add('download-completed');
            const downloadButton = listItem.querySelector('.icon-button');
            if (downloadButton) {
                downloadButton.classList.add('download-completed');
                downloadButton.innerHTML = '<span class="material-icons">open_in_new</span>';
                downloadButton.title = 'Open file';
                
                // Store the blob URL for opening the file
                const openUrl = URL.createObjectURL(blob);
                downloadButton.onclick = () => {
                    window.open(openUrl, '_blank');
                };
            }
        }
    }

    // Cleanup the download URL
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Function to handle simultaneous download request
async function handleSimultaneousDownloadRequest(data, conn) {
    console.log('Received simultaneous download request:', data);
    const { fileId } = data;
    
    // Check if we have the blob
    const blob = sentFileBlobs.get(fileId);
    if (!blob) {
        console.error('Blob not found for file:', fileId);
        conn.send({
            type: MESSAGE_TYPES.BLOB_ERROR,
            fileId: fileId,
            error: 'File not available'
        });
        return;
    }

    // Send ready signal
    conn.send({
        type: MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_READY,
        fileId: fileId,
        fileSize: blob.size
    });
}

// Function to initiate simultaneous download
async function initiateSimultaneousDownload(fileInfo) {
    const downloadingPeers = new Set();
    const readyPeers = new Set();
    let downloadStarted = false;

    // Function to start download for all ready peers
    const startDownloadForAll = () => {
        if (downloadStarted) return;
        downloadStarted = true;
        
        console.log('Starting simultaneous download for all ready peers');
        for (const [peerId, conn] of connections) {
            if (readyPeers.has(peerId)) {
                conn.send({
                    type: MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_START,
                    fileId: fileInfo.fileId
                });
            }
        }
    };

    // Request download from original sender for all connected peers
    for (const [peerId, conn] of connections) {
        if (conn && conn.open && peerId === fileInfo.originalSender) {
            downloadingPeers.add(peerId);
            conn.send({
                type: MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_REQUEST,
                fileId: fileInfo.fileId,
                fileName: fileInfo.fileName
            });
        }
    }

    // Add handlers for simultaneous download coordination
    const handleReadyResponse = (data, fromPeerId) => {
        if (data.type === MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_READY && data.fileId === fileInfo.fileId) {
            readyPeers.add(fromPeerId);
            if (readyPeers.size === downloadingPeers.size) {
                startDownloadForAll();
            }
        }
    };

    // Update connection handler to handle simultaneous downloads
    const originalDataHandler = conn.dataHandler;
    conn.on('data', (data) => {
        if (data.type === MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_READY) {
            handleReadyResponse(data, conn.peer);
        } else {
            originalDataHandler(data);
        }
    });
}

// Update the download button click handler
function createDownloadButton(fileInfo) {
    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Download';
    downloadButton.classList.add('download-button');
    downloadButton.onclick = async () => {
        try {
            showNotification(`Starting download of ${fileInfo.fileName}...`);
            await initiateSimultaneousDownload(fileInfo);
        } catch (error) {
            console.error('Error initiating simultaneous download:', error);
            showNotification(`Failed to download ${fileInfo.fileName}: ${error.message}`, 'error');
        }
    };
    return downloadButton;
}

// Check if peer ID editing is allowed
function isEditingAllowed() {
    const statusText = elements.statusText.textContent;
    const hasConnections = connections.size > 0;
    return statusText === 'Ready to connect' && !hasConnections;
}

// Update edit button state based on connection status
function updateEditButtonState() {
    if (elements.editIdButton) {
        const canEdit = isEditingAllowed();
        elements.editIdButton.disabled = !canEdit;
        elements.editIdButton.title = canEdit ? 'Edit ID' : 'Cannot edit ID while connected';
    }
}

// Start editing peer ID
function startEditingPeerId() {
    if (!isEditingAllowed()) return;
    
    const currentId = elements.peerId.textContent;
    elements.peerIdEdit.value = currentId;
    
    elements.peerId.classList.add('hidden');
    elements.peerIdEdit.classList.remove('hidden');
    elements.editIdButton.classList.add('hidden');
    elements.saveIdButton.classList.remove('hidden');
    elements.cancelEditButton.classList.remove('hidden');
    elements.peerIdEdit.focus();
    elements.peerIdEdit.select();
}

// Save edited peer ID
async function saveEditedPeerId() {
    const newPeerId = elements.peerIdEdit.value.trim();
    
    if (!newPeerId) {
        showNotification('Peer ID cannot be empty', 'error');
        return;
    }
    
    if (newPeerId.length < 3) {
        showNotification('Peer ID must be at least 3 characters', 'error');
        return;
    }

    // Validate peer ID format
    const validIdRegex = /^[A-Za-z0-9_-]+$/;
    if (!validIdRegex.test(newPeerId)) {
        showNotification('Peer ID can only contain letters, numbers, underscores, and hyphens', 'error');
        return;
    }
    
    try {
        // Show loading state
        updateConnectionStatus('connecting', 'Updating peer ID...');
        
        // Destroy existing peer if any
        if (peer) {
            peer.destroy();
            peer = null;
        }
        
        // Clear connections
        connections.clear();
        
        // Initialize new peer with custom ID
        peer = new Peer(newPeerId, {
            debug: 2,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });
        
        setupPeerHandlers();
        
        // Wait for the peer to be ready
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for peer to open'));
            }, 10000); // 10 second timeout

            peer.once('open', () => {
                clearTimeout(timeout);
                resolve();
            });

            peer.once('error', (err) => {
                clearTimeout(timeout);
                reject(err);
            });
        });

        // Update UI
        elements.peerId.textContent = newPeerId;
        cancelEditingPeerId();
        
        // Generate new QR code
        generateQRCode(newPeerId);
        
        showNotification('Peer ID updated successfully', 'success');
    } catch (error) {
        console.error('Error updating peer ID:', error);
        
        // Show specific error message for taken IDs
        if (error.type === 'unavailable-id') {
            showNotification('This ID is already taken. Please try another one.', 'error');
        } else {
            showNotification('Failed to update peer ID. Please try again.', 'error');
        }
        
        updateConnectionStatus('', 'Failed to update peer ID');
        
        // Reinitialize with auto-generated ID
        initPeerJS();
    }
}

// Cancel editing peer ID
function cancelEditingPeerId() {
    elements.peerId.classList.remove('hidden');
    elements.peerIdEdit.classList.add('hidden');
    elements.editIdButton.classList.remove('hidden');
    elements.saveIdButton.classList.add('hidden');
    elements.cancelEditButton.classList.add('hidden');
}

// Initialize peer ID editing
function initPeerIdEditing() {
    if (elements.editIdButton) {
        elements.editIdButton.addEventListener('click', startEditingPeerId);
    }
    if (elements.saveIdButton) {
        elements.saveIdButton.addEventListener('click', saveEditedPeerId);
    }
    if (elements.cancelEditButton) {
        elements.cancelEditButton.addEventListener('click', cancelEditingPeerId);
    }
    if (elements.peerIdEdit) {
        elements.peerIdEdit.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                saveEditedPeerId();
            } else if (e.key === 'Escape') {
                cancelEditingPeerId();
            }
        });
    }
}

// Message handling functions
async function sendTextMessage(text, peerId) {
    if (!text.trim()) return;
    
    const messageId = generateMessageId();
    const message = {
        id: messageId,
        type: MESSAGE_TYPES.TEXT_MESSAGE,
        content: text,
        sender: peer.id,
        receiver: peerId,
        timestamp: Date.now(),
        status: MESSAGE_STATUS.SENT
    };

    // Send to peer
    const conn = connections.get(peerId);
    if (conn && conn.open) {
        try {
            conn.send(message);
            // Add message to chat
            addMessageToChat(message, true);
            // Store message
            await storeMessage(message);
            // Clear input
            elements.messageInput.value = '';
            // Scroll to bottom
            scrollToBottom();
        } catch (error) {
            console.error('Error sending message:', error);
            showNotification('Failed to send message', 'error');
        }
    } else {
        showNotification('Connection lost. Please reconnect.', 'error');
    }
}

// Use a Map to track processed message IDs with timestamps
const processedMessages = new Map();

// Clean up old processed messages periodically
setInterval(() => {
    const now = Date.now();
    for (const [id, timestamp] of processedMessages) {
        if (now - timestamp > 300000) { // 5 minutes
            processedMessages.delete(id);
        }
    }
}, 60000); // Clean up every minute

function addMessageToChat(message, isSent) {
    // Check if message already exists
    if (document.querySelector(`.message[data-message-id="${message.id}"]`)) {
        return;
    }

    // Check if message was already processed
    if (processedMessages.has(message.id)) {
        return;
    }

    // Mark message as processed
    processedMessages.set(message.id, Date.now());

    const messageElement = document.createElement('div');
    messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
    messageElement.dataset.messageId = message.id;

    let content = '';
    if (message.type === MESSAGE_TYPES.TEXT_MESSAGE) {
        content = `<div class="message-content">${escapeHtml(message.content)}</div>`;
    } else if (message.type === MESSAGE_TYPES.FILE_INFO) {
        content = createFileMessageContent(message.content);
    }

    const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    messageElement.innerHTML = `
        ${content}
        <div class="message-footer">
            <span class="message-time">${time}</span>
            ${isSent ? createMessageStatus(message.status) : ''}
        </div>
    `;

    if (elements.messageList) {
        elements.messageList.insertBefore(messageElement, elements.messageList.firstChild);
        scrollToBottom();
    }
}

// Function to scroll to bottom of message list
function scrollToBottom() {
    if (elements.messageList) {
        elements.messageList.scrollTop = elements.messageList.scrollHeight;
    }
}

// Create file message content
function createFileMessageContent(fileInfo) {
    let content = '';
    if (fileInfo.blob) {
        // Create object URL for the blob
        const url = URL.createObjectURL(fileInfo.blob);
        content = `
            <div class="file-message">
                <span class="material-icons file-icon">${getFileIcon(fileInfo.type)}</span>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(fileInfo.name)}</div>
                    <div class="file-size">${formatFileSize(fileInfo.size)}</div>
                </div>
                <a href="${url}" download="${fileInfo.name}" class="download-button">
                    <span class="material-icons">download</span>
                </a>
            </div>
        `;
    } else {
        content = `
            <div class="file-message">
                <span class="material-icons file-icon">${getFileIcon(fileInfo.type)}</span>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(fileInfo.name)}</div>
                    <div class="file-size">${formatFileSize(fileInfo.size)}</div>
                </div>
                <div class="download-error">File not available</div>
            </div>
        `;
    }
    return content;
}

function createMessageStatus(status) {
    const icons = {
        [MESSAGE_STATUS.SENT]: 'check',
        [MESSAGE_STATUS.DELIVERED]: 'done_all',
        [MESSAGE_STATUS.READ]: 'done_all blue'
    };
    return `<span class="message-status material-icons">${icons[status] || icons.SENT}</span>`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showMessageContextMenu(event) {
    event.preventDefault();
    const messageElement = event.target.closest('.message');
    if (!messageElement) return;

    elements.contextMenu.style.display = 'block';
    elements.contextMenu.style.left = `${event.pageX}px`;
    elements.contextMenu.style.top = `${event.pageY}px`;
    elements.contextMenu.dataset.messageId = messageElement.dataset.messageId;

    document.addEventListener('click', hideMessageContextMenu);
}

function hideMessageContextMenu() {
    elements.contextMenu.style.display = 'none';
    document.removeEventListener('click', hideMessageContextMenu);
}

// Typing indicator
function sendTypingIndicator(peerId) {
    const conn = connections.get(peerId);
    if (!conn || !conn.open) return;

    conn.send({
        type: MESSAGE_TYPES.TYPING_INDICATOR,
        sender: peer.id
    });

    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        conn.send({
            type: MESSAGE_TYPES.TYPING_INDICATOR,
            sender: peer.id,
            isTyping: false
        });
    }, TYPING_TIMEOUT);
}

function handleTypingIndicator(data) {
    const { sender, isTyping } = data;
    elements.typingIndicator.classList.toggle('hidden', !isTyping);
}

// Theme handling
function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', currentTheme);
    localStorage.setItem('theme', currentTheme);
}

// Initialize theme
function initTheme() {
    document.documentElement.setAttribute('data-theme', currentTheme);
    elements.themeToggle.addEventListener('click', toggleTheme);
}

// Event Listeners
function initChatEventListeners() {
    // Hamburger menu
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', () => {
            const sidebar = document.querySelector('.conversation-list');
            sidebar.classList.toggle('collapsed');
        });
    }

    // Message input
    if (elements.messageInput) {
        elements.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const activePeer = getActivePeer();
                if (activePeer) {
                    sendTextMessage(elements.messageInput.value, activePeer);
                } else {
                    showNotification('No active peer connection', 'error');
                }
            }
        });
    }

    // Message seen detection
    const messageList = elements.messageList;
    if (messageList) {
        // Create IntersectionObserver to detect when messages are visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && document.visibilityState === 'visible') {
                    const messageEl = entry.target;
                    if (!messageEl.classList.contains('seen') && !messageEl.classList.contains('sent')) {
                        messageEl.classList.add('seen');
                        // Send seen status to peer
                        const messageId = messageEl.dataset.messageId;
                        const activePeer = getActivePeer();
                        if (activePeer) {
                            const conn = connections.get(activePeer);
                            if (conn && conn.open) {
                                conn.send({
                                    type: MESSAGE_TYPES.MESSAGE_STATUS,
                                    messageId: messageId,
                                    status: MESSAGE_STATUS.READ
                                });
                            }
                        }
                    }
                }
            });
        }, { threshold: 0.5 });

        // Observe new messages as they're added
        const observeNewMessages = (mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.classList && node.classList.contains('message')) {
                            observer.observe(node);
                        }
                    });
                }
            }
        };

        // Create MutationObserver to watch for new messages
        const messageObserver = new MutationObserver(observeNewMessages);
        messageObserver.observe(messageList, { childList: true });

        // Handle visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Check all messages in view
                document.querySelectorAll('.message:not(.seen):not(.sent)').forEach(message => {
                    if (isElementInViewport(message)) {
                        message.classList.add('seen');
                        const messageId = message.dataset.messageId;
                        const activePeer = getActivePeer();
                        if (activePeer) {
                            const conn = connections.get(activePeer);
                            if (conn && conn.open) {
                                conn.send({
                                    type: MESSAGE_TYPES.MESSAGE_STATUS,
                                    messageId: messageId,
                                    status: MESSAGE_STATUS.READ
                                });
                            }
                        }
                    }
                });
            }
        });
    }

    if (elements.sendMessage) {
        elements.sendMessage.addEventListener('click', () => {
            const activePeer = getActivePeer();
            if (activePeer) {
                sendTextMessage(elements.messageInput.value, activePeer);
            } else {
                showNotification('No active peer connection', 'error');
            }
        });
    }

    if (elements.attachFile) {
        elements.attachFile.addEventListener('click', () => {
            elements.fileInput.click();
        });
    }

    if (elements.contextMenu) {
        elements.contextMenu.addEventListener('click', (e) => {
            const action = e.target.closest('li')?.dataset.action;
            const messageId = elements.contextMenu.dataset.messageId;
            if (action && messageId) {
                handleContextMenuAction(action, messageId);
            }
            hideMessageContextMenu();
        });
    }

    if (elements.qrCodeToggle) {
        elements.qrCodeToggle.addEventListener('click', () => {
            elements.qrcode.parentElement.classList.toggle('hidden');
        });
    }

    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', toggleTheme);
    }
}

function handleContextMenuAction(action, messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (!messageElement) return;

    switch (action) {
        case 'reply':
            // TODO: Implement reply functionality
            break;
        case 'react':
            // TODO: Implement reaction functionality
            break;
        case 'copy':
            const content = messageElement.querySelector('.message-content')?.textContent;
            if (content) {
                navigator.clipboard.writeText(content);
                showNotification('Message copied to clipboard', 'success');
            }
            break;
        case 'delete':
            // TODO: Implement delete functionality
            break;
    }
}

function getActivePeer() {
    // Return the first connected peer
    for (const [peerId, conn] of connections) {
        if (conn && conn.open) {
            return peerId;
        }
    }
    return null;
}

// Initialize chat
function initChat() {
    if (!elements.messageInput || !elements.sendMessage) {
        console.warn('Chat elements not found, skipping chat initialization');
        return;
    }

    initChatEventListeners();
    initTheme();
}

// Start the application
init();
