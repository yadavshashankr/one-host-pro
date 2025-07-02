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
let hostId = null;

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
    console.log('Incoming connection from:', conn.peer);
    
    // Store connection
    connections.set(conn.peer, conn);
    updatePeerCount();

    // Setup connection handlers
    setupConnectionHandlers(conn);

    // Send existing file history to new peer if we're the host
    if (peer.id === hostId) {
        sendFileHistory(conn);
    }
}

// Setup connection handlers
function setupConnectionHandlers(conn) {
    conn.on('open', () => {
        console.log('Connection opened with:', conn.peer);
        showNotification('Connected to peer: ' + conn.peer, 'success');
    });

    conn.on('data', async (data) => {
        try {
            switch (data.type) {
                case 'file-header':
                    handleFileHeader(data);
                    break;
                case 'file-chunk':
                    await handleFileChunk(data, conn);
                    break;
                case 'file-complete':
                    await handleFileComplete(data);
                    break;
                case 'chunk-ack':
                    handleChunkAck(data);
                    break;
                case 'heartbeat':
                    // Respond to heartbeat
                    conn.send({ type: 'heartbeat-ack' });
                    break;
            }
        } catch (error) {
            console.error('Error handling data:', error);
            showNotification('Error processing received data', 'error');
        }
    });

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        handlePeerDisconnection(conn.peer);
    });

    // Setup heartbeat
    setupHeartbeat(conn);
}

// Setup heartbeat mechanism
function setupHeartbeat(conn) {
    const heartbeatInterval = setInterval(() => {
        if (conn.open) {
            conn.send({ type: 'heartbeat' });
        } else {
            clearInterval(heartbeatInterval);
        }
    }, 5000);

    // Store interval for cleanup
    conn.heartbeatInterval = heartbeatInterval;
}

// Handle file header
function handleFileHeader(data) {
    const fileId = generateFileId({ name: data.name, size: data.size });
    
    fileChunks[fileId] = {
        name: data.name,
        size: data.size,
        type: data.fileType,
        chunks: new Array(data.totalChunks),
        receivedSize: 0,
        totalChunks: data.totalChunks
    };

    // Show progress bar
    elements.transferProgress.classList.remove('hidden');
    updateProgress(0);
}

// Handle file chunk
async function handleFileChunk(data, conn) {
    try {
        const fileId = generateFileId({ name: data.name, size: data.size });
        const fileData = fileChunks[fileId];

        if (!fileData) {
            throw new Error('No file data found for chunk');
        }

        // Store chunk
        fileData.chunks[data.chunkIndex] = data.data;
        fileData.receivedSize += data.data.byteLength;

        // Send acknowledgment
        conn.send({
            type: 'chunk-ack',
            chunkIndex: data.chunkIndex,
            success: true
        });

        // Update progress
        const progress = Math.round((fileData.receivedSize / fileData.size) * 100);
        updateProgress(progress);

    } catch (error) {
        console.error('Error handling chunk:', error);
        conn.send({
            type: 'chunk-ack',
            chunkIndex: data.chunkIndex,
            success: false,
            error: error.message
        });
    }
}

// Handle chunk acknowledgment
function handleChunkAck(data) {
    if (!data.success) {
        console.error('Chunk error:', data.error);
        // Implement retry logic if needed
    }
}

// Send file
async function sendFile(file) {
    if (connections.size === 0) {
        showNotification('Please connect to at least one peer first', 'error');
        return;
    }

    if (transferInProgress) {
        showNotification('Please wait for the current transfer to complete', 'warning');
        return;
    }

    try {
        transferInProgress = true;
        elements.transferProgress.classList.remove('hidden');
        updateProgress(0);

        const sendPromises = Array.from(connections.entries()).map(([peerId, conn]) => {
            if (conn && conn.open) {
                return sendFileToPeer(file, conn, connections.size)
                    .catch(error => {
                        console.error(`Error sending to peer ${peerId}:`, error);
                        showNotification(`Failed to send to peer ${peerId}`, 'error');
                    });
            }
            return Promise.resolve();
        });

        await Promise.all(sendPromises);
        
        // Create URL for sender's reference
        const url = URL.createObjectURL(file);
        addFileToHistory(file, 'sent', url);
        
        showNotification('File sent successfully', 'success');

    } catch (error) {
        console.error('File send error:', error);
        showNotification('Failed to send file: ' + error.message, 'error');
    } finally {
        transferInProgress = false;
        elements.transferProgress.classList.add('hidden');
        updateProgress(0);
    }
}

