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
let currentConnection = null;
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
        new QRCode(elements.qrcode, {
            text: peerId,
            width: 128,
            height: 128,
            colorDark: '#2563eb',
            colorLight: '#ffffff',
            correctLevel: QRCode.CorrectLevel.H
        });
    } catch (error) {
        console.error('QR Code Generation Error:', error);
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
            elements.peerId.textContent = id;
            updateConnectionStatus('', 'Ready to connect');
            generateQRCode(id);
        });

        peer.on('connection', (conn) => {
            console.log('Incoming connection');
            currentConnection = conn;
            updateConnectionStatus('connecting', 'Incoming connection...');
            setupConnectionHandlers(conn);
        });

        peer.on('error', (error) => {
            console.error('PeerJS Error:', error);
            updateConnectionStatus('', 'Connection error');
            showNotification('Connection error: ' + error.type, 'error');
            resetConnection();
        });

        peer.on('disconnected', () => {
            console.log('Peer disconnected');
            updateConnectionStatus('', 'Disconnected');
            isConnectionReady = false;
            setTimeout(() => {
                if (peer && peer.disconnected) {
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
        console.log('Connection opened');
        isConnectionReady = true;
        updateConnectionStatus('connected', 'Connected to peer');
        elements.fileTransferSection.classList.remove('hidden');
        addRecentPeer(conn.peer);
        
        // Send a connection notification to the other peer
        conn.send({
            type: 'connection-notification',
            peerId: peer.id
        });
    });

    conn.on('data', async (data) => {
        try {
            if (data.type === 'connection-notification') {
                updateConnectionStatus('connected', 'Connected to peer');
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
        console.log('Connection closed');
        updateConnectionStatus('', 'Disconnected');
        showNotification('Peer disconnected', 'error');
        resetConnection();
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
    fileChunks[data.fileId] = {
        name: data.fileName,
        type: data.fileType,
        size: data.fileSize,
        chunks: new Array(data.totalChunks),
        receivedChunks: 0,
        totalChunks: data.totalChunks
    };
    updateProgress(0);
    elements.transferProgress.classList.remove('hidden');
}

// Handle file chunk data
async function handleFileChunk(data) {
    const fileData = fileChunks[data.fileId];
    if (fileData) {
        fileData.chunks[data.chunkIndex] = data.chunk;
        fileData.receivedChunks++;
        
        const progress = Math.floor((fileData.receivedChunks / fileData.totalChunks) * 100);
        updateProgress(progress);

        if (fileData.receivedChunks === fileData.totalChunks) {
            // All chunks received, trigger completion
            await handleFileComplete(data);
        }
    }
}

// Handle file completion
async function handleFileComplete(data) {
    try {
        const fileData = fileChunks[data.fileId];
        if (!fileData) {
            console.error('No file data found for:', data.fileId);
            return;
        }

        const blob = new Blob(fileData.chunks, { type: fileData.type });
        const url = URL.createObjectURL(blob);
        
        // Create a file object with the received data
        const file = {
            name: fileData.name,
            size: fileData.size,
            type: fileData.type || 'application/octet-stream'
        };

        // Add to history with the URL for downloading
        addFileToHistory(file, 'received', url);
        
        // Clean up
        delete fileChunks[data.fileId];
        updateProgress(0);
        elements.transferProgress.classList.add('hidden');
        showNotification(`File "${file.name}" received successfully`, 'success');
    } catch (error) {
        console.error('Error completing file transfer:', error);
        showNotification('Error processing received file', 'error');
    }
}

// Send file function
async function sendFile(file) {
    try {
        if (!currentConnection || !currentConnection.open) {
            showNotification('No active connection', 'error');
            return;
        }

        const fileId = generateFileId(file);
        const chunkSize = 16384; // 16KB chunks
        const totalChunks = Math.ceil(file.size / chunkSize);

        // Send file header
        currentConnection.send({
            type: 'file-header',
            fileId: fileId,
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            fileSize: file.size,
            totalChunks: totalChunks
        });

        // Update UI
        elements.transferProgress.classList.remove('hidden');
        updateProgress(0);

        // Send file chunks
        for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, file.size);
            const chunk = await readFileChunk(file, start, end);

            currentConnection.send({
                type: 'file-chunk',
                fileId: fileId,
                chunkIndex: i,
                chunk: chunk
            });

            const progress = Math.floor(((i + 1) / totalChunks) * 100);
            updateProgress(progress);
        }

        // Add to sent files history
        addFileToHistory(file, 'sent');
        
        // Clean up
        elements.transferProgress.classList.add('hidden');
        updateProgress(0);
        showNotification(`File "${file.name}" sent successfully`, 'success');
    } catch (error) {
        console.error('Error sending file:', error);
        showNotification('Error sending file', 'error');
        elements.transferProgress.classList.add('hidden');
        updateProgress(0);
    }
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
    const progress = Math.floor(percent); // Ensure integer value
    elements.progress.style.width = `${progress}%`;
    elements.progressText.textContent = `${progress}%`;
    
    if (progress > 0) {
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
    if (currentConnection) {
        currentConnection.close();
    }
    currentConnection = null;
    isConnectionReady = false;
    elements.fileTransferSection.classList.add('hidden');
    updateConnectionStatus('', 'Ready to connect');
    transferInProgress = false;
}

// Event Listeners
elements.copyId.addEventListener('click', () => {
    navigator.clipboard.writeText(elements.peerId.textContent)
        .then(() => showNotification('Peer ID copied to clipboard'))
        .catch(err => showNotification('Failed to copy Peer ID', 'error'));
});

elements.connectButton.addEventListener('click', () => {
    const remotePeerId = elements.remotePeerId.value.trim();
    if (!remotePeerId) {
        showNotification('Please enter a peer ID', 'error');
        return;
    }

    if (remotePeerId === peer.id) {
        showNotification('Cannot connect to yourself', 'error');
        return;
    }

    try {
        updateConnectionStatus('connecting', 'Connecting...');
        const conn = peer.connect(remotePeerId);
        currentConnection = conn;
        setupConnectionHandlers(conn);
    } catch (error) {
        console.error('Connection Error:', error);
        updateConnectionStatus('', 'Connection failed');
        showNotification('Failed to connect to peer', 'error');
        resetConnection();
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
    
    if (currentConnection && currentConnection.open) {
        const files = e.dataTransfer.files;
        Array.from(files).forEach(sendFile);
    } else {
        showNotification('Please connect to a peer first', 'error');
    }
});

// Add click handler for the drop zone
elements.dropZone.addEventListener('click', () => {
    if (currentConnection && currentConnection.open) {
        elements.fileInput.click();
    } else {
        showNotification('Please connect to a peer first', 'error');
    }
});

// Add file input change handler
elements.fileInput.addEventListener('change', (e) => {
    if (currentConnection && currentConnection.open) {
        const files = e.target.files;
        if (files.length > 0) {
            Array.from(files).forEach(sendFile);
        }
        // Reset the input so the same file can be selected again
        e.target.value = '';
    } else {
        showNotification('Please connect to a peer first', 'error');
    }
});

// Add a helper function for updating progress
function updateProgress(progress) {
    elements.progressText.textContent = `${progress}%`;
    elements.progress.style.width = `${progress}%`;
}

// Initialize the application
function init() {
    if (!checkBrowserSupport()) return;
    initIndexedDB();
    initPeerJS();
    loadRecentPeers();
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
    elements.statusDot.className = 'status-dot ' + status;
    elements.statusText.textContent = message;
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
    if (currentConnection && currentConnection.open) {
        currentConnection.send({
            type: 'file-history-update',
            historyType: type,
            fileInfo: fileInfo
        });
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

    // Add download button for received files
    if (type === 'received') {
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
        }
        
        li.appendChild(downloadButton);
    }

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

init();
