<p align="center">
  <img src="assets/logo.svg" alt="WebRTC File Sharing Logo" width="400">
</p>

A browser-based peer-to-peer file sharing application using WebRTC. Share files directly between browsers with no server storage.

## ✨ Features

- 🔒 Direct peer-to-peer file transfer
- 📱 Mobile and desktop support
- 🚀 Fast transfers with chunked file handling
- 📋 File transfer history
- 🔄 Multiple simultaneous connections
- 🎯 Direct file downloads from original sender
- 📊 Real-time progress tracking
- 🔔 Transfer notifications
- 🔗 QR code sharing for easy connection
- 📝 Recent peers list
- 🎨 Visual download status indicators
- 🔍 Quick file access after download

## 🚀 Getting Started

1. Open the application in your browser
2. You'll receive a unique Peer ID
3. Share your ID with others via:
   - Copy button
   - Share button (mobile)
   - QR code
4. Connect to other peers using their ID

## 💻 Usage

### Connecting to Peers

1. **Share Your ID**:
   - Copy your Peer ID using the copy button
   - Use the share button on mobile
   - Let others scan your QR code
   - Your ID appears in others' recent peers list

2. **Connect to Others**:
   - Enter their Peer ID in the "Connect to Peer" field
   - Click "Connect" or press Enter
   - Wait for the connection (green status indicator)
   - See real-time connection status updates

### Sending Files

1. **Select Files**:
   - Click the drop zone to choose files
   - Drag and drop files into the zone
   - Multiple files are handled automatically
   - Files are queued if needed

2. **Transfer Process**:
   - Real-time progress bar
   - Progress updates in 1% increments
   - Automatic error recovery
   - Files appear in "Sent Files" list
   - All connected peers receive file information

### Receiving Files

1. **File Reception**:
   - Automatic file information reception
   - Direct download from original sender
   - Progress bar shows download status
   - Success notification on completion
   - Visual feedback with color changes
   - One-click file opening after download

2. **File Management**:
   - Files listed in "Received Files" section
   - Shows original sender information
   - Download/Open button with status indication
   - Background color changes on completion
   - File size and type information
   - Persistent file history

## 🔒 Privacy & Security

- Direct peer-to-peer encrypted transfers
- No server storage of files
- Direct browser-to-browser connections
- No intermediate file routing
- Automatic connection encryption via WebRTC
- Keep-alive mechanism for connection stability

## 💡 Tips & Troubleshooting

1. **Connection Issues**:
   - Verify peer IDs are correct
   - Check internet connectivity
   - Automatic reconnection attempts
   - Refresh page if issues persist

2. **File Transfer**:
   - Large files are automatically chunked
   - Progress bars show accurate status
   - Files download directly from source
   - Transfer recovery on connection issues

3. **Best Practices**:
   - Keep browser tab active during transfers
   - Ensure stable internet connection
   - Monitor connection status indicator
   - Check notifications for transfer status
   - Wait for visual confirmation of downloads

## 🛠️ Technical Details

- Uses WebRTC for peer-to-peer connections
- 16KB chunk size for efficient transfers
- IndexedDB for file history storage
- Automatic peer discovery
- Connection state management
- Error recovery mechanisms
- Real-time status updates
- Dynamic UI state management

## 🌟 Recent Updates

- Enhanced download completion indicators
- Quick file access after download
- Visual status feedback improvements
- Direct peer-to-peer file downloads
- Improved connection stability
- Better error handling
- Enhanced progress tracking
- File history persistence
- Recent peers functionality
- QR code connection option
- Mobile optimization

## 📝 Notes

- File transfers are direct between peers
- No file size limits (browser dependent)
- Supports all file types
- Real-time transfer status
- Automatic connection management
- Cross-platform compatibility
- Intuitive visual feedback
- Seamless file opening
