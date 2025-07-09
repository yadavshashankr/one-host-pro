// Constants
const CHUNK_SIZE = 16384; // 16KB chunks
const DB_NAME = 'fileTransferDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // 60 seconds

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
    SIMULTANEOUS_DOWNLOAD_START: 'simultaneous-download-start'
};

// DOM Elements
const elements = {
    peerId: document.getElementById('peer-id'),
    copyId: document.getElementById('copy-id'),
    shareId: document.getElementById('share-id'),
    remotePeerId: document.getElementById('remote-peer-id'),
    connectButton: document.getElementById('connect-button'),
    fileInput: document.getElementById('file-input'),
    dropZone: document.getElementById('drop-zone'),
    transferProgress: document.getElementById('transfer-progress'),
    progress: document.getElementById('progress'),
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
    // Add new elements for peer ID editing
    peerIdEdit: document.getElementById('peer-id-edit'),
    editIdButton: document.getElementById('edit-id'),
    saveIdButton: document.getElementById('save-id'),
    cancelEditButton: document.getElementById('cancel-edit')
};

// Add notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    elements.notifications.appendChild(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
}

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
let storageManager = null; // Initialize storageManager

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

// Add this near the top with other global variables
const fileTransferHistory = new Map(); // Stores file transfer history for all peers

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
function initPeerJS() {
    try {
        console.log('Initializing PeerJS...');
        
        // Destroy existing peer if any
        if (peer) {
            console.log('Destroying existing peer connection');
            peer.destroy();
            peer = null;
        }

        // Clear existing connections
        connections.clear();

        // Create new peer with auto-generated ID
        peer = new Peer({
            debug: 2,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });

        setupPeerHandlers();

    } catch (error) {
        console.error('PeerJS Initialization Error:', error);
        updateConnectionStatus('', 'Initialization failed');
        showNotification('Failed to initialize peer connection', 'error');
    }
}

