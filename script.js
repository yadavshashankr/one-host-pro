// Constants
const CHUNK_SIZE = 16384; // 16KB chunks
const DB_NAME = 'fileTransferDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';

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
    clearPeers: document.getElementById('clear-peers')
};

// State
let peer = null;
let connections = new Map(); // Map to store multiple connections
let db = null;
let transferInProgress = false;
let isConnectionReady = false;
let fileChunks = {}; // Initialize fileChunks object

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

// File synchronization state
const fileSyncState = {
    pendingFiles: new Map(), // Files waiting to be synced
    syncInProgress: false
};

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
            } else if (error.type === 'disconnected') {
                errorMessage = 'Disconnected from server';
            } else if (error.type === 'server-error') {
                errorMessage = 'Server error occurred';
            }
            
            updateConnectionStatus('', errorMessage);
            showNotification(errorMessage, 'error');
            resetConnection();
        });

        peer.on('disconnected', () => {
            console.log('Peer disconnected');
            updateConnectionStatus('', 'Disconnected');
            isConnectionReady = false;
            
            // Try to reconnect
            setTimeout(() => {
                if (peer && peer.disconnected) {
                    console.log('Attempting to reconnect...');
                    peer.reconnect();
                }
            }, 3000);
        });
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
        isConnectionReady = true;
        updateConnectionStatus('connected', `Connected to ${connections.size} peer(s)`);
        elements.fileTransferSection.classList.remove('hidden');
        addRecentPeer(conn.peer);
        
        // Initialize file sync
        initializeFileSync(conn);
    });

    conn.on('data', async (data) => {
        try {
            switch (data.type) {
                case 'request-file-list':
                    await handleFileListRequest(conn);
                    break;
                case 'file-list':
                    await handleFileList(data, conn);
                    break;
                case 'request-file':
                    await handleFileRequest(data, conn);
                    break;
                case 'sync-file-header':
                    handleSyncFileHeader(data);
                    break;
                case 'sync-file-chunk':
                    await handleSyncFileChunk(data);
                    break;
                case 'sync-file-complete':
                    await handleSyncFileComplete(data);
                    break;
                case 'file-header':
                    await handleFileHeader(data);
                    break;
                case 'file-chunk':
                    await handleFileChunk(data);
                    break;
                case 'file-complete':
                    await handleFileComplete(data);
                    break;
            }
        } catch (error) {
            console.error('Error handling data:', error);
            showNotification('Error processing received data', 'error');
        }
    });

    conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        connections.delete(conn.peer);
        updateConnectionStatus(
            connections.size > 0 ? 'connected' : '', 
            connections.size > 0 ? `Connected to ${connections.size} peer(s)` : 'Disconnected'
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
        resetConnection();
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

// Handle file chunk data
async function handleFileChunk(data) {
    try {
        const fileId = generateFileId({ name: data.name, size: data.size });
        const fileData = fileChunks[fileId];
        if (fileData) {
            fileData.chunks.push(data.data);
            fileData.receivedSize += data.data.byteLength;
            
            const progress = Math.floor((fileData.receivedSize / fileData.size) * 100);
            updateProgress(progress);
        }
    } catch (error) {
        console.error('Error handling file chunk:', error);
        showNotification('Error processing file chunk', 'error');
    }
}

// Handle file completion
async function handleFileComplete(data) {
    try {
        const fileId = generateFileId({ name: data.name, size: data.size });
        const fileData = fileChunks[fileId];
        if (!fileData) {
            console.error('No file data found for:', data.name);
            return;
        }

        // Verify if we received all the data
        if (fileData.receivedSize !== fileData.size) {
            throw new Error('Incomplete file transfer');
        }

        const blob = new Blob(fileData.chunks, { type: fileData.type });
        const url = URL.createObjectURL(blob);
        
        // Create a file object with the received data
        const file = new File([blob], fileData.name, { 
            type: fileData.type,
            lastModified: new Date().getTime()
        });

        // Add to history with the URL for downloading
        addFileToHistory(file, 'received', url);
        
        // Clean up
        delete fileChunks[fileId];
        elements.transferProgress.classList.add('hidden');
        showNotification(`File "${file.name}" received successfully`, 'success');
    } catch (error) {
        console.error('Error completing file transfer:', error);
        showNotification('Error processing received file', 'error');
        elements.transferProgress.classList.add('hidden');
    }
}

// Send file function
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
        updateProgress(0);
        elements.transferProgress.classList.remove('hidden');

        // Send to all connected peers
        for (const [peerId, conn] of connections) {
            if (conn && conn.open) {
                console.log('Sending file to peer:', peerId);
                await sendFileToPeer(file, conn);
            }
        }

        showNotification('File sent successfully to all connected peers', 'success');
    } catch (error) {
        console.error('File send error:', error);
        showNotification('Failed to send file', 'error');
    } finally {
        transferInProgress = false;
        elements.transferProgress.classList.add('hidden');
    }
}

