// Constants
const DB_NAME = 'fileTransferDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // 60 seconds

// Device detection
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Network configuration
const NETWORK_CONFIG = {
    default: {
        chunkSize: isMobile ? 32768 : 65536, // 32KB for mobile, 64KB for desktop
        minDelay: isMobile ? 50 : 10, // longer delay for mobile
        connectionTimeout: 30000, // 30 seconds
        transferTimeout: 60000 // 60 seconds
    }
};

// Transfer configuration
const CHUNK_SIZE = NETWORK_CONFIG.default.chunkSize;
const DELAYS = {
    beforeTransfer: isMobile ? 500 : 100,
    betweenChunks: isMobile ? 100 : 50,
    afterHeader: isMobile ? 300 : 100,
    afterComplete: isMobile ? 500 : 200
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
    fileList: document.getElementById('file-list') || document.querySelector('#receivedFiles ul'),
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
    clearPeers: document.getElementById('clear-peers')
};

// State
let peer = null;
const connections = new Map(); // Map to store multiple connections
let db = null;
let transferInProgress = false;
let isConnectionReady = false;
let fileChunks = {}; // Initialize fileChunks object
let keepAliveInterval = null;
let connectionTimeouts = new Map();
let isPageVisible = true;
let isHost = false;
let hostId = null;

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

// Add transfer state tracking
const transferState = {
    activeTransfers: new Map(), // Map of fileId to transfer state
    transferQueue: [], // Queue of pending transfers
    isProcessing: false
};

// Add connection type tracking
const connectionTypes = new Map(); // Tracks if connection is direct or via host

// Add notification debouncing
const notificationDebounce = new Map();

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
            }
        });

        peer.on('open', (id) => {
            console.log('My peer ID is:', id);
            elements.peerId.textContent = id;
            updateConnectionStatus('', 'Ready to connect');
            generateQRCode(id);
            initShareButton();
            
            // Check URL parameters for host status
            const urlParams = new URLSearchParams(window.location.search);
            isHost = urlParams.get('host') === 'true';
            if (isHost) {
                console.log('Running as host');
                document.title = 'One-Host (Host)';
                elements.statusText.textContent = 'Running as host';
                elements.statusDot.className = 'status-dot host';
            }
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
                // Try to reconnect
                if (peer && !peer.destroyed) {
                    setTimeout(() => {
                        console.log('Attempting to reconnect...');
                        peer.reconnect();
                    }, 3000);
                }
            } else if (error.type === 'server-error') {
                errorMessage = 'Server error occurred';
            }
            
            updateConnectionStatus('', errorMessage);
            showNotification(errorMessage, 'error');
        });

        peer.on('disconnected', () => {
            console.log('Peer disconnected');
            updateConnectionStatus('', 'Disconnected');
            isConnectionReady = false;
            
            // Try to reconnect
            if (!peer.destroyed) {
                console.log('Attempting to reconnect...');
                setTimeout(() => {
                    if (peer && peer.disconnected) {
                        peer.reconnect();
                    }
                }, 3000);
            }
        });

    } catch (error) {
        console.error('PeerJS Initialization Error:', error);
        updateConnectionStatus('', 'Initialization failed');
        showNotification('Failed to initialize peer connection', 'error');
    }
}

// Update connect function for better connection handling
async function connect(peerId) {
    try {
        if (connections.has(peerId)) {
            const existingConn = connections.get(peerId);
            if (existingConn.open) {
                console.log('Using existing connection to:', peerId);
                return existingConn;
            }
            // Clean up dead connection
            console.log('Cleaning up dead connection to:', peerId);
            connections.delete(peerId);
        }

        console.log('Establishing new connection to:', peerId);
        updateConnectionStatus('connecting', 'Connecting...');

        const conn = peer.connect(peerId, {
            reliable: true,
            serialization: 'binary'
        });

        return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, CONNECTION_TIMEOUT);

            conn.on('open', () => {
                clearTimeout(timeout);
                console.log('Connection established with:', peerId);
                connections.set(peerId, conn);
                setupConnectionHandlers(conn);
                updateConnectionStatus('connected', `Connected to peer: ${peerId}`);
                resolve(conn);
            });

            conn.on('error', (err) => {
                clearTimeout(timeout);
                console.error('Connection error:', err);
                reject(err);
            });
        });
    } catch (error) {
        console.error('Connection failed:', error);
        updateConnectionStatus('error', `Connection failed: ${error.message}`);
        throw error;
    }
}

