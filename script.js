// Constants
const CHUNK_SIZE = 16384; // 16KB chunks
const DB_NAME = 'fileTransferDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';

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
            elements.peerId.textContent = id;
            updateConnectionStatus('', 'Ready to connect');
            generateQRCode(id);
            initShareButton(); // Initialize share button after getting peer ID
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
        
        // Send a connection notification to the other peer
        conn.send({
            type: 'connection-notification',
            peerId: peer.id
        });
    });

    conn.on('data', async (data) => {
        try {
            if (data.type === 'connection-notification') {
                updateConnectionStatus('connected', `Connected to ${connections.size} peer(s)`);
            } else if (data.type === 'file-update') {
                // Handle file update notification
                console.log('Received file update:', data.fileInfo);
                const fileId = data.fileInfo.id;
                if (!fileHistory.sent.has(fileId) && !fileHistory.received.has(fileId)) {
                    addFileToHistory(data.fileInfo, 'received');
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
        connections.delete(conn.peer);
        updateConnectionStatus(connections.size > 0 ? 'connected' : '', 
            connections.size > 0 ? `Connected to ${connections.size} peer(s)` : 'Disconnected');
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
    
    const progress = (fileData.receivedSize / fileData.fileSize) * 100;
    updateProgress(progress);
}

// Handle file completion
async function handleFileComplete(data) {
    const fileData = fileChunks[data.fileId];
    if (!fileData) return;

    try {
        // Combine chunks into blob
        const blob = new Blob(fileData.chunks, { type: fileData.fileType });
        
        // Verify file size
        if (blob.size !== fileData.fileSize) {
            throw new Error('Received file size does not match expected size');
        }

        // Create file info object
        const fileInfo = {
            name: fileData.fileName,
            type: fileData.fileType,
            size: fileData.fileSize,
            id: data.fileId,
            blob: blob,
            sharedBy: fileData.originalSender
        };

        console.log('File received successfully:', fileInfo);

        // Add to history
        addFileToHistory(fileInfo, 'received');

        // If this is the host peer (the first to create the connection),
        // forward the file to other connected peers
        if (peer.id !== fileInfo.sharedBy && connections.size > 1) {
            console.log('Forwarding file to other peers as host');
            await forwardFileToPeers(fileInfo, data.fileId);
        }

        showNotification(`Received ${fileData.fileName}`, 'success');
    } catch (error) {
        console.error('Error handling file completion:', error);
        showNotification('Error processing received file: ' + error.message, 'error');
    } finally {
        delete fileChunks[data.fileId];
        elements.transferProgress.classList.add('hidden');
        updateProgress(0);
        updateTransferInfo('');
    }
}

// Forward file to other connected peers
async function forwardFileToPeers(fileInfo, fileId) {
    const forwardPromises = [];
    
    for (const [peerId, conn] of connections) {
        // Don't send back to the original sender
        if (peerId !== fileInfo.sharedBy && conn && conn.open) {
            forwardPromises.push(forwardFileToPeer(fileInfo, conn, fileId));
        }
    }

    if (forwardPromises.length > 0) {
        try {
            await Promise.all(forwardPromises);
            console.log('File forwarded to all peers successfully');
        } catch (error) {
            console.error('Error forwarding file to some peers:', error);
        }
    }
}

// Forward file to a specific peer
async function forwardFileToPeer(fileInfo, conn, fileId) {
    try {
        console.log(`Forwarding file to peer ${conn.peer}`);
        
        // Send file header
        conn.send({
            type: 'file-header',
            fileId: fileId,
            fileName: fileInfo.name,
            fileType: fileInfo.type,
            fileSize: fileInfo.size,
            originalSender: fileInfo.sharedBy // Preserve original sender
        });

        // Convert blob to array buffer
        const buffer = await fileInfo.blob.arrayBuffer();
        let offset = 0;
        const chunkSize = CHUNK_SIZE;

        while (offset < fileInfo.size) {
            const chunk = buffer.slice(offset, offset + chunkSize);
            conn.send({
                type: 'file-chunk',
                fileId: fileId,
                data: chunk,
                offset: offset,
                originalSender: fileInfo.sharedBy
            });

            offset += chunk.byteLength;
        }

        // Send completion message
        conn.send({
            type: 'file-complete',
            fileId: fileId,
            fileName: fileInfo.name,
            fileType: fileInfo.type,
            fileSize: fileInfo.size,
            originalSender: fileInfo.sharedBy
        });

        console.log(`File forwarded successfully to peer ${conn.peer}`);
    } catch (error) {
        console.error(`Error forwarding file to peer ${conn.peer}:`, error);
        throw new Error(`Failed to forward to peer ${conn.peer}: ${error.message}`);
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

// Send file to a specific peer
async function sendFileToPeer(file, conn, fileId, fileBlob) {
    try {
        if (!conn.open) {
            throw new Error('Connection is not open');
        }

        // Send file header
        conn.send({
            type: 'file-header',
            fileId: fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            originalSender: peer.id
        });

        // Convert blob to array buffer once
        const buffer = await fileBlob.arrayBuffer();
        let offset = 0;
        
        while (offset < file.size) {
            if (!conn.open) {
                throw new Error('Connection lost during transfer');
            }

            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
            conn.send({
                type: 'file-chunk',
                fileId: fileId,
                data: chunk,
                offset: offset,
                originalSender: peer.id
            });

            offset += chunk.byteLength;
            const progress = Math.min((offset / file.size) * 100, 100);
            updateProgress(progress);
        }

        // Verify connection is still open before sending completion
        if (!conn.open) {
            throw new Error('Connection lost before completion');
        }

        // Send completion message
        conn.send({
            type: 'file-complete',
            fileId: fileId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            originalSender: peer.id
        });

        console.log(`File sent successfully to peer ${conn.peer}`);
    } catch (error) {
        console.error(`Error sending file to peer ${conn.peer}:`, error);
        throw new Error(`Failed to send to peer ${conn.peer}: ${error.message}`);
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
        elements.transferProgress.classList.remove('hidden');
        updateProgress(0);

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
            showNotification(`File sent successfully to ${successCount} peer(s)${errors.length > 0 ? ' with some errors' : ''}`, 'success');
        } else {
            throw new Error('Failed to send file to any peers: ' + errors.join(', '));
        }
    } catch (error) {
        console.error('File send error:', error);
        showNotification(error.message, 'error');
    } finally {
        transferInProgress = false;
        elements.transferProgress.classList.add('hidden');
        updateProgress(0);
    }
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
    sharedBySpan.textContent = `Shared by: ${fileInfo.sharedBy || 'Unknown'}`;
    
    info.appendChild(nameSpan);
    info.appendChild(sizeSpan);
    info.appendChild(sharedBySpan);
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'icon-button';
    downloadBtn.innerHTML = '<span class="material-icons">download</span>';
    downloadBtn.onclick = () => {
        if (fileInfo.blob) {
            console.log('Downloading file:', fileInfo);
            const url = URL.createObjectURL(fileInfo.blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileInfo.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 100);
        } else {
            console.error('No blob available for file:', fileInfo);
            showNotification('File data not available for download', 'error');
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

init();
