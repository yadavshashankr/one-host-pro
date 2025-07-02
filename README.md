# WebRTC File Sharing

A peer-to-peer file sharing web application that allows direct file transfer between browsers using WebRTC technology. No server is needed for file transfer - files are sent directly between peers.

![Status](https://img.shields.io/badge/status-active-success.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 🌟 Features

- **Direct P2P File Transfer**: Send files directly between browsers without uploading to a server
- **Multiple File Support**: Send multiple files simultaneously
- **Large File Support**: Handles large files through chunked transfer
- **Progress Tracking**: Real-time progress indication for file transfers
- **Connection Status**: Visual indicator for connection state
- **File History**: Keep track of sent and received files
- **Recent Peers**: Quick access to recently connected peers
- **Mobile Responsive**: Works seamlessly on mobile devices
- **QR Code**: Easy peer ID sharing via QR code
- **Share Intent**: Native sharing on mobile devices
- **No Installation**: Works directly in the browser
- **No Server Storage**: Files are transferred directly between peers

## 🚀 Quick Start

1. Open the application in your browser: [Live Demo](your-demo-url)
2. You'll see your unique Peer ID
3. Share your Peer ID with someone you want to connect with
4. Enter their Peer ID to connect
5. Once connected, you can:
   - Click or drag files to send
   - View transfer progress
   - See file history
   - Download received files

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

### Sending Files

1. **Select Files**:
   - Click the drop zone to select files
   - Or drag and drop files into the zone
   - Multiple files can be selected

2. **Monitor Transfer**:
   - Watch the progress bar for transfer status
   - Wait for success notification
   - Files appear in the "Sent Files" list

### Receiving Files

1. **Auto-Reception**:
   - Files are automatically received when sent
   - Progress bar shows download progress
   - Success notification appears when complete

2. **Accessing Files**:
   - Find received files in the "Received Files" list
   - Click the download button to save files
   - Files are saved with original names

## 🔒 Privacy & Security

- All transfers are peer-to-peer encrypted
- No files are stored on any server
- Connections are direct between browsers
- File data never passes through intermediate servers

## 💡 Tips

1. **Connection Issues?**
   - Ensure both peers have entered IDs correctly
   - Check your internet connection
   - Try refreshing the page

2. **File Transfer**
   - Keep the browser tab open during transfer
   - Larger files take longer to transfer
   - Multiple files are queued automatically

3. **Mobile Usage**
   - Works best in landscape for large files
   - Use share button for easy ID sharing
   - Recent peers make reconnecting easier

## 🛠️ Technical Details

- Built with vanilla JavaScript
- Uses PeerJS for WebRTC implementation
- Implements chunked file transfer
- Supports all modern browsers
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

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to check [issues page](your-repo-issues-url).

## 🙏 Acknowledgments

- [PeerJS](https://peerjs.com/) for WebRTC implementation
- [Material Icons](https://material.io/icons/) for UI icons
- [QRCode.js](https://davidshimjs.github.io/qrcodejs/) for QR code generation 