// Update setupConnectionHandlers for better connection management
function setupConnectionHandlers(conn) {
    conn.on('open', () => {
        console.log('Connection opened with:', conn.peer);
        connections.set(conn.peer, conn);
        updateConnectionStatus('connected');
        elements.fileTransferSection.classList.remove('hidden');
        
        // Send initial connection notification
        conn.send(JSON.stringify({
            type: 'connection-notification',
            peerId: peer.id,
            isHost: isHost
        }));
    });

    conn.on('data', async (data) => {
        try {
            // Parse data if it's a string
            if (typeof data === 'string') {
                try {
                    data = JSON.parse(data);
                } catch (error) {
                    console.error('Error parsing data:', error);
                    return;
                }
            }

            console.log('Received data:', data);

            if (!data || !data.type) {
                console.error('Invalid data received:', data);
                return;
            }

            switch (data.type) {
                case 'connection-notification':
                    console.log('Connection notification from:', conn.peer);
                    if (data.isHost) {
                        hostId = conn.peer;
                    }
                    updateConnectionStatus('connected');
                    showNotification(`Connected to peer: ${conn.peer}`, 'success');
                    conn.send(JSON.stringify({
                        type: 'connection-ack',
                        peerId: peer.id,
                        isHost: isHost
                    }));
                    break;

                case 'connection-ack':
                    console.log('Connection acknowledged by:', conn.peer);
                    if (data.isHost) {
                        hostId = conn.peer;
                    }
                    updateConnectionStatus('connected');
                    showNotification(`Connection acknowledged by: ${conn.peer}`, 'success');
                    break;

                case 'file-info':
                    console.log('Received file info:', data);
                    if (!data.fileId || !data.fileName || !data.fileSize) {
                        console.error('Invalid file info received:', data);
                        return;
                    }
                    addFileToList(data.fileId, data.fileName, data.fileSize, data.senderId);
                    showNotification(`New file available: ${data.fileName}`, 'info');
                    break;

                case 'file-chunk':
                    // Only show progress every 10% to reduce notification spam
                    const progress = Math.round((data.offset / data.total) * 100);
                    if (progress % 10 === 0) {
                        showNotification(`Receiving ${data.fileName}: ${progress}%`, 'info');
                    }
                    break;

                case 'file-complete':
                    showNotification(`File received: ${data.fileName}`, 'success');
                    break;

                case 'file-error':
                    showNotification(`File transfer error: ${data.error}`, 'error');
                    break;

                case 'keep-alive':
                    // Handle keep-alive message
                    console.log(`Keep-alive received from peer ${conn.peer}`);
                    conn.send({
                        type: 'keep-alive-response',
                        peerId: peer.id
                    });
                    break;

                case 'keep-alive-response':
                    // Handle keep-alive response
                    console.log(`Keep-alive response received from peer ${conn.peer}`);
                    break;

                case 'disconnect-notification':
                    // Handle disconnect notification
                    console.log(`Disconnect notification received from peer ${conn.peer}`);
                    connections.delete(conn.peer);
                    updateConnectionStatus(
                        connections.size > 0 ? 'connected' : 'disconnected',
                        connections.size > 0 ? '' : 'Disconnected'
                    );
                    showNotification(`Peer ${conn.peer} disconnected`, 'warning');
                    break;

                case 'file-header':
                    await handleFileHeader(data);
                    break;

                case 'file-update':
                    console.log('Received file update:', data);
                    // Process file update if we're the host or it's meant for us
                    if (isHost || data.targetPeerId === peer.id) {
                        updateFileStatus(data.fileId, data.status, data.progress);
                    }
                    // Forward update if we're the host
                    if (isHost && data.targetPeerId && data.targetPeerId !== peer.id) {
                        const targetConn = connections.get(data.targetPeerId);
                        if (targetConn && targetConn.open) {
                            targetConn.send(data);
                        }
                    }
                    break;

                default:
                    console.warn('Unknown data type:', data.type);
                    break;
            }
        } catch (error) {
            console.error('Error processing received data:', error);
            showNotification(`Error processing data: ${error.message}`, 'error');
        }
    });

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        connections.delete(conn.peer);
        updateConnectionStatus(
            connections.size > 0 ? 'connected' : 'disconnected'
        );
        showNotification(`Peer ${conn.peer} disconnected`, 'warning');
    });

    conn.on('error', (error) => {
        console.error('Connection error with:', conn.peer, error);
        showNotification(`Connection error with peer ${conn.peer}`, 'error');
    });
}