// Send file to peer
async function sendFileToPeer(file, conn, totalPeers) {
    return new Promise(async (resolve, reject) => {
        try {
            const peerId = conn.peer;
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

            // Send file header
            conn.send({
                type: 'file-header',
                name: file.name,
                size: file.size,
                fileType: file.type || 'application/octet-stream',
                totalChunks: totalChunks
            });

            // Send chunks
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = await readFileChunk(file, start, end);

                conn.send({
                    type: 'file-chunk',
                    name: file.name,
                    size: file.size,
                    chunkIndex: chunkIndex,
                    data: chunk
                });

                // Update progress
                const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
                peerProgress.set(peerId, progress);
                
                const totalProgress = Math.round(
                    Array.from(peerProgress.values())
                        .reduce((sum, p) => sum + p, 0) / (totalPeers * 100) * 100
                );
                updateProgress(totalProgress);

                // Small delay to prevent overwhelming the connection
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Send completion message
            conn.send({
                type: 'file-complete',
                name: file.name,
                size: file.size
            });

            resolve();

        } catch (error) {
            reject(error);
        } finally {
            peerProgress.delete(peerId);
        }
    });
}

// Handle file completion
async function handleFileComplete(data) {
    try {
        const fileId = generateFileId({ name: data.name, size: data.size });
        const fileData = fileChunks[fileId];

        if (!fileData) {
            throw new Error('No file data found');
        }

        // Create file
        const blob = new Blob(fileData.chunks, { type: fileData.type });
        const file = new File([blob], fileData.name, {
            type: fileData.type,
            lastModified: new Date().getTime()
        });

        // Create URL and add to history
        const url = URL.createObjectURL(blob);
        addFileToHistory(file, 'received', url);

        // Clean up
        delete fileChunks[fileId];
        showNotification(`File "${file.name}" received successfully`, 'success');
        updateProgress(100);

    } catch (error) {
        console.error('Error completing file transfer:', error);
        showNotification(`Error receiving file: ${error.message}`, 'error');
    } finally {
        elements.transferProgress.classList.add('hidden');
    }
}

// Check connections
function checkConnections() {
    connections.forEach((conn, peerId) => {
        if (!conn.open) {
            console.log('Found closed connection:', peerId);
            handlePeerDisconnection(peerId);
        }
    });
}

// Handle peer disconnection
function handlePeerDisconnection(peerId) {
    const conn = connections.get(peerId);
    if (conn && conn.heartbeatInterval) {
        clearInterval(conn.heartbeatInterval);
    }
    
    connections.delete(peerId);
    updatePeerCount();
    
    // Try to reconnect
    if (peer && peer.id) {
        console.log('Attempting to reconnect to:', peerId);
        connect(peerId);
    }
}

// Handle peer unavailable
function handlePeerUnavailable(peerId) {
    connections.delete(peerId);
    updatePeerCount();
    showNotification(`Peer ${peerId} is unavailable`, 'error');
}

// Handle disconnection
function handleDisconnection() {
    if (peer) {
        peer.reconnect();
    }
}

// Helper function to generate unique file ID
function generateFileId(file) {
    return `${file.name}-${file.size}`;
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

// Initialize PeerJS connection
function initializePeer() {
    const peerConfig = {
        debug: 3,
        host: 'yadavshashankr.github.io',
        path: '/local-host',
        secure: true,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        }
    };

    peer = new Peer(generatePeerId(), peerConfig);

    peer.on('open', (id) => {
        elements.peerId.value = id;
        showNotification('Your peer ID is: ' + id, 'info');
        if (!hostId) {
            hostId = id;
        }
    });

    peer.on('connection', (conn) => {
        console.log('Incoming connection from:', conn.peer);
        handleConnection(conn);
    });

    peer.on('error', (error) => {
        console.error('PeerJS Error:', error);
        showNotification('Connection error: ' + error.message, 'error');
    });

    peer.on('disconnected', () => {
        console.log('Peer disconnected - attempting to reconnect');
        peer.reconnect();
    });
}

// Connect to a peer
async function connect(targetPeerId) {
    try {
        if (connections.has(targetPeerId)) {
            showNotification('Already connected to this peer', 'warning');
            return;
        }

        const conn = peer.connect(targetPeerId, {
            reliable: true,
            serialization: 'binary'
        });

        conn.on('open', () => {
            console.log('Connection opened with:', targetPeerId);
            handleConnection(conn);
            showNotification('Connected to peer: ' + targetPeerId, 'success');
        });

        conn.on('error', (error) => {
            console.error('Connection error:', error);
            showNotification('Connection error: ' + error.message, 'error');
            handlePeerDisconnection(targetPeerId);
        });

    } catch (error) {
        console.error('Connection error:', error);
        showNotification('Failed to connect: ' + error.message, 'error');
    }
}

// Handle connection
function handleConnection(conn) {
    connections.set(conn.peer, conn);
    updatePeerCount();

    conn.on('data', async (data) => {
        try {
            switch (data.type) {
                case 'file-header':
                    handleFileHeader(data);
                    break;
                case 'file-chunk':
                    await handleFileChunk(data, conn);
                    break;
                case 'file-complete':
                    await handleFileComplete(data);
                    break;
                case 'chunk-ack':
                    handleChunkAck(data);
                    break;
            }
        } catch (error) {
            console.error('Error handling data:', error);
            showNotification('Error processing received data', 'error');
        }
    });

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        handlePeerDisconnection(conn.peer);
    });
}