// New function to handle sending file to a specific peer
async function sendFileToPeer(file, conn) {
    return new Promise(async (resolve, reject) => {
        try {
            const fileId = generateFileId(file);
            
            // Send file header
            conn.send({
                type: 'file-header',
                name: file.name,
                size: file.size,
                fileType: file.type || 'application/octet-stream'
            });

            // Read and send file chunks
            let offset = 0;
            while (offset < file.size) {
                const chunk = await readFileChunk(file, offset, offset + CHUNK_SIZE);
                conn.send({
                    type: 'file-chunk',
                    name: file.name,
                    size: file.size,
                    data: chunk
                });
                offset += chunk.byteLength;
                if (!transferInProgress) break; // Stop if transfer was cancelled
                updateProgress((offset / file.size) * 100);
                // Add a small delay to prevent overwhelming the connection
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            if (transferInProgress) {
                // Send completion message
                conn.send({
                    type: 'file-complete',
                    name: file.name,
                    size: file.size
                });

                // Add to sent files history
                addFileToHistory(file, 'sent', URL.createObjectURL(file));
                resolve();
            } else {
                reject(new Error('Transfer cancelled'));
            }
        } catch (error) {
            reject(error);
        }
    });
}

// Helper function to read file chunks
function readFileChunk(file, start, end) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(file.slice(start, end));
    });
}

// Update progress bar and text
function updateProgress(percent) {
    if (!transferInProgress) return;
    const progress = Math.min(Math.floor(percent), 100); // Ensure integer value and cap at 100
    elements.progress.style.width = `${progress}%`;
    elements.progressText.textContent = `${progress}%`;
    
    if (progress > 0 && progress < 100) {
        elements.transferInfo.style.display = 'block';
    } else {
        elements.transferInfo.style.display = 'none';
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

// Add a helper function for updating progress
function updateProgress(progress) {
    elements.progressText.textContent = `${progress}%`;
    elements.progress.style.width = `${progress}%`;
}

// Initialize the application
function init() {
    if (!checkBrowserSupport()) {
        return;
    }

    initPeerJS();
    initIndexedDB();
    loadRecentPeers();
    checkUrlForPeerId(); // Check URL for peer ID on load
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
    if (connections && connections.size > 0) {
        document.title = `(${connections.size}) P2P File Share`;
    } else {
        document.title = 'P2P File Share';
    }
}

// Update file history management
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

    // Check if file already exists in history
    if (!fileHistory[type].has(fileId)) {
        fileHistory[type].add(fileId);
        updateFilesList(type === 'sent' ? elements.sentFilesList : elements.receivedFilesList, fileInfo, type);
    }

    // Send file history update to peer
    if (connections.size > 0) {
        for (const [peerId, conn] of connections) {
            if (conn && conn.open) {
                conn.send({
                    type: 'file-history-update',
                    historyType: type,
                    fileInfo: fileInfo
                });
            }
        }
    }
}

// Update files list display
function updateFilesList(listElement, fileInfo, type) {
    // Check if file already exists in the list
    const existingFile = Array.from(listElement.children).find(li => li.dataset.fileId === fileInfo.id);
    if (existingFile) {
        return; // Skip if file already exists
    }

    const li = document.createElement('li');
    li.dataset.fileId = fileInfo.id;

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

    li.appendChild(icon);
    li.appendChild(fileInfoDiv);

    // Add download button for both sent and received files
    const downloadButton = document.createElement('button');
    downloadButton.className = 'download-button';
    downloadButton.innerHTML = '<span class="material-icons">download</span>';
    downloadButton.title = 'Download file';

    if (fileInfo.url) {
        downloadButton.addEventListener('click', () => {
            const a = document.createElement('a');
            a.href = fileInfo.url;
            a.download = fileInfo.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        });
    } else {
        downloadButton.classList.add('disabled');
        downloadButton.title = 'File not available for download';
    }

    li.appendChild(downloadButton);

    // Insert at the beginning of the list
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

// Initialize file sync on connection
function initializeFileSync(conn) {
    // Request file list from peer
    conn.send({
        type: 'request-file-list'
    });
}

// Handle file list request
async function handleFileListRequest(conn) {
    try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const files = await store.getAll();
        
        conn.send({
            type: 'file-list',
            files: files.map(file => ({
                id: file.id,
                name: file.name,
                size: file.size,
                type: file.type,
                timestamp: file.timestamp
            }))
        });
    } catch (error) {
        console.error('Error sending file list:', error);
    }
}

// Handle received file list
async function handleFileList(data, conn) {
    try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const localFiles = await store.getAll();
        const localFileIds = new Set(localFiles.map(f => f.id));

        // Find files we don't have
        for (const file of data.files) {
            if (!localFileIds.has(file.id)) {
                fileSyncState.pendingFiles.set(file.id, {
                    ...file,
                    peer: conn.peer
                });
            }
        }

        // Start sync if not already in progress
        if (!fileSyncState.syncInProgress) {
            syncNextFile();
        }
    } catch (error) {
        console.error('Error processing file list:', error);
    }
}