// Helper function to generate unique file ID
function generateFileId(file) {
    return `${file.name}-${file.size}`;
}

// Handle file header
async function handleFileHeader(data) {
    console.log('Received file header:', data);
    try {
        fileChunks[data.fileId] = {
            fileName: data.fileName,
            fileType: data.fileType,
            fileSize: data.fileSize,
            chunks: [],
            receivedSize: 0,
            lastProgressUpdate: 0
        };
        
        // Initialize transfer state
        transferState.activeTransfers.set(data.fileId, {
            startTime: Date.now(),
            fileName: data.fileName,
            fileSize: data.fileSize,
            receivedSize: 0,
            chunks: []
        });

        updateTransferInfo(`Receiving ${data.fileName}`);
        elements.transferProgress.classList.remove('hidden');
    } catch (error) {
        console.error('Error handling file header:', error);
        showNotification('Error initializing file transfer', 'error');
    }
}

// Handle file chunk
async function handleFileChunk(data) {
    try {
        const fileData = fileChunks[data.fileId];
        if (!fileData) {
            console.error('No file data found for:', data.fileId);
            return;
        }

        // Store chunk data
        fileData.chunks.push(data.data);
        fileData.receivedSize += data.data.byteLength;

        // Update progress
        const currentProgress = (fileData.receivedSize / fileData.fileSize) * 100;
        if (currentProgress - fileData.lastProgressUpdate >= 1) {
            updateProgress(currentProgress);
            fileData.lastProgressUpdate = currentProgress;
            console.log(`Progress: ${currentProgress.toFixed(2)}%`);
        }

        // Update transfer state
        const transfer = transferState.activeTransfers.get(data.fileId);
        if (transfer) {
            transfer.receivedSize = fileData.receivedSize;
            transfer.progress = currentProgress;
        }

    } catch (error) {
        console.error('Error handling file chunk:', error);
        // Only show notification for unexpected errors
        if (error.message !== 'Invalid file data') {
            showNotification('Error processing file chunk', 'error');
        }
    }
}

