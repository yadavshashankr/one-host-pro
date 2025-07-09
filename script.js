// Constants
const CHUNK_SIZE = 1024 * 1024 * 2; // 2MB chunks for better performance
const DB_NAME = 'fileTransferDB';
const DB_VERSION = 2; // Updated version for new stores
const STORE_NAME = 'recentPeers'; // Store for recent peers
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
    SIMULTANEOUS_DOWNLOAD_START: 'simultaneous-download-start',
    BLOB_DATA: 'blob-data'
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
    cancelEditButton: document.getElementById('cancel-edit'),
    fileHistory: document.getElementById('file-history')
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
    const missingFeatures = [];

    // Check WebRTC support
    if (!window.RTCPeerConnection || !navigator.mediaDevices) {
        missingFeatures.push('WebRTC');
    }

    // Check IndexedDB support
    if (!window.indexedDB) {
        missingFeatures.push('IndexedDB');
    }

    // Check Blob support
    if (!window.Blob || !window.File || !window.FileReader) {
        missingFeatures.push('File API');
    }

    // Check Promise support
    if (!window.Promise) {
        missingFeatures.push('Promises');
    }

    // Check async/await support
    try {
        eval('(async () => {})()');
    } catch (e) {
        missingFeatures.push('Async/Await');
    }

    // Check ArrayBuffer support
    if (!window.ArrayBuffer) {
        missingFeatures.push('ArrayBuffer');
    }

    // Check FileSystem API support
    if (!window.showDirectoryPicker && !window.webkitRequestFileSystem) {
        console.log('FileSystem API not available, will use fallback storage');
    }

    // Check Web Workers support
    if (!window.Worker) {
        console.log('Web Workers not available, some features may be limited');
    }

    if (missingFeatures.length > 0) {
        elements.browserSupport.classList.remove('hidden');
        elements.browserSupport.textContent = `Your browser is missing required features: ${missingFeatures.join(', ')}`;
        showNotification('Your browser may not support all features', 'warning');
        return false;
    }

    elements.browserSupport.classList.add('hidden');
    return true;
}

// Initialize IndexedDB
async function initIndexedDB() {
    return new Promise((resolve, reject) => {
        try {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            
            request.onerror = (event) => {
                showNotification('IndexedDB initialization failed', 'error');
                reject(new Error('IndexedDB initialization failed'));
            };

            request.onupgradeneeded = (event) => {
                try {
                    const db = event.target.result;
                    
                    // Create stores if they don't exist
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    }
                    if (!db.objectStoreNames.contains(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE)) {
                        db.createObjectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                    }
                    if (!db.objectStoreNames.contains(STORAGE_CONFIG.INDEXEDDB_META_STORE)) {
                        db.createObjectStore(STORAGE_CONFIG.INDEXEDDB_META_STORE);
                    }
                } catch (error) {
                    console.error('Error during database upgrade:', error);
                    reject(error);
                }
            };

            request.onsuccess = (event) => {
                try {
                    db = event.target.result;
                    resolve(db);
                } catch (error) {
                    console.error('Error during database success:', error);
                    reject(error);
                }
            };

            request.onblocked = (event) => {
                console.error('Database initialization blocked:', event);
                reject(new Error('Database initialization blocked'));
            };
        } catch (error) {
            console.error('IndexedDB Error:', error);
            showNotification('Storage initialization failed', 'error');
            reject(error);
        }
    });
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
    console.log('Setting up peer event handlers...');
    
    peer.on('open', (id) => {
        console.log('Peer connection opened with ID:', id);
        elements.peerId.textContent = id;
        updateConnectionStatus('', 'Ready to connect');
        isConnectionReady = true;
        generateQRCode(id);
        
        // Initialize share button after we have a peer ID
        console.log('Initializing share button');
        initShareButton();
        
        // Show the file transfer section
        console.log('Showing file transfer section');
        elements.fileTransferSection.classList.remove('hidden');
    });

    peer.on('error', (error) => {
        console.error('Peer Error:', error);
        console.error('Error type:', error.type);
        let errorMessage = 'Connection error occurred';
        
        if (error.type === 'network') {
            errorMessage = 'Network connection error';
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
        
        console.error('Error message:', errorMessage);
        updateConnectionStatus('', errorMessage);
        showNotification(errorMessage, 'error');

        // If this was during a custom ID setup, revert to auto-generated ID
        if (elements.peerIdEdit && !elements.peerIdEdit.classList.contains('hidden')) {
            console.log('Reverting to auto-generated ID');
            cancelEditingPeerId();
            setTimeout(() => {
                console.log('Reinitializing PeerJS');
                initPeerJS();
            }, 1000); // Reinitialize with delay
        }
    });

    peer.on('disconnected', () => {
        console.log('Peer disconnected from server');
        updateConnectionStatus('', 'Disconnected');
        isConnectionReady = false;
        
        // Try to reconnect
        console.log('Attempting to reconnect in 3 seconds...');
        setTimeout(() => {
            if (peer && !peer.destroyed) {
                console.log('Attempting to reconnect to server...');
                peer.reconnect();
            }
        }, 3000);
    });

    peer.on('close', () => {
        console.log('Peer connection closed');
        updateConnectionStatus('', 'Connection closed');
        isConnectionReady = false;
        elements.fileTransferSection.classList.add('hidden');
    });

    // Add connection handler
    peer.on('connection', (conn) => {
        console.log('Incoming connection from:', conn.peer);
        connections.set(conn.peer, conn);
        setupConnectionHandlers(conn);
    });
    
    console.log('Peer event handlers set up successfully');
}

// Initialize PeerJS
function initPeerJS() {
    return new Promise((resolve, reject) => {
        try {
            console.log('Initializing PeerJS...');
            
            // Destroy existing peer if any
            if (peer) {
                console.log('Destroying existing peer connection');
                peer.destroy();
                peer = null;
            }

            // Clear existing connections
            console.log('Clearing existing connections');
            connections.clear();

            // Create new peer with auto-generated ID
            console.log('Creating new peer with auto-generated ID');
            peer = new Peer({
                debug: 2,
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:global.stun.twilio.com:3478' }
                    ]
                }
            });

            // Add one-time open handler for initialization
            peer.once('open', () => {
                console.log('PeerJS initialized successfully with ID:', peer.id);
                resolve();
            });

            // Add error handler for initialization
            peer.once('error', (error) => {
                console.error('PeerJS initialization error:', error);
                if (error.type) {
                    console.error('Error type:', error.type);
                }
                reject(error);
            });

            // Setup regular event handlers
            console.log('Setting up peer event handlers');
            setupPeerHandlers();

            // Add timeout for initialization
            console.log('Setting initialization timeout');
            setTimeout(() => {
                if (!peer.id) {
                    const error = new Error('PeerJS initialization timeout');
                    console.error(error);
                    peer.destroy();
                    reject(error);
                }
            }, 10000); // 10 second timeout

        } catch (error) {
            console.error('PeerJS Initialization Error:', error);
            reject(error);
        }
    });
}