// Setup connection event handlers
function setupConnectionHandlers(conn) {
    conn.on('open', () => {
        console.log('Connection opened with:', conn.peer);
        updateConnectionStatus('connected', `Connected to ${conn.peer}`);
        isConnectionReady = true;
        elements.fileTransferSection.classList.remove('hidden');
        addRecentPeer(conn.peer);
        
        // Clear any existing timeout for this connection
        if (connectionTimeouts.has(conn.peer)) {
            clearTimeout(connectionTimeouts.get(conn.peer));
            connectionTimeouts.delete(conn.peer);
        }
        
        // Send connection notification
        conn.send({
            type: 'connection-notification',
            peerId: peer.id
        });
    });

    conn.on('data', async (data) => {
        try {
            console.log('Received data:', data);
            
            switch (data.type) {
                case 'connection-notification':
                    console.log('Received connection notification from:', data.peerId);
                    updateConnectionStatus('connected', `Connected to peer(s) : ${connections.size}`);
                    // When we receive a connection notification, send our file history
                    sendFileTransferHistory(conn);
                    break;

                case 'keep-alive':
                    console.log(`Keep-alive received from peer ${conn.peer}`);
                    conn.send({
                        type: 'keep-alive-response',
                        timestamp: Date.now(),
                        peerId: peer.id
                    });
                    break;

                case 'keep-alive-response':
                    console.log(`Keep-alive response received from peer ${conn.peer}`);
                    break;

                case 'disconnect-notification':
                    console.log(`Disconnect notification received from peer ${conn.peer}`);
                    connections.delete(conn.peer);
                    updateConnectionStatus(
                        connections.size > 0 ? 'connected' : '',
                        connections.size > 0 ? `Connected to peer(s) : ${connections.size}` : 'Disconnected'
                    );
                    showNotification(`Peer ${conn.peer} disconnected`, 'warning');
                    break;

                case 'file-start':
                    // Existing file-start handling code
                    break;

                case 'file-chunk':
                    // Existing file-chunk handling code
                    break;

                case 'file-end':
                    const { fileName, fileType, fileSize } = data;
                    const file = new File([receivedChunks[data.fileId]], fileName, { type: fileType });
                    receivedChunks[data.fileId] = null; // Clear chunks from memory
                    
                    // Add to file transfer history
                    if (!fileTransferHistory.has(conn.peer)) {
                        fileTransferHistory.set(conn.peer, []);
                    }
                    
                    const transfer = {
                        fileName,
                        fileType,
                        fileSize,
                        timestamp: new Date().toISOString(),
                        direction: 'received'
                    };
                    
                    fileTransferHistory.get(conn.peer).push(transfer);
                    
                    // Create URL for the file
                    const url = URL.createObjectURL(file);
                    transfer.url = url;
                    
                    displayReceivedFile(file, conn.peer);
                    updateFileTransferUI();
                    
                    // Broadcast the updated history to all connected peers
                    broadcastFileHistory();
                    break;

                case 'transfer-history':
                    console.log('Received file transfer history from:', conn.peer);
                    mergeFileHistory(data.history);
                    updateFileTransferUI();
                    break;

                default:
                    console.error('Unknown data type:', data.type);
            }
        } catch (error) {
            console.error('Data handling error:', error);
            showNotification('Error processing received data', 'error');
        }
    });

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        connections.delete(conn.peer);
        
        // Clear timeout for this connection
        if (connectionTimeouts.has(conn.peer)) {
            clearTimeout(connectionTimeouts.get(conn.peer));
            connectionTimeouts.delete(conn.peer);
        }
        
        updateConnectionStatus(
            connections.size > 0 ? 'connected' : '',
            connections.size > 0 ? `Connected to peer(s) : ${connections.size}` : 'Disconnected'
        );
        
        if (connections.size === 0) {
            showNotification('All peers disconnected', 'error');
        } else {
            showNotification(`Peer ${conn.peer} disconnected`, 'warning');
        }
    });

    conn.on('error', (error) => {
        console.error('Connection Error:', error);
        updateConnectionStatus('', 'Connection error');
        showNotification('Connection error occurred', 'error');
        
        // Set a timeout to attempt reconnection
        if (!connectionTimeouts.has(conn.peer)) {
            const timeout = setTimeout(() => {
                console.log(`Attempting to reconnect to ${conn.peer} after error...`);
                reconnectToPeer(conn.peer);
                connectionTimeouts.delete(conn.peer);
            }, 5000); // Wait 5 seconds before attempting reconnection
            
            connectionTimeouts.set(conn.peer, timeout);
        }
    });
}