// Handle file completion
async function handleFileComplete(data) {
    try {
        const fileData = fileChunks[data.fileId];
        if (!fileData || !fileData.chunks) {
            throw new Error('Invalid file data');
        }

        console.log('File transfer complete:', data.fileName);
        console.log('Chunks received:', fileData.chunks.length);
        console.log('Total size:', fileData.receivedSize);

        // Create blob from chunks
        const blob = new Blob(fileData.chunks, { type: fileData.fileType });
        
        // Verify file size
        if (blob.size !== fileData.fileSize) {
            throw new Error(`File size mismatch. Expected: ${fileData.fileSize}, Got: ${blob.size}`);
        }

        // Save file
        saveFile(blob, fileData.fileName);

        // Update UI
        updateProgress(100);
        elements.transferProgress.classList.add('hidden');
        showNotification(`File ${fileData.fileName} downloaded successfully!`, 'success');

        // Clean up
        delete fileChunks[data.fileId];
        transferState.activeTransfers.delete(data.fileId);

        // Add to history
        addFileToHistory({
            id: data.fileId,
            name: data.fileName,
            size: data.fileSize,
            type: data.fileType
        }, 'received');

    } catch (error) {
        console.error('Error completing file transfer:', error);
        showNotification(`Error completing file transfer: ${error.message}`, 'error');
        
        // Clean up on error
        delete fileChunks[data.fileId];
        transferState.activeTransfers.delete(data.fileId);
        elements.transferProgress.classList.add('hidden');
    }
}