// Setup connection event handlers
function setupConnectionHandlers(conn) {
    console.log('Setting up connection handlers for peer:', conn.peer);
    
    conn.on('open', () => {
        console.log('Connection opened with:', conn.peer);
        updateConnectionStatus('connected', `Connected to ${conn.peer}`);
        isConnectionReady = true;
        elements.fileTransferSection.classList.remove('hidden');
        addRecentPeer(conn.peer);
        
        // Clear any existing timeout for this connection
        if (connectionTimeouts.has(conn.peer)) {
            console.log('Clearing existing timeout for peer:', conn.peer);
            clearTimeout(connectionTimeouts.get(conn.peer));
            connectionTimeouts.delete(conn.peer);
        }
        
        // Send connection notification
        console.log('Sending connection notification to:', conn.peer);
        conn.send({
            type: 'connection-notification',
            peerId: peer.id
        });
    });

    conn.on('error', (error) => {
        console.error('Connection error with peer:', conn.peer, error);
        showNotification(`Connection error with peer ${conn.peer}`, 'error');
        
        // Remove the connection from our map
        console.log('Removing connection for peer:', conn.peer);
        connections.delete(conn.peer);
        
        // Update status
        const newStatus = connections.size > 0 ? 'connected' : '';
        const newMessage = connections.size > 0 ? `Connected to peer(s) : ${connections.size}` : 'Connection error';
        console.log('Updating connection status:', newStatus, newMessage);
        updateConnectionStatus(newStatus, newMessage);
        
        // Hide file transfer section if no connections
        if (connections.size === 0) {
            console.log('No active connections, hiding file transfer section');
            elements.fileTransferSection.classList.add('hidden');
        }
        
        // Try to reconnect
        console.log('Scheduling reconnection attempt to:', conn.peer);
        setTimeout(() => {
            if (!connections.has(conn.peer) && peer && !peer.destroyed) {
                console.log('Attempting to reconnect to:', conn.peer);
                const newConn = peer.connect(conn.peer);
                connections.set(conn.peer, newConn);
                setupConnectionHandlers(newConn);
            }
        }, 3000);
    });

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        
        // Remove the connection from our map
        console.log('Removing connection for peer:', conn.peer);
        connections.delete(conn.peer);
        
        // Update status
        const newStatus = connections.size > 0 ? 'connected' : '';
        const newMessage = connections.size > 0 ? `Connected to peer(s) : ${connections.size}` : 'Disconnected';
        console.log('Updating connection status:', newStatus, newMessage);
        updateConnectionStatus(newStatus, newMessage);
        
        // Hide file transfer section if no connections
        if (connections.size === 0) {
            console.log('No active connections, hiding file transfer section');
            elements.fileTransferSection.classList.add('hidden');
        }
        
        showNotification(`Disconnected from peer ${conn.peer}`, 'warning');
    });

    conn.on('data', async (data) => {
        try {
            console.log('Received data from peer:', conn.peer, 'Type:', data.type);
            
            switch (data.type) {
                case 'connection-notification':
                    console.log('Received connection notification from:', data.peerId);
                    updateConnectionStatus('connected', `Connected to peer(s) : ${connections.size}`);
                    // When we receive a connection notification, send our file history
                    console.log('Sending file transfer history to:', conn.peer);
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

                case 'file-info':
                    console.log('Received file info from peer:', conn.peer);
                    await handleFileHeader(data);
                    break;

                case 'file-chunk':
                    console.log('Received file chunk from peer:', conn.peer, 'Chunk:', data.chunkIndex);
                    await handleFileChunk(data);
                    break;

                case 'file-complete':
                    console.log('Received file complete from peer:', conn.peer);
                    await handleFileComplete(data);
                    break;

                case 'blob-request':
                    console.log('Received blob request from peer:', conn.peer);
                    await handleBlobRequest(data, conn);
                    break;

                default:
                    console.warn('Received unknown data type:', data.type, 'from peer:', conn.peer);
            }
        } catch (error) {
            console.error('Error handling data from peer:', conn.peer, error);
            showNotification(`Error handling data: ${error.message}`, 'error');
        }
    });
    
    console.log('Connection handlers set up successfully for peer:', conn.peer);
}