// Helper function to generate a unique file ID
function generateFileId(file) {
    return `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
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

// Update the file selection handler
function handleFileSelect(event) {
    const files = event.target.files;
    if (!files.length) return;

    if (connections.size === 0) {
        showNotification('No peers connected. Please connect to a peer first.', 'error');
        event.target.value = ''; // Reset input
        return;
    }

    // Get the currently connected peer(s)
    const activeConnections = Array.from(connections.entries())
        .filter(([_, conn]) => conn && conn.open);

    if (activeConnections.length === 0) {
        showNotification('No active peer connections found.', 'error');
        event.target.value = ''; // Reset input
        return;
    }

    // Process each file
    Array.from(files).forEach(file => {
        console.log('Processing file:', file.name);
        activeConnections.forEach(([peerId, conn]) => {
            // Add to queue
            fileQueue.push({
                file: file,
                peerId: peerId
            });
        });
    });

    // Start processing the queue
    processFileQueue();
    
    // Reset the input so the same file can be selected again
    event.target.value = '';
}

// Update the queue processing function
async function processFileQueue() {
    if (isProcessingQueue || fileQueue.length === 0) return;

    isProcessingQueue = true;
    
    try {
        while (fileQueue.length > 0) {
            const { file, peerId } = fileQueue[0];
            
            try {
                console.log(`Processing file transfer: ${file.name} to peer: ${peerId}`);
                await sendFile(file, peerId);
                console.log(`Successfully sent ${file.name} to peer: ${peerId}`);
            } catch (error) {
                console.error(`Failed to send ${file.name} to peer ${peerId}:`, error);
                showNotification(`Failed to send ${file.name}: ${error.message}`, 'error');
            }
            
            // Remove the processed item
            fileQueue.shift();
        }
    } finally {
        isProcessingQueue = false;
    }
}

// Update drop zone event listeners
elements.dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    elements.dropZone.classList.add('drag-over');
});

elements.dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
});

elements.dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    elements.dropZone.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    if (!files.length) return;

    if (connections.size === 0) {
        showNotification('No peers connected. Please connect to a peer first.', 'error');
        return;
    }

    // Get the currently connected peer(s)
    const activeConnections = Array.from(connections.entries())
        .filter(([_, conn]) => conn && conn.open);

    if (activeConnections.length === 0) {
        showNotification('No active peer connections found.', 'error');
        return;
    }

    // Process dropped files
    Array.from(files).forEach(file => {
        console.log('Processing dropped file:', file.name);
        activeConnections.forEach(([peerId, conn]) => {
            fileQueue.push({
                file: file,
                peerId: peerId
            });
        });
    });

    // Start processing the queue
    processFileQueue();
});

// Add connect button event handler
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
        
        // Check if we have a valid peer instance
        if (!peer || peer.destroyed) {
            console.log('Peer instance not ready, reinitializing...');
            initPeerJS();
            
            // Wait for peer to be ready before connecting
            peer.once('open', () => {
                const conn = peer.connect(remotePeerIdValue, {
                    reliable: true
                });
                connections.set(remotePeerIdValue, conn);
                setupConnectionHandlers(conn);
            });
        } else {
            const conn = peer.connect(remotePeerIdValue, {
                reliable: true
            });
            connections.set(remotePeerIdValue, conn);
            setupConnectionHandlers(conn);
        }
    } catch (error) {
        console.error('Connection attempt error:', error);
        showNotification('Failed to establish connection', 'error');
        updateConnectionStatus('', 'Connection failed');
    }
});

// Add notification system
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    elements.notifications.appendChild(notification);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 500);
    }, 5000);
}

// Add drag and drop event handlers if they don't exist
function handleDragOver(event) {
    event.preventDefault();
    event.stopPropagation();
    elements.dropZone.classList.add('drag-over');
}

function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    elements.dropZone.classList.remove('drag-over');
    
    const files = event.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect({ target: { files } });
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

// Function to send file transfer history to a new peer
function sendFileTransferHistory(conn) {
    const historyArray = Array.from(fileTransferHistory.entries());
    conn.send({
        type: 'transfer-history',
        history: historyArray
    });
}

// Function to update the UI with all file transfers
function updateFileTransferUI() {
    const receivedFilesList = document.getElementById('received-files-list');
    receivedFilesList.innerHTML = ''; // Clear current list

    // Sort all transfers by timestamp
    const allTransfers = [];
    fileTransferHistory.forEach((transfers, peerId) => {
        transfers.forEach(transfer => {
            allTransfers.push({ ...transfer, peerId });
        });
    });

    allTransfers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    allTransfers.forEach(transfer => {
        const li = document.createElement('li');
        const fileIcon = document.createElement('i');
        fileIcon.className = 'fas fa-file';
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        
        const fileName = document.createElement('span');
        fileName.className = 'file-name';
        fileName.textContent = transfer.fileName;
        
        const fileDetails = document.createElement('span');
        fileDetails.className = 'file-details';
        fileDetails.textContent = `${formatFileSize(transfer.fileSize)} • ${formatTimestamp(transfer.timestamp)}`;
        
        const peerInfo = document.createElement('span');
        peerInfo.className = 'peer-info';
        peerInfo.textContent = `${transfer.direction === 'received' ? 'From' : 'To'}: ${transfer.peerId}`;
        
        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileDetails);
        fileInfo.appendChild(peerInfo);
        
        // Add download button for received files with URLs
        if (transfer.direction === 'received' && transfer.url) {
            const downloadBtn = document.createElement('a');
            downloadBtn.href = transfer.url;
            downloadBtn.download = transfer.fileName;
            downloadBtn.className = 'download-btn';
            downloadBtn.innerHTML = '<i class="fas fa-download"></i>';
            downloadBtn.title = 'Download file';
            fileInfo.appendChild(downloadBtn);
        }
        
        li.appendChild(fileIcon);
        li.appendChild(fileInfo);
        
        receivedFilesList.appendChild(li);
    });
}

// Helper function to format timestamp
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString();
}

// Function to merge received file history with local history
function mergeFileHistory(receivedHistory) {
    receivedHistory.forEach(([peerId, transfers]) => {
        if (!fileTransferHistory.has(peerId)) {
            fileTransferHistory.set(peerId, []);
        }
        
        const existingTransfers = fileTransferHistory.get(peerId);
        
        transfers.forEach(newTransfer => {
            // Check if this transfer already exists
            const exists = existingTransfers.some(existing => 
                existing.fileName === newTransfer.fileName &&
                existing.fileSize === newTransfer.fileSize &&
                existing.timestamp === newTransfer.timestamp &&
                existing.direction === newTransfer.direction
            );
            
            if (!exists) {
                existingTransfers.push(newTransfer);
            }
        });
    });
}

// Function to broadcast file history to all connected peers
function broadcastFileHistory() {
    const historyArray = Array.from(fileTransferHistory.entries());
    connections.forEach(conn => {
        if (conn.open) {
            conn.send({
                type: 'transfer-history',
                history: historyArray
            });
        }
    });
}

// Storage Manager Configuration
const STORAGE_CONFIG = {
    CHUNK_SIZE: 1024 * 1024 * 2, // 2MB chunks for better performance
    MAX_MEMORY_FILE_SIZE: 50 * 1024 * 1024, // 50MB
    INDEXEDDB_CHUNK_STORE: 'fileChunks',
    INDEXEDDB_META_STORE: 'fileMeta',
    FILE_SYSTEM_QUOTA: 1024 * 1024 * 1024 * 50 // 50GB
};

// Enhanced Storage Manager
class StorageManager {
    constructor() {
        this.db = null;
        this.fileSystem = null;
        this.capabilities = {
            fileSystem: false,
            indexedDB: false,
            webkitDirectory: false
        };
    }

    async init() {
        await this.detectCapabilities();
        await this.initStorage();
    }

    async detectCapabilities() {
        // Check File System Access API
        this.capabilities.fileSystem = 'showDirectoryPicker' in window;
        
        // Check IndexedDB
        this.capabilities.indexedDB = 'indexedDB' in window;
        
        // Check WebKit Directory API
        this.capabilities.webkitDirectory = 'webkitGetAsEntry' in DataTransferItem.prototype;
    }

    async initStorage() {
        // Initialize IndexedDB with new stores
        if (this.capabilities.indexedDB) {
            const request = indexedDB.open(DB_NAME, DB_VERSION + 1);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create stores if they don't exist
                if (!db.objectStoreNames.contains(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE)) {
                    db.createObjectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                }
                if (!db.objectStoreNames.contains(STORAGE_CONFIG.INDEXEDDB_META_STORE)) {
                    db.createObjectStore(STORAGE_CONFIG.INDEXEDDB_META_STORE);
                }
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };

            return new Promise((resolve, reject) => {
                request.onsuccess = (event) => {
                    this.db = event.target.result;
                    resolve();
                };
                request.onerror = () => reject(request.error);
            });
        }
    }

    async requestStorageAccess() {
        try {
            if (this.capabilities.fileSystem) {
                // Request File System Access API permission
                const dirHandle = await window.showDirectoryPicker({
                    mode: 'readwrite',
                    startIn: 'downloads'
                });
                this.fileSystem = dirHandle;
                return true;
            } else if (this.capabilities.webkitDirectory) {
                // Safari/WebKit specific handling
                return new Promise((resolve) => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.webkitdirectory = true;
                    
                    input.onchange = () => {
                        if (input.files.length > 0) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    };
                    
                    input.click();
                });
            }
            return false;
        } catch (error) {
            console.error('Storage access request failed:', error);
            return false;
        }
    }

    async storeFileChunk(fileId, chunkIndex, chunkData) {
        if (this.capabilities.fileSystem && this.fileSystem) {
            try {
                const fileHandle = await this.fileSystem.getFileHandle(`${fileId}_${chunkIndex}`, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(chunkData);
                await writable.close();
                return true;
            } catch (error) {
                console.error('File System API storage failed:', error);
                // Fallback to IndexedDB
            }
        }
        
        if (this.capabilities.indexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE, 'readwrite');
                const store = transaction.objectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                const request = store.put(chunkData, `${fileId}_${chunkIndex}`);
                
                request.onsuccess = () => resolve(true);
                request.onerror = () => reject(request.error);
            });
        }
        
        throw new Error('No storage method available');
    }

    async getFileChunk(fileId, chunkIndex) {
        if (this.capabilities.fileSystem && this.fileSystem) {
            try {
                const fileHandle = await this.fileSystem.getFileHandle(`${fileId}_${chunkIndex}`);
                const file = await fileHandle.getFile();
                return await file.arrayBuffer();
            } catch (error) {
                console.error('File System API retrieval failed:', error);
                // Fallback to IndexedDB
            }
        }
        
        if (this.capabilities.indexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE, 'readonly');
                const store = transaction.objectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                const request = store.get(`${fileId}_${chunkIndex}`);
                
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
        }
        
        throw new Error('No storage method available');
    }

    async cleanup(fileId) {
        if (this.capabilities.fileSystem && this.fileSystem) {
            try {
                const entries = await this.fileSystem.entries();
                for await (const [name, handle] of entries) {
                    if (name.startsWith(`${fileId}_`)) {
                        await this.fileSystem.removeEntry(name);
                    }
                }
            } catch (error) {
                console.error('File System API cleanup failed:', error);
            }
        }
        
        if (this.capabilities.indexedDB && this.db) {
            return new Promise((resolve, reject) => {
                const transaction = this.db.transaction(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE, 'readwrite');
                const store = transaction.objectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                const request = store.openCursor();
                
                request.onsuccess = () => {
                    const cursor = request.result;
                    if (cursor) {
                        if (cursor.key.startsWith(`${fileId}_`)) {
                            cursor.delete();
                        }
                        cursor.continue();
                    } else {
                        resolve();
                    }
                };
                request.onerror = () => reject(request.error);
            });
        }
    }
}

// Update readFileChunk function to use storage manager
async function readFileChunk(file, offset, length) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const blob = file.slice(offset, offset + length);
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
    });
}

// Update sendFile function to use enhanced chunked transfer
async function sendFile(file, peerId) {
    try {
        const conn = connections.get(peerId);
        if (!conn) {
            throw new Error('No connection found for peer: ' + peerId);
        }

        // Generate unique file ID
        const fileId = generateFileId(file);
        const chunkSize = STORAGE_CONFIG.CHUNK_SIZE;
        let offset = 0;
        let chunkIndex = 0;
        
        // Request storage access if needed for large files
        if (file.size > STORAGE_CONFIG.MAX_MEMORY_FILE_SIZE) {
            const hasAccess = await storageManager.requestStorageAccess();
            if (!hasAccess) {
                throw new Error('Storage access denied. Required for large files.');
            }
        }

        // Send file header
        conn.send({
            type: MESSAGE_TYPES.FILE_HEADER,
            fileId: fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            chunkSize: chunkSize
        });

        // Update UI to show progress
        updateTransferProgress(0);
        elements.transferProgress.classList.remove('hidden');

        // Read and send file in chunks
        while (offset < file.size) {
            const chunk = await readFileChunk(file, offset, chunkSize);
            
            // Store chunk if file is large
            if (file.size > STORAGE_CONFIG.MAX_MEMORY_FILE_SIZE) {
                await storageManager.storeFileChunk(fileId, chunkIndex, chunk);
            }
            
            conn.send({
                type: MESSAGE_TYPES.FILE_CHUNK,
                fileId: fileId,
                chunk: chunk,
                offset: offset,
                index: chunkIndex
            });

            offset += chunk.byteLength;
            chunkIndex++;
            
            const progress = Math.min(100, Math.round((offset / file.size) * 100));
            updateTransferProgress(progress);
            updateTransferInfo(`Sending: ${progress}%`);

            // Add a small delay between chunks to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Send file complete message
        conn.send({
            type: MESSAGE_TYPES.FILE_COMPLETE,
            fileId: fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            totalChunks: chunkIndex
        });

        // Update UI on completion
        updateTransferProgress(100);
        setTimeout(() => {
            elements.transferProgress.classList.add('hidden');
            updateTransferInfo('');
        }, 1000);

        // Cleanup stored chunks if necessary
        if (file.size > STORAGE_CONFIG.MAX_MEMORY_FILE_SIZE) {
            await storageManager.cleanup(fileId);
        }

        // Add to transfer history
        const transfer = {
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            timestamp: new Date().toISOString(),
            direction: 'sent',
            peerId: peerId
        };
        
        if (!fileTransferHistory.has(peerId)) {
            fileTransferHistory.set(peerId, []);
        }
        fileTransferHistory.get(peerId).push(transfer);
        updateFileTransferUI();
        broadcastFileHistory();

        console.log(`File transfer completed to peer: ${peerId}`);
        return true;

    } catch (error) {
        console.error('Error sending file:', error);
        showNotification(`Failed to send file: ${error.message}`, 'error');
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');
        throw error;
    }
}

// Update handleFileChunk to use storage manager for large files
async function handleFileChunk(data) {
    try {
        const { fileId, chunk, offset, index } = data;
        const fileInfo = fileChunks[fileId];
        
        if (!fileInfo) {
            throw new Error('No file info found for chunk');
        }

        // Store chunk if file is large
        if (fileInfo.size > STORAGE_CONFIG.MAX_MEMORY_FILE_SIZE) {
            await storageManager.storeFileChunk(fileId, index, chunk);
            fileInfo.receivedChunks.add(index);
        } else {
            fileInfo.chunks.push(chunk);
        }

        fileInfo.receivedSize += chunk.byteLength;
        const progress = Math.round((fileInfo.receivedSize / fileInfo.size) * 100);
        updateTransferProgress(progress);
        updateTransferInfo(`Receiving: ${progress}%`);

    } catch (error) {
        console.error('Error handling file chunk:', error);
        showNotification('Error receiving file chunk', 'error');
    }
}

// Update handleFileComplete to handle large files
async function handleFileComplete(data) {
    try {
        const { fileId, fileName, fileType, fileSize, totalChunks } = data;
        const fileInfo = fileChunks[fileId];
        
        if (!fileInfo) {
            throw new Error('No file info found');
        }

        let finalBlob;
        
        if (fileSize > STORAGE_CONFIG.MAX_MEMORY_FILE_SIZE) {
            // Reconstruct file from stored chunks
            const chunks = [];
            for (let i = 0; i < totalChunks; i++) {
                const chunk = await storageManager.getFileChunk(fileId, i);
                chunks.push(chunk);
            }
            finalBlob = new Blob(chunks, { type: fileType });
            
            // Cleanup stored chunks
            await storageManager.cleanup(fileId);
        } else {
            finalBlob = new Blob(fileInfo.chunks, { type: fileType });
        }

        // Create object URL for the file
        const url = URL.createObjectURL(finalBlob);

        // Update transfer history
        const transfer = {
            fileName,
            fileType,
            fileSize,
            timestamp: new Date().toISOString(),
            direction: 'received',
            url,
            peerId: fileInfo.peerId
        };

        if (!fileTransferHistory.has(fileInfo.peerId)) {
            fileTransferHistory.set(fileInfo.peerId, []);
        }
        fileTransferHistory.get(fileInfo.peerId).push(transfer);
        updateFileTransferUI();
        broadcastFileHistory();

        // Cleanup
        delete fileChunks[fileId];
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');
        
        showNotification(`Received: ${fileName}`, 'success');

    } catch (error) {
        console.error('Error completing file transfer:', error);
        showNotification('Error completing file transfer', 'error');
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');
    }
}

// Update handleFileHeader to prepare for large files
async function handleFileHeader(data) {
    const { fileId, fileName, fileType, fileSize, chunkSize } = data;
    
    fileChunks[fileId] = {
        fileName,
        fileType,
        size: fileSize,
        receivedSize: 0,
        chunks: [],
        receivedChunks: new Set(),
        peerId: data.peerId || 'unknown'
    };

    // Show progress UI
    elements.transferProgress.classList.remove('hidden');
    updateTransferProgress(0);
    updateTransferInfo('Receiving: 0%');
}

// Helper function to update transfer progress
function updateTransferProgress(percent) {
    elements.progress.style.width = `${percent}%`;
    elements.progress.setAttribute('aria-valuenow', percent);
}
