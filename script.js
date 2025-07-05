// Constants
const CHUNK_SIZE = 16384; // 16KB chunks
const DB_NAME = 'fileTransferDB';
const DB_VERSION = 1;
const STORE_NAME = 'files';
const KEEP_ALIVE_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // 60 seconds

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
    clearPeers: document.getElementById('clear-peers')
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

// Track downloads in progress
const downloadsInProgress = new Map();

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
            setupConnection(conn);
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
function setupConnection(conn) {
    connections.set(conn.peer, conn);
    
    conn.on('data', async (data) => {
        console.log('Received data type:', data.type);
        
        switch (data.type) {
            case 'file-info':
                handleFileInfo(data);
                break;
            case 'blob-request':
                handleBlobRequest(data, conn);
                break;
            case 'file-header':
                // Reset progress tracking for new file
                if (receivedChunks.has(data.fileId)) {
                    receivedChunks.delete(data.fileId);
                    receivedSizes.delete(data.fileId);
                }
                break;
            case 'file-chunk':
                handleFileChunk(data);
                break;
            case 'file-complete':
                handleFileComplete(data);
                break;
            case 'blob-error':
                handleDownloadError(data);
                break;
        }
    });

    conn.on('close', () => {
        console.log('Connection closed with peer:', conn.peer);
        connections.delete(conn.peer);
        updateConnectionStatus();
    });

    conn.on('error', (err) => {
        console.error('Connection error:', err);
        connections.delete(conn.peer);
        updateConnectionStatus();
    });

    updateConnectionStatus();
}