// Send file
async function sendFile(file) {
    if (connections.size === 0) {
        showNotification('Please connect to at least one peer first', 'error');
        return;
    }

    if (transferInProgress) {
        showNotification('Please wait for the current transfer to complete', 'warning');
        return;
    }

    try {
        transferInProgress = true;
        elements.transferProgress.classList.remove('hidden');
        updateProgress(0);

        const sendPromises = Array.from(connections.entries()).map(([peerId, conn]) => {
            if (conn && conn.open) {
                return sendFileToPeer(file, conn, connections.size)
                    .catch(error => {
                        console.error(`Error sending to peer ${peerId}:`, error);
                        showNotification(`Failed to send to peer ${peerId}`, 'error');
                    });
            }
            return Promise.resolve();
        });

        await Promise.all(sendPromises);
        
        // Create URL for sender's reference
        const url = URL.createObjectURL(file);
        addFileToHistory(file, 'sent', url);
        
        showNotification('File sent successfully', 'success');

    } catch (error) {
        console.error('File send error:', error);
        showNotification('Failed to send file: ' + error.message, 'error');
    } finally {
        transferInProgress = false;
        elements.transferProgress.classList.add('hidden');
        updateProgress(0);
    }
}

// Send file to peer
async function sendFileToPeer(file, conn, totalPeers) {
    return new Promise(async (resolve, reject) => {
        try {
            const peerId = conn.peer;
            const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

            // Send file header
            conn.send({
                type: 'file-header',
                name: file.name,
                size: file.size,
                fileType: file.type || 'application/octet-stream',
                totalChunks: totalChunks
            });

            // Send chunks
            for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
                const start = chunkIndex * CHUNK_SIZE;
                const end = Math.min(start + CHUNK_SIZE, file.size);
                const chunk = await readFileChunk(file, start, end);

                conn.send({
                    type: 'file-chunk',
                    name: file.name,
                    size: file.size,
                    chunkIndex: chunkIndex,
                    data: chunk
                });

                // Update progress
                const progress = Math.round(((chunkIndex + 1) / totalChunks) * 100);
                peerProgress.set(peerId, progress);
                
                const totalProgress = Math.round(
                    Array.from(peerProgress.values())
                        .reduce((sum, p) => sum + p, 0) / (totalPeers * 100) * 100
                );
                updateProgress(totalProgress);

                // Small delay to prevent overwhelming the connection
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Send completion message
            conn.send({
                type: 'file-complete',
                name: file.name,
                size: file.size
            });

            resolve();

        } catch (error) {
            reject(error);
        } finally {
            peerProgress.delete(peerId);
        }
    });
}

// Handle file header
function handleFileHeader(data) {
    const fileId = generateFileId({ name: data.name, size: data.size });
    
    fileChunks[fileId] = {
        name: data.name,
        size: data.size,
        type: data.fileType,
        chunks: new Array(data.totalChunks),
        receivedSize: 0,
        totalChunks: data.totalChunks
    };

    elements.transferProgress.classList.remove('hidden');
    updateProgress(0);
}

// Handle file chunk
async function handleFileChunk(data, conn) {
    try {
        const fileId = generateFileId({ name: data.name, size: data.size });
        const fileData = fileChunks[fileId];

        if (!fileData) {
            throw new Error('No file data found for chunk');
        }

        // Store chunk
        fileData.chunks[data.chunkIndex] = data.data;
        fileData.receivedSize += data.data.byteLength;

        // Update progress
        const progress = Math.round((fileData.receivedSize / fileData.size) * 100);
        updateProgress(progress);

    } catch (error) {
        console.error('Error handling chunk:', error);
        showNotification('Error receiving file chunk', 'error');
    }
}

// Handle file completion
async function handleFileComplete(data) {
    try {
        const fileId = generateFileId({ name: data.name, size: data.size });
        const fileData = fileChunks[fileId];

        if (!fileData) {
            throw new Error('No file data found');
        }

        // Create file
        const blob = new Blob(fileData.chunks, { type: fileData.type });
        const file = new File([blob], fileData.name, {
            type: fileData.type,
            lastModified: new Date().getTime()
        });

        // Create URL and add to history
        const url = URL.createObjectURL(blob);
        addFileToHistory(file, 'received', url);

        // Clean up
        delete fileChunks[fileId];
        showNotification(`File "${file.name}" received successfully`, 'success');
        updateProgress(100);

    } catch (error) {
        console.error('Error completing file transfer:', error);
        showNotification(`Error receiving file: ${error.message}`, 'error');
    } finally {
        elements.transferProgress.classList.add('hidden');
    }
}

// Handle peer disconnection
function handlePeerDisconnection(peerId) {
    connections.delete(peerId);
    updatePeerCount();
}

// Update peer count
function updatePeerCount() {
    const count = connections.size;
    document.title = `Connected Peers: ${count}`;
    elements.peerCount.textContent = count.toString();
}

init();