// Forward file info to other connected peers
async function forwardFileInfoToPeers(fileInfo, fileId) {
    for (const [peerId, conn] of connections) {
        // Don't send back to the original sender
        if (peerId !== fileInfo.sharedBy && conn && conn.open) {
            conn.send({
                type: 'file-info',
                fileId: fileId,
                fileName: fileInfo.name,
                fileType: fileInfo.type,
                fileSize: fileInfo.size,
                originalSender: fileInfo.sharedBy
            });
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

// Update processFileQueue for better queue management
async function processFileQueue() {
    if (transferState.isProcessing || fileQueue.length === 0) return;
    
    transferState.isProcessing = true;
    updateTransferInfo(`Processing queue: ${fileQueue.length} file(s) remaining`);
    
    while (fileQueue.length > 0) {
        const file = fileQueue[0]; // Peek at the next file
        try {
            await sendFile(file);
            fileQueue.shift(); // Only remove the file if sending was successful
            // Add delay between files
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error('Error processing file from queue:', error);
            showNotification(`Failed to send ${file.name}: ${error.message}`, 'error');
            
            // If the error is connection-related, pause queue processing
            if (error.message.includes('connection') || error.message.includes('connected')) {
                break;
            } else {
                // For other errors, remove the problematic file and continue
                fileQueue.shift();
            }
        }
    }
    
    transferState.isProcessing = false;
    updateTransferInfo('');
}

// Update requestAndDownloadBlob for better reliability
async function requestAndDownloadBlob(fileInfo) {
    const maxRetries = 3;
    let retryCount = 0;
    let lastError = null;

    while (retryCount < maxRetries) {
        try {
            // Try to connect to original sender first
            let conn = connections.get(fileInfo.sharedBy);
            
            // If no direct connection to original sender, request through host
            if (!conn || !conn.open) {
                // Find the host connection (first established connection)
                const hostConn = Array.from(connections.values())[0];
                if (!hostConn || !hostConn.open) {
                    throw new Error('No connection to host available');
                }

                // Request blob through host
                elements.transferProgress.classList.remove('hidden');
                updateProgress(0);
                updateTransferInfo(`Requesting ${fileInfo.name} through host...`);

                // Add delay before sending request
                await new Promise(resolve => setTimeout(resolve, 100));

                hostConn.send({
                    type: 'blob-request-forwarded',
                    fileId: fileInfo.id,
                    fileName: fileInfo.name,
                    originalSender: fileInfo.sharedBy,
                    requesterId: peer.id
                });
                return;
            }

            // Direct connection available, request normally
            elements.transferProgress.classList.remove('hidden');
            updateProgress(0);
            updateTransferInfo(`Requesting ${fileInfo.name}...`);

            // Add delay before sending request
            await new Promise(resolve => setTimeout(resolve, 100));

            conn.send({
                type: 'blob-request',
                fileId: fileInfo.id,
                fileName: fileInfo.name
            });

            // Successfully sent request
            return;
        } catch (error) {
            lastError = error;
            retryCount++;
            
            if (retryCount < maxRetries) {
                // Wait before retrying (exponential backoff)
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
                console.log(`Retrying download request (attempt ${retryCount + 1}/${maxRetries})`);
            }
        }
    }

    // If we get here, all retries failed
    throw lastError || new Error('Failed to request file after multiple attempts');
}

// Update handleForwardedBlobRequest for better reliability
async function handleForwardedBlobRequest(data, fromConn) {
    console.log('Handling forwarded blob request:', data);
    
    try {
        // Find connection to original sender
        const originalSenderConn = connections.get(data.originalSender);
        const requesterConn = connections.get(data.requesterId);

        // Verify both connections
        if (!originalSenderConn?.open || !requesterConn?.open) {
            throw new Error(
                !originalSenderConn?.open ? 'Original sender not connected to host' :
                !requesterConn?.open ? 'Requester no longer connected' :
                'Connection error'
            );
        }

        // Add to active transfers
        transferState.activeTransfers.set(data.fileId, {
            originalSender: originalSenderConn,
            requester: requesterConn,
            startTime: Date.now(),
            retryCount: 0
        });

        // Wait for connection stability
        await new Promise(resolve => setTimeout(resolve, DELAYS.beforeTransfer));

        // Request blob from original sender with forwarding info
        originalSenderConn.send({
            type: 'blob-request',
            fileId: data.fileId,
            fileName: data.fileName,
            forwardTo: data.requesterId
        });

        // Set up timeout and cleanup
        const timeout = setTimeout(() => {
            const transfer = transferState.activeTransfers.get(data.fileId);
            if (transfer && !transfer.completed) {
                console.error('Transfer timed out');
                cleanup(new Error('Transfer timed out'));
            }
        }, 30000); // 30 second timeout

        // Set up cleanup function
        const cleanup = (error = null) => {
            clearTimeout(timeout);
            const transfer = transferState.activeTransfers.get(data.fileId);
            if (transfer) {
                transferState.activeTransfers.delete(data.fileId);
                if (error && requesterConn.open) {
                    requesterConn.send({
                        type: 'blob-error',
                        fileId: data.fileId,
                        error: error.message
                    });
                }
            }
        };

        // Set up success handler
        const handleSuccess = () => {
            const transfer = transferState.activeTransfers.get(data.fileId);
            if (transfer) {
                transfer.completed = true;
                cleanup();
            }
        };

        // Monitor the transfer
        const checkInterval = setInterval(() => {
            const transfer = transferState.activeTransfers.get(data.fileId);
            if (!transfer) {
                clearInterval(checkInterval);
                return;
            }

            // Check connections
            if (!originalSenderConn.open || !requesterConn.open) {
                clearInterval(checkInterval);
                cleanup(new Error('Connection lost during transfer'));
                return;
            }
        }, 1000);

        // Return promise that resolves when transfer is complete
        return new Promise((resolve, reject) => {
            const transfer = transferState.activeTransfers.get(data.fileId);
            if (transfer) {
                transfer.resolve = resolve;
                transfer.reject = reject;
            }
        });

    } catch (error) {
        console.error('Error handling forwarded request:', error);
        if (fromConn.open) {
            fromConn.send({
                type: 'blob-error',
                fileId: data.fileId,
                error: error.message
            });
        }
        throw error;
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

// Modify sendFile function to work with queue
async function sendFile(file) {
    if (connections.size === 0) {
        showNotification('Please connect to at least one peer first', 'error');
        return;
    }

    if (transferInProgress) {
        // Add to queue instead of showing warning
        fileQueue.push(file);
        showNotification(`${file.name} added to queue`, 'info');
        return;
    }

    try {
        transferInProgress = true;
        elements.transferProgress.classList.remove('hidden');
        updateProgress(0);
        updateTransferInfo(`Sending ${file.name}...`);

        // Generate a unique file ID that will be same for all recipients
        const fileId = generateFileId(file);
        
        // Create file blob once for the sender
        const fileBlob = new Blob([await file.arrayBuffer()], { type: file.type });
        
        // Add to sender's history first
        const fileInfo = {
            name: file.name,
            type: file.type,
            size: file.size,
            id: fileId,
            blob: fileBlob,
            sharedBy: peer.id
        };
        addFileToHistory(fileInfo, 'sent');

        // Send to all connected peers
        const sendPromises = [];
        let successCount = 0;
        const errors = [];

        for (const [peerId, conn] of connections) {
            if (conn && conn.open) {
                try {
                    await sendFileToPeer(file, conn, fileId, fileBlob);
                    successCount++;
                } catch (error) {
                    errors.push(error.message);
                }
            }
        }

        if (successCount > 0) {
            showNotification(`${file.name} sent successfully to ${successCount} peer(s)${errors.length > 0 ? ' with some errors' : ''}`, 'success');
        } else {
            throw new Error('Failed to send file to any peers: ' + errors.join(', '));
        }
    } catch (error) {
        console.error('File send error:', error);
        showNotification(error.message, 'error');
        throw error; // Propagate error for queue processing
    } finally {
        transferInProgress = false;
        elements.transferProgress.classList.add('hidden');
        updateProgress(0);
        // Process next file in queue if any
        processFileQueue();
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
function addFileToList(fileId, fileName, fileSize, senderId) {
    console.log('Adding file to list:', { fileId, fileName, fileSize, senderId });

    // Ensure we have a valid file list element
    if (!elements.fileList) {
        console.error('File list element not found, attempting to create');
        const ul = document.createElement('ul');
        if (elements.receivedFiles) {
            elements.receivedFiles.appendChild(ul);
            elements.fileList = ul;
        } else {
            console.error('Cannot add file: Received files container not found');
            return;
        }
    }

    // Check if file already exists
    const existingFile = elements.fileList.querySelector(`[data-file-id="${fileId}"]`);
    if (existingFile) {
        console.log('File already in list:', fileId);
        return;
    }

    // Create list item
    const li = document.createElement('li');
    li.dataset.fileId = fileId;
    
    // Create name and size span
    const nameSpan = document.createElement('span');
    nameSpan.textContent = `${fileName} (${formatFileSize(fileSize)})`;
    
    // Create download button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'button';
    downloadBtn.textContent = 'Download';
    downloadBtn.onclick = () => requestBlob(fileId, fileName, senderId);
    
    // Assemble list item
    li.appendChild(nameSpan);
    li.appendChild(downloadBtn);
    
    // Add to file list
    elements.fileList.appendChild(li);
    
    // Show received files section
    if (elements.receivedFiles) {
        elements.receivedFiles.classList.remove('hidden');
    }

    console.log('File added to list successfully:', fileId);
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
    // Generate a key for this notification
    const key = `${type}-${message}`;
    
    // Check if we've shown this notification recently
    const lastShown = notificationDebounce.get(key);
    const now = Date.now();
    if (lastShown && (now - lastShown) < 2000) { // Prevent duplicate within 2 seconds
        return;
    }
    
    // Update last shown time
    notificationDebounce.set(key, now);
    
    // Clean up old entries
    for (const [key, time] of notificationDebounce.entries()) {
        if (now - time > 5000) {
            notificationDebounce.delete(key);
        }
    }
    
    console.log(`Notification (${type}):`, message);
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    const progress = document.createElement('div');
    progress.className = 'notification-progress';
    notification.appendChild(progress);
    
    const container = document.getElementById('notifications');
    if (!container) return;
    
    container.appendChild(notification);
    
    progress.style.width = '100%';
    progress.style.transition = 'width 5s linear';
    setTimeout(() => progress.style.width = '0%', 0);
    
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => notification.remove(), 300);
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
elements.copyId.addEventListener('click', () => {
    navigator.clipboard.writeText(elements.peerId.textContent)
        .then(() => showNotification('Peer ID copied to clipboard'))
        .catch(err => showNotification('Failed to copy Peer ID', 'error'));
});

elements.connectButton.addEventListener('click', async () => {
    const remotePeerId = elements.remotePeerId.value.trim();
    if (!remotePeerId) {
        showNotification('Please enter a peer ID', 'error');
        return;
    }

    try {
        updateConnectionStatus('connecting', 'Connecting...');
        const conn = await connect(remotePeerId);
        console.log('Connection successful:', conn.peer);
        addRecentPeer(remotePeerId);
    } catch (error) {
        console.error('Connection failed:', error);
        updateConnectionStatus('error', `Connection failed: ${error.message}`);
        showNotification(`Failed to connect: ${error.message}`, 'error');
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
        if (files.length > 1) {
            showNotification(`Processing ${files.length} files`, 'info');
        }
        Array.from(files).forEach(file => {
            fileQueue.push(file);
        });
        processFileQueue();
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

// Update file input change handler
elements.fileInput.addEventListener('change', (e) => {
    if (connections.size > 0) {
        const files = e.target.files;
        if (files.length > 0) {
            if (files.length > 1) {
                showNotification(`Processing ${files.length} files`, 'info');
            }
            Array.from(files).forEach(file => {
                fileQueue.push(file);
            });
            processFileQueue();
        }
        // Reset the input so the same file can be selected again
        e.target.value = '';
    } else {
        showNotification('Please connect to at least one peer first', 'error');
    }
});

// Initialize the application
function init() {
    if (!elements.fileList) {
        console.error('File list element not found, creating one');
        const ul = document.createElement('ul');
        if (elements.receivedFiles) {
            elements.receivedFiles.appendChild(ul);
            elements.fileList = ul;
        } else {
            console.error('Received files container not found');
        }
    }

    // Add Enter key handler for peer ID input
    elements.remotePeerId.addEventListener('keyup', (event) => {
        if (event.key === 'Enter') {
            elements.connectButton.click();
        }
    });

    // Initialize PeerJS connection
    initPeerJS();
    initIndexedDB();
    loadRecentPeers();
    checkUrlForPeerId(); // Check URL for peer ID on load
    initConnectionKeepAlive(); // Initialize connection keep-alive system
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

// Update updateConnectionStatus for better status display
function updateConnectionStatus(status, message) {
    elements.statusDot.className = `status-dot ${status}`;
    
    // Always show number of connected peers if there are any
    const peerCount = connections.size;
    if (peerCount > 0) {
        const peerText = peerCount === 1 ? 'peer' : 'peers';
        const statusText = `Connected to ${peerCount} ${peerText}`;
        elements.statusText.textContent = isHost ? `Running as host - ${statusText}` : statusText;
        document.title = isHost ? `One-Host (Host) - ${peerCount} ${peerText}` : `One-Host - ${peerCount} ${peerText}`;
    } else {
        elements.statusText.textContent = message || 'Disconnected';
        document.title = isHost ? 'One-Host (Host)' : 'One-Host';
    }
    
    // Update UI elements
    if (status === 'connected' || status === 'host') {
        elements.fileTransferSection.classList.remove('hidden');
        elements.connectButton.disabled = false;
        elements.connectButton.textContent = 'Connect';
    } else if (status === 'connecting') {
        elements.connectButton.disabled = true;
        elements.connectButton.textContent = 'Connecting...';
    } else {
        elements.connectButton.disabled = false;
        elements.connectButton.textContent = 'Connect';
    }
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
                downloadBlob(blob, fileInfo.name);
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
function downloadBlob(blob, fileName) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
}

// Function to detect if peers are on local network
function isLocalNetwork() {
    // For localhost/development, assume LAN
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return true;
    }
    return true; // Default to LAN optimization since we're using local PeerJS server
}

// Get network configuration based on connection type
function getNetworkConfig() {
    return isLocalNetwork() ? NETWORK_CONFIG.default : NETWORK_CONFIG.default;
}

// Calculate optimal chunk size based on file size and network
function calculateChunkSize(fileSize) {
    const config = getNetworkConfig();
    const maxChunks = 1000; // Avoid too many chunks
    const minChunkSize = 8192; // Minimum 8KB chunks

    // Calculate chunk size based on file size
    const idealChunkSize = Math.max(
        minChunkSize,
        Math.min(
            config.chunkSize,
            Math.ceil(fileSize / maxChunks)
        )
    );

    return idealChunkSize;
}

// Update assembleFile function for better performance
async function assembleFile(fileId) {
    try {
        const transfer = transferState.activeTransfers.get(fileId);
        if (!transfer || !transfer.chunks || !transfer.fileType) {
            throw new Error('Invalid transfer state');
        }

        // Sort chunks by offset to ensure correct order
        transfer.chunks.sort((a, b) => a.offset - b.offset);

        // Create blob from chunks
        const blob = new Blob(
            transfer.chunks.map(chunk => chunk.data),
            { type: transfer.fileType }
        );

        // Save file
        saveFile(blob, transfer.fileName);

        // Clean up
        transfer.chunks = [];
        transfer.completed = true;
        transferState.activeTransfers.delete(fileId);

        // Update UI
        updateProgress(100);
        showNotification(`File ${transfer.fileName} downloaded successfully!`, 'success');
        elements.transferProgress.classList.add('hidden');

    } catch (error) {
        console.error('Error assembling file:', error);
        showError(`Failed to assemble file: ${error.message}`);
    }
}

// Update saveFile function for better error handling
function saveFile(blob, fileName) {
    try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 100);
    } catch (error) {
        console.error('Error saving file:', error);
        showNotification('Error saving file', 'error');
    }
}

// Helper function to validate chunk data
function validateChunkData(data) {
    return data && 
           typeof data.fileId === 'string' && 
           data.data instanceof ArrayBuffer &&
           typeof data.offset === 'number';
}

// Update file sharing functions
function shareFile(file) {
    if (!file || !connections.size) {
        showNotification('No peers connected to share files with', 'warning');
        return;
    }

    const fileId = generateFileId();
    console.log('Sharing file:', { name: file.name, size: file.size, id: fileId });

    // Store the file blob
    sentFileBlobs.set(fileId, file);

    // Prepare file info message
    const fileInfo = {
        type: 'file-info',
        fileId: fileId,
        fileName: file.name,
        fileSize: file.size,
        senderId: peer.id,
        timestamp: Date.now()
    };

    showNotification(`Sharing file: ${file.name}`, 'info');

    // Send to all connected peers
    let sentCount = 0;
    connections.forEach(conn => {
        if (conn.open) {
            try {
                console.log('Sending file info to peer:', conn.peer);
                conn.send(JSON.stringify(fileInfo));
                sentCount++;
            } catch (error) {
                console.error('Error sending file info to peer:', conn.peer, error);
            }
        }
    });

    console.log(`File info sent to ${sentCount} peers`);
}

// Update file status tracking
function updateFileStatus(fileId, status, progress = 0) {
    const fileElement = document.querySelector(`[data-file-id="${fileId}"]`);
    if (fileElement) {
        const statusElement = fileElement.querySelector('.file-status');
        if (statusElement) {
            statusElement.textContent = status;
            if (progress > 0) {
                statusElement.textContent += ` (${Math.round(progress)}%)`;
            }
        }
    }
}

// Add cache clearing on page load
window.addEventListener('load', () => {
    // Clear caches
    sentFileBlobs.clear();
    receivedFileBlobs.clear();
    connections.clear();
    connectionTypes.clear();
    transferState.activeTransfers.clear();
    transferState.pendingTransfers.clear();
    
    // Clear file list UI
    const fileList = document.getElementById('fileList');
    if (fileList) {
        fileList.innerHTML = '';
    }
});

init();