// Helper function to generate a unique file ID
function generateFileId(file) {
    return `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Handle incoming file header
async function handleFileHeader(data) {
    console.log('Received file header:', {
        fileName: data.fileName,
        fileSize: formatFileSize(data.fileSize),
        fileId: data.fileId
    });

    try {
        // Initialize file data structure
        fileChunks[data.fileId] = {
            fileName: data.fileName,
            fileType: data.fileType,
            size: data.fileSize,
            chunks: [],
            receivedChunks: new Set(),
            receivedSize: 0,
            totalChunks: data.totalChunks
        };

        // Show progress bar
        elements.transferProgress.classList.remove('hidden');
        updateTransferProgress(0);
        updateTransferInfo(`Receiving ${data.fileName}...`);

        console.log('File header processed successfully');
    } catch (error) {
        console.error('Error handling file header:', error);
        showNotification(`Error receiving file: ${error.message}`, 'error');
        throw error;
    }
}

// Handle file chunk
async function handleFileChunk(data) {
    try {
        console.log('Processing file chunk:', {
            fileId: data.fileId,
            chunkIndex: data.chunkIndex,
            chunkSize: data.data.byteLength
        });

        const fileData = fileChunks[data.fileId];
        if (!fileData) {
            console.error('No file data found for file ID:', data.fileId);
            return;
        }
        console.log('File data found:', {
            fileName: fileData.fileName,
            totalSize: fileData.size,
            receivedSize: fileData.receivedSize
        });

        // Store the chunk
        if (fileData.size > STORAGE_CONFIG.MAX_MEMORY_FILE_SIZE) {
            console.log('Large file detected, storing chunk in storage manager...');
            try {
                await storageManager.storeFileChunk(data.fileId, data.chunkIndex, data.data);
                fileData.receivedChunks.add(data.chunkIndex);
                fileData.receivedSize += data.data.byteLength;
                console.log('Chunk stored successfully:', {
                    chunkIndex: data.chunkIndex,
                    chunkSize: data.data.byteLength,
                    totalReceived: fileData.receivedSize
                });
            } catch (error) {
                console.error('Error storing chunk:', error);
                throw error;
            }
        } else {
            console.log('Small file, storing chunk in memory...');
            fileData.chunks.push(data.data);
            fileData.receivedSize += data.data.byteLength;
            console.log('Chunk stored in memory:', {
                chunkIndex: fileData.chunks.length - 1,
                chunkSize: data.data.byteLength,
                totalReceived: fileData.receivedSize
            });
        }

        // Calculate and update progress
        const progress = (fileData.receivedSize / fileData.size) * 100;
        console.log('File transfer progress:', {
            received: fileData.receivedSize,
            total: fileData.size,
            progress: progress.toFixed(2) + '%',
            chunksReceived: fileData.size > STORAGE_CONFIG.MAX_MEMORY_FILE_SIZE ? 
                fileData.receivedChunks.size : 
                fileData.chunks.length
        });

        // Update progress bar (update every 1% change)
        if (!fileData.lastProgressUpdate || progress - fileData.lastProgressUpdate >= 1) {
            console.log('Updating progress bar:', progress.toFixed(2) + '%');
            updateTransferProgress(progress);
            fileData.lastProgressUpdate = progress;
        }

        // Update transfer info
        const receivedMB = (fileData.receivedSize / 1024 / 1024).toFixed(2);
        const totalMB = (fileData.size / 1024 / 1024).toFixed(2);
        const transferInfo = `Receiving: ${fileData.fileName} (${receivedMB}MB / ${totalMB}MB)`;
        console.log('Updating transfer info:', transferInfo);
        updateTransferInfo(transferInfo);

    } catch (error) {
        console.error('Error handling file chunk:', error);
        showNotification(`Error processing file chunk: ${error.message}`, 'error');
        throw error;
    }
}

// Handle file transfer completion
async function handleFileComplete(data) {
    console.log('Received file completion message:', {
        fileName: data.fileName,
        fileId: data.fileId
    });

    try {
        const fileData = fileChunks[data.fileId];
        if (!fileData) {
            throw new Error('No file data found');
        }

        let finalBlob;
        if (fileData.size > STORAGE_CONFIG.MAX_MEMORY_FILE_SIZE) {
            // Retrieve chunks from storage manager
            console.log('Retrieving large file chunks from storage');
            const chunks = [];
            for (let i = 0; i < fileData.totalChunks; i++) {
                const chunk = await storageManager.getFileChunk(data.fileId, i);
                if (!chunk) {
                    throw new Error(`Missing chunk ${i}`);
                }
                chunks.push(chunk);
            }
            finalBlob = new Blob(chunks, { type: fileData.fileType });
            
            // Clean up storage
            await storageManager.cleanup(data.fileId);
        } else {
            // Combine chunks in memory
            console.log('Combining file chunks in memory');
            finalBlob = new Blob(fileData.chunks, { type: fileData.fileType });
        }

        // Hide progress bar
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');

        // Add to transfer history
        console.log('Updating transfer history');
        const transfer = {
            fileId: data.fileId,
            fileName: fileData.fileName,
            fileSize: fileData.size,
            fileType: fileData.fileType,
            timestamp: new Date().toISOString(),
            direction: 'received',
            peerId: peer.id
        };

        if (!fileTransferHistory.has(peer.id)) {
            fileTransferHistory.set(peer.id, []);
        }
        fileTransferHistory.get(peer.id).push(transfer);

        // Update UI and broadcast history
        console.log('Updating UI and broadcasting history');
        updateFileTransferUI();
        broadcastFileHistory();

        // Clean up
        delete fileChunks[data.fileId];

        console.log('File transfer completed successfully');
        showNotification(`File ${fileData.fileName} received successfully`, 'success');

    } catch (error) {
        console.error('Error completing file transfer:', error);
        showNotification(`Error receiving file: ${error.message}`, 'error');
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');
        throw error;
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
    console.log('Received blob request:', {
        fileId,
        forwardTo,
        fromPeer: conn.peer
    });

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
    console.log('Blob found:', {
        size: blob.size,
        type: blob.type
    });

    // If this is a forwarded request, send to original requester
    if (forwardTo) {
        console.log('Forwarding blob to:', forwardTo);
        const forwardConn = connections.get(forwardTo);
        if (!forwardConn) {
            console.error('No connection found for forward target:', forwardTo);
            conn.send({
                type: MESSAGE_TYPES.BLOB_ERROR,
                fileId: fileId,
                error: 'Forward connection not found'
            });
            return;
        }

        try {
            console.log('Sending blob to forward target...');
            forwardConn.send({
                type: MESSAGE_TYPES.BLOB_DATA,
                fileId: fileId,
                blob: blob
            });
            console.log('Blob forwarded successfully');
        } catch (error) {
            console.error('Error forwarding blob:', error);
            conn.send({
                type: MESSAGE_TYPES.BLOB_ERROR,
                fileId: fileId,
                error: 'Forward failed: ' + error.message
            });
        }
    } else {
        // Send directly to requester
        try {
            console.log('Sending blob to requester...');
            conn.send({
                type: MESSAGE_TYPES.BLOB_DATA,
                fileId: fileId,
                blob: blob
            });
            console.log('Blob sent successfully');
        } catch (error) {
            console.error('Error sending blob:', error);
            conn.send({
                type: MESSAGE_TYPES.BLOB_ERROR,
                fileId: fileId,
                error: 'Send failed: ' + error.message
            });
        }
    }
}

// Function to request and download a blob
async function requestAndDownloadBlob(fileInfo) {
    try {
        console.log('Starting blob download request:', {
            fileName: fileInfo.name,
            fileId: fileInfo.id,
            sharedBy: fileInfo.sharedBy
        });

        // Always try to connect to original sender directly
        let conn = connections.get(fileInfo.sharedBy);
        
        if (!conn || !conn.open) {
            console.log('No direct connection to sender, establishing connection...');
            conn = peer.connect(fileInfo.sharedBy, {
                reliable: true
            });
            console.log('Connection initiated');
            
            // Wait for connection to open
            console.log('Waiting for connection to open...');
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    console.error('Connection timeout');
                    reject(new Error('Connection timeout'));
                }, 10000); // 10 second timeout

                conn.on('open', () => {
                    console.log('Connection opened successfully');
                    clearTimeout(timeout);
                    connections.set(fileInfo.sharedBy, conn);
                    setupConnectionHandlers(conn);
                    resolve();
                });

                conn.on('error', (err) => {
                    console.error('Connection error:', err);
                    clearTimeout(timeout);
                    reject(err);
                });
            });
            console.log('Connection established successfully');
        } else {
            console.log('Using existing connection to sender');
        }

        // Now we should have a direct connection to the sender
        console.log('Preparing UI for transfer...');
        elements.transferProgress.classList.remove('hidden');
        updateProgress(0);
        updateTransferInfo(`Requesting ${fileInfo.name} directly from sender...`);
        console.log('UI prepared');

        // Request the file directly
        console.log('Sending blob request...');
        conn.send({
            type: 'blob-request',
            fileId: fileInfo.id,
            fileName: fileInfo.name,
            directRequest: true
        });
        console.log('Blob request sent');

    } catch (error) {
        console.error('Error requesting file:', error);
        showNotification(`Failed to download file: ${error.message}`, 'error');
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');
        throw error;
    }
}

// Handle forwarded blob request (host only)
async function handleForwardedBlobRequest(data, fromConn) {
    console.log('Handling forwarded blob request:', {
        fileId: data.fileId,
        fileName: data.fileName,
        originalSender: data.originalSender,
        requesterId: data.requesterId,
        fromPeer: fromConn.peer
    });
    
    // Find connection to original sender
    const originalSenderConn = connections.get(data.originalSender);
    if (!originalSenderConn || !originalSenderConn.open) {
        console.error('Original sender not connected:', data.originalSender);
        fromConn.send({
            type: 'blob-error',
            fileId: data.fileId,
            error: 'Original sender not connected to host'
        });
        return;
    }
    console.log('Found connection to original sender:', data.originalSender);

    // Request blob from original sender with forwarding info
    console.log('Forwarding request to original sender...');
    try {
        originalSenderConn.send({
            type: 'blob-request',
            fileId: data.fileId,
            fileName: data.fileName,
            forwardTo: data.requesterId
        });
        console.log('Request forwarded successfully');
    } catch (error) {
        console.error('Error forwarding request:', error);
        fromConn.send({
            type: 'blob-error',
            fileId: data.fileId,
            error: 'Failed to forward request: ' + error.message
        });
    }
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
    console.log('Starting to process file queue:', fileQueue.length, 'files');
    
    try {
        while (fileQueue.length > 0) {
            const { file, peerId } = fileQueue[0];
            
            try {
                console.log(`Processing file transfer: ${file.name} to peer: ${peerId}`);
                updateTransferInfo(`Sending ${file.name} to ${peerId}...`);
                await sendFile(file, peerId);
                console.log(`Successfully sent ${file.name} to peer: ${peerId}`);
                
                // Add to transfer history
                const transfer = {
                    fileName: file.name,
                    fileSize: file.size,
                    fileType: file.type,
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
            } catch (error) {
                console.error(`Failed to send ${file.name} to peer ${peerId}:`, error);
                showNotification(`Failed to send ${file.name}: ${error.message}`, 'error');
            }
            
            // Remove the processed item
            fileQueue.shift();
            
            // Small delay between files to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    } finally {
        isProcessingQueue = false;
        updateTransferInfo('');
        console.log('File queue processing completed');
    }
}

// Initialize event listeners for file handling
function initFileHandlers() {
    console.log('Initializing file handlers');
    
    // File input handler
    elements.fileInput.addEventListener('change', handleFileSelect);
    
    // Make the drop zone clickable
    elements.dropZone.addEventListener('click', () => {
        console.log('Drop zone clicked, triggering file input');
        elements.fileInput.click();
    });
    
    // Drag and drop handlers
    elements.dropZone.addEventListener('dragover', handleDragOver);
    elements.dropZone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        elements.dropZone.classList.remove('drag-over');
    });
    elements.dropZone.addEventListener('drop', handleDrop);
    
    // Add cursor pointer to drop zone
    elements.dropZone.style.cursor = 'pointer';
    
    console.log('File handlers initialized');
}

// Handle drag and drop events
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
    console.log('Files dropped:', files?.length);
    
    if (!files?.length) {
        console.log('No files in drop');
        return;
    }

    if (connections.size === 0) {
        console.warn('No peers connected');
        showNotification('No peers connected. Please connect to a peer first.', 'error');
        return;
    }

    // Get the currently connected peer(s)
    const activeConnections = Array.from(connections.entries())
        .filter(([_, conn]) => conn && conn.open);

    if (activeConnections.length === 0) {
        console.warn('No active peer connections found');
        showNotification('No active peer connections found.', 'error');
        return;
    }

    console.log('Active connections:', activeConnections.length);

    // Process dropped files
    Array.from(files).forEach(file => {
        console.log('Adding dropped file to queue:', {
            name: file.name,
            size: formatFileSize(file.size),
            type: file.type
        });
        
        activeConnections.forEach(([peerId, conn]) => {
            fileQueue.push({
                file: file,
                peerId: peerId
            });
        });
    });

    // Start processing the queue
    console.log('Starting queue processing');
    processFileQueue();
}

// Update the file selection handler
function handleFileSelect(event) {
    const files = event.target.files;
    console.log('Files selected:', files?.length);
    
    if (!files?.length) {
        console.log('No files selected');
        return;
    }

    if (connections.size === 0) {
        console.warn('No peers connected');
        showNotification('No peers connected. Please connect to a peer first.', 'error');
        event.target.value = ''; // Reset input
        return;
    }

    // Get the currently connected peer(s)
    const activeConnections = Array.from(connections.entries())
        .filter(([_, conn]) => conn && conn.open);

    if (activeConnections.length === 0) {
        console.warn('No active peer connections found');
        showNotification('No active peer connections found.', 'error');
        event.target.value = ''; // Reset input
        return;
    }

    console.log('Active connections:', activeConnections.length);

    // Process each file
    Array.from(files).forEach(file => {
        console.log('Adding file to queue:', {
            name: file.name,
            size: formatFileSize(file.size),
            type: file.type
        });
        
        activeConnections.forEach(([peerId, conn]) => {
            fileQueue.push({
                file: file,
                peerId: peerId
            });
        });
    });

    // Start processing the queue
    console.log('Starting queue processing');
    processFileQueue();
    
    // Reset the input so the same file can be selected again
    event.target.value = '';
}

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
    try {
        console.log('Starting file download:', {
            fileName,
            fileId,
            blobSize: blob.size,
            blobType: blob.type
        });

        // Create download URL
        console.log('Creating download URL...');
        const url = URL.createObjectURL(blob);
        console.log('Download URL created:', url);

        // Create download link
        console.log('Creating download link...');
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        console.log('Download link created');

        // Trigger download
        console.log('Triggering download...');
        a.click();
        console.log('Download triggered');

        // Clean up
        console.log('Cleaning up...');
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log('Cleanup completed');

        // Add to downloads list
        console.log('Updating downloads list...');
        const fileInfo = {
            fileName: fileName,
            fileId: fileId,
            timestamp: new Date().toISOString(),
            size: blob.size,
            type: blob.type
        };
        addFileToHistory(fileInfo, 'downloads');
        console.log('Downloads list updated');

        console.log('File download process completed successfully:', {
            fileName,
            fileId
        });
    } catch (error) {
        console.error('Error downloading file:', error);
        showNotification(`Failed to download file: ${error.message}`, 'error');
        throw error;
    }
}

// Function to handle simultaneous download request
async function handleSimultaneousDownloadRequest(data, conn) {
    console.log('Received simultaneous download request:', {
        fileId: data.fileId,
        fileName: data.fileName,
        fromPeer: conn.peer
    });
    
    // Check if we have the blob
    const blob = sentFileBlobs.get(data.fileId);
    if (!blob) {
        console.error('Blob not found for file:', data.fileId);
        conn.send({
            type: MESSAGE_TYPES.BLOB_ERROR,
            fileId: data.fileId,
            error: 'File not available'
        });
        return;
    }
    console.log('Blob found:', {
        size: blob.size,
        type: blob.type
    });

    // Send ready signal
    console.log('Sending ready signal...');
    try {
        conn.send({
            type: MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_READY,
            fileId: data.fileId,
            fileSize: blob.size
        });
        console.log('Ready signal sent successfully');
    } catch (error) {
        console.error('Error sending ready signal:', error);
        conn.send({
            type: MESSAGE_TYPES.BLOB_ERROR,
            fileId: data.fileId,
            error: 'Failed to send ready signal: ' + error.message
        });
    }
}

// Function to initiate simultaneous download
async function initiateSimultaneousDownload(fileInfo) {
    console.log('Initiating simultaneous download:', {
        fileId: fileInfo.fileId,
        fileName: fileInfo.fileName,
        originalSender: fileInfo.originalSender
    });

    const downloadingPeers = new Set();
    const readyPeers = new Set();
    let downloadStarted = false;

    // Function to start download for all ready peers
    const startDownloadForAll = () => {
        if (downloadStarted) {
            console.log('Download already started, skipping');
            return;
        }
        downloadStarted = true;
        
        console.log('Starting simultaneous download for all ready peers:', {
            readyPeers: Array.from(readyPeers),
            totalPeers: readyPeers.size
        });

        for (const [peerId, conn] of connections) {
            if (readyPeers.has(peerId)) {
                console.log('Sending start signal to peer:', peerId);
                try {
                    conn.send({
                        type: MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_START,
                        fileId: fileInfo.fileId
                    });
                } catch (error) {
                    console.error('Failed to send start signal to peer:', {
                        peerId,
                        error: error.message
                    });
                }
            }
        }
    };

    // Request download from original sender for all connected peers
    console.log('Requesting download from original sender:', fileInfo.originalSender);
    for (const [peerId, conn] of connections) {
        if (conn && conn.open && peerId === fileInfo.originalSender) {
            console.log('Found original sender connection:', peerId);
            downloadingPeers.add(peerId);
            try {
                conn.send({
                    type: MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_REQUEST,
                    fileId: fileInfo.fileId,
                    fileName: fileInfo.fileName
                });
                console.log('Download request sent successfully to:', peerId);
            } catch (error) {
                console.error('Failed to send download request:', {
                    peerId,
                    error: error.message
                });
            }
        }
    }

    if (downloadingPeers.size === 0) {
        console.error('No connections found to original sender:', fileInfo.originalSender);
        throw new Error('Original sender not connected');
    }

    console.log('Download requested from peers:', {
        totalPeers: downloadingPeers.size,
        peers: Array.from(downloadingPeers)
    });

    // Add handlers for simultaneous download coordination
    const handleReadyResponse = (data, fromPeerId) => {
        console.log('Received ready response:', {
            fromPeerId,
            fileId: data.fileId
        });

        if (data.type === MESSAGE_TYPES.SIMULTANEOUS_DOWNLOAD_READY && data.fileId === fileInfo.fileId) {
            readyPeers.add(fromPeerId);
            console.log('Peer ready status updated:', {
                readyPeers: Array.from(readyPeers),
                totalReady: readyPeers.size,
                totalNeeded: downloadingPeers.size
            });

            if (readyPeers.size === downloadingPeers.size) {
                console.log('All peers ready, starting download');
                startDownloadForAll();
            }
        }
    };

    // Update connection handler to handle simultaneous downloads
    console.log('Setting up data handlers for simultaneous download');
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
    console.log('Creating download button for file:', {
        fileId: fileInfo.fileId,
        fileName: fileInfo.fileName,
        originalSender: fileInfo.originalSender
    });

    const downloadButton = document.createElement('button');
    downloadButton.textContent = 'Download';
    downloadButton.classList.add('download-button');
    downloadButton.onclick = async () => {
        console.log('Download button clicked for file:', {
            fileId: fileInfo.fileId,
            fileName: fileInfo.fileName
        });

        try {
            showNotification(`Starting download of ${fileInfo.fileName}...`);
            console.log('Initiating simultaneous download process');
            await initiateSimultaneousDownload(fileInfo);
            console.log('Simultaneous download initiated successfully');
        } catch (error) {
            console.error('Error initiating simultaneous download:', {
                fileId: fileInfo.fileId,
                fileName: fileInfo.fileName,
                error: error.message,
                stack: error.stack
            });
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
    console.log('Attempting to save edited peer ID:', newPeerId);
    
    if (!newPeerId) {
        console.warn('Empty peer ID provided');
        showNotification('Peer ID cannot be empty', 'error');
        return;
    }
    
    if (newPeerId.length < 3) {
        console.warn('Peer ID too short:', newPeerId.length);
        showNotification('Peer ID must be at least 3 characters', 'error');
        return;
    }

    // Validate peer ID format
    const validIdRegex = /^[A-Za-z0-9_-]+$/;
    if (!validIdRegex.test(newPeerId)) {
        console.warn('Invalid peer ID format:', newPeerId);
        showNotification('Peer ID can only contain letters, numbers, underscores, and hyphens', 'error');
        return;
    }
    
    try {
        // Show loading state
        console.log('Updating connection status to connecting');
        updateConnectionStatus('connecting', 'Updating peer ID...');
        
        // Destroy existing peer if any
        if (peer) {
            console.log('Destroying existing peer connection');
            peer.destroy();
            peer = null;
        }
        
        // Clear connections
        console.log('Clearing existing connections');
        connections.clear();
        
        // Initialize new peer with custom ID
        console.log('Initializing new peer with ID:', newPeerId);
        peer = new Peer(newPeerId, {
            debug: 2,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' }
                ]
            }
        });
        
        console.log('Setting up peer handlers');
        setupPeerHandlers();
        
        // Wait for the peer to be ready
        console.log('Waiting for peer connection to open');
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.error('Timeout waiting for peer connection');
                reject(new Error('Timeout waiting for peer to open'));
            }, 10000); // 10 second timeout

            peer.once('open', () => {
                console.log('Peer connection opened successfully');
                clearTimeout(timeout);
                resolve();
            });

            peer.once('error', (err) => {
                console.error('Peer connection error:', err);
                clearTimeout(timeout);
                reject(err);
            });
        });

        // Update UI
        console.log('Updating UI with new peer ID');
        elements.peerId.textContent = newPeerId;
        cancelEditingPeerId();
        
        // Generate new QR code
        console.log('Generating new QR code');
        generateQRCode(newPeerId);
        
        console.log('Peer ID updated successfully');
        showNotification('Peer ID updated successfully', 'success');
    } catch (error) {
        console.error('Error updating peer ID:', {
            peerId: newPeerId,
            error: error.message,
            stack: error.stack,
            type: error.type
        });
        
        // Show specific error message for taken IDs
        if (error.type === 'unavailable-id') {
            showNotification('This ID is already taken. Please try another one.', 'error');
        } else {
            showNotification('Failed to update peer ID. Please try again.', 'error');
        }
        
        updateConnectionStatus('', 'Failed to update peer ID');
        
        // Reinitialize with auto-generated ID
        console.log('Reinitializing with auto-generated ID');
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

// Utility function to format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Update file transfer history UI
function updateFileTransferUI() {
    console.log('Updating file transfer UI');

    // Clear existing history
    elements.fileHistory.innerHTML = '';
    elements.receivedFiles.innerHTML = '';

    // Process each peer's history
    fileTransferHistory.forEach((transfers, peerId) => {
        console.log(`Processing history for peer ${peerId}`);

        transfers.forEach(transfer => {
            const fileEntry = document.createElement('div');
            fileEntry.className = 'file-entry';

            const fileInfo = document.createElement('div');
            fileInfo.className = 'file-info';
            fileInfo.innerHTML = `
                <span class="file-name">${transfer.fileName}</span>
                <span class="file-size">${formatFileSize(transfer.fileSize)}</span>
                <span class="file-time">${new Date(transfer.timestamp).toLocaleString()}</span>
            `;

            fileEntry.appendChild(fileInfo);

            // Add download button for received files
            if (transfer.direction === 'received') {
                console.log(`Creating download button for received file: ${transfer.fileName}`);
                const downloadButton = createDownloadButton(transfer.fileId, transfer.fileName);
                if (downloadButton) {
                    fileEntry.appendChild(downloadButton);
                }
                elements.receivedFiles.appendChild(fileEntry);
            } else {
                // For sent files
                console.log(`Adding sent file to history: ${transfer.fileName}`);
                const status = document.createElement('span');
                status.className = 'file-status';
                status.textContent = `Sent to ${transfer.peerId}`;
                fileEntry.appendChild(status);
                elements.fileHistory.appendChild(fileEntry);
            }
        });
    });

    // Update empty state messages
    if (elements.fileHistory.children.length === 0) {
        elements.fileHistory.innerHTML = '<div class="empty-message">No files sent yet</div>';
    }
    if (elements.receivedFiles.children.length === 0) {
        elements.receivedFiles.innerHTML = '<div class="empty-message">No files received yet</div>';
    }

    console.log('File transfer UI updated');
}

// Create download button for a file
function createDownloadButton(fileId, fileName) {
    console.log(`Creating download button for file: ${fileName} (ID: ${fileId})`);

    try {
        const button = document.createElement('button');
        button.className = 'download-button';
        button.textContent = 'Download';

        button.addEventListener('click', async () => {
            console.log(`Download button clicked for file: ${fileName}`);
            try {
                const fileBlob = sentFileBlobs.get(fileId);
                if (!fileBlob) {
                    throw new Error('File data not found');
                }

                // Create download link
                const url = URL.createObjectURL(fileBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                console.log(`File ${fileName} downloaded successfully`);
                showNotification(`File ${fileName} downloaded successfully`, 'success');
            } catch (error) {
                console.error('Error downloading file:', error);
                showNotification(`Error downloading file: ${error.message}`, 'error');
            }
        });

        return button;
    } catch (error) {
        console.error('Error creating download button:', error);
        return null;
    }
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
        console.log('Creating StorageManager instance');
        this.capabilities = {
            fileSystem: false,
            webkitDirectory: false,
            indexedDB: false
        };
    }

    async init() {
        console.log('Initializing StorageManager...');
        try {
            await this.detectCapabilities();
            console.log('Storage capabilities detected:', this.capabilities);
            
            await this.initStorage();
            console.log('Storage system initialized successfully');
            
            return true;
        } catch (error) {
            console.error('StorageManager initialization failed:', error);
            throw error;
        }
    }

    async detectCapabilities() {
        console.log('Detecting storage capabilities...');
        try {
            // Check File System Access API support
            if ('showDirectoryPicker' in window) {
                console.log('File System Access API supported');
                this.capabilities.fileSystem = true;
            }

            // Check WebKit Directory API support
            if ('webkitRequestFileSystem' in window) {
                console.log('WebKit Directory API supported');
                this.capabilities.webkitDirectory = true;
            }

            // Check IndexedDB support
            if ('indexedDB' in window) {
                console.log('IndexedDB supported');
                this.capabilities.indexedDB = true;
            }

            console.log('Storage capabilities detection completed');
        } catch (error) {
            console.error('Error detecting storage capabilities:', error);
            throw error;
        }
    }

    async initStorage() {
        console.log('Initializing storage system...');
        try {
            // Initialize IndexedDB with new stores
            if (this.capabilities.indexedDB) {
                console.log('Initializing IndexedDB stores...');
                return new Promise((resolve, reject) => {
                    try {
                        const request = indexedDB.open(DB_NAME, DB_VERSION);
                        
                        request.onupgradeneeded = (event) => {
                            try {
                                console.log('Upgrading IndexedDB schema...');
                                const db = event.target.result;
                                
                                // Create stores if they don't exist
                                if (!db.objectStoreNames.contains(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE)) {
                                    console.log('Creating chunk store...');
                                    db.createObjectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                                }
                                if (!db.objectStoreNames.contains(STORAGE_CONFIG.INDEXEDDB_META_STORE)) {
                                    console.log('Creating metadata store...');
                                    db.createObjectStore(STORAGE_CONFIG.INDEXEDDB_META_STORE);
                                }
                                console.log('IndexedDB schema upgrade completed');
                            } catch (error) {
                                console.error('Error during IndexedDB schema upgrade:', error);
                                reject(error);
                            }
                        };

                        request.onsuccess = (event) => {
                            console.log('IndexedDB opened successfully');
                            this.db = event.target.result;
                            resolve();
                        };

                        request.onerror = (event) => {
                            console.error('Error opening IndexedDB:', event.target.error);
                            reject(new Error('Failed to open IndexedDB'));
                        };
                    } catch (error) {
                        console.error('Error initializing IndexedDB:', error);
                        reject(error);
                    }
                });
            } else {
                console.log('IndexedDB not supported, skipping initialization');
            }
        } catch (error) {
            console.error('Error initializing storage:', error);
            throw error;
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
        console.log('Storing file chunk:', {
            fileId,
            chunkIndex,
            chunkSize: chunkData.byteLength
        });

        if (this.capabilities.fileSystem && this.fileSystem) {
            console.log('Attempting to store using File System API...');
            try {
                const fileHandle = await this.fileSystem.getFileHandle(`${fileId}_${chunkIndex}`, { create: true });
                console.log('File handle created:', `${fileId}_${chunkIndex}`);
                
                const writable = await fileHandle.createWritable();
                console.log('Writable stream created');
                
                await writable.write(chunkData);
                console.log('Data written to file');
                
                await writable.close();
                console.log('File System API storage successful');
                return true;
            } catch (error) {
                console.error('File System API storage failed:', error);
                console.log('Falling back to IndexedDB...');
            }
        }
        
        if (this.capabilities.indexedDB && this.db) {
            console.log('Attempting to store using IndexedDB...');
            return new Promise((resolve, reject) => {
                try {
                    const transaction = this.db.transaction(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE, 'readwrite');
                    console.log('IndexedDB transaction created');
                    
                    const store = transaction.objectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                    const key = `${fileId}_${chunkIndex}`;
                    console.log('Storing chunk with key:', key);
                    
                    const request = store.put(chunkData, key);
                    
                    request.onsuccess = () => {
                        console.log('IndexedDB storage successful');
                        resolve(true);
                    };
                    
                    request.onerror = () => {
                        console.error('IndexedDB storage failed:', request.error);
                        reject(request.error);
                    };
                    
                    transaction.oncomplete = () => {
                        console.log('IndexedDB transaction completed');
                    };
                    
                    transaction.onerror = (event) => {
                        console.error('IndexedDB transaction failed:', event.target.error);
                    };
                } catch (error) {
                    console.error('Error creating IndexedDB transaction:', error);
                    reject(error);
                }
            });
        }
        
        const error = new Error('No storage method available');
        console.error(error);
        throw error;
    }

    async getFileChunk(fileId, chunkIndex) {
        console.log('Retrieving file chunk:', {
            fileId,
            chunkIndex
        });

        if (this.capabilities.fileSystem && this.fileSystem) {
            console.log('Attempting to retrieve using File System API...');
            try {
                const fileHandle = await this.fileSystem.getFileHandle(`${fileId}_${chunkIndex}`);
                console.log('File handle obtained:', `${fileId}_${chunkIndex}`);
                
                const file = await fileHandle.getFile();
                console.log('File object obtained');
                
                const buffer = await file.arrayBuffer();
                console.log('File data read successfully:', {
                    size: buffer.byteLength
                });
                
                return buffer;
            } catch (error) {
                console.error('File System API retrieval failed:', error);
                console.log('Falling back to IndexedDB...');
            }
        }
        
        if (this.capabilities.indexedDB && this.db) {
            console.log('Attempting to retrieve using IndexedDB...');
            return new Promise((resolve, reject) => {
                try {
                    const transaction = this.db.transaction(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE, 'readonly');
                    console.log('IndexedDB transaction created');
                    
                    const store = transaction.objectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                    const key = `${fileId}_${chunkIndex}`;
                    console.log('Retrieving chunk with key:', key);
                    
                    const request = store.get(key);
                    
                    request.onsuccess = () => {
                        if (request.result) {
                            console.log('Chunk retrieved successfully:', {
                                size: request.result.byteLength
                            });
                            resolve(request.result);
                        } else {
                            const error = new Error(`Chunk not found: ${key}`);
                            console.error(error);
                            reject(error);
                        }
                    };
                    
                    request.onerror = () => {
                        console.error('IndexedDB retrieval failed:', request.error);
                        reject(request.error);
                    };
                    
                    transaction.oncomplete = () => {
                        console.log('IndexedDB transaction completed');
                    };
                    
                    transaction.onerror = (event) => {
                        console.error('IndexedDB transaction failed:', event.target.error);
                    };
                } catch (error) {
                    console.error('Error creating IndexedDB transaction:', error);
                    reject(error);
                }
            });
        }
        
        const error = new Error('No storage method available');
        console.error(error);
        throw error;
    }

    async cleanup(fileId) {
        console.log('Starting cleanup for file:', fileId);
        const errors = [];
        
        if (this.capabilities.fileSystem && this.fileSystem) {
            console.log('Cleaning up File System API storage...');
            try {
                // List all files in the directory
                for await (const [name, handle] of this.fileSystem.entries()) {
                    // Check if the file belongs to this fileId
                    if (name.startsWith(fileId)) {
                        console.log('Removing file:', name);
                        try {
                            await this.fileSystem.removeEntry(name);
                        } catch (error) {
                            console.error('Error removing file:', name, error);
                            errors.push(error);
                        }
                    }
                }
                console.log('File System API cleanup completed');
            } catch (error) {
                console.error('File System API cleanup failed:', error);
                errors.push(error);
            }
        }
        
        if (this.capabilities.indexedDB && this.db) {
            console.log('Cleaning up IndexedDB storage...');
            try {
                await new Promise((resolve, reject) => {
                    const transaction = this.db.transaction([
                        STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE,
                        STORAGE_CONFIG.INDEXEDDB_META_STORE
                    ], 'readwrite');
                    
                    transaction.onerror = (event) => {
                        console.error('IndexedDB transaction error:', event.target.error);
                        reject(event.target.error);
                    };
                    
                    transaction.oncomplete = () => {
                        console.log('IndexedDB cleanup completed');
                        resolve();
                    };
                    
                    // Clean up chunks
                    const chunkStore = transaction.objectStore(STORAGE_CONFIG.INDEXEDDB_CHUNK_STORE);
                    const chunkRequest = chunkStore.openCursor();
                    
                    chunkRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            if (cursor.key.toString().startsWith(fileId)) {
                                console.log('Removing chunk:', cursor.key);
                                cursor.delete();
                            }
                            cursor.continue();
                        }
                    };
                    
                    // Clean up metadata
                    const metaStore = transaction.objectStore(STORAGE_CONFIG.INDEXEDDB_META_STORE);
                    const metaRequest = metaStore.openCursor();
                    
                    metaRequest.onsuccess = (event) => {
                        const cursor = event.target.result;
                        if (cursor) {
                            if (cursor.key.toString().startsWith(fileId)) {
                                console.log('Removing metadata:', cursor.key);
                                cursor.delete();
                            }
                            cursor.continue();
                        }
                    };
                });
            } catch (error) {
                console.error('IndexedDB cleanup failed:', error);
                errors.push(error);
            }
        }
        
        if (errors.length > 0) {
            console.warn('Cleanup completed with errors:', errors);
        } else {
            console.log('Cleanup completed successfully');
        }
    }
}

// Update readFileChunk function to use storage manager
async function readFileChunk(file, offset, length) {
    console.log('Reading file chunk:', {
        fileName: file.name,
        offset,
        length,
        totalSize: file.size
    });
    
    return new Promise((resolve, reject) => {
        try {
            console.log('Creating file slice...');
            const blob = file.slice(offset, offset + length);
            console.log('File slice created:', {
                size: blob.size,
                type: blob.type
            });
            
            const reader = new FileReader();
            
            reader.onload = () => {
                console.log('Chunk read successfully:', {
                    size: reader.result.byteLength
                });
                resolve(reader.result);
            };
            
            reader.onerror = () => {
                console.error('Error reading file chunk:', reader.error);
                reject(reader.error);
            };
            
            reader.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percent = Math.round((event.loaded / event.total) * 100);
                    console.log('Read progress:', percent + '%');
                }
            };
            
            console.log('Starting chunk read...');
            reader.readAsArrayBuffer(blob);
        } catch (error) {
            console.error('Error creating file slice:', error);
            reject(error);
        }
    });
}

// Send file to peer
async function sendFile(file, peerId) {
    console.log('Starting file transfer:', {
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        peerId: peerId
    });

    try {
        const conn = connections.get(peerId);
        if (!conn || !conn.open) {
            throw new Error('No active connection to peer');
        }

        // Generate unique file ID
        const fileId = generateFileId(file);
        console.log('Generated file ID:', fileId);

        // Store the file blob for later use
        const fileBlob = new Blob([file], { type: file.type });
        sentFileBlobs.set(fileId, fileBlob);

        // Show transfer progress
        elements.transferProgress.classList.remove('hidden');
        updateTransferProgress(0);
        updateTransferInfo(`Sending ${file.name} to ${peerId}...`);

        // Send file header first
        console.log('Sending file header');
        conn.send({
            type: MESSAGE_TYPES.FILE_HEADER,
            fileId: fileId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            totalChunks: Math.ceil(file.size / CHUNK_SIZE)
        });

        let offset = 0;
        let chunkIndex = 0;
        const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

        // Read and send file chunks
        while (offset < file.size) {
            const chunk = await readFileChunk(file, offset, CHUNK_SIZE);
            console.log(`Sending chunk ${chunkIndex + 1}/${totalChunks}`);
            
            conn.send({
                type: MESSAGE_TYPES.FILE_CHUNK,
                fileId: fileId,
                chunkIndex: chunkIndex,
                data: chunk
            });

            offset += chunk.byteLength;
            chunkIndex++;

            // Update progress
            const progress = (offset / file.size) * 100;
            updateTransferProgress(progress);
            updateTransferInfo(`Sending ${file.name}: ${Math.round(progress)}%`);
        }

        // Send completion message
        console.log('Sending file completion message');
        conn.send({
            type: MESSAGE_TYPES.FILE_COMPLETE,
            fileId: fileId,
            fileName: file.name
        });

        // Hide progress bar
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');

        // Add to transfer history
        console.log('Updating transfer history');
        const transfer = {
            fileId: fileId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            timestamp: new Date().toISOString(),
            direction: 'sent',
            peerId: peerId
        };

        if (!fileTransferHistory.has(peerId)) {
            fileTransferHistory.set(peerId, []);
        }
        fileTransferHistory.get(peerId).push(transfer);

        // Update UI and broadcast history
        console.log('Updating UI and broadcasting history');
        updateFileTransferUI();
        broadcastFileHistory();

        // Forward file info to other peers
        console.log('Forwarding file info to other peers');
        await forwardFileInfoToPeers({
            fileId: fileId,
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
            originalSender: peer.id
        }, fileId);

        console.log('File transfer completed successfully');
        showNotification(`File ${file.name} sent successfully`, 'success');
        return true;

    } catch (error) {
        console.error('Error sending file:', error);
        showNotification(`Failed to send file: ${error.message}`, 'error');
        elements.transferProgress.classList.add('hidden');
        updateTransferInfo('');
        throw error;
    }
}

// Helper function to update transfer progress
function updateTransferProgress(percent) {
    elements.progress.style.width = `${percent}%`;
    elements.progress.setAttribute('aria-valuenow', percent);
}

// Initialize storage manager
async function initStorageManager() {
    try {
        console.log('Initializing storage manager...');
        storageManager = new StorageManager();
        
        console.log('Detecting storage capabilities...');
        await storageManager.init();
        console.log('Storage capabilities detected:', storageManager.capabilities);
        
        // Request storage access if needed for large files
        console.log('Requesting storage access...');
        const hasAccess = await storageManager.requestStorageAccess().catch(error => {
            console.warn('Storage access request failed:', error);
            return false;
        });
        
        if (!hasAccess) {
            console.log('No persistent storage access, will use fallback methods');
            showNotification('Using fallback storage methods for large files', 'warning');
        } else {
            console.log('Storage access granted');
        }
        
        console.log('Storage manager initialized successfully');
        return storageManager;
    } catch (error) {
        console.error('Failed to initialize storage manager:', error);
        showNotification('Storage initialization failed, using fallback methods', 'error');
        throw error;
    }
}

// Update init function to handle initialization order
async function init() {
    console.log('Starting initialization...');
    
    if (!checkBrowserSupport()) {
        console.error('Browser support check failed');
        return;
    }

    updateConnectionStatus('', 'Initializing...');

    try {
        // Initialize IndexedDB first
        console.log('Initializing IndexedDB...');
        await initIndexedDB().catch(error => {
            console.error('IndexedDB initialization failed:', error);
            throw error;
        });
        console.log('IndexedDB initialized successfully');
        
        // Initialize storage manager
        console.log('Initializing storage manager...');
        try {
            await initStorageManager();
            console.log('Storage manager initialized successfully');
        } catch (error) {
            console.error('Storage initialization error:', error);
            showNotification('Storage system will use fallback methods', 'warning');
        }
        
        // Initialize PeerJS with timeout and retry
        console.log('Initializing PeerJS...');
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                await initPeerJS();
                console.log('PeerJS initialized successfully');
                break; // Success, exit the loop
            } catch (error) {
                retryCount++;
                console.error(`PeerJS initialization failed (attempt ${retryCount}/${maxRetries}):`, error);
                if (retryCount === maxRetries) {
                    throw new Error('Failed to initialize PeerJS after multiple attempts');
                }
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
            }
        }

        // Initialize file handlers
        console.log('Initializing file handlers...');
        initFileHandlers();
        console.log('File handlers initialized successfully');

        // Initialize event listeners and UI
        console.log('Setting up event listeners...');
        elements.connectButton.addEventListener('click', () => {
            const remotePeerId = elements.remotePeerId.value.trim();
            if (remotePeerId) {
                connectToPeer(remotePeerId);
            }
        });

        // Initialize peer ID editing
        console.log('Setting up peer ID editing...');
        initPeerIdEditing();

        // Initialize connection keep-alive
        console.log('Setting up connection keep-alive...');
        initConnectionKeepAlive();

        // Initialize visibility change handlers
        console.log('Setting up visibility change handlers...');
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handlePageFocus);
        window.addEventListener('blur', handlePageBlur);
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Load recent peers
        console.log('Loading recent peers...');
        loadRecentPeers();

        // Check URL for peer ID
        console.log('Checking URL for peer ID...');
        checkUrlForPeerId();

        // Initialize share button
        console.log('Setting up share button...');
        initShareButton();

        console.log('Initialization completed successfully');
    } catch (error) {
        console.error('Initialization failed:', error);
        showNotification('Failed to initialize application', 'error');
        updateConnectionStatus('error', 'Initialization failed');
    }
}

// Start the application
init().catch(error => {
    console.error('Application startup failed:', error);
    showNotification('Failed to start application', 'error');
});