// Sync next pending file
async function syncNextFile() {
    if (fileSyncState.pendingFiles.size === 0) {
        fileSyncState.syncInProgress = false;
        return;
    }

    fileSyncState.syncInProgress = true;
    const [fileId, fileInfo] = fileSyncState.pendingFiles.entries().next().value;
    fileSyncState.pendingFiles.delete(fileId);

    const conn = connections.get(fileInfo.peer);
    if (conn && conn.open) {
        try {
            conn.send({
                type: 'request-file',
                fileId: fileId
            });
        } catch (error) {
            console.error('Error requesting file:', error);
            syncNextFile(); // Move to next file
        }
    } else {
        syncNextFile(); // Move to next file if peer not available
    }
}

// Handle file request
async function handleFileRequest(data, conn) {
    try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const fileData = await store.get(data.fileId);

        if (fileData && fileData.blob) {
            // Send file in chunks
            const chunkSize = 16384; // 16KB chunks
            const totalChunks = Math.ceil(fileData.blob.size / chunkSize);

            // Send file header
            conn.send({
                type: 'sync-file-header',
                fileId: fileData.id,
                name: fileData.name,
                type: fileData.type,
                size: fileData.size,
                totalChunks: totalChunks
            });

            // Send chunks
            for (let i = 0; i < totalChunks; i++) {
                const start = i * chunkSize;
                const end = Math.min(start + chunkSize, fileData.blob.size);
                const chunk = fileData.blob.slice(start, end);

                conn.send({
                    type: 'sync-file-chunk',
                    fileId: fileData.id,
                    chunkIndex: i,
                    data: chunk
                });

                // Small delay to prevent overwhelming the connection
                await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Send completion message
            conn.send({
                type: 'sync-file-complete',
                fileId: fileData.id
            });
        }
    } catch (error) {
        console.error('Error handling file request:', error);
    }
}

// Handle sync file header
function handleSyncFileHeader(data) {
    const fileId = data.fileId;
    fileChunks[fileId] = {
        name: data.name,
        type: data.type,
        size: data.size,
        chunks: new Array(data.totalChunks),
        receivedChunks: 0,
        totalChunks: data.totalChunks
    };
}

// Handle sync file chunk
async function handleSyncFileChunk(data) {
    const fileId = data.fileId;
    const fileData = fileChunks[fileId];

    if (fileData) {
        fileData.chunks[data.chunkIndex] = data.data;
        fileData.receivedChunks++;

        // Update progress
        const progress = Math.floor((fileData.receivedChunks / fileData.totalChunks) * 100);
        updateProgress(progress);
    }
}

// Handle sync file complete
async function handleSyncFileComplete(data) {
    try {
        const fileId = data.fileId;
        const fileData = fileChunks[fileId];

        if (fileData && fileData.receivedChunks === fileData.totalChunks) {
            // Create blob from chunks
            const blob = new Blob(fileData.chunks, { type: fileData.type });
            
            // Store in IndexedDB
            const transaction = db.transaction([STORE_NAME], 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            await store.put({
                id: fileId,
                blob: blob,
                name: fileData.name,
                type: fileData.type,
                size: fileData.size,
                timestamp: Date.now()
            });

            // Update UI
            const url = URL.createObjectURL(blob);
            const file = new File([blob], fileData.name, {
                type: fileData.type,
                lastModified: Date.now()
            });
            addFileToHistory(file, 'received', url);

            // Clean up
            delete fileChunks[fileId];
            updateProgress(0);
            elements.transferProgress.classList.add('hidden');

            // Continue syncing if there are more files
            syncNextFile();
        }
    } catch (error) {
        console.error('Error completing file sync:', error);
        syncNextFile(); // Move to next file even if there's an error
    }
}

init();