// Create file list item
function createFileListItem(fileInfo) {
    const fileId = fileInfo.id;
    const li = document.createElement('li');
    li.className = 'file-item';
    li.setAttribute('data-file-id', fileId);
    
    li.innerHTML = `
        <span class="file-name">${fileInfo.name}</span>
        <span class="file-size">${formatFileSize(fileInfo.size)}</span>
        <div class="download-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"></path>
            </svg>
        </div>
        <div class="progress-circle" style="display: none;">
            <svg viewBox="0 0 40 40">
                <circle cx="20" cy="20" r="18" fill="none" stroke="#ddd" stroke-width="4"></circle>
                <circle cx="20" cy="20" r="18" fill="none" stroke="#2196F3" stroke-width="4" 
                        style="stroke-dasharray: ${2 * Math.PI * 18}; stroke-dashoffset: ${2 * Math.PI * 18};"></circle>
            </svg>
        </div>
        <div class="check-icon" style="display: none;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 6L9 17l-5-5"></path>
            </svg>
        </div>
    `;

    // Add click handler for download
    const downloadIcon = li.querySelector('.download-icon');
    downloadIcon.addEventListener('click', () => handleFileDownload(fileId));

    return li;
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
            downloadBlob(blob, fileData.fileName);

            // Update UI to show downloaded state
            const fileItem = document.querySelector(`[data-file-id="${data.fileId}"]`);
            if (fileItem) {
                fileItem.classList.add('downloaded');
                const downloadBtn = fileItem.querySelector('.icon-button');
                if (downloadBtn) {
                    downloadBtn.classList.add('downloaded');
                    downloadBtn.innerHTML = '<span class="material-icons">check</span>';
                }
            }

            showNotification(`Downloaded ${fileData.fileName}`, 'success');
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

// Handle blob request
async function handleBlobRequest(data, conn) {
    const { fileId, forwardTo } = data;
    console.log('Received blob request for file:', fileId, 'forward to:', forwardTo);

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

        // Determine target connection
        let targetConn = conn;
        if (forwardTo) {
            // If this is a forwarded request, verify both connections
            targetConn = connections.get(forwardTo);
            if (!targetConn || !targetConn.open) {
                // If target is not connected, try sending through original connection
                if (!conn || !conn.open) {
                    throw new Error('No valid connection available');
                }
                console.log('Target not connected, sending through original connection');
                targetConn = conn;
            }
        }

        // Verify connection is open
        if (!targetConn || !targetConn.open) {
            throw new Error('Connection is not open');
        }

        console.log('Sending blob to peer:', targetConn.peer);

        // Send file header
        targetConn.send({
            type: 'file-header',
            fileId: fileId,
            fileName: data.fileName,
            fileType: blob.type,
            fileSize: blob.size,
            originalSender: peer.id
        });

        // Send chunks with connection check before each chunk
        while (offset < blob.size) {
            // Verify connection is still open
            if (!targetConn.open) {
                throw new Error('Connection lost during transfer');
            }

            const chunk = buffer.slice(offset, offset + CHUNK_SIZE);
            targetConn.send({
                type: 'file-chunk',
                fileId: fileId,
                data: chunk,
                offset: offset
            });

            offset += chunk.byteLength;

            // Update progress
            const currentProgress = (offset / blob.size) * 100;
            if (currentProgress - lastProgressUpdate >= 1) {
                updateProgress(currentProgress);
                lastProgressUpdate = currentProgress;
            }

            // Add a small delay between chunks to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        // Final connection check before completion
        if (!targetConn.open) {
            throw new Error('Connection lost before completion');
        }

        // Send completion message
        targetConn.send({
            type: 'file-complete',
            fileId: fileId,
            fileName: data.fileName,
            fileType: blob.type,
            fileSize: blob.size
        });

        console.log(`Blob sent successfully to peer ${targetConn.peer}`);
    } catch (error) {
        console.error(`Error sending blob to peer:`, error);
        // Try to send error to both connections if possible
        if (conn && conn.open) {
            conn.send({
                type: 'blob-error',
                fileId: fileId,
                error: error.message
            });
        }
        if (forwardTo && connections.get(forwardTo)?.open) {
            connections.get(forwardTo).send({
                type: 'blob-error',
                fileId: fileId,
                error: error.message
            });
        }
    }
}

// Function to request and download a blob
async function requestAndDownloadBlob(fileInfo) {
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

    conn.send({
        type: 'blob-request',
        fileId: fileInfo.id,
        fileName: fileInfo.name
    });
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
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    // Remove notification after 3 seconds
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
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
        setupConnection(newConnection);
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
    if (!checkBrowserSupport()) {
        return;
    }

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

    // Create circular progress indicator
    const progress = document.createElement('div');
    progress.className = 'download-progress';
    progress.innerHTML = `
        <svg viewBox="0 0 36 36">
            <circle class="progress-bg"
                    cx="18" cy="18" r="16"
                    stroke-dasharray="100" stroke-dashoffset="0"/>
            <circle class="progress-bar"
                    cx="18" cy="18" r="16"
                    stroke-dasharray="100" stroke-dashoffset="100"/>
        </svg>
    `;
    
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'icon-button';
    downloadBtn.title = 'Download file';
    downloadBtn.innerHTML = '<span class="material-icons">download</span>';

    // Function to update progress
    const updateItemProgress = (percent) => {
        if (percent === 0) {
            progress.classList.add('active');
            downloadBtn.style.display = 'none';
        }
        const circle = progress.querySelector('.progress-bar');
        const offset = 100 - percent;
        circle.style.strokeDashoffset = offset;
        
        if (percent >= 100) {
            setTimeout(() => {
                progress.classList.remove('active');
                downloadBtn.style.display = 'flex';
                downloadBtn.classList.add('downloaded');
                downloadBtn.innerHTML = '<span class="material-icons">check</span>';
                li.classList.add('downloaded');
            }, 300);
        }
    };

    downloadBtn.onclick = async () => {
        try {
            if (type === 'sent' && sentFileBlobs.has(fileInfo.id)) {
                // For sent files, we have the blob locally
                updateItemProgress(0);
                updateItemProgress(100);
                const blob = sentFileBlobs.get(fileInfo.id);
                downloadBlob(blob, fileInfo.name);
            } else {
                // For received files, request the blob from the original sender
                const originalProgress = updateProgress;
                updateProgress = (percent) => {
                    updateItemProgress(percent);
                    originalProgress(percent);
                };
                await requestAndDownloadBlob(fileInfo);
            }
        } catch (error) {
            console.error('Error downloading file:', error);
            progress.classList.remove('active');
            downloadBtn.style.display = 'flex';
            showNotification('Failed to download file: ' + error.message, 'error');
        }
    };
    
    li.appendChild(icon);
    li.appendChild(info);
    li.appendChild(progress);
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
        setupConnection(newConnection);
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

// Update progress for a specific file
function updateProgress(progress, fileId) {
    const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
    if (!fileItem) return;

    const progressCircle = fileItem.querySelector('.progress-circle circle');
    if (!progressCircle) return;

    const circumference = 2 * Math.PI * 18; // radius is 18
    const offset = circumference - (progress / 100) * circumference;
    progressCircle.style.strokeDashoffset = offset;
}

// Show download UI for specific file
function showDownloadUI(fileId) {
    const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
    if (!fileItem) return;

    // Hide download icon and show progress circle
    const downloadIcon = fileItem.querySelector('.download-icon');
    const progressCircle = fileItem.querySelector('.progress-circle');
    const checkIcon = fileItem.querySelector('.check-icon');

    if (downloadIcon) downloadIcon.style.display = 'none';
    if (progressCircle) {
        progressCircle.style.display = 'flex';
        const circle = progressCircle.querySelector('circle');
        if (circle) {
            const circumference = 2 * Math.PI * 18;
            circle.style.strokeDasharray = circumference;
            circle.style.strokeDashoffset = circumference;
        }
    }
    if (checkIcon) checkIcon.style.display = 'none';
}

// Hide download UI for specific file
function hideDownloadUI(fileId) {
    const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
    if (!fileItem) return;

    const downloadIcon = fileItem.querySelector('.download-icon');
    const progressCircle = fileItem.querySelector('.progress-circle');
    const checkIcon = fileItem.querySelector('.check-icon');

    if (downloadIcon) downloadIcon.style.display = 'none';
    if (progressCircle) progressCircle.style.display = 'none';
    if (checkIcon) checkIcon.style.display = 'flex';
}

// Reset download UI for specific file
function resetDownloadUI(fileId) {
    const fileItem = document.querySelector(`[data-file-id="${fileId}"]`);
    if (!fileItem) return;

    const downloadIcon = fileItem.querySelector('.download-icon');
    const progressCircle = fileItem.querySelector('.progress-circle');
    const checkIcon = fileItem.querySelector('.check-icon');

    if (downloadIcon) downloadIcon.style.display = 'flex';
    if (progressCircle) progressCircle.style.display = 'none';
    if (checkIcon) checkIcon.style.display = 'none';
}

// Handle file download request
async function handleFileDownload(fileId) {
    // Check if download is already in progress
    if (downloadsInProgress.has(fileId)) {
        console.log('Download already in progress for file:', fileId);
        return;
    }

    const fileInfo = sharedFiles.get(fileId);
    if (!fileInfo) {
        console.error('File info not found:', fileId);
        return;
    }

    // Mark download as in progress
    downloadsInProgress.set(fileId, true);
    
    try {
        showDownloadUI(fileId);
        
        // Request the blob from the original sender
        const originalSender = fileInfo.originalSender;
        let targetConn;

        if (originalSender === peer.id) {
            // We have the file locally
            const blob = sentFileBlobs.get(fileId);
            if (!blob) {
                throw new Error('Local blob not found');
            }
            await handleLocalDownload(fileId, blob);
        } else {
            // Request from original sender through host if needed
            if (isHost) {
                targetConn = connections.get(originalSender);
                if (!targetConn || !targetConn.open) {
                    throw new Error('Original sender not connected');
                }
            } else {
                targetConn = hostConnection;
                if (!targetConn || !targetConn.open) {
                    throw new Error('Not connected to host');
                }
            }

            targetConn.send({
                type: 'blob-request',
                fileId: fileId,
                fileName: fileInfo.name,
                forwardTo: !isHost ? peer.id : null
            });
        }
    } catch (error) {
        console.error('Error initiating download:', error);
        resetDownloadUI(fileId);
        downloadsInProgress.delete(fileId);
    }
}

// Handle received file chunks
let receivedChunks = new Map();
let receivedSizes = new Map();

function handleFileChunk(data) {
    const { fileId, chunk, offset, fileSize } = data;
    
    if (!receivedChunks.has(fileId)) {
        receivedChunks.set(fileId, []);
        receivedSizes.set(fileId, 0);
    }

    const chunks = receivedChunks.get(fileId);
    chunks.push({ data: chunk, offset });
    
    const currentSize = receivedSizes.get(fileId) + chunk.byteLength;
    receivedSizes.set(fileId, currentSize);

    // Calculate and update progress
    const progress = (currentSize / fileSize) * 100;
    updateProgress(progress, fileId);
}

// Handle completed file download
function handleFileComplete(data) {
    const { fileId, fileName, fileType } = data;
    
    const chunks = receivedChunks.get(fileId);
    if (!chunks) {
        console.error('No chunks received for file:', fileId);
        return;
    }

    // Sort chunks by offset
    chunks.sort((a, b) => a.offset - b.offset);
    
    // Combine chunks into a single blob
    const blob = new Blob(chunks.map(chunk => chunk.data), { type: fileType });
    
    // Create download link
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Clean up
    receivedChunks.delete(fileId);
    receivedSizes.delete(fileId);
    downloadsInProgress.delete(fileId);
    
    // Update UI
    hideDownloadUI(fileId);
}

// Handle download error
function handleDownloadError(data) {
    const { fileId, error } = data;
    console.error('Download error for file:', fileId, error);
    
    // Clean up
    receivedChunks.delete(fileId);
    receivedSizes.delete(fileId);
    downloadsInProgress.delete(fileId);
    
    // Reset UI
    resetDownloadUI(fileId);
    
    // Show error to user
    alert(`Download failed: ${error}`);
}

init();
