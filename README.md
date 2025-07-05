<div align="center">
  <img src="assets/logo.svg" alt="One-Host Logo" width="400">
</div>

A modern, secure peer-to-peer file sharing web application that enables direct file transfer between browsers using WebRTC technology. No server needed - files are sent directly between peers with true peer-to-peer forwarding capabilities.

![Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🌟 Features

- **Direct P2P File Transfer**: Send files directly between browsers without uploading to a server
- **True P2P Forwarding**: Any peer can forward files to other connected peers, not just the host
- **Multiple File Support**: Send multiple files simultaneously with reliable delivery
- **Large File Support**: Optimized for large files with smart chunking and buffer management
- **Progress Tracking**: Smooth real-time progress indication with 1% increments
- **Connection Monitoring**: Advanced connection status tracking with keep-alive mechanism
- **Auto-Recovery**: Automatic reconnection attempts on connection loss
- **File History**: Keep track of sent and received files with original sender information
- **Recent Peers**: Quick access to recently connected peers
- **Mobile Responsive**: Works seamlessly on mobile devices
- **QR Code**: Easy peer ID sharing via QR code
- **Share Intent**: Native sharing on mobile devices
- **No Installation**: Works directly in the browser
- **No Server Storage**: Files are transferred directly between peers

## 🚀 Quick Start

1. Open the application in your browser: [Live Demo](https://yadavshashankr.github.io/one-host/)
2. You'll see your unique Peer ID
3. Share your Peer ID with someone you want to connect with:
   - Copy using the copy button
   - Share via the share button (mobile)
   - Or let others scan your QR code
4. Enter their Peer ID to connect
5. Once connected (green status indicator), you can:
   - Click or drag files to send
   - View transfer progress
   - See file history
   - Download received files
   - Forward received files to other peers

## 💻 Usage

### Connecting to a Peer

1. **Share Your ID**:
   - Copy your Peer ID using the copy button
   - On mobile, use the share button
   - Or let others scan your QR code

2. **Connect to Someone**:
   - Enter their Peer ID in the "Connect to Peer" field
   - Click "Connect"
   - Wait for the connection to establish (green status indicator)
   - Connection status updates in real-time

### Sending Files

1. **Select Files**:
   - Click the drop zone to select files
   - Or drag and drop files into the zone
   - Multiple files are handled efficiently

2. **Monitor Transfer**:
   - Watch the smooth progress bar for transfer status
   - Real-time progress updates in 1% increments
   - Automatic error recovery for failed transfers
   - Files appear in the "Sent Files" list

### Receiving Files

1. **Auto-Reception**:
   - Files are automatically received when sent
   - Progress bar shows download progress
   - Success notification appears when complete
   - Original sender information is preserved

2. **Accessing Files**:
   - Find received files in the "Received Files" list
   - Click the download button to save files
   - Files are saved with original names
   - Option to forward files to other connected peers

## 🔒 Privacy & Security

- All transfers are peer-to-peer encrypted
- No files are stored on any server
- Connections are direct between browsers
- File data never passes through intermediate servers
- Keep-alive mechanism ensures connection integrity

## 💡 Tips

1. **Connection Issues?**
   - Ensure both peers have entered IDs correctly
   - Check your internet connection
   - The application will attempt to reconnect automatically
   - Try refreshing the page if issues persist

2. **File Transfer**
   - Keep the browser tab open during transfer
   - Transfers are optimized for reliability
   - Multiple files are queued automatically
   - Progress updates are smooth and accurate

3. **Mobile Usage**
   - Works best in landscape for large files
   - Use share button for easy ID sharing
   - Recent peers make reconnecting easier
   - Connection status is clearly visible

## 🛠️ Technical Details

- Built with vanilla JavaScript
- Uses PeerJS for WebRTC implementation
- Optimized chunk size (16KB) for reliable transfer
- Smart buffer management for efficient data flow
- Keep-alive mechanism for connection monitoring
- True peer-to-peer forwarding capability
- IndexedDB for file history storage
- Mobile-responsive design
- No backend required

## 🔧 Browser Support

- Chrome (Desktop & Mobile)
- Firefox (Desktop & Mobile)
- Safari (Desktop & Mobile)
- Edge (Desktop)
- Other Chromium-based browsers

## ⚠️ Limitations

- Both peers must be online simultaneously
- Transfer speed depends on both peers' internet connection
- Some corporate firewalls may block WebRTC
- Browser must support WebRTC (most modern browsers do)
- Very large files (>350MB) may require more time to process

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](https://github.com/yadavshashankr/one-host/issues